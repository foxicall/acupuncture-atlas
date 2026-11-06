import { normalize, text } from '../lib/docs.js';
import { icon } from '../lib/icons.js';
import { matchesClinical, matchesPointQuery, symptomSuggestions } from '../lib/clinical-index.js';

export class AcupointList {
  constructor(element, points, onSelect, onFilter) {
    this.element = element; this.points = points; this.onSelect = onSelect; this.onFilter = onFilter;
    this.query = ''; this.meridian = ''; this.activeId = null; this.clinical = {};
    const order = ['LU', 'LI', 'ST', 'SP', 'HT', 'SI', 'BL', 'KI', 'PC', 'TE', 'GB', 'LR', 'CV', 'GV', 'EX', 'EAR', 'OTHER'];
    const meridians = [...new Map([...points].sort((a, b) => {
      const ai = order.indexOf(a.meridianCode), bi = order.indexOf(b.meridianCode);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    }).map(p => [p.meridian, p.meridian])).values()];
    element.innerHTML = `<div class="directory-heading"><h2>穴位目錄</h2><button class="icon-button mobile-only" data-close-list aria-label="關閉穴位目錄">${icon('close')}</button></div>
      <label class="search-field">${icon('search')}<input type="search" placeholder="症狀、穴名或代碼，如失眠、牙" aria-label="搜尋穴位" aria-controls="symptom-suggestions" autocomplete="off" /><kbd>/</kbd></label>
      <div id="symptom-suggestions" class="symptom-suggestions" aria-label="症狀搜尋建議" hidden></div>
      <p class="directory-context" data-filter-context hidden></p>
      <label class="filter-label" for="meridian">依經絡瀏覽</label>
      <select id="meridian" aria-label="經絡篩選"><option value="">全部經絡</option>${meridians.map(m => `<option>${text(m)}</option>`).join('')}</select>
      <div class="directory-meta"><span data-result-count></span><button class="text-button" data-clear hidden>清除篩選</button></div>
      <div class="point-list" role="list" aria-label="穴位清單"></div>
      <div class="directory-footer">${icon('pin')}<span>座標為體表區域示意<br>以講義定位描述為準</span></div>`;
    element.querySelector('input').addEventListener('input', e => {
      this.query = e.target.value;
      this.clinical = {}; this.onClearClinical?.(); this.render();
    });
    element.querySelector('input').addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); element.querySelector('#symptom-suggestions button, .point-list button')?.focus(); }
      if (event.key === 'Escape') element.querySelector('#symptom-suggestions').hidden = true;
    });
    element.querySelector('select').addEventListener('change', e => this.setMeridian(e.target.value, true));
    element.querySelector('[data-clear]').onclick = () => {
      this.query = ''; this.meridian = ''; this.clinical = {}; this.onClearClinical?.(); element.querySelector('input').value = ''; element.querySelector('select').value = ''; this.render();
    };
    this.render();
  }
  render() {
    const query = normalize(this.query);
    const filtered = this.points.filter(p => (!this.meridian || p.meridian === this.meridian) && matchesClinical(p, this.clinical) && matchesPointQuery(p, this.query));
    this.filtered = filtered;
    this.element.querySelector('[data-result-count]').textContent = `${filtered.length} 個穴位`;
    this.element.querySelector('[data-clear]').hidden = !query && !this.meridian && !this.clinical.value && !this.clinical.category;
    const context = this.element.querySelector('[data-filter-context]');
    context.textContent = this.clinical.value || this.clinical.category || ''; context.hidden = !context.textContent;
    const suggestions = this.element.querySelector('#symptom-suggestions');
    const groups = symptomSuggestions(this.points, this.query);
    suggestions.hidden = !query;
    suggestions.innerHTML = query ? `<p>症狀穴位群</p>${groups.length ? groups.slice(0, 5).map(group => `<button data-symptom="${text(group.label)}">${text(group.label)}<span>${group.points.length} 穴 · 定位整組</span></button>`).join('') : '<span class="search-hint">沒有符合的症狀群</span>'}<p>相關穴位</p>${filtered.slice(0, 4).map(p => `<button data-suggestion-point="${text(p.id)}">${text(p.name)}<span>${text(p.id)} · ${text((p.indications || []).slice(0, 2).join('、'))}</span></button>`).join('') || '<span class="search-hint">沒有符合的穴位</span>'}` : '';
    suggestions.querySelectorAll('[data-symptom]').forEach(button => button.onclick = () => this.onSymptom?.(button.dataset.symptom));
    suggestions.querySelectorAll('[data-suggestion-point]').forEach(button => button.onclick = () => this.onSelect(this.points.find(p => p.id === button.dataset.suggestionPoint)));
    const list = this.element.querySelector('.point-list');
    list.innerHTML = filtered.length ? filtered.map(p => `<button role="listitem" class="point-row${this.activeId === p.id ? ' is-active' : ''}" data-id="${text(p.id)}" aria-pressed="${this.activeId === p.id}">
      <span class="point-code">${text(p.id.startsWith('DOC-') ? '•' : p.id)}</span><span class="point-name">${text(p.name)}<small>${text(p.meridian)}</small></span>${icon('chevron')}</button>`).join('') :
      '<p class="empty-state">沒有符合的穴位。<br>試試「合谷」、「LI4」或選擇其他經絡。</p>';
    list.querySelectorAll('button').forEach(button => button.onclick = () => this.onSelect(this.points.find(p => p.id === button.dataset.id)));
    this.onFilter?.(filtered, { meridian: this.meridian, query: this.query, clinical: this.clinical });
  }
  setClinical(state) {
    this.clinical = { ...state }; this.query = ''; this.meridian = '';
    this.element.querySelector('input').value = ''; this.element.querySelector('select').value = ''; this.render();
  }
  setMeridian(meridian, clearQuery = false) {
    this.clinical = {}; this.onClearClinical?.();
    this.meridian = meridian;
    this.element.querySelector('select').value = meridian;
    if (clearQuery) { this.query = ''; this.element.querySelector('input').value = ''; }
    this.render();
  }
  select(point) {
    this.activeId = point.id;
    this.element.querySelectorAll('.point-row').forEach(row => {
      const selected = row.dataset.id === point.id;
      row.classList.toggle('is-active', selected); row.setAttribute('aria-pressed', String(selected));
    });
  }
  focus() { this.element.querySelector('input').focus(); }
}
