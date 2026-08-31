import { getDb } from './firebase.service.js';

const COLLECTION = 'bot-nuevaaurora_tarifas';

// Cuadro tarifario estructurado — reemplaza a un párrafo de texto libre en
// la Knowledge Base. Es la fuente de verdad para precios: se edita desde
// el panel (Tarifario) y se inyecta ya formateada en el prompt del bot,
// así el precio que dice el bot siempre coincide con lo que carga la
// línea, sin depender de que el texto de la KB quede prolijo/actualizado.
const SEED_TARIFAS = [
  { servicio: 'Línea 999 (urbana)', tarifa: '$850', medioPago: 'SUBE', notas: 'Tarifa plana, sin importar la distancia dentro del recorrido', order: 1 },
  { servicio: 'Línea 999 Diferencial', tarifa: '$1200', medioPago: 'SUBE', notas: 'Unidades con aire acondicionado, menos paradas', order: 2 },
  { servicio: 'Nueva Aurora Directo (interurbano La Plata ⇄ Retiro)', tarifa: '$3500', medioPago: 'Efectivo o tarjeta, en boletería o en la unidad', notas: 'Boleto único, sin combinación', order: 3 },
  { servicio: 'Jubilados y pensionados (Línea 999)', tarifa: 'Gratis', medioPago: 'SUBE registrada', notas: '', order: 4 },
  { servicio: 'Estudiantes — boleto educativo (Línea 999)', tarifa: '50% de descuento', medioPago: 'SUBE', notas: 'Solo en horario escolar', order: 5 },
];

export async function seedTarifasIfNeeded() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).limit(1).get();
  if (!snap.empty) return;
  const batch = db.batch();
  for (const tarifa of SEED_TARIFAS) {
    const ref = db.collection(COLLECTION).doc();
    batch.set(ref, { ...tarifa, active: true, createdAt: new Date(), updatedAt: new Date() });
  }
  await batch.commit();
  console.log('[tarifas] Seed inicial completado');
}

export async function getAllTarifas() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

// String ya formateado para inyectar directo en el system prompt del bot.
export async function getTarifarioPrompt() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).where('active', '==', true).get();
  if (snap.empty) return '';
  const tarifas = snap.docs.map(d => d.data()).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  return tarifas
    .map(t => `- ${t.servicio}: ${t.tarifa} (${t.medioPago})${t.notas ? ` — ${t.notas}` : ''}`)
    .join('\n');
}

export async function createTarifa({ servicio, tarifa, medioPago = '', notas = '', active = true }) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).orderBy('order', 'desc').limit(1).get();
  const lastOrder = snap.empty ? 0 : snap.docs[0].data().order ?? 0;
  const ref = await db.collection(COLLECTION).add({
    servicio, tarifa, medioPago, notas, active,
    order: lastOrder + 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const doc = await ref.get();
  return { id: doc.id, ...doc.data() };
}

export async function updateTarifa(id, updates) {
  const db = getDb();
  await db.collection(COLLECTION).doc(id).update({ ...updates, updatedAt: new Date() });
  const doc = await db.collection(COLLECTION).doc(id).get();
  return { id: doc.id, ...doc.data() };
}

export async function deleteTarifa(id) {
  const db = getDb();
  await db.collection(COLLECTION).doc(id).delete();
}
