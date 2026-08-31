import { useEffect, useState } from 'react';
import { authFetch, BASE_URL } from '../lib/api';
import styles from './Tarifario.module.css';

const EMPTY = { servicio: '', tarifa: '', medioPago: '', notas: '', active: true };

export default function Tarifario() {
  const [tarifas, setTarifas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = cerrado, {} = nuevo, {...} = edición
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await authFetch(BASE_URL + '/api/tarifas');
      if (r.ok) setTarifas((await r.json()).tarifas ?? []);
    } finally {
      setLoading(false);
    }
  }

  function startNew() { setEditing({ ...EMPTY }); }
  function startEdit(t) { setEditing({ ...t }); }

  async function save() {
    if (!editing.servicio?.trim() || !editing.tarifa?.trim()) return;
    setSaving(true);
    try {
      const body = { servicio: editing.servicio.trim(), tarifa: editing.tarifa.trim(), medioPago: editing.medioPago ?? '', notas: editing.notas ?? '', active: editing.active ?? true };
      const url = editing.id ? `${BASE_URL}/api/tarifas/${editing.id}` : `${BASE_URL}/api/tarifas`;
      const r = await authFetch(url, { method: editing.id ? 'PUT' : 'POST', body });
      if (r.ok) {
        setEditing(null);
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm('¿Borrar esta tarifa del cuadro?')) return;
    const r = await authFetch(`${BASE_URL}/api/tarifas/${id}`, { method: 'DELETE' });
    if (r.ok) load();
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Cuadro tarifario</h1>
        <button className={styles.newBtn} onClick={startNew}>+ Nueva tarifa</button>
      </div>
      <p className={styles.subtitle}>Esto es lo que el bot usa como única fuente de verdad para precios — se lo pasa a cada respuesta, no lo inventa.</p>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : tarifas.length === 0 ? (
        <p className={styles.empty}>No hay tarifas cargadas todavía.</p>
      ) : (
        <div className={styles.table}>
          <div className={`${styles.row} ${styles.rowHead}`}>
            <span>Servicio</span>
            <span>Tarifa</span>
            <span>Medio de pago</span>
            <span>Notas</span>
            <span />
          </div>
          {tarifas.map(t => (
            <div key={t.id} className={`${styles.row} ${!t.active ? styles.inactive : ''}`}>
              <span className={styles.servicio}>{t.servicio}</span>
              <span className={styles.tarifa}>{t.tarifa}</span>
              <span>{t.medioPago}</span>
              <span>{t.notas}</span>
              <span className={styles.rowActions}>
                <button className={styles.iconBtn} onClick={() => startEdit(t)}>Editar</button>
                <button className={styles.iconBtn} onClick={() => remove(t.id)}>Borrar</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className={styles.form}>
          <h2>{editing.id ? 'Editar tarifa' : 'Nueva tarifa'}</h2>
          <div className={styles.formRow}>
            <label className={styles.field}>
              <span>Servicio</span>
              <input value={editing.servicio} onChange={e => setEditing({ ...editing, servicio: e.target.value })} placeholder="Ej: Línea 999 Diferencial" />
            </label>
            <label className={styles.field}>
              <span>Tarifa</span>
              <input value={editing.tarifa} onChange={e => setEditing({ ...editing, tarifa: e.target.value })} placeholder="Ej: $1200" />
            </label>
          </div>
          <label className={styles.field}>
            <span>Medio de pago</span>
            <input value={editing.medioPago} onChange={e => setEditing({ ...editing, medioPago: e.target.value })} placeholder="Ej: SUBE" />
          </label>
          <label className={styles.field}>
            <span>Notas (opcional)</span>
            <textarea rows={2} value={editing.notas} onChange={e => setEditing({ ...editing, notas: e.target.value })} />
          </label>
          <label className={`${styles.field} ${styles.checkboxField}`}>
            <input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} />
            <span>Activa (visible para el bot)</span>
          </label>
          <div className={styles.formActions}>
            <button onClick={() => setEditing(null)} disabled={saving}>Cancelar</button>
            <button className={styles.primaryBtn} onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
