import { useState, useEffect, useCallback } from 'react';
import { PROGRAMS } from './config.js';
import { loadMarketingData, getMarketingSample } from './utils/sheets.js';
import { todayISO, monthStartISO, fmtDisplay } from './utils/dates.js';
import { inr, num } from './utils/format.js';
import Header from './components/Header.jsx';
import SummaryStrip from './components/SummaryStrip.jsx';
import ProgramCard from './components/ProgramCard.jsx';
import SpendTable from './components/SpendTable.jsx';

export default function App() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo]       = useState(false);
  const [updated, setUpdated] = useState(null);
  const [selDate, setSelDate] = useState(todayISO());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadMarketingData();
      setData(result);
      setDemo(false);
    } catch (err) {
      console.warn('Falling back to sample data:', err.message);
      setData(getMarketingSample());
      setDemo(true);
    } finally {
      setLoading(false);
      setUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
        Loading MySoul data...
      </div>
    );
  }

  const { adSpend, sheetLeads, mtdSpend } = data;
  const todayRows = adSpend.filter(r => r.date === selDate);
  const ms = monthStartISO();

  const byProg = {};
  for (const p of PROGRAMS) {
    const rows     = todayRows.filter(r => r.program === p.key);
    const spend    = rows.reduce((s, r) => s + r.spend, 0);
    const leadsAd  = rows.reduce((s, r) => s + r.leadsAd, 0);
    const lSheet   = sheetLeads[p.key]?.today || 0;
    const lMtd     = sheetLeads[p.key]?.mtd   || 0;
    const spendMtd = mtdSpend[p.key] || 0;
    const cpl      = lSheet > 0 ? Math.round(spend / lSheet) : null;
    const mtdCpl   = lMtd   > 0 ? Math.round(spendMtd / lMtd) : null;
    const gap      = leadsAd - lSheet;
    const gapPct   = leadsAd > 0 ? Math.round((gap / leadsAd) * 100) : 0;
    byProg[p.key]  = { spend, leadsAd, lSheet, lMtd, cpl, mtdCpl, gap, gapPct, spendMtd };
  }

  const totSpend   = todayRows.reduce((s, r) => s + r.spend, 0);
  const totLeads   = PROGRAMS.reduce((s, p) => s + byProg[p.key].lSheet, 0);
  const blendedCpl = totLeads > 0 ? Math.round(totSpend / totLeads) : null;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header
        demo={demo}
        updated={updated}
        selDate={selDate}
        onDateChange={setSelDate}
        onRefresh={load}
      />
      <SummaryStrip totSpend={totSpend} totLeads={totLeads} blendedCpl={blendedCpl} />
      <div style={{ padding: '0 24px 32px' }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>
          Program performance — {fmtDisplay(selDate)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          {PROGRAMS.map(p => (
            <ProgramCard key={p.key} program={p} data={byProg[p.key]} />
          ))}
        </div>
        <SpendTable rows={todayRows} selDate={selDate} />
        {demo && (
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text3)' }}>
            Showing sample data. Share all 4 sheets as "Anyone with link → Viewer" to see live data.
          </div>
        )}
      </div>
    </div>
  );
}
