export function inr(n) {
  if (n == null || n === '') return '—';
  return '₹' + Number(n).toLocaleString('en-IN');
}

export function num(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-IN');
}

export function cplColor(cpl, target) {
  if (!cpl) return 'var(--text3)';
  if (cpl <= target) return 'var(--success)';
  if (cpl <= target * 1.2) return 'var(--warning)';
  return 'var(--danger)';
}

export function gapColor(pct) {
  if (pct <= 10) return 'var(--success)';
  if (pct <= 20) return 'var(--warning)';
  return 'var(--danger)';
}
