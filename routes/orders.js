import express from 'express';
import { createOrder, deleteOrder, getOrders, updateOrderStatus } from '../firebase-store.js';
import { requireAuth, resolveCafeId } from '../middleware/firebaseAuth.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const cafeId = resolveCafeId(req);
    const { table_number, items, whatsapp_number } = req.body;

    if (!cafeId) return res.status(400).json({ error: 'cafe_id is required' });
    if (!table_number || !items || items.length === 0) {
      return res.status(400).json({ error: 'Table number and items are required' });
    }
    if (!whatsapp_number || !/^\d{10}$/.test(whatsapp_number)) {
      return res.status(400).json({ error: 'A valid 10-digit WhatsApp number is required' });
    }
    if (items.some((item) => !item.quantity || item.quantity < 1 || !Number.isInteger(item.quantity))) {
      return res.status(400).json({ error: 'Each item must have a quantity of at least 1' });
    }

    const order = await createOrder(cafeId, {
      tableNumber: table_number,
      items,
      whatsappNumber: whatsapp_number,
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

router.get('/', requireAuth, async (req, res) => {
  try {
    const orders = await getOrders(req.session.cafeId);
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'preparing', 'completed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status must be pending, preparing, or completed' });
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

router.delete('/:id', requireAuth, async (req, res) => {
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
