# SIPBI twelve-dashboard 視覺化精修 — EVALUATION（本通道四頁）

> 範圍：僅 `frontend/src/screens/` 下 D08、D14、D16、D18。四頁皆先有 KPI＋主圖、後有 `AiInsightCard` 長解讀；改版統一為「KPI → 主圖 → 解讀 → 明細表」。
> 通用修正：層級型（level-only）指標 `trend` 一律 `neutral`（此前多頁把加權毛利率、高毛利產品數等靜態水準標 `trend="up"`，屬於靜態假箭頭，已改為 `neutral`；僅 D16 總差額保留 genuine comparison 的 up/down，因其確為 current vs prior 比較）。
> 通用樣式：沿用既有 light/dark indigo/slate；語義色 sales `#4f46e5`、GP `#0f766e`（dark `#2dd4bf`）、decline `#be123c`（dark `#fb7185`）、secondary `#64748b`、attention `#b45309`；不以顏色為唯一通道（符號 ±、數值標籤、線型並用）。
> 標籤 ≥11px（軸標籤統一 12px、圖例 12px），不用旋轉小字類別 ID；橫向排名用產品 label 作軸標籤、tooltip 帶完整 key＋label。

---

## D08 獲利品質（Profitability Quality）

- **業務問題**：當期切片下，哪些產品真正貢獻毛利、哪些成本中心毛利率偏低？負毛利交易有多集中？
- **現況圖表**：
  1. 產品圖：毛利額 bar（USD 軸）＋ 毛利率 % line ＋ 負毛利行數 line 共用第二軸（`% / Lines`），三種量綱混在雙軸上；
  2. 成本中心圖：橫向 bar 只畫毛利額（USD），毛利率只在標題文字提及、圖上無呈現。
- **問題**：
  - 負毛利「行數」（count）被畫在百分比軸上，量綱錯誤且暗示與毛利率可比；
  - GM% line 在類別軸上連線，類別間無連續意義；
  - x 軸用產品 key、10px 旋轉 25°，窄螢幕難讀；
  - KPI「加權毛利率」「負毛利行數」帶靜態 `trend="up"/"down"` 假箭頭。
- **決策（取代＋分拆）**：原混合雙軸圖**取代**為兩張單一量綱橫向排名圖；不合併（USD 與 % 不可同軸，此即任務要求的 panels explain units）。
- **實作圖表與粒度**：
  - 圖 1「產品毛利額橫向排名 Top 12（按毛利額排序）」：signed 橫 bar、零基線＋零線 markLine；正 `#0f766e`/dark `#2dd4bf`、負 `#be123c`/dark `#fb7185`；bar 末端 `±$` 標籤；tooltip 完整 key＋label、GP、GM%、負毛利行數、淨銷售額（負毛利行數只在 tooltip/表格，不上軸）。
  - 圖 2「成本中心加權毛利率排名（全部成本中心，按 GM% 排序）」：單一 % 軸橫 bar，null 不畫棒（標籤 `—`）；tooltip 帶 GP/淨銷售/GM%。
- **限制**：Top 12 截斷以毛利額為排序基準，圖上副標題明示；全產品明細表＋CSV＋點擊下鑽（product→costCenter、costCenter→product、表列→customer）原樣保留。

## D14 產品營收與毛利矩陣（Product Portfolio）

- **業務問題**：以「內生統計基準」（營收中位數、整體加權毛利率）定位各產品在營收–毛利空間的位置。
- **現況圖表**：散點（x 營收、y GM%）＋中位數/加權毛利虛線；點徑隨營收縮放（`sqrt(val/1500)`）；象限顏色只在表格出現，圖上無圖例；KPI 靜態 `trend="up"`。
- **問題**：
  - 氣泡大小是營收的冗餘二次編碼（x 軸已是營收），大點遮小點；
  - 圖上無法得知顏色＝象限（無 legend、無標籤）；
  - y 軸範圍若全為正會貼邊，無零/負參照；null 閾值時 markLine 已有 guard（保留）。
- **決策（保留＋修正）**：散點與雙閾值**保留**；氣泡改固定、補象限圖例、軸範圍含零。
- **實作圖表與粒度**：
  - 產品級單點粒度；`symbolSize: 8` 固定；四象限拆為四個 series，各有中文/英文象限名＋圖例（高營收·高毛利 `#0f766e`、高營收·低於加權毛利 `#4f46e5`、低於中位營收·高毛利 `#0284c7`、雙低 `#b45309`；dark 下/maroon 不變，另加 label 描邊保證可讀）；
  - x/y 軸 `min` 取 `Math.min(0, …)` 保零基線參照；閾值 null 時不畫線（不造假線），副標題改顯示 `—`＋排除計數（營收/GM% 缺值點不繪、計數揭露）；
  - tooltip：key＋label、淨銷售、毛利額、GM%、淨重、象限名，null 顯示 `—`；
  - 分類揭露「內部統計比較，非市場 BCG」維持（AiInsightCard limitations＋副標題）。
- **限制**：全部產品明細表＋CSV＋穩定 key 下鑽（→customer）保留；散點不画缺值點（與現況一致，僅加計數揭露）。

## D16 成長貢獻（Growth Contribution）

- **業務問題**：當期 vs 去年同月淨銷售差額，由哪些產品變動算術構成？
- **現況圖表**：浮動瀑布（`waterfallSteps`：prior→Top12 絕對 delta→Other→current，`stack:'bridge'`＋`stackStrategy:'all'`）正確；但 x 標籤 10px 旋轉 35°，產品一多即不可讀；tooltip 只顯示單值；解讀卡在 KPI＋圖之前。
- **問題**：僅標籤可讀性與資訊排序問題；橋接數學、helper、回調皆正確，**不可動**。
- **決策（保留＋標籤改善）**：瀑布**完整保留**（helper、stack 策略、Prior/Other/Current 語義、點擊→customer 下鑽、全量 waterfall 表＋CSV 皆不動）。
- **實作圖表與粒度**：
  - 產品級 delta 粒度（Top 12 絕對值＋Other 調和，副標題明示「Top 12 絕對貢獻＋其他產品調和，prior＋Σdelta＝current」）；
  - 圖外包 `overflow-x-auto`＋內層 `minWidth = max(640, steps×76)px`，x 標籤水平 12px、超長截斷（保留完整 key＋label 於 tooltip）；
  - bar 上直接標 signed 簡寫 USD（11px，總計深色描邊）；tooltip 顯示 from→to＋signed delta＋比較月份與基準（去年同月 prior、當期 current），無因果語句；
  - 語義色：總計 `#4f46e5`、正 `#0f766e`/dark `#2dd4bf`、負 `#be123c`/dark `#fb7185`。
- **限制**：`historyStatus !== 'available'`（2024 年月／All）時瀑布為空，警示條保留；YTD/rolling 不屬本頁，不加。

## D18 銷售觀察（Exception Monitor）

- **業務問題**：負毛利、全退、部退、折讓四類觀察型行數在各產品上的分佈與嚴重度排序。
- **現況圖表**：四類行數 stacked bar（`stack:'lines'`）按產品 key 排（10px 旋轉 25°）。
- **問題**：四類**可能重疊**（同一行可同時是負毛利＋折讓），堆疊總高度是無意義的偽「唯一事件總數」；且排序基準不明。
- **決策（取代）**：堆疊圖**取代**為 heatmap（產品 × 觀察類型），不做任何加總。
- **實作圖表與粒度**：
  - heatmap：列＝**按負毛利行數排序的 Top 12 產品**（唯一、文件化之嚴重度排序基準，標題/副標題明示；分母＝全部產品數），欄＝四觀察類型；單一單位 Lines；cell 內嵌 11px 精確計數（顏色非唯一通道）；visualMap 單一 rose 濃度；
  - 副標題＋圖下注記：「四類可能重疊，計數不可加總；無人工閾值」；
  - tooltip：key＋label、類型、計數 Lines；點擊 cell→customer 下鑽（沿用四指標 summaryMetrics，行列映射用 dataIndex，不用 key 猜測）。
- **限制**：`analysis.observations` 卡片、客戶明細全表、observations CSV 原樣保留；不新增「異常總分」等衍生指標；KPI 全 `neutral`（水準型，無比較箭頭）。

---

## 跨頁共同交付

- 四頁皆：KPI → 主圖 → `AiInsightCard` → 明細表；既有事件、表格全行、CSV、主題/中英、鑽取映射不變。
- 不碰：`scripts/**`、`types/**`、`services/**`、`context/**`、`salesMath.ts`、`package*.json`、`routes/App.tsx`、filters/metadata。
- 驗證：無命令執行（控制器在 Windows 測試）；僅工作區讀寫工具；不宣稱瀏覽器/即時驗證。
