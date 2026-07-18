import { useCallback, useEffect, useMemo, useState } from 'react';
import { WORKSHOP_BENCHMARKS } from '../config.js';
import { loadAdsIntelligenceData } from '../utils/sheets.js';
import { fmtDisplay } from '../utils/dates.js';
import { inr, num } from '../utils/format.js';

const PERIODS = [
  { key: 'last7',  label: 'Last 7 Days',  days: 7 },
  { key: 'last15', label: 'Last 15 Days', days: 15 },
  { key: 'last30', label: 'Last 30 Days', days: 30 },
  { key: 'last90', label: 'Last 90 Days', days: 90 },
];

function isoLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function periodRange(key) {
  const period = PERIODS.find(p => p.key === key) || PERIODS[0];
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - period.days + 1);
  return { ...period, from: isoLocal(from), to: isoLocal(to) };
}

function normalizeProgram(value) {
  const s = String(value || '').toLowerCase();
  if (s.includes('reiki')) return 'Reiki';
  if (s.includes('tarot')) return 'Tarot';
  return value || 'Other';
}

function groupPerformers(rows) {
  const byKey = {};
  for (const row of rows) {
    const program = normalizeProgram(row.program);
    const key = [program, row.campaign, row.adSet, row.adName].join('::');
    if (!byKey[key]) {
      byKey[key] = {
        program,
        campaign: row.campaign || 'Unnamed Campaign',
        adSet: row.adSet || 'Unnamed Ad Set',
        adName: row.adName || 'Unnamed Ad',
        spend: 0,
        leads: 0,
      };
    }
    byKey[key].spend += row.spend || 0;
    byKey[key].leads += row.leads || 0;
  }

  return Object.values(byKey)
    .map(row => ({ ...row, cpl: row.leads > 0 ? Math.round(row.spend / row.leads) : null }))
    .sort((a, b) => {
      if (a.cpl === null && b.cpl === null) return b.spend - a.spend;
      if (a.cpl === null) return 1;
      if (b.cpl === null) return -1;
      return a.cpl - b.cpl;
    });
}

function groupCampaignSpend(rows) {
  const byCampaign = {};
  for (const row of rows) {
    const campaign = row.campaign || 'Unnamed Campaign';
    byCampaign[campaign] = (byCampaign[campaign] || 0) + (row.spend || 0);
  }
  return Object.entries(byCampaign)
    .map(([campaign, spend]) => ({ campaign, spend }))
    .sort((a, b) => b.spend - a.spend);
}

function SummaryCard({ title, program, spend, leads }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderTop:`3px solid ${program === 'Tarot' ? 'var(--tarot)' : 'var(--reiki)'}`, borderRadius:8, padding:'16px 18px' }}>
      <div style={{ fontSize:13, fontWeight:700, color:program === 'Tarot' ? 'var(--tarot)' : 'var(--reiki)', marginBottom:12 }}>{title}</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div>
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>Spend</div>
          <div style={{ fontSize:20, color:'var(--warning)', fontWeight:700 }}>{inr(spend)}</div>
        </div>
        <div>
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>Leads</div>
          <div style={{ fontSize:20, color:'var(--text)', fontWeight:700 }}>{num(leads)}</div>
        </div>
      </div>
    </div>
  );
}

function BudgetSplitChart({ rows }) {
  const total = rows.reduce((s, r) => s + r.spend, 0);
  if (!rows.length || total <= 0) {
    return <div style={{ color:'var(--text3)', fontSize:13, padding:'1rem 0' }}>No spend split available for this period.</div>;
  }

  const topRows = rows.slice(0, 8);
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'16px 18px' }}>
      {topRows.map(row => {
        const pct = total > 0 ? (row.spend / total) * 100 : 0;
        return (
          <div key={row.campaign} style={{ marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:5 }}>
              <div style={{ fontSize:12, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.campaign}</div>
              <div style={{ fontSize:12, color:'var(--text3)', flexShrink:0 }}>{inr(row.spend)} · {pct.toFixed(0)}%</div>
            </div>
            <div style={{ height:8, background:'var(--surface2)', borderRadius:999, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.max(2, pct)}%`, background:'linear-gradient(90deg, var(--tarot), var(--reiki))', borderRadius:999 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdsIntelligence() {
  const [period, setPeriod] = useState('last7');
  const [payload, setPayload] = useState({ rows: [], configured: false });
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPayload(await loadAdsIntelligenceData());
    } catch (e) {
      console.warn('Ads Intelligence:', e.message);
      setPayload({ rows: [], configured: true, error: e.message });
    } finally {
      setLoading(false);
      setUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const range = periodRange(period);
  const filtered = useMemo(() => (
    (payload.rows || []).filter(r => r.date >= range.from && r.date <= range.to)
  ), [payload.rows, range.from, range.to]);

  const summary = useMemo(() => {
    const base = {
      Tarot: { spend: 0, leads: 0 },
      Reiki: { spend: 0, leads: 0 },
    };
    for (const row of filtered) {
      const program = normalizeProgram(row.program);
      if (!base[program]) continue;
      base[program].spend += row.spend || 0;
      base[program].leads += row.leads || 0;
    }
    return base;
  }, [filtered]);

  const performers = useMemo(() => groupPerformers(filtered), [filtered]);
  const campaignSpend = useMemo(() => groupCampaignSpend(filtered), [filtered]);

  const th = { padding:'10px 12px', textAlign:'right', fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, borderBottom:'1px solid var(--border)' };
  const thL = { ...th, textAlign:'left' };
  const td = (align='right') => ({ padding:'10px 12px', borderBottom:'1px solid var(--border2)', color:'var(--text2)', fontSize:13, textAlign:align, verticalAlign:'top' });

  if (loading) return <div style={{ padding:'3rem', color:'var(--text3)', textAlign:'center' }}>Loading Ads Intelligence...</div>;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface2)', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:payload.configured ? 'var(--success)' : 'var(--warning)' }}>
            {payload.configured ? 'Ready' : 'Sheet ID needed'}
            {updated && <span style={{ color:'var(--text3)', marginLeft:8 }}>· {updated.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>}
          </span>
          <div style={{ display:'flex', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                border:'none', borderRadius:0, padding:'5px 11px', fontSize:12, fontWeight:500,
                background: period === p.key ? 'var(--tarot)' : 'transparent',
                color: period === p.key ? '#fff' : 'var(--text3)',
              }}>{p.label}</button>
            ))}
          </div>
        </div>
        <button onClick={load}>Refresh</button>
      </div>

      <div style={{ padding:'18px 24px 34px' }}>
        <div style={{ background:'rgba(245,158,11,0.10)', border:'1px solid rgba(245,158,11,0.28)', color:'var(--warning)', borderRadius:8, padding:'11px 14px', fontSize:13, marginBottom:18 }}>
          Siddhi updates this sheet every Monday by 10am.
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'end', gap:12, marginBottom:12, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:18, color:'var(--text)', fontWeight:700 }}>Ads Intelligence</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>{fmtDisplay(range.from)} - {fmtDisplay(range.to)}</div>
          </div>
          {payload.error && <div style={{ fontSize:12, color:'var(--danger)' }}>Could not read sheet: {payload.error}</div>}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:16, marginBottom:24 }}>
          <SummaryCard title="Tarot Summary" program="Tarot" spend={summary.Tarot.spend} leads={summary.Tarot.leads} />
          <SummaryCard title="Reiki Summary" program="Reiki" spend={summary.Reiki.spend} leads={summary.Reiki.leads} />
        </div>

        {!payload.configured && (
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'22px', color:'var(--text3)', fontSize:13, marginBottom:24 }}>
            No data yet. Add the new Google Sheet ID in config.js under ADS_INTELLIGENCE after Aravind creates "MySoul Ads Intelligence".
          </div>
        )}

        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>
          Top Performers - lowest CPL first
        </div>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', marginBottom:26 }}>
          {performers.length === 0 ? (
            <div style={{ padding:'22px', color:'var(--text3)', fontSize:13 }}>No data yet for this period.</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Rank','Campaign','Ad Set','Ad Name','Spend','Leads','CPL','vs Benchmark'].map((h, i) => (
                    <th key={h} style={i < 4 ? thL : th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {performers.map((row, idx) => {
                  const benchmark = WORKSHOP_BENCHMARKS[row.program]?.cpl || null;
                  const ok = benchmark && row.cpl !== null ? row.cpl <= benchmark : null;
                  return (
                    <tr key={`${row.program}-${row.campaign}-${row.adSet}-${row.adName}`}>
                      <td style={{ ...td('left'), color:'var(--text)', fontWeight:700 }}>{idx + 1}</td>
                      <td style={{ ...td('left'), color:'var(--text)', fontWeight:600 }}>{row.campaign}</td>
                      <td style={td('left')}>{row.adSet}</td>
                      <td style={td('left')}>{row.adName}</td>
                      <td style={{ ...td(), color:'var(--warning)', fontWeight:700 }}>{inr(row.spend)}</td>
                      <td style={td()}>{num(row.leads)}</td>
                      <td style={{ ...td(), color:ok === null ? 'var(--text3)' : ok ? 'var(--success)' : 'var(--danger)', fontWeight:700 }}>{row.cpl === null ? '--' : `Rs. ${num(row.cpl)}`}</td>
                      <td style={{ ...td(), color:ok === null ? 'var(--text3)' : ok ? 'var(--success)' : 'var(--danger)', fontWeight:700 }}>
                        {benchmark ? (row.cpl === null ? '--' : `${ok ? 'Below' : 'Above'} Rs. ${num(benchmark)}`) : '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>
          Budget Split by Campaign
        </div>
        <BudgetSplitChart rows={campaignSpend} />
      </div>
    </div>
  );
}
