import { useEffect, useState } from 'react';
import { authFetch, BASE_URL } from '../lib/api';
import styles from './Reclamos.module.css';

const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'];
const ESTADOS = ['abierto', 'en_progreso', 'resuelto', 'cerrado'];
const CATEGORIAS = [
  { id: 'demora', label: 'Demora' },
  { id: 'mal_trato', label: 'Mal trato' },
  { id: 'manejo_peligroso', label: 'Manejo peligroso' },
  { id: 'unidad_mal_estado', label: 'Unidad en mal estado' },
  { id: 'cobro_indebido', label: 'Cobro indebido' },
  { id: 'objeto_perdido', label: 'Objeto perdido' },
  { id: 'no_realizo_parada', label: 'No realizó la parada' },
  { id: 'otro', label: 'Otro' },
];
const categoriaLabel = id => CATEGORIAS.find(c => c.id === id)?.label ?? id;
const EMPTY_RECLAMO = { titulo: '', descripcion: '', prioridad: 'media', categoria: 'otro', contactId: '' };

function TicketImage({ mediaId }) {
  const token = localStorage.getItem('na_token');
  return (
    <img
      className={styles.ticketImg}
      src={`${BASE_URL}/api/conversations/media/${mediaId}?token=${encodeURIComponent(token)}`}
      alt="Adjunto del reclamo"
      onError={e => { e.target.onerror = null; e.target.replaceWith(Object.assign(document.createElement('span'), { className: styles.imageExpired, textContent: '⚠️ Imagen no disponible (puede haber expirado)' })); }}
    />
  );
}

export default function Reclamos() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filterEstado, setFilterEstado] = useState('');
  const [filterPrioridad, setFilterPrioridad] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newTicket, setNewTicket] = useState(EMPTY_RECLAMO);
  const [newImage, setNewImage] = useState(null); // { mediaId, mimeType } tras subir
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [savingResponse, setSavingResponse] = useState(false);

  useEffect(() => { load(); }, [filterEstado, filterPrioridad, filterCategoria]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterEstado) params.set('estado', filterEstado);
      if (filterPrioridad) params.set('prioridad', filterPrioridad);
      if (filterCategoria) params.set('categoria', filterCategoria);
      const r = await authFetch(BASE_URL + '/api/reclamos?' + params.toString());
      if (r.ok) {
        const data = await r.json();
        setTickets(data.tickets ?? []);
        // Si el reclamo seleccionado sigue en la lista nueva, refrescá su
        // referencia (por si cambió estado desde otra pestaña); si no, deselecciona.
        setSelected(prev => (prev ? data.tickets?.find(t => t.id === prev.id) ?? null : null));
      }
    } finally {
      setLoading(false);
    }
  }

  async function updateSelected(patch) {
    if (!selected) return;
    const r = await authFetch(BASE_URL + `/api/reclamos/${selected.id}`, { method: 'PUT', body: patch });
    if (r.ok) {
      const { ticket } = await r.json();
      setSelected(ticket);
      setTickets(prev => prev.map(t => (t.id === ticket.id ? ticket : t)));
    }
  }

  async function addComment() {
    if (!commentText.trim() || !selected) return;
    setSavingComment(true);
    try {
      const r = await authFetch(BASE_URL + `/api/reclamos/${selected.id}/comments`, { method: 'POST', body: { texto: commentText.trim() } });
      if (r.ok) {
        const { comentarios } = await r.json();
        setSelected(prev => ({ ...prev, comentarios }));
        setCommentText('');
      }
    } finally {
      setSavingComment(false);
    }
  }

  // El botón fuerte del panel: le manda al pasajero un WhatsApp de verdad
  // con este texto y marca el reclamo como resuelto. Así la línea le
  // contesta al pasajero sin que nadie tenga que abrir la conversación de
  // WhatsApp a mano.
  async function sendResponse() {
    if (!responseText.trim() || !selected) return;
    setSavingResponse(true);
    try {
      const r = await authFetch(BASE_URL + `/api/reclamos/${selected.id}/responder`, { method: 'POST', body: { texto: responseText.trim() } });
      if (r.ok) {
        const { ticket } = await r.json();
        setSelected(ticket);
        setTickets(prev => prev.map(t => (t.id === ticket.id ? ticket : t)));
        setResponseText('');
      } else {
        const data = await r.json().catch(() => ({}));
        alert(`⚠️ ${data.error ?? 'No se pudo enviar la respuesta'}`);
      }
    } finally {
      setSavingResponse(false);
    }
  }

  async function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await authFetch(BASE_URL + '/api/reclamos/upload-image', { method: 'POST', body: form });
      if (r.ok) {
        const data = await r.json();
        setNewImage(data);
      } else {
        const data = await r.json().catch(() => ({}));
        alert(`⚠️ ${data.error ?? 'Error subiendo la imagen'}`);
      }
    } finally {
      setUploadingImage(false);
    }
  }

  async function createTicket() {
    if (!newTicket.titulo.trim() || !newTicket.descripcion.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...newTicket,
        contactId: newTicket.contactId || null,
        imagenes: newImage ? [newImage] : [],
      };
      const r = await authFetch(BASE_URL + '/api/reclamos', { method: 'POST', body });
      if (r.ok) {
        setShowNew(false);
        setNewTicket(EMPTY_RECLAMO);
        setNewImage(null);
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <aside className={styles.list}>
        <div className={styles.listHeader}>
          <div>
            <h1 className={styles.title}>Reclamos</h1>
            <p className={styles.subtitle}>El pasajero reclama acá — no en CNRT</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.refreshBtn} onClick={load} title="Actualizar">🔄</button>
            <button className={styles.newBtn} onClick={() => setShowNew(true)}>+ Nuevo</button>
          </div>
        </div>
        <div className={styles.filters}>
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
          </select>
          <select value={filterPrioridad} onChange={e => setFilterPrioridad(e.target.value)}>
            <option value="">Toda prioridad</option>
            {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}>
            <option value="">Toda categoría</option>
            {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        {loading ? (
          <p className={styles.empty}>Cargando...</p>
        ) : tickets.length === 0 ? (
          <p className={styles.empty}>No hay reclamos.</p>
        ) : (
          tickets.map(t => (
            <button key={t.id} className={`${styles.ticketItem} ${selected?.id === t.id ? styles.ticketItemActive : ''}`} onClick={() => setSelected(t)}>
              {t.numero && <span className={styles.ticketItemNumero}>{t.numero}</span>}
              <span className={styles.ticketItemTitle}>{t.titulo}</span>
              <div className={styles.ticketItemMeta}>
                <span className={`${styles.badge} ${styles['prio_' + t.prioridad]}`}>{t.prioridad}</span>
                <span className={`${styles.badge} ${styles['estado_' + t.estado]}`}>{t.estado.replace('_', ' ')}</span>
                {t.categoria && <span className={styles.badge}>{categoriaLabel(t.categoria)}</span>}
              </div>
            </button>
          ))
        )}
      </aside>

      <main className={styles.detail}>
        {showNew ? (
          <div className={styles.newForm}>
            <h2>Nuevo reclamo</h2>
            <label className={styles.field}>
              <span>Título</span>
              <input value={newTicket.titulo} onChange={e => setNewTicket({ ...newTicket, titulo: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span>Descripción</span>
              <textarea rows={4} value={newTicket.descripcion} onChange={e => setNewTicket({ ...newTicket, descripcion: e.target.value })} />
            </label>
            <div className={styles.formRow}>
              <label className={styles.field}>
                <span>Prioridad</span>
                <select value={newTicket.prioridad} onChange={e => setNewTicket({ ...newTicket, prioridad: e.target.value })}>
                  {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Categoría</span>
                <select value={newTicket.categoria} onChange={e => setNewTicket({ ...newTicket, categoria: e.target.value })}>
                  {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </div>
            <label className={styles.field}>
              <span>Teléfono de contacto (opcional — para poder responderle por WhatsApp)</span>
              <input value={newTicket.contactId} onChange={e => setNewTicket({ ...newTicket, contactId: e.target.value })} placeholder="5491100000001" />
            </label>
            <label className={styles.field}>
              <span>Imagen (opcional)</span>
              <input type="file" accept="image/*" onChange={handleImageSelect} disabled={uploadingImage} />
              {newImage && <span className={styles.imageOk}>✓ Imagen subida</span>}
            </label>
            <div className={styles.formActions}>
              <button onClick={() => { setShowNew(false); setNewImage(null); setNewTicket(EMPTY_RECLAMO); }} disabled={saving}>Cancelar</button>
              <button className={styles.primaryBtn} onClick={createTicket} disabled={saving || uploadingImage}>{saving ? 'Creando...' : 'Crear reclamo'}</button>
            </div>
          </div>
        ) : !selected ? (
          <p className={styles.empty}>Seleccioná un reclamo de la lista.</p>
        ) : (
          <div className={styles.ticketDetail}>
            <div className={styles.detailTitleRow}>
              {selected.numero && <span className={styles.detailNumero}>{selected.numero}</span>}
              <h2 className={styles.detailTitle}>{selected.titulo}</h2>
            </div>
            {selected.notificationStatus === 'failed' && (
              <div className={styles.notifyWarning}>⚠️ Falló el envío de la última respuesta por WhatsApp. Revisá los logs del servidor o probá de nuevo.</div>
            )}
            {selected.notificationStatus === 'sent' && selected.estado === 'resuelto' && (
              <div className={styles.notifyOk}>✓ Pasajero notificado por WhatsApp.</div>
            )}
            <p className={styles.detailDesc}>{selected.descripcion}</p>

            <div className={styles.detailRow}>
              <label>
                <span>Estado</span>
                <select value={selected.estado} onChange={e => updateSelected({ estado: e.target.value })}>
                  {ESTADOS.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label>
                <span>Prioridad</span>
                <select value={selected.prioridad} onChange={e => updateSelected({ prioridad: e.target.value })}>
                  {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label>
                <span>Categoría</span>
                <select value={selected.categoria ?? 'otro'} onChange={e => updateSelected({ categoria: e.target.value })}>
                  {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </div>

            <div className={styles.detailRow}>
              <label className={styles.field}>
                <span>Legajo del chofer</span>
                <input
                  key={`legajo-${selected.id}`}
                  defaultValue={selected.legajoChofer ?? ''}
                  placeholder="Ej: 4521"
                  onBlur={e => { if (e.target.value !== (selected.legajoChofer ?? '')) updateSelected({ legajoChofer: e.target.value.trim() }); }}
                />
              </label>
              <label className={styles.field}>
                <span>N° interno de la unidad</span>
                <input
                  key={`unidad-${selected.id}`}
                  defaultValue={selected.numeroUnidad ?? ''}
                  placeholder="Ej: 108"
                  onBlur={e => { if (e.target.value !== (selected.numeroUnidad ?? '')) updateSelected({ numeroUnidad: e.target.value.trim() }); }}
                />
              </label>
            </div>
            <p className={styles.respondHint}>Legajo y unidad quedan disponibles para armar estadísticas por chofer/unidad en Estadísticas más adelante.</p>

            <p className={styles.detailMeta}><strong>Creado por:</strong> {selected.createdBy === 'bot' ? '🤖 Bot' : selected.createdBy}</p>
            <p className={styles.detailMeta}><strong>Asignado a:</strong> {selected.assignedTo ?? 'Sin asignar'}</p>
            {selected.contactId && (
              <p className={styles.detailMeta}>
                <strong>Contacto:</strong> {selected.contactId}{' '}
                <a href={`#/conversations?contact=${selected.contactId}`} className={styles.convLink}>Ver conversación →</a>
              </p>
            )}

            {selected.imagenes?.length > 0 && (
              <div className={styles.imageGrid}>
                {selected.imagenes.map((img, i) => <TicketImage key={i} mediaId={img.mediaId} />)}
              </div>
            )}

            {(selected.respuestas ?? []).length > 0 && (
              <div className={styles.comments}>
                <h3>Respuestas enviadas al pasajero</h3>
                {selected.respuestas.map((r, i) => (
                  <div key={i} className={styles.respuestaItem}>
                    <span className={styles.commentAuthor}>{r.autor}</span>
                    <p className={styles.commentText}>{r.texto}</p>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.respond}>
              <h3>Responder al pasajero</h3>
              {selected.contactId ? (
                <>
                  <p className={styles.respondHint}>Se manda como WhatsApp de texto directo al pasajero y marca el reclamo como resuelto.</p>
                  <div className={styles.commentForm}>
                    <textarea rows={3} value={responseText} onChange={e => setResponseText(e.target.value)} placeholder="Escribí la respuesta que recibe el pasajero..." />
                    <button className={styles.primaryBtn} onClick={sendResponse} disabled={savingResponse || !responseText.trim()}>{savingResponse ? 'Enviando...' : 'Enviar y resolver'}</button>
                  </div>
                </>
              ) : (
                <p className={styles.respondHint}>Este reclamo no tiene un contacto de WhatsApp asociado — no se le puede responder directamente.</p>
              )}
            </div>

            <div className={styles.comments}>
              <h3>Notas internas</h3>
              {(selected.comentarios ?? []).map((c, i) => (
                <div key={i} className={styles.commentItem}>
                  <span className={styles.commentAuthor}>{c.autor}</span>
                  <p className={styles.commentText}>{c.texto}</p>
                </div>
              ))}
              <div className={styles.commentForm}>
                <textarea rows={2} value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Nota interna (no la ve el pasajero)..." />
                <button onClick={addComment} disabled={savingComment || !commentText.trim()}>{savingComment ? '...' : 'Comentar'}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
