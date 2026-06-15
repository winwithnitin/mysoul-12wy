import { useState, useEffect, useCallback } from 'react'
import { T } from '../tokens.js'
import { fetchHelpSlips, callClaude, resolveSlipInSlack, delegateSlipInSlack } from '../utils/api.js'
import { daysAgo } from '../utils/classify.js'
import { CFG } from '../config.js'
import { TEAM_MEMBERS } from '../config.js'
import { Pill, LoadingCard, ErrorCard, CoachPanel, ReplyPanel, Btn, SidebarBtn, StatChip, Toast } from './UI.jsx'

const SLIP_STATUS = {
  OPEN:     { label:'Open',     color:'#F87171', dot:'🔴' },
  REPLIED:  { label:'Replied',  color:'#FBB040', dot:'🟡' },
  RESOLVED: { label:'Resolved', color:'#34D399', dot:'✅' },
}

function DelegatePanel({ slip, onDone, showToast }) {
  const [open, setOpen]       = useState(false)
  const [member, setMember]   = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const go = async () => {
    if (!member) return
    setLoading(true)
    try {
      await delegateSlipInSlack(slip, member, message || `Please handle this and update the thread when done.`)
      showToast(`📌 Delegated to ${member.name} — tagged in Slack thread`)
      onDone && onDone(member)
      setOpen(false); setMember(null); setMessage('')
    } catch (err) {
      showToast('⚠️ Could not post to Slack: ' + err.message)
    }
    setLoading(false)
  }

  if (!open) return <Btn variant="amber" onClick={() => setOpen(true)}>→ Delegate</Btn>

  return (
    <div style={{ background:'rgba(245,158,11,0.08)', border:`1px solid rgba(245,158,11,0.2)`, borderRadius:10, padding:'14px', marginTop:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:11.5, fontWeight:700, color:T.amber }}>→ DELEGATE TO</span>
        <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', color:T.textDim, cursor:'pointer' }}>×</button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:10 }}>
        {TEAM_MEMBERS.map(m => (
          <button key={m.slackId} onClick={() => setMember(m)} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:member?.slackId===m.slackId?'rgba(245,158,11,0.15)':'rgba(255,255,255,0.03)', border:member?.slackId===m.slackId?`1px solid rgba(245,158,11,0.4)`:`1px solid ${T.border}`, borderRadius:7, cursor:'pointer', textAlign:'left' }}>
            <span>{m.emoji}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:member?.slackId===m.slackId?T.amber:T.text }}>{m.name}</div>
              <div style={{ fontSize:10.5, color:T.textDim }}>{m.role}</div>
            </div>
            {member?.slackId===m.slackId && <span style={{ color:T.amber }}>✓</span>}
          </button>
        ))}
      </div>
      <textarea value={message} onChange={e => setMessage(e.target.value)}
        placeholder="Optional message to add in thread…" rows={2}
        style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:7, padding:'7px 10px', color:T.text, fontSize:12, outline:'none', fontFamily:'inherit', resize:'none', marginBottom:8 }} />
      <Btn onClick={go} disabled={!member||loading} variant={member?'amber':'ghost'}>
        {loading?'⏳ Posting…':`→ Delegate to ${member?.name||'—'}`}
      </Btn>
    </div>
  )
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

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetchHelpSlips()
      setSlips(data); setSelected(data[0] || null)
    } catch (err) { setError('Could not load #help-slip: ' + err.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCoach = async (slip) => {
    if (coaching[slip.id]) return
    setCoachLoading(p => ({ ...p, [slip.id]: true }))
    const r = await callClaude(
      `You are Nitin Sachdeva's coach. MySoulSchool runs Tarot/Reiki/SUPER.
For this help-slip give exactly 4 lines — no preamble:
ACTION: Clear yes/no/instruction (1-2 sentences)
RISK: What breaks if not answered today
TIMELINE: "2-min decision" / "10-min review" / "Delegate to [name]"
COACH: Is this recurring? Needs an SOP? Max 100 words.`,
      `By: ${slip.submittedBy} (${slip.department}) → ${slip.raisedTo}\nQuery: ${slip.query}\nTeam solution: ${slip.solution1||'None'}\nDays open: ${slip.daysOpen}`
    )
    setCoaching(p => ({ ...p, [slip.id]: r }))
    setCoachLoading(p => ({ ...p, [slip.id]: false }))
  }

  const handleDraft = async (slip) => {
    setReplyLoading(p => ({ ...p, [slip.id]: true }))
    const r = await callClaude(
      'Draft Nitin Sachdeva\'s reply to this team help-slip. Use team\'s solution if sensible. Direct, 1-3 sentences, no greeting.',
      `Query: ${slip.query}\nSolution: ${slip.solution1}`
    )
    setReply(p => ({ ...p, [slip.id]: r }))
    setReplyLoading(p => ({ ...p, [slip.id]: false }))
  }

  const handleResolve = async (slip) => {
    setResolveLoading(p => ({ ...p, [slip.id]: true }))
    try {
      await resolveSlipInSlack(slip)
      setResolved(p => ({ ...p, [slip.id]: true }))
      logDecision({ type:'slip', query:slip.query?.slice(0,80), submittedBy:slip.submittedBy, department:slip.department, action:'RESOLVED' })
      showToast(`✅ RESOLVED posted in Slack thread — ${slip.submittedBy} tagged`)
    } catch (err) {
      showToast('⚠️ Could not post to Slack: ' + err.message)
    }
    setResolveLoading(p => ({ ...p, [slip.id]: false }))
  }

  const byDept   = slips.reduce((a,s)=>({...a,[s.department]:(a[s.department]||0)+1}),{})
  const byPerson = slips.reduce((a,s)=>({...a,[s.submittedBy]:(a[s.submittedBy]||0)+1}),{})
  const openCount     = slips.filter(s=>(resolved[s.id]?'RESOLVED':s.status)==='OPEN').length
  const resolvedCount = slips.filter(s=>s.status==='RESOLVED'||resolved[s.id]).length
  const staleCount    = slips.filter(s=>s.daysOpen>=3&&s.status!=='RESOLVED'&&!resolved[s.id]).length

  const FILTERS = ['All','🔴 Open','🟡 Replied','✅ Resolved','🔥 Stale 3d+']
  const filtered = slips.filter(s => {
    const st = resolved[s.id]?'RESOLVED':s.status
    if (filter==='All') return true
    if (filter==='🔴 Open') return st==='OPEN'
    if (filter==='🟡 Replied') return st==='REPLIED'
    if (filter==='✅ Resolved') return st==='RESOLVED'
    if (filter==='🔥 Stale 3d+') return s.daysOpen>=3&&st!=='RESOLVED'
    return true
  })

  if (loading) return <LoadingCard msg="Fetching #help-slip from Slack…" />
  if (error)   return <ErrorCard msg={error} onRetry={load} />

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {toast && <Toast msg={toast} />}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:'9px 16px', display:'flex', gap:16, flexWrap:'wrap', alignItems:'center', flexShrink:0 }}>
        <StatChip label="Open" value={openCount} color={T.red} />
        <StatChip label="Resolved" value={resolvedCount} color={T.green} />
        <StatChip label="🔥 Stale" value={staleCount} color={T.amber} />
        <div style={{ height:20, width:1, background:T.border }} />
        <div style={{ fontSize:11, color:T.textDim }}>Top: {Object.entries(byDept).sort((a,b)=>b[1]-a[1])[0]?.[0]}</div>
        <Btn variant="ghost" onClick={load} style={{ marginLeft:'auto', fontSize:11 }}>↺ Refresh</Btn>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <div style={{ width:150, background:T.surface, borderRight:`1px solid ${T.border}`, padding:'10px 7px', flexShrink:0, overflowY:'auto' }}>
          {FILTERS.map(f => {
            const c = f==='All'?slips.length:f==='🔴 Open'?openCount:f==='🟡 Replied'?slips.filter(s=>s.status==='REPLIED'&&!resolved[s.id]).length:f==='✅ Resolved'?resolvedCount:staleCount
            return <SidebarBtn key={f} active={filter===f} onClick={()=>setFilter(f)} count={c}>{f}</SidebarBtn>
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

        <div style={{ width:280, borderRight:`1px solid ${T.border}`, overflowY:'auto', flexShrink:0 }}>
          {filtered.map(s => {
            const st = SLIP_STATUS[resolved[s.id]?'RESOLVED':s.status]||SLIP_STATUS.OPEN
            return (
              <div key={s.id} onClick={()=>{setSelected(s);handleCoach(s)}}
                style={{ padding:'10px 12px', background:selected?.id===s.id?T.listSelected:T.listItem, borderLeft:selected?.id===s.id?`3px solid ${T.gold}`:'3px solid transparent', cursor:'pointer', borderBottom:`1px solid ${T.border}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:12.5, fontWeight:600, color:T.text }}>{s.submittedBy}</span>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    {s.daysOpen>=3&&st.label!=='Resolved'&&<span>🔥</span>}
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

        <div style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>
          {selected ? (() => {
            const st = SLIP_STATUS[resolved[selected.id]?'RESOLVED':selected.status]||SLIP_STATUS.OPEN
            return (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:11, color:T.textDim, marginBottom:4 }}>{selected.submittedBy} · {selected.department} → {selected.raisedTo} · {daysAgo(selected.date)} · {selected.daysOpen}d open</div>
                    <Pill label={`${st.dot} ${st.label}`} color={st.color} />
                  </div>
                  {selected.daysOpen>=3&&st.label!=='Resolved'&&<span style={{ background:'rgba(251,176,64,0.15)', color:T.amber, borderRadius:7, padding:'4px 10px', fontSize:11, fontWeight:700 }}>🔥 {selected.daysOpen}d open</span>}
                </div>

                <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'14px 16px', marginBottom:10, border:`1px solid ${T.border}` }}>
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
                  {st.label!=='Resolved' && (
                    <>
                      <Btn onClick={()=>handleDraft(selected)} disabled={replyLoading[selected.id]}>{replyLoading[selected.id]?'⏳ Drafting…':'✦ Draft Reply'}</Btn>
                      <Btn variant="green" onClick={()=>handleResolve(selected)} disabled={resolveLoading[selected.id]}>
                        {resolveLoading[selected.id]?'⏳ Posting…':'✅ Mark RESOLVED'}
                      </Btn>
                    </>
                  )}
                </div>

                {st.label!=='Resolved' && (
                  <DelegatePanel
                    slip={selected}
                    showToast={showToast}
                    onDone={member => logDecision({ type:'slip', query:selected.query?.slice(0,80), submittedBy:selected.submittedBy, department:selected.department, action:`Delegated to ${member.name}` })}
                  />
                )}

                <CoachPanel content={coaching[selected.id]} loading={coachLoading[selected.id]} />
                <ReplyPanel
                  draft={reply[selected.id]} loading={replyLoading[selected.id]}
                  onCopy={()=>navigator.clipboard.writeText(reply[selected.id]).catch(()=>{})}
                  onDiscard={()=>setReply(p=>({...p,[selected.id]:''}))}
                  label="REPLY DRAFT — copy and post in Slack thread"
                />
              </>
            )
          })() : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:T.textDim }}>Select a slip</div>}
        </div>
      </div>
    </div>
  )
}
