import test from 'node:test';
import assert from 'node:assert/strict';
import { needleSpec } from '../src/lib/needle.js';

test('explicit angles preserve source meaning and toward-midline direction', () => {
  assert.deepEqual(needleSpec({ angleDegrees: 45, technique: { method: '向正中斜刺45°' } }), { angle: 45, label: '45°（相對皮面）', towardMidline: true });
});
test('straight insertion has perpendicular illustration without fabricating a source degree', () => {
  const point = { angleDegrees: null, technique: { method: '直刺 0.5～1.0寸。' } };
  assert.equal(needleSpec(point).angle, 90);
  assert.ok(!needleSpec(point).label.includes('90'));
  assert.equal(point.angleDegrees, null);
});
test('unknown oblique and prohibited straight techniques do not receive invented angles', () => {
  for (const method of ['影片未提及', '向外斜刺或平刺 0.5寸', '嚴禁直刺過深']) assert.equal(needleSpec({ technique: { method } }), null);
});
