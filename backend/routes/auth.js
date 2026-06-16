﻿import express from 'express';
import { adminAuth } from '../firebase.js';
import {
  ensureCafeDefaults,
  ensureUserProfile,
  getCafe,
  getUserProfile,
  markUserLogin,
  resolveAccessibleCafeId,
} from '../firebase-store.js';
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

async function createSessionAndRespond(res, idToken, cafeId, statusCode = 200) {
  await setSession(res, idToken, cafeId);
  const decoded = await adminAuth.verifyIdToken(idToken, true);
  await markUserLogin(decoded.uid);
  const cafe = await getCafe(cafeId);
  return res.status(statusCode).json({
    message: statusCode === 201 ? 'Sign up successful' : 'Sign in successful',
    cafeId,
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

    await ensureUserProfile({
      uid: decoded.uid,
      email: email || decoded.email,
      displayName: name || decoded.name || decoded.email.split('@')[0],
      createdBy: decoded.uid,
    });

    return createSessionAndRespond(res, idToken, decoded.uid, 201);
  } catch (error) {
    console.error('Sign-up error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Sign up failed' });
  }
}

async function handleSignIn(req, res) {
  try {
    const { idToken } = req.body;
    const decoded = await decodeIdToken(idToken);
    const user = await getUserProfile(decoded.uid);
    if (user && user.status !== 'active') {
      return res.status(403).json({ error: 'Your account has been disabled' });
    }

    const cafeId = await resolveAccessibleCafeId(decoded.uid, user?.default_cafe_id || null);
    if (!cafeId) {
      return res.status(403).json({ error: 'No cafe access found for this user' });
    }

    return createSessionAndRespond(res, idToken, cafeId);
  } catch (error) {
    console.error('Sign-in error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Sign in failed' });
  }
}

router.post(['/sign-up', '/signup'], requireGuest, handleSignUp);
router.post(['/sign-in', '/login'], requireGuest, handleSignIn);

router.post('/session', async (req, res) => {
  try {
    const { idToken, cafeId } = req.body;
    const decoded = await decodeIdToken(idToken);
    const user = await getUserProfile(decoded.uid);
    if (user && user.status !== 'active') {
      return res.status(403).json({ error: 'Your account has been disabled' });
    }

    const resolvedCafeId = await resolveAccessibleCafeId(decoded.uid, cafeId || user?.default_cafe_id || null);
    if (!resolvedCafeId) {
      return res.status(403).json({ error: 'No cafe access found for this user' });
    }

    return createSessionAndRespond(res, idToken, resolvedCafeId);
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
    uid: req.session.uid,
    cafeId: req.session.cafeId,
    cafeName: cafe?.name || 'Our Cafe',
    role: req.session.role || null,
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
