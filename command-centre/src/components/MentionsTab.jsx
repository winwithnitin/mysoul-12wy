import { useState, useEffect, useCallback } from 'react'
import { T, MENTION_CATS } from '../tokens.js'
import { fetchMentions, callClaude } from '../utils/api.js'
import { classifyMention } from '../utils/classify.js'
import { Pill, LoadingCard, ErrorCard, CoachPanel, ReplyPanel, Btn, SidebarBtn, Toast } from './UI.jsx'

export default function MentionsTab({ decisions, logDecision }) {
  const [mentions, setMentions]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [selected, setSelected]         = useState(null)
  const [filter, setFilter]             = useState('All')
  const [coaching, setCoaching]         = useState({})
  const [coachLoading, setCoachLoading] = useState({})
  const [reply, setReply]               = useState({})
  const [replyLoading, setReplyLoading] = useState({})
  const [toast, setToast]               = useState('')

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const raw = await fetchMentions()
      setMentions(raw.map(m => ({ ...m, category: classifyMention(m.text) })))
      setSelected(raw[0] || null)
    } catch (err) {
      setError('Could not load Slack mentions: ' + err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCoach = async (m) => {
    if (coaching[m.id]) return
    setCoachLoading(p => ({ ...p, [m.id]: true }))
    const r = await callClaude(
      'You are Nitin\'s coach. He was tagged in Slack. In exactly 3 lines: (1) What action from him specifically, (2) How long it should take, (3) Now or batch it for later.',
      `Channel: ${m.channel}\nFrom: ${m.sender}\n${m.text}`
    )
    setCoaching(p => ({ ...p, [m.id]: r }))
    setCoachLoading(p => ({ ...p, [m.id]: false }))
  }

  const handleDraft = async (m) => {
    setReplyLoading(p => ({ ...p, [m.id]: true }))
    const r = await callClaude(
      'Draft a brief Slack reply from Nitin Sachdeva. Direct, founder tone. Max 2 sentences. No greeting.',
      `Channel: ${m.channel}\nFrom: ${m.sender}\n${m.text}`
    )
    setReply(p => ({ ...p, [m.id]: r }))
    setReplyLoading(p => ({ ...p, [m.id]: false }))
  }

  const cats     = ['All', ...Object.keys(MENTION_CATS)]
  const channels = [...new Set(mentions.map(m => m.channel))]
  const filtered = mentions.filter(m => filter === 'All' || m.category === filter)

  if (loading) return <LoadingCard msg="Fetching your Slack @mentions…" />
  if (error)   return <ErrorCard msg={error} onRetry={load} />

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {toast && <Toast msg={toast} />}

      {/* Sidebar */}
      <div style={{ width:160, background:T.surface, borderRight:`1px solid ${T.border}`, padding:'10px 7px', flexShrink:0, overflowY:'auto' }}>
        <div style={{ fontSize:10, color:T.textDim, fontWeight:700, letterSpacing:1, padding:'0 4px 8px', textTransform:'uppercase' }}>Category</div>
        {cats.map(c => (
          <SidebarBtn key={c} active={filter===c} onClick={() => setFilter(c)} count={c==='All'?mentions.length:mentions.filter(m=>m.category===c).length}>{c}</SidebarBtn>
        ))}
        <div style={{ height:1, background:T.border, margin:'8px 0' }} />
        <div style={{ fontSize:10, color:T.textDim, fontWeight:700, letterSpacing:1, padding:'0 4px 6px', textTransform:'uppercase' }}>Channels</div>
        {channels.map(ch => <div key={ch} style={{ fontSize:11, color:T.textMid, padding:'3px 8px' }}>{ch}</div>)}
        <div style={{ marginTop:8, padding:'6px 8px', background:'rgba(124,92,191,0.08)', borderRadius:6, border:`1px solid ${T.violet}22` }}>
          <div style={{ fontSize:10, color:T.textDim, lineHeight:1.5 }}>
            <span style={{ color:T.violet, fontWeight:700 }}>#help-slip</span> excluded — see Tab 2
          </div>
        </div>
        <div style={{ height:1, background:T.border, margin:'8px 0' }} />
        <Btn variant="ghost" onClick={load} style={{ width:'100%', fontSize:11 }}>↺ Refresh</Btn>
      </div>

      {/* List */}
      <div style={{ width:280, borderRight:`1px solid ${T.border}`, overflowY:'auto', flexShrink:0 }}>
        {filtered.length === 0
          ? <div style={{ padding:20, color:T.textDim, fontSize:12, textAlign:'center' }}>No mentions found</div>
          : filtered.map(m => {
            const cs = MENTION_CATS[m.category] || MENTION_CATS['💬 FYI']
            return (
              <div key={m.id} onClick={() => { setSelected(m); handleCoach(m) }}
                style={{ padding:'10px 12px', background:selected?.id===m.id?T.surfaceHigh:'transparent', borderLeft:selected?.id===m.id?`3px solid ${T.gold}`:'3px solid transparent', cursor:'pointer', borderBottom:`1px solid ${T.border}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:12.5, fontWeight:600, color:T.text }}>{m.sender}</span>
                  <span style={{ fontSize:10.5, color:T.textDim }}>{m.time}</span>
                </div>
                <div style={{ fontSize:11, color:T.gold, fontWeight:600, marginBottom:3 }}>{m.channel}</div>
                <div style={{ fontSize:11.5, color:T.textMid, marginBottom:4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{m.text}</div>
                <Pill label={m.category} color={cs.color} />
              </div>
            )
          })}
      </div>

      {/* Detail */}
      <div style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>
        {selected ? (
          <>
            <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
              <Pill label={selected.channel} color={T.gold} bg={T.goldDim} />
              <Pill label={selected.category} color={MENTION_CATS[selected.category]?.color||T.blue} />
            </div>
            <div style={{ fontSize:13, fontWeight:700, color:T.textMid, marginBottom:4 }}>From: <span style={{ color:'#C4B5FD' }}>{selected.sender}</span></div>
            <div style={{ fontSize:11.5, color:T.textDim, marginBottom:12 }}>{selected.time}</div>
            <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:'14px 16px', fontSize:13, color:T.text, lineHeight:1.8, marginBottom:14, border:`1px solid ${T.border}` }}>
              {selected.text}
            </div>
            <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:4 }}>
              <Btn onClick={() => handleDraft(selected)}>✦ Draft Reply</Btn>
              <Btn variant="green" onClick={() => { logDecision({ type:'mention', channel:selected.channel, from:selected.sender, action:'Responded' }); showToast('✅ Logged') }}>✅ Responded</Btn>
              <Btn variant="ghost" onClick={() => { logDecision({ type:'mention', channel:selected.channel, from:selected.sender, action:'Delegated' }); showToast('Logged: Delegated') }}>Delegate</Btn>
            </div>
            <CoachPanel content={coaching[selected.id]} loading={coachLoading[selected.id]} />
            <ReplyPanel
              draft={reply[selected.id]} loading={replyLoading[selected.id]}
              onCopy={() => navigator.clipboard.writeText(reply[selected.id]).catch(() => {})}
              onDiscard={() => setReply(p => ({ ...p, [selected.id]:'' }))}
              label={`REPLY → ${selected.channel}`}
            />
          </>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:T.textDim }}>Select a mention</div>
        )}
      </div>
    </div>
  )
}
