// ─── Design Tokens — Medium Dark Theme ───────────────────────────────────────
export const T = {
  bg:           '#1C1B2E',
  surface:      '#252438',
  surfaceHigh:  '#2E2C44',
  listItem:     '#211F35',
  listSelected: '#2E2B4A',
  border:       'rgba(255,255,255,0.12)',
  gold:         '#E4B84A',
  goldDim:      'rgba(228,184,74,0.15)',
  violet:       '#9B7FE8',
  violetDim:    'rgba(155,127,232,0.15)',
  text:         '#EEEAF8',
  textMid:      '#C4BDE0',
  textDim:      '#8B85A8',
  red:          '#F87171',
  amber:        '#FBB040',
  green:        '#34D399',
  blue:         '#60A5FA',
}

export const EMAIL_CATS = {
  '⭐ Mehakleen':     { color: '#E4B84A', bg: 'rgba(228,184,74,0.12)' },
  '🔴 Needs You':    { color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
  '💰 Finance':      { color: '#FBB040', bg: 'rgba(251,176,64,0.12)' },
  '👥 Team':         { color: '#60A5FA', bg: 'rgba(96,165,250,0.12)' },
  '📚 MySoulSchool': { color: '#9B7FE8', bg: 'rgba(155,127,232,0.12)' },
  '⚙️ Platform':     { color: '#8B85A8', bg: 'rgba(139,133,168,0.12)' },
  '🗑️ Newsletters':  { color: '#6B6480', bg: 'rgba(107,100,128,0.12)' },
}

export const MENTION_CATS = {
  '🔴 Decision Needed': { color: '#F87171' },
  '✅ Approval':        { color: '#34D399' },
  '💬 FYI':            { color: '#60A5FA' },
  '⚡ Urgent':         { color: '#FBB040' },
}

export const TYPE_COLORS = {
  'Revenue':         { color: '#34D399', bg: 'rgba(52,211,153,0.1)' },
  'Ops':             { color: '#60A5FA', bg: 'rgba(96,165,250,0.1)' },
  'Finance':         { color: '#FBB040', bg: 'rgba(251,176,64,0.1)' },
  'Learning':        { color: '#9B7FE8', bg: 'rgba(155,127,232,0.1)' },
  'Health/Personal': { color: '#F472B6', bg: 'rgba(244,114,182,0.1)' },
}

export const SRC_COLORS = {
  todoist: { color: '#E44332', bg: 'rgba(228,67,50,0.1)',    label: 'Todoist' },
  '12wy':  { color: '#E4B84A', bg: 'rgba(228,184,74,0.15)', label: '12WY' },
  manual:  { color: '#34D399', bg: 'rgba(52,211,153,0.1)',  label: 'Manual' },
}

// Today · Waiting · Delegate · Done · Ideas (Ideas locked on far right — HCI only)
export const KANBAN_COLS = [
  { id: 'today',    label: '📋 Today',     color: '#9B7FE8', desc: 'Must do today' },
  { id: 'waiting',  label: '⏸ Waiting',    color: '#FBB040', desc: 'Blocked or not scheduled' },
  { id: 'delegate', label: '→ Delegate',   color: '#60A5FA', desc: 'Someone else owns this' },
  { id: 'done',     label: '✅ Done',       color: '#34D399', desc: 'Completed today' },
  { id: 'ideas',    label: '💡 Ideas',      color: '#E4B84A', desc: '🔒 Review at HCI — don\'t act mid-cycle' },
]
