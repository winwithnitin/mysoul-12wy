import { useState, useEffect, useCallback } from 'react';
import { PROGRAMS } from '../config.js';
import { loadMarketingData, getMarketingSample, countLeadsInRange } from '../utils/sheets.js';
import { getDateRange, fmtDisplay } from '../utils/dates.js';
import { inr, num, cplColor, gapColor } from '../utils/format.js';

const PERIODS = [
  { key: 'today',       label: 'Today'       },
  { key: 'yesterday',   label: 'Yesterday'   },
  { key: 'thisWeek',    label: 'This Week'   },
  { key: 'lastWeek',    label: 'Last Week'   },
  { key: 'thisMonth',   label: 'This Month'  },
  { key: 'lastMonth',   label: 'Last Month'  },
  { key: 'last3months', label: 'Last 3M'     },
  { key: 'thisYear',    label: 'YTD'         },
];

const LEAD_DATE_COLS = { Tarot: 5, Reiki: 5 };
const TREND_DAYS = 60;

function isoLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function buildTrendRows(adSpend) {
  const today = new Date();
  const rows = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    rows.push({
      date: isoLocal(d),
      Tarot: { leads: 0, spend: 0, cpl: null },
      Reiki: { leads: 0, spend: 0, cpl: null },
    });
  }

  const byDate = Object.fromEntries(rows.map(r => [r.date, r]));
  for (const r of adSpend) {
    if (!byDate[r.date] || !byDate[r.date][r.program]) continue;
    byDate[r.date][r.program].leads += r.leadsAd || 0;
    byDate[r.date][r.program].spend += r.spend || 0;
  }

  return rows.map(r => ({
    ...r,
    Tarot: { ...r.Tarot, cpl: r.Tarot.leads > 0 ? Math.round(r.Tarot.spend / r.Tarot.leads) : null },
    Reiki: { ...r.Reiki, cpl: r.Reiki.leads > 0 ? Math.round(r.Reiki.spend / r.Reiki.leads) : null },
  }));
}

function percentile(values, p) {
  const nums = values.filter(v => v !== null && v !== undefined && isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return 1;
  const idx = Math.min(nums.length - 1, Math.max(0, Math.ceil((p / 100) * nums.length) - 1));
  return nums[idx];
}

function rollingAverage(rows, key, metric, window = 7) {
  return rows.map((_, i) => {
    const vals = rows.slice(Math.max(0, i - window + 1), i + 1)
      .map(r => r[key][metric])
      .filter(v => v !== null && v !== undefined);
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  });
}

function LineChart({ rows, metric, title, formatValue, benchmarks, showRolling=false }) {
  const [removeSpikes, setRemoveSpikes] = useState(true);
  const [hoverIndex, setHoverIndex] = useState(null);
  const width = 720, height = 170;
  const pad = { top: 14, right: 20, bottom: 28, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const series = [
    { key: 'Tarot', color: 'var(--tarot)' },
    { key: 'Reiki', color: 'var(--reiki)' },
  ];
  const values = rows.flatMap(r => series.map(s => r[s.key][metric]).filter(v => v !== null && v !== undefined));
  const benchValues = benchmarks ? Object.values(benchmarks) : [];
  const visibleMax = removeSpikes ? percentile(values, 95) : Math.max(...values, 1);
  const max = Math.max(visibleMax, ...benchValues, 1);
  const yMax = Math.ceil(max * 1.15);
  const x = i => pad.left + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * innerW);
  const y = v => pad.top + innerH - (Math.min(v, yMax) / yMax) * innerH;
  const pathFromValues = vals => {
    let started = false;
    return vals.map((v, i) => {
      if (v === null || v === undefined) { started = false; return null; }
      const cmd = started ? 'L' : 'M';
      started = true;
      return `${cmd} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    }).filter(Boolean).join(' ');
  };
  const pathFor = key => pathFromValues(rows.map(r => r[key][metric]));
  const rollingFor = key => pathFromValues(rollingAverage(rows, key, metric));
  const tooltip = hoverIndex !== null ? rows[hoverIndex] : null;
  const tooltipX = hoverIndex !== null ? x(hoverIndex) : 0;
  const tooltipY = pad.top + 8;
  const hoverToIndex = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = ((event.clientX - rect.left) / rect.width) * width;
    const idx = Math.round(((relX - pad.left) / innerW) * (rows.length - 1));
    setHoverIndex(Math.max(0, Math.min(rows.length - 1, idx)));
  };
  const ticks = [0, Math.round(yMax / 2), yMax];
  const labelIdx = rows.map((_, i) => i).filter(i => i % 7 === 0 || i === rows.length - 1);

  return (
    <div style={{ height:220, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', position:'relative' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4, gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{title}</div>
          <button onClick={() => setRemoveSpikes(v => !v)} style={{
            padding:'3px 8px', fontSize:10, borderRadius:5,
            background:removeSpikes?'var(--tarot-dim)':'var(--surface2)',
            color:removeSpikes?'var(--tarot)':'var(--text3)',
          }}>Remove Spikes {removeSpikes?'On':'Off'}</button>
        </div>
        <div style={{ display:'flex', gap:12, flexShrink:0 }}>
          {series.map(s => <span key={s.key} style={{ fontSize:10, color:s.color }}>■ {s.key}</span>)}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width:'100%', height:170, display:'block' }}
        role="img"
        aria-label={title}
        onMouseMove={hoverToIndex}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {ticks.map(t => (
          <g key={t}>
            <line x1={pad.left} x2={width-pad.right} y1={y(t)} y2={y(t)} stroke="var(--border2)" />
            <text x={pad.left-8} y={y(t)+4} textAnchor="end" fontSize="10" fill="var(--text3)">{formatValue(t)}</text>
          </g>
        ))}
        {benchmarks && series.map(s => benchmarks[s.key] ? (
          <g key={`${s.key}-bench`}>
            <line x1={pad.left} x2={width-pad.right} y1={y(benchmarks[s.key])} y2={y(benchmarks[s.key])} stroke={s.color} strokeDasharray="4 5" opacity="0.65" />
            <text x={width-pad.right} y={y(benchmarks[s.key])-5} textAnchor="end" fontSize="10" fill={s.color}>{s.key} {formatValue(benchmarks[s.key])}</text>
          </g>
        ) : null)}
        {showRolling && series.map(s => <path key={`${s.key}-avg`} d={rollingFor(s.key)} fill="none" stroke={s.color} strokeWidth="1.5" strokeDasharray="2 5" opacity="0.45" strokeLinecap="round" strokeLinejoin="round" />)}
        {series.map(s => <path key={s.key} d={pathFor(s.key)} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />)}
        {hoverIndex !== null && (
          <g>
            <line x1={tooltipX} x2={tooltipX} y1={pad.top} y2={height-pad.bottom} stroke="var(--border)" />
            {series.map(s => {
              const v = tooltip[s.key][metric];
              if (v === null || v === undefined) return null;
              return <circle key={s.key} cx={tooltipX} cy={y(v)} r="3.5" fill={s.color} stroke="var(--surface)" strokeWidth="1.5" />;
            })}
          </g>
        )}
        {labelIdx.map(i => (
          <text key={i} x={x(i)} y={height-9} textAnchor="middle" fontSize="10" fill="var(--text3)">{rows[i].date.slice(5)}</text>
        ))}
      </svg>
      {tooltip && (
        <div style={{
          position:'absolute',
          top:tooltipY + 28,
          left:`min(${Math.max(8, (tooltipX / width) * 100)}%, calc(100% - 170px))`,
          width:160,
          background:'var(--surface2)',
          border:'1px solid var(--border)',
          borderRadius:8,
          padding:'8px 10px',
          boxShadow:'0 8px 24px rgba(0,0,0,0.25)',
          pointerEvents:'none',
          zIndex:2,
        }}>
          <div style={{ fontSize:11, color:'var(--text)', fontWeight:700, marginBottom:5 }}>{fmtDisplay(tooltip.date)}</div>
          {series.map(s => {
            const v = tooltip[s.key][metric];
            return <div key={s.key} style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:s.color, padding:'2px 0' }}>
              <span>{s.key}</span><strong>{v === null || v === undefined ? '—' : formatValue(v)}</strong>
            </div>;
          })}
        </div>
      )}
    </div>
  );
}

export default function Marketing() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [demo,    setDemo]    = useState(false);
  const [updated, setUpdated] = useState(null);
  const [period,  setPeriod]  = useState('today');

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await loadMarketingData()); setDemo(false); }
    catch (e) { setData(getMarketingSample()); setDemo(true); }
    finally { setLoading(false); setUpdated(new Date()); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding:'3rem', color:'var(--text3)', textAlign:'center' }}>Loading marketing data...</div>;

  const { adSpend, tarotRows, reikiRows } = data;
  const rawRows = { Tarot: tarotRows || [], Reiki: reikiRows || [] };

  const { from, to, label: periodLabel } = getDateRange(period);

  // Compute per-program metrics for selected period
  const byProg = {};
  for (const p of PROGRAMS) {
    const rows   = adSpend.filter(r => r.program === p.key && r.date >= from && r.date <= to);
    const spend  = rows.reduce((s, r) => s + r.spend, 0);
    const leadsAd = rows.reduce((s, r) => s + r.leadsAd, 0);
    const lSheet = countLeadsInRange(rawRows[p.key] || [], LEAD_DATE_COLS[p.key] || 5, from, to);
    const cpl    = lSheet > 0 ? Math.round(spend / lSheet) : null;
    const gap    = leadsAd - lSheet;
    const gapPct = leadsAd > 0 ? Math.round((gap / leadsAd) * 100) : 0;
    byProg[p.key] = { spend, leadsAd, lSheet, cpl, gap, gapPct };
  }

  const totSpend   = PROGRAMS.reduce((s, p) => s + byProg[p.key].spend, 0);
  const totLeads   = PROGRAMS.reduce((s, p) => s + byProg[p.key].lSheet, 0);
  const blendedCpl = totLeads > 0 ? Math.round(totSpend / totLeads) : null;
  const trendRows = buildTrendRows(adSpend);

  // Spend table rows for selected period
  const periodRows = adSpend.filter(r => r.date >= from && r.date <= to);

  // Group spend by date for breakdown
  const dateGroups = {};
  for (const r of periodRows) {
    if (!dateGroups[r.date]) dateGroups[r.date] = [];
    dateGroups[r.date].push(r);
  }
  const sortedDates = Object.keys(dateGroups).sort().reverse();

  const th  = { padding:'9px 14px', textAlign:'right', fontSize:11, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, borderBottom:'1px solid var(--border)' };
  const thL = { ...th, textAlign:'left' };
  const td  = (a='right') => ({ padding:'9px 14px', borderBottom:'1px solid var(--border2)', color:'var(--text2)', fontSize:13, textAlign:a });

  return (
    <div>
      {/* Sub-header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface2)', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color: demo?'var(--warning)':'var(--success)' }}>
            {demo?'⚠ Sample':'● Live'}
            {updated && <span style={{ color:'var(--text3)', marginLeft:8 }}>· {updated.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>}
          </span>
          {/* Period selector */}
          <div style={{ display:'flex', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                border:'none', borderRadius:0, padding:'5px 11px', fontSize:12, fontWeight:500,
                background: period===p.key ? 'var(--tarot)' : 'transparent',
                color:      period===p.key ? '#fff' : 'var(--text3)',
              }}>{p.label}</button>
            ))}
          </div>
        </div>
        <button onClick={load}>↻ Refresh</button>
      </div>

      {/* Summary strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:1, background:'var(--border)', marginBottom:24 }}>
        {[
          { label:'Total Ad Spend',   value: inr(totSpend),   color: totSpend>0?'var(--warning)':null },
          { label:'Total Leads',      value: num(totLeads),   color: null },
          { label:'Blended CPL',      value: blendedCpl ? '₹'+num(blendedCpl) : '—', color: null },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:'var(--surface)', padding:'16px 20px' }}>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6 }}>{periodLabel}</div>
            <div style={{ fontSize:22, fontWeight:600, color: color||'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding:'0 24px 32px' }}>
        {/* 60-day trends */}
        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:12 }}>
          Daily trends — last {TREND_DAYS} days
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:16, marginBottom:28 }}>
          <LineChart
            rows={trendRows}
            metric="leads"
            title="Daily Leads"
            formatValue={v => num(v)}
            showRolling
          />
          <LineChart
            rows={trendRows}
            metric="cpl"
            title="Daily CPL"
            formatValue={v => '₹'+num(v)}
            benchmarks={{ Tarot: 250, Reiki: 120 }}
          />
        </div>

        {/* Program cards */}
        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:12 }}>
          Program performance — {periodLabel}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16, marginBottom:28 }}>
          {PROGRAMS.map(p => {
            const d = byProg[p.key];
            return (
              <div key={p.key} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderTop:`3px solid ${p.color}`, borderRadius:12, padding:'16px 18px' }}>
                <div style={{ fontSize:14, fontWeight:600, color:p.color, marginBottom:14 }}>{p.key} Funnel</div>
                {[
                  ['Ad Spend',     inr(d.spend),    null],
                  ['Sheet Leads',  num(d.lSheet),   null],
                  ['Ad Acct Leads',num(d.leadsAd),  null],
                  ['CPL',          d.cpl?'₹'+num(d.cpl):'—', d.cpl?cplColor(d.cpl,p.cplTarget):null],
                  ['Tracking Gap', d.gap>=0?'+'+num(d.gap):num(d.gap), d.leadsAd>0?gapColor(Math.abs(d.gapPct)):null],
                ].map(([lbl,val,col])=>(
                  <div key={lbl} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border2)' }}>
                    <span style={{ fontSize:12, color:'var(--text2)' }}>{lbl}</span>
                    <span style={{ fontSize:13, fontWeight:500, color:col||'var(--text)' }}>{val}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Spend breakdown */}
        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:12 }}>
          Spend breakdown — {periodLabel} · {sortedDates.length} day{sortedDates.length!==1?'s':''} with data
        </div>
        {sortedDates.length === 0
          ? <div style={{ color:'var(--text3)', fontSize:13, padding:'1rem 0' }}>No spend data for this period.</div>
          : <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr>{['Date','Program','Platform','Account','Spend','Ad Leads'].map((h,i)=>(
                    <th key={h} style={i<2?thL:th}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {sortedDates.map(date =>
                    dateGroups[date].map((r, i) => (
                      <tr key={date+i}>
                        <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{i===0?fmtDisplay(date):''}</td>
                        <td style={{...td('left'),color:r.program==='Tarot'?'var(--tarot)':'var(--reiki)',fontWeight:500}}>{r.program}</td>
                        <td style={td()}>{r.platform}</td>
                        <td style={td()}>{r.account}</td>
                        <td style={{...td(),color:'var(--warning)',fontWeight:600}}>{inr(r.spend)}</td>
                        <td style={td()}>{r.leadsAd||'—'}</td>
                      </tr>
                    ))
                  )}
                  <tr style={{ borderTop:'2px solid var(--border)', background:'var(--surface2)' }}>
                    <td style={{...td('left'),color:'var(--text)',fontWeight:700}} colSpan={4}>Total</td>
                    <td style={{...td(),color:'var(--warning)',fontWeight:700}}>{inr(totSpend)}</td>
                    <td style={{...td(),fontWeight:700}}>{num(periodRows.reduce((s,r)=>s+r.leadsAd,0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
        }
      </div>
    </div>
  );
}
