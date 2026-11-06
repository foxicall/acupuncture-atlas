import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Vector3 } from 'three';
import { withClinicalIndex, matchesClinical, matchesPointQuery, symptomSuggestions, techniqueSummaryLabel, getTechniqueContext } from '../src/lib/clinical-index.js';
import { fitAcupointGroup } from '../src/lib/group-camera.js';

const points = JSON.parse(await readFile(new URL('../src/data/acupoints.json', import.meta.url)));
const point = id => points.find(p => p.id === id);

test('strong draining resolves exactly five documented points with point-specific methods and cautions', () => {
  const ids = ['BL40', 'GB30', 'GB34', 'LI4', 'LR3'];
  assert.deepEqual(points.filter(p => matchesClinical(p, { mode: 'technique', value: '強刺激瀉法' })).map(p => p.id).sort(), ids);
  const cautions = { GB30: /坐骨神經/, GB34: /腓總神經/, LI4: /孕婦禁用/, LR3: /足背動脈/, BL40: /膕動靜脈/ };
  for (const id of ids) {
    const p = point(id);
    const context = getTechniqueContext(p, '強刺激瀉法');
    assert.equal(context.path, 'docs/techniques/strong_stimulation_draining.md');
    assert.equal(context.label, p.name);
    assert.equal(context.group, false);
    assert.equal(context.type, '直刺');
    assert.match(context.method, /強刺激瀉法的條件式教學例/);
    assert.match(context.safety, cautions[id]);
    assert.ok(p.docs.includes(context.path));
    assert.equal(p.reviewStatus, 'unreviewed-source-material');
    assert.match(p.technique.source, /^docs\/4\./); // Supplemental rows must not overwrite anatomical summaries.
  }
  assert.ok(matchesPointQuery(point('GB30'), '坐骨神经痛'));
  assert.ok(matchesPointQuery(point('GB34'), '胆绞痛'));
  assert.ok(matchesPointQuery(point('LR3'), '三叉神经痛'));
  assert.ok(matchesPointQuery(point('BL40'), '急性扭伤'));
  assert.equal(getTechniqueContext(point('HT7'), '強刺激瀉法'), null);
  assert.equal(getTechniqueContext(point('LI4'), undefined), null);
});

test('headache groups span meridians and support traditional/simplified/partial symptom search', () => {
  const ids = points.filter(p => matchesClinical(p, { mode: 'symptom', value: '頭痛' })).map(p => p.id);
  for (const id of ['LI4', 'LR3', 'GB20', 'GV20']) assert.ok(ids.includes(id), id);
  assert.ok(matchesPointQuery(point('LI4'), '牙'));
  assert.ok(matchesPointQuery(point('GB20'), '头痛'));
  assert.ok(matchesPointQuery(point('HT7'), '不寐'));
  assert.ok(symptomSuggestions(points, '牙')[0].points.some(p => p.id === 'LI4'));
  assert.deepEqual(symptomSuggestions(points, 'does-not-exist'), []);
  assert.ok(!matchesClinical(point('HT7'), { mode: 'technique', value: '透刺' }));
});

test('all generated tags have exact source evidence; regeneration preserves the metadata', async () => {
  const documents = new Map();
  for (const p of points) {
    const rebuilt = withClinicalIndex(p);
    for (const key of ['indications', 'symptomCategories', 'techniqueType', 'indicationEvidence', 'techniqueEvidence']) assert.deepEqual(rebuilt[key], p[key], `${p.id}: ${key}`);
    for (const [labels, evidence] of [[p.indications, p.indicationEvidence], [p.techniqueType, p.techniqueEvidence]]) {
      for (const label of labels) assert.ok(evidence.some(e => e.label === label), `${p.id}: ${label}`);
      for (const e of evidence) {
        if (!documents.has(e.path)) documents.set(e.path, (await readFile(new URL(`../${e.path}`, import.meta.url), 'utf8')).split(/\r?\n/));
        const line = documents.get(e.path)[e.line - 1].replace(/<[^>]*>/g, '').replace(/[*`]/g, '');
        assert.ok(line.includes(e.text), `${p.id}: ${e.path}:${e.line}`);
      }
    }
  }
  assert.ok(point('KI6').technique.manipulation.includes('補法'));
  assert.ok(point('BL62').technique.manipulation.includes('瀉法'));
  assert.equal(point('HT7').technique.manipulation.length, 0);
});

test('prohibitions, missing methods and shared insertion routes cannot become technique recommendations', () => {
  const sample = (method, group = false) => withClinicalIndex({ technique: { method, group }, sources: [{ path: 'docs/example.md', line: 1, group, method, indications: '' }] });
  for (const method of ['禁止直刺，避免透刺', '未提及瀉法', '不宜平刺', '未提供強刺激瀉法']) assert.deepEqual(sample(method).techniqueType, [], method);
  assert.deepEqual(sample('直刺或斜刺，透刺另一穴', true).techniqueType, []);
  assert.deepEqual(sample('平補平瀉').techniqueType, ['平補平瀉']);
  assert.deepEqual(sample('採用瀉法').techniqueType, ['瀉法']);
  assert.ok(!sample('採用瀉法').techniqueType.includes('強刺激瀉法'));
  assert.deepEqual(sample('向下平刺 0.3~0.5 寸；熱證可點刺放血').techniqueType, ['平刺/橫刺', '點刺放血']);
  assert.equal(techniqueSummaryLabel({ label: '補法', text: '影片提及提插補法、撚轉瀉法' }), '提插補法');
  assert.equal(techniqueSummaryLabel({ label: '瀉法', text: '影片提及提插補法、撚轉瀉法' }), '捻轉瀉法');
});

test('fit contains front/back, distant and single points on narrow and wide canvases', () => {
  assert.equal(fitAcupointGroup([], 34, 1), null);
  for (const group of [points, [point('LI4')], ['LI4','LR3','GB20','GV20'].map(point)]) {
    for (const aspect of [0.3, 0.75, 1, 2.5]) {
      const frame = fitAcupointGroup(group, 34, aspect);
      const camera = new PerspectiveCamera(34, aspect, 0.01, 100);
      camera.position.copy(frame.position); camera.lookAt(frame.target); camera.updateMatrixWorld();
      for (const p of group) {
        const screen = new Vector3(...p.position).project(camera);
        assert.ok(Math.abs(screen.x) < 0.95 && Math.abs(screen.y) < 0.95 && screen.z > -1 && screen.z < 1, `${p.id} at aspect ${aspect}`);
      }
    }
  }
});
