import dotenv from 'dotenv';
import { adminAuth, firestore, FieldValue } from '../firebase.js';
import { DEFAULT_THEME } from '../firebase-store.js';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const SAMPLE_MENU_ITEMS = [
  {
    id: 'sample_espresso',
    name: 'Espresso',
    price: 120,
    description: 'Strong single-shot coffee.',
    category: 'Coffee',
    available: true,
    is_trending: true,
  },
  {
    id: 'sample_cappuccino',
    name: 'Cappuccino',
    price: 180,
    description: 'Espresso with steamed milk and foam.',
    category: 'Coffee',
    available: true,
    is_trending: true,
  },
  {
    id: 'sample_veg_sandwich',
    name: 'Veg Sandwich',
    price: 160,
    description: 'Toasted sandwich with fresh vegetables.',
    category: 'Snacks',
    available: true,
    is_trending: false,
  },
];

function readRequiredEnv(name, fallback = '') {
  const value = String(process.env[name] || fallback).trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readBooleanEnv(name, fallback = false) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'y'].includes(value);
}

function readPositiveIntEnv(name, fallback) {
  const raw = String(process.env[name] || '').trim();
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function cafeRef(cafeId) {
  return firestore.collection('cafes').doc(String(cafeId));
}

function userRef(uid) {
  return firestore.collection('users').doc(String(uid));
}

function memberRef(cafeId, uid) {
  return cafeRef(cafeId).collection('members').doc(String(uid));
}

function counterRef(cafeId) {
  return cafeRef(cafeId).collection('counters').doc('order');
}

function tablesCollection(cafeId) {
  return cafeRef(cafeId).collection('tables');
}

function menuCollection(cafeId) {
  return cafeRef(cafeId).collection('menu_items');
}

async function getOrCreateOwner({ cafeName, cafeEmail, cafePassword }) {
  try {
    const existing = await adminAuth.getUserByEmail(cafeEmail);
    if (!existing.displayName && cafeName) {
      await adminAuth.updateUser(existing.uid, { displayName: cafeName });
      return adminAuth.getUser(existing.uid);
    }
    return existing;
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }

  return adminAuth.createUser({
    email: cafeEmail,
    password: cafePassword,
    displayName: cafeName,
  });
}

async function ensureCafeDocument(cafeId, { cafeName, cafeEmail }) {
  const ref = cafeRef(cafeId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    await ref.set({
      name: cafeName,
      email: cafeEmail,
      owner_uid: String(cafeId),
      plan: 'starter',
      brandColor: DEFAULT_THEME.brandColor,
      bgColor: DEFAULT_THEME.bgColor,
      surfaceColor: DEFAULT_THEME.surfaceColor,
      textColor: DEFAULT_THEME.textColor,
      fontFamily: DEFAULT_THEME.fontFamily,
      logoUrl: DEFAULT_THEME.logoUrl,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    return true;
  }

  await ref.set({
    name: cafeName,
    email: cafeEmail,
    owner_uid: String(cafeId),
    brandColor: DEFAULT_THEME.brandColor,
    bgColor: DEFAULT_THEME.bgColor,
    surfaceColor: DEFAULT_THEME.surfaceColor,
    textColor: DEFAULT_THEME.textColor,
    fontFamily: DEFAULT_THEME.fontFamily,
    logoUrl: DEFAULT_THEME.logoUrl,
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  return false;
}

async function ensureOwnerUserAndMembership(cafeId, { cafeName, cafeEmail }) {
  const [userSnapshot, memberSnapshot] = await Promise.all([
    userRef(cafeId).get(),
    memberRef(cafeId, cafeId).get(),
  ]);

  if (!userSnapshot.exists) {
    await userRef(cafeId).set({
      email: String(cafeEmail || '').trim().toLowerCase(),
      display_name: cafeName,
      status: 'active',
      default_cafe_id: String(cafeId),
      created_by: String(cafeId),
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  } else {
    await userRef(cafeId).set({
      email: String(cafeEmail || '').trim().toLowerCase(),
      display_name: cafeName,
      status: 'active',
      default_cafe_id: String(cafeId),
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (!memberSnapshot.exists) {
    await memberRef(cafeId, cafeId).set({
      uid: String(cafeId),
      email: String(cafeEmail || '').trim().toLowerCase(),
      display_name: cafeName,
      role: 'owner',
      status: 'active',
      invited_by: null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    return true;
  }

  await memberRef(cafeId, cafeId).set({
    uid: String(cafeId),
    email: String(cafeEmail || '').trim().toLowerCase(),
    display_name: cafeName,
    role: 'owner',
    status: 'active',
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  return false;
}

async function ensureOrderCounter(cafeId) {
  const ref = counterRef(cafeId);
  const snapshot = await ref.get();
  if (snapshot.exists) return false;

  await ref.set({
    value: 0,
    updated_at: FieldValue.serverTimestamp(),
  });
  return true;
}

async function ensureTables(cafeId, tableCount) {
  const collection = tablesCollection(cafeId);
  const snapshot = await collection.get();
  const existingNumbers = new Set(
    snapshot.docs.map((doc) => Number(doc.data()?.number || 0)).filter((value) => value > 0)
  );

  let createdCount = 0;
  const batch = firestore.batch();

  for (let tableNumber = 1; tableNumber <= tableCount; tableNumber += 1) {
    if (existingNumbers.has(tableNumber)) continue;

    batch.set(collection.doc(`table_${tableNumber}`), {
      cafe_id: String(cafeId),
      number: tableNumber,
      label: `Table ${tableNumber}`,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    createdCount += 1;
  }

  if (createdCount > 0) {
    await batch.commit();
  }

  return createdCount;
}

async function ensureSampleMenu(cafeId, includeSampleMenu) {
  if (!includeSampleMenu) return 0;

  const collection = menuCollection(cafeId);
  const snapshot = await collection.limit(1).get();
  if (!snapshot.empty) return 0;

  const batch = firestore.batch();
  for (const item of SAMPLE_MENU_ITEMS) {
    batch.set(collection.doc(item.id), {
      cafe_id: String(cafeId),
      name: item.name,
      price: item.price,
      description: item.description,
      image_url: null,
      category: item.category,
      available: item.available,
      is_trending: item.is_trending,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return SAMPLE_MENU_ITEMS.length;
}

async function main() {
  const cafeName = readRequiredEnv('FIRESTORE_INIT_CAFE_NAME', process.env.DEFAULT_CAFE_NAME || 'My Cafe');
  const cafeEmail = readRequiredEnv('FIRESTORE_INIT_CAFE_EMAIL', process.env.DEFAULT_CAFE_EMAIL || '');
  const cafePassword = readRequiredEnv('FIRESTORE_INIT_CAFE_PASSWORD', process.env.DEFAULT_CAFE_PASSWORD || '');
  const tableCount = readPositiveIntEnv('FIRESTORE_INIT_TABLE_COUNT', 5);
  const includeSampleMenu = readBooleanEnv('FIRESTORE_INIT_SAMPLE_MENU', false);

  const owner = await getOrCreateOwner({ cafeName, cafeEmail, cafePassword });
  const cafeId = owner.uid;

  const [createdCafe, createdOwnerMembership, createdCounter, createdTables, createdMenuItems] = await Promise.all([
    ensureCafeDocument(cafeId, { cafeName, cafeEmail }),
    ensureOwnerUserAndMembership(cafeId, { cafeName, cafeEmail }),
    ensureOrderCounter(cafeId),
    ensureTables(cafeId, tableCount),
    ensureSampleMenu(cafeId, includeSampleMenu),
  ]);

  console.log('Firestore initialization complete.');
  console.log(`Cafe ID: ${cafeId}`);
  console.log(`Owner email: ${cafeEmail}`);
  console.log(`Cafe root document: ${createdCafe ? 'created' : 'already existed'}`);
  console.log(`Owner user/member docs: ${createdOwnerMembership ? 'created' : 'already existed'}`);
  console.log(`Order counter document: ${createdCounter ? 'created' : 'already existed'}`);
  console.log(`Tables created: ${createdTables}`);
  console.log(`Sample menu items created: ${createdMenuItems}`);
  console.log('Schema guide: FIRESTORE_STRUCTURE.md');
}

main().catch((error) => {
  console.error('Firestore initialization failed:', error.message);
  process.exitCode = 1;
});
