const BATCH_REGISTRY_ID = '1b3IZYUmRlG9nHp27b3i1ObxfUIV1Zq9jmzNtnN_iyYg';
const BATCH_REGISTRY_TAB = 'Batches';

function doGet() {
  try {
    const batches = getActiveBatches_();
    const v2 = [];

    batches.forEach(batch => {
      v2.push.apply(v2, readBatchStudents_(batch));
    });

    return json_({ students: [], v2, batches: batches.length, ok: true });
  } catch (err) {
    return json_({ students: [], v2: [], batches: 0, ok: false, error: String(err && err.message || err) });
  }
}

function getActiveBatches_() {
  const sheet = SpreadsheetApp.openById(BATCH_REGISTRY_ID).getSheetByName(BATCH_REGISTRY_TAB);
  if (!sheet) throw new Error('Batch Registry tab not found: ' + BATCH_REGISTRY_TAB);

  const values = sheet.getDataRange().getValues();
  const header = values[0].map(h => String(h || '').toLowerCase().trim());
  const cols = {
    batch: findCol_(header, ['batch_name', 'batch name'], 0),
    program: findCol_(header, ['program'], 1),
    sheet: findCol_(header, ['sheet_id', 'sheet id'], 2),
    active: findCol_(header, ['active'], 3),
    tmrDate: findCol_(header, ['tmr date', 'tmr_date'], 4),
    rmeDate: findCol_(header, ['rme date', 'rme_date'], 5),
  };

  return values.slice(1).map(row => ({
    batchName: String(row[cols.batch] || '').trim(),
    program: String(row[cols.program] || '').trim().toUpperCase(),
    sheetId: String(row[cols.sheet] || '').trim(),
    active: String(row[cols.active] || '').trim().toUpperCase(),
    tmrDate: parseDate_(row[cols.tmrDate]) || '',
    rmeDate: parseDate_(row[cols.rmeDate]) || '',
  })).filter(b => b.active === 'Y' && b.batchName && b.sheetId && ['SUPER', 'RGM'].indexOf(b.program) >= 0);
}

function readBatchStudents_(batch) {
  const ss = SpreadsheetApp.openById(batch.sheetId);
  const dashboard = ss.getSheetByName('EMI Dashboard');
  const respEmi = ss.getSheetByName('Resp EMI');
  if (!dashboard) return [];

  const dashboardRows = dashboard.getRange(1, 1, dashboard.getLastRow(), 12).getDisplayValues();
  const paymentRows = respEmi ? respEmi.getDataRange().getDisplayValues() : [];
  const paymentsLoaded = paymentRows.length > 1;
  const paymentMap = buildPaymentMap_(paymentRows);
  const batchISO = parseBatchStart_(batch.batchName);

  return dashboardRows.slice(7).filter(row => row[1] || row[2] || row[3]).map(row => {
    const email = cleanEmail_(row[2]);
    const phone = cleanPhone_(row[3]);
    const key = matchKey_(email, phone, row[1]);
    const payments = (paymentMap[key] || []).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const latest = payments[0] || {};

    return {
      batch: batch.batchName,
      program: batch.program,
      name: String(row[1] || '').trim(),
      phone,
      email,
      timestamp: parseBatchTimestamp_(row[0], batchISO),
      enrollmentTimestamp: String(row[0] || '').trim(),
      programFee: amount_(row[5]),
      appnFee: amount_(row[6]),
      totalOldPayment: amount_(row[7]),
      totalPlanned: amount_(row[8]),
      totalActual: amount_(row[9]),
      emiDue: amount_(row[10]),
      paymentPlan: parseInt(row[11], 10) || 0,
      payments,
      paymentsLoaded,
      latestEmiNum: latest.emiNum == null ? null : latest.emiNum,
      latestDate: latest.date || null,
      nextDueDate: latest.nextDate || null,
      sourceSheetId: batch.sheetId,
      tmrDate: batch.tmrDate || '',
      rmeDate: batch.rmeDate || '',
      launchEventDate: batch.program === 'SUPER' ? batch.tmrDate || '' : batch.rmeDate || '',
    };
  });
}

function buildPaymentMap_(rows) {
  const map = {};
  rows.slice(1).forEach(row => {
    const amount = amount_(row[5]);
    if (!amount) return;

    const email = cleanEmail_(row[4]) || cleanHelperEmail_(row[3]);
    const key = matchKey_(email, '', row[2]);
    if (!key) return;

    if (!map[key]) map[key] = [];
    map[key].push({
      amount,
      date: parseDate_(row[6]),
      emiNum: parseInt(row[9], 10) || 0,
      nextDate: parseDate_(row[10]),
      receivedVia: String(row[8] || '').trim(),
    });
  });
  return map;
}

function findCol_(header, terms, fallback) {
  const idx = header.findIndex(h => terms.some(t => h.indexOf(t) >= 0));
  return idx >= 0 ? idx : fallback;
}

function amount_(raw) {
  const n = Number(String(raw || '').replace(/[₹,\s]/g, '').replace(/[^\d.-]/g, ''));
  return isFinite(n) ? n : 0;
}

function cleanEmail_(raw) {
  return String(raw || '').toLowerCase().trim();
}

function cleanHelperEmail_(raw) {
  const m = String(raw || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  return m ? m[0] : '';
}

function cleanPhone_(raw) {
  return String(raw || '').replace(/\D/g, '').slice(-10);
}

function matchKey_(email, phone, name) {
  return cleanEmail_(email) || cleanPhone_(phone) || String(name || '').toLowerCase().trim();
}

function parseBatchStart_(raw) {
  const m = String(raw || '').match(/([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = monthNum_(m[1]);
  return month ? m[2] + '-' + month + '-01' : null;
}

function parseBatchTimestamp_(raw, batchISO) {
  const parsed = parseDate_(raw);
  if (parsed) return parsed;
  const m = String(raw || '').trim().match(/^(\d{1,2})\s+([A-Za-z]+)/);
  const month = m ? monthNum_(m[2]) : null;
  return month && batchISO ? batchISO.slice(0, 4) + '-' + month + '-' + String(m[1]).padStart(2, '0') : batchISO;
}

function parseDate_(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  const s = String(raw || '').trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return dmy[3] + '-' + String(dmy[2]).padStart(2, '0') + '-' + String(dmy[1]).padStart(2, '0');
  const googleDate = s.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3,})\s+(\d{1,2})\s+(\d{4})/i);
  if (googleDate) return googleDate[3] + '-' + monthNum_(googleDate[1]) + '-' + String(googleDate[2]).padStart(2, '0');
  const named = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})/);
  if (named) {
    const year = named[3].length === 2 ? '20' + named[3] : named[3];
    return year + '-' + monthNum_(named[2]) + '-' + String(named[1]).padStart(2, '0');
  }
  return null;
}

function monthNum_(raw) {
  const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  return months[String(raw || '').toLowerCase().slice(0, 3)] || '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
