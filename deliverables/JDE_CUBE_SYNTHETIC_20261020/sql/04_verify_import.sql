USE [JDE_CUBE_SYNTHETIC_20261020];
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
