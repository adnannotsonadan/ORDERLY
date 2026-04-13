import express from 'express';
import { adminAuth } from '../firebase.js';
import { ensureCafeDefaults, getCafe } from '../firebase-store.js';
import { requireGuest, setSession, clearSession } from '../middleware/firebaseAuth.js';

const router = express.Router();

async function decodeIdToken(idToken) {
  if (!idToken) {
    const error = new Error('Firebase ID token is required');
    error.status = 400;
    throw error;
  }

  try {
    return await adminAuth.verifyIdToken(idToken, true);
  } catch {
    const error = new Error('Invalid Firebase ID token');
    error.status = 401;
    throw error;
  }
}

async function createSessionAndRespond(res, idToken, statusCode = 200) {
  await setSession(res, idToken);
  const decoded = await adminAuth.verifyIdToken(idToken, true);
  const cafe = await getCafe(decoded.uid);
  return res.status(statusCode).json({
    message: statusCode === 201 ? 'Sign up successful' : 'Sign in successful',
    cafe,
  });
}

async function handleSignUp(req, res) {
  try {
    const { idToken, name, email } = req.body;
    const decoded = await decodeIdToken(idToken);

    if (!decoded.email) {
      return res.status(400).json({ error: 'Firebase account must include an email address' });
    }

    await ensureCafeDefaults(
      decoded.uid,
      name || decoded.name || decoded.email.split('@')[0],
      email || decoded.email
    );

    return createSessionAndRespond(res, idToken, 201);
  } catch (error) {
    console.error('Sign-up error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Sign up failed' });
  }
}

async function handleSignIn(req, res) {
  try {
    const { idToken } = req.body;
    const decoded = await decodeIdToken(idToken);
    await ensureCafeDefaults(decoded.uid, decoded.name || decoded.email?.split('@')[0], decoded.email);
    return createSessionAndRespond(res, idToken);
  } catch (error) {
    console.error('Sign-in error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Sign in failed' });
  }
}

router.post(['/sign-up', '/signup'], requireGuest, handleSignUp);
router.post(['/sign-in', '/login'], requireGuest, handleSignIn);

router.post('/session', async (req, res) => {
  try {
    const { idToken } = req.body;
    const decoded = await decodeIdToken(idToken);
    await ensureCafeDefaults(decoded.uid, decoded.name || decoded.email?.split('@')[0], decoded.email);
    return createSessionAndRespond(res, idToken);
  } catch (error) {
    console.error('Session sync error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Session sync failed' });
  }
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ message: 'Logged out' });
});

router.get('/me', async (req, res) => {
  if (!req.session.cafeId) return res.status(401).json({ error: 'Not authenticated' });
  const cafe = await getCafe(req.session.cafeId);
  res.json({
    cafeId: req.session.cafeId,
    cafeName: cafe?.name || 'Our Cafe',
    email: cafe?.email || req.session.email || '',
  });
});

router.get('/default', (req, res) => {
  res.json({
    cafeId: req.app.locals.defaultCafeId,
    cafeName: req.app.locals.defaultCafeName,
    email: req.app.locals.defaultCafeEmail,
  });
});

export default router;
