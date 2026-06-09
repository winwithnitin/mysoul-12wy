import { useState, useEffect, useCallback } from 'react';
import { FUNNELS, getFunnel, applyGST, GST_RATE, SLACK } from '../config.js';
import { loadSalesData, detectDuplicates } from '../utils/sheets.js';
import { todayISO, monthStartISO, fmtDisplay } from '../utils/dates.js';
import { inr, num } from '../utils/format.js';

const FUNNEL_KEYS = ['Tarot', 'Reiki', 'Other'];
const OTHER_COLOR = 'var(--text2)';

function statColor(status) {
  if (!status) return 'var(--text3)';
  const s = status.toLowerCase();
  if (s.includes('received')) return 'var(--success)';
  if (s.includes('due'))      return 'var(--warning)';
  return 'var(--text2)';
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function FunnelCard({ name, data, gstMode }) {
  const color = FUNNELS[name]?.color || OTHER_COLOR;
  const rev   = applyGST(data.revenue,  gstMode);
  const cash  = applyGST(data.cashflow, gstMode);
  const out   = applyGST(data.outstanding, gstMode);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: `3px solid ${color}`, borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 14 }}>{name}</div>
      {[
        ['Enrollments today', data.today],
        ['MTD enrollments',   data.mtd],
        ['MTD revenue',       inr(Math.round(rev))],
        ['MTD cashflow',      inr(Math.round(cash))],
        ['Outstanding',       inr(Math.round(out))],
        ['Received count',    `${data.receivedCount} / ${data.mtd}`],
      ].map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border2)' }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function DuplicateRow({ item, type }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border2)' }}>
      <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{item.name}</td>
      <td style={{ padding: '8px 12px', color: 'var(--text2)', fontSize: 12 }}>{item.phone}</td>
      <td style={{ padding: '8px 12px', color: 'var(--text2)', fontSize: 12 }}>{item.program}</td>
      <td style={{ padding: '8px 12px', color: 'var(--text2)', fontSize: 12 }}>{item.date}</td>
      <td style={{ padding: '8px 12px' }}>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: type === 1 ? 'rgba(239,68,68,.15)' : 'rgba(245,158,11,.15)', color: type === 1 ? 'var(--danger)' : 'var(--warning)' }}>
          {type === 1 ? 'Duplicate' : 'Diploma+Mastery'}
        </span>
      </td>
    </tr>
  );
}

// ─── Main Sales tab ───────────────────────────────────────────────────────────
export default function Sales() {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [demo, setDemo]               = useState(false);
  const [updated, setUpdated]         = useState(null);
  const [gstMode, setGstMode]         = useState('incl');
  const [slackStatus, setSlackStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEnrollments(await loadSalesData());
      setDemo(false);
    } catch (e) {
      console.warn('Sales demo mode:', e.message);
      setEnrollments([]);
      setDemo(true);
    } finally {
      setLoading(false);
      setUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: '3rem', color: 'var(--text3)', textAlign: 'center' }}>Loading sales data...</div>;

  const today = todayISO();
  const ms    = monthStartISO();

  // ─── Aggregate by funnel ───
  const funnelData = {};
  for (const key of FUNNEL_KEYS) {
    funnelData[key] = { today: 0, mtd: 0, revenue: 0, cashflow: 0, outstanding: 0, receivedCount: 0 };
  }

  const mtdEnrollments = enrollments.filter(e => e.date >= ms && e.date <= today);
  const todayCount     = enrollments.filter(e => e.date === today).length;

  for (const e of mtdEnrollments) {
    const f = getFunnel(e.program);
    const fd = funnelData[f] || funnelData['Other'];
    fd.mtd++;
    fd.revenue     += e.programFee;
    fd.cashflow    += e.amtReceived;
    fd.outstanding += e.amtDue;
    if (e.pymtStatus?.toLowerCase().includes('received')) fd.receivedCount++;
  }
  for (const e of enrollments.filter(e => e.date === today)) {
    const f = getFunnel(e.program);
    const fd = funnelData[f] || funnelData['Other'];
    fd.today++;
  }

  const totRevenue     = applyGST(mtdEnrollments.reduce((s, e) => s + e.programFee,   0), gstMode);
  const totCashflow    = applyGST(mtdEnrollments.reduce((s, e) => s + e.amtReceived,  0), gstMode);
  const totOutstanding = applyGST(mtdEnrollments.reduce((s, e) => s + e.amtDue,       0), gstMode);

  // ─── Program breakdown ─────
  const progMap = {};
  for (const e of mtdEnrollments) {
    if (!progMap[e.program]) progMap[e.program] = { count: 0, revenue: 0, cashflow: 0, outstanding: 0 };
    progMap[e.program].count++;
    progMap[e.program].revenue     += e.programFee;
    progMap[e.program].cashflow    += e.amtReceived;
    progMap[e.program].outstanding += e.amtDue;
  }
  const progRows = Object.entries(progMap).sort((a, b) => b[1].count - a[1].count);

  // ─── Closer performance ────
  const closerMap = {};
  for (const e of mtdEnrollments) {
    const c = e.closedBy || 'Unknown';
    if (!closerMap[c]) closerMap[c] = { count: 0, revenue: 0 };
    closerMap[c].count++;
    closerMap[c].revenue += e.programFee;
  }
  const closerRows = Object.entries(closerMap).sort((a, b) => b[1].count - a[1].count);

  // ─── Duplicates ────────────
  const { type1, type2 } = detectDuplicates(enrollments);
  const totalDupes = type1.length + type2.length;

  // ─── Slack handler ─────────
  const handleSendToSlack = () => {
    const lines = [
      `Hey <@${SLACK.dollyId}>, please review these enrollment issues in the Student Records sheet:`,
      '',
    ];
    if (type1.length > 0) {
      lines.push(`*Type 1 — Exact Duplicates (${type1.length}):*`);
      for (const d of type1) lines.push(`• ${d.name} | ${d.phone} | ${d.program} | ${d.date}`);
      lines.push('');
    }
    if (type2.length > 0) {
      lines.push(`*Type 2 — Diploma + Mastery both enrolled (${type2.length}):*`);
      for (const d of type2) lines.push(`• ${d.name} | ${d.phone} | ${d.program} | ${d.date}`);
    }
    const msg = lines.join('\n');
    navigator.clipboard.writeText(msg).then(() => {
      setSlackStatus('copied');
      setTimeout(() => setSlackStatus(''), 3000);
    });
    window.open('https://app.slack.com/', '_blank');
  };

  const sectionTitle = (title) => (
    <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{title}</div>
  );

  const tableWrap = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 28 };
  const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)' };
  const td = { padding: '9px 12px', borderBottom: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 13 };

  return (
    <div>
      {/* Sub-header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: demo ? 'var(--warning)' : 'var(--success)' }}>
            {demo ? '⚠ No data (share sheet publicly)' : '● Live'}
            {updated && <span style={{ color: 'var(--text3)', marginLeft: 8 }}>· Updated {updated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
          </span>
          {/* GST Toggle */}
          <div style={{ display: 'flex', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {['incl', 'excl'].map(mode => (
              <button key={mode} onClick={() => setGstMode(mode)} style={{
                border: 'none', borderRadius: 0,
                background: gstMode === mode ? 'var(--tarot)' : 'transparent',
                color: gstMode === mode ? '#fff' : 'var(--text3)',
                padding: '4px 12px', fontSize: 12, fontWeight: 500,
              }}>
                {mode === 'incl' ? 'Inc GST' : 'Ex GST'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={load}>↻ Refresh</button>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--border)', marginBottom: 24 }}>
        {[
          { label: 'Enrollments today', value: num(todayCount) },
          { label: `MTD revenue (${gstMode === 'incl' ? 'inc' : 'ex'} GST)`, value: inr(Math.round(totRevenue)) },
          { label: `MTD cashflow (${gstMode === 'incl' ? 'inc' : 'ex'} GST)`, value: inr(Math.round(totCashflow)) },
          { label: 'MTD outstanding', value: inr(Math.round(totOutstanding)) },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--surface)', padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 24px 32px' }}>

        {/* Funnel cards */}
        {sectionTitle('Funnel performance — month to date')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          {FUNNEL_KEYS.map(key => <FunnelCard key={key} name={key} data={funnelData[key]} gstMode={gstMode} />)}
        </div>

        {/* Program breakdown */}
        {sectionTitle('Program breakdown — month to date')}
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>{['Program', 'Funnel', 'Enrollments', 'Revenue', 'Cashflow', 'Outstanding'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {progRows.length === 0
                ? <tr><td colSpan={6} style={{ ...td, textAlign: 'center', padding: '2rem' }}>No enrollments this month yet.</td></tr>
                : progRows.map(([prog, d]) => {
                  const funnel = getFunnel(prog);
                  const fcolor = FUNNELS[funnel]?.color || OTHER_COLOR;
                  return (
                    <tr key={prog} style={{ borderBottom: '1px solid var(--border2)' }}>
                      <td style={{ ...td, color: 'var(--text)', fontWeight: 500 }}>{prog}</td>
                      <td style={{ ...td }}><span style={{ color: fcolor, fontSize: 12 }}>{funnel}</span></td>
                      <td style={td}>{d.count}</td>
                      <td style={td}>{inr(Math.round(applyGST(d.revenue, gstMode)))}</td>
                      <td style={td}>{inr(Math.round(applyGST(d.cashflow, gstMode)))}</td>
                      <td style={{ ...td, color: d.outstanding > 0 ? 'var(--warning)' : 'var(--text3)' }}>
                        {inr(Math.round(applyGST(d.outstanding, gstMode)))}
                      </td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>

        {/* Closer performance */}
        {sectionTitle('Closer performance — month to date')}
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>{['Closer', 'Enrollments', 'Revenue', '% of total'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {closerRows.length === 0
                ? <tr><td colSpan={4} style={{ ...td, textAlign: 'center', padding: '2rem' }}>No data.</td></tr>
                : closerRows.map(([closer, d]) => {
                  const pct = mtdEnrollments.length > 0 ? Math.round((d.count / mtdEnrollments.length) * 100) : 0;
                  return (
                    <tr key={closer} style={{ borderBottom: '1px solid var(--border2)' }}>
                      <td style={{ ...td, color: 'var(--text)', fontWeight: 500 }}>{closer}</td>
                      <td style={td}>{d.count}</td>
                      <td style={td}>{inr(Math.round(applyGST(d.revenue, gstMode)))}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ height: 4, width: 80, background: 'var(--border)', borderRadius: 2 }}>
                            <div style={{ height: 4, width: `${pct}%`, background: 'var(--tarot)', borderRadius: 2 }} />
                          </div>
                          <span>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>

        {/* Duplicate alerts */}
        {sectionTitle(`Duplicate alerts${totalDupes > 0 ? ` — ${totalDupes} issues found` : ''}`)}
        <div style={{ background: 'var(--surface)', border: `1px solid ${totalDupes > 0 ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden', marginBottom: 28 }}>
          {totalDupes === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--success)', fontSize: 13 }}>✓ No duplicates found</div>
          ) : (
            <>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--danger)' }}>{totalDupes} issue{totalDupes > 1 ? 's' : ''} need attention</span>
                <button
                  onClick={handleSendToSlack}
                  style={{ background: slackStatus === 'copied' ? 'var(--success)' : 'var(--tarot)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500 }}
                >
                  {slackStatus === 'copied' ? '✓ Copied — Slack opened' : '📋 Copy & Open Slack for Dolly'}
                </button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>{['Name', 'Phone', 'Program', 'Date', 'Issue'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {type1.map((d, i) => <DuplicateRow key={`t1-${i}`} item={d} type={1} />)}
                  {type2.map((d, i) => <DuplicateRow key={`t2-${i}`} item={d} type={2} />)}
                </tbody>
              </table>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
