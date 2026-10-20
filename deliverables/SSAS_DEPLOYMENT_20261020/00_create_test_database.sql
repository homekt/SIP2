-- Run explicitly on a development SQL Server instance. NOT run by generation.
USE master;
GO
IF DB_ID(N'JDE_CUBE_SYNTHETIC_20261020') IS NOT NULL
    THROW 51000, 'Test database already exists. No overwrite is performed.', 1;
EXEC(N'CREATE DATABASE [JDE_CUBE_SYNTHETIC_20261020]');
GO
