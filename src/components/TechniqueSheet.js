import { getDocument, renderMarkdown, text } from '../lib/docs.js';
import { icon } from '../lib/icons.js';
import { needleSpec, normalizedNeedleVector } from '../lib/needle.js';
import { techniqueSummaryLabel } from '../lib/clinical-index.js';

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
  setGroup(group) { this.group = group; }
  show(point) {
    this.point = point;
    const technique = point.technique || {};
    const primaryDoc = getDocument(point.docPath || technique.source || point.docs[0]);
    const warnings = (point.dangerWarnings || []).filter((warning, index, all) => all.findIndex(other => other.text === warning.text) === index);
    const danger = technique.dangerLevel === 'high';
    const hasNeedleVector = normalizedNeedleVector(point.needleVector) !== null;
    const fields = [['體表定位', technique.location], ['刺灸操作', technique.method], ['進針深度', technique.depth], ['安全與禁忌', technique.safety]];
    const manipulationEvidence = (point.techniqueEvidence || []).filter(e => technique.manipulation?.includes(e.label));
    const symptomContext = point.indications?.includes(this.group?.value);
    const relevantEvidence = manipulationEvidence.filter(e => !this.group?.value || e.label === this.group.value || point.indicationEvidence?.some(i => i.label === this.group.value && i.path === e.path && i.line === e.line));
    const shownEvidence = symptomContext || relevantEvidence.length ? relevantEvidence : manipulationEvidence;
    const manipulation = [...new Set(shownEvidence.map(techniqueSummaryLabel))].join(' / ') || (symptomContext ? '本症狀未載明' : '教材未載明');
    const indicationTags = (point.indications || []).map(label => `<button class="symptom-tag${this.group?.value === label ? ' is-active' : ''}" data-sheet-symptom="${text(label)}">${text(label)}</button>`).join('');
    this.element.innerHTML = `<button class="sheet-drag-handle mobile-only" data-sheet-drag aria-label="展開穴位詳解" aria-expanded="false"><span class="sheet-handle"></span></button><div class="sheet-top"><span>穴位詳解</span><button class="icon-button" data-close-sheet aria-label="收合穴位詳解">${icon('close')}</button></div>
      <div class="point-title"><span class="detail-code">${text(point.id.startsWith('DOC-') ? '區域示意' : point.id)}</span><h2>${text(point.name)}</h2><p>${text(point.meridian)}</p></div>
      <div class="sheet-actions"><button class="primary-button" data-focus>${icon('pin')}聚焦穴位</button><button class="secondary-button" data-expand>${icon('book')}閱讀講義</button></div>
      <div class="sheet-scroll"><section class="clinical-summary" aria-label="症狀與手法速查">
        <h3>主要對應病症</h3><div class="symptom-tags">${indicationTags || '<span class="search-hint">教材未載明可索引的症狀</span>'}</div>
        <h3>手法速查摘要</h3><dl class="technique-summary"><div><dt>入針方式</dt><dd data-summary-angle>${text(technique.type || '教材未載明')}</dd></div><div><dt>刺入深度</dt><dd>${text(point.depth || '教材未載明')}</dd></div><div><dt>補瀉手法</dt><dd>${text(manipulation)}</dd></div></dl>
        <details class="clinical-evidence"><summary>查看適用條件與教材依據</summary><p>深度依入針路徑與條件而異，請對照完整操作原文。</p>${(point.techniqueEvidence || []).filter(e => !this.group?.value || e.label === this.group.value || shownEvidence.includes(e)).map(e => `<p>${text(e.label)}${e.group ? '（配穴群共同記述）' : ''}：${text(e.text)}<br>${text(e.context || '')}<button class="text-button" data-source="${text(e.path)}">查閱來源 · 第 ${e.line} 行</button></p>`).join('')}${(point.indicationEvidence || []).filter(e => !this.group?.value || e.label === this.group.value).map(e => `<p>${text(e.label)}：${text(e.text)}${e.group ? '（配穴群／辨證加減，詳見原文）' : ''}<button class="text-button" data-source="${text(e.path)}">查閱來源 · 第 ${e.line} 行</button></p>`).join('')}</details>
      </section>
      ${this.group ? `<section class="group-navigation"><h3>${text(this.group.label)} · ${this.group.points.length} 穴</h3><p>含教材辨證加減配穴，點選穴名查看個別手法。</p><div>${this.group.points.map(p => `<button data-group-point="${text(p.id)}" aria-pressed="${point.id === p.id}">${text(p.name)} <small>${text(p.id)}</small></button>`).join('')}</div></section>` : ''}
      ${danger ? `<section class="danger-warning" data-danger-warning aria-label="高風險穴位警示"><strong class="danger-badge">高風險穴位 · 危險深度</strong><p>避開重要臟器／血管，依教材確認方向與深度。</p>${warnings.map(warning => `<div class="danger-excerpt"><p>${text(warning.text)}</p><button class="text-button" data-danger-source="${text(warning.source.path)}">查閱警示來源 · 第 ${text(warning.source.line)} 行 ${icon('arrow')}</button></div>`).join('')}</section>` : ''}
      <div class="geometry-note">${icon('layers')}<p>${point.coordinatePrecision === 'manual' ? '手動表面取點（待審訂）' : '體表區域示意'} · ${hasNeedleVector ? (needleSpec(point) ? text(needleSpec(point).label) : '依教材所載針向示意') : '<span data-needle-calibration-warning>進針角度與向量：待專業校準</span>'}<br><span>模型、針向與針體長度為示意，未將「寸」換算為模型距離。</span></p></div>
      <div class="technique-fields">${fields.map(([title, value]) => `<section class="technique-field"><h3>${title}</h3><div class="markdown-body">${renderMarkdown(value || '本講義未載明，請查閱完整教材。')}</div></section>`).join('')}</div>
      <section class="source-section"><h3>教材來源</h3><div class="source-links">${point.docs.map(path => `<button class="source-link" data-source="${text(path)}">${icon('book')}<span>${text(getDocument(path)?.title || path)}</span>${icon('arrow')}</button>`).join('')}</div></section>
      <section class="sheet-original" data-sheet-original hidden><h3>原始講義全文</h3><div class="markdown-body">${renderMarkdown(primaryDoc?.markdown || '此穴位沒有對應的原始講義。')}</div></section>
      <p class="learning-note">供針灸課程學習與教材檢索使用。實際操作須由合格專業人員依個別解剖條件評估。</p></div>`;
    this.element.querySelector('[data-focus]').onclick = () => this.onFocus(point);
    this.element.querySelector('[data-expand]').onclick = () => this.openDocument?.(point.docPath || point.docs[0], point.name);
    this.element.querySelector('[data-close-sheet]').onclick = () => this.onClose();
    this.element.querySelectorAll('[data-source]').forEach(button => button.onclick = () => this.openDocument?.(button.dataset.source, point.name));
    this.element.querySelectorAll('[data-sheet-symptom]').forEach(button => button.onclick = () => this.onSymptom?.(button.dataset.sheetSymptom));
    this.element.querySelectorAll('[data-group-point]').forEach(button => button.onclick = () => this.onSelectPoint?.(this.group.points.find(p => p.id === button.dataset.groupPoint)));
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
