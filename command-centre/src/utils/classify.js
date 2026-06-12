import { CFG } from '../config.js'

export function classifyEmail(from, email, subject, preview) {
  const s = `${subject} ${from} ${email} ${preview}`.toLowerCase()
  if (CFG.MEHAKLEEN_EMAILS.some(e => email?.toLowerCase() === e))
    return { category: '⭐ Mehakleen', priority: 'HIGH', tag: 'VIP — respond today' }
  if ((s.includes('unlock') && s.includes('account')) || s.includes('account access'))
    return { category: '🔴 Needs You', priority: 'HIGH', tag: 'Student issue', isStudent: true }
  if (s.includes('not received payment') || s.includes('billing problem') || s.includes('run failed'))
    return { category: '🔴 Needs You', priority: 'HIGH', tag: 'Urgent action' }
  if (s.includes('invoice') || s.includes('receipt') || s.includes('challan') || s.includes('gst') ||
      s.includes('₹') || s.includes('payment') || s.includes('billing') || s.includes('budget') || s.includes('rs.'))
    return { category: '💰 Finance', priority: 'MEDIUM', tag: 'Review with Varsha' }
  if (['nishant','namita','deesha','aravind','tanvi','ea@mysoulschool','accepted:','support@mysoulschool','drive-shares'].some(k => s.includes(k)))
    return { category: '👥 Team', priority: 'MEDIUM', tag: 'Team update' }
  if (s.includes('mysoulschool') || s.includes('super') || s.includes('webinar') || s.includes('zoom') ||
      s.includes('reiki') || s.includes('tarot') || s.includes('certificate') || s.includes('coaching'))
    return { category: '📚 MySoulSchool', priority: 'MEDIUM', tag: 'School ops' }
  if (['blueticks','manychat','senja','audible','tallycapital','squarespace'].some(n => s.includes(n)))
    return { category: '🗑️ Newsletters', priority: 'LOW', tag: 'Unsubscribe?' }
  if (['shiprocket','github','elevenlabs','amazonaws','google workspace','amazon','tally','payu','zoom','anthropic','elevenlabs','slack','chatgpt','openai'].some(n => s.includes(n)))
    return { category: '⚙️ Platform', priority: 'LOW', tag: 'Auto-log' }
  return { category: '⚙️ Platform', priority: 'LOW', tag: 'Review' }
}

export function classifyMention(text) {
  const s = (text || '').toLowerCase()
  if (s.includes('urgent') || s.includes('asap') || s.includes('immediately')) return '⚡ Urgent'
  if (s.includes('approve') || s.includes('confirm') || s.includes('kindly confirm')) return '✅ Approval'
  if (s.includes('fyi') || s.includes('accepted') || s.includes('done') || s.includes('completed')) return '💬 FYI'
  return '🔴 Decision Needed'
}

export function inferTaskTags(content) {
  const s = (content || '').toLowerCase()
  let owner = 'Nitin Only'
  if (s.includes('delegate') || s.includes('share with') || s.includes('tanvi') ||
      s.includes('namita') || s.includes('aravind') || s.includes('varsha') ||
      s.includes('siddhi') || s.includes('nishant'))
    owner = 'Delegatable'
  if (s.includes('review') || s.includes('discuss') || s.includes('decide') ||
      s.includes('approve') || s.includes('interview') || s.includes('strategy'))
    owner = 'Nitin Only'

  let type = 'Ops'
  if (s.includes('lead') || s.includes('ads') || s.includes('campaign') || s.includes('revenue') ||
      s.includes('launch') || s.includes('funnel') || s.includes('super') || s.includes('reiki') ||
      s.includes('tarot') || s.includes('webinar') || s.includes('sales') || s.includes('cpl'))
    type = 'Revenue'
  if (s.includes('learn') || s.includes('ai ') || s.includes('magic') || s.includes('hci') || s.includes('study'))
    type = 'Learning'
  if (s.includes('medicine') || s.includes('gym') || s.includes('walk') || s.includes('health') || s.includes('thyrocare'))
    type = 'Health/Personal'
  if (s.includes('salary') || s.includes('invoice') || s.includes('bank') || s.includes('gst') || s.includes('finance'))
    type = 'Finance'

  const today = new Date()
  return { owner, type }
}

export function daysAgo(d) {
  const diff = Math.floor((Date.now() - new Date(d)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return `${diff}d ago`
}

export function isOverdue(due) {
  if (!due || due.startsWith('W')) return false
  return new Date(due) < new Date()
}

export function daysOverdue(due) {
  if (!isOverdue(due)) return 0
  return Math.floor((Date.now() - new Date(due)) / 86400000)
}
