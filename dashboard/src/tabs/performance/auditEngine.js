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

function sumSpend(adSpend, from, to, program = null) {
  return (adSpend || [])
    .filter(r => r.date >= from && r.date <= to && (!program || r.program === program))
    .reduce((s, r) => s + (r.spend || 0), 0);
}

function scopedFunnels(scope) {
  if (scope === "Tarot") return ["Tarot"];
  if (scope === "Reiki") return ["Reiki"];
  return ["Tarot", "Reiki"];
}

function countScopedLeads(marketing, scope, from, to) {
  const tarotLeads = countFunnelLeads(marketing, "Tarot", from, to);
  const reikiLeads = countFunnelLeads(marketing, "Reiki", from, to);
  return {
    tarotLeads,
    reikiLeads,
    leads: scope === "Tarot" ? tarotLeads : scope === "Reiki" ? reikiLeads : tarotLeads + reikiLeads,
  };
}

function scopedSalesRows(sales, scope) {
  return scope === "Combined"
    ? (sales || []).filter(e => isFunnelEnrollment(e, "Tarot") || isFunnelEnrollment(e, "Reiki"))
    : (sales || []).filter(e => isFunnelEnrollment(e, scope));
}

function roas(revenue, spend) {
  return spend > 0 ? +(revenue / spend).toFixed(2) : null;
}

function monthLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function monthStart(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

function monthEnd(dateStr) {
  const d = new Date(`${dateStr.slice(0, 7)}-01T12:00:00`);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return iso(d);
}

function avgWeeklySpend(adSpend, program, beforeDate) {
  let total = 0;
  for (let i = 1; i <= 4; i++) {
    const to = addDays(beforeDate, -1 - ((i - 1) * 7));
    const from = addDays(to, -6);
    total += sumSpend(adSpend, from, to, program);
  }
  return total / 4;
}

function bulkSpendFlag(adSpend, from, to, scope = "Combined") {
  const programs = scopedFunnels(scope);
  const flagged = (adSpend || [])
    .filter(r => r.date >= from && r.date <= to && programs.includes(r.program))
    .filter(r => {
      const avg = avgWeeklySpend(adSpend, r.program, from);
      return avg > 0 && (r.spend || 0) > avg * 2;
    });

  if (!flagged.length) return null;
  return {
    count: flagged.length,
    rows: flagged.map(r => ({ date: r.date, program: r.program, spend: r.spend })),
  };
}

function countFunnelLeads(marketing, funnel, from, to) {
  const rows = funnel === "Tarot" ? marketing.tarotRows : marketing.reikiRows;
  return countLeadsInRange(rows || [], LEAD_DATE_COLS[funnel], from, to);
}

function rangeSales(sales, from, to) {
  const enrollments = (sales || []).filter(e => e.date >= from && e.date <= to);
  return {
    enrollments: enrollments.length,
    revenue: enrollments.reduce((s, e) => s + (e.amtReceived || 0), 0),
  };
}

function monthsBack(dateStr, months) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setMonth(d.getMonth() - months);
  return iso(d);
}

function summarizeBusinessWindow(data, from, to, scope = "Combined") {
  const { tarotLeads, reikiLeads, leads } = countScopedLeads(data.marketing, scope, from, to);
  const spend = sumSpend(data.marketing.adSpend, from, to, scope === "Combined" ? null : scope);
  const sales = rangeSales(scopedSalesRows(data.sales, scope), from, to);

  return {
    from,
    to,
    tarotLeads,
    reikiLeads,
    leads,
    spend,
    blendedCpl: leads > 0 ? Math.round(spend / leads) : null,
    enrollments: sales.enrollments,
    revenue: sales.revenue,
    roas: roas(sales.revenue, spend),
  };
}

export function aggregateInternKPI(internHistory, { from, to, funnel = null }) {
  const total = { leadsAssigned: 0, callsAttempted: 0, connected: 0, rows: 0, latestDate: null, tabs: [], errors: [] };
  const rows = Array.isArray(internHistory) ? internHistory : (internHistory?.rows || []);
  const selected = rows.filter(row => row.date >= from && row.date <= to);

  for (const row of selected) {
    if (!total.tabs.includes(row.tab)) total.tabs.push(row.tab);

    if (!funnel || funnel === "Tarot") {
      total.leadsAssigned += row.tarotLeadsAssigned || 0;
      total.callsAttempted += row.tarotCallsAttempted || 0;
      total.connected += row.tarotConnected || 0;
    }
    if (!funnel || funnel === "Reiki") {
      total.leadsAssigned += row.reikiLeadsAssigned || 0;
      total.callsAttempted += row.reikiCallsAttempted || 0;
      total.connected += row.reikiConnected || 0;
    }

    total.rows += 1;
    if (!total.latestDate || row.date > total.latestDate) total.latestDate = row.date;
  }

  total.connectedRatio = total.callsAttempted > 0 ? (total.connected / total.callsAttempted) * 100 : null;
  total.discoveryMode = internHistory?.discoveryMode || "loaded";
  return total;
}

function equivalentPreviousWindow(window) {
  if (window.months) {
    return {
      from: monthsBack(addDays(window.from, -1), window.months),
      to: addDays(window.from, -1),
    };
  }
  return {
    from: addDays(window.from, -window.days),
    to: addDays(window.from, -1),
  };
}

export function buildTrajectoryOverview(data, scope = "Combined", today = iso(new Date())) {
  const windows = [
    { label: "Last 7 Days", days: 7, from: addDays(today, -6), to: today, group: "pulse" },
    { label: "Last 14 Days", days: 14, from: addDays(today, -13), to: today, group: "pulse" },
    { label: "Last 21 Days", days: 21, from: addDays(today, -20), to: today, group: "pulse" },
    { label: "Last 30 Days", days: 30, from: addDays(today, -29), to: today, group: "pulse" },
    { label: "Last 60 Days", days: 60, from: addDays(today, -59), to: today, group: "strategic" },
    { label: "Last 90 Days", days: 90, from: addDays(today, -89), to: today, group: "strategic" },
    { label: "Last 6 Months", months: 6, from: monthsBack(today, 6), to: today, group: "strategic" },
  ];

  return windows.map(w => {
    const previousWindow = equivalentPreviousWindow(w);
    return {
      ...w,
      ...summarizeBusinessWindow(data, w.from, w.to, scope),
      previous: summarizeBusinessWindow(data, previousWindow.from, previousWindow.to, scope),
      previousFrom: previousWindow.from,
      previousTo: previousWindow.to,
    };
  });
}

function workshopShowUpForWeek(showRows, weekStart, weekEnd, kind = "UTW") {
  const matching = (showRows || []).filter(row => {
    const name = row.workshopName.toLowerCase();
    const isUTW = name.includes("utw") || name.includes("wand");
    const isR12 = name.includes("r12") || name.includes("reiki");
    return row.startDate >= weekStart && row.startDate <= weekEnd && (kind === "R12" ? isR12 : isUTW);
  });

  const byDay = {};
  for (const row of matching) {
    const day = String(row.workshopDay || "1").match(/\d+/)?.[0] || "1";
    const current = byDay[day] || { show: 0, leads: 0 };
    byDay[day] = {
      show: Math.max(current.show, row.maxShowUp || 0),
      leads: Math.max(current.leads, row.reportedLeads || 0),
    };
  }

  return {
    d1: pct(byDay["1"]?.show || 0, byDay["1"]?.leads || 0),
    d2: pct(byDay["2"]?.show || 0, byDay["2"]?.leads || 0),
    d3: pct(byDay["3"]?.show || 0, byDay["3"]?.leads || 0),
  };
}

function showUpKind(row) {
  const name = String(row.workshopName || "").toLowerCase();
  if (name.includes("r12") || name.includes("reiki")) return "R12";
  if (name.includes("utw") || name.includes("wand")) return "UTW";
  if (name.includes("icp") || name.includes("predict")) return "ICP";
  if (name.includes("thw") || name.includes("health")) return "THW";
  return null;
}

function fallbackWorkshopFromShowUp(showRows, weekStart, weekEnd, scope = "Combined") {
  const targetKind = scope === "Reiki" ? "R12" : "UTW";
  const matching = (showRows || [])
    .filter(row => row.startDate >= weekStart && row.startDate <= weekEnd)
    .filter(row => {
      const kind = showUpKind(row);
      if (!kind) return false;
      if (scope === "Reiki") return kind === "R12";
      if (scope === "Tarot") return kind !== "R12";
      return true;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const row = matching.find(r => showUpKind(r) === targetKind) || matching[0];
  if (!row) return null;

  const kind = showUpKind(row);
  const funnel = kind === "R12" ? "Reiki" : "Tarot";
  return {
    id: kind || funnel,
    name: row.workshopName || `${kind || funnel} Workshop`,
    days: kind === "UTW" ? 3 : 1,
    startDate: row.startDate,
    startTime: "",
    startDay: "",
    status: "Done",
    funnel,
    inferredFromShowUp: true,
  };
}

function preferredWorkshopForWeek(data, weekStart, weekEnd, scope = "Combined") {
  const showUpWorkshop = fallbackWorkshopFromShowUp(data.showUp, weekStart, weekEnd, scope);
  return showUpWorkshop;
}

function weekdayLabel(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short" });
}

function avgPct(values) {
  const nums = values.filter(v => v !== null && v !== undefined);
  if (!nums.length) return null;
  return +(nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(2);
}

function monthlyShowUpAverages(showRows, from, to, scope = "Combined") {
  const targetKind = scope === "Reiki" ? "R12" : "UTW";
  const byWorkshop = {};

  for (const row of showRows || []) {
    if (row.startDate < from || row.startDate > to) continue;
    const kind = showUpKind(row);
    if (!kind) continue;
    if (scope === "Reiki" && kind !== "R12") continue;
    if (scope !== "Reiki" && kind !== targetKind) continue;

    const key = `${row.startDate}:${kind}`;
    const day = String(row.workshopDay || "1").match(/\d+/)?.[0] || "1";
    const current = byWorkshop[key]?.[day] || { show: 0, leads: 0 };
    byWorkshop[key] = {
      ...(byWorkshop[key] || {}),
      [day]: {
        show: Math.max(current.show, row.maxShowUp || 0),
        leads: Math.max(current.leads, row.reportedLeads || 0),
      },
    };
  }

  const days = { d1: [], d2: [], d3: [] };
  for (const workshop of Object.values(byWorkshop)) {
    days.d1.push(pct(workshop["1"]?.show || 0, workshop["1"]?.leads || 0));
    days.d2.push(pct(workshop["2"]?.show || 0, workshop["2"]?.leads || 0));
    days.d3.push(pct(workshop["3"]?.show || 0, workshop["3"]?.leads || 0));
  }

  return {
    d1: avgPct(days.d1),
    d2: avgPct(days.d2),
    d3: avgPct(days.d3),
  };
}

export function buildRollingPerformance(data, internHistory, weeks = 12, scope = "Combined") {
  const anchor = lastCompletedWeekStart();
  const firstWeek = addDays(anchor, -(weeks - 1) * 7);
  const chronological = [];

  for (let i = 0; i < weeks; i++) {
    const calendarWeekStart = addDays(firstWeek, i * 7);
    const calendarWeekEnd = addDays(calendarWeekStart, 6);
    const workshop = preferredWorkshopForWeek(data, calendarWeekStart, calendarWeekEnd, scope);
    const rowStart = workshop?.startDate || calendarWeekStart;
    const hasWorkshop = Boolean(workshop);
    const spendFrom = hasWorkshop ? addDays(rowStart, -7) : calendarWeekStart;
    const spendTo = hasWorkshop ? addDays(rowStart, -1) : calendarWeekEnd;
    const salesFrom = rowStart;
    const salesTo = addDays(rowStart, 6);
    const { tarotLeads, reikiLeads, leads } = countScopedLeads(data.marketing, scope, spendFrom, spendTo);
    const spend = sumSpend(data.marketing.adSpend, spendFrom, spendTo, scope === "Combined" ? null : scope);
    const sales = hasWorkshop ? rangeSales(scopedSalesRows(data.sales, scope), salesFrom, salesTo) : { enrollments: null, revenue: null };
    const calls = hasWorkshop ? callWindow(workshop) : null;
    const intern = calls ? aggregateInternKPI(internHistory, { from: calls.from, to: calls.to, funnel: scope === "Combined" ? null : scope }) : { connectedRatio: null };
    const show = hasWorkshop ? workshopShowUpForWeek(data.showUp, salesFrom, salesTo, scope === "Reiki" ? "R12" : "UTW") : { d1: null, d2: null, d3: null };
    const prev = chronological[chronological.length - 1];
    const revenueChange = prev && sales.revenue !== null && prev.revenue !== null ? sales.revenue - prev.revenue : null;

    chronological.push({
      weekStart: rowStart,
      weekEnd: salesTo,
      calendarWeekStart,
      calendarWeekEnd,
      spendFrom,
      spendTo,
      salesFrom,
      salesTo,
      hasWorkshop,
      workshopId: workshop?.id || null,
      workshopDay: weekdayLabel(rowStart),
      tarotLeads,
      reikiLeads,
      leads,
      spend,
      blendedCpl: leads > 0 ? Math.round(spend / leads) : null,
      showD1Pct: show.d1,
      showD2Pct: show.d2,
      showD3Pct: show.d3,
      internConnectedRatio: intern.connectedRatio,
      enrollments: sales.enrollments,
      revenue: sales.revenue,
      roas: sales.revenue !== null ? roas(sales.revenue, spend) : null,
      bulkSpendFlag: bulkSpendFlag(data.marketing.adSpend, spendFrom, spendTo, scope),
      revenueChange,
      status: revenueChange === null ? "neutral" : revenueChange >= 0 ? "up" : "down",
    });
  }

  return chronological.reverse();
}

export function buildMonthlyPerformance(data, months = 6, scope = "Combined", today = iso(new Date())) {
  const current = monthStart(today);
  const startDate = new Date(`${current}T12:00:00`);
  startDate.setMonth(startDate.getMonth() - (months - 1));
  const chronological = [];

  for (let i = 0; i < months; i++) {
    const d = new Date(startDate);
    d.setMonth(startDate.getMonth() + i);
    const from = iso(d);
    const to = monthEnd(from);
    const { tarotLeads, reikiLeads, leads } = countScopedLeads(data.marketing, scope, from, to);
    const spend = sumSpend(data.marketing.adSpend, from, to, scope === "Combined" ? null : scope);
    const sales = rangeSales(scopedSalesRows(data.sales, scope), from, to);
    const show = monthlyShowUpAverages(data.showUp, from, to, scope);
    const intern = aggregateInternKPI(data.internHistory, { from, to, funnel: scope === "Combined" ? null : scope });
    const prev = chronological[chronological.length - 1];
    const revenueChange = prev ? sales.revenue - prev.revenue : null;

    chronological.push({
      month: from.slice(0, 7),
      monthLabel: monthLabel(from),
      from,
      to,
      tarotLeads,
      reikiLeads,
      leads,
      spend,
      blendedCpl: leads > 0 ? Math.round(spend / leads) : null,
      showD1Pct: show.d1,
      showD2Pct: show.d2,
      showD3Pct: show.d3,
      internConnectedRatio: intern.connectedRatio,
      enrollments: sales.enrollments,
      revenue: sales.revenue,
      roas: roas(sales.revenue, spend),
      bulkSpendFlag: bulkSpendFlag(data.marketing.adSpend, from, to, scope),
      revenueChange,
      status: revenueChange === null ? "neutral" : revenueChange >= 0 ? "up" : "down",
    });
  }

  return chronological.reverse();
}

export function buildWorkshopAudit(data, selectedWorkshop, internHistory) {
  if (!selectedWorkshop) return null;

  const leadFrom = addDays(selectedWorkshop.startDate, -7);
  const leadTo = addDays(selectedWorkshop.startDate, -1);
  const conversionFrom = selectedWorkshop.startDate;
  const conversionTo = addDays(selectedWorkshop.startDate, 6);
  const funnel = selectedWorkshop.funnel === "Reiki" ? "Reiki" : "Tarot";
  const leads = countFunnelLeads(data.marketing, funnel, leadFrom, leadTo);
  const spend = sumSpend(data.marketing.adSpend, leadFrom, leadTo, funnel);
  const show = getShowUp(data.showUp, selectedWorkshop);
  const enrollments = (data.sales || []).filter(e => e.date >= conversionFrom && e.date <= conversionTo && isFunnelEnrollment(e, funnel));
  const revenue = enrollments.reduce((s, e) => s + (e.amtReceived || 0), 0);
  const workshop = {
    ...selectedWorkshop,
    leadFrom,
    leadTo,
    leads,
    callWindow: callWindow(selectedWorkshop),
    showD1: show["1"] || 0,
    showD2: show["2"] || 0,
    showD3: show["3"] || 0,
    showD1Pct: pct(show["1"] || 0, leads),
    showD2Pct: pct(show["2"] || 0, leads),
    showD3Pct: pct(show["3"] || 0, leads),
  };
  const calls = workshop.callWindow
    ? aggregateInternKPI(internHistory, { from: workshop.callWindow.from, to: workshop.callWindow.to, funnel })
    : null;
  const funnelRow = {
    funnel,
    leads,
    spend,
    cpl: leads > 0 ? Math.round(spend / leads) : null,
    enrollments: enrollments.length,
    revenue,
    conversionPct: pct(enrollments.length, leads),
    roas: moneyRatio(revenue, spend),
  };
  const flags = addCallFlags({
    weekStart: selectedWorkshop.startDate,
    weekEnd: conversionTo,
    flags: buildSourceFlags({ funnelRows: [funnelRow], workshopRows: [workshop], leadFrom, leadTo }),
    workshopRows: [workshop],
  }, { [workshop.id]: calls });

  return {
    workshop,
    funnelRow,
    calls,
    flags,
    leadFrom,
    leadTo,
    conversionFrom,
    conversionTo,
  };
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
  if (funnel === "Tarot") {
    const program = String(enrollment.program || "").toLowerCase();
    const isCoreTarot = program.includes("tarot") && (program.includes("diploma") || program.includes("mastery"));
    return isCoreTarot && !program.includes("health");
  }
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

export function buildAuditCallData(audit, internHistory) {
  return Object.fromEntries(audit.workshopRows.map(workshop => {
    if (!workshop.callWindow) return [workshop.id, null];
    return [
      workshop.id,
      aggregateInternKPI(internHistory, {
        from: workshop.callWindow.from,
        to: workshop.callWindow.to,
        funnel: workshop.funnel,
      }),
    ];
  }));
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
