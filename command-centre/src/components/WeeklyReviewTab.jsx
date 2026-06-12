import { useState, useEffect } from 'react'
import { T } from '../tokens.js'
import { fetchHelpSlips, fetchEmails, callClaude } from '../utils/api.js'
import { classifyEmail } from '../utils/classify.js'
import { Btn, LoadingCard, StatChip } from './UI.jsx'

export default function WeeklyReviewTab({ decisions, getPatterns }) {
  const [slips, setSlips]   = useState([])
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [review, setReview] = useState('')
  const [reviewing, setReviewing] = useState(false)

  useEffect(() => {
    Promise.allSettled([fetchHelpSlips(), fetchEmails()]).then(([s, e]) => {
      setSlips(s.status === 'fulfilled' ? s.value : [])
      setEmails(e.status === 'fulfilled' ? e.value.map(em => ({ ...em, meta: classifyEmail(em.from, em.email, em.subject, em.preview) })) : [])
      setLoading(false)
    })
  }, [])

  const generateReview = async () => {
    setReviewing(true)
    const patterns   = getPatterns()
    const openSlips  = slips.filter(s => s.status !== 'RESOLVED')
    const urgentEmails = emails.filter(e => e.meta?.priority === 'HIGH')
    const byDept     = slips.reduce((a,s) => ({ ...a, [s.department]: (a[s.department]||0)+1 }), {})
    const topDept    = Object.entries(byDept).sort((a,b)=>b[1]-a[1])[0]
    const thisWeekDecisions = decisions.filter(d => Date.now() - new Date(d.date) < 7*86400000)
    const weekCompletion = thisWeekDecisions.length > 0
      ? Math.round(thisWeekDecisions.filter(d => d.action === 'Completed').length / thisWeekDecisions.length * 100)
      : 0

    const r = await callClaude(
      `You are Nitin Sachdeva's Friday life and business coach. Your job is to give him a sharp, honest, actionable weekly debrief that makes him a better founder next week.

He is building MySoulSchool (Tarot, Reiki, SUPER programs) targeting ₹7L/month profit from ₹2.5L. He's in W8 of 12. The clock is ticking.

Format your response with EXACTLY these sections — be ruthlessly honest and specific:

📊 WEEK IN NUMBERS
[3-4 bullets — what the data actually says about his execution this week]

🔴 UNRESOLVED — NEEDS YOUR CALL MONDAY
[List open slips with submitter + what decision is needed]

⚡ INBOX PATTERN
[1-2 sentences on Gmail — what type of emails keep landing on him that shouldn't]

🧠 EXECUTION VERDICT
[Score: X/10 — with specific reason. No vague praise. What happened and why.]

🔁 RECURRING ISSUES (NEED SOPs)
[What keeps coming up that needs a system, not a one-off decision]

🎯 MONDAY PRIORITY STACK
[Exact order — 1, 2, 3, 4. What Nitin does first when he opens his laptop Monday 9am]

💪 COACH CHALLENGE
[One direct personal challenge for next week — connected to his 12WY goals. Make him uncomfortable. That's your job.]

CONTEXT:
- Execution score this week: ${weekCompletion}%
- All-time delegation rate: ${patterns.delegationRate}%
- Decisions logged: ${patterns.total}
- Top help-slip raiser: ${topDept?.[0] || 'N/A'} (${topDept?.[1] || 0} slips)`,
      `Open help-slips: ${openSlips.length}
Resolved this week: ${slips.filter(s=>s.status==='RESOLVED').length}
Urgent emails: ${urgentEmails.length}
Slip details: ${openSlips.map(s=>`[${s.department}] ${s.submittedBy}: ${(s.query||'').slice(0,60)}`).join(' | ')}
This week decisions: ${thisWeekDecisions.map(d=>`${d.action}: ${(d.content||d.query||'').slice(0,40)}`).join(' | ')}`,
      1200
    )
    setReview(r)
    setReviewing(false)
  }

  const byDept   = slips.reduce((a,s) => ({ ...a, [s.department]: (a[s.department]||0)+1 }), {})
  const byPerson = slips.reduce((a,s) => ({ ...a, [s.submittedBy]: (a[s.submittedBy]||0)+1 }), {})
  const openSlips = slips.filter(s => s.status !== 'RESOLVED')
  const resRate   = slips.length ? Math.round(slips.filter(s=>s.status==='RESOLVED').length/slips.length*100) : 0
  const patterns  = getPatterns()
  const actionCounts = decisions.reduce((a,d) => ({ ...a, [d.action]: (a[d.action]||0)+1 }), {})
  const thisWeek  = decisions.filter(d => Date.now() - new Date(d.date) < 7*86400000)
  const weekScore = thisWeek.length > 0
    ? Math.round(thisWeek.filter(d => d.action === 'Completed').length / thisWeek.length * 100)
    : 0

  return (
    <div style={{ padding:'20px 24px', overflowY:'auto', height:'100%' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize:17, fontWeight:800, color:T.text, margin:'0 0 4px' }}>Friday Weekly Review</h2>
          <div style={{ fontSize:12, color:T.textDim }}>W8 of 12 · MySoulSchool · Your Coach is Watching</div>
        </div>
        <Btn variant="gold" onClick={generateReview} disabled={reviewing||loading}>
          {reviewing ? '⏳ Generating…' : review ? '↺ Refresh Review' : '✦ Generate Friday Review'}
        </Btn>
      </div>

      {loading ? <LoadingCard msg="Loading weekly data…" /> : (
        <>
          {/* Stats grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
            {[
              { l:'Help Slips', v:slips.length, c:T.violet },
              { l:'Open',       v:openSlips.length, c:T.red },
              { l:'Resolution', v:`${resRate}%`, c:T.green },
              { l:'Week Score', v:`${weekScore}%`, c:weekScore>=80?T.green:weekScore>=60?T.amber:T.red },
            ].map(s => (
              <div key={s.l} style={{ background:T.surface, borderRadius:10, padding:'14px 16px', border:`1px solid ${T.border}` }}>
                <div style={{ fontSize:24, fontWeight:800, color:s.c, marginBottom:4 }}>{s.v}</div>
                <div style={{ fontSize:11, color:T.textDim }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:18 }}>
            {/* By dept */}
            <div style={{ background:T.surface, borderRadius:10, padding:'14px 16px', border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:11, color:T.textDim, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Slips by Department</div>
              {Object.entries(byDept).sort((a,b)=>b[1]-a[1]).map(([d,c]) => (
                <div key={d} style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12 }}>
                  <span style={{ color:T.textMid }}>{d}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:Math.max(c*16,6), height:5, background:T.violet, borderRadius:3 }} />
                    <span style={{ color:T.gold, fontWeight:700 }}>{c}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* By person */}
            <div style={{ background:T.surface, borderRadius:10, padding:'14px 16px', border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:11, color:T.textDim, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Slips by Person</div>
              {Object.entries(byPerson).sort((a,b)=>b[1]-a[1]).map(([n,c]) => (
                <div key={n} style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12 }}>
                  <span style={{ color:T.textMid }}>{n}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:Math.max(c*16,6), height:5, background:T.gold, borderRadius:3 }} />
                    <span style={{ color:T.gold, fontWeight:700 }}>{c}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Decision log */}
            <div style={{ background:T.surface, borderRadius:10, padding:'14px 16px', border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:11, color:T.textDim, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Your Decision Log</div>
              {Object.keys(actionCounts).length === 0
                ? <div style={{ fontSize:12, color:T.textDim, lineHeight:1.6 }}>No decisions logged yet. Use ✅/Delegate buttons across all tabs to start building your pattern data.</div>
                : Object.entries(actionCounts).map(([a,c]) => (
                  <div key={a} style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12 }}>
                    <span style={{ color:T.textMid }}>{a}</span>
                    <span style={{ color:T.green, fontWeight:700 }}>{c}</span>
                  </div>
                ))}
              {decisions.length > 0 && (
                <div style={{ marginTop:10, paddingTop:8, borderTop:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:10.5, color:T.textDim }}>Delegation rate: <span style={{ color:T.blue, fontWeight:700 }}>{patterns.delegationRate}%</span></div>
                  <div style={{ fontSize:10.5, color:T.textDim, marginTop:2 }}>Completion rate: <span style={{ color:T.green, fontWeight:700 }}>{patterns.completionRate}%</span></div>
                </div>
              )}
            </div>
          </div>

          {/* Open slips */}
          {openSlips.length > 0 && (
            <div style={{ background:T.surface, borderRadius:10, padding:'14px 16px', border:`1px solid ${T.border}`, marginBottom:18 }}>
              <div style={{ fontSize:11, color:T.red, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>🔴 Still Open — Needs Your Call</div>
              {openSlips.map(s => (
                <div key={s.id} style={{ display:'flex', gap:8, marginBottom:10, paddingBottom:10, borderBottom:`1px solid ${T.border}` }}>
                  <span>{s.daysOpen>=3?'🔥':'🔴'}</span>
                  <div>
                    <div style={{ fontSize:12, color:T.text, marginBottom:2 }}>{s.submittedBy} · {s.department} · {s.daysOpen}d open</div>
                    <div style={{ fontSize:11.5, color:T.textMid }}>{(s.query||'').slice(0,100)}{(s.query||'').length>100?'…':''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* AI Review */}
          {(reviewing || review) && (
            <div style={{ background:T.goldDim, border:`1px solid ${T.gold}44`, borderRadius:10, padding:'16px 18px' }}>
              <div style={{ fontSize:11, color:T.gold, fontWeight:700, marginBottom:10, letterSpacing:0.5 }}>✦ AI COACH — FRIDAY REVIEW</div>
              {reviewing
                ? <div style={{ fontSize:12, color:T.textMid }}>Generating your personalised weekly debrief…</div>
                : <div style={{ fontSize:13, color:'#E8D9A0', lineHeight:1.9, whiteSpace:'pre-line' }}>{review}</div>}
            </div>
          )}

          {!review && !reviewing && (
            <div style={{ background:T.surface, borderRadius:10, padding:'20px', border:`1px solid ${T.border}`, textAlign:'center' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>✦</div>
              <div style={{ fontSize:13, color:T.textMid, marginBottom:6 }}>
                Click "Generate Friday Review" for your personalised weekly coaching.
              </div>
              <div style={{ fontSize:11, color:T.textDim }}>
                Covers: execution score, open decisions, recurring problems, Monday priority order, and a direct personal challenge.
                Gets sharper as your decision log builds.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
