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

## 手機區網實測入口

```sh
npm run mobile:preview
```

預設以根路徑建立正式 `dist/`，使用 **Vite preview `--host 0.0.0.0`、4175 port** 啟動區域網路預覽。終端機依電腦實際網卡的非內部 IPv4 位址列出每個可用網址與 QR Code；手機與電腦連接同一 Wi-Fi 後掃碼即可測試觸控、旋轉、縮放和排版。若有多張網卡，選擇與手機所在 Wi-Fi 相同網段的地址，必要時允許防火牆的 4175 port。未取得有效 LAN 位址時會明確提示，不會用 localhost 假裝手機網址。

**區網 HTTP 通常不是安全內容來源（secure context），不能用來驗證 Service Worker 離線快取或標準 PWA 安裝。** 安裝與離線行為請使用 HTTPS 網址，再等待「離線教材已就緒」；桌面 localhost 可作開發測試，但手機不能以電腦的 localhost 連線。

雲端容器網路受限時，請於本機執行 npm run mobile:preview，並確保手機與電腦處於同一 Wi-Fi，或使用本機 ngrok/localtunnel 建立轉發

雲端顯示的容器 IP 只證明本機網卡存在，不代表手機有路由可達。此環境的驗證限於本機 listener 與 HTTP 成品回應，不宣稱手機已成功連線。保持終端機開啟；`Ctrl+C` 關閉自己啟動的預覽。既有 8080 開發伺服器不會被停止或改動。

```sh
# 使用剛完成的根路徑正式建置，不再建置
npm run mobile:preview -- --skip-build
# 4175 已被使用時
npm run mobile:preview -- --port 4176
# 只在 loopback 驗證成品，不列手機網址
npm run mobile:preview -- --local-only
# 明確選用原 Cloudflare HTTPS 隧道；預設不下載或啟動它
npm run mobile:preview -- --tunnel
```

需要手機安裝測試時，可在**本機電腦**保持預覽運行，於另一終端機擇一建立 HTTPS 轉發：

```sh
ngrok http 4175 --host-header=rewrite
# 或
npx localtunnel --port 4175 --local-host 127.0.0.1
```

這些 Host 重寫選項讓 Vite 保留主機名稱檢查，不必放行未知網域。依工具指示取得公開 HTTPS 網址，必要時完成供應商自己的帳戶或驗證流程。本輪未在雲端啟動這兩種轉發，也不假設它們在受限容器中可用。公開網址可能每次不同，離線快取與本機校準依網址分開保存；更換網址前先匯出校準 JSON，新網址需重新完成首次離線快取。

`--tunnel` 才會使用 Cloudflare：下載官方固定版本 `2026.10.7`，以官方發行資產的 SHA-256 驗證後執行，快取於忽略追蹤的 `node_modules/.cache/cloudflared/`。Linux x64/arm64、macOS Intel/Apple Silicon 與 Windows x64 有對應校驗碼；下載需要 `curl`，macOS 解壓另需 `tar`。預覽保留 Host 檢查，沒有設定 `allowedHosts: true`。HTTPS 公開網址可讓知道網址的人瀏覽成品，關閉隧道即失效。

**Cloudflare 在此雲端的已知限制**：先前已成功下載並驗證工具，但呼叫 `https://api.trycloudflare.com/tunnel` 時直接連線遭拒（`connect: connection refused`）；HTTP/2 隧道另外需要 outbound TCP **7844**。因此預設區網模式完全不依賴 cloudflared，亦不會為預覽變更網路政策。

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
