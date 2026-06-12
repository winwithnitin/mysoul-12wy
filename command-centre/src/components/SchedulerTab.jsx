import { useState, useEffect, useCallback, useRef } from 'react'
import { T, TYPE_COLORS, SRC_COLORS, KANBAN_COLS } from '../tokens.js'
import { fetchTodoist, fetch12WY, callClaude } from '../utils/api.js'
import { inferTaskTags, isOverdue, daysOverdue } from '../utils/classify.js'
import { Pill, LoadingCard, Btn, StatChip, Toast, CoachPanel } from './UI.jsx'

// ─── Kanban Card ──────────────────────────────────────────────────────────────
function KanbanCard({ task, onMove, onComplete, colId }) {
  const [dragging, setDragging] = useState(false)
  const tc = TYPE_COLORS[task.tags?.type] || TYPE_COLORS['Ops']
  const src = SRC_COLORS[task.source] || SRC_COLORS.manual
  const overdue = isOverdue(task.due)
  const days = daysOverdue(task.due)

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('taskId', task.id); setDragging(true) }}
      onDragEnd={() => setDragging(false)}
      style={{
        background: dragging ? 'rgba(124,92,191,0.15)' : T.surfaceHigh,
        border: `1px solid ${overdue ? 'rgba(239,68,68,0.3)' : T.border}`,
        borderLeft: `3px solid ${tc.color}`,
        borderRadius: 9, padding: '10px 12px', marginBottom: 8,
        cursor: 'grab', opacity: dragging ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: 12.5, color: T.text, marginBottom: 6, lineHeight: 1.4 }}>
        {task.content}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
        <Pill label={src.label} color={src.color} bg={src.bg} />
        <Pill label={task.tags?.type || 'Ops'} color={tc.color} bg={tc.bg} />
        {task.tags?.owner === 'Delegatable' && <Pill label="→ Delegatable" color={T.amber} bg="rgba(245,158,11,0.1)" />}
        {overdue && <Pill label={`${days}d overdue`} color={T.red} bg="rgba(239,68,68,0.1)" />}
        {task.source === '12wy' && task.label && <Pill label={task.label} color={T.violet} bg={T.violetDim} />}
      </div>

      {/* Move buttons */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {colId !== 'done' && (
          <button onClick={() => onComplete(task.id)}
            style={{ background:'rgba(16,185,129,0.12)', color:T.green, border:'none', borderRadius:5, padding:'3px 8px', fontSize:10.5, cursor:'pointer', fontWeight:600 }}>
            ✓ Done
          </button>
        )}
        {KANBAN_COLS.filter(c => c.id !== colId && c.id !== 'done').map(col => (
          <button key={col.id} onClick={() => onMove(task.id, col.id)}
            style={{ background:'rgba(255,255,255,0.05)', color:T.textMid, border:`1px solid ${T.border}`, borderRadius:5, padding:'3px 7px', fontSize:10, cursor:'pointer' }}>
            → {col.label.split(' ')[1]}
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

  const handleDrop = e => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) onMove(taskId, col.id)
    setDragOver(false)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{
        flex: 1, minWidth: 220, maxWidth: 320,
        background: dragOver ? 'rgba(124,92,191,0.05)' : T.surface,
        border: `1px solid ${dragOver ? T.violet : T.border}`,
        borderTop: `3px solid ${col.color}`,
        borderRadius: 10, padding: '12px 10px',
        display: 'flex', flexDirection: 'column', maxHeight: '100%',
        transition: 'all 0.15s',
      }}
    >
      {/* Column header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: col.color }}>{col.label}</span>
          <span style={{ fontSize: 11, color: T.textDim, background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '1px 8px' }}>
            {tasks.length}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: T.textDim }}>{col.desc}</div>
      </div>

      {/* Tasks */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
        {tasks.map(t => (
          <KanbanCard key={t.id} task={t} colId={col.id} onMove={onMove} onComplete={onComplete} />
        ))}
      </div>

      {/* Add task (only for Today and Ideas) */}
      {(col.id === 'today' || col.id === 'ideas') && (
        <div style={{ marginTop: 8 }}>
          {adding ? (
            <div>
              <input
                autoFocus
                value={newText}
                onChange={e => setNewText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newText.trim()) {
                    onAdd(col.id, newText.trim())
                    setNewText('')
                    setAdding(false)
                  }
                  if (e.key === 'Escape') { setAdding(false); setNewText('') }
                }}
                placeholder="Type and press Enter…"
                style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:`1px solid ${col.color}44`, borderRadius:7, padding:'7px 10px', color:T.text, fontSize:12, outline:'none', fontFamily:'inherit', marginBottom:5 }}
              />
              <div style={{ display:'flex', gap:5 }}>
                <Btn onClick={() => { if (newText.trim()) { onAdd(col.id, newText.trim()); setNewText(''); setAdding(false) } }}>Add</Btn>
                <Btn variant="ghost" onClick={() => { setAdding(false); setNewText('') }}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              style={{ width:'100%', background:'transparent', border:`1px dashed ${T.border}`, borderRadius:7, padding:'6px', fontSize:11, color:T.textDim, cursor:'pointer', textAlign:'left' }}>
              + Add {col.id === 'ideas' ? 'idea' : 'task'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Done Column ─────────────────────────────────────────────────────────────
function DoneColumn({ tasks }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ flex:1, minWidth:180, maxWidth:220, background:T.surface, border:`1px solid ${T.border}`, borderTop:`3px solid ${T.green}`, borderRadius:10, padding:'12px 10px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:12.5, fontWeight:700, color:T.green }}>✅ Done</span>
        <span style={{ fontSize:11, color:T.textDim, background:'rgba(255,255,255,0.06)', borderRadius:12, padding:'1px 8px' }}>{tasks.length}</span>
      </div>
      {expanded
        ? tasks.map(t => (
          <div key={t.id} style={{ fontSize:11.5, color:T.textDim, textDecoration:'line-through', padding:'5px 0', borderBottom:`1px solid ${T.border}` }}>
            {t.content}
          </div>
        ))
        : <button onClick={() => setExpanded(true)} style={{ fontSize:11, color:T.textDim, background:'transparent', border:'none', cursor:'pointer', padding:0 }}>
            Show completed →
          </button>}
      {expanded && <button onClick={() => setExpanded(false)} style={{ fontSize:11, color:T.textDim, background:'transparent', border:'none', cursor:'pointer', marginTop:5 }}>Hide</button>}
    </div>
  )
}

// ─── AI Analysis Panel ────────────────────────────────────────────────────────
function AIAnalysisPanel({ tasks, decisions, getPatterns }) {
  const [analysis, setAnalysis]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [generated, setGenerated] = useState(false)

  const generate = async () => {
    setLoading(true)
    const patterns = getPatterns()
    const tagged = tasks.map(t => `[${t.tags?.type||'Ops'}][${t.tags?.owner||'?'}]${isOverdue(t.due)?`[${daysOverdue(t.due)}d OVERDUE]`:''} ${t.content} (${t.source})`).join('\n')
    const r = await callClaude(
      `You are Nitin Sachdeva's blunt life and business coach. He runs MySoulSchool (target ₹7L/month profit, currently ₹2.5L). He is in W8 of a 12-week year cycle. You are helping him become an Optimised Founder — high execution, ruthless prioritisation, strong delegation.

Use three frameworks to analyse his task list:
1. 80/20 — which 20% of tasks drive 80% of results?
2. WHO NOT HOW — what is he doing that someone else should own?
3. THE ONE THING — what is the single task that makes everything else easier or unnecessary today?

Return exactly this format — label each section clearly:
🎯 THE ONE THING
[1 task + 2-sentence explanation of WHY this matters most today]

🔥 DO NOW (top 3 revenue/execution tasks)
[bullet each]

→ DELEGATE TODAY
[task: who should own it — be specific, name the person]

🗑️ DEAD WEIGHT
[tasks to delete, ignore or park — with reason]

📊 80/20 SCORE: [0-100] — [one sentence why]

💪 COACH PUSH
[one direct personal challenge — no fluff, specific to his situation]

Past execution pattern: ${patterns.completionRate}% completion rate, ${patterns.delegationRate}% delegation rate over ${patterns.total} decisions logged.`,
      `Today's tasks (${tasks.length}):\n${tagged}`,
      900
    )
    setAnalysis(r)
    setLoading(false)
    setGenerated(true)
  }

  return (
    <div style={{ background:T.surface, borderRadius:10, border:`1px solid ${T.border}`, overflow:'hidden' }}>
      <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:T.text }}>✦ AI Coach Analysis</div>
          <div style={{ fontSize:11, color:T.textDim, marginTop:2 }}>80/20 · Who Not How · The One Thing</div>
        </div>
        <Btn variant="gold" onClick={generate} disabled={loading}>
          {loading ? '⏳ Analysing…' : generated ? '↺ Refresh' : '✦ Analyse My Day'}
        </Btn>
      </div>
      {(loading || analysis) && (
        <div style={{ padding:'14px 16px' }}>
          {loading
            ? <div style={{ fontSize:12, color:T.textMid }}>Analysing your task list against 80/20, Who Not How, and The One Thing…</div>
            : <div style={{ fontSize:13, color:'#E8D9A0', lineHeight:1.9, whiteSpace:'pre-line' }}>{analysis}</div>}
        </div>
      )}
      {!loading && !analysis && (
        <div style={{ padding:'16px', fontSize:12, color:T.textDim, textAlign:'center', lineHeight:1.6 }}>
          Click "Analyse My Day" to get your daily coaching — what to do, delegate, ignore, and your single most important task.
          <br/><span style={{ fontSize:10.5, opacity:0.7 }}>Gets smarter as your decision log builds.</span>
        </div>
      )}
    </div>
  )
}

// ─── Execution Metrics ────────────────────────────────────────────────────────
function ExecutionMetrics({ decisions, getPatterns }) {
  const patterns = getPatterns()
  const thisWeek = decisions.filter(d => Date.now() - new Date(d.date) < 7 * 86400000)
  const weekCompletion = thisWeek.length > 0
    ? Math.round(thisWeek.filter(d => d.action === 'Completed').length / thisWeek.length * 100)
    : 0

  const scoreColor = weekCompletion >= 80 ? T.green : weekCompletion >= 60 ? T.amber : T.red

  return (
    <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
      {[
        { label:'This Week', value:`${weekCompletion}%`, color:scoreColor, sub:'Execution score' },
        { label:'All Time', value:`${patterns.completionRate}%`, color:T.violet, sub:'Completion rate' },
        { label:'Delegation', value:`${patterns.delegationRate}%`, color:T.blue, sub:'Tasks delegated' },
        { label:'Decisions', value:patterns.total, color:T.gold, sub:'Logged total' },
      ].map(m => (
        <div key={m.label} style={{ background:T.surface, borderRadius:9, padding:'10px 14px', border:`1px solid ${T.border}`, minWidth:110 }}>
          <div style={{ fontSize:22, fontWeight:800, color:m.color }}>{m.value}</div>
          <div style={{ fontSize:11, color:T.textMid, fontWeight:600 }}>{m.label}</div>
          <div style={{ fontSize:10, color:T.textDim }}>{m.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Scheduler Tab ───────────────────────────────────────────────────────
export default function SchedulerTab({ decisions, logDecision, getPatterns }) {
  const [loading, setLoading] = useState(true)
  const [toast, setToast]     = useState('')

  // Board state: colId → task[]
  const [board, setBoard] = useState({
    today:    [],
    waiting:  [
      { id:'w1', content:'GHL Full Setup + ROAS Attribution Sheet', source:'manual', tags:{ type:'Ops', owner:'Nitin Only' }, due:null, label:'MySoulSchool', notes:'Deferred — next 12WY cycle. Needs Aravind + Nishant.' },
      { id:'w2', content:'MySoulStore Full Launch — Shopdeck + first 10 products', source:'manual', tags:{ type:'Revenue', owner:'Delegatable' }, due:null, label:'MySoulStore', notes:'Waiting on Atul. Target: live in 45 days.' },
      { id:'w3', content:'Consolidated Parent Entity for funding', source:'manual', tags:{ type:'Ops', owner:'Nitin Only' }, due:null, label:'Funding', notes:'Discuss with CA before institutional approach.' },
      { id:'w4', content:'B2B Corporate Wellness Pilot — MySoulSpace', source:'manual', tags:{ type:'Revenue', owner:'Nitin Only' }, due:null, label:'MySoulSpace', notes:'Need 2-3 corporate clients. Start after B2C stabilises.' },
    ],
    delegate: [],
    ideas:    [
      { id:'i1', content:'AI Voice Clone for Mehakleen — automated webinar reminders', source:'manual', tags:{ type:'Revenue', owner:'Delegatable' }, due:null, label:'MySoulSchool' },
      { id:'i2', content:'WhatsApp community for SUPER alumni — referral engine', source:'manual', tags:{ type:'Revenue', owner:'Delegatable' }, due:null, label:'MySoulSchool' },
      { id:'i3', content:'Numerology Reports as first MySoulStore digital product', source:'manual', tags:{ type:'Revenue', owner:'Nitin Only' }, due:null, label:'MySoulStore' },
    ],
    done: [],
  })

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [todoistTasks, wwyTasks] = await Promise.allSettled([fetchTodoist(), fetch12WY()])
      const allTasks = [
        ...(todoistTasks.status === 'fulfilled' ? todoistTasks.value : []),
        ...(wwyTasks.status === 'fulfilled' ? wwyTasks.value : []),
      ].map(t => ({ ...t, tags: inferTaskTags(t.content) }))

      setBoard(prev => ({ ...prev, today: allTasks }))
    } catch (err) {
      console.error('Scheduler load error:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const moveTask = useCallback((taskId, targetColId) => {
    setBoard(prev => {
      const newBoard = { ...prev }
      let movedTask = null
      // Remove from current column
      Object.keys(newBoard).forEach(colId => {
        const idx = newBoard[colId].findIndex(t => t.id === taskId)
        if (idx !== -1) {
          movedTask = newBoard[colId][idx]
          newBoard[colId] = newBoard[colId].filter(t => t.id !== taskId)
        }
      })
      if (movedTask) {
        newBoard[targetColId] = [movedTask, ...newBoard[targetColId]]
        logDecision({ type:'task', content:movedTask.content, source:movedTask.source, action:`Moved to ${targetColId}` })
        showToast(`Moved to ${KANBAN_COLS.find(c=>c.id===targetColId)?.label || targetColId}`)
      }
      return newBoard
    })
  }, [logDecision])

  const completeTask = useCallback((taskId) => {
    setBoard(prev => {
      const newBoard = { ...prev }
      let movedTask = null
      Object.keys(newBoard).forEach(colId => {
        const idx = newBoard[colId].findIndex(t => t.id === taskId)
        if (idx !== -1 && colId !== 'done') {
          movedTask = newBoard[colId][idx]
          newBoard[colId] = newBoard[colId].filter(t => t.id !== taskId)
        }
      })
      if (movedTask) {
        newBoard.done = [movedTask, ...newBoard.done]
        logDecision({ type:'task', content:movedTask.content, source:movedTask.source, action:'Completed' })
        showToast('✅ Done!')
      }
      return newBoard
    })
  }, [logDecision])

  const addTask = useCallback((colId, content) => {
    const task = {
      id:      `manual-${Date.now()}`,
      content,
      due:     null,
      source:  'manual',
      tags:    inferTaskTags(content),
      label:   '',
    }
    setBoard(prev => ({ ...prev, [colId]: [task, ...prev[colId]] }))
    showToast('✅ Added')
  }, [])

  const allActiveTasks = [...board.today, ...board.waiting, ...board.delegate, ...board.ideas]
  const overdueCount   = board.today.filter(t => isOverdue(t.due)).length
  const delegatableCount = board.today.filter(t => t.tags?.owner === 'Delegatable').length
  const revenueCount   = board.today.filter(t => t.tags?.type === 'Revenue').length

  if (loading) return <LoadingCard msg="Fetching Todoist + 12WY tactics…" />

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {toast && <Toast msg={toast} />}

      {/* Stats + refresh */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:'9px 16px', display:'flex', gap:16, alignItems:'center', flexWrap:'wrap', flexShrink:0 }}>
        <StatChip label="Today" value={board.today.length} color={T.violet} />
        <StatChip label="Done" value={board.done.length} color={T.green} />
        <StatChip label="🔥 Overdue" value={overdueCount} color={T.red} />
        <StatChip label="→ Delegatable" value={delegatableCount} color={T.amber} />
        <StatChip label="Revenue tasks" value={revenueCount} color={T.green} />
        <Btn variant="ghost" onClick={load} style={{ marginLeft:'auto', fontSize:11 }}>↺ Refresh</Btn>
      </div>

      {/* Main content */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>

        {/* AI Analysis */}
        <div style={{ marginBottom:16 }}>
          <AIAnalysisPanel tasks={allActiveTasks} decisions={decisions} getPatterns={getPatterns} />
        </div>

        {/* Execution metrics */}
        <div style={{ marginBottom:16 }}>
          <ExecutionMetrics decisions={decisions} getPatterns={getPatterns} />
        </div>

        {/* Overdue warning */}
        {overdueCount > 0 && (
          <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#FCA5A5' }}>
            🔥 <strong>{overdueCount} overdue tasks</strong> in Today column — some from months ago. Complete, delegate to the right column, or delete. A task that stays overdue is a decision you're avoiding.
          </div>
        )}

        {/* Kanban board */}
        <div style={{ display:'flex', gap:12, alignItems:'flex-start', minHeight:400 }}>
          {KANBAN_COLS.map(col => (
            <KanbanColumn
              key={col.id}
              col={col}
              tasks={board[col.id] || []}
              onMove={moveTask}
              onComplete={completeTask}
              onAdd={addTask}
            />
          ))}
          <DoneColumn tasks={board.done} />
        </div>

        {/* 12WY Goals snapshot */}
        <div style={{ marginTop:16, background:T.surface, borderRadius:10, padding:'14px 16px', border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:11, color:T.textDim, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>12WY Goals — W8 Progress</div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            {[
              { label:'Leads/day', target:'200', current:'~100', pct:50, color:T.amber },
              { label:'MSS Profit', target:'₹7L', current:'₹2.5L', pct:36, color:T.amber },
              { label:'Store Orders', target:'25/day', current:'0', pct:0, color:T.red },
              { label:'PM Hire', target:'Done', current:'In progress', pct:60, color:T.amber },
            ].map(g => (
              <div key={g.label} style={{ background:T.surfaceHigh, borderRadius:8, padding:'10px 14px', minWidth:140, flex:1 }}>
                <div style={{ fontSize:11, color:T.textDim, marginBottom:4 }}>{g.label}</div>
                <div style={{ fontSize:13, color:g.color, fontWeight:700, marginBottom:6 }}>{g.current} → {g.target}</div>
                <div style={{ height:4, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${g.pct}%`, background:g.color, borderRadius:2, transition:'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
