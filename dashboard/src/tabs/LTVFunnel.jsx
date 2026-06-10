import { useState, useEffect, useCallback } from 'react';
import { loadLTVFunnelData } from '../utils/sheets.js';
import { inr, num } from '../utils/format.js';

// ─── Shared constants ─────────────────────────────────────────────────────────
const TAROT_PROGS  = ['tarot - mastery','tarot - diploma','tarot - health','30 days mani'];
const REIKI_PROGS  = ['reiki - l1/l2','reiki - l3','money reiki',"ho'oponopono",'hooponopono'];
const PCOS_PROGS   = ['pcos','pcod','endometriosis','fertility','hormonal'];
const FUNNEL_COLORS = { Tarot:'var(--tarot)', Reiki:'var(--reiki)', PCOS:'var(--pcos)' };

// ─── Utility functions ────────────────────────────────────────────────────────
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
function addMonths(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
function moLabel(iso) { // "2026-06" → "Jun 26"
  if (!iso) return '';
  const [y, m] = iso.split('-');
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1];
  return `${mo} ${String(y).slice(2)}`;
}
function qLabel(iso) {
  if (!iso) return 'Unknown';
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return 'Unknown';
  return `Q${Math.ceil((d.getMonth()+1)/3)} ${d.getFullYear()}`;
}
function classifyProgram(program) {
  const p = (program||'').toLowerCase();
  if (p==='super') return 'SUPER';
  if (p==='rgm'||p.includes('grandmaster')) return 'RGM';
  if (p.includes('tarot')&&(p.includes('mastery')||p.includes('diploma'))) return 'Tarot_L1';
  if ((p.includes('reiki')&&(p.includes('l1')||p.includes('l2')))||p==='reiki - l1/l2') return 'Reiki_L1';
  if (p.includes('pcos')||p.includes('pcod')||p.includes('endometriosis')||p.includes('fertility')||p.includes('hormonal')) return 'PCOS_L1';
  if (p.includes('reiki')&&p.includes('l3')) return 'Reiki_L3';
  if (p.includes('tarot')&&p.includes('health')) return 'CrossSell';
  if (p.includes('money reiki')||p.includes("ho'oponopono")||p.includes('hooponopono')||p.includes('30 days mani')||p.includes('mentor')) return 'CrossSell';
  return 'Other';
}
function getSalesFunnel(program) {
  const t = classifyProgram(program);
  if (t==='Tarot_L1'||t==='CrossSell') return 'Tarot';
  if (t==='Reiki_L1'||t==='Reiki_L3')  return 'Reiki';
  if (t==='PCOS_L1')                    return 'PCOS';
  return null;
}
function pctColor(v, hi=15, mid=8) {
  if (!v&&v!==0) return 'var(--text3)';
  if (v>=hi) return 'var(--success)';
  if (v>=mid) return 'var(--warning)';
  return 'var(--danger)';
}
function roasColor(v) {
  if (!v) return 'var(--text3)';
  if (v>=3) return 'var(--success)';
  if (v>=1.5) return 'var(--warning)';
  return 'var(--danger)';
}
function addMonthsISO(iso, n) {
  const d = new Date(iso+'T12:00:00');
  d.setMonth(d.getMonth()+n);
  return d.toISOString().slice(0,10);
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const th  = { padding:'10px 14px', textAlign:'right', fontSize:11, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, borderBottom:'1px solid var(--border)' };
const thL = { ...th, textAlign:'left' };
const td  = (a='right') => ({ padding:'9px 14px', borderBottom:'1px solid var(--border2)', color:'var(--text2)', fontSize:13, textAlign:a });
const box = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:24 };
const eyebrow = (t) => <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>{t}</div>;
const innerPad = { padding:'0 24px 32px' };

// ─── Student profile builder ──────────────────────────────────────────────────
function buildProfiles(sales, emiV2) {
  const byPhone = new Map(), byEmail = new Map();
  const getOrCreate = (phone, email, name) => {
    if (phone && byPhone.has(phone)) return byPhone.get(phone);
    if (email && byEmail.has(email)) {
      const p = byEmail.get(email);
      if (phone) { p.phone=p.phone||phone; byPhone.set(phone,p); }
      return p;
    }
    const profile = { phone:phone||'', email:email||'', name:name||'', purchases:[] };
    if (phone) byPhone.set(phone, profile);
    if (email) byEmail.set(email, profile);
    return profile;
  };
  for (const e of sales) {
    const p = getOrCreate(e.phone, e.email, e.name);
    p.name = p.name||e.name;
    p.purchases.push({ date:e.date, program:e.program, revenue:e.amtReceived||e.programFee, type:classifyProgram(e.program) });
  }
  for (const s of emiV2) {
    const p = getOrCreate(s.phone, s.email, s.name);
    p.name = p.name||s.name;
    p.purchases.push({ date:s.timestamp, program:s.program, revenue:s.totalActual||0, type:s.program });
  }
  const seen = new Set(), profiles = [];
  for (const p of [...byPhone.values(),...byEmail.values()]) {
    if (seen.has(p)) continue; seen.add(p);
    p.purchases.sort((a,b)=>(a.date||'')<(b.date||'')?-1:1);
    const firstL1 = p.purchases.find(x=>['Tarot_L1','Reiki_L1','PCOS_L1'].includes(x.type));
    p.firstDate = firstL1?.date||p.purchases[0]?.date;
    p.cohort    = p.firstDate?qLabel(p.firstDate):'Unknown';
    p.ltv       = p.purchases.reduce((s,x)=>s+(x.revenue||0),0);
    p.hasL3     = p.purchases.some(x=>['Reiki_L3','CrossSell'].includes(x.type));
    p.hasSuper  = p.purchases.some(x=>x.type==='SUPER');
    p.hasRgm    = p.purchases.some(x=>x.type==='RGM');
    p.funnel    = firstL1?(firstL1.type==='Tarot_L1'?'Tarot':firstL1.type==='Reiki_L1'?'Reiki':'PCOS'):'Unknown';
    p.programCount = p.purchases.length;
    profiles.push(p);
  }
  return profiles;
}
function buildCohorts(profiles) {
  const map = {};
  for (const p of profiles) {
    const c = p.cohort;
    if (!map[c]) map[c]={ cohort:c, students:0, totalLtv:0, withL3:0, withSuper:0, withRgm:0 };
    const m=map[c]; m.students++; m.totalLtv+=p.ltv;
    if(p.hasL3)m.withL3++; if(p.hasSuper)m.withSuper++; if(p.hasRgm)m.withRgm++;
  }
  return Object.values(map).map(c=>({
    ...c, avgLtv:c.students>0?Math.round(c.totalLtv/c.students):0,
    l3Rate:c.students>0?+((c.withL3/c.students)*100).toFixed(1):0,
    superRate:c.students>0?+((c.withSuper/c.students)*100).toFixed(1):0,
    rgmRate:c.students>0?+((c.withRgm/c.students)*100).toFixed(1):0,
  })).sort((a,b)=>a.cohort<b.cohort?-1:1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW 1: Funnel Waterfall
// ═══════════════════════════════════════════════════════════════════════════════
function WaterfallBar({ label, count, maxCount, convPct, convLabel, color, breakdown }) {
  const pct = maxCount>0?Math.max((count/maxCount)*100,0.5):0;
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:5 }}>
        <span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{label}</span>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {convPct!==null&&convPct!==undefined&&(
            <span style={{ fontSize:11, fontWeight:600, color:pctColor(convPct), background:'var(--surface2)', padding:'2px 7px', borderRadius:4 }}>
              ↓ {convPct}% {convLabel||''}
            </span>
          )}
          <span style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{num(count)}</span>
        </div>
      </div>
      <div style={{ height:12, background:'var(--border)', borderRadius:6 }}>
        <div style={{ height:12, width:`${pct}%`, background:color, borderRadius:6 }} />
      </div>
      {breakdown&&(
        <div style={{ display:'flex', gap:14, marginTop:5 }}>
          {Object.entries(breakdown).filter(([,v])=>v>0).map(([k,v])=>(
            <span key={k} style={{ fontSize:11, color:'var(--text3)' }}>{k}: <strong style={{ color:'var(--text2)' }}>{num(v)}</strong></span>
          ))}
        </div>
      )}
    </div>
  );
}

function FunnelView({ leadCounts, sales, emiV2 }) {
  const tarotL1   = sales.filter(e=>classifyProgram(e.program)==='Tarot_L1').length;
  const reikiL1   = sales.filter(e=>classifyProgram(e.program)==='Reiki_L1').length;
  const pcosL1    = sales.filter(e=>classifyProgram(e.program)==='PCOS_L1').length;
  const allL1     = tarotL1+reikiL1+pcosL1;
  const crossSell = sales.filter(e=>classifyProgram(e.program)==='CrossSell').length;
  const reikiL3   = sales.filter(e=>classifyProgram(e.program)==='Reiki_L3').length;
  const allL3     = crossSell+reikiL3;
  const superCount = emiV2.filter(s=>s.program==='SUPER').length;
  const rgmCount   = emiV2.filter(s=>s.program==='RGM').length;
  const totalLeads = leadCounts.Tarot+leadCounts.Reiki+leadCounts.PCOS;
  const profiles   = buildProfiles(sales, emiV2);
  const cohorts    = buildCohorts(profiles);

  const funnelRows = [
    { funnel:'Tarot', color:'var(--tarot)', leads:leadCounts.Tarot, l1:tarotL1, l3:crossSell, ht:superCount, htLabel:'SUPER',
      l1Pct:leadCounts.Tarot>0?+((tarotL1/leadCounts.Tarot)*100).toFixed(2):0,
      l3Pct:tarotL1>0?+((crossSell/tarotL1)*100).toFixed(1):0,
      htPct:tarotL1>0?+((superCount/tarotL1)*100).toFixed(1):0 },
    { funnel:'Reiki', color:'var(--reiki)', leads:leadCounts.Reiki, l1:reikiL1, l3:reikiL3, ht:rgmCount, htLabel:'RGM',
      l1Pct:leadCounts.Reiki>0?+((reikiL1/leadCounts.Reiki)*100).toFixed(2):0,
      l3Pct:reikiL1>0?+((reikiL3/reikiL1)*100).toFixed(1):0,
      htPct:reikiL1>0?+((rgmCount/reikiL1)*100).toFixed(1):0 },
    { funnel:'PCOS', color:'var(--pcos)', leads:leadCounts.PCOS, l1:pcosL1, l3:0, ht:0, htLabel:'—',
      l1Pct:leadCounts.PCOS>0?+((pcosL1/leadCounts.PCOS)*100).toFixed(2):0, l3Pct:0, htPct:0 },
  ];

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:1, background:'var(--border)', marginBottom:24 }}>
        {[
          {label:'Total leads (all-time)',value:num(totalLeads)},
          {label:'L1 enrolled',value:num(allL1),color:'var(--tarot)'},
          {label:'L1 conv rate',value:totalLeads>0?((allL1/totalLeads)*100).toFixed(2)+'%':'—'},
          {label:'SUPER enrolled',value:num(superCount),color:'var(--tarot)'},
          {label:'RGM enrolled',value:num(rgmCount),color:'var(--reiki)'},
        ].map(({label,value,color})=>(
          <div key={label} style={{background:'var(--surface)',padding:'16px 20px'}}>
            <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>{label}</div>
            <div style={{fontSize:22,fontWeight:600,color:color||'var(--text)'}}>{value}</div>
          </div>
        ))}
      </div>
      <div style={innerPad}>
        {eyebrow('All-time combined funnel')}
        <div style={{...box,padding:'20px 24px'}}>
          <WaterfallBar label="Total Leads"    count={totalLeads}  maxCount={totalLeads} convPct={null} color="var(--text3)" breakdown={{Tarot:leadCounts.Tarot,Reiki:leadCounts.Reiki,PCOS:leadCounts.PCOS}} />
          <WaterfallBar label="L1 Enrollments" count={allL1}       maxCount={totalLeads} convPct={totalLeads>0?+((allL1/totalLeads)*100).toFixed(2):null} convLabel="of leads" color="var(--tarot)" breakdown={{Tarot:tarotL1,Reiki:reikiL1,PCOS:pcosL1}} />
          <WaterfallBar label="L3 / Upsells"   count={allL3}       maxCount={totalLeads} convPct={allL1>0?+((allL3/allL1)*100).toFixed(1):null} convLabel="of L1" color="var(--pcos)" breakdown={{'Reiki L3':reikiL3,'Cross-sells':crossSell}} />
          <WaterfallBar label="SUPER"           count={superCount}  maxCount={totalLeads} convPct={tarotL1>0?+((superCount/tarotL1)*100).toFixed(1):null} convLabel="of Tarot L1" color="var(--tarot)" />
          <WaterfallBar label="RGM"             count={rgmCount}    maxCount={totalLeads} convPct={reikiL1>0?+((rgmCount/reikiL1)*100).toFixed(1):null} convLabel="of Reiki L1" color="var(--reiki)" />
        </div>
        {eyebrow('Per-funnel conversion breakdown')}
        <div style={box}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>{['Funnel','Leads','L1 Enrolled','Lead→L1%','L3/Upsell','L1→L3%','SUPER/RGM','L1→HT%'].map((h,i)=><th key={h} style={i===0?thL:th}>{h}</th>)}</tr></thead>
            <tbody>{funnelRows.map(r=>(
              <tr key={r.funnel}>
                <td style={{...td('left'),color:r.color,fontWeight:600}}>{r.funnel}</td>
                <td style={td()}>{num(r.leads)}</td>
                <td style={td()}>{num(r.l1)}</td>
                <td style={{...td(),color:pctColor(r.l1Pct,5,2),fontWeight:600}}>{r.l1Pct}%</td>
                <td style={td()}>{r.l3>0?num(r.l3):'—'}</td>
                <td style={{...td(),color:r.l3>0?pctColor(r.l3Pct,20,10):'var(--text3)',fontWeight:r.l3>0?600:400}}>{r.l3>0?r.l3Pct+'%':'—'}</td>
                <td style={{...td(),color:r.ht>0?(r.htLabel==='SUPER'?'var(--tarot)':'var(--reiki)'):'var(--text3)',fontWeight:600}}>{r.ht>0?`${num(r.ht)} ${r.htLabel}`:'—'}</td>
                <td style={{...td(),color:r.ht>0?pctColor(r.htPct,15,8):'var(--text3)',fontWeight:r.ht>0?600:400}}>{r.ht>0?r.htPct+'%':'—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {eyebrow('Cohort progression')}
        <div style={box}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>{['Cohort','Students','Avg LTV','L3/Upsell','L3%','SUPER','SUPER%','RGM','RGM%','Total Rev'].map((h,i)=><th key={h} style={i===0?thL:th}>{h}</th>)}</tr></thead>
            <tbody>
              {cohorts.filter(c=>c.cohort!=='Unknown').length===0
                ?<tr><td colSpan={10} style={{...td(),textAlign:'center',padding:'2rem'}}>No cohort data yet.</td></tr>
                :cohorts.filter(c=>c.cohort!=='Unknown').map(c=>(
                  <tr key={c.cohort}>
                    <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{c.cohort}</td>
                    <td style={td()}>{c.students}</td>
                    <td style={{...td(),color:'var(--success)',fontWeight:600}}>{inr(c.avgLtv)}</td>
                    <td style={td()}>{c.withL3}</td>
                    <td style={{...td(),color:pctColor(c.l3Rate,20,10),fontWeight:600}}>{c.l3Rate}%</td>
                    <td style={{...td(),color:'var(--tarot)',fontWeight:600}}>{c.withSuper}</td>
                    <td style={{...td(),color:pctColor(c.superRate,15,8),fontWeight:600}}>{c.superRate}%</td>
                    <td style={{...td(),color:'var(--reiki)',fontWeight:600}}>{c.withRgm}</td>
                    <td style={{...td(),color:pctColor(c.rgmRate,10,5),fontWeight:600}}>{c.rgmRate}%</td>
                    <td style={{...td(),color:'var(--success)',fontWeight:600}}>{inr(c.totalLtv)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW 2: LTV Tracker
// ═══════════════════════════════════════════════════════════════════════════════
function LTVView({ sales, emiV2 }) {
  const [progFilter, setProgFilter] = useState('ALL');
  const [ltvFilter,  setLtvFilter]  = useState('ALL');
  const [search,     setSearch]     = useState('');
  const profiles = buildProfiles(sales, emiV2);
  const cohorts  = buildCohorts(profiles);
  const totalStudents = profiles.length;
  const avgLtv = totalStudents>0?Math.round(profiles.reduce((s,p)=>s+p.ltv,0)/totalStudents):0;
  const superStudents = profiles.filter(p=>p.hasSuper).length;
  const rgmStudents   = profiles.filter(p=>p.hasRgm).length;
  const multiProgram  = profiles.filter(p=>p.programCount>1).length;
  const dist=[
    {label:'₹0–10K',   count:profiles.filter(p=>p.ltv>0&&p.ltv<=10000).length},
    {label:'₹10–35K',  count:profiles.filter(p=>p.ltv>10000&&p.ltv<=35000).length},
    {label:'₹35–75K',  count:profiles.filter(p=>p.ltv>35000&&p.ltv<=75000).length},
    {label:'₹75K–2.5L',count:profiles.filter(p=>p.ltv>75000&&p.ltv<=250000).length},
    {label:'₹2.5L+',   count:profiles.filter(p=>p.ltv>250000).length},
  ];
  const maxDist=Math.max(...dist.map(d=>d.count),1);
  const filtered=profiles.filter(p=>{
    if(progFilter!=='ALL'&&p.funnel!==progFilter) return false;
    if(ltvFilter==='SUPER'&&!p.hasSuper) return false;
    if(ltvFilter==='RGM'&&!p.hasRgm) return false;
    if(ltvFilter==='Multi'&&p.programCount<2) return false;
    if(search&&!p.name?.toLowerCase().includes(search.toLowerCase())&&!p.phone?.includes(search)) return false;
    return true;
  }).sort((a,b)=>b.ltv-a.ltv);
  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:1,background:'var(--border)',marginBottom:24}}>
        {[
          {label:'Unique students',value:num(totalStudents)},
          {label:'Average LTV',value:inr(avgLtv),color:'var(--success)'},
          {label:'Have SUPER',value:`${num(superStudents)} (${totalStudents>0?+((superStudents/totalStudents)*100).toFixed(1):0}%)`,color:'var(--tarot)'},
          {label:'Have RGM',value:`${num(rgmStudents)} (${totalStudents>0?+((rgmStudents/totalStudents)*100).toFixed(1):0}%)`,color:'var(--reiki)'},
          {label:'Multi-program',value:`${num(multiProgram)} (${totalStudents>0?+((multiProgram/totalStudents)*100).toFixed(1):0}%)`,color:'var(--pcos)'},
        ].map(({label,value,color})=>(
          <div key={label} style={{background:'var(--surface)',padding:'16px 20px'}}>
            <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>{label}</div>
            <div style={{fontSize:20,fontWeight:600,color:color||'var(--text)'}}>{value}</div>
          </div>
        ))}
      </div>
      <div style={innerPad}>
        {eyebrow('LTV distribution')}
        <div style={{...box,padding:'20px 24px'}}>
          {dist.map(d=>(
            <div key={d.label} style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
              <div style={{width:80,fontSize:12,color:'var(--text2)',textAlign:'right',flexShrink:0}}>{d.label}</div>
              <div style={{flex:1,height:10,background:'var(--border)',borderRadius:5}}>
                <div style={{height:10,width:`${(d.count/maxDist)*100}%`,background:'var(--tarot)',borderRadius:5}} />
              </div>
              <div style={{width:50,fontSize:13,fontWeight:600,color:'var(--text)',textAlign:'right',flexShrink:0}}>{num(d.count)}</div>
            </div>
          ))}
        </div>
        {eyebrow('Cohort LTV')}
        <div style={box}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>{['Cohort','Students','Avg LTV','Max LTV','% Multi','% SUPER','% RGM','Total Rev'].map((h,i)=><th key={h} style={i===0?thL:th}>{h}</th>)}</tr></thead>
            <tbody>
              {cohorts.filter(c=>c.cohort!=='Unknown').map(c=>{
                const cp=profiles.filter(p=>p.cohort===c.cohort);
                const mx=Math.max(...cp.map(p=>p.ltv),0);
                const mPct=c.students>0?+((cp.filter(p=>p.programCount>1).length/c.students)*100).toFixed(1):0;
                return(<tr key={c.cohort}>
                  <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{c.cohort}</td>
                  <td style={td()}>{c.students}</td>
                  <td style={{...td(),color:'var(--success)',fontWeight:700}}>{inr(c.avgLtv)}</td>
                  <td style={td()}>{inr(mx)}</td>
                  <td style={{...td(),color:pctColor(mPct,30,15),fontWeight:600}}>{mPct}%</td>
                  <td style={{...td(),color:pctColor(c.superRate,15,8),fontWeight:600}}>{c.superRate}%</td>
                  <td style={{...td(),color:pctColor(c.rgmRate,10,5),fontWeight:600}}>{c.rgmRate}%</td>
                  <td style={{...td(),color:'var(--success)',fontWeight:600}}>{inr(c.totalLtv)}</td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
        {eyebrow(`Individual LTV — ${filtered.length} students`)}
        <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap'}}>
          <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
            {['ALL','Tarot','Reiki','PCOS'].map(f=>(
              <button key={f} onClick={()=>setProgFilter(f)} style={{border:'none',borderRadius:0,padding:'5px 12px',fontSize:12,fontWeight:500,background:progFilter===f?'var(--tarot)':'transparent',color:progFilter===f?'#fff':'var(--text3)'}}>{f}</button>
            ))}
          </div>
          <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
            {[['ALL','All'],['SUPER','Has SUPER'],['RGM','Has RGM'],['Multi','Multi-prog']].map(([k,l])=>(
              <button key={k} onClick={()=>setLtvFilter(k)} style={{border:'none',borderRadius:0,padding:'5px 12px',fontSize:12,fontWeight:500,background:ltvFilter===k?'var(--reiki)':'transparent',color:ltvFilter===k?'#fff':'var(--text3)'}}>{l}</button>
            ))}
          </div>
          <input placeholder="Search name or phone" value={search} onChange={e=>setSearch(e.target.value)}
            style={{background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text)',padding:'5px 12px',borderRadius:8,fontSize:12,flex:'1 1 180px'}} />
        </div>
        <div style={box}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>{['Student','Phone','Cohort','Funnel','Programs','LTV','SUPER','RGM'].map((h,i)=><th key={h} style={i<2?thL:th}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.slice(0,100).map((p,i)=>(
                <tr key={i}>
                  <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{p.name||'—'}</td>
                  <td style={{...td('left')}}>{p.phone||'—'}</td>
                  <td style={td()}>{p.cohort}</td>
                  <td style={{...td(),color:FUNNEL_COLORS[p.funnel]||'var(--text3)',fontSize:11}}>{p.funnel}</td>
                  <td style={td()}>{p.programCount}</td>
                  <td style={{...td(),color:'var(--success)',fontWeight:700}}>{inr(p.ltv)}</td>
                  <td style={{...td(),color:p.hasSuper?'var(--tarot)':'var(--text3)',fontWeight:p.hasSuper?600:400}}>{p.hasSuper?'✓':'—'}</td>
                  <td style={{...td(),color:p.hasRgm?'var(--reiki)':'var(--text3)',fontWeight:p.hasRgm?600:400}}>{p.hasRgm?'✓':'—'}</td>
                </tr>
              ))}
              {filtered.length>100&&<tr><td colSpan={8} style={{...td(),textAlign:'center',color:'var(--text3)',padding:'1rem'}}>Showing top 100 of {filtered.length}. Use filters to narrow down.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW 3: ROAS Monthly + Unit Economics
// ═══════════════════════════════════════════════════════════════════════════════
function ROASEconView({ sales, emiV2, adSpend }) {
  // Build monthly data (last 12 months)
  const today = todayISO();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const start = addMonthsISO(today, -i);
    const mo    = start.slice(0, 7);
    const end   = addMonthsISO(start.slice(0,7)+'-01', 1);
    months.push({ mo, label: moLabel(mo), start: mo+'-01', end });
  }

  const monthlyData = months.map(({ mo, label, start, end }) => {
    const funnels = { Tarot:{spend:0,rev:0}, Reiki:{spend:0,rev:0}, PCOS:{spend:0,rev:0} };
    for (const r of adSpend) {
      if (r.date >= start && r.date < end && funnels[r.program]) funnels[r.program].spend += r.spend;
    }
    for (const e of sales) {
      const f = getSalesFunnel(e.program);
      if (e.date >= start && e.date < end && f && funnels[f]) funnels[f].rev += e.amtReceived;
    }
    for (const s of emiV2) {
      if (s.timestamp >= start && s.timestamp < end) {
        const f = s.program==='SUPER'?'Tarot':s.program==='RGM'?'Reiki':null;
        if (f && funnels[f]) funnels[f].rev += s.totalActual||0;
      }
    }
    const totSpend = Object.values(funnels).reduce((s,f)=>s+f.spend,0);
    const totRev   = Object.values(funnels).reduce((s,f)=>s+f.rev,0);
    return { mo, label, funnels, totSpend, totRev, roas: totSpend>0?(totRev/totSpend):null };
  });

  // Chart setup
  const maxRev   = Math.max(...monthlyData.map(m=>m.totRev),1);
  const maxSpend = Math.max(...monthlyData.map(m=>m.totSpend),1);
  const maxBar   = Math.max(maxRev, maxSpend);
  const CHART_H  = 130;

  // Unit economics
  const profiles  = buildProfiles(sales, emiV2);
  const allTimeMS = '2020-01-01';

  const unitEcon = ['Tarot','Reiki','PCOS'].map(funnel => {
    const fProgs = funnel==='Tarot'?TAROT_PROGS:funnel==='Reiki'?REIKI_PROGS:PCOS_PROGS;
    const totalSpend = adSpend.filter(r=>r.program===funnel).reduce((s,r)=>s+r.spend,0);
    const totalEnroll = sales.filter(e=>fProgs.some(p=>e.program?.toLowerCase().includes(p))).length;
    const cac = totalEnroll>0?Math.round(totalSpend/totalEnroll):0;
    const funnelProfiles = profiles.filter(p=>p.funnel===funnel);
    const avgLtv = funnelProfiles.length>0?Math.round(funnelProfiles.reduce((s,p)=>s+p.ltv,0)/funnelProfiles.length):0;
    const ltvCac = cac>0?+(avgLtv/cac).toFixed(1):null;
    const payback = cac>0&&avgLtv>0?+(cac/(avgLtv/12)).toFixed(1):null;
    const ms = monthStartISO();
    const mtdSpend = adSpend.filter(r=>r.program===funnel&&r.date>=ms).reduce((s,r)=>s+r.spend,0);
    const mtdEnroll = sales.filter(e=>e.date>=ms&&fProgs.some(p=>e.program?.toLowerCase().includes(p))).length;
    const mtdCac = mtdEnroll>0?Math.round(mtdSpend/mtdEnroll):null;
    return { funnel, color:FUNNEL_COLORS[funnel], totalSpend, totalEnroll, cac, avgLtv, ltvCac, payback, mtdCac, mtdEnroll };
  });

  const ltvCacColor = (v) => { if(!v) return 'var(--text3)'; if(v>=5) return 'var(--success)'; if(v>=3) return 'var(--warning)'; return 'var(--danger)'; };

  return (
    <div>
      {/* Monthly ROAS chart */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,background:'var(--border)',marginBottom:24}}>
        {(() => {
          const lastMo = monthlyData[monthlyData.length-1];
          const prev3  = monthlyData.slice(-3);
          const totSpend3 = prev3.reduce((s,m)=>s+m.totSpend,0);
          const totRev3   = prev3.reduce((s,m)=>s+m.totRev,0);
          return [
            {label:'MTD ad spend',     value:inr(Math.round(lastMo.totSpend))},
            {label:'MTD cash received',value:inr(Math.round(lastMo.totRev)),   color:'var(--success)'},
            {label:'MTD ROAS',         value:lastMo.roas?lastMo.roas.toFixed(2)+'x':'—', color:roasColor(lastMo.roas)},
            {label:'3-month ROAS',     value:totSpend3>0?(totRev3/totSpend3).toFixed(2)+'x':'—', color:roasColor(totSpend3>0?totRev3/totSpend3:null)},
          ].map(({label,value,color})=>(
            <div key={label} style={{background:'var(--surface)',padding:'16px 20px'}}>
              <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>{label}</div>
              <div style={{fontSize:22,fontWeight:600,color:color||'var(--text)'}}>{value}</div>
            </div>
          ));
        })()}
      </div>

      <div style={innerPad}>
        {eyebrow('Monthly ROAS — 12 month trend (cash received ÷ ad spend)')}
        <div style={{...box,padding:'20px 24px'}}>
          <div style={{display:'flex',gap:16,marginBottom:12}}>
            {[['■ Cash received','var(--success)'],['■ Ad spend','var(--danger)']].map(([l,c])=>(
              <span key={l} style={{fontSize:11,color:c}}>{l}</span>
            ))}
            <span style={{fontSize:11,color:'var(--text3)',marginLeft:'auto'}}>ROAS shown above each month bar</span>
          </div>
          <div style={{overflowX:'auto'}}>
            <div style={{display:'flex',gap:6,alignItems:'flex-end',minWidth:monthlyData.length*72,paddingBottom:4}}>
              {monthlyData.map(m=>{
                const revH   = maxBar>0?Math.max((m.totRev/maxBar)*CHART_H,m.totRev>0?4:0):0;
                const spendH = maxBar>0?Math.max((m.totSpend/maxBar)*CHART_H,m.totSpend>0?4:0):0;
                const roas   = m.roas;
                return (
                  <div key={m.mo} style={{flex:'0 0 64px',display:'flex',flexDirection:'column',alignItems:'center'}}>
                    {roas!==null&&<div style={{fontSize:10,fontWeight:700,color:roasColor(roas),marginBottom:4}}>{roas.toFixed(1)}x</div>}
                    {roas===null&&<div style={{fontSize:10,color:'var(--text3)',marginBottom:4}}>—</div>}
                    <div style={{display:'flex',gap:3,alignItems:'flex-end',height:CHART_H}}>
                      <div style={{width:22,height:revH,background:'var(--success)',borderRadius:'3px 3px 0 0'}} title={`Rev: ${inr(Math.round(m.totRev))}`} />
                      <div style={{width:22,height:spendH,background:'rgba(239,68,68,0.7)',borderRadius:'3px 3px 0 0'}} title={`Spend: ${inr(Math.round(m.totSpend))}`} />
                    </div>
                    <div style={{fontSize:10,color:'var(--text3)',marginTop:6,textAlign:'center'}}>{m.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:12}}>Note: Revenue includes L1/L2 cash received + SUPER/RGM EMI cash. Months with no ad spend logged show — ROAS. Hover bars for exact amounts.</div>
        </div>

        {eyebrow('Per-funnel monthly ROAS')}
        <div style={box}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr>
                <th style={thL}>Month</th>
                {['Tarot','Reiki','PCOS'].map(f=>[
                  <th key={f+'s'} style={th}>{f} Spend</th>,
                  <th key={f+'r'} style={th}>{f} Rev</th>,
                  <th key={f+'x'} style={{...th,color:FUNNEL_COLORS[f]}}>{f} ROAS</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {[...monthlyData].reverse().filter(m=>m.totSpend>0||m.totRev>0).map(m=>(
                <tr key={m.mo}>
                  <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{m.label}</td>
                  {['Tarot','Reiki','PCOS'].map(f=>{
                    const fd=m.funnels[f];
                    const r=fd.spend>0?(fd.rev/fd.spend):null;
                    return [
                      <td key={f+'s'} style={td()}>{fd.spend>0?inr(Math.round(fd.spend)):'—'}</td>,
                      <td key={f+'r'} style={{...td(),color:'var(--success)'}}>{fd.rev>0?inr(Math.round(fd.rev)):'—'}</td>,
                      <td key={f+'x'} style={{...td(),color:roasColor(r),fontWeight:600}}>{r?r.toFixed(2)+'x':'—'}</td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {eyebrow('Unit economics — cost to acquire, lifetime value, efficiency')}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:24}}>
          {unitEcon.map(u=>(
            <div key={u.funnel} style={{background:'var(--surface)',border:'1px solid var(--border)',borderTop:`3px solid ${u.color}`,borderRadius:12,padding:'16px 18px'}}>
              <div style={{fontSize:13,fontWeight:600,color:u.color,marginBottom:14}}>{u.funnel} Funnel</div>
              {[
                ['All-time ad spend',     inr(Math.round(u.totalSpend)), null],
                ['Total L1 enrollments',  num(u.totalEnroll),            null],
                ['CAC (all-time)',         inr(u.cac),                    null],
                ['MTD CAC',               u.mtdCac?inr(u.mtdCac):'—',  null],
                ['Avg student LTV',        inr(u.avgLtv),                'var(--success)'],
                ['LTV : CAC ratio',       u.ltvCac?u.ltvCac+'x':'—',    ltvCacColor(u.ltvCac)],
                ['Payback period',        u.payback?u.payback+' months':'—', null],
              ].map(([l,v,c])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border2)'}}>
                  <span style={{fontSize:12,color:'var(--text2)'}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:500,color:c||'var(--text)'}}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{fontSize:11,color:'var(--text3)',lineHeight:1.6}}>
          <strong style={{color:'var(--text2)'}}>LTV:CAC benchmarks:</strong> ≥5x = scale aggressively · 3–5x = healthy growth · &lt;3x = fix funnel before scaling.
          CAC uses all-time spend ÷ all-time enrollments. MTD CAC shows current efficiency trend.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW 4: Revenue Forecast
// ═══════════════════════════════════════════════════════════════════════════════
function ForecastView({ sales, emiV2, emiV1 }) {
  const today = todayISO();
  const ms    = monthStartISO();

  // Committed EMI revenue (from V1 planned future payments)
  const committed = {};
  for (const student of emiV1) {
    for (const emi of (student.emis||[])) {
      if (emi.plannedDate>today && !emi.actualDate && (emi.plannedAmt||0)>0) {
        const mo = emi.plannedDate.slice(0,7);
        committed[mo] = (committed[mo]||0) + emi.plannedAmt;
      }
    }
  }

  // Historical monthly new enrollment revenue (last 6 months for avg)
  const last6Months = [];
  for (let i=1;i<=6;i++) {
    const mo = addMonthsISO(today,-i).slice(0,7);
    last6Months.push(mo);
  }
  const l1Rev6 = last6Months.map(mo=>{
    const start=mo+'-01', end=addMonthsISO(start,1);
    return sales.filter(e=>e.date>=start&&e.date<end&&['Tarot_L1','Reiki_L1','PCOS_L1'].includes(classifyProgram(e.program))).reduce((s,e)=>s+e.amtReceived,0);
  });
  const avgMonthlyL1Rev = l1Rev6.filter(v=>v>0).length>0
    ? Math.round(l1Rev6.reduce((s,v)=>s+v,0)/Math.max(l1Rev6.filter(v=>v>0).length,1))
    : 0;

  // L3/upsell avg monthly revenue
  const l3Rev6 = last6Months.map(mo=>{
    const start=mo+'-01', end=addMonthsISO(start,1);
    return sales.filter(e=>e.date>=start&&e.date<end&&['Reiki_L3','CrossSell'].includes(classifyProgram(e.program))).reduce((s,e)=>s+e.amtReceived,0);
  });
  const avgMonthlyL3Rev = Math.round(l3Rev6.reduce((s,v)=>s+v,0)/Math.max(l3Rev6.filter(v=>v>0).length,1));

  // Forecast next 6 months
  const forecastMonths = [];
  for (let i=1;i<=6;i++) {
    const moStart = addMonthsISO(today.slice(0,7)+'-01',i);
    const mo = moStart.slice(0,7);
    const committedAmt = committed[mo]||0;
    const projectedNew = avgMonthlyL1Rev + avgMonthlyL3Rev;
    forecastMonths.push({ mo, label:moLabel(mo), committed:committedAmt, projected:projectedNew, total:committedAmt+projectedNew });
  }

  const maxTotal = Math.max(...forecastMonths.map(f=>f.total),1);
  const CHART_H = 120;

  // ARR projection
  const avgForecast = forecastMonths.reduce((s,f)=>s+f.total,0)/6;
  const arrProjection = Math.round(avgForecast*12);
  const currentMonthRev = sales.filter(e=>e.date>=ms&&e.date<=today).reduce((s,e)=>s+e.amtReceived,0);

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,background:'var(--border)',marginBottom:24}}>
        {[
          {label:'Committed EMI (6M)',   value:inr(Math.round(forecastMonths.reduce((s,f)=>s+f.committed,0)))},
          {label:'Projected new (6M)',   value:inr(Math.round(forecastMonths.reduce((s,f)=>s+f.projected,0))), color:'var(--tarot)'},
          {label:'Total forecast (6M)',  value:inr(Math.round(forecastMonths.reduce((s,f)=>s+f.total,0))), color:'var(--success)'},
          {label:'ARR run rate',         value:inr(arrProjection), color:'var(--success)'},
        ].map(({label,value,color})=>(
          <div key={label} style={{background:'var(--surface)',padding:'16px 20px'}}>
            <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>{label}</div>
            <div style={{fontSize:22,fontWeight:600,color:color||'var(--text)'}}>{value}</div>
          </div>
        ))}
      </div>
      <div style={innerPad}>
        {eyebrow('6-month revenue forecast — committed EMI + projected new enrollments')}
        <div style={{...box,padding:'20px 24px'}}>
          <div style={{display:'flex',gap:16,marginBottom:12}}>
            {[['■ Committed EMI','var(--reiki)'],['■ Projected new','var(--tarot)']].map(([l,c])=>(
              <span key={l} style={{fontSize:11,color:c}}>{l}</span>
            ))}
          </div>
          <div style={{display:'flex',gap:10,alignItems:'flex-end',marginBottom:16}}>
            {forecastMonths.map(f=>{
              const commH = maxTotal>0?Math.max((f.committed/maxTotal)*CHART_H,f.committed>0?4:0):0;
              const projH = maxTotal>0?Math.max((f.projected/maxTotal)*CHART_H,f.projected>0?4:0):0;
              return (
                <div key={f.mo} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center'}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--text)',marginBottom:4}}>{inr(Math.round(f.total/100000))+'L'}</div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'stretch',width:'100%',gap:1,height:CHART_H,justifyContent:'flex-end'}}>
                    <div style={{width:'100%',height:projH,background:'var(--tarot)',borderRadius:'3px 3px 0 0',opacity:0.8}} />
                    <div style={{width:'100%',height:commH,background:'var(--reiki)',borderRadius:commH===CHART_H?'3px 3px 0 0':'0'}} />
                  </div>
                  <div style={{fontSize:11,color:'var(--text3)',marginTop:6,textAlign:'center'}}>{f.label}</div>
                </div>
              );
            })}
          </div>
        </div>
        {eyebrow('Forecast breakdown by month')}
        <div style={box}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>{['Month','Committed EMI','Projected New','Total','vs Current Month'].map((h,i)=><th key={h} style={i===0?thL:th}>{h}</th>)}</tr></thead>
            <tbody>
              {forecastMonths.map(f=>{
                const diff=f.total-currentMonthRev;
                return(
                  <tr key={f.mo}>
                    <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{f.label}</td>
                    <td style={{...td(),color:'var(--reiki)'}}>{f.committed>0?inr(Math.round(f.committed)):'—'}</td>
                    <td style={{...td(),color:'var(--tarot)'}}>{inr(Math.round(f.projected))}</td>
                    <td style={{...td(),color:'var(--success)',fontWeight:700}}>{inr(Math.round(f.total))}</td>
                    <td style={{...td(),color:diff>=0?'var(--success)':'var(--danger)',fontWeight:600}}>{diff>=0?'+':''}{inr(Math.round(diff))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{fontSize:11,color:'var(--text3)',lineHeight:1.6}}>
          <strong style={{color:'var(--text2)'}}>How this is calculated:</strong> Committed EMI = planned future installments from SUPER/RGM students (from EMI schedules).
          Projected New = average monthly L1 + L3 revenue from last 6 months. SUPER launches are excluded from projection (timing-dependent, plan separately).
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW 5: Growth Curve (Scenario Planner)
// ═══════════════════════════════════════════════════════════════════════════════
function GrowthCurveView({ sales, emiV2, leadCounts }) {
  // Calculate current rates from actual data
  const tarotL1 = sales.filter(e=>classifyProgram(e.program)==='Tarot_L1').length;
  const reikiL1 = sales.filter(e=>classifyProgram(e.program)==='Reiki_L1').length;
  const superCount = emiV2.filter(s=>s.program==='SUPER').length;
  const rgmCount   = emiV2.filter(s=>s.program==='RGM').length;

  const defTarotConv  = leadCounts.Tarot>0 ? +(tarotL1/leadCounts.Tarot*100).toFixed(2) : 2.5;
  const defReikiConv  = leadCounts.Reiki>0 ? +(reikiL1/leadCounts.Reiki*100).toFixed(2) : 6.0;
  const defSuperConv  = tarotL1>0 ? +(superCount/tarotL1*100).toFixed(1) : 5.0;
  const defRgmConv    = reikiL1>0 ? +(rgmCount/reikiL1*100).toFixed(1)   : 5.0;

  const avgTarotFee = tarotL1>0 ? Math.round(sales.filter(e=>classifyProgram(e.program)==='Tarot_L1').reduce((s,e)=>s+e.programFee,0)/tarotL1) : 9999;
  const avgReikiFee = reikiL1>0 ? Math.round(sales.filter(e=>classifyProgram(e.program)==='Reiki_L1').reduce((s,e)=>s+e.programFee,0)/reikiL1) : 6999;

  const [program,      setProgram]      = useState('Tarot');
  const [cpl,          setCpl]          = useState(program==='Tarot'?280:750);
  const [l1ConvRate,   setL1ConvRate]   = useState(defTarotConv);
  const [superConvRate,setSuperConvRate]= useState(defSuperConv);
  const [l3Rate,       setL3Rate]       = useState(18);

  const color = program==='Tarot'?'var(--tarot)':'var(--reiki)';
  const avgFee = program==='Tarot'?avgTarotFee:avgReikiFee;
  const avgHtFee = program==='Tarot'?250000:120000;
  const htLabel  = program==='Tarot'?'SUPER':'RGM';

  const scenarios = [50,100,150,200,250,300,500].map(dailyLeads => {
    const monthlyLeads   = dailyLeads * 30;
    const l1Monthly      = Math.round(monthlyLeads * (l1ConvRate/100));
    const l3Monthly      = Math.round(l1Monthly * (l3Rate/100));
    const l1Revenue      = l1Monthly * avgFee;
    const l3Revenue      = l3Monthly * (program==='Tarot'?25000:25000);
    // SUPER/RGM: quarterly pitch, every 4 months → monthly avg = (l1_per_4months × conv) / 4
    const htMonthlyAvg   = Math.round((l1Monthly * 4 * (superConvRate/100) * avgHtFee) / 4);
    const totalRevenue   = l1Revenue + l3Revenue + htMonthlyAvg;
    const adSpendMonth   = monthlyLeads * cpl;
    const roas           = adSpendMonth>0?+(totalRevenue/adSpendMonth).toFixed(2):null;
    const arr            = Math.round(totalRevenue*12);
    const isCurrent      = dailyLeads===100||dailyLeads===150; // approximate current
    return { dailyLeads, monthlyLeads, l1Monthly, l1Revenue, l3Revenue, htMonthlyAvg, totalRevenue, adSpendMonth, roas, arr };
  });

  // CPL sensitivity at current lead volume
  const cplSensitivity = [150,200,250,280,350,450,600].map(testCpl => {
    const monthlyLeads = 100 * 30; // baseline 100/day
    const l1Monthly    = Math.round(monthlyLeads * (l1ConvRate/100));
    const l3Monthly    = Math.round(l1Monthly * (l3Rate/100));
    const totalRev     = (l1Monthly * avgFee) + (l3Monthly*25000) + Math.round((l1Monthly*4*(superConvRate/100)*avgHtFee)/4);
    const spend        = monthlyLeads * testCpl;
    const roas         = spend>0?+(totalRev/spend).toFixed(2):null;
    const breakEven    = testCpl === Math.round(totalRev/monthlyLeads);
    return { cpl:testCpl, spend, totalRev, roas, isCurrent: testCpl===280||testCpl===750 };
  });

  // 12WY target calculator
  const [targetMonthlyRev, setTargetMonthlyRev] = useState(700000);
  const targetL1Rev = targetMonthlyRev * 0.4; // rough split
  const requiredL1  = Math.ceil(targetL1Rev / avgFee);
  const requiredLeads = Math.ceil(requiredL1 / (l1ConvRate/100));
  const requiredDaily = Math.ceil(requiredLeads / 30);

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,background:'var(--border)',marginBottom:24}}>
        {[
          {label:'Current L1 conv rate',  value:defTarotConv+'%',      color},
          {label:`Current ${htLabel} conv`, value:defSuperConv+'%',    color},
          {label:'Break-even CPL',         value:inr(Math.round(avgFee*(l1ConvRate/100)))},
          {label:'Current avg L1 fee',     value:inr(avgFee)},
        ].map(({label,value,color:c})=>(
          <div key={label} style={{background:'var(--surface)',padding:'16px 20px'}}>
            <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>{label}</div>
            <div style={{fontSize:22,fontWeight:600,color:c||'var(--text)'}}>{value}</div>
          </div>
        ))}
      </div>
      <div style={innerPad}>
        {/* Controls */}
        {eyebrow('Scenario inputs')}
        <div style={{...box,padding:'16px 20px',marginBottom:20}}>
          <div style={{display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}}>
            <div style={{display:'flex',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
              {['Tarot','Reiki'].map(p=>(
                <button key={p} onClick={()=>{ setProgram(p); setL1ConvRate(p==='Tarot'?defTarotConv:defReikiConv); setSuperConvRate(p==='Tarot'?defSuperConv:defRgmConv); setCpl(p==='Tarot'?280:750); }}
                  style={{border:'none',borderRadius:0,padding:'6px 16px',fontSize:13,fontWeight:500,background:program===p?color:'transparent',color:program===p?'#fff':'var(--text3)'}}>{p} Funnel</button>
              ))}
            </div>
            {[
              {label:'CPL (₹)', val:cpl, set:setCpl, min:100, max:1000, step:10},
              {label:'L1 conv %', val:l1ConvRate, set:setL1ConvRate, min:0.5, max:15, step:0.1},
              {label:`${htLabel} conv %`, val:superConvRate, set:setSuperConvRate, min:1, max:30, step:0.5},
              {label:'L3/Upsell %', val:l3Rate, set:setL3Rate, min:5, max:50, step:1},
            ].map(({label,val,set,min,max,step})=>(
              <div key={label} style={{display:'flex',flexDirection:'column',gap:4,minWidth:140}}>
                <label style={{fontSize:11,color:'var(--text3)'}}>{label}: <strong style={{color:'var(--text)'}}>{val}</strong></label>
                <input type="range" min={min} max={max} step={step} value={val} onChange={e=>set(parseFloat(e.target.value))}
                  style={{accentColor:color,width:'100%'}} />
              </div>
            ))}
          </div>
        </div>

        {/* Lead scale scenarios */}
        {eyebrow(`${program} funnel revenue by daily lead volume (monthly projections)`)}
        <div style={box}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr>{['Leads/day','Ad Spend','L1 Enroll','L1 Revenue','L3 Revenue',`${htLabel} (avg)`,`Total Rev`,'ROAS','ARR'].map((h,i)=><th key={h} style={i===0?thL:th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {scenarios.map(s=>{
                const isHighlight = s.dailyLeads===100;
                return(
                  <tr key={s.dailyLeads} style={{borderBottom:'1px solid var(--border2)',background:isHighlight?'rgba(139,92,246,0.06)':'transparent'}}>
                    <td style={{...td('left'),color:color,fontWeight:isHighlight?700:600}}>{s.dailyLeads} {isHighlight?'← baseline':''}</td>
                    <td style={td()}>{inr(Math.round(s.adSpendMonth))}</td>
                    <td style={td()}>{num(s.l1Monthly)}</td>
                    <td style={td()}>{inr(Math.round(s.l1Revenue))}</td>
                    <td style={td()}>{inr(Math.round(s.l3Revenue))}</td>
                    <td style={{...td(),color}}>{inr(Math.round(s.htMonthlyAvg))}</td>
                    <td style={{...td(),color:'var(--success)',fontWeight:700}}>{inr(Math.round(s.totalRevenue))}</td>
                    <td style={{...td(),color:roasColor(s.roas),fontWeight:700}}>{s.roas?s.roas+'x':'—'}</td>
                    <td style={{...td(),color:'var(--text)',fontWeight:600}}>{inr(s.arr)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* CPL sensitivity */}
        {eyebrow(`CPL sensitivity — impact on ROAS at 100 leads/day (${program})`)}
        <div style={box}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>{['CPL','Monthly Spend','Revenue','ROAS','Vs current CPL'].map((h,i)=><th key={h} style={i===0?thL:th}>{h}</th>)}</tr></thead>
            <tbody>
              {cplSensitivity.map(r=>{
                const currentRoas = cplSensitivity.find(x=>x.cpl===280)?.roas||1;
                const diff = r.roas&&currentRoas?+(r.roas-currentRoas).toFixed(2):null;
                return(
                  <tr key={r.cpl} style={{borderBottom:'1px solid var(--border2)',background:r.isCurrent?'rgba(139,92,246,0.06)':'transparent'}}>
                    <td style={{...td('left'),color:color,fontWeight:r.isCurrent?700:400}}>₹{r.cpl} {r.isCurrent?'← current':''}</td>
                    <td style={td()}>{inr(Math.round(r.spend))}</td>
                    <td style={{...td(),color:'var(--success)'}}>{inr(Math.round(r.totalRev))}</td>
                    <td style={{...td(),color:roasColor(r.roas),fontWeight:700}}>{r.roas?r.roas+'x':'—'}</td>
                    <td style={{...td(),color:diff>=0?'var(--success)':'var(--danger)',fontWeight:600}}>{diff!==null?(diff>=0?'+':'')+diff+'x':'—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 12WY Target Calculator */}
        {eyebrow('12WY target calculator — how many leads/day to hit your revenue goal')}
        <div style={{...box,padding:'20px 24px'}}>
          <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20,flexWrap:'wrap'}}>
            <span style={{fontSize:13,color:'var(--text2)'}}>Monthly revenue target (₹):</span>
            <input type="number" value={targetMonthlyRev} onChange={e=>setTargetMonthlyRev(parseInt(e.target.value)||0)}
              step={50000} style={{background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text)',padding:'6px 12px',borderRadius:8,fontSize:14,width:140,textAlign:'right'}} />
            <span style={{fontSize:13,color:'var(--text3)'}}>= {inr(targetMonthlyRev*12)} ARR</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
            {[
              {label:`Required daily leads (${program})`, value:num(requiredDaily), color},
              {label:'Required L1/month',                  value:num(requiredL1)},
              {label:'Required ad spend/month',            value:inr(requiredDaily*30*cpl)},
              {label:'Implied ROAS',                       value:targetMonthlyRev>0&&requiredDaily>0?+(targetMonthlyRev/(requiredDaily*30*cpl)).toFixed(2)+'x':'—', color:'var(--success)'},
            ].map(({label,value,color:c})=>(
              <div key={label} style={{background:'var(--surface2)',borderRadius:8,padding:'12px 14px'}}>
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>{label}</div>
                <div style={{fontSize:18,fontWeight:700,color:c||'var(--text)'}}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:12}}>
            Note: Calculator assumes {l1ConvRate}% L1 conv, {superConvRate}% {htLabel} conv, ₹{cpl} CPL. Adjust sliders above to model different scenarios.
            {htLabel} revenue is spread as monthly average of quarterly launches.
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const VIEWS = [
  { k:'funnel',   l:'Funnel' },
  { k:'ltv',      l:'LTV Tracker' },
  { k:'roas',     l:'ROAS & Unit Econ' },
  { k:'forecast', l:'Revenue Forecast' },
  { k:'curve',    l:'Growth Curve' },
];

export default function LTVFunnel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [demo,    setDemo]    = useState(false);
  const [updated, setUpdated] = useState(null);
  const [view,    setView]    = useState('roas');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadLTVFunnelData());
      setDemo(false);
    } catch (e) {
      console.warn('LTV/Funnel demo:', e.message);
      setData({ leadCounts:{Tarot:0,Reiki:0,PCOS:0}, sales:[], adSpend:[], emiV2:[], emiV1:[] });
      setDemo(true);
    } finally {
      setLoading(false);
      setUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding:'3rem', color:'var(--text3)', textAlign:'center' }}>Building analysis data...</div>;

  const { leadCounts, sales, adSpend=[], emiV2=[], emiV1=[] } = data;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, overflowX:'auto' }}>
          <span style={{ fontSize:12, color:demo?'var(--warning)':'var(--success)', whiteSpace:'nowrap' }}>
            {demo?'⚠ No data':'● Live'}
            {updated&&<span style={{ color:'var(--text3)', marginLeft:8 }}>· {updated.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>}
          </span>
          <div style={{ display:'flex', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', flexShrink:0 }}>
            {VIEWS.map(({k,l})=>(
              <button key={k} onClick={()=>setView(k)} style={{ border:'none', borderRadius:0, padding:'5px 14px', fontSize:12, fontWeight:500, whiteSpace:'nowrap', background:view===k?'var(--tarot)':'transparent', color:view===k?'#fff':'var(--text3)' }}>{l}</button>
            ))}
          </div>
        </div>
        <button onClick={load} style={{ flexShrink:0, marginLeft:8 }}>↻ Refresh</button>
      </div>

      {view==='funnel'   && <FunnelView   leadCounts={leadCounts} sales={sales} emiV2={emiV2} />}
      {view==='ltv'      && <LTVView      sales={sales} emiV2={emiV2} />}
      {view==='roas'     && <ROASEconView  sales={sales} emiV2={emiV2} adSpend={adSpend} />}
      {view==='forecast' && <ForecastView  sales={sales} emiV2={emiV2} emiV1={emiV1} />}
      {view==='curve'    && <GrowthCurveView sales={sales} emiV2={emiV2} leadCounts={leadCounts} />}
    </div>
  );
}
