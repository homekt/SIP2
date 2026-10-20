# AGY 工作交接

使用者要求將 SIP2 工作交接給 AGY。這次先接收上下文並回覆交接確認，等待使用者下一項開發指示；不自行新增功能或改版。

## 接手位置與基準

- GitHub： https://github.com/homekt/SIP2 ，公開儲存庫，分支 `main`。
- 開發成果提交：`98684f804a459d7d68d99ff57f6ec8d771217f3d`，436 個檔案，已推送並核對遠端 SHA。
- 本機接手目錄：`C:\Users\user\Documents\Codex\2026-10-20\new-chat\work\SIP2`。
- **目前版本**：`deliverables/SIPBI_CARD_LAYOUT_20261020/preview/app`。其餘 VIEWS、RECOVERY、APP 目錄為歷史成果，不能誤當目前版本。
- 入口：根目錄 `README.md`、`Start-SIP2.ps1`、`Stop-SIP2.ps1`。
- 本次交接文件與 ACK 會另形成文件提交；以上 SHA 是開發成果基準。

## 已完成內容

1. 依前兩個來源查詢還原兩張表的測試契約：`SPKPRDDTA.F5530Z20`（63 欄、60,000 筆銷售明細）與 `CGPRDDTA.F0006`（3 欄、30 筆成本中心）。資料全部虛構，五家公司，202401–202609，金額 USD、數量 KG。
2. 測試資料、固定種子產生器、資料字典、CSV、SQL、驗證在 `deliverables/JDE_CUBE_SYNTHETIC_20261020`。SQL Server／SSAS 部署定義與核對結果在 `deliverables/SSAS_DEPLOYMENT_20261020`。
3. React／TypeScript／ECharts、Node、PowerShell 產品架構；產品查詢來自 SSAS，SQL 僅獨立核對。十二頁採使用者選定的淺色 Card Layout，依分析問題使用不同圖種，不能再次縮成少量同質長條圖。
4. 可用頁面：D00、D01、D02、D04、D06、D08、D11、D13、D14、D15、D16、D18。缺乏資料支援的頁面隱藏；D07 只在 AI 設定完整時開放。
5. 家用 LAN 已恢復。先前 TCP 封包到達主機後遭 Windows 防火牆封鎖，原因是規則使用 nvm 捷徑、實際程序識別使用實體 Node 路徑。只修正原 BI 規則的 Program，保留 Private／Wi-Fi／LocalSubnet／TCP55154。使用者已重試並確認「可以開啟，看到看板」。

## 執行中環境與保護範圍

- 實際正在服務的副本：`C:\Users\user\Documents\Codex\2026-10-20\new-chat\outputs\SIPBI_CARD_LAYOUT_20261020\preview`，並不是本次 Git clone。不要因接手而停止或切換服務。
- 前端代理 `0.0.0.0:55154`；API `127.0.0.1:55150`。家用網址 http://192.168.1.108:55154/ 。此私有 IP 不是公共網站。
- SSAS `localhost:25000`、資料庫 `JDE_SALES_CUBE_20261020`、Cube `JDE Sales`。
- 原安裝版 `C:\Users\user\Documents\SIPBI-App`、原專案、資料庫與 Cube 均保留，不要覆寫。
- 5150 位於原主機 Windows 排除埠範圍；使用 55154，不要修改 OS 排除埠。
- LAN 設定腳本限定原主機的介面／閘道。不要在不同環境直接執行，也不要關閉防火牆。
- 示範版免登入，五家公司皆可見；介面須明示虛擬資料及未實施帳號權限。

## 不可破壞的資料與視圖語意

- 保留篩選、鑽取、CSV、導覽、語言、主題及既有頁面功能；未有新指示不得替換共用 UI 或重新設計。
- 金額比率由彙總分子／分母計算；訂單數是 Cube 不重複計數，不能加總各群訂單數。
- null／歷史不足保持缺值；同比比較同一完整月份，R3／R12 必須有完整期間。
- 成員使用穩定鍵值；API 不接受任意 SQL／MDX。鑽取是實際 Cube 彙總，不可製造交易明細。
- 產品矩陣是內部營收中位數與加權毛利率基準；瀑布是算術貢獻，不代表市場占有率或因果。
- AI 需 `OPENAI_API_KEY` 與 `OPENAI_MODEL`，使用者點擊才呼叫；不傳憑證，不使用 Codex 登入憑證，不執行模型產生的查詢。

## 已驗證與限制

本次推送前在隔離副本重跑：單元／HTTP 測試 **48/48**、實際 TSX 語意檢查 **26/26**、CSV 資料檢查 **64/64**，TypeScript／Vite 建置通過，637 modules。JS `index-Dc4U2ukl.js`、CSS `index-CsCTqdSd.css` 與交付版一致。第一次 Node 子程序 `spawn EPERM` 是受限環境阻擋，正常使用者權限重跑通過。

既有鎖定依賴的 npm 稽核有 **7 項（2 moderate、5 high）**；主 JS 約 1.61 MB，有 bundle 警告。未為此次推送升級套件。原始 SQL、部分來源與建置 HTML 保留既有空白格式問題，沒有混入大規模格式修訂。

歷史證據含十二頁桌機／窄螢幕、代表頁語言／主題、篩選及鑽取。推送前未重新做全部瀏覽器操作、全組 SQL／Cube 勾稽或真實雲端 AI 呼叫。CSV 序列化已驗證；原生下載落盤驗證仍有限制。詳細範圍見最新版 `視圖設計與驗證.md` 與根目錄 `docs/PUSH_VERIFICATION.md`。

## 建議閱讀與重跑

先閱讀根目錄 `README.md`、`docs/PUSH_VERIFICATION.md`、最新版 `README.md`、`視圖設計與驗證.md`、`reference/設計手冊.md`、`reference/implementation-brief.md`，再依新任務查來源。不要把 CSV、內嵌截圖 HTML 或全部歷史版本讀入模型。

在最新版 app 目錄：

```powershell
npm.cmd test
npm.cmd --prefix frontend ci --ignore-scripts
npm.cmd --prefix frontend run build
node ../../verification/verify-card-semantics.cjs
```

Vite 建置會清除 dist；需要總覽頁時，把最新版目錄的 `十二頁視圖總覽.html` 複製到 `preview/app/frontend/dist/review.html`。單元測試通過不等於 SSAS、瀏覽器或使用者驗收。

## 本次交接指令（AGY）

僅以原生檔案工具閱讀上述必要上下文，建立 `docs/AGY_HANDOFF_ACK.md`：確認基準 SHA、目前版本路徑、已完成／未完成界線、保護範圍，以及下一步等待使用者具體指示。若有明確阻礙請據實記錄。

此次只允許新增這一個 ACK 文件。不改程式、依賴、測試或其他文件；不執行 shell、web、Git、資料庫、服務或部署操作；不自行推送。不得讀取憑證、環境機密、`.git`、`node_modules`、`runtime` 或其他使用者設定。最後以中文簡短回報已接手及 ACK 位置。
