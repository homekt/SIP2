import React, { createContext, useContext, useEffect, useState } from 'react';
import { DashboardResponse, Filters, Metadata } from '../types/sales';
import { DrillDownData, NavigationRecord } from '../types/drillDown';
import { DEFAULT_FILTERS } from '../utils/salesFormat';
import { fetchMetadata, normalizeFilters } from '../services/salesApi';

export type ThemeMode = 'light' | 'dark';
export type Language = 'zh-TW' | 'en';

export const AUTHORIZED_SALES_TABS = [
  'D00',
  'D01',
  'D02',
  'D04',
  'D06',
  'D08',
  'D11',
  'D13',
  'D14',
  'D15',
  'D16',
  'D18',
] as const;

export const OPERATIONS_TABS = ['OPS_PRODUCTION', 'OPS_FULFILMENT', 'OPS_BUDGET'] as const;

export const DASHBOARD_TITLES: Record<string, { zh: string; en: string }> = {
  OPS_PRODUCTION: { zh: '生產效率與品質', en: 'Production Efficiency & Quality' },
  OPS_FULFILMENT: { zh: '交付與積壓', en: 'Delivery & Backlog' },
  OPS_BUDGET: { zh: '預算執行檢討', en: 'Budget Execution' },
  D00: { zh: '決策首頁', en: 'Decision Home' },
  D01: { zh: '銷售總覽', en: 'Executive Sales' },
  D02: { zh: '銷售動能', en: 'Sales Momentum' },
  D04: { zh: '產品組合', en: 'Product Mix' },
  D06: { zh: '客戶貢獻', en: 'Customer Contribution' },
  D07: { zh: 'AI 銷售分析工作區', en: 'Sales AI Workspace' },
  D08: { zh: '獲利品質', en: 'Profitability' },
  D11: { zh: '客戶集中度', en: 'Customer Concentration' },
  D13: { zh: '業務員實績', en: 'Salesperson Actuals' },
  D14: { zh: '產品營收與毛利矩陣', en: 'Product Portfolio' },
  D15: { zh: '累計與滾動銷售', en: 'Rolling Sales' },
  D16: { zh: '成長貢獻', en: 'Growth Contribution' },
  D18: { zh: '銷售觀察', en: 'Sales Observations' },
};

interface AppContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  t: (key: string) => string;

  // Metadata & AI status
  metadata: Metadata | null;
  metadataLoading: boolean;
  metadataError: string | null;
  aiEnabled: boolean;
  operationsEnabled: boolean;

  // Active Screen & Filters
  operationsMonth: string;
  setOperationsMonth: (month: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  slicer: Filters;
  setSlicer: React.Dispatch<React.SetStateAction<Filters>>;
  resetFilters: () => void;
  navigate: (tab: string, filterUpdates?: Partial<Filters>, title?: string) => void;
  history: NavigationRecord[];
  goBack: () => void;
  clearHistory: () => void;

  // Latest dashboard context for D07 AI Workspace
  lastDashboardContext: DashboardResponse | null;
  setLastDashboardContext: (ctx: DashboardResponse | null) => void;

  // Drill-Down Modal
  drillDownModal: DrillDownData | null;
  openDrillDown: (data: DrillDownData) => void;
  closeDrillDown: () => void;

  // Screen Zoom In / Out
  zoomLevel: number;
  setZoomLevel: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

const translations: Record<Language, Record<string, string>> = {
  'zh-TW': {
    'app.title': 'JDE 銷售多維度分析系統',
    'app.subtitle': 'JDE Sales BI · JDE_SALES_CUBE_20261020',
    'app.cube': 'JDE Sales',
    'nav.decision_hub': '決策首頁',
    'nav.ai_workspace': 'AI 銷售分析',
    'nav.executive_growth': '總覽與動能',
    'nav.product_profit': '產品與獲利',
    'nav.customer_sales': '客戶與業務實績',
    'nav.observations': '銷售觀察',
    'btn.ai_workspace': 'AI 銷售分析',
    'btn.alerts': '銷售觀察',
    'slicer.month': '發票月份 (Invoice Month)',
    'slicer.company': '營運公司 (Company)',
    'slicer.product': '產品 (Product)',
    'slicer.customer': '客戶 (Customer)',
    'slicer.salesperson': '業務員 (Salesperson)',
    'slicer.plant': '廠區 (Plant)',
    'slicer.costCenter': '成本中心 (Cost Center)',
    'theme.toggle_dark': '切換為深色模式',
    'theme.toggle_light': '切換為淺色模式',
    'lang.zh': '繁體中文',
    'lang.en': 'English',
    'search.placeholder': '搜尋銷售看板...',
    'sidebar.collapse': '收摺側邊欄',
    'sidebar.expand': '展開側邊欄',
    'status.healthy': 'Cube 連線正常',
  },
  en: {
    'app.title': 'JDE Sales Analytics Suite',
    'app.subtitle': 'JDE Sales BI · JDE_SALES_CUBE_20261020',
    'app.cube': 'JDE Sales',
    'nav.decision_hub': 'Decision Home',
    'nav.ai_workspace': 'AI Sales Workspace',
    'nav.executive_growth': 'Executive & Momentum',
    'nav.product_profit': 'Product & Profitability',
    'nav.customer_sales': 'Customers & Salespeople',
    'nav.observations': 'Sales Observations',
    'btn.ai_workspace': 'AI Workspace',
    'btn.alerts': 'Sales Observations',
    'slicer.month': 'Invoice Month',
    'slicer.company': 'Company',
    'slicer.product': 'Product',
    'slicer.customer': 'Customer',
    'slicer.salesperson': 'Salesperson',
    'slicer.plant': 'Plant',
    'slicer.costCenter': 'Cost Center',
    'theme.toggle_dark': 'Dark Mode',
    'theme.toggle_light': 'Light Mode',
    'lang.zh': '繁體中文',
    'lang.en': 'English',
    'search.placeholder': 'Search sales dashboards...',
    'sidebar.collapse': 'Collapse Sidebar',
    'sidebar.expand': 'Expand Sidebar',
    'status.healthy': 'Cube Online',
  },
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem('si_theme') as ThemeMode) || 'light';
  });

  const [lang, setLangState] = useState<Language>(() => {
    return (localStorage.getItem('si_lang') as Language) || 'zh-TW';
  });

  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => {
    return localStorage.getItem('si_sidebar_collapsed') === 'true';
  });

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState<boolean>(true);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const [operationsMonth, setOperationsMonth] = useState('202610');
  const [activeTab, setActiveTabState] = useState<string>('D00');
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS });
  const [lastDashboardContext, setLastDashboardContext] = useState<DashboardResponse | null>(null);

  const [history, setHistory] = useState<NavigationRecord[]>([]);
  const [drillDownModal, setDrillDownModal] = useState<DrillDownData | null>(null);

  const [zoomLevel, setZoomLevelState] = useState<number>(() => {
    const saved = localStorage.getItem('si_zoom_level');
    const parsed = saved ? parseFloat(saved) : 1.0;
    return !isNaN(parsed) && parsed >= 0.7 && parsed <= 1.5 ? parsed : 1.0;
  });

  useEffect(() => {
    const controller = new AbortController();
    setMetadataLoading(true);
    setMetadataError(null);
    fetchMetadata(controller.signal)
      .then((meta) => {
        if (!controller.signal.aborted) {
          setMetadata(meta);
          setMetadataLoading(false);
        }
      })
      .catch((err: any) => {
        if (!controller.signal.aborted) {
          setMetadataError(err?.message || 'Failed to load /api/metadata');
          setMetadataLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  const aiEnabled = Boolean(metadata?.ai?.enabled);
  const operationsEnabled = metadata?.operations?.enabled === true;

  useEffect(() => {
    localStorage.setItem('si_zoom_level', String(zoomLevel));
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 60);
    return () => clearTimeout(timer);
  }, [zoomLevel]);

  const setZoomLevel = (z: number) => {
    const clamped = Math.min(Math.max(Math.round(z * 10) / 10, 0.7), 1.5);
    setZoomLevelState(clamped);
  };

  const zoomIn = () => {
    setZoomLevelState((prev) => Math.min(Math.round((prev + 0.1) * 10) / 10, 1.5));
  };

  const zoomOut = () => {
    setZoomLevelState((prev) => Math.max(Math.round((prev - 0.1) * 10) / 10, 0.7));
  };

  const resetZoom = () => {
    setZoomLevelState(1.0);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
      } else if (e.altKey && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        zoomOut();
      } else if (e.altKey && e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    localStorage.setItem('si_theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('si_lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('si_sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const setTheme = (t: ThemeMode) => setThemeState(t);
  const toggleTheme = () => setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));

  const setLang = (l: Language) => setLangState(l);
  const toggleLang = () => setLangState((prev) => (prev === 'zh-TW' ? 'en' : 'zh-TW'));

  const setSidebarCollapsed = (c: boolean) => setSidebarCollapsedState(c);
  const toggleSidebar = () => setSidebarCollapsedState((prev) => !prev);

  const isTabAuthorized = (tab: string): boolean => {
    if (tab === 'D07') return aiEnabled;
    return (AUTHORIZED_SALES_TABS as readonly string[]).includes(tab) || (operationsEnabled && (OPERATIONS_TABS as readonly string[]).includes(tab));
  };

  const setActiveTab = (tab: string) => {
    setActiveTabState(isTabAuthorized(tab) ? tab : 'D00');
  };

  const resetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
  };

  const navigate = (targetTab: string, filterUpdates?: Partial<Filters>, customTitle?: string) => {
    const safeTarget = isTabAuthorized(targetTab) ? targetTab : 'D00';
    if (safeTarget === activeTab && !filterUpdates) return;
    const currentTitle =
      customTitle ||
      (DASHBOARD_TITLES[activeTab]
        ? DASHBOARD_TITLES[activeTab][lang === 'zh-TW' ? 'zh' : 'en']
        : activeTab);

    setHistory((prev) => [
      ...prev,
      {
        tab: activeTab,
        title: currentTitle,
        slicer: { ...filters },
        timestamp: Date.now(),
      },
    ]);

    if (filterUpdates) {
      setFilters((prev) =>
        normalizeFilters({
          ...prev,
          ...filterUpdates,
        })
      );
    }

    setDrillDownModal(null);
    setActiveTabState(safeTarget);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    if (history.length === 0) return;
    const prevRecord = history[history.length - 1];
    setHistory((prev) => prev.slice(0, prev.length - 1));
    setActiveTabState(isTabAuthorized(prevRecord.tab) ? prevRecord.tab : 'D00');
    setFilters(normalizeFilters(prevRecord.slicer));
    setDrillDownModal(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const openDrillDown = (data: DrillDownData) => {
    setDrillDownModal(data);
  };

  const closeDrillDown = () => {
    setDrillDownModal(null);
  };

  const t = (key: string): string => {
    return translations[lang][key] || key;
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        lang,
        setLang,
        toggleLang,
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        mobileSidebarOpen,
        setMobileSidebarOpen,
        t,
        metadata,
        metadataLoading,
        metadataError,
        aiEnabled,
        operationsEnabled,
        operationsMonth,
        setOperationsMonth,
        activeTab,
        setActiveTab,
        filters,
        setFilters,
        slicer: filters,
        setSlicer: setFilters,
        resetFilters,
        navigate,
        history,
        goBack,
        clearHistory,
        lastDashboardContext,
        setLastDashboardContext,
        drillDownModal,
        openDrillDown,
        closeDrillDown,
        zoomLevel,
        setZoomLevel,
        zoomIn,
        zoomOut,
        resetZoom,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
