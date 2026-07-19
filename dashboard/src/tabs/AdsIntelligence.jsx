import { useCallback, useEffect, useState } from "react";
import { loadSalesData, loadLeadAttributionData } from "../utils/sheets.js";
import { inr } from "../utils/format.js";

const PERIODS = [
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
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const t = iso(today);
  if (period === "thisWeek") { const ws = new Date(today); ws.setDate(today.getDate() - ((today.getDay()+6)%7)); return { from:iso(ws), to:t }; }
  if (period === "lastWeek") { const we = new Date(today); we.setDate(today.getDate() - ((today.getDay()+6)%7) - 1); const ws = new Date(we); ws.setDate(we.getDate()-6); return { from:iso(ws), to:iso(we) }; }
  if (period === "thisMonth") return { from:`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-01`, to:t };
  if (period === "lastMonth") { const lm = new Date(today.getFullYear(), today.getMonth()-1, 1); const lme = new Date(today.getFullYear(), today.getMonth(), 0); return { from:iso(lm), to:iso(lme) }; }
  if (period === "last3months") { const x = new Date(today); x.setMonth(x.getMonth()-3); return { from:iso(x), to:t }; }
  if (period === "last6months") { const x = new Date(today); x.setMonth(x.getMonth()-6); return { from:iso(x), to:t }; }
  if (period === "thisYear") return { from:`${today.getFullYear()}-01-01`, to:t };
  return { from:t, to:t };
}

function getProgGroup(program) {
  const p = (program || "").toLowerCase();
  if (p.includes("tarot") || p.includes("diploma") || p.includes("mastery") || p.includes("mani")) return "tarot";
  if (p.includes("reiki") || p.includes("hooponopono") || p.includes("ho'oponopono") || p.includes("money reiki")) return "reiki";
  return "other";
}

const th = { padding:"9px 12px", textAlign:"right", fontSize:11, fontWeight:500, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" };
const thL = { ...th, textAlign:"left" };
const tdS = (a) => ({ padding:"8px 12px", borderBottom:"1px solid var(--border2)", fontSize:12, color:"var(--text2)", textAlign:a || "right" });
const sbox = { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", marginBottom:20 };

function buildRankings(enrList, map) {
  const campaigns = {}, adsets = {}, ads = {};
  for (const e of enrList) {
    const a = map.byEmail[e.email] || map.byPhone[e.phone];
    if (!a) continue;
    const c = a.campaign || "Unknown";
    const s = a.adGroup || "Unknown";
    const ad = a.adName || "Unknown";
    if (!campaigns[c]) campaigns[c] = { name:c, count:0, fee:0 };
    if (!adsets[s]) adsets[s] = { name:s, count:0, fee:0 };
    if (!ads[ad]) ads[ad] = { name:ad, count:0, fee:0 };
    campaigns[c].count++; campaigns[c].fee += e.programFee || 0;
    adsets[s].count++; adsets[s].fee += e.programFee || 0;
    ads[ad].count++; ads[ad].fee += e.programFee || 0;
  }
  return {
    campaigns: Object.values(campaigns).sort((a,b) => b.count - a.count).slice(0,15),
    adsets: Object.values(adsets).sort((a,b) => b.count - a.count).slice(0,15),
    ads: Object.values(ads).sort((a,b) => b.count - a.count).slice(0,15),
  };
}

function RankTable({ data, label }) {
  const max = data[0]?.count || 1;
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:.5, marginBottom:8 }}>{label}</div>
      <div style={sbox}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr>
              <th style={thL}>Name</th>
              <th style={th}>Enrollments</th>
              <th style={th}>Revenue</th>
              <th style={{ ...th, width:"40%" }}>Bar</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={4} style={{ ...tdS(), textAlign:"center", padding:"1rem", color:"var(--text3)" }}>No attribution data matched</td></tr>
            ) : data.map((r,i) => (
              <tr key={i} style={{ background:i === 0 ? "rgba(139,92,246,0.05)" : "transparent" }}>
                <td style={{ ...tdS("left"), fontWeight:i === 0 ? 600 : 400 }}>{r.name || "--"}</td>
                <td style={{ ...tdS(), fontWeight:600 }}>{r.count}</td>
                <td style={{ ...tdS(), color:"var(--success)" }}>{inr(Math.round(r.fee))}</td>
                <td style={{ ...tdS(), padding:"6px 12px" }}>
                  <div style={{ height:10, background:"var(--border)", borderRadius:5 }}>
                    <div style={{ height:10, width:(r.count / max * 100) + "%", background:"var(--tarot)", borderRadius:5 }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdsIntelligence() {
  const [enrollments, setEnrollments] = useState([]);
  const [attr, setAttr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState(null);
  const [period, setPeriod] = useState("thisWeek");

  const load = useCallback(async () => {
    setLoading(true);
    const withTimeout = (p, fb, ms=12000) => Promise.race([p, new Promise(r => setTimeout(() => r(fb), ms))]);
    try {
      const [enr, leadAttr] = await Promise.all([
        withTimeout(loadSalesData(), []),
        withTimeout(loadLeadAttributionData(), null),
      ]);
      setEnrollments(Array.isArray(enr) ? enr : []);
      setAttr(leadAttr);
    } catch (_) {
      setEnrollments([]);
      setAttr(null);
    } finally {
      setLoading(false);
      setUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding:"3rem", color:"var(--text3)", textAlign:"center" }}>Loading Ads Intelligence...</div>;

  const range = getDR(period);
  const periodEnrollments = enrollments.filter(e => e.date >= range.from && e.date <= range.to);
  const tarotEnr = periodEnrollments.filter(e => getProgGroup(e.program) === "tarot");
  const reikiEnr = periodEnrollments.filter(e => getProgGroup(e.program) === "reiki");
  const emptyRank = { campaigns:[], adsets:[], ads:[] };
  const tarotRank = attr ? buildRankings(tarotEnr, attr.tarotMap) : emptyRank;
  const reikiRank = attr ? buildRankings(reikiEnr, attr.reikiMap) : emptyRank;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 24px", borderBottom:"1px solid var(--border)", background:"var(--surface2)", flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <span style={{ fontSize:12, color:"var(--success)" }}>Live</span>
          {updated && <span style={{ fontSize:11, color:"var(--text3)" }}>{updated.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" })}</span>}
          {!attr && <span style={{ fontSize:11, color:"var(--warning)", marginLeft:8 }}>Lead attribution not loaded -- check sheet access</span>}
          <div style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", marginLeft:8 }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                border:"none", borderRadius:0, padding:"5px 11px", fontSize:12, fontWeight:500,
                background:period === p.key ? "var(--tarot)" : "transparent",
                color:period === p.key ? "#fff" : "var(--text3)",
              }}>{p.label}</button>
            ))}
          </div>
        </div>
        <button onClick={load} style={{ fontSize:12 }}>Refresh</button>
      </div>

      <div style={{ padding:"0 24px 32px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16, marginBottom:16, gap:12, flexWrap:"wrap" }}>
          <div style={{ fontSize:13, color:"var(--text3)" }}>
            Showing sales attribution from <strong style={{ color:"var(--text)" }}>{range.from}</strong> to <strong style={{ color:"var(--text)" }}>{range.to}</strong>
          </div>
          <div style={{ fontSize:12, color:"var(--text3)" }}>
            Tarot enrollments: <strong style={{ color:"var(--tarot)" }}>{tarotEnr.length}</strong> · Reiki enrollments: <strong style={{ color:"var(--reiki)" }}>{reikiEnr.length}</strong>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, marginTop:16 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--tarot)", marginBottom:16 }}>Tarot Funnel</div>
            <RankTable data={tarotRank.campaigns} label="Top Campaigns" />
            <RankTable data={tarotRank.adsets} label="Top Adsets" />
            <RankTable data={tarotRank.ads} label="Top Ads" />
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--reiki)", marginBottom:16 }}>Reiki Funnel</div>
            <RankTable data={reikiRank.campaigns} label="Top Campaigns" />
            <RankTable data={reikiRank.adsets} label="Top Adsets" />
            <RankTable data={reikiRank.ads} label="Top Ads" />
          </div>
        </div>
      </div>
    </div>
  );
}
