import { toISO, todayISO, monthStartISO } from './dates.js';
import {
  SHEETS,
  SALES_SHEET,
  FINANCE_URL,
  EMI_URL,
  BATCH_EMI_URL,
  SUPER_EMI,
  RGM_EMI,
  WORKSHOP_PMS,
  WORKSHOP_PERFORMANCE,
  INTERNS_KPI,
} from '../config.js';

// --- Shared helpers -----------------------------------------------------------
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQ && next === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === ',' && !inQ) {
      row.push(cur.trim());
      cur = '';
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cur.trim());
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      cur = '';
    } else {
      cur += ch;
    }
  }

  row.push(cur.trim());
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
}

export function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;

  const normalized = String(raw)
    .replace(/[₹,\s]/g, '')
    .replace(/rs\.?/gi, '')
    .replace(/[^\d.-]/g, '');

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

export async function fetchCSV(sheetId, tab) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${tab}`);
  return parseCSV(await res.text());
}

function findHeaderIndex(header, terms, fallback = -1) {
  const h = (header || []).map(c => String(c || '').toLowerCase().trim());
  const idx = h.findIndex(c => terms.some(t => c.includes(t)));
  return idx >= 0 ? idx : fallback;
}

function parseAnyDate(raw, forceDDMM = false) {
  if (!raw) return null;
  const iso = toISO(raw, forceDDMM);
  if (iso) return iso;

  const s = String(raw).trim().replace(/^[A-Za-z]+,\s*/, '');
  const named = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (named) {
    const months = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
    const mo = months[named[2].toLowerCase().slice(0, 3)];
    if (mo) return `${named[3]}-${mo}-${named[1].padStart(2, '0')}`;
  }
  return null;
}

async function listPublicSheetTabs(sheetId) {
  try {
    const url = `https://spreadsheets.google.com/feeds/worksheets/${sheetId}/public/basic?alt=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`worksheet feed ${res.status}`);
    const data = await res.json();
    const entries = data?.feed?.entry || [];
    return entries.map(e => e?.title?.$t).filter(Boolean);
  } catch (_) {
    return [];
  }
}

// --- Workshop audit data ------------------------------------------------------
export function classifyWorkshop(value) {
  const s = String(value || '').toLowerCase();
  if (s.includes('r12') || s.includes('reiki')) return 'Reiki';
  if (s.includes('utw') || s.includes('icp') || s.includes('thw') || s.includes('tarot')) return 'Tarot';
  return 'Other';
}

export async function loadWorkshopPlan() {
  let rows = [];
  try {
    rows = await fetchCSV(WORKSHOP_PMS.id, WORKSHOP_PMS.tab);
  } catch (e) {
    console.warn('[WorkshopPlan] failed to fetch CSV', {
      sheetId: WORKSHOP_PMS.id,
      tab: WORKSHOP_PMS.tab,
      error: e.message,
    });
    throw e;
  }
  console.log('[WorkshopPlan] raw CSV rows', {
    sheetId: WORKSHOP_PMS.id,
    tab: WORKSHOP_PMS.tab,
    rowCount: rows.length,
    sample: rows.slice(0, 5),
  });
  if (rows.length < 2) return [];

  const headerRowIndex = rows.findIndex(r => r.some(c => String(c || '').toLowerCase().includes('workshop id')));
  const header = rows[headerRowIndex >= 0 ? headerRowIndex : 0] || [];
  const cols = {
    id:     findHeaderIndex(header, ['workshop id'], 0),
    days:   findHeaderIndex(header, ['workshop days', 'days'], 2),
    name:   findHeaderIndex(header, ['workshop name', 'name'], 3),
    start:  findHeaderIndex(header, ['start date', 'date'], 4),
    time:   findHeaderIndex(header, ['start time', 'time'], 5),
    day:    findHeaderIndex(header, ['start day', 'day'], 6),
    status: findHeaderIndex(header, ['status'], 7),
  };

  const parsed = rows.slice((headerRowIndex >= 0 ? headerRowIndex : 0) + 1)
    .map(r => {
      const id = r[cols.id]?.trim() || '';
      const name = r[cols.name]?.trim() || '';
      const startDate = parseAnyDate(r[cols.start], true);
      return {
        id,
        name,
        days: parseInt(r[cols.days]) || 1,
        startDate,
        startTime: r[cols.time]?.trim() || '',
        startDay: r[cols.day]?.trim() || '',
        status: r[cols.status]?.trim() || '',
        funnel: classifyWorkshop(`${id} ${name}`),
      };
    })
    .filter(w => w.id && w.startDate && w.status.toLowerCase() === 'done')
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  console.log('[WorkshopPlan] parsed workshops', {
    count: parsed.length,
    header,
    cols,
    first: parsed[0] || null,
  });
  return parsed;
}

export async function loadWorkshopShowUpData() {
  const rows = await fetchCSV(WORKSHOP_PERFORMANCE.id, WORKSHOP_PERFORMANCE.showUpTab);
  if (rows.length < 2) return [];

  const header = rows[0] || [];
  const cols = {
    timestamp: findHeaderIndex(header, ['timestamp'], 0),
    name:      findHeaderIndex(header, ['workshop name'], 2),
    day:       findHeaderIndex(header, ['workshop day'], 3),
    start:     findHeaderIndex(header, ['workshop start date', 'start date'], 4),
    leads:     findHeaderIndex(header, ['total leads'], 5),
    show:      findHeaderIndex(header, ['maximum showup', 'maximum people', 'showed up'], 6),
  };

  return rows.slice(1).map(r => ({
    timestamp: r[cols.timestamp]?.trim() || '',
    workshopName: r[cols.name]?.trim() || '',
    workshopDay: String(r[cols.day] || '').trim(),
    startDate: parseAnyDate(r[cols.start], true),
    reportedLeads: parseAmount(r[cols.leads]),
    maxShowUp: parseAmount(r[cols.show]),
  })).filter(r => r.workshopName && r.startDate && r.maxShowUp > 0);
}

export async function loadAuditMemory() {
  const rows = await fetchCSV(WORKSHOP_PERFORMANCE.id, WORKSHOP_PERFORMANCE.memoryTab).catch(() => []);
  return rows.slice(1).map(r => ({
    week: r[0]?.trim() || '',
    auditType: r[1]?.trim() || '',
    jsonData: r[2]?.trim() || '',
    lastUpdated: r[3]?.trim() || '',
  })).filter(r => r.week || r.jsonData);
}

function emptyInternTotals() {
  return { leadsAssigned: 0, callsAttempted: 0, connected: 0, rows: 0, latestDate: null, tabs: [], errors: [] };
}

function addInternRow(total, row, cols) {
  total.leadsAssigned += parseAmount(row[cols.leads]);
  total.callsAttempted += parseAmount(row[cols.calls]);
  total.connected += parseAmount(row[cols.connected]);
  total.rows += 1;
}

export async function loadInternKPIData({ from, to, funnel }) {
  const discoveredTabs = await listPublicSheetTabs(INTERNS_KPI.id);
  const tabs = (discoveredTabs.length ? discoveredTabs : INTERNS_KPI.fallbackTabs)
    .filter(tab => tab && !(INTERNS_KPI.skipTabs || []).includes(tab));

  const cols = funnel === 'Reiki'
    ? { leads: 7, calls: 8, connected: 9 }
    : { leads: 3, calls: 4, connected: 5 };

  const total = emptyInternTotals();
  const tabResults = await Promise.all(tabs.map(async tab => {
    try {
      const rows = await fetchCSV(INTERNS_KPI.id, tab);
      let tabRows = 0;
      let tabLatest = null;

      for (const row of rows) {
        const date = parseAnyDate(row[1]);
        if (!date || date < from || date > to) continue;
        const numeric = [cols.leads, cols.calls, cols.connected].some(i => parseAmount(row[i]) > 0);
        if (!numeric) continue;
        addInternRow(total, row, cols);
        tabRows += 1;
        if (!tabLatest || date > tabLatest) tabLatest = date;
        if (!total.latestDate || date > total.latestDate) total.latestDate = date;
      }

      return { tab, rows: tabRows, latestDate: tabLatest };
    } catch (e) {
      return { tab, rows: 0, latestDate: null, error: e.message };
    }
  }));

  total.tabs = tabResults;
  total.errors = tabResults.filter(t => t.error).map(t => `${t.tab}: ${t.error}`);
  total.connectedRatio = total.callsAttempted > 0 ? (total.connected / total.callsAttempted) * 100 : null;
  total.discoveryMode = discoveredTabs.length ? 'auto' : 'fallback';
  return total;
}

export async function loadInternKPIHistory() {
  const discoveredTabs = await listPublicSheetTabs(INTERNS_KPI.id);
  const tabs = (discoveredTabs.length ? discoveredTabs : INTERNS_KPI.fallbackTabs)
    .filter(tab => tab && !(INTERNS_KPI.skipTabs || []).includes(tab));

  const results = await Promise.all(tabs.map(async tab => {
    try {
      const rows = await fetchCSV(INTERNS_KPI.id, tab);
      const entries = [];

      for (const row of rows) {
        const date = parseAnyDate(row[1]);
        if (!date) continue;

        const entry = {
          date,
          tab,
          tarotLeadsAssigned: parseAmount(row[3]),
          tarotCallsAttempted: parseAmount(row[4]),
          tarotConnected: parseAmount(row[5]),
          reikiLeadsAssigned: parseAmount(row[7]),
          reikiCallsAttempted: parseAmount(row[8]),
          reikiConnected: parseAmount(row[9]),
        };

        const hasData = [
          entry.tarotLeadsAssigned,
          entry.tarotCallsAttempted,
          entry.tarotConnected,
          entry.reikiLeadsAssigned,
          entry.reikiCallsAttempted,
          entry.reikiConnected,
        ].some(v => v > 0);

        if (hasData) entries.push(entry);
      }

      return { tab, entries };
    } catch (e) {
      return { tab, entries: [], error: e.message };
    }
  }));

  return {
    rows: results.flatMap(r => r.entries),
    tabs: results.map(r => ({ tab: r.tab, rows: r.entries.length, error: r.error || null })),
    discoveryMode: discoveredTabs.length ? 'auto' : 'fallback',
  };
}

// --- Count leads in a date range from raw rows --------------------------------
export function countLeadsInRange(rows, dateCol, from, to) {
  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const d = toISO(rows[i][dateCol], true);
    if (d && d >= from && d <= to) count++;
  }
  return count;
}

// --- Marketing (returns raw lead rows so Marketing tab can count any period) --
export async function loadMarketingData() {
  const [spendRows, tarotRows, reikiRows] = await Promise.all([
    fetchCSV(SHEETS.adSpend.id, SHEETS.adSpend.tab),
    fetchCSV(SHEETS.tarot.id,   SHEETS.tarot.tab),
    fetchCSV(SHEETS.reiki.id,   SHEETS.reiki.tab),
  ]);

  const header = spendRows[0] || [];
  let off = header[0]?.toLowerCase().includes('timestamp') ? 1 : 0;
  if (header[off]?.toLowerCase().includes('email')) off += 1;

  const adSpend = spendRows.slice(1).filter(r => r[off]).map(r => ({
    date:     toISO(r[off], true),
    program:  r[off + 1]?.trim(),
    platform: r[off + 2]?.trim(),
    account:  r[off + 3]?.trim(),
    spend:    parseAmount(r[off + 4]),
    leadsAd:  parseInt(r[off + 5]) || 0,
  }));

  // Keep legacy today/mtd counts for backward compat
  const today = todayISO(), ms = monthStartISO();
  const countLeads = (rows, col) => {
    let td = 0, mtd = 0;
    for (let i = 1; i < rows.length; i++) {
      const d = toISO(rows[i][col], true);
      if (!d) continue;
      if (d === today) td++;
      if (d >= ms) mtd++;
    }
    return { today: td, mtd };
  };

  const sheetLeads = {
    Tarot: countLeads(tarotRows, SHEETS.tarot.dateCol),
    Reiki: countLeads(reikiRows, SHEETS.reiki.dateCol),
  };

  const mtdSpend = { Tarot: 0, Reiki: 0 };
  for (const r of adSpend) {
    if (r.date >= ms && r.date <= today && mtdSpend[r.program] !== undefined)
      mtdSpend[r.program] += r.spend;
  }

  // Return raw rows -- Marketing tab uses them for period-based lead counting
  return { adSpend, sheetLeads, mtdSpend, tarotRows, reikiRows };
}

export function getMarketingSample() {
  const today = todayISO();
  return {
    adSpend: [
      { date: today, program: 'Tarot', platform: 'Meta', account: 'FunnelTraffic', spend: 12000, leadsAd: 45 },
      { date: today, program: 'Tarot', platform: 'Meta', account: 'Internal',      spend: 8500,  leadsAd: 30 },
      { date: today, program: 'Reiki', platform: 'Meta', account: 'Internal',      spend: 5200,  leadsAd: 18 },
    ],
    sheetLeads: { Tarot: { today: 38, mtd: 1240 }, Reiki: { today: 16, mtd: 520 } },
    mtdSpend:   { Tarot: 382000, Reiki: 156000 },
    tarotRows: [], reikiRows: [],
  };
}

// --- Transaction data -- reads BOTH tabs and merges ------------------------
// "All New Booking"  -> new enrollment payments (used for Cashflow + Closer commission)
// "All Due Payment"  -> balance/due payments     (used for Cashflow only)
//
// Actual column structure (confirmed from sheet screenshots):
// r[0]=Timestamp | r[1]=Name | r[2]=Email | r[3]=Phone | r[4]=Program
// r[5]=Amount    | r[6]=Paid Through | r[7]=Screenshot | r[8]=Form Submitted By (Closer)
//
// Uses header-based detection so it adapts if columns shift.

function detectTxCols(headerRow) {
  const h = (headerRow || []).map(c => (c || '').toLowerCase().trim());
  const find = (...terms) => { const i = h.findIndex(c => terms.some(t => c.includes(t))); return i >= 0 ? i : -1; };
  return {
    ts:      find('timestamp', 'time stamp'),
    name:    find('student name', 'name'),
    email:   find('student email', 'email'),
    phone:   find('phone', 'mobile', '10 digit'),
    program: find('program'),
    amount:  find('booking amount', 'amount', 'rs.'),
    paid:    find('paid through', 'payment mode', 'paid thro'),
    closer:  find('form submitted by', 'submitted by', 'closed by', 'closer'),
  };
}

function parseTransactionRows(rows, defaultType) {
  if (!rows || rows.length < 2) return [];

  const cols = detectTxCols(rows[0]);

  // Positional fallbacks matching confirmed sheet structure
  if (cols.ts      < 0) cols.ts      = 0;
  if (cols.name    < 0) cols.name    = 1;
  if (cols.email   < 0) cols.email   = 2;
  if (cols.phone   < 0) cols.phone   = 3;
  if (cols.program < 0) cols.program = 4;
  if (cols.amount  < 0) cols.amount  = 5;
  if (cols.paid    < 0) cols.paid    = 6;
  if (cols.closer  < 0) cols.closer  = 8;

  return rows.slice(1)
    .filter(r => r[cols.ts]?.trim())
    .map(r => {
      const raw = r[cols.ts]?.trim() || '';
      // Parse DD/MM/YYYY HH:MM:SS (Google Form timestamp format)
      const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      const date = m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : null;
      return {
        date,
        name:        r[cols.name]?.trim()  || '',
        email:       (r[cols.email]?.trim() || '').toLowerCase(),
        phone:       (r[cols.phone]?.trim() || '').replace(/\D/g,'').slice(-10),
        program:     r[cols.program]?.trim() || '',
        amount:      parseAmount(r[cols.amount]),
        paidThrough: r[cols.paid]?.trim()   || '',
        closer:      r[cols.closer]?.trim() || '',
        type:        defaultType,
      };
    })
    .filter(r => r.date && r.amount > 0);
}

export async function loadTransactionData() {
  const [newRows, dueRows] = await Promise.all([
    fetchCSV(SALES_SHEET.id, 'All New Booking').catch(() => []),
    fetchCSV(SALES_SHEET.id, 'All Due Payment').catch(() => []),
  ]);

  const newTx = parseTransactionRows(newRows, 'New Booking');
  const dueTx = parseTransactionRows(dueRows, 'Due Payment');

  return [...newTx, ...dueTx]
    .sort((a, b) => a.date > b.date ? -1 : 1);
}

// --- Sales --------------------------------------------------------------------
export async function loadSalesData() {
  const rows = await fetchCSV(SALES_SHEET.id, SALES_SHEET.tab);
  return rows.slice(1).filter(r => r[1]?.trim()).map(r => ({
    date:          toISO(r[1], true),
    name:          r[2]?.trim() || '',
    email:         r[3]?.trim()?.toLowerCase() || '',
    phone:         r[4]?.trim()?.replace(/\D/g, '').slice(-10) || '',
    program:       r[5]?.trim() || '',
    bookingAmount: parseAmount(r[6]),
    paidThrough:   r[7]?.trim() || '',
    programFee:    parseAmount(r[8]),
    pymtStatus:    r[9]?.trim() || '',
    amtReceived:   parseAmount(r[10]),
    amtDue:        parseAmount(r[11]),
    closedBy:      r[12]?.trim() || 'Unknown',
  }));
}

// --- Duplicate detection -- FIXED: skip rows with no phone AND no email --------
export function detectDuplicates(enrollments) {
  const byPhone = {}, byEmail = {};

  for (const e of enrollments) {
    // FIX: Old rows (pre-2025) have empty phone AND email -> skip them entirely
    // They were all grouping under byPhone[''] causing false positives
    if (!e.phone && !e.email) continue;

    if (e.phone) {
      if (!byPhone[e.phone]) byPhone[e.phone] = [];
      byPhone[e.phone].push(e);
    }
    if (e.email) {
      if (!byEmail[e.email]) byEmail[e.email] = [];
      byEmail[e.email].push(e);
    }
  }

  const type1 = [], type2 = [];
  const seen1 = new Set(), seen2 = new Set();

  const checkGroup = (entries) => {
    const byProg = {};
    for (const e of entries) {
      const pk = e.program?.toLowerCase() || '';
      if (!byProg[pk]) byProg[pk] = [];
      byProg[pk].push(e);
    }
    // Type 1: same program, same phone/email
    for (const dupes of Object.values(byProg)) {
      if (dupes.length > 1) {
        for (const d of dupes) {
          const uid = `${d.phone}|${d.program}|${d.date}`;
          if (!seen1.has(uid)) { seen1.add(uid); type1.push(d); }
        }
      }
    }
    // Type 2: has both Diploma and Mastery (Tarot bundle upsell)
    const programs = entries.map(e => e.program?.toLowerCase() || '');
    if (programs.some(p => p.includes('diploma')) && programs.some(p => p.includes('mastery'))) {
      for (const e of entries.filter(e => {
        const p = e.program?.toLowerCase() || '';
        return p.includes('diploma') || p.includes('mastery');
      })) {
        const uid = `${e.phone}|${e.program}|${e.date}`;
        if (!seen2.has(uid)) { seen2.add(uid); type2.push(e); }
      }
    }
  };

  for (const entries of Object.values(byPhone)) if (entries.length > 1) checkGroup(entries);
  for (const entries of Object.values(byEmail)) if (entries.length > 1) checkGroup(entries);

  return { type1, type2 };
}

// --- Response EMI reader -- reads directly from SUPER & RGM master sheets ----
// Column structure (confirmed, same across all tabs):
// r[0]=Timestamp | r[1]=Email address (submitter) | r[2]=Name | r[3]=Helper Column
// r[4]=Email (student) | r[5]=Amount Received | r[6]=Amount Received On Date (M/D/YYYY)
// r[7]=Payment Screenshot | r[8]=Received Via | r[9]=Which EMI (0=onboarding)
// r[10]=Next Planned Date (M/D/YYYY HH:MM:SS)

function parseMDY(raw) {
  // Parses M/D/YYYY or M/D/YYYY H:MM:SS into YYYY-MM-DD
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` : null;
}

async function readResponseEMITab(sheetId, tabName, program) {
  try {
    const rows = await fetchCSV(sheetId, tabName);
    if (rows.length < 2) return null;

    const dataRows = rows.slice(1).filter(r => r[4]?.trim() && r[5]?.trim());

    const studentMap = {};
    for (const r of dataRows) {
      const email       = (r[4] || '').toLowerCase().trim();
      const name        = (r[2] || '').trim();
      const amount      = parseAmount(r[5]);
      const receivedDate = parseMDY(r[6]);
      const emiNum      = parseInt(r[9]) || 0;
      const nextDate    = parseMDY(r[10]);

      if (amount <= 0) continue;
      const key = email || name;
      if (!key) continue;

      if (!studentMap[key]) studentMap[key] = { name, email, received: 0, payments: [] };
      studentMap[key].received += amount;
      studentMap[key].payments.push({ amount, date: receivedDate, emiNum, nextDate });
    }

    const studentList = Object.values(studentMap).map(s => {
      // Most recent payment = latest receivedDate
      const sorted = [...s.payments].sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);
      const latest = sorted[0] || {};
      return {
        ...s,
        latestEmiNum: latest.emiNum ?? 0,
        latestDate:   latest.date   || null,
        nextDueDate:  latest.nextDate || null,
      };
    });

    return {
      batch:       tabName,
      program,
      students:    studentList.length,
      received:    studentList.reduce((t, s) => t + s.received, 0),
      studentList,
    };
  } catch (_) {
    return null;
  }
}

export async function loadAllBatchData() {
  const results = await Promise.all([
    ...SUPER_EMI.tabs.map(tab => readResponseEMITab(SUPER_EMI.id, tab, 'SUPER')),
    ...RGM_EMI.tabs.map(tab => readResponseEMITab(RGM_EMI.id,   tab, 'RGM')),
  ]);
  return results.filter(Boolean);
}

// --- Lead attribution lookup (Tarot + Reiki leads sheets) --------------------
// Tarot: LeadsMasterSheet cols: Email(0) Phone(1) ... AdSource(13) Campaign(14) AdGroup(15) AdName(16)
// Reiki: Free_Leads + Paid_Leads same column order
export async function loadLeadAttributionData() {
  const [tarotRows, reikiFreeRows, reikiPaidRows] = await Promise.all([
    fetchCSV(SHEETS.tarot.id, 'LeadsMasterSheet').catch(() => []),
    fetchCSV(SHEETS.reiki.id, 'Free_Leads').catch(() => []),
    fetchCSV(SHEETS.reiki.id, 'Paid_Leads').catch(() => []),
  ]);

  function buildMap(rows) {
    const byEmail = {}, byPhone = {};
    for (const r of rows.slice(1)) {
      const email = (r[0] || '').toLowerCase().trim();
      const phone = (r[1] || '').replace(/\D/g, '').slice(-10);
      const attr  = {
        source:   (r[13] || '').trim(),
        campaign: (r[14] || '').trim(),
        adGroup:  (r[15] || '').trim(),
        adName:   (r[16] || '').trim(),
      };
      if (email && !byEmail[email]) byEmail[email] = attr;
      if (phone && phone.length >= 10 && !byPhone[phone]) byPhone[phone] = attr;
    }
    return { byEmail, byPhone };
  }

  const tarotMap = buildMap(tarotRows);
  const reikiMap = buildMap([...reikiFreeRows, ...reikiPaidRows]);

  // Combined: Tarot first, Reiki fills gaps
  const combined = {
    byEmail: { ...reikiMap.byEmail, ...tarotMap.byEmail },
    byPhone: { ...reikiMap.byPhone, ...tarotMap.byPhone },
  };

  return { tarotMap, reikiMap, combined };
}

// --- Finance ------------------------------------------------------------------
export async function loadFinanceData() {
  const res = await fetch(FINANCE_URL);
  if (!res.ok) throw new Error(`Finance API ${res.status}`);
  const data = await res.json();
  return data.map(row => ({
    month:         row.Month                   || '',
    studentFees:   parseAmount(row.Student_Fees),
    adGoogle:      parseAmount(row.Ad_Google),
    adMeta:        parseAmount(row.Ad_Meta),
    tools:         parseAmount(row.Tools),
    salary:        parseAmount(row.Salary),
    otherPayments: parseAmount(row.Other_Payments),
    gstPaid:       parseAmount(row.GST_Paid),
    tdsPaid:       parseAmount(row.TDS_Paid),
    cashWithdraw:  parseAmount(row.Cash_Withdraw),
  }));
}

export function getFinanceSample() {
  return [
    { month:'Dec-25', studentFees:2656519, adGoogle:226000, adMeta:1032434, tools:100428, salary:477018, otherPayments:758877, gstPaid:0,      tdsPaid:0,      cashWithdraw:0      },
    { month:'Jan-26', studentFees:2673356, adGoogle:168948, adMeta:1055143, tools:66513,  salary:550192, otherPayments:488073, gstPaid:16172,  tdsPaid:0,      cashWithdraw:0      },
    { month:'Feb-26', studentFees:1182367, adGoogle:110000, adMeta:803559,  tools:53847,  salary:594038, otherPayments:493572, gstPaid:547873, tdsPaid:0,      cashWithdraw:150000 },
    { month:'Mar-26', studentFees:3059621, adGoogle:205000, adMeta:1076894, tools:105571, salary:527204, otherPayments:535593, gstPaid:84000,  tdsPaid:485086, cashWithdraw:370000 },
    { month:'Apr-26', studentFees:3611839, adGoogle:200000, adMeta:1069873, tools:59611,  salary:442667, otherPayments:502671, gstPaid:319509, tdsPaid:67556,  cashWithdraw:0      },
  ];
}

// --- EMI ----------------------------------------------------------------------
export async function loadEMIData() {
  const res = await fetch(EMI_URL);
  if (!res.ok) throw new Error(`EMI API ${res.status}`);
  return await res.json();
}

export function getEMISample() {
  const past = n => new Date(Date.now()-n*86400000).toISOString().slice(0,10);
  return {
    students: [],
    v2: [
      { batch:'Aug-2025', program:'SUPER', name:'Priya Sharma',  phone:'9819906697', email:'priya@gmail.com',   totalPlanned:247500, totalActual:172500, emiDue:75000,  timestamp:past(200) },
      { batch:'Aug-2025', program:'RGM',   name:'Pallavi Handa', phone:'9736183799', email:'pallavi@gmail.com', totalPlanned:120000, totalActual:120000, emiDue:0,      timestamp:past(190) },
    ],
  };
}

// --- LTV & Funnel data --------------------------------------------------------
export async function loadLTVFunnelData() {
  const [tarotRows, reikiRows, salesRows, spendRows, emiResp] = await Promise.all([
    fetchCSV(SHEETS.tarot.id,   SHEETS.tarot.tab),
    fetchCSV(SHEETS.reiki.id,   SHEETS.reiki.tab),
    fetchCSV(SALES_SHEET.id,    SALES_SHEET.tab),
    fetchCSV(SHEETS.adSpend.id, SHEETS.adSpend.tab),
    fetch(EMI_URL).then(r => r.json()).catch(() => ({ v2: [], students: [] })),
  ]);

  const leadCounts = {
    Tarot: Math.max(0, tarotRows.length - 1),
    Reiki: Math.max(0, reikiRows.length - 1),
  };

  const sales = salesRows.slice(1).filter(r => r[1]?.trim()).map(r => ({
    date:        toISO(r[1], true),
    name:        r[2]?.trim() || '',
    email:       r[3]?.toLowerCase().trim() || '',
    phone:       r[4]?.replace(/\D/g,'').slice(-10) || '',
    program:     r[5]?.trim() || '',
    programFee:  parseAmount(r[8]),
    amtReceived: parseAmount(r[10]),
  }));

  const hdr = spendRows[0] || [];
  let off = hdr[0]?.toLowerCase().includes('timestamp') ? 1 : 0;
  if (hdr[off]?.toLowerCase().includes('email')) off += 1;
  const adSpend = spendRows.slice(1).filter(r => r[off]).map(r => ({
    date:    toISO(r[off], true),
    program: r[off + 1]?.trim(),
    spend:   parseAmount(r[off + 4]),
  }));

  return {
    leadCounts, sales, adSpend,
    emiV2: emiResp.v2       || [],
    emiV1: emiResp.students || [],
  };
}
