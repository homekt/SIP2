import React from 'react';
import type {DashboardResponse} from '../types/sales';
import {VerifiedAnalysisPanel} from '../components/ai/VerifiedAnalysisPanel';

export const SalesAiWorkspace:React.FC<{context:DashboardResponse|null;lang:'zh-TW'|'en'}>=({context,lang})=>{
  const zh=lang==='zh-TW';
  return <div className="sales-dashboard space-y-4">
    <header><h2 className="text-xl font-bold text-slate-900 dark:text-white">{zh?'D07 銷售資料解讀工作區':'D07 Sales Explanation Workspace'}</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{zh?'沿用進入工作區前的銷售頁面；變更篩選會重新查詢該頁目前範圍。模型輔助與可核對資料解讀分別顯示。':'Keeps the originating sales page; filter changes query its current scope again. Model assistance and verified explanation are labeled separately.'}</p></header>
    <VerifiedAnalysisPanel dashboard={context} panelId="overview"/>
  </div>;
};
export default SalesAiWorkspace;
