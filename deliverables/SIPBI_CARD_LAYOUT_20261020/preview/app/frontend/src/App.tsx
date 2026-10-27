import React from 'react';
import OperationsDashboard from './screens/OperationsDashboard';
import { CubeEvidence } from './types/cube';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/common/Header';
import { Sidebar } from './components/layout/Sidebar';
import { SlicerBar } from './components/common/SlicerBar';
import { Breadcrumbs } from './components/common/Breadcrumbs';
import { DrillDownModal } from './components/modals/DrillDownModal';

// 12 Authorized Sales Dashboards + Optional D07 AI Workspace
import { D00DecisionHome } from './screens/D00DecisionHome';
import { D01ExecutiveOverview } from './screens/D01ExecutiveOverview';
import { D02SalesMomentum } from './screens/D02SalesMomentum';
import { D04ProductMix } from './screens/D04ProductMix';
import { D06CustomerContribution } from './screens/D06CustomerContribution';
import { D07AiAnalysisWorkspace } from './screens/D07AiAnalysisWorkspace';
import { D08ProfitabilityQuality } from './screens/D08ProfitabilityQuality';
import { D11CustomerConcentration } from './screens/D11CustomerConcentration';
import { D13SalespersonPerformance } from './screens/D13SalespersonPerformance';
import { D14ProductPortfolio } from './screens/D14ProductPortfolio';
import { D15RollingSales } from './screens/D15RollingSales';
import { D16GrowthDeclineContribution } from './screens/D16GrowthDeclineContribution';
import { D18ExceptionMonitor } from './screens/D18ExceptionMonitor';

const InnerApp: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    navigate,
    filters,
    setFilters,
    lang,
    zoomLevel,
    aiEnabled,
    lastDashboardContext,
  } = useApp();

  const operationsKind = ({ OPS_PRODUCTION: 'production', OPS_FULFILMENT: 'fulfilment', OPS_BUDGET: 'budget' } as const)[activeTab as 'OPS_PRODUCTION' | 'OPS_FULFILMENT' | 'OPS_BUDGET'];

  const evidence: CubeEvidence = {
    modelHash: lastDashboardContext?.evidence?.queryHash || '',
    currency: 'USD',
    requestId: lastDashboardContext?.evidence?.requestId,
    dateRole: 'Invoice Date',
    grain: lastDashboardContext?.evidence?.grain,
    queriedAt: lastDashboardContext?.evidence?.queriedAt,
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-row font-sans transition-colors duration-200">
      <Sidebar activeTab={activeTab} onTabChange={tab => navigate(tab)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header evidence={operationsKind ? null : evidence} activeTab={activeTab} onTabChange={tab => navigate(tab)} />

        <main
          className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 origin-top transition-transform duration-150"
          style={{ zoom: zoomLevel }}
        >
          <Breadcrumbs />

          {!operationsKind && <SlicerBar slicer={filters} onChange={setFilters} />}
          {operationsKind && <OperationsDashboard key={operationsKind} kind={operationsKind} />}

          {activeTab === 'D00' && <D00DecisionHome slicer={filters} onNavigate={tab => navigate(tab)} />}
          {activeTab === 'D01' && <D01ExecutiveOverview slicer={filters} />}
          {activeTab === 'D02' && <D02SalesMomentum slicer={filters} />}
          {activeTab === 'D04' && <D04ProductMix slicer={filters} />}
          {activeTab === 'D06' && <D06CustomerContribution slicer={filters} />}
          {activeTab === 'D07' && aiEnabled && <D07AiAnalysisWorkspace slicer={filters} />}
          {activeTab === 'D08' && <D08ProfitabilityQuality slicer={filters} />}
          {activeTab === 'D11' && <D11CustomerConcentration slicer={filters} />}
          {activeTab === 'D13' && <D13SalespersonPerformance slicer={filters} />}
          {activeTab === 'D14' && <D14ProductPortfolio slicer={filters} />}
          {activeTab === 'D15' && <D15RollingSales slicer={filters} />}
          {activeTab === 'D16' && <D16GrowthDeclineContribution slicer={filters} />}
          {activeTab === 'D18' && <D18ExceptionMonitor slicer={filters} onNavigate={setActiveTab} />}
        </main>

        <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-4 mt-auto transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center text-2xs sm:text-xs text-slate-500 dark:text-slate-400 gap-2">
            <div>
              <strong>
                {operationsKind ? (lang === 'zh-TW' ? 'SI 生產與交付營運分析' : 'SI Operations Analytics') : lang === 'zh-TW'
                  ? 'JDE 銷售多維度分析系統 (JDE Sales BI)'
                  : 'JDE Sales Multidimensional Analytics Suite'}
              </strong>{' '}
              {operationsKind ? '· CNY / KG · SI Manufacturing BI · Synthetic Demo Data (No Login)' : '· USD / KG · Invoice Date · Synthetic Demo Data (Shared 5 Companies, No Login)'}
            </div>
            <div className="font-mono text-slate-400 dark:text-slate-500">
              {operationsKind ? 'SSAS: localhost:25000 | SI_Powered_BI | SI Manufacturing BI' : 'SSAS: localhost:25000 | JDE_SALES_CUBE_20261020 | JDE Sales'}
            </div>
          </div>
        </footer>
      </div>

      <DrillDownModal />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <InnerApp />
    </AppProvider>
  );
};

export default App;
