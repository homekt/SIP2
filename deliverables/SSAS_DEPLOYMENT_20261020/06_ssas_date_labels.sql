USE [JDE_CUBE_SYNTHETIC_20261020];
GO
CREATE VIEW bi.DimDateCube AS
SELECT D.*,CONVERT(char(10),FullDate,23) AS DateCaption,
 CONVERT(varchar(4),CalendarYear) AS YearCaption,
 CONCAT('Q',CalendarQuarter) AS QuarterCaption
FROM bi.DimDate D;
GO
