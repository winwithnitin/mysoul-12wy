import { useState } from 'react'
import { T } from './tokens.js'
import { useDecisionLog } from './hooks/useDecisionLog.js'
import GmailTab        from './components/GmailTab.jsx'
import HelpSlipsTab    from './components/HelpSlipsTab.jsx'
import MentionsTab     from './components/MentionsTab.jsx'
import SchedulerTab    from './components/SchedulerTab.jsx'
import WeeklyReviewTab from './components/WeeklyReviewTab.jsx'

const TABS = [
  { id:'gmail',    label:'📧 Gmail' },
  { id:'slips',    label:'🆘 Help Slips' },
  { id:'mentions', label:'💬 Mentions' },
  { id:'scheduler',label:'📅 Daily Scheduler' },
  { id:'review',   label:'📊 Weekly Review', badge:'FRI' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('gmail')
  const { decisions, logDecision, getPatterns } = useDecisionLog()

  return (
    <div style={{ background:T.bg, height:'100vh', fontFamily:"'Inter',system-ui,sans-serif", color:T.text, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Top bar — clean, no status badges */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:'0 20px', display:'flex', alignItems:'center', justifyContent:'space-between', height:48, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:28, height:28, borderRadius:8, background:`linear-gradient(135deg,${T.violet},${T.gold})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800 }}>✦</div>
          <span style={{ fontWeight:800, fontSize:15, letterSpacing:0.2 }}>MySoul Command Centre</span>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {decisions.length > 0 && (
            <span style={{ fontSize:11, color:T.gold, background:T.goldDim, borderRadius:6, padding:'2px 9px', border:`1px solid ${T.gold}33` }}>
              {decisions.length} decisions logged
            </span>
          )}
          <span style={{ fontSize:11, color:T.textDim }}>nitin@mysoulschool.in</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:'0 20px', display:'flex', gap:0, flexShrink:0, overflowX:'auto' }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ background:'transparent', border:'none', borderBottom:active?`2px solid ${T.gold}`:'2px solid transparent', padding:'12px 18px', color:active?T.gold:T.textMid, cursor:'pointer', fontSize:13, fontWeight:active?700:400, display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', flexShrink:0, transition:'color 0.15s' }}>
              {tab.label}
              {tab.badge && <span style={{ background:T.goldDim, color:T.gold, borderRadius:6, padding:'1px 7px', fontSize:10, fontWeight:700, border:`1px solid ${T.gold}44` }}>{tab.badge}</span>}
            </button>
          )
        })}
      </div>

      <div style={{ flex:1, overflow:'hidden' }}>
        {activeTab==='gmail'     && <GmailTab       decisions={decisions} logDecision={logDecision} />}
        {activeTab==='slips'     && <HelpSlipsTab   decisions={decisions} logDecision={logDecision} />}
        {activeTab==='mentions'  && <MentionsTab    decisions={decisions} logDecision={logDecision} />}
        {activeTab==='scheduler' && <SchedulerTab   decisions={decisions} logDecision={logDecision} getPatterns={getPatterns} />}
        {activeTab==='review'    && <WeeklyReviewTab decisions={decisions} getPatterns={getPatterns} />}
      </div>
    </div>
  )
}
