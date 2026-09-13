'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('../js/state.js');
require('../js/matrix.js');
require('../js/validation.js');
require('../js/payroll.js');

function workspace(current = 10000, proposed = 12000) {
  const ws = C.sampleWorkspace();
  ws.employees = [ws.employees[0]];
  ws.employeeComponents = [];
  ws.componentDefinitions = [];
  ws.bpjsRules = [];
  ws.matrixEntries = ws.matrixEntries.filter(entry => entry.golongan === '1-U1');
  ws.matrixEntries[0].basic_salary = current;
  ws.matrixEntries[1].basic_salary = proposed;
  return ws;
}
function component(ws, code, direction, calculation_type, value, extra = {}, assignment = {}) {
  ws.componentDefinitions.push({ code, name: code, category: 'demo', direction, calculation_type,
    default_value: value, taxable: true, bpjs_kesehatan: true, bpjs_ketenagakerjaan: true,
    applies_current: true, applies_proposed: true, active: true, rounding: 1, notes: '', ...extra });
  ws.employeeComponents.push({ employee_id: ws.employees[0].employee_id, component_code: code,
    current_value: '', proposed_value: '', ...assignment });
}
function bpjs(ws, extra = {}) {
  ws.bpjsRules.push({ code: 'kesehatan', name: 'Demo', employee_rate: '0.01', employer_rate: '0.02',
    minimum_basis: '', maximum_basis: '', basis: 'basic', employee_enabled: true,
    employer_enabled: true, rounding: 1, active: true, ...extra });
}
function result(ws) {
  const output = C.calculatePayroll(ws);
  assert.ok(output.totals, JSON.stringify(output.issues));
  return output;
}
function blocked(ws, pattern) {
  const output = C.calculatePayroll(ws);
  assert.deepEqual(output.employees, []);
  assert.equal(output.totals, null);
  assert.ok(output.issues.some(issue => issue.severity === 'error' && pattern.test(issue.message)), JSON.stringify(output.issues));
}

test('classic scripts share a browser global without require or DOM', () => {
  const context = vm.createContext({});
  for (const file of ['state', 'matrix', 'payroll', 'validation']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + file + '.js'), 'utf8'), context);
  }
  assert.equal(vm.runInContext('Caroll.calculatePayroll(Caroll.sampleWorkspace()).employees.length', context), 2);
});
test('workspace defaults are fresh, empty, safe, and sample is fictional', () => {
  const a = C.createWorkspace(), b = C.createWorkspace();
  a.employees.push({});
  assert.equal(b.employees.length, 0);
  assert.equal(b.globalRules.tax_enabled, false);
  assert.deepEqual(result(b).employees, []);
  assert.equal(result(b).totals.current.gross, 0);
  assert.match(C.sampleWorkspace().metadata.name, /Fictional/);
  assert.equal(result(C.sampleWorkspace()).employees.length, 2);
});
test('decimal-exact rounding, negatives, exponents, boundaries, and invalid values', () => {
  assert.equal(C.roundMoney('1.5'), 2);
  assert.equal(C.roundMoney('-1.5'), -2);
  assert.equal(C.roundMoney(149, 100), 100);
  assert.equal(C.roundMoney(150, 100), 200);
  assert.equal(C.roundMoney(1500, 1000), 2000);
  assert.equal(C.roundMoney(-150, 100), -200);
  assert.equal(C.percent(100, '0.145'), 15);
  assert.equal(C.percent(100000000, '1e-7'), 10);
  assert.equal(C.percent('9007199254740991', '0.00000001'), 90071993);
  for (const value of ['', null, true, NaN, Infinity, '1,000', 'abc']) assert.throws(() => C.roundMoney(value));
  for (const rounding of [0, -1, 0.5]) assert.throws(() => C.roundMoney(5, rounding));
  assert.throws(() => C.roundMoney('9007199254740992'), /safe integer/);
});
test('Golongan generation and parsing', () => {
  assert.equal(C.golongan(3, 'pm', 8), '3-PM8');
  assert.deepEqual(C.parseGolongan('3-PM8'), { salary_group: '3', professional_category: 'PM', kmk_level: 8 });
  for (const code of ['', '3PM8', '3-PM0', '0-PM1']) assert.equal(C.parseGolongan(code), null);
});
test('matrix resolution honors zero overrides and proposed fallback only to current code', () => {
  const ws = workspace();
  const employee = ws.employees[0];
  assert.equal(C.resolveBasic(ws, employee, 'current'), 10000);
  assert.equal(C.resolveBasic(ws, employee, 'proposed'), 12000);
  employee.current_basic_override = 0;
  employee.proposed_basic_override = 13000;
  assert.equal(C.resolveBasic(ws, employee, 'current'), 0);
  assert.equal(C.resolveBasic(ws, employee, 'proposed'), 13000);
  employee.proposed_basic_override = '';
  ws.globalRules.proposed_defaults_current = false;
  assert.equal(C.resolveBasic(ws, employee, 'proposed'), null);
  ws.globalRules.proposed_defaults_current = true;
  ws.matrixEntries.pop();
  assert.equal(C.resolveBasic(ws, employee, 'proposed'), null);
});
test('matrix adjustments round the final salary exactly and do not mutate', () => {
  const entries = [{ basic_salary: 1050, note: 'keep' }];
  assert.deepEqual(C.adjustMatrix(entries, '0.1', 100), [{ basic_salary: 1200, note: 'keep' }]);
  assert.equal(C.adjustMatrix(entries, '-0.1', 100)[0].basic_salary, 900);
  assert.equal(entries[0].basic_salary, 1050);
});
test('fixed, manual, percentage basic, deductions, contributions and assignment defaults', () => {
  const ws = workspace();
  component(ws, 'FIX', 'earning', 'fixed', 1000);
  component(ws, 'BASIC', 'earning', 'percentage_basic', '0.1');
  component(ws, 'MANUAL', 'earning', 'manual', 500, {}, { current_value: 0, proposed_value: 800 });
  component(ws, 'DEDUCT', 'employee_deduction', 'fixed', 300);
  component(ws, 'EMPLOYER', 'employer_contribution', 'fixed', 200);
  component(ws, 'OFF', 'earning', 'fixed', 99999, { active: false });
  component(ws, 'PROPOSED', 'earning', 'fixed', 100, { applies_current: false });
  const row = result(ws).employees[0];
  assert.equal(row.current.gross, 12000);
  assert.equal(row.current.deductions, 300);
  assert.equal(row.current.take_home_pay, 11700);
  assert.equal(row.current.employer_cost, 12200);
  assert.equal(row.proposed.gross, 15100);
  ws.employeeComponents = [];
  assert.equal(result(ws).employees[0].current.gross, 10000);
});
test('percentage gross uses a shared independent earning basis and is order invariant', () => {
  const ws = workspace();
  component(ws, 'FIX', 'earning', 'fixed', 1000);
  component(ws, 'A', 'earning', 'percentage_gross', '0.1');
  component(ws, 'B', 'earning', 'percentage_gross', '0.2');
  component(ws, 'D', 'employee_deduction', 'percentage_gross', '0.05');
  const output = result(ws);
  assert.equal(output.employees[0].current.gross, 14300);
  assert.equal(output.employees[0].current.deductions, 550);
  assert.equal(output.employees[0].current.breakdown.find(row => row.code === 'B').basis, 11000);
  ws.employeeComponents.reverse(); ws.componentDefinitions.reverse(); ws.matrixEntries.reverse();
  assert.deepEqual(result(ws), output);
});
test('BPJS caps and employee/employer separation', () => {
  const ws = workspace(10000, 30000);
  bpjs(ws, { minimum_basis: 15000, maximum_basis: 20000 });
  const row = result(ws).employees[0];
  assert.equal(row.current.employee_bpjs, 150);
  assert.equal(row.current.employer_bpjs, 300);
  assert.equal(row.proposed.employee_bpjs, 200);
  assert.equal(row.proposed.employer_bpjs, 400);
  assert.equal(row.current.take_home_pay, 9850);
  assert.equal(row.current.employer_cost, 10300);
});
test('BPJS selected and gross bases, participation, and enable flags', () => {
  const ws = workspace();
  component(ws, 'SELECTED', 'earning', 'fixed', 1000);
  component(ws, 'OTHER', 'earning', 'fixed', 2000, { bpjs_kesehatan: false });
  bpjs(ws, { basis: 'selected' });
  bpjs(ws, { code: 'JHT', basis: 'gross', employee_enabled: false });
  let row = result(ws).employees[0].current;
  assert.equal(row.employee_bpjs, 110);
  assert.equal(row.employer_bpjs, 220 + 260);
  ws.employees[0].bpjs_kesehatan = false;
  row = result(ws).employees[0].current;
  assert.equal(row.employee_bpjs, 0);
  assert.equal(row.employer_bpjs, 260);
  ws.employees[0].bpjs_ketenagakerjaan = false;
  assert.equal(result(ws).employees[0].current.employer_bpjs, 0);
});
for (const method of ['gross', 'net', 'gross_up']) {
  test('tax treatment: ' + method + ' never double counts employer tax', () => {
    const ws = workspace();
    ws.globalRules.tax_enabled = true;
    ws.employees[0].pph_rate = '0.1';
    ws.employees[0].pph_method = method;
    const row = result(ws).employees[0].current;
    assert.equal(row.pph, 1000);
    assert.equal(row.gross, 10000);
    assert.equal(row.take_home_pay, method === 'gross' ? 9000 : 10000);
    assert.equal(row.employer_cost, method === 'gross' ? 10000 : 11000);
    assert.equal(row.tax_allowance, method === 'gross_up' ? 1000 : 0);
    assert.equal(row.employer_tax_cost, method === 'net' ? 1000 : 0);
  });
}
test('tax bases, rounding, manual zero override, and disabled tax', () => {
  const ws = workspace();
  component(ws, 'TAXABLE', 'earning', 'fixed', 1000);
  component(ws, 'EXEMPT', 'earning', 'fixed', 2000, { taxable: false });
  ws.globalRules.tax_enabled = true;
  ws.employees[0].pph_rate = '0.1';
  for (const [basis, expected] of [['taxable', 1100], ['gross', 1300], ['basic', 1000]]) {
    ws.globalRules.tax_basis = basis;
    assert.equal(result(ws).employees[0].current.pph, expected);
  }
  ws.employees[0].pph_fixed_override = 155;
  ws.globalRules.tax_rounding = 100;
  assert.equal(result(ws).employees[0].current.pph, 200);
  ws.employees[0].pph_fixed_override = 0;
  let row = result(ws).employees[0].current;
  assert.equal(row.pph, 0);
  assert.equal(row.breakdown.find(item => item.code === 'pph').source, 'manual_override');
  ws.employees[0].pph_fixed_override = 900;
  ws.globalRules.tax_enabled = false;
  assert.equal(result(ws).employees[0].current.pph, 0);
});
test('change zero and negative cases and organization percentages use totals', () => {
  assert.deepEqual(C.change(0, 0), { amount: 0, percent: 0 });
  assert.deepEqual(C.change(0, 10), { amount: 10, percent: null });
  assert.deepEqual(C.change(100, 90), { amount: -10, percent: -10 });
  const ws = workspace(100, 200);
  ws.employees.push({ ...ws.employees[0], employee_id: 'SECOND', current_basic_override: 900, proposed_basic_override: 900 });
  assert.equal(result(ws).totals.changes.basic_salary.percent, 10);
});
test('negative THP blocks by default, can be allowed, and is never clamped', () => {
  const ws = workspace();
  component(ws, 'DEBT', 'employee_deduction', 'fixed', 20000);
  blocked(ws, /Negative take-home pay/);
  ws.globalRules.allow_negative_thp = true;
  assert.equal(result(ws).employees[0].current.take_home_pay, -10000);
});
test('inactive employees are excluded unless explicitly included', () => {
  const ws = workspace();
  ws.employees[0].active = false;
  assert.equal(result(ws).employees.length, 0);
  ws.globalRules.include_inactive = true;
  assert.equal(result(ws).employees.length, 1);
});
test('calculation and validation never mutate workspace', () => {
  const ws = C.sampleWorkspace();
  const before = JSON.stringify(ws);
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }
  freeze(ws);
  result(ws); C.validate(ws);
  assert.equal(JSON.stringify(ws), before);
});
const invalidCases = [
  ['missing ID', ws => { ws.employees[0].employee_id = ''; }, /Missing employee ID/],
  ['duplicate ID', ws => ws.employees.push({ ...ws.employees[0] }), /Duplicate employee ID/],
  ['missing name', ws => { ws.employees[0].name = ''; }, /Missing employee name/],
  ['missing Golongan', ws => { ws.employees[0].current_golongan = ''; }, /Missing current Golongan/],
  ['missing proposed matrix', ws => ws.matrixEntries.pop(), /Unresolved proposed/],
  ['negative basic', ws => { ws.employees[0].current_basic_override = -1; }, /basic salary override/],
  ['fractional basic', ws => { ws.matrixEntries[0].basic_salary = 1.1; }, /matrix basic salary/],
  ['invalid number', ws => { ws.employees[0].current_basic_override = 'NaN'; }, /numeric/],
  ['duplicate matrix', ws => ws.matrixEntries.push({ ...ws.matrixEntries[0] }), /Duplicate matrix entry/],
  ['matrix reference', ws => { ws.matrixEntries[0].matrix_id = 'missing'; }, /matrix reference/],
  ['matrix dimensions', ws => { ws.matrixEntries[0].kmk_level = 3; }, /dimensions/],
  ['invalid formula', ws => component(ws, 'BAD', 'earning', 'recursive', 1), /formula/],
  ['unknown component', ws => ws.employeeComponents.push({ employee_id: ws.employees[0].employee_id, component_code: 'MISSING' }), /Unknown referenced component/],
  ['unknown employee', ws => { component(ws, 'A', 'earning', 'fixed', 1); ws.employeeComponents[0].employee_id = 'missing'; }, /Unknown employee/],
  ['duplicate assignment', ws => { component(ws, 'A', 'earning', 'fixed', 1); ws.employeeComponents.push({ ...ws.employeeComponents[0] }); }, /Duplicate employee component/],
  ['missing manual value', ws => component(ws, 'A', 'earning', 'manual', ''), /Manual component requires/],
  ['invalid BPJS bounds', ws => bpjs(ws, { minimum_basis: 100, maximum_basis: 10 }), /minimum basis exceeds/],
  ['negative BPJS rate', ws => bpjs(ws, { employee_rate: -0.01 }), /employee_rate/],
  ['invalid rounding', ws => { ws.globalRules.rounding = 0; }, /rounding/],
  ['invalid tax method', ws => { ws.employees[0].pph_method = 'unknown'; }, /PPh method/],
  ['string boolean', ws => { ws.employees[0].active = 'false'; }, /boolean/]
];
for (const [name, mutate, pattern] of invalidCases) test('blocking validation: ' + name, () => { const ws = workspace(); mutate(ws); blocked(ws, pattern); });
test('malformed workspace returns structured errors', () => {
  blocked(null, /Workspace/);
  blocked({}, /collection/);
  const ws = workspace(); ws.employees.push(null); blocked(ws, /collection/);
});
test('warning conditions remain calculable and employee issues are attached', () => {
  const ws = workspace(12000, 10000);
  ws.employees[0].ptkp_status = '';
  ws.employees[0].bpjs_kesehatan = false;
  ws.employees[0].current_basic_override = 13000;
  ws.employees[0].proposed_golongan = '2-PM2';
  ws.employees[0].proposed_basic_override = 9000;
  const output = result(ws);
  for (const pattern of [/disabled/, /PTKP/, /excluded/, /override differs/, /basic salary is lower/, /take-home pay is lower/, /salary group changes/, /professional category changes/]) {
    assert.ok(output.issues.some(issue => pattern.test(issue.message)), String(pattern));
  }
  assert.ok(output.employees[0].issues.length > 0);
});
test('money overflow is a blocking error, including aggregate-only overflow', () => {
  const ws = workspace();
  ws.employees[0].current_basic_override = Number.MAX_SAFE_INTEGER;
  ws.employees[0].proposed_basic_override = Number.MAX_SAFE_INTEGER;
  component(ws, 'OVERFLOW', 'earning', 'fixed', 1);
  blocked(ws, /safe integer/);
  ws.employeeComponents = []; ws.componentDefinitions = [];
  ws.employees.push({ ...ws.employees[0], employee_id: 'SECOND' });
  blocked(ws, /Totals calculation failed/);
});
