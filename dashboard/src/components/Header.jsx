import { fmtDisplay } from '../utils/dates.js';

export default function Header({ demo, updated, selDate, onDateChange, onRefresh }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 24px', borderBottom: '1px solid var(--border)',
      background: 'var(--surface2)',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
            MySoul <span style={{ color: 'var(--tarot)' }}>Marketing</span>
          </span>
          {demo
            ? <span style={{ fontSize: 11, background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>Sample data</span>
            : <span style={{ fontSize: 11, background: 'rgba(16,185,129,0.15)', color: 'var(--success)', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>● Live</span>
          }
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
          {updated ? `Updated ${updated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Loading...'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="date" value={selDate} onChange={e => onDateChange(e.target.value)} />
        <button onClick={onRefresh}>↻ Refresh</button>
      </div>
    </div>
  );
}
