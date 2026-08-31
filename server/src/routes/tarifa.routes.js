import { Router } from 'express';
import { getAllTarifas, createTarifa, updateTarifa, deleteTarifa } from '../services/tarifa.service.js';
import { requireAdmin } from '../middleware/requireAuth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    res.json({ tarifas: await getAllTarifas() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { servicio, tarifa, medioPago, notas, active } = req.body;
  if (!servicio?.trim() || !tarifa?.trim()) return res.status(400).json({ error: 'servicio y tarifa son requeridos' });
  try {
    const created = await createTarifa({ servicio: servicio.trim(), tarifa: tarifa.trim(), medioPago, notas, active });
    res.status(201).json({ tarifa: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const updated = await updateTarifa(req.params.id, req.body);
    res.json({ tarifa: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await deleteTarifa(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
