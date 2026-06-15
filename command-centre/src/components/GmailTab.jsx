import { useState, useEffect, useCallback } from 'react'
import { T, EMAIL_CATS } from '../tokens.js'
import { fetchEmails, callClaude } from '../utils/api.js'
import { classifyEmail } from '../utils/classify.js'
import { TEAM_MEMBERS } from '../config.js'
import { Pill, LoadingCard, ErrorCard, CoachPanel, ReplyPanel, Btn, SidebarBtn, Toast } from './UI.jsx'

function ForwardPanel({ email, onDone, showToast }) {
  const [open, setOpen]     = useState(false)
  const [member, setMember] = useState(null)
  const [note, setNote]     = useState('')
  const [status, setStatus] = useState('idle')

  const go = async () => {
    if (!member) return
    setStatus('loading')
    try {
      const msg = await callClaude(
        `You are helping Nitin Sachdeva forward an email to ${member.name} (${member.role}) at ${member.email}.
Write a brief 2-sentence forward note from Nitin. Direct, no fluff.`,
        `Email from: ${email.from}\nSubject: ${email.subject}\nPreview: ${email.preview}\nNitin's note: ${note || 'Please handle this.'}`
      )
      setStatus('done')
      showToast(`✅ Forward drafted for ${member.name} — email them at ${member.email}`)
      onDone && onDone(member, msg)
      setTimeout(() => { setOpen(false); setStatus('idle'); setNote(''); setMember(null) }, 3000)
    } catch { setStatus('error') }
  }

  if (!open) return <Btn variant="blue" onClick={() => setOpen(true)}>📤 Forward to Team</Btn>

  return (
    <div style={{ background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.2)', borderRadius:10, padding:'14px 16px', marginTop:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:11.5, fontWeight:700, color:'#60A5FA' }}>📤 FORWARD TO TEAM</span>
        <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', color:T.textDim, cursor:'pointer', fontSize:15 }}>×</button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:10 }}>
        {TEAM_MEMBERS.map(m => (
          <button key={m.slackId} onClick={() => setMember(m)} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', background:member?.slackId===m.slackId?'rgba(59,130,246,0.2)':'rgba(255,255,255,0.03)', border:member?.slackId===m.slackId?'1px solid rgba(59,130,246,0.5)':`1px solid ${T.border}`, borderRadius:7, cursor:'pointer', textAlign:'left' }}>
            <span>{m.emoji}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:member?.slackId===m.slackId?'#93C5FD':T.text }}>{m.name}</div>
              <div style={{ fontSize:10.5, color:T.textDim }}>{m.role} · {m.email}</div>
            </div>
            {member?.slackId===m.slackId && <span style={{ color:'#60A5FA' }}>✓</span>}
          </button>
        ))}
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={member?`Note for ${member.name}…`:'Select recipient first…'} disabled={!member} rows={2}
        style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:7, padding:'7px 10px', color:T.text, fontSize:12, outline:'none', fontFamily:'inherit', resize:'none', marginBottom:10, opacity:member?1:0.5 }} />
      {member && (
        <div style={{ fontSize:11, color:T.textMid, background:'rgba(0,0,0,0.15)', borderRadius:6, padding:'7px 10px', marginBottom:10, lineHeight:1.6 }}>
          ✉️ AI drafts the forward note → you send to <span style={{ color:'#93C5FD' }}>{member.email}</span>
        </div>
      )}
      {status==='done'
        ? <div style={{ fontSize:12, color:T.green, fontWeight:600 }}>✅ Forward note drafted for {member?.name}</div>
        : <Btn onClick={go} disabled={!member||status==='loading'} variant={member?'primary':'ghost'}>
            {status==='loading'?'⏳ Drafting…':`📤 Forward to ${member?.name||'—'}`}
          </Btn>}
    </div>
  )
}

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
  const [forwardReply, setForwardReply] = useState({})
  const [triaged, setTriaged]           = useState({})
  const [toast, setToast]               = useState('')

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const raw = await fetchEmails()
      const enriched = raw.map(e => ({ ...e, meta: classifyEmail(e.from, e.email, e.subject, e.preview) }))
      setEmails(enriched); setSelected(enriched[0] || null)
    } catch (err) { setError('Could not load Gmail: ' + err.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCoach = async (email) => {
    if (coaching[email.id]) return
    setCoachLoading(p => ({ ...p, [email.id]: true }))
    const past = decisions.filter(d => d.type === 'email').slice(-5).map(d => d.action).join(', ')
    const r = await callClaude(
      `You are Nitin Sachdeva's blunt business coach. MySoulSchool founder, ₹2.5L/month profit, target ₹7L. W8 of 12WY.
Give exactly 4 lines — no preamble:
DECISION: What needs to happen (1 sentence)
OWNER: Nitin / Varsha / Namita / Support / Mehakleen
TIMELINE: "2-min decision" / "Do today" / "This week" / "Delegate — not Nitin's job"
COACH: One direct push. Max 120 words total.`,
      `From: ${email.from} <${email.email}>\nSubject: ${email.subject}\n${email.preview}${past ? `\nPast: ${past}` : ''}`
    )
    setCoaching(p => ({ ...p, [email.id]: r }))
    setCoachLoading(p => ({ ...p, [email.id]: false }))
  }

  const handleDraft = async (email) => {
    setReplyLoading(p => ({ ...p, [email.id]: true }))
    const r = await callClaude(
      email.meta?.isStudent
        ? 'Draft a warm 3-sentence reply from Nitin to a student who emailed him directly about account access. Tell them support@mysoulschool.in is correct and team is notified. Warm, brief, no preamble.'
        : 'Draft a reply for Nitin Sachdeva, MySoulSchool founder. Direct, warm, 3-4 sentences. No preamble or greeting line.',
      `From: ${email.from}\nSubject: ${email.subject}\n${email.preview}`
    )
    setReply(p => ({ ...p, [email.id]: r }))
    setReplyLoading(p => ({ ...p, [email.id]: false }))
  }

  const cats     = ['All', ...Object.keys(EMAIL_CATS)]
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
      <div style={{ width:160, background:T.surface, borderRight:`1px solid ${T.border}`, padding:'10px 7px', flexShrink:0, overflowY:'auto' }}>
        <div style={{ fontSize:10, color:T.textDim, fontWeight:700, letterSpacing:1, padding:'0 4px 8px', textTransform:'uppercase' }}>Categories</div>
        {cats.map(c => <SidebarBtn key={c} active={filter===c} onClick={() => setFilter(c)} count={c==='All'?emails.length:emails.filter(e=>e.meta?.category===c).length}>{c}</SidebarBtn>)}
        <div style={{ height:1, background:T.border, margin:'8px 0' }} />
        <div style={{ fontSize:10.5, color:T.textDim, padding:'0 4px' }}>
          <div>🔴 {urgentCount} urgent</div>
          <div style={{ marginTop:3 }}>📭 {unreadCount} unread</div>
        </div>
        <div style={{ height:1, background:T.border, margin:'8px 0' }} />
        <Btn variant="ghost" onClick={load} style={{ width:'100%', fontSize:11 }}>↺ Refresh</Btn>
      </div>

      <div style={{ width:295, borderRight:`1px solid ${T.border}`, overflowY:'auto', flexShrink:0 }}>
        <div style={{ padding:'8px 10px', borderBottom:`1px solid ${T.border}` }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:7, padding:'6px 10px', color:T.text, fontSize:12, outline:'none' }} />
        </div>
        {filtered.map(e => {
          const cat = EMAIL_CATS[e.meta?.category] || EMAIL_CATS['⚙️ Platform']
          return (
            <div key={e.id} onClick={() => { setSelected(e); handleCoach(e) }}
              style={{ padding:'10px 12px', background:selected?.id===e.id?T.listSelected:T.listItem, borderLeft:selected?.id===e.id?`3px solid ${T.gold}`:'3px solid transparent', cursor:'pointer', borderBottom:`1px solid ${T.border}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                <span style={{ fontSize:12.5, fontWeight:e.read?400:700, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{e.from}</span>
                <span style={{ fontSize:10.5, color:T.textDim, flexShrink:0, marginLeft:6 }}>{e.time}</span>
              </div>
              <div style={{ fontSize:11.5, color:'#C4B5FD', fontWeight:e.read?400:600, marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.subject}</div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                <Pill label={e.meta?.category||'⚙️ Platform'} color={cat.color} bg={cat.bg} />
                {e.meta?.isStudent && <Pill label="⚠️ Student DM" color={T.red} bg="rgba(239,68,68,0.1)" />}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>
        {selected ? (
          <>
            <h2 style={{ fontSize:15, fontWeight:700, color:T.text, margin:'0 0 8px' }}>{selected.subject}</h2>
            <div style={{ fontSize:11.5, color:T.textMid, marginBottom:12, display:'flex', gap:10, flexWrap:'wrap' }}>
              <span>From: <span style={{ color:'#C4B5FD' }}>{selected.from}</span></span>
              <span>•</span><span style={{ color:T.textDim }}>{selected.email}</span>
              <span>•</span><span>{selected.time}</span>
            </div>

            {selected.meta?.isStudent && (
              <div style={{ background:'rgba(185,28,28,0.12)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
                <div style={{ fontSize:11.5, fontWeight:700, color:'#FCA5A5', marginBottom:6 }}>⚠️ STUDENT EMAILED YOU DIRECTLY</div>
                {triaged[selected.id]
                  ? <Pill label="✅ Reply drafted — copy and send" color={T.green} />
                  : <Btn variant="danger" onClick={async () => { await handleDraft(selected); setTriaged(p=>({...p,[selected.id]:true})); showToast('✅ Reply drafted — copy below and send to student') }}>
                      ⚡ Draft Holding Reply
                    </Btn>}
              </div>
            )}

            <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'14px 16px', fontSize:13, color:T.textMid, lineHeight:1.8, marginBottom:14, border:`1px solid ${T.border}` }}>
              {selected.preview}
            </div>

            <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:4 }}>
              {!selected.meta?.isStudent && <Btn onClick={() => handleDraft(selected)} disabled={replyLoading[selected.id]}>{replyLoading[selected.id]?'⏳ Drafting…':'✦ Draft Reply'}</Btn>}
              <Btn variant="gold" onClick={() => { logDecision({ type:'email', query:selected.subject, from:selected.from, category:selected.meta?.category, action:'Delegated' }); showToast('📌 Logged as Delegated') }}>📌 Delegated</Btn>
              <Btn variant="green" onClick={() => { logDecision({ type:'email', query:selected.subject, from:selected.from, category:selected.meta?.category, action:'Done' }); showToast('✅ Logged as Done') }}>✅ Done</Btn>
              <Btn variant="ghost" onClick={() => { logDecision({ type:'email', query:selected.subject, action:'Archived' }); showToast('🗄 Logged as Archived — open Gmail to archive') }}>Archive</Btn>
            </div>

            <ForwardPanel
              email={selected}
              showToast={showToast}
              onDone={(member, draftMsg) => {
                logDecision({ type:'email', query:selected.subject, from:selected.from, action:`Forwarded to ${member.name}` })
                setForwardReply(p => ({ ...p, [selected.id]: draftMsg }))
              }}
            />

            {forwardReply[selected.id] && (
              <div style={{ background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.2)', borderRadius:10, padding:'12px 14px', marginTop:10 }}>
                <div style={{ fontSize:11, color:'#60A5FA', fontWeight:700, marginBottom:6 }}>✦ FORWARD NOTE — copy and include in your email</div>
                <div style={{ fontSize:12.5, color:T.textMid, lineHeight:1.7, whiteSpace:'pre-line' }}>{forwardReply[selected.id]}</div>
                <Btn variant="blue" onClick={() => navigator.clipboard.writeText(forwardReply[selected.id]).catch(()=>{})} style={{ marginTop:8 }}>Copy Note</Btn>
              </div>
            )}

            <CoachPanel content={coaching[selected.id]} loading={coachLoading[selected.id]} />
            <ReplyPanel
              draft={reply[selected.id]} loading={replyLoading[selected.id]}
              onCopy={() => { navigator.clipboard.writeText(reply[selected.id]).catch(()=>{}); showToast('📋 Copied — paste into Gmail') }}
              onDiscard={() => setReply(p => ({ ...p, [selected.id]:'' }))}
              label={selected.meta?.isStudent ? `HOLDING REPLY → ${selected.email}` : 'REPLY DRAFT — copy and send from Gmail'}
            />
          </>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:T.textDim }}>Select an email</div>
        )}
      </div>
    </div>
  )
}
