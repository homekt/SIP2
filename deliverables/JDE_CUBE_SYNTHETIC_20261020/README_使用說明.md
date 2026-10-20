# 兩張來源表的 Cube／BI 虛擬測試資料

資料集：JDE_CUBE_SYNTHETIC_20261020，版本 1.0，固定種子 20261020。
用途：SQL Server／SSAS 的資料匯入、維度關聯、度量、鑽取、篩選、趨勢、同比與儀表板開發測試。
所有記錄均為虛構，不是原公司交易或市場匯率。未讀取、覆寫既有資料庫，未建立或處理 SSAS Cube。

## 內容

| 來源表 | 筆數 | 欄位數 | 粒度／鍵 |
|---|---:|---:|---|
| SPKPRDDTA.F5530Z20 | 60,000 | 63 | 已結案訂單項次；公司＋訂單類型＋訂單號碼＋原始項次 |
| CGPRDDTA.F0006 | 30 | 3 | 公司＋成本中心 |

涵蓋 2024-01-01～2026-09-30、33 個發票月份、5 家虛擬公司、10 個廠別、30 個成本中心、132 個產品、250 個客戶、20 位業代。
發票日期為主要分析日期；DimDate 額外涵蓋 2024～2026 全年。2026 年只有 1～9 月交易，同比應比較各年相同的 1～9 月。

CSV 為 UTF-8 BOM、逗號分隔、LF 換行，含英文欄位標頭。請保留公司代碼前導零；Excel 請用「從文字／CSV」，將公司與識別代碼指定為文字。

## 本次測試假設

- 只還原 SQL 用到的 63＋3 欄。schema_contract.json 是合成資料契約，不是正式系統完整 DDL。
- 數量、金額與差異欄位採 bigint 儲存倍率後整數：數量／金額除以 100，SPLNID 除以 1000，SPUNCS 除以 10000。bi.FactSales 已換算，不可再次除倍率。
- 公司代碼為 char(5)，保留 00020、00027、00026、00029、00121，名稱標為「虛擬」。
- 日期原值採測試用 CYYDDD：(西元年－1900)×1000＋年內日序。例如 2024-01-01 為 124001。這是假設，不是對原 GET_DATE 的確認；檢視表已直接解碼，不依賴 GET_DATE。
- 日期順序：開單 ≤ 出貨 ≤ 發票 ≤ 總帳，且不超過 2026-09-30。同訂單的表頭資料一致。
- 所有數量 SPUOM 固定為 KG，避免跨單位加總。正式資料未必如此。
- SPCRCD 是交易幣別；SPCRR 是每一單位交易幣可換幾單位公司本幣。公司本幣含 TWD/CNY/MYR/IDR，交易幣含本幣、USD、EUR。匯率全為測試假設。
- 本幣＝外幣×SPCRR，各分項四捨五入到本幣分。淨額由已舍入分項相減，與淨額直接換匯容許最多 0.0151 本幣的累積舍入差。
- SPAAN08＝淨銷售額×5%，只是測試欄位，不代表任何地區稅法。其餘差異有正負變化；未再加入 SPAMT3，避免成本重複計入。
- SPDL02/SPDL03 使用科目代碼 400100/500100，不作金額加總。SPEV01 使用 Y/N。
- 交付乾淨資料，不混入重複事實鍵、孤兒成本中心或無效日期。驗證程式另以暫時探針確認錯誤資料可被發現。

## 勾稽規則

```text
SPAA2   = SPSOQS - SPSOQS2                 淨數量
SPAMT1  = SPAEXP - SPAEXPE1 - SPAA          本幣淨銷售
SPAMT2  = SPFEA - SPFEAT - SPAA1            交易幣淨銷售
SPAMT3  = SPECST - SPECSTC                 淨成本
SPECST  = ROUND(SPSOQS * SPUNCS / 10000)    倍率後成本
SPECSTC = ROUND(SPSOQS2 * SPUNCS / 10000)   倍率後銷退成本
```

包含正常銷售、部分退貨、全額退貨、折讓、負毛利、淨銷售為零、OEM／非 OEM，以及 CASE 未分類空白分支。各情境筆數見 validation_report.json。
退貨與折讓為同筆銷售明細上的累計值，沒有獨立退貨發生日／退貨單；可按原發票月份分析累計退貨，不能當成退貨事件時間線。

## SQL Server 匯入

建議 SQL Server 2019+ on Windows。執行者需有建測試資料庫、建物件與 bulk import 權限。CSV 必須能由 SQL Server 服務帳號讀取；遠端 SQL Server 不能直接讀用戶端電腦路徑。

1. 解壓到 SQL Server 電腦，例如 `C:/BI_TEST/JDE_CUBE_SYNTHETIC_20261020`。
2. 檢查 `sql/02_load_csv.sql` 的兩個 FROM 路徑，放在別處時修改。
3. 在測試執行個體依序執行 00、01、02、03、04；前一步錯誤就停止。資料庫已存在或表非空時拒絕覆寫，不會自動刪資料。

在本資料夾用整合驗證執行；localhost 改成實際測試執行個體。不要忽略任何腳本錯誤。

```powershell
sqlcmd -S localhost -E -C -b -f 65001 -i ./sql/00_create_test_database.sql
sqlcmd -S localhost -E -C -b -f 65001 -i ./sql/01_create_tables.sql
sqlcmd -S localhost -E -C -b -f 65001 -i ./sql/02_load_csv.sql
sqlcmd -S localhost -E -C -b -f 65001 -i ./sql/03_cube_views.sql
sqlcmd -S localhost -E -C -b -f 65001 -i ./sql/04_verify_import.sql
```

資料庫名稱固定為 JDE_CUBE_SYNTHETIC_20261020。如需改名，請一致修改全部腳本與名稱檢查。本次不匯入或更動既有 JDE_BI_DW。

## SSAS 建模

唯一銷售事實來源是 `bi.FactSales`。下列維度都為 view，不增加其他實體來源表。

| 維度 view | Key | FactSales 欄位 | 預期筆數 |
|---|---|---|---:|
| bi.DimCompany | CompanyKey | CompanyKey | 5 |
| bi.DimPlant | PlantKey | PlantKey | 10 |
| bi.DimCostCenter | CostCenterKey | CostCenterKey | 30 |
| bi.DimCustomer | CustomerKey | CustomerKey | 250 |
| bi.DimProduct | ProductKey | ProductKey | 132 |
| bi.DimSalesperson | SalespersonKey | SalespersonKey | 20 |
| bi.DimCurrency | CurrencyKey | TransactionCurrencyKey／LocalCurrencyKey | 6 |
| bi.DimDate | DateKey | InvoiceDateKey／OrderDateKey／ShipDateKey／GLDateKey | 1096 |

Multidimensional：在 SSDT 建 Data Source 與 DSV，加入上述 views，手動指定 logical primary key 與 fact-to-dimension 關聯。只建一個銷售 measure group；原 SQL 第 1、2 段是相同事實的兩種投影，不可 UNION ALL 或重複加總。日期用發票、開單、出貨、總帳四個 role-playing 維度，幣別用交易幣與本幣兩個角色。

Tabular：使用相同 views，建立一對多、單向的維度→事實關聯。發票日期為預設作用中關聯；其餘使用獨立角色日期表，或非作用中關聯配合 USERELATIONSHIP。

日期階層：CalendarYear → YearQuarterKey → MonthKey → DateKey。不要用單獨 Quarter/MonthNumber 當跨年唯一鍵。Category3Code 不能唯一決定 OEM 顯示名稱，產品分類階層需使用組合鍵或保留平面屬性，不能假設不成立的自然階層。
公司、廠、成本中心、客戶各自直接連 Fact；不要再建立多條作用中的公司篩選路徑。

| 度量 | 聚合方式 |
|---|---|
| NetSalesUSD、NetCostUSD、GrossProfitUSD | SUM，可跨公司加總 |
| SalesQtyKG、ReturnQtyKG、NetQtyKG | SUM，本資料全為 KG |
| NetSalesLocal、NetCostLocal、GrossProfitLocal | 只在單一本幣範圍 SUM |
| NetSalesTransaction 等交易幣金額 | 只在單一交易幣範圍 SUM |
| 毛利率 | SUM(GrossProfitUSD) / SUM(NetSalesUSD)，分母零顯示空白 |
| 退貨率 | SUM(ReturnQtyKG) / SUM(SalesQtyKG)，分母零顯示空白 |
| 訂單數 | DISTINCTCOUNT(OrderKey)，不可用明細列數代替 |
| 明細列數／全退列數／折讓列數 | SUM 對應 LineCount |
| 標準單位成本、匯率、每列百分比 | 不可 SUM；單位成本可依用途以成本／數量重算 |

跨公司總額預設使用 USD 度量。SyntheticMonthlyFX 是本次固定月份匯率 view；USD 每列四捨五入至 4 位後加總，GrossProfitUSD＝已舍入 NetSalesUSD－NetCostUSD。

Tabular 範例度量：

```dax
Net Sales USD := SUM('FactSales'[NetSalesUSD])
Gross Profit USD := SUM('FactSales'[GrossProfitUSD])
Gross Margin % := DIVIDE([Gross Profit USD], [Net Sales USD])
Return Rate % := DIVIDE(SUM('FactSales'[ReturnQtyKG]), SUM('FactSales'[SalesQtyKG]))
Order Count := DISTINCTCOUNT('FactSales'[OrderKey])
```

Multidimensional 金額與數量用 Sum，訂單數用來源為 OrderKey 的 DistinctCount；毛利率用計算度量，不加總或平均每列毛利率。正式 Cube 專案、角色安全性與部署連線依實際環境另建。

## 驗證與重現

- validation_report.json：讀回 CSV 的型態、長度、日期、金額、匯率、情境與關聯檢查，另以 SQLite 主鍵、外鍵、JOIN、GROUP BY 核對。不等於已跑 SQL Server 或 SSAS。
- expected_cube_totals.json：165 個「公司×發票月份」控制總數。LocalRaw 與 QtyRaw 都是倍率後整數；USD 是每列 4 位再加總。用 04_verify_import.sql 的最後查詢比較。
- manifest.json：範圍、種子、公司本幣、測試匯率與來源 SQL SHA256。
- schema_contract.json：每欄 SQL Server 型態、nullable 與倍率。
- source_dictionary.md：前一步從原查詢反推的欄位意義；與本包正式選定的測試型態分開。
- SHA256SUMS.json：交付檔案雜湊，不包含自身與外層 ZIP。
- scripts：Python 3.10+ 標準函式庫即可重現，沒有資料庫連線。

```powershell
python ./scripts/generate_cube_test_data.py --output ./regenerated --source ./source_queries_1_2.txt
python ./scripts/complete_cube_package.py --output ./regenerated
python ./scripts/validate_cube_test_data.py ./regenerated
```

依序產生、補上 SQL、驗證；source 參數可用原三段 SQL 附件或本包的前兩段文字。若改資料筆數，匯入腳本的預期筆數也需同步修改。重建會產生資料、metadata、SQL 與驗證，不另複製本說明與前一步欄位字典。原始 SQL 為原方言，不能直接當 T-SQL 執行，請使用本包 views。

這兩張表可測試銷售、毛利、客戶、產品、廠別、成本中心、累計銷退與差異分析。沒有預算、庫存餘額、應收帳款、交期承諾、獨立退貨事件或生產工單，不支持預算達成率、庫存週轉、DSO、準時交貨率或 OEE 的完整測試。

官方參考：
- https://learn.microsoft.com/en-us/sql/t-sql/statements/bulk-insert-transact-sql
- https://learn.microsoft.com/en-us/analysis-services/multidimensional-models/use-aggregate-functions
