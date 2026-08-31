import { getDb } from './firebase.service.js';

const COLLECTION = 'bot-nuevaaurora_customers';

export async function getOrCreateCustomer(contactId, channel, contactName = null) {
  const db = getDb();
  const docRef = db.collection(COLLECTION).doc(contactId);
  const doc = await docRef.get();

  if (doc.exists) {
    const updates = { lastContactAt: new Date() };
    if (contactName && !doc.data().contactName) updates.contactName = contactName;
    await docRef.update(updates);
    return { id: doc.id, ...doc.data(), ...updates };
  }

  const customer = {
    contactId,
    channel,
    contactName: contactName ?? null,
    firstContactAt: new Date(),
    lastContactAt: new Date(),
    agentNotes: '',
    tags: [],
  };

  await docRef.set(customer);
  return { id: contactId, ...customer };
}

export async function getCustomerProfile(contactId) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(contactId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function updateCustomerNotes(contactId, agentNotes) {
  const db = getDb();
  await db.collection(COLLECTION).doc(contactId).update({
    agentNotes: agentNotes ?? '',
    updatedAt: new Date(),
  });
}

export function buildCustomerContext(customer) {
  if (!customer) return null;

  const lines = [];
  if (customer.contactName) lines.push(`Nombre: ${customer.contactName}`);
  lines.push(`Canal: ${customer.channel}`);
  if (customer.firstContactAt) lines.push(`Primera consulta: ${formatDate(customer.firstContactAt)}`);

  if (customer.agentNotes) {
    lines.push(`\nNotas del equipo: ${customer.agentNotes}`);
  }

  return lines.join('\n');
}

function formatDate(ts) {
  if (!ts) return '';
  try {
    const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
    return d.toLocaleDateString('es-AR');
  } catch { return ''; }
}
