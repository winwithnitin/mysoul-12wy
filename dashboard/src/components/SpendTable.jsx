import { inr, num } from '../utils/format.js';
import { fmtDisplay } from '../utils/dates.js';
import { PROGRAMS } from '../config.js';

export default function SpendTable({ rows, selDate }) {
  const progColorMap = Object.fromEntries(PROGRAMS.map(p => [p.key, p.color]));

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        Spend breakdown — {fmtDisplay(selDate)}
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Program', 'Account', 'Platform', 'Spend', 'Ad leads'].map(h => (
                <th key={h} style={{
                  padding: '10px 16px', textAlign: 'left',
                  fontSize: 11, fontWeight: 500, color: 'var(--text3)',
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                  No spend data for {fmtDisplay(selDate)}. Ask Siddhi to submit the daily form.
                </td>
              </tr>
            ) : rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border2)' }}>
                <td style={{ padding: '10px 16px', fontWeight: 600, color: progColorMap[r.program] || 'var(--text)' }}>
                  {r.program}
                </td>
                <td style={{ padding: '10px 16px', color: 'var(--text2)' }}>{r.account}</td>
                <td style={{ padding: '10px 16px', color: 'var(--text2)' }}>{r.platform}</td>
                <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text)' }}>{inr(r.spend)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--text2)' }}>{num(r.leadsAd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
