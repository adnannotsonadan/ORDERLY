import { adminAuth, firestore, FieldValue, Timestamp, hasFirebaseAdminConfig } from './firebase.js';

export const DEFAULT_THEME = {
  brandColor: '#c8773a',
  bgColor: '#f7f4f0',
  surfaceColor: '#ffffff',
  textColor: '#1a1714',
  fontFamily: 'DM Sans',
  cafeName: 'Our Cafe',
  logoUrl: '',
};

const TEAM_ROLES = new Set(['owner', 'admin', 'cashier', 'waiter']);

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.slice(-10);
}

function cafesCollection() {
  return firestore.collection('cafes');
}

function usersCollection() {
  return firestore.collection('users');
}

function customersCollection() {
  return firestore.collection('customers');
}

function cafeRef(cafeId) {
  return cafesCollection().doc(String(cafeId));
}

function userRef(uid) {
  return usersCollection().doc(String(uid));
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

function membersCollection(cafeId) {
  return cafeRef(cafeId).collection('members');
}

function cafeCustomersCollection(cafeId) {
  return cafeRef(cafeId).collection('customers');
}

function counterRef(cafeId, counterName) {
  return cafeRef(cafeId).collection('counters').doc(String(counterName));
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
    gst_number: data.gst_number || '',
    fssai_number: data.fssai_number || '',
    contact_phone: data.contact_phone || '',
    address: data.address || '',
    created_at: toIsoDate(data.created_at),
  };
}

function serializeCustomer(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    phone: data.phone || '',
    name: data.name || '',
    email: data.email || '',
    last_order_at: toIsoDate(data.last_order_at),
    total_orders: Number(data.total_orders || 0),
    updated_at: toIsoDate(data.updated_at),
  };
}

function serializeUser(doc) {
  const data = doc.data() || {};
  return {
    uid: doc.id,
    email: data.email || '',
    display_name: data.display_name || '',
    status: data.status || 'active',
    default_cafe_id: data.default_cafe_id || null,
    created_by: data.created_by || null,
    created_at: toIsoDate(data.created_at),
    updated_at: toIsoDate(data.updated_at),
    last_login_at: toIsoDate(data.last_login_at),
  };
}

function serializeMember(doc) {
  const data = doc.data() || {};
  return {
    uid: doc.id,
    email: data.email || '',
    display_name: data.display_name || '',
    role: data.role || 'cashier',
    status: data.status || 'active',
    invited_by: data.invited_by || null,
    created_at: toIsoDate(data.created_at),
    updated_at: toIsoDate(data.updated_at),
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
    source: data.source || 'dine_in',
    whatsapp_number: data.whatsapp_number || '',
    customer_name: data.customer_name || '',
    customer_email: data.customer_email || '',
    billing_status: data.billing_status || 'unbilled',
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

export async function getUserProfile(uid) {
  if (!uid) return null;
  const snapshot = await userRef(uid).get();
  if (!snapshot.exists) return null;
  return serializeUser(snapshot);
}

export async function ensureUserProfile({ uid, email, displayName, createdBy = null }) {
  const ref = userRef(uid);
  const snapshot = await ref.get();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const resolvedDisplayName = String(displayName || '').trim() || cafeNameFromEmail(normalizedEmail);

  if (!snapshot.exists) {
    await ref.set({
      email: normalizedEmail,
      display_name: resolvedDisplayName,
      status: 'active',
      default_cafe_id: null,
      created_by: createdBy,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    return getUserProfile(uid);
  }

  const current = snapshot.data() || {};
  const updates = { updated_at: FieldValue.serverTimestamp() };
  if (normalizedEmail && normalizedEmail !== current.email) updates.email = normalizedEmail;
  if (resolvedDisplayName && resolvedDisplayName !== current.display_name) updates.display_name = resolvedDisplayName;
  if (!current.status) updates.status = 'active';
  if (current.default_cafe_id === undefined) updates.default_cafe_id = null;

  await ref.set(updates, { merge: true });
  return getUserProfile(uid);
}

export async function markUserLogin(uid) {
  if (!uid) return;
  await userRef(uid).set({
    last_login_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function ensureCafeProfile({ cafeId, name, email, plan = 'starter' }) {
  const ref = cafeRef(cafeId);
  const snapshot = await ref.get();
  const resolvedName = name?.trim() || cafeNameFromEmail(email);

  if (!snapshot.exists) {
    await ref.set({
      name: resolvedName,
      email: String(email || '').trim().toLowerCase(),
      owner_uid: String(cafeId),
      plan,
      brandColor: DEFAULT_THEME.brandColor,
      bgColor: DEFAULT_THEME.bgColor,
      surfaceColor: DEFAULT_THEME.surfaceColor,
      textColor: DEFAULT_THEME.textColor,
      fontFamily: DEFAULT_THEME.fontFamily,
      logoUrl: DEFAULT_THEME.logoUrl,
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
  if (!current.owner_uid) updates.owner_uid = String(cafeId);
  if (!current.brandColor) updates.brandColor = DEFAULT_THEME.brandColor;
  if (!current.bgColor) updates.bgColor = DEFAULT_THEME.bgColor;
  if (!current.surfaceColor) updates.surfaceColor = DEFAULT_THEME.surfaceColor;
  if (!current.textColor) updates.textColor = DEFAULT_THEME.textColor;
  if (!current.fontFamily) updates.fontFamily = DEFAULT_THEME.fontFamily;
  if (current.logoUrl === undefined) updates.logoUrl = DEFAULT_THEME.logoUrl;

  if (Object.keys(updates).length > 0) {
    updates.updated_at = FieldValue.serverTimestamp();
    await ref.set(updates, { merge: true });
  }

  return getCafe(cafeId);
}

export async function ensureCafeDefaults(cafeId, fallbackName, fallbackEmail) {
  await ensureCafeProfile({ cafeId, name: fallbackName, email: fallbackEmail });
  await ensureUserProfile({ uid: cafeId, email: fallbackEmail, displayName: fallbackName, createdBy: cafeId });
  await membersCollection(cafeId).doc(String(cafeId)).set({
    uid: String(cafeId),
    email: String(fallbackEmail || '').trim().toLowerCase(),
    display_name: fallbackName || cafeNameFromEmail(fallbackEmail),
    role: 'owner',
    status: 'active',
    invited_by: null,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

  await userRef(cafeId).set({
    default_cafe_id: String(cafeId),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

  const tablesSnapshot = await tablesCollection(cafeId).limit(1).get();

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
  if (!hasFirebaseAdminConfig()) {
    return { cafeId: null, cafeName: null, email: null };
  }

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

  const cafeSnapshot = await cafeRef(cafeId).get();
  if (!cafeSnapshot.exists) {
    return { ...DEFAULT_THEME };
  }

  const cafe = cafeSnapshot.data() || {};
  return {
    brandColor: cafe.brandColor || DEFAULT_THEME.brandColor,
    bgColor: cafe.bgColor || DEFAULT_THEME.bgColor,
    surfaceColor: cafe.surfaceColor || DEFAULT_THEME.surfaceColor,
    textColor: cafe.textColor || DEFAULT_THEME.textColor,
    fontFamily: cafe.fontFamily || DEFAULT_THEME.fontFamily,
    cafeName: cafe.name || DEFAULT_THEME.cafeName,
    logoUrl: cafe.logoUrl || '',
    gstNumber: cafe.gst_number || '',
    fssaiNumber: cafe.fssai_number || '',
    restaurantPhone: cafe.contact_phone || '',
    restaurantAddress: cafe.address || '',
  };
}

export async function saveTheme(cafeId, updates) {
  const nextCafeName = updates.cafeName?.trim();
  const nextPhone = normalizePhone(updates.restaurantPhone);
  await cafeRef(cafeId).set({
    ...(nextCafeName ? { name: nextCafeName } : {}),
    brandColor: updates.brandColor || DEFAULT_THEME.brandColor,
    bgColor: updates.bgColor || DEFAULT_THEME.bgColor,
    surfaceColor: updates.surfaceColor || DEFAULT_THEME.surfaceColor,
    textColor: updates.textColor || DEFAULT_THEME.textColor,
    fontFamily: updates.fontFamily || DEFAULT_THEME.fontFamily,
    logoUrl: updates.logoUrl || '',
    gst_number: String(updates.gstNumber || '').trim(),
    fssai_number: String(updates.fssaiNumber || '').trim(),
    contact_phone: nextPhone,
    address: String(updates.restaurantAddress || '').trim(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

  return getTheme(cafeId);
}

export async function resetTheme(cafeId) {
  await cafeRef(cafeId).set({
    brandColor: DEFAULT_THEME.brandColor,
    bgColor: DEFAULT_THEME.bgColor,
    surfaceColor: DEFAULT_THEME.surfaceColor,
    textColor: DEFAULT_THEME.textColor,
    fontFamily: DEFAULT_THEME.fontFamily,
    logoUrl: DEFAULT_THEME.logoUrl,
    gst_number: '',
    fssai_number: '',
    contact_phone: '',
    address: '',
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

  return getTheme(cafeId);
}

export async function getCafeMember(cafeId, uid) {
  if (!cafeId || !uid) return null;
  const snapshot = await membersCollection(cafeId).doc(String(uid)).get();
  if (!snapshot.exists) return null;
  return serializeMember(snapshot);
}

export async function getCafeMembers(cafeId) {
  const snapshot = await membersCollection(cafeId).get();
  return snapshot.docs.map(serializeMember).sort((a, b) => a.display_name.localeCompare(b.display_name));
}

export async function addCafeMember(cafeId, { uid, email, displayName, role = 'cashier', addedBy }) {
  const normalizedRole = String(role || 'cashier').toLowerCase();
  if (!TEAM_ROLES.has(normalizedRole)) {
    const error = new Error('Invalid role');
    error.code = 'invalid-role';
    throw error;
  }

  const user = await ensureUserProfile({
    uid,
    email,
    displayName,
    createdBy: addedBy || null,
  });

  if (user.status !== 'active') {
    const error = new Error('User is not active');
    error.code = 'user-inactive';
    throw error;
  }

  await membersCollection(cafeId).doc(String(uid)).set({
    uid: String(uid),
    email: user.email,
    display_name: user.display_name,
    role: normalizedRole,
    status: 'active',
    invited_by: addedBy || null,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

  if (!user.default_cafe_id) {
    await userRef(uid).set({
      default_cafe_id: String(cafeId),
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return getCafeMember(cafeId, uid);
}

export async function updateCafeMember(cafeId, uid, updates) {
  const member = await getCafeMember(cafeId, uid);
  if (!member) return null;

  const payload = { updated_at: FieldValue.serverTimestamp() };
  if (updates.role !== undefined) {
    const normalizedRole = String(updates.role).toLowerCase();
    if (!TEAM_ROLES.has(normalizedRole)) {
      const error = new Error('Invalid role');
      error.code = 'invalid-role';
      throw error;
    }
    payload.role = normalizedRole;
  }
  if (updates.status !== undefined) {
    const normalizedStatus = String(updates.status).toLowerCase();
    if (!['active', 'disabled'].includes(normalizedStatus)) {
      const error = new Error('Invalid status');
      error.code = 'invalid-status';
      throw error;
    }
    payload.status = normalizedStatus;
  }

  await membersCollection(cafeId).doc(String(uid)).set(payload, { merge: true });
  return getCafeMember(cafeId, uid);
}

export async function removeCafeMember(cafeId, uid) {
  const ref = membersCollection(cafeId).doc(String(uid));
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;

  if (String(uid) === String(cafeId)) {
    const error = new Error('Owner cannot be removed from cafe members');
    error.code = 'owner-remove-forbidden';
    throw error;
  }

  // Delete Firestore member doc and users doc
  await ref.delete();
  await usersCollection().doc(String(uid)).delete();

  // Delete Firebase Auth user
  try {
    await adminAuth.deleteUser(uid);
  } catch (err) {
    // If user doesn't exist in Auth, that's fine
    if (err.code !== 'auth/user-not-found') throw err;
  }

  return true;
}

export async function resolveAccessibleCafeId(uid, preferredCafeId = null) {
  if (!uid) return null;

  const preferred = preferredCafeId ? String(preferredCafeId) : null;
  if (preferred) {
    const access = await verifyCafeAccess(uid, preferred);
    if (access.allowed) return preferred;
  }

  const ownerCafe = await cafeRef(uid).get();
  if (ownerCafe.exists) return String(uid);

  const user = await getUserProfile(uid);
  if (user?.default_cafe_id) {
    const access = await verifyCafeAccess(uid, user.default_cafe_id);
    if (access.allowed) return String(user.default_cafe_id);
  }

  const membership = await firestore.collectionGroup('members')
    .where('uid', '==', String(uid))
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!membership.empty) {
    const doc = membership.docs[0];
    return doc.ref.parent.parent?.id || null;
  }

  return null;
}

export async function verifyCafeAccess(uid, cafeId) {
  if (!uid || !cafeId) return { allowed: false, role: null };

  const cafeSnapshot = await cafeRef(cafeId).get();
  if (!cafeSnapshot.exists) return { allowed: false, role: null };

  const cafe = cafeSnapshot.data() || {};
  if (String(cafe.owner_uid || cafeId) === String(uid) || String(cafeId) === String(uid)) {
    return { allowed: true, role: 'owner' };
  }

  const member = await getCafeMember(cafeId, uid);
  if (!member || member.status !== 'active') return { allowed: false, role: null };
  return { allowed: true, role: member.role || 'cashier' };
}

export async function getGlobalCustomerProfile(phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;
  const snapshot = await customersCollection().doc(normalizedPhone).get();
  if (!snapshot.exists) return null;
  return serializeCustomer(snapshot);
}

export async function getCafeCustomerProfile(cafeId, phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone || !cafeId) return null;
  const snapshot = await cafeCustomersCollection(cafeId).doc(normalizedPhone).get();
  if (!snapshot.exists) return null;
  return serializeCustomer(snapshot);
}

export async function upsertGlobalCustomerProfile(phone, { name = '', email = '', cafeId = null } = {}) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  const globalRef = customersCollection().doc(normalizedPhone);
  const globalSnapshot = await globalRef.get();
  const existing = globalSnapshot.exists ? globalSnapshot.data() || {} : {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedName = String(name || '').trim();

  const payload = {
    phone: normalizedPhone,
    name: normalizedName || existing.name || '',
    email: normalizedEmail || existing.email || '',
    last_order_at: FieldValue.serverTimestamp(),
    total_orders: FieldValue.increment(1),
    updated_at: FieldValue.serverTimestamp(),
  };

  if (!globalSnapshot.exists) {
    payload.created_at = FieldValue.serverTimestamp();
  }

  await globalRef.set(payload, { merge: true });

  if (cafeId) {
    await cafeCustomersCollection(cafeId).doc(normalizedPhone).set({
      phone: normalizedPhone,
      name: payload.name,
      email: payload.email,
      last_order_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return getGlobalCustomerProfile(normalizedPhone);
}

export async function getOrdersByPhone(cafeId, phone, limit = 15) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return [];

  const snapshot = await ordersCollection(cafeId)
    .where('whatsapp_number', '==', normalizedPhone)
    .orderBy('created_at', 'desc')
    .limit(Number(limit || 15))
    .get();

  return snapshot.docs.map(serializeOrder);
}

export async function createOrder(cafeId, {
  tableNumber,
  items,
  whatsappNumber,
  customerName = '',
  customerEmail = '',
  source = 'dine_in',
  billingStatus = 'unbilled',
  status = 'pending',
}) {
  const normalizedSource = String(source || 'dine_in').toLowerCase();
  const resolvedTableNumber = tableNumber ? Number(tableNumber) : null;
  const tableLookup = resolvedTableNumber
    ? await tablesCollection(cafeId).where('number', '==', resolvedTableNumber).limit(1).get()
    : null;
  const tableId = tableLookup && !tableLookup.empty ? tableLookup.docs[0].id : null;

  const activeForTable = resolvedTableNumber
    ? await ordersCollection(cafeId).where('table_number', '==', resolvedTableNumber).get()
    : { docs: [] };

  const hasActiveOrder = activeForTable.docs.some((doc) => {
    const status = doc.data()?.status;
    return status === 'pending' || status === 'preparing';
  });

  if (resolvedTableNumber && hasActiveOrder && normalizedSource !== 'walk_in') {
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
  const normalizedPhone = normalizePhone(whatsappNumber);
  const normalizedEmail = String(customerEmail || '').trim().toLowerCase();
  const normalizedName = String(customerName || '').trim();

  await ref.set({
    cafe_id: String(cafeId),
    table_id: tableId,
    table_number: resolvedTableNumber,
    order_number: orderNumber,
    status,
    source: normalizedSource,
    whatsapp_number: normalizedPhone,
    customer_name: normalizedName,
    customer_email: normalizedEmail,
    billing_status: billingStatus,
    items: normalizedItems,
    total_price: totalPrice,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  if (normalizedPhone) {
    await upsertGlobalCustomerProfile(normalizedPhone, {
      name: normalizedName,
      email: normalizedEmail,
      cafeId,
    });
  }

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
