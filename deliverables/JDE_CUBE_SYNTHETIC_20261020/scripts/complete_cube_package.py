from pathlib import Path
import argparse, shutil

ap=argparse.ArgumentParser()
ap.add_argument('--output',type=Path,required=True)
OUT=ap.parse_args().output.resolve()
DB='JDE_CUBE_SYNTHETIC_20261020'

def write(name,text):
    (OUT/name).write_text(text,encoding='utf-8-sig' if name.endswith('.sql') else 'utf-8')

write('sql/00_create_test_database.sql',f'''-- Run explicitly on a development SQL Server instance. NOT run by generation.
USE master;
GO
IF DB_ID(N'{DB}') IS NOT NULL
    THROW 51000, 'Test database already exists. No overwrite is performed.', 1;
EXEC(N'CREATE DATABASE [{DB}]');
GO
''')
write('sql/02_load_csv.sql',f'''-- SQL Server 2019+ on Windows. Edit BOTH server-side file paths below.
-- Service account needs read access. UTF-8 BOM, LF, headers. No destructive reset.
USE [{DB}];
GO
SET XACT_ABORT ON;
IF DB_NAME() <> N'{DB}' THROW 51000, 'Wrong target database.', 1;
IF EXISTS(SELECT 1 FROM CGPRDDTA.F0006) OR EXISTS(SELECT 1 FROM SPKPRDDTA.F5530Z20)
    THROW 51001, 'Tables must be empty; refusing duplicate load.', 1;
BEGIN TRY
    BEGIN TRANSACTION;
    BULK INSERT CGPRDDTA.F0006
    FROM 'C:/BI_TEST/{DB}/data/CGPRDDTA.F0006.csv'
    WITH (FORMAT='CSV', CODEPAGE='65001', FIRSTROW=2, FIELDQUOTE='"', FIELDTERMINATOR=',', ROWTERMINATOR='0x0a', CHECK_CONSTRAINTS, TABLOCK);
    BULK INSERT SPKPRDDTA.F5530Z20
    FROM 'C:/BI_TEST/{DB}/data/SPKPRDDTA.F5530Z20.csv'
    WITH (FORMAT='CSV', CODEPAGE='65001', FIRSTROW=2, FIELDQUOTE='"', FIELDTERMINATOR=',', ROWTERMINATOR='0x0a', CHECK_CONSTRAINTS, TABLOCK);
    IF (SELECT COUNT_BIG(*) FROM CGPRDDTA.F0006)<>30
        THROW 51002, 'Expected 30 cost centers.', 1;
    IF (SELECT COUNT_BIG(*) FROM SPKPRDDTA.F5530Z20)<>60000
        THROW 51003, 'Expected 60000 sales rows.', 1;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
''')
path=OUT/'sql/03_cube_views.sql'
prefix=path.read_text(encoding='utf-8-sig').split('-- BEGIN DERIVED')[0]
derived='''-- BEGIN DERIVED
-- Date decoding is valid for the documented synthetic CYYDDD contract only.
CREATE VIEW bi.FactSales AS
WITH Scaled AS (
 SELECT
  CONCAT(S.SPKCOO,'|',S.SPDCTO,'|',S.SPDOCO,'|',S.SPLNID) AS OrderLineKey,
  CONCAT(S.SPKCOO,'|',S.SPDCTO,'|',S.SPDOCO) AS OrderKey,
  S.SPKCOO AS CompanyKey,
  CONCAT(S.SPKCOO,'|',S.SPMCU) AS PlantKey,
  CONCAT(S.SPKCOO,'|',S.SPMCU1) AS CostCenterKey,
  CONCAT(S.SPKCOO,'|',S.SPAN8) AS CustomerKey,
  S.SPLITM AS ProductKey, S.SPAC01 AS SalespersonKey,
  S.SPDCTO AS OrderType, S.SPDOCO AS OrderNumber,
  CAST(S.SPLNID/1000.0 AS decimal(12,3)) AS OrderLineNumber,
  S.SPURRF AS ContractNumber, S.SPLOTN AS LotNumber, S.SPDOC AS VoucherNumber,
  S.SPEV01 AS BondedFlag, S.SPUOM AS QuantityUnit,
  S.SPCRCD AS TransactionCurrencyKey, C.LocalCurrency AS LocalCurrencyKey,
  S.SPCRR AS LocalPerTransactionCurrency, F.LocalPerUSD AS SyntheticLocalPerUSD,
  D.OrderDate,D.ShipDate,D.InvoiceDate,D.GLDate,
  CONVERT(int,CONVERT(char(8),D.OrderDate,112)) AS OrderDateKey,
  CONVERT(int,CONVERT(char(8),D.ShipDate,112)) AS ShipDateKey,
  CONVERT(int,CONVERT(char(8),D.InvoiceDate,112)) AS InvoiceDateKey,
  CONVERT(int,CONVERT(char(8),D.GLDate,112)) AS GLDateKey,
  YEAR(D.InvoiceDate)*100+MONTH(D.InvoiceDate) AS InvoiceMonthKey,
  CAST(S.SPSOQS/100.0 AS decimal(19,2)) AS SalesQtyKG,
  CAST(S.SPSOQS2/100.0 AS decimal(19,2)) AS ReturnQtyKG,
  CAST(S.SPAA2/100.0 AS decimal(19,2)) AS NetQtyKG,
  CAST(S.SPAEXP/100.0 AS decimal(19,2)) AS GrossSalesLocal,
  CAST(S.SPAEXPE1/100.0 AS decimal(19,2)) AS ReturnsLocal,
  CAST(S.SPAA/100.0 AS decimal(19,2)) AS AllowanceLocal,
  CAST(S.SPAMT1/100.0 AS decimal(19,2)) AS NetSalesLocal,
  CAST(S.SPFEA/100.0 AS decimal(19,2)) AS GrossSalesTransaction,
  CAST(S.SPFEAT/100.0 AS decimal(19,2)) AS ReturnsTransaction,
  CAST(S.SPAA1/100.0 AS decimal(19,2)) AS AllowanceTransaction,
  CAST(S.SPAMT2/100.0 AS decimal(19,2)) AS NetSalesTransaction,
  CAST(S.SPECST/100.0 AS decimal(19,2)) AS SalesCostLocal,
  CAST(S.SPECSTC/100.0 AS decimal(19,2)) AS ReturnCostLocal,
  CAST(S.SPAMT3/100.0 AS decimal(19,2)) AS NetCostLocal,
  CAST(S.SPUNCS/10000.0 AS decimal(19,4)) AS StandardUnitCostLocal,
  CAST(S.SPAMT1/CAST(F.LocalPerUSD*100 AS decimal(22,8)) AS decimal(19,4)) AS NetSalesUSD,
  CAST(S.SPAMT3/CAST(F.LocalPerUSD*100 AS decimal(22,8)) AS decimal(19,4)) AS NetCostUSD,
  CAST(S.SPAEXP/CAST(F.LocalPerUSD*100 AS decimal(22,8)) AS decimal(19,4)) AS GrossSalesUSD,
  CAST(S.SPAEXPE1/CAST(F.LocalPerUSD*100 AS decimal(22,8)) AS decimal(19,4)) AS ReturnsUSD,
  CAST(S.SPAA/CAST(F.LocalPerUSD*100 AS decimal(22,8)) AS decimal(19,4)) AS AllowanceUSD,
'''
names=['IVManufacturingVarianceLocal','LaborVarianceLocal','OverheadVarianceLocal','DepreciationVarianceLocal','PurchasePriceVarianceLocal','InventoryFreezeLocal','PlantProcessLocal','SyntheticTaxLocal','InventoryWriteDownLocal','SharedPurchaseVarianceLocal','SharedFreezeVarianceLocal','SharedProcessVarianceLocal','SharedIVManufacturingVarianceLocal']
derived+=',\n'.join(f'  CAST(S.SPAAN{i:02}/100.0 AS decimal(19,2)) AS {name}' for i,name in enumerate(names,1))
derived+=''',
  CAST(CASE WHEN S.SPSOQS2=S.SPSOQS THEN 1 ELSE 0 END AS int) AS FullReturnLineCount,
  CAST(CASE WHEN S.SPSOQS2>0 AND S.SPSOQS2<S.SPSOQS THEN 1 ELSE 0 END AS int) AS PartialReturnLineCount,
  CAST(CASE WHEN S.SPAA>0 THEN 1 ELSE 0 END AS int) AS AllowanceLineCount,
  CAST(CASE WHEN S.SPAMT1<S.SPAMT3 THEN 1 ELSE 0 END AS int) AS NegativeMarginLineCount,
  CAST(1 AS int) AS SalesLineCount, CAST(1 AS bit) AS IsSynthetic,
  M.MCDL01 AS CostCenterName
 FROM SPKPRDDTA.F5530Z20 S
 JOIN CGPRDDTA.F0006 M ON S.SPKCOO=M.MCCO AND S.SPMCU1=M.MCMCU
 JOIN bi.DimCompany C ON C.CompanyKey=S.SPKCOO
 CROSS APPLY (SELECT
  DATEADD(day,S.SPTRDJ%1000-1,DATEFROMPARTS(1900+S.SPTRDJ/1000,1,1)) AS OrderDate,
  DATEADD(day,S.SPADDJ%1000-1,DATEFROMPARTS(1900+S.SPADDJ/1000,1,1)) AS ShipDate,
  DATEADD(day,S.SPIVD%1000-1,DATEFROMPARTS(1900+S.SPIVD/1000,1,1)) AS InvoiceDate,
  DATEADD(day,S.SPDGL%1000-1,DATEFROMPARTS(1900+S.SPDGL/1000,1,1)) AS GLDate
 ) D
 JOIN bi.SyntheticMonthlyFX F ON F.CompanyKey=S.SPKCOO
  AND F.MonthKey=YEAR(D.InvoiceDate)*100+MONTH(D.InvoiceDate)
)
SELECT Scaled.*,NetSalesLocal-NetCostLocal AS GrossProfitLocal,
 NetSalesUSD-NetCostUSD AS GrossProfitUSD
FROM Scaled;
GO
CREATE VIEW bi.DimCostCenter AS
SELECT CONCAT(MCCO,'|',MCMCU) AS CostCenterKey,
 MCCO AS CompanyKey,MCMCU AS CostCenterCode,MCDL01 AS CostCenterName
FROM CGPRDDTA.F0006;
GO
CREATE VIEW bi.DimPlant AS
SELECT DISTINCT CONCAT(SPKCOO,'|',SPMCU) AS PlantKey,
 SPKCOO AS CompanyKey,SPMCU AS PlantCode,CONCAT(N'虛擬廠別 ',SPMCU) AS PlantName
FROM SPKPRDDTA.F5530Z20;
GO
CREATE VIEW bi.DimCustomer AS
SELECT DISTINCT CONCAT(SPKCOO,'|',SPAN8) AS CustomerKey,
 SPKCOO AS CompanyKey,SPAN8 AS CustomerCode,SPALPH AS CustomerName
FROM SPKPRDDTA.F5530Z20;
GO
CREATE VIEW bi.DimSalesperson AS
SELECT DISTINCT SPAC01 AS SalespersonKey,SPKCOO AS CompanyKey,SPDL01 AS SalespersonName
FROM SPKPRDDTA.F5530Z20;
GO
CREATE VIEW bi.DimCurrency AS
SELECT DISTINCT SPCRCD AS CurrencyKey FROM SPKPRDDTA.F5530Z20
UNION SELECT LocalCurrency FROM bi.DimCompany;
GO
CREATE VIEW bi.DimProduct AS
SELECT DISTINCT SPLITM AS ProductKey,SPITM AS ShortItemNumber,SPDSC1 AS ProductName,
 SPSRP1 AS Category1Code,SPDL04 AS Category1Name,
 SPSRP2 AS Category2Code,SPDL05 AS Category2Name,
 SPSRP3 AS Category3Code,SPDL06 AS Category3Name,
 CASE WHEN SPSRP2='BV' THEN N'重包裝'
 WHEN SPSRP2 IN ('BZ','BF') THEN N'PE袋'
 WHEN SPSRP2 LIKE 'C%' THEN N'缠绕膜'
 WHEN SPSRP2='EZ' THEN N'PEVA'
 WHEN SPSRP2 IN ('EB','EN') AND SPLITM NOT LIKE '%OEM%' THEN N'压花膜'
 WHEN SPSRP2 IN ('EB','EN') AND SPLITM LIKE '%OEM%' THEN N'PE代工'
 ELSE N' ' END AS MajorCategory,
 CASE WHEN SPSRP3 LIKE 'BV%' THEN N'重包裝'
 WHEN SPSRP3 IN ('BFL','BFT','BZS','BZZ','BZB','BZT') THEN N'PE袋'
 WHEN SPSRP3='CWH' THEN N'H' WHEN SPSRP3='CWM' THEN N'M' WHEN SPSRP3='CWP' THEN N'P'
 WHEN SPSRP3='CSA' THEN N'CSA' WHEN SPSRP3='EBB' THEN N'暖暖包'
 WHEN SPSRP3 IN ('EBN','EBP','EBQ','EBD') AND SPLITM NOT LIKE '%OEM%' THEN N'BRE'
 WHEN SPSRP3 IN ('EBN','EBP','EBQ','EBD') AND SPLITM LIKE '%OEM%' THEN N'BRE代工'
 WHEN SPSRP3 IN ('ENN','ENP','ENQ','END') AND SPLITM NOT LIKE '%OEM%' THEN N'NBR'
 WHEN SPSRP3 IN ('ENN','ENP','ENQ','END') AND SPLITM LIKE '%OEM%' THEN N'NBR代工'
 WHEN SPSRP3='EZB' THEN N'PEVA ' ELSE N'  ' END AS MiddleCategory
FROM SPKPRDDTA.F5530Z20;
GO
CREATE VIEW bi.DimDate AS
WITH Digit AS (SELECT n FROM (VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) V(n)),
Dates AS (
 SELECT DATEADD(day,A.n+B.n*10+C.n*100+D.n*1000,CONVERT(date,'20240101',112)) AS FullDate
 FROM Digit A CROSS JOIN Digit B CROSS JOIN Digit C CROSS JOIN Digit D
)
SELECT CONVERT(int,CONVERT(char(8),FullDate,112)) AS DateKey,FullDate,
 YEAR(FullDate) AS CalendarYear,DATEPART(quarter,FullDate) AS CalendarQuarter,
 YEAR(FullDate)*10+DATEPART(quarter,FullDate) AS YearQuarterKey,
 MONTH(FullDate) AS MonthNumber,YEAR(FullDate)*100+MONTH(FullDate) AS MonthKey,
 CONVERT(char(7),FullDate,126) AS YearMonth,DAY(FullDate) AS DayOfMonth
FROM Dates WHERE FullDate<=CONVERT(date,'20261231',112);
GO
'''
write('sql/03_cube_views.sql',prefix+derived)
write('sql/04_verify_import.sql',f'''USE [{DB}];
GO
-- Requires real SQL Server import. NOT executed by generation.
IF (SELECT COUNT_BIG(*) FROM SPKPRDDTA.F5530Z20)<>60000 THROW 51100,'Sales count mismatch.',1;
IF (SELECT COUNT_BIG(*) FROM CGPRDDTA.F0006)<>30 THROW 51101,'Cost center count mismatch.',1;
IF (SELECT COUNT_BIG(*) FROM bi.FactSales)<>60000 THROW 51102,'View join count mismatch.',1;
IF EXISTS(SELECT OrderLineKey FROM bi.FactSales GROUP BY OrderLineKey HAVING COUNT(*)>1)
 THROW 51103,'Duplicate fact key.',1;
IF EXISTS(SELECT 1 FROM SPKPRDDTA.F5530Z20 WHERE SPAA2<>SPSOQS-SPSOQS2 OR SPAMT1<>SPAEXP-SPAEXPE1-SPAA OR SPAMT2<>SPFEA-SPFEAT-SPAA1 OR SPAMT3<>SPECST-SPECSTC)
 THROW 51104,'Amount or quantity reconciliation mismatch.',1;
IF EXISTS(SELECT 1 FROM bi.FactSales F LEFT JOIN bi.DimDate D ON D.DateKey=F.InvoiceDateKey WHERE D.DateKey IS NULL)
 THROW 51105,'Missing invoice date.',1;
SELECT 'FactSales' AS ObjectName,COUNT_BIG(*) AS [RowCount] FROM bi.FactSales
UNION ALL SELECT 'DimCompany',COUNT_BIG(*) FROM bi.DimCompany
UNION ALL SELECT 'DimCostCenter',COUNT_BIG(*) FROM bi.DimCostCenter
UNION ALL SELECT 'DimPlant',COUNT_BIG(*) FROM bi.DimPlant
UNION ALL SELECT 'DimCustomer',COUNT_BIG(*) FROM bi.DimCustomer
UNION ALL SELECT 'DimProduct',COUNT_BIG(*) FROM bi.DimProduct
UNION ALL SELECT 'DimSalesperson',COUNT_BIG(*) FROM bi.DimSalesperson
UNION ALL SELECT 'DimCurrency',COUNT_BIG(*) FROM bi.DimCurrency
UNION ALL SELECT 'DimDate',COUNT_BIG(*) FROM bi.DimDate;
-- Compare with expected_cube_totals.json; LocalRaw and QtyRaw are scaled by 100.
SELECT CompanyKey,InvoiceMonthKey AS MonthKey,COUNT_BIG(*) AS [Rows],
 SUM(NetSalesLocal)*100 AS NetSalesLocalRaw,SUM(NetCostLocal)*100 AS NetCostLocalRaw,
 SUM(NetQtyKG)*100 AS NetQtyRaw,
 SUM(NetSalesUSD) AS NetSalesUSD,SUM(NetCostUSD) AS NetCostUSD
FROM bi.FactSales GROUP BY CompanyKey,InvoiceMonthKey ORDER BY CompanyKey,MonthKey;
GO
''')
print('Created SQL Server import scripts and Cube source views.')
