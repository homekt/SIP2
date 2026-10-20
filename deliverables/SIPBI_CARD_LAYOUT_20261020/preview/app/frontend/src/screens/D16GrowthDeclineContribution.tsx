import React from 'react';
import {waterfallSteps} from '../utils/salesMath';
import { Filters } from '../types/sales';
import { useSalesDashboard } from '../services/salesApi';
import { StateGuard } from '../components/common/StateGuard';
import { KpiCard } from '../components/charts/KpiCard';
import { EChartsContainer } from '../components/charts/EChartsContainer';
import { AiInsightCard } from '../components/ai/AiInsightCard';
import { useApp } from '../context/AppContext';
import { getFilterSummaryLabels } from '../utils/slicerData';
import {
  downloadCsv,
  fmtSignedPercent,
  fmtSignedUSD,
  fmtUSD,
} from '../utils/salesFormat';

interface Props {
  slicer: Filters;
}

const compactUSD = (v: number | null, signed = true): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const sign = v > 0 ? (signed ? '+' : '') : v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
};

export const D16GrowthDeclineContribution: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, openDrillDown, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const { phase, data, error, reload } = useSalesDashboard('D16', slicer, setLastDashboardContext);
  const state =
    phase === 'pending'
      ? 'LOADING'
      : phase === 'no_data'
      ? 'NO_DATA'
      : phase === 'error'
      ? 'ERROR'
      : 'READY';

  const summaryLabels = getFilterSummaryLabels(slicer, metadata, isZh);
  const kpis = data?.kpis;
  const analysis = data?.analysis;
  const waterfall = analysis?.waterfall || [];

  const totalDelta = waterfall.reduce((acc, w) => acc + w.delta, 0);
  const positiveItems = waterfall.filter((w) => w.delta > 0);
  const negativeItems = waterfall.filter((w) => w.delta < 0);

  const steps = waterfallSteps(analysis?.priorYearNetSalesUSD??null,kpis?.netSalesUSD??null,waterfall);
  const stepLabel = (step:typeof steps[number]) => step.key==='__prior'?(isZh?'去年同月':'Prior year'):step.key==='__current'?(isZh?'本期':'Current'):step.kind==='other'?(isZh?'其他產品合計':'All other products'):step.key;
  const shortLabel = (step:typeof steps[number]) => {
    if (step.kind === 'other') return isZh ? '其他產品\n合計' : 'All other\nproducts';
    const s = stepLabel(step);
    return s.length > 8 ? s.replace(/-([^-]+)$/, '-\n$1') : s;
  };
  const barColor = (step:typeof steps[number]) =>
    step.kind === 'total' ? (isDark ? '#93c5fd' : '#1e3a8a') : step.delta >= 0 ? (isDark ? '#2dd4bf' : '#0f766e') : (isDark ? '#fb7185' : '#be123c');
  const chartMinWidth = Math.max(640, steps.length * 68);
  const waterfallChartOption = {
    title:{text:isZh?'淨銷售成長瀑布（前 12 項絕對貢獻與其他產品）':'Net Sales Bridge (Top 12 Absolute Contributions + Others)',subtext:isZh?`基準：去年同月 ${fmtUSD(analysis?.priorYearNetSalesUSD)} → 當期 ${summaryLabels.monthLabel}；其他產品完整納入，非因果分析`:'Prior baseline + all product deltas = current; arithmetic contribution only',textStyle:{fontSize:14,color:isDark?'#f1f5f9':'#0f172a'},subtextStyle:{fontSize:11,color:isDark?'#94a3b8':'#64748b'}},
    grid:{left:12,right:28,bottom:60,top:85,containLabel:true},
    tooltip:{trigger:'axis',formatter:(params:any[])=>{const step=steps[params[0]?.dataIndex];if(!step)return '';const head=`<strong>${stepLabel(step)}${step.kind==='product'?' ('+step.label+')':''}</strong>`;if(step.kind==='total')return `${head}<br/>${fmtUSD(step.to,2)}`;return `${head}<br/>${fmtUSD(step.from,2)} → ${fmtUSD(step.to,2)}<br/>${isZh?'變動':'Delta'}: ${fmtSignedUSD(step.delta,2)}`;}},
    xAxis:{type:'category',data:steps.map(shortLabel),axisLabel:{rotate:0,fontSize:12,interval:0,color:isDark?'#cbd5e1':'#334155'}},
    yAxis:{type:'value',name:'USD',axisLabel:{formatter:(value:number)=>'$'+(value/1000000).toFixed(1)+'M',fontSize:12,color:isDark?'#94a3b8':'#64748b'},splitLine:{lineStyle:{color:isDark?'#1e293b':'#e2e8f0'}}},
    series:[
      {name:'connectors',type:'custom',silent:true,z:1,
        data:steps.slice(0,-1).map((step,i)=>[i,step.to]),
        renderItem:(_params:any,api:any)=>{
          const index=api.value(0), y=api.value(1);
          const left=api.coord([index,y]),right=api.coord([index+1,y]);
          const half=api.size([1,0])[0]*0.3;
          return {type:'line',shape:{x1:left[0]+half,y1:left[1],x2:right[0]-half,y2:right[1]},style:{stroke:isDark?'#64748b':'#94a3b8',lineWidth:1,lineDash:[4,3]}};
        }},
      {name:'base',type:'bar',stack:'bridge',stackStrategy:'all',barWidth:'60%',silent:true,itemStyle:{color:'transparent'},emphasis:{disabled:true},data:steps.map(step=>Math.min(step.from,step.to))},
      {name:'USD',type:'bar',stack:'bridge',barWidth:'60%',stackStrategy:'all',label:{show:true,position:'top',fontSize:12,color:isDark?'#cbd5e1':'#334155',formatter:(params:any)=>compactUSD(steps[params.dataIndex]?.delta ?? null, steps[params.dataIndex]?.kind !== 'total')},data:steps.map(step=>({value:Math.abs(step.to-step.from),itemStyle:{color:barColor(step)}}))}
    ]
  };

  const handleExportWaterfallCsv = () => {
    downloadCsv(
      `D16_Waterfall_${slicer.month}.csv`,
      ['ProductKey', 'Label', 'PriorYearUSD', 'CurrentUSD', 'DeltaUSD'],
      waterfall.map((w) => [w.key, w.label, w.prior, w.current, w.delta])
    );
  };

  return (
    <div className="sales-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D16 成長貢獻 (Growth Contribution)' : 'D16 Growth Contribution'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? '產品層級當期對比去年同月 (YoY) 淨銷售額算術成長與衰退貢獻分解'
              : 'Product-level arithmetic contribution to Year-over-Year (YoY) Net Sales change'}
          </p>
        </div>
        {waterfall.length > 0 && (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportWaterfallCsv}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
            >
              {isZh ? '📥 匯出成長貢獻瀑布 CSV' : '📥 Export Waterfall CSV'}
            </button>
          </div>
        )}
      </div>

      <StateGuard
        state={state}
        error={error ? { code: error.code, reason: error.message } : null}
        onRetry={reload}
      >
        {kpis && (
          <>
            {analysis?.historyStatus !== 'available' && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
                <strong>
                  {isZh
                    ? `歷史比較狀態 (${analysis?.historyStatus})：`
                    : `History Status (${analysis?.historyStatus}): `}
                </strong>
                {isZh
                  ? '所選發票月份無對應之去年同月資料（例如 2024 年月份或選擇 All），因此不計算同期瀑布差額。請選擇 202501..202609 之月份以檢視完整 YoY 成長貢獻瀑布。'
                  : 'Selected invoice month does not have a prior-year counterpart in the 202401..202609 coverage (or month is All). Select a month in 202501..202609 to view YoY waterfall contributions.'}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title={isZh ? '去年同月淨銷售額 (Prior)' : 'Prior Year Net Sales'}
                value={fmtUSD(analysis?.priorYearNetSalesUSD)}
                subValue={analysis?.historyStatus === 'available' ? (isZh ? '完整月份比較' : 'Complete-month comparison') : (isZh ? '歷史資料不足' : 'Insufficient history')}
                trend="neutral"
                footnote={isZh ? '比較基準月' : 'Prior-year baseline'}
              />
              <KpiCard
                title={isZh ? '當期淨銷售額 (Current)' : 'Current Net Sales'}
                value={fmtUSD(kpis.netSalesUSD)}
                subValue={summaryLabels.monthLabel}
                trend="neutral"
                footnote={summaryLabels.companyLabel}
              />
              <KpiCard
                title={isZh ? '同期淨變動額 (Total Delta)' : 'Net YoY Delta (USD)'}
                value={
                  analysis?.historyStatus === 'available' ? fmtSignedUSD(totalDelta) : '—'
                }
                subValue={`YoY: ${fmtSignedPercent(analysis?.yoyGrowth)}`}
                trend={
                  analysis?.historyStatus === 'available'
                    ? totalDelta > 0 ? 'up' : totalDelta < 0 ? 'down' : 'neutral'
                    : 'neutral'
                }
                tone={
                  analysis?.historyStatus === 'available'
                    ? totalDelta >= 0
                      ? 'success'
                      : 'warning'
                    : 'default'
                }
                footnote={isZh ? 'Σ(Product Delta) = Current - Prior' : 'Σ(Product Delta) = Current - Prior'}
              />
              <KpiCard
                title={isZh ? '正成長 / 衰退產品數' : 'Growing / Declining Products'}
                value={
                  analysis?.historyStatus === 'available'
                    ? `${positiveItems.length} / ${negativeItems.length}`
                    : '—'
                }
                subValue={`${waterfall.length} ${isZh ? '項聯集產品' : 'Union Products'}`}
                trend="neutral"
                footnote={isZh ? '含當期與前期聯集' : 'Includes union of prior & current'}
              />
            </div>

            {waterfall.length > 0 && (
              <>
                <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{waterfallChartOption.title.text}</h3>
                  <p className="mt-1 mb-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{waterfallChartOption.title.subtext}</p>
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: `${chartMinWidth}px` }}>
                      <EChartsContainer
                        option={{...waterfallChartOption,title:undefined,grid:{...waterfallChartOption.grid,top:38}}}
                        height="380px"
                        onEvents={{
                          click: (params: any) => {
                            const step = steps[params.dataIndex];
                            const item = step?.kind === 'product' ? waterfall.find(row=>row.key===step.key) : undefined;
                            if (item) {
                              openDrillDown({
                                title: isZh ? `${item.key} (${item.label}) 成長貢獻下鑽` : `${item.key} (${item.label}) Drill-Down`,
                                dimensionName: isZh ? '產品' : 'Product',
                                dimensionValue: item.key,
                                sourceDashboard: 'D16',
                                groupBy: 'customer',
                                filterOverrides: { product: item.key },
                                summaryMetrics: [
                                  { label: isZh ? '去年同期' : 'Prior Year', value: fmtUSD(item.prior) },
                                  { label: isZh ? '當期銷售' : 'Current', value: fmtUSD(item.current) },
                                  { label: isZh ? '同期差額' : 'Delta', value: fmtSignedUSD(item.delta) },
                                ],
                                rows: [],
                              });
                            }
                          },
                        }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            <AiInsightCard
              title={isZh ? 'D16 成長與衰退算術貢獻摘要' : 'D16 Growth Contribution Arithmetic Summary'}
                  data={{
                    observed:
                      analysis?.historyStatus === 'available'
                        ? isZh
                          ? `當期 (${summaryLabels.monthLabel}) 淨銷售額 ${fmtUSD(
                              kpis.netSalesUSD
                            )} 對比去年同月 ${fmtUSD(
                              analysis.priorYearNetSalesUSD
                            )}，總差額為 ${fmtSignedUSD(totalDelta)}（YoY ${fmtSignedPercent(
                              analysis.yoyGrowth
                            )}）；其中正成長產品 ${positiveItems.length} 項，衰退產品 ${
                              negativeItems.length
                            } 項。`
                          : `Current (${summaryLabels.monthLabel}) Net Sales ${fmtUSD(
                              kpis.netSalesUSD
                            )} vs Prior Year ${fmtUSD(
                              analysis.priorYearNetSalesUSD
                            )} yields a net delta of ${fmtSignedUSD(totalDelta)} (YoY ${fmtSignedPercent(
                              analysis.yoyGrowth
                            )}), with ${positiveItems.length} growing products and ${
                              negativeItems.length
                            } declining products.`
                        : isZh
                        ? `目前歷史狀態為 ${analysis?.historyStatus}，當期淨銷售額為 ${fmtUSD(
                            kpis.netSalesUSD
                          )}。`
                        : `History status is ${analysis?.historyStatus}; Current Net Sales is ${fmtUSD(
                            kpis.netSalesUSD
                          )}.`,
                    interpretation: isZh
                      ? '瀑布分解採用當期與去年同月之產品聯集（Union），包含去年有銷售但今年為零之消失產品，確保所有產品變動額 (delta) 加總完全吻合總體同期差額 (current - prior)。'
                      : 'Waterfall queries the union of prior and current products (including disappearing products) so the sum of product deltas ties exactly to total current minus prior.',
                    claimType: 'ARITHMETIC_CONTRIBUTION',
                    coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                    confidence: 'SSAS Direct',
                    evidenceId: data?.evidence?.requestId || 'D16',
                    evidence: data?.evidence,
                    source: data?.source,
                    limitations: [
                      isZh
                        ? '僅呈現算術貢獻分解，不宣稱未經驗證之外部市場因果關係'
                        : 'Presents arithmetic revenue decomposition without unverified causal claims',
                    ],
                    nextSteps: [
                      isZh ? '進入 D02 檢視月度銷售動能' : 'Go to D02 Sales Momentum',
                      isZh ? '進入 D04 檢視當期產品組合結構' : 'Go to D04 Product Mix',
                    ],
                  }}
                />

            {waterfall.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                    {isZh ? '產品同期成長與衰退貢獻明細表' : 'Product YoY Growth & Decline Waterfall Table'}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/70">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                            {isZh ? '產品 (Key / Label)' : 'Product'}
                          </th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                            {isZh ? '去年同月 (Prior USD)' : 'Prior Year (USD)'}
                          </th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                            {isZh ? '當期銷售 (Current USD)' : 'Current (USD)'}
                          </th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                            {isZh ? '同期變動額 (Delta USD)' : 'Delta (USD)'}
                          </th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                            {isZh ? '產品 YoY %' : 'Product YoY %'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                        {waterfall.map((w) => {
                          const prodYoy = w.prior > 0 ? (w.current - w.prior) / w.prior : null;
                          return (
                            <tr
                              key={w.key}
                              onClick={() =>
                                openDrillDown({
                                  title: isZh ? `${w.key} (${w.label}) 客戶下鑽` : `${w.key} (${w.label}) Customer Drill-Down`,
                                  dimensionName: isZh ? '產品' : 'Product',
                                  dimensionValue: w.key,
                                  sourceDashboard: 'D16',
                                  groupBy: 'customer',
                                  filterOverrides: { product: w.key },
                                  rows: [],
                                })
                              }
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                            >
                              <td className="px-3 py-2 font-sans">
                                <div className="font-bold text-indigo-600 dark:text-indigo-400">{w.label}</div>
                                <div className="text-2xs font-mono text-slate-400">{w.key}</div>
                              </td>
                              <td className="px-3 py-2 text-right">{fmtUSD(w.prior)}</td>
                              <td className="px-3 py-2 text-right font-bold">{fmtUSD(w.current)}</td>
                              <td
                                className={`px-3 py-2 text-right font-bold ${
                                  w.delta >= 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {fmtSignedUSD(w.delta)}
                              </td>
                              <td className="px-3 py-2 text-right">{fmtSignedPercent(prodYoy)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
            )}
          </>
        )}
      </StateGuard>
    </div>
  );
};

export default D16GrowthDeclineContribution;
