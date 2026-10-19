import * as D from './dates.js';

export const RANGES = {
  '7D': { n: 7, unit: 'day' },
  '1M': { n: 30, unit: 'day' },
  '3M': { n: 13, unit: 'week' },
  '6M': { n: 26, unit: 'week' },
  '1A': { n: 52, unit: 'week' },
};

// Agrupa las sesiones en cubos diarios o semanales (semana de lunes a domingo).
export function buildSeries(rangeKey, sessions) {
  const { n, unit } = RANGES[rangeKey];
  const today = D.startOfDay(new Date());
  const buckets = [];
  const empty = (start, end) => ({ start, end, hours: 0, count: 0, projects: new Set() });

  if (unit === 'day') {
    for (let i = n - 1; i >= 0; i--) { const d = D.addDays(today, -i); buckets.push(empty(d, d)); }
  } else {
    const monday = D.mondayOf(today);
    for (let i = n - 1; i >= 0; i--) { const s = D.addDays(monday, -7 * i); buckets.push(empty(s, D.addDays(s, 6))); }
  }

  const first = buckets[0].start;
  const from = D.toKey(first);
  const to = D.toKey(buckets[n - 1].end);

  for (const s of sessions) {
    if (s.date < from || s.date > to) continue;
    const diff = Math.round((D.fromKey(s.date) - first) / 864e5);
    const b = buckets[unit === 'day' ? diff : Math.floor(diff / 7)];
    if (!b) continue;
    b.hours += s.hours;
    b.count++;
    b.projects.add(s.projectId);
  }
  return { buckets, from, to };
}

const NS = 'http://www.w3.org/2000/svg';
function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function niceMax(v) {
  const steps = [2, 4, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 80, 100, 120, 160, 200];
  return steps.find(s => s >= v * 1.05) ?? Math.ceil(v / 50) * 50;
}
const fmtNum = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export function renderChart(host, buckets, rangeKey, sel, onSelect) {
  host.textContent = '';
  const W = Math.max(host.clientWidth, 280), H = 220;
  const L = 8, R = 46, T = 14, B = 26;
  const iw = W - L - R, ih = H - T - B, n = buckets.length;
  const max = niceMax(Math.max(0.5, ...buckets.map(b => b.hours)));
  const x = i => L + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = v => T + ih - (v / max) * ih;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': 'Horas dedicadas por periodo',
  }, host);

  [0, 0.5, 1].forEach(f => {
    const v = max * f;
    el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }, svg);
    el('text', { x: W - R + 8, y: y(v) + 4, class: 'ylab' }, svg).textContent = `${fmtNum(v)}h`;
  });

  const pts = buckets.map((b, i) => [x(i), y(b.hours)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  el('path', { d: `${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`, class: 'area' }, svg);
  el('path', { d: line, class: 'line' }, svg);
  if (n <= 14) pts.forEach(p => el('circle', { cx: p[0], cy: p[1], r: 4.5, class: 'pt' }, svg));

  let lastX = -99;
  buckets.forEach((b, i) => {
    let txt = null;
    if (rangeKey === '7D') txt = D.DIA[b.start.getDay()];
    else if (rangeKey === '1M') { if ((n - 1 - i) % 7 === 0) txt = D.fmtShort(b.start); }
    else if (i === 0 || b.start.getMonth() !== buckets[i - 1].start.getMonth()) txt = D.mes(b.start);
    if (txt && x(i) - lastX >= 38) {
      lastX = x(i);
      el('text', { x: x(i), y: H - 6, class: i === 0 ? 'xlab first' : 'xlab' }, svg).textContent = txt;
    }
  });

  const halo = el('circle', { r: 12, class: 'halo' }, svg);
  const cursor = el('line', { y1: T - 6, y2: y(0), class: 'cursor' }, svg);
  const dot = el('circle', { r: 6, class: 'dot-sel' }, svg);
  let current = -1;

  function setSel(i, notify) {
    if (i === current) return;
    current = i;
    cursor.setAttribute('x1', x(i));
    cursor.setAttribute('x2', x(i));
    [halo, dot].forEach(c => { c.setAttribute('cx', x(i)); c.setAttribute('cy', y(buckets[i].hours)); });
    if (notify) onSelect(i);
  }

  const pick = e => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width);
    setSel(Math.max(0, Math.min(n - 1, Math.round(((px - L) / iw) * (n - 1)))), true);
  };
  let down = false;
  svg.addEventListener('pointerdown', e => { down = true; svg.setPointerCapture(e.pointerId); pick(e); });
  svg.addEventListener('pointermove', e => { if (down || e.pointerType === 'mouse') pick(e); });
  svg.addEventListener('pointerup', () => { down = false; });
  svg.addEventListener('pointercancel', () => { down = false; });

  setSel(sel, false);
}
