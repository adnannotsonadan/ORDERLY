import express from 'express';
import { getAnalytics } from '../firebase-store.js';
import { requireAuth } from '../middleware/firebaseAuth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const analytics = await getAnalytics(req.session.cafeId);
    res.json(analytics);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
