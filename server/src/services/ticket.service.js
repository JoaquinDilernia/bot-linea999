import { getDb } from './firebase.service.js';
import { listUsers } from './auth.service.js';
import { getAllTemplates } from './template.service.js';
import { sendWhatsAppTemplate, sendWhatsAppMessage } from './meta.service.js';

const COLLECTION = 'bot-nuevaaurora_reclamos';
const COUNTER_COLLECTION = 'bot-nuevaaurora_counters';
const RESOLVED_TEMPLATE_NAME = 'ticket_resuelto';

// Número de reclamo correlativo y legible (L999-000001) — mucho más fácil
// de anotar/repetir por teléfono para un pasajero que un ID de Firestore.
// Transacción atómica sobre un doc contador para que dos reclamos
// simultáneos nunca puedan pisarse el mismo número.
async function nextReclamoNumero() {
  const db = getDb();
  const counterRef = db.collection(COUNTER_COLLECTION).doc('reclamos');
  const value = await db.runTransaction(async tx => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data().value ?? 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return next;
  });
  return `L999-${String(value).padStart(6, '0')}`;
}

// Filtra en memoria en vez de con `.where()` encadenados: el volumen esperado
// de reclamos es bajo y así se evita necesitar un índice compuesto para
// cada combinación de estado+prioridad+orderBy.
export async function getAllTickets({ estado, prioridad } = {}) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
  let tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (estado) tickets = tickets.filter(t => t.estado === estado);
  if (prioridad) tickets = tickets.filter(t => t.prioridad === prioridad);
  return tickets;
}

export async function getTicketById(id) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

// Reclamo sin asignación explícita cae en el primer agente admin — resuelto
// dinámicamente (nunca un email hardcodeado) para no romper si cambia quién
// es el admin.
export async function getDefaultAssignee() {
  const users = await listUsers();
  const admin = users.find(u => u.role === 'admin');
  return admin?.email ?? null;
}

export async function createTicket({ titulo, descripcion, contactId = null, prioridad = 'media', imagenes = [], createdBy }) {
  const db = getDb();
  const [assignedTo, numero] = await Promise.all([getDefaultAssignee(), nextReclamoNumero()]);
  const ticket = {
    numero,
    titulo,
    descripcion,
    contactId,
    conversationId: contactId,
    prioridad,
    estado: 'abierto',
    imagenes,
    createdBy,
    assignedTo,
    comentarios: [],
    respuestas: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
  };
  const ref = await db.collection(COLLECTION).add(ticket);
  return { id: ref.id, ...ticket };
}

export async function updateTicket(id, { titulo, descripcion, prioridad, estado, assignedTo, imagenes } = {}) {
  const db = getDb();
  const docRef = db.collection(COLLECTION).doc(id);
  const before = await docRef.get();
  if (!before.exists) throw new Error('Reclamo no encontrado');
  const beforeData = before.data();

  const update = { updatedAt: new Date() };
  if (titulo !== undefined) update.titulo = titulo;
  if (descripcion !== undefined) update.descripcion = descripcion;
  if (prioridad !== undefined) update.prioridad = prioridad;
  if (assignedTo !== undefined) update.assignedTo = assignedTo;
  if (imagenes !== undefined) update.imagenes = imagenes;

  const justResolved = estado === 'resuelto' && beforeData.estado !== 'resuelto';
  if (estado !== undefined) {
    update.estado = estado;
    if (justResolved) {
      update.resolvedAt = new Date();
      update.notificationStatus = 'pending';
    }
  }

  await docRef.update(update);
  const after = await docRef.get();
  const ticket = { id: after.id, ...after.data() };

  if (justResolved && ticket.contactId) {
    // Fire-and-forget — un fallo notificando no debe bloquear ni revertir el
    // cambio de estado que el agente ya confirmó. Esto es un aviso genérico
    // vía plantilla de WhatsApp (requiere plantilla aprobada en Meta); para
    // mandarle al pasajero una respuesta con contenido real, usar
    // respondTicket() en vez de simplemente cambiar el estado acá.
    notifyTicketResolved(ticket).catch(err => console.error('[ticket] Error notificando resolución:', err.message));
  }

  return ticket;
}

export async function addComment(id, { autor, texto }) {
  const db = getDb();
  const docRef = db.collection(COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) throw new Error('Reclamo no encontrado');
  const comentarios = [...(doc.data().comentarios ?? []), { autor, texto, createdAt: new Date() }];
  await docRef.update({ comentarios, updatedAt: new Date() });
  return comentarios;
}

// Respuesta real al pasajero — a diferencia de addComment (nota interna
// entre agentes, nunca sale del panel), esto le manda un WhatsApp de texto
// libre al contacto del reclamo con el contenido que escribe el agente, y
// marca el reclamo como resuelto. Es el corazón del "panel de reclamos":
// la línea le contesta al pasajero directamente desde acá, sin que un
// humano tenga que tomar la conversación de WhatsApp.
export async function respondTicket(id, { autor, texto }) {
  const db = getDb();
  const docRef = db.collection(COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) throw new Error('Reclamo no encontrado');
  const ticket = { id: doc.id, ...doc.data() };
  if (!ticket.contactId) throw new Error('Este reclamo no tiene un contacto de WhatsApp asociado');

  const respuesta = { autor, texto, createdAt: new Date() };
  const respuestas = [...(ticket.respuestas ?? []), respuesta];
  const wasResolved = ticket.estado === 'resuelto';

  await docRef.update({
    respuestas,
    estado: 'resuelto',
    resolvedAt: wasResolved ? (ticket.resolvedAt ?? new Date()) : new Date(),
    updatedAt: new Date(),
  });

  const mensaje = `Hola! Te escribimos por tu reclamo *N° ${ticket.numero}*:\n\n${texto}`;
  let notificationStatus = 'sent';
  try {
    await sendWhatsAppMessage(ticket.contactId, mensaje);
  } catch (err) {
    console.error('[ticket] Error enviando respuesta por WhatsApp:', err.response?.data ?? err.message);
    notificationStatus = 'failed';
  }
  await docRef.update({ notificationStatus }).catch(() => {});

  const after = await docRef.get();
  return { id: after.id, ...after.data() };
}

async function notifyTicketResolved(ticket) {
  const db = getDb();
  const templates = await getAllTemplates();
  const approved = templates.find(t => t.name === RESOLVED_TEMPLATE_NAME && t.metaStatus === 'APPROVED');
  if (!approved) {
    console.warn(`[ticket] Plantilla "${RESOLVED_TEMPLATE_NAME}" no existe o no está aprobada en Meta todavía — no se notifica al cliente. Creála desde Plantillas, o usá "Responder al pasajero" que manda texto libre sin necesitar plantilla.`);
    await db.collection(COLLECTION).doc(ticket.id).update({ notificationStatus: 'no_template' }).catch(() => {});
    return;
  }
  try {
    await sendWhatsAppTemplate(ticket.contactId, RESOLVED_TEMPLATE_NAME, approved.language ?? 'es_AR', [ticket.titulo]);
    console.log(`[ticket] Notificación de resolución enviada para reclamo ${ticket.numero}`);
    await db.collection(COLLECTION).doc(ticket.id).update({ notificationStatus: 'sent' }).catch(() => {});
  } catch (err) {
    console.error('[ticket] Error enviando plantilla de resolución:', err.message);
    await db.collection(COLLECTION).doc(ticket.id).update({ notificationStatus: 'failed' }).catch(() => {});
    throw err;
  }
}
