import express from 'express';
import { createOrder, deleteOrder, getOrders, getOrdersByPhone, updateOrderStatus } from '../firebase-store.js';
import { requireAuth, requireRoles, resolveCafeId } from '../middleware/firebaseAuth.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const cafeId = resolveCafeId(req);
    const {
      table_number,
      items,
      whatsapp_number,
      customer_name,
      customer_email,
      source,
      billing_status,
      status,
    } = req.body;

    if (!cafeId) return res.status(400).json({ error: 'cafe_id is required' });
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }
    if (!whatsapp_number || !/^\d{10}$/.test(String(whatsapp_number).replace(/\D/g, '').slice(-10))) {
      return res.status(400).json({ error: 'A valid 10-digit WhatsApp number is required' });
    }
    if (String(source || 'dine_in') !== 'walk_in' && !table_number) {
      return res.status(400).json({ error: 'Table number is required for dine-in orders' });
    }
    if (items.some((item) => !item.quantity || item.quantity < 1 || !Number.isInteger(item.quantity))) {
      return res.status(400).json({ error: 'Each item must have a quantity of at least 1' });
    }

    const order = await createOrder(cafeId, {
      tableNumber: table_number,
      items,
      whatsappNumber: whatsapp_number,
      customerName: customer_name,
      customerEmail: customer_email,
      source: source || 'dine_in',
      billingStatus: billing_status || 'unbilled',
      status: status || 'pending',
    });
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    if (error.code === 'active-order') {
      return res.status(409).json({ error: error.message });
    }
    if (error.code === 'menu-item-not-found' || error.code === 'menu-item-unavailable') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.get('/', requireAuth, requireRoles('owner', 'admin', 'cashier', 'waiter'), async (req, res) => {
  try {
    const orders = await getOrders(req.session.cafeId);
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

router.get('/track', async (req, res) => {
  try {
    const cafeId = resolveCafeId(req);
    const phone = String(req.query.phone || '').trim();
    if (!cafeId) return res.status(400).json({ error: 'cafe_id is required' });
    if (!phone) return res.status(400).json({ error: 'phone is required' });

    const orders = await getOrdersByPhone(cafeId, phone, 20);
    res.json(orders);
  } catch (error) {
    console.error('Error tracking orders by phone:', error);
    res.status(500).json({ error: 'Failed to fetch tracked orders' });
  }
});

router.put('/:id', requireAuth, requireRoles('owner', 'admin', 'cashier', 'waiter'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'preparing', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status must be pending, preparing, completed, or cancelled' });
    }

    const order = await updateOrderStatus(req.session.cafeId, id, status);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

router.delete('/:id', requireAuth, requireRoles('owner', 'admin', 'cashier'), async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await deleteOrder(req.session.cafeId, id);
    if (!deleted) return res.status(404).json({ error: 'Order not found' });
    res.json({ message: 'Order deleted' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

export default router;
