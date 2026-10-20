# SIPBI Card Layout 十二頁檢閱版

先開啟 `十二頁視圖總覽.html` 看十二頁實際截圖，或開啟 http://localhost:55154/ 操作應用。

## 啟動與停止

以 PowerShell 在交付資料夾執行：

```powershell
& .\preview\start-preview.ps1
& .\preview\stop-preview.ps1
```

需本機既有 SQL Server／SSAS 測試環境、Node.js 與 PowerShell；套件已包含建置好的前端。預覽服務使用 localhost:55154，API:55150；來源為 localhost:25000、JDE_SALES_CUBE_20261020、JDE Sales。原安裝版啟動腳本預設5150，目前該埠在 Windows 排除範圍，請使用上面的預覽腳本。

## 原始碼與建置

`preview/app/frontend/src` 為十二頁前端原始碼；既有後端、契約與測試一併附於 `preview/app`。

```powershell
Set-Location .\previewpprontend
npm.cmd ci
npm.cmd run build
```

完整視圖選型、實際驗證及限制見《視圖設計與驗證.md》。原專案、資料庫與 Cube 保留；此交付為獨立檢閱版本。

## 家中其他電腦存取

同一個家用區域網路上的電腦，開啟 **http://192.168.1.108:55154/**。十二頁總覽為 **http://192.168.1.108:55154/review.html**。這台主機必須保持開機、連上家用 Wi-Fi，且 BI 服務持續執行。

服務只對外提供 TCP55154；後端 API55150 仍只聆聽 localhost。防火牆規則限私人網路、Wi-Fi、LocalSubnet 與 Node 程序。若路由器日後重新分配 IP，請改用主機當時的 Wi-Fi IPv4 位址。首次設定由管理員執行 `preview/Enable-Home-LAN.ps1`；腳本會核對這次已授權的家用介面及閘道。

防火牆設定腳本會先解析 Node 的實際執行檔路徑，避免 nvm 的目錄捷徑造成規則無法匹配。Node 版本變更後，需以管理員身分檢查並更新此規則。
