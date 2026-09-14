'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/state.js');
require('../js/payroll.js');
require('../js/csv.js');

function workspace() {
  const w = C.sampleWorkspace();
  w.employees = [w.employees[0]];
  w.componentDefinitions = []; w.employeeComponents = []; w.bpjsRules = [];
  w.matrixEntries.forEach(e => { e.basic_salary = 10000000; });
  Object.assign(w.globalRules, { tax_enabled: true, current_pph_policy: 'gross', proposed_pph_policy: 'gross_up' });
  return w;
}
function result(w) {
  const output = C.calculatePayroll(w);
  assert.ok(output.totals, JSON.stringify(output.issues));
  return output;
}
function blocked(w, pattern) {
  const output = C.calculatePayroll(w);
  assert.equal(output.totals, null);
  assert.deepEqual(output.employees, []);
  assert.ok(output.issues.some(i => i.severity === 'error' && pattern.test(i.message)), JSON.stringify(output.issues));
}
function component(w, code, direction, amount, taxable = true) {
  w.componentDefinitions.push({ code, name: code, direction, calculation_type: 'fixed', default_value: amount,
    taxable, bpjs_kesehatan: true, bpjs_ketenagakerjaan: true, applies_current: true, applies_proposed: true, active: true, rounding: 1 });
  w.employeeComponents.push({ employee_id: w.employees[0].employee_id, component_code: code, current_value: '', proposed_value: '' });
}
function bpjs(w, code) {
  w.bpjsRules.push({ code, name: code, tax_program: code, active: true, employee_enabled: true, employer_enabled: true,
    employee_rate: '0.01', employer_rate: '0.02', minimum_basis: '', maximum_basis: '', rounding: 1, basis: 'basic' });
}

test('sample provides a supported ordinary domestic monthly tax profile', () => {
  const w = workspace();
  assert.equal(w.globalRules.tax_regime, 'ordinary');
  for (const scenario of ['current', 'proposed']) assert.equal(w.globalRules[scenario + '_tax_month'], '2026-08');
  const e = w.employees[0];
  for (const [key, value] of Object.entries({ ptkp_status: 'TK/0', tax_category: 'permanent', tax_residency: 'domestic', tax_period_type: 'ordinary', tax_payment_scope: 'monthly' })) assert.equal(e[key], value);
});
for (const category of ['permanent', 'temporary_monthly', 'non_employee']) {
  test(category + ': real salary gross and true gross-up flow through payroll', () => {
    const w = workspace();
    Object.assign(w.employees[0], { tax_category: category, tax_payment_scope: category === 'non_employee' ? 'single' : 'monthly' });
    if (category === 'non_employee') w.employees[0].ptkp_status = '';
    const output = result(w);
    const { current, proposed } = output.employees[0];
    const grossTax = category === 'non_employee' ? 250000 : 200000;
    const allowance = category === 'non_employee' ? 256410 : 230179;
    assert.equal(current.pph, grossTax);
    assert.equal(current.gross, 10000000);
    assert.equal(current.take_home_pay, 10000000 - grossTax);
    assert.equal(current.employer_cost, 10000000);
    assert.equal(current.tax_allowance, 0);
    assert.equal(proposed.pph, allowance);
    assert.equal(proposed.tax_allowance, allowance);
    assert.equal(proposed.gross, 10000000 + allowance);
    assert.equal(proposed.take_home_pay, 10000000);
    assert.equal(proposed.employer_cost, 10000000 + allowance);
    assert.equal(proposed.employer_tax_cost, 0);
    assert.equal(C.tax.calculate({ gross: proposed.gross, category, ptkp: 'TK/0' }).amount, allowance);
    for (const scenario of ['current', 'proposed']) {
      const row = output.employees[0][scenario];
      const tax = row.breakdown.find(r => r.code === 'pph');
      assert.equal(tax.source, 'automatic_pph21');
      assert.equal(tax.tax_formula, category === 'non_employee' ? 'article17_50' : 'ter_monthly');
      assert.equal(tax.basis_before_allowance, 10000000);
      assert.equal(tax.basis, row.gross);
      assert.equal(tax.tax_month, '2026-08');
      assert.equal(output.totals[scenario].pph, row.pph);
    }
  });
}

test('monthly temporary payroll retains PTKP-based TER and requires valid PTKP', () => {
  const w = workspace();
  w.matrixEntries.forEach(e => { e.basic_salary = 7000000; });
  w.employees[0].tax_category = 'temporary_monthly';
  for (const [ptkp, amount, allowance] of [
    ['TK/0', 87500, 88607], ['K/1', 52500, 52896], ['K/3', 35000, 35175]
  ]) {
    w.employees[0].ptkp_status = ptkp;
    const { current, proposed } = result(w).employees[0];
    assert.equal(current.pph, amount);
    assert.equal(proposed.pph, allowance);
    assert.equal(proposed.tax_allowance, allowance);
    assert.equal(proposed.take_home_pay, 7000000);
  }
  for (const ptkp of ['', 'K/4']) {
    w.employees[0].ptkp_status = ptkp;
    blocked(w, /PTKP/);
  }
});

test('tax gross includes funded employee BPJS and health/JKK/JKM employer shares, but not pensions or deductions', () => {
  const w = workspace();
  component(w, 'TAXABLE', 'earning', 1000000);
  component(w, 'EXEMPT', 'earning', 2000000, false);
  component(w, 'DEBT', 'employee_deduction', 300000);
  for (const code of ['kesehatan', 'jkk', 'jkm', 'jht', 'jp']) bpjs(w, code);
  for (const funded of [true, false]) {
    for (const scenario of ['current', 'proposed']) {
      w.globalRules[scenario + '_bpjs_kesehatan_policy'] = funded ? 'company' : 'employee';
      w.globalRules[scenario + '_bpjs_ketenagakerjaan_policy'] = funded ? 'company' : 'employee';
    }
    const output = result(w);
    const basis = funded ? 12100000 : 11600000;
    for (const scenario of ['current', 'proposed']) {
      const row = output.employees[0][scenario];
      const tax = row.breakdown.find(r => r.code === 'pph');
      const expected = C.tax[scenario === 'current' ? 'calculate' : 'grossUp']({ gross: basis, category: 'permanent', ptkp: 'TK/0' }).amount;
      assert.equal(tax.basis_before_allowance, basis);
      assert.equal(tax.taxable_employer_bpjs, 600000);
      assert.equal(row.employee_bpjs, 500000);
      assert.equal(row.employer_bpjs, 1000000);
      assert.equal(row.bpjs_allowance, funded ? 500000 : 0);
      assert.equal(row.pph, expected);
      assert.equal(row.gross, 13000000 + row.bpjs_allowance + row.tax_allowance);
      assert.equal(row.deductions, 800000 + expected);
      assert.equal(row.take_home_pay, row.gross - row.deductions);
      assert.equal(row.employer_cost, row.gross + 1000000);
    }
  }
});

const invalidProfiles = [
  ['missing PTKP', { ptkp_status: '' }, /PTKP/],
  ['invalid PTKP', { ptkp_status: 'K/4' }, /PTKP/],
  ['missing category', { tax_category: '' }, /klasifikasi/],
  ['daily category', { tax_category: 'temporary_daily' }, /klasifikasi/],
  ['foreign residency', { tax_residency: 'foreign' }, /dalam negeri/],
  ['missing residency', { tax_residency: '' }, /dalam negeri/],
  ['final period', { tax_period_type: 'final' }, /masa biasa/],
  ['missing period', { tax_period_type: '' }, /masa biasa/],
  ['monthly employee single payment', { tax_payment_scope: 'single' }, /pola pembayaran/],
  ['non-employee monthly payment', { tax_category: 'non_employee', tax_payment_scope: 'monthly' }, /pola pembayaran/]
];
for (const [name, profile, pattern] of invalidProfiles) test(name + ' blocks only included employees when tax is enabled', () => {
  const w = workspace(); Object.assign(w.employees[0], profile);
  blocked(w, pattern);
  w.globalRules.tax_enabled = false; result(w);
  w.globalRules.tax_enabled = true; w.employees[0].active = false;
  assert.deepEqual(result(w).employees, []);
  w.globalRules.include_inactive = true; blocked(w, pattern);
});
for (const scenario of ['current', 'proposed']) {
  test(scenario + ': supported months, permanent December and legacy net gates', () => {
    const w = workspace();
    for (const month of ['', '2023-08', '2027-01', '2026-00', '2026-13', '2026-8']) {
      w.globalRules[scenario + '_tax_month'] = month; blocked(w, /masa pajak/);
      w.globalRules.tax_enabled = false; result(w); w.globalRules.tax_enabled = true;
    }
    for (const month of ['2024-01', '2025-08', '2026-11']) {
      w.globalRules[scenario + '_tax_month'] = month; result(w);
    }
    w.globalRules[scenario + '_tax_month'] = '2026-12'; blocked(w, /Desember/);
    w.employees[0].tax_category = 'temporary_monthly'; result(w);
    Object.assign(w.employees[0], { tax_category: 'non_employee', tax_payment_scope: 'single' }); result(w);
    w.globalRules[scenario + '_pph_policy'] = 'net'; blocked(w, /Skema net/);
    w.globalRules.tax_enabled = false; result(w);
  });
}
test('regime and all active BPJS programs require supported classification', () => {
  const w = workspace();
  for (const regime of ['', 'dtp']) { w.globalRules.tax_regime = regime; blocked(w, /rezim/); }
  w.globalRules.tax_enabled = false; result(w);
  w.globalRules.tax_enabled = true; w.globalRules.tax_regime = 'ordinary';
  bpjs(w, 'kesehatan');
  w.employees[0].bpjs_kesehatan = false;
  for (const program of ['', 'custom']) { w.bpjsRules[0].tax_program = program; blocked(w, /program BPJS/); }
  w.bpjsRules[0].active = false; result(w);
  w.bpjsRules[0].active = true; w.globalRules.tax_enabled = false; blocked(w, /program BPJS/);
});

for (const [name, change] of [
  ['unused', w => { w.employeeComponents = []; }],
  ['inactive', w => { w.componentDefinitions[0].active = false; }],
  ['excluded employee', w => {
    w.employees.push({ ...w.employees[0], employee_id: 'EXCLUDED', active: false });
    w.employeeComponents[0].employee_id = 'EXCLUDED';
    w.globalRules.include_inactive = false;
  }],
  ['nonapplicable', w => { Object.assign(w.componentDefinitions[0], { applies_current: false, applies_proposed: false }); }]
]) test(name + ' employer contribution does not block automatic tax', () => {
  const w = workspace();
  const baseline = result(w);
  component(w, 'EMPLOYER', 'employer_contribution', 100000);
  change(w);
  assert.deepEqual(result(w).totals, baseline.totals);
});

for (const scenario of ['current', 'proposed']) test(scenario + ' assigned active employer contribution blocks only included employees with tax enabled', () => {
  const w = workspace();
  component(w, 'EMPLOYER', 'employer_contribution', 100000);
  Object.assign(w.componentDefinitions[0], { applies_current: scenario === 'current', applies_proposed: scenario === 'proposed' });
  blocked(w, /Kontribusi perusahaan non-BPJS/);
  const issue = C.validate(w).find(i => /Kontribusi perusahaan non-BPJS/.test(i.message));
  assert.equal(issue.employee_id, w.employees[0].employee_id);
  assert.equal(issue.employee_name, w.employees[0].name);
  w.globalRules.tax_enabled = false; result(w);
  w.globalRules.tax_enabled = true;
  w.employees[0].active = false;
  w.globalRules.include_inactive = false;
  assert.deepEqual(result(w).employees, []);
  w.globalRules.include_inactive = true; blocked(w, /Kontribusi perusahaan non-BPJS/);
});

test('CSV preserves legacy PPh fields without letting rates, fixed overrides, basis or rounding control tax', () => {
  const w = workspace();
  const baseline = result(w);
  for (const override of [0, 155, 9000000]) {
    Object.assign(w.employees[0], { pph_rate: 1, pph_fixed_override: override, pph_method: 'net' });
    Object.assign(w.globalRules, { tax_basis: 'basic', tax_rounding: 1000 });
    const restored = C.csv.importWorkspace(C.csv.exportWorkspace(w));
    assert.equal(Number(restored.employees[0].pph_rate), 1);
    assert.equal(Number(restored.employees[0].pph_fixed_override), C.roundMoney(override, 1000));
    assert.equal(restored.employees[0].pph_method, 'net');
    const output = result(restored);
    assert.deepEqual(output.totals, baseline.totals);
    for (const scenario of ['current', 'proposed']) assert.deepEqual(output.employees[0][scenario], baseline.employees[0][scenario]);
    assert.ok(output.employees[0].issues.some(i => i.severity === 'warning' && /PPh lama diabaikan/.test(i.message)));
  }
});