import { Router } from 'express';
import {
  getCustomerProfile,
  updateCustomerNotes,
} from '../services/customer.service.js';

const router = Router();

router.get('/:contactId', async (req, res) => {
  try {
    const profile = await getCustomerProfile(req.params.contactId);
    if (!profile) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ customer: profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:contactId/notes', async (req, res) => {
  try {
    await updateCustomerNotes(req.params.contactId, req.body.notes ?? '');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
