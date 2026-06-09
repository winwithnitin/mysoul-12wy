// ─── Ad Spend & Lead Sheets (Marketing tab) ──────────────────────────────────
export const SHEETS = {
  adSpend: { id: '10fhstijcgw_qAKCfoF04i3NIsiFegnlcMgOG3px7BfA', tab: 'Ad_Spend' },
  tarot:   { id: '1K1NqGSAGb7Hc9fSD5EQuBJvsJ8GfFkgwbr1CqJBPX0M', tab: 'LeadsMasterSheet', dateCol: 5 },
  reiki:   { id: '1F_HLtYFY6g61vVslmMUz64BLHWCvOCc9-A2BG_tOicI', tab: 'Free_Leads',       dateCol: 5 },
  pcos:    { id: '1VumI6g9cr4mHpJPc_CSFrjVkr4jw9iT9NDw6fzJU88E', tab: 'PaymentMasterSheet', dateCol: 18 },
};

// ─── Enrollment Sheet (Sales tab) ────────────────────────────────────────────
export const SALES_SHEET = {
  id:  '1t_2yP18ErFwfqMWhW2C3yZb1POIxObBK8dhqyQTBOnE',
  tab: 'Dashboard',
};

// ─── Marketing programs ───────────────────────────────────────────────────────
export const PROGRAMS = [
  { key: 'Tarot', color: 'var(--tarot)', dim: 'var(--tarot-dim)', cplTarget: 280 },
  { key: 'Reiki', color: 'var(--reiki)', dim: 'var(--reiki-dim)', cplTarget: 750 },
  { key: 'PCOS',  color: 'var(--pcos)',  dim: 'var(--pcos-dim)',  cplTarget: 700 },
];

// ─── Sales funnels ────────────────────────────────────────────────────────────
export const FUNNELS = {
  Tarot: {
    color: 'var(--tarot)',
    programs: ['tarot - diploma', 'tarot - mastery', 'tarot - health', '30 days mani'],
  },
  Reiki: {
    color: 'var(--reiki)',
    programs: ["reiki - l1/l2", 'reiki - l3', 'money reiki', "ho'oponopono", 'hooponopono'],
  },
};

export function getFunnel(program) {
  if (!program) return 'Other';
  const p = program.toLowerCase().trim();
  for (const [funnel, cfg] of Object.entries(FUNNELS)) {
    if (cfg.programs.some(fp => p.includes(fp) || fp.includes(p))) return funnel;
  }
  return 'Other';
}

// ─── GST ─────────────────────────────────────────────────────────────────────
export const GST_RATE = 0.18;
export function exclGST(amount) { return amount / (1 + GST_RATE); }
export function inclGST(amount) { return amount; }
export function applyGST(amount, mode) {
  return mode === 'excl' ? exclGST(amount) : inclGST(amount);
}

// ─── Slack ────────────────────────────────────────────────────────────────────
export const SLACK = {
  dollyId:   'U07Q0BNK3L6',
  channel:   '#delegation',
};

// ─── Finance Apps Script URL ──────────────────────────────────────────────────
export const FINANCE_URL = 'https://script.google.com/macros/s/AKfycbwhmj1f3nhS4mRFzS1fxlf3EeF8Q0BIXhzLDn9BLlgupjFU8WqNJJqC5e9epsP4jVE-/exec';
