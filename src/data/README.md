# 穴位與教材索引

先保留／執行 `node scripts/generate-model.js` 產生本專案 GLB，再執行 `node scripts/generate-acupoints.js`，從 `docs/**/*.md` 重新產生三個 JSON。原始教材保持不變；新增教材不需搬動既有檔案。

- `acupoints.json`：穴位陣列；標準穴位用 WHO 常用代碼如 `LI4`，耳穴命名空間 `EAR-`，教材非標準舉例 `REG-`。
- `docs-catalog.json`：所有 Markdown 文件的 `{path,title,acupointIds,bytes}`；可搭配 Vite `import.meta.glob('/docs/**/*.md', {query:'?raw',import:'default'})` 讀取。
- `coverage.json`：目前文件／穴位總數、來源列總數與未列為個別穴位的表格列（非適用、分類、組合療法）。

穴位 schema：

```js
{
  id: 'LI4', name: '合谷', aliases: [],
  meridianCode: 'LI', meridian: '手陽明大腸經',
  position: [0.91,-0.48,0.005657], normal: [0,0,-1],
  surfaceProjection: 'Palm 1', // visual projection onto the generated GLB
  coordinatePrecision: 'schematic', // or regional
  angleDegrees: null, // only a literal degree value from the selected source row
  angleSource: null, // or {path,line,text}
  docs: ['docs/4.18.2手阳明经.md'],
  technique: {location,method,depth,safety,source,group:false},
  sources: [{path,line,label,group,location,indications,method,safety}],
  featured: true, reviewStatus: 'unreviewed-source-material'
}
```

模型座標規格：腳底 `y=-1.8`、頭頂 `y=1.8`，前方 `z+`。肩約 `x=±.48,y=.95`；肘 `±.70,.30`；腕 `±.85,-.35`；手 `±.90,-.55`；髖 `±.25,-.25`；膝 `±.24,-.95`；腳 `±.24,-1.7`。雙側穴位示意右側一點；正中線單點。人工示意座標沿指定顯示法向投影到本專案 GLB 對應的人體表面，附 `surfaceProjection` 網格名稱，並留微小顯示間距，減少浮空／內穿。這只是視覺貼合，沒有解剖校準。合谷與外關以手背／前臂背側 `normal=[0,0,-1]` 聚焦；三陰交與太溪以內側 `normal=[-1,0,0]` 聚焦。`regional` 另表示區域／變動位置／非標準舉例，耳穴目前只有耳區位置，不能作為臨床取穴依據。

解析核心腧穴表格（表頭 `穴位名稱`），及第三節中以粗體穴名列出的文字說明。文字來源標示 `kind: prose` 並保留 `excerpt`，沒有明確針法時不從同節的一般規則補造。合併複合表格列並保留 `group` 與原列標籤；部位教材單穴列優先作摘要。簡／繁或常用異名合併；耳穴神門與腕部神門為不同資料。文件中僅文字提及的穴位會出現在 `docs`，不從散文自動推定入針手法。原始教材內的「影片未提及」、深度差異及臨床補充照錄，不補造數字；`depth` 保存完整刺灸原句以免丟失角度、方向和條件。

數值角度僅取摘要來源明確寫出的度數；例如 `直刺` 不自動改寫成 90°。所有針法文字均是未經醫療審閱的原教材，不是臨床驗證結論；UI 應在示意模型及教材旁清楚標示這一限制。

顯示排序建議：保留常用 featured 優先區，完整經絡目錄依十二經流注次序 `LU, LI, ST, SP, HT, SI, BL, KI, PC, TE, GB, LR`，其後 `CV, GV, EX, EAR, OTHER`；同經以穴位代碼數字順序排序。現有 JSON 保持 featured 優先／代碼字母排序，避免改變上層 UI 的既定順序。
