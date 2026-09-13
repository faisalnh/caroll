'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/state.js'); require('../js/matrix.js'); require('../js/validation.js'); require('../js/payroll.js'); require('../js/csv.js');
const C = globalThis.Caroll;
function workspace() {
  const w = C.sampleWorkspace();
  w.employees = [w.employees[0]]; w.componentDefinitions = []; w.employeeComponents = [];
  w.matrixEntries.forEach(e => { e.basic_salary = 10000; });
  w.globalRules.tax_enabled = true; w.employees[0].pph_rate = '0.1';
  w.bpjsRules = ['kesehatan', 'jht'].map(code => ({ code, name: code, active: true, employee_enabled: true, employer_enabled: true, employee_rate: '0.01', employer_rate: '0.02', minimum_basis: '', maximum_basis: '', rounding: 1, basis: 'gross' }));
  return w;
}
test('independent scenarios and BPJS schemes change THP without double counting', () => {
  const w = workspace();
  Object.assign(w.globalRules, { current_pph_policy: 'gross', current_bpjs_kesehatan_policy: 'company', current_bpjs_ketenagakerjaan_policy: 'employee', proposed_pph_policy: 'net', proposed_bpjs_kesehatan_policy: 'employee', proposed_bpjs_ketenagakerjaan_policy: 'company' });
  const output = C.calculatePayroll(w); assert.ok(output.totals, JSON.stringify(output.issues));
  const { current: a, proposed: b } = output.employees[0];
  assert.equal(a.gross, 10100); assert.equal(a.bpjs_allowance, 100); assert.equal(a.pph, 1010);
  assert.equal(a.take_home_pay, 8890); assert.equal(a.employer_cost, 10500);
  assert.equal(b.gross, 10100); assert.equal(b.pph, 1010); assert.equal(b.take_home_pay, 9900);
  assert.equal(b.employer_tax_cost, 1010); assert.equal(b.employer_cost, 11510);
  assert.equal(b.tax_allowance, 0);
  assert.equal(a.breakdown.find(r => r.code === 'jht').bpjs_allowance, 0);
  assert.equal(b.breakdown.find(r => r.code === 'jht').bpjs_allowance, 100);
  w.globalRules.proposed_pph_policy = 'gross_up';
  const up = C.calculatePayroll(w).employees[0].proposed;
  assert.equal(up.pph, 1122); assert.equal(up.gross, 11222); assert.equal(up.take_home_pay, 9900); assert.equal(up.employer_cost, 11622);
});
test('unconfirmed policies block only relevant enabled calculations', () => {
  const w = workspace();
  Object.assign(w.globalRules, { current_pph_policy: 'unconfirmed', current_bpjs_kesehatan_policy: 'unconfirmed' });
  assert.equal(C.calculatePayroll(w).totals, null);
  w.globalRules.tax_enabled = false; w.employees[0].bpjs_kesehatan = false;
  assert.ok(C.calculatePayroll(w).totals);
  w.globalRules.current_bpjs_ketenagakerjaan_policy = 'invalid';
  assert.equal(C.calculatePayroll(w).totals, null);
});
test('policy CSV roundtrip, legacy migration and new defaults', () => {
  const w = workspace(); w.globalRules.current_pph_policy = 'net'; w.globalRules.current_bpjs_ketenagakerjaan_policy = 'employee';
  const restored = C.csv.importWorkspace(C.csv.exportWorkspace(w));
  assert.equal(restored.globalRules.current_pph_policy, 'net');
  assert.equal(restored.globalRules.current_bpjs_ketenagakerjaan_policy, 'employee');
  const legacy = C.csv.parse(C.csv.exportWorkspace(w)).map(row => Object.fromEntries(Object.entries(row).filter(([k]) => !Object.hasOwn(C.paymentPolicies, k))));
  const migrated = C.csv.importWorkspace(C.csv.stringify(legacy));
  for (const key of Object.keys(C.paymentPolicies)) assert.equal(migrated.globalRules[key], key.includes('_pph_') ? 'gross_up' : 'company');
  const fresh = C.createWorkspace().globalRules;
  assert.equal(fresh.current_pph_policy, 'unconfirmed'); assert.equal(fresh.current_bpjs_kesehatan_policy, 'unconfirmed'); assert.equal(fresh.current_bpjs_ketenagakerjaan_policy, 'employee');
});
