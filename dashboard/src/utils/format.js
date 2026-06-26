export function inr(n) {
  if (n===null||n===undefined||isNaN(n)) return '—';
  const abs=Math.abs(n); let s;
  if (abs>=10000000) s=(abs/10000000).toFixed(2)+'Cr';
  else if (abs>=100000) s=(abs/100000).toFixed(2)+'L';
  else if (abs>=1000) s=(abs/1000).toFixed(1)+'K';
  else s=abs.toFixed(0);
  return (n<0?'-':'')+'₹'+s;
}
export function num(n) { return n===null||n===undefined?'—':Number(n).toLocaleString('en-IN'); }
export function cplColor(v,target) {
  if (!v) return 'var(--text3)';
  if (v<=target*0.8) return 'var(--success)';
  if (v<=target*1.2) return 'var(--warning)';
  return 'var(--danger)';
}
export function gapColor(pct) {
  if (pct<=10) return 'var(--success)';
  if (pct<=25) return 'var(--warning)';
  return 'var(--danger)';
}
