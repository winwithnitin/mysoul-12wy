import { useState, useEffect, useCallback } from 'react'
import { T, EMAIL_CATS } from '../tokens.js'
import { fetchEmails, callClaude } from '../utils/api.js'
import { classifyEmail } from '../utils/classify.js'
import { Pill, LoadingCard, ErrorCard, CoachPanel, ReplyPanel, Btn, SidebarBtn, Toast, StatChip } from './UI.jsx'

export default function GmailTab({ decisions, logDecision }) {
  const [emails, setEmails]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [selected, setSelected]         = useState(null)
  const [filter, setFilter]             = useState('All')
  const [search, setSearch]             = useState('')
  const [coaching, setCoaching]         = useState({})
  const [coachLoading, setCoachLoading] = useState({})
  const [reply, setReply]               = useState({})
  const [replyLoading, setReplyLoading] = useState({})
  const [forwarded, setForwarded]       = useState({})
  const [triaged, setTriaged]           = useState({})
  const [toast, setToast]               = useState('')

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const raw = await fetchEmails()
      const enriched = raw.map(e => ({ ...e, meta: classifyEmail(e.from, e.email, e.subject, e.preview) }))
      setEmails(enriched)
      setSelected(enriched[0] || null)
    } catch (err) {
      setError('Could not load Gmail: ' + err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCoach = async (email) => {
    if (coaching[email.id]) return
    setCoachLoading(p => ({ ...p, [email.id]: true }))
    const pastCtx = decisions.filter(d => d.type === 'email').slice(-5).map(d => d.action).join(', ')
    const r = await callClaude(
      `You are Nitin Sachdeva's blunt business coach. MySoulSchool founder, ₹2.5L/month profit, target ₹7L.
For each email give exactly 4 lines:
DECISION: What needs to happen (1 sentence, direct)
OWNER: Nitin / Varsha / Namita / Support / Mehakleen
TIMELINE: "2-min decision" / "Do today" / "This week" / "Delegate — not Nitin's job"
COACH: One blunt push. Max 120 words total. No preamble.`,
      `From: ${email.from} <${email.email}>\nSubject: ${email.subject}\n${email.preview}${pastCtx ? `\nPast decisions: ${pastCtx}` : ''}`
    )
    setCoaching(p => ({ ...p, [email.id]: r }))
    setCoachLoading(p => ({ ...p, [email.id]: false }))
  }

  const handleDraft = async (email) => {
    setReplyLoading(p => ({ ...p, [email.id]: true }))
    const r = await callClaude(
      email.meta?.isStudent
        ? 'Draft a warm 3-sentence holding reply from Nitin to a student who emailed him directly about account access. Tell them support@mysoulschool.in is correct and team notified. Warm, brief.'
        : 'Draft a reply for Nitin Sachdeva, MySoulSchool founder. Direct, warm, 3-4 sentences. No preamble.',
      `From: ${email.from}\nSubject: ${email.subject}\n${email.preview}`
    )
    setReply(p => ({ ...p, [email.id]: r }))
    setReplyLoading(p => ({ ...p, [email.id]: false }))
  }

  const cats = ['All', ...Object.keys(EMAIL_CATS)]
  const filtered = emails.filter(e => {
    const q = search.toLowerCase()
    if (q && !e.from?.toLowerCase().includes(q) && !e.subject?.toLowerCase().includes(q)) return false
    return filter === 'All' || e.meta?.category === filter
  })

  const urgentCount = emails.filter(e => e.meta?.priority === 'HIGH').length
  const unreadCount = emails.filter(e => !e.read).length

  if (loading) return <LoadingCard msg="Fetching your Gmail inbox…" />
  if (error)   return <ErrorCard msg={error} onRetry={load} />

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {toast && <Toast msg={toast} />}

      {/* Sidebar */}
      <div style={{ width:160, background:T.surface, borderRight:`1px solid ${T.border}`, padding:'10px 7px', flexShrink:0, overflowY:'auto' }}>
        <div style={{ fontSize:10, color:T.textDim, fontWeight:700, letterSpacing:1, padding:'0 4px 8px', textTransform:'uppercase' }}>Categories</div>
        {cats.map(c => {
          const count = c === 'All' ? emails.length : emails.filter(e => e.meta?.category === c).length
          return <SidebarBtn key={c} active={filter===c} onClick={() => setFilter(c)} count={count}>{c}</SidebarBtn>
        })}
        <div style={{ height:1, background:T.border, margin:'8px 0' }} />
        <div style={{ fontSize:10.5, color:T.textDim, padding:'0 4px' }}>
          <div>🔴 {urgentCount} urgent</div>
          <div style={{ marginTop:3 }}>📭 {unreadCount} unread</div>
        </div>
        <div style={{ height:1, background:T.border, margin:'8px 0' }} />
        <Btn variant="ghost" onClick={load} style={{ width:'100%', fontSize:11 }}>↺ Refresh</Btn>
      </div>

      {/* List */}
      <div style={{ width:295, borderRight:`1px solid ${T.border}`, overflowY:'auto', flexShrink:0 }}>
        <div style={{ padding:'8px 10px', borderBottom:`1px solid ${T.border}` }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:7, padding:'6px 10px', color:T.text, fontSize:12, outline:'none' }} />
        </div>
        {filtered.length === 0
          ? <div style={{ padding:20, color:T.textDim, fontSize:12, textAlign:'center' }}>No emails</div>
          : filtered.map(e => {
            const cat = EMAIL_CATS[e.meta?.category] || EMAIL_CATS['⚙️ Platform']
            return (
              <div key={e.id} onClick={() => { setSelected(e); handleCoach(e) }}
                style={{ padding:'10px 12px', background:selected?.id===e.id?T.surfaceHigh:'transparent', borderLeft:selected?.id===e.id?`3px solid ${T.gold}`:'3px solid transparent', cursor:'pointer', borderBottom:`1px solid ${T.border}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:12.5, fontWeight:e.read?400:700, color:T.text }}>{e.from}</span>
                  <span style={{ fontSize:10.5, color:T.textDim }}>{e.time}</span>
                </div>
                <div style={{ fontSize:11.5, color:'#C4B5FD', fontWeight:e.read?400:600, marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.subject}</div>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  <Pill label={e.meta?.category||'⚙️ Platform'} color={cat.color} bg={cat.bg} />
                  {e.isStudentIssue && <Pill label="⚠️ Student DM" color={T.red} bg="rgba(239,68,68,0.1)" />}
                </div>
              </div>
            )
          })}
      </div>

      {/* Detail */}
      <div style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>
        {selected ? (
          <>
            <h2 style={{ fontSize:15, fontWeight:700, color:T.text, margin:'0 0 8px' }}>{selected.subject}</h2>
            <div style={{ fontSize:11.5, color:T.textMid, marginBottom:12, display:'flex', gap:10, flexWrap:'wrap' }}>
              <span>From: <span style={{ color:'#C4B5FD' }}>{selected.from}</span></span>
              <span>•</span><span>{selected.email}</span><span>•</span><span>{selected.time}</span>
            </div>

            {selected.meta?.isStudent && (
              <div style={{ background:'rgba(185,28,28,0.1)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
                <div style={{ fontSize:11.5, fontWeight:700, color:'#FCA5A5', marginBottom:6 }}>⚠️ STUDENT EMAILED YOU DIRECTLY</div>
                <div style={{ fontSize:12, color:T.textMid, marginBottom:10 }}>Route this — one click: draft reply + alert support.</div>
                {triaged[selected.id]
                  ? <Pill label="✅ Triaged" color={T.green} />
                  : <Btn variant="danger" onClick={async () => { await handleDraft(selected); setTriaged(p => ({...p,[selected.id]:true})); showToast('✅ Reply drafted — forward to support@mysoulschool.in') }}>
                      ⚡ Triage → Draft Reply
                    </Btn>}
              </div>
            )}

            <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:'14px 16px', fontSize:13, color:'#D1D5DB', lineHeight:1.8, marginBottom:14, border:`1px solid ${T.border}` }}>
              {selected.preview}
            </div>

            <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:4 }}>
              {!selected.meta?.isStudent && <Btn onClick={() => handleDraft(selected)}>✦ Draft Reply</Btn>}
              <Btn variant="blue" onClick={() => {}}>📤 Forward to Team</Btn>
              <Btn variant="gold" onClick={() => { logDecision({ type:'email', query:selected.subject, from:selected.from, category:selected.meta?.category, action:'Delegated' }); showToast('Logged: Delegated') }}>Delegated</Btn>
              <Btn variant="green" onClick={() => { logDecision({ type:'email', query:selected.subject, from:selected.from, category:selected.meta?.category, action:'Resolved' }); showToast('✅ Done') }}>✅ Done</Btn>
              <Btn variant="ghost" onClick={() => { logDecision({ type:'email', query:selected.subject, action:'Archived' }); showToast('Archived') }}>Archive</Btn>
            </div>

            {forwarded[selected.id] && <div style={{ fontSize:11.5, color:T.green, marginBottom:8 }}>✅ Forwarded to {forwarded[selected.id]}</div>}
            <CoachPanel content={coaching[selected.id]} loading={coachLoading[selected.id]} />
            <ReplyPanel
              draft={reply[selected.id]} loading={replyLoading[selected.id]}
              onCopy={() => { navigator.clipboard.writeText(reply[selected.id]).catch(() => {}); showToast('Copied!') }}
              onDiscard={() => setReply(p => ({ ...p, [selected.id]:'' }))}
              label={selected.meta?.isStudent ? `HOLDING REPLY → ${selected.email}` : 'REPLY DRAFT'}
            />
          </>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:T.textDim }}>Select an email</div>
        )}
      </div>
    </div>
  )
}
