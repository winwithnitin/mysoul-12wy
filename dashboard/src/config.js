// --- Ad Spend & Lead Sheets ---------------------------------------------------
export const SHEETS = {
  adSpend: { id: '10fhstijcgw_qAKCfoF04i3NIsiFegnlcMgOG3px7BfA', tab: 'Ad_Spend' },
  tarot:   { id: '1K1NqGSAGb7Hc9fSD5EQuBJvsJ8GfFkgwbr1CqJBPX0M', tab: 'LeadsMasterSheet', dateCol: 5 },
  reiki:   { id: '1F_HLtYFY6g61vVslmMUz64BLHWCvOCc9-A2BG_tOicI', tab: 'Free_Leads',        dateCol: 5 },
};

// --- Enrollment Sheet (Sales tab) --------------------------------------------
export const SALES_SHEET = {
  id:  '1t_2yP18ErFwfqMWhW2C3yZb1POIxObBK8dhqyQTBOnE',
  tab: 'Dashboard',
};

// --- Workshop Performance -----------------------------------------------------
export const WORKSHOP_PMS = {
  id:  '1uZjFt08m5pXSctFse7a3XrscFcZ0nr3kWcTQvbUU3nk',
  tab: 'Plan',
};

export const WORKSHOP_PERFORMANCE = {
  id:          '1Wi5TiXosj2MDnWv_9kxnQt0V6x6pSBZeUdsLypSllBQ',
  showUpTab:   'ShowUp',
  memoryTab:   'AuditMemory',
};

// Aravind will add the Sheet ID after creating "MySoul Ads Intelligence".
export const ADS_INTELLIGENCE = {
  id:  '',
  tab: 'Sheet1',
};

export const INTERNS_KPI = {
  id: '1WxlbrmNC2W9pRxmTOTNbVlMwyHjuR79nOK19tVJKar8',
  fallbackTabs: ['Harpreet', 'Ishika', 'Prerna', 'Niranjana', 'Niyati'],
  skipTabs: ['Daily Call Recordings', 'Meeting Attendance'],
};

export const WORKSHOP_BENCHMARKS = {
  Tarot: { cpl: 250, showD1: 28, showD2: 18, showD3: 13, conversion: 2 },
  Reiki: { cpl: 120, showD1: 28, conversion: 1 },
};

// --- Apps Script URLs ---------------------------------------------------------
export const FINANCE_URL   = 'https://script.google.com/macros/s/AKfycbwhmj1f3nhS4mRFzS1fxlf3EeF8Q0BIXhzLDn9BLlgupjFU8WqNJJqC5e9epsP4jVE-/exec';
export const EMI_URL       = 'https://script.google.com/macros/s/AKfycbwgKK2X3PYGLlOOu-D_ZJKvYQKpdPVAtXE3T1bkaybI-IIl5vX0_IU6DktaKdqhZnPg_A/exec';
export const BATCH_EMI_URL = 'https://script.google.com/macros/s/AKfycbwmzaip3K9TWI5m_elU1bQ2G5ZK3gYcBH__RFbViBnsihxcjsv63cXXYy_zeHnFJWGd/exec';

// --- Response EMI master sheets (SUPER & RGM separate, maintained by Aravind) -
// When a new batch tab is added, append its name to the tabs array below + push.
export const SUPER_EMI = {
  id:   '1yOPp5A_34VK0IIgt7XgVwdBS8zD_2jG0M_fEA4Y0vKw',
  tabs: ['May 2025 SUPER', 'Aug 2025 SUPER', 'Dec 2025 SUPER', 'Apr 2026 SUPER', 'July 2026 SUPER'],
};
export const RGM_EMI = {
  id:   '1aeGTJUwq8pufyude9z75jzIy4S_2fMgRsZ0HSz0t_08',
  tabs: ['Oct 2025 RGM', 'Apr 2026 RGM'],
};

// --- Programs -----------------------------------------------------------------
export const PROGRAMS = [
  { key: 'Tarot', color: 'var(--tarot)', dim: 'var(--tarot-dim)', cplTarget: 280 },
  { key: 'Reiki', color: 'var(--reiki)', dim: 'var(--reiki-dim)', cplTarget: 750 },
];

// --- Sales funnels ------------------------------------------------------------
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

// --- Batch Registry ----------------------------------------------------------
export const BATCH_REGISTRY = {
  id:  '1b3IZYUmRlG9nHp27b3i1ObxfUIV1Zq9jmzNtnN_iyYg',
  tab: 'Sheet1',
};

// --- GST ---------------------------------------------------------------------
export const GST_RATE = 0.18;
export function exclGST(amount) { return amount / (1 + GST_RATE); }
export function inclGST(amount) { return amount; }
export function applyGST(amount, mode) {
  return mode === 'excl' ? exclGST(amount) : inclGST(amount);
}

// --- Slack -------------------------------------------------------------------
export const SLACK = {
  dollyId:  'U07Q0BNK3L6',
  channel:  '#delegation',
};
