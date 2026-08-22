const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { sanitizeSegment, safeJoin, isInside, uniqueSegment } = require('../src/pathUtils');

test('sanitizeSegment removes Windows forbidden names and characters', () => {
  assert.equal(sanitizeSegment('Документ: тест?.xlsx'), 'Документ_ тест_.xlsx');
  assert.equal(sanitizeSegment('CON'), '_CON');
  assert.equal(sanitizeSegment('папка...   '), 'папка');
});

test('safeJoin never leaves synchronization root', () => {
  const root = path.resolve('C:/sync');
  assert.equal(isInside(root, safeJoin(root, 'folder', 'file.txt')), true);
  assert.throws(() => safeJoin(root, '..', 'outside.txt'), /пределы/);
});

test('uniqueSegment resolves sanitized name collisions deterministically', () => {
  const occupied = new Set();
  assert.equal(uniqueSegment('report?.xlsx', '11111111-1111-1111-1111-111111111111', occupied), 'report_.xlsx');
  assert.equal(uniqueSegment('report*.xlsx', '22222222-2222-2222-2222-222222222222', occupied), 'report_ [222222].xlsx');
});
