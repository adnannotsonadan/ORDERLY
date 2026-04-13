(function () {
  let initPromise = null;
  let syncPromise = null;

  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      if (!window.firebase) {
        throw new Error('Firebase browser SDK is not loaded.');
      }

      const response = await fetch('/api/firebase/config');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load Firebase config.');
      }

      const app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(data);
      const auth = window.firebase.auth(app);
      await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
      return { app, auth, config: data };
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

  async function postSession(endpoint, payload) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Authentication request failed.');
    }
    return data;
  }

  async function syncSession(forceRefresh = false) {
    if (syncPromise && !forceRefresh) return syncPromise;

    syncPromise = (async () => {
      const { auth } = await init();
      const user = await waitForUser(auth);
      if (!user) return null;

      const idToken = await user.getIdToken(forceRefresh);
      return postSession('/api/auth/session', { idToken });
    })();

    try {
      return await syncPromise;
    } finally {
      syncPromise = null;
    }
  }

  async function signInWithEmail(email, password) {
    const { auth } = await init();
    await auth.signInWithEmailAndPassword(email, password);
    const user = auth.currentUser;
    const idToken = await user.getIdToken(true);
    return postSession('/api/auth/sign-in', { idToken });
  }

  async function signUpWithEmail(name, email, password) {
    const { auth } = await init();
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    if (name) {
      await credential.user.updateProfile({ displayName: name });
    }
    const idToken = await credential.user.getIdToken(true);
    return postSession('/api/auth/sign-up', { idToken, name, email });
  }

  async function signOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}

    const { auth } = await init();
    await auth.signOut();
  }

  async function requireAuth(redirectTo = '/sign-in') {
    try {
      const session = await syncSession();
      if (session) return session;
    } catch (error) {
      console.error('Auth sync failed:', error);
    }

    window.location.href = redirectTo;
    return null;
  }

  async function redirectIfAuthenticated(target = '/dashboard') {
    try {
      const session = await syncSession();
      if (session) {
        window.location.href = target;
        return true;
      }
    } catch {}

    return false;
  }

  window.QRCafeAuth = {
    init,
    syncSession,
    signInWithEmail,
    signUpWithEmail,
    signIn: signInWithEmail,
    signUp: signUpWithEmail,
    signOut,
    requireAuth,
    redirectIfAuthenticated,
  };
})();
