import { useState, useEffect, useCallback } from 'react';
import { loadFinanceData, getFinanceSample } from '../utils/sheets.js';
import { applyGST } from '../config.js';
import { inr } from '../utils/format.js';

function netProfit(row, gstMode) {
  const rev = applyGST(row.studentFees, gstMode);
  return rev - row.adGoogle - row.adMeta - row.tools - row.salary - row.otherPayments - row.gstPaid - row.tdsPaid;
}

function totalAdSpend(row) {
  return row.adGoogle + row.adMeta;
}

const th = { padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)' };
const thL = { ...th, textAlign: 'left' };
const td = (align = 'right') => ({ padding: '10px 14px', borderBottom: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 13, textAlign: align });
const tdBold = (color) => ({ ...td(), color: color || 'var(--text)', fontWeight: 600 });

function ProfitBar({ value, max }) {
  const isPos = value >= 0;
  const pct = max > 0 ? Math.min(Math.abs(value) / max * 100, 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3 }}>
        <div style={{ height: 6, width: `${pct}%`, background: isPos ? 'var(--success)' : 'var(--danger)', borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: isPos ? 'var(--success)' : 'var(--danger)', minWidth: 90, textAlign: 'right' }}>
        {inr(Math.round(value))}
      </span>
    </div>
  );
}

export default function Finance() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo]       = useState(false);
  const [updated, setUpdated] = useState(null);
  const [gstMode, setGstMode] = useState('excl');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await loadFinanceData());
      setDemo(false);
    } catch (e) {
      console.warn('Finance demo:', e.message);
      setRows(getFinanceSample());
      setDemo(true);
    } finally {
      setLoading(false);
      setUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: '3rem', color: 'var(--text3)', textAlign: 'center' }}>Loading finance data...</div>;

  const sorted  = [...rows].reverse(); // newest first
  const latest  = sorted[0];
  const maxProfit = Math.max(...rows.map(r => Math.abs(netProfit(r, gstMode))));

  const sectionTitle = (t) => (
    <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{t}</div>
  );

  const tableWrap = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 28 };

  return (
    <div>
      {/* Sub-header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: demo ? 'var(--warning)' : 'var(--success)' }}>
            {demo ? '⚠ Sample data' : '● Live'}
            {updated && <span style={{ color: 'var(--text3)', marginLeft: 8 }}>· {updated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
          </span>
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {['excl', 'incl'].map(mode => (
              <button key={mode} onClick={() => setGstMode(mode)} style={{
                border: 'none', borderRadius: 0,
                background: gstMode === mode ? 'var(--tarot)' : 'transparent',
                color: gstMode === mode ? '#fff' : 'var(--text3)',
                padding: '4px 12px', fontSize: 12, fontWeight: 500,
              }}>
                {mode === 'excl' ? 'Ex GST' : 'Inc GST'}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Revenue toggle only · Expenses are actual payments</span>
        </div>
        <button onClick={load}>↻ Refresh</button>
      </div>

      {/* Latest month summary strip */}
      {latest && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--border)', marginBottom: 24 }}>
          {[
            { label: `Revenue (${latest.month})`, value: inr(Math.round(applyGST(latest.studentFees, gstMode))), color: 'var(--success)' },
            { label: 'Total ad spend',             value: inr(totalAdSpend(latest)),                              color: 'var(--warning)' },
            { label: 'Salary',                     value: inr(latest.salary),                                     color: null },
            { label: 'Net profit',                 value: inr(Math.round(netProfit(latest, gstMode))),            color: netProfit(latest, gstMode) >= 0 ? 'var(--success)' : 'var(--danger)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--surface)', padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: color || 'var(--text)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '0 24px 32px' }}>

        {/* Net profit trend */}
        {sectionTitle('Net profit by month')}
        <div style={{ ...tableWrap, padding: '16px 20px' }}>
          {sorted.map(row => (
            <div key={row.month} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{row.month}</div>
              <ProfitBar value={netProfit(row, gstMode)} max={maxProfit} />
            </div>
          ))}
        </div>

        {/* Monthly breakdown table */}
        {sectionTitle('Monthly breakdown')}
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Month', 'Revenue', 'Ad Google', 'Ad Meta', 'Tools', 'Salary', 'Other', 'GST Paid', 'TDS Paid', 'Net Profit'].map((h, i) => (
                  <th key={h} style={i === 0 ? thL : th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => {
                const np = netProfit(row, gstMode);
                return (
                  <tr key={row.month} style={{ borderBottom: '1px solid var(--border2)' }}>
                    <td style={{ ...td('left'), color: 'var(--text)', fontWeight: 500 }}>{row.month}</td>
                    <td style={td()}>{inr(Math.round(applyGST(row.studentFees, gstMode)))}</td>
                    <td style={td()}>{inr(row.adGoogle)}</td>
                    <td style={td()}>{inr(row.adMeta)}</td>
                    <td style={td()}>{inr(row.tools)}</td>
                    <td style={td()}>{inr(row.salary)}</td>
                    <td style={td()}>{inr(row.otherPayments)}</td>
                    <td style={td()}>{row.gstPaid > 0 ? inr(row.gstPaid) : '—'}</td>
                    <td style={td()}>{row.tdsPaid > 0 ? inr(row.tdsPaid) : '—'}</td>
                    <td style={{ ...td(), color: np >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                      {inr(Math.round(np))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Cash withdraw note */}
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: -16 }}>
          Note: Net Profit = Revenue − Ad Spend − Tools − Salary − Other − GST Paid − TDS Paid. Cash withdrawals not deducted.
          {demo && ' Showing sample data — Apps Script must be deployed with "Anyone" access.'}
        </div>

      </div>
    </div>
  );
}
