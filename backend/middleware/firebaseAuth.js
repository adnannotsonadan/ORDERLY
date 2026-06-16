import { adminAuth } from '../firebase.js';
import { verifyCafeAccess } from '../firebase-store.js';

const SESSION_COOKIE = 'qr_cafe_session';
const CAFE_CONTEXT_COOKIE = 'qr_cafe_ctx';
const SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) continue;
    cookies[rawKey] = decodeURIComponent(rest.join('=') || '');
  }

  return cookies;
}

function buildSession(decodedToken, cafeContext) {
  return {
    uid: decodedToken.uid,
    cafeId: cafeContext || null,
    email: decodedToken.email || '',
  };
}

export async function authSessionMiddleware(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const sessionCookie = cookies[SESSION_COOKIE];
    const cafeContextCookie = cookies[CAFE_CONTEXT_COOKIE] || null;
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (sessionCookie) {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      req.session = buildSession(decoded, cafeContextCookie);
      req.firebaseUser = decoded;
      return next();
    }

    if (bearerToken) {
      const decoded = await adminAuth.verifyIdToken(bearerToken, true);
      req.session = buildSession(decoded, cafeContextCookie);
      req.firebaseUser = decoded;
      return next();
    }

    req.session = {};
    req.firebaseUser = null;
    next();
  } catch {
    req.session = {};
    req.firebaseUser = null;
    clearSession(res);
    next();
  }
}

export async function setSession(res, idToken, cafeId) {
  const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_AGE_MS });
  const maxAge = Math.floor(SESSION_AGE_MS / 1000);
  const setCookies = [
    `${SESSION_COOKIE}=${sessionCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
    `${CAFE_CONTEXT_COOKIE}=${encodeURIComponent(String(cafeId || ''))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
  ];
  res.setHeader('Set-Cookie', setCookies);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    `${CAFE_CONTEXT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  ]);
}

export async function requireAuth(req, res, next) {
  if (!req.session.cafeId) {
    if ((req.headers.accept || '').includes('text/html')) return res.redirect('/sign-in');
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const access = await verifyCafeAccess(req.session.uid, req.session.cafeId);
    if (!access.allowed) {
      clearSession(res);
      if ((req.headers.accept || '').includes('text/html')) return res.redirect('/sign-in');
      return res.status(403).json({ error: 'No access to this cafe' });
    }
    req.session.role = access.role;
  } catch {
    return res.status(500).json({ error: 'Authorization check failed' });
  }

  next();
}

export function requireRoles(...roles) {
  const allowed = new Set((roles || []).map((role) => String(role || '').toLowerCase()));

  return (req, res, next) => {
    const role = String(req.session?.role || '').toLowerCase();
    if (!role || !allowed.has(role)) {
      if ((req.headers.accept || '').includes('text/html')) return res.redirect('/dashboard');
      return res.status(403).json({ error: 'Insufficient role permissions' });
    }
    return next();
  };
}

export function requireGuest(req, res, next) {
  if (req.session.cafeId) {
    return res.status(409).json({ error: 'Already authenticated' });
  }
  next();
}

export function resolveCafeId(req) {
  const fromSession = req.session?.cafeId ? String(req.session.cafeId) : '';
  const fromQuery = req.query?.cafe_id ? String(req.query.cafe_id) : '';
  const fromBody = req.body?.cafe_id ? String(req.body.cafe_id) : '';
  const fromApp = req.app?.locals?.defaultCafeId ? String(req.app.locals.defaultCafeId) : '';
  return fromSession || fromQuery || fromBody || fromApp || null;
}
