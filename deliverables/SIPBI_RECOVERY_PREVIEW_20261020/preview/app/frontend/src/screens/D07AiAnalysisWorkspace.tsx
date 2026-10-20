import React, { useEffect } from 'react';
import { Filters } from '../types/sales';
import SalesAiWorkspace from './SalesAiWorkspace';
import { useApp } from '../context/AppContext';
import { useSalesDashboard } from '../services/salesApi';

interface Props {
  slicer: Filters;
}

export const D07AiAnalysisWorkspace: React.FC<Props> = ({ slicer }) => {
  const { lang, lastDashboardContext, setLastDashboardContext } = useApp();
  const { data, phase } = useSalesDashboard('D01', slicer);

  useEffect(() => {
    if (data) {
      setLastDashboardContext(data);
    }
  }, [data, setLastDashboardContext]);

  return <SalesAiWorkspace context={phase === 'ok' ? data : null} lang={lang} />;
};

export default D07AiAnalysisWorkspace;
