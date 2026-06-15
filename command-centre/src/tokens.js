// ─── Design Tokens — Medium Dark Theme ───────────────────────────────────────
export const T = {
  bg:         '#1C1B2E',      // deep navy-purple — not black
  surface:    '#252438',      // card surface — clearly visible
  surfaceHigh:'#2E2C44',      // hover/selected — distinct from surface
  border:     'rgba(255,255,255,0.12)',
  gold:       '#E4B84A',      // warm gold — pops on dark bg
  goldDim:    'rgba(228,184,74,0.15)',
  violet:     '#9B7FE8',      // soft purple — readable
  violetDim:  'rgba(155,127,232,0.15)',
  text:       '#EEEAF8',      // near-white — high contrast
  textMid:    '#C4BDE0',      // secondary — clearly readable
  textDim:    '#8B85A8',      // muted — still visible
  red:        '#F87171',
  amber:      '#FBB040',
  green:      '#34D399',
  blue:       '#60A5FA',
  // Surface variants for email/slip list items
  listItem:   '#211F35',
  listHover:  '#2A2840',
  listSelected: '#2E2B4A',
}

export const EMAIL_CATS = {
  '⭐ Mehakleen':     { color: '#C9A84C', bg: 'rgba(201,168,76,0.12)' },
  '🔴 Needs You':    { color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  '💰 Finance':      { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  '👥 Team':         { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  '📚 MySoulSchool': { color: '#7C5CBF', bg: 'rgba(124,92,191,0.12)' },
  '⚙️ Platform':     { color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  '🗑️ Newsletters':  { color: '#4B5563', bg: 'rgba(75,85,99,0.12)' },
}

export const MENTION_CATS = {
  '🔴 Decision Needed': { color: '#EF4444' },
  '✅ Approval':        { color: '#10B981' },
  '💬 FYI':            { color: '#3B82F6' },
  '⚡ Urgent':         { color: '#F59E0B' },
}

export const TYPE_COLORS = {
  'Revenue':         { color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
  'Ops':             { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  'Finance':         { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  'Learning':        { color: '#7C5CBF', bg: 'rgba(124,92,191,0.1)' },
  'Health/Personal': { color: '#EC4899', bg: 'rgba(236,72,153,0.1)' },
}

export const SRC_COLORS = {
  todoist: { color: '#E44332', bg: 'rgba(228,67,50,0.1)',    label: 'Todoist' },
  '12wy':  { color: '#C9A84C', bg: 'rgba(201,168,76,0.15)', label: '12WY' },
  manual:  { color: '#10B981', bg: 'rgba(16,185,129,0.1)',  label: 'Manual' },
}

export const KANBAN_COLS = [
  { id: 'today',    label: '📋 Today',     color: '#7C5CBF', desc: 'Must do today' },
  { id: 'waiting',  label: '⏸ Waiting',    color: '#F59E0B', desc: 'Blocked or pending' },
  { id: 'delegate', label: '→ Delegate',   color: '#3B82F6', desc: 'Someone else owns this' },
  { id: 'ideas',    label: '💡 Ideas',      color: '#C9A84C', desc: 'Park for HCI' },
]
