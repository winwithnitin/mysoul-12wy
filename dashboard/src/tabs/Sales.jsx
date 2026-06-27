import { useState, useEffect, useCallback } from "react";
import { loadSalesData, loadTransactionData, loadEMIData, getEMISample, detectDuplicates } from "../utils/sheets.js";
import { fmtDisplay } from "../utils/dates.js";
import { inr, num } from "../utils/format.js";
import { getFunnel } from "../config.js";

// -- Period helpers ----------------------------------------------------------
const PERIODS = [
  { key:"today",       label:"Today"       },
  { key:"yesterday",   label:"Yesterday"   },
  { key:"thisWeek",    label:"This Week"   },
  { key:"lastWeek",    label:"Last Week"   },
  { key:"thisMonth",   label:"This Month"  },
  { key:"lastMonth",   label:"Last Month"  },
  { key:"last3months", label:"Last 3M"     },
  { key:"last6months", label:"Last 6M"     },
  { key:"thisYear",    label:"YTD"         },
];

function getDR(period) {
  const today = new Date();
  const iso = d => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  const t = iso(today);
  if (period === "today") return { from:t, to:t };
  if (period === "yesterday") { const y=new Date(today); y.setDate(y.getDate()-1); return { from:iso(y), to:iso(y) }; }
  if (period === "thisWeek") { const ws=new Date(today); ws.setDate(today.getDate()-((today.getDay()+6)%7)); return { from:iso(ws), to:t }; }
  if (period === "lastWeek") { const we=new Date(today); we.setDate(today.getDate()-((today.getDay()+6)%7)-1); const ws=new Date(we); ws.setDate(we.getDate()-6); return { from:iso(ws), to:iso(we) }; }
  if (period === "thisMonth") return { from:today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-01", to:t };
  if (period === "lastMonth") { const lm=new Date(today.getFullYear(),today.getMonth()-1,1); const lme=new Date(today.getFullYear(),today.getMonth(),0); return { from:iso(lm), to:iso(lme) }; }
  if (period === "last3months") { const x=new Date(today); x.setMonth(x.getMonth()-3); return { from:iso(x), to:t }; }
  if (period === "last6months") { const x=new Date(today); x.setMonth(x.getMonth()-6); return { from:iso(x), to:t }; }
  if (period === "thisYear") return { from:today.getFullYear()+"-01-01", to:t };
  return { from:t, to:t };
}

// -- Closer colours -----------------------------------------------------------
const CC = {
  rudrani:   { bg:"var(--tarot)",  dim:"rgba(139,92,246,0.12)"  },
  vandna:    { bg:"var(--reiki)",  dim:"rgba(16,185,129,0.12)"  },
  sneha:     { bg:"#F59E0B",      dim:"rgba(245,158,11,0.12)"  },
  deesha:    { bg:"#06B6D4",      dim:"rgba(6,182,212,0.12)"   },
  bhumika:   { bg:"#EC4899",      dim:"rgba(236,72,153,0.12)"  },
  tanvi:     { bg:"#3B82F6",      dim:"rgba(59,130,246,0.12)"  },
  chandrika: { bg:"#EF4444",      dim:"rgba(239,68,68,0.12)"   },
  mehakleen: { bg:"#8B5CF6",      dim:"rgba(139,92,246,0.12)"  },
};
function cc(name) {
  if (!name) return { bg:"var(--text3)", dim:"rgba(100,100,100,0.1)" };
  const key = name.toLowerCase().split(" ")[0];
  return CC[key] || { bg:"var(--text3)", dim:"rgba(100,100,100,0.1)" };
}

// -- Styles -------------------------------------------------------------------
const th  = { padding:"10px 14px", textAlign:"right",  fontSize:11, fontWeight:500, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, borderBottom:"1px solid var(--border)" };
const thL = { ...th, textAlign:"left" };
const tdS = (a) => ({ padding:"9px 14px", borderBottom:"1px solid var(--border2)", color:"var(--text2)", fontSize:13, textAlign: a || "right" });
const sbox = { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", marginBottom:20 };
const ISOT = p => ["tarot","mastery","diploma","30 days mani"].some(k => (p||"").toLowerCase().includes(k));
const ISOR = p => ["reiki","hooponopono"].some(k => (p||"").toLowerCase().includes(k));

function CTag({ name }) {
  const col = cc(name);
  return (
    <span style={{ background:col.dim, color:col.bg, padding:"2px 8px", borderRadius:4, fontWeight:600, fontSize:11 }}>
      {name}
    </span>
  );
}

function PeriodBar({ value, onChange }) {
  return (
    <div style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", flexShrink:0 }}>
      {PERIODS.map(p => (
        <button key={p.key} onClick={() => onChange(p.key)} style={{
          border:"none", borderRadius:0, padding:"5px 9px", fontSize:11, fontWeight:500,
          background: value===p.key ? "var(--tarot)" : "transparent",
          color:      value===p.key ? "#fff" : "var(--text3)",
          whiteSpace: "nowrap",
        }}>{p.label}</button>
      ))}
    </div>
  );
}

// -- Overview tab -------------------------------------------------------------
function OverviewTab({ enr, all }) {
  const [dc, setDc] = useState(false);
  const tR   = enr.reduce((s,e) => s+e.programFee,   0);
  const tRec = enr.reduce((s,e) => s+e.amtReceived,  0);
  const tDue = enr.reduce((s,e) => s+e.amtDue,       0);

  const fm = {};
  for (const e of enr) {
    const f = getFunnel(e.program) || "Other";
    if (!fm[f]) fm[f] = { count:0, rev:0, rec:0, due:0 };
    fm[f].count++; fm[f].rev += e.programFee; fm[f].rec += e.amtReceived; fm[f].due += e.amtDue;
  }
  const fc = { Tarot:"var(--tarot)", Reiki:"var(--reiki)", Other:"var(--text3)" };

  const pm = {};
  for (const e of enr) {
    const k = e.program || "Unknown";
    if (!pm[k]) pm[k] = { count:0, rev:0 };
    pm[k].count++; pm[k].rev += e.programFee;
  }
  const progs = Object.entries(pm).map(([name,d]) => ({name,...d})).sort((a,b) => b.rev-a.rev);

  const { type1, type2 } = detectDuplicates(all);
  const dups = type1.length + type2.length;

  function copyDups() {
    const lines = [
      "Duplicate Alert -- " + dups + " issues -- " + new Date().toLocaleDateString("en-IN"),
      "",
      ...(type1.length ? ["TYPE 1 -- Same program twice:", ...type1.map(d => "  "+d.name+" ("+d.phone+") , "+d.program+" , "+d.date)] : []),
      ...(type2.length ? ["","TYPE 2 -- Diploma+Mastery:",  ...type2.map(d => "  "+d.name+" ("+d.phone+") , "+d.program+" , "+d.date)] : []),
    ].join("\n");
    navigator.clipboard.writeText(lines);
    window.open("https://app.slack.com/client/T0B3W8201B4/C0B3W8201B4","_blank");
    setDc(true); setTimeout(() => setDc(false), 3000);
  }

  return (
    <div style={{ padding:"0 24px 32px" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:1, background:"var(--border)", margin:"0 -24px 24px" }}>
        {[
          { l:"Enrollments", v:num(enr.length), c:null },
          { l:"Revenue",     v:inr(Math.round(tR)),   c:"var(--success)" },
          { l:"Received",    v:inr(Math.round(tRec)), c:"var(--success)" },
          { l:"Outstanding", v:inr(Math.round(tDue)), c:tDue>0?"var(--warning)":null },
        ].map(({ l,v,c }) => (
          <div key={l} style={{ background:"var(--surface)", padding:"16px 24px" }}>
            <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:4 }}>{l}</div>
            <div style={{ fontSize:22, fontWeight:600, color:c||"var(--text)" }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
        <div>
          <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>By Funnel</div>
          <div style={sbox}>
            {Object.entries(fm).length === 0
              ? <div style={{ padding:"1.5rem", color:"var(--text3)", fontSize:13 }}>No enrollments.</div>
              : Object.entries(fm).sort((a,b) => b[1].rev-a[1].rev).map(([f,d]) => (
                  <div key={f} style={{ padding:"12px 16px", borderBottom:"1px solid var(--border2)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:fc[f]||"var(--text3)" }}>{f}</span>
                      <span style={{ fontSize:12, color:"var(--text3)" }}>{d.count} students</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text2)" }}>
                      <span>Rev: <strong style={{ color:"var(--text)" }}>{inr(Math.round(d.rev))}</strong></span>
                      <span>Recd: <strong style={{ color:"var(--success)" }}>{inr(Math.round(d.rec))}</strong></span>
                      {d.due > 0 && <span>Due: <strong style={{ color:"var(--warning)" }}>{inr(Math.round(d.due))}</strong></span>}
                    </div>
                  </div>
              ))
            }
          </div>
        </div>
        <div>
          <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>By Program</div>
          <div style={sbox}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead><tr>{["Program","#","Revenue","Avg"].map((h,i) => <th key={h} style={i===0?thL:th}>{h}</th>)}</tr></thead>
              <tbody>
                {progs.length === 0
                  ? <tr><td colSpan={4} style={{ ...tdS(), textAlign:"center", padding:"1.5rem", color:"var(--text3)" }}>No data</td></tr>
                  : progs.map(p => (
                      <tr key={p.name}>
                        <td style={{ ...tdS("left"), color:"var(--text)", fontWeight:500 }}>{p.name||"--"}</td>
                        <td style={tdS()}>{p.count}</td>
                        <td style={{ ...tdS(), color:"var(--success)", fontWeight:600 }}>{inr(Math.round(p.rev))}</td>
                        <td style={tdS()}>{inr(Math.round(p.rev/p.count))}</td>
                      </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>Recent Enrollments</div>
      <div style={{ ...sbox, marginBottom:24 }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr>{["Date","Name","Phone","Program","Fee","Recd","Due","Closer"].map((h,i) => <th key={h} style={i<3?thL:th}>{h}</th>)}</tr></thead>
          <tbody>
            {enr.length === 0
              ? <tr><td colSpan={8} style={{ ...tdS(), textAlign:"center", padding:"1.5rem", color:"var(--text3)" }}>No enrollments this period.</td></tr>
              : [...enr].sort((a,b) => (b.date||"")>(a.date||"")?1:-1).slice(0,50).map((e,i) => (
                  <tr key={i}>
                    <td style={{ ...tdS("left"), color:"var(--text3)", fontSize:11 }}>{fmtDisplay(e.date)}</td>
                    <td style={{ ...tdS("left"), color:"var(--text)", fontWeight:500 }}>{e.name||"--"}</td>
                    <td style={{ ...tdS("left"), fontSize:11 }}>{e.phone||"--"}</td>
                    <td style={{ ...tdS("left"), fontSize:11, color:"var(--text2)" }}>{e.program||"--"}</td>
                    <td style={tdS()}>{inr(Math.round(e.programFee))}</td>
                    <td style={{ ...tdS(), color:"var(--success)" }}>{inr(Math.round(e.amtReceived))}</td>
                    <td style={{ ...tdS(), color:e.amtDue>0?"var(--warning)":"var(--text3)" }}>{e.amtDue>0?inr(Math.round(e.amtDue)):"--"}</td>
                    <td style={tdS("left")}>{e.closedBy&&e.closedBy!=="Unknown" ? <CTag name={e.closedBy}/> : <span style={{color:"var(--text3)"}}>--</span>}</td>
                  </tr>
              ))
            }
          </tbody>
        </table>
      </div>
      <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>
        Duplicate Alerts -- {dups > 0 ? (dups + " issues") : "All clear"}
      </div>
      <div style={{ ...sbox, border:"1px solid "+(dups>0?"var(--danger)":"var(--border)"), marginBottom:0 }}>
        {dups === 0
          ? <div style={{ padding:"1.5rem", color:"var(--success)", fontSize:13 }}>No duplicates found</div>
          : <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", borderBottom:"1px solid var(--border)" }}>
                <span style={{ fontSize:13, color:"var(--danger)", fontWeight:600 }}>{dups} issue{dups!==1?"s":""}</span>
                <button onClick={copyDups} style={{ background:"var(--tarot)", border:"none", color:"#fff", padding:"6px 14px", borderRadius:6, fontSize:12, fontWeight:500 }}>
                  {dc ? "Copied!" : "Copy & Slack Dolly"}
                </button>
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead><tr>{["Name","Phone","Program","Date","Issue"].map((h,i) => <th key={h} style={i<2?thL:th}>{h}</th>)}</tr></thead>
                <tbody>
                  {[...type1.map(d=>({...d,issue:"Duplicate"})), ...type2.map(d=>({...d,issue:"Diploma+Mastery"}))].map((d,i) => (
                    <tr key={i}>
                      <td style={{ ...tdS("left"), color:"var(--text)", fontWeight:500 }}>{d.name||"--"}</td>
                      <td style={tdS("left")}>{d.phone||"--"}</td>
                      <td style={{ ...tdS("left"), fontSize:11 }}>{d.program||"--"}</td>
                      <td style={tdS()}>{d.date||"--"}</td>
                      <td style={{ ...tdS(), textAlign:"right" }}>
                        <span style={{ background:"rgba(239,68,68,0.15)", color:"var(--danger)", padding:"2px 8px", borderRadius:4, fontSize:11, fontWeight:600 }}>{d.issue}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
        }
      </div>
    </div>
  );
}

// -- Cashflow tab --------------------------------------------------------------
function CashflowTab({ transactions, period }) {
  const [tf, setTf] = useState("ALL");
  const { from, to } = getDR(period);
  const fil = transactions.filter(t => t.date>=from && t.date<=to && (tf==="ALL" || t.type===tf));
  const tN  = fil.filter(t => t.type==="New Booking").reduce((s,t) => s+t.amount, 0);
  const tD  = fil.filter(t => t.type==="Due Payment").reduce((s,t) => s+t.amount, 0);
  const cN  = fil.filter(t => t.type==="New Booking").length;
  const cD  = fil.filter(t => t.type==="Due Payment").length;

  const dm = {};
  for (const t of fil) {
    if (!dm[t.date]) dm[t.date] = { n:0, d:0, total:0, count:0 };
    dm[t.date].count++;
    dm[t.date].total += t.amount;
    if (t.type === "New Booking") dm[t.date].n += t.amount;
    else dm[t.date].d += t.amount;
  }
  const days = Object.entries(dm).sort((a,b) => b[0]>a[0]?1:-1);

  return (
    <div style={{ padding:"0 24px 32px" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:1, background:"var(--border)", margin:"0 -24px 24px" }}>
        {[
          { l:"Total Cash In",      v:inr(Math.round(tN+tD)), c:"var(--success)" },
          { l:"New Enrollments",    v:inr(Math.round(tN))+" ("+cN+")",  c:"var(--tarot)"   },
          { l:"Due Payments",       v:inr(Math.round(tD))+" ("+cD+")",  c:"var(--reiki)"   },
          { l:"Transactions",       v:num(fil.length), c:null },
        ].map(({ l,v,c }) => (
          <div key={l} style={{ background:"var(--surface)", padding:"16px 24px" }}>
            <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:4 }}>{l}</div>
            <div style={{ fontSize:20, fontWeight:600, color:c||"var(--text)" }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:10, marginBottom:16, alignItems:"center" }}>
        <div style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
          {["ALL","New Booking","Due Payment"].map(t => (
            <button key={t} onClick={() => setTf(t)} style={{
              border:"none", borderRadius:0, padding:"5px 14px", fontSize:12, fontWeight:500,
              background: tf===t ? "var(--tarot)" : "transparent",
              color:      tf===t ? "#fff" : "var(--text3)",
            }}>{t==="ALL"?"All Types":t}</button>
          ))}
        </div>
        <span style={{ fontSize:11, color:"var(--text3)" }}>{fil.length} transactions</span>
      </div>
      {days.length > 0 && (
        <>
          <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>Daily Breakdown</div>
          <div style={{ ...sbox, marginBottom:20 }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead><tr>{["Date","Transactions","New Enrollments","Due Payments","Total"].map((h,i) => <th key={h} style={i===0?thL:th}>{h}</th>)}</tr></thead>
              <tbody>
                {days.map(([date,x]) => (
                  <tr key={date}>
                    <td style={{ ...tdS("left"), color:"var(--text)", fontWeight:500 }}>{fmtDisplay(date)}</td>
                    <td style={tdS()}>{x.count}</td>
                    <td style={{ ...tdS(), color:"var(--tarot)" }}>{x.n>0?inr(Math.round(x.n)):"--"}</td>
                    <td style={{ ...tdS(), color:"var(--reiki)" }}>{x.d>0?inr(Math.round(x.d)):"--"}</td>
                    <td style={{ ...tdS(), color:"var(--success)", fontWeight:700 }}>{inr(Math.round(x.total))}</td>
                  </tr>
                ))}
                <tr style={{ borderTop:"2px solid var(--border)", background:"var(--surface2)" }}>
                  <td style={{ ...tdS("left"), fontWeight:700, color:"var(--text)" }}>Total</td>
                  <td style={{ ...tdS(), fontWeight:700 }}>{fil.length}</td>
                  <td style={{ ...tdS(), color:"var(--tarot)", fontWeight:700 }}>{inr(Math.round(tN))}</td>
                  <td style={{ ...tdS(), color:"var(--reiki)", fontWeight:700 }}>{inr(Math.round(tD))}</td>
                  <td style={{ ...tdS(), color:"var(--success)", fontWeight:700 }}>{inr(Math.round(tN+tD))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
      <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>All Transactions</div>
      <div style={sbox}>
        {fil.length === 0
          ? <div style={{ padding:"1.5rem", color:"var(--text3)", fontSize:13, textAlign:"center" }}>No transactions this period.</div>
          : <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead><tr>{["Date","Name","Phone","Program","Amount","Via","Closer","Type"].map((h,i) => <th key={h} style={i<3?thL:th}>{h}</th>)}</tr></thead>
              <tbody>
                {[...fil].sort((a,b) => (b.date||"")>(a.date||"")?1:-1).slice(0,100).map((t,i) => (
                  <tr key={i}>
                    <td style={{ ...tdS("left"), fontSize:11, color:"var(--text3)" }}>{fmtDisplay(t.date)}</td>
                    <td style={{ ...tdS("left"), color:"var(--text)", fontWeight:500 }}>{t.name||"--"}</td>
                    <td style={{ ...tdS("left"), fontSize:11 }}>{t.phone||"--"}</td>
                    <td style={{ ...tdS("left"), fontSize:11 }}>{t.program||"--"}</td>
                    <td style={{ ...tdS(), color:"var(--success)", fontWeight:600 }}>{inr(Math.round(t.amount))}</td>
                    <td style={{ ...tdS("left"), fontSize:11 }}>{t.paidThrough||"--"}</td>
                    <td style={tdS("left")}>{t.closer ? <CTag name={t.closer}/> : "--"}</td>
                    <td style={tdS("left")}>
                      <span style={{
                        background: t.type==="New Booking"?"rgba(139,92,246,0.12)":"rgba(16,185,129,0.12)",
                        color:      t.type==="New Booking"?"var(--tarot)":"var(--reiki)",
                        padding:"2px 7px", borderRadius:4, fontWeight:600, fontSize:10,
                      }}>
                        {t.type==="New Booking"?"New":"Due Pay"}
                      </span>
                    </td>
                  </tr>
                ))}
                {fil.length > 100 && <tr><td colSpan={8} style={{ ...tdS(), textAlign:"center", color:"var(--text3)", padding:"1rem" }}>Showing 100 of {fil.length}</td></tr>}
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}

// -- Closer tab ----------------------------------------------------------------
// Data source: Dashboard tab only (enrollments)
// bookingAmount (col G) = cash collected at time of booking = closer commission base
// amtReceived   (col K) = total cash received so far (booking + later payments by support)
// laterPaid     = amtReceived - bookingAmount = collected by support team after booking
function CloserTab({ enrollments }) {
  // Build closer stats from Dashboard enrollment records
  const closerMap = {};
  for (const e of enrollments) {
    const c = e.closedBy && e.closedBy !== "Unknown" ? e.closedBy.trim() : null;
    if (!c) continue;
    if (!closerMap[c]) closerMap[c] = {
      bookingTotal: 0,   // sum of col G - commission base
      receivedTotal: 0,  // sum of col K - total cash in
      programFeeTotal: 0,// sum of col I - total deal value
      count: 0,
      fullPay: 0,        // amtDue === 0 at booking
      partPay: 0,        // amtDue > 0 at booking
    };
    const m = closerMap[c];
    m.count++;
    m.bookingTotal    += e.bookingAmount  || 0;
    m.receivedTotal   += e.amtReceived    || 0;
    m.programFeeTotal += e.programFee     || 0;
    if ((e.amtDue || 0) <= 0) m.fullPay++;
    else m.partPay++;
  }

  const closers = Object.entries(closerMap).map(([name, m]) => ({
    name,
    bookingTotal:    m.bookingTotal,
    receivedTotal:   m.receivedTotal,
    programFeeTotal: m.programFeeTotal,
    laterPaid:       Math.max(0, m.receivedTotal - m.bookingTotal),
    count:           m.count,
    fullPay:         m.fullPay,
    partPay:         m.partPay,
    fullPct:         m.count > 0 ? Math.round((m.fullPay/m.count)*100) : 0,
    avgBooking:      m.count > 0 ? Math.round(m.bookingTotal/m.count) : 0,
  })).sort((a,b) => b.bookingTotal - a.bookingTotal);

  const maxBook  = Math.max(...closers.map(c => c.bookingTotal), 1);
  const medals   = ["#1","#2","#3"];

  if (closers.length === 0) {
    return <div style={{ padding:"3rem", color:"var(--text3)", textAlign:"center", fontSize:13 }}>No closer data for this period. Check that Closed By column is filled in the Dashboard tab.</div>;
  }

  return (
    <div style={{ padding:"0 24px 32px" }}>
      {/* Top 3 cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:28 }}>
        {closers.slice(0,3).map((c,rank) => {
          const col = cc(c.name);
          return (
            <div key={c.name} style={{
              background: rank===0 ? col.dim : "var(--surface)",
              border: "1px solid var(--border)",
              borderTop: "3px solid "+col.bg,
              borderRadius: 12, padding: "16px 18px", position: "relative",
            }}>
              {rank === 0 && (
                <div style={{ position:"absolute", top:10, right:12, fontSize:11, background:col.bg, color:"#fff", padding:"2px 8px", borderRadius:4, fontWeight:700 }}>TOP</div>
              )}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                <span style={{ fontSize:13, fontWeight:700, color:"var(--text3)" }}>{medals[rank]||""}</span>
                <span style={{ fontSize:15, fontWeight:700, color:col.bg }}>{c.name}</span>
              </div>
              {[
                ["Booking Amount",    inr(Math.round(c.bookingTotal)),  col.bg        ],
                ["Total Received",    inr(Math.round(c.receivedTotal)), "var(--success)"],
                ["Collected by Sppt",inr(Math.round(c.laterPaid)),     "var(--reiki)" ],
                ["Enrollments",       num(c.count),                     null           ],
                ["Full Payments",     c.fullPct+"%  ("+c.fullPay+"/"+c.count+")", null],
              ].map(([l,v,cl]) => (
                <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid var(--border2)" }}>
                  <span style={{ fontSize:11, color:"var(--text2)" }}>{l}</span>
                  <span style={{ fontSize:12, fontWeight:500, color:cl||"var(--text)" }}>{v}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Leaderboard bar chart */}
      <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>Leaderboard -- Booking Amount (Commission Base)</div>
      <div style={sbox}>
        {closers.map((c,i) => {
          const col = cc(c.name);
          const barW = Math.round(maxBook > 0 ? (c.bookingTotal/maxBook)*100 : 0);
          return (
            <div key={c.name} style={{ padding:"14px 18px", borderBottom:"1px solid var(--border2)", background:i===0?col.dim:"transparent" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:13, color:"var(--text3)" }}>{medals[i]||("#"+(i+1))}</span>
                  <span style={{ background:col.bg, color:"#fff", padding:"3px 12px", borderRadius:6, fontWeight:700, fontSize:13 }}>{c.name}</span>
                  {i === 0 && <span style={{ fontSize:11, color:col.bg, fontWeight:600 }}>Winner</span>}
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:18, fontWeight:700, color:col.bg }}>{inr(Math.round(c.bookingTotal))}</div>
                  <div style={{ fontSize:11, color:"var(--text3)" }}>{c.count} deals, {c.fullPct}% full pay</div>
                </div>
              </div>
              <div style={{ height:6, background:"var(--border)", borderRadius:3 }}>
                <div style={{ height:6, width:barW+"%", background:col.bg, borderRadius:3 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed stats table */}
      <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>Detailed Stats</div>
      <div style={sbox}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr>
              <th style={thL}>Closer</th>
              <th style={th}>Deals</th>
              <th style={{ ...th, color:"var(--tarot)" }}>Booking Amt</th>
              <th style={{ ...th, color:"var(--success)" }}>Total Recd</th>
              <th style={{ ...th, color:"var(--reiki)" }}>Later by Sppt</th>
              <th style={th}>Full Pay</th>
              <th style={th}>Part Pay</th>
              <th style={th}>Avg Booking</th>
            </tr>
          </thead>
          <tbody>
            {closers.map((c,i) => {
              const col = cc(c.name);
              return (
                <tr key={c.name} style={{ background:i===0?col.dim:"transparent" }}>
                  <td style={tdS("left")}>
                    <span style={{ background:col.bg, color:"#fff", padding:"2px 10px", borderRadius:5, fontWeight:700, fontSize:12 }}>{c.name}</span>
                  </td>
                  <td style={tdS()}>{c.count}</td>
                  <td style={{ ...tdS(), color:"var(--tarot)", fontWeight:700 }}>{inr(Math.round(c.bookingTotal))}</td>
                  <td style={{ ...tdS(), color:"var(--success)", fontWeight:700 }}>{inr(Math.round(c.receivedTotal))}</td>
                  <td style={{ ...tdS(), color:"var(--reiki)" }}>{c.laterPaid>0 ? inr(Math.round(c.laterPaid)) : "--"}</td>
                  <td style={{ ...tdS(), color:"var(--success)" }}>{c.fullPay} ({c.fullPct}%)</td>
                  <td style={{ ...tdS(), color:c.partPay>0?"var(--warning)":"var(--text3)" }}>{c.partPay}</td>
                  <td style={tdS()}>{inr(c.avgBooking)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize:11, color:"var(--text3)", lineHeight:1.7 }}>
        Booking Amount = cash collected at enrollment (col G, commission base for closers).
        Total Received = all cash collected including later payments (col K).
        Later by Sppt = amount collected after booking by support team = Total Received minus Booking Amount.
      </div>
    </div>
  );
}

// -- Company Revenue tab -------------------------------------------------------
// SUPER/RGM: filter by batch date (parsed from s.batch e.g. "Dec 2025" -> "2025-12-01")
// s.timestamp is unreliable in real data; batch name is always present
function parseBatchDate(batchName) {
  const mo = {jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"};
  const m = (batchName||"").toLowerCase().match(/([a-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = mo[m[1].slice(0,3)];
  return month ? m[2]+"-"+month+"-01" : null;
}

function RevTab({ transactions, emiV2, period }) {
  const allPeriods = PERIODS.map(pk => {
    const { from:f, to:t } = getDR(pk.key);
    const tx  = transactions.filter(x => x.date>=f && x.date<=t);
    const tL  = tx.filter(x => ISOT(x.program)).reduce((s,x) => s+x.amount, 0);
    const rL  = tx.filter(x => ISOR(x.program)).reduce((s,x) => s+x.amount, 0);
    // Use batch date (from s.batch name) for period matching -- s.timestamp unreliable
    const sup = emiV2.filter(s => {
      if (s.program !== "SUPER") return false;
      const bd = parseBatchDate(s.batch);
      return bd ? (bd >= f && bd <= t) : false;
    }).reduce((s,x) => s+(x.totalActual||0), 0);
    const rgm = emiV2.filter(s => {
      if (s.program !== "RGM") return false;
      const bd = parseBatchDate(s.batch);
      return bd ? (bd >= f && bd <= t) : false;
    }).reduce((s,x) => s+(x.totalActual||0), 0);
    return { ...pk, tL, rL, sup, rgm, total:tL+rL+sup+rgm };
  });

  // Also compute all-time SUPER/RGM totals for reference
  const allSuper = emiV2.filter(s=>s.program==="SUPER").reduce((s,x)=>s+(x.totalActual||0),0);
  const allRGM   = emiV2.filter(s=>s.program==="RGM").reduce((s,x)=>s+(x.totalActual||0),0);

  const cur = allPeriods.find(p => p.key===period) || allPeriods[0];

  return (
    <div style={{ padding:"0 24px 32px" }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
        {[
          { label:"Tarot Funnel", color:"var(--tarot)", l1:cur.tL, ht:cur.sup, htLabel:"SUPER" },
          { label:"Reiki Funnel", color:"var(--reiki)", l1:cur.rL, ht:cur.rgm, htLabel:"RGM"   },
        ].map(({ label,color,l1,ht,htLabel }) => (
          <div key={label} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderTop:"3px solid "+color, borderRadius:12, padding:"16px 18px" }}>
            <div style={{ fontSize:13, fontWeight:700, color, marginBottom:14 }}>{label} -- {cur.label}</div>
            {[
              ["L1 cash collected",       inr(Math.round(l1)), color],
              [htLabel+" cash (period)",  inr(Math.round(ht)), color],
              [htLabel+" cash (all time)",inr(Math.round(label==="Tarot Funnel"?allSuper:allRGM)), "var(--text3)"],
            ].map(([l,v,c]) => (
              <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid var(--border2)" }}>
                <span style={{ fontSize:12, color:"var(--text2)" }}>{l}</span>
                <span style={{ fontSize:13, fontWeight:500, color:c||"var(--text)" }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:12, color:"var(--text2)" }}>Total</span>
              <span style={{ fontSize:20, fontWeight:700, color }}>{inr(Math.round(l1+ht))}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"20px 24px", marginBottom:24, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:4 }}>Company Total -- {cur.label}</div>
          <div style={{ fontSize:11, color:"var(--text3)" }}>All programs combined</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:32, fontWeight:800, color:"var(--success)" }}>{inr(Math.round(cur.total))}</div>
          <div style={{ fontSize:11, color:"var(--text3)", marginTop:4 }}>cash in</div>
        </div>
      </div>
      <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>All Periods</div>
      <div style={sbox}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr>
              <th style={thL}>Period</th>
              <th style={{ ...th, color:"var(--tarot)" }}>Tarot L1</th>
              <th style={{ ...th, color:"var(--tarot)" }}>SUPER</th>
              <th style={{ ...th, color:"var(--reiki)" }}>Reiki L1</th>
              <th style={{ ...th, color:"var(--reiki)" }}>RGM</th>
              <th style={{ ...th, color:"var(--success)" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {allPeriods.map(r => (
              <tr key={r.key} style={{ background:r.key===period?"rgba(139,92,246,0.05)":"transparent" }}>
                <td style={{ ...tdS("left"), color:"var(--text)", fontWeight:r.key===period?700:400 }}>{r.label}</td>
                <td style={{ ...tdS(), color:"var(--tarot)" }}>{r.tL>0?inr(Math.round(r.tL)):"--"}</td>
                <td style={{ ...tdS(), color:"var(--tarot)" }}>{r.sup>0?inr(Math.round(r.sup)):"--"}</td>
                <td style={{ ...tdS(), color:"var(--reiki)" }}>{r.rL>0?inr(Math.round(r.rL)):"--"}</td>
                <td style={{ ...tdS(), color:"var(--reiki)" }}>{r.rgm>0?inr(Math.round(r.rgm)):"--"}</td>
                <td style={{ ...tdS(), color:"var(--success)", fontWeight:700 }}>{r.total>0?inr(Math.round(r.total)):"--"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize:11, color:"var(--text3)", lineHeight:1.7 }}>
        L1 = actual cash from All New Booking + Due Payment tabs (real transaction dates).
        SUPER/RGM = cash received filtered by batch launch date (e.g. "Dec 2025" batch = Dec 2025).
        All-time totals shown in parentheses on each card for reference.
      </div>
    </div>
  );
}

// -- Main Sales component ------------------------------------------------------
const SUBS = [
  { key:"overview", label:"Overview"           },
  { key:"cashflow", label:"Cashflow"           },
  { key:"closers",  label:"Closer Performance" },
  { key:"revenue",  label:"Company Revenue"    },
];

export default function Sales() {
  const [enr,     setEnr]     = useState([]);
  const [tx,      setTx]      = useState([]);
  const [emi,     setEmi]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [demo,    setDemo]    = useState(false);
  const [updated, setUpdated] = useState(null);
  const [period,  setPeriod]  = useState("thisMonth");
  const [sub,     setSub]     = useState("overview");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e,t,m] = await Promise.all([
        loadSalesData(),
        loadTransactionData(),
        loadEMIData().catch(() => getEMISample()),
      ]);
      setEnr(e); setTx(t); setEmi(m.v2||[]);
      setDemo(false);
    } catch (_) {
      setEnr([]); setTx([]); setEmi([]);
      setDemo(true);
    } finally {
      setLoading(false); setUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding:"3rem", color:"var(--text3)", textAlign:"center" }}>Loading sales data...</div>;

  const { from, to } = getDR(period);
  const fEnr = enr.filter(e => e.date && e.date>=from && e.date<=to);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 24px", borderBottom:"1px solid var(--border)", background:"var(--surface2)", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <span style={{ fontSize:12, color:demo?"var(--warning)":"var(--success)" }}>
            {demo?"No data":"Live"}
            {updated && <span style={{ color:"var(--text3)", marginLeft:8 }}>{updated.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span>}
          </span>
          <PeriodBar value={period} onChange={setPeriod} />
        </div>
        <button onClick={load}>Refresh</button>
      </div>
      <div style={{ display:"flex", borderBottom:"1px solid var(--border)", background:"var(--surface2)", padding:"0 24px", overflowX:"auto" }}>
        {SUBS.map(t => {
          const isA = sub === t.key;
          return (
            <button key={t.key} onClick={() => setSub(t.key)} style={{
              background:"none", border:"none", whiteSpace:"nowrap", cursor:"pointer", borderRadius:0,
              borderBottom: isA ? "2px solid var(--tarot)" : "2px solid transparent",
              color:        isA ? "var(--text)" : "var(--text3)",
              fontWeight:   isA ? 500 : 400,
              padding:      "10px 18px", fontSize:13,
            }}>{t.label}</button>
          );
        })}
      </div>
      {sub==="overview" && <OverviewTab enr={fEnr} all={enr} />}
      {sub==="cashflow" && <CashflowTab transactions={tx} period={period} />}
      {sub==="closers"  && <CloserTab   enrollments={fEnr} />}
      {sub==="revenue"  && <RevTab      transactions={tx} emiV2={emi} period={period} />}
    </div>
  );
}
