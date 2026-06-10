import { toISO, todayISO, monthStartISO } from './dates.js';
import { SHEETS, SALES_SHEET, FINANCE_URL, EMI_URL } from '../config.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────
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

// ─── Marketing (returns raw lead rows for attribution reuse) ──────────────────
export async function loadMarketingData() {
  const [spendRows, tarotRows, reikiRows, pcosRows] = await Promise.all([
    fetchCSV(SHEETS.adSpend.id, SHEETS.adSpend.tab),
    fetchCSV(SHEETS.tarot.id,   SHEETS.tarot.tab),
    fetchCSV(SHEETS.reiki.id,   SHEETS.reiki.tab),
    fetchCSV(SHEETS.pcos.id,    SHEETS.pcos.tab),
  ]);

  // Ad spend parsing
  const header = spendRows[0] || [];
  let off = header[0]?.toLowerCase().includes('timestamp') ? 1 : 0;
  if (header[off]?.toLowerCase().includes('email')) off += 1;

  const adSpend = spendRows.slice(1).filter(r => r[off]).map(r => ({
    date:     toISO(r[off], true),
    program:  r[off + 1]?.trim(),
    platform: r[off + 2]?.trim(),
    account:  r[off + 3]?.trim(),
    spend:    parseFloat(String(r[off + 4] || '').replace(/[₹,\s]/g, '')) || 0,
    leadsAd:  parseInt(r[off + 5]) || 0,
  }));

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
    PCOS:  countLeads(pcosRows,  SHEETS.pcos.dateCol),
  };

  const mtdSpend = { Tarot: 0, Reiki: 0, PCOS: 0 };
  for (const r of adSpend) {
    if (r.date >= ms && r.date <= today && mtdSpend[r.program] !== undefined)
      mtdSpend[r.program] += r.spend;
  }

  // Return raw rows too — reused by Attribution (zero extra fetches)
  return { adSpend, sheetLeads, mtdSpend, tarotRows, reikiRows, pcosRows };
}

export function getMarketingSample() {
  const today = todayISO();
  return {
    adSpend: [
      { date: today, program: 'Tarot', platform: 'Meta', account: 'FunnelTraffic', spend: 12000, leadsAd: 45 },
      { date: today, program: 'Tarot', platform: 'Meta', account: 'Internal',      spend: 8500,  leadsAd: 30 },
      { date: today, program: 'Reiki', platform: 'Meta', account: 'Internal',      spend: 5200,  leadsAd: 18 },
      { date: today, program: 'PCOS',  platform: 'Meta', account: 'FunnelTraffic', spend: 9800,  leadsAd: 35 },
      { date: today, program: 'PCOS',  platform: 'Meta', account: 'Internal',      spend: 4200,  leadsAd: 15 },
    ],
    sheetLeads: { Tarot: { today: 38, mtd: 1240 }, Reiki: { today: 16, mtd: 520 }, PCOS: { today: 43, mtd: 1380 } },
    mtdSpend:   { Tarot: 382000, Reiki: 156000, PCOS: 418000 },
    tarotRows: [], reikiRows: [], pcosRows: [],
  };
}

// ─── Sales ────────────────────────────────────────────────────────────────────
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

export function detectDuplicates(enrollments) {
  const byPhone = {}, byEmail = {};
  for (const e of enrollments) {
    if (e.phone) { if (!byPhone[e.phone]) byPhone[e.phone] = []; byPhone[e.phone].push(e); }
    if (e.email) { if (!byEmail[e.email]) byEmail[e.email] = []; byEmail[e.email].push(e); }
  }
  const type1 = [], type2 = [], seen1 = new Set(), seen2 = new Set();
  const checkGroup = (entries) => {
    const byProg = {};
    for (const e of entries) {
      const pk = e.program?.toLowerCase();
      if (!byProg[pk]) byProg[pk] = [];
      byProg[pk].push(e);
    }
    for (const dupes of Object.values(byProg)) {
      if (dupes.length > 1) {
        for (const d of dupes) {
          const uid = `${d.phone}|${d.program}|${d.date}`;
          if (!seen1.has(uid)) { seen1.add(uid); type1.push(d); }
        }
      }
    }
    const programs = entries.map(e => e.program?.toLowerCase() || '');
    const hasDiploma = programs.some(p => p.includes('diploma'));
    const hasMastery = programs.some(p => p.includes('mastery'));
    if (hasDiploma && hasMastery) {
      for (const e of entries.filter(e => e.program?.toLowerCase().includes('diploma') || e.program?.toLowerCase().includes('mastery'))) {
        const uid = `${e.phone}|${e.program}|${e.date}`;
        if (!seen2.has(uid)) { seen2.add(uid); type2.push(e); }
      }
    }
  };
  for (const entries of Object.values(byPhone)) if (entries.length > 1) checkGroup(entries);
  for (const entries of Object.values(byEmail)) if (entries.length > 1) checkGroup(entries);
  return { type1, type2 };
}

// ─── Finance ──────────────────────────────────────────────────────────────────
export async function loadFinanceData() {
  const res = await fetch(FINANCE_URL);
  if (!res.ok) throw new Error(`Finance API ${res.status}`);
  const data = await res.json();
  return data.map(row => ({
    month:         row.Month                      || '',
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

// ─── EMI ──────────────────────────────────────────────────────────────────────
export async function loadEMIData() {
  const res = await fetch(EMI_URL);
  if (!res.ok) throw new Error(`EMI API ${res.status}`);
  return await res.json();
}

export function getEMISample() {
  const today = new Date();
  const fmt   = (d) => d.toISOString().slice(0, 10);
  const past  = (n) => fmt(new Date(today.getTime() - n * 86400000));
  const future = (n) => fmt(new Date(today.getTime() + n * 86400000));
  return {
    students: [],
    v2: [
      { batch:'Dec-25', program:'SUPER', name:'Priya Sharma',  phone:'9819906697', email:'priya@gmail.com', programFee:250000, totalPlanned:247500, totalActual:172500, emiDue:75000, paymentPlan:10, timestamp: past(90) },
      { batch:'Dec-25', program:'SUPER', name:'Shivi Gupta',   phone:'9991289434', email:'shivi@gmail.com', programFee:250000, totalPlanned:255000, totalActual:82500,  emiDue:172500, paymentPlan:10, timestamp: past(85) },
      { batch:'Dec-25', program:'RGM',   name:'Pallavi Handa', phone:'9736183799', email:'pallavi@gmail.com', programFee:120000, totalPlanned:247500, totalActual:247500, emiDue:0, paymentPlan:0, timestamp: past(80) },
    ],
  };
}

// ─── LTV & Funnel data ────────────────────────────────────────────────────────
export async function loadLTVFunnelData() {
  const [tarotRows, reikiRows, pcosRows, salesRows, emiResp] = await Promise.all([
    fetchCSV(SHEETS.tarot.id, SHEETS.tarot.tab),
    fetchCSV(SHEETS.reiki.id, SHEETS.reiki.tab),
    fetchCSV(SHEETS.pcos.id,  SHEETS.pcos.tab),
    fetchCSV(SALES_SHEET.id,  SALES_SHEET.tab),
    fetch(EMI_URL).then(r => r.json()).catch(() => ({ v2: [] })),
  ]);

  // All-time lead counts (row 0 = header)
  const leadCounts = {
    Tarot: Math.max(0, tarotRows.length - 1),
    Reiki: Math.max(0, reikiRows.length - 1),
    PCOS:  Math.max(0, pcosRows.length  - 1),
  };

  // Sales enrollments
  const sales = salesRows.slice(1).filter(r => r[1]?.trim()).map(r => ({
    date:       toISO(r[1], true),
    name:       r[2]?.trim() || '',
    email:      r[3]?.toLowerCase().trim() || '',
    phone:      r[4]?.replace(/\D/g,'').slice(-10) || '',
    program:    r[5]?.trim() || '',
    programFee: parseFloat(r[8]) || 0,
  }));

  return { leadCounts, sales, emiV2: emiResp.v2 || [] };
}
