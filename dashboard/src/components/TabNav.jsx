const TABS = [
  { key: 'marketing', label: 'MySoul Marketing' },
  { key: 'sales',     label: 'MySoul Sales'     },
];

export default function TabNav({ active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: 0,
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface2)',
      padding: '0 24px',
    }}>
      {TABS.map(tab => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--tarot)' : '2px solid transparent',
              color: isActive ? 'var(--text)' : 'var(--text3)',
              fontWeight: isActive ? 500 : 400,
              padding: '12px 18px',
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: 0,
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
