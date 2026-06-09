import { toISO, todayISO, monthStartISO } from './dates.js';
import { SHEETS } from '../config.js';

function parseCSV(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cols = [];
    let inQ = false, cur = '';
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

async function fetchCSV(sheetId, tab) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${tab}`);
  return parseCSV(await res.text());
}

export async function loadMarketingData() {
  const [spendRows, tarotRows, reikiRows, pcosRows] = await Promise.all([
    fetchCSV(SHEETS.adSpend.id, SHEETS.adSpend.tab),
    fetchCSV(SHEETS.tarot.id, SHEETS.tarot.tab),
    fetchCSV(SHEETS.reiki.id, SHEETS.reiki.tab),
    fetchCSV(SHEETS.pcos.id, SHEETS.pcos.tab),
  ]);

  // Detect offset: skip Timestamp col if present, then skip Email col if present
  const header = spendRows[0] || [];
  let off = header[0]?.toLowerCase().includes('timestamp') ? 1 : 0;
  if (header[off]?.toLowerCase().includes('email')) off += 1;
  // Columns from off: Date | Program | Platform | Account | Spend | Leads

  const adSpend = spendRows.slice(1)
    .filter(r => r[off])
    .map(r => ({
      date:     toISO(r[off], true),         // forceDDMM — Indian DD/MM/YYYY
      program:  r[off + 1]?.trim(),
      platform: r[off + 2]?.trim(),          // Platform before Account
      account:  r[off + 3]?.trim(),
      spend:    parseFloat(String(r[off + 4] || '').replace(/[₹,\s]/g, '')) || 0,
      leadsAd:  parseInt(r[off + 5]) || 0,
    }));

  const today = todayISO();
  const ms    = monthStartISO();

  // forceDDMM = true — all 3 lead sheets are Indian DD/MM/YYYY
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

  return { adSpend, sheetLeads, mtdSpend };
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
    sheetLeads: {
      Tarot: { today: 38,  mtd: 1240 },
      Reiki: { today: 16,  mtd: 520  },
      PCOS:  { today: 43,  mtd: 1380 },
    },
    mtdSpend: { Tarot: 382000, Reiki: 156000, PCOS: 418000 },
  };
}
