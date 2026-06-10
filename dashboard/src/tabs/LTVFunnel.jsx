import { useState, useEffect, useCallback } from 'react';
import { loadLTVFunnelData } from '../utils/sheets.js';
import { inr, num } from '../utils/format.js';

// ─── Program classifier ───────────────────────────────────────────────────────
function classifyProgram(program) {
  const p = (program || '').toLowerCase();
  if (p === 'super') return 'SUPER';
  if (p === 'rgm' || p.includes('grandmaster')) return 'RGM';
  if (p.includes('tarot') && (p.includes('mastery') || p.includes('diploma'))) return 'Tarot_L1';
  if ((p.includes('reiki') && (p.includes('l1') || p.includes('l2'))) || p === 'reiki - l1/l2') return 'Reiki_L1';
  if (p.includes('pcos') || p.includes('pcod') || p.includes('endometriosis') || p.includes('fertility') || p.includes('hormonal')) return 'PCOS_L1';
  if (p.includes('reiki') && p.includes('l3')) return 'Reiki_L3';
  if (p.includes('tarot') && p.includes('health')) return 'CrossSell';
  if (p.includes('money reiki') || p.includes("ho'oponopono") || p.includes('hooponopono') || p.includes('30 days mani') || p.includes('mentor')) return 'CrossSell';
  return 'Other';
}

function qLabel(isoDate) {
  if (!isoDate) return 'Unknown';
  const d = new Date(isoDate + 'T12:00:00');
  if (isNaN(d.getTime())) return 'Unknown';
  return `Q${Math.ceil((d.getMonth()+1)/3)} ${d.getFullYear()}`;
}

// ─── Build unified student profiles ──────────────────────────────────────────
function buildProfiles(sales, emiV2) {
  const byPhone = new Map();
  const byEmail = new Map();

  const getOrCreate = (phone, email, name) => {
    if (phone && byPhone.has(phone)) return byPhone.get(phone);
    if (email && byEmail.has(email)) {
      const p = byEmail.get(email);
      if (phone) { p.phone = p.phone || phone; byPhone.set(phone, p); }
      return p;
    }
    const profile = { phone: phone||'', email: email||'', name: name||'', purchases: [] };
    if (phone) byPhone.set(phone, profile);
    if (email) byEmail.set(email, profile);
    return profile;
  };

  for (const e of sales) {
    const p = getOrCreate(e.phone, e.email, e.name);
    p.name = p.name || e.name;
    p.purchases.push({ date:e.date, program:e.program, revenue:e.programFee, type:classifyProgram(e.program) });
  }
  for (const s of emiV2) {
    const p = getOrCreate(s.phone, s.email, s.name);
    p.name = p.name || s.name;
    p.purchases.push({ date:s.timestamp, program:s.program, revenue:s.totalPlanned||0, type:s.program });
  }

  const seen = new Set();
  const profiles = [];
  for (const p of [...byPhone.values(), ...byEmail.values()]) {
    if (seen.has(p)) continue;
    seen.add(p);
    p.purchases.sort((a,b) => (a.date||'') < (b.date||'') ? -1 : 1);
    const firstL1 = p.purchases.find(x => ['Tarot_L1','Reiki_L1','PCOS_L1'].includes(x.type));
    p.firstDate  = firstL1?.date || p.purchases[0]?.date;
    p.cohort     = p.firstDate ? qLabel(p.firstDate) : 'Unknown';
    p.ltv        = p.purchases.reduce((s,x) => s+(x.revenue||0), 0);
    p.hasL3      = p.purchases.some(x => ['Reiki_L3','CrossSell'].includes(x.type));
    p.hasSuper   = p.purchases.some(x => x.type === 'SUPER');
    p.hasRgm     = p.purchases.some(x => x.type === 'RGM');
    p.funnel     = firstL1
      ? (firstL1.type==='Tarot_L1' ? 'Tarot' : firstL1.type==='Reiki_L1' ? 'Reiki' : 'PCOS')
      : 'Unknown';
    p.programCount = p.purchases.length;
    profiles.push(p);
  }
  return profiles;
}

function buildCohorts(profiles) {
  const map = {};
  for (const p of profiles) {
    const c = p.cohort;
    if (!map[c]) map[c] = { cohort:c, students:0, totalLtv:0, withL3:0, withSuper:0, withRgm:0 };
    const m = map[c];
    m.students++; m.totalLtv += p.ltv;
    if (p.hasL3)    m.withL3++;
    if (p.hasSuper) m.withSuper++;
    if (p.hasRgm)   m.withRgm++;
  }
  return Object.values(map)
    .map(c => ({
      ...c,
      avgLtv:    c.students>0 ? Math.round(c.totalLtv/c.students) : 0,
      l3Rate:    c.students>0 ? +((c.withL3/c.students)*100).toFixed(1) : 0,
      superRate: c.students>0 ? +((c.withSuper/c.students)*100).toFixed(1) : 0,
      rgmRate:   c.students>0 ? +((c.withRgm/c.students)*100).toFixed(1) : 0,
    }))
    .sort((a,b) => a.cohort < b.cohort ? -1 : 1);
}

// ─── Style helpers ────────────────────────────────────────────────────────────
const th  = { padding:'10px 14px', textAlign:'right', fontSize:11, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, borderBottom:'1px solid var(--border)' };
const thL = { ...th, textAlign:'left' };
const td  = (a='right') => ({ padding:'9px 14px', borderBottom:'1px solid var(--border2)', color:'var(--text2)', fontSize:13, textAlign:a });
const box = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:28 };
const eyebrow = (t) => <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:12 }}>{t}</div>;

function pctColor(v, hi=15, mid=8) {
  if (!v && v!==0) return 'var(--text3)';
  if (v>=hi) return 'var(--success)';
  if (v>=mid) return 'var(--warning)';
  return 'var(--danger)';
}

// ─── Waterfall bar ────────────────────────────────────────────────────────────
function WaterfallBar({ label, count, maxCount, convPct, convLabel, color, breakdown }) {
  const pct = maxCount>0 ? Math.max((count/maxCount)*100, 0.5) : 0;
  return (
    <div style={{ marginBottom:22 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:6 }}>
        <span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{label}</span>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {convPct!==null && convPct!==undefined && (
            <span style={{ fontSize:11, fontWeight:600, color:pctColor(convPct), background:'var(--surface2)', padding:'2px 7px', borderRadius:4 }}>
              ↓ {convPct}% {convLabel||''}
            </span>
          )}
          <span style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{num(count)}</span>
        </div>
      </div>
      <div style={{ height:14, background:'var(--border)', borderRadius:7 }}>
        <div style={{ height:14, width:`${pct}%`, background:color, borderRadius:7 }} />
      </div>
      {breakdown && (
        <div style={{ display:'flex', gap:14, marginTop:6 }}>
          {Object.entries(breakdown).filter(([,v])=>v>0).map(([k,v])=>(
            <span key={k} style={{ fontSize:11, color:'var(--text3)' }}>{k}: <strong style={{ color:'var(--text2)' }}>{num(v)}</strong></span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Funnel Waterfall View ────────────────────────────────────────────────────
function FunnelView({ leadCounts, sales, emiV2 }) {
  const tarotL1 = sales.filter(e => classifyProgram(e.program)==='Tarot_L1').length;
  const reikiL1 = sales.filter(e => classifyProgram(e.program)==='Reiki_L1').length;
  const pcosL1  = sales.filter(e => classifyProgram(e.program)==='PCOS_L1').length;
  const allL1   = tarotL1 + reikiL1 + pcosL1;

  const tarotL3 = sales.filter(e => ['CrossSell'].includes(classifyProgram(e.program)) && e.program?.toLowerCase().includes('tarot')).length;
  const reikiL3 = sales.filter(e => classifyProgram(e.program)==='Reiki_L3').length;
  const crossSell = sales.filter(e => classifyProgram(e.program)==='CrossSell').length;
  const allL3   = crossSell + reikiL3;

  const superCount = emiV2.filter(s=>s.program==='SUPER').length;
  const rgmCount   = emiV2.filter(s=>s.program==='RGM').length;

  const totalLeads = leadCounts.Tarot + leadCounts.Reiki + leadCounts.PCOS;
  const maxBar = totalLeads;

  // Cohort funnel data
  const profiles  = buildProfiles(sales, emiV2);
  const cohorts   = buildCohorts(profiles);

  // Per-funnel table
  const funnelRows = [
    {
      funnel:'Tarot', color:'var(--tarot)',
      leads: leadCounts.Tarot, l1: tarotL1, l3: crossSell, ht: superCount, htLabel:'SUPER',
      l1Pct: leadCounts.Tarot>0 ? +((tarotL1/leadCounts.Tarot)*100).toFixed(2) : 0,
      l3Pct: tarotL1>0 ? +((crossSell/tarotL1)*100).toFixed(1) : 0,
      htPct: tarotL1>0 ? +((superCount/tarotL1)*100).toFixed(1) : 0,
    },
    {
      funnel:'Reiki', color:'var(--reiki)',
      leads: leadCounts.Reiki, l1: reikiL1, l3: reikiL3, ht: rgmCount, htLabel:'RGM',
      l1Pct: leadCounts.Reiki>0 ? +((reikiL1/leadCounts.Reiki)*100).toFixed(2) : 0,
      l3Pct: reikiL1>0 ? +((reikiL3/reikiL1)*100).toFixed(1) : 0,
      htPct: reikiL1>0 ? +((rgmCount/reikiL1)*100).toFixed(1) : 0,
    },
    {
      funnel:'PCOS', color:'var(--pcos)',
      leads: leadCounts.PCOS, l1: pcosL1, l3: 0, ht: 0, htLabel:'—',
      l1Pct: leadCounts.PCOS>0 ? +((pcosL1/leadCounts.PCOS)*100).toFixed(2) : 0,
      l3Pct: 0, htPct: 0,
    },
  ];

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:1, background:'var(--border)', marginBottom:28 }}>
        {[
          { label:'Total leads (all-time)', value:num(totalLeads), color:null },
          { label:'L1 enrolled',            value:num(allL1),      color:'var(--tarot)' },
          { label:'L1 conv rate',           value:totalLeads>0 ? ((allL1/totalLeads)*100).toFixed(2)+'%':'—', color:null },
          { label:'SUPER enrolled',         value:num(superCount), color:'var(--tarot)' },
          { label:'RGM enrolled',           value:num(rgmCount),   color:'var(--reiki)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:'var(--surface)', padding:'16px 20px' }}>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>{label}</div>
            <div style={{ fontSize:22, fontWeight:600, color:color||'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding:'0 24px 32px' }}>

        {/* Combined waterfall */}
        {eyebrow('All-time combined funnel')}
        <div style={{ ...box, padding:'20px 24px' }}>
          <WaterfallBar label="Total Leads"     count={totalLeads} maxCount={maxBar} convPct={null}              color="var(--text3)"  breakdown={{ Tarot:leadCounts.Tarot, Reiki:leadCounts.Reiki, PCOS:leadCounts.PCOS }} />
          <WaterfallBar label="L1 Enrollments"  count={allL1}      maxCount={maxBar} convPct={totalLeads>0?+((allL1/totalLeads)*100).toFixed(2):null}  convLabel="of leads"  color="var(--tarot)"  breakdown={{ Tarot:tarotL1, Reiki:reikiL1, PCOS:pcosL1 }} />
          <WaterfallBar label="L3 / Upsells"    count={allL3}      maxCount={maxBar} convPct={allL1>0?+((allL3/allL1)*100).toFixed(1):null}             convLabel="of L1"     color="var(--pcos)"   breakdown={{ 'Reiki L3':reikiL3, 'Cross-sells':crossSell }} />
          <WaterfallBar label="SUPER"            count={superCount} maxCount={maxBar} convPct={tarotL1>0?+((superCount/tarotL1)*100).toFixed(1):null}    convLabel="of Tarot L1" color="var(--tarot)" />
          <WaterfallBar label="RGM"              count={rgmCount}   maxCount={maxBar} convPct={reikiL1>0?+((rgmCount/reikiL1)*100).toFixed(1):null}      convLabel="of Reiki L1" color="var(--reiki)" />
        </div>

        {/* Per-funnel breakdown */}
        {eyebrow('Per-funnel conversion breakdown')}
        <div style={box}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>{['Funnel','Leads','L1 Enrolled','Lead→L1%','L3/Upsell','L1→L3%','SUPER/RGM','L1→HT%'].map((h,i)=>(
                <th key={h} style={i===0?thL:th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {funnelRows.map(r=>(
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
              ))}
            </tbody>
          </table>
        </div>

        {/* Cohort funnel table */}
        {eyebrow('Cohort progression — how each enrollment batch evolved through the funnel')}
        <div style={box}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>{['Cohort','Students','Avg LTV','L3/Upsell','L3%','SUPER','SUPER%','RGM','RGM%','Total Rev'].map((h,i)=>(
                <th key={h} style={i===0?thL:th}>{h}</th>
              ))}</tr>
            </thead>
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

        <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.6 }}>
          <strong style={{ color:'var(--text2)' }}>Benchmarks:</strong> L1 conv ≥5% = healthy · L1→SUPER ≥15% = strong · L1→RGM ≥10% = strong.
          Cohort SUPER/RGM% is 0 for recent cohorts — the pitch hasn't happened yet for them.
        </div>

      </div>
    </div>
  );
}

// ─── LTV Tracker View ─────────────────────────────────────────────────────────
function LTVView({ sales, emiV2 }) {
  const [progFilter, setProgFilter] = useState('ALL');
  const [ltvFilter,  setLtvFilter]  = useState('ALL');
  const [search,     setSearch]     = useState('');

  const profiles = buildProfiles(sales, emiV2);
  const cohorts  = buildCohorts(profiles);

  // Stats
  const totalStudents = profiles.length;
  const avgLtv        = totalStudents>0 ? Math.round(profiles.reduce((s,p)=>s+p.ltv,0)/totalStudents) : 0;
  const superStudents = profiles.filter(p=>p.hasSuper).length;
  const rgmStudents   = profiles.filter(p=>p.hasRgm).length;
  const multiProgram  = profiles.filter(p=>p.programCount>1).length;

  // LTV distribution
  const dist = [
    { label:'₹0–10K',    count: profiles.filter(p=>p.ltv>0&&p.ltv<=10000).length   },
    { label:'₹10–35K',   count: profiles.filter(p=>p.ltv>10000&&p.ltv<=35000).length },
    { label:'₹35–75K',   count: profiles.filter(p=>p.ltv>35000&&p.ltv<=75000).length },
    { label:'₹75K–2.5L', count: profiles.filter(p=>p.ltv>75000&&p.ltv<=250000).length },
    { label:'₹2.5L+',    count: profiles.filter(p=>p.ltv>250000).length             },
  ];
  const maxDist = Math.max(...dist.map(d=>d.count),1);

  // Filtered individual profiles
  const filtered = profiles.filter(p => {
    if (progFilter!=='ALL' && p.funnel!==progFilter) return false;
    if (ltvFilter==='SUPER' && !p.hasSuper) return false;
    if (ltvFilter==='RGM'   && !p.hasRgm)  return false;
    if (ltvFilter==='Multi' && p.programCount<2) return false;
    if (search && !p.name?.toLowerCase().includes(search.toLowerCase()) && !p.phone?.includes(search)) return false;
    return true;
  }).sort((a,b) => b.ltv-a.ltv);

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:1, background:'var(--border)', marginBottom:28 }}>
        {[
          { label:'Unique students',  value:num(totalStudents)                              },
          { label:'Average LTV',      value:inr(avgLtv),        color:'var(--success)'     },
          { label:'Have bought SUPER',value:num(superStudents)+ ` (${totalStudents>0?+((superStudents/totalStudents)*100).toFixed(1):0}%)`, color:'var(--tarot)' },
          { label:'Have bought RGM',  value:num(rgmStudents)+   ` (${totalStudents>0?+((rgmStudents/totalStudents)*100).toFixed(1):0}%)`,  color:'var(--reiki)' },
          { label:'Multi-program',    value:num(multiProgram)+  ` (${totalStudents>0?+((multiProgram/totalStudents)*100).toFixed(1):0}%)`, color:'var(--pcos)'  },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:'var(--surface)', padding:'16px 20px' }}>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:600, color:color||'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding:'0 24px 32px' }}>

        {/* LTV distribution */}
        {eyebrow('LTV distribution')}
        <div style={{ ...box, padding:'20px 24px' }}>
          {dist.map(d => (
            <div key={d.label} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
              <div style={{ width:80, fontSize:12, color:'var(--text2)', textAlign:'right', flexShrink:0 }}>{d.label}</div>
              <div style={{ flex:1, height:10, background:'var(--border)', borderRadius:5 }}>
                <div style={{ height:10, width:`${(d.count/maxDist)*100}%`, background:'var(--tarot)', borderRadius:5 }} />
              </div>
              <div style={{ width:50, fontSize:13, fontWeight:600, color:'var(--text)', textAlign:'right', flexShrink:0 }}>{num(d.count)}</div>
            </div>
          ))}
        </div>

        {/* Cohort LTV table */}
        {eyebrow('LTV by cohort — which enrollment batch produces highest lifetime value')}
        <div style={box}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>{['Cohort','Students','Avg LTV','Max LTV','% Multi-prog','% SUPER','% RGM','Total Rev'].map((h,i)=>(
                <th key={h} style={i===0?thL:th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {cohorts.filter(c=>c.cohort!=='Unknown').length===0
                ?<tr><td colSpan={8} style={{...td(),textAlign:'center',padding:'2rem'}}>No data yet.</td></tr>
                :cohorts.filter(c=>c.cohort!=='Unknown').map(c=>{
                  const cohortProfiles=profiles.filter(p=>p.cohort===c.cohort);
                  const maxLtv=Math.max(...cohortProfiles.map(p=>p.ltv),0);
                  const multiPct=c.students>0?+((cohortProfiles.filter(p=>p.programCount>1).length/c.students)*100).toFixed(1):0;
                  return (
                    <tr key={c.cohort}>
                      <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{c.cohort}</td>
                      <td style={td()}>{c.students}</td>
                      <td style={{...td(),color:'var(--success)',fontWeight:700}}>{inr(c.avgLtv)}</td>
                      <td style={td()}>{inr(maxLtv)}</td>
                      <td style={{...td(),color:pctColor(multiPct,30,15),fontWeight:600}}>{multiPct}%</td>
                      <td style={{...td(),color:pctColor(c.superRate,15,8),fontWeight:600}}>{c.superRate}%</td>
                      <td style={{...td(),color:pctColor(c.rgmRate,10,5),fontWeight:600}}>{c.rgmRate}%</td>
                      <td style={{...td(),color:'var(--success)',fontWeight:600}}>{inr(c.totalLtv)}</td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>

        {/* Individual student table */}
        {eyebrow(`Individual student LTV — ${filtered.length} students`)}
        <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ display:'flex', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
            {['ALL','Tarot','Reiki','PCOS'].map(f=>(
              <button key={f} onClick={()=>setProgFilter(f)} style={{ border:'none', borderRadius:0, padding:'5px 12px', fontSize:12, fontWeight:500, background:progFilter===f?'var(--tarot)':'transparent', color:progFilter===f?'#fff':'var(--text3)' }}>{f}</button>
            ))}
          </div>
          <div style={{ display:'flex', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
            {[['ALL','All'],['SUPER','Has SUPER'],['RGM','Has RGM'],['Multi','Multi-prog']].map(([k,l])=>(
              <button key={k} onClick={()=>setLtvFilter(k)} style={{ border:'none', borderRadius:0, padding:'5px 12px', fontSize:12, fontWeight:500, background:ltvFilter===k?'var(--reiki)':'transparent', color:ltvFilter===k?'#fff':'var(--text3)' }}>{l}</button>
            ))}
          </div>
          <input
            placeholder="Search name or phone"
            value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text)', padding:'5px 12px', borderRadius:8, fontSize:12, flex:'1 1 180px' }}
          />
        </div>
        <div style={box}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>{['Student','Phone','Cohort','Funnel','Programs','LTV','SUPER','RGM'].map((h,i)=>(
                <th key={h} style={i<2?thL:th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.slice(0,100).map((p,i)=>(
                <tr key={i}>
                  <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{p.name||'—'}</td>
                  <td style={{...td('left')}}>{p.phone||'—'}</td>
                  <td style={td()}>{p.cohort}</td>
                  <td style={{...td(),color:p.funnel==='Tarot'?'var(--tarot)':p.funnel==='Reiki'?'var(--reiki)':p.funnel==='PCOS'?'var(--pcos)':'var(--text3)',fontSize:11}}>{p.funnel}</td>
                  <td style={td()}>{p.programCount}</td>
                  <td style={{...td(),color:'var(--success)',fontWeight:700}}>{inr(p.ltv)}</td>
                  <td style={{...td(),color:p.hasSuper?'var(--tarot)':'var(--text3)',fontWeight:p.hasSuper?600:400}}>{p.hasSuper?'✓ SUPER':'—'}</td>
                  <td style={{...td(),color:p.hasRgm?'var(--reiki)':'var(--text3)',fontWeight:p.hasRgm?600:400}}>{p.hasRgm?'✓ RGM':'—'}</td>
                </tr>
              ))}
              {filtered.length>100&&(
                <tr><td colSpan={8} style={{...td(),textAlign:'center',color:'var(--text3)',padding:'1rem'}}>Showing top 100 of {filtered.length} students. Use filters to narrow down.</td></tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

// ─── Main LTVFunnel tab ───────────────────────────────────────────────────────
export default function LTVFunnel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [demo,    setDemo]    = useState(false);
  const [updated, setUpdated] = useState(null);
  const [view,    setView]    = useState('funnel');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadLTVFunnelData());
      setDemo(false);
    } catch (e) {
      console.warn('LTV/Funnel demo:', e.message);
      setData({ leadCounts:{ Tarot:0, Reiki:0, PCOS:0 }, sales:[], emiV2:[] });
      setDemo(true);
    } finally {
      setLoading(false);
      setUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding:'3rem', color:'var(--text3)', textAlign:'center' }}>Building funnel & LTV data...</div>;

  const { leadCounts, sales, emiV2 } = data;

  return (
    <div>
      {/* Sub-header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:12, color:demo?'var(--warning)':'var(--success)' }}>
            {demo?'⚠ No data':'● Live'}
            {updated&&<span style={{ color:'var(--text3)', marginLeft:8 }}>· {updated.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>}
          </span>
          <div style={{ display:'flex', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
            {[{k:'funnel',l:'Funnel Waterfall'},{k:'ltv',l:'LTV Tracker'}].map(({k,l})=>(
              <button key={k} onClick={()=>setView(k)} style={{ border:'none', borderRadius:0, padding:'5px 16px', fontSize:12, fontWeight:500, background:view===k?'var(--tarot)':'transparent', color:view===k?'#fff':'var(--text3)' }}>{l}</button>
            ))}
          </div>
        </div>
        <button onClick={load}>↻ Refresh</button>
      </div>

      {view==='funnel' && <FunnelView leadCounts={leadCounts} sales={sales} emiV2={emiV2} />}
      {view==='ltv'    && <LTVView   sales={sales} emiV2={emiV2} />}
    </div>
  );
}
