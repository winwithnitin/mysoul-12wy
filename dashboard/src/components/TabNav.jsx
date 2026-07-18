const TABS = [
  { key: 'marketing',   label: 'Marketing'    },
  { key: 'sales',       label: 'Sales'        },
  { key: 'crm',         label: 'CRM'          },
  { key: 'performance', label: 'Performance'  },
  { key: 'workshopAudit', label: 'Workshop Audit' },
  { key: 'finance',     label: 'Finance'      },
  { key: 'emi',         label: 'SUPER & RGM'  },
  { key: 'ltvfunnel',   label: 'LTV & Funnel' },
];
export default function TabNav({ active, onChange }) {
  return (
    <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--surface2)', padding:'0 24px', overflowX:'auto' }}>
      {TABS.map(tab => {
        const isActive = active === tab.key;
        return (
          <button key={tab.key} onClick={() => onChange(tab.key)} style={{
            background:'none', border:'none', whiteSpace:'nowrap',
            borderBottom: isActive ? '2px solid var(--tarot)' : '2px solid transparent',
            color: isActive ? 'var(--text)' : 'var(--text3)',
            fontWeight: isActive ? 500 : 400,
            padding:'12px 18px', fontSize:13, cursor:'pointer', borderRadius:0, transition:'color 0.15s',
          }}>{tab.label}</button>
        );
      })}
    </div>
  );
}
