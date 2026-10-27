import React, {useState} from 'react';
import type {SalesRow, Analysis} from '../types/sales';
import {useApp} from '../context/AppContext';
import {EChartsContainer} from '../components/charts/EChartsContainer';
import {fmtUSD,fmtSignedUSD,fmtKG,fmtPercent,fmtCount,downloadCsv} from '../utils/salesFormat';
import {categoryShares,topAbsoluteImpact} from './productMath';

const card='bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs';
const button='px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-600 text-indigo-700 dark:text-indigo-300 cursor-pointer';
const esc=(s:string)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function ProductFocus({row,page,onReset}:{row:SalesRow|undefined;page:string;onReset:()=>void}) {
  const {lang,openDrillDown}=useApp(); const zh=lang==='zh-TW';
  if(!row)return <p className="text-xs text-slate-500 dark:text-slate-400">{zh?'點選圖形選取產品；母體及基準保持原範圍。':'Select a product in the chart; population and baselines stay fixed.'}</p>;
  return <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 dark:text-slate-200 bg-indigo-50 dark:bg-indigo-950/40 p-3 rounded-lg" aria-live="polite">
    <strong>{row.label} · {row.key}</strong><span>USD {fmtUSD(row.netSalesUSD,2)} · GP {fmtUSD(row.grossProfitUSD,2)} · {fmtPercent(row.grossMarginPercent)} · {fmtKG(row.netQtyKG)}</span>
    <button className={button} onClick={()=>openDrillDown({title:`${row.key} (${row.label})`,dimensionName:zh?'產品':'Product',dimensionValue:row.key,sourceDashboard:page,groupBy:'customer',filterOverrides:{product:row.key},rows:[]})}>{zh?'下鑽此產品客戶':'Drill to product customers'}</button>
    <button className={button} onClick={onReset}>{zh?'清除選取':'Clear selection'}</button>
  </div>;
}

export function ProductProfitRanking({rows,selectedKey,onSelect,quality=false}:{rows:SalesRow[];selectedKey:string|null;onSelect:(key:string)=>void;quality?:boolean}) {
  const {theme,lang}=useApp();const dark=theme==='dark',zh=lang==='zh-TW';
  const ranked=[...rows].filter(r=>r.grossProfitUSD!==null&&Number.isFinite(r.grossProfitUSD)).sort((a,b)=>Math.abs(b.grossProfitUSD!)-Math.abs(a.grossProfitUSD!)||a.key.localeCompare(b.key)).slice(0,10);
  const invalid=rows.filter(r=>r.grossProfitUSD===null||!Number.isFinite(r.grossProfitUSD));
  const labelColor=dark?'#cbd5e1':'#334155';
  const rankOption={grid:{left:8,right:60,top:16,bottom:35,containLabel:true},tooltip:{trigger:'item',formatter:(p:any)=>{const r=ranked[p.dataIndex];return r?`${esc(r.key)} · ${esc(r.label)}<br/>GP ${fmtUSD(r.grossProfitUSD,2)}<br/>${zh?'負毛利行數':'Negative-margin lines'} ${fmtCount(r.negativeMarginLineCount)}<br/>${fmtKG(r.netQtyKG)} · ${fmtPercent(r.grossMarginPercent)}`:'';}},
    xAxis:{type:'value',name:'USD',axisLabel:{fontSize:11,color:labelColor,formatter:(v:number)=>`${(v/1000).toFixed(0)}k`},splitLine:{lineStyle:{color:dark?'#1e293b':'#e2e8f0'}}},
    yAxis:{type:'category',inverse:true,data:ranked.map(r=>r.key),axisLabel:{fontSize:11,color:labelColor}},series:[{type:'bar',barMaxWidth:24,data:ranked.map(r=>({value:r.grossProfitUSD,key:r.key,itemStyle:{color:r.grossProfitUSD!<0?'#e11d48':'#0d9488',opacity:selectedKey&&selectedKey!==r.key?0.35:1,borderColor:selectedKey===r.key?'#6366f1':undefined,borderWidth:selectedKey===r.key?2:0}})),label:{show:true,position:'right',fontSize:11,color:labelColor,formatter:(p:any)=>fmtUSD(p.value)}}]};
  const valid=rows.filter(r=>typeof r.netQtyKG==='number'&&Number.isFinite(r.netQtyKG)&&typeof r.grossMarginPercent==='number'&&Number.isFinite(r.grossMarginPercent)&&r.netSalesUSD!==null&&r.netSalesUSD>0);
  const contextOption={grid:{left:12,right:20,top:35,bottom:40,containLabel:true},tooltip:{trigger:'item',formatter:(p:any)=>`${esc(p.data.key)}<br/>${fmtKG(p.data.value[0])} · ${Number(p.data.value[1]).toFixed(2)}%`},
    xAxis:{type:'value',name:'KG',axisLabel:{fontSize:11,color:labelColor},splitLine:{lineStyle:{color:dark?'#1e293b':'#e2e8f0'}}},yAxis:{type:'value',name:'GM%',scale:true,axisLabel:{fontSize:11,color:labelColor,formatter:(v:number)=>`${v}%`},splitLine:{lineStyle:{color:dark?'#1e293b':'#e2e8f0'}}},series:[{type:'scatter',symbolSize:10,data:valid.map(r=>({key:r.key,value:[r.netQtyKG,r.grossMarginPercent!*100],itemStyle:{color:r.grossProfitUSD!==null&&r.grossProfitUSD<0?'#e11d48':'#6366f1',opacity:selectedKey&&selectedKey!==r.key?0.3:1}}))}]};
  return <div className={quality?'grid grid-cols-1 xl:grid-cols-2 gap-4':''}><section className={card}>
    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{zh?'產品毛利額：絕對影響前 10 項':'Product GP: top 10 by absolute magnitude'}</h3>
    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{zh?'保留正負號；以毛利額絕對值排序，完整產品仍列於下表。':'Signed values, ordered by absolute GP; all products remain in the table.'}{invalid.length>0?` · ${invalid.length} ${zh?'項毛利缺值未繪':'missing GP rows excluded'}`:''}</p>
    <EChartsContainer option={rankOption} height={`${Math.max(240,ranked.length*29+70)}px`} onEvents={{click:(p:any)=>{const key=p.data?.key;if(key)onSelect(key);}}}/>
  </section>{quality&&<section className={card}><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{zh?'銷量與毛利率：產品品質對照':'Quantity and margin: product context'}</h3><p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{zh?'固定點徑；點為同一產品的淨銷量及毛利率，不與類別彙總拼接。非正營收或缺值未繪，保留在完整表。':'Fixed-size points use quantity and margin from the same product. Nonpositive revenue and missing coordinates stay in the full table.'}</p><EChartsContainer option={contextOption} height="360px" onEvents={{click:(p:any)=>{if(p.data?.key)onSelect(p.data.key);}}}/></section>}</div>;
}

export function ProductDumbbell({rows,onSelect}:{rows:Analysis['waterfall'];onSelect?:(key:string|null)=>void}) {
  const {theme,lang,openDrillDown}=useApp();const dark=theme==='dark',zh=lang==='zh-TW';const [selected,setSelected]=useState<string|null>(null);
  const shown=topAbsoluteImpact(rows,8),focus=rows.find(r=>r.key===selected),color=dark?'#cbd5e1':'#334155';
  const option={grid:{left:8,right:45,top:30,bottom:45,containLabel:true},legend:{bottom:0,textStyle:{fontSize:11,color},data:[zh?'去年同月':'Prior year',zh?'當期':'Current']},tooltip:{trigger:'item',formatter:(p:any)=>{const r=shown[p.dataIndex];return r?`${esc(r.key)} · ${esc(r.label)}<br/>${fmtUSD(r.prior,2)} → ${fmtUSD(r.current,2)}<br/>Δ ${fmtSignedUSD(r.delta,2)}`:'';}},
    xAxis:{type:'value',name:'USD',axisLabel:{fontSize:11,color,formatter:(v:number)=>`${(v/1000).toFixed(0)}k`},splitLine:{lineStyle:{color:dark?'#1e293b':'#e2e8f0'}}},yAxis:{type:'category',inverse:true,data:shown.map(r=>r.key),axisLabel:{fontSize:11,color}},
    series:[{type:'custom',silent:true,data:shown.map((r,i)=>[r.prior,i,r.current]),renderItem:(_p:any,api:any)=>{const a=api.coord([api.value(0),api.value(1)]),b=api.coord([api.value(2),api.value(1)]);return {type:'line',shape:{x1:a[0],y1:a[1],x2:b[0],y2:b[1]},style:{stroke:'#94a3b8',lineWidth:3}};}},
      ...(['prior','current'] as const).map((field,i)=>({name:i?(zh?'當期':'Current'):(zh?'去年同月':'Prior year'),type:'scatter',symbol:i?'circle':'diamond',symbolSize:12,data:shown.map((r,index)=>({key:r.key,value:[r[field],index],itemStyle:{color:i?'#0d9488':'#6366f1',opacity:selected&&selected!==r.key?0.3:1}}))}))]};
  return <section className={card}><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{zh?'產品去年／今年規模對照':'Product prior/current scale comparison'}</h3><p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{zh?'絕對同期差額前 8 項；同一 USD 軸。選取不改變瀑布母體。':'Top 8 absolute YoY deltas; one USD axis. Selection leaves the waterfall population unchanged.'}</p>
    <EChartsContainer option={option} height={`${Math.max(260,shown.length*35+80)}px`} onEvents={{click:(p:any)=>{if(p.data?.key){setSelected(p.data.key);onSelect?.(p.data.key);}}}}/>
    {focus&&<div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 dark:text-slate-200" aria-live="polite"><strong>{focus.key} · {focus.label}</strong><span>{fmtUSD(focus.prior,2)} → {fmtUSD(focus.current,2)} · Δ {fmtSignedUSD(focus.delta,2)}</span><button className={button} onClick={()=>openDrillDown({title:`${focus.key} (${focus.label})`,dimensionName:zh?'產品':'Product',dimensionValue:focus.key,sourceDashboard:'D16',groupBy:'customer',filterOverrides:{product:focus.key},rows:[]})}>{zh?'下鑽此產品':'Drill selected product'}</button><button className={button} onClick={()=>{setSelected(null);onSelect?.(null);}}>{zh?'清除選取':'Clear selection'}</button></div>}
  </section>;
}

export function CategoryShareComparison({rows}:{rows:SalesRow[]}) {
  const {theme,lang}=useApp();const dark=theme==='dark',zh=lang==='zh-TW';const [selected,setSelected]=useState<string|null>(null),shares=categoryShares(rows),focus=rows.find(r=>r.key===selected),color=dark?'#cbd5e1':'#334155';
  return <section className={card}><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{zh?'類別營收占比與銷量占比':'Category revenue share versus quantity share'}</h3><p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{zh?'同類別不同分母：營收占全部類別 USD、銷量占全部類別 KG。差距為結構觀察，非價格或因果結論；不推測產品與類別對照。':'Revenue share uses all category USD; quantity share uses all category KG. Differences describe mix, without inferring prices or product/category joins.'}</p>
    <button className={button} onClick={()=>downloadCsv('D04_Category_Shares.csv',['CategoryKey','Label','NetSalesUSD','NetQtyKG','GrossProfitUSD','GrossMarginPercent','RevenueShare','QuantityShare'],rows.map(r=>[r.key,r.label,r.netSalesUSD,r.netQtyKG,r.grossProfitUSD,r.grossMarginPercent,shares?.find(x=>x.key===r.key)?.salesShare??null,shares?.find(x=>x.key===r.key)?.quantityShare??null]))}>{zh?'匯出全部類別 CSV':'Export all category CSV'}</button>
    {shares?<EChartsContainer height={`${Math.max(260,shares.length*46+70)}px`} option={{grid:{left:8,right:40,top:20,bottom:45,containLabel:true},legend:{bottom:0,textStyle:{fontSize:11,color}},tooltip:{trigger:'axis',valueFormatter:(v:number)=>`${v.toFixed(2)}%`},xAxis:{type:'value',name:'%',axisLabel:{fontSize:11,color},max:100},yAxis:{type:'category',inverse:true,data:shares.map(r=>r.label||r.key),axisLabel:{fontSize:11,color}},series:[{name:zh?'營收占比':'Revenue share',type:'bar',data:shares.map(r=>({key:r.key,value:r.salesShare*100,itemStyle:{color:'#6366f1',opacity:selected&&selected!==r.key?0.3:1}}))},{name:zh?'銷量占比':'Quantity share',type:'bar',data:shares.map(r=>({key:r.key,value:r.quantityShare*100,itemStyle:{color:'#0d9488',opacity:selected&&selected!==r.key?0.3:1}}))}]}} onEvents={{click:(p:any)=>{if(p.data?.key)setSelected(p.data.key);}}}/>:<p className="py-4 text-xs text-amber-700 dark:text-amber-300">{zh?'類別營收或銷量有負值、缺值或合計為零，停用占比比較；請核對原始類別數值。':'Share comparison unavailable: negative/missing values or zero total. Check original category values.'}</p>}
    {focus&&<p className="text-xs text-slate-700 dark:text-slate-200" aria-live="polite"><strong>{focus.label} · {focus.key}</strong> · {fmtUSD(focus.netSalesUSD,2)} · {fmtKG(focus.netQtyKG)} · GP {fmtUSD(focus.grossProfitUSD,2)} · {fmtPercent(focus.grossMarginPercent)} <button className={button} onClick={()=>setSelected(null)}>{zh?'清除選取':'Clear selection'}</button></p>}
  </section>;
}
