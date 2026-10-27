import React,{useRef} from 'react';
import type {Filters} from '../types/sales';
import SalesAiWorkspace from './SalesAiWorkspace';
import {useApp} from '../context/AppContext';
import {useSalesDashboard} from '../services/salesApi';
import {StateGuard} from '../components/common/StateGuard';

export const D07AiAnalysisWorkspace:React.FC<{slicer:Filters}>=({slicer})=>{
  const {lang,lastDashboardContext,setLastDashboardContext}=useApp();
  // Keep the originating dashboard, while current filters always trigger a fresh governed query.
  const sourcePage=useRef(lastDashboardContext?.pageId && lastDashboardContext.pageId!=='D07'?lastDashboardContext.pageId:'D01');
  const {data,phase,error,reload}=useSalesDashboard(sourcePage.current,slicer,setLastDashboardContext);
  return <StateGuard state={phase==='pending'?'LOADING':phase==='error'?'ERROR':phase==='no_data'?'NO_DATA':'READY'} error={error?{code:error.code,reason:error.message}:null} onRetry={reload}>
    <SalesAiWorkspace context={phase==='ok'?data:null} lang={lang}/>
  </StateGuard>;
};
export default D07AiAnalysisWorkspace;
