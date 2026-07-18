import { useState } from 'react';
import Header from './components/Header.jsx';
import TabNav from './components/TabNav.jsx';
import Marketing from './tabs/Marketing.jsx';
import Sales from './tabs/Sales.jsx';
import Finance from './tabs/Finance.jsx';
import EMI from './tabs/EMI.jsx';
import LTVFunnel from './tabs/LTVFunnel.jsx';
import CRM from './tabs/CRM.jsx';
import Performance from './tabs/Performance.jsx';
import WorkshopAudit from './tabs/WorkshopAudit.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('marketing');
  return (
    <div style={{ minHeight:'100vh' }}>
      <Header />
      <TabNav active={activeTab} onChange={setActiveTab} />
      {activeTab === 'marketing'   && <Marketing />}
      {activeTab === 'sales'       && <Sales />}
      {activeTab === 'crm'         && <CRM />}
      {activeTab === 'performance' && <Performance />}
      {activeTab === 'workshopAudit' && <WorkshopAudit />}
      {activeTab === 'finance'     && <Finance />}
      {activeTab === 'emi'         && <EMI />}
      {activeTab === 'ltvfunnel'   && <LTVFunnel />}
    </div>
  );
}
