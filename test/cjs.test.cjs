const { test } = require('node:test');
const assert = require('node:assert/strict');

test('the CommonJS build loads and agrees with the ES module build', async () => {
  const cjs = require('../dist/cjs/index.js');
  const esm = await import('../dist/esm/index.js');
  assert.deepEqual(cjs.movableDates(2026), esm.movableDates(2026));
  assert.equal(cjs.CATALOGUE.length, esm.CATALOGUE.length);
  assert.equal(cjs.nameOf('st-blaise', 'es'), esm.nameOf('st-blaise', 'es'));
  const options = { nations: ['us'], institutes: ['fssp'], ordo: 'fssp' };
  assert.deepEqual(cjs.ordoDay('2026-11-06', options).masses, esm.ordoDay('2026-11-06', options).masses);
});
