import test from 'node:test';
import assert from 'node:assert/strict';
import { needleSpec, normalizedNeedleVector } from '../src/lib/needle.js';

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

test('invalid or absent needle vectors cannot reach Three.js geometry creation', () => {
  const invalid = [null, undefined, false, 1, 'unknown', '0,1,0', {}, { x: 0, y: 1, z: 0 }, [], [1], [1, 0], [1, 0, 0, 0], [0, 0, 0], [NaN, 1, 0], [0, Infinity, 0], [0, 1, -Infinity], ['0', 1, 0], [null, 1, 0], new Array(3), [1, , 0], new Float32Array([0, 1, 0])];
  for (const vector of invalid) assert.equal(normalizedNeedleVector(vector), null);
});

test('valid vectors normalize without mutating source data or overflowing finite components', () => {
  for (const vector of [[0, -1, .2], [2, 0, 0], [Number.MAX_VALUE, Number.MAX_VALUE, 0], [Number.MIN_VALUE, 0, 0]]) {
    const copy = [...vector];
    const normalized = normalizedNeedleVector(vector);
    assert.ok(normalized.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...normalized) - 1) < 1e-12);
    assert.deepEqual(vector, copy);
  }
  assert.deepEqual(normalizedNeedleVector([0, -2, 0]), [0, -1, 0]);
});
