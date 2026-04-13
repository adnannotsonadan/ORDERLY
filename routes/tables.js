import express from 'express';
import { createTable, deleteTable, getTable, getTables, updateTable } from '../firebase-store.js';
import { requireAuth } from '../middleware/firebaseAuth.js';
import QRCode from 'qrcode';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const tables = await getTables(req.session.cafeId);
    res.json(tables);
  } catch (error) {
    console.error('Tables fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { number, label } = req.body;
    if (!number) return res.status(400).json({ error: 'Table number required' });

    const table = await createTable(req.session.cafeId, { number, label });
    res.status(201).json(table);
  } catch (error) {
    console.error('Add table error:', error);
    if (error.code === 'duplicate-table') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to add table' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { label } = req.body;
    const table = await updateTable(req.session.cafeId, req.params.id, { label });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json(table);
  } catch (error) {
    console.error('Update table error:', error);
    res.status(500).json({ error: 'Failed to update table' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await deleteTable(req.session.cafeId, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Table not found' });
    res.json({ message: 'Table deleted' });
  } catch (error) {
    console.error('Delete table error:', error);
    res.status(500).json({ error: 'Failed to delete table' });
  }
});

router.get('/:id/qr', requireAuth, async (req, res) => {
  try {
    const table = await getTable(req.session.cafeId, req.params.id);
    if (!table) return res.status(404).json({ error: 'Table not found' });

    const url = `${req.protocol}://${req.get('host')}/menu?cafe_id=${req.session.cafeId}&table=${table.number}`;
    const qr = await QRCode.toDataURL(url, { width: 300, margin: 2 });
    res.json({ qr, url, table });
  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR' });
  }
});

export default router;
