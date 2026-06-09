export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function toISO(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/"/g, '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, a, b, y] = m;
    // If first part > 12 it must be DD/MM/YYYY, else assume M/D/YYYY (GHL default)
    if (parseInt(a) > 12)
      return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
    return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }
  return null;
}

export function fmtDisplay(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
