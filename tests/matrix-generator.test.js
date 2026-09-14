'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/state.js');
require('../js/matrix.js');
require('../js/validation.js');
require('../js/csv.js');
const C = globalThis.Caroll;
const settings = () => Array.from({ length: 5 }, (_, i) => ({ base_salary: 1000000 * (i + 1), cola: '0.1', kmk_index: '0.06' }));

test('generator produces 300 canonical unique salaries and exact tier overlaps without mutation', () => {
  const input = settings(), before = structuredClone(input);
  const entries = C.generateMatrix(input, 'proposed', 'generated');
  assert.equal(entries.length, 300);
  assert.equal(new Set(entries.map(e => e.golongan)).size, 300);
  const salary = code => entries.find(e => e.golongan === code).basic_salary;
  assert.equal(salary('1-PM1'), 1100000);
  assert.equal(salary('1-PM2'), 1166000);
  assert.equal(salary('1-PM3'), 1235960);
  for (let group = 1; group <= 5; group++) {
    for (const [previous, next] of [['PM', 'P'], ['P', 'M'], ['M', 'U']]) {
      assert.equal(salary(group + '-' + previous + '3'), salary(group + '-' + next + '1'));
    }
  }
  assert.ok(salary('5-U15') > salary('5-PM1'));
  assert.ok(entries.every(e => e.scenario === 'proposed' && e.matrix_id === 'generated'));
  assert.deepEqual(input, before);
});

test('rounding happens only at final salary; zero rates and fractional bases are supported', () => {
  const input = settings().map(() => ({ base_salary: '1000.5', cola: '0', kmk_index: '0.06' }));
  const entries = C.generateMatrix(input, 'current', 'a', 100);
  assert.equal(entries.find(e => e.golongan === '1-PM3').basic_salary, 1100);
  const flat = C.generateMatrix(settings().map(() => ({ base_salary: '1000.5', cola: '0', kmk_index: '0' })), 'current', 'a');
  assert.ok(flat.every(e => e.basic_salary === 1001));
});

test('invalid parameters, unsafe money, missing groups and invalid target are rejected', () => {
  for (const [key, value] of [['base_salary', ''], ['base_salary', 0], ['base_salary', -1], ['cola', -0.1], ['kmk_index', -0.1], ['cola', 'bad'], ['kmk_index', Infinity], ['base_salary', '9007199254740992']]) {
    const input = settings(); input[0][key] = value;
    assert.throws(() => C.generateMatrix(input, 'current', 'a'));
  }
  assert.throws(() => C.generateMatrix([], 'current', 'a'));
  assert.throws(() => C.generateMatrix(settings(), 'wrong', 'a'));
  assert.throws(() => C.generateMatrix(settings(), 'current', ''));
});

test('workspace persists settings and salaries and accepts legacy CSV without settings header', () => {
  const ws = C.createWorkspace();
  ws.matrices = [{ matrix_id: 'a', scenario: 'current', matrix_type: 'regular', name: 'Generated', effective_date: '', generator_settings: JSON.stringify(settings()) }];
  ws.matrixEntries = C.generateMatrix(settings(), 'current', 'a');
  const restored = C.csv.importWorkspace(C.csv.exportWorkspace(ws));
  assert.deepEqual(JSON.parse(restored.matrices[0].generator_settings), settings());
  assert.deepEqual(restored.matrixEntries, ws.matrixEntries);
  assert.equal(C.resolveBasic(restored, { current_golongan: '1-P1', current_matrix_type: 'regular' }, 'current'), 1235960);
  const legacyRows = C.csv.parse(C.csv.exportWorkspace(ws)).map(({ generator_settings, ...row }) => row);
  const legacy = C.csv.importWorkspace(C.csv.stringify(legacyRows));
  assert.equal(legacy.matrices[0].generator_settings, '');
  assert.deepEqual(legacy.matrixEntries, ws.matrixEntries);
});
