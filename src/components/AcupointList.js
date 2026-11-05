import { normalize, text } from '../lib/docs.js';
import { icon } from '../lib/icons.js';

export class AcupointList {
  constructor(element, points, onSelect, onFilter) {
    this.element = element; this.points = points; this.onSelect = onSelect; this.onFilter = onFilter;
    this.query = ''; this.meridian = ''; this.activeId = null;
    const order = ['LU', 'LI', 'ST', 'SP', 'HT', 'SI', 'BL', 'KI', 'PC', 'TE', 'GB', 'LR', 'CV', 'GV', 'EX', 'EAR', 'OTHER'];
    const meridians = [...new Map([...points].sort((a, b) => {
      const ai = order.indexOf(a.meridianCode), bi = order.indexOf(b.meridianCode);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    }).map(p => [p.meridian, p.meridian])).values()];
    element.innerHTML = `<div class="directory-heading"><h2>穴位目錄</h2><button class="icon-button mobile-only" data-close-list aria-label="關閉穴位目錄">${icon('close')}</button></div>
      <label class="search-field">${icon('search')}<input type="search" placeholder="搜尋穴名、代碼或定位" aria-label="搜尋穴位" autocomplete="off" /><kbd>/</kbd></label>
      <label class="filter-label" for="meridian">依經絡瀏覽</label>
      <select id="meridian" aria-label="經絡篩選"><option value="">全部經絡</option>${meridians.map(m => `<option>${text(m)}</option>`).join('')}</select>
      <div class="directory-meta"><span data-result-count></span><button class="text-button" data-clear hidden>清除篩選</button></div>
      <div class="point-list" role="list" aria-label="穴位清單"></div>
      <div class="directory-footer">${icon('pin')}<span>座標為體表區域示意<br>以講義定位描述為準</span></div>`;
    element.querySelector('input').addEventListener('input', e => { this.query = e.target.value; this.render(); });
    element.querySelector('select').addEventListener('change', e => { this.meridian = e.target.value; this.render(); });
    element.querySelector('[data-clear]').onclick = () => {
      this.query = ''; this.meridian = ''; element.querySelector('input').value = ''; element.querySelector('select').value = ''; this.render();
    };
    this.render();
  }
  render() {
    const query = normalize(this.query);
    const filtered = this.points.filter(p => (!this.meridian || p.meridian === this.meridian) &&
      (!query || normalize([p.name, p.id, p.meridian, ...(p.aliases || []), p.technique?.location || ''].join(' ')).includes(query)));
    this.element.querySelector('[data-result-count]').textContent = `${filtered.length} 個穴位`;
    this.element.querySelector('[data-clear]').hidden = !query && !this.meridian;
    const list = this.element.querySelector('.point-list');
    list.innerHTML = filtered.length ? filtered.map(p => `<button role="listitem" class="point-row${this.activeId === p.id ? ' is-active' : ''}" data-id="${text(p.id)}" aria-pressed="${this.activeId === p.id}">
      <span class="point-code">${text(p.id.startsWith('DOC-') ? '•' : p.id)}</span><span class="point-name">${text(p.name)}<small>${text(p.meridian)}</small></span>${icon('chevron')}</button>`).join('') :
      '<p class="empty-state">沒有符合的穴位。<br>試試「合谷」、「LI4」或選擇其他經絡。</p>';
    list.querySelectorAll('button').forEach(button => button.onclick = () => this.onSelect(this.points.find(p => p.id === button.dataset.id)));
    this.onFilter?.(filtered);
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
