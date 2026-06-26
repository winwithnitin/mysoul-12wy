import { useState, useEffect, useCallback } from 'react';
import { PROGRAMS } from '../config.js';
import { loadMarketingData, getMarketingSample, countLeadsInRange } from '../utils/sheets.js';
import { getDateRange, fmtDisplay } from '../utils/dates.js';
import { inr, num, cplColor, gapColor } from '../utils/format.js';

const PERIODS = [
  { key: 'today',       label: 'Today'       },
  { key: 'yesterday',   label: 'Yesterday'   },
  { key: 'thisWeek',    label: 'This Week'   },
  { key: 'thisMonth',   label: 'This Month'  },
  { key: 'lastMonth',   label: 'Last Month'  },
  { key: 'last3months', label: 'Last 3M'     },
  { key: 'thisYear',    label: 'YTD'         },
];

const LEAD_DATE_COLS = { Tarot: 5, Reiki: 5 };

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
