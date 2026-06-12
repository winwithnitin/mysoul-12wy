import { CFG, SUBMITTER_IDS } from '../config.js'

// ─── JSONP fetch — works with Apps Script, no CORS issues ─────────────────────
export function jsonpFetch(url) {
  return new Promise((resolve, reject) => {
    const cbName = 'cb_' + Math.random().toString(36).slice(2)
    const script = document.createElement('script')
    const timer  = setTimeout(() => { cleanup(); reject(new Error('Timeout')) }, 25000)
    const cleanup = () => {
      clearTimeout(timer)
      delete window[cbName]
      if (script.parentNode) script.parentNode.removeChild(script)
    }
    window[cbName] = (data) => { cleanup(); resolve(data) }
    script.src     = url + (url.includes('?') ? '&' : '?') + 'callback=' + cbName
    script.onerror = () => { cleanup(); reject(new Error('Script load failed')) }
    document.head.appendChild(script)
  })
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

// ─── Slack Mentions ───────────────────────────────────────────────────────────
export async function fetchMentions() {
  const data = await jsonpFetch(CFG.SLACK_PROXY_URL + '?action=mentions')
  if (data.error) throw new Error(data.error)
  return (data.mentions || []).filter(m => !m.channel?.includes('help-slip'))
}

// ─── Todoist ──────────────────────────────────────────────────────────────────
export async function fetchTodoist() {
  const res   = await fetch('https://api.todoist.com/rest/v2/tasks?filter=today%7Coverdue', {
    headers: { Authorization: `Bearer ${CFG.TODOIST_API_TOKEN}` }
  })
  if (!res.ok) throw new Error('Todoist API error: ' + res.status)
  const tasks = await res.json()
  return tasks.map(t => ({
    id:        t.id,
    content:   t.content,
    due:       t.due?.date || null,
    priority:  t.priority,
    source:    'todoist',
    recurring: !!(t.due?.is_recurring),
    url:       t.url,
  }))
}

// ─── 12WY Sheet ───────────────────────────────────────────────────────────────
export async function fetch12WY() {
  const url = `https://docs.google.com/spreadsheets/d/${CFG.TWWY_SHEET_ID}/gviz/tq?tqx=out:json&sheet=App%20Data`
  const res = await fetch(url)
  const text = await res.text()
  // gviz wraps JSON in google.visualization.Query.setResponse(...)
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)
  if (!match) throw new Error('Could not parse 12WY sheet')
  const gviz = JSON.parse(match[1])
  // Cell A1 contains the raw JSON app state
  const cellVal = gviz?.table?.rows?.[0]?.c?.[0]?.v
  if (!cellVal) return []
  const appData = JSON.parse(cellVal)
  const tactics = []
  const weeks = appData.weeks || {}
  Object.keys(weeks).forEach(w => {
    const wd = weeks[w]
    if (!wd?.cats) return
    Object.keys(wd.cats).forEach(catId => {
      const cd = wd.cats[catId]
      if (!cd?.tactics) return
      cd.tactics.forEach((t, i) => {
        if (!t.text?.trim() || t.status === 'done' || t.status === 'delegated') return
        tactics.push({
          id:      `12wy-w${w}-${catId}-${i}`,
          content: t.text.trim(),
          due:     `W${w}`,
          priority: 2,
          source:  '12wy',
          label:   catId,
        })
      })
    })
  })
  return tactics
}

// ─── Claude AI call ───────────────────────────────────────────────────────────
export async function callClaude(system, user, maxTokens = 600) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const data = await res.json()
  return data.content?.find(b => b.type === 'text')?.text || ''
}

// ─── Write actions ────────────────────────────────────────────────────────────
export async function postResolvedToSlack(slip) {
  const tag = SUBMITTER_IDS[slip.submittedBy]
    ? `<@${SUBMITTER_IDS[slip.submittedBy]}>`
    : slip.submittedBy
  return callClaude(
    'Post a Slack thread reply using Slack MCP.',
    `Post to channel ${CFG.HELP_SLIP_CHANNEL}, thread_ts: ${slip.ts}\nMessage: ✅ *RESOLVED* by <@${CFG.NITIN_SLACK_ID}>\n\n${tag} — handled. Please confirm with student/team and close out.`
  )
}
