# LANE-RESULT（Card Layout 修訂・D06 / D08 / D13 / D15）

## 實際變更檔案
- `frontend/src/screens/D06CustomerContribution.tsx`（重寫）：
  主圖改為客戶規模 × 毛利率散佈（x 實際 netSalesUSD、y 實際 GM%；
  等尺寸單一藍點、零線、null GM 缺值不繪並揭露家數）；下方僅保留
  Top 10 毛利額緊湊圓點圖（非第二個大排行）；全客戶表改 `<details open>`
  漸進揭露；保留客戶 key 下鑽（產品）、匯出 CSV、StateGuard、證據卡。
  首張 KPI 卡在有 YoY 時顯示真實 YoY 箭頭，否則維持中性。
- `frontend/src/screens/D08ProfitabilityQuality.tsx`（重寫）：
  兩個無關排行改為兩個連貫視圖——① 月營收藍柱（左 USD 零基線）＋
  加權毛利率 amber 線（右 %，異形雙軸、刻度與系列同色）；
  ② 淨銷售額＝成本（slate）＋毛利（amber）堆疊分解，提示附核對差，
  不堆營收＋毛利、不宣稱營業利益。負毛利行數只在 KPI/表/提示。
  成本中心貢獻改為緊湊明細表；產品證據全表＋匯出保留；圖內 title
  全部改為外部標題（配合 EChartsContainer caption/grid.top=40 行為）。
- `frontend/src/screens/D13SalespersonPerformance.tsx`（重寫）：
  全員並列橫條改為業務員績效矩陣散佈（x 營收、y 加權 GM%、等尺寸藍點；
  整體加權毛利率 slate 虛線標「統計參照非目標」）；配全體 20 位緊湊明細表
  （訂單/淨銷量/ASP 產出脈絡、客戶下鑽）。不另做棒棒糖排行：
  矩陣已給品質向度、20 列全表即精確排行（見 DESIGN-NOTE）。
- `frontend/src/screens/D15RollingSales.tsx`（修訂）：
  保留單一主工作區＋Monthly/R3/R12/YTD 模式、enrichMonthly、
  YTD 分年斷線、選月強調、點擊導航、33 期全表/CSV。
  色彩改為 Monthly 藍柱、R3 藍線、R12 slate 線、YTD amber；
  主圖 y 軸加零基線；每 KPI 下加 ≤12 個實際月迷你趨勢
  （止於選月、All 止於最後可用月；既有加總值、缺值留白，
  KpiCard 本體未動、迷你圖為無框 ECharts 避免巢狀卡邊）。
- `DESIGN-NOTE.md`（新增）：中文、每頁核心問題/缺口/新圖/資料侷限/手冊規則。
- `LANE-RESULT.md`（本檔）。

## 真正執行過的檢查
- 唯讀工具重讀四個改寫檔：確認 import/hook/JSX 結構完整、
  無殘留舊 helper、無圖內 title、皆有 `export default`、
  所有 hooks 位於頂層（無條件式 hooks）。
- 以搜尋確認：四檔皆無 `chartHeight/rankLabel/pointIndex/signedPoint`
  殘留；圖表 option 皆無內嵌 `title:`（外部標題＋窄屏橫捲在外層）。
- 未執行任何命令、編譯、測試或瀏覽器驗證（本 lane 禁止 shell；
  依任務要求不聲稱測試或視覺驗證）。

## 已知疑慮（交給 controller）
- TypeScript/編譯未在本 lane 執行，需 controller 驗證，
  重點：散佈 `dataIndex` 物件型 tooltip、D13 `markLine: undefined`
  分支、D15 `useCallback` 依賴。
- `KpiCard` 凍結且無 `trendSeries` 屬性，故 D15 迷你趨勢以獨立
  ECharts 實作；若 controller 之後在 KpiCard 實作該合約可再遷移。
- D08 月序列取自同切片 `datasets.monthly` 若某切片該集為空，
  兩張月圖為空狀態、下方明細與 KPI 不受影響。
