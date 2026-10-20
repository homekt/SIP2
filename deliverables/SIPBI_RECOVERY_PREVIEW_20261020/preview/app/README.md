# SIPBI 銷售分析示範應用

這是五家虛擬公司的共享 BI 示範版。沒有登入或公司權限隔離；能連入此服務的人都能查看全部測試資料。所有金額為合成匯率換算的 USD，數量為 KG，不代表實際營運或市場匯率。

## 啟動

在此目錄執行 `powershell.exe -NoProfile -File .\Start-SIPBI.ps1`，開啟 <http://localhost:5150>。停止時執行 `powershell.exe -NoProfile -File .\Stop-SIPBI.ps1`；停止腳本只停止本應用記錄的 Node 程序。

已附前端建置結果，因此啟動不需要重新安裝 npm 套件。執行環境需要 Windows、Node.js、Windows PowerShell、MSOLAP Provider，及目前 Windows 帳號對下列 SSAS Cube 的讀取權限。SQL Server 不參與產品查詢。

| 項目 | 設定 |
|---|---|
| SSAS | `localhost:25000` |
| 分析資料庫 | `JDE_SALES_CUBE_20261020` |
| Cube | `JDE Sales` |
| 資料日期角色 | Invoice Date（發票日期） |
| 完整資料月份 | 202401–202609 |
| 預設 | 202609、全部公司 |
| HTTP | `0.0.0.0:5150`，前端/API 同源 |

其他電腦使用此主機的區域網路 IPv4 與 5150 埠，例如 `http://主機IP:5150`。若 Windows 私人網路防火牆阻擋，由系統管理員執行 `Enable-Private-LAN.ps1`。規則只允許私人網路、本機子網、TCP 5150，不適用於網際網路發布。未驗證的第二台電腦連線不能由本機測試推定。

## 頁面與計算

提供 D00 決策首頁、D01 銷售總覽、D02 銷售動能、D04 產品組合、D06 客戶貢獻、D08 獲利品質、D11 客戶集中度、D13 業務員實績、D14 產品營收與毛利矩陣、D15 累計與滾動銷售、D16 成長貢獻、D18 銷售觀察。沒有預算、製造、交期或外部市場資料的頁面不開放。

篩選使用成員鍵值。圖表、KPI 及 CSV 使用相同頁面回應；鑽取只提供 Cube 彙總層級，不產生假訂單或批號。

- 淨銷售額、成本與毛利使用 Cube 公開 USD 量值；毛利率由總毛利／總淨銷售額計算，不平均列比率。無有效分母時保留空值。
- 訂單數使用 Cube 不重複計數，不能相加公司／產品／月份的訂單數來推算總數。
- 同比為同一完整月份；YTD 為一月至所選月份；滾動三／十二個月以所選完整月份結束。超出資料涵蓋範圍時標示資料不足。
- 客戶集中度僅在總營收為正且客戶淨營收皆非負時提供；HHI 使用 0–1 尺度。
- 產品矩陣以所選產品營收中位數及整體加權毛利率分區，是內部統計基準。
- 成長瀑布圖是本期與去年同期產品金額之差；不把算術貢獻當成因果解釋。退貨、折讓與負毛利觀察來自實際 Cube 筆數，不加入任意警戒門檻。

## 選用雲端 AI

在啟動前於伺服器程序環境設定 `OPENAI_API_KEY` 與 `OPENAI_MODEL`。缺少任一設定時 AI 停用，D07 不出現在導覽中。憑證不放入前端或版本控制，不使用 Codex 登入憑證。

使用者按下分析後，後端重新取得所選頁面的 Cube 彙總與證據，再送至 OpenAI Responses API。輸出分為觀察、算術貢獻、待驗證假設及證據，僅供顯示，不執行模型產生的程式或查詢。問題上限 2,000 字元、輸出 1,500 tokens、60 秒逾時；單一 IP 每分鐘 5 次、單程序每天 100 次，重新啟動會重設記憶體配額。雲端失敗不影響核心頁面。

官方實作參考：[Responses Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)。未設定真實憑證時只驗證模擬上游測試，不能宣稱真實雲端呼叫成功。

## 開發與驗證

前端首次開發執行 `npm --prefix frontend ci --ignore-scripts`，然後 `npm run build`。執行 `npm test` 驗證新應用的單元／HTTP 測試。SQL 與瀏覽器實機驗證結果另附交付報告，與單元測試分開記錄。

程式以原 `SI-Powered-BI` 乾淨版本 `a7e24c1e8df9a7c409d8406f9cfc9a7ef600c4aa` 為基礎。原專案、原資料庫及 Cube 保留；本應用不執行部署或重新處理 Cube。
