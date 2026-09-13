'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/state.js');
require('../js/matrix.js');
require('../js/ui.js');
const C = globalThis.Caroll;
const U = C.ui;
const form = values => ({ elements: { namedItem: key => values[key] === undefined ? null : { value: values[key] } } });

test('percentage scaling retains decimal digits, sign, zero, blanks and exponent notation', () => {
  for (const [input, stored, displayed] of [
    ['0.35', '0.0035', '0.35'], ['9', '0.09', '9'], ['-0.35', '-0.0035', '-0.35'],
    ['.35', '0.0035', '0.35'], ['+000.3500', '0.0035', '0.35'], ['-0', '0', '0'],
    ['3.5e-1', '0.0035', '0.35'], ['1e2', '1', '100'],
    ['0.1234567890123456789', '0.001234567890123456789', '0.1234567890123456789'],
    ['', '', ''], [null, '', ''], [undefined, '', '']
  ]) {
    assert.equal(U.percentToRate(input), stored);
    assert.equal(U.rateToPercent(stored), displayed);
  }
  assert.equal(U.rateToPercent(0.0035), '0.35');
  assert.equal(U.rateDisplay('0.0035'), '0,35%');
  assert.equal(U.rateDisplay('0.001234567890123456789'), '0,1234567890123456789%');
  for (const input of ['NaN', 'Infinity', '0x10', '0,35', '1e1001', 'abc', ' ']) assert.throws(() => U.percentToRate(input));
});

test('all rate form inputs retain exact strings through repeated edit/save cycles', () => {
  for (const key of ['pph_rate', 'employee_rate', 'employer_rate', 'current_value', 'proposed_value', 'rate']) {
    const schema = [{ key, label: key, type: 'rate', optional: true }];
    let value = '0.35';
    for (let i = 0; i < 20; i++) {
      const stored = U.readForm(form({ [key]: value }), schema)[key];
      assert.equal(stored, '0.0035');
      assert.equal(C.percent(5000000, stored, 1000), 18000);
      value = U.rateToPercent(stored);
    }
    assert.equal(U.readForm(form({ [key]: '' }), schema)[key], '');
    assert.equal(U.readForm(form({ [key]: '0' }), schema)[key], '0');
  }
});

test('component defaults scale the raw input exactly, including dynamic formula selection', () => {
  const schema = U.schemas.componentDefinitions.filter(s => ['default_value', 'calculation_type'].includes(s.key));
  for (const calculation_type of ['percentage_basic', 'percentage_gross']) {
    const data = U.readForm(form({ calculation_type, default_value: '0.35' }), schema);
    assert.equal(data.default_value, '0.0035');
    assert.equal(C.percent(5000000, data.default_value, 1000), 18000);
    assert.equal(U.rateToPercent(data.default_value), '0.35');
  }
  assert.equal(U.readForm(form({ calculation_type: 'fixed', default_value: '350' }), schema).default_value, 350);
});

test('matrix adjustments receive the exact decimal rate at rounding ties', () => {
  const rate = U.percentToRate('0.35');
  assert.equal(C.adjustMatrix([{ basic_salary: 5000000 }], rate, 1000)[0].basic_salary, 5018000);
});

test('workspace payroll blockers permit draft confirmation; other previews stay strict', () => {
  const preview = { rejected: 0, issues: [{ severity: 'error', message: 'Unresolved proposed basic salary' }] };
  assert.equal(U.importBlocked('workspace', preview), false);
  assert.equal(U.importBlocked('employees', preview), true);
  assert.equal(U.importBlocked('matrix', preview), true);
  for (const kind of ['workspace', 'employees', 'matrix']) {
    assert.equal(U.importBlocked(kind, { rejected: 1, issues: [] }), true);
    assert.equal(U.importBlocked(kind, { rejected: 0, issues: [{ severity: 'warning', message: 'Review' }] }), false);
  }
});
