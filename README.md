# 針灸圖譜 · Acupuncture Atlas

以現有 `docs/` 課程講義建立的手機優先 3D 針灸學習 PWA。使用 Vite、Three.js、OrbitControls、Raycaster、GSAP、marked、DOMPurify 與 vite-plugin-pwa。

## 開發與驗證

需要 Node.js 22 以上；建議使用 Node.js 24。

```sh
npm ci
npm run dev
# 正式成品與離線快取驗證
npm run check
npm run build
npm run preview
# 另一個終端機執行瀏覽器測試
npx playwright install chromium
npm run test:e2e
```

瀏覽器測試會自行啟動 4173 port 的正式預覽。支援系統 `/usr/bin/chromium`、Playwright 安裝的 Chromium，或以 `CHROMIUM_PATH` 指定執行檔。測試涵蓋桌面、平板、手機、模型載入、搜尋、經絡篩選、文件聯動、視角控制及離線重載。

## 操作

- 單指旋轉、雙指縮放與平移；也能使用正面／背面、縮放及重設按鈕。
- 點擊綠色穴位，或在目錄搜尋穴名、簡繁別名、標準代碼與定位文字。選取會聚焦人體並更新詳解；網址 `#point=LI4` 可保留選取。
- 預設顯示主要穴位；篩選經絡或搜尋時顯示符合項目的標記。雙側穴位以一側代表，區域點可能重疊。
- 主圖上方的經絡選單與目錄同步；篩選時只顯示該經絡標記，鄰近標籤會避讓以減少遮擋。
- 「閱讀講義」開啟原始全文並標示對應穴位表列。寬表格可左右捲動。教材庫也可搜尋全部文件內文。
- 手機抽屜以約 35% 高度開啟，拖曳頂部把手向上（或點擊把手）可全螢幕查閱原始 Markdown；向下拖曳或按 `Esc` 收回半展開狀態。
- 有來源依據的高風險穴位顯示紅色解剖／危險深度警示，可直接開啟警示來源。未列風險並不代表安全。
- 鍵盤 `/` 開啟搜尋，`Esc` 關閉對話框／手機目錄。

## 表面取點校準

1. 選擇要校準的穴位，開啟主圖右上方「校準模式」。也能在校準面板直接切換穴位。
2. 旋轉至需要的表面，輕點人體；半透明紅球標示實際三角網格交點，面板顯示三位小數的 `{ "x", "y", "z" }`，Console 同步輸出完整座標，並嘗試自動複製。剪貼簿被拒絕時可按「複製座標」重試或長按文字複製。
3. 按「綁定至穴位」即更新畫面並保存於目前瀏覽器；同時保存表面法線，重新計算可推導的示意針向。切換穴位會清除未綁定的暫存取點。
4. 按「匯出 acupoints.json」下載完整資料。瀏覽器不直接改寫儲存庫；將檔案匯入專案並同步：

```sh
npm run calibration:import -- /path/to/downloaded/acupoints.json
npm run data:generate
npm run sync -- "feat: update acupoint surface calibration"
```

匯入器只採用手動座標與法線，保留原教材、針法及警示內容；寫入 `src/data/calibration-overrides.json`，重新產生資料仍會保留校準。本機「還原此穴位」只清除此瀏覽器的覆寫、回到專案座標，不會刪除已匯入專案的紀錄。Local Storage 無法使用時仍能在本次畫面套用並匯出，會明示未持久儲存。

校準模式下拖曳、雙指手勢或點擊空白不會採點；關閉後恢復一般穴位導覽。取點代表模型表面幾何位置，**不代表已完成醫學穴位定位審訂**。

## 資料與模型

原有教材保留原路徑，不為配合前端搬動或改寫。Vite 以 `import.meta.glob` 讀取所有 `docs/**/*.md`，將全文打包進離線 JS。教材含多個穴位，因此 `acupoints.json` 採一穴位對多來源的映射；原表格列、來源路徑與行號一併保留。

```sh
# 修改／新增教材後重新建立索引，再檢查差異
npm run data:generate
npm run check
# 重建本專案原創 GLB 人體示意模型
npm run model:generate
```

資料格式、收錄範圍及缺項見 [src/data/README.md](src/data/README.md) 與 [src/data/coverage.json](src/data/coverage.json)。非穴位分類、未載明或組合療法不當成精準單一穴位。新增教材若有未識別穴名，請先補充 `scripts/generate-acupoints.js` 的名稱、經絡與座標映射；執行產生器及測試後再提交。

`public/models/acupuncture_body.glb` 是本專案生成的幾何人體，**不是經醫學校準的解剖模型**。所有穴位座標均屬示意；耳穴、區域穴只代表大致區域。替換模型時須一併校準座標及表面法線，規格見 [模型說明](public/models/README.md)。

教材中的角度、深度、禁忌照錄來源；未載明的數值不推測。`needle_angle`、`needleVector`／`vector`、原始 `depth`、`technique.dangerLevel` 及 `docPath` 讓教材與場景共用結構化資料。數值角度僅引用原文明確度數。「直刺」沿表面法線向內，以細圓柱針體與箭頭示意，資料中的數值角度仍為 `null`。針體長度不代表實際深度，也不將「寸」換算成模型單位。未知斜刺角度、平刺方向或多種方案不生成任意針向；缺乏資料的風險等級為 `unreviewed`，不標成 `safe`。所有教材尚須專業師資審閱；本應用用於課程學習，不作為臨床取穴導航。

渲染前會再次驗證 `needleVector` 必須為三個有限數值組成的非零陣列。缺值、錯誤格式、NaN、無限值或零向量均不生成針體，仍可聚焦穴位並閱讀教材；抽屜顯示「進針角度與向量：待專業校準」。切換至未知向量穴位時也會清除先前的針體。

公開業界介面的參考範圍及來源見 [DESIGN-REFERENCES.md](DESIGN-REFERENCES.md)，沒有取用第三方受版權保護模型或臨床數值。

## PWA 與離線

正式建置產生 `dist/sw.js`，預快取 app shell、全部教材 JS、人體 GLB、字型與圖示；**開發模式不啟用離線快取**。首次開啟需連線，等待顯示「離線教材已就緒」後再斷網。清除網站資料也會移除離線快取。新版本準備好會提示更新，避免閱讀中途強制重新載入。

上線需要 HTTPS（localhost 可開發）。Android 以 Chrome 安裝選單／安裝按鈕加入主畫面；iOS 在 Safari 分享選單選「加入主畫面」。包含 standalone manifest、192/512 PNG、maskable 圖示、Apple touch icon、safe-area 及 reduced-motion 適配。

## 手機區網與 HTTPS 實測入口

```sh
# 預設 HTTPS 區網預覽，8080 port
npm run mobile:preview
# 同一個 HTTPS 入口的別名
npm run mobile:https
# HTTP 區網預覽，維持 4175 port
npm run mobile:http
# 8080 已有開發伺服器時，另開 8443，不停止既有程序
npm run mobile:https -- --port 8443
```

入口會以根路徑建立正式 `dist/`，以 Vite preview 監聽 `0.0.0.0`，並依實際網卡的非內部 IPv4 位址列出網址與 QR Code。手機與電腦須連接同一 Wi-Fi，掃描相同網段的地址；多網卡時請選手機所在 Wi-Fi 的網段，並依作業系統允許防火牆對應的 port。沒有可用 LAN 位址會明確提示，不用 localhost 假裝手機網址。port 被占用會報錯，不會自動換 port 或終止既有 8080 開發服務。

`mobile:preview` 與 `mobile:https` 都以 `--https` 啟動；`mobile:http` 保留 HTTP 模式。可加 `--skip-build` 使用剛建好的根路徑成品，或以 `--local-only` 只在 loopback 驗證；`--https` 不能與 `--tunnel` 合用，公開隧道改用下面的 HTTP 入口。保持終端機開啟，`Ctrl+C` 關閉自己啟動的預覽。

需要 HTTPS 開發與即時更新時可用 `npm run dev:https -- --port 8444`（`vite.https.config.js`）。開發模式仍不啟用 Service Worker，安裝與離線測試請使用上面的正式成品預覽。

### 自簽 HTTPS 與 PWA 的差別

預設 HTTPS 使用 `@vitejs/plugin-basic-ssl` 產生自簽憑證，憑證快取於忽略追蹤的 `.certs/basic-ssl/`。快取中的組合 PEM 同時含伺服器私鑰，**不要傳到手機或分享**；它不是下方 mkcert 的公開根 CA。這讓手機能測試 HTTPS 傳輸與介面，**不代表手機已信任憑證**。在瀏覽器點選「進階／繼續前往」只略過該次警告，未必建立 Service Worker 或安裝 PWA 所需的可信任安全來源；不能僅憑網址是 HTTPS 或頁面能開啟，就宣稱離線與安裝可用。

此外，basic-ssl 的額外 `domains` 目前以 DNS 名稱寫入憑證，不等同直連 LAN IP 所需的 IP SAN；手機可能同時遇到不受信任與名稱不符警告。要依實際 IP 驗證信任，請使用下方明確簽發 IP SAN 的自有憑證。

HTTP 區網來源通常不是 secure context，適合測觸控、旋轉、縮放與排版；不能用來驗證標準 PWA 安裝與 Service Worker。桌面 localhost 可作開發測試，但手機的 localhost 指手機自己。

### 使用手機信任的憑證

要在自己的手機測完整 PWA，可使用開發用 CA（例如 mkcert）簽發包含**實際電腦 LAN IP** 的憑證，再將該 CA 的公開根憑證安裝並設為手機信任。這些步驟由使用者在自己的電腦與手機操作；專案不會修改雲端或裝置的信任設定。

先依 mkcert 官方安裝說明取得工具：<https://github.com/FiloSottile/mkcert>。以下是本機指令，`192.168.1.23` **只是範例，必須換成入口實際列出的 LAN IP**；IP 改變時需要重新簽發。

```sh
mkcert -install
# 建立 .certs 目錄；也可以用檔案管理員建立
mkdir -p .certs
mkcert -cert-file .certs/atlas.pem -key-file .certs/atlas-key.pem localhost 127.0.0.1 192.168.1.23
npm run mobile:https -- --port 8443 --cert .certs/atlas.pem --key .certs/atlas-key.pem
# 顯示 mkcert CA 目錄，再從該目錄取得公開的 rootCA.pem
mkcert -CAROOT
```

Windows PowerShell 可用 `New-Item -ItemType Directory -Force .certs` 代替 `mkdir -p .certs`。`--cert` 與 `--key` 必須成對提供；也可使用其他可信任 CA 簽發且包含目前 IP／主機名稱的憑證。兩個參數是檔案路徑，不是憑證內容。

**只將公開的 `rootCA.pem` 傳到自己的手機。絕不分享、提交或上傳 `rootCA-key.pem`，也不要分享伺服器私鑰 `atlas-key.pem`。** 根 CA 私鑰能簽發憑證，應始終留在受控電腦；整個 `.certs/` 目錄均應忽略 Git 追蹤。

- iPhone／iPad：在 Safari 開啟自己 CA 的公開根憑證，依系統提示下載描述檔；到「設定 → 一般 → VPN 與裝置管理」安裝該憑證描述檔，再到「設定 → 一般 → 關於本機 → 憑證信任設定」，為這個開發根 CA 開啟完整信任。名稱與位置可能隨系統版本而異。Apple 官方說明：<https://support.apple.com/102390>。
- Android：依裝置版本到「設定 → 安全性／隱私權 → 加密與憑證／其他安全性設定 → 安裝憑證 → CA 憑證」安裝公開根憑證。選項名稱依廠牌與版本而異，受管理裝置可能限制安裝。重新開啟 Chrome 再測；不同瀏覽器／系統的信任政策不能假設完全相同。

安裝 CA 後重新載入實際的 HTTPS LAN 網址，確認沒有憑證錯誤、主機 IP 與憑證名稱匹配；必要時關閉瀏覽器再開啟。只有在該瀏覽器接受信任鏈後，再確認畫面顯示「離線教材已就緒」，以 Safari「分享 → 加入主畫面」或 Chrome 安裝選單測試安裝，最後斷網重新開啟驗證離線。若曾安裝舊網址的版本，重新開啟／安裝目前網址；每個網址的快取與本機校準各自保存，換網址前先匯出校準 JSON。

雲端容器網路受限時，請於本機執行 npm run mobile:preview，並確保手機與電腦處於同一 Wi-Fi，或使用本機 ngrok/localtunnel 建立轉發

雲端顯示的容器 IP 只證明網卡存在，不代表手機有路由可達。本環境可驗證 listener、TLS 與成品請求；不宣稱已在實體 iOS／Android 完成憑證信任或安裝。

### 選用公開 HTTPS 轉發

不想在手機安裝開發 CA 時，可在自己的電腦保持 HTTP 預覽運行，另開終端機擇一取得公開 HTTPS 網址：

```sh
npm run mobile:http
# 另一個終端機擇一；Host 重寫讓 Vite 保留主機名稱檢查
ngrok http 4175 --host-header=rewrite
npx localtunnel --port 4175 --local-host 127.0.0.1
# 或明確使用原 Cloudflare 選項，預設不下載或啟動它
npm run mobile:tunnel
```

依服務商指示完成帳戶或驗證流程；公開網址可讓知道網址的人瀏覽成品。此雲端先前的 Cloudflare quick-tunnel API 直連遭拒（`connect: connection refused`），HTTP/2 隧道也需要 outbound TCP 7844；ngrok／localtunnel 本輪未在雲端啟動。預設 LAN 預覽不依賴外部隧道、不變更網路政策，也不設定 `allowedHosts: true`。

## GitHub 同步

```sh
npm run sync -- "feat: 增加合谷穴進針視角動畫"
# 查看將執行哪些指令；不變更 Git、不推送
npm run sync -- "feat: add acupoint focus" --dry-run
npm run sync -- --status
# 明確指定遠端分支
npm run sync -- "feat: add atlas" --remote origin --branch work
```

`scripts/git-sync.js` 是主要入口；舊的 `scripts/git-push.js` 保留 CLI 與匯出 API 相容性。同步腳本依序執行 `npm run check`、`npm run build`，全部成功才執行 `git add -A`、Conventional Commit 及普通 `git push`。提交訊息以參數陣列傳遞，不拼進 shell；不做強制推送、不儲存憑證。乾淨工作目錄仍會推送既有本地提交。預設依目前分支的 upstream 選擇遠端與目標分支（不假設都是 `origin` 或同名分支）；明確的 `--remote`／`--branch` 可覆寫目標。沒有 upstream 時才預設 `origin` 及目前分支並設定追蹤；detached HEAD、驗證或推送失敗會明確終止。執行前請確認工作目錄都是預期提交的內容；`.env`、相依套件、測試產物及建置輸出已忽略。

## 發布網站

CI 僅安裝、驗證、建置與執行瀏覽器測試，**不自動部署**。可將 `dist/` 部署至任一 HTTPS 靜態主機。

GitHub Pages 專案網址需要正確 base path：

```sh
VITE_BASE_PATH=/acupuncture-atlas/ npm run build
VITE_BASE_PATH=/acupuncture-atlas/ npm run preview
```

網站根目錄部署則不設定 `VITE_BASE_PATH`。manifest、模型、Service Worker 及快取均支援子目錄；切換部署路徑後應重新建置。更新資料或模型超過 20 MiB 時，建置檢查會要求調整快取規劃，不會悄悄漏掉大型模型。

Manrope 字型由 Fontsource 自行託管（OFL-1.1）；人體與圖示為本專案生成，無外部人體模型授權依賴。
