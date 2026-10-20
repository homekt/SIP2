# SIP2 — SIPBI 銷售 BI 開發成果

SQL Server／SSAS 與 React、TypeScript、ECharts、Node.js、PowerShell 的銷售分析示範應用。資料全部為虛擬測試資料；預設 2026 年 9 月、USD、KG。示範版免登入，可查看五家公司，尚未實施帳號權限。

## 從這裡開始

最新版是 [十二頁 Card Layout 看板](deliverables/SIPBI_CARD_LAYOUT_20261020/README.md)。[十二頁視圖總覽](deliverables/SIPBI_CARD_LAYOUT_20261020/十二頁視圖總覽.html) 含實際截圖，可下載後在瀏覽器開啟；[設計與驗證報告](deliverables/SIPBI_CARD_LAYOUT_20261020/視圖設計與驗證.md) 記錄頁面選圖、互動、驗證範圍及限制。

在已有相同 SSAS 測試環境的 Windows 主機啟動：

```powershell
powershell.exe -NoProfile -File .\Start-SIP2.ps1
# 停止由腳本啟動且身分吻合的程序
powershell.exe -NoProfile -File .\Stop-SIP2.ps1
```

本機開啟 <http://localhost:55154/>。前端代理聆聽 `0.0.0.0:55154`，唯讀 API 代理至本機 `127.0.0.1:55150`。原應用的 5150 埠在原開發主機被 Windows 排除，故最新版使用 55154。既有可用服務會被重用，不會因上傳或下載此儲存庫而停止。

需 Node.js、Windows PowerShell、MSOLAP Provider，以及對 SSAS `localhost:25000`／`JDE_SALES_CUBE_20261020`／`JDE Sales` 的讀取權限。儲存庫不包含 SQL Server 或 SSAS 安裝檔，也不會自動部署資料庫。

## 成果目錄

| 目錄 | 內容 |
|---|---|
| [JDE_CUBE_SYNTHETIC_20261020](deliverables/JDE_CUBE_SYNTHETIC_20261020) | 兩張來源表的 CSV、欄位契約、60,000 筆銷售資料產生器、SQL、資料品質驗證 |
| [SSAS_DEPLOYMENT_20261020](deliverables/SSAS_DEPLOYMENT_20261020) | 實際測試環境的 SQL／Cube XMLA、MDX 及 SQL/Cube 核對結果 |
| [SIPBI_CARD_LAYOUT_20261020](deliverables/SIPBI_CARD_LAYOUT_20261020) | **目前版本**：十二頁原始碼、建置輸出、後端、啟停及 LAN 腳本、畫面證據與驗證 |
| [SIPBI_APP_20261020](deliverables/SIPBI_APP_20261020) | 初期 API／Cube 串接核對成果 |
| [SIPBI_VIEWS_20261020](deliverables/SIPBI_VIEWS_20261020) | 較早的視圖版本與驗證紀錄，供追溯 |
| [SIPBI_RECOVERY_PREVIEW_20261020](deliverables/SIPBI_RECOVERY_PREVIEW_20261020) | 較早的恢復／預覽版本，供追溯 |

各歷史成果內的路徑、連接埠、狀態與雜湊是當時快照；目前啟動方式以本頁及最新版說明為準。保留原有目錄關係，避免破壞檢核腳本的相對路徑。

## 建立資料與 Cube

新環境先閱讀 [測試資料說明](deliverables/JDE_CUBE_SYNTHETIC_20261020/README_使用說明.md) 與 [連線及驗證結果](deliverables/SSAS_DEPLOYMENT_20261020/連線與驗證結果.md)。SQL 的 CSV 路徑與 XMLA 的來源伺服器、Windows 身分是原開發環境設定，必須先依目標環境調整，再依序執行建立、匯入、Cube 建立及處理；不要直接對正式環境執行。SQL 用於獨立核對，產品查詢由 SSAS 供應。

## 開發及測試

```powershell
Set-Location .\deliverables\SIPBI_CARD_LAYOUT_20261020\preview\app
npm.cmd test
npm.cmd --prefix frontend ci --ignore-scripts
npm.cmd --prefix frontend run build
node ../../verification/verify-card-semantics.cjs
```

Vite 重建會清除 dist；若需要截圖總覽頁，將最新版目錄的 `十二頁視圖總覽.html` 複製至 `preview/app/frontend/dist/review.html`。SQL／SSAS 連線與實體裝置的 LAN 驗證需各自環境，不能由單元測試推定。

## 區域網路與選用 AI

原開發主機家用網址是 <http://192.168.1.108:55154/>；這是私人區網位址，其他環境應使用自己的主機 IP。使用者已確認另一台裝置能開啟並看到看板。主機須保持開機、連上家用網路及持續執行服務。

原主機 LAN 設定腳本是 `deliverables/SIPBI_CARD_LAYOUT_20261020/preview/Enable-Home-LAN.ps1`，限已核對的 Wi-Fi 介面／閘道、私人網路、同子網與 TCP55154。它會解析 Node 實際路徑以避免 nvm 捷徑導致防火牆失配。另一台伺服器或 Node 版本改變時需先檢查規則，不能直接沿用介面編號。

AI 預設停用；只有伺服器環境同時設定 `OPENAI_API_KEY`、`OPENAI_MODEL` 時才開放 D07。請以程序環境提供憑證，勿加入版本控制。真實雲端 AI 本輪未呼叫。

儲存庫排除憑證、套件快取、PID／執行狀態、暫存日誌、封包及全機 WFP 診斷資料、重複 ZIP。來源與排除清單見 [匯入清單](docs/import-inventory.json)，本次推送前檢查見 [驗證紀錄](docs/PUSH_VERIFICATION.md)。
