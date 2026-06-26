import { inr, num } from '../utils/format.js';

const TAROT_PROGS = ['tarot - mastery','tarot - diploma','tarot - health','30 days mani'];
const REIKI_PROGS = ['reiki - l1/l2','reiki - l3','money reiki',"ho'oponopono",'hooponopono'];
const MONTH_MAP = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};

function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function monthStartISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;}
function monthEndISO(){const d=new Date();const l=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(l).padStart(2,'0')}`;}
function addMonths(iso,n){const d=new Date(iso+'T00:00:00');d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,10);}
function qRange(year,q){return{start:new Date(year,(q-1)*3,1).toISOString().slice(0,10),end:new Date(year,q*3,0).toISOString().slice(0,10)};}

function parseBatchDate(name){const m=name.toLowerCase().match(/([a-z]+)\s+(\d{4})/);if(!m)return null;const mo=MONTH_MAP[m[1].slice(0,3)];return mo?{year:parseInt(m[2]),month:mo}:null;}

function getLaunchCycles(v2Students,sales){
  const keys=[...new Set(v2Students.map(s=>`${s.batch}||${s.program}`))];
  return keys.map(key=>{
    const[batchName,program]=key.split('||');
    const students=v2Students.filter(s=>s.batch===batchName&&s.program===program);
    const bd=parseBatchDate(batchName);
    const launchISO=bd?`${bd.year}-${String(bd.month).padStart(2,'0')}-01`:null;
    const poolStart=launchISO?addMonths(launchISO,-4):null;
    const fProgs=program==='SUPER'?TAROT_PROGS:REIKI_PROGS;
    const l1Pool=(poolStart&&launchISO)?sales.filter(e=>e.date>=poolStart&&e.date<launchISO&&fProgs.some(fp=>e.program?.toLowerCase().includes(fp))).length:0;
    const enrolled=students.length;
    const revenue=students.reduce((s,x)=>s+(x.totalPlanned||0),0);
    const received=students.reduce((s,x)=>s+(x.totalActual||0),0);
    const outstanding=students.reduce((s,x)=>s+(x.emiDue||0),0);
    const convRate=l1Pool>0?+((enrolled/l1Pool)*100).toFixed(1):null;
    return{batchName,program,enrolled,revenue,received,outstanding,l1Pool,convRate,launchISO};
  }).sort((a,b)=>(a.launchISO||'')<(b.launchISO||'')?-1:1);
}

function getCalendarQuarters(v2Students,sales){
  const quarterSet=new Set();
  const addQ=iso=>{if(!iso)return;const d=new Date(iso+'T12:00:00');if(!isNaN(d.getTime()))quarterSet.add(`${d.getFullYear()}-${Math.ceil((d.getMonth()+1)/3)}`);};
  v2Students.forEach(s=>addQ(s.timestamp)); sales.forEach(e=>addQ(e.date));
  return[...quarterSet].sort().map(qk=>{
    const[year,q]=[parseInt(qk.split('-')[0]),parseInt(qk.split('-')[1])];
    const{start,end}=qRange(year,q);
    const superS=v2Students.filter(s=>s.program==='SUPER'&&s.timestamp>=start&&s.timestamp<=end);
    const rgmS=v2Students.filter(s=>s.program==='RGM'&&s.timestamp>=start&&s.timestamp<=end);
    const tarotL1=sales.filter(e=>e.date>=start&&e.date<=end&&TAROT_PROGS.some(fp=>e.program?.toLowerCase().includes(fp))).length;
    const reikiL1=sales.filter(e=>e.date>=start&&e.date<=end&&REIKI_PROGS.some(fp=>e.program?.toLowerCase().includes(fp))).length;
    const{start:pStart,end:pEnd}=qRange(q===1?year-1:year,q===1?4:q-1);
    const priorTarot=sales.filter(e=>e.date>=pStart&&e.date<=pEnd&&TAROT_PROGS.some(fp=>e.program?.toLowerCase().includes(fp))).length;
    const priorReiki=sales.filter(e=>e.date>=pStart&&e.date<=pEnd&&REIKI_PROGS.some(fp=>e.program?.toLowerCase().includes(fp))).length;
    return{label:`Q${q} ${year}`,tarotL1,reikiL1,superEnrolled:superS.length,rgmEnrolled:rgmS.length,superRevenue:superS.reduce((s,x)=>s+(x.totalPlanned||0),0),rgmRevenue:rgmS.reduce((s,x)=>s+(x.totalPlanned||0),0),superConv:priorTarot>0?+((superS.length/priorTarot)*100).toFixed(1):null,rgmConv:priorReiki>0?+((rgmS.length/priorReiki)*100).toFixed(1):null};
  });
}

function convColor(r){if(!r)return'var(--text3)';if(r>=15)return'var(--success)';if(r>=8)return'var(--warning)';return'var(--danger)';}

function LaunchChart({cycles,programType}){
  if(!cycles.length)return<div style={{color:'var(--text3)',fontSize:13,textAlign:'center',padding:'2rem'}}>No {programType} batches yet.</div>;
  const color=programType==='SUPER'?'var(--tarot)':'var(--reiki)';
  const filt=cycles.filter(c=>c.program===programType);
  const maxVal=Math.max(...filt.map(c=>Math.max(c.l1Pool,c.enrolled)),1);
  const BAR_H=100;
  return(
    <div>
      <div style={{display:'flex',gap:4,marginBottom:12}}>
        <span style={{fontSize:11,color:'var(--text3)'}}>■ L1 pool (4 months prior)</span>
        <span style={{fontSize:11,color,marginLeft:12}}>■ {programType} enrolled</span>
      </div>
      <div style={{display:'flex',gap:20,overflowX:'auto',paddingBottom:8}}>
        {filt.map(c=>{
          const l1H=Math.max((c.l1Pool/maxVal)*BAR_H,3), enrH=Math.max((c.enrolled/maxVal)*BAR_H,3);
          return(
            <div key={c.batchName} style={{flex:'0 0 90px',textAlign:'center'}}>
              <div style={{height:BAR_H+20,display:'flex',alignItems:'flex-end',justifyContent:'center',gap:6}}>
                <div style={{width:28}}><div style={{fontSize:9,color:'var(--text3)',marginBottom:2}}>{c.l1Pool}</div><div style={{height:l1H+'px',background:'var(--border)',border:'1px solid var(--text3)',borderRadius:'3px 3px 0 0'}}/></div>
                <div style={{width:28}}><div style={{fontSize:9,color,marginBottom:2}}>{c.enrolled}</div><div style={{height:enrH+'px',background:color,borderRadius:'3px 3px 0 0'}}/></div>
              </div>
              <div style={{fontSize:10,color:'var(--text2)',margin:'6px 0 2px'}}>{c.batchName}</div>
              {c.convRate!==null?<div style={{fontSize:12,fontWeight:700,color:convColor(c.convRate)}}>{c.convRate}%</div>:<div style={{fontSize:10,color:'var(--text3)'}}>—</div>}
              <div style={{fontSize:9,color:'var(--text3)'}}>{inr(c.revenue)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const th  = { padding:'10px 14px', textAlign:'right', fontSize:11, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, borderBottom:'1px solid var(--border)' };
const thL = { ...th, textAlign:'left' };
const td  = (a='right') => ({ padding:'9px 14px', borderBottom:'1px solid var(--border2)', color:'var(--text2)', fontSize:13, textAlign:a });
const box = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:24 };
const eye = (t) => <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>{t}</div>;
const row = (label,value,color) => (
  <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border2)'}}>
    <span style={{fontSize:12,color:'var(--text2)'}}>{label}</span>
    <span style={{fontSize:13,fontWeight:500,color:color||'var(--text)'}}>{value}</span>
  </div>
);

export default function EMIv2({ v2Students, salesEnrollments }) {
  const ms=monthStartISO(), me=monthEndISO();
  const launchCycles=getLaunchCycles(v2Students,salesEnrollments);
  const quarters=getCalendarQuarters(v2Students,salesEnrollments);
  const sumFor=prog=>{const list=v2Students.filter(s=>!prog||s.program===prog);return{students:list.length,revenue:list.reduce((s,x)=>s+(x.totalPlanned||0),0),received:list.reduce((s,x)=>s+(x.totalActual||0),0),outstanding:list.reduce((s,x)=>s+(x.emiDue||0),0)};};
  const superSum=sumFor('SUPER'), rgmSum=sumFor('RGM'), allSum=sumFor(null);
  const mthSales=(fProgs)=>salesEnrollments.filter(e=>e.date>=ms&&e.date<=me&&fProgs.some(fp=>e.program?.toLowerCase().includes(fp))).reduce((s,e)=>s+(e.amtReceived||0),0);
  const tarotL1Mtd=mthSales(TAROT_PROGS), reikiL1Mtd=mthSales(REIKI_PROGS);
  const superMtd=v2Students.filter(s=>s.program==='SUPER'&&s.timestamp>=ms&&s.timestamp<=me).reduce((s,x)=>s+(x.totalActual||0),0);
  const rgmMtd=v2Students.filter(s=>s.program==='RGM'&&s.timestamp>=ms&&s.timestamp<=me).reduce((s,x)=>s+(x.totalActual||0),0);
  const card=(color)=>({background:'var(--surface)',border:'1px solid var(--border)',borderTop:`3px solid ${color}`,borderRadius:12,padding:'16px 18px'});

  return(
    <div style={{padding:'20px 24px 40px'}}>
      {eye('Revenue summary — all batches')}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:28}}>
        {[{label:'SUPER',sum:superSum,color:'var(--tarot)'},{label:'RGM',sum:rgmSum,color:'var(--reiki)'},{label:'Combined',sum:allSum,color:'var(--pcos,#8b5cf6)'}].map(({label,sum,color})=>(
          <div key={label} style={card(color)}>
            <div style={{fontSize:13,fontWeight:600,color,marginBottom:14}}>{label}</div>
            {row('Students',num(sum.students))}
            {row('Total revenue (planned)',inr(sum.revenue))}
            {row('Cash received',inr(sum.received),'var(--success)')}
            {row('Outstanding',inr(sum.outstanding),sum.outstanding>0?'var(--warning)':'var(--text3)')}
            {row('Collection %',sum.revenue>0?((sum.received/sum.revenue)*100).toFixed(1)+'%':'—')}
          </div>
        ))}
      </div>
      {eye('Complete funnel revenue — month to date')}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:28}}>
        {[{funnel:'Tarot Funnel',l1:tarotL1Mtd,ht:superMtd,htLabel:'SUPER cash received',color:'var(--tarot)'},{funnel:'Reiki Funnel',l1:reikiL1Mtd,ht:rgmMtd,htLabel:'RGM cash received',color:'var(--reiki)'}].map(({funnel,l1,ht,htLabel,color})=>(
          <div key={funnel} style={card(color)}>
            <div style={{fontSize:13,fontWeight:600,color,marginBottom:14}}>{funnel}</div>
            {row('L1/L2 enrollment revenue',inr(l1))}
            {row(htLabel,inr(ht),'var(--success)')}
            <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-between'}}>
              <span style={{fontSize:12,color:'var(--text2)'}}>Total MTD</span>
              <span style={{fontSize:16,fontWeight:700,color}}>{inr(l1+ht)}</span>
            </div>
          </div>
        ))}
      </div>
      {eye('Launch cycle — L1 pool vs SUPER/RGM conversions')}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:28}}>
        {['SUPER','RGM'].map(prog=>(
          <div key={prog} style={{...box,padding:'16px 20px',marginBottom:0}}>
            <div style={{fontSize:12,fontWeight:600,color:prog==='SUPER'?'var(--tarot)':'var(--reiki)',marginBottom:14}}>{prog==='SUPER'?'Tarot L1 → SUPER':'Reiki L1 → RGM'}</div>
            <LaunchChart cycles={launchCycles} programType={prog} />
          </div>
        ))}
      </div>
      {eye('Batch breakdown')}
      <div style={box}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr>{['Batch','Program','Students','Revenue','Received','Outstanding','L1 Pool','Conv%'].map((h,i)=><th key={h} style={i<2?thL:th}>{h}</th>)}</tr></thead>
          <tbody>
            {launchCycles.length===0?<tr><td colSpan={8} style={{...td(),textAlign:'center',padding:'2rem'}}>No batches yet.</td></tr>
            :launchCycles.map(c=>(
              <tr key={c.batchName+c.program}>
                <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{c.batchName}</td>
                <td style={{...td('left'),color:c.program==='SUPER'?'var(--tarot)':'var(--reiki)',fontWeight:500}}>{c.program}</td>
                <td style={td()}>{c.enrolled}</td>
                <td style={td()}>{inr(c.revenue)}</td>
                <td style={{...td(),color:'var(--success)'}}>{inr(c.received)}</td>
                <td style={{...td(),color:c.outstanding>0?'var(--warning)':'var(--text3)'}}>{inr(c.outstanding)}</td>
                <td style={td()}>{c.l1Pool||'—'}</td>
                <td style={{...td(),color:convColor(c.convRate),fontWeight:600}}>{c.convRate!==null?c.convRate+'%':'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {eye('Calendar quarterly view')}
      <div style={box}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr>{['Quarter','Tarot L1','SUPER','SUPER Conv%','Reiki L1','RGM','RGM Conv%','SUPER Rev','RGM Rev'].map((h,i)=><th key={h} style={i===0?thL:th}>{h}</th>)}</tr></thead>
          <tbody>
            {quarters.length===0?<tr><td colSpan={9} style={{...td(),textAlign:'center',padding:'2rem'}}>No data yet.</td></tr>
            :quarters.map(q=>(
              <tr key={q.label}>
                <td style={{...td('left'),color:'var(--text)',fontWeight:500}}>{q.label}</td>
                <td style={td()}>{q.tarotL1}</td>
                <td style={{...td(),color:'var(--tarot)',fontWeight:500}}>{q.superEnrolled}</td>
                <td style={{...td(),color:convColor(q.superConv),fontWeight:600}}>{q.superConv!==null?q.superConv+'%':'—'}</td>
                <td style={td()}>{q.reikiL1}</td>
                <td style={{...td(),color:'var(--reiki)',fontWeight:500}}>{q.rgmEnrolled}</td>
                <td style={{...td(),color:convColor(q.rgmConv),fontWeight:600}}>{q.rgmConv!==null?q.rgmConv+'%':'—'}</td>
                <td style={td()}>{inr(q.superRevenue)}</td>
                <td style={td()}>{inr(q.rgmRevenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
