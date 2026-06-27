import { useState, useEffect, useCallback } from 'react';
import { loadSalesData, loadEMIData, getEMISample } from '../utils/sheets.js';
import { toISO } from '../utils/dates.js';
import { inr, num } from '../utils/format.js';

const TAROT_PROGS = ['tarot - mastery','tarot - diploma','tarot - health','30 days mani'];
const REIKI_PROGS = ['reiki - l1/l2','reiki - l3','money reiki',"ho'oponopono",'hooponopono'];
const TAROT_COLS  = { phoneCol:1, emailCol:0, dateCol:5,  campaignCol:14, adGroupCol:15, adNameCol:16, sourceCol:13 };
const REIKI_COLS  = { phoneCol:1, emailCol:0, dateCol:5,  campaignCol:14, adGroupCol:15, adNameCol:16, sourceCol:13 };

function getFunnel(program) {
  const p=(program||'').toLowerCase();
  if (TAROT_PROGS.some(x=>p.includes(x))) return 'Tarot';
  if (REIKI_PROGS.some(x=>p.includes(x))) return 'Reiki';
  return 'Other';
}

function buildLeadMap(rows, { phoneCol, emailCol, dateCol, campaignCol, adGroupCol, adNameCol, sourceCol }) {
  const map = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const phone = r[phoneCol]?.replace(/\D/g,'').slice(-10)||'';
    const email = r[emailCol]?.toLowerCase().trim()||'';
    const date  = toISO(r[dateCol], true);
    const campaign = r[campaignCol]?.trim()||'';
    const adGroup  = r[adGroupCol]?.trim()||'';
    const adName   = r[adNameCol]?.trim()||'';
    if (!campaign && !adGroup && !adName) continue;
    const info = { campaign, adGroup, adName, date };
    const update = k => { const ex=map.get(k); if (!ex||(date&&date>(ex.date||''))) map.set(k,info); };
    if (phone) update('p:'+phone);
    if (email) update('e:'+email);
  }
  return map;
}

function buildLeadCounts(rows,{campaignCol,adGroupCol,adNameCol}){
  const campaign={},adGroup={},adName={};
  for(let i=1;i<rows.length;i++){const r=rows[i];const c=r[campaignCol]?.trim()||'';if(c)campaign[c]=(campaign[c]||0)+1;const g=r[adGroupCol]?.trim()||'';if(g)adGroup[g]=(adGroup[g]||0)+1;const n=r[adNameCol]?.trim()||'';if(n)adName[n]=(adName[n]||0)+1;}
  return{campaign,adGroup,adName};
}

function aggregate(attributed,dimKey){
  const map={};
  for(const e of attributed){const k=e[dimKey]||'Unknown / Direct';if(!map[k])map[k]={name:k,funnel:e.funnel,enrolled:0,revenue:0};map[k].enrolled++;map[k].revenue+=e.revenue;if(map[k].funnel!==e.funnel)map[k].funnel='Mixed';}
  return Object.values(map).sort((a,b)=>b.revenue-a.revenue);
}

const th  = { padding:'10px 14px', textAlign:'right', fontSize:11, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, borderBottom:'1px solid var(--border)' };
const thL = { ...th, textAlign:'left' };
const td  = (a='right') => ({ padding:'9px 14px', borderBottom:'1px solid var(--border2)', color:'var(--text2)', fontSize:13, textAlign:a });
const funnelColor=(f)=>{if(f==='Tarot'||f==='SUPER')return'var(--tarot)';if(f==='Reiki'||f==='RGM')return'var(--reiki)';return'var(--text3)';};
const dimLabels={campaign:'Campaign',adGroup:'Ad Group / Adset',adName:'Ad Creative / Name'};

export default function Attribution({ tarotRows, reikiRows }) {
  const [salesData, setSalesData] = useState(null);
  const [emiData,   setEmiData]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [progFilter,setProgFilter]= useState('ALL');
  const [dimView,   setDimView]   = useState('campaign');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sales, emi] = await Promise.all([loadSalesData(), loadEMIData().catch(()=>getEMISample())]);
      setSalesData(sales); setEmiData(emi);
    } catch (e) { setSalesData([]); setEmiData(getEMISample()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{padding:'2rem',textAlign:'center',color:'var(--text3)',fontSize:13}}>Building attribution data...</div>;

  const safeRows = rows => Array.isArray(rows) ? rows : [];
  const tarotMap = buildLeadMap(safeRows(tarotRows), TAROT_COLS);
  const reikiMap = buildLeadMap(safeRows(reikiRows), REIKI_COLS);
  const tarotCounts = buildLeadCounts(safeRows(tarotRows), TAROT_COLS);
  const reikiCounts = buildLeadCounts(safeRows(reikiRows), REIKI_COLS);

  const lookup = (phone, email, leadMap) =>
    (phone && leadMap.get('p:'+phone)) ||
    (email && leadMap.get('e:'+email)) ||
    { campaign:'Direct / Organic', adGroup:'Direct / Organic', adName:'Direct / Organic' };

  const attributed = [];
  for (const e of (salesData||[])) {
    const funnel = getFunnel(e.program);
    const map = funnel==='Tarot'?tarotMap:funnel==='Reiki'?reikiMap:null;
    if (!map) continue;
    const attr = lookup(e.phone, e.email, map);
    attributed.push({ program:e.program, funnel, revenue:e.programFee, ...attr });
  }
  for (const s of (emiData?.v2||[])) {
    const map = s.program==='SUPER'?tarotMap:reikiMap;
    const attr = lookup(s.phone, s.email, map);
    attributed.push({ program:s.program, funnel:s.program==='SUPER'?'SUPER':'RGM', revenue:s.totalPlanned||0, ...attr });
  }

  const PROG_FILTER = { ALL:()=>true, Tarot:e=>e.funnel==='Tarot', Reiki:e=>e.funnel==='Reiki', SUPER:e=>e.funnel==='SUPER', RGM:e=>e.funnel==='RGM' };
  const filtered = attributed.filter(PROG_FILTER[progFilter]||PROG_FILTER.ALL);
  const rows = aggregate(filtered, dimView);
  const totalEnrolled = rows.reduce((s,r)=>s+r.enrolled,0);
  const totalRevenue  = rows.reduce((s,r)=>s+r.revenue,0);

  const getLeadCount = (dimValue, funnel) => {
    const src = (funnel==='Tarot'||funnel==='SUPER') ? tarotCounts : (funnel==='Reiki'||funnel==='RGM') ? reikiCounts : null;
    if (!src) return null;
    return src[dimView]?.[dimValue] || null;
  };

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          {['ALL','Tarot','Reiki','SUPER','RGM'].map(p=>(
            <button key={p} onClick={()=>setProgFilter(p)} style={{border:'none',borderRadius:0,padding:'5px 12px',fontSize:12,fontWeight:500,background:progFilter===p?'var(--tarot)':'transparent',color:progFilter===p?'#fff':'var(--text3)'}}>{p}</button>
          ))}
        </div>
        <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          {Object.entries(dimLabels).map(([k,l])=>(
            <button key={k} onClick={()=>setDimView(k)} style={{border:'none',borderRadius:0,padding:'5px 12px',fontSize:12,fontWeight:500,background:dimView===k?'var(--reiki)':'transparent',color:dimView===k?'#fff':'var(--text3)'}}>{l}</button>
          ))}
        </div>
        <span style={{fontSize:11,color:'var(--text3)'}}>{filtered.length} enrollments · {inr(totalRevenue)} total</span>
      </div>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead>
            <tr>
              <th style={thL}>{dimLabels[dimView]}</th>
              <th style={thL}>Funnel</th>
              <th style={th}>Enrolled</th>
              <th style={th}>Revenue</th>
              <th style={th}>Avg deal</th>
              <th style={th}>Total leads</th>
              <th style={th}>Conv%</th>
              <th style={th}>Rev share</th>
            </tr>
          </thead>
          <tbody>
            {rows.length===0
              ?<tr><td colSpan={8} style={{...td(),textAlign:'center',padding:'2rem'}}>No attribution data yet. Lead sheets may not have campaign columns.</td></tr>
              :rows.map((r,i)=>{
                const lc=getLeadCount(r.name,r.funnel);
                const conv=lc?((r.enrolled/lc)*100).toFixed(1)+'%':'—';
                const avg=r.enrolled>0?Math.round(r.revenue/r.enrolled):0;
                const share=totalRevenue>0?((r.revenue/totalRevenue)*100).toFixed(1)+'%':'—';
                return(
                  <tr key={i}>
                    <td style={{...td('left'),color:'var(--text)',fontWeight:500,maxWidth:260}}><div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={r.name}>{r.name||'—'}</div></td>
                    <td style={{...td('left'),color:funnelColor(r.funnel),fontWeight:500,fontSize:11}}>{r.funnel}</td>
                    <td style={{...td(),color:'var(--text)',fontWeight:600}}>{r.enrolled}</td>
                    <td style={{...td(),color:'var(--success)',fontWeight:600}}>{inr(r.revenue)}</td>
                    <td style={td()}>{inr(avg)}</td>
                    <td style={{...td(),color:'var(--text3)'}}>{lc?num(lc):'—'}</td>
                    <td style={{...td(),color:lc&&parseFloat(conv)>=5?'var(--success)':lc&&parseFloat(conv)>=2?'var(--warning)':'var(--text3)',fontWeight:600}}>{conv}</td>
                    <td style={{...td(),fontSize:11}}>{share}</td>
                  </tr>
                );
              })
            }
          </tbody>
          {rows.length>0&&(
            <tfoot>
              <tr style={{borderTop:'2px solid var(--border)',background:'var(--surface2)'}}>
                <td style={{...td('left'),color:'var(--text)',fontWeight:700}}>Total</td>
                <td style={td()}></td>
                <td style={{...td(),color:'var(--text)',fontWeight:700}}>{totalEnrolled}</td>
                <td style={{...td(),color:'var(--success)',fontWeight:700}}>{inr(totalRevenue)}</td>
                <td style={{...td(),fontWeight:700}}>{inr(totalEnrolled>0?Math.round(totalRevenue/totalEnrolled):0)}</td>
                <td style={td()}>—</td><td style={td()}>—</td><td style={td()}>100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div style={{fontSize:11,color:'var(--text3)',marginTop:10,lineHeight:1.6}}>
        Last-touch attribution. SUPER/RGM traced back to original Tarot/Reiki lead source. Conv% = enrolled ÷ total leads from that {dimLabels[dimView].toLowerCase()} (L1 funnels only).
      </div>
    </div>
  );
}
