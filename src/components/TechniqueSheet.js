import { getDocument, renderMarkdown, text } from '../lib/docs.js';
import { icon } from '../lib/icons.js';
import { needleSpec } from '../lib/needle.js';

export class TechniqueSheet {
  constructor(element, onFocus, onClose) {
    this.element = element; this.onFocus = onFocus; this.onClose = onClose; this.expanded = false;
    element.addEventListener('pointerdown', event => {
      const handle = event.target.closest('[data-sheet-drag]');
      if (!handle || !matchMedia('(max-width: 680px)').matches) return;
      this.drag = { y: event.clientY, last: event.clientY, handle };
      handle.setPointerCapture(event.pointerId);
    });
    element.addEventListener('pointermove', event => {
      if (!this.drag) return;
      this.drag.last = event.clientY;
      const delta = this.drag.last - this.drag.y;
      element.style.transform = `translateY(${(this.expanded ? Math.max(0, delta) : Math.min(0, delta)) * .35}px)`;
    });
    element.addEventListener('pointerup', () => {
      if (!this.drag) return;
      const delta = this.drag.last - this.drag.y;
      this.suppressClick = Math.abs(delta) > 8;
      if (delta < -55) this.setExpanded(true);
      else if (delta > 55) this.setExpanded(false);
      this.drag = null; element.style.transform = '';
    });
    element.addEventListener('pointercancel', () => { this.drag = null; element.style.transform = ''; });
  }
  setExpanded(expanded) {
    this.expanded = expanded;
    this.element.classList.toggle('is-expanded', expanded);
    const handle = this.element.querySelector('[data-sheet-drag]');
    handle?.setAttribute('aria-expanded', String(expanded));
    handle?.setAttribute('aria-label', expanded ? '收合穴位詳解' : '展開穴位詳解');
    const original = this.element.querySelector('[data-sheet-original]');
    if (original) {
      original.hidden = !expanded;
      if (expanded) this.element.querySelector('.geometry-note')?.after(original);
    }
  }
  show(point) {
    this.point = point;
    const technique = point.technique || {};
    const primaryDoc = getDocument(point.docPath || technique.source || point.docs[0]);
    const warnings = (point.dangerWarnings || []).filter((warning, index, all) => all.findIndex(other => other.text === warning.text) === index);
    const danger = technique.dangerLevel === 'high';
    const fields = [['體表定位', technique.location], ['刺灸操作', technique.method], ['進針深度', technique.depth], ['安全與禁忌', technique.safety]];
    this.element.innerHTML = `<button class="sheet-drag-handle mobile-only" data-sheet-drag aria-label="展開穴位詳解" aria-expanded="false"><span class="sheet-handle"></span></button><div class="sheet-top"><span>穴位詳解</span><button class="icon-button" data-close-sheet aria-label="收合穴位詳解">${icon('close')}</button></div>
      <div class="point-title"><span class="detail-code">${text(point.id.startsWith('DOC-') ? '區域示意' : point.id)}</span><h2>${text(point.name)}</h2><p>${text(point.meridian)}</p></div>
      <div class="sheet-actions"><button class="primary-button" data-focus>${icon('pin')}聚焦穴位</button><button class="secondary-button" data-expand>${icon('book')}閱讀講義</button></div>
      <div class="sheet-scroll">${danger ? `<section class="danger-warning" data-danger-warning aria-label="高風險穴位警示"><strong class="danger-badge">高風險穴位 · 危險深度</strong><p>避開重要臟器／血管，依教材確認方向與深度。</p>${warnings.map(warning => `<div class="danger-excerpt"><p>${text(warning.text)}</p><button class="text-button" data-danger-source="${text(warning.source.path)}">查閱警示來源 · 第 ${text(warning.source.line)} 行 ${icon('arrow')}</button></div>`).join('')}</section>` : ''}
      <div class="geometry-note">${icon('layers')}<p>${point.coordinatePrecision === 'manual' ? '手動表面取點（待審訂）' : '體表區域示意'} · ${needleSpec(point) ? text(needleSpec(point).label) : '教材未載明可視化角度'}<br><span>模型、針向與針體長度為示意，未將「寸」換算為模型距離。</span></p></div>
      <div class="technique-fields">${fields.map(([title, value]) => `<section class="technique-field"><h3>${title}</h3><div class="markdown-body">${renderMarkdown(value || '本講義未載明，請查閱完整教材。')}</div></section>`).join('')}</div>
      <section class="source-section"><h3>教材來源</h3><div class="source-links">${point.docs.map(path => `<button class="source-link" data-source="${text(path)}">${icon('book')}<span>${text(getDocument(path)?.title || path)}</span>${icon('arrow')}</button>`).join('')}</div></section>
      <section class="sheet-original" data-sheet-original hidden><h3>原始講義全文</h3><div class="markdown-body">${renderMarkdown(primaryDoc?.markdown || '此穴位沒有對應的原始講義。')}</div></section>
      <p class="learning-note">供針灸課程學習與教材檢索使用。實際操作須由合格專業人員依個別解剖條件評估。</p></div>`;
    this.element.querySelector('[data-focus]').onclick = () => this.onFocus(point);
    this.element.querySelector('[data-expand]').onclick = () => this.openDocument?.(point.docPath || point.docs[0], point.name);
    this.element.querySelector('[data-close-sheet]').onclick = () => this.onClose();
    this.element.querySelectorAll('[data-source]').forEach(button => button.onclick = () => this.openDocument?.(button.dataset.source, point.name));
    this.element.querySelectorAll('[data-danger-source]').forEach(button => button.onclick = () => this.openDocument?.(button.dataset.dangerSource, point.name));
    this.element.querySelector('[data-sheet-drag]').onclick = () => {
      if (this.suppressClick) { this.suppressClick = false; return; }
      this.setExpanded(!this.expanded);
    };
    this.element.classList.remove('is-collapsed');
    this.element.querySelector('.sheet-scroll').scrollTop = 0;
    this.setExpanded(false);
  }
}
