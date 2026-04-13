import express from 'express';
import { createWaiterCall, dismissWaiterCall, getWaiterCalls } from '../firebase-store.js';
import { requireAuth, resolveCafeId } from '../middleware/firebaseAuth.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const cafeId = resolveCafeId(req);
    const tableNumber = Number(req.body.table_number || 0);

    if (!cafeId || !tableNumber) {
      return res.status(400).json({ error: 'cafe_id and table_number are required' });
    }

    const call = await createWaiterCall(cafeId, tableNumber);
    res.status(201).json(call);
  } catch (error) {
    if (error.code === 'waiter-call-exists') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Waiter call error:', error);
    res.status(500).json({ error: 'Failed to create waiter call' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const calls = await getWaiterCalls(req.session.cafeId);
  res.json(calls);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const dismissed = await dismissWaiterCall(req.session.cafeId, req.params.id);
  if (!dismissed) return res.status(404).json({ error: 'Call not found' });
  res.json({ message: 'Dismissed' });
});

export default router;
