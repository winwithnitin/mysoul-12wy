export default function Header() {
  return (
    <div style={{ padding:'14px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', letterSpacing:0.5 }}>MySoul Dashboard</div>
      <div style={{ fontSize:11, color:'var(--text3)' }}>{new Date().toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</div>
    </div>
  );
}
