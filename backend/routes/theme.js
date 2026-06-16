import express from 'express';
import { DEFAULT_THEME, getTheme, resetTheme, saveTheme } from '../firebase-store.js';
import { requireAuth, requireRoles, resolveCafeId } from '../middleware/firebaseAuth.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const cafeId = resolveCafeId(req);
    if (!cafeId) return res.json(DEFAULT_THEME);
    const theme = await getTheme(cafeId);
    res.json(theme);
  } catch (error) {
    console.error('Theme fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch theme' });
  }
});

router.post('/', requireAuth, requireRoles('owner', 'admin'), async (req, res) => {
  try {
    const theme = await saveTheme(req.session.cafeId, req.body);
    res.json(theme);
  } catch (error) {
    console.error('Theme save error:', error);
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

router.delete('/', requireAuth, requireRoles('owner', 'admin'), async (req, res) => {
  try {
    const theme = await resetTheme(req.session.cafeId);
    res.json(theme);
  } catch (error) {
    console.error('Theme reset error:', error);
    res.status(500).json({ error: 'Failed to reset theme' });
  }
});

export default router;
