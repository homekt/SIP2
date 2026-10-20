# LANE_RESULT — twelve-dashboard 精修通道（D08 / D14 / D16 / D18）

## 變更檔案（僅擁有範圍內）

- `EVALUATION.md`（新增）：四頁中文評估（業務問題／現況／問題／保留-取代-合併決策／實作圖表與粒度／限制）。
- `frontend/src/screens/D08ProfitabilityQuality.tsx`（改寫圖表區＋KPI trend＋版面順序）：
  - 刪除 USD／%／行數三量綱混合雙軸圖；改為兩張單一量綱橫向排名圖。
  - 圖 1：產品毛利額 Top 12（按毛利額排序，副標題明示基準與分母），signed 橫 bar＋零基線虛線，正 `#0f766e`/dark `#2dd4bf`、負 `#be123c`/dark `#fb7185`，bar 末端 `±$` 標籤；tooltip 完整 key＋label、GP、GM%、負毛利行數、淨銷售額。
  - 圖 2：成本中心 GM% 排名（全部成本中心按 GM% 排序），單一 % 軸，null 以 `—` 表示不繪棒。
  - KPI 靜態假箭頭移除：加權毛利率、負毛利行數改 `trend="neutral"`（負毛利仍保留 `warning` tone 作注意標記）。
  - 版面改為 KPI → 主圖 → `AiInsightCard` → 全產品明細表；表格、CSV（`exportSalesRowsCsv` 全行）、點擊下鑽映射（product→costCenter、costCenter→product、表列→customer）原樣保留。
- `frontend/src/screens/D14ProductPortfolio.tsx`（散點修正）：
  - 點徑固定 `symbolSize: 8`（刪除營收二次編碼）；四象限拆為四個 series，圖例具名＋配色；另加「未分類（基準缺值）」series，閾值 null 時非缺值點仍繪製、無假線。
  - x/y 軸 `min` 取 `Math.min(0, …)` 保留零基線參照；副標題揭露繪製數／缺值排除數與「內部統計比較，非市場 BCG」。
  - tooltip 完整 key＋label、淨銷售、毛利額、GM%、淨重、象限名（null 顯示 `—`）；KPI 靜態 `trend="up"` 改 `neutral`。
  - 版面改為 KPI → 主圖 → `AiInsightCard` → 全產品明細表；CSV＋穩定 key 下鑽（→customer）保留。
- `frontend/src/screens/D16GrowthDeclineContribution.tsx`（標籤與順序，不動數學）：
  - `waterfallSteps` helper、`stack:'bridge'`＋`stackStrategy:'all'`、Prior/Top12/Other/Current 語義、點擊下鑽、全量表＋CSV、`historyStatus` 警示條全部保留。
  - x 標籤改水平 12px（超長截斷，完整 key＋label 留 tooltip），圖外包 `overflow-x-auto`＋`minWidth = max(640, steps×76)px`；bar 頂標 signed 簡寫 USD；tooltip 顯示 from→to＋signed delta＋基準（去年同月 prior／當期月份）。
  - 語義色：總計 `#4f46e5`、正 `#0f766e`/dark `#2dd4bf`、負 `#be123c`/dark `#fb7185`。
  - 版面改為 banner → KPI → 主圖 → `AiInsightCard` → 明細表；`AiInsightCard` 在無瀑布（All／歷史不足）時仍顯示，明细表僅在有瀑布時顯示（與原行為一致）。
- `frontend/src/screens/D18ExceptionMonitor.tsx`（堆疊圖取代為熱力圖）：
  - 刪除四類 `stack:'lines'` 堆疊 bar；改為產品 × 觀察類型 heatmap，列為按**負毛利行數**排序的 Top 12（唯一嚴重度基準，標題明示分母），欄為四觀察類型；單位 Lines；cell 內嵌 11px 精確計數；圖下＋副標題注記「四類可能重疊，計數不可加總；無人工閾值」。
  - 點擊 cell→customer 下鑽（沿用四指標 summaryMetrics，按 dataIndex 映射）；KPI 全 `neutral`。
  - `analysis.observations` 卡片、客戶全表、observations CSV 原樣保留；未新增任何衍生總分指標。
- 未碰契約凍結範圍：`scripts/**`、`types/**`、`services/**`、`context/**`、`salesMath.ts`、`package*.json`、`routes/App.tsx`、filters/metadata、其他頁面、共享元件。

## 實際檢查（無命令執行）

- 本會話被授權限制為唯讀＋編輯工具（無 shell／建置／瀏覽器），**未執行任何命令測試**，控制器在 Windows 端測試。
- 以 `read_file` 逐段覆核四檔：D16 經兩次結構編輯後，已確認 fragment 開合（chart 條件塊、常駐 `AiInsightCard`、條件明細表）與結尾標籤平衡；D14 `series: [...map, unclassified]` 經一次括號修正後已確認合法；D08 排序／tooltip／零基線函數已讀核。
- `muse.search` 在本會話對擁有檔案回傳空結果（連必然存在的字串亦無命中），判定為工具路徑範圍問題而非程式碼缺失；改以直接 `read_file` 核驗，不採信 search 的「無殘留」結論——殘留檢查（舊 `trend="up"`／`rotate`／`stack:`／`yAxisIndex`）係在寫檔內容層面確認，寫入時已全數移除（D16 總差額的 genuine current-vs-prior up/down 表達式保留，屬任務允許之真實比較）。

## 剩餘疑慮（未做瀏覽器／即時驗證，不宣稱）

- ECharts 選項皆為靜態物件層級改寫，未經 `tsc`／打包／瀏覽器渲染驗證；型別上 `EChartsContainer option: any`，`min: (v) => …`、`heatData` 元組、`'-'` 缺值標記等寫法需控制器建置確認。
- D18 heatmap 以 `'-'` 表缺值：ECharts heatmap 缺值慣例，但 visualMap 連續刻度下缺值 cell 的著色行為需視覺確認；label／tooltip 已做 `—` 兜底。
- D08／D18 橫向排名 y 軸用產品 label：若有重複 label，tick 文字會重複顯示，但 bar／點擊映射皆為位置索引對應排序陣列，不錯位。
- D14 四象限 markLine 沿用原案「每 series 各帶一組閾值線」寫法，非空象限會重疊繪出相同虛線（視覺無差異，效能可忽略）；空象限不畫線，至少一象限非空即有線。
- D16 窄螢幕依賴橫向捲動而非 dataZoom；控制器若偏好內建 dataZoom 可再議，但捲動方案已滿足「可讀標籤」要求。
