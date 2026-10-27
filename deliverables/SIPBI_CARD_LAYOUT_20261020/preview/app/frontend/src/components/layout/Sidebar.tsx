import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getVisibleDashboards } from '../common/Header';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const {
    sidebarCollapsed,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    t,
    lang,
    aiEnabled,
    operationsEnabled,
  } = useApp();
  const [search, setSearch] = useState('');
  const isZh = lang === 'zh-TW';

  const visibleDashboards = getVisibleDashboards(aiEnabled);

  const categories = [
    { key: '決策首頁', label: t('nav.decision_hub'), icon: '🌟' },
    ...(aiEnabled ? [{ key: 'AI 銷售分析', label: t('nav.ai_workspace'), icon: '🤖' }] : []),
    { key: '總覽與動能', label: t('nav.executive_growth'), icon: '📈' },
    { key: '產品與獲利', label: t('nav.product_profit'), icon: '🧩' },
    { key: '客戶與業務實績', label: t('nav.customer_sales'), icon: '🤝' },
  ];

  const filteredDashboards = visibleDashboards.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = (isZh ? d.nameZh : d.nameEn).toLowerCase();
    const cat = (isZh ? d.categoryZh : d.categoryEn).toLowerCase();
    return d.id.toLowerCase().includes(q) || name.includes(q) || cat.includes(q);
  });

  const content = (
    <div className="h-full flex flex-col justify-between">
      <div>
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
          {!sidebarCollapsed ? (
            <div className="flex items-center space-x-2.5 overflow-hidden">
              <span className="flex h-3 w-3 relative flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div className="truncate">
                <div className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">
                  {isZh ? 'JDE 銷售導航' : 'JDE Sales Nav'}
                </div>
                <div className="text-2xs text-slate-400 font-mono">
                  {visibleDashboards.length} {isZh ? '個銷售看板' : 'Sales Views'}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
          )}

          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hidden md:block cursor-pointer"
            title={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          >
            <svg
              className={`h-4 w-4 transform transition-transform duration-200 ${
                sidebarCollapsed ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search.placeholder')}
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <svg
                className="h-4 w-4 text-slate-400 absolute left-2.5 top-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        )}

        <div className="p-2 overflow-y-auto max-h-[calc(100vh-180px)] space-y-4">
          {operationsEnabled && <section className="border-b border-slate-200 dark:border-slate-700 pb-3 mb-3">
            {!sidebarCollapsed && <h2 className="px-2 py-2 text-xs font-semibold text-slate-500">{isZh ? '營運模型 · CNY · 獨立月份' : 'Operations · CNY · separate period'}</h2>}
            {[
              ['OPS_PRODUCTION', isZh ? '生產效率與品質' : 'Production & Quality', '⚙'],
              ['OPS_FULFILMENT', isZh ? '交付與積壓' : 'Delivery & Backlog', '↗'],
              ['OPS_BUDGET', isZh ? '預算執行檢討' : 'Budget Execution', '◎'],
            ].filter(item => !search.trim() || item.join(' ').toLowerCase().includes(search.toLowerCase())).map(([id,label,icon]) => <button key={id} type="button" title={label} aria-current={activeTab === id ? 'page' : undefined} className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 ${activeTab === id ? 'bg-indigo-600 text-white' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`} onClick={() => { onTabChange(id); setMobileSidebarOpen(false); }}><span>{icon}</span>{!sidebarCollapsed && <span>{label}</span>}</button>)}
          </section>}
          {categories.map((cat) => {
            const items = filteredDashboards.filter(
              (d) => d.categoryZh === cat.key || d.category === cat.key
            );
            if (items.length === 0) return null;

            return (
              <div key={cat.key}>
                {!sidebarCollapsed && (
                  <div className="px-2 py-1 text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>{cat.label}</span>
                    <span className="text-2xs font-normal">({items.length})</span>
                  </div>
                )}

                <div className="space-y-0.5 mt-1">
                  {items.map((item) => {
                    const isActive = activeTab === item.id;
                    const itemName = isZh ? item.nameZh : item.nameEn;
                    const itemBadge = isZh
                      ? item.badgeZh || item.badge
                      : item.badgeEn || item.badge;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onTabChange(item.id);
                          setMobileSidebarOpen(false);
                        }}
                        title={`${item.id} - ${itemName}`}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-between group cursor-pointer ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className="text-sm flex-shrink-0">{item.icon}</span>
                          {!sidebarCollapsed && <span className="truncate">{itemName}</span>}
                        </div>

                        {!sidebarCollapsed && itemBadge && (
                          <span
                            className={`text-2xs px-1.5 py-0.2 rounded-md font-mono flex-shrink-0 ml-1 ${
                              isActive
                                ? 'bg-indigo-500 text-indigo-50'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
                            }`}
                          >
                            {itemBadge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!sidebarCollapsed && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-2xs text-slate-400 space-y-0.5">
          <div className="font-semibold text-slate-600 dark:text-slate-300">
            {activeTab.startsWith('OPS_') ? 'SI Manufacturing BI · CNY / KG' : 'JDE Sales BI · USD / KG'}
          </div>
          <div className="font-mono">localhost:25000</div>
          <div className="font-mono text-[10px]">{activeTab.startsWith('OPS_') ? 'SI_Powered_BI' : 'JDE_SALES_CUBE_20261020'}</div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside
        className={`hidden md:block bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-shrink-0 sticky top-0 h-screen transition-all duration-200 z-40 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {content}
      </aside>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative w-72 max-w-[80vw] bg-white dark:bg-slate-900 h-full shadow-2xl z-50 flex flex-col">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
