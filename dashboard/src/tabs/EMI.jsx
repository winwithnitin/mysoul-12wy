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

const MONTH_MAP = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const SUPER_PRICE = 250000;
const RGM_PRICE = 120000;

function parseBatchMonth(batchName) {
  if (!batchName) return null;

  if (batchName instanceof Date && !Number.isNaN(batchName.getTime())) {
    return `${batchName.getFullYear()}-${String(batchName.getMonth() + 1).padStart(2, '0')}-01`;
  }

  const raw = String(batchName || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-01`;

  const namedDate = raw.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3,})\s+\d{1,2}\s+(\d{4})/i);
  if (namedDate) {
    const month = MONTH_MAP[namedDate[1].slice(0, 3).toLowerCase()];
    return month ? `${namedDate[2]}-${String(month).padStart(2, '0')}-01` : null;
  }

  const m = raw.toLowerCase().match(/([a-z]+)[\s-]+(\d{4})/);
  if (!m) return null;
  const month = MONTH_MAP[m[1].slice(0, 3)];
  if (!month) return null;
  return `${m[2]}-${String(month).padStart(2, '0')}-01`;
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(iso, months) {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthLabel(iso) {
  if (!iso) return '--';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { month:'short', year:'numeric' });
}

function batchDisplayName(program, launchISO, fallback) {
  const p = String(program || '').toUpperCase();
  const label = monthLabel(launchISO);
  if (label !== '--') return `${p} - ${label}`;
  return String(fallback || '').trim() || '--';
}

function getStudentBatchDisplay(student) {
  const launchISO = parseBatchMonth(student?.batch) || student?.timestamp || null;
  return batchDisplayName(student?.program, launchISO, student?.batch);
}

function isSuperPipelineProgram(program) {
  const p = String(program || '').toLowerCase();
  return p.includes('tarot - mastery');
}

function isRgmPipelineProgram(program) {
  const p = String(program || '').toLowerCase();
  return p.includes('reiki - l1/l2');
}

function isPipelineProgram(program, launchProgram) {
  return launchProgram === 'RGM' ? isRgmPipelineProgram(program) : isSuperPipelineProgram(program);
}

function pct(value) {
  return value === null || value === undefined ? '--' : `${value.toFixed(1)}%`;
}

function buildLaunchRows(students, sales, launchProgram) {
  const program = launchProgram === 'RGM' ? 'RGM' : 'SUPER';
  const programStudents = (students || []).filter(s => String(s.program || '').toUpperCase() === program);
  const price = program === 'RGM' ? RGM_PRICE : SUPER_PRICE;
  const eventField = program === 'RGM' ? 'rmeDate' : 'tmrDate';
  const eventLabel = program === 'RGM' ? 'RME' : 'TMR';

  const batchNames = [...new Set(programStudents.map(s => s.batch).filter(Boolean))]
    .map(batchName => {
      const batchStudents = programStudents.filter(s => s.batch === batchName);
      const firstStudentDate = batchStudents.map(s => s.timestamp).filter(Boolean).sort()[0] || null;
      const launchISO = parseBatchMonth(batchName) || firstStudentDate;
      const eventDate = batchStudents.map(s => s[eventField] || s.launchEventDate).filter(Boolean).sort()[0] || '';
      return { batchName, launchISO, eventDate };
    })
    .filter(b => b.launchISO)
    .sort((a, b) => a.launchISO.localeCompare(b.launchISO));

  return batchNames.map((batch, index) => {
    const prev = batchNames[index - 1] || null;
    const batchStudents = programStudents.filter(s => s.batch === batch.batchName);
    const currentEventDate = batch.eventDate || batch.launchISO;
    const previousEventDate = prev ? (prev.eventDate || prev.launchISO) : null;
    const poolStart = previousEventDate ? addDays(previousEventDate, 1) : addMonths(currentEventDate, -4);
    const poolEnd = currentEventDate;
    const l1Rows = (sales || []).filter(e => e.date >= poolStart && e.date <= poolEnd && isPipelineProgram(e.program, program));
    const l1Students = l1Rows.length;
    const enrolled = batchStudents.length;
    const launchRevenue = enrolled * price;
    const cashReceived = batchStudents.reduce((sum, s) => sum + (s.totalActual || 0), 0);
    const gapDays = previousEventDate ? daysBetween(previousEventDate, currentEventDate) : null;
    const previousRevenue = index > 0 ? null : 0;

    return {
      batchName: batchDisplayName(program, batch.launchISO, batch.batchName),
      sourceBatchName: batch.batchName,
      launchISO: batch.launchISO,
      eventDate: batch.eventDate || null,
      lastEventDate: previousEventDate,
      eventLabel,
      batchMonth: monthLabel(batch.launchISO),
      lastBatchMonth: prev ? monthLabel(prev.launchISO) : '--',
      gapDays,
      poolStart,
      poolEnd,
      l1Students,
      l1Revenue: l1Rows.reduce((sum, e) => sum + (e.amtReceived || e.bookingAmount || 0), 0),
      launchEnrolled: enrolled,
      launchConv: l1Students > 0 ? (enrolled / l1Students) * 100 : null,
      launchRevenue,
      cashReceived,
      collectionPct: launchRevenue > 0 ? (cashReceived / launchRevenue) * 100 : null,
      avgL1PerMonth: l1Students > 0 && gapDays ? l1Students / Math.max(gapDays / 30, 1) : null,
      revenueDiff: previousRevenue,
    };
  }).map((row, index, rows) => ({
    ...row,
    revenueDiff: index === 0 ? null : row.launchRevenue - rows[index - 1].launchRevenue,
  })).sort((a, b) => b.launchISO.localeCompare(a.launchISO));
}

function diffCell(value) {
  if (value === null || value === undefined) return <span style={{color:'var(--text3)'}}>--</span>;
  const up = value >= 0;
  return <span style={{color:up?'var(--success)':'var(--danger)',fontWeight:700}}>{up ? '▲' : '▼'} {inr(Math.abs(value))}</span>;
}

function V5EMIReview({ students }) {
  const [status, setStatus] = useState('MISMATCH');
  const [program, setProgram] = useState('ALL');
  const rows = (students || []).map(s => {
    const actualProgramFee = (s.programFee || 0) - (s.totalOldPayment || 0);
    const dashboardReceived = (s.appnFee || 0) + (s.totalActual || 0);
    const paymentsLoaded = s.paymentsLoaded === true || (s.payments || []).length > 0;
    const respReceived = paymentsLoaded ? (s.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0) : null;
    const calculatedDue = Math.max(0, actualProgramFee - dashboardReceived);
    const receivedDiff = paymentsLoaded ? dashboardReceived - respReceived : null;
    const dueDiff = calculatedDue - (s.emiDue || 0);
    const isMatched = paymentsLoaded && Math.abs(receivedDiff) <= 1 && Math.abs(dueDiff) <= 1;

    return { ...s, actualProgramFee, dashboardReceived, respReceived, calculatedDue, receivedDiff, dueDiff, isMatched, paymentsLoaded };
  }).filter(r => (status === 'ALL' || (status === 'UNLOADED' ? !r.paymentsLoaded : status === 'MATCHED' ? r.isMatched : r.paymentsLoaded && !r.isMatched)) && (program === 'ALL' || r.program === program))
    .sort((a, b) => (a.isMatched === b.isMatched ? (b.receivedDiff || 0) - (a.receivedDiff || 0) : a.isMatched ? 1 : -1));

  const summary = (students || []).reduce((acc, s) => {
    const actualProgramFee = (s.programFee || 0) - (s.totalOldPayment || 0);
    const dashboardReceived = (s.appnFee || 0) + (s.totalActual || 0);
    const paymentsLoaded = s.paymentsLoaded === true || (s.payments || []).length > 0;
    const respReceived = paymentsLoaded ? (s.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0) : null;
    const calculatedDue = Math.max(0, actualProgramFee - dashboardReceived);
    const receivedDiff = paymentsLoaded ? dashboardReceived - respReceived : null;
    const dueDiff = calculatedDue - (s.emiDue || 0);
    const matched = paymentsLoaded && Math.abs(receivedDiff) <= 1 && Math.abs(dueDiff) <= 1;
    acc.students += 1;
    acc.unloaded += paymentsLoaded ? 0 : 1;
    acc.matched += matched ? 1 : 0;
    acc.mismatch += paymentsLoaded && !matched ? 1 : 0;
    acc.netDiff += receivedDiff || 0;
    return acc;
  }, { students:0, matched:0, mismatch:0, unloaded:0, netDiff:0 });

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 24px',borderBottom:'1px solid var(--border)',background:'var(--surface2)',flexWrap:'wrap'}}>
        <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          {['MISMATCH','UNLOADED','ALL','MATCHED'].map(s=><button key={s} onClick={()=>setStatus(s)} style={{border:'none',borderRadius:0,padding:'4px 12px',fontSize:12,fontWeight:500,background:status===s?'var(--tarot)':'transparent',color:status===s?'#fff':'var(--text3)'}}>{s}</button>)}
        </div>
        <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          {['ALL','SUPER','RGM'].map(p=><button key={p} onClick={()=>setProgram(p)} style={{border:'none',borderRadius:0,padding:'4px 12px',fontSize:12,fontWeight:500,background:program===p?'var(--tarot)':'transparent',color:program===p?'#fff':'var(--text3)'}}>{p}</button>)}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:1,background:'var(--border)',marginBottom:24}}>
        {[['Students',num(summary.students),null],['Matched',num(summary.matched),'var(--success)'],['Needs Review',num(summary.mismatch),summary.mismatch?'var(--danger)':'var(--success)'],['Resp EMI Not Loaded',num(summary.unloaded),summary.unloaded?'var(--warning)':'var(--success)'],['Net Difference',inr(summary.netDiff),summary.netDiff?'var(--warning)':'var(--success)']].map(([label,value,color])=>(
          <div key={label} style={{background:'var(--surface)',padding:'16px 20px'}}>
            <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>{label}</div>
            <div style={{fontSize:22,fontWeight:600,color:color||'var(--text)'}}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{padding:'0 24px 32px'}}>
        {eye('EMI dashboard vs Resp EMI verification')}
        <div style={{fontSize:12,color:summary.unloaded?'var(--warning)':'var(--text3)',marginBottom:12}}>
          Expected match: EMI Dashboard received = Application Fee + Total Actual Amount. Resp EMI received = sum of Amount Received in Resp EMI for the same student. If Resp EMI is not loaded, this dashboard needs the Apps Script endpoint to return payment rows from private batch sheets.
        </div>
        <div style={tableWrap}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr>{['Status','Name','Batch','Program','Actual Program Fee','Dashboard Received','Resp EMI Sum','Difference','Calculated Due','Dashboard Due','Due Diff','Payments','Next EMI Due'].map((h,i)=><th key={h} style={i<4?thL:th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length===0?<tr><td colSpan={13} style={{...td(),textAlign:'center',padding:'2rem'}}>No rows for this filter.</td></tr>
              :rows.map((r,i)=>(
                <tr key={`${r.email || r.phone || r.name}-${r.batch}-${i}`} style={{background:!r.paymentsLoaded?'rgba(245,158,11,.10)':r.isMatched?'transparent':'rgba(239,68,68,.10)'}}>
                  <td style={{...td('left'),color:!r.paymentsLoaded?'var(--warning)':r.isMatched?'var(--success)':'var(--danger)',fontWeight:800}}>{!r.paymentsLoaded?'NOT LOADED':r.isMatched?'OK':'VERIFY'}</td>
                  <td style={{...td('left'),color:'var(--text)',fontWeight:600}}>{r.name || '--'}</td>
                  <td style={td('left')}>{getStudentBatchDisplay(r)}</td>
                  <td style={{...td('left'),color:r.program==='SUPER'?'var(--tarot)':'var(--reiki)',fontWeight:600}}>{r.program || '--'}</td>
                  <td style={td()}>{inr(r.actualProgramFee)}</td>
                  <td style={td()}>{inr(r.dashboardReceived)}</td>
                  <td style={td()}>{r.paymentsLoaded ? inr(r.respReceived) : '--'}</td>
                  <td style={{...td(),color:!r.paymentsLoaded?'var(--warning)':Math.abs(r.receivedDiff)>1?'var(--danger)':'var(--success)',fontWeight:800}}>{r.paymentsLoaded ? inr(r.receivedDiff) : 'Not loaded'}</td>
                  <td style={td()}>{inr(r.calculatedDue)}</td>
                  <td style={td()}>{inr(r.emiDue || 0)}</td>
                  <td style={{...td(),color:Math.abs(r.dueDiff)>1?'var(--danger)':'var(--success)',fontWeight:800}}>{inr(r.dueDiff)}</td>
                  <td style={td()}>{r.paymentsLoaded ? (r.payments || []).length : '--'}</td>
                  <td style={td()}>{r.nextDueDate || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function V4LaunchAnalysis({ students, sales }) {
  const [launchProgram, setLaunchProgram] = useState('SUPER');
  const isRgm = launchProgram === 'RGM';
  const eventLabel = isRgm ? 'RME' : 'TMR';
  const pipelineLabel = isRgm ? 'Reiki L1/L2' : 'Tarot Mastery';
  const color = isRgm ? 'var(--reiki)' : 'var(--tarot)';
  const rows = buildLaunchRows(students, sales, launchProgram);
  const latest = rows[0] || null;
  const prior = rows[1] || null;
  const today = todayStr();
  const lastEventDate = latest?.eventDate || latest?.launchISO || addMonths(today, -4);
  const freshPool = (sales || []).filter(e => e.date > lastEventDate && e.date <= today && isPipelineProgram(e.program, launchProgram));
  const avgConv = rows.filter(r => r.launchConv !== null).slice(0, 4).reduce((sum, r, _, arr) => sum + (r.launchConv / arr.length), 0);
  const freshLeads = freshPool.length;
  const projectedEnrollments = avgConv ? Math.round(freshLeads * avgConv / 100) : null;
  const avgRevenuePerEnrollment = rows.reduce((sum, r) => sum + (r.launchEnrolled ? r.launchRevenue / r.launchEnrolled : 0), 0) / Math.max(rows.filter(r => r.launchEnrolled).length, 1);
  const projectedRevenue = projectedEnrollments ? projectedEnrollments * avgRevenuePerEnrollment : null;
  const currentGap = latest ? daysBetween(lastEventDate, today) : null;
  const avgGap = rows.filter(r => r.gapDays).reduce((sum, r, _, arr) => sum + (r.gapDays / arr.length), 0);

  let recommendation = `Need more ${launchProgram} launch history before giving a strong next-launch recommendation.`;
  if (latest && avgConv) {
    if (freshLeads >= Math.max(80, (prior?.l1Students || 0) * 0.8)) {
      recommendation = `You already have ${num(freshLeads)} fresh ${pipelineLabel} students since the last ${eventLabel}. This is enough to start warming the next ${launchProgram} launch now and aim for a live conversion window within the next 2-3 weeks.`;
    } else if (currentGap && avgGap && currentGap >= avgGap * 0.8) {
      recommendation = `The launch gap is getting close to your historical rhythm, but the fresh ${pipelineLabel} pool is only ${num(freshLeads)}. Spend the next 2 weeks increasing the eligible student base before opening ${launchProgram}.`;
    } else {
      recommendation = `Keep building the ${pipelineLabel} pool first. At the current pool size of ${num(freshLeads)}, the next ${launchProgram} launch should be prepared but not pushed hard until the fresh student base is stronger.`;
    }
  }

  return (
    <div style={{padding:'20px 24px 40px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,gap:12,flexWrap:'wrap'}}>
        {eye(`${launchProgram} launch performance — batch by batch`)}
        <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          {['SUPER','RGM'].map(p=><button key={p} onClick={()=>setLaunchProgram(p)} style={{border:'none',borderRadius:0,padding:'5px 16px',fontSize:12,fontWeight:600,background:launchProgram===p?'var(--tarot)':'transparent',color:launchProgram===p?'#fff':'var(--text3)'}}>{p}</button>)}
        </div>
      </div>
      <div style={tableWrap}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead>
            <tr>{['Batch Name','Batch Month',`${eventLabel} Date`,'Gap',`${pipelineLabel} Students`,`${pipelineLabel} Revenue`,`${launchProgram} Enrolled`,`${launchProgram} Conv %`,`${launchProgram} Revenue`,'Cash Received','Collection %','Avg Pipeline / Month','Revenue Diff'].map((h,i)=><th key={h} style={i===0?thL:th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length===0?<tr><td colSpan={13} style={{...td(),textAlign:'center',padding:'2rem'}}>No {launchProgram} batches found.</td></tr>
            :rows.map(r=>(
              <tr key={r.batchName}>
                <td style={{...td('left'),color:'var(--text)',fontWeight:600}}>{r.batchName}</td>
                <td style={td()}>{r.batchMonth}</td>
                <td style={td()}>{r.eventDate || '--'}</td>
                <td style={td()}>{r.gapDays === null ? '--' : `${r.gapDays}d`}</td>
                <td style={{...td(),fontWeight:600,color:'var(--text)'}}>{num(r.l1Students)}</td>
                <td style={td()}>{inr(r.l1Revenue)}</td>
                <td style={{...td(),color,fontWeight:700}}>{num(r.launchEnrolled)}</td>
                <td style={{...td(),color:r.launchConv >= 10 ? 'var(--success)' : r.launchConv >= 5 ? 'var(--warning)' : 'var(--danger)',fontWeight:700}}>{pct(r.launchConv)}</td>
                <td style={{...td(),color:'var(--success)',fontWeight:700}}>{inr(r.launchRevenue)}</td>
                <td style={td()}>{inr(r.cashReceived)}</td>
                <td style={td()}>{pct(r.collectionPct)}</td>
                <td style={td()}>{r.avgL1PerMonth === null ? '--' : num(Math.round(r.avgL1PerMonth))}</td>
                <td style={td()}>{diffCell(r.revenueDiff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {eye('AI business coach analysis')}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 20px'}}>
          <div style={{fontSize:13,fontWeight:700,color,marginBottom:12}}>Next launch readiness</div>
          {[
            [`Fresh ${pipelineLabel} pool since last ${eventLabel}`, num(freshLeads)],
            [`Avg recent ${launchProgram} conversion`, avgConv ? `${avgConv.toFixed(1)}%` : '--'],
            [`Projected ${launchProgram} enrollments`, projectedEnrollments ? num(projectedEnrollments) : '--'],
            [`Projected ${launchProgram} revenue`, projectedRevenue ? inr(projectedRevenue) : '--'],
          ].map(([label,value])=>(
            <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border2)'}}>
              <span style={{fontSize:12,color:'var(--text2)'}}>{label}</span>
              <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 20px'}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--success)',marginBottom:10}}>Recommendation</div>
          <p style={{fontSize:13,lineHeight:1.6,color:'var(--text2)',margin:'0 0 10px'}}>{recommendation}</p>
          <p style={{fontSize:12,lineHeight:1.6,color:'var(--text3)',margin:0}}>Pipeline rule: SUPER uses only Tarot Mastery students around TMR events. RGM uses only Reiki L1/L2 students around RME events.</p>
        </div>
      </div>
    </div>
  );
}

function V3Content({ students, sales }) {
  const [prog, setProg] = useState('ALL');
  const [batch, setBatch] = useState('ALL');
  const allBatches = [...new Set((students || []).map(s => s.batch).filter(Boolean))]
    .sort((a, b) => getStudentBatchDisplay((students || []).find(s => s.batch === a)).localeCompare(getStudentBatchDisplay((students || []).find(s => s.batch === b))));
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
          {allBatches.map(b=><option key={b} value={b}>{getStudentBatchDisplay((students || []).find(s => s.batch === b))}</option>)}
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
                  <td style={{...td('left'),color:s.program==='SUPER'?'var(--tarot)':'var(--reiki)',fontWeight:500}}>{getStudentBatchDisplay(s)}</td>
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
    let usingSample = false;
    try {
      const e = await loadEMIData();
      setData(e);
    } catch (e) {
      setData(getEMISample());
      usingSample = true;
    }
    try {
      const s = await loadSalesData();
      setSales(s);
    } catch (e) {
      setSales([]);
    }
    setDemo(usingSample);
    setLoading(false);
    setUpdated(new Date());
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
            {[{k:'v2',l:'V2 — Revenue & Analysis'},{k:'v1',l:'V1 — EMI Tracking'},{k:'v3',l:'V3 - Analysis'},{k:'v4',l:'V4 - Launch Analysis'},{k:'v5',l:'V5 - EMI Review'}].map(({k,l})=>(
              <button key={k} onClick={()=>setView(k)} style={{border:'none',borderRadius:0,padding:'4px 14px',fontSize:12,fontWeight:500,background:view===k?'var(--tarot)':'transparent',color:view===k?'#fff':'var(--text3)'}}>{l}</button>
            ))}
          </div>
        </div>
        <button onClick={load}>↻ Refresh</button>
      </div>
      {view==='v1'&&<V1Content students={data.students||[]} />}
      {view==='v2'&&<EMIv2 v2Students={data.v2||[]} salesEnrollments={sales} />}
      {view==='v3'&&<V3Content students={data.v2||[]} sales={sales} />}
      {view==='v4'&&<V4LaunchAnalysis students={data.v2||[]} sales={sales} />}
      {view==='v5'&&<V5EMIReview students={data.v2||[]} />}
    </div>
  );
}
