# 穴位與教材索引

## 症狀／針法雙向索引

操作與索引語意見 [症狀與針法索引說明](../../docs/症狀與針法索引說明.md)。`data:generate` 會透過 `src/lib/clinical-index.js` 產生下列欄位，重新生成與手動校準均保留相容性：

```js
{
  indications: ['頭痛', '牙痛', '面癱', '感冒發熱'],
  symptomCategories: ['頭面五官', '神經疼痛'],
  techniqueType: ['直刺', '瀉法', '點刺放血', '透刺'], // 多個來源／條件，不等於同時操作
  technique: { type: '直刺', manipulation: ['瀉法'] /* 原有欄位不變 */ },
  indicationEvidence: [{ label, path, line, text, group, context }],
  techniqueEvidence: [{ label, path, line, text, group, context }],
}
```

沒有來源的症狀與手法使用空陣列；主要入針方式無法確定則為 `null`。不得將缺少補瀉記述預設成平補平瀉，也不得把一般瀉法改列為強刺激瀉法。精確條件、深度與禁忌仍以來源原文為準。

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

## 手動表面校準

`src/lib/calibration.js` 提供純資料工具；`manual` 僅表示使用者在模型表面手動放點，並非醫學定位認證。

```js
import {
  loadCalibration, setCalibration, mergeCalibration, clearCalibration,
} from '../lib/calibration.js';

const loaded = loadCalibration(window.localStorage, sourcePoints);
const displayed = mergeCalibration(sourcePoints, loaded.ok ? loaded.overrides : []);
// A raycast hit and its normalized world-space normal:
const saved = setCalibration(window.localStorage, sourcePoints, {
  id: 'LI4', position: [0.91,-0.48,0.02], normal: [0,0,-1],
});
if (saved.ok) {
  const fullExport = mergeCalibration(sourcePoints, saved.overrides);
  // The UI downloads JSON.stringify(fullExport, null, 2).
} else {
  // Display saved.error; never claim this placement was persisted.
}
```

座標驗證範圍 `x=[-1.2,1.2]、y=[-1.85,1.85]、z=[-.5,.5]`，法向必須是有限數值單位向量（允許 `1e-4` 的浮點誤差並正規化）。未知代碼、重複代碼、`NaN`、`Infinity`、錯誤版本或毀損 JSON 都會明確回報錯誤。瀏覽器 storage 使用版本鍵 `acupuncture-atlas:calibration:v1`，讀／寫／清除權限錯誤均回傳 `{ok:false,error}`，不擅自覆寫毀損資料。`setCalibration` 僅更新單點，保留其他點；`removeCalibration` 刪除單點 override，`clearCalibration` 僅清除本應用程式的校準鍵。

手動紀錄合併後保留所有既有名稱、教材來源、針法、深度與禁忌，只更新 `position`、`normal`、`coordinatePrecision:'manual'` 及 `calibration:{method:'surface-raycast',model:'acupuncture_body.glb'}`。舊 `surfaceProjection` 移除，避免誤稱仍是程式自動貼合點。

將完整匯出陣列匯回儲存庫：

```sh
node scripts/import-calibration.js /path/to/acupoints-calibrated.json
npm run data:generate
```

匯入器驗證完整穴位集合，只採用標示為 `manual` 的座標與法向，忽略匯入檔案內可能被改動的教材欄位。它先合併保存在 `src/data/calibration-overrides.json`，再更新 `acupoints.json`；既有其他手動點不會因本次下載沒改動而被刪除。`data:generate` 每次重新解析教材、擬合示意模型後，會再套用 persistent overrides，因此手動校準不會被重生成覆蓋。要永久移除已匯入的單點校準，從 overrides 檔移除該筆並重新執行 `data:generate`。單純清除瀏覽器校準只會移除本機新增紀錄，不會刪除已提交至儲存庫的 overrides。

## 針向、原始深度與風險來源欄位

資料現在包括新增於教材安全小節的啞門 `GV15`。其定位與針法沒有個別教學資料時保持「未提供」，不由鄰近穴位補造；風險則引用教材對風府／啞門的原文警示。

每個穴位另有以下欄位，舊有 `angleDegrees`、完整 `technique.method/depth/safety` 不變：

```js
{
  pinyin: 'Hegu', // 目前只提供12個常用穴位的可靠拼音，其餘 null
  needle_angle: '直刺', // '直刺' | '斜刺' | '平刺' | null
  depth: '0.5~1.0 寸', // 原始數值與單位字串，無數值深度則 null
  depthValues: [{raw:'0.5~1.0 寸',unit:'寸',source:{path:'docs/4.18.2手阳明经.md',line:26}}],
  needleVector: [0,0,1], // 模型世界座標、從皮面往內的單位向量，或 null
  vector: [0,0,1], // needleVector 的相容別名
  needleVectorPrecision: 'schematic', // 或 null，絕非臨床刺入向量
  docPath: 'docs/4.18.2手阳明经.md', // 優先取 technique.source
  technique: {
    // 既有完整 method/depth/safety/source 等欄位保留
    angle: '直刺',
    dangerLevel: 'caution', // 'high' | 'caution' | 'unreviewed'，沒有 safe 預設值
  },
  dangerWarnings: [{
    kind:'contraindication', // 'depth' | 'anatomy' | 'contraindication'
    text:'孕婦不宜針（因研究發現針刺合谷會促進子宮收縮）。',
    source:{path:'docs/4.18.2手阳明经.md',line:26},
  }],
}
```

`depthValues[].raw` 保留原稿的 `寸`、`mm`、`毫米` 或 `公厘` 寫法；`unit` 只用於識別單位，沒有把寸換算成毫米。條件式、多階段刺法仍須閱讀完整 `technique.depth` 原句，不能把摘錄數字當作獨立操作指令。

`src/lib/needle-data.js` 可在 Node 與瀏覽器共同使用：`withNeedleData(point)` 重新產生以上欄位；`deriveNeedleVector(point)` 只計算示意向量。來源單一路徑為直刺時，以 `-normal` 表示垂直皮面的幾何方向，但不把 `angleDegrees` 補成 90。斜刺需同一來源明確提供數字角度及向正中／脊柱方向，才計算向內及朝正中切線的示意合成向量；缺少角度、方向、法向，或有直／斜、斜／平等多種選項時保持 `null`。這不提供實際進針深度，也不代表安全通道。

風險取自 `sources[].safety/method` 及教材中明確點名的解剖安全小節，警示文案與路徑／行號均可回查。含氣胸、延髓／延腦、主要動脈、脊髓、肺尖、禁深刺等詞的警示分類為 `high`；其他明確注意或禁忌為 `caution`；缺少相關警示為 `unreviewed`，不推定安全。缺盆、風池、啞門及肩井均有實際教材警示，無須編造風險說明。這些是未經醫療審訂教材的檢索分類，保留原文差異與補充註記。

手動校準變更 `position/normal` 後，`mergeCalibration` 會同步重算 `needleVector/vector`；教材文字、警示來源及既有持久化 override API 保持相容。匯入器不採用下載檔中的針向、風險或教材改動，而由原始教材及新的手動法向重新衍生。
