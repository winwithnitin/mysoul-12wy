import { useState, useEffect, useCallback, useMemo } from "react";
import { loadSalesData } from "../utils/sheets.js";
import { inr, num } from "../utils/format.js";

// --- Helpers ------------------------------------------------------------------
function getProgGroup(program) {
  const p = (program||"").toLowerCase();
  if (p.includes("tarot") || p.includes("diploma") || p.includes("mastery") || p.includes("mani")) return "tarot";
  if (p.includes("reiki") || p.includes("hooponopono") || p.includes("ho'oponopono") || p.includes("money reiki")) return "reiki";
  return "other";
}

function getWeekNum(dateStr) {
  const d = new Date(dateStr+"T00:00:00");
  const jan1 = new Date(d.getFullYear(),0,1);
  return Math.ceil(((d-jan1)/86400000+jan1.getDay()+1)/7);
}

function pct(n,total) { return total>0?Math.round((n/total)*100)+"%":"--"; }

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const th  = { padding:"9px 12px", textAlign:"right", fontSize:11, fontWeight:500, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" };
const thL = { ...th, textAlign:"left" };
const tdS = (a) => ({ padding:"8px 12px", borderBottom:"1px solid var(--border2)", fontSize:12, color:"var(--text2)", textAlign:a||"right" });
const sbox = { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", marginBottom:20 };

// --- Period group (month or week) breakdown table ----------------------------
function PeriodTable({ rows, totalRow, label }) {
  const cols = [
    { h:label,        k:"label",  al:"left",   c:null },
    { h:"Enrollments",k:"count",  al:"right",  c:null,              fmt:n=>num(n) },
    { h:"Revenue",    k:"fee",    al:"right",  c:"var(--success)",  fmt:n=>inr(Math.round(n)) },
    { h:"Received",   k:"rec",    al:"right",  c:"var(--success)",  fmt:n=>inr(Math.round(n)) },
    { h:"Due",        k:"due",    al:"right",  c:"var(--warning)",  fmt:n=>inr(Math.round(n)) },
    { h:"% Received", k:"pctRec", al:"right",  c:null,              fmt:n=>n },
    { h:"% Due",      k:"pctDue", al:"right",  c:"var(--warning)",  fmt:n=>n },
  ];

  return (
    <div style={sbox}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <thead>
          <tr>{cols.map((c,i)=><th key={i} style={i===0?thL:th}>{c.h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row,i) => (
            <tr key={i} style={{ background:i%2===0?"transparent":"rgba(0,0,0,0.01)" }}>
              {cols.map((c,j) => (
                <td key={j} style={{ ...tdS(c.al), color:c.c||"var(--text2)", fontWeight: j===0?500:400 }}>
                  {c.fmt ? c.fmt(row[c.k]) : row[c.k]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totalRow && (
          <tfoot>
            <tr style={{ borderTop:"2px solid var(--border)", background:"var(--surface2)" }}>
              {cols.map((c,j) => (
                <td key={j} style={{ ...tdS(c.al), color:c.c||"var(--text)", fontWeight:700 }}>
                  {c.fmt ? c.fmt(totalRow[c.k]) : totalRow[c.k]}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// --- Simple sparkline bar chart -----------------------------------------------
function SparkBars({ rows, valueKey, color }) {
  const max = Math.max(...rows.map(r=>r[valueKey]||0), 1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:60, marginTop:8 }}>
      {rows.map((r,i) => (
        <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
          <div style={{ width:"100%", background:color, borderRadius:"2px 2px 0 0", height:((r[valueKey]||0)/max)*54+"px", minHeight:(r[valueKey]||0)?2:0 }} />
          <span style={{ fontSize:7, color:"var(--text3)", marginTop:1, textAlign:"center" }}>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

// --- Main Performance component -----------------------------------------------
export default function Performance() {
  const [enrollments, setEnrollments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [updated,     setUpdated]     = useState(null);
  const [year,        setYear]        = useState(new Date().getFullYear());
  const [progGroup,   setProgGroup]   = useState("all");
  const [view,        setView]        = useState("monthly"); // "monthly" | "weekly"

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const enr = await loadSalesData();
      setEnrollments(Array.isArray(enr)?enr:[]);
    } catch(_) { setEnrollments([]); }
    finally { setLoading(false); setUpdated(new Date()); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derive available years from data
  const years = useMemo(() => {
    const yrs = new Set(enrollments.map(e=>(e.date||"").slice(0,4)).filter(Boolean));
    return [...yrs].sort().reverse();
  }, [enrollments]);

  // Filter by year + program group
  const filtered = useMemo(() => {
    return enrollments.filter(e => {
      if (!e.date || e.date.slice(0,4) !== String(year)) return false;
      if (progGroup==="all") return true;
      return getProgGroup(e.program) === progGroup;
    });
  }, [enrollments, year, progGroup]);

  // Build monthly rows
  const monthlyRows = useMemo(() => {
    const map = {};
    for (let m=1;m<=12;m++) map[m] = { label:MONTHS[m-1], count:0, fee:0, rec:0, due:0 };
    for (const e of filtered) {
      const m = parseInt((e.date||"").slice(5,7));
      if (!map[m]) continue;
      map[m].count++;
      map[m].fee += e.programFee||0;
      map[m].rec += e.amtReceived||0;
      map[m].due += e.amtDue||0;
    }
    return Object.values(map).map(r => ({ ...r, pctRec:pct(r.rec,r.fee), pctDue:pct(r.due,r.fee) }));
  }, [filtered]);

  // Build weekly rows
  const weeklyRows = useMemo(() => {
    const map = {};
    for (const e of filtered) {
      if (!e.date) continue;
      const wk = getWeekNum(e.date);
      const key = "W"+String(wk).padStart(2,"0");
      if (!map[key]) map[key] = { label:key, count:0, fee:0, rec:0, due:0 };
      map[key].count++;
      map[key].fee += e.programFee||0;
      map[key].rec += e.amtReceived||0;
      map[key].due += e.amtDue||0;
    }
    return Object.values(map).sort((a,b)=>a.label<b.label?-1:1).map(r => ({
      ...r, pctRec:pct(r.rec,r.fee), pctDue:pct(r.due,r.fee)
    }));
  }, [filtered]);

  const rows = view==="monthly" ? monthlyRows : weeklyRows;
  const totalRow = {
    label: "TOTAL",
    count: rows.reduce((t,r)=>t+r.count, 0),
    fee:   rows.reduce((t,r)=>t+r.fee,   0),
    rec:   rows.reduce((t,r)=>t+r.rec,   0),
    due:   rows.reduce((t,r)=>t+r.due,   0),
    pctRec: pct(rows.reduce((t,r)=>t+r.rec,0), rows.reduce((t,r)=>t+r.fee,0)),
    pctDue: pct(rows.reduce((t,r)=>t+r.due,0), rows.reduce((t,r)=>t+r.fee,0)),
  };

  if (loading) return <div style={{ padding:"3rem", color:"var(--text3)", textAlign:"center" }}>Loading performance data...</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 24px", borderBottom:"1px solid var(--border)", background:"var(--surface2)", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {/* Year selector */}
          <div style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
            {years.length===0 ? [2024,2025,2026] : years.map(y=>(
              <button key={y} onClick={()=>setYear(y)} style={{ border:"none", borderRadius:0, padding:"5px 12px", fontSize:12, fontWeight:500, background:year===y?"var(--tarot)":"transparent", color:year===y?"#fff":"var(--text3)" }}>{y}</button>
            ))}
          </div>
          {/* Program group */}
          <div style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
            {[["all","All"],["tarot","Tarot"],["reiki","Reiki"],["other","Other"]].map(([k,l])=>(
              <button key={k} onClick={()=>setProgGroup(k)} style={{ border:"none", borderRadius:0, padding:"5px 12px", fontSize:11, fontWeight:500, background:progGroup===k?"var(--tarot)":"transparent", color:progGroup===k?"#fff":"var(--text3)" }}>{l}</button>
            ))}
          </div>
          {/* View toggle */}
          <div style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
            {[["monthly","Monthly"],["weekly","Weekly"]].map(([k,l])=>(
              <button key={k} onClick={()=>setView(k)} style={{ border:"none", borderRadius:0, padding:"5px 14px", fontSize:11, fontWeight:500, background:view===k?"var(--tarot)":"transparent", color:view===k?"#fff":"var(--text3)" }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {updated && <span style={{ fontSize:11, color:"var(--text3)" }}>{updated.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span>}
          <button onClick={load}>Refresh</button>
        </div>
      </div>

      <div style={{ padding:"20px 24px 32px" }}>
        {/* KPI cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:1, background:"var(--border)", marginBottom:24, borderRadius:12, overflow:"hidden" }}>
          {[
            { l:"Enrollments",  v:num(totalRow.count) },
            { l:"Revenue",      v:inr(Math.round(totalRow.fee)), c:"var(--success)" },
            { l:"Received",     v:inr(Math.round(totalRow.rec)), c:"var(--success)" },
            { l:"Outstanding",  v:inr(Math.round(totalRow.due)), c:totalRow.due>0?"var(--warning)":null },
            { l:"% Received",   v:totalRow.pctRec, c:"var(--success)" },
          ].map(({l,v,c})=>(
            <div key={l} style={{ background:"var(--surface)", padding:"14px 20px" }}>
              <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:4 }}>{l}</div>
              <div style={{ fontSize:18, fontWeight:700, color:c||"var(--text)" }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Sparkline charts */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
          {[{k:"count",l:"Enrollments",c:"var(--tarot)"},{k:"rec",l:"Cash Received",c:"var(--reiki)"}].map(({k,l,c})=>(
            <div key={k} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"14px 16px" }}>
              <div style={{ fontSize:12, fontWeight:600, color:"var(--text)", marginBottom:4 }}>{l} -- {view==="monthly"?"by Month":"by Week"} ({year})</div>
              <SparkBars rows={rows} valueKey={k} color={c} />
            </div>
          ))}
        </div>

        {/* Data table */}
        <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>
          {view==="monthly" ? "Monthly" : "Weekly"} Breakdown -- {year} {progGroup!=="all"?"("+progGroup.charAt(0).toUpperCase()+progGroup.slice(1)+")":""}
        </div>
        <PeriodTable
          rows={rows}
          totalRow={totalRow}
          label={view==="monthly"?"Month":"Week"}
        />
      </div>
    </div>
  );
}
