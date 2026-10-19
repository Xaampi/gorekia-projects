import * as D from './dates.js';

export const RANGES = {
  '7D': { n: 7, unit: 'day' },
  '1M': { n: 30, unit: 'day' },
  '3M': { n: 13, unit: 'week' },
  '6M': { n: 26, unit: 'week' },
  '1A': { n: 12, unit: 'month' },
};

// Agrupa las sesiones en cubos diarios, semanales (lunes a domingo) o mensuales.
// `buckets` son los totales (para las cifras de cabecera) y `lines` una serie por proyecto.
export function buildSeries(rangeKey, sessions, projects) {
  const { n, unit } = RANGES[rangeKey];
  const today = D.startOfDay(new Date());
  const buckets = [];
  const empty = (start, end) => ({ start, end, hours: 0, count: 0, projects: new Set() });

  if (unit === 'day') {
    for (let i = n - 1; i >= 0; i--) { const d = D.addDays(today, -i); buckets.push(empty(d, d)); }
  } else if (unit === 'month') {
    for (let i = n - 1; i >= 0; i--) {
      const s = new Date(today.getFullYear(), today.getMonth() - i, 1);
      buckets.push(empty(s, new Date(s.getFullYear(), s.getMonth() + 1, 0)));
    }
  } else {
    const monday = D.mondayOf(today);
    for (let i = n - 1; i >= 0; i--) { const s = D.addDays(monday, -7 * i); buckets.push(empty(s, D.addDays(s, 6))); }
  }

  const lines = projects.map(p => ({ id: p.id, color: p.color, values: new Array(n).fill(0) }));
  const lineById = new Map(lines.map(l => [l.id, l]));

  const first = buckets[0].start;
  const from = D.toKey(first);
  const to = D.toKey(buckets[n - 1].end);

  for (const s of sessions) {
    if (s.date < from || s.date > to) continue;
    const day = D.fromKey(s.date);
    const diff = Math.round((day - first) / 864e5);
    const i = unit === 'day' ? diff
      : unit === 'month' ? (day.getFullYear() - first.getFullYear()) * 12 + day.getMonth() - first.getMonth()
      : Math.floor(diff / 7);
    const b = buckets[i];
    if (!b) continue;
    b.hours += s.hours;
    b.count++;
    b.projects.add(s.projectId);
    const l = lineById.get(s.projectId);
    if (l) l.values[i] += s.hours;
  }
  return { buckets, lines, from, to };
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

export function renderChart(host, { buckets, lines }, rangeKey, sel, onSelect) {
  host.textContent = '';
  const W = Math.max(host.clientWidth, 280), H = 220;
  const L = rangeKey === '1A' ? 18 : 8, R = 46, T = 14, B = 26;
  const iw = W - L - R, ih = H - T - B, n = buckets.length;
  const max = niceMax(Math.max(0.5, ...lines.flatMap(l => l.values)));
  const x = i => L + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = v => T + ih - (v / max) * ih;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': 'Horas dedicadas por periodo y proyecto',
  }, host);

  // Relleno degradado por proyecto: el color en la línea y casi transparente en la base.
  const defs = el('defs', {}, svg);
  lines.forEach((l, k) => {
    const g = el('linearGradient', { id: `area-${k}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', 'stop-color': l.color, 'stop-opacity': 0.3 }, g);
    el('stop', { offset: '100%', 'stop-color': l.color, 'stop-opacity': 0.02 }, g);
  });

  [0, 0.5, 1].forEach(f => {
    const v = max * f;
    el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }, svg);
    el('text', { x: W - R + 8, y: y(v) + 4, class: 'ylab' }, svg).textContent = `${fmtNum(v)}h`;
  });

  const paths = lines.map(l => l.values.map((v, i) => [x(i), y(v)]));
  const toPath = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');

  lines.forEach((l, k) => {
    if (!Math.max(...l.values)) return;
    el('path', {
      d: `${toPath(paths[k])}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`,
      class: 'area', style: `fill:url(#area-${k})`,
    }, svg);
  });
  lines.forEach((l, k) => el('path', { d: toPath(paths[k]), class: 'line', style: `stroke:${l.color}` }, svg));
  if (n <= 26) {
    const r = n <= 14 ? 4 : 3.2;
    lines.forEach((l, k) => paths[k].forEach(p =>
      el('circle', { cx: p[0], cy: p[1], r, class: 'pt', style: `stroke:${l.color}` }, svg)));
  }

  // Etiquetas del eje X: si dos chocan, el primer cubo cede su sitio (suele ser un mes a medias).
  const monthly = rangeKey === '1A';
  const minGap = monthly ? 26 : 38;
  const labels = [];
  buckets.forEach((b, i) => {
    let txt = null;
    if (rangeKey === '7D') txt = D.DIA[b.start.getDay()];
    else if (monthly) txt = D.mes(b.start);
    else if (rangeKey === '1M') { if ((n - 1 - i) % 7 === 0) txt = D.fmtShort(b.start); }
    else if (i === 0 || b.start.getMonth() !== buckets[i - 1].start.getMonth()) txt = D.mes(b.start);
    if (!txt) return;
    const last = labels[labels.length - 1];
    if (last && x(i) - x(last.i) < minGap) {
      if (last.i === 0 && rangeKey !== '7D') labels.pop(); else return;
    }
    labels.push({ i, txt });
  });
  labels.forEach(({ i, txt }) =>
    el('text', { x: x(i), y: H - 6, class: i === 0 && !monthly ? 'xlab first' : 'xlab' }, svg).textContent = txt);

  const cursor = el('line', { y1: T - 6, y2: y(0), class: 'cursor' }, svg);
  const dots = lines.map(l => el('circle', { r: 5.5, class: 'dot-sel', style: `fill:${l.color}` }, svg));
  let current = -1;

  function setSel(i, notify) {
    if (i === current) return;
    current = i;
    cursor.setAttribute('x1', x(i));
    cursor.setAttribute('x2', x(i));
    dots.forEach((d, k) => { d.setAttribute('cx', x(i)); d.setAttribute('cy', y(lines[k].values[i])); });
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
