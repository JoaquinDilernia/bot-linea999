import https from 'https';
import { getDb } from './firebase.service.js';

const MODEL = 'claude-sonnet-4-6';
const PRICING = { inputPerMTok: 3.00, outputPerMTok: 15.00 };

function logUsage(usage, type) {
  if (!usage?.input_tokens) return;
  const costUSD =
    (usage.input_tokens / 1e6) * PRICING.inputPerMTok +
    (usage.output_tokens / 1e6) * PRICING.outputPerMTok;
  getDb().collection('bot-nuevaaurora_usage_logs').add({
    service: 'claude',
    model: MODEL,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    costUSD: Math.round(costUSD * 1e6) / 1e6,
    type,
    createdAt: new Date(),
  }).catch(err => console.error('[claude] Error logging usage to Firestore:', err.message));
}

// Este bot NO deriva a un humano en ningún caso — es el único canal de
// atención. No existe marcador de escalada ni instrucciones de "te paso
// con el equipo": el punto de venta del producto es justamente que el bot
// resuelve consultas y reclamos de punta a punta sin intervención humana.
function buildNoHumanInstructions() {
  return `
IMPORTANTE — NO HAY DERIVACIÓN A HUMANOS: Sos el único canal de atención, no existe un equipo al que "pasar" la conversación. Nunca digas que vas a derivar, transferir o pasar con un agente/persona — eso no existe acá. Si algo no lo podés resolver con la información que tenés, decilo con honestidad y ofrecé lo que sí podés hacer (por ejemplo, registrar un reclamo — ver más abajo).

IMPORTANTE — CIERRE: Si la consulta está completamente resuelta y el cliente se despidió, empezá tu respuesta con [CERRAR].
Ejemplo: "[CERRAR] ¡Con mucho gusto! Si necesitás algo más, escribinos cuando quieras."
Usá [CERRAR] solo cuando estés seguro de que la conversación terminó.`;
}

function buildReclamoInstructions() {
  return `
IMPORTANTE — RECLAMOS: Cuando un pasajero reporta un reclamo (demora, mal trato, incidente en una unidad, cobro indebido) o un objeto perdido, conversá primero para juntar un título breve y una descripción clara (línea/servicio, fecha y horario aproximado si aplica). Si el pasajero menciona el número interno de la unidad o el legajo/nombre del chofer, incluilo en la descripción — es información valiosa para el equipo aunque no sea obligatoria. Antes o junto con el marcador, avisale EXPLÍCITAMENTE en tu texto que le estás registrando el reclamo en el sistema — nunca lo hagas en silencio. Recién ahí, en una línea separada (invisible para el cliente), agregá:
[CREAR_RECLAMO:{"titulo":"...","descripcion":"...","prioridad":"baja|media|alta|urgente","categoria":"demora|mal_trato|manejo_peligroso|unidad_mal_estado|cobro_indebido|objeto_perdido|no_realizo_parada|otro"}]
El JSON tiene que ser válido y tener exactamente esas 4 claves. La categoría la elegís vos según lo que más se ajuste a lo que cuenta el pasajero — usá "otro" solo si de verdad ninguna encaja. Si todavía no tenés información suficiente para un título/descripción claros, seguí preguntando antes de usar el marcador — nunca lo generes con datos vacíos o inventados. Después de crear el reclamo el sistema le va a dar al pasajero un número de reclamo automáticamente — vos no inventes ni digas ningún número, eso lo agrega el sistema después de tu respuesta.`;
}

function callAnthropicAPIOnce(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          const err = new Error(`Anthropic API ${res.statusCode}: ${data}`);
          err.statusCode = res.statusCode;
          err.retryAfter = res.headers['retry-after'];
          return reject(err);
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Anthropic response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const CLAUDE_MAX_RETRIES = 5;

async function callAnthropicAPI(payload) {
  let lastErr;
  for (let attempt = 1; attempt <= CLAUDE_MAX_RETRIES; attempt++) {
    try {
      return await callAnthropicAPIOnce(payload);
    } catch (err) {
      lastErr = err;
      const retryable = !err.statusCode || err.statusCode === 429 || err.statusCode === 529 || err.statusCode >= 500;
      if (!retryable || attempt === CLAUDE_MAX_RETRIES) throw err;
      const waitMs = err.retryAfter ? parseInt(err.retryAfter, 10) * 1000 : Math.min(1000 * 2 ** (attempt - 1), 15000);
      console.warn(`[claude] Retry ${attempt}/${CLAUDE_MAX_RETRIES} tras error: ${err.message} — esperando ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

export async function generateConversationSummary(messages) {
  if (!messages?.length) return 'Sin mensajes para resumir.';
  const formatted = messages
    .map(m => {
      const who = m.role === 'user' ? 'Cliente' : m.role === 'admin' ? 'Agente' : 'Bot';
      return `${who}: ${m.content ?? ''}`;
    })
    .join('\n');

  const response = await callAnthropicAPI({
    model: MODEL,
    max_tokens: 350,
    system: 'Generás resúmenes breves de conversaciones de atención al cliente en español rioplatense. Respondés SOLO con el resumen, sin encabezados ni listas.',
    messages: [{
      role: 'user',
      content: `Generá un resumen de 2 a 4 oraciones de esta conversación. Incluí: el motivo principal de la consulta y cómo terminó (resuelto, derivado a agente, pendiente).\n\nConversación:\n${formatted}`,
    }],
  });
  logUsage(response.usage, 'summary');
  return response.content[0].text.trim();
}

export async function generateBotResponse(userMessage, conversationHistory, context = {}) {
  const { knowledgeBase = '', customerContext = null, availableLabels = [], botConfig = {}, imageData = null, tarifario = '' } = context;

  const systemContent = buildSystemPrompt(botConfig, knowledgeBase, customerContext, availableLabels, tarifario);
  const messages = buildMessages(conversationHistory, userMessage, imageData);

  const response = await callAnthropicAPI({
    model: MODEL,
    max_tokens: 1024,
    system: systemContent,
    messages,
  });

  logUsage(response.usage, 'bot_reply');
  return response.content[0].text;
}

function buildSystemPrompt(botConfig = {}, knowledgeBase, customerContext, availableLabels = [], tarifario = '') {
  const botName = botConfig.botName || 'Asistente';
  const businessName = botConfig.businessName || 'Transportes Nueva Aurora';
  const personality = botConfig.botPersonality ||
    `Respondés de forma amigable, natural y cercana — como lo haría una persona real del equipo.
Usás un tono cálido y profesional. Nunca robótico ni genérico.
Escribís en español rioplatense (vos, etc.) con claridad.
Si no sabés algo, lo decís honestamente.
Nunca inventás información sobre servicios, precios, plazos, procesos o links — solo usás los datos que te den. Si algo no está en la información que tenés, lo decís honestamente en vez de inventar o suponer.`;

  let prompt = `Sos el asistente virtual de ${businessName}. Tu nombre es ${botName}.\n${personality}`;
  prompt += buildNoHumanInstructions();
  prompt += buildReclamoInstructions();
  if (tarifario) {
    prompt += `\n\n--- CUADRO TARIFARIO (fuente de verdad para precios) ---\n${tarifario}`;
  }
  if (knowledgeBase) {
    prompt += `\n\n--- INFORMACIÓN DE LA EMPRESA ---\n${knowledgeBase}`;
    prompt += `\n\nIMPORTANTE — USO DE ESTA INFORMACIÓN: Es TU ÚNICA fuente de verdad sobre recorridos, horarios, procesos y políticas (y el cuadro tarifario de arriba para precios). Antes de responder CUALQUIER consulta, revisá esta sección completa primero. Si algo aplica, compartilo directamente aunque el cliente no lo pida explícitamente. Si la consulta no está cubierta acá, NUNCA inventes ni supongas una respuesta — decí honestamente que no tenés ese dato.`;
  }
  if (customerContext) prompt += `\n\n--- PERFIL DEL CONTACTO ---\n${customerContext}`;
  if (availableLabels.length) {
    prompt += `\n\n--- ETIQUETAS ---\nDEBÉS etiquetar SIEMPRE esta conversación con al menos 1 etiqueta usando [LABEL:nombre] en tu respuesta (invisible para el cliente).
Etiquetas disponibles: ${availableLabels.join(', ')}.
Si ninguna aplica, creá una nueva con [NEW_LABEL:nombre] (ej: [NEW_LABEL:Consulta técnica]).
Guía:
- [LABEL:Consulta] → preguntas de horarios, recorridos o tarifas.
- [LABEL:Pasajes] → compra o consulta del servicio interurbano.
- [LABEL:Reclamo] → queja, incidente o cobro indebido.
- [LABEL:Objeto perdido] → pasajero busca algo que se le olvidó en una unidad.
Podés combinar varias etiquetas si aplica.`;
  }
  return prompt;
}

function buildMessages(conversationHistory, newMessage, imageData = null) {
  const messages = [];
  if (conversationHistory?.length) {
    const recent = conversationHistory.slice(-10);
    for (const msg of recent) {
      const role = msg.role === 'user' ? 'user' : 'assistant';
      messages.push({ role, content: msg.content });
    }
  }
  if (imageData) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imageData.mimeType, data: imageData.base64 } },
        { type: 'text', text: newMessage || 'Describí esta imagen en el contexto de la consulta del cliente.' },
      ],
    });
  } else {
    messages.push({ role: 'user', content: newMessage });
  }
  return messages;
}
