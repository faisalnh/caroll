'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/state.js');
require('../js/matrix.js');
require('../js/ui.js');
const C = globalThis.Caroll;
const U = C.ui;
const form = values => ({ elements: { namedItem: key => values[key] === undefined ? null : { value: values[key] } } });

test('employee form permits matrix salary selection and automatic tax classification, not manual tax', () => {
  const keys = U.schemas.employees.map(spec => spec.key);
  assert.ok(keys.includes('current_basic_override'));
  assert.ok(keys.includes('proposed_basic_override'));
    for (const scenario of ['current', 'proposed']) {
      assert.equal(U.schemas.employees.find(s => s.key === scenario + '_basic_override').optional, true);
      assert.equal(U.schemas.employees.find(s => s.key === scenario + '_matrix_type').type, 'select');
    }
  assert.ok(keys.includes('current_golongan'));
  assert.ok(keys.includes('proposed_golongan'));
  assert.equal(U.schemas.employees.find(s => s.key === 'employment_type').type, 'select');
  assert.ok(!keys.includes('pph_fixed_override'));
  assert.ok(!keys.includes('pph_rate'));
  for (const key of ['tax_category', 'tax_residency', 'tax_period_type', 'tax_payment_scope']) {
    const spec = U.schemas.employees.find(s => s.key === key);
    assert.equal(spec.type, 'select');
    assert.equal(spec.default, '');
    assert.equal(spec.options[0][0], '');
  }
  assert.deepEqual(U.schemas.employees.find(s => s.key === 'ptkp_status').options.map(([value]) => value), ['', 'TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3']);
  assert.ok(!keys.includes('pph_method'));
  assert.match(U.translate('current basic salary override is disabled and ignored; salary follows matrix'), /dinonaktifkan dan diabaikan/);
});

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
  for (const key of ['employee_rate', 'employer_rate', 'current_value', 'proposed_value', 'rate']) {
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

test('automatic tax settings require explicit classification and retain unsupported net label', () => {
  const fields = U.schemas.globalRules;
  assert.ok(!fields.some(s => ['tax_basis', 'tax_rounding'].includes(s.key)));
  for (const key of ['current_tax_month', 'proposed_tax_month']) assert.equal(fields.find(s => s.key === key).type, 'month');
  assert.equal(fields.find(s => s.key === 'tax_regime').default, '');
  assert.equal(fields.find(s => s.key === 'bpjs_kesehatan_eligibility').default, 'manual');
  assert.equal(fields.find(s => s.key === 'bpjs_ketenagakerjaan_eligibility').default, 'manual');
  assert.equal(fields.find(s => s.key === 'bpjs_kesehatan_min_months').min, 0);
  assert.equal(U.schemas.bpjsRules.find(s => s.key === 'tax_program').default, '');
  for (const spec of U.schemas.paymentPolicies.filter(s => s.key.includes('_pph_'))) assert.match(spec.options.find(([value]) => value === 'net')[1], /tidak didukung.*gross_up/);
  const html = require('node:fs').readFileSync(require.resolve('../index.html'), 'utf8');
  assert.ok(html.indexOf('js/tax.js') < html.indexOf('js/validation.js'));
  assert.ok(html.indexOf('js/tax.js') < html.indexOf('js/payroll.js'));
});
