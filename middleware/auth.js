import crypto from 'crypto';

const SESSION_COOKIE = 'qr_cafe_session';
const SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';

function sign(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function encode(payload) {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json).toString('base64url');
  return `${body}.${sign(body)}`;
}

function decode(value) {
  if (!value || !value.includes('.')) return null;
  const [body, signature] = value.split('.');
  if (!body || !signature || sign(body) !== signature) return null;

  try {
    const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!session.expiresAt || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

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

export function authSessionMiddleware(req, res, next) {
  const cookies = parseCookies(req.headers.cookie || '');
  req.session = decode(cookies[SESSION_COOKIE]) || {};
  next();
}

export function setSession(res, sessionData) {
  const payload = {
    ...sessionData,
    expiresAt: Date.now() + SESSION_AGE_MS,
  };
  const encoded = encode(payload);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_AGE_MS / 1000)}`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
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
  const fromSession = Number(req.session?.cafeId || 0);
  const fromQuery = Number(req.query?.cafe_id || 0);
  const fromBody = Number(req.body?.cafe_id || 0);
  const fromApp = Number(req.app?.locals?.defaultCafeId || 0);
  return fromSession || fromQuery || fromBody || fromApp || null;
}
