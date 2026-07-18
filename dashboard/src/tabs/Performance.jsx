import { useState, useEffect, useCallback, useMemo } from "react";
import { WORKSHOP_BENCHMARKS } from "../config.js";
import {
  loadSalesData,
  loadMarketingData,
  loadWorkshopPlan,
  loadWorkshopShowUpData,
  loadInternKPIHistory,
} from "../utils/sheets.js";
import { fmtDisplay } from "../utils/dates.js";
import { inr, num } from "../utils/format.js";
import WorkshopAudit from "./WorkshopAudit.jsx";
import {
  buildAudit,
  buildMonthlyPerformance,
  buildRollingPerformance,
  buildTrajectoryOverview,
  lastCompletedWeekStart,
  pctText,
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

const PERFORMANCE_SCOPES = ["Combined", "Tarot", "Reiki", "Workshop Audit"];
const TABLE_MODES = ["Weekly", "Monthly"];

function ScopeSelector({ scope, onChange }) {
  return (
    <div style={{ display: "flex", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      {PERFORMANCE_SCOPES.map(option => (
        <button key={option} onClick={() => onChange(option)} style={{
          border: "none",
          borderRadius: 0,
          padding: "5px 13px",
          fontSize: 12,
          fontWeight: 500,
          background: scope === option ? "var(--tarot)" : "transparent",
          color: scope === option ? "#fff" : "var(--text3)",
        }}>{option}</button>
      ))}
    </div>
  );
}

function PillToggle({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      {options.map(option => (
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

function TrajectoryCard({ row, scope }) {
  const leadLabel = scope === "Combined" ? "Total Leads" : `${scope} Leads`;
  const cplLabel = scope === "Combined" ? "Blended CPL" : `${scope} CPL`;
  const cplOk = scope === "Combined" || !row.blendedCpl || row.blendedCpl <= WORKSHOP_BENCHMARKS[scope].cpl;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 700 }}>{row.label}</div>
        <div style={{ fontSize: 10, color: "var(--text3)" }}>{fmtDisplay(row.from)} - {fmtDisplay(row.to)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <MiniMetric label={leadLabel} value={num(row.leads)} />
        <MiniMetric label="Total Spend" value={inr(Math.round(row.spend))} color="var(--warning)" />
        <MiniMetric label={cplLabel} value={row.blendedCpl ? inr(row.blendedCpl) : "--"} color={scope === "Combined" ? undefined : cplOk ? "var(--success)" : "var(--danger)"} />
        <MiniMetric label={`${scope === "Combined" ? "" : scope} Enrollments`.trim()} value={num(row.enrollments)} />
        <MiniMetric label={`${scope === "Combined" ? "" : scope} Revenue`.trim()} value={inr(Math.round(row.revenue))} color="var(--success)" />
        <MiniMetric label="ROAS" value={row.roas === null || row.roas === undefined ? "--" : `${row.roas.toFixed(2)}x`} color={roasColor(row.roas)} />
      </div>
    </div>
  );
}

function MiniMetric({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || "var(--text2)" }}>{value}</div>
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ margin: "0 0 12px" }}>
      <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}

function TrajectoryOverview({ rows, scope }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <SectionTitle title="Trajectory Overview" subtitle="Rolling health check across leads, CPL, enrollments, and cash revenue." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
        {rows.map(row => <TrajectoryCard key={row.label} row={row} scope={scope} />)}
      </div>
    </section>
  );
}

function roasColor(value) {
  if (value === null || value === undefined) return "var(--text3)";
  if (value < 0.5) return "var(--danger)";
  if (value <= 1) return "var(--warning)";
  return "var(--success)";
}

function SpendCell({ row }) {
  return (
    <td style={td()}>
      {inr(Math.round(row.spend))}
      {row.bulkSpendFlag && (
        <span title="Bulk entry detected — verify with Siddhi." style={{ color: "var(--warning)", marginLeft: 6, cursor: "help" }}>⚠</span>
      )}
    </td>
  );
}

function RevenueChangeCell({ row, label = "WoW" }) {
  const changeColor = row.status === "up" ? "var(--success)" : row.status === "down" ? "var(--danger)" : "var(--text3)";
  const arrow = row.revenueChange === null ? "" : row.revenueChange >= 0 ? "▲" : "▼";
  return (
    <td style={{ ...td(), color: changeColor, fontWeight: 700 }}>
      {row.revenueChange === null ? "--" : `${arrow} ${inr(Math.abs(Math.round(row.revenueChange)))}`}
    </td>
  );
}

function RoasCell({ value }) {
  return <td style={{ ...td(), color: roasColor(value), fontWeight: value === null || value === undefined ? 400 : 700 }}>{value === null || value === undefined ? "--" : `${value.toFixed(2)}x`}</td>;
}

function RollingPerformanceTable({ rows, scope, tableMode, onTableModeChange }) {
  const rowBg = status => {
    if (status === "up") return "rgba(16,185,129,0.08)";
    if (status === "down") return "rgba(239,68,68,0.08)";
    return "rgba(148,163,184,0.07)";
  };

  const monthly = tableMode === "Monthly";
  const title = monthly ? "Monthly Performance" : "12-Week Rolling Performance";
  const subtitle = monthly
    ? "Last 6 calendar months. Monthly view hides workshop-level show-up and intern-call columns."
    : "The main weekly business trajectory view. Revenue color compares each workshop row against the previous row.";
  const headers = monthly
    ? (scope === "Combined"
      ? ["Month", "Tarot Leads", "Reiki Leads", "Total Ad Spend", "Blended CPL", "UTW D1 Avg", "UTW D2 Avg", "UTW D3 Avg", "Intern Connect", "Enrollments", "Revenue", "ROAS", "MoM Revenue"]
      : ["Month", `${scope} Leads`, `${scope} Ad Spend`, `${scope} CPL`, scope === "Reiki" ? "R12 D1 Avg" : "UTW D1 Avg", scope === "Reiki" ? "R12 D2 Avg" : "UTW D2 Avg", scope === "Reiki" ? "R12 D3 Avg" : "UTW D3 Avg", "Intern Connect", `${scope} Enrollments`, `${scope} Revenue`, "ROAS", "MoM Revenue"])
    : (scope === "Combined"
      ? ["Workshop Start", "Tarot Leads", "Reiki Leads", "Total Ad Spend", "Blended CPL", "UTW D1", "UTW D2", "UTW D3", "Intern Connect", "Enrollments", "Revenue", "ROAS", "WoW Revenue"]
      : ["Workshop Start", `${scope} Leads`, `${scope} Ad Spend`, `${scope} CPL`, scope === "Reiki" ? "R12 D1" : "UTW D1", scope === "Reiki" ? "R12 D2" : "UTW D2", scope === "Reiki" ? "R12 D3" : "UTW D3", "Intern Connect", `${scope} Enrollments`, `${scope} Revenue`, "ROAS", "WoW Revenue"]);

  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
        <SectionTitle title={title} subtitle={subtitle} />
        <PillToggle options={TABLE_MODES} value={tableMode} onChange={onTableModeChange} />
      </div>
      <div style={box}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={h} style={i === 0 ? thL : th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const cplOk = scope === "Combined" || !row.blendedCpl || row.blendedCpl <= WORKSHOP_BENCHMARKS[scope].cpl;
              return (
                <tr key={monthly ? row.month : row.weekStart} style={{ background: rowBg(row.status) }}>
                  <td style={{ ...td("left"), color: "var(--text)", fontWeight: 700 }}>{monthly ? row.monthLabel : fmtDisplay(row.weekStart)}</td>
                  {scope === "Combined" && <td style={td()}>{num(row.tarotLeads)}</td>}
                  {scope === "Combined" && <td style={td()}>{num(row.reikiLeads)}</td>}
                  {scope !== "Combined" && <td style={td()}>{num(row.leads)}</td>}
                  <SpendCell row={row} />
                  <td style={{ ...td(), color: scope === "Combined" ? "var(--text2)" : cplOk ? "var(--success)" : "var(--danger)", fontWeight: scope === "Combined" ? 400 : 700 }}>{row.blendedCpl ? inr(row.blendedCpl) : "--"}</td>
                  <td style={td()}>{pctText(row.showD1Pct)}</td>
                  <td style={td()}>{pctText(row.showD2Pct)}</td>
                  <td style={td()}>{pctText(row.showD3Pct)}</td>
                  <td style={td()}>{pctText(row.internConnectedRatio)}</td>
                  <td style={td()}>{row.enrollments === null || row.enrollments === undefined ? "--" : num(row.enrollments)}</td>
                  <td style={{ ...td(), color: row.revenue === null || row.revenue === undefined ? "var(--text3)" : "var(--success)", fontWeight: 700 }}>{row.revenue === null || row.revenue === undefined ? "--" : inr(Math.round(row.revenue))}</td>
                  <RoasCell value={row.roas} />
                  <RevenueChangeCell row={row} label={monthly ? "MoM" : "WoW"} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
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

export default function Performance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState(null);
  const [weekStart, setWeekStart] = useState(lastCompletedWeekStart());
  const [scope, setScope] = useState("Combined");
  const [tableMode, setTableMode] = useState("Weekly");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [workshops, showUp, marketing, sales, internHistory] = await Promise.all([
        loadWorkshopPlan().catch(() => []),
        loadWorkshopShowUpData().catch(() => []),
        loadMarketingData(),
        loadSalesData(),
        loadInternKPIHistory().catch(() => ({ rows: [], tabs: [], discoveryMode: "unavailable" })),
      ]);
      setData({ workshops, showUp, marketing, sales, internHistory });
    } finally {
      setLoading(false);
      setUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const audit = useMemo(() => data ? buildAudit(data, weekStart) : null, [data, weekStart]);
  const scoreScope = scope === "Workshop Audit" ? "Combined" : scope;
  const trajectoryRows = useMemo(() => data ? buildTrajectoryOverview(data, scoreScope) : [], [data, scoreScope]);
  const rollingRows = useMemo(() => {
    if (!data) return [];
    return tableMode === "Monthly"
      ? buildMonthlyPerformance(data, 6, scoreScope)
      : buildRollingPerformance(data, data.internHistory, 12, scoreScope);
  }, [data, scoreScope, tableMode]);

  if (loading || !audit) {
    return <div style={{ padding: "3rem", color: "var(--text3)", textAlign: "center" }}>Loading workshop performance...</div>;
  }

  return (
    <div>
      <ReviewHeader weekStart={weekStart} audit={audit} updated={updated} onWeekChange={setWeekStart} onRefresh={load} />

      <div style={{ padding: "24px 24px 36px" }}>
        <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 18 }}>
          <ScopeSelector scope={scope} onChange={setScope} />
        </div>

        {scope === "Workshop Audit" ? (
          <WorkshopAudit sharedData={data} sharedLoading={loading} sharedUpdated={updated} onRefresh={load} embedded />
        ) : (
          <>
            <TrajectoryOverview rows={trajectoryRows} scope={scoreScope} />

            <RollingPerformanceTable rows={rollingRows} scope={scoreScope} tableMode={tableMode} onTableModeChange={setTableMode} />
          </>
        )}
      </div>
    </div>
  );
}
