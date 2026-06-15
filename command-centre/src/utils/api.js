import { CFG, SUBMITTER_IDS, TEAM_MEMBERS } from '../config.js'

// ─── JSONP fetch (GET only — for reading data from Apps Script) ───────────────
export function jsonpFetch(url) {
  return new Promise((resolve, reject) => {
    const cbName  = 'cb_' + Math.random().toString(36).slice(2)
    const script  = document.createElement('script')
    const timer   = setTimeout(() => { cleanup(); reject(new Error('Timeout after 25s')) }, 25000)
    const cleanup = () => {
      clearTimeout(timer)
      delete window[cbName]
      if (script.parentNode) script.parentNode.removeChild(script)
    }
    window[cbName] = (data) => { cleanup(); resolve(data) }
    const sep      = url.includes('?') ? '&' : '?'
    script.src     = url + sep + 'callback=' + cbName
    script.onerror = () => { cleanup(); reject(new Error('Script load failed')) }
    document.head.appendChild(script)
  })
}

// ─── Claude AI (via Apps Script proxy — avoids CORS & key exposure) ──────────
export async function callClaude(system, user, maxTokens = 700) {
  if (!CFG.CLAUDE_PROXY_URL) {
    return '[AI not configured — add CLAUDE_PROXY_URL to config.js]'
  }
  try {
    const data = await jsonpFetch(
      `${CFG.CLAUDE_PROXY_URL}?system=${encodeURIComponent(system)}&user=${encodeURIComponent(user.slice(0, 1500))}&maxTokens=${maxTokens}`
    )
    if (data.error) throw new Error(data.error)
    return data.text || ''
  } catch (err) {
    console.error('Claude proxy error:', err.message)
    return '⚠️ AI unavailable: ' + err.message
  }
}

// ─── Gmail ────────────────────────────────────────────────────────────────────
export async function fetchEmails() {
  const data = await jsonpFetch(CFG.GMAIL_PROXY_URL)
  if (data.error) throw new Error(data.error)
  return data.emails || []
}

// ─── Slack Help Slips ─────────────────────────────────────────────────────────
export async function fetchHelpSlips() {
  const data = await jsonpFetch(CFG.SLACK_PROXY_URL + '?action=helpslips')
  if (data.error) throw new Error(data.error)
  const today = new Date()
  return (data.helpSlips || []).map(s => ({
    ...s,
    daysOpen: s.date ? Math.floor((today - new Date(s.date)) / 86400000) : 0,
    status: s.hasResolved ? 'RESOLVED' : s.replyCount > 0 ? 'REPLIED' : 'OPEN',
  }))
}

// ─── Slack Mentions (all channels + DMs) ─────────────────────────────────────
export async function fetchMentions() {
  const data = await jsonpFetch(CFG.SLACK_PROXY_URL + '?action=mentions')
  if (data.error) throw new Error(data.error)
  return (data.mentions || []).filter(m => !m.channel?.includes('help-slip'))
}

// ─── Slack Write Actions (via proxy GET — Apps Script posts to Slack API) ─────
export async function postSlackThreadReply(channelId, threadTs, message) {
  const data = await jsonpFetch(
    `${CFG.SLACK_PROXY_URL}?action=postreply&channel=${encodeURIComponent(channelId)}&ts=${encodeURIComponent(threadTs)}&text=${encodeURIComponent(message)}`
  )
  if (data.error) throw new Error(data.error)
  return data
}

export async function resolveSlipInSlack(slip) {
  const tag = SUBMITTER_IDS[slip.submittedBy] ? `<@${SUBMITTER_IDS[slip.submittedBy]}>` : slip.submittedBy
  const msg = `✅ *RESOLVED* by <@${CFG.NITIN_SLACK_ID}>\n\n${tag} — this has been handled. Please confirm with student/team and close out.`
  return postSlackThreadReply(CFG.HELP_SLIP_CHANNEL, slip.ts, msg)
}

export async function delegateSlipInSlack(slip, member, customMsg) {
  const tag = `<@${member.slackId}>`
  const msg = `📌 *Delegated to ${tag}* by <@${CFG.NITIN_SLACK_ID}>\n\n${customMsg || 'Please handle this and update the thread when done.'}`
  return postSlackThreadReply(CFG.HELP_SLIP_CHANNEL, slip.ts, msg)
}

// ─── Todoist ──────────────────────────────────────────────────────────────────
export async function fetchTodoist() {
  const res = await fetch('https://api.todoist.com/rest/v2/tasks?filter=today%7Coverdue', {
    headers: { Authorization: `Bearer ${CFG.TODOIST_API_TOKEN}` }
  })
  if (!res.ok) throw new Error('Todoist API error: ' + res.status)
  const tasks = await res.json()
  const today = new Date(); today.setHours(0,0,0,0)
  return tasks.map(t => {
    const dueDate = t.due?.date ? new Date(t.due.date) : null
    return {
      id: t.id, content: t.content, due: t.due?.date || null,
      priority: t.priority, source: 'todoist',
      recurring: !!(t.due?.is_recurring), url: t.url,
      isOverdue: dueDate ? dueDate < today : false,
    }
  })
}

export async function updateTodoistDueDate(taskId, newDate) {
  const res = await fetch(`https://api.todoist.com/rest/v2/tasks/${taskId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CFG.TODOIST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ due_date: newDate })
  })
  return res.ok
}

// ─── 12WY Sheet ───────────────────────────────────────────────────────────────
export async function fetch12WY() {
  try {
    const url  = `https://docs.google.com/spreadsheets/d/${CFG.TWWY_SHEET_ID}/gviz/tq?tqx=out:json&sheet=App%20Data`
    const res  = await fetch(url)
    const text = await res.text()
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)
    if (!match) return []
    const gviz    = JSON.parse(match[1])
    const cellVal = gviz?.table?.rows?.[0]?.c?.[0]?.v
    if (!cellVal) return []
    const appData = JSON.parse(cellVal)
    const tactics = []
    Object.keys(appData.weeks || {}).forEach(w => {
      const wd = appData.weeks[w]
      if (!wd?.cats) return
      Object.keys(wd.cats).forEach(catId => {
        ;(wd.cats[catId]?.tactics || []).forEach((t, i) => {
          if (!t.text?.trim() || t.status === 'done') return
          tactics.push({ id: `12wy-w${w}-${catId}-${i}`, content: t.text.trim(), due: `W${w}`, priority: 2, source: '12wy', label: catId })
        })
      })
    })
    return tactics
  } catch { return [] }
}
