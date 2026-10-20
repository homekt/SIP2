# SIPBI 銷售分析看板視覺化精煉評估報告 (EVALUATION)

本評估報告針對授權負責之四個核心看板頁面（`D00`、`D01`、`D02`、`D15`）及共用元件（`AiInsightCard`、`KpiCard`、`index.css`），在凍結資料合約（`contract/CONTRACT.md`）與既有 API／資料結構的前提下，逐頁檢視業務問題、現有圖表問題、保留／替換／合併決策、實作圖表與資料粒度，以及資料限制。

---

## 1. D00 決策首頁 (`frontend/src/screens/D00DecisionHome.tsx`)

### 業務問題 (Business Question)
決策者在進入系統時，如何在單一緊湊的分析畫面中立即掌握當前發票月份與營運公司切片下的核心銷售指標（淨銷售額、毛利額、淨銷量、不重複訂單數、退貨率、前五大客戶集中度 CR5）、跨月淨銷售與毛利趨勢、五家營運公司表現對比，並快速導覽至 12 個授權銷售看板（及條件式啟用之 D07 AI 分析工作區）？

### 現有圖表與版面 (Current Charts)
1. **頂部巨型漸層 Hero 橫幅**：含深色漸層背景、閃爍圓點動畫、大字標題與三個導覽按鈕。
2. **長篇解讀置頂**：`AiInsightCard` 排在 KPI 卡片與圖表之前。
3. **各公司淨銷售額與毛利率對比（雙軸柱線混合圖）**：左軸為淨銷售額與毛利額（USD 柱狀圖），右軸為毛利率（GM% 折線圖）。
4. **產品類別淨銷售額結構（環圈圓餅圖）**：以扇形角度呈現各產品大類之銷售佔比。
5. **看板目錄與近期 6 個月快照表**：位於頁面下方。

### 現有問題 (Problems)
- **視覺階層倒置與空間浪費**：巨型漸層 Hero 與置頂的長文字解讀擠壓了首屏核心 KPI 與主圖表的可視空間，不符高密度分析工作區規範。
- **首頁缺乏核心時間趨勢圖**：決策首頁未將「月度淨銷售額與毛利額走勢」作為主圖，反而將主視覺留給雙軸公司圖與類別圓餅圖（與 D01、D04 重複，且圓餅圖不利於精確比較金額與毛利）。
- **雙軸尺度混淆**：公司對比圖將 USD 金額與 GM% 百分比疊加於雙 Y 軸，視覺高度關係失真。
- **自創門檻與假趨勢箭頭**：毛利額 KPI 以 `grossMarginPercent >= 0.2` 顯示向上趨勢，退貨率 KPI 以 `returnRatePercent > 0.05` 顯示向下趨勢與警告色，違反「不捏造風險門檻、僅對真實比較顯示漲跌方向」之規範。

### 保留／替換／合併決策 (Retain / Replace / Merge Decision)
- **移除巨型 Hero，改為緊湊決策頁首列**：保留標題、發票日期與幣別／單位基準揭露、D01／D18／D07 快速導覽按鈕與公司 CSV 匯出按鈕。
- **調整資訊順序**：首屏直接呈現 6 張核心 KPI 卡片與雙主圖（月度趨勢 + 公司排行），將緊湊版看板導覽目錄、近期月份快照表與可收合之 `AiInsightCard` 置於其下。
- **主圖表替換為「月度淨銷售額與毛利額趨勢圖 (USD)」**：採用單一 USD 座標軸、未平滑折線（`smooth: false`，缺失月份保留空白斷點），淨銷售額（`#4f46e5` 實線＋圓形標記）與毛利額（`#0f766e`／深色 `#2dd4bf` 虛線＋菱形標記）同時以色彩、線型與符號區分；點擊任一月份可切換至該月總覽。
- **副圖表改為「各營運公司淨銷售額與毛利額水平排行 (USD)」**：移除雙軸 GM% 折線，改以單一 USD 座標軸之水平分組長條圖呈現全母體 5 家公司（Y 軸顯示完整 `label (key)`，字體 >= 11px），於資料標籤與 Tooltip 完整列出淨銷售額、毛利額、毛利率 GM% 與訂單數；完整保留點擊公司長條觸發 `openDrillDown`（展開產品明細與 D01/D04 穿透建議）以及產品類別下鑽按鈕。

### 實作圖表、粒度與限制 (Implemented Chart, Grain & Limits)
- **圖表 1（主趨勢）**：月度淨銷售額與毛利額折線圖｜粒度：`Invoice Month`（`datasets.monthly`，`202401` 至所選月份，或 `All` 下全部 33 個月）｜單位：USD。
- **圖表 2（公司比較）**：營運公司淨銷售額與毛利額水平分組長條圖｜粒度：`Company`（`datasets.companies`，全母體 5 家公司，依 `netSalesUSD` 降冪排序）｜單位：USD。
- **限制**：所有比率（GM%、退貨率、CR5）與不重複訂單數均直接取自後端合約回應；水平指標（毛利額、淨銷量、訂單數、退貨率、CR5）一律設為 `trend="neutral"`，僅淨銷售額在具備真實 `yoyGrowth` 時顯示比較方向。

---

## 2. D01 銷售總覽 (`frontend/src/screens/D01ExecutiveOverview.tsx`)

### 業務問題 (Business Question)
決策者如何全面檢視所選切片下的營收與毛利絕對規模、加權毛利率（GM%）跨月變化、各廠區（Plant）淨銷售額排行，以及各營運公司的完整損益、銷量、單價與訂單明細？

### 現有圖表與版面 (Current Charts)
1. **月度淨銷售額、毛利額與毛利率走勢（雙軸柱線混合圖）**：左軸 USD 繪製淨銷售額與毛利額柱狀圖，右軸 % 繪製毛利率折線圖。
2. **各廠區 (Plant) 淨銷售額與銷量表現（水平長條圖）**：標題宣稱顯示「淨銷售額與銷量表現」，但實際圖表僅繪製「淨銷售額 (USD)」單一數列。
3. **營運公司銷售與獲利明細表**：列出各公司營收、成本、毛利、毛利率、銷量、ASP 與訂單／行數。

### 現有問題 (Problems)
- **金額與毛利率雙軸混用**：月度走勢圖將 USD 絕對金額與 GM% 百分比放在同一畫布的左右雙軸，造成跨軸視覺交叉干擾，難以獨立判斷金額規模波動與毛利率走勢。
- **廠區圖表標題與實際數列不符**：廠區長條圖標題寫「淨銷售額與銷量表現 (Plant Net Sales & Volume Performance)」，實際上只有 `netSalesUSD` 一個數列，容易誤導讀者以為圖中同時畫了 KG 銷量。
- **KPI 假趨勢與版面順序**：`AiInsightCard` 置於 KPI 之前；毛利額 KPI 無前期比較卻固定傳入 `trend="up"`。

### 保留／替換／合併決策 (Retain / Replace / Merge Decision)
- **拆分月度雙軸圖為上下對齊雙面板（Split Monetary Trend & GM% Panel）**：
  1. **上面板 — 月度淨銷售額與毛利額走勢 (USD)**：單一 USD 座標軸，呈現淨銷售額（`#4f46e5`）與毛利額（`#0f766e`／深色 `#2dd4bf`），未平滑處理，保留缺失斷點。
  2. **下面板 — 月度加權毛利率走勢 (GM %)**：單一百分比（%）座標軸，未平滑折線（`smooth: false`）呈現各月 `grossMarginPercent * 100`，清楚標示計算公式 `GM% = Gross Profit / Net Sales`。上下兩面板對齊相同的發票月份 X 軸，並完整保留點擊任一月份開啟 `openDrillDown` 下鑽該月產品結構之互動。
- **修正廠區排行圖標題與語意配色**：保留各廠區水平長條圖（全母體廠區，依 `netSalesUSD` 降冪排序），將標題精確修正為「各廠區 (Plant) 淨銷售額排行 (USD) / Plant Net Sales Ranking (USD)」，匹配實際單一淨銷售額數列；Y 軸顯示完整 `label (key)`（字體 >= 11px），Tooltip 補充顯示淨銷量（KG）、毛利率與訂單數，並保留點擊廠區下鑽產品明細。
- **保留營運公司明細表並將 KPI 與圖表置前**：保留完整公司明細表（數值等寬右對齊、點擊跳轉 D02、CSV 匯出），將 `AiInsightCard` 移至圖表下方。

### 實作圖表、粒度與限制 (Implemented Chart, Grain & Limits)
- **面板 1A**：月度淨銷售額與毛利額趨勢圖｜粒度：`Invoice Month`（`datasets.monthly`）｜單位：USD。
- **面板 1B**：月度加權毛利率趨勢圖｜粒度：`Invoice Month`（`datasets.monthly`）｜單位：%。
- **圖表 2**：各廠區淨銷售額水平排行圖｜粒度：`Plant`（`datasets.plants` 全母體，依 `netSalesUSD` 降冪）｜單位：USD。
- **明細表**：營運公司銷售與獲利明細表｜粒度：`Company`（`datasets.companies` 全母體）。
- **限制**：`Order Count` 為 SSAS Cube Distinct Count 彙總，不可由各月或各廠區直接相加；毛利額 KPI 移除靜態 `trend="up"`，改為 `trend="neutral"`。

---

## 3. D02 銷售動能 (`frontend/src/screens/D02SalesMomentum.tsx`)

### 業務問題 (Business Question)
決策者如何檢視月度淨銷售額的連續時間走勢，並與「去年同完整發票月份（Same Complete-Month Prior Year）」進行對齊比較（YoY 金額對比與 YoY 成長率 %），同時清楚辨識哪些月份具備完整前期歷史、哪些月份屬於歷史覆蓋不足（`insufficient_history`）或全期彙總（`not_applicable`）？

### 現有圖表與版面 (Current Charts)
1. **月度銷售動能與淨銷量趨勢（雙軸柱線混合圖）**：左軸為淨銷售額與毛利額（USD），右軸為淨銷量（KG），完全未呈現月度 YoY 同期比較。
2. **各公司銷售額與平均單價 ASP（雙軸柱線混合圖）**：左軸為淨銷售額（USD），右軸為平均單價（USD/KG）。
3. **各公司當期銷售動能與數量指標表**：底部公司明細表。

### 現有問題 (Problems)
- **圖表未能回答 YoY 同期動能問題**：D02 的核心主題是月度銷售動能與 YoY 同期比較，但現有左圖卻畫 USD 與 KG 雙軸、右圖畫 USD 與 ASP 雙軸，缺乏月度當期 vs. 去年同月以及月度 YoY% 變動的直觀視覺化。
- **雙軸混用不同單位**：USD 與 KG、USD 與 USD/KG 混在同一畫布雙軸，違反避免雙軸混用不同量綱之設計原則。

### 保留／替換／合併決策 (Retain / Replace / Merge Decision)
- **將月度動能拆分為上下對齊之「月度銷售趨勢」與「同完整月份去年同期 YoY 比較」雙面板**：
  - 基於 `datasets.monthly`（已依 `YYYYMM` 排序之完整發票月份），對每個月份 `YYYYMM` 查找同序列中前推 12 個月 `(year - 1) + MM` 的完整月份資料：
  1. **上面板 — 月度淨銷售額與去年同完整月份對比 (USD)**：單一 USD 座標軸，未平滑折線（`smooth: false`，`connectNulls: false`），同時繪製「當月淨銷售額（`#4f46e5` 實線＋圓點）」與「去年同完整月份淨銷售額（`#64748b` 虛線＋空心圓點）」。對於 2024 年各月（`202401..202412`，因資料覆蓋始於 `202401` 無 2023 年資料），去年同月序列嚴格保持 `null` 空白斷點（gaps），清楚標示「無前期歷史區間保留空白斷點」。
  2. **下面板 — 同完整月份 YoY 同期成長率 (%)**：與上面板共用對齊的 `Invoice Month` X 軸，採用以 `0%` 為基準線之正負向長條圖（Signed Bar Chart，正成長 `#0f766e`／深色 `#2dd4bf`，衰退 `#be123c`／深色 `#fb7185`）；當前期同月不存在（如 `202401..202412`）或前期淨銷售額 `<= 0` 時，嚴格保留 `null` 空白斷點，絕不補零或外推。兩面板皆保留點擊任一月份切換該月切片（`navigate('D02', { month: m.key })`）之互動。
- **改良各公司表現圖表為單軸水平比較**：移除 USD 與 ASP 雙軸疊加，改為「各營運公司淨銷售額與毛利額水平排行 (USD)」，於 Tooltip 與下方明細表完整呈現 ASP（USD/KG）、淨銷量（KG）、毛利率與退貨率，並保留點擊公司觸發 `openDrillDown` 下鑽產品明細。

### 實作圖表、粒度與限制 (Implemented Chart, Grain & Limits)
- **面板 1A**：月度淨銷售額 vs. 去年同完整月份淨銷售額未平滑折線圖｜粒度：`Invoice Month`（`datasets.monthly`）｜單位：USD。
- **面板 1B**：月度同完整月份 YoY 成長率正負長條圖（零基線）｜粒度：`Invoice Month`（`datasets.monthly`）｜單位：%。
- **圖表 2**：各營運公司當期淨銷售額與毛利額水平比較圖｜粒度：`Company`（`datasets.companies` 全母體）｜單位：USD。
- **限制**：頂部 KPI 的「去年同期淨銷售額」與「YoY 成長率」直接讀取後端 `analysis.priorYearNetSalesUSD` 與 `analysis.yoyGrowth`；當 `month === 'All'`（`not_applicable`）或所選月份為 2024 年（`insufficient_history`）時，KPI 嚴格顯示 `—`。

---

## 4. D15 累計與滾動銷售 (`frontend/src/screens/D15RollingSales.tsx`)

### 業務問題 (Business Question)
決策者如何分別檢視單月淨銷售額（Monthly）、近 3 個月滾動總和（R3M Sum）、近 12 個月滾動總和（R12M Sum）與年初至今累計（YTD Sum）四種不同時間視窗的趨勢，清楚理解各視窗獨立的 USD 量級尺度、歷史起算斷點，以及 YTD 於每年 1 月重設（Resets in January）的特性？

### 現有圖表與版面 (Current Charts)
1. **四合一雙軸疊加圖（`rollingChartOption`）**：將當月淨銷售額（柱狀圖，左軸）、近 3 月滾動 R3M（折線，左軸）、年度累計 YTD（虛線，右軸）、近 12 月滾動 R12M（折線，右軸）全部疊加於同一張雙軸圖表；X 軸月份代碼為 10px 並旋轉 25 度。
2. **YTD KPI 假趨勢**：YTD KPI 卡片固定傳入 `trend="up"` 與 `tone="success"`。
3. **月度銷售、毛利與滾動序列明細表**：僅列出單月銷售、毛利、毛利率、銷量與訂單數，未在表格中並列顯示 `enrichMonthly` 的 R3M、R12M 與 YTD 數值。

### 現有問題 (Problems)
- **四序列雙軸混疊導致視覺判讀困難**：單月（1M）與近 3 月總和（3M）量級相差約 3 倍卻共用左軸，壓縮了單月波動；YTD（1 至 12 月遞增、每年 1 月斷崖式重設回單月值）與 R12M（12 個月平滑移動總和）共用右軸，四條序列交錯重疊，無法清楚區分年度重設與滾動視窗斷點。
- **座標軸字體過小且旋轉**：X 軸 `fontSize: 10, rotate: 25` 違反 `>= 11px` 與禁止微小旋轉類別 ID 的規範。
- **YTD KPI 靜態假箭頭**：YTD 屬於累計金額水準，無同期比較時不應標示向上趨勢。

### 保留／替換／合併決策 (Retain / Replace / Merge Decision)
- **將四序列雙軸疊加圖替換為 2×2 四宮格小型序列圖（Four Small Multiples）**：
  - 100% 保留 `enrichMonthly(monthly)` 的算術結果與時間斷點（不更改滾動視窗算法、不改為移動平均）：
  1. **面板 1 — 當月淨銷售額 (Monthly Net Sales, USD)**：獨立 USD 座標軸，未平滑折線／柱狀呈現單月實績（`#4f46e5`）。
  2. **面板 2 — 近 3 個月滾動總和 (R3M Sum, USD)**：獨立 USD 座標軸，未平滑折線（`#0f766e`／深色 `#2dd4bf`，`connectNulls: false`），前 2 個月因未滿 3 個完整月自動保留 `null` 空白起點。
  3. **面板 3 — 近 12 個月滾動總和 (R12M Sum, USD)**：獨立 USD 座標軸，未平滑折線（`#4f46e5` 搭配方形標記，`connectNulls: false`），前 11 個月因未滿 12 個完整月自動保留 `null` 空白起點。
  4. **面板 4 — 年初至今累計 (YTD Cumulative Sum, USD · 每年 1 月重設)**：獨立 USD 座標軸，未平滑折線（`#b45309`／深色 `#f59e0b`，`connectNulls: false`），明確標示「每年 1 月重設起算（Resets in January）」。
  - 在圖表區標題與各面板副標題明確標註「四面板皆使用獨立 USD 尺度（Independent USD Scales），YTD 於每年 01 月重設」。四面板均保留點擊任一月份觸發 `navigate('D15', { month: item.row.key })` 的互動。
- **強化月度與滾動序列明細表**：在底部明細表中完整保留全部月份列與原始指標，並同步呈現 `enrichMonthly` 之 R3M、R12M 與 YTD 欄位供精確核對，保留 CSV 匯出與點擊切換月份功能。

### 實作圖表、粒度與限制 (Implemented Chart, Grain & Limits)
- **圖表 1–4（Small Multiples）**：Monthly / R3M Sum / R12M Sum / YTD Sum 四個獨立面板｜粒度：`Invoice Month`（`enrichMonthly(datasets.monthly)`）｜單位：獨立尺度 USD。
- **限制**：完全沿用 `frontend/src/utils/salesMath.ts` 之 `enrichMonthly` 計算，不跨出 `202401..202609` 外推，若月份序列不連續或缺少當年 01 月則回傳 `null`（顯示為 `—` 與圖表空白斷點）。

---

## 5. 共用元件與樣式 (`AiInsightCard.tsx`、`KpiCard.tsx`、`index.css`)

### `AiInsightCard.tsx`
- **問題**：原設計採用紫色漸層與光暈背景，且一次展開全部長段落，佔用過多垂直空間。
- **決策與實作**：改為沉穩緊湊的卡片設計（移除漸層與模糊光暈）。預設直接展示：標題、來源標記（明確標示 `SSAS Direct · Local Cube` 非雲端生成）、Claim Type 徽章、範圍（Scope）、核心「實測數據摘要（Observed Metrics）」、永遠可見的「資料揭露與限制（Disclosure & Boundaries）」以及「查閱證據收據（View Evidence）」按鈕；並提供可展開／收合的「結構分析與下一步建議（Structural Notes & Next Steps）」控制項，展開後完整顯示 `interpretation` 與 `nextSteps` 看板導覽按鈕。所有原始文字、揭露資訊與證據收據抽屜 100% 保留。

### `KpiCard.tsx`
- **問題**：可點擊卡片缺少鍵盤操作支援（`tabIndex`、`role="button"`、`Enter`/`Space` 鍵處理與 `:focus-visible` 樣式）；數字未設定 `tabular-nums`；許多頁面傳入靜態 `trend="up"` 給單純水準指標（level-only metrics），造成假漲跌暗示。
- **決策與實作**：
  1. 補齊鍵盤無障礙互動（`role="button"`、`tabIndex={0}`、`onKeyDown` 處理 Enter/Space、清晰聚焦框）與 `tabular-nums` 等寬數字對齊。
  2. 嚴格區分「真實比較（Genuine Comparison）」與「單純水準（Level-Only）」：僅當 `subValue` 或 `value` 帶有真實比較語意（如 `YoY`、`Delta`、`+`/`-` 變動且數值非 `—`）且 `trend` 為 `'up' | 'down'` 時，才渲染方向符號（`▲` / `▼`）與語意漲跌色（正成長 `#0f766e`／`#2dd4bf`，衰退 `#be123c`／`#fb7185`）；若僅為靜態水準指標（即便舊頁面常數傳入 `trend="up"`），一律以中性沉穩色彩呈現，杜絕假趨勢箭頭。

### `index.css`
- **問題**：缺乏高密度分析面板、等寬數字表格與無障礙聚焦之共用樣式規則。
- **決策與實作**：保留 Tailwind 指令與亮暗色系基底，新增非侵入式的 `.sales-dashboard`、`.chart-panel`、`.tabular-nums`、表格標題與聚焦狀態（`:focus-visible`）規則，不覆寫全域 `div`/`table` 佈局，不新增外部字型。
