import { text } from '../lib/docs.js';
import { icon } from '../lib/icons.js';

export class CalibrationPanel {
  constructor(element, points, { onChoose, onBind, onReset, onExport }) {
    this.element = element;
    this.sample = null;
    this.copyVersion = 0;
    element.innerHTML = `<div class="calibration-heading"><h3>表面取點校準</h3><span class="calibration-indicator">取點中</span></div>
      <label for="calibration-point">綁定穴位</label><select id="calibration-point" data-calibration-point aria-label="校準穴位">${points.map(point => `<option value="${text(point.id)}">${text(point.id)} · ${text(point.name)}</option>`).join('')}</select>
      <pre class="calibration-coordinates" data-calibration-coordinates aria-live="polite">點擊人體表面取點</pre>
      <p class="calibration-status" data-calibration-status role="status">旋轉至需要的表面，輕點取點後再綁定。</p>
      <div class="calibration-actions"><button class="secondary-button" data-calibration-copy disabled>${icon('download')}複製座標</button><button class="primary-button" data-calibration-bind disabled>綁定此穴位</button></div>
      <div class="calibration-file-actions"><button class="text-button" data-calibration-reset disabled>還原此穴位</button><button class="text-button" data-calibration-export>${icon('download')}匯出 acupoints.json</button></div>
      <p class="calibration-help">先綁定以保存本機變更，再匯出 JSON 更新專案。表面座標不等於經醫學確認的穴位位置。</p>`;
    element.querySelector('[data-calibration-point]').onchange = e => onChoose(e.target.value);
    element.querySelector('[data-calibration-copy]').onclick = () => this.copy();
    element.querySelector('[data-calibration-bind]').onclick = () => { if (this.sample) onBind(this.sample); };
    element.querySelector('[data-calibration-reset]').onclick = onReset;
    element.querySelector('[data-calibration-export]').onclick = onExport;
  }
  setSelected(point, hasOverride = false) {
    this.element.querySelector('[data-calibration-point]').value = point.id;
    this.element.querySelector('[data-calibration-reset]').disabled = !hasOverride;
    this.element.querySelector('[data-calibration-bind]').textContent = `綁定至${point.name}`;
    this.clearSample();
  }
  clearSample() {
    this.sample = null; this.copyVersion++;
    this.element.querySelector('[data-calibration-coordinates]').textContent = '點擊人體表面取點';
    this.element.querySelector('[data-calibration-copy]').disabled = true;
    this.element.querySelector('[data-calibration-bind]').disabled = true;
  }
  async showSample(sample) {
    if (!sample) { this.status('未點到人體表面，請在模型上重新取點。'); return; }
    this.sample = sample;
    this.coordinates = `{ "x": ${sample.position[0].toFixed(3)}, "y": ${sample.position[1].toFixed(3)}, "z": ${sample.position[2].toFixed(3)} }`;
    this.element.querySelector('[data-calibration-coordinates]').textContent = this.coordinates;
    this.element.querySelector('[data-calibration-copy]').disabled = false;
    this.element.querySelector('[data-calibration-bind]').disabled = false;
    await this.copy();
  }
  async copy() {
    if (!this.sample) return;
    const version = ++this.copyVersion;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(this.coordinates);
      if (version === this.copyVersion) this.status('座標已複製；按綁定套用至目前穴位。');
    } catch {
      if (version === this.copyVersion) this.status('無法自動複製，請按「複製座標」重試或長按座標文字。', true);
    }
  }
  status(message, error = false) {
    const status = this.element.querySelector('[data-calibration-status]');
    status.textContent = message; status.classList.toggle('has-error', error);
  }
}
