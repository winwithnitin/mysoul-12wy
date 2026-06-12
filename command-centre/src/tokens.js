// ─── Design Tokens ────────────────────────────────────────────────────────────
export const T = {
  bg:         '#09080F',
  surface:    '#110F1E',
  surfaceHigh:'#1A1730',
  border:     'rgba(255,255,255,0.07)',
  gold:       '#C9A84C',
  goldDim:    'rgba(201,168,76,0.15)',
  violet:     '#7C5CBF',
  violetDim:  'rgba(124,92,191,0.15)',
  text:       '#F0EEFF',
  textMid:    '#A89EC4',
  textDim:    '#5E587A',
  red:        '#EF4444',
  amber:      '#F59E0B',
  green:      '#10B981',
  blue:       '#3B82F6',
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
