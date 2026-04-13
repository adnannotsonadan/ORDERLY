import { adminAuth } from '../firebase.js';

const SESSION_COOKIE = 'qr_cafe_session';
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

function buildSession(decodedToken) {
  return {
    uid: decodedToken.uid,
    cafeId: decodedToken.uid,
    email: decodedToken.email || '',
  };
}

export async function authSessionMiddleware(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const sessionCookie = cookies[SESSION_COOKIE];
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (sessionCookie) {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      req.session = buildSession(decoded);
      req.firebaseUser = decoded;
      return next();
    }

    if (bearerToken) {
      const decoded = await adminAuth.verifyIdToken(bearerToken, true);
      req.session = buildSession(decoded);
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

export async function setSession(res, idToken) {
  const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_AGE_MS });
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${sessionCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_AGE_MS / 1000)}`
  );
}

export function clearSession(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export function requireAuth(req, res, next) {
  if (!req.session.cafeId) {
    if ((req.headers.accept || '').includes('text/html')) return res.redirect('/sign-in');
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
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
