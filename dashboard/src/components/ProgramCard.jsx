import { inr, num, cplColor, gapColor } from '../utils/format.js';

function Row({ label, value, valueStyle }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: '1px solid var(--border2)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', ...valueStyle }}>{value}</span>
    </div>
  );
}

export default function ProgramCard({ program, data }) {
  const { color, cplTarget } = program;
  const { spend, leadsAd, lSheet, lMtd, cpl, mtdCpl, gap, gapPct, spendMtd } = data;

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderTop: `3px solid ${color}`,
      borderRadius: 'var(--radius)',
      padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>{program.key}</span>
        {cpl && (
          <span style={{ fontSize: 12, fontWeight: 600, color: cplColor(cpl, cplTarget) }}>
            {inr(cpl)} CPL
          </span>
        )}
      </div>

      <Row label="Spend" value={inr(spend)} />
      <Row label="Sheet leads" value={num(lSheet)} valueStyle={{ color: lSheet > 0 ? 'var(--success)' : 'var(--text)' }} />
      <Row label="Ad acct leads" value={num(leadsAd)} />
      <Row label="CPL" value={cpl ? inr(cpl) : '—'} valueStyle={{ color: cplColor(cpl, cplTarget) }} />
      <Row label="Target CPL" value={inr(cplTarget)} valueStyle={{ color: 'var(--text3)' }} />

      {leadsAd > 0 && (
        <Row
          label="Tracking gap"
          value={`${gap > 0 ? '+' : ''}${gap} (${gapPct}%)`}
          valueStyle={{ color: gapColor(gapPct) }}
        />
      )}

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          Month to date
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {[
            ['Spend', inr(spendMtd)],
            ['Leads', num(lMtd)],
            ['Avg CPL', mtdCpl ? inr(mtdCpl) : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
