# AGY 工作交接確認（AGY_HANDOFF_ACK）

本文件確認 AGY 已完整接收 `docs/AGY_HANDOFF.md` 及相關核心上下文。已核對基準、正規版本、完成範疇、驗證邊界與保護中服務，目前處於就緒待命狀態，不自行新增功能、改版或執行未授權動作。

---

## 1. 基準與接手位置確認

- **GitHub 儲存庫**：`https://github.com/homekt/SIP2`（公開儲存庫，分支 `main`）
- **開發成果基準 Commit SHA**：`98684f804a459d7d68d99ff57f6ec8d771217f3d`（436 個檔案，已推送並核對遠端一致）
- **本機接手工作目錄**：`C:\Users\user\Documents\Codex\2026-10-20\new-chat\work\SIP2`
- **啟動與停止入口**：
  - 根目錄 `README.md`
  - 啟動腳本：`Start-SIP2.ps1`
  - 停止腳本：`Stop-SIP2.ps1`

---

## 2. 正規應用程式（目前版本）與歷史資產界線

- **目前正規應用路徑**：`deliverables/SIPBI_CARD_LAYOUT_20261020/preview/app`
- **歷史成果目錄定位**：
  - `deliverables/SIPBI_VIEWS_20261020`
  - `deliverables/SIPBI_RECOVERY_PREVIEW_20261020`
  - `deliverables/SIPBI_APP_20261020`
  - 上述目錄均為歷史成果與追溯快照，嚴禁混淆或誤當為目前版本。

---

## 3. 已完成範疇與不可破壞之核心語意

1. **資料契約與合成資料**：
   - `SPKPRDDTA.F5530Z20`（63 欄、60,000 筆銷售明細、20,111 張訂單）與 `CGPRDDTA.F0006`（3 欄、30 筆成本中心）。
   - 全數為虛擬資料，涵蓋 5 家公司，期間 202401–202609，幣別 USD、數量單位 KG。
   - 資料字典、固定種子產生器、CSV、SQL 與驗證規則收錄於 `deliverables/JDE_CUBE_SYNTHETIC_20261020`。
2. **SSAS／SQL Server 部署**：
   - 部署定義、XMLA、MDX 與核對結果收錄於 `deliverables/SSAS_DEPLOYMENT_20261020`。
   - 產品查詢直接由 SSAS 供應（`localhost:25000` / `JDE_SALES_CUBE_20261020` / `JDE Sales`），SQL 僅供獨立核對。
3. **架構與視圖（十二頁 Card Layout）**：
   - 技術棧：React、TypeScript、ECharts、Node.js、PowerShell。
   - 淺色 Card Layout，依不同分析問題選用專屬圖種，嚴禁退化為同質長條圖。
   - 開放頁面：D00、D01、D02、D04、D06、D08、D11、D13、D14、D15、D16、D18。缺資料頁面維持隱藏；D07 僅在伺服器環境設定完整時開放。
4. **不可破壞之計算與視圖語意**：
   - 金額比率必須由彙總分子與彙總分母計算，不可直接平均比率。
   - 訂單數為 Cube 不重複計數（distinct count），禁止跨維度群組累加。
   - null 或歷史期數不足維持缺值；同比比較限完整月份；R3／R12 必須涵蓋完整期間。
   - 維度成員使用穩定鍵值；API 拒絕任意 SQL／MDX 輸入。
   - 鑽取為真實 Cube 彙總，嚴禁捏造不存在的交易明細。
   - 產品矩陣以內部營收中位數與加權毛利率為基準；瀑布圖僅表達算術貢獻，不代表市占率或因果關係。
   - AI 功能嚴格依賴程序環境之 `OPENAI_API_KEY` 與 `OPENAI_MODEL`，由使用者點擊後觸發，絕不上傳憑證或執行模型生成之任意查詢。
5. **家用 LAN 存取**：
   - 已修正 Windows 防火牆規則之程式路徑（將 nvm 捷徑修正為實體 Node 執行檔路徑），維持 Private／Wi-Fi／LocalSubnet／TCP55154 授權。使用者已確認其他裝置可正常開啟並瀏覽看板。

---

## 4. 驗證狀態與已知限制邊界

- **已通過驗證**：
  - 單元／HTTP 測試：`48/48` 通過（正常使用者權限環境）。
  - TSX 頁面語意靜態檢核：`26/26` 通過。
  - 虛擬 CSV 資料一致性檢查：`64/64` 通過。
  - TypeScript 與 Vite 建置：成功，637 modules，產出 `index-Dc4U2ukl.js` 與 `index-CsCTqdSd.css`（與交付版一致）。
- **已知限制與未驗證邊界**：
  - 既有鎖定依賴 npm audit 存有 7 項弱點（2 moderate、5 high），本次未做套件升級。
  - 主 JS bundle 約 1.61 MB，保留 Vite 警告。
  - 原始 SQL、部分原始碼與建置 HTML 保留既有空白格式問題，未混合格式修改。
  - 推送前未重跑全部瀏覽器端實際點擊操作、未進行全套 SQL／Cube 重新勾稽、未呼叫真實雲端 AI。
  - CSV 序列化已核實，但原生瀏覽器端下載落盤仍有限制。

---

## 5. 執行中環境與受保護資源

- **保護中執行實例**：`C:\Users\user\Documents\Codex\2026-10-20\new-chat\outputs\SIPBI_CARD_LAYOUT_20261020\preview`（為當前實際提供服務之副本，非本次 Git 工作目錄）。嚴禁因交接作業停止、重啟或切換該服務。
- **連接埠與網路**：
  - 前端代理：`0.0.0.0:55154`
  - 後端 API：`127.0.0.1:55150`
  - 家用 LAN 網址：`http://192.168.1.108:55154/`（私有 IP，非公開網站）
  - 5150 為 Windows 系統排除埠，嚴禁修改作業系統排除埠設定，維持使用 55154。
- **SSAS 實例**：`localhost:25000`、資料庫 `JDE_SALES_CUBE_20261020`、Cube `JDE Sales`。
- **既有資產保護**：原安裝版 `C:\Users\user\Documents\SIPBI-App`、原專案、資料庫與 Cube 全數保留，嚴禁覆寫。
- **防火牆腳本保護**：`Enable-Home-LAN.ps1` 綁定特定主機網卡與閘道，不得在不同機器直接執行，亦不得關閉系統防火牆。
- **示範版提示**：示範模式免登入且 5 家公司可見，介面必須維持標註虛擬測試資料及未實施帳號權限。

---

## 6. 就緒狀態與待命承諾

- **無未授權變更**：本次交接僅建立本 ACK 文件（`docs/AGY_HANDOFF_ACK.md`），未修改任何應用程式碼、測試、依賴或設定檔。
- **無外部操作**：未執行 shell 指令、網路連線、Git 操作、資料庫連線、服務啟停或部署。
- **隱私與安全**：未讀取任何憑證、私鑰、環境機密或敏感目錄。
- **目前狀態**：**已完全就緒（READY & STANDBY）**，靜候使用者下一步具體開發指示。
