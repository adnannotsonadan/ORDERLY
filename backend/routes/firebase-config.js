import express from 'express';
import { firebasePublicConfig, hasFirebasePublicConfig } from '../firebase.js';

const router = express.Router();

router.get('/config', (req, res) => {
  if (!hasFirebasePublicConfig()) {
    return res.status(500).json({
      error: 'Firebase client config is incomplete. Set FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, and FIREBASE_APP_ID.',
    });
  }

  res.json(firebasePublicConfig);
});

export default router;
