export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// forceDDMM: pass true for Indian sheets where format is always DD/MM/YYYY
export function toISO(raw, forceDDMM = false) {
  if (!raw) return null;
  const s = String(raw).replace(/"/g, '').trim();

  // YYYY-MM-DD (with optional time)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // DD/MM/YYYY or MM/DD/YYYY (with optional HH:MM or HH:MM:SS)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, a, b, y] = m;
    if (parseInt(a) > 12 || forceDDMM)
      return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
    return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }

  // DD-MM-YYYY or MM-DD-YYYY
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m2) {
    const [, a, b, y] = m2;
    if (parseInt(a) > 12 || forceDDMM)
      return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
    return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }

  // YYYY/MM/DD
  const m3 = s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`;

  return null;
}

export function fmtDisplay(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
