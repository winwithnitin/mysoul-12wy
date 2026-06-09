import { inr, num } from '../utils/format.js';

export default function SummaryStrip({ totSpend, totLeads, blendedCpl }) {
  const items = [
    { label: 'Total spend today', value: inr(totSpend) },
    { label: 'Total leads (sheet)', value: num(totLeads) },
    { label: 'Blended CPL', value: blendedCpl ? inr(blendedCpl) : '—' },
    { label: 'Programs active', value: '3' },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 1, background: 'var(--border)', margin: '0 0 24px',
    }}>
      {items.map(({ label, value }) => (
        <div key={label} style={{ background: 'var(--surface)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}
