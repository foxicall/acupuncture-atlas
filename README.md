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
- 「閱讀講義」開啟原始全文並標示對應穴位表列。寬表格可左右捲動。教材庫也可搜尋全部文件內文。
- 鍵盤 `/` 開啟搜尋，`Esc` 關閉對話框／手機目錄。

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

教材中的角度、深度、禁忌照錄來源；未載明的數值不推測。數值角度僅引用原文明確度數。「直刺」以垂直皮面箭頭示意，資料中的數值角度仍為 `null`。箭頭長度不代表實際深度。未知斜刺角度不生成任意針向。所有教材尚須專業師資審閱；本應用用於課程學習，不作為臨床取穴導航。

## PWA 與離線

正式建置產生 `dist/sw.js`，預快取 app shell、全部教材 JS、人體 GLB、字型與圖示；**開發模式不啟用離線快取**。首次開啟需連線，等待顯示「離線教材已就緒」後再斷網。清除網站資料也會移除離線快取。新版本準備好會提示更新，避免閱讀中途強制重新載入。

上線需要 HTTPS（localhost 可開發）。Android 以 Chrome 安裝選單／安裝按鈕加入主畫面；iOS 在 Safari 分享選單選「加入主畫面」。包含 standalone manifest、192/512 PNG、maskable 圖示、Apple touch icon、safe-area 及 reduced-motion 適配。

## GitHub 同步

```sh
npm run sync -- "feat: 增加合谷穴進針視角動畫"
# 查看將執行哪些指令；不變更 Git、不推送
npm run sync -- "feat: add acupoint focus" --dry-run
npm run sync -- --status
# 明確指定遠端分支
npm run sync -- "feat: add atlas" --remote origin --branch work
```

同步腳本依序執行 `npm run check`、`npm run build`，全部成功才執行 `git add -A`、Conventional Commit 及普通 `git push`。提交訊息以參數陣列傳遞，不拼進 shell；不做強制推送、不儲存憑證。乾淨工作目錄仍會推送既有本地提交。沒有 upstream 時自動設定目前分支；detached HEAD、驗證或推送失敗會明確終止。執行前請確認工作目錄都是預期提交的內容；`.env`、相依套件、測試產物及建置輸出已忽略。

## 發布網站

CI 僅安裝、驗證、建置與執行瀏覽器測試，**不自動部署**。可將 `dist/` 部署至任一 HTTPS 靜態主機。

GitHub Pages 專案網址需要正確 base path：

```sh
VITE_BASE_PATH=/acupuncture-atlas/ npm run build
VITE_BASE_PATH=/acupuncture-atlas/ npm run preview
```

網站根目錄部署則不設定 `VITE_BASE_PATH`。manifest、模型、Service Worker 及快取均支援子目錄；切換部署路徑後應重新建置。更新資料或模型超過 20 MiB 時，建置檢查會要求調整快取規劃，不會悄悄漏掉大型模型。

Manrope 字型由 Fontsource 自行託管（OFL-1.1）；人體與圖示為本專案生成，無外部人體模型授權依賴。
