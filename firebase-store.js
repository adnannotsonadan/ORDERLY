import { adminAuth, firestore, FieldValue, Timestamp } from './firebase.js';

export const DEFAULT_THEME = {
  brandColor: '#c8773a',
  bgColor: '#f7f4f0',
  surfaceColor: '#ffffff',
  textColor: '#1a1714',
  fontFamily: 'DM Sans',
  cafeName: 'Our Cafe',
  logoUrl: '',
};

function cafesCollection() {
  return firestore.collection('cafes');
}

function cafeRef(cafeId) {
  return cafesCollection().doc(String(cafeId));
}

function menuCollection(cafeId) {
  return cafeRef(cafeId).collection('menu_items');
}

function tablesCollection(cafeId) {
  return cafeRef(cafeId).collection('tables');
}

function ordersCollection(cafeId) {
  return cafeRef(cafeId).collection('orders');
}

function waiterCallsCollection(cafeId) {
  return cafeRef(cafeId).collection('waiter_calls');
}

function themeRef(cafeId) {
  return cafeRef(cafeId).collection('settings').doc('theme');
}

function counterRef(cafeId, counterName) {
  return cafeRef(cafeId).collection('meta').doc(`counter_${counterName}`);
}

function toIsoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return new Date(value).toISOString();
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function sortByNumber(items) {
  return [...items].sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
}

function sortMenuItems(items) {
  return [...items].sort((a, b) => {
    const catCompare = (a.category || 'Other').localeCompare(b.category || 'Other');
    if (catCompare !== 0) return catCompare;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function cafeNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || 'Our Cafe';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Our Cafe';
}

function serializeCafe(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    name: data.name || 'Our Cafe',
    email: data.email || '',
    plan: data.plan || 'starter',
    created_at: toIsoDate(data.created_at),
  };
}

function serializeMenuItem(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    cafe_id: data.cafe_id || doc.ref.parent.parent?.id || null,
    name: data.name || '',
    price: Number(data.price || 0),
    description: data.description || null,
    image_url: data.image_url || null,
    category: data.category || 'Other',
    available: data.available !== false,
    is_trending: Boolean(data.is_trending),
    created_at: toIsoDate(data.created_at),
  };
}

function serializeTable(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    cafe_id: data.cafe_id || doc.ref.parent.parent?.id || null,
    number: Number(data.number || 0),
    label: data.label || '',
    created_at: toIsoDate(data.created_at),
  };
}

function serializeOrder(doc) {
  const data = doc.data() || {};
  const items = Array.isArray(data.items)
    ? data.items.map((item) => ({
        id: String(item.id),
        name: item.name || '',
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 0),
        category: item.category || 'Other',
        image_url: item.image_url || null,
      }))
    : [];

  const totalPrice = Number(
    data.total_price != null
      ? data.total_price
      : items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  );

  return {
    id: doc.id,
    order_number: Number(data.order_number || 0),
    cafe_id: data.cafe_id || doc.ref.parent.parent?.id || null,
    table_id: data.table_id || null,
    table_number: Number(data.table_number || 0),
    status: data.status || 'pending',
    whatsapp_number: data.whatsapp_number || '',
    items,
    total_price: totalPrice,
    created_at: toIsoDate(data.created_at),
    updated_at: toIsoDate(data.updated_at),
  };
}

function serializeWaiterCall(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    table_number: Number(data.table_number || 0),
    created_at: toIsoDate(data.created_at),
    dismissed: Boolean(data.dismissed),
  };
}

export async function getCafe(cafeId) {
  if (!cafeId) return null;
  const snapshot = await cafeRef(cafeId).get();
  if (!snapshot.exists) return null;
  return serializeCafe(snapshot);
}

export async function ensureCafeProfile({ cafeId, name, email, plan = 'starter' }) {
  const ref = cafeRef(cafeId);
  const snapshot = await ref.get();
  const resolvedName = name?.trim() || cafeNameFromEmail(email);

  if (!snapshot.exists) {
    await ref.set({
      name: resolvedName,
      email: String(email || '').trim().toLowerCase(),
      plan,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    return getCafe(cafeId);
  }

  const current = snapshot.data() || {};
  const updates = {};

  if (resolvedName && resolvedName !== current.name) updates.name = resolvedName;
  if (email && String(email).trim().toLowerCase() !== current.email) updates.email = String(email).trim().toLowerCase();
  if (!current.plan) updates.plan = plan;

  if (Object.keys(updates).length > 0) {
    updates.updated_at = FieldValue.serverTimestamp();
    await ref.set(updates, { merge: true });
  }

  return getCafe(cafeId);
}

export async function ensureCafeDefaults(cafeId, fallbackName, fallbackEmail) {
  await ensureCafeProfile({ cafeId, name: fallbackName, email: fallbackEmail });

  const [themeSnapshot, tablesSnapshot] = await Promise.all([
    themeRef(cafeId).get(),
    tablesCollection(cafeId).limit(1).get(),
  ]);

  if (!themeSnapshot.exists) {
    await themeRef(cafeId).set({
      brandColor: DEFAULT_THEME.brandColor,
      bgColor: DEFAULT_THEME.bgColor,
      surfaceColor: DEFAULT_THEME.surfaceColor,
      textColor: DEFAULT_THEME.textColor,
      fontFamily: DEFAULT_THEME.fontFamily,
      logoUrl: DEFAULT_THEME.logoUrl,
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  if (!tablesSnapshot.empty) return;

  const batch = firestore.batch();
  for (let tableNumber = 1; tableNumber <= 5; tableNumber += 1) {
    const ref = tablesCollection(cafeId).doc();
    batch.set(ref, {
      cafe_id: String(cafeId),
      number: tableNumber,
      label: `Table ${tableNumber}`,
      created_at: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function bootstrapDefaultCafe() {
  const email = String(process.env.DEFAULT_CAFE_EMAIL || '').trim().toLowerCase();
  const password = process.env.DEFAULT_CAFE_PASSWORD || '';
  const name = process.env.DEFAULT_CAFE_NAME || 'My Cafe';

  if (!email || !password) {
    return { cafeId: null, cafeName: null, email: null };
  }

  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });
  }

  if (!userRecord.displayName && name) {
    await adminAuth.updateUser(userRecord.uid, { displayName: name });
  }

  await ensureCafeDefaults(userRecord.uid, name, email);
  const cafe = await getCafe(userRecord.uid);
  return { cafeId: userRecord.uid, cafeName: cafe?.name || name, email };
}

async function getNextCounterValue(cafeId, counterName) {
  return firestore.runTransaction(async (transaction) => {
    const ref = counterRef(cafeId, counterName);
    const snapshot = await transaction.get(ref);
    const current = Number(snapshot.data()?.value || 0);
    const next = current + 1;
    transaction.set(ref, { value: next, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
}

export async function getMenuItems(cafeId) {
  const snapshot = await menuCollection(cafeId).get();
  return sortMenuItems(snapshot.docs.map(serializeMenuItem));
}

export async function createMenuItem(cafeId, item) {
  const ref = menuCollection(cafeId).doc();
  await ref.set({
    cafe_id: String(cafeId),
    name: item.name.trim(),
    price: Number(item.price),
    description: item.description || null,
    image_url: item.image_url || null,
    category: item.category || 'Other',
    available: item.available !== false,
    is_trending: Boolean(item.is_trending),
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  return serializeMenuItem(await ref.get());
}

export async function updateMenuItem(cafeId, itemId, updates) {
  const ref = menuCollection(cafeId).doc(String(itemId));
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;

  const payload = { updated_at: FieldValue.serverTimestamp() };
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.price !== undefined) payload.price = Number(updates.price);
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.available !== undefined) payload.available = updates.available;
  if (updates.image_url !== undefined) payload.image_url = updates.image_url;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.is_trending !== undefined) payload.is_trending = updates.is_trending;

  await ref.set(payload, { merge: true });
  return serializeMenuItem(await ref.get());
}

export async function deleteMenuItem(cafeId, itemId) {
  const ref = menuCollection(cafeId).doc(String(itemId));
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;
  await ref.delete();
  return true;
}

export async function getTables(cafeId) {
  const snapshot = await tablesCollection(cafeId).get();
  return sortByNumber(snapshot.docs.map(serializeTable));
}

export async function createTable(cafeId, { number, label }) {
  const existing = await tablesCollection(cafeId).where('number', '==', Number(number)).limit(1).get();
  if (!existing.empty) {
    const error = new Error('Table number already exists');
    error.code = 'duplicate-table';
    throw error;
  }

  const ref = tablesCollection(cafeId).doc();
  await ref.set({
    cafe_id: String(cafeId),
    number: Number(number),
    label: label || `Table ${number}`,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  return serializeTable(await ref.get());
}

export async function updateTable(cafeId, tableId, { label }) {
  const ref = tablesCollection(cafeId).doc(String(tableId));
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  await ref.set({ label: label || '', updated_at: FieldValue.serverTimestamp() }, { merge: true });
  return serializeTable(await ref.get());
}

export async function deleteTable(cafeId, tableId) {
  const ref = tablesCollection(cafeId).doc(String(tableId));
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;
  await ref.delete();
  return true;
}

export async function getTable(cafeId, tableId) {
  const snapshot = await tablesCollection(cafeId).doc(String(tableId)).get();
  if (!snapshot.exists) return null;
  return serializeTable(snapshot);
}

export async function getTheme(cafeId) {
  if (!cafeId) return { ...DEFAULT_THEME };

  const [themeSnapshot, cafeSnapshot] = await Promise.all([
    themeRef(cafeId).get(),
    cafeRef(cafeId).get(),
  ]);

  const cafeName = cafeSnapshot.exists ? (cafeSnapshot.data()?.name || DEFAULT_THEME.cafeName) : DEFAULT_THEME.cafeName;
  if (!themeSnapshot.exists) {
    return { ...DEFAULT_THEME, cafeName };
  }

  const theme = themeSnapshot.data() || {};
  return {
    brandColor: theme.brandColor || DEFAULT_THEME.brandColor,
    bgColor: theme.bgColor || DEFAULT_THEME.bgColor,
    surfaceColor: theme.surfaceColor || DEFAULT_THEME.surfaceColor,
    textColor: theme.textColor || DEFAULT_THEME.textColor,
    fontFamily: theme.fontFamily || DEFAULT_THEME.fontFamily,
    cafeName,
    logoUrl: theme.logoUrl || '',
  };
}

export async function saveTheme(cafeId, updates) {
  const nextCafeName = updates.cafeName?.trim();
  if (nextCafeName) {
    await cafeRef(cafeId).set({
      name: nextCafeName,
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await themeRef(cafeId).set({
    brandColor: updates.brandColor || DEFAULT_THEME.brandColor,
    bgColor: updates.bgColor || DEFAULT_THEME.bgColor,
    surfaceColor: updates.surfaceColor || DEFAULT_THEME.surfaceColor,
    textColor: updates.textColor || DEFAULT_THEME.textColor,
    fontFamily: updates.fontFamily || DEFAULT_THEME.fontFamily,
    logoUrl: updates.logoUrl || '',
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

  return getTheme(cafeId);
}

export async function resetTheme(cafeId) {
  await themeRef(cafeId).set({
    brandColor: DEFAULT_THEME.brandColor,
    bgColor: DEFAULT_THEME.bgColor,
    surfaceColor: DEFAULT_THEME.surfaceColor,
    textColor: DEFAULT_THEME.textColor,
    fontFamily: DEFAULT_THEME.fontFamily,
    logoUrl: DEFAULT_THEME.logoUrl,
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

  return getTheme(cafeId);
}

export async function createOrder(cafeId, { tableNumber, items, whatsappNumber }) {
  const tableLookup = await tablesCollection(cafeId).where('number', '==', Number(tableNumber)).limit(1).get();
  const tableId = tableLookup.empty ? null : tableLookup.docs[0].id;

  const activeForTable = await ordersCollection(cafeId)
    .where('table_number', '==', Number(tableNumber))
    .get();

  const hasActiveOrder = activeForTable.docs.some((doc) => {
    const status = doc.data()?.status;
    return status === 'pending' || status === 'preparing';
  });

  if (hasActiveOrder) {
    const error = new Error('This table already has an active order');
    error.code = 'active-order';
    throw error;
  }

  const itemRefs = items.map((item) => menuCollection(cafeId).doc(String(item.id)));
  const itemSnapshots = await firestore.getAll(...itemRefs);

  const normalizedItems = itemSnapshots.map((snapshot, index) => {
    if (!snapshot.exists) {
      const error = new Error(`Menu item ${items[index]?.id} not found`);
      error.code = 'menu-item-not-found';
      throw error;
    }

    const data = snapshot.data() || {};
    if (data.available === false) {
      const error = new Error(`${data.name || 'Menu item'} is unavailable`);
      error.code = 'menu-item-unavailable';
      throw error;
    }

    const quantity = Number(items[index].quantity || 0);
    return {
      id: snapshot.id,
      name: data.name || '',
      price: Number(data.price || 0),
      quantity,
      category: data.category || 'Other',
      image_url: data.image_url || null,
    };
  });

  const totalPrice = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const orderNumber = await getNextCounterValue(cafeId, 'order');
  const ref = ordersCollection(cafeId).doc();

  await ref.set({
    cafe_id: String(cafeId),
    table_id: tableId,
    table_number: Number(tableNumber),
    order_number: orderNumber,
    status: 'pending',
    whatsapp_number: whatsappNumber,
    items: normalizedItems,
    total_price: totalPrice,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return serializeOrder(await ref.get());
}

export async function getOrders(cafeId) {
  const snapshot = await ordersCollection(cafeId).get();
  return sortByCreatedAtDesc(snapshot.docs.map(serializeOrder));
}

export async function updateOrderStatus(cafeId, orderId, status) {
  const ref = ordersCollection(cafeId).doc(String(orderId));
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  await ref.set({ status, updated_at: FieldValue.serverTimestamp() }, { merge: true });
  return serializeOrder(await ref.get());
}

export async function deleteOrder(cafeId, orderId) {
  const ref = ordersCollection(cafeId).doc(String(orderId));
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;
  await ref.delete();
  return true;
}

export async function getAnalytics(cafeId) {
  const orders = await getOrders(cafeId);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const monthStart = new Date(todayStart);
  monthStart.setDate(1);

  const revenue = {
    today: 0,
    this_week: 0,
    this_month: 0,
    all_time: 0,
  };

  const orderStats = {
    pending: 0,
    preparing: 0,
    completed: 0,
    today_total: 0,
    all_time_total: orders.length,
  };

  const bestsellerMap = new Map();
  const hourlyMap = new Map();
  const tableMap = new Map();

  for (const order of orders) {
    const createdAt = new Date(order.created_at || Date.now());
    const isToday = createdAt >= todayStart;
    const isThisWeek = createdAt >= weekStart;
    const isThisMonth = createdAt >= monthStart;

    if (order.status === 'pending') orderStats.pending += 1;
    if (order.status === 'preparing') orderStats.preparing += 1;
    if (order.status === 'completed') orderStats.completed += 1;
    if (isToday) orderStats.today_total += 1;

    if (order.status !== 'completed') continue;

    revenue.all_time += order.total_price || 0;
    if (isToday) revenue.today += order.total_price || 0;
    if (isThisWeek) revenue.this_week += order.total_price || 0;
    if (isThisMonth) revenue.this_month += order.total_price || 0;

    const hour = createdAt.getHours();
    hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);

    const tableKey = String(order.table_number);
    const tableEntry = tableMap.get(tableKey) || { table_number: order.table_number, order_count: 0, revenue: 0 };
    tableEntry.order_count += 1;
    tableEntry.revenue += order.total_price || 0;
    tableMap.set(tableKey, tableEntry);

    for (const item of order.items || []) {
      const itemEntry = bestsellerMap.get(item.id) || {
        name: item.name,
        category: item.category || 'Other',
        image_url: item.image_url || null,
        total_sold: 0,
        total_revenue: 0,
      };
      itemEntry.total_sold += Number(item.quantity || 0);
      itemEntry.total_revenue += Number(item.price || 0) * Number(item.quantity || 0);
      bestsellerMap.set(item.id, itemEntry);
    }
  }

  const bestsellers = [...bestsellerMap.values()]
    .sort((a, b) => b.total_sold - a.total_sold)
    .slice(0, 5);

  const hourly = [...hourlyMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, count]) => ({ hour, count }));

  const byTable = [...tableMap.values()].sort((a, b) => b.revenue - a.revenue);
  const recent = orders.slice(0, 5).map((order) => ({
    id: order.id,
    order_number: order.order_number,
    table_number: order.table_number,
    status: order.status,
    created_at: order.created_at,
    whatsapp_number: order.whatsapp_number,
    total: order.total_price,
  }));

  return {
    revenue,
    orders: orderStats,
    bestsellers,
    hourly,
    byTable,
    recent,
  };
}

export async function createWaiterCall(cafeId, tableNumber) {
  const existing = await waiterCallsCollection(cafeId)
    .where('table_number', '==', Number(tableNumber))
    .get();

  if (existing.docs.some((doc) => doc.data()?.dismissed === false)) {
    const error = new Error('Waiter already called for this table');
    error.code = 'waiter-call-exists';
    throw error;
  }

  const ref = waiterCallsCollection(cafeId).doc();
  await ref.set({
    table_number: Number(tableNumber),
    dismissed: false,
    created_at: FieldValue.serverTimestamp(),
  });
  return serializeWaiterCall(await ref.get());
}

export async function getWaiterCalls(cafeId) {
  const snapshot = await waiterCallsCollection(cafeId).where('dismissed', '==', false).get();
  return sortByCreatedAtDesc(snapshot.docs.map(serializeWaiterCall));
}

export async function dismissWaiterCall(cafeId, callId) {
  const ref = waiterCallsCollection(cafeId).doc(String(callId));
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;
  await ref.set({ dismissed: true, updated_at: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}
