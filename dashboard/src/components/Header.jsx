export default function Header() {
  return (
    <div style={{
      padding: '14px 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface2)',
      display: 'flex',
      alignItems: 'center',
    }}>
      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
        My<span style={{ color: 'var(--tarot)' }}>Soul</span>
        <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text3)', marginLeft: 8 }}>Dashboard</span>
      </span>
    </div>
  );
}
