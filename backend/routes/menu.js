import express from 'express';
import { createMenuItem, deleteMenuItem, getMenuItems, updateMenuItem } from '../firebase-store.js';
import { requireAuth, requireRoles, resolveCafeId } from '../middleware/firebaseAuth.js';

const router = express.Router();

const CATEGORIES = [
  'Coffee', 'Tea', 'Juices & Shakes', 'Beverages',
  'Snacks', 'Mains', 'Desserts', 'Bakery', 'Other'
];

router.get('/', async (req, res) => {
  try {
    const cafeId = resolveCafeId(req);
    if (!cafeId) return res.status(400).json({ error: 'cafe_id required' });
    const items = await getMenuItems(cafeId);
    res.json(items);
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

router.get('/categories', (req, res) => {
  res.json(CATEGORIES);
});

router.post('/', requireAuth, requireRoles('owner', 'admin'), async (req, res) => {
  try {
    const { name, price, description, available, image_url, category, is_trending } = req.body;
    if (!name || price === undefined) return res.status(400).json({ error: 'Name and price are required' });
    if (isNaN(price) || Number(price) <= 0) return res.status(400).json({ error: 'Price must be a positive number' });

    const item = await createMenuItem(req.session.cafeId, {
      name,
      price,
      description: description || null,
      available,
      image_url: image_url || null,
      category: category || 'Other',
      is_trending: Boolean(is_trending),
    });
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

router.put('/:id', requireAuth, requireRoles('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, description, available, image_url, category, is_trending } = req.body;
    const item = await updateMenuItem(req.session.cafeId, id, {
      name,
      price,
      description,
      available,
      image_url,
      category,
      is_trending,
    });
    if (!item) return res.status(404).json({ error: 'Menu item not found' });
    res.json(item);
  } catch (error) {
    console.error('Error updating menu item:', error);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

router.delete('/:id', requireAuth, requireRoles('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await deleteMenuItem(req.session.cafeId, id);
    if (!deleted) return res.status(404).json({ error: 'Menu item not found' });
    res.json({ message: 'Menu item deleted successfully' });
  } catch (error) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

export default router;
