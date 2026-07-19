import { useState, useEffect, useCallback, useMemo } from "react";
import { loadSalesData, loadLeadAttributionData, detectDuplicates } from "../utils/sheets.js";
import { getFunnel } from "../config.js";
import { inr, num } from "../utils/format.js";
import { fmtDisplay } from "../utils/dates.js";

// --- Helpers ------------------------------------------------------------------
const PERIODS = [
  { key:"today",       label:"Today"      },
  { key:"yesterday",   label:"Yesterday"  },
  { key:"thisWeek",    label:"This Week"  },
  { key:"lastWeek",    label:"Last Week"  },
  { key:"thisMonth",   label:"This Month" },
  { key:"lastMonth",   label:"Last Month" },
  { key:"last3months", label:"Last 3M"    },
  { key:"last6months", label:"Last 6M"    },
  { key:"thisYear",    label:"YTD"        },
];

function getDR(period) {
  const today = new Date();
  const iso = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const t = iso(today);
  if (period==="today")       return { from:t, to:t };
  if (period==="yesterday")   { const y=new Date(today); y.setDate(y.getDate()-1); return { from:iso(y), to:iso(y) }; }
  if (period==="thisWeek")    { const ws=new Date(today); ws.setDate(today.getDate()-((today.getDay()+6)%7)); return { from:iso(ws), to:t }; }
  if (period==="lastWeek")    { const we=new Date(today); we.setDate(today.getDate()-((today.getDay()+6)%7)-1); const ws=new Date(we); ws.setDate(we.getDate()-6); return { from:iso(ws), to:iso(we) }; }
  if (period==="thisMonth")   return { from:today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-01", to:t };
  if (period==="lastMonth")   { const lm=new Date(today.getFullYear(),today.getMonth()-1,1); const lme=new Date(today.getFullYear(),today.getMonth(),0); return { from:iso(lm), to:iso(lme) }; }
  if (period==="last3months") { const x=new Date(today); x.setMonth(x.getMonth()-3); return { from:iso(x), to:t }; }
  if (period==="last6months") { const x=new Date(today); x.setMonth(x.getMonth()-6); return { from:iso(x), to:t }; }
  if (period==="thisYear")    return { from:today.getFullYear()+"-01-01", to:t };
  return { from:t, to:t };
}

function getProgGroup(program) {
  const p = (program||"").toLowerCase();
  if (p.includes("tarot") || p.includes("diploma") || p.includes("mastery") || p.includes("mani")) return "tarot";
  if (p.includes("reiki") || p.includes("hooponopono") || p.includes("ho'oponopono") || p.includes("money reiki")) return "reiki";
  return "other";
}

function getAttr(e, attr) {
  if (!attr) return { source:"N/A", campaign:"N/A", adGroup:"N/A", adName:"N/A" };
  const group = getProgGroup(e.program);
  const map = group==="tarot" ? attr.tarotMap : group==="reiki" ? attr.reikiMap : null;
  if (!map) return { source:"N/A", campaign:"N/A", adGroup:"N/A", adName:"N/A" };
  return map.byEmail[e.email] || map.byPhone[e.phone] || { source:"N/A", campaign:"N/A", adGroup:"N/A", adName:"N/A" };
}

function paymentHealth(e) {
  if ((e.amtDue||0) <= 0) return { label:"Paid", color:"var(--success)", bg:"rgba(16,185,129,0.1)" };
  if ((e.amtReceived||0) <= 0) return { label:"Unpaid", color:"var(--danger)", bg:"rgba(239,68,68,0.1)" };
  const pct = Math.round(((e.amtReceived||0)/(e.programFee||1))*100);
  return { label:"Partial "+pct+"%", color:"var(--warning)", bg:"rgba(245,158,11,0.1)" };
}

function daysOverdue(e) {
  if (!e.date) return 0;
  return Math.floor((Date.now()-new Date(e.date+"T00:00:00").getTime())/86400000);
}

function dueColor(days) {
  if (days <= 7)  return { bg:"#FEF9C3", text:"#854D0E" };
  if (days <= 14) return { bg:"#FED7AA", text:"#9A3412" };
  if (days <= 21) return { bg:"#FECACA", text:"#991B1B" };
  return              { bg:"#FCA5A5", text:"#7F1D1D" };
}

function copyStudent(e) {
  const text = [e.name, e.phone, e.email, e.program, "Due: "+inr(e.amtDue||0)].join(" | ");
  navigator.clipboard.writeText(text);
}

// --- Shared styles ------------------------------------------------------------
const th  = { padding:"9px 12px", textAlign:"right", fontSize:11, fontWeight:500, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" };
const thL = { ...th, textAlign:"left" };
const tdS = (a) => ({ padding:"8px 12px", borderBottom:"1px solid var(--border2)", fontSize:12, color:"var(--text2)", textAlign:a||"right" });
const sbox = { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", marginBottom:20 };

// --- Simple bar chart (no external deps) --------------------------------------
function MiniBar({ data, color, valueKey="value", labelKey="label", prefix="Rs." }) {
  const max = Math.max(...data.map(d=>d[valueKey]||0), 1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:80, padding:"0 8px" }}>
      {data.map((d,i) => (
        <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
          <div title={(prefix)+Math.round(d[valueKey]).toLocaleString()} style={{ width:"100%", background:color, borderRadius:"3px 3px 0 0", height:((d[valueKey]||0)/max)*72+"px", minHeight:d[valueKey]?2:0 }} />
          <span style={{ fontSize:8, color:"var(--text3)", textAlign:"center", lineHeight:1.1 }}>{d[labelKey]}</span>
        </div>
      ))}
    </div>
  );
}

// --- All Students tab ---------------------------------------------------------
function AllStudentsTab({ enrollments, attr }) {
  const [period, setPeriod] = useState("thisMonth");
  const [group,  setGroup]  = useState("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(null);
  const [payFilter, setPayFilter] = useState("all");

  const { from, to } = getDR(period);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return enrollments.filter(e => {
      if (e.date < from || e.date > to) return false;
      if (group !== "all" && getProgGroup(e.program) !== group) return false;
      if (payFilter === "paid"    && (e.amtDue||0) > 0) return false;
      if (payFilter === "due"     && (e.amtDue||0) <= 0) return false;
      if (payFilter === "partial" && ((e.amtDue||0)<=0 || (e.amtReceived||0)<=0)) return false;
      if (s) return (e.email||"").includes(s) || (e.phone||"").includes(s) || (e.name||"").toLowerCase().includes(s) || (e.closedBy||"").toLowerCase().includes(s);
      return true;
    });
  }, [enrollments, from, to, group, search, payFilter]);

  const totalFee = filtered.reduce((t,e)=>t+(e.programFee||0),0);
  const totalRec = filtered.reduce((t,e)=>t+(e.amtReceived||0),0);
  const totalDue = filtered.reduce((t,e)=>t+(e.amtDue||0),0);

  function handleCopy(e, idx) {
    copyStudent(e);
    setCopied(idx);
    setTimeout(()=>setCopied(null), 1500);
  }

  return (
    <div style={{ padding:"0 24px 32px" }}>
      {/* Summary strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:1, background:"var(--border)", margin:"0 -24px 20px" }}>
        {[{l:"Students",v:num(filtered.length)},{l:"Revenue",v:inr(Math.round(totalFee)),c:"var(--success)"},{l:"Received",v:inr(Math.round(totalRec)),c:"var(--success)"},{l:"Outstanding",v:inr(Math.round(totalDue)),c:totalDue>0?"var(--warning)":null}].map(({l,v,c})=>(
          <div key={l} style={{ background:"var(--surface)", padding:"14px 20px" }}>
            <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:4 }}>{l}</div>
            <div style={{ fontSize:20, fontWeight:700, color:c||"var(--text)" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Filters row */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        {/* Search */}
        <input
          value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search name, email, phone, closer..."
          style={{ padding:"6px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface)", color:"var(--text)", fontSize:13, width:260 }}
        />
        {/* Period */}
        <div style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
          {PERIODS.map(p=>(
            <button key={p.key} onClick={()=>setPeriod(p.key)} style={{ border:"none", borderRadius:0, padding:"5px 9px", fontSize:11, fontWeight:500, background:period===p.key?"var(--tarot)":"transparent", color:period===p.key?"#fff":"var(--text3)", whiteSpace:"nowrap" }}>{p.label}</button>
          ))}
        </div>
        {/* Program group */}
        <div style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
          {[["all","All"],["tarot","Tarot"],["reiki","Reiki"],["other","Other"]].map(([k,l])=>(
            <button key={k} onClick={()=>setGroup(k)} style={{ border:"none", borderRadius:0, padding:"5px 12px", fontSize:11, fontWeight:500, background:group===k?"var(--tarot)":"transparent", color:group===k?"#fff":"var(--text3)" }}>{l}</button>
          ))}
        </div>
        {/* Payment filter */}
        <div style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
          {[["all","All"],["paid","Paid"],["partial","Partial"],["due","Unpaid"]].map(([k,l])=>(
            <button key={k} onClick={()=>setPayFilter(k)} style={{ border:"none", borderRadius:0, padding:"5px 10px", fontSize:11, fontWeight:500, background:payFilter===k?"var(--tarot)":"transparent", color:payFilter===k?"#fff":"var(--text3)" }}>{l}</button>
          ))}
        </div>
        <span style={{ fontSize:11, color:"var(--text3)" }}>{filtered.length} students</span>
      </div>

      {/* Table */}
      <div style={{ ...sbox, overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr>
              {["#","Date","Name","Phone","Email","Program","Fee","Received","Due","Status","Closer","Source","Campaign","Adset","Ad",""].map((h,i)=>(
                <th key={i} style={i<3?thL:i===15?{...th,width:36}:th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0
              ? <tr><td colSpan={16} style={{...tdS(),textAlign:"center",padding:"2rem",color:"var(--text3)"}}>No students match the current filters.</td></tr>
              : filtered.slice(0,200).map((e,i) => {
                  const ph = paymentHealth(e);
                  const ad = getAttr(e, attr);
                  return (
                    <tr key={i}>
                      <td style={tdS("left")}>{i+1}</td>
                      <td style={{...tdS("left"),whiteSpace:"nowrap"}}>{fmtDisplay(e.date)}</td>
                      <td style={{...tdS("left"),color:"var(--text)",fontWeight:500,whiteSpace:"nowrap"}}>{e.name||"--"}</td>
                      <td style={tdS()}>{e.phone||"--"}</td>
                      <td style={{...tdS("left"),maxWidth:160,overflow:"hidden",textOverflow:"ellipsis"}}>{e.email||"--"}</td>
                      <td style={{...tdS("left"),whiteSpace:"nowrap"}}>{e.program||"--"}</td>
                      <td style={tdS()}>{inr(Math.round(e.programFee||0))}</td>
                      <td style={{...tdS(),color:"var(--success)"}}>{inr(Math.round(e.amtReceived||0))}</td>
                      <td style={{...tdS(),color:(e.amtDue||0)>0?"var(--warning)":"var(--text3)"}}>{(e.amtDue||0)>0?inr(Math.round(e.amtDue)):"--"}</td>
                      <td style={tdS()}>
                        <span style={{ background:ph.bg, color:ph.color, padding:"2px 8px", borderRadius:4, fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>{ph.label}</span>
                      </td>
                      <td style={tdS()}>{e.closedBy&&e.closedBy!=="Unknown"?e.closedBy:"--"}</td>
                      <td style={{...tdS("left"),fontSize:11,color:"var(--text3)",maxWidth:80,overflow:"hidden",textOverflow:"ellipsis"}}>{ad.source||"N/A"}</td>
                      <td style={{...tdS("left"),fontSize:11,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis"}}>{ad.campaign||"N/A"}</td>
                      <td style={{...tdS("left"),fontSize:11,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis"}}>{ad.adGroup||"N/A"}</td>
                      <td style={{...tdS("left"),fontSize:11,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis"}}>{ad.adName||"N/A"}</td>
                      <td style={{...tdS(),padding:"4px 8px"}}>
                        <button onClick={()=>handleCopy(e,i)} title="Copy student details" style={{ border:"1px solid var(--border)", background:"var(--surface2)", borderRadius:4, padding:"2px 7px", fontSize:10, cursor:"pointer", color:"var(--text3)" }}>
                          {copied===i?"Copied!":"Copy"}
                        </button>
                      </td>
                    </tr>
                  );
                })
            }
            {filtered.length>200 && (
              <tr><td colSpan={16} style={{...tdS(),textAlign:"center",color:"var(--text3)",padding:"1rem"}}>Showing 200 of {filtered.length}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Defaulters tab -----------------------------------------------------------
function DefaultersTab({ enrollments }) {
  const today = new Date().toISOString().slice(0,10);

  const defaulters = useMemo(() => enrollments
    .filter(e => (e.amtDue||0) > 0)
    .map(e => ({ ...e, days: daysOverdue(e) }))
    .sort((a,b) => b.days - a.days),
    [enrollments]
  );

  // Group by enrollment month for charts
  const byMonth = useMemo(() => {
    const map = {};
    for (const e of defaulters) {
      if (!e.date) continue;
      const key = e.date.slice(0,7); // YYYY-MM
      if (!map[key]) map[key] = { label: key.slice(5)+"/"+key.slice(0,4), value:0 };
      map[key].value += e.amtDue||0;
    }
    return Object.values(map).sort((a,b)=>a.label<b.label?-1:1).slice(-12);
  }, [defaulters]);

  // Group by enrollment week (last 12 weeks)
  const byWeek = useMemo(() => {
    const map = {};
    for (const e of defaulters) {
      if (!e.date) continue;
      const d = new Date(e.date+"T00:00:00");
      d.setDate(d.getDate()+4-(d.getDay()||7));
      const wk = d.toISOString().slice(0,7)+"-W"+Math.ceil(((d-new Date(d.getFullYear(),0,1))/86400000+1)/7).toString().padStart(2,"0");
      if (!map[wk]) map[wk] = { label:"W"+Math.ceil(((d-new Date(d.getFullYear(),0,1))/86400000+1)/7), value:0 };
      map[wk].value += e.amtDue||0;
    }
    return Object.values(map).sort((a,b)=>a.label<b.label?-1:1).slice(-12);
  }, [defaulters]);

  const totalDue = defaulters.reduce((t,e)=>t+(e.amtDue||0),0);

  return (
    <div style={{ padding:"0 24px 32px" }}>
      {/* Summary */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:1, background:"var(--border)", margin:"0 -24px 20px" }}>
        {[{l:"Students with Due",v:num(defaulters.length)},{l:"Total Outstanding",v:inr(Math.round(totalDue)),c:"var(--danger)"},{l:"Avg Per Student",v:defaulters.length?inr(Math.round(totalDue/defaulters.length)):"--"}].map(({l,v,c})=>(
          <div key={l} style={{ background:"var(--surface)", padding:"14px 20px" }}>
            <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:4 }}>{l}</div>
            <div style={{ fontSize:20, fontWeight:700, color:c||"var(--text)" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
        {[{title:"Monthly Outstanding (by enrollment month)",data:byMonth,color:"var(--tarot)"},{title:"Weekly Outstanding (by enrollment week)",data:byWeek,color:"var(--reiki)"}].map(({title,data,color})=>(
          <div key={title} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"14px 16px" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"var(--text)", marginBottom:12 }}>{title}</div>
            {data.length===0
              ? <div style={{ fontSize:12, color:"var(--text3)", textAlign:"center", padding:"1rem" }}>No data</div>
              : <MiniBar data={data} color={color} />
            }
          </div>
        ))}
      </div>

      {/* Color legend */}
      <div style={{ display:"flex", gap:16, marginBottom:12, flexWrap:"wrap" }}>
        {[{c:dueColor(4),l:"1-7 days"},{c:dueColor(10),l:"8-14 days"},{c:dueColor(18),l:"15-21 days"},{c:dueColor(30),l:"22+ days"}].map(({c,l})=>(
          <div key={l} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"var(--text3)" }}>
            <div style={{ width:14, height:14, borderRadius:3, background:c.bg, border:"1px solid "+c.text }} />
            {l}
          </div>
        ))}
      </div>

      {/* Defaulters table */}
      <div style={sbox}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr>
              {["Name","Phone","Email","Program","Fee","Received","Due","Enrolled","Days Outstanding","Closer"].map((h,i)=>(
                <th key={h} style={i<3?thL:th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {defaulters.length===0
              ? <tr><td colSpan={10} style={{...tdS(),textAlign:"center",padding:"2rem",color:"var(--success)"}}>No outstanding payments -- all students are up to date</td></tr>
              : defaulters.map((e,i)=>{
                  const dc = dueColor(e.days);
                  return (
                    <tr key={i} style={{ background:dc.bg }}>
                      <td style={{...tdS("left"),color:"var(--text)",fontWeight:500}}>{e.name||"--"}</td>
                      <td style={tdS("left")}>{e.phone||"--"}</td>
                      <td style={{...tdS("left"),maxWidth:160,overflow:"hidden",textOverflow:"ellipsis"}}>{e.email||"--"}</td>
                      <td style={tdS("left")}>{e.program||"--"}</td>
                      <td style={tdS()}>{inr(Math.round(e.programFee||0))}</td>
                      <td style={{...tdS(),color:"var(--success)"}}>{inr(Math.round(e.amtReceived||0))}</td>
                      <td style={{...tdS(),fontWeight:700,color:dc.text}}>{inr(Math.round(e.amtDue||0))}</td>
                      <td style={tdS()}>{fmtDisplay(e.date)}</td>
                      <td style={{...tdS(),fontWeight:600,color:dc.text}}>{e.days}d</td>
                      <td style={tdS()}>{e.closedBy&&e.closedBy!=="Unknown"?e.closedBy:"--"}</td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Duplicates tab -----------------------------------------------------------
function DuplicatesTab({ enrollments }) {
  const [copied, setCopied] = useState(false);
  const { type1, type2 } = useMemo(() => detectDuplicates(enrollments), [enrollments]);
  const all = [...type1.map(d=>({...d,issue:"Same program"})), ...type2.map(d=>({...d,issue:"Diploma+Mastery"}))];

  function copyAll() {
    const lines = all.map(d=>[d.name,d.phone,d.email,d.program,d.date,d.issue].join(" | ")).join("\n");
    navigator.clipboard.writeText(lines);
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  }

  return (
    <div style={{ padding:"0 24px 32px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", margin:"16px 0 12px" }}>
        <div style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>
          {all.length===0 ? "No duplicates found" : all.length+" duplicate entries"}
        </div>
        {all.length>0 && (
          <button onClick={copyAll} style={{ background:"var(--tarot)", border:"none", color:"#fff", padding:"6px 14px", borderRadius:6, fontSize:12, fontWeight:500 }}>
            {copied?"Copied!":"Copy All & Slack Dolly"}
          </button>
        )}
      </div>
      <div style={sbox}>
        {all.length===0
          ? <div style={{ padding:"2rem", color:"var(--success)", fontSize:13, textAlign:"center" }}>All enrollment records are unique</div>
          : <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{["Name","Phone","Email","Program","Date","Issue"].map((h,i)=><th key={h} style={i<3?thL:th}>{h}</th>)}</tr></thead>
              <tbody>
                {all.map((d,i)=>(
                  <tr key={i}>
                    <td style={{...tdS("left"),color:"var(--text)",fontWeight:500}}>{d.name||"--"}</td>
                    <td style={tdS("left")}>{d.phone||"--"}</td>
                    <td style={tdS("left")}>{d.email||"--"}</td>
                    <td style={tdS("left")}>{d.program||"--"}</td>
                    <td style={tdS()}>{d.date||"--"}</td>
                    <td style={tdS()}>
                      <span style={{ background:"rgba(239,68,68,0.12)", color:"var(--danger)", padding:"2px 8px", borderRadius:4, fontSize:10, fontWeight:600 }}>{d.issue}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}

// --- Ads Performance tab -----------------------------------------------------
function AdsPerformanceTab({ enrollments, attr }) {
  function buildRankings(enrList, map) {
    const campaigns = {}, adsets = {};
    for (const e of enrList) {
      const a = map.byEmail[e.email] || map.byPhone[e.phone];
      if (!a) continue;
      const c = a.campaign || "Unknown";
      const s = a.adGroup  || "Unknown";
      if (!campaigns[c]) campaigns[c] = { name:c, count:0, fee:0 };
      if (!adsets[s])    adsets[s]    = { name:s, count:0, fee:0 };
      campaigns[c].count++; campaigns[c].fee += e.programFee||0;
      adsets[s].count++;    adsets[s].fee    += e.programFee||0;
    }
    return {
      campaigns: Object.values(campaigns).sort((a,b)=>b.count-a.count).slice(0,15),
      adsets:    Object.values(adsets).sort((a,b)=>b.count-a.count).slice(0,15),
    };
  }

  const tarotEnr = enrollments.filter(e => getProgGroup(e.program)==="tarot");
  const reikiEnr = enrollments.filter(e => getProgGroup(e.program)==="reiki");
  const tarotRank = attr ? buildRankings(tarotEnr, attr.tarotMap) : { campaigns:[], adsets:[] };
  const reikiRank = attr ? buildRankings(reikiEnr, attr.reikiMap) : { campaigns:[], adsets:[] };

  function RankTable({ data, label }) {
    const max = data[0]?.count || 1;
    return (
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:8 }}>{label}</div>
        <div style={sbox}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr><th style={thL}>Name</th><th style={th}>Enrollments</th><th style={th}>Revenue</th><th style={{...th,width:"40%"}}>Bar</th></tr></thead>
            <tbody>
              {data.length===0
                ? <tr><td colSpan={4} style={{...tdS(),textAlign:"center",padding:"1rem",color:"var(--text3)"}}>No attribution data matched</td></tr>
                : data.map((r,i)=>(
                    <tr key={i} style={{ background:i===0?"rgba(139,92,246,0.05)":"transparent" }}>
                      <td style={{...tdS("left"),fontWeight:i===0?600:400}}>{r.name||"--"}</td>
                      <td style={{...tdS(),fontWeight:600}}>{r.count}</td>
                      <td style={{...tdS(),color:"var(--success)"}}>{inr(Math.round(r.fee))}</td>
                      <td style={{...tdS(),padding:"6px 12px"}}>
                        <div style={{ height:10, background:"var(--border)", borderRadius:5 }}>
                          <div style={{ height:10, width:(r.count/max*100)+"%", background:"var(--tarot)", borderRadius:5 }} />
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding:"0 24px 32px" }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, marginTop:16 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:"var(--tarot)", marginBottom:16 }}>Tarot Funnel</div>
          <RankTable data={tarotRank.campaigns} label="Top Campaigns" />
          <RankTable data={tarotRank.adsets}    label="Top Adsets" />
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:"var(--reiki)", marginBottom:16 }}>Reiki Funnel</div>
          <RankTable data={reikiRank.campaigns} label="Top Campaigns" />
          <RankTable data={reikiRank.adsets}    label="Top Adsets" />
        </div>
      </div>
    </div>
  );
}

// --- Main CRM component -------------------------------------------------------
const SUBS = [
  { key:"students",   label:"All Students"     },
  { key:"defaulters", label:"Defaulters"       },
  { key:"duplicates", label:"Duplicates"       },
];

export default function CRM() {
  const [enrollments, setEnrollments] = useState([]);
  const [attr,        setAttr]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [updated,     setUpdated]     = useState(null);
  const [sub,         setSub]         = useState("students");

  const load = useCallback(async () => {
    setLoading(true);
    const withTimeout = (p, fb, ms=12000) => Promise.race([p, new Promise(r=>setTimeout(()=>r(fb),ms))]);
    try {
      const [enr, leadAttr] = await Promise.all([
        withTimeout(loadSalesData(),            []),
        withTimeout(loadLeadAttributionData(),  null),
      ]);
      setEnrollments(Array.isArray(enr) ? enr : []);
      setAttr(leadAttr);
    } catch(_) {
      setEnrollments([]);
    } finally {
      setLoading(false); setUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding:"3rem", color:"var(--text3)", textAlign:"center" }}>Loading CRM data...</div>;

  return (
    <div>
      {/* Header bar */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 24px", borderBottom:"1px solid var(--border)", background:"var(--surface2)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:12, color:"var(--success)" }}>Live</span>
          {updated && <span style={{ fontSize:11, color:"var(--text3)" }}>{updated.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span>}
          {!attr && <span style={{ fontSize:11, color:"var(--warning)", marginLeft:8 }}>Lead attribution not loaded -- check sheet access</span>}
        </div>
        <button onClick={load} style={{ fontSize:12 }}>Refresh</button>
      </div>

      {/* Sub-tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid var(--border)", background:"var(--surface2)", padding:"0 24px" }}>
        {SUBS.map(t => {
          const isA = sub===t.key;
          const badge = t.key==="defaulters" ? enrollments.filter(e=>(e.amtDue||0)>0).length : null;
          return (
            <button key={t.key} onClick={()=>setSub(t.key)} style={{
              background:"none", border:"none", whiteSpace:"nowrap", cursor:"pointer", borderRadius:0,
              borderBottom: isA?"2px solid var(--tarot)":"2px solid transparent",
              color: isA?"var(--text)":"var(--text3)",
              fontWeight: isA?500:400,
              padding:"10px 18px", fontSize:13,
            }}>
              {t.label}
              {badge>0 && <span style={{ marginLeft:6, background:"var(--danger)", color:"#fff", borderRadius:10, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{badge}</span>}
            </button>
          );
        })}
      </div>

      {sub==="students"   && <AllStudentsTab  enrollments={enrollments} attr={attr} />}
      {sub==="defaulters" && <DefaultersTab   enrollments={enrollments} />}
      {sub==="duplicates" && <DuplicatesTab   enrollments={enrollments} />}
    </div>
  );
}
