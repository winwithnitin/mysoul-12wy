import { useState, useEffect, useCallback, useMemo } from "react";
import { WORKSHOP_BENCHMARKS } from "../config.js";
import {
  loadSalesData,
  loadMarketingData,
  loadWorkshopPlan,
  loadWorkshopShowUpData,
  loadAuditMemory,
  loadInternKPIData,
} from "../utils/sheets.js";
import { fmtDisplay } from "../utils/dates.js";
import { inr, num } from "../utils/format.js";
import {
  addCallFlags,
  buildAudit,
  buildQuestions,
  lastCompletedWeekStart,
  makeSlackSummary,
  pctText,
  showStatus,
  weekStartFor,
} from "./performance/auditEngine.js";

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

function MetricCard({ label, value, color }) {
  return (
    <div style={{ background: "var(--surface)", padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}

function StatusPill({ status }) {
  return (
    <span style={{ background: status.bg, color: status.color, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
      {status.label}
    </span>
  );
}

function ReviewHeader({ weekStart, audit, updated, onWeekChange, onRefresh }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 24px", borderBottom: "1px solid var(--border)", background: "var(--surface2)", flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input type="date" value={weekStart} onChange={e => onWeekChange(weekStartFor(new Date(`${e.target.value}T12:00:00`)))} />
        <span style={{ fontSize: 12, color: "var(--text3)" }}>
          Review week {fmtDisplay(audit.weekStart)} - {fmtDisplay(audit.weekEnd)} | lead source {fmtDisplay(audit.leadFrom)} - {fmtDisplay(audit.leadTo)}
        </span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {updated && <span style={{ fontSize: 11, color: "var(--text3)" }}>{updated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
        <button onClick={onRefresh}>Refresh</button>
      </div>
    </div>
  );
}

function FunnelTable({ rows }) {
  return (
    <div style={box}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["Funnel", "Spend", "Leads", "CPL", "Enrollments", "Conversion", "Revenue", "ROAS", "Status"].map((h, i) => <th key={h} style={i === 0 ? thL : th}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(row => {
          const benchmark = WORKSHOP_BENCHMARKS[row.funnel];
          const ok = (!row.cpl || row.cpl <= benchmark.cpl) && (row.conversionPct === null || row.conversionPct >= benchmark.conversion);
          return (
            <tr key={row.funnel}>
              <td style={{ ...td("left"), color: row.funnel === "Tarot" ? "var(--tarot)" : "var(--reiki)", fontWeight: 700 }}>{row.funnel}</td>
              <td style={td()}>{inr(Math.round(row.spend))}</td>
              <td style={td()}>{num(row.leads)}</td>
              <td style={{ ...td(), color: row.cpl && row.cpl > benchmark.cpl ? "var(--danger)" : "var(--text2)", fontWeight: 600 }}>{row.cpl ? inr(row.cpl) : "--"}</td>
              <td style={td()}>{num(row.enrollments)}</td>
              <td style={{ ...td(), color: row.conversionPct !== null && row.conversionPct < benchmark.conversion ? "var(--danger)" : "var(--text2)", fontWeight: 600 }}>{pctText(row.conversionPct)}</td>
              <td style={{ ...td(), color: "var(--success)", fontWeight: 600 }}>{inr(Math.round(row.revenue))}</td>
              <td style={td()}>{row.roas ? `${row.roas}x` : "--"}</td>
              <td style={td()}><StatusPill status={showStatus(ok, row.leads === 0)} /></td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function WorkshopTable({ rows, callData }) {
  return (
    <div style={box}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["Workshop", "Start", "Days", "Lead Pool", "D1 Show-up", "D2", "D3", "Call Window", "Calls", "Connected", "Connect %", "KPI Mode"].map((h, i) => <th key={h} style={i === 0 ? thL : th}>{h}</th>)}</tr></thead>
        <tbody>{rows.length === 0
          ? <tr><td colSpan={12} style={{ ...td(), textAlign: "center", padding: "2rem" }}>No completed workshops found for this week.</td></tr>
          : rows.map(workshop => {
            const calls = callData[workshop.id];
            return (
              <tr key={workshop.id}>
                <td style={{ ...td("left"), color: workshop.funnel === "Tarot" ? "var(--tarot)" : "var(--reiki)", fontWeight: 700 }}>{workshop.id} {workshop.name}</td>
                <td style={td()}>{fmtDisplay(workshop.startDate)}</td>
                <td style={td()}>{workshop.days}</td>
                <td style={td()}>{num(workshop.leads)}</td>
                <td style={{ ...td(), fontWeight: 600 }}>{workshop.showD1 ? `${num(workshop.showD1)} (${pctText(workshop.showD1Pct)})` : "--"}</td>
                <td style={td()}>{workshop.showD2 ? `${num(workshop.showD2)} (${pctText(workshop.showD2Pct)})` : "--"}</td>
                <td style={td()}>{workshop.showD3 ? `${num(workshop.showD3)} (${pctText(workshop.showD3Pct)})` : "--"}</td>
                <td style={td()}>{workshop.callWindow ? `${fmtDisplay(workshop.callWindow.from)}-${fmtDisplay(workshop.callWindow.to)}` : "No calls"}</td>
                <td style={td()}>{calls ? num(calls.callsAttempted || 0) : "--"}</td>
                <td style={td()}>{calls ? num(calls.connected || 0) : "--"}</td>
                <td style={td()}>{calls?.connectedRatio !== null && calls?.connectedRatio !== undefined ? pctText(calls.connectedRatio) : "--"}</td>
                <td style={td()}>{calls?.discoveryMode || "--"}</td>
              </tr>
            );
          })}</tbody>
      </table>
    </div>
  );
}

function AuditPanel({ flags, questions, notes, onNotesChange, onCopy, copied }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <div>
        <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Audit Flags</div>
        <div style={{ ...box, padding: "14px 16px" }}>
          {flags.length === 0
            ? <div style={{ color: "var(--success)", fontSize: 13 }}>Everything is broadly on track for this review window.</div>
            : flags.map((flag, i) => <div key={i} style={{ color: "var(--danger)", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border2)" }}>{flag.message}</div>)
          }
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Monday Review Questions</div>
        <div style={{ ...box, padding: "14px 16px" }}>
          {questions.map(question => <div key={question} style={{ fontSize: 13, color: "var(--text2)", padding: "6px 0" }}>{question}</div>)}
          <textarea
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="Add Nitin's Monday review notes here..."
            style={{ width: "100%", minHeight: 92, marginTop: 10, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: 10, fontFamily: "inherit", fontSize: 13 }}
          />
          <button onClick={onCopy} style={{ marginTop: 10, background: "var(--tarot)", color: "#fff", border: "none", padding: "7px 14px", borderRadius: 6, fontWeight: 600 }}>
            {copied ? "Copied" : "Copy Slack Summary"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Performance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState(null);
  const [weekStart, setWeekStart] = useState(lastCompletedWeekStart());
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [callData, setCallData] = useState({});

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

  const audit = useMemo(() => data ? buildAudit(data, weekStart) : null, [data, weekStart]);

  useEffect(() => {
    if (!audit) return;
    let alive = true;

    async function loadCalls() {
      const entries = await Promise.all(audit.workshopRows.map(async workshop => {
        if (!workshop.callWindow) return [workshop.id, null];
        const calls = await loadInternKPIData({ from: workshop.callWindow.from, to: workshop.callWindow.to, funnel: workshop.funnel }).catch(e => ({ error: e.message }));
        return [workshop.id, calls];
      }));
      if (alive) setCallData(Object.fromEntries(entries));
    }

    loadCalls();
    return () => { alive = false; };
  }, [audit]);

  const flags = useMemo(() => audit ? addCallFlags(audit, callData) : [], [audit, callData]);

  if (loading || !audit) {
    return <div style={{ padding: "3rem", color: "var(--text3)", textAlign: "center" }}>Loading workshop performance...</div>;
  }

  const questions = buildQuestions(flags);
  const summary = makeSlackSummary({ ...audit, flags, notes });
  const totalSpend = audit.funnelRows.reduce((s, row) => s + row.spend, 0);
  const totalLeads = audit.funnelRows.reduce((s, row) => s + row.leads, 0);
  const totalRevenue = audit.funnelRows.reduce((s, row) => s + row.revenue, 0);

  async function copySummary() {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div>
      <ReviewHeader weekStart={weekStart} audit={audit} updated={updated} onWeekChange={setWeekStart} onRefresh={load} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: "var(--border)", marginBottom: 24 }}>
        <MetricCard label="Workshops" value={num(audit.workshopRows.length)} />
        <MetricCard label="Lead Pool" value={num(totalLeads)} />
        <MetricCard label="Ad Spend" value={inr(Math.round(totalSpend))} color="var(--warning)" />
        <MetricCard label="Cash Revenue" value={inr(Math.round(totalRevenue))} color="var(--success)" />
        <MetricCard label="Audit Flags" value={num(flags.length)} color={flags.length ? "var(--danger)" : "var(--success)"} />
      </div>

      <div style={{ padding: "0 24px 36px" }}>
        <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Funnel Performance</div>
        <FunnelTable rows={audit.funnelRows} />

        <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Workshop Show-up and Calls</div>
        <WorkshopTable rows={audit.workshopRows} callData={callData} />

        <AuditPanel flags={flags} questions={questions} notes={notes} onNotesChange={setNotes} onCopy={copySummary} copied={copied} />

        <div style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.6, marginTop: 4 }}>
          Notes: ICP is treated as no-call. TMR is ignored. Intern tabs are auto-discovered when Google exposes worksheet metadata; otherwise the dashboard uses the configured intern tabs and marks KPI mode as fallback.
        </div>
      </div>
    </div>
  );
}
