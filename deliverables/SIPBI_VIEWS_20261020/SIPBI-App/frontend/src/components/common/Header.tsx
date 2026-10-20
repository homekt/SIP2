import React, {useEffect,useState} from 'react';
import { CubeEvidence } from '../../types/cube';
import { useApp } from '../../context/AppContext';

export interface DashboardItem {
  id: string;
  name: string;
  nameZh: string;
  nameEn: string;
  category: string;
  categoryZh: string;
  categoryEn: string;
  badge?: string;
  badgeZh?: string;
  badgeEn?: string;
  icon: string;
  requiresAi?: boolean;
}

export const ALL_DASHBOARDS: DashboardItem[] = [
  {
    id: 'D00',
    name: 'D00 決策首頁',
    nameZh: 'D00 決策首頁',
    nameEn: 'D00 Decision Home',
    category: '決策首頁',
    categoryZh: '決策首頁',
    categoryEn: 'Decision Home',
    icon: '🌟',
    badge: 'Home',
    badgeZh: '首頁',
    badgeEn: 'Home',
  },
  {
    id: 'D18',
    name: 'D18 銷售觀察',
    nameZh: 'D18 銷售觀察',
    nameEn: 'D18 Sales Observations',
    category: '決策首頁',
    categoryZh: '決策首頁',
    categoryEn: 'Decision Home',
    icon: '🔍',
    badge: 'Observations',
    badgeZh: '觀察',
    badgeEn: 'Observations',
  },
  {
    id: 'D07',
    name: 'D07 AI 銷售分析工作區',
    nameZh: 'D07 AI 銷售分析工作區',
    nameEn: 'D07 Sales AI Workspace',
    category: 'AI 銷售分析',
    categoryZh: 'AI 銷售分析',
    categoryEn: 'AI Sales Analysis',
    icon: '🤖',
    badge: 'AI',
    badgeZh: 'AI 分析',
    badgeEn: 'AI',
    requiresAi: true,
  },

  {
    id: 'D01',
    name: 'D01 銷售總覽',
    nameZh: 'D01 銷售總覽',
    nameEn: 'D01 Executive Sales',
    category: '總覽與動能',
    categoryZh: '總覽與動能',
    categoryEn: 'Executive & Momentum',
    icon: '📊',
    badge: 'Executive',
    badgeZh: '總覽',
    badgeEn: 'Executive',
  },
  {
    id: 'D02',
    name: 'D02 銷售動能',
    nameZh: 'D02 銷售動能',
    nameEn: 'D02 Sales Momentum',
    category: '總覽與動能',
    categoryZh: '總覽與動能',
    categoryEn: 'Executive & Momentum',
    icon: '📈',
    badge: 'YoY',
    badgeZh: '同期比較',
    badgeEn: 'YoY',
  },
  {
    id: 'D15',
    name: 'D15 累計與滾動銷售',
    nameZh: 'D15 累計與滾動銷售',
    nameEn: 'D15 Rolling Sales',
    category: '總覽與動能',
    categoryZh: '總覽與動能',
    categoryEn: 'Executive & Momentum',
    icon: '📅',
    badge: 'YTD / R3M',
    badgeZh: '累計滾動',
    badgeEn: 'YTD / R3M',
  },
  {
    id: 'D16',
    name: 'D16 成長貢獻',
    nameZh: 'D16 成長貢獻',
    nameEn: 'D16 Growth Contribution',
    category: '總覽與動能',
    categoryZh: '總覽與動能',
    categoryEn: 'Executive & Momentum',
    icon: '🔄',
    badge: 'Waterfall',
    badgeZh: '瀑布貢獻',
    badgeEn: 'Waterfall',
  },

  {
    id: 'D04',
    name: 'D04 產品組合',
    nameZh: 'D04 產品組合',
    nameEn: 'D04 Product Mix',
    category: '產品與獲利',
    categoryZh: '產品與獲利',
    categoryEn: 'Product & Profitability',
    icon: '🧩',
  },
  {
    id: 'D08',
    name: 'D08 獲利品質',
    nameZh: 'D08 獲利品質',
    nameEn: 'D08 Profitability',
    category: '產品與獲利',
    categoryZh: '產品與獲利',
    categoryEn: 'Product & Profitability',
    icon: '📉',
  },
  {
    id: 'D14',
    name: 'D14 產品營收與毛利矩陣',
    nameZh: 'D14 產品營收與毛利矩陣',
    nameEn: 'D14 Product Portfolio',
    category: '產品與獲利',
    categoryZh: '產品與獲利',
    categoryEn: 'Product & Profitability',
    icon: '💎',
  },

  {
    id: 'D06',
    name: 'D06 客戶貢獻',
    nameZh: 'D06 客戶貢獻',
    nameEn: 'D06 Customer Contribution',
    category: '客戶與業務實績',
    categoryZh: '客戶與業務實績',
    categoryEn: 'Customers & Salespeople',
    icon: '🤝',
  },
  {
    id: 'D11',
    name: 'D11 客戶集中度',
    nameZh: 'D11 客戶集中度',
    nameEn: 'D11 Customer Concentration',
    category: '客戶與業務實績',
    categoryZh: '客戶與業務實績',
    categoryEn: 'Customers & Salespeople',
    icon: '⚖️',
  },
  {
    id: 'D13',
    name: 'D13 業務員實績',
    nameZh: 'D13 業務員實績',
    nameEn: 'D13 Salesperson Actuals',
    category: '客戶與業務實績',
    categoryZh: '客戶與業務實績',
    categoryEn: 'Customers & Salespeople',
    icon: '🎖️',
  },
];

export function getVisibleDashboards(aiEnabled: boolean): DashboardItem[] {
  return ALL_DASHBOARDS.filter((d) => !d.requiresAi || aiEnabled);
}

interface HeaderProps {
  evidence?: CubeEvidence | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ evidence, activeTab, onTabChange }) => {
  const {
    theme,
    toggleTheme,
    lang,
    toggleLang,
    setMobileSidebarOpen,
    t,
    zoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,
    aiEnabled,
  } = useApp();
  const isZh = lang === 'zh-TW';
  const [sourceProbe,setSourceProbe] = useState<{ready:boolean|null;at:string}>({ready:null,at:''});
  useEffect(()=>{
    let active=true;let controller:AbortController|null=null;
    const check=async()=>{
      controller?.abort();controller=new AbortController();
      try{const response=await fetch('/api/source/status',{signal:controller.signal});const result=await response.json();if(active)setSourceProbe({ready:response.ok&&result.ready===true,at:result.source?.queriedAt||new Date().toISOString()});}
      catch{if(active && !controller.signal.aborted)setSourceProbe({ready:false,at:new Date().toISOString()});}
    };
    void check();const timer=setInterval(check,30000);
    return()=>{active=false;controller?.abort();clearInterval(timer);};
  },[]);
  const visibleDashboards = getVisibleDashboards(aiEnabled);
  const currentDash = visibleDashboards.find((d) => d.id === activeTab) || visibleDashboards[0];

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs transition-colors">
      <div className="w-full px-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap sm:flex-nowrap justify-between items-center min-h-16 gap-y-2 py-2 sm:py-0">
          <div className="flex min-w-0 items-center space-x-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle Navigation"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex min-w-0 items-center space-x-2.5 cursor-pointer" onClick={() => onTabChange('D00')}>
              <span className="flex h-3 w-3 relative flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">
                    {t('app.title')}
                  </h1>
                  <span className="hidden sm:inline-block px-2 py-0.5 text-2xs font-semibold bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800">
                    {activeTab} · {isZh ? currentDash?.categoryZh : currentDash?.categoryEn}
                  </span>
                </div>
                <p className="text-2xs text-slate-500 dark:text-slate-400 font-mono hidden sm:block">
                  SSAS:{' '}
                  <code className="text-slate-700 dark:text-slate-300">
                    localhost:25000 / JDE_SALES_CUBE_20261020 / JDE Sales
                  </code>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap w-full sm:w-auto justify-end items-center gap-2 sm:gap-3">
            {aiEnabled && (
              <button
                onClick={() => onTabChange('D07')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                  activeTab === 'D07'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800'
                }`}
              >
                <span>🤖</span>
                <span className="hidden sm:inline">{t('btn.ai_workspace')}</span>
              </button>
            )}

            <button
              onClick={() => onTabChange('D18')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'D18'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800'
              }`}
            >
              <span>🔍</span>
              <span className="hidden sm:inline">{t('btn.alerts')}</span>
            </button>

            <div
              className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-800 shadow-2xs"
              title={isZh ? '畫面縮放 (Alt + +/- 或點選)' : 'Screen Zoom (Alt + +/-)'}
            >
              <button
                onClick={zoomOut}
                disabled={zoomLevel <= 0.7}
                className="px-2 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title={isZh ? '縮小畫面 (最低 70%, 快捷鍵 Alt + -)' : 'Zoom Out (Min 70%, Alt + -)'}
                aria-label="Zoom Out"
              >
                −
              </button>
              <button
                onClick={resetZoom}
                className="px-1.5 py-1 text-2xs font-mono font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer min-w-[54px] text-center"
                title={isZh ? '點選重設為 100% (快捷鍵 Alt + 0)' : 'Reset Zoom to 100% (Alt + 0)'}
                aria-label="Reset Zoom"
              >
                🔍 {Math.round(zoomLevel * 100)}%
              </button>
              <button
                onClick={zoomIn}
                disabled={zoomLevel >= 1.5}
                className="px-2 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title={isZh ? '放大畫面 (最高 150%, 快捷鍵 Alt + +)' : 'Zoom In (Max 150%, Alt + +)'}
                aria-label="Zoom In"
              >
                +
              </button>
            </div>

            <button
              onClick={toggleLang}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center space-x-1 cursor-pointer"
              title={isZh ? '切換為英文' : 'Switch to Traditional Chinese'}
            >
              <span>🌐</span>
              <span className="font-semibold text-2xs">{isZh ? '繁中' : 'EN'}</span>
            </button>

            <button
              onClick={toggleTheme}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center space-x-1 cursor-pointer"
              title={theme === 'dark' ? t('theme.toggle_light') : t('theme.toggle_dark')}
            >
              <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
              <span className="hidden lg:inline text-2xs font-semibold">
                {theme === 'dark' ? (isZh ? '淺色' : 'Light') : isZh ? '深色' : 'Dark'}
              </span>
            </button>

            <div className="text-right hidden xl:block pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="text-2xs text-slate-400 font-mono">
                {evidence?.modelHash ? (
                  <>
                    Query: <span className="text-slate-600 dark:text-slate-300">{evidence.modelHash.slice(0, 10)}</span>
                  </>
                ) : (
                  <>
                    Cube: <span className="text-slate-600 dark:text-slate-300">JDE Sales</span>
                  </>
                )}
              </div>
              <div className="text-2xs text-slate-500 dark:text-slate-400">
                USD · KG · <span className="font-semibold">Invoice Date</span> |{' '}
                <span title={sourceProbe.at} className={sourceProbe.ready===true?'text-emerald-600 font-semibold':sourceProbe.ready===false?'text-rose-600 font-semibold':'text-slate-500'}>{sourceProbe.ready===null?(isZh?'來源探測中':'Checking source'):sourceProbe.ready?(isZh?'上次來源探測成功':'Last source probe OK'):(isZh?'來源無法使用':'Source unavailable')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
