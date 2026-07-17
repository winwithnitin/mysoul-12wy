import { useState, useEffect, useCallback, useMemo } from "react";
import { WORKSHOP_BENCHMARKS } from "../config.js";
import { getFunnel } from "../config.js";
import {
  loadSalesData,
  loadMarketingData,
  countLeadsInRange,
  loadWorkshopPlan,
  loadWorkshopShowUpData,
  loadAuditMemory,
  loadInternKPIData,
  classifyWorkshop,
} from "../utils/sheets.js";
import { fmtDisplay } from "../utils/dates.js";
import { inr, num } from "../utils/format.js";

const MS_DAY = 86400000;
const LEAD_DATE_COLS = { Tarot: 5, Reiki: 5 };

const th = {
  padding: "9px 12px",
  textAlign: "right",
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text3)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};
const thL = { ...th, textAlign: "left" };
const td = (align = "right") => ({
  padding: "9px 12px",
  borderBottom: "1px solid var(--border2)",
  fontSize: 12,
  color: "var(--text2)",
  textAlign: align,
});
const box = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 20 };

function iso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
}

function weekStartFor(date = new Date()) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

function lastCompletedWeekStart() {
  return addDays(weekStartFor(new Date()), -7);
}

function moneyRatio(n, d) {
  return d > 0 ? +(n / d).toFixed(2) : null;
}

function pct(n, d) {
  return d > 0 ? +((n / d) * 100).toFixed(2) : null;
}

function pctText(v) {
  return v === null || v === undefined ? "--" : `${v.toFixed(v % 1 ? 1 : 0)}%`;
}

function workshopKind(w) {
  const s = `${w.id} ${w.name}`.toLowerCase();
  if (s.includes("utw")) return "UTW";
  if (s.includes("icp")) return "ICP";
  if (s.includes("thw")) return "THW";
  if (s.includes("r12")) return "R12";
  return w.funnel;
}

function callWindow(w) {
  const kind = workshopKind(w);
  if (kind === "UTW") return { from: addDays(w.startDate, -3), to: w.startDate, label: "Fri-Mon" };
  if (kind === "R12") return { from: addDays(w.startDate, -2), to: w.startDate, label: "Tue-Thu" };
  return null;
}

function showStatus(ok, warn = false) {
  if (ok) return { label: "OK", color: "var(--success)", bg: "rgba(16,185,129,0.12)" };
  if (warn) return { label: "Watch", color: "var(--warning)", bg: "rgba(245,158,11,0.12)" };
  return { label: "Fix", color: "var(--danger)", bg: "rgba(239,68,68,0.12)" };
}

function StatusPill({ status }) {
  return (
    <span style={{ background: status.bg, color: status.color, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
      {status.label}
    </span>
  );
}

function getShowUp(showRows, workshop) {
  const kind = workshopKind(workshop);
  const sameStart = showRows.filter(r => r.startDate === workshop.startDate);
  const matching = sameStart.filter(r => {
    const n = r.workshopName.toLowerCase();
    if (kind === "UTW") return n.includes("utw") || n.includes("wand");
    if (kind === "ICP") return n.includes("icp") || n.includes("predict");
    if (kind === "THW") return n.includes("thw") || n.includes("health");
    if (kind === "R12") return n.includes("r12") || n.includes("reiki");
    return classifyWorkshop(r.workshopName) === workshop.funnel;
  });

  const byDay = {};
  for (const row of matching) {
    const day = String(row.workshopDay || "1").match(/\d+/)?.[0] || "1";
    byDay[day] = Math.max(byDay[day] || 0, row.maxShowUp || 0);
  }
  return byDay;
}

function isFunnelEnrollment(e, funnel) {
  if (funnel === "Tarot") return getFunnel(e.program) === "Tarot";
  if (funnel === "Reiki") return getFunnel(e.program) === "Reiki";
  return false;
}

function MetricCard({ label, value, color }) {
  return (
    <div style={{ background: "var(--surface)", padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}

function buildQuestions(flags) {
  const qs = [];
  if (flags.some(f => f.key === "cpl")) qs.push("CPL was above benchmark. Was the issue creative fatigue, audience quality, or budget pushed too aggressively?");
  if (flags.some(f => f.key === "calls")) qs.push("Invitation calls were weak or stale. Was this because of intern availability, data not updated, or calling discipline?");
  if (flags.some(f => f.key === "showup")) qs.push("Show-up was below benchmark. Were reminders, links, WhatsApp follow-ups, or session timing the main issue?");
  if (flags.some(f => f.key === "conversion")) qs.push("Conversion was below benchmark. Was the offer, closer follow-up, or audience quality the biggest reason?");
  if (!qs.length) qs.push("Launch looks broadly on track. What should we repeat next week?");
  return qs;
}

function makeSlackSummary({ weekStart, weekEnd, funnelRows, workshopRows, flags, notes }) {
  const lines = [
    `Weekly Workshop Review: ${fmtDisplay(weekStart)} - ${fmtDisplay(weekEnd)}`,
    "",
    "Funnel Performance",
    ...funnelRows.map(r => `${r.funnel}: Spend ${inr(r.spend)} | Leads ${num(r.leads)} | CPL ${r.cpl ? inr(r.cpl) : "--"} | Conv ${pctText(r.conversionPct)} | ROAS ${r.roas ? `${r.roas}x` : "--"}`),
    "",
    "Workshop Show-up",
    ...workshopRows.map(w => `${w.id} ${w.name}: D1 ${pctText(w.showD1Pct)} | D2 ${pctText(w.showD2Pct)} | D3 ${pctText(w.showD3Pct)}`),
    "",
    flags.length ? "Flags" : "Flags: none",
    ...flags.map(f => `- ${f.message}`),
  ];
  if (notes?.trim()) lines.push("", "Nitin Notes", notes.trim());
  return lines.join("\n");
}

export default function Performance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState(null);
  const [weekStart, setWeekStart] = useState(lastCompletedWeekStart());
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [workshops, showUp, marketing, sales, memory] = await Promise.all([
        loadWorkshopPlan().catch(() => []),
        loadWorkshopShowUpData().catch(() => []),
        loadMarketingData(),
        loadSalesData(),
        loadAuditMemory().catch(() => []),
      ]);
      setData({ workshops, showUp, marketing, sales, memory });
    } finally {
      setLoading(false);
      setUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const key = `workshop-audit-notes:${weekStart}`;
    setNotes(localStorage.getItem(key) || "");
  }, [weekStart]);

  useEffect(() => {
    localStorage.setItem(`workshop-audit-notes:${weekStart}`, notes);
  }, [weekStart, notes]);

  const audit = useMemo(() => {
    if (!data) return null;

    const weekEnd = addDays(weekStart, 6);
    const leadFrom = addDays(weekStart, -7);
    const leadTo = addDays(weekStart, -1);
    const reviewCutoff = addDays(weekEnd, 1);
    const workshops = data.workshops.filter(w => w.startDate >= weekStart && w.startDate <= weekEnd);
    const funnels = ["Tarot", "Reiki"];

    const funnelRows = funnels.map(funnel => {
      const leadRows = funnel === "Tarot" ? data.marketing.tarotRows : data.marketing.reikiRows;
      const leads = countLeadsInRange(leadRows || [], LEAD_DATE_COLS[funnel], leadFrom, leadTo);
      const spend = (data.marketing.adSpend || [])
        .filter(r => r.program === funnel && r.date >= leadFrom && r.date <= leadTo)
        .reduce((s, r) => s + (r.spend || 0), 0);
      const enrollments = data.sales.filter(e => e.date >= weekStart && e.date <= reviewCutoff && isFunnelEnrollment(e, funnel));
      const revenue = enrollments.reduce((s, e) => s + (e.amtReceived || 0), 0);
      return {
        funnel,
        leads,
        spend,
        cpl: leads > 0 ? Math.round(spend / leads) : null,
        enrollments: enrollments.length,
        revenue,
        conversionPct: pct(enrollments.length, leads),
        roas: moneyRatio(revenue, spend),
      };
    });

    const workshopRows = workshops.map(w => {
      const f = w.funnel === "Reiki" ? "Reiki" : "Tarot";
      const funnel = funnelRows.find(r => r.funnel === f);
      const show = getShowUp(data.showUp, w);
      const win = callWindow(w);
      return {
        ...w,
        kind: workshopKind(w),
        leadFrom,
        leadTo,
        leads: funnel?.leads || 0,
        callWindow: win,
        showD1: show["1"] || 0,
        showD2: show["2"] || 0,
        showD3: show["3"] || 0,
        showD1Pct: pct(show["1"] || 0, funnel?.leads || 0),
        showD2Pct: pct(show["2"] || 0, funnel?.leads || 0),
        showD3Pct: pct(show["3"] || 0, funnel?.leads || 0),
      };
    });

    const flags = [];
    for (const r of funnelRows) {
      const b = WORKSHOP_BENCHMARKS[r.funnel];
      if (r.cpl && r.cpl > b.cpl) flags.push({ key: "cpl", message: `${r.funnel} CPL ${inr(r.cpl)} is above ${inr(b.cpl)} benchmark.` });
      if (r.conversionPct !== null && r.conversionPct < b.conversion) flags.push({ key: "conversion", message: `${r.funnel} conversion ${pctText(r.conversionPct)} is below ${b.conversion}% benchmark.` });
      if (r.leads === 0) flags.push({ key: "leads", message: `${r.funnel} has no leads in source window ${fmtDisplay(leadFrom)}-${fmtDisplay(leadTo)}.` });
    }
    for (const w of workshopRows) {
      const b = WORKSHOP_BENCHMARKS[w.funnel] || WORKSHOP_BENCHMARKS.Tarot;
      if (w.showD1 && w.showD1Pct < b.showD1) flags.push({ key: "showup", message: `${w.id} Day 1 show-up ${pctText(w.showD1Pct)} is below ${b.showD1}%.` });
      if (w.days >= 2 && w.showD2 && w.showD2Pct < b.showD2) flags.push({ key: "showup", message: `${w.id} Day 2 show-up ${pctText(w.showD2Pct)} is below ${b.showD2}%.` });
      if (w.days >= 3 && w.showD3 && w.showD3Pct < b.showD3) flags.push({ key: "showup", message: `${w.id} Day 3 show-up ${pctText(w.showD3Pct)} is below ${b.showD3}%.` });
      if (!w.showD1) flags.push({ key: "showup", message: `${w.id} has no Tanvi show-up entry yet.` });
    }

    return { weekStart, weekEnd, leadFrom, leadTo, reviewCutoff, workshops, workshopRows, funnelRows, flags };
  }, [data, weekStart]);

  const [callData, setCallData] = useState({});

  useEffect(() => {
    if (!audit) return;
    let alive = true;
    async function loadCalls() {
      const entries = await Promise.all(audit.workshopRows.map(async w => {
        if (!w.callWindow) return [w.id, null];
        const calls = await loadInternKPIData({ from: w.callWindow.from, to: w.callWindow.to, funnel: w.funnel }).catch(e => ({ error: e.message }));
        return [w.id, calls];
      }));
      if (alive) setCallData(Object.fromEntries(entries));
    }
    loadCalls();
    return () => { alive = false; };
  }, [audit]);

  const enrichedFlags = useMemo(() => {
    if (!audit) return [];
    const flags = [...audit.flags];
    const today = new Date().toISOString().slice(0, 10);
    for (const w of audit.workshopRows) {
      const calls = callData[w.id];
      if (!w.callWindow || !calls) continue;
      if (calls.error) flags.push({ key: "calls", message: `${w.id} intern KPI could not load: ${calls.error}` });
      if (!calls.error && calls.callsAttempted === 0) flags.push({ key: "calls", message: `${w.id} has no call data in ${w.callWindow.label} window.` });
      if (!calls.error && calls.latestDate && calls.latestDate < addDays(today, -1) && w.startDate >= addDays(today, -1)) {
        flags.push({ key: "calls", message: `${w.id} intern KPI latest update is ${fmtDisplay(calls.latestDate)}.` });
      }
    }
    return flags;
  }, [audit, callData]);

  if (loading || !audit) return <div style={{ padding: "3rem", color: "var(--text3)", textAlign: "center" }}>Loading workshop performance...</div>;

  const questions = buildQuestions(enrichedFlags);
  const summary = makeSlackSummary({ ...audit, flags: enrichedFlags, notes });

  const totalSpend = audit.funnelRows.reduce((s, r) => s + r.spend, 0);
  const totalLeads = audit.funnelRows.reduce((s, r) => s + r.leads, 0);
  const totalRevenue = audit.funnelRows.reduce((s, r) => s + r.revenue, 0);

  async function copySummary() {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 24px", borderBottom: "1px solid var(--border)", background: "var(--surface2)", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input type="date" value={weekStart} onChange={e => setWeekStart(weekStartFor(new Date(`${e.target.value}T12:00:00`)))} />
          <span style={{ fontSize: 12, color: "var(--text3)" }}>
            Review week {fmtDisplay(audit.weekStart)} - {fmtDisplay(audit.weekEnd)} | lead source {fmtDisplay(audit.leadFrom)} - {fmtDisplay(audit.leadTo)}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {updated && <span style={{ fontSize: 11, color: "var(--text3)" }}>{updated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={load}>Refresh</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: "var(--border)", marginBottom: 24 }}>
        <MetricCard label="Workshops" value={num(audit.workshopRows.length)} />
        <MetricCard label="Lead Pool" value={num(totalLeads)} />
        <MetricCard label="Ad Spend" value={inr(Math.round(totalSpend))} color="var(--warning)" />
        <MetricCard label="Cash Revenue" value={inr(Math.round(totalRevenue))} color="var(--success)" />
        <MetricCard label="Audit Flags" value={num(enrichedFlags.length)} color={enrichedFlags.length ? "var(--danger)" : "var(--success)"} />
      </div>

      <div style={{ padding: "0 24px 36px" }}>
        <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Funnel Performance</div>
        <div style={box}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Funnel", "Spend", "Leads", "CPL", "Enrollments", "Conversion", "Revenue", "ROAS", "Status"].map((h, i) => <th key={h} style={i === 0 ? thL : th}>{h}</th>)}</tr></thead>
            <tbody>{audit.funnelRows.map(r => {
              const b = WORKSHOP_BENCHMARKS[r.funnel];
              const ok = (!r.cpl || r.cpl <= b.cpl) && (r.conversionPct === null || r.conversionPct >= b.conversion);
              return (
                <tr key={r.funnel}>
                  <td style={{ ...td("left"), color: r.funnel === "Tarot" ? "var(--tarot)" : "var(--reiki)", fontWeight: 700 }}>{r.funnel}</td>
                  <td style={td()}>{inr(Math.round(r.spend))}</td>
                  <td style={td()}>{num(r.leads)}</td>
                  <td style={{ ...td(), color: r.cpl && r.cpl > b.cpl ? "var(--danger)" : "var(--text2)", fontWeight: 600 }}>{r.cpl ? inr(r.cpl) : "--"}</td>
                  <td style={td()}>{num(r.enrollments)}</td>
                  <td style={{ ...td(), color: r.conversionPct !== null && r.conversionPct < b.conversion ? "var(--danger)" : "var(--text2)", fontWeight: 600 }}>{pctText(r.conversionPct)}</td>
                  <td style={{ ...td(), color: "var(--success)", fontWeight: 600 }}>{inr(Math.round(r.revenue))}</td>
                  <td style={td()}>{r.roas ? `${r.roas}x` : "--"}</td>
                  <td style={td()}><StatusPill status={showStatus(ok, r.leads === 0)} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>

        <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Workshop Show-up and Calls</div>
        <div style={box}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Workshop", "Start", "Days", "Lead Pool", "D1 Show-up", "D2", "D3", "Call Window", "Calls", "Connected", "Connect %", "KPI Mode"].map((h, i) => <th key={h} style={i === 0 ? thL : th}>{h}</th>)}</tr></thead>
            <tbody>{audit.workshopRows.length === 0
              ? <tr><td colSpan={12} style={{ ...td(), textAlign: "center", padding: "2rem" }}>No completed workshops found for this week.</td></tr>
              : audit.workshopRows.map(w => {
                const calls = callData[w.id];
                return (
                  <tr key={w.id}>
                    <td style={{ ...td("left"), color: w.funnel === "Tarot" ? "var(--tarot)" : "var(--reiki)", fontWeight: 700 }}>{w.id} {w.name}</td>
                    <td style={td()}>{fmtDisplay(w.startDate)}</td>
                    <td style={td()}>{w.days}</td>
                    <td style={td()}>{num(w.leads)}</td>
                    <td style={{ ...td(), fontWeight: 600 }}>{w.showD1 ? `${num(w.showD1)} (${pctText(w.showD1Pct)})` : "--"}</td>
                    <td style={td()}>{w.showD2 ? `${num(w.showD2)} (${pctText(w.showD2Pct)})` : "--"}</td>
                    <td style={td()}>{w.showD3 ? `${num(w.showD3)} (${pctText(w.showD3Pct)})` : "--"}</td>
                    <td style={td()}>{w.callWindow ? `${fmtDisplay(w.callWindow.from)}-${fmtDisplay(w.callWindow.to)}` : "No calls"}</td>
                    <td style={td()}>{calls ? num(calls.callsAttempted || 0) : "--"}</td>
                    <td style={td()}>{calls ? num(calls.connected || 0) : "--"}</td>
                    <td style={td()}>{calls?.connectedRatio !== null && calls?.connectedRatio !== undefined ? pctText(calls.connectedRatio) : "--"}</td>
                    <td style={td()}>{calls?.discoveryMode || "--"}</td>
                  </tr>
                );
              })}</tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Audit Flags</div>
            <div style={{ ...box, padding: "14px 16px" }}>
              {enrichedFlags.length === 0
                ? <div style={{ color: "var(--success)", fontSize: 13 }}>Everything is broadly on track for this review window.</div>
                : enrichedFlags.map((f, i) => <div key={i} style={{ color: "var(--danger)", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border2)" }}>{f.message}</div>)
              }
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Monday Review Questions</div>
            <div style={{ ...box, padding: "14px 16px" }}>
              {questions.map(q => <div key={q} style={{ fontSize: 13, color: "var(--text2)", padding: "6px 0" }}>{q}</div>)}
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add Nitin's Monday review notes here..."
                style={{ width: "100%", minHeight: 92, marginTop: 10, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: 10, fontFamily: "inherit", fontSize: 13 }}
              />
              <button onClick={copySummary} style={{ marginTop: 10, background: "var(--tarot)", color: "#fff", border: "none", padding: "7px 14px", borderRadius: 6, fontWeight: 600 }}>
                {copied ? "Copied" : "Copy Slack Summary"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.6, marginTop: 4 }}>
          Notes: ICP is treated as no-call. TMR is ignored. Intern tabs are auto-discovered when Google exposes worksheet metadata; otherwise the dashboard uses the configured intern tabs and marks KPI mode as fallback.
        </div>
      </div>
    </div>
  );
}
