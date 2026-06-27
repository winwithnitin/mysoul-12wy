export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
export function toISO(raw, forceDDMM=false) {
  if (!raw || raw === '') return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return `${raw.getFullYear()}-${String(raw.getMonth()+1).padStart(2,'0')}-${String(raw.getDate()).padStart(2,'0')}`;
  }
  const s = String(raw).trim();
  const mmdd = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mmdd) {
    const [,a,b,y] = mmdd;
    if (forceDDMM) return `${y}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
    return `${y}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`;
  }
  const named = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})/);
  if (named) {
    const MONTHS = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    const mo = MONTHS[named[2].toLowerCase().slice(0,3)] || '01';
    const yr = named[3].length===2 ? '20'+named[3] : named[3];
    return `${yr}-${mo}-${named[1].padStart(2,'0')}`;
  }
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0,10);
  return null;
}
export function fmtDisplay(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${y}`;
}
export function getDateRange(period) {
  const today = new Date();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const todayStr = iso(today);
  switch(period) {
    case 'today':    return { from: todayStr, to: todayStr, label: 'Today' };
    case 'yesterday': { const y=new Date(today); y.setDate(y.getDate()-1); return { from:iso(y), to:iso(y), label:'Yesterday' }; }
    case 'thisWeek': { const ws=new Date(today); ws.setDate(today.getDate()-((today.getDay()+6)%7)); return { from:iso(ws), to:todayStr, label:'This Week' }; }
    case 'thisMonth': return { from:`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`, to:todayStr, label:'This Month' };
    case 'lastMonth': { const lm=new Date(today.getFullYear(),today.getMonth()-1,1); const lme=new Date(today.getFullYear(),today.getMonth(),0); return { from:iso(lm), to:iso(lme), label:'Last Month' }; }
    case 'last3months': { const t3=new Date(today); t3.setMonth(t3.getMonth()-3); return { from:iso(t3), to:todayStr, label:'Last 3 Months' }; }
    case 'thisYear': return { from:`${today.getFullYear()}-01-01`, to:todayStr, label:`YTD ${today.getFullYear()}` };
    default: return { from:todayStr, to:todayStr, label:'Today' };
  }
}
