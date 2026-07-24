import { useState, useEffect, useCallback } from 'react';
import { loadEMIData, getEMISample, loadSalesData } from '../utils/sheets.js';
import { inr, num } from '../utils/format.js';
import EMIv2 from './EMIv2.jsx';

function todayStr()   { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function monthStart() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
function monthEnd()   { const d=new Date(); const l=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(l).padStart(2,'0')}`; }

function calcMetrics(students) {
  const today=todayStr(), ms=monthStart(), me=monthEnd();
  let outstanding=0, monthExpected=0, monthReceived=0;
  const overdueList=[];
  for (const s of students) {
    outstanding += s.emiDue||0;
    for (const emi of (s.emis||[])) {
      if (emi.plannedDate>=ms && emi.plannedDate<=me && !emi.actualDate) monthExpected+=emi.plannedAmt||0;
      if (emi.actualDate>=ms && emi.actualDate<=me) monthReceived+=emi.actualAmt||0;
      if (emi.plannedDate && emi.plannedDate<today && !emi.actualDate && emi.plannedAmt>0) {
        const days=Math.floor((Date.parse(today)-Date.parse(emi.plannedDate))/86400000);
        overdueList.push({...s,emiNum:emi.n,overdueDate:emi.plannedDate,overdueAmt:emi.plannedAmt,daysOverdue:days});
      }
    }
  }
  return { outstanding, monthExpected, monthReceived, monthGap:monthExpected-monthReceived, overdueList };
}

const th  = { padding:'10px 14px', textAlign:'right', fontSize:11, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, borderBottom:'1px solid var(--border)' };
const thL = { ...th, textAlign:'left' };
const td  = (a='right') => ({ padding:'9px 14px', borderBottom:'1px solid var(--border2)', color:'var(--text2)', fontSize:13, textAlign:a });
const tableWrap = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:28 };
const eye = (t) => <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:12 }}>{t}</div>;

function getCommunityEntry(student, sales) {
  const email = (student.email || '').toLowerCase().trim();
  const phone = (student.phone || '').replace(/\D/g, '').slice(-10);
  const matches = (sales || []).filter(e => {
    const program = (e.program || '').toLowerCase();
    const isL1 = program.includes('tarot') || program.includes('reiki') || program.includes('30 days mani') || program.includes('hooponopono') || program.includes("ho'oponopono");
    const sameEmail = email && e.email === email;
    const samePhone = phone && e.phone === phone;
    return isL1 && (sameEmail || samePhone);
  }).sort((a,b) => a.date.localeCompare(b.date));
  return matches[0] ? { date: matches[0].date, program: matches[0].program || '' } : { date: null, program: '' };
}

function daysBetween(from, to) {
  if (!from || !to) return null;
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function V3Content({ students, sales }) {
  const [prog, setProg] = useState('ALL');
  const [batch, setBatch] = useState('ALL');
  const allBatches = [...new Set((students || []).map(s => s.batch).filter(Boolean))].sort();
  const rows = (students || [])
    .filter(s => (prog === 'ALL' || s.program === prog) && (batch === 'ALL' || s.batch === batch))
    .map(s => {
      const entry = getCommunityEntry(s, sales);
      return {
        ...s,
        joiningDate: entry.date,
        firstProgram: entry.program,
        timeTakenDays: daysBetween(entry.date, s.timestamp),
        ltvPaid: s.totalActual || 0,
        totalDue: s.emiDue || 0,
      };
    })
    .sort((a,b) => (b.joiningDate || b.timestamp || '').localeCompare(a.joiningDate || a.timestamp || ''));

  const totals = rows.reduce((acc, s) => {
    acc.paid += s.ltvPaid || 0;
    acc.due += s.totalDue || 0;
    if (s.program === 'SUPER') acc.super += 1;
    if (s.program === 'RGM') acc.rgm += 1;
    return acc;
  }, { paid:0, due:0, super:0, rgm:0 });

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 24px',borderBottom:'1px solid var(--border)',background:'var(--surface2)',flexWrap:'wrap'}}>
        <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          {['ALL','SUPER','RGM'].map(p=><button key={p} onClick={()=>setProg(p)} style={{border:'none',borderRadius:0,padding:'4px 12px',fontSize:12,fontWeight:500,background:prog===p?'var(--tarot)':'transparent',color:prog===p?'#fff':'var(--text3)'}}>{p}</button>)}
        </div>
        <select value={batch} onChange={e=>setBatch(e.target.value)} style={{background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text)',padding:'4px 10px',borderRadius:8,fontSize:12}}>
          <option value="ALL">All Batches</option>
          {allBatches.map(b=><option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:1,background:'var(--border)',marginBottom:24}}>
        {[['Students',num(rows.length),null],['SUPER',num(totals.super),'var(--tarot)'],['RGM',num(totals.rgm),'var(--reiki)'],['LTV paid',inr(totals.paid),'var(--success)'],['Total due',inr(totals.due),totals.due>0?'var(--warning)':'var(--text)']].map(([label,value,color])=>(
          <div key={label} style={{background:'var(--surface)',padding:'16px 20px'}}>
            <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>{label}</div>
            <div style={{fontSize:22,fontWeight:600,color:color||'var(--text)'}}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{padding:'0 24px 32px'}}>
        {eye('Student list — SUPER, RGM and combined')}
        <div style={tableWrap}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>{['Name','Phone','Batch','Community Joining Date','First Program','Time Taken','LTV - Total Paid','Total Due'].map((h,i)=><th key={h} style={i<3?thL:th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.length===0?<tr><td colSpan={8} style={{...td(),textAlign:'center',padding:'2rem'}}>No students found.</td></tr>
              :rows.map((s,i)=>(
                <tr key={`${s.email || s.phone || s.name}-${s.batch}-${i}`}>
                  <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{s.name || '--'}</td>
                  <td style={td('left')}>{s.phone || '--'}</td>
                  <td style={{...td('left'),color:s.program==='SUPER'?'var(--tarot)':'var(--reiki)',fontWeight:500}}>{s.batch || s.program || '--'}</td>
                  <td style={td()}>{s.joiningDate || '--'}</td>
                  <td style={td()}>{s.firstProgram || '--'}</td>
                  <td style={td()}>{s.timeTakenDays === null ? '--' : `${s.timeTakenDays}d`}</td>
                  <td style={{...td(),color:'var(--success)',fontWeight:600}}>{inr(s.ltvPaid)}</td>
                  <td style={{...td(),color:s.totalDue>0?'var(--warning)':'var(--text3)',fontWeight:600}}>{inr(s.totalDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function V1Content({ students }) {
  const [prog,  setProg]  = useState('ALL');
  const [batch, setBatch] = useState('ALL');
  const allBatches = [...new Set(students.map(s=>s.batch))].sort();
  const filtered = students.filter(s=>(prog==='ALL'||s.program===prog)&&(batch==='ALL'||s.batch===batch));
  const all=calcMetrics(filtered), superM=calcMetrics(filtered.filter(s=>s.program==='SUPER')), rgmM=calcMetrics(filtered.filter(s=>s.program==='RGM'));
  const batchRows=allBatches.map(b=>{const list=filtered.filter(s=>s.batch===b);if(!list.length)return null;const m=calcMetrics(list);return{b,prog:list[0]?.program,count:list.length,...m};}).filter(Boolean);
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 24px',borderBottom:'1px solid var(--border)',background:'var(--surface2)'}}>
        <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          {['ALL','SUPER','RGM'].map(p=><button key={p} onClick={()=>setProg(p)} style={{border:'none',borderRadius:0,padding:'4px 12px',fontSize:12,fontWeight:500,background:prog===p?'var(--tarot)':'transparent',color:prog===p?'#fff':'var(--text3)'}}>{p}</button>)}
        </div>
        <select value={batch} onChange={e=>setBatch(e.target.value)} style={{background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text)',padding:'4px 10px',borderRadius:8,fontSize:12}}>
          <option value="ALL">All Batches</option>
          {allBatches.map(b=><option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:1,background:'var(--border)',marginBottom:24}}>
        {[{label:'Total outstanding',value:inr(all.outstanding),color:all.outstanding>0?'var(--warning)':'var(--text)'},{label:'Mth expected',value:inr(all.monthExpected),color:null},{label:'Mth received',value:inr(all.monthReceived),color:'var(--success)'},{label:'Mth gap',value:inr(all.monthGap),color:all.monthGap>0?'var(--danger)':'var(--success)'},{label:'Overdue EMIs',value:num(all.overdueList.length),color:all.overdueList.length>0?'var(--danger)':'var(--success)'}].map(({label,value,color})=>(
          <div key={label} style={{background:'var(--surface)',padding:'16px 20px'}}>
            <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>{label}</div>
            <div style={{fontSize:22,fontWeight:600,color:color||'var(--text)'}}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{padding:'0 24px 32px'}}>
        {eye('Program overview')}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:28}}>
          {[{label:'SUPER',m:superM,color:'var(--tarot)'},{label:'RGM',m:rgmM,color:'var(--reiki)'}].map(({label,m,color})=>(
            <div key={label} style={{background:'var(--surface)',border:'1px solid var(--border)',borderTop:`3px solid ${color}`,borderRadius:12,padding:'16px 18px'}}>
              <div style={{fontSize:13,fontWeight:600,color,marginBottom:14}}>{label}</div>
              {[['Students',num(filtered.filter(s=>s.program===label).length)],['Total outstanding',inr(m.outstanding)],['Mth expected',inr(m.monthExpected)],['Mth received',inr(m.monthReceived)],['Mth gap',inr(m.monthGap)],['Overdue EMIs',num(m.overdueList.length)]].map(([l,v])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border2)'}}>
                  <span style={{fontSize:12,color:'var(--text2)'}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        {eye('Batch breakdown')}
        <div style={tableWrap}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>{['Batch','Program','Students','Outstanding','Mth Expected','Mth Received','Gap','Overdue'].map((h,i)=><th key={h} style={i<2?thL:th}>{h}</th>)}</tr></thead>
            <tbody>
              {batchRows.length===0?<tr><td colSpan={8} style={{...td(),textAlign:'center',padding:'2rem'}}>No data.</td></tr>
              :batchRows.map(r=>(
                <tr key={r.b+r.prog}>
                  <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{r.b}</td>
                  <td style={{...td('left'),color:r.prog==='SUPER'?'var(--tarot)':'var(--reiki)',fontWeight:500}}>{r.prog}</td>
                  <td style={td()}>{r.count}</td>
                  <td style={{...td(),color:r.outstanding>0?'var(--warning)':'var(--text3)'}}>{inr(r.outstanding)}</td>
                  <td style={td()}>{inr(r.monthExpected)}</td>
                  <td style={{...td(),color:'var(--success)'}}>{inr(r.monthReceived)}</td>
                  <td style={{...td(),color:r.monthGap>0?'var(--danger)':'var(--success)'}}>{inr(r.monthGap)}</td>
                  <td style={{...td(),color:r.overdueList.length>0?'var(--danger)':'var(--text3)'}}>{r.overdueList.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {eye(`Overdue EMIs${all.overdueList.length>0?` — ${all.overdueList.length} unpaid`:''}`)}
        <div style={{...tableWrap,border:`1px solid ${all.overdueList.length>0?'var(--danger)':'var(--border)'}`}}>
          {all.overdueList.length===0
            ?<div style={{padding:'2rem',textAlign:'center',color:'var(--success)',fontSize:13}}>✓ No overdue EMIs</div>
            :<table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr>{['Student','Phone','Batch','Program','EMI #','Planned Date','Amount Due','Days Overdue'].map((h,i)=><th key={h} style={i<2?thL:th}>{h}</th>)}</tr></thead>
              <tbody>{all.overdueList.sort((a,b)=>b.daysOverdue-a.daysOverdue).map((s,i)=>(
                <tr key={i}>
                  <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{s.name}</td>
                  <td style={{...td('left')}}>{s.phone}</td>
                  <td style={td()}>{s.batch}</td>
                  <td style={{...td(),color:s.program==='SUPER'?'var(--tarot)':'var(--reiki)'}}>{s.program}</td>
                  <td style={td()}>EMI {s.emiNum}</td>
                  <td style={td()}>{s.overdueDate}</td>
                  <td style={{...td(),color:'var(--danger)',fontWeight:600}}>{inr(s.overdueAmt)}</td>
                  <td style={{...td(),color:s.daysOverdue>30?'var(--danger)':'var(--warning)',fontWeight:600}}>{s.daysOverdue}d</td>
                </tr>
              ))}</tbody>
            </table>
          }
        </div>
      </div>
    </div>
  );
}

export default function EMI() {
  const [data,    setData]    = useState({ students:[], v2:[] });
  const [sales,   setSales]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [demo,    setDemo]    = useState(false);
  const [updated, setUpdated] = useState(null);
  const [view,    setView]    = useState('v2');

  const load = useCallback(async () => {
    setLoading(true);
    try { const [e,s]=await Promise.all([loadEMIData(),loadSalesData()]); setData(e); setSales(s); setDemo(false); }
    catch (e) { setData(getEMISample()); setSales([]); setDemo(true); }
    finally { setLoading(false); setUpdated(new Date()); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{padding:'3rem',color:'var(--text3)',textAlign:'center'}}>Loading EMI data...</div>;

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 24px',borderBottom:'1px solid var(--border)',background:'var(--surface2)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:12,color:demo?'var(--warning)':'var(--success)'}}>
            {demo?'⚠ Sample':'● Live'}
            {updated&&<span style={{color:'var(--text3)',marginLeft:8}}>· {updated.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>}
          </span>
          <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
            {[{k:'v2',l:'V2 — Revenue & Analysis'},{k:'v1',l:'V1 — EMI Tracking'},{k:'v3',l:'V3 - Analysis'}].map(({k,l})=>(
              <button key={k} onClick={()=>setView(k)} style={{border:'none',borderRadius:0,padding:'4px 14px',fontSize:12,fontWeight:500,background:view===k?'var(--tarot)':'transparent',color:view===k?'#fff':'var(--text3)'}}>{l}</button>
            ))}
          </div>
        </div>
        <button onClick={load}>↻ Refresh</button>
      </div>
      {view==='v1'&&<V1Content students={data.students||[]} />}
      {view==='v2'&&<EMIv2 v2Students={data.v2||[]} salesEnrollments={sales} />}
      {view==='v3'&&<V3Content students={data.v2||[]} sales={sales} />}
    </div>
  );
}
