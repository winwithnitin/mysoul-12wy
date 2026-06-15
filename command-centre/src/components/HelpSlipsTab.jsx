import { useState, useEffect, useCallback } from 'react'
import { T } from '../tokens.js'
import { fetchHelpSlips, callClaude } from '../utils/api.js'
import { daysAgo } from '../utils/classify.js'
import { CFG, SUBMITTER_IDS } from '../config.js'
import { Pill, LoadingCard, ErrorCard, CoachPanel, ReplyPanel, Btn, SidebarBtn, StatChip, Toast } from './UI.jsx'

const SLIP_STATUS = {
  OPEN:     { label:'Open',     color:'#EF4444', dot:'🔴' },
  REPLIED:  { label:'Replied',  color:'#F59E0B', dot:'🟡' },
  RESOLVED: { label:'Resolved', color:'#10B981', dot:'✅' },
}

export default function HelpSlipsTab({ decisions, logDecision }) {
  const [slips, setSlips]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [selected, setSelected]         = useState(null)
  const [filter, setFilter]             = useState('All')
  const [coaching, setCoaching]         = useState({})
  const [coachLoading, setCoachLoading] = useState({})
  const [reply, setReply]               = useState({})
  const [replyLoading, setReplyLoading] = useState({})
  const [resolved, setResolved]         = useState({})
  const [resolveLoading, setResolveLoading] = useState({})
  const [toast, setToast]               = useState('')

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetchHelpSlips()
      setSlips(data)
      setSelected(data[0] || null)
    } catch (err) {
      setError('Could not load #help-slip: ' + err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCoach = async (slip) => {
    if (coaching[slip.id]) return
    setCoachLoading(p => ({ ...p, [slip.id]: true }))
    const r = await callClaude(
      `You are Nitin Sachdeva's blunt coach. MySoulSchool runs Tarot/Reiki/SUPER programs.
For this help-slip give exactly 4 lines:
ACTION: Clear yes/no/instruction (1-2 sentences)
RISK: What breaks if not answered today
TIMELINE: "2-min decision" / "10-min review" / "Delegate to [name]"
COACH: Is this recurring? Should there be an SOP? Max 100 words.`,
      `By: ${slip.submittedBy} (${slip.department}) → ${slip.raisedTo}\nQuery: ${slip.query}\nTeam solution: ${slip.solution1 || 'None'}\nDays open: ${slip.daysOpen}`
    )
    setCoaching(p => ({ ...p, [slip.id]: r }))
    setCoachLoading(p => ({ ...p, [slip.id]: false }))
  }

  const handleDraft = async (slip) => {
    setReplyLoading(p => ({ ...p, [slip.id]: true }))
    const r = await callClaude(
      'Draft Nitin Sachdeva\'s reply to this team help-slip. Use team\'s proposed solution if sensible. Direct, 1-3 sentences, no greeting.',
      `Query: ${slip.query}\nSolution: ${slip.solution1}`
    )
    setReply(p => ({ ...p, [slip.id]: r }))
    setReplyLoading(p => ({ ...p, [slip.id]: false }))
  }

  const handleResolve = async (slip) => {
    setResolveLoading(p => ({ ...p, [slip.id]: true }))
    try {
      const tag = SUBMITTER_IDS[slip.submittedBy] ? `<@${SUBMITTER_IDS[slip.submittedBy]}>` : slip.submittedBy
      await callClaude(
        'Post a Slack thread reply using Slack MCP.',
        `Post to channel ${CFG.HELP_SLIP_CHANNEL}, thread_ts: ${slip.ts}\nMessage: ✅ *RESOLVED* by <@${CFG.NITIN_SLACK_ID}>\n\n${tag} — this has been handled. Please confirm with student/team and close out.`
      )
      setResolved(p => ({ ...p, [slip.id]: true }))
      logDecision({ type:'slip', query:slip.query?.slice(0,80), submittedBy:slip.submittedBy, department:slip.department, action:'RESOLVED' })
      showToast(`✅ RESOLVED posted in Slack — ${slip.submittedBy} tagged`)
    } catch {
      setResolved(p => ({ ...p, [slip.id]: true }))
      showToast('✅ Marked resolved — post RESOLVED in Slack thread manually')
    }
    setResolveLoading(p => ({ ...p, [slip.id]: false }))
  }

  const byDept   = slips.reduce((a,s) => ({ ...a, [s.department]: (a[s.department]||0)+1 }), {})
  const byPerson = slips.reduce((a,s) => ({ ...a, [s.submittedBy]: (a[s.submittedBy]||0)+1 }), {})
  const openCount     = slips.filter(s => (resolved[s.id]?'RESOLVED':s.status) === 'OPEN').length
  const resolvedCount = slips.filter(s => s.status === 'RESOLVED' || resolved[s.id]).length
  const staleCount    = slips.filter(s => s.daysOpen >= 3 && s.status !== 'RESOLVED' && !resolved[s.id]).length

  const FILTERS = ['All','🔴 Open','🟡 Replied','✅ Resolved','🔥 Stale (3d+)']
  const filtered = slips.filter(s => {
    const st = resolved[s.id] ? 'RESOLVED' : s.status
    if (filter === 'All') return true
    if (filter === '🔴 Open') return st === 'OPEN'
    if (filter === '🟡 Replied') return st === 'REPLIED'
    if (filter === '✅ Resolved') return st === 'RESOLVED'
    if (filter === '🔥 Stale (3d+)') return s.daysOpen >= 3 && st !== 'RESOLVED'
    return true
  })

  if (loading) return <LoadingCard msg="Fetching #help-slip from Slack…" />
  if (error)   return <ErrorCard msg={error} onRetry={load} />

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {toast && <Toast msg={toast} />}

      {/* Analytics bar */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:'9px 16px', display:'flex', gap:18, flexWrap:'wrap', alignItems:'center', flexShrink:0 }}>
        <StatChip label="Open" value={openCount} color={T.red} />
        <StatChip label="Resolved" value={resolvedCount} color={T.green} />
        <StatChip label="🔥 Stale" value={staleCount} color={T.amber} />
        <div style={{ height:24, width:1, background:T.border }} />
        <div style={{ fontSize:11, color:T.textDim }}>
          Dept: {Object.entries(byDept).map(([k,v]) => `${k}(${v})`).join(' · ')}
        </div>
        <Btn variant="ghost" onClick={load} style={{ marginLeft:'auto', fontSize:11 }}>↺ Refresh</Btn>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* Sidebar */}
        <div style={{ width:150, background:T.surface, borderRight:`1px solid ${T.border}`, padding:'10px 7px', flexShrink:0, overflowY:'auto' }}>
          {FILTERS.map(f => {
            const c = f==='All'?slips.length:f==='🔴 Open'?openCount:f==='🟡 Replied'?slips.filter(s=>s.status==='REPLIED'&&!resolved[s.id]).length:f==='✅ Resolved'?resolvedCount:staleCount
            return <SidebarBtn key={f} active={filter===f} onClick={() => setFilter(f)} count={c}>{f}</SidebarBtn>
          })}
          <div style={{ height:1, background:T.border, margin:'8px 0' }} />
          <div style={{ fontSize:10, color:T.textDim, fontWeight:700, textTransform:'uppercase', letterSpacing:1, padding:'0 4px 6px' }}>By Person</div>
          {Object.entries(byPerson).sort((a,b)=>b[1]-a[1]).map(([n,c]) => (
            <div key={n} style={{ display:'flex', justifyContent:'space-between', padding:'2px 4px', fontSize:10.5 }}>
              <span style={{ color:T.textDim, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n}</span>
              <span style={{ color:T.gold, flexShrink:0 }}>{c}</span>
            </div>
          ))}
        </div>

        {/* List */}
        <div style={{ width:280, borderRight:`1px solid ${T.border}`, overflowY:'auto', flexShrink:0 }}>
          {filtered.map(s => {
            const st = SLIP_STATUS[resolved[s.id]?'RESOLVED':s.status] || SLIP_STATUS.OPEN
            return (
              <div key={s.id} onClick={() => { setSelected(s); handleCoach(s) }}
                style={{ padding:'10px 12px', background:selected?.id===s.id?'#2E2B4A':'#211F35', borderLeft:selected?.id===s.id?`3px solid ${T.gold}`:'3px solid transparent', cursor:'pointer', borderBottom:`1px solid ${T.border}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:12.5, fontWeight:600, color:T.text }}>{s.submittedBy}</span>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    {s.daysOpen >= 3 && st.label !== 'Resolved' && <span>🔥</span>}
                    <span style={{ fontSize:10.5, color:st.color, fontWeight:700 }}>{st.dot} {st.label}</span>
                  </div>
                </div>
                <div style={{ fontSize:11.5, color:T.textMid, marginBottom:4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{s.query}</div>
                <div style={{ display:'flex', gap:5 }}>
                  <Pill label={s.department} color={T.violet} bg={T.violetDim} />
                  <span style={{ fontSize:10.5, color:T.textDim }}>{daysAgo(s.date)}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Detail */}
        <div style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>
          {selected ? (() => {
            const st = SLIP_STATUS[resolved[selected.id]?'RESOLVED':selected.status] || SLIP_STATUS.OPEN
            return (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:11, color:T.textDim, marginBottom:4 }}>
                      {selected.submittedBy} · {selected.department} → {selected.raisedTo} · {daysAgo(selected.date)} · {selected.daysOpen}d open
                    </div>
                    <Pill label={`${st.dot} ${st.label}`} color={st.color} />
                  </div>
                  {selected.daysOpen >= 3 && st.label !== 'Resolved' && (
                    <span style={{ background:'rgba(245,158,11,0.15)', color:T.amber, borderRadius:7, padding:'4px 10px', fontSize:11, fontWeight:700 }}>🔥 {selected.daysOpen}d open</span>
                  )}
                </div>

                <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:'14px 16px', marginBottom:10, border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:11, color:T.textDim, fontWeight:700, marginBottom:5, textTransform:'uppercase', letterSpacing:0.8 }}>Query</div>
                  <div style={{ fontSize:13, color:T.text, lineHeight:1.7 }}>{selected.query}</div>
                </div>

                {selected.solution1 && (
                  <div style={{ background:T.violetDim, borderRadius:10, padding:'12px 14px', marginBottom:12, border:`1px solid ${T.violet}33` }}>
                    <div style={{ fontSize:11, color:T.violet, fontWeight:700, marginBottom:4, textTransform:'uppercase' }}>Team's Proposed Solution</div>
                    <div style={{ fontSize:12.5, color:'#C4B5FD', lineHeight:1.6 }}>{selected.solution1}</div>
                  </div>
                )}

                <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:4 }}>
                  {st.label !== 'Resolved' && (
                    <>
                      <Btn onClick={() => handleDraft(selected)}>✦ Draft Reply</Btn>
                      <Btn variant="green" onClick={() => handleResolve(selected)} disabled={resolveLoading[selected.id]}>
                        {resolveLoading[selected.id] ? '⏳ Posting…' : '✅ Mark RESOLVED'}
                      </Btn>
                    </>
                  )}
                  <Btn variant="gold" onClick={() => { logDecision({ type:'slip', query:selected.query?.slice(0,80), submittedBy:selected.submittedBy, department:selected.department, action:'Delegated to Namita' }); showToast('Logged: Delegated') }}>
                    Delegate to Namita
                  </Btn>
                </div>

                <CoachPanel content={coaching[selected.id]} loading={coachLoading[selected.id]} />
                <ReplyPanel
                  draft={reply[selected.id]} loading={replyLoading[selected.id]}
                  onCopy={() => navigator.clipboard.writeText(reply[selected.id]).catch(() => {})}
                  onDiscard={() => setReply(p => ({ ...p, [selected.id]:'' }))}
                  label="REPLY → post in #help-slip thread"
                />
              </>
            )
          })() : (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:T.textDim }}>Select a slip</div>
          )}
        </div>
      </div>
    </div>
  )
}
