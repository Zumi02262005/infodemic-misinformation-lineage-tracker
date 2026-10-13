const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en');
const dateFmt = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', timeZone: 'UTC' });
const yearFmt = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'UTC' });

export const formatCompact = (n) => compact.format(Number(n) || 0);
export const formatNumber = (n) => whole.format(Number(n) || 0);
export const formatDate = (d) => (d ? dateFmt.format(new Date(d)) : '—');
export const formatMonth = (d) => (d ? monthFmt.format(new Date(d)) : '—');
export const formatYear = (d) => (d ? yearFmt.format(new Date(d)) : '—');
export const formatPercent = (x, digits = 0) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(digits)}%`);

export function formatSpan(from, to) {
  if (!from || !to) return '—';
  const days = Math.max(0, (new Date(to) - new Date(from)) / 86400000);
  if (days < 1) return 'same day';
  if (days < 45) return `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`;
  const months = days / 30.44;
  if (months < 18) return `${Math.round(months)} months`;
  const years = days / 365.25;
  return `${years < 10 ? years.toFixed(1).replace(/\.0$/, '') : Math.round(years)} years`;
}

export function truncate(text, max = 80) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,.;:\s]+$/, '') + '…';
}

export const plural = (n, one, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;
