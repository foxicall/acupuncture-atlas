import { SYMPTOMS, SYMPTOM_CATEGORIES, TECHNIQUES, matchesClinical } from '../lib/clinical-index.js';
import { text } from '../lib/docs.js';

export class FilterDashboard {
  constructor(element, points, onChange) {
    this.element = element; this.points = points; this.onChange = onChange;
    this.state = { mode: 'symptom', category: '', value: '' };
    element.innerHTML = `<div class="filter-tabs" role="tablist" aria-label="穴位索引方式">
      <button id="symptom-tab" role="tab" aria-controls="clinical-filters" data-mode="symptom">症狀索引 <small>By Symptom</small></button>
      <button id="technique-tab" role="tab" aria-controls="clinical-filters" data-mode="technique">針法索引 <small>By Technique</small></button>
      </div><div id="clinical-filters" role="tabpanel"><select class="compact-category" aria-label="症狀分科選單"><option value="">全部分科</option>${SYMPTOM_CATEGORIES.map(label => `<option>${text(label)}</option>`).join('')}</select><div class="filter-categories" role="group" aria-label="症狀分科"></div>
      <div class="filter-chips" role="group" aria-label="臨床索引標籤"></div></div>
      <div class="filter-status"><span data-clinical-status role="status"></span><button data-fit-group class="text-button">定位整組</button></div>`;
    element.querySelectorAll('[data-mode]').forEach(button => {
      button.onclick = () => this.choose({ mode: button.dataset.mode, category: '', value: '' });
      button.onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const mode = event.key === 'Home' ? 'symptom' : event.key === 'End' ? 'technique' : this.state.mode === 'symptom' ? 'technique' : 'symptom';
        this.choose({ mode, category: '', value: '' });
        element.querySelector(`[data-mode="${mode}"]`).focus();
      };
    });
    element.querySelector('[data-fit-group]').onclick = () => this.onFit?.();
    element.querySelector('.compact-category').onchange = event => this.choose({ category: event.target.value, value: '' });
    this.render();
  }
  choose(state) { this.state = { ...this.state, ...state }; this.render(); this.onChange(this.state); }
  reset() { this.state = { mode: this.state.mode, category: '', value: '' }; this.render(); }
  render() {
    const { mode, category, value } = this.state;
    const focusedCategory = this.element.querySelector('[data-category]:focus')?.dataset.category;
    const focusedValue = this.element.querySelector('[data-clinical-value]:focus')?.dataset.clinicalValue;
    this.element.querySelectorAll('[data-mode]').forEach(button => {
      const selected = button.dataset.mode === mode;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    this.element.querySelector('[role="tabpanel"]').setAttribute('aria-labelledby', `${mode}-tab`);
    const categories = this.element.querySelector('.filter-categories');
    const compactCategory = this.element.querySelector('.compact-category');
    compactCategory.hidden = mode !== 'symptom'; compactCategory.value = category;
    categories.hidden = mode !== 'symptom';
    categories.innerHTML = ['', ...SYMPTOM_CATEGORIES].map(label => `<button data-category="${text(label)}" aria-pressed="${category === label}">${text(label || '全部分科')}</button>`).join('');
    categories.querySelectorAll('button').forEach(button => button.onclick = () => this.choose({ category: button.dataset.category, value: '' }));
    const labels = mode === 'technique' ? TECHNIQUES : SYMPTOMS.filter(s => !category || s.categories.includes(category)).map(s => s.label);
    const chips = this.element.querySelector('.filter-chips');
    const scrollLeft = chips.scrollLeft;
    chips.innerHTML = ['', ...labels].map(label => {
      const count = this.points.filter(point => matchesClinical(point, { mode, category, value: label })).length;
      return `<button data-clinical-value="${text(label)}" aria-pressed="${value === label}" ${count ? '' : 'disabled'}>${text(label || '全部')}<span>${count}</span></button>`;
    }).join('');
    chips.scrollLeft = scrollLeft;
    chips.querySelectorAll('button').forEach(button => button.onclick = () => this.choose({ value: button.dataset.clinicalValue }));
    if (focusedCategory !== undefined) [...categories.querySelectorAll('button')].find(button => button.dataset.category === focusedCategory)?.focus({ preventScroll: true });
    if (focusedValue !== undefined) [...chips.querySelectorAll('button')].find(button => button.dataset.clinicalValue === focusedValue)?.focus({ preventScroll: true });
  }
  updateResult(points, active) {
    this.element.querySelector('[data-clinical-status]').textContent = active ? `${this.state.value || this.state.category} · ${points.length} 個穴位 · 含不同體側` : '選取症狀或針法，查看穴位群';
    this.element.querySelector('[data-fit-group]').hidden = !active || !points.length;
  }
}
