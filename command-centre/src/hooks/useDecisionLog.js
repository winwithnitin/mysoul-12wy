import { useState, useCallback } from 'react'

export function useDecisionLog() {
  const [decisions, setDecisions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mysoul_decisions') || '[]') }
    catch { return [] }
  })

  const logDecision = useCallback((entry) => {
    setDecisions(prev => {
      const updated = [...prev, { ...entry, date: new Date().toISOString(), id: Date.now() }]
      try { localStorage.setItem('mysoul_decisions', JSON.stringify(updated.slice(-500))) } catch {}
      return updated
    })
  }, [])

  const getPatterns = useCallback(() => {
    const byAction = decisions.reduce((a, d) => {
      a[d.action] = (a[d.action] || 0) + 1; return a
    }, {})
    const byType = decisions.reduce((a, d) => {
      a[d.type] = (a[d.type] || 0) + 1; return a
    }, {})
    const delegationRate = decisions.length > 0
      ? Math.round((decisions.filter(d => d.action === 'Delegated').length / decisions.length) * 100)
      : 0
    const completionRate = decisions.length > 0
      ? Math.round((decisions.filter(d => d.action === 'Completed' || d.action === 'Resolved').length / decisions.length) * 100)
      : 0
    return { byAction, byType, delegationRate, completionRate, total: decisions.length }
  }, [decisions])

  return { decisions, logDecision, getPatterns }
}
