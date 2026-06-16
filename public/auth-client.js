(function () {
  const DEFAULT_THEME = {
    brandColor: '#c8773a',
    bgColor: '#f7f4f0',
    surfaceColor: '#ffffff',
    textColor: '#1a1714',
    fontFamily: 'DM Sans',
    cafeName: 'Our Cafe',
    logoUrl: '',
  };

  let initPromise = null;
  let authLoadingMarkupInstalled = false;

  const AUTH_LOADING_CLASS = 'auth-checking';
  const AUTH_READY_CLASS = 'auth-ready';

  function setAuthLoadingState(isLoading) {
    const root = document.documentElement;
    if (!root) return;

    root.classList.toggle(AUTH_LOADING_CLASS, Boolean(isLoading));
    root.classList.toggle(AUTH_READY_CLASS, !isLoading);

    if (document.body && document.body.classList.contains('auth-page')) {
      document.body.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    }
  }

  function installAuthLoadingStyles() {
    if (authLoadingMarkupInstalled || !document.head) return;

    const style = document.createElement('style');
    style.id = 'qr-cafe-auth-loading-style';
    style.textContent = [
      'html.auth-checking body.auth-page { overflow: hidden; }',
      'html.auth-checking body.auth-page .auth-card { opacity: 0; transform: translateY(12px) scale(0.98); pointer-events: none; filter: blur(3px); }',
      'html.auth-checking body.auth-page .auth-loading-overlay { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px; background: radial-gradient(circle at top, rgba(255, 248, 240, 0.96), rgba(247, 244, 240, 0.86) 58%, rgba(247, 244, 240, 0.98)); backdrop-filter: blur(10px); }',
      'html.auth-ready body.auth-page .auth-loading-overlay { display: none; }',
      '.auth-loading-panel { display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; color: var(--text-mid); }',
      '.auth-loading-panel .spinner { width: 42px; height: 42px; }',
      '.auth-loading-title { font-size: 0.98rem; font-weight: 600; letter-spacing: 0.01em; color: var(--text); }',
      '.auth-loading-subtitle { font-size: 0.88rem; color: var(--text-mid); max-width: 260px; }'
    ].join('\n');

    document.head.appendChild(style);
    authLoadingMarkupInstalled = true;
  }

  function ensureAuthLoadingOverlay() {
    if (document.getElementById('auth-loading-overlay')) return;
    if (!document.body || !document.body.classList.contains('auth-page')) return;

    const overlay = document.createElement('div');
    overlay.id = 'auth-loading-overlay';
    overlay.className = 'auth-loading-overlay';
    overlay.innerHTML = [
      '<div class="auth-loading-panel">',
      '  <div class="spinner" aria-hidden="true"></div>',
      '  <div class="auth-loading-title">Checking your authentication state</div>',
      '  <div class="auth-loading-subtitle">Please wait while we verify your session.</div>',
      '</div>'
    ].join('');
    document.body.prepend(overlay);
  }

  function bootstrapAuthLoadingState() {
    if (!document.documentElement) {
      return;
    }

    installAuthLoadingStyles();
    setAuthLoadingState(true);

    const activate = () => {
      if (!document.body || !document.body.classList.contains('auth-page')) {
        return;
      }

      ensureAuthLoadingOverlay();
    };

    if (document.body) {
      activate();
    } else {
      document.addEventListener('DOMContentLoaded', activate, { once: true });
    }
  }

  bootstrapAuthLoadingState();

  async function loadConfig() {
    const currentConfig = window.__FIREBASE_CONFIG__ || {};
    const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
    const missing = required.filter((key) => !String(currentConfig[key] || '').trim());
    if (missing.length === 0) {
      return currentConfig;
    }

    try {
      const response = await fetch('/api/firebase/config', { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error('Server Firebase config is unavailable');
      }

      const serverConfig = await response.json();
      window.__FIREBASE_CONFIG__ = serverConfig;

      const stillMissing = required.filter((key) => !String(serverConfig[key] || '').trim());
      if (stillMissing.length === 0) {
        return serverConfig;
      }
    } catch {
      // Fall through to a single, actionable error below.
    }

    throw new Error(`Firebase config is incomplete. Missing: ${missing.join(', ')}. Update public/firebase-config.js or provide backend Firebase env vars.`);
  }

  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      if (!window.firebase) {
        throw new Error('Firebase browser SDK is not loaded.');
      }

      const config = await loadConfig();
      const app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(config);
      const auth = window.firebase.auth(app);
      const db = window.firebase.firestore(app);
      await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
      return { app, auth, db, config };
    })();

    return initPromise;
  }

  async function waitForUser(auth) {
    return new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        unsubscribe();
        resolve(user || null);
      });
    });
  }

  function serverTimestamp() {
    return window.firebase.firestore.FieldValue.serverTimestamp();
  }

  function cafesCollection(db) {
    return db.collection('cafes');
  }

  function usersCollection(db) {
    return db.collection('users');
  }

  function cafeRef(db, cafeId) {
    return cafesCollection(db).doc(String(cafeId));
  }

  function userRef(db, uid) {
    return usersCollection(db).doc(String(uid));
  }

  function menuCollection(db, cafeId) {
    return cafeRef(db, cafeId).collection('menu_items');
  }

  function tablesCollection(db, cafeId) {
    return cafeRef(db, cafeId).collection('tables');
  }

  function ordersCollection(db, cafeId) {
    return cafeRef(db, cafeId).collection('orders');
  }

  function waiterCallsCollection(db, cafeId) {
    return cafeRef(db, cafeId).collection('waiter_calls');
  }

  function membersCollection(db, cafeId) {
    return cafeRef(db, cafeId).collection('members');
  }

  function counterRef(db, cafeId, counterName) {
    return cafeRef(db, cafeId).collection('counters').doc(String(counterName));
  }

  function toIsoDate(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
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
      updated_at: toIsoDate(data.updated_at),
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
      updated_at: toIsoDate(data.updated_at),
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
      updated_at: toIsoDate(data.updated_at),
      dismissed: Boolean(data.dismissed),
    };
  }

  function serializeTeamMember(doc) {
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

  async function getCurrentUser() {
    const { auth } = await init();
    return waitForUser(auth);
  }

  async function getCurrentCafeId() {
    const { db } = await init();
    const user = await getCurrentUser();
    if (!user) return null;

    const ownerCafe = await cafeRef(db, user.uid).get();
    if (ownerCafe.exists) return user.uid;

    const userSnapshot = await userRef(db, user.uid).get();
    const defaultCafeId = userSnapshot.exists ? (userSnapshot.data()?.default_cafe_id || null) : null;
    if (defaultCafeId) return String(defaultCafeId);

    const memberships = await db.collectionGroup('members')
      .where('uid', '==', String(user.uid))
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (memberships.empty) return null;
    return memberships.docs[0].ref.parent.parent?.id || null;
  }

  async function getCurrentUserProfile() {
    const { db } = await init();
    const user = await getCurrentUser();
    if (!user) return null;
    const snapshot = await usersCollection(db).doc(String(user.uid)).get();
    if (!snapshot.exists) return null;
    return {
      uid: user.uid,
      ...snapshot.data(),
    };
  }

  async function getCafeRole(cafeId) {
    const { db } = await init();
    const user = await getCurrentUser();
    if (!user || !cafeId) return null;

    const cafeSnapshot = await cafeRef(db, cafeId).get();
    if (!cafeSnapshot.exists) return null;

    const cafeData = cafeSnapshot.data() || {};
    if (String(cafeData.owner_uid || cafeId) === String(user.uid) || String(cafeId) === String(user.uid)) {
      return 'owner';
    }

    const memberSnapshot = await membersCollection(db, cafeId).doc(String(user.uid)).get();
    if (!memberSnapshot.exists) return null;
    const member = memberSnapshot.data() || {};
    if ((member.status || 'active') !== 'active') return null;
    return String(member.role || 'cashier').toLowerCase();
  }

  function hasAnyRole(role, allowedRoles = []) {
    const normalizedRole = String(role || '').toLowerCase();
    const set = new Set((allowedRoles || []).map((item) => String(item || '').toLowerCase()));
    return Boolean(normalizedRole && set.has(normalizedRole));
  }

  function getCafeIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('cafe_id');
  }

  async function getActiveCafeId(preferredCafeId) {
    if (preferredCafeId) return String(preferredCafeId);
    const fromUrl = getCafeIdFromUrl();
    if (fromUrl) return String(fromUrl);
    return getCurrentCafeId();
  }

  async function getCafe(cafeId) {
    if (!cafeId) return null;
    const { db } = await init();
    const snapshot = await cafeRef(db, cafeId).get();
    if (!snapshot.exists) return null;
    return serializeCafe(snapshot);
  }

  async function ensureCafeProfile({ cafeId, name, email, plan = 'starter' }) {
    const { db } = await init();
    const ref = cafeRef(db, cafeId);
    const snapshot = await ref.get();
    const resolvedName = String(name || '').trim() || cafeNameFromEmail(email);

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
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      return getCafe(cafeId);
    }

    const current = snapshot.data() || {};
    const updates = {};
    if (resolvedName && resolvedName !== current.name) updates.name = resolvedName;
    if (email && String(email).trim().toLowerCase() !== current.email) {
      updates.email = String(email).trim().toLowerCase();
    }
    if (!current.plan) updates.plan = plan;
    if (!current.owner_uid) updates.owner_uid = String(cafeId);
    if (!current.brandColor) updates.brandColor = DEFAULT_THEME.brandColor;
    if (!current.bgColor) updates.bgColor = DEFAULT_THEME.bgColor;
    if (!current.surfaceColor) updates.surfaceColor = DEFAULT_THEME.surfaceColor;
    if (!current.textColor) updates.textColor = DEFAULT_THEME.textColor;
    if (!current.fontFamily) updates.fontFamily = DEFAULT_THEME.fontFamily;
    if (current.logoUrl === undefined) updates.logoUrl = DEFAULT_THEME.logoUrl;

    if (Object.keys(updates).length > 0) {
      updates.updated_at = serverTimestamp();
      await ref.set(updates, { merge: true });
    }

    return getCafe(cafeId);
  }

  async function ensureCafeDefaults(cafeId, fallbackName, fallbackEmail) {
    if (!cafeId) return null;
    const { db } = await init();
    await ensureCafeProfile({ cafeId, name: fallbackName, email: fallbackEmail });

    const [tablesSnapshot, counterSnapshot] = await Promise.all([
      tablesCollection(db, cafeId).limit(1).get(),
      counterRef(db, cafeId, 'order').get(),
    ]);

    await userRef(db, cafeId).set({
      email: String(fallbackEmail || '').trim().toLowerCase(),
      display_name: fallbackName || cafeNameFromEmail(fallbackEmail),
      status: 'active',
      default_cafe_id: String(cafeId),
      created_by: String(cafeId),
      updated_at: serverTimestamp(),
      created_at: serverTimestamp(),
    }, { merge: true });

    await membersCollection(db, cafeId).doc(String(cafeId)).set({
      uid: String(cafeId),
      email: String(fallbackEmail || '').trim().toLowerCase(),
      display_name: fallbackName || cafeNameFromEmail(fallbackEmail),
      role: 'owner',
      status: 'active',
      invited_by: null,
      updated_at: serverTimestamp(),
      created_at: serverTimestamp(),
    }, { merge: true });

    if (!counterSnapshot.exists) {
      await counterRef(db, cafeId, 'order').set({
        value: 0,
        updated_at: serverTimestamp(),
      });
    }

    if (tablesSnapshot.empty) {
      const batch = db.batch();
      for (let tableNumber = 1; tableNumber <= 5; tableNumber += 1) {
        const ref = tablesCollection(db, cafeId).doc(`table_${tableNumber}`);
        batch.set(ref, {
          cafe_id: String(cafeId),
          number: tableNumber,
          label: `Table ${tableNumber}`,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    return getCafe(cafeId);
  }

  async function getSession() {
    const { db, auth } = await init();
    const user = await getCurrentUser();
    if (!user) return null;

    const userSnapshot = await userRef(db, user.uid).get();
    // If no users doc exists yet, check if they have a cafe membership directly
    if (userSnapshot.exists && (userSnapshot.data()?.status || 'active') !== 'active') {
      await auth.signOut();
      return null;
    }

    const cafeId = await getCurrentCafeId();
    if (!cafeId) return null;
    const cafe = await getCafe(cafeId);
    const role = await getCafeRole(cafeId);
    if (!role) return null;

    return {
      uid: user.uid,
      cafeId,
      cafeName: cafe?.name || user.displayName || cafeNameFromEmail(user.email),
      email: cafe?.email || user.email || '',
      role,
    };
  }

  async function signInWithEmail(email, password) {
      const { auth } = await init();
      const credential = await auth.signInWithEmailAndPassword(email, password);

      // Establish server-side session cookie so API routes work
      try {
        const idToken = await credential.user.getIdToken();
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ idToken }),
        });
      } catch {
        // Non-fatal — client session still works for menu/orders
      }

      const session = await getSession();
      if (!session) {
        throw new Error('User is not registered in database or has no cafe access.');
      }
      return session;
    }

  async function signUpWithEmail(name, email, password) {
    const { auth } = await init();
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    if (name) {
      await credential.user.updateProfile({ displayName: name });
    }
    await ensureCafeDefaults(credential.user.uid, name || credential.user.displayName, email);
    return getSession();
  }

  async function signOut() {
    const { auth } = await init();
    await auth.signOut();
  }

  async function requireAuth(redirectTo = 'sign-in.html') {
    try {
      setAuthLoadingState(true);
      const session = await getSession();
      if (session) {
        setAuthLoadingState(false);
        return session;
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }

    setAuthLoadingState(false);
    window.location.href = redirectTo;
    return null;
  }

  async function requireRoleAccess(allowedRoles, redirectTo = 'dashboard.html') {
    const session = await requireAuth('sign-in.html');
    if (!session) return null;
    if (!hasAnyRole(session.role, allowedRoles)) {
      window.location.href = redirectTo;
      return null;
    }
    return session;
  }

  async function redirectIfAuthenticated(target = 'dashboard.html') {
    try {
      setAuthLoadingState(true);
      const session = await getSession();
      if (session) {
        window.location.href = target;
        return true;
      }
    } catch (error) {
      console.error('Auth redirect check failed:', error);
    }

    setAuthLoadingState(false);
    return false;
  }

  async function getNextCounterValue(cafeId, counterName) {
    const { db } = await init();
    return db.runTransaction(async (transaction) => {
      const ref = counterRef(db, cafeId, counterName);
      const snapshot = await transaction.get(ref);
      const current = Number(snapshot.data()?.value || 0);
      const next = current + 1;
      transaction.set(ref, { value: next, updated_at: serverTimestamp() }, { merge: true });
      return next;
    });
  }

  async function getMenuItems(cafeId) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    if (!resolvedCafeId) return [];
    const { db } = await init();
    const snapshot = await menuCollection(db, resolvedCafeId).get();
    return sortMenuItems(snapshot.docs.map(serializeMenuItem));
  }

  async function subscribeMenuItems(cafeId, callback) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    if (!resolvedCafeId) return function noop() {};
    const { db } = await init();
    return menuCollection(db, resolvedCafeId).onSnapshot((snapshot) => {
      callback(sortMenuItems(snapshot.docs.map(serializeMenuItem)));
    });
  }

  async function createMenuItem(cafeId, item) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();
    const ref = menuCollection(db, resolvedCafeId).doc();
    await ref.set({
      cafe_id: String(resolvedCafeId),
      name: item.name.trim(),
      price: Number(item.price),
      description: item.description || null,
      image_url: item.image_url || null,
      category: item.category || 'Other',
      available: item.available !== false,
      is_trending: Boolean(item.is_trending),
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    return serializeMenuItem(await ref.get());
  }

  async function updateMenuItem(cafeId, itemId, updates) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();
    const ref = menuCollection(db, resolvedCafeId).doc(String(itemId));
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;

    const payload = { updated_at: serverTimestamp() };
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

  async function deleteMenuItem(cafeId, itemId) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();
    const ref = menuCollection(db, resolvedCafeId).doc(String(itemId));
    const snapshot = await ref.get();
    if (!snapshot.exists) return false;
    await ref.delete();
    return true;
  }

  async function getTables(cafeId) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    if (!resolvedCafeId) return [];
    const { db } = await init();
    const snapshot = await tablesCollection(db, resolvedCafeId).get();
    return sortByNumber(snapshot.docs.map(serializeTable));
  }

  async function subscribeTables(cafeId, callback) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    if (!resolvedCafeId) return function noop() {};
    const { db } = await init();
    return tablesCollection(db, resolvedCafeId).onSnapshot((snapshot) => {
      callback(sortByNumber(snapshot.docs.map(serializeTable)));
    });
  }

  async function createTable(cafeId, { number, label }) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();
    const existing = await tablesCollection(db, resolvedCafeId).where('number', '==', Number(number)).limit(1).get();
    if (!existing.empty) {
      const error = new Error('Table number already exists');
      error.code = 'duplicate-table';
      throw error;
    }

    const ref = tablesCollection(db, resolvedCafeId).doc(`table_${number}`);
    await ref.set({
      cafe_id: String(resolvedCafeId),
      number: Number(number),
      label: label || `Table ${number}`,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    return serializeTable(await ref.get());
  }

  async function updateTable(cafeId, tableId, { label }) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();
    const ref = tablesCollection(db, resolvedCafeId).doc(String(tableId));
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;
    await ref.set({ label: label || '', updated_at: serverTimestamp() }, { merge: true });
    return serializeTable(await ref.get());
  }

  async function deleteTable(cafeId, tableId) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();
    const ref = tablesCollection(db, resolvedCafeId).doc(String(tableId));
    const snapshot = await ref.get();
    if (!snapshot.exists) return false;
    await ref.delete();
    return true;
  }

  async function getTable(cafeId, tableId) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();
    const snapshot = await tablesCollection(db, resolvedCafeId).doc(String(tableId)).get();
    if (!snapshot.exists) return null;
    return serializeTable(snapshot);
  }

  function buildMenuUrl(cafeId, tableNumber) {
    const url = new URL('menu.html', window.location.href);
    url.searchParams.set('cafe_id', String(cafeId));
    url.searchParams.set('table', String(tableNumber));
    return url.toString();
  }

  async function getTheme(cafeId) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    if (!resolvedCafeId) return { ...DEFAULT_THEME };

    const { db } = await init();
    const cafeSnapshot = await cafeRef(db, resolvedCafeId).get();
    if (!cafeSnapshot.exists) return { ...DEFAULT_THEME };
    const theme = cafeSnapshot.data() || {};
    return {
      brandColor: theme.brandColor || DEFAULT_THEME.brandColor,
      bgColor: theme.bgColor || DEFAULT_THEME.bgColor,
      surfaceColor: theme.surfaceColor || DEFAULT_THEME.surfaceColor,
      textColor: theme.textColor || DEFAULT_THEME.textColor,
      fontFamily: theme.fontFamily || DEFAULT_THEME.fontFamily,
      cafeName: theme.name || DEFAULT_THEME.cafeName,
      logoUrl: theme.logoUrl || '',
      gstNumber: theme.gst_number || '',
      fssaiNumber: theme.fssai_number || '',
      restaurantPhone: theme.contact_phone || '',
      restaurantAddress: theme.address || '',
    };
  }

  async function saveTheme(cafeId, updates) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    if (!resolvedCafeId) {
      throw new Error('Cafe ID is required to save theme');
    }

    const { db } = await init();
    const nextCafeName = updates.cafeName?.trim();
    await cafeRef(db, resolvedCafeId).set({
      ...(nextCafeName ? { name: nextCafeName } : {}),
      brandColor: updates.brandColor || DEFAULT_THEME.brandColor,
      bgColor: updates.bgColor || DEFAULT_THEME.bgColor,
      surfaceColor: updates.surfaceColor || DEFAULT_THEME.surfaceColor,
      textColor: updates.textColor || DEFAULT_THEME.textColor,
      fontFamily: updates.fontFamily || DEFAULT_THEME.fontFamily,
      logoUrl: updates.logoUrl || '',
      gst_number: String(updates.gstNumber || '').trim(),
      fssai_number: String(updates.fssaiNumber || '').trim(),
      contact_phone: String(updates.restaurantPhone || '').replace(/\D/g, '').slice(-10),
      address: String(updates.restaurantAddress || '').trim(),
      updated_at: serverTimestamp(),
    }, { merge: true });

    return getTheme(resolvedCafeId);
  }

  async function resetTheme(cafeId) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    if (!resolvedCafeId) {
      throw new Error('Cafe ID is required to reset theme');
    }

    const { db } = await init();
    await cafeRef(db, resolvedCafeId).set({
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
      updated_at: serverTimestamp(),
    }, { merge: true });

    return getTheme(resolvedCafeId);
  }

  async function createOrder(cafeId, {
    tableNumber,
    items,
    whatsappNumber,
    customerName,
    customerEmail,
    source = 'dine_in',
    billingStatus = 'unbilled',
    status = 'pending',
  }) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();

    const itemSnapshots = await Promise.all(
      items.map((item) => menuCollection(db, resolvedCafeId).doc(String(item.id)).get())
    );

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
    const orderNumber = Number(String(Date.now()).slice(-6));
    const ref = ordersCollection(db, resolvedCafeId).doc();

    await ref.set({
      cafe_id: String(resolvedCafeId),
      table_id: null,
      table_number: tableNumber ? Number(tableNumber) : null,
      order_number: orderNumber,
      status,
      source: source || 'dine_in',
      whatsapp_number: String(whatsappNumber || '').replace(/\D/g, '').slice(-10),
      customer_name: String(customerName || '').trim(),
      customer_email: String(customerEmail || '').trim().toLowerCase(),
      billing_status: billingStatus || 'unbilled',
      items: normalizedItems,
      total_price: totalPrice,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    if (whatsappNumber) {
      await upsertCustomerProfile(resolvedCafeId, {
        phone: whatsappNumber,
        name: customerName,
        email: customerEmail,
      });
    }

    return serializeOrder(await ref.get());
  }

  async function upsertCustomerProfile(cafeId, { phone, name, email }) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!normalizedPhone) throw new Error('Phone number is required');
    const { db } = await init();

    const payload = {
      phone: normalizedPhone,
      name: String(name || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      last_order_at: serverTimestamp(),
      total_orders: window.firebase.firestore.FieldValue.increment(1),
      updated_at: serverTimestamp(),
    };

    await db.collection('customers').doc(normalizedPhone).set(payload, { merge: true });
    await cafeRef(db, resolvedCafeId).collection('customers').doc(normalizedPhone).set(payload, { merge: true });
    return { ...payload, phone: normalizedPhone };
  }

  async function lookupCustomerByPhone(cafeId, phone) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!normalizedPhone) return null;
    const { db } = await init();

    const [globalSnapshot, cafeSnapshot] = await Promise.all([
      db.collection('customers').doc(normalizedPhone).get(),
      cafeRef(db, resolvedCafeId).collection('customers').doc(normalizedPhone).get(),
    ]);

    if (!globalSnapshot.exists && !cafeSnapshot.exists) return null;
    const globalData = globalSnapshot.exists ? (globalSnapshot.data() || {}) : {};
    const cafeData = cafeSnapshot.exists ? (cafeSnapshot.data() || {}) : {};

    return {
      phone: normalizedPhone,
      name: cafeData.name || globalData.name || '',
      email: cafeData.email || globalData.email || '',
    };
  }

  async function getOrdersByPhone(cafeId, phone) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!normalizedPhone) return [];
    const { db } = await init();

    const snapshot = await ordersCollection(db, resolvedCafeId)
      .where('whatsapp_number', '==', normalizedPhone)
      .get();

    return sortByCreatedAtDesc(snapshot.docs.map(serializeOrder));
  }

  async function getOrders(cafeId) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    if (!resolvedCafeId) return [];
    const { db } = await init();
    const snapshot = await ordersCollection(db, resolvedCafeId).get();
    return sortByCreatedAtDesc(snapshot.docs.map(serializeOrder));
  }

  async function subscribeOrders(cafeId, callback) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    if (!resolvedCafeId) return function noop() {};
    const { db } = await init();
    return ordersCollection(db, resolvedCafeId).onSnapshot((snapshot) => {
      callback(sortByCreatedAtDesc(snapshot.docs.map(serializeOrder)));
    });
  }

  async function updateOrderStatus(cafeId, orderId, status) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();
    const ref = ordersCollection(db, resolvedCafeId).doc(String(orderId));
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;
    await ref.set({ status, updated_at: serverTimestamp() }, { merge: true });
    return serializeOrder(await ref.get());
  }

  async function deleteOrder(cafeId, orderId) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();
    const ref = ordersCollection(db, resolvedCafeId).doc(String(orderId));
    const snapshot = await ref.get();
    if (!snapshot.exists) return false;
    await ref.delete();
    return true;
  }

  function computeAnalyticsFromOrders(orders) {
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

    const bestsellers = [...bestsellerMap.values()].sort((a, b) => b.total_sold - a.total_sold).slice(0, 5);
    const hourly = [...hourlyMap.entries()].sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ hour, count }));
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

  async function getAnalytics(cafeId) {
    const orders = await getOrders(cafeId);
    return computeAnalyticsFromOrders(orders);
  }

  async function createWaiterCall(cafeId, tableNumber) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();
    const ref = waiterCallsCollection(db, resolvedCafeId).doc(`table_${Number(tableNumber)}`);
    await ref.set({
      table_number: Number(tableNumber),
      dismissed: false,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    return serializeWaiterCall(await ref.get());
  }

  async function getWaiterCalls(cafeId) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    if (!resolvedCafeId) return [];
    const { db } = await init();
    const snapshot = await waiterCallsCollection(db, resolvedCafeId).where('dismissed', '==', false).get();
    return sortByCreatedAtDesc(snapshot.docs.map(serializeWaiterCall));
  }

  async function subscribeWaiterCalls(cafeId, callback) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    if (!resolvedCafeId) return function noop() {};
    const { db } = await init();
    return waiterCallsCollection(db, resolvedCafeId)
      .where('dismissed', '==', false)
      .onSnapshot((snapshot) => {
        callback(sortByCreatedAtDesc(snapshot.docs.map(serializeWaiterCall)));
      });
  }

  async function dismissWaiterCall(cafeId, callId) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();
    const ref = waiterCallsCollection(db, resolvedCafeId).doc(String(callId));
    const snapshot = await ref.get();
    if (!snapshot.exists) return false;
    await ref.set({ dismissed: true, updated_at: serverTimestamp() }, { merge: true });
    return true;
  }

  async function getTeamMembers(cafeId) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    if (!resolvedCafeId) return [];
    const { db } = await init();
    const snapshot = await membersCollection(db, resolvedCafeId).get();
    return snapshot.docs.map(serializeTeamMember).sort((a, b) => a.display_name.localeCompare(b.display_name));
  }

  async function addTeamMember(cafeId, { uid, email, display_name, role }) {
      const { auth } = await init();
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      const idToken = await user.getIdToken();

      const response = await fetch('/api/team/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ uid, email, display_name, role }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add team member');
      }
      return response.json();
    }

  async function updateTeamMember(cafeId, uid, updates) {
    const resolvedCafeId = await getActiveCafeId(cafeId);
    const { db } = await init();
    const ref = membersCollection(db, resolvedCafeId).doc(String(uid));
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;

    const payload = { updated_at: serverTimestamp() };
    if (updates.role !== undefined) payload.role = updates.role;
    if (updates.status !== undefined) payload.status = updates.status;

    await ref.set(payload, { merge: true });
    return serializeTeamMember(await ref.get());
  }

  async function removeTeamMember(cafeId, uid) {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      const idToken = await user.getIdToken();

      const response = await fetch(`/api/team/${uid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` },
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to remove team member');
      }
      return true;
    }

  window.QRCafeApp = {
    DEFAULT_THEME,
    init,
    getCurrentUser,
    getCurrentCafeId,
    getCafeIdFromUrl,
    getActiveCafeId,
    getSession,
    getCafeRole,
    hasAnyRole,
    getCafe,
    ensureCafeDefaults,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    requireAuth,
    requireRoleAccess,
    redirectIfAuthenticated,
    getMenuItems,
    subscribeMenuItems,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem,
    getTables,
    subscribeTables,
    createTable,
    updateTable,
    deleteTable,
    getTable,
    buildMenuUrl,
    getTheme,
    saveTheme,
    resetTheme,
    createOrder,
    getOrdersByPhone,
    getOrders,
    subscribeOrders,
    updateOrderStatus,
    deleteOrder,
    getAnalytics,
    computeAnalyticsFromOrders,
    createWaiterCall,
    getWaiterCalls,
    subscribeWaiterCalls,
    dismissWaiterCall,
    getCurrentUserProfile,
    lookupCustomerByPhone,
    upsertCustomerProfile,
    getTeamMembers,
    addTeamMember,
    updateTeamMember,
    removeTeamMember,
  };

  window.QRCafeAuth = {
    init,
    getSession,
    getCurrentUser,
    getCurrentCafeId,
    getCafeRole,
    signInWithEmail,
    signUpWithEmail,
    signIn: signInWithEmail,
    signUp: signUpWithEmail,
    signOut,
    requireAuth,
    requireRoleAccess,
    redirectIfAuthenticated,
    getCurrentUserProfile,
    getTeamMembers,
    addTeamMember,
    updateTeamMember,
    removeTeamMember,
  };
})();
