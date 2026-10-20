USE [JDE_CUBE_SYNTHETIC_20261020];
GO
-- Keys/labels for SSAS only. The two raw source tables remain unchanged.
CREATE VIEW bi.FactSalesCube AS
SELECT F.*,CAST(DENSE_RANK() OVER(ORDER BY OrderKey) AS int) AS OrderSurrogate
FROM bi.FactSales F;
GO
CREATE VIEW bi.DimProductCube AS
WITH Labels AS (
 SELECT P.*,
 CASE WHEN LEN(LTRIM(RTRIM(MajorCategory)))=0 THEN N'未分類' ELSE RTRIM(MajorCategory) END AS MajorLabel,
 CASE WHEN LEN(LTRIM(RTRIM(MiddleCategory)))=0 THEN N'未分類' ELSE RTRIM(MiddleCategory) END AS MiddleLabel
 FROM bi.DimProduct P
)
SELECT Labels.*,CONCAT(MajorLabel,N'|',MiddleLabel) AS MiddleKey FROM Labels;
GO
-- Service identity discovered from the local SSAS Windows service.
-- Grant access ONLY to views in this synthetic database.
USE master;
GO
IF SUSER_ID(N'NT SERVICE\MSSQLServerOLAPService') IS NULL
    CREATE LOGIN [NT SERVICE\MSSQLServerOLAPService] FROM WINDOWS;
GO
USE [JDE_CUBE_SYNTHETIC_20261020];
GO
IF USER_ID(N'NT SERVICE\MSSQLServerOLAPService') IS NULL
    CREATE USER [NT SERVICE\MSSQLServerOLAPService] FOR LOGIN [NT SERVICE\MSSQLServerOLAPService];
GRANT SELECT ON SCHEMA::bi TO [NT SERVICE\MSSQLServerOLAPService];
GO
