import pg from 'pg';
import { adminAuth, firestore, FieldValue, Timestamp } from '../firebase.js';
import { DEFAULT_THEME } from '../firebase-store.js';

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'cafe_menu',
  password: process.env.DB_PASSWORD || 'admin',
  port: Number(process.env.DB_PORT || 5432),
});

function migrationPasswordFor(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const defaultEmail = String(process.env.DEFAULT_CAFE_EMAIL || '').trim().toLowerCase();

  if (normalizedEmail && normalizedEmail === defaultEmail && process.env.DEFAULT_CAFE_PASSWORD) {
    return process.env.DEFAULT_CAFE_PASSWORD;
  }

  return process.env.FIREBASE_MIGRATION_PASSWORD || '';
}

function toTimestamp(value) {
  if (!value) return FieldValue.serverTimestamp();
  const date = value instanceof Date ? value : new Date(value);
  return Timestamp.fromDate(date);
}

async function clearCollection(collectionRef) {
  const snapshots = await collectionRef.listDocuments();
  if (snapshots.length === 0) return;

  const batch = firestore.batch();
  for (const docRef of snapshots) {
    batch.delete(docRef);
  }
  await batch.commit();
}

async function resolveFirebaseUser(cafe) {
  try {
    const existing = await adminAuth.getUserByEmail(cafe.email);
    return existing;
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }

  const password = migrationPasswordFor(cafe.email);
  if (!password) {
    throw new Error(
      `No Firebase user exists for ${cafe.email}, and no migration password is configured. Set FIREBASE_MIGRATION_PASSWORD or DEFAULT_CAFE_PASSWORD.`
    );
  }

  return adminAuth.createUser({
    email: cafe.email,
    password,
    displayName: cafe.name,
  });
}

async function migrateCafe(cafe) {
  const user = await resolveFirebaseUser(cafe);
  const cafeRef = firestore.collection('cafes').doc(user.uid);

  await Promise.all([
    clearCollection(cafeRef.collection('menu_items')),
    clearCollection(cafeRef.collection('tables')),
    clearCollection(cafeRef.collection('orders')),
    clearCollection(cafeRef.collection('waiter_calls')),
    clearCollection(cafeRef.collection('meta')),
  ]);
  await cafeRef.collection('settings').doc('theme').delete().catch(() => {});

  await cafeRef.set({
    name: cafe.name,
    email: cafe.email,
    plan: cafe.plan || 'starter',
    legacy_id: cafe.id,
    created_at: toTimestamp(cafe.created_at),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

  const [menuItemsResult, tablesResult, themeResult, ordersResult] = await Promise.all([
    pool.query('SELECT * FROM menu_items WHERE cafe_id = $1 ORDER BY id', [cafe.id]),
    pool.query('SELECT * FROM tables WHERE cafe_id = $1 ORDER BY number', [cafe.id]),
    pool.query('SELECT * FROM themes WHERE cafe_id = $1 LIMIT 1', [cafe.id]),
    pool.query('SELECT * FROM orders WHERE cafe_id = $1 ORDER BY id', [cafe.id]),
  ]);

  for (const item of menuItemsResult.rows) {
    await cafeRef.collection('menu_items').doc(String(item.id)).set({
      cafe_id: user.uid,
      legacy_id: item.id,
      name: item.name,
      price: Number(item.price || 0),
      description: item.description || null,
      image_url: item.image_url || null,
      category: item.category || 'Other',
      available: item.available !== false,
      is_trending: Boolean(item.is_trending),
      created_at: toTimestamp(item.created_at),
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  if (tablesResult.rows.length > 0) {
    for (const table of tablesResult.rows) {
      await cafeRef.collection('tables').doc(String(table.id)).set({
        cafe_id: user.uid,
        legacy_id: table.id,
        number: Number(table.number || 0),
        label: table.label || `Table ${table.number}`,
        created_at: toTimestamp(table.created_at),
        updated_at: FieldValue.serverTimestamp(),
      });
    }
  } else {
    for (let tableNumber = 1; tableNumber <= 5; tableNumber += 1) {
      await cafeRef.collection('tables').doc(String(tableNumber)).set({
        cafe_id: user.uid,
        legacy_id: tableNumber,
        number: tableNumber,
        label: `Table ${tableNumber}`,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    }
  }

  const theme = themeResult.rows[0];
  await cafeRef.collection('settings').doc('theme').set({
    brandColor: theme?.brand_color || DEFAULT_THEME.brandColor,
    bgColor: theme?.bg_color || DEFAULT_THEME.bgColor,
    surfaceColor: theme?.surface_color || DEFAULT_THEME.surfaceColor,
    textColor: theme?.text_color || DEFAULT_THEME.textColor,
    fontFamily: theme?.font_family || DEFAULT_THEME.fontFamily,
    logoUrl: theme?.logo_url || DEFAULT_THEME.logoUrl,
    updated_at: FieldValue.serverTimestamp(),
  });

  const orders = ordersResult.rows;
  const orderIds = orders.map((order) => order.id);
  const orderItemsResult = orderIds.length > 0
    ? await pool.query(`
        SELECT
          oi.order_id,
          oi.menu_item_id,
          oi.quantity,
          COALESCE(oi.price, mi.price, 0) AS price,
          mi.name,
          mi.category,
          mi.image_url
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = ANY($1::int[])
        ORDER BY oi.order_id, oi.id
      `, [orderIds])
    : { rows: [] };

  const itemsByOrderId = new Map();
  for (const item of orderItemsResult.rows) {
    const list = itemsByOrderId.get(item.order_id) || [];
    list.push({
      id: String(item.menu_item_id),
      name: item.name || 'Unknown Item',
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 0),
      category: item.category || 'Other',
      image_url: item.image_url || null,
    });
    itemsByOrderId.set(item.order_id, list);
  }

  let maxOrderNumber = 0;
  for (const order of orders) {
    const items = itemsByOrderId.get(order.id) || [];
    const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    maxOrderNumber = Math.max(maxOrderNumber, Number(order.id || 0));

    await cafeRef.collection('orders').doc(String(order.id)).set({
      cafe_id: user.uid,
      legacy_id: order.id,
      order_number: Number(order.id || 0),
      table_id: order.table_id ? String(order.table_id) : null,
      table_number: Number(order.table_number || 0),
      status: order.status || 'pending',
      whatsapp_number: order.whatsapp_number || '',
      items,
      total_price: totalPrice,
      created_at: toTimestamp(order.created_at),
      updated_at: toTimestamp(order.updated_at || order.created_at),
    });
  }

  await cafeRef.collection('meta').doc('counter_order').set({
    value: maxOrderNumber,
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`Migrated cafe ${cafe.email} -> Firebase UID ${user.uid}`);
}

async function main() {
  console.log('Starting PostgreSQL -> Firestore migration...');
  const cafesResult = await pool.query('SELECT * FROM cafes ORDER BY id');
  if (cafesResult.rows.length === 0) {
    console.log('No cafes found in PostgreSQL.');
    return;
  }

  console.log(
    'Note: existing password hashes cannot be copied directly into Firebase Auth. New Firebase users are created with FIREBASE_MIGRATION_PASSWORD or DEFAULT_CAFE_PASSWORD.'
  );

  for (const cafe of cafesResult.rows) {
    await migrateCafe(cafe);
  }

  console.log(`Migration finished for ${cafesResult.rows.length} cafe(s).`);
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
