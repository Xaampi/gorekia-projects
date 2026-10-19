import { addDays, startOfDay, toKey } from './dates.js';

// Capa de datos. Hoy persiste en localStorage; para compartir entre Álvaro y tú
// bastará con reemplazar load()/save() por llamadas a una API.
const KEY = 'gorekia-projects:v1';
export const COLORS = ['#5fa8d3', '#7bc47f', '#e0b04f', '#b58bd9', '#4db6ac', '#e58fb0', '#e08a5f', '#9a9a92'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function seed() {
  const projects = [
    { id: 'demo-a', name: 'Vitae REC', color: COLORS[0], demo: true },
    { id: 'demo-b', name: 'Gorekia Sport', color: COLORS[1], demo: true },
    { id: 'demo-c', name: 'Interno Gorekia', color: COLORS[2], demo: true },
  ];
  const titles = ['Desarrollo', 'Reunión con cliente', 'Revisión y pruebas', 'Despliegue', 'Planificación'];
  let s = 7;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const today = startOfDay(new Date());
  const sessions = [];
  for (let i = 0; i <= 210; i++) {
    const d = addDays(today, -i);
    const weekday = (d.getDay() + 6) % 7;
    if ((weekday >= 5 && rnd() < 0.6) || rnd() < 0.25) continue;
    sessions.push({
      id: uid() + i,
      projectId: projects[Math.floor(rnd() * 3)].id,
      title: titles[Math.floor(rnd() * titles.length)],
      summary: 'Sesión de ejemplo.',
      date: toKey(d),
      hours: Math.round((0.5 + rnd() * 3.5) * 4) / 4,
      created: d.getTime(),
      demo: true,
    });
  }
  return { projects, sessions, reminders: [] };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.projects) && Array.isArray(s.sessions)) return { reminders: [], ...s };
  } catch { /* sin storage o datos corruptos */ }
  return seed();
}

let state = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* modo privado */ } };
save();

export const projects = () => state.projects;
export const project = id => state.projects.find(p => p.id === id);
export function addProject(name, color) {
  const p = { id: uid(), name: name.trim(), color };
  state.projects.push(p);
  save();
  return p;
}

export const sessions = () => state.sessions;
export const session = id => state.sessions.find(s => s.id === id);
export function addSession(data) {
  const x = { ...data, id: uid(), created: Date.now() };
  state.sessions.push(x);
  save();
  return x;
}
export function updateSession(id, patch) {
  const s = session(id);
  if (s) { Object.assign(s, patch); delete s.demo; save(); }
}
export function deleteSession(id) {
  state.sessions = state.sessions.filter(s => s.id !== id);
  save();
}

export const reminders = () => state.reminders;
export function addReminder(text, at) {
  const r = { id: uid(), text: text.trim(), at, done: false, notified: false };
  state.reminders.push(r);
  save();
  return r;
}
export function updateReminder(id, patch) {
  const r = state.reminders.find(x => x.id === id);
  if (r) { Object.assign(r, patch); save(); }
}
export function deleteReminder(id) {
  state.reminders = state.reminders.filter(r => r.id !== id);
  save();
}

export const hasDemo = () => state.projects.some(p => p.demo) || state.sessions.some(s => s.demo);
export function clearDemo() {
  state.sessions = state.sessions.filter(s => !s.demo);
  state.projects = state.projects.filter(p => !p.demo || state.sessions.some(s => s.projectId === p.id));
  state.projects.forEach(p => { delete p.demo; });
  save();
}
