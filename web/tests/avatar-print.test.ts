import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { avatarDiameter, pageLayout } from '../src/avatar-print';
import { defaults } from '../src/model';
test('avatar diameter follows style and planar scaling', () => {
  assert.equal(avatarDiameter({...defaults, styleId:'classic', planarScale:100}), 47.6);
  assert.equal(avatarDiameter({...defaults, styleId:'classic', planarScale:50}), 23.8);
  assert.equal(avatarDiameter({...defaults, styleId:'native', planarScale:150}), 48);
});
test('circles fit paper with margins for all supported sizes', () => {
  for (const paper of ['A4','A5','Letter'] as const) for (const d of [16, 47.6, 71.4]) {
    const p = pageLayout(paper,d);
    assert(p.x >= 10 && p.x + p.columns*d + (p.columns-1)*p.gap <= p.width-10+1e-9);
    assert(p.y + p.rows*d + (p.rows-1)*p.gap <= p.height-20+1e-9);
  }
  assert.throws(() => pageLayout('A5', 200));
});
