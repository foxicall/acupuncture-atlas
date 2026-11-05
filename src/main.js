import '@fontsource-variable/manrope';
import 'github-markdown-css/github-markdown-light.css';
import './styles/mobile.css';
import { registerSW } from 'virtual:pwa-register';
import { Capacitor } from '@capacitor/core';
import originalAcupoints from './data/acupoints.json';
import { Viewer3D } from './components/Viewer3D.js';
import { AcupointList } from './components/AcupointList.js';
import { TechniqueSheet } from './components/TechniqueSheet.js';
import { documents, getDocument, normalize, renderMarkdown, text } from './lib/docs.js';
import { icon } from './lib/icons.js';
import { CalibrationPanel } from './components/CalibrationPanel.js';
import { loadCalibration, mergeCalibration, saveCalibration, createCalibrationOverride } from './lib/calibration.js';

const nativeApp = Capacitor.isNativePlatform();

let calibrationStorage;
try { calibrationStorage = window.localStorage; } catch { /* Exports still work when browser storage is blocked. */ }
const storedCalibration = loadCalibration(calibrationStorage, originalAcupoints);
// Keep a malformed existing record intact so it can be recovered. In-memory
// placement and JSON export remain available instead of overwriting that record.
const calibrationStorageWritable = storedCalibration.ok;
let calibrationOverrides = storedCalibration.overrides;
let acupoints = mergeCalibration(originalAcupoints, calibrationOverrides);

const mark = `<svg class="brand-mark" width="32" height="36" viewBox="0 0 32 36" fill="none" aria-hidden="true"><path d="M6 30 16 6l10 24M10 21h12M16 2v32" stroke="currentColor" stroke-width="1.5"/><circle cx="16" cy="13" r="3.2" fill="currentColor"/><circle cx="10.5" cy="25" r="2" fill="currentColor"/><circle cx="21.5" cy="25" r="2" fill="currentColor"/></svg>`;
document.querySelector('#app').innerHTML = `<header class="app-header">
  <a class="brand" href="#" aria-label="針灸圖譜首頁">${mark}<div><h1>針灸圖譜</h1><span>Acupuncture Atlas</span></div></a>
  <nav class="header-nav" aria-label="主選單"><button class="nav-button is-active" data-atlas>${icon('front')}立體圖譜</button><button class="nav-button" data-library>${icon('book')}教材庫 <span class="count">${documents.length}</span></button></nav>
  <div class="header-actions"><span class="connection-state" role="status" data-connection>${icon('wifi')}<span>可離線閱讀</span></span><button class="secondary-button install-button" data-install>${icon('download')}安裝應用</button></div>
  </header>
  <main class="workspace">
    <aside class="directory" aria-label="穴位目錄"></aside>
    <section class="atlas" aria-label="立體穴位圖譜">
      <div class="atlas-heading"><div><h2>探索經絡與穴位</h2><p>從體表定位，走進刺灸手法。</p></div><button class="calibration-toggle" data-calibration-toggle aria-pressed="false" aria-controls="calibration-panel">${icon('pin')}校準模式</button></div>
      <section class="calibration-panel" id="calibration-panel" data-calibration-panel aria-label="穴位座標校準" hidden></section>
      <div class="viewer" id="viewer"><div class="model-message" role="status" data-model-status>正在準備 3D 圖譜</div></div>
      <div class="orientation-controls" role="group" aria-label="觀察角度"><button class="view-button is-active" data-front>正面</button><button class="view-button" data-back>背面</button></div>
      <div class="zoom-controls" role="group" aria-label="縮放圖譜"><button class="icon-button" data-zoom-in aria-label="放大">${icon('plus')}</button><button class="icon-button" data-zoom-out aria-label="縮小">${icon('minus')}</button><button class="icon-button" data-reset aria-label="還原全身視角">${icon('reset')}</button></div>
      <div class="atlas-bottom"><div class="atlas-legend"><span class="landmark-dot"></span>穴位標記 <span class="needle-line"></span>入針方向</div><p>單指旋轉 · 雙指縮放</p></div>
      <button class="mobile-search mobile-only" data-open-list>${icon('search')}搜尋穴位與經絡<span>${acupoints.length}</span></button>
      <label class="atlas-meridian-control"><span>經絡</span><select data-atlas-meridian aria-label="圖譜經絡篩選"><option value="">全部經絡</option></select></label>
      <button class="reopen-sheet" data-reopen hidden>${icon('pin')}<span></span>${icon('chevron')}</button>
    </section>
    <aside class="technique-sheet" aria-label="穴位詳解" aria-live="polite"></aside>
  </main>
  <footer class="app-footer"><span>循經識穴，對照原典。</span><span>${acupoints.length} 個穴位 · ${documents.length} 份課程講義</span><button class="text-button" data-about>關於這份圖譜</button></footer>
  <dialog class="library-dialog" aria-labelledby="library-title"><div class="dialog-header"><div><h2 id="library-title">課程教材庫</h2><p>${documents.length} 份原始講義，收錄於離線圖譜。</p></div><button class="icon-button" data-close-library aria-label="關閉教材庫">${icon('close')}</button></div><div class="library-content"><aside class="library-list-pane"><label class="search-field">${icon('search')}<input type="search" aria-label="搜尋教材" placeholder="搜尋講義名稱或全文" /></label><div class="document-list"></div></aside><article class="document-reader"><div class="reader-toolbar"><button class="text-button" data-library-back>返回教材目錄</button><span data-document-name></span></div><div class="markdown-body" data-document-body></div></article></div></dialog>
  <dialog class="info-dialog" aria-labelledby="info-title"><button class="icon-button dialog-close" data-close-info aria-label="關閉說明">${icon('close')}</button><div data-info-content></div></dialog>
  <div class="update-notice" role="status" hidden><span>新版本已準備好。</span><button data-update>更新圖譜</button><button class="icon-button" data-dismiss-update aria-label="稍後更新">${icon('close')}</button></div>`;

const sheetElement = document.querySelector('.technique-sheet');
if (nativeApp) document.querySelector('[data-install]').hidden = true;
const directoryElement = document.querySelector('.directory');
let viewer;
let selected;
let pendingInstall;
let calibrationPanel;
let calibrationEnabled = false;
let sheetWasCollapsed = false;
const initial = acupoints.find(p => p.id === new URLSearchParams(location.hash.slice(1)).get('point')) || acupoints.find(p => p.id === 'LI4') || acupoints[0];
const sheet = new TechniqueSheet(sheetElement, point => viewer?.select(point), collapseSheet);
const directory = new AcupointList(directoryElement, acupoints, selectPoint, (filtered, state) => {
  viewer?.setVisible(filtered.length === acupoints.length && !state.meridian ? filtered.filter(p => p.featured) : filtered, Boolean(state.meridian), Boolean(state.meridian || state.query.trim()));
  document.querySelector('[data-atlas-meridian]').value = state.meridian;
});
const atlasMeridian = document.querySelector('[data-atlas-meridian]');
atlasMeridian.innerHTML = directoryElement.querySelector('#meridian').innerHTML;
atlasMeridian.onchange = () => {
  directory.setMeridian(atlasMeridian.value, true);
  if (directory.filtered.length && !directory.filtered.some(point => point.id === selected.id)) selectPoint(directory.filtered[0], false);
  viewer?.reset(true);
};

function selectPoint(point, fly = true, updateHistory = true) {
  if (!point) return;
  selected = point;
  if (directory.meridian && directory.meridian !== point.meridian) directory.setMeridian(point.meridian, true);
  directory.select(point); sheet.show(point); viewer?.select(point, fly);
  if (calibrationEnabled) {
    sheetElement.classList.add('is-collapsed');
    calibrationPanel?.setSelected(point, calibrationOverrides.some(record => record.id === point.id));
    viewer?.clearCalibrationMarker();
  }
  document.querySelector('[data-reopen] span').textContent = `${point.name} · 穴位詳解`;
  document.querySelector('[data-reopen]').hidden = true;
  closeDirectory();
  if (updateHistory) history.replaceState(null, '', `#point=${encodeURIComponent(point.id)}`);
}
function collapseSheet() {
  sheet.setExpanded(false);
  sheetElement.classList.add('is-collapsed');
  document.querySelector('[data-reopen]').hidden = false;
}
function closeDirectory() {
  directoryElement.classList.remove('is-open');
  directoryElement.removeAttribute('role'); directoryElement.removeAttribute('aria-modal');
}
document.querySelector('[data-open-list]').onclick = () => {
  directoryElement.classList.add('is-open'); directoryElement.setAttribute('role', 'dialog'); directoryElement.setAttribute('aria-modal', 'true');
  directory.focus();
};
document.querySelector('[data-close-list]').onclick = () => { closeDirectory(); document.querySelector('[data-open-list]').focus(); };
directoryElement.addEventListener('keydown', e => {
  if (!directoryElement.classList.contains('is-open')) return;
  if (e.key === 'Escape') { closeDirectory(); document.querySelector('[data-open-list]').focus(); }
  if (e.key === 'Tab') {
    const elements = [...directoryElement.querySelectorAll('button:not([hidden]), input, select')].filter(el => el.getClientRects().length);
    if (e.shiftKey && document.activeElement === elements[0]) { e.preventDefault(); elements.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === elements.at(-1)) { e.preventDefault(); elements[0].focus(); }
  }
});
document.querySelector('[data-reopen]').onclick = () => { sheetElement.classList.remove('is-collapsed'); document.querySelector('[data-reopen]').hidden = true; };
selectPoint(initial, false, false);
try {
  viewer = new Viewer3D(document.querySelector('#viewer'), acupoints, selectPoint, (message, error = false) => {
    const status = document.querySelector('[data-model-status]'); status.textContent = message; status.classList.toggle('has-error', error);
  }, sample => {
    if (sample) console.info('Calibration surface coordinate:', { x: sample.position[0], y: sample.position[1], z: sample.position[2] });
    calibrationPanel?.showSample(sample);
  });
  viewer.select(initial, Boolean(location.hash));
  window.__atlas = {
    get selectedId() { return selected.id; }, get modelLoaded() { return Boolean(viewer.body); },
    get needleVisible() { return viewer.needle.visible && viewer.needle.children.length > 0; },
    get needleMeshCount() { return viewer.needle.children.length; },
    get visiblePointIds() { return viewer.meshes.filter(mesh => mesh.visible && viewer.hotspots.visible).map(mesh => mesh.userData.point.id); },
  };
} catch (error) {
  document.querySelector('[data-model-status]').textContent = '此裝置無法啟用 3D。仍可使用穴位目錄與完整教材。';
  document.querySelector('[data-model-status]').classList.add('has-error');
  console.warn('WebGL unavailable:', error.message);
  document.querySelector('[data-calibration-toggle]').disabled = true;
}
calibrationPanel = new CalibrationPanel(document.querySelector('[data-calibration-panel]'), acupoints, {
  onChoose: id => selectPoint(acupoints.find(point => point.id === id)),
  onBind: sample => {
    try {
      const override = createCalibrationOverride({ id: selected.id, position: sample.position, normal: sample.normal }, originalAcupoints);
      applyCalibration([...calibrationOverrides.filter(record => record.id !== selected.id), override]);
    } catch (error) { calibrationPanel.status(`座標無法套用：${error.message}`, true); }
  },
  onReset: () => applyCalibration(calibrationOverrides.filter(record => record.id !== selected.id), true),
  onExport: () => {
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(acupoints, null, 2)}\n`], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'acupoints.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    calibrationPanel.status('已匯出完整穴位 JSON；請以匯入指令更新專案。');
  },
});
calibrationPanel.setSelected(selected, calibrationOverrides.some(record => record.id === selected.id));
if (!storedCalibration.ok) calibrationPanel.status(storedCalibration.error, true);
function applyCalibration(overrides, reset = false) {
  const persisted = calibrationStorageWritable ? saveCalibration(calibrationStorage, originalAcupoints, overrides) : { ok: false };
  calibrationOverrides = overrides;
  acupoints = mergeCalibration(originalAcupoints, overrides);
  viewer?.updatePoints(acupoints);
  directory.points = acupoints; directory.render();
  selectPoint(acupoints.find(point => point.id === selected.id), false);
  calibrationPanel.status(persisted.ok ? (reset ? '此穴位已還原為專案座標。' : '已綁定座標，並保存於此瀏覽器。') : '已套用於本次畫面，但本機儲存失敗；請匯出 JSON 保存。', !persisted.ok);
}
document.querySelector('[data-calibration-toggle]').onclick = () => {
  if (!viewer) return;
  calibrationEnabled = !calibrationEnabled;
  document.querySelector('[data-calibration-toggle]').setAttribute('aria-pressed', String(calibrationEnabled));
  document.querySelector('[data-calibration-panel]').hidden = !calibrationEnabled;
  document.querySelector('.atlas').classList.toggle('is-calibrating', calibrationEnabled);
  viewer.setCalibrationMode(calibrationEnabled);
  calibrationPanel.clearSample();
  if (calibrationEnabled) {
    sheetWasCollapsed = sheetElement.classList.contains('is-collapsed');
    sheetElement.classList.add('is-collapsed');
    document.querySelector('[data-reopen]').hidden = true;
  } else {
    sheetElement.classList.toggle('is-collapsed', sheetWasCollapsed);
    document.querySelector('[data-reopen]').hidden = !sheetWasCollapsed;
  }
};
function orientation(back) {
  viewer?.reset(true, back);
  document.querySelector('[data-front]').classList.toggle('is-active', !back);
  document.querySelector('[data-back]').classList.toggle('is-active', back);
}
document.querySelector('[data-front]').onclick = () => orientation(false);
document.querySelector('[data-back]').onclick = () => orientation(true);
document.querySelector('[data-reset]').onclick = () => orientation(false);
document.querySelector('[data-zoom-in]').onclick = () => viewer?.zoom(0.8);
document.querySelector('[data-zoom-out]').onclick = () => viewer?.zoom(1.25);
document.querySelector('[data-atlas]').onclick = () => { closeDirectory(); orientation(false); };
document.querySelector('.brand').onclick = event => { event.preventDefault(); orientation(false); };
window.addEventListener('hashchange', () => selectPoint(acupoints.find(p => p.id === new URLSearchParams(location.hash.slice(1)).get('point')), true, false));

const library = document.querySelector('.library-dialog');
let activeDocument;
function openLibrary() { if (!library.open) library.showModal(); renderDocumentList(); }
function renderDocumentList() {
  const query = normalize(library.querySelector('input').value);
  const filtered = documents.filter(doc => !query || normalize(`${doc.title} ${doc.markdown}`).includes(query));
  library.querySelector('.document-list').innerHTML = filtered.length ? filtered.map(doc => `<button class="document-row${activeDocument === doc.path ? ' is-active' : ''}" data-path="${text(doc.path)}">${icon('book')}<span>${text(doc.title)}</span>${icon('chevron')}</button>`).join('') : '<p class="empty-state">沒有符合的講義，請試試其他關鍵字。</p>';
  library.querySelectorAll('[data-path]').forEach(button => button.onclick = () => openDocument(button.dataset.path));
}
function openDocument(path, pointName) {
  const doc = getDocument(path); if (!doc) return;
  activeDocument = path;
  openLibrary(); library.classList.add('is-reading');
  library.querySelector('[data-document-name]').textContent = doc.title;
  const body = library.querySelector('[data-document-body]');
  body.innerHTML = renderMarkdown(doc.markdown);
  library.querySelector('.document-reader').scrollTop = 0;
  if (pointName) {
    const row = [...body.querySelectorAll('tr')].find(row => row.querySelector('td')?.textContent.includes(pointName));
    if (row) { row.classList.add('source-highlight'); setTimeout(() => row.scrollIntoView({ block: 'center', behavior: 'instant' }), 80); }
  }
}
sheet.openDocument = openDocument;
document.querySelector('[data-library]').onclick = openLibrary;
library.querySelector('input').oninput = renderDocumentList;
library.querySelector('[data-close-library]').onclick = () => library.close();
library.querySelector('[data-library-back]').onclick = () => library.classList.remove('is-reading');
library.addEventListener('click', e => { if (e.target === library) library.close(); });
// A first document is present on desktop; phone keeps the directory as the first view.
openDocument(initial.docs[0]); library.close(); library.classList.remove('is-reading');

const infoDialog = document.querySelector('.info-dialog');
function showInfo(title, body) {
  infoDialog.querySelector('[data-info-content]').innerHTML = `<h2 id="info-title">${title}</h2>${body}`;
  infoDialog.showModal();
}
infoDialog.querySelector('[data-close-info]').onclick = () => infoDialog.close();
infoDialog.addEventListener('click', e => { if (e.target === infoDialog) infoDialog.close(); });
document.querySelector('[data-about]').onclick = () => showInfo('關於這份圖譜', `<p>以原始課程的 ${documents.length} 份 Markdown 講義為依據，整理 ${acupoints.length} 個穴位，保留每筆資料的教材來源。</p><p>人體模型為本專案原創的幾何示意。穴位位置尚未經解剖模型校準；同區穴位可能重疊。角度只引用教材明確數值，箭頭長度不代表進針深度。</p><p>教材中的用語、操作與禁忌按原文呈現，仍需由專業師資審訂。請以講義定位敘述及專業指導為準。</p>`);
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); pendingInstall = event; });
window.addEventListener('appinstalled', () => { document.querySelector('[data-install]').hidden = true; pendingInstall = null; });
document.querySelector('[data-install]').onclick = async () => {
  if (pendingInstall) {
    const prompt = pendingInstall; pendingInstall = null; await prompt.prompt(); await prompt.userChoice;
  } else showInfo('將圖譜帶在身邊', '<p><strong>iPhone / iPad</strong><br>在 Safari 開啟本頁，點選「分享」，再選「加入主畫面」。</p><p><strong>Android</strong><br>在 Chrome 選單中選擇「安裝應用程式」或「加到主畫面」。</p><p>首次連線開啟後，請等候離線教材準備完成。安裝與離線快取需要 HTTPS；本機開發可使用 localhost。</p>');
};
function connectionLabel(label) { document.querySelector('[data-connection] span').textContent = label; }
window.addEventListener('online', () => connectionLabel(nativeApp ? '離線教材已內嵌' : '已連線'));
window.addEventListener('offline', () => connectionLabel(nativeApp ? '離線教材已內嵌' : '目前離線'));
connectionLabel(nativeApp ? '離線教材已內嵌' : navigator.onLine ? '離線教材準備中' : '目前離線');
// Android serves packaged assets itself. A WebView Service Worker could otherwise
// retain an old bundle after an APK update, so native builds do not register it.
const updateSW = nativeApp ? async () => {} : registerSW({
  immediate: true,
  onOfflineReady() { connectionLabel('離線教材已就緒'); },
  onNeedRefresh() { document.querySelector('.update-notice').hidden = false; },
  onRegisterError(error) { connectionLabel('離線快取未啟用'); console.warn('Service worker:', error); },
});
if (!nativeApp && 'serviceWorker' in navigator && !import.meta.env.DEV) {
  navigator.serviceWorker.ready.then(async () => {
    if (await caches.match(`${import.meta.env.BASE_URL}models/acupuncture_body.glb`, { ignoreSearch: true })) connectionLabel(navigator.onLine ? '離線教材已就緒' : '目前離線');
  });
}
if (import.meta.env.DEV && !nativeApp) connectionLabel('開發模式');
document.querySelector('[data-update]').onclick = () => updateSW(true);
document.querySelector('[data-dismiss-update]').onclick = () => { document.querySelector('.update-notice').hidden = true; };
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && sheet.expanded && !library.open && !infoDialog.open) { sheet.setExpanded(false); return; }
  if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !library.open && !infoDialog.open) {
    event.preventDefault();
    if (matchMedia('(max-width: 1100px)').matches) document.querySelector('[data-open-list]').click();
    else directory.focus();
  }
});
