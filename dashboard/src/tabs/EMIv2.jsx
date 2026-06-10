import { inr, num } from '../utils/format.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const TAROT_PROGRAMS = ['tarot - mastery','tarot - diploma','tarot - health','30 days mani'];
const REIKI_PROGRAMS = ['reiki - l1/l2','reiki - l3','money reiki',"ho'oponopono",'hooponopono'];
const MONTH_MAP = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
function monthEndISO() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
}

function parseBatchDate(name) {
  const m = name.toLowerCase().match(/([a-z]+)\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTH_MAP[m[1].slice(0,3)];
  return mo ? { year: parseInt(m[2]), month: mo } : null;
}

function isoFromBatch(bd) {
  if (!bd) return null;
  return `${bd.year}-${String(bd.month).padStart(2,'0')}-01`;
}

function addMonths(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function qLabel(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return `Q${Math.ceil((d.getMonth()+1)/3)} ${d.getFullYear()}`;
}

function qRange(year, q) {
  const start = new Date(year, (q-1)*3, 1).toISOString().slice(0,10);
  const end   = new Date(year, q*3, 0).toISOString().slice(0,10);
  return { start, end };
}

// ─── Launch Cycle Analysis ────────────────────────────────────────────────────
function getLaunchCycles(v2Students, salesEnrollments) {
  const keys = [...new Set(v2Students.map(s => `${s.batch}||${s.program}`))];

  return keys.map(key => {
    const [batchName, program] = key.split('||');
    const students  = v2Students.filter(s => s.batch === batchName && s.program === program);
    const bd        = parseBatchDate(batchName);
    const launchISO = isoFromBatch(bd);
    const poolStart = launchISO ? addMonths(launchISO, -4) : null;

    const funnelProgs = program === 'SUPER' ? TAROT_PROGRAMS : REIKI_PROGRAMS;

    const l1Pool = (poolStart && launchISO)
      ? salesEnrollments.filter(e =>
          e.date >= poolStart && e.date < launchISO &&
          funnelProgs.some(fp => e.program?.toLowerCase().includes(fp))
        ).length
      : 0;

    const enrolled    = students.length;
    const revenue     = students.reduce((s,x) => s + (x.totalPlanned||0), 0);
    const received    = students.reduce((s,x) => s + (x.totalActual||0),  0);
    const outstanding = students.reduce((s,x) => s + (x.emiDue||0),       0);
    const convRate    = l1Pool > 0 ? +((enrolled / l1Pool) * 100).toFixed(1) : null;

    return { batchName, program, enrolled, revenue, received, outstanding, l1Pool, convRate, launchISO };
  }).sort((a, b) => (a.launchISO||'') < (b.launchISO||'') ? -1 : 1);
}

// ─── Calendar Quarter Analysis ────────────────────────────────────────────────
function getCalendarQuarters(v2Students, salesEnrollments) {
  const quarterSet = new Set();

  const addQ = (isoDate) => {
    if (!isoDate) return;
    const d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    quarterSet.add(`${d.getFullYear()}-${Math.ceil((d.getMonth()+1)/3)}`);
  };

  v2Students.forEach(s => addQ(s.timestamp));
  salesEnrollments.forEach(e => addQ(e.date));

  return [...quarterSet].sort().map(qk => {
    const [year, q] = qk.split('-').map(Number);
    const { start, end } = qRange(year, q);

    const superStudents = v2Students.filter(s => s.program==='SUPER' && s.timestamp >= start && s.timestamp <= end);
    const rgmStudents   = v2Students.filter(s => s.program==='RGM'   && s.timestamp >= start && s.timestamp <= end);

    const tarotL1 = salesEnrollments.filter(e =>
      e.date >= start && e.date <= end &&
      TAROT_PROGRAMS.some(fp => e.program?.toLowerCase().includes(fp))
    ).length;

    const reikiL1 = salesEnrollments.filter(e =>
      e.date >= start && e.date <= end &&
      REIKI_PROGRAMS.some(fp => e.program?.toLowerCase().includes(fp))
    ).length;

    // Conversion: SUPER in THIS quarter vs Tarot L1 in PRIOR quarter
    const { start: pStart, end: pEnd } = qRange(q === 1 ? year-1 : year, q === 1 ? 4 : q-1);
    const priorTarot = salesEnrollments.filter(e => e.date >= pStart && e.date <= pEnd && TAROT_PROGRAMS.some(fp => e.program?.toLowerCase().includes(fp))).length;
    const priorReiki = salesEnrollments.filter(e => e.date >= pStart && e.date <= pEnd && REIKI_PROGRAMS.some(fp => e.program?.toLowerCase().includes(fp))).length;

    return {
      label: `Q${q} ${year}`,
      tarotL1, reikiL1,
      superEnrolled: superStudents.length,
      rgmEnrolled:   rgmStudents.length,
      superRevenue:  superStudents.reduce((s,x) => s+(x.totalPlanned||0), 0),
      rgmRevenue:    rgmStudents.reduce((s,x)   => s+(x.totalPlanned||0), 0),
      superConv:     priorTarot > 0 ? +((superStudents.length / priorTarot)*100).toFixed(1) : null,
      rgmConv:       priorReiki > 0 ? +((rgmStudents.length   / priorReiki)*100).toFixed(1) : null,
    };
  });
}

// ─── Chart helpers ────────────────────────────────────────────────────────────
function convColor(rate) {
  if (!rate) return 'var(--text3)';
  if (rate >= 15) return 'var(--success)';
  if (rate >=  8) return 'var(--warning)';
  return 'var(--danger)';
}

function LaunchChart({ cycles, programType }) {
  if (!cycles.length) return (
    <div style={{ color:'var(--text3)', fontSize:13, textAlign:'center', padding:'2rem' }}>
      No {programType} batches in registry yet.
    </div>
  );
  const color   = programType === 'SUPER' ? 'var(--tarot)' : 'var(--reiki)';
  const maxVal  = Math.max(...cycles.map(c => Math.max(c.l1Pool, c.enrolled)), 1);
  const BAR_H   = 100;

  return (
    <div>
      <div style={{ display:'flex', gap:4, marginBottom:12 }}>
        <span style={{ fontSize:11, color:'var(--text3)' }}>■ L1 pool (4 months prior)</span>
        <span style={{ fontSize:11, color, marginLeft:12 }}>■ {programType} enrolled</span>
      </div>
      <div style={{ display:'flex', gap:20, overflowX:'auto', paddingBottom:8 }}>
        {cycles.filter(c => c.program === programType).map(c => {
          const l1H   = Math.max((c.l1Pool   / maxVal) * BAR_H, 3);
          const enrH  = Math.max((c.enrolled / maxVal) * BAR_H, 3);
          return (
            <div key={c.batchName} style={{ flex:'0 0 90px', textAlign:'center' }}>
              <div style={{ height:BAR_H+20, display:'flex', alignItems:'flex-end', justifyContent:'center', gap:6 }}>
                <div style={{ width:28 }}>
                  <div style={{ fontSize:9, color:'var(--text3)', marginBottom:2 }}>{c.l1Pool}</div>
                  <div style={{ height:l1H+'px', background:'var(--border)', border:'1px solid var(--text3)', borderRadius:'3px 3px 0 0' }} />
                </div>
                <div style={{ width:28 }}>
                  <div style={{ fontSize:9, color, marginBottom:2 }}>{c.enrolled}</div>
                  <div style={{ height:enrH+'px', background:color, borderRadius:'3px 3px 0 0' }} />
                </div>
              </div>
              <div style={{ fontSize:10, color:'var(--text2)', margin:'6px 0 2px' }}>{c.batchName}</div>
              {c.convRate !== null
                ? <div style={{ fontSize:12, fontWeight:700, color:convColor(c.convRate) }}>{c.convRate}%</div>
                : <div style={{ fontSize:10, color:'var(--text3)' }}>—</div>
              }
              <div style={{ fontSize:9, color:'var(--text3)' }}>{inr(c.revenue)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main V2 Component ────────────────────────────────────────────────────────
export default function EMIv2({ v2Students, salesEnrollments }) {
  const ms = monthStartISO(), me = monthEndISO();
  const launchCycles = getLaunchCycles(v2Students, salesEnrollments);
  const quarters     = getCalendarQuarters(v2Students, salesEnrollments);

  // ── Revenue summaries ──
  const sumFor = (prog) => {
    const list = v2Students.filter(s => !prog || s.program === prog);
    return {
      students:    list.length,
      revenue:     list.reduce((s,x) => s+(x.totalPlanned||0), 0),
      received:    list.reduce((s,x) => s+(x.totalActual||0),  0),
      outstanding: list.reduce((s,x) => s+(x.emiDue||0),       0),
      mthReceived: list.filter(x => x.timestamp >= ms && x.timestamp <= me)
                       .reduce((s,x) => s+(x.totalActual||0), 0),
    };
  };
  const superSum = sumFor('SUPER');
  const rgmSum   = sumFor('RGM');
  const allSum   = sumFor(null);

  // ── Funnel combined (MTD from sales) ──
  const mthSalesFunnel = (funnelProgs) =>
    salesEnrollments
      .filter(e => e.date >= ms && e.date <= me && funnelProgs.some(fp => e.program?.toLowerCase().includes(fp)))
      .reduce((s, e) => s + (e.programFee||0), 0);

  const tarotL1Mtd = mthSalesFunnel(TAROT_PROGRAMS);
  const reikiL1Mtd = mthSalesFunnel(REIKI_PROGRAMS);
  const superMtdReceived = v2Students.filter(s => s.program==='SUPER' && s.timestamp >= ms && s.timestamp <= me).reduce((s,x)=>s+(x.totalActual||0),0);
  const rgmMtdReceived   = v2Students.filter(s => s.program==='RGM'   && s.timestamp >= ms && s.timestamp <= me).reduce((s,x)=>s+(x.totalActual||0),0);

  // ── Styles ──
  const th  = { padding:'10px 14px', textAlign:'right', fontSize:11, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, borderBottom:'1px solid var(--border)' };
  const thL = { ...th, textAlign:'left' };
  const td  = (align='right') => ({ padding:'9px 14px', borderBottom:'1px solid var(--border2)', color:'var(--text2)', fontSize:13, textAlign:align });
  const card = (color) => ({ background:'var(--surface)', border:'1px solid var(--border)', borderTop:`3px solid ${color}`, borderRadius:12, padding:'16px 18px' });
  const row  = (label, value, valueColor) => (
    <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border2)' }}>
      <span style={{ fontSize:12, color:'var(--text2)' }}>{label}</span>
      <span style={{ fontSize:13, fontWeight:500, color:valueColor||'var(--text)' }}>{value}</span>
    </div>
  );
  const section = (t) => <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:12 }}>{t}</div>;
  const box = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:28 };

  return (
    <div style={{ padding:'20px 24px 40px' }}>

      {/* ── 1. Revenue summary cards ── */}
      {section('Revenue summary — all batches')}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:28 }}>
        {[
          { label:'SUPER', sum:superSum, color:'var(--tarot)' },
          { label:'RGM',   sum:rgmSum,   color:'var(--reiki)' },
          { label:'Combined', sum:allSum, color:'var(--pcos)' },
        ].map(({ label, sum, color }) => (
          <div key={label} style={card(color)}>
            <div style={{ fontSize:13, fontWeight:600, color, marginBottom:14 }}>{label}</div>
            {row('Students',     num(sum.students))}
            {row('Total revenue (planned)', inr(sum.revenue))}
            {row('Cash received', inr(sum.received), 'var(--success)')}
            {row('Outstanding',   inr(sum.outstanding), sum.outstanding > 0 ? 'var(--warning)' : 'var(--text3)')}
            {row('Collection %', sum.revenue > 0 ? ((sum.received/sum.revenue)*100).toFixed(1)+'%' : '—')}
          </div>
        ))}
      </div>

      {/* ── 2. Funnel combined view (MTD) ── */}
      {section('Complete funnel revenue — month to date (L1/L2 + SUPER/RGM cash)')}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:28 }}>
        {[
          { funnel:'Tarot Funnel', l1: tarotL1Mtd, ht: superMtdReceived, htLabel:'SUPER cash received', color:'var(--tarot)' },
          { funnel:'Reiki Funnel', l1: reikiL1Mtd, ht: rgmMtdReceived,   htLabel:'RGM cash received',   color:'var(--reiki)' },
        ].map(({ funnel, l1, ht, htLabel, color }) => (
          <div key={funnel} style={card(color)}>
            <div style={{ fontSize:13, fontWeight:600, color, marginBottom:14 }}>{funnel}</div>
            {row('L1/L2 enrollment revenue', inr(l1))}
            {row(htLabel, inr(ht), 'var(--success)')}
            <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)' }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, color:'var(--text2)' }}>Total funnel MTD</span>
                <span style={{ fontSize:16, fontWeight:700, color }}>{inr(l1 + ht)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 3. Launch cycle performance charts ── */}
      {section('Launch cycle performance — L1 pool vs SUPER/RGM conversions')}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:28 }}>
        {['SUPER','RGM'].map(prog => (
          <div key={prog} style={{ ...box, padding:'16px 20px', marginBottom:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color: prog==='SUPER' ? 'var(--tarot)' : 'var(--reiki)', marginBottom:14 }}>
              {prog==='SUPER' ? 'Tarot L1 → SUPER' : 'Reiki L1 → RGM'}
              <span style={{ fontSize:10, color:'var(--text3)', fontWeight:400, marginLeft:8 }}>4-month prior pool vs enrolled</span>
            </div>
            <LaunchChart cycles={launchCycles} programType={prog} />
          </div>
        ))}
      </div>

      {/* ── 4. Batch breakdown table ── */}
      {section('Batch breakdown — all time')}
      <div style={box}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr>{['Batch','Program','Students','Revenue','Received','Outstanding','L1 Pool','Conv%'].map((h,i)=>(
              <th key={h} style={i<2?thL:th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {launchCycles.length === 0
              ? <tr><td colSpan={8} style={{...td(),textAlign:'center',padding:'2rem'}}>No batches added to registry yet.</td></tr>
              : launchCycles.map(c => (
                <tr key={c.batchName+c.program}>
                  <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{c.batchName}</td>
                  <td style={{...td('left'),color:c.program==='SUPER'?'var(--tarot)':'var(--reiki)',fontWeight:500}}>{c.program}</td>
                  <td style={td()}>{c.enrolled}</td>
                  <td style={td()}>{inr(c.revenue)}</td>
                  <td style={{...td(),color:'var(--success)'}}>{inr(c.received)}</td>
                  <td style={{...td(),color:c.outstanding>0?'var(--warning)':'var(--text3)'}}>{inr(c.outstanding)}</td>
                  <td style={td()}>{c.l1Pool || '—'}</td>
                  <td style={{...td(),color:convColor(c.convRate),fontWeight:600}}>{c.convRate !== null ? c.convRate+'%' : '—'}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* ── 5. Calendar quarterly view ── */}
      {section('Calendar quarterly view — L1 enrollments & SUPER/RGM conversions')}
      <div style={box}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr>{['Quarter','Tarot L1','SUPER','SUPER Conv%','Reiki L1','RGM','RGM Conv%','SUPER Rev','RGM Rev'].map((h,i)=>(
              <th key={h} style={i===0?thL:th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {quarters.length === 0
              ? <tr><td colSpan={9} style={{...td(),textAlign:'center',padding:'2rem'}}>No data yet.</td></tr>
              : quarters.map(q => (
                <tr key={q.label}>
                  <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{q.label}</td>
                  <td style={td()}>{q.tarotL1}</td>
                  <td style={{...td(),color:'var(--tarot)',fontWeight:500}}>{q.superEnrolled}</td>
                  <td style={{...td(),color:convColor(q.superConv),fontWeight:600}}>{q.superConv !== null ? q.superConv+'%' : '—'}</td>
                  <td style={td()}>{q.reikiL1}</td>
                  <td style={{...td(),color:'var(--reiki)',fontWeight:500}}>{q.rgmEnrolled}</td>
                  <td style={{...td(),color:convColor(q.rgmConv),fontWeight:600}}>{q.rgmConv !== null ? q.rgmConv+'%' : '—'}</td>
                  <td style={td()}>{inr(q.superRevenue)}</td>
                  <td style={td()}>{inr(q.rgmRevenue)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* ── 6. Key insight note ── */}
      <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6 }}>
        <strong style={{ color:'var(--text2)' }}>Reading the conversion rate:</strong> Conv% = SUPER/RGM enrolled ÷ L1 pool in prior 4 months.
        Target: SUPER ≥ 15% (warm Tarot leads), RGM ≥ 20% (SUPER graduates).
        Calendar quarterly conv% uses prior quarter as the L1 denominator.
      </div>

    </div>
  );
}
