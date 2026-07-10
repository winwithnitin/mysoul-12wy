import { toISO, todayISO, monthStartISO } from './dates.js';
import { SHEETS, SALES_SHEET, FINANCE_URL, EMI_URL, BATCH_EMI_URL, SUPER_EMI, RGM_EMI } from '../config.js';

// --- Shared helpers -----------------------------------------------------------
export function parseCSV(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cols = []; let inQ = false, cur = '';
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

export async function fetchCSV(sheetId, tab) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${tab}`);
  return parseCSV(await res.text());
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
    spend:    parseFloat(String(r[off + 4] || '').replace(/[^0-9.]/g, '')) || 0,
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
        amount:      parseFloat(String(r[cols.amount] || '').replace(/[^0-9.]/g, '')) || 0,
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
    bookingAmount: parseFloat(r[6]) || 0,
    paidThrough:   r[7]?.trim() || '',
    programFee:    parseFloat(r[8]) || 0,
    pymtStatus:    r[9]?.trim() || '',
    amtReceived:   parseFloat(r[10]) || 0,
    amtDue:        parseFloat(r[11]) || 0,
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
      const amount      = parseFloat(String(r[5] || '').replace(/[^0-9.]/g, '')) || 0;
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
    studentFees:   parseFloat(row.Student_Fees)   || 0,
    adGoogle:      parseFloat(row.Ad_Google)       || 0,
    adMeta:        parseFloat(row.Ad_Meta)         || 0,
    tools:         parseFloat(row.Tools)           || 0,
    salary:        parseFloat(row.Salary)          || 0,
    otherPayments: parseFloat(row.Other_Payments)  || 0,
    gstPaid:       parseFloat(row.GST_Paid)        || 0,
    tdsPaid:       parseFloat(row.TDS_Paid)        || 0,
    cashWithdraw:  parseFloat(row.Cash_Withdraw)   || 0,
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
    programFee:  parseFloat(r[8])  || 0,
    amtReceived: parseFloat(r[10]) || 0,
  }));

  const hdr = spendRows[0] || [];
  let off = hdr[0]?.toLowerCase().includes('timestamp') ? 1 : 0;
  if (hdr[off]?.toLowerCase().includes('email')) off += 1;
  const adSpend = spendRows.slice(1).filter(r => r[off]).map(r => ({
    date:    toISO(r[off], true),
    program: r[off + 1]?.trim(),
    spend:   parseFloat(String(r[off + 4] || '').replace(/[Rs.,\s]/g, '')) || 0,
  }));

  return {
    leadCounts, sales, adSpend,
    emiV2: emiResp.v2       || [],
    emiV1: emiResp.students || [],
  };
}
