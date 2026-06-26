import { useState, useEffect, useCallback } from 'react';
import { loadSalesData, detectDuplicates } from '../utils/sheets.js';
import { getDateRange, fmtDisplay } from '../utils/dates.js';
import { inr, num } from '../utils/format.js';
import { getFunnel, SLACK } from '../config.js';

const PERIODS = [
  { key: 'today',       label: 'Today'      },
  { key: 'yesterday',   label: 'Yesterday'  },
  { key: 'thisWeek',    label: 'This Week'  },
  { key: 'thisMonth',   label: 'This Month' },
  { key: 'lastMonth',   label: 'Last Month' },
  { key: 'last3months', label: 'Last 3M'    },
  { key: 'thisYear',    label: 'YTD'        },
];

const th  = { padding:'10px 14px', textAlign:'right', fontSize:11, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, borderBottom:'1px solid var(--border)' };
const thL = { ...th, textAlign:'left' };
const td  = (a='right') => ({ padding:'9px 14px', borderBottom:'1px solid var(--border2)', color:'var(--text2)', fontSize:13, textAlign:a });

export default function Sales() {
  const [all,     setAll]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [demo,    setDemo]    = useState(false);
  const [updated, setUpdated] = useState(null);
  const [period,  setPeriod]  = useState('thisMonth');
  const [gst,     setGst]     = useState('excl'); // excl or incl
  const [dupCopied, setDupCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAll(await loadSalesData()); setDemo(false); }
    catch (e) { setAll([]); setDemo(true); }
    finally { setLoading(false); setUpdated(new Date()); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding:'3rem', color:'var(--text3)', textAlign:'center' }}>Loading sales data...</div>;

  const { from, to, label: periodLabel } = getDateRange(period);
  const enrollments = all.filter(e => e.date && e.date >= from && e.date <= to);

  const applyGst = (amt) => gst === 'excl' ? amt / 1.18 : amt;

  // Metrics
  const totalRevenue   = enrollments.reduce((s, e) => s + applyGst(e.programFee), 0);
  const totalReceived  = enrollments.reduce((s, e) => s + applyGst(e.amtReceived), 0);
  const totalDue       = enrollments.reduce((s, e) => s + applyGst(e.amtDue), 0);
  const totalStudents  = enrollments.length;

  // Funnel breakdown
  const funnelMap = {};
  for (const e of enrollments) {
    const f = getFunnel(e.program) || 'Other';
    if (!funnelMap[f]) funnelMap[f] = { count:0, revenue:0, received:0, due:0 };
    funnelMap[f].count++;
    funnelMap[f].revenue   += applyGst(e.programFee);
    funnelMap[f].received  += applyGst(e.amtReceived);
    funnelMap[f].due       += applyGst(e.amtDue);
  }
  const funnelColors = { Tarot:'var(--tarot)', Reiki:'var(--reiki)', Other:'var(--text3)' };

  // Closer performance
  const closerMap = {};
  for (const e of enrollments) {
    const c = e.closedBy || 'Unknown';
    if (!closerMap[c]) closerMap[c] = { count:0, revenue:0, received:0 };
    closerMap[c].count++;
    closerMap[c].revenue  += applyGst(e.programFee);
    closerMap[c].received += applyGst(e.amtReceived);
  }
  const closers = Object.entries(closerMap).map(([name, d]) => ({ name, ...d })).sort((a,b)=>b.revenue-a.revenue);
  const maxCloserRev = Math.max(...closers.map(c => c.revenue), 1);

  // Program breakdown
  const progMap = {};
  for (const e of enrollments) {
    const k = e.program || 'Unknown';
    if (!progMap[k]) progMap[k] = { count:0, revenue:0 };
    progMap[k].count++;
    progMap[k].revenue += applyGst(e.programFee);
  }
  const programs = Object.entries(progMap).map(([name,d])=>({name,...d})).sort((a,b)=>b.revenue-a.revenue);

  // Duplicates — uses fixed detectDuplicates (no more false positives from empty rows)
  const { type1, type2 } = detectDuplicates(all);
  const totalDups = type1.length + type2.length;

  const handleCopyDups = () => {
    const lines = [
      `Duplicate Alert — ${totalDups} issues found — ${new Date().toLocaleDateString('en-IN')}`,
      '',
      ...(type1.length ? ['TYPE 1 — Same program enrolled twice:', ...type1.map(d => `  ${d.name} (${d.phone}) · ${d.program} · ${d.date}`)] : []),
      ...(type2.length ? ['', 'TYPE 2 — Diploma + Mastery (possible bundle):', ...type2.map(d => `  ${d.name} (${d.phone}) · ${d.program} · ${d.date}`)] : []),
    ].join('\n');
    navigator.clipboard.writeText(lines);
    window.open(`https://app.slack.com/client/T0B3W8201B4/C0B3W8201B4`, '_blank');
    setDupCopied(true);
    setTimeout(() => setDupCopied(false), 3000);
  };

  return (
    <div>
      {/* Sub-header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface2)', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:demo?'var(--warning)':'var(--success)' }}>
            {demo?'⚠ No data':'● Live'}
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
          {/* GST toggle */}
          <div style={{ display:'flex', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
            {['excl','incl'].map(m => (
              <button key={m} onClick={() => setGst(m)} style={{
                border:'none', borderRadius:0, padding:'5px 10px', fontSize:12, fontWeight:500,
                background: gst===m ? 'var(--reiki)' : 'transparent',
                color:      gst===m ? '#fff' : 'var(--text3)',
              }}>{m==='excl'?'Ex GST':'Inc GST'}</button>
            ))}
          </div>
        </div>
        <button onClick={load}>↻ Refresh</button>
      </div>

      {/* Summary strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:1, background:'var(--border)', marginBottom:24 }}>
        {[
          { label:'Enrollments',      value: num(totalStudents),         color: null },
          { label:'Total Revenue',    value: inr(Math.round(totalRevenue)), color:'var(--success)' },
          { label:'Cash Received',    value: inr(Math.round(totalReceived)), color:'var(--success)' },
          { label:'Outstanding',      value: inr(Math.round(totalDue)),  color: totalDue>0?'var(--warning)':null },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:'var(--surface)', padding:'16px 20px' }}>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6 }}>{periodLabel}</div>
            <div style={{ fontSize:22, fontWeight:600, color: color||'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding:'0 24px 32px' }}>

        {/* Funnel + Closer side by side */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:28 }}>

          {/* Funnel breakdown */}
          <div>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>By Funnel</div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              {Object.entries(funnelMap).length === 0
                ? <div style={{ padding:'1.5rem', color:'var(--text3)', fontSize:13 }}>No enrollments in this period.</div>
                : Object.entries(funnelMap).sort((a,b)=>b[1].revenue-a[1].revenue).map(([funnel, d]) => (
                  <div key={funnel} style={{ padding:'12px 16px', borderBottom:'1px solid var(--border2)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:funnelColors[funnel]||'var(--text3)' }}>{funnel}</span>
                      <span style={{ fontSize:12, color:'var(--text3)' }}>{d.count} students</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text2)' }}>
                      <span>Revenue: <strong style={{ color:'var(--text)' }}>{inr(Math.round(d.revenue))}</strong></span>
                      <span>Received: <strong style={{ color:'var(--success)' }}>{inr(Math.round(d.received))}</strong></span>
                      {d.due>0 && <span>Due: <strong style={{ color:'var(--warning)' }}>{inr(Math.round(d.due))}</strong></span>}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Closer performance */}
          <div>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>Closer Performance</div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              {closers.length === 0
                ? <div style={{ padding:'1.5rem', color:'var(--text3)', fontSize:13 }}>No data.</div>
                : closers.map(c => (
                  <div key={c.name} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border2)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                      <span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{c.name}</span>
                      <span style={{ fontSize:12, color:'var(--text3)' }}>{c.count} deals · {inr(Math.round(c.revenue))}</span>
                    </div>
                    <div style={{ height:5, background:'var(--border)', borderRadius:3 }}>
                      <div style={{ height:5, width:`${(c.revenue/maxCloserRev)*100}%`, background:'var(--tarot)', borderRadius:3 }} />
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        {/* Program breakdown */}
        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>Program Breakdown</div>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:28 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead><tr>{['Program','Enrollments','Revenue','Avg Deal'].map((h,i)=><th key={h} style={i===0?thL:th}>{h}</th>)}</tr></thead>
            <tbody>
              {programs.length===0
                ? <tr><td colSpan={4} style={{...td(),textAlign:'center',padding:'1.5rem',color:'var(--text3)'}}>No enrollments in this period.</td></tr>
                : programs.map(p => (
                  <tr key={p.name}>
                    <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{p.name||'—'}</td>
                    <td style={td()}>{p.count}</td>
                    <td style={{...td(),color:'var(--success)',fontWeight:600}}>{inr(Math.round(p.revenue))}</td>
                    <td style={td()}>{inr(Math.round(p.revenue/p.count))}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Recent enrollments */}
        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>Recent Enrollments — {periodLabel}</div>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:28 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead><tr>{['Date','Name','Phone','Program','Fee','Received','Due','Closer'].map((h,i)=><th key={h} style={i<3?thL:th}>{h}</th>)}</tr></thead>
            <tbody>
              {enrollments.length===0
                ? <tr><td colSpan={8} style={{...td(),textAlign:'center',padding:'1.5rem',color:'var(--text3)'}}>No enrollments in this period.</td></tr>
                : [...enrollments].sort((a,b)=>(b.date||'')>(a.date||'')?1:-1).slice(0,50).map((e,i)=>(
                  <tr key={i}>
                    <td style={{...td('left'),color:'var(--text3)',fontSize:11}}>{fmtDisplay(e.date)}</td>
                    <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{e.name||'—'}</td>
                    <td style={{...td('left'),fontSize:11}}>{e.phone||'—'}</td>
                    <td style={{...td('left'),fontSize:11,color:'var(--text2)'}}>{e.program||'—'}</td>
                    <td style={td()}>{inr(Math.round(applyGst(e.programFee)))}</td>
                    <td style={{...td(),color:'var(--success)'}}>{inr(Math.round(applyGst(e.amtReceived)))}</td>
                    <td style={{...td(),color:e.amtDue>0?'var(--warning)':'var(--text3)'}}>{e.amtDue>0?inr(Math.round(applyGst(e.amtDue))):'—'}</td>
                    <td style={{...td('left'),fontSize:11}}>{e.closedBy||'—'}</td>
                  </tr>
                ))
              }
              {enrollments.length>50 && <tr><td colSpan={8} style={{...td(),textAlign:'center',color:'var(--text3)',padding:'1rem'}}>Showing 50 of {enrollments.length}</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Duplicate alerts */}
        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>
          Duplicate Alerts — {totalDups > 0 ? `${totalDups} issues` : 'All clear'}
        </div>
        <div style={{
          background:'var(--surface)',
          border: `1px solid ${totalDups>0?'var(--danger)':'var(--border)'}`,
          borderRadius:12, overflow:'hidden',
        }}>
          {totalDups === 0
            ? <div style={{ padding:'1.5rem', color:'var(--success)', fontSize:13 }}>✓ No duplicates found</div>
            : <>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                  <span style={{ fontSize:13, color:'var(--danger)', fontWeight:600 }}>{totalDups} issue{totalDups!==1?'s':''} need attention</span>
                  <button onClick={handleCopyDups} style={{ background:'var(--tarot)', border:'none', color:'#fff', padding:'6px 14px', borderRadius:6, fontSize:12, fontWeight:500 }}>
                    {dupCopied ? '✓ Copied!' : '📋 Copy & Open Slack for Dolly'}
                  </button>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead><tr>{['Name','Phone','Program','Date','Issue'].map((h,i)=><th key={h} style={i<2?thL:th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[...type1.map(d=>({...d,issue:'Duplicate'})), ...type2.map(d=>({...d,issue:'Diploma+Mastery'}))].map((d,i)=>(
                      <tr key={i}>
                        <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{d.name||'—'}</td>
                        <td style={{...td('left')}}>{d.phone||'—'}</td>
                        <td style={{...td('left'),fontSize:11}}>{d.program||'—'}</td>
                        <td style={td()}>{d.date||'—'}</td>
                        <td style={{ ...td(), textAlign:'right' }}>
                          <span style={{ background:'rgba(239,68,68,0.15)', color:'var(--danger)', padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600 }}>{d.issue}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
          }
        </div>

      </div>
    </div>
  );
}
