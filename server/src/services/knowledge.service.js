import { getDb } from './firebase.service.js';

const COLLECTION = 'bot-nuevaaurora_knowledge_base';

// Contenido de ejemplo para la demo comercial de Transportes Nueva Aurora
// (empresa ficticia armada para mostrarle a presidentes de líneas de
// colectivos cómo queda el bot con información real cargada, en vez de
// mostrarlo vacío). Se siembra solo si la KB está vacía — una vez que el
// cliente real carga la suya desde el panel, esto no se vuelve a tocar.
const SEED_KNOWLEDGE = [
  {
    title: 'Recorridos y frecuencias',
    order: 1,
    content: `Línea 999 "Nueva Aurora" (urbana): Terminal La Plata ⇄ Berisso ⇄ Ensenada. Frecuencia cada 12-15 min. Servicio de 5:30 a 23:30 todos los días.
Línea 999 Diferencial: mismo recorrido que la 999 común, unidades con aire acondicionado y menos paradas. Frecuencia cada 30 min, de 6:00 a 22:00.
Servicio interurbano "Nueva Aurora Directo": La Plata (Terminal) ⇄ Buenos Aires (Retiro), sin paradas intermedias. 8 salidas diarias: 6:00, 8:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00. Duración aproximada: 1h10.
Las tarifas de cada servicio están en el cuadro tarifario, no acá.`,
  },
  {
    title: 'Equipaje y mascotas',
    order: 2,
    content: `Interurbano (Nueva Aurora Directo): se permite 1 bulto de bodega (hasta 20kg) sin cargo y 1 bolso de mano. Equipaje adicional tiene un cargo de $500 por bulto.
Línea urbana (999 y Diferencial): solo equipaje de mano que el pasajero pueda sostener; no hay bodega.
Mascotas: se permiten en bolso o transportador cerrado, tamaño chico, en ambos servicios. Mascotas grandes o sueltas no están permitidas por normativa de seguridad.`,
  },
  {
    title: 'Reclamos y objetos perdidos',
    order: 3,
    content: `Todo reclamo (demora, mal trato, incidente en una unidad, cobro indebido) u objeto perdido se registra directo acá por este WhatsApp — no hace falta ir a ninguna oficina. Al reclamo se le asigna un número (formato L999-000000) que el pasajero puede usar para hacer seguimiento. El equipo de atención al pasajero revisa cada reclamo y responde por este mismo canal.`,
  },
  {
    title: 'Oficina comercial y contacto',
    order: 4,
    content: `Oficina comercial: Terminal de Ómnibus La Plata, local 12. Horario: lunes a viernes 8:00 a 18:00, sábados 8:00 a 13:00.
Venta anticipada de pasajes del servicio Nueva Aurora Directo: hasta 15 días antes del viaje, en boletería o por este WhatsApp.
Empresa: Transportes Nueva Aurora S.A.`,
  },
];

export async function seedKnowledgeIfNeeded() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).limit(1).get();
  if (!snap.empty) return;
  const batch = db.batch();
  for (const item of SEED_KNOWLEDGE) {
    const ref = db.collection(COLLECTION).doc();
    batch.set(ref, { ...item, active: true, createdAt: new Date(), updatedAt: new Date() });
  }
  await batch.commit();
  console.log('[knowledge] Seed inicial completado');
}

/**
 * Obtiene toda la knowledge base activa como string para inyectar al prompt.
 * @returns {Promise<string>}
 */
export async function getKnowledgeBasePrompt() {
  const db = getDb();
  const snapshot = await db
    .collection(COLLECTION)
    .where('active', '==', true)
    .get();

  if (snapshot.empty) return '';

  const sections = snapshot.docs
    .map(doc => doc.data())
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .map(d => `### ${d.title}\n${d.content}`);

  return sections.join('\n\n');
}

/**
 * Obtiene el contenido de un item activo de la knowledge base por título exacto.
 * Usado por respuestas de menú guiado que necesitan un dato puntual sin pasar por Claude.
 * @param {string} title
 * @returns {Promise<string|null>}
 */
export async function getKnowledgeItemByTitle(title) {
  const db = getDb();
  const snapshot = await db
    .collection(COLLECTION)
    .where('active', '==', true)
    .where('title', '==', title)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0].data().content;
}

/**
 * Obtiene todos los items de la knowledge base (para el dashboard).
 * @returns {Promise<Array>}
 */
export async function getAllKnowledgeItems() {
  const db = getDb();
  const snapshot = await db.collection(COLLECTION).get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

/**
 * Crea un nuevo item en la knowledge base.
 * @param {object} item - { title, content, category, order, active }
 * @returns {Promise<object>}
 */
export async function createKnowledgeItem(item) {
  const db = getDb();
  const ref = await db.collection(COLLECTION).add({
    ...item,
    active: item.active ?? true,
    order: item.order ?? 99,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id: ref.id, ...item };
}

/**
 * Actualiza un item de la knowledge base.
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<void>}
 */
export async function updateKnowledgeItem(id, updates) {
  const db = getDb();
  await db.collection(COLLECTION).doc(id).update({ ...updates, updatedAt: new Date() });
}

/**
 * Elimina un item de la knowledge base.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteKnowledgeItem(id) {
  const db = getDb();
  await db.collection(COLLECTION).doc(id).delete();
}
