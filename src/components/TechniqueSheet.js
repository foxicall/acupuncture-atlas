import { getDocument, renderMarkdown, text } from '../lib/docs.js';
import { icon } from '../lib/icons.js';
import { needleSpec } from '../lib/needle.js';

export class TechniqueSheet {
  constructor(element, onFocus, onClose) { this.element = element; this.onFocus = onFocus; this.onClose = onClose; }
  show(point) {
    this.point = point;
    const technique = point.technique || {};
    const fields = [['體表定位', technique.location], ['刺灸操作', technique.method], ['進針深度', technique.depth], ['安全與禁忌', technique.safety]];
    this.element.innerHTML = `<div class="sheet-handle mobile-only"></div><div class="sheet-top"><span>穴位詳解</span><button class="icon-button" data-close-sheet aria-label="收合穴位詳解">${icon('close')}</button></div>
      <div class="point-title"><span class="detail-code">${text(point.id.startsWith('DOC-') ? '區域示意' : point.id)}</span><h2>${text(point.name)}</h2><p>${text(point.meridian)}</p></div>
      <div class="sheet-actions"><button class="primary-button" data-focus>${icon('pin')}聚焦穴位</button><button class="secondary-button" data-expand>${icon('book')}閱讀講義</button></div>
      <div class="sheet-scroll"><div class="geometry-note">${icon('layers')}<p>體表區域示意 · ${needleSpec(point) ? text(needleSpec(point).label) : '教材未載明可視化角度'}<br><span>模型、針向與長度為學習示意，非精確取穴或實際刺入深度。</span></p></div>
      <div class="technique-fields">${fields.map(([title, value]) => `<section class="technique-field"><h3>${title}</h3><div class="markdown-body">${renderMarkdown(value || '本講義未載明，請查閱完整教材。')}</div></section>`).join('')}</div>
      <section class="source-section"><h3>教材來源</h3><div class="source-links">${point.docs.map(path => `<button class="source-link" data-source="${text(path)}">${icon('book')}<span>${text(getDocument(path)?.title || path)}</span>${icon('arrow')}</button>`).join('')}</div></section>
      <p class="learning-note">供針灸課程學習與教材檢索使用。實際操作須由合格專業人員依個別解剖條件評估。</p></div>`;
    this.element.querySelector('[data-focus]').onclick = () => this.onFocus(point);
    this.element.querySelector('[data-expand]').onclick = () => this.openDocument?.(point.docs[0], point.name);
    this.element.querySelector('[data-close-sheet]').onclick = () => this.onClose();
    this.element.querySelectorAll('[data-source]').forEach(button => button.onclick = () => this.openDocument?.(button.dataset.source, point.name));
    this.element.classList.remove('is-collapsed');
    this.element.querySelector('.sheet-scroll').scrollTop = 0;
  }
}
