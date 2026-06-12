import { useState } from 'react'
import { T } from '../tokens.js'

export const Pill = ({ label, color, bg }) => (
  <span style={{ background: bg || color+'22', color, border:`1px solid ${color}44`, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>
    {label}
  </span>
)

export const Divider = () => <div style={{ height:1, background:T.border, margin:'10px 0' }} />

export const Toast = ({ msg }) => (
  <div style={{ position:'fixed', bottom:20, right:20, background:'#065F46', color:'#6EE7B7', borderRadius:8, padding:'10px 16px', fontSize:12, fontWeight:600, zIndex:9999, maxWidth:360, boxShadow:'0 4px 24px rgba(0,0,0,0.5)' }}>
    {msg}
  </div>
)

export const Spinner = () => (
  <>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    <div style={{ width:28, height:28, borderRadius:'50%', border:`3px solid ${T.violet}`, borderTopColor:'transparent', animation:'spin 1s linear infinite' }} />
  </>
)

export function LoadingCard({ msg }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:14 }}>
      <Spinner />
      <div style={{ fontSize:13, color:T.textMid }}>{msg}</div>
    </div>
  )
}

export function ErrorCard({ msg, onRetry }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12 }}>
      <div style={{ fontSize:24 }}>⚠️</div>
      <div style={{ fontSize:13, color:T.red, textAlign:'center', maxWidth:320, lineHeight:1.6 }}>{msg}</div>
      {onRetry && <Btn onClick={onRetry} variant="ghost">↺ Retry</Btn>}
    </div>
  )
}

export function CoachPanel({ content, loading }) {
  if (!loading && !content) return null
  return (
    <div style={{ background:T.goldDim, border:`1px solid ${T.gold}44`, borderRadius:10, padding:'12px 14px', marginTop:12 }}>
      <div style={{ fontSize:11, color:T.gold, fontWeight:700, letterSpacing:0.5, marginBottom:8 }}>✦ COACH ANALYSIS</div>
      {loading
        ? <div style={{ fontSize:12, color:T.textMid }}>Analysing…</div>
        : <div style={{ fontSize:12.5, color:'#E8D9A0', lineHeight:1.8, whiteSpace:'pre-line' }}>{content}</div>}
    </div>
  )
}

export function ReplyPanel({ draft, loading, onCopy, onDiscard, label }) {
  if (!loading && !draft) return null
  return (
    <div style={{ background:T.violetDim, border:`1px solid ${T.violet}44`, borderRadius:10, padding:'12px 14px', marginTop:12 }}>
      <div style={{ fontSize:11, color:T.violet, fontWeight:700, letterSpacing:0.5, marginBottom:8 }}>✦ {label || 'REPLY DRAFT'}</div>
      {loading
        ? <div style={{ fontSize:12, color:T.textMid }}>Drafting…</div>
        : <>
            <textarea defaultValue={draft} rows={4} style={{ width:'100%', background:'transparent', border:'none', color:'#D1D5DB', fontSize:12.5, lineHeight:1.7, resize:'vertical', outline:'none', fontFamily:'inherit' }} />
            <div style={{ display:'flex', gap:7, marginTop:8 }}>
              <Btn onClick={onCopy}>Copy</Btn>
              <Btn variant="ghost" onClick={onDiscard}>Discard</Btn>
            </div>
          </>}
    </div>
  )
}

export function StatChip({ label, value, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <span style={{ fontSize:20, fontWeight:800, color }}>{value}</span>
      <span style={{ fontSize:11, color:T.textDim, lineHeight:1.3 }}>{label}</span>
    </div>
  )
}

export function Btn({ onClick, children, variant='primary', disabled, style: extraStyle }) {
  const S = {
    primary: { background:`linear-gradient(135deg,${T.violet},#5B3EA6)`, color:'#fff', border:'none' },
    gold:    { background:`linear-gradient(135deg,${T.gold},#B8872A)`,   color:'#0B0A15', border:'none' },
    danger:  { background:'rgba(239,68,68,0.15)', color:T.red,   border:'1px solid rgba(239,68,68,0.3)' },
    ghost:   { background:'rgba(255,255,255,0.05)', color:T.textMid, border:`1px solid ${T.border}` },
    green:   { background:'rgba(16,185,129,0.15)', color:T.green, border:'1px solid rgba(16,185,129,0.3)' },
    blue:    { background:'rgba(59,130,246,0.12)', color:'#60A5FA', border:'1px solid rgba(59,130,246,0.25)' },
    amber:   { background:'rgba(245,158,11,0.12)', color:T.amber, border:'1px solid rgba(245,158,11,0.25)' },
  }
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...S[variant], borderRadius:7, padding:'6px 14px', fontSize:11.5, fontWeight:600,
               cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.5:1,
               transition:'opacity 0.15s', ...extraStyle }}>
      {children}
    </button>
  )
}

export function SidebarBtn({ active, onClick, children, count }) {
  return (
    <button onClick={onClick} style={{
      width:'100%', textAlign:'left',
      background: active ? T.violetDim : 'transparent',
      border:     active ? `1px solid ${T.violet}44` : '1px solid transparent',
      borderRadius:7, padding:'6px 9px',
      color: active ? '#C4B5FD' : T.textMid,
      cursor:'pointer', fontSize:11.5, fontWeight:active?600:400,
      display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2,
      transition:'all 0.12s',
    }}>
      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{children}</span>
      {count !== undefined && <span style={{ fontSize:10, opacity:0.6, flexShrink:0, marginLeft:4 }}>{count}</span>}
    </button>
  )
}

// Forward panel for email forwarding
export function ForwardPanel({ email, onDone }) {
  const [open, setOpen] = useState(false)
  const [member, setMember] = useState(null)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('idle')

  const { TEAM_MEMBERS } = require('../config.js')

  const go = async () => {
    if (!member) return
    setStatus('loading')
    try {
      const { callClaude } = await import('../utils/api.js')
      await callClaude(
        `Create a Gmail forward draft to ${member.email} and send a Slack DM to ${member.slackId}.`,
        `Forward email from ${email.from} <${email.email}>\nSubject: ${email.subject}\nPreview: ${email.preview}\nTo: ${member.name} (${member.email})\nNote: ${note || 'Please handle this.'}`
      )
      setStatus('done')
      onDone && onDone(member)
      setTimeout(() => { setOpen(false); setStatus('idle'); setNote(''); setMember(null) }, 2500)
    } catch { setStatus('error') }
  }

  if (!open) return <Btn variant="blue" onClick={() => setOpen(true)}>📤 Forward to Team</Btn>

  return (
    <div style={{ background:'rgba(59,130,246,0.07)', border:'1px solid rgba(59,130,246,0.2)', borderRadius:10, padding:'14px 16px', marginTop:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:11.5, fontWeight:700, color:'#60A5FA' }}>📤 FORWARD TO TEAM</span>
        <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', color:T.textDim, cursor:'pointer', fontSize:15 }}>×</button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:10 }}>
        {TEAM_MEMBERS.map(m => (
          <button key={m.slackId} onClick={() => setMember(m)} style={{
            display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
            background: member?.slackId===m.slackId ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
            border: member?.slackId===m.slackId ? '1px solid rgba(59,130,246,0.5)' : `1px solid ${T.border}`,
            borderRadius:7, cursor:'pointer', textAlign:'left',
          }}>
            <span>{m.emoji}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:member?.slackId===m.slackId?'#93C5FD':T.text }}>{m.name}</div>
              <div style={{ fontSize:10.5, color:T.textDim }}>{m.hint}</div>
            </div>
            {member?.slackId===m.slackId && <span style={{ color:'#60A5FA' }}>✓</span>}
          </button>
        ))}
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)}
        placeholder={member ? `Note for ${member.name}…` : 'Select recipient first…'}
        disabled={!member} rows={2}
        style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, borderRadius:7, padding:'7px 10px', color:T.text, fontSize:12, outline:'none', fontFamily:'inherit', resize:'none', marginBottom:10, opacity:member?1:0.5 }} />
      {member && (
        <div style={{ fontSize:11, color:T.textMid, background:'rgba(0,0,0,0.2)', borderRadius:6, padding:'7px 10px', marginBottom:10, lineHeight:1.6 }}>
          ✉️ Gmail draft → {member.email} (with attachments)<br/>
          💬 Slack DM → {member.name}
        </div>
      )}
      {status === 'done'
        ? <div style={{ fontSize:12, color:T.green, fontWeight:600 }}>✅ Forwarded to {member?.name}</div>
        : <Btn onClick={go} disabled={!member||status==='loading'} variant={member?'primary':'ghost'}>
            {status==='loading' ? '⏳ Forwarding…' : `📤 Forward to ${member?.name||'—'}`}
          </Btn>}
    </div>
  )
}
