const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const pad = n => String(n).padStart(2, '0');

export const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const mondayOf = d => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

export const mes = d => MES[d.getMonth()];
export const fmtShort = d => `${d.getDate()} ${MES[d.getMonth()]}`;
export const fmtDay = d => `${DIA[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
export const fmtRange = (a, b) =>
  a.getTime() === b.getTime() ? fmtDay(a) : `${fmtShort(a)} - ${fmtShort(b)} ${b.getFullYear()}`;
export const fmtHours = h => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
export const fmtAt = at => {
  const d = new Date(at);
  return `${fmtShort(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
