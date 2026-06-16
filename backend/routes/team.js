import express from 'express';
import { adminAuth } from '../firebase.js';
import {
  addCafeMember,
  getCafeMembers,
  removeCafeMember,
  updateCafeMember,
  verifyCafeAccess,
  resolveAccessibleCafeId,
} from '../firebase-store.js';
import { requireAuth, requireRoles } from '../middleware/firebaseAuth.js';

const router = express.Router();
const requireTeamManager = requireRoles('owner', 'admin');

// Token-based endpoint — no session cookie needed, used by admin.html
router.post('/provision', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'ID token required' });

    const decoded = await adminAuth.verifyIdToken(idToken);
    const access = await verifyCafeAccess(decoded.uid, decoded.uid);
    const resolvedCafeId = access.allowed ? decoded.uid : await resolveAccessibleCafeId(decoded.uid);
    if (!resolvedCafeId) return res.status(403).json({ error: 'No cafe access' });
    if (!['owner', 'admin'].includes(access.role)) return res.status(403).json({ error: 'Insufficient permissions' });

    const { uid, email, display_name, role } = req.body;
    if (!uid || !email) return res.status(400).json({ error: 'uid and email are required' });

    const member = await addCafeMember(resolvedCafeId, {
      uid, email, displayName: display_name || '', role: role || 'cashier', addedBy: decoded.uid,
    });
    res.status(201).json(member);
  } catch (error) {
    console.error('Provision error:', error);
    res.status(500).json({ error: error.message || 'Failed to provision member' });
  }
});

router.get('/', requireAuth, requireTeamManager, async (req, res) => {
  try {
    const members = await getCafeMembers(req.session.cafeId);
    res.json(members);
  } catch (error) {
    console.error('Team list error:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

router.post('/', requireAuth, requireTeamManager, async (req, res) => {
  try {
    const { uid, email, display_name, role } = req.body;
    if (!uid || !email) return res.status(400).json({ error: 'uid and email are required' });
    const member = await addCafeMember(req.session.cafeId, {
      uid, email, displayName: display_name || '', role: role || 'cashier', addedBy: req.session.uid,
    });
    res.status(201).json(member);
  } catch (error) {
    if (error.code === 'invalid-role' || error.code === 'user-inactive') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Add team member error:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

router.put('/:uid', requireAuth, requireTeamManager, async (req, res) => {
  try {
    const member = await updateCafeMember(req.session.cafeId, req.params.uid, {
      role: req.body.role,
      status: req.body.status,
    });
    if (!member) return res.status(404).json({ error: 'Team member not found' });
    res.json(member);
  } catch (error) {
    if (error.code === 'invalid-role' || error.code === 'invalid-status') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Update team member error:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

router.delete('/:uid', requireAuth, requireTeamManager, async (req, res) => {
  try {
    const removed = await removeCafeMember(req.session.cafeId, req.params.uid);
    if (!removed) return res.status(404).json({ error: 'Team member not found' });
    res.json({ message: 'Team member removed' });
  } catch (error) {
    if (error.code === 'owner-remove-forbidden') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Remove team member error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

export default router;
