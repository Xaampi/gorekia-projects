import * as store from './store.js';
import * as D from './dates.js';
import { buildSeries, renderChart } from './chart.js';
import { VOICE_WEBHOOK_URL } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TITLES = { progress: 'Progreso', activities: 'Sesiones', add: 'Añadir' };
const ui = { view: 'progress', range: '3M', filter: null, sel: null, series: null, limit: 60, lastProject: null };

const passes = s => !ui.filter || ui.filter.has(s.projectId);
const projectName = id => store.project(id)?.name ?? 'Proyecto eliminado';
const projectColor = id => store.project(id)?.color ?? '#999';

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

// Ejecuta una operación que escribe en la API. Devuelve true si salió bien; si no, avisa y devuelve false.
async function act(fn, failMsg = 'No se ha podido guardar. Revisa la conexión') {
  try { await fn(); return true; } catch (e) {
    if (e instanceof store.AuthError) { await askToken('Contraseña incorrecta'); toast('Vuelve a intentarlo'); }
    else toast(failMsg);
    return false;
  }
}

/* ---------- Acceso (contraseña compartida) ---------- */

function askToken(error) {
  const dlg = $('#token-dialog');
  const form = $('#token-form');
  $('#token-error').hidden = !error;
  $('#token-error').textContent = error ?? '';
  form.reset();
  if (!dlg.open) dlg.showModal();
  return new Promise(resolve => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = form.elements.token.value.trim();
      if (!v) return;
      store.setToken(v);
      dlg.close();
      resolve();
    }, { once: true });
  });
}
$('#token-dialog').addEventListener('cancel', e => e.preventDefault());

// Descarga los datos de la API. Si falla por red, se queda con la copia local.
let syncing = false;
async function sync(silent = true) {
  if (syncing) return;
  syncing = true;
  try {
    await store.refresh();
    render();
  } catch (e) {
    if (e instanceof store.AuthError) {
      store.clearToken();
      syncing = false;
      await askToken('Contraseña incorrecta');
      return sync(silent);
    }
    if (!silent) toast('Sin conexión: se muestran los últimos datos guardados');
  } finally {
    syncing = false;
  }
}

/* ---------- Navegación ---------- */

function setView(v) {
  ui.view = v;
  document.body.dataset.view = v;
  $('#title').textContent = TITLES[v];
  $$('.view').forEach(s => { s.hidden = s.id !== `view-${v}`; });
  $$('.nav button').forEach(b => {
    if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  render();
}

function render() {
  renderFilterBtn();
  $$('#ranges .pill').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.range === ui.range)));
  if (ui.view === 'progress') {
    renderProgress();
  } else if (ui.view === 'activities') renderActivities();
  else renderAdd();
}

/* ---------- Filtro de proyectos ---------- */

function renderFilterBtn() {
  let label = 'Todos los proyectos';
  if (ui.filter?.size === 1) label = projectName([...ui.filter][0]);
  else if (ui.filter) label = `${ui.filter.size} proyectos`;
  $('#filter-label').textContent = label;
}

function renderFilterDialog() {
  const ps = store.projects();
  if (!ps.length) { $('#filter-list').innerHTML = '<p class="muted">Aún no hay proyectos.</p>'; return; }
  const all = !ui.filter;
  $('#filter-list').innerHTML =
    `<label class="check"><input type="checkbox" data-all ${all ? 'checked' : ''}><b>Todos</b></label>` +
    ps.map(p => `<label class="check"><input type="checkbox" value="${esc(p.id)}" ${all || ui.filter.has(p.id) ? 'checked' : ''}>
      <span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</label>`).join('');
}

$('#filter-btn').addEventListener('click', () => { renderFilterDialog(); $('#filter-dialog').showModal(); });
$('#filter-list').addEventListener('change', e => {
  const t = e.target;
  const ps = store.projects();
  if (t.matches('[data-all]')) ui.filter = null;
  else {
    const cur = new Set(ui.filter ?? ps.map(p => p.id));
    if (t.checked) cur.add(t.value); else cur.delete(t.value);
    ui.filter = cur.size === 0 || cur.size === ps.length ? null : cur;
  }
  ui.sel = null;
  ui.limit = 60;
  renderFilterDialog();
  render();
});

/* ---------- Pantalla 1: progreso ---------- */

function renderProgress() {
  const sessions = store.sessions().filter(passes);
  const scope = store.projects().filter(p => !ui.filter || ui.filter.has(p.id));
  const built = buildSeries(ui.range, sessions, scope);
  // Todos los proyectos: una sola línea con la suma, en el rojo de Gorekia.
  // Filtro por proyecto(s): una línea por proyecto, cada una con su color.
  const showingAll = scope.length === store.projects().length;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#cc4a41';
  const data = showingAll
    ? { ...built, lines: [{ id: 'total', color: accent, values: built.buckets.map(b => b.hours) }] }
    : built;
  const { buckets, from, to } = data;
  ui.series = buckets;
  ui.byProject = built.lines.map(l => ({ p: scope.find(p => p.id === l.id), values: l.values }));
  if (ui.sel == null || ui.sel >= buckets.length) ui.sel = buckets.length - 1;
  renderChart($('#chart'), data, ui.range, ui.sel, i => { ui.sel = i; updateHeader(); });
  updateHeader();

  const rows = scope.map(p => {
    const mine = store.sessions().filter(s => s.projectId === p.id);
    return {
      p,
      period: mine.filter(s => s.date >= from && s.date <= to).reduce((a, s) => a + s.hours, 0),
      total: mine.reduce((a, s) => a + s.hours, 0),
    };
  }).sort((a, b) => b.period - a.period || b.total - a.total);

  $('#project-totals').innerHTML = rows.length
    ? rows.map(r => `<li><span class="dot" style="background:${esc(r.p.color)}"></span>
        <div class="grow"><div>${esc(r.p.name)}</div><div class="sub">Total acumulado ${D.fmtHours(r.total)}</div></div>
        <div class="num">${D.fmtHours(r.period)}</div></li>`).join('')
    : '<li class="muted">Crea un proyecto en la pantalla Añadir.</li>';
}

function updateHeader() {
  const b = ui.series[ui.sel];
  $('#period-label').textContent = ui.range === '1A' ? D.fmtMonth(b.start) : D.fmtRange(b.start, b.end);
  $('#st-hours').textContent = D.fmtHours(b.hours);
  $('#st-count').textContent = b.count;
  $('#st-projects').textContent = b.projects.size;

  // Desglose de horas por proyecto en el periodo seleccionado.
  const parts = ui.byProject
    .map(r => ({ p: r.p, h: r.values[ui.sel] }))
    .filter(r => r.p && r.h > 0)
    .sort((a, c) => c.h - a.h);
  $('#period-breakdown').innerHTML = parts.length
    ? parts.map(r => `<li><span class="dot" style="background:${esc(r.p.color)}"></span>
        <div class="grow">${esc(r.p.name)}</div><div class="num">${D.fmtHours(r.h)}</div></li>`).join('')
    : '<li class="muted">Sin horas en este periodo.</li>';
}

$('#ranges').addEventListener('click', e => {
  const b = e.target.closest('[data-range]');
  if (!b) return;
  ui.range = b.dataset.range;
  ui.sel = null;
  render();
  // Solo al elegir un rango a mano: así el filtro no queda tapado al abrir la app.
  $('#ranges .pill[aria-pressed="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (ui.view === 'progress') renderProgress(); }, 150);
});

/* ---------- Pantalla 2: actividades ---------- */

function renderActivities() {
  const list = store.sessions().filter(passes)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created ?? 0) - (a.created ?? 0));
  if (!list.length) {
    $('#activity-list').innerHTML = '<p class="empty">Sin sesiones todavía.<br>Añade la primera desde la pestaña Añadir.</p>';
    $('#more-btn').hidden = true;
    return;
  }
  let html = '', lastDay = '';
  for (const s of list.slice(0, ui.limit)) {
    if (s.date !== lastDay) { lastDay = s.date; html += `<div class="day">${D.fmtDay(D.fromKey(s.date))}</div>`; }
    html += `<article class="act" data-id="${esc(s.id)}">
      <span class="dot" style="background:${esc(projectColor(s.projectId))}"></span>
      <div class="act-main">
        <div class="act-title">${esc(s.title)}</div>
        <div class="act-meta">${esc(projectName(s.projectId))}</div>
        ${s.summary ? `<p class="act-sum">${esc(s.summary)}</p>` : ''}
      </div>
      <div class="act-hours">${D.fmtHours(s.hours)}</div></article>`;
  }
  $('#activity-list').innerHTML = html;
  $('#more-btn').hidden = list.length <= ui.limit;
}

$('#activity-list').addEventListener('click', e => {
  const a = e.target.closest('.act');
  if (a) startEdit(a.dataset.id);
});
$('#more-btn').addEventListener('click', () => { ui.limit += 60; renderActivities(); });

/* ---------- Pantalla 3: añadir ---------- */

function renderAdd() {
  fillProjectSelect();
  renderReminders();
  if (!$('#session-form').elements.date.value) resetSessionForm();
}

function fillProjectSelect(selected) {
  const sel = $('#session-form').elements.project;
  const ps = store.projects();
  const keep = selected ?? sel.value ?? ui.lastProject;
  sel.innerHTML = ps.length
    ? ps.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')
    : '<option value="">Crea un proyecto primero</option>';
  sel.value = ps.some(p => p.id === keep) ? keep : (ps[0]?.id ?? '');
}

function resetSessionForm() {
  const f = $('#session-form');
  f.reset();
  f.elements.sid.value = '';
  f.elements.date.value = D.toKey(new Date());
  fillProjectSelect(ui.lastProject);
  $('#session-form-title').textContent = 'Nueva sesión';
  $('#session-cancel').hidden = true;
  $('#session-delete').hidden = true;
}

function startEdit(id) {
  const s = store.session(id);
  if (!s) return;
  setView('add');
  const f = $('#session-form');
  fillProjectSelect(s.projectId);
  f.elements.sid.value = s.id;
  f.elements.title.value = s.title;
  f.elements.summary.value = s.summary ?? '';
  f.elements.date.value = s.date;
  f.elements.hours.value = s.hours;
  $('#session-form-title').textContent = 'Editar sesión';
  $('#session-cancel').hidden = false;
  $('#session-delete').hidden = false;
}

$('#session-form').addEventListener('submit', async e => {
  e.preventDefault();
  const el = e.target.elements;
  if (!el.project.value) return toast('Crea un proyecto primero');
  const data = {
    projectId: el.project.value,
    title: el.title.value.trim(),
    summary: el.summary.value.trim(),
    date: el.date.value,
    hours: parseFloat(el.hours.value),
  };
  if (!(data.hours > 0)) return toast('Indica las horas');
  const btn = e.submitter;
  if (btn) btn.disabled = true;
  const ok = await act(() => (el.sid.value ? store.updateSession(el.sid.value, data) : store.addSession(data)));
  if (btn) btn.disabled = false;
  if (!ok) return;
  ui.lastProject = data.projectId;
  ui.sel = null;
  toast(`Sesión guardada · ${D.fmtHours(data.hours)}`);
  resetSessionForm();
  setView('activities');
});

$('#session-cancel').addEventListener('click', () => { resetSessionForm(); setView('activities'); });
$('#session-delete').addEventListener('click', async () => {
  const id = $('#session-form').elements.sid.value;
  if (!id || !confirm('¿Eliminar esta sesión?')) return;
  if (!await act(() => store.deleteSession(id), 'No se ha podido eliminar. Revisa la conexión')) return;
  ui.sel = null;
  resetSessionForm();
  toast('Sesión eliminada');
  setView('activities');
});

$('#quick-hours').addEventListener('click', e => {
  const b = e.target.closest('[data-h]');
  if (b) $('#session-form').elements.hours.value = b.dataset.h;
});

$('#color-swatches').innerHTML = store.COLOR_OPTIONS.map((c, i) =>
  `<label class="swatch" style="--c:${c.hex}" title="${esc(c.name)}"><input type="radio" name="color" value="${c.hex}" aria-label="${esc(c.name)}" ${i === 0 ? 'checked' : ''}><span></span></label>`).join('');

$('#project-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const el = form.elements;
  const btn = e.submitter;
  if (btn) btn.disabled = true;
  let p;
  const ok = await act(async () => { p = await store.addProject(el.name.value, el.color.value); });
  if (btn) btn.disabled = false;
  if (!ok) return;
  ui.lastProject = p.id;
  form.reset();
  fillProjectSelect(p.id);
  toast(`Proyecto «${p.name}» creado`);
});

/* ---------- Recordatorios ---------- */

function renderReminders() {
  const rs = [...store.reminders()].sort((a, b) => a.at.localeCompare(b.at));
  $('#reminder-list').innerHTML = rs.length
    ? rs.map(r => `<li class="rem ${r.done ? 'done' : ''}" data-id="${esc(r.id)}">
        <label><input type="checkbox" ${r.done ? 'checked' : ''}><span>${esc(r.text)}</span></label>
        <time>${D.fmtAt(r.at)}</time><button class="x" type="button" aria-label="Eliminar">×</button></li>`).join('')
    : '<li class="muted">Sin recordatorios</li>';
}

$('#reminder-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const el = form.elements;
  const btn = e.submitter;
  if (btn) btn.disabled = true;
  const ok = await act(() => store.addReminder(el.text.value, el.at.value));
  if (btn) btn.disabled = false;
  if (!ok) return;
  form.reset();
  renderReminders();
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
});

$('#reminder-list').addEventListener('click', async e => {
  const li = e.target.closest('.rem');
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.matches('input[type="checkbox"]')) await act(() => store.setReminderDone(id, e.target.checked));
  else if (e.target.matches('.x')) await act(() => store.deleteReminder(id));
  else return;
  renderReminders();
});

async function notify(text) {
  toast(`⏰ ${text}`);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification('Gorekia Projects', { body: text, icon: 'assets/icon-192.png' });
  } catch { /* sin service worker */ }
}

function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const r of store.reminders()) {
    if (!r.done && !store.wasNotified(r.id) && new Date(r.at).getTime() <= now) {
      store.markNotified(r.id);
      notify(r.text);
      changed = true;
    }
  }
  if (changed && ui.view === 'add') renderReminders();
}
setInterval(checkReminders, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });

/* ---------- Agente de voz ---------- */

const say = msg => toast(msg);

function findProject(ref) {
  if (!ref) return null;
  const q = String(ref).toLowerCase();
  const ps = store.projects();
  return ps.find(p => p.id === ref) || ps.find(p => p.name.toLowerCase() === q) || ps.find(p => p.name.toLowerCase().includes(q));
}

// El webhook solo clasifica la intención; la app ejecuta la acción.
async function applyIntent(out) {
  const d = out?.data ?? {};
  switch (out?.intent) {
    case 'create_session': {
      const p = findProject(d.project);
      const hours = parseFloat(d.hours);
      if (!p) return say('No encuentro ese proyecto');
      if (!(hours > 0)) return say('Faltan las horas');
      if (!await act(() => store.addSession({
        projectId: p.id, title: d.title || 'Sesión', summary: d.summary || '',
        date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : D.toKey(new Date()), hours,
      }))) return;
      say(out.reply || 'Sesión creada');
      break;
    }
    case 'create_project':
      if (!d.name) return say('Falta el nombre del proyecto');
      if (!await act(() => store.addProject(d.name, store.COLORS[store.projects().length % store.COLORS.length]))) return;
      say(out.reply || 'Proyecto creado');
      break;
    case 'create_reminder':
      if (!d.text || !d.at) return say('Faltan el texto o la hora');
      if (!await act(() => store.addReminder(d.text, d.at))) return;
      say(out.reply || 'Recordatorio creado');
      break;
    default:
      return say(out?.reply || 'No he entendido la orden');
  }
  ui.sel = null;
  render();
}

async function sendToAgent(text) {
  if (!VOICE_WEBHOOK_URL) return say(`Te he oído: «${text}». Agente sin conectar todavía.`);
  try {
    const context = { today: D.toKey(new Date()), projects: store.projects().map(p => ({ id: p.id, name: p.name })) };
    const res = await fetch(VOICE_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gorekia-Token': store.getToken() }, body: JSON.stringify({ text, context }),
    });
    if (!res.ok) throw new Error(res.status);
    const out = await res.json();
    await applyIntent(Array.isArray(out) ? out[0] : out);
  } catch {
    say('No he podido contactar con el agente');
  }
}

// La bola se mueve de forma orgánica mientras escucha y mientras el agente piensa.
const orbBusy = on => $$('.orb').forEach(o => o.classList.toggle('thinking', on));
let activeRec = null;
let processing = false;

// Un toque empieza a escuchar; otro toque deja de escuchar y procesa lo que se haya dicho.
function startVoice() {
  if (processing) return;
  if (activeRec) { toast('Procesando…'); activeRec.stop(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    say('Este navegador no permite dictado por voz');
    orbBusy(true);
    setTimeout(() => orbBusy(false), 1800);
    return;
  }
  const rec = new SR();
  rec.lang = 'es-ES';
  rec.interimResults = false;
  activeRec = rec;
  let heard = false;
  orbBusy(true);
  toast('Escuchando… toca la bola para parar');
  rec.onresult = e => {
    heard = true;
    processing = true;
    sendToAgent(e.results[0][0].transcript).finally(() => { processing = false; orbBusy(false); });
  };
  rec.onerror = e => { if (e.error === 'no-speech') say('No he oído nada'); else if (e.error !== 'aborted') say('No he podido escucharte'); };
  rec.onend = () => { activeRec = null; if (!heard) orbBusy(false); };
  rec.start();
}

$$('.orb').forEach(o => o.addEventListener('click', startVoice));

/* ---------- Arranque ---------- */

$$('.nav button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
setView('progress');
(async () => {
  if (!store.hasToken()) await askToken();
  await sync(false);
  checkReminders();
})();
// Al volver a la app, trae lo que haya añadido la otra persona.
document.addEventListener('visibilitychange', () => { if (!document.hidden && store.hasToken()) sync(true); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
