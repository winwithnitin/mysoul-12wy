import { useState } from 'react';
import Header from './components/Header.jsx';
import TabNav from './components/TabNav.jsx';
import Marketing from './tabs/Marketing.jsx';
import Sales from './tabs/Sales.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('marketing');

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header />
      <TabNav active={activeTab} onChange={setActiveTab} />
      {activeTab === 'marketing' && <Marketing />}
      {activeTab === 'sales'     && <Sales />}
    </div>
  );
}
