import { WORKSHOP_BENCHMARKS } from "../../config.js";
import { getFunnel } from "../../config.js";
import { countLeadsInRange, classifyWorkshop } from "../../utils/sheets.js";
import { fmtDisplay } from "../../utils/dates.js";
import { inr, num } from "../../utils/format.js";

export const LEAD_DATE_COLS = { Tarot: 5, Reiki: 5 };

export function iso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function weekStartFor(date = new Date()) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

export function lastCompletedWeekStart() {
  return addDays(weekStartFor(new Date()), -7);
}

export function pct(n, d) {
  return d > 0 ? +((n / d) * 100).toFixed(2) : null;
}

export function pctText(v) {
  return v === null || v === undefined ? "--" : `${v.toFixed(v % 1 ? 1 : 0)}%`;
}

function moneyRatio(n, d) {
  return d > 0 ? +(n / d).toFixed(2) : null;
}

export function workshopKind(workshop) {
  const s = `${workshop.id} ${workshop.name}`.toLowerCase();
  if (s.includes("utw")) return "UTW";
  if (s.includes("icp")) return "ICP";
  if (s.includes("thw")) return "THW";
  if (s.includes("r12")) return "R12";
  return workshop.funnel;
}

export function callWindow(workshop) {
  const kind = workshopKind(workshop);
  if (kind === "UTW") return { from: addDays(workshop.startDate, -3), to: workshop.startDate, label: "Fri-Mon" };
  if (kind === "R12") return { from: addDays(workshop.startDate, -2), to: workshop.startDate, label: "Tue-Thu" };
  return null;
}

export function showStatus(ok, warn = false) {
  if (ok) return { label: "OK", color: "var(--success)", bg: "rgba(16,185,129,0.12)" };
  if (warn) return { label: "Watch", color: "var(--warning)", bg: "rgba(245,158,11,0.12)" };
  return { label: "Fix", color: "var(--danger)", bg: "rgba(239,68,68,0.12)" };
}

export function getShowUp(showRows, workshop) {
  const kind = workshopKind(workshop);
  const sameStart = showRows.filter(r => r.startDate === workshop.startDate);
  const matching = sameStart.filter(r => {
    const name = r.workshopName.toLowerCase();
    if (kind === "UTW") return name.includes("utw") || name.includes("wand");
    if (kind === "ICP") return name.includes("icp") || name.includes("predict");
    if (kind === "THW") return name.includes("thw") || name.includes("health");
    if (kind === "R12") return name.includes("r12") || name.includes("reiki");
    return classifyWorkshop(r.workshopName) === workshop.funnel;
  });

  const byDay = {};
  for (const row of matching) {
    const day = String(row.workshopDay || "1").match(/\d+/)?.[0] || "1";
    byDay[day] = Math.max(byDay[day] || 0, row.maxShowUp || 0);
  }
  return byDay;
}

function isFunnelEnrollment(enrollment, funnel) {
  if (funnel === "Tarot") return getFunnel(enrollment.program) === "Tarot";
  if (funnel === "Reiki") return getFunnel(enrollment.program) === "Reiki";
  return false;
}

export function buildAudit(data, weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const leadFrom = addDays(weekStart, -7);
  const leadTo = addDays(weekStart, -1);
  const reviewCutoff = addDays(weekEnd, 1);
  const workshops = data.workshops.filter(w => w.startDate >= weekStart && w.startDate <= weekEnd);

  const funnelRows = ["Tarot", "Reiki"].map(funnel => {
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
    const funnelName = w.funnel === "Reiki" ? "Reiki" : "Tarot";
    const funnel = funnelRows.find(r => r.funnel === funnelName);
    const show = getShowUp(data.showUp, w);

    return {
      ...w,
      kind: workshopKind(w),
      leadFrom,
      leadTo,
      leads: funnel?.leads || 0,
      callWindow: callWindow(w),
      showD1: show["1"] || 0,
      showD2: show["2"] || 0,
      showD3: show["3"] || 0,
      showD1Pct: pct(show["1"] || 0, funnel?.leads || 0),
      showD2Pct: pct(show["2"] || 0, funnel?.leads || 0),
      showD3Pct: pct(show["3"] || 0, funnel?.leads || 0),
    };
  });

  const flags = buildSourceFlags({ funnelRows, workshopRows, leadFrom, leadTo });
  return { weekStart, weekEnd, leadFrom, leadTo, reviewCutoff, workshops, workshopRows, funnelRows, flags };
}

function buildSourceFlags({ funnelRows, workshopRows, leadFrom, leadTo }) {
  const flags = [];

  for (const row of funnelRows) {
    const benchmark = WORKSHOP_BENCHMARKS[row.funnel];
    if (row.cpl && row.cpl > benchmark.cpl) flags.push({ key: "cpl", message: `${row.funnel} CPL ${inr(row.cpl)} is above ${inr(benchmark.cpl)} benchmark.` });
    if (row.conversionPct !== null && row.conversionPct < benchmark.conversion) flags.push({ key: "conversion", message: `${row.funnel} conversion ${pctText(row.conversionPct)} is below ${benchmark.conversion}% benchmark.` });
    if (row.leads === 0) flags.push({ key: "leads", message: `${row.funnel} has no leads in source window ${fmtDisplay(leadFrom)}-${fmtDisplay(leadTo)}.` });
  }

  for (const workshop of workshopRows) {
    const benchmark = WORKSHOP_BENCHMARKS[workshop.funnel] || WORKSHOP_BENCHMARKS.Tarot;
    if (workshop.showD1 && workshop.showD1Pct < benchmark.showD1) flags.push({ key: "showup", message: `${workshop.id} Day 1 show-up ${pctText(workshop.showD1Pct)} is below ${benchmark.showD1}%.` });
    if (workshop.days >= 2 && workshop.showD2 && workshop.showD2Pct < benchmark.showD2) flags.push({ key: "showup", message: `${workshop.id} Day 2 show-up ${pctText(workshop.showD2Pct)} is below ${benchmark.showD2}%.` });
    if (workshop.days >= 3 && workshop.showD3 && workshop.showD3Pct < benchmark.showD3) flags.push({ key: "showup", message: `${workshop.id} Day 3 show-up ${pctText(workshop.showD3Pct)} is below ${benchmark.showD3}%.` });
    if (!workshop.showD1) flags.push({ key: "showup", message: `${workshop.id} has no Tanvi show-up entry yet.` });
  }

  return flags;
}

export function addCallFlags(audit, callData) {
  const today = new Date().toISOString().slice(0, 10);
  const flags = [...audit.flags];

  for (const workshop of audit.workshopRows) {
    const calls = callData[workshop.id];
    if (!workshop.callWindow || !calls) continue;
    if (calls.error) flags.push({ key: "calls", message: `${workshop.id} intern KPI could not load: ${calls.error}` });
    if (!calls.error && calls.callsAttempted === 0) flags.push({ key: "calls", message: `${workshop.id} has no call data in ${workshop.callWindow.label} window.` });
    if (!calls.error && calls.latestDate && calls.latestDate < addDays(today, -1) && workshop.startDate >= addDays(today, -1)) {
      flags.push({ key: "calls", message: `${workshop.id} intern KPI latest update is ${fmtDisplay(calls.latestDate)}.` });
    }
  }

  return flags;
}

export function buildQuestions(flags) {
  const questions = [];
  if (flags.some(f => f.key === "cpl")) questions.push("CPL was above benchmark. Was the issue creative fatigue, audience quality, or budget pushed too aggressively?");
  if (flags.some(f => f.key === "calls")) questions.push("Invitation calls were weak or stale. Was this because of intern availability, data not updated, or calling discipline?");
  if (flags.some(f => f.key === "showup")) questions.push("Show-up was below benchmark. Were reminders, links, WhatsApp follow-ups, or session timing the main issue?");
  if (flags.some(f => f.key === "conversion")) questions.push("Conversion was below benchmark. Was the offer, closer follow-up, or audience quality the biggest reason?");
  if (!questions.length) questions.push("Launch looks broadly on track. What should we repeat next week?");
  return questions;
}

export function makeSlackSummary({ weekStart, weekEnd, funnelRows, workshopRows, flags, notes }) {
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
