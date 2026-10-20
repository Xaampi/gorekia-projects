import { API_URL } from './config.js';

// Capa de datos. La fuente de verdad es Postgres, a través del webhook de n8n.
// En el móvil se guarda una copia local para abrir al instante y poder ver lo último sin conexión.
// Paleta de proyectos, ordenada por color (sin rojo: ese es el color de Gorekia). Todos los pares
// se distinguen bien entre sí (distancia de color CIE Lab ≥ 18) y sobre el fondo oscuro.
export const COLOR_OPTIONS = [
  { name: 'Naranja', hex: '#ea8a53' }, { name: 'Dorado', hex: '#e3b945' }, { name: 'Amarillo', hex: '#d3dd40' },
  { name: 'Lima', hex: '#8ad04e' }, { name: 'Verde', hex: '#59c567' }, { name: 'Menta', hex: '#5ccc9f' },
  { name: 'Turquesa', hex: '#38c7c2' }, { name: 'Cian', hex: '#47b8e1' }, { name: 'Azul cielo', hex: '#6ca9ef' },
  { name: 'Azul', hex: '#5376ea' }, { name: 'Violeta', hex: '#ac8be4' }, { name: 'Púrpura', hex: '#aa5bc2' },
  { name: 'Magenta', hex: '#dc6ac5' }, { name: 'Rosa', hex: '#f292bb' }, { name: 'Marrón', hex: '#a68468' },
  { name: 'Gris azulado', hex: '#7a8aa0' }, { name: 'Gris', hex: '#9a9a92' },
];
export const COLORS = COLOR_OPTIONS.map(c => c.hex);

const CACHE_KEY = 'gorekia-projects:cache:v2';
const TOKEN_KEY = 'gorekia-projects:token';
const NOTIFIED_KEY = 'gorekia-projects:notified';

export class AuthError extends Error {}

/* ---------- Almacenamiento local (cada operación protegida: puede no haber storage) ---------- */

const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };
const lsDel = k => { try { localStorage.removeItem(k); } catch { /* modo privado */ } };

export const getToken = () => lsGet(TOKEN_KEY) ?? '';
export const hasToken = () => !!lsGet(TOKEN_KEY);
export const setToken = t => lsSet(TOKEN_KEY, t.trim());
export const clearToken = () => lsDel(TOKEN_KEY);

const empty = () => ({ projects: [], sessions: [], reminders: [] });

function loadCache() {
  try {
    const s = JSON.parse(lsGet(CACHE_KEY));
    if (s && Array.isArray(s.projects) && Array.isArray(s.sessions) && Array.isArray(s.reminders)) return s;
  } catch { /* copia corrupta */ }
  return empty();
}

let state = loadCache();
let lastSync = null;
const saveCache = () => lsSet(CACHE_KEY, JSON.stringify(state));

const notified = new Set((() => { try { return JSON.parse(lsGet(NOTIFIED_KEY)) ?? []; } catch { return []; } })());
export const wasNotified = id => notified.has(id);
export function markNotified(id) { notified.add(id); lsSet(NOTIFIED_KEY, JSON.stringify([...notified])); }

/* ---------- API ---------- */

// Las respuestas de n8n pueden llegar como objeto o como lista de un elemento.
const unwrap = r => {
  const x = Array.isArray(r) ? r[0] : r;
  return x && x.result !== undefined && x.projects === undefined ? x.result : x;
};

async function api(action, data = {}) {
  if (!API_URL) throw new Error('API_URL sin configurar');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gorekia-Token': lsGet(TOKEN_KEY) ?? '' },
    body: JSON.stringify({ action, ...data }),
  });
  if (res.status === 401 || res.status === 403) throw new AuthError('Contraseña incorrecta');
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const text = await res.text();
  return text ? unwrap(JSON.parse(text)) : null;
}

const toProject = p => ({ id: p.id, name: p.name, color: p.color });
const toSession = s => ({
  id: s.id,
  projectId: s.project_id,
  title: s.title,
  summary: s.summary ?? '',
  date: String(s.date).slice(0, 10),
  hours: Number(s.hours),
  created: Date.parse(s.created_at) || 0,
});
const toReminder = r => ({ id: r.id, text: r.text, at: r.at, done: !!r.done });

const need = (row, what) => {
  if (!row || !row.id) throw new Error(`No se pudo guardar ${what}`);
  return row;
};

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => fn());
export const lastSyncAt = () => lastSync;

export async function refresh() {
  const all = await api('list_all');
  if (!all || !Array.isArray(all.projects) || !Array.isArray(all.sessions)) throw new Error('Respuesta inesperada de la API');
  state = {
    projects: all.projects.map(toProject),
    sessions: all.sessions.map(toSession),
    reminders: (all.reminders ?? []).map(toReminder),
  };
  lastSync = Date.now();
  saveCache();
  emit();
}

/* ---------- Proyectos ---------- */

export const projects = () => state.projects;
export const project = id => state.projects.find(p => p.id === id);
export async function addProject(name, color) {
  const p = toProject(need(await api('add_project', { name: name.trim(), color }), 'el proyecto'));
  state.projects.push(p);
  saveCache();
  return p;
}

/* ---------- Sesiones ---------- */

export const sessions = () => state.sessions;
export const session = id => state.sessions.find(s => s.id === id);

const sessionBody = d => ({
  project_id: d.projectId, title: d.title, summary: d.summary ?? '', date: d.date, hours: d.hours,
});

export async function addSession(data) {
  const s = toSession(need(await api('add_session', sessionBody(data)), 'la sesión'));
  state.sessions.push(s);
  saveCache();
  return s;
}
export async function updateSession(id, data) {
  const s = toSession(need(await api('update_session', { id, ...sessionBody(data) }), 'la sesión'));
  state.sessions = state.sessions.map(x => (x.id === id ? s : x));
  saveCache();
  return s;
}
export async function deleteSession(id) {
  await api('delete_session', { id });
  state.sessions = state.sessions.filter(s => s.id !== id);
  saveCache();
}

/* ---------- Recordatorios ---------- */

export const reminders = () => state.reminders;
export async function addReminder(text, at) {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) throw new Error('Fecha del recordatorio no válida');
  // La hora se envía en ISO (con zona) para que Postgres no la interprete en otra zona horaria.
  const r = toReminder(need(await api('add_reminder', { text: text.trim(), at: when.toISOString() }), 'el recordatorio'));
  state.reminders.push(r);
  saveCache();
  return r;
}
export async function setReminderDone(id, done) {
  const r = toReminder(need(await api('toggle_reminder', { id, done }), 'el recordatorio'));
  state.reminders = state.reminders.map(x => (x.id === id ? r : x));
  saveCache();
}
export async function deleteReminder(id) {
  await api('delete_reminder', { id });
  state.reminders = state.reminders.filter(r => r.id !== id);
  saveCache();
}
