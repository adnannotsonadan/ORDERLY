import express from 'express';
import {
  getCafeCustomerProfile,
  getGlobalCustomerProfile,
  upsertGlobalCustomerProfile,
} from '../firebase-store.js';
import { requireAuth, requireRoles, resolveCafeId } from '../middleware/firebaseAuth.js';

const router = express.Router();

router.get('/lookup', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').trim();
    const cafeId = resolveCafeId(req);

    if (!phone) return res.status(400).json({ error: 'phone is required' });

    const [globalCustomer, cafeCustomer] = await Promise.all([
      getGlobalCustomerProfile(phone),
      cafeId ? getCafeCustomerProfile(cafeId, phone) : Promise.resolve(null),
    ]);

    if (!globalCustomer && !cafeCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.json({
      phone: (globalCustomer?.phone || cafeCustomer?.phone || '').trim(),
      name: (cafeCustomer?.name || globalCustomer?.name || '').trim(),
      email: (cafeCustomer?.email || globalCustomer?.email || '').trim(),
      source: cafeCustomer ? 'cafe+global' : 'global',
    });
  } catch (error) {
    console.error('Customer lookup error:', error);
    return res.status(500).json({ error: 'Failed to lookup customer' });
  }
});

router.post('/', requireAuth, requireRoles('owner', 'admin', 'cashier', 'waiter'), async (req, res) => {
  try {
    const cafeId = resolveCafeId(req);
    const { phone, name, email } = req.body;

    if (!cafeId) return res.status(400).json({ error: 'cafe_id is required' });
    if (!phone) return res.status(400).json({ error: 'phone is required' });

    const customer = await upsertGlobalCustomerProfile(phone, {
      name,
      email,
      cafeId,
    });

    return res.status(201).json(customer);
  } catch (error) {
    console.error('Customer upsert error:', error);
    return res.status(500).json({ error: 'Failed to save customer profile' });
  }
});

export default router;
