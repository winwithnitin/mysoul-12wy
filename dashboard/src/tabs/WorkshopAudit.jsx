import { useEffect, useMemo, useState, useCallback } from "react";
import {
  loadSalesData,
  loadMarketingData,
  loadWorkshopPlan,
  loadWorkshopShowUpData,
  loadInternKPIHistory,
} from "../utils/sheets.js";
import { WORKSHOP_BENCHMARKS } from "../config.js";
import { fmtDisplay } from "../utils/dates.js";
import { inr, num } from "../utils/format.js";
import { buildWorkshopAudit, pctText } from "./performance/auditEngine.js";

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
const box = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 18 };
const CALL_DATA_START = "2026-06-29";
const AUDIT_FUNNELS = ["Tarot", "Reiki"];

function FunnelToggle({ value, onChange }) {
  return (
    <div style={{ display: "flex", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      {AUDIT_FUNNELS.map(option => (
        <button key={option} onClick={() => onChange(option)} style={{
          border: "none",
          borderRadius: 0,
          padding: "5px 13px",
          fontSize: 12,
          fontWeight: 500,
          background: value === option ? "var(--tarot)" : "transparent",
          color: value === option ? "#fff" : "var(--text3)",
        }}>{option}</button>
      ))}
    </div>
  );
}

function fallbackWorkshopsFromShowUp(showUp) {
  const byKey = {};
  for (const row of showUp || []) {
    const name = String(row.workshopName || "").toLowerCase();
    const kind = name.includes("r12") || name.includes("reiki") ? "R12"
      : name.includes("utw") || name.includes("wand") ? "UTW"
      : name.includes("icp") || name.includes("predict") ? "ICP"
      : name.includes("thw") || name.includes("health") ? "THW"
      : null;
    if (!kind || !row.startDate) continue;
    const funnel = kind === "R12" ? "Reiki" : "Tarot";
    const key = `${kind}-${row.startDate}`;
    if (!byKey[key]) {
      byKey[key] = {
        id: key,
        name: row.workshopName || `${kind} Workshop`,
        days: kind === "UTW" ? 3 : 1,
        startDate: row.startDate,
        startTime: "",
        startDay: "",
        status: "Done",
        funnel,
        inferredFromShowUp: true,
      };
    }
  }
  return Object.values(byKey);
}

function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ margin: "0 0 10px" }}>
      <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}

function ShowUpCell({ value, pct, benchmark }) {
  const hasValue = value > 0 || pct !== null;
  const ok = pct !== null && pct >= benchmark;
  return (
    <td style={{ ...td(), color: !hasValue ? "var(--text3)" : ok ? "var(--success)" : "var(--danger)", fontWeight: hasValue ? 700 : 400 }}>
      {hasValue ? `${num(value)} (${pctText(pct)})` : "--"}
    </td>
  );
}

function makeWorkshopSummary(audit, notes) {
  const { workshop, funnelRow, calls, flags, leadFrom, leadTo, conversionFrom, conversionTo } = audit;
  return [
    `Workshop Audit: ${workshop.id} ${workshop.name}`,
    `Funnel: ${workshop.funnel} | Start: ${fmtDisplay(workshop.startDate)}`,
    "",
    `Lead Pool (${fmtDisplay(leadFrom)} - ${fmtDisplay(leadTo)}): ${num(funnelRow.leads)} leads`,
    `Ad Spend: ${inr(Math.round(funnelRow.spend))} | CPL: ${funnelRow.cpl ? inr(funnelRow.cpl) : "--"}`,
    "",
    `Intern Calls: ${calls ? `${num(calls.callsAttempted)} attempted | ${num(calls.connected)} connected | ${pctText(calls.connectedRatio)} connect` : "No calls / not applicable"}`,
    "",
    `Show-up: D1 ${workshop.showD1 ? `${num(workshop.showD1)} (${pctText(workshop.showD1Pct)})` : "--"} | D2 ${workshop.showD2 ? `${num(workshop.showD2)} (${pctText(workshop.showD2Pct)})` : "--"} | D3 ${workshop.showD3 ? `${num(workshop.showD3)} (${pctText(workshop.showD3Pct)})` : "--"}`,
    `Conversion (${fmtDisplay(conversionFrom)} - ${fmtDisplay(conversionTo)}): ${num(funnelRow.enrollments)} enrollments | ${pctText(funnelRow.conversionPct)}`,
    `Revenue: ${inr(Math.round(funnelRow.revenue))} | ROAS: ${funnelRow.roas ? `${funnelRow.roas}x` : "--"}`,
    "",
    flags.length ? "Flags" : "Flags: none",
    ...flags.map(f => `- ${f.message}`),
    ...(notes?.trim() ? ["", "Nitin Notes", notes.trim()] : []),
  ].join("\n");
}

export default function WorkshopAudit({ sharedData = null, sharedLoading = false, sharedUpdated = null, onRefresh = null, embedded = false }) {
  const [ownData, setOwnData] = useState(null);
  const [ownLoading, setOwnLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [auditFunnel, setAuditFunnel] = useState("Tarot");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [ownUpdated, setOwnUpdated] = useState(null);

  const ownLoad = useCallback(async () => {
    setOwnLoading(true);
    try {
      const [workshops, showUp, marketing, sales, internHistory] = await Promise.all([
        loadWorkshopPlan().catch(() => []),
        loadWorkshopShowUpData().catch(() => []),
        loadMarketingData(),
        loadSalesData(),
        loadInternKPIHistory().catch(() => ({ rows: [], tabs: [], discoveryMode: "unavailable" })),
      ]);
      setOwnData({ workshops, showUp, marketing, sales, internHistory });
    } finally {
      setOwnLoading(false);
      setOwnUpdated(new Date());
    }
  }, []);

  useEffect(() => {
    if (!sharedData) ownLoad();
  }, [ownLoad, sharedData]);

  const data = sharedData || ownData;
  const loading = sharedData ? sharedLoading : ownLoading;
  const updated = sharedData ? sharedUpdated : ownUpdated;
  const refresh = onRefresh || ownLoad;

  const workshops = useMemo(() => {
    const planWorkshops = data?.workshops || [];
    const fallback = fallbackWorkshopsFromShowUp(data?.showUp || []);
    const seen = new Set(planWorkshops.map(w => `${w.funnel}:${w.startDate}`));
    const combined = [
      ...planWorkshops,
      ...fallback.filter(w => !seen.has(`${w.funnel}:${w.startDate}`)),
    ];
    return combined
      .filter(w => w.funnel === auditFunnel)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [data, auditFunnel]);
  const selectedWorkshop = useMemo(() => workshops.find(w => w.id === selectedId) || null, [workshops, selectedId]);
  const audit = useMemo(() => data && selectedWorkshop ? buildWorkshopAudit(data, selectedWorkshop, data.internHistory) : null, [data, selectedWorkshop]);

  useEffect(() => {
    setNotes(selectedId ? localStorage.getItem(`workshop-audit-notes:${selectedId}`) || "" : "");
  }, [selectedId]);

  useEffect(() => {
    setSelectedId("");
  }, [auditFunnel]);

  useEffect(() => {
    if (selectedId) localStorage.setItem(`workshop-audit-notes:${selectedId}`, notes);
  }, [selectedId, notes]);

  async function copySummary() {
    if (!audit) return;
    await navigator.clipboard.writeText(makeWorkshopSummary(audit, notes));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (loading) {
    return <div style={{ padding: "3rem", color: "var(--text3)", textAlign: "center" }}>Loading workshop audit data...</div>;
  }

  const benchmark = audit ? WORKSHOP_BENCHMARKS[audit.workshop.funnel] || WORKSHOP_BENCHMARKS.Tarot : WORKSHOP_BENCHMARKS.Tarot;
  const callsAvailable = audit?.workshop.callWindow && audit.workshop.callWindow.to >= CALL_DATA_START;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 24px", borderBottom: "1px solid var(--border)", background: "var(--surface2)", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <FunnelToggle value={auditFunnel} onChange={setAuditFunnel} />
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ minWidth: 320 }}>
            <option value="">Select workshop...</option>
            {workshops.map(w => (
              <option key={w.id} value={w.id}>{w.id} - {w.funnel} - {fmtDisplay(w.startDate)}{w.inferredFromShowUp ? " - ShowUp" : ""}</option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>{workshops.length} {auditFunnel} workshops loaded</span>
        </div>
        {!embedded && <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {updated && <span style={{ fontSize: 11, color: "var(--text3)" }}>{updated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={refresh}>Refresh</button>
        </div>}
      </div>

      {!audit ? (
        <div style={{ padding: "4rem 24px", textAlign: "center", color: "var(--text3)" }}>
          Select a workshop above to begin audit.
        </div>
      ) : (
        <div style={{ padding: "24px 24px 36px" }}>
          <SectionTitle title="Lead Pool" subtitle={`${fmtDisplay(audit.leadFrom)} - ${fmtDisplay(audit.leadTo)}`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 24 }}>
            <StatBox label="Workshop" value={`${audit.workshop.id} ${audit.workshop.name}`} color={audit.workshop.funnel === "Tarot" ? "var(--tarot)" : "var(--reiki)"} />
            <StatBox label="Lead Pool" value={num(audit.funnelRow.leads)} />
            <StatBox label="Ad Spend" value={inr(Math.round(audit.funnelRow.spend))} color="var(--warning)" />
            <StatBox label="CPL" value={audit.funnelRow.cpl ? inr(audit.funnelRow.cpl) : "--"} color={audit.funnelRow.cpl && audit.funnelRow.cpl > benchmark.cpl ? "var(--danger)" : "var(--success)"} />
          </div>

          <SectionTitle title="Intern Call Performance" subtitle={audit.workshop.callWindow ? `${fmtDisplay(audit.workshop.callWindow.from)} - ${fmtDisplay(audit.workshop.callWindow.to)}` : "No call window for this workshop type"} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 24 }}>
            <StatBox label="Calls Attempted" value={callsAvailable && audit.calls ? num(audit.calls.callsAttempted) : "--"} />
            <StatBox label="Connected" value={callsAvailable && audit.calls ? num(audit.calls.connected) : "--"} />
            <StatBox label="Connect %" value={callsAvailable && audit.calls ? pctText(audit.calls.connectedRatio) : "--"} color="var(--success)" />
          </div>
          {!callsAvailable && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: -14, marginBottom: 22 }}>Intern KPI data is available from 29 Jun 2026 onwards.</div>}

          <SectionTitle title="Show-up" subtitle="Green means at or above benchmark; red means below benchmark." />
          <div style={box}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Day", "Benchmark", "Show-up"].map((h, i) => <th key={h} style={i === 0 ? thL : th}>{h}</th>)}</tr></thead>
              <tbody>
                <tr><td style={td("left")}>Day 1</td><td style={td()}>{benchmark.showD1}%</td><ShowUpCell value={audit.workshop.showD1} pct={audit.workshop.showD1Pct} benchmark={benchmark.showD1} /></tr>
                <tr><td style={td("left")}>Day 2</td><td style={td()}>{benchmark.showD2 ? `${benchmark.showD2}%` : "--"}</td><ShowUpCell value={audit.workshop.showD2} pct={audit.workshop.showD2Pct} benchmark={benchmark.showD2 || 0} /></tr>
                <tr><td style={td("left")}>Day 3</td><td style={td()}>{benchmark.showD3 ? `${benchmark.showD3}%` : "--"}</td><ShowUpCell value={audit.workshop.showD3} pct={audit.workshop.showD3Pct} benchmark={benchmark.showD3 || 0} /></tr>
              </tbody>
            </table>
          </div>

          <SectionTitle title="Conversion and Revenue" subtitle={`${fmtDisplay(audit.conversionFrom)} - ${fmtDisplay(audit.conversionTo)}`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 24 }}>
            <StatBox label="Enrollments" value={num(audit.funnelRow.enrollments)} />
            <StatBox label="Conversion %" value={pctText(audit.funnelRow.conversionPct)} color={audit.funnelRow.conversionPct !== null && audit.funnelRow.conversionPct < benchmark.conversion ? "var(--danger)" : "var(--success)"} />
            <StatBox label="Revenue" value={inr(Math.round(audit.funnelRow.revenue))} color="var(--success)" />
            <StatBox label="ROAS" value={audit.funnelRow.roas ? `${audit.funnelRow.roas}x` : "--"} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <SectionTitle title="Audit Flags" />
              <div style={{ ...box, padding: "14px 16px" }}>
                {audit.flags.length === 0
                  ? <div style={{ color: "var(--success)", fontSize: 13 }}>No major issues flagged for this workshop.</div>
                  : audit.flags.map((flag, i) => <div key={i} style={{ color: "var(--danger)", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border2)" }}>{flag.message}</div>)
                }
              </div>
            </div>

            <div>
              <SectionTitle title="Nitin's Notes" />
              <div style={{ ...box, padding: "14px 16px" }}>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add review notes for this workshop..."
                  style={{ width: "100%", minHeight: 112, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: 10, fontFamily: "inherit", fontSize: 13 }}
                />
                <button onClick={copySummary} style={{ marginTop: 10, background: "var(--tarot)", color: "#fff", border: "none", padding: "7px 14px", borderRadius: 6, fontWeight: 600 }}>
                  {copied ? "Copied" : "Copy Audit Summary"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
