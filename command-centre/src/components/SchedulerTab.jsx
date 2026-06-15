import { useState, useEffect, useCallback } from 'react'
import { T, TYPE_COLORS, SRC_COLORS, KANBAN_COLS } from '../tokens.js'
import { fetchTodoist, fetch12WY, callClaude, updateTodoistDueDate } from '../utils/api.js'
import { inferTaskTags, isOverdue, daysOverdue } from '../utils/classify.js'
import { Pill, LoadingCard, Btn, StatChip, Toast } from './UI.jsx'

// ─── Overdue Date Picker ──────────────────────────────────────────────────────
function OverdueReschedule({ task, onRescheduled, showToast }) {
  const [loading, setLoading] = useState(false)
  const dates = [
    { label: 'Today',     value: new Date().toISOString().slice(0,10) },
    { label: 'Tomorrow',  value: new Date(Date.now()+86400000).toISOString().slice(0,10) },
    { label: 'This week', value: new Date(Date.now()+3*86400000).toISOString().slice(0,10) },
    { label: 'Next week', value: new Date(Date.now()+7*86400000).toISOString().slice(0,10) },
  ]
  const pick = async (date) => {
    setLoading(true)
    const ok = await updateTodoistDueDate(task.id, date)
    if (ok) { showToast(`📅 Rescheduled to ${date}`); onRescheduled(task.id, date) }
    else showToast('⚠️ Could not update Todoist — check API token')
    setLoading(false)
  }
  return (
    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:6 }}>
      {dates.map(d => (
        <button key={d.value} onClick={() => pick(d.value)} disabled={loading}
          style={{ background:'rgba(251,176,64,0.1)', color:T.amber, border:'1px solid rgba(251,176,64,0.25)', borderRadius:5, padding:'2px 8px', fontSize:10.5, cursor:'pointer', fontWeight:500 }}>
          {loading ? '…' : `→ ${d.label}`}
        </button>
      ))}
    </div>
  )
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────
function KanbanCard({ task, colId, onMove, onComplete }) {
  const [dragging, setDragging] = useState(false)
  const tc  = TYPE_COLORS[task.tags?.type] || TYPE_COLORS['Ops']
  const src = SRC_COLORS[task.source] || SRC_COLORS.manual
  const movableCols = KANBAN_COLS.filter(c => c.id !== colId && c.id !== 'done')

  return (
    <div draggable
      onDragStart={e => { e.dataTransfer.setData('taskId', task.id); setDragging(true) }}
      onDragEnd={() => setDragging(false)}
      style={{ background:dragging?'rgba(155,127,232,0.12)':T.surfaceHigh, border:`1px solid ${T.border}`, borderLeft:`3px solid ${tc.color}`, borderRadius:9, padding:'10px 12px', marginBottom:7, cursor:'grab', opacity:dragging?0.5:1, transition:'all 0.15s' }}>
      <div style={{ fontSize:12.5, color:T.text, marginBottom:5, lineHeight:1.4 }}>{task.content}</div>
      <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
        <Pill label={src.label} color={src.color} bg={src.bg} />
        <Pill label={task.tags?.type||'Ops'} color={tc.color} bg={tc.bg} />
        {task.tags?.owner==='Delegatable' && <Pill label="→ Delegatable" color={T.amber} bg="rgba(251,176,64,0.1)" />}
        {task.source==='12wy' && task.label && <Pill label={task.label} color={T.violet} bg={T.violetDim} />}
      </div>
      <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
        {colId !== 'done' && (
          <button onClick={() => onComplete(task.id)}
            style={{ background:'rgba(52,211,153,0.12)', color:T.green, border:'none', borderRadius:5, padding:'3px 8px', fontSize:10.5, cursor:'pointer', fontWeight:600 }}>
            ✓ Done
          </button>
        )}
        {movableCols.map(col => (
          <button key={col.id} onClick={() => onMove(task.id, col.id)}
            style={{ background:'rgba(255,255,255,0.05)', color:T.textMid, border:`1px solid ${T.border}`, borderRadius:5, padding:'3px 7px', fontSize:10, cursor:'pointer' }}>
            → {col.label.replace(/^[^\s]+\s/, '')}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────
function KanbanColumn({ col, tasks, onMove, onComplete, onAdd }) {
  const [dragOver, setDragOver] = useState(false)
  const [newText, setNewText]   = useState('')
  const [adding, setAdding]     = useState(false)
  const isIdeas = col.id === 'ideas'

  const handleDrop = e => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) onMove(taskId, col.id)
    setDragOver(false)
  }

  return (
    <div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}
      style={{ flex:1, minWidth:180, background:dragOver?'rgba(155,127,232,0.05)':T.surface, border:`1px solid ${dragOver?T.violet:T.border}`, borderTop:`3px solid ${col.color}`, borderRadius:10, padding:'12px 10px', display:'flex', flexDirection:'column', maxHeight:'100%', transition:'all 0.15s', opacity:isIdeas?0.85:1 }}>
      <div style={{ marginBottom:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
          <span style={{ fontSize:12.5, fontWeight:700, color:col.color }}>{col.label}</span>
          <span style={{ fontSize:10.5, color:T.textDim, background:'rgba(255,255,255,0.06)', borderRadius:10, padding:'1px 7px' }}>{tasks.length}</span>
        </div>
        <div style={{ fontSize:10.5, color:T.textDim, lineHeight:1.4 }}>{col.desc}</div>
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {tasks.map(t => <KanbanCard key={t.id} task={t} colId={col.id} onMove={onMove} onComplete={onComplete} />)}
      </div>
      {!isIdeas && (
        <div style={{ marginTop:6 }}>
          {adding ? (
            <>
              <input autoFocus value={newText} onChange={e=>setNewText(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&newText.trim()){onAdd(col.id,newText.trim());setNewText('');setAdding(false)} if(e.key==='Escape'){setAdding(false);setNewText('')} }}
                placeholder="Type + Enter…"
                style={{ width:'100%', background:'rgba(255,255,255,0.07)', border:`1px solid ${col.color}44`, borderRadius:6, padding:'6px 9px', color:T.text, fontSize:12, outline:'none', fontFamily:'inherit', marginBottom:4 }} />
              <div style={{ display:'flex', gap:4 }}>
                <Btn onClick={()=>{if(newText.trim()){onAdd(col.id,newText.trim());setNewText('');setAdding(false)}}}>Add</Btn>
                <Btn variant="ghost" onClick={()=>{setAdding(false);setNewText('')}}>Cancel</Btn>
              </div>
            </>
          ) : (
            <button onClick={()=>setAdding(true)} style={{ width:'100%', background:'transparent', border:`1px dashed ${T.border}`, borderRadius:6, padding:'5px', fontSize:11, color:T.textDim, cursor:'pointer' }}>+ Add task</button>
          )}
        </div>
      )}
      {isIdeas && (
        <div style={{ marginTop:6 }}>
          {adding ? (
            <>
              <input autoFocus value={newText} onChange={e=>setNewText(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&newText.trim()){onAdd(col.id,newText.trim());setNewText('');setAdding(false)} if(e.key==='Escape'){setAdding(false);setNewText('')} }}
                placeholder="Capture idea + Enter…"
                style={{ width:'100%', background:'rgba(255,255,255,0.07)', border:`1px solid ${col.color}44`, borderRadius:6, padding:'6px 9px', color:T.text, fontSize:12, outline:'none', fontFamily:'inherit', marginBottom:4 }} />
              <Btn variant="gold" onClick={()=>{if(newText.trim()){onAdd(col.id,newText.trim());setNewText('');setAdding(false)}}}>💡 Capture</Btn>
            </>
          ) : (
            <button onClick={()=>setAdding(true)} style={{ width:'100%', background:'transparent', border:`1px dashed rgba(228,184,74,0.3)`, borderRadius:6, padding:'5px', fontSize:11, color:T.gold, cursor:'pointer' }}>💡 Capture idea</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── AI Analysis ──────────────────────────────────────────────────────────────
function AIPanel({ tasks, decisions, getPatterns }) {
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)

  const generate = async () => {
    setLoading(true)
    const p = getPatterns()
    const tagged = tasks.map(t=>`[${t.tags?.type||'Ops'}][${t.tags?.owner||'?'}]${isOverdue(t.due)?`[${daysOverdue(t.due)}d OVERDUE]`:''} ${t.content} (${t.source})`).join('\n')
    const r = await callClaude(
      `You are Nitin Sachdeva's blunt life and business coach. MySoulSchool at ₹2.5L/month profit, target ₹7L, W8 of 12WY. Help him become an Optimised Founder — high execution, ruthless 80/20, strong delegation.

Return exactly this format:
🎯 THE ONE THING
[1 task + 2-sentence WHY this matters most today]

🔥 DO NOW — top 3 revenue/execution tasks
• [task]
• [task]
• [task]

→ DELEGATE TODAY
[task: who — be specific]

🗑️ DEAD WEIGHT — delete or ignore
[tasks that are noise, overdue orphans, or not Nitin's job]

📊 80/20 SCORE: [0-100] — [one sentence why]

💪 COACH PUSH
[one direct personal challenge for today — specific, uncomfortable]

Execution history: ${p.completionRate}% completion, ${p.delegationRate}% delegation, ${p.total} decisions logged.`,
      `Tasks today (${tasks.length}):\n${tagged.slice(0, 2000)}`,
      800
    )
    setAnalysis(r); setLoading(false); setDone(true)
  }

  return (
    <div style={{ background:T.surface, borderRadius:10, border:`1px solid ${T.border}`, marginBottom:14, overflow:'hidden' }}>
      <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:T.text }}>✦ Daily Coach Analysis</div>
          <div style={{ fontSize:10.5, color:T.textDim, marginTop:1 }}>80/20 · Who Not How · The One Thing</div>
        </div>
        <Btn variant="gold" onClick={generate} disabled={loading}>{loading?'⏳ Analysing…':done?'↺ Refresh':'✦ Analyse My Day'}</Btn>
      </div>
      {(loading||analysis) && (
        <div style={{ padding:'14px 16px' }}>
          {loading
            ? <div style={{ fontSize:12, color:T.textMid }}>Reading your task list and applying 80/20, Who Not How, The One Thing…</div>
            : <div style={{ fontSize:13, color:'#E8D9A0', lineHeight:1.9, whiteSpace:'pre-line' }}>{analysis}</div>}
        </div>
      )}
      {!loading && !analysis && (
        <div style={{ padding:'14px 16px', fontSize:12, color:T.textDim, textAlign:'center', lineHeight:1.6 }}>
          Click "Analyse My Day" for your daily coaching — what to do, delegate, ignore, and your single most important task.
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SchedulerTab({ decisions, logDecision, getPatterns }) {
  const [loading, setLoading] = useState(true)
  const [toast, setToast]     = useState('')
  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(''),3500) }

  const [board, setBoard] = useState({
    today:    [],
    waiting:  [
      { id:'w1', content:'GHL Full Setup + ROAS Attribution Sheet', source:'manual', tags:{type:'Ops',owner:'Nitin Only'}, due:null, label:'MySoulSchool' },
      { id:'w2', content:'MySoulStore Full Launch — Shopdeck + first 10 products', source:'manual', tags:{type:'Revenue',owner:'Delegatable'}, due:null, label:'MySoulStore' },
      { id:'w3', content:'Consolidated Parent Entity for funding', source:'manual', tags:{type:'Ops',owner:'Nitin Only'}, due:null, label:'Funding' },
      { id:'w4', content:'B2B Corporate Wellness Pilot — MySoulSpace', source:'manual', tags:{type:'Revenue',owner:'Nitin Only'}, due:null, label:'MySoulSpace' },
    ],
    delegate: [],
    done:     [],
    ideas:    [
      { id:'i1', content:'AI Voice Clone for Mehakleen — automated webinar reminders', source:'manual', tags:{type:'Revenue',owner:'Delegatable'}, due:null, label:'MySoulSchool' },
      { id:'i2', content:'WhatsApp community for SUPER alumni — referral engine', source:'manual', tags:{type:'Revenue',owner:'Delegatable'}, due:null, label:'MySoulSchool' },
      { id:'i3', content:'Numerology Reports as first MySoulStore digital product', source:'manual', tags:{type:'Revenue',owner:'Nitin Only'}, due:null, label:'MySoulStore' },
    ],
  })
  const [overdueList, setOverdueList] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [td, wy] = await Promise.allSettled([fetchTodoist(), fetch12WY()])
      const todoist  = td.status==='fulfilled' ? td.value : []
      const twwy     = wy.status==='fulfilled' ? wy.value : []

      const overdue  = todoist.filter(t => t.isOverdue)
      const due      = todoist.filter(t => !t.isOverdue).map(t=>({...t, tags:inferTaskTags(t.content)}))
      const tactics  = twwy.map(t=>({...t, tags:inferTaskTags(t.content)}))

      setOverdueList(overdue)
      setBoard(prev => ({ ...prev, today: [...due, ...tactics] }))
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(()=>{ load() },[load])

  const moveTask = useCallback((taskId, targetCol) => {
    setBoard(prev => {
      const nb = {...prev}; let moved = null
      Object.keys(nb).forEach(col => {
        const idx = nb[col].findIndex(t=>t.id===taskId)
        if(idx!==-1){ moved=nb[col][idx]; nb[col]=nb[col].filter(t=>t.id!==taskId) }
      })
      if(moved){ nb[targetCol]=[moved,...nb[targetCol]]; logDecision({type:'task',content:moved.content,source:moved.source,action:`Moved to ${targetCol}`}); showToast(`Moved to ${KANBAN_COLS.find(c=>c.id===targetCol)?.label||targetCol}`) }
      return nb
    })
  },[logDecision])

  const completeTask = useCallback((taskId) => {
    setBoard(prev => {
      const nb={...prev}; let moved=null
      Object.keys(nb).forEach(col=>{ if(col==='done')return; const idx=nb[col].findIndex(t=>t.id===taskId); if(idx!==-1){moved=nb[col][idx];nb[col]=nb[col].filter(t=>t.id!==taskId)} })
      if(moved){ nb.done=[moved,...nb.done]; logDecision({type:'task',content:moved.content,source:moved.source,action:'Completed'}); showToast('✅ Done!') }
      return nb
    })
  },[logDecision])

  const addTask = useCallback((col, content) => {
    const task={id:`m-${Date.now()}`,content,due:null,source:'manual',tags:inferTaskTags(content),label:''}
    setBoard(prev=>({...prev,[col]:[task,...prev[col]]}))
  },[])

  const handleReschedule = (taskId, newDate) => {
    setOverdueList(prev => prev.map(t => t.id===taskId ? {...t, due:newDate, isOverdue:false} : t))
    // Move to board today
    const task = overdueList.find(t=>t.id===taskId)
    if(task) setBoard(prev=>({...prev,today:[{...task,due:newDate,isOverdue:false,tags:inferTaskTags(task.content)},...prev.today]}))
  }

  const allActive = [...board.today,...board.waiting,...board.delegate]
  const stats = { done:board.done.length, today:board.today.length, delegate:board.delegate.length }

  if(loading) return <LoadingCard msg="Fetching Todoist tasks + 12WY tactics…" />

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {toast && <Toast msg={toast} />}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:'9px 16px', display:'flex', gap:16, alignItems:'center', flexWrap:'wrap', flexShrink:0 }}>
        <StatChip label="Today" value={stats.today} color={T.violet} />
        <StatChip label="Done" value={stats.done} color={T.green} />
        <StatChip label="Delegated" value={stats.delegate} color={T.blue} />
        {overdueList.length>0 && <StatChip label="Overdue" value={overdueList.length} color={T.red} />}
        <Btn variant="ghost" onClick={load} style={{ marginLeft:'auto', fontSize:11 }}>↺ Refresh</Btn>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
        <AIPanel tasks={allActive} decisions={decisions} getPatterns={getPatterns} />

        {/* Overdue section */}
        {overdueList.length>0 && (
          <div style={{ background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:700, color:T.red, marginBottom:10 }}>🔥 Overdue Todoist Tasks — Reschedule or Complete</div>
            {overdueList.map(t => (
              <div key={t.id} style={{ background:T.surfaceHigh, borderRadius:8, padding:'10px 12px', marginBottom:7, border:`1px solid rgba(248,113,113,0.2)` }}>
                <div style={{ fontSize:12.5, color:T.text, marginBottom:4 }}>{t.content}</div>
                <div style={{ fontSize:10.5, color:T.red, marginBottom:4 }}>Due: {t.due} ({daysOverdue(t.due)}d overdue)</div>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:2 }}>
                  <button onClick={()=>completeTask(t.id)} style={{ background:'rgba(52,211,153,0.12)',color:T.green,border:'none',borderRadius:5,padding:'3px 8px',fontSize:10.5,cursor:'pointer',fontWeight:600 }}>✓ Done</button>
                  <button onClick={()=>moveTask(t.id,'today')||setOverdueList(prev=>prev.filter(x=>x.id!==t.id))} style={{ background:'rgba(155,127,232,0.12)',color:T.violet,border:'none',borderRadius:5,padding:'3px 8px',fontSize:10.5,cursor:'pointer' }}>→ Move to Today</button>
                </div>
                <OverdueReschedule task={t} onRescheduled={handleReschedule} showToast={showToast} />
              </div>
            ))}
          </div>
        )}

        {/* Kanban board */}
        <div style={{ display:'flex', gap:10, alignItems:'flex-start', minHeight:350 }}>
          {KANBAN_COLS.map(col => (
            <KanbanColumn key={col.id} col={col} tasks={board[col.id]||[]} onMove={moveTask} onComplete={completeTask} onAdd={addTask} />
          ))}
        </div>

        {/* 12WY goals */}
        <div style={{ marginTop:14, background:T.surface, borderRadius:10, padding:'12px 14px', border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:11, color:T.textDim, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>12WY Goals Progress</div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {[{l:'Leads/day',t:'200',c:'~100',p:50,col:T.amber},{l:'MSS Profit',t:'₹7L',c:'₹2.5L',p:36,col:T.amber},{l:'Store Orders',t:'25/day',c:'0',p:0,col:T.red},{l:'PM Hire',t:'Done',c:'In progress',p:60,col:T.amber}].map(g=>(
              <div key={g.l} style={{ background:T.surfaceHigh,borderRadius:8,padding:'10px 12px',minWidth:130,flex:1 }}>
                <div style={{ fontSize:10.5,color:T.textDim,marginBottom:3 }}>{g.l}</div>
                <div style={{ fontSize:13,color:g.col,fontWeight:700,marginBottom:5 }}>{g.c} → {g.t}</div>
                <div style={{ height:4,background:'rgba(255,255,255,0.08)',borderRadius:2,overflow:'hidden' }}>
                  <div style={{ height:'100%',width:`${g.p}%`,background:g.col,borderRadius:2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
