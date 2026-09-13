'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../js/state.js');
require('../js/matrix.js');
require('../js/validation.js');
require('../js/csv.js');
require('../js/payroll.js');
const C = globalThis.Caroll;
const csv = C.csv;
const sample = () => C.sampleWorkspace();
const errors = preview => preview.issues.filter(i => i.severity === 'error');
function mutateExport(ws, callback) {
  const rows = csv.parse(csv.exportWorkspace(ws));
  callback(rows);
  return csv.stringify(rows);
}

test('RFC4180 BOM, CRLF, commas, escaped quotes, multiline, Unicode and empty cells', () => {
  const rows = [{ id: '001', text: 'Nama, "é"\r\nbaris\nlagi', empty: '' }];
  const text = csv.stringify(rows);
  assert.ok(text.startsWith('\uFEFFid,text,empty\r\n'));
  assert.ok(text.endsWith('\r\n'));
  assert.deepEqual(csv.parse(text), rows);
  assert.deepEqual(csv.parse('a,b\n1,2\n'), [{ a: '1', b: '2' }]);
  assert.deepEqual(csv.parse('a,b\r\n'), []);
  assert.deepEqual(csv.parse('__proto__,constructor\r\nx,y'), [{ ['__proto__']: 'x', constructor: 'y' }]);
});

test('rejects malformed quoting, rows, headers and unsafe stringify values', () => {
  for (const text of ['', 'a,a\n1,2', ',b\n1,2', ' a,b\n1,2', 'a,b\n1', 'a\n1,2', 'a\n"x', 'a\nx"y', 'a\n"x"junk', 'a\r1']) assert.throws(() => csv.parse(text), undefined, text);
  assert.throws(() => csv.stringify([]));
  assert.throws(() => csv.stringify([{ a: Infinity }]));
  assert.throws(() => csv.stringify([{ a: {} }]));
});

test('all workspace record types round-trip through stable superset without JSON payload', () => {
  const ws = sample();
  ws.metadata.name = 'Simulasi, "2027"\r\nIndonesia';
  const text = csv.exportWorkspace(ws);
  const imported = csv.importWorkspace(text);
  assert.equal(csv.exportWorkspace(imported), text);
  assert.equal(imported.employees[0].current_basic_override, '');
  assert.equal(imported.employeeComponents[0].current_value, '');
  assert.equal(imported.globalRules.rounding, 1);
  assert.equal(imported.employees[0].pph_rate, 0.025);
  assert.equal(imported.matrixEntries[0].salary_group, '1');
  assert.deepEqual(new Set(csv.parse(text).map(r => r.record_type)), new Set(['workspace', 'matrix', 'matrix_entry', 'employee', 'component_definition', 'employee_component', 'bpjs_rule', 'global_rule']));
  const empty = csv.exportWorkspace(C.createWorkspace());
  assert.equal(empty.split('\r\n')[0], text.split('\r\n')[0]);
  assert.equal(csv.exportWorkspace(csv.importWorkspace(empty)), empty);
  const rows = csv.parse(text).reverse();
  assert.equal(csv.importWorkspace(csv.stringify(rows)).employees.length, 2);
});

test('workspace rejects schema, unknown records/columns, duplicate keys, irrelevant values, references and invalid rules', () => {
  const changes = [
    rows => { rows[0].schema_version = '2'; },
    rows => { rows[0].record_type = 'alien'; },
    rows => { rows[0].unknown = 'x'; },
    rows => { rows[0].employee_id = 'x'; },
    rows => { rows.push({ ...rows.find(r => r.record_type === 'employee'), record_id: 'different' }); },
    rows => { rows.push({ ...rows[0], record_id: 'different' }); },
    rows => { rows.find(r => r.record_type === 'employee_component').employee_id = 'missing'; },
    rows => { rows.find(r => r.record_type === 'employee_component').component_code = 'missing'; },
    rows => { rows.find(r => r.record_type === 'matrix_entry').matrix_id = 'missing'; },
    rows => { rows.find(r => r.record_type === 'bpjs_rule').minimum_basis = '9000000'; },
    rows => { rows.find(r => r.record_type === 'component_definition').calculation_type = 'formula'; },
    rows => { rows.find(r => r.record_type === 'global_rule').rounding = '10'; }
  ];
  for (const change of changes) assert.throws(() => csv.importWorkspace(mutateExport(sample(), change)));
});

test('unfinished drafts reload while payroll readiness and structural integrity remain separate', () => {
  const ws = sample();
  ws.matrixEntries = ws.matrixEntries.filter(row => row.scenario === 'current');
  ws.employees[0].pph_rate = '';
  ws.globalRules.tax_enabled = true;
  ws.componentDefinitions[0].calculation_type = 'manual';
  ws.componentDefinitions[0].default_value = '';
  const text = csv.exportWorkspace(ws);
  const imported = csv.importWorkspace(text);
  assert.equal(csv.exportWorkspace(imported), text);
  const issues = C.validate(imported).filter(issue => issue.severity === 'error');
  assert.ok(issues.some(issue => /Unresolved proposed basic salary/.test(issue.message)));
  assert.ok(issues.some(issue => /Manual component requires a value/.test(issue.message)));
  assert.ok(issues.some(issue => /PPh rate/.test(issue.message)));
  const payroll = C.calculatePayroll(imported);
    assert.deepEqual(payroll.employees, []);
    assert.equal(payroll.totals, null);
    assert.throws(() => csv.exportResults(payroll));
  for (const change of [
    rows => { rows.find(r => r.record_type === 'employee').active = 'yes'; },
    rows => { rows.find(r => r.record_type === 'employee').current_basic_override = 'NaN'; },
    rows => { rows.find(r => r.record_type === 'global_rule').currency = 'USD'; },
    rows => { rows.find(r => r.record_type === 'global_rule').tax_basis = 'unknown'; },
    rows => { rows.find(r => r.record_type === 'global_rule').percentage_precision = '3'; },
    rows => { rows.find(r => r.record_type === 'employee_component').component_code = 'missing'; }
  ]) assert.throws(() => csv.importWorkspace(mutateExport(ws, change)));
});

test('configured rounding consumes original decimals on import/export regardless of row order', () => {
  const base = sample();
  base.globalRules.rounding = 100;
  base.globalRules.tax_rounding = 1000;
  base.componentDefinitions[0].rounding = 1000;
  const rows = csv.parse(csv.exportWorkspace(base));
  for (const row of rows) {
    if (row.record_type === 'matrix_entry') row.basic_salary = '4000049.5';
    if (row.record_type === 'employee') {
      row.current_basic_override = '4000049.5';
      row.proposed_basic_override = '4000050';
      row.pph_fixed_override = '100499.5';
    }
    if (row.record_type === 'component_definition') row.default_value = '100499.999999999999999999';
    if (row.record_type === 'employee_component') {
      row.current_value = '-100499.5';
      row.proposed_value = '100500';
    }
    if (row.record_type === 'bpjs_rule') row.maximum_basis = '5000049.5';
  }
  for (const ordered of [rows, [...rows].reverse(), [...rows.filter(r => r.record_type === 'employee_component'), ...rows.filter(r => r.record_type !== 'employee_component')]]) {
    const ws = csv.importWorkspace(csv.stringify(ordered));
    assert.ok(ws.matrixEntries.every(r => r.basic_salary === 4000000));
    assert.ok(ws.employees.every(r => r.current_basic_override === 4000000 && r.proposed_basic_override === 4000100 && r.pph_fixed_override === 100000));
    assert.equal(ws.componentDefinitions[0].default_value, 100000);
    assert.ok(ws.employeeComponents.every(r => r.current_value === -100000 && r.proposed_value === 101000));
    assert.equal(ws.bpjsRules[0].maximum_basis, 5000050);
    assert.equal(csv.exportWorkspace(csv.importWorkspace(csv.exportWorkspace(ws))), csv.exportWorkspace(ws));
  }
  // Exports must use the same direct rule, not round raw workspace values to rupiah first.
  base.matrixEntries[0].basic_salary = '4000049.5';
  base.employees[0].current_basic_override = '4000049.5';
  base.employees[0].pph_fixed_override = '100499.5';
  base.componentDefinitions[0].default_value = '100499.5';
  base.employeeComponents[0].current_value = '-100499.5';
  const before = structuredClone(base);
  const exported = csv.importWorkspace(csv.exportWorkspace(base));
  assert.equal(exported.matrixEntries[0].basic_salary, 4000000);
  assert.equal(exported.employees[0].current_basic_override, 4000000);
  assert.equal(exported.employees[0].pph_fixed_override, 100000);
  assert.equal(exported.componentDefinitions[0].default_value, 100000);
  assert.equal(exported.employeeComponents[0].current_value, -100000);
  assert.equal(csv.parse(csv.exportEmployees(base))[0].current_basic_override, '4000000');
  assert.equal(csv.parse(csv.exportMatrix(base, 'current'))[0].basic_salary, '4000000');
  assert.deepEqual(base, before);
});

test('employee and matrix previews apply global and tax rounding without an intermediate rupiah rounding', () => {
  const ws = sample();
  ws.globalRules.rounding = 100;
  ws.globalRules.tax_rounding = 1000;
  const before = structuredClone(ws);
  const employees = csv.previewEmployees('employee_id,current_basic_override,proposed_basic_override,pph_fixed_override\nDEMO-001,4000049.5,4000050,100499.5', ws, 'update');
  assert.equal(employees.rejected, 0, JSON.stringify(employees.issues));
  assert.equal(employees.workspace.employees[0].current_basic_override, 4000000);
  assert.equal(employees.workspace.employees[0].proposed_basic_override, 4000100);
  assert.equal(employees.workspace.employees[0].pph_fixed_override, 100000);
  assert.equal(C.resolveBasic(employees.workspace, employees.workspace.employees[0], 'current'), 4000000);
  const matrix = csv.previewMatrix('scenario,golongan,basic_salary\ncurrent,1-U1,4000049.5', ws);
  assert.equal(matrix.rejected, 0, JSON.stringify(matrix.issues));
  assert.equal(matrix.workspace.matrixEntries[0].basic_salary, 4000000);
  assert.deepEqual(ws, before);
});

test('legacy salary overrides survive CSV round-trip but cannot replace matrix salaries', () => {
  const ws = sample();
  const preview = csv.previewEmployees('employee_id,current_basic_override,proposed_basic_override\nDEMO-001,0,9999999', ws, 'update');
  assert.equal(preview.rejected, 0);
  const restored = csv.importWorkspace(csv.exportWorkspace(preview.workspace));
  const employee = restored.employees[0];
  assert.equal(employee.current_basic_override, 0);
  assert.equal(employee.proposed_basic_override, 9999999);
  assert.equal(C.resolveBasic(restored, employee, 'current'), 4000000);
  assert.equal(C.resolveBasic(restored, employee, 'proposed'), 4200000);
  assert.equal(C.calculatePayroll(restored).employees[0].proposed.breakdown[0].source, 'matrix');
  assert.ok(preview.issues.some(i => /override is disabled and ignored/.test(i.message)));
  restored.matrixEntries = [];
  assert.equal(C.calculatePayroll(restored).totals, null);
});

test('employee update matches ID only, preserves omitted fields and blanks explicitly clear overrides', () => {
  const ws = sample();
  ws.employees[0].current_basic_override = 5000000;
  const before = structuredClone(ws);
  const p = csv.previewEmployees('employee_id,name,current_basic_override\nDEMO-001,New name,', ws, 'update');
  assert.equal(p.rejected, 0, JSON.stringify(p.issues));
  assert.equal(p.updated, 1);
  assert.equal(p.workspace.employees[0].current_basic_override, '');
  assert.equal(p.workspace.employees[0].department, ws.employees[0].department);
    assert.equal(p.workspace.employees[0].pph_rate, ws.employees[0].pph_rate);
  assert.ok(p.issues.some(i => /Name differs/.test(i.message)));
  assert.ok(p.issues.some(i => /missing from the update/.test(i.message)));
  assert.deepEqual(ws, before);
  assert.equal(csv.previewEmployees('employee_id\nDEMO-001', ws, 'update').unchanged, 1);
  assert.ok(csv.previewEmployees('employee_id\nNEW', ws, 'update').rejected > 0);
});

test('employee add/update/replace previews reject duplicates, bad input and reference loss without mutation', () => {
  const ws = sample(), before = structuredClone(ws);
  const text = 'employee_id,name,current_golongan\nNEW,New employee,1-U1';
  assert.equal(csv.previewEmployees(text, ws, 'add').added, 1);
  assert.equal(csv.previewEmployees(text, ws, 'update').added, 1);
  assert.ok(csv.previewEmployees(text, ws, 'replace').rejected > 0);
  assert.ok(csv.previewEmployees(csv.exportEmployees(ws), ws, 'add').rejected > 0);
  assert.ok(csv.previewEmployees(text + '\nNEW,Other,1-U1', ws, 'add').rejected > 0);
  assert.ok(csv.previewEmployees('employee_id,name,current_golongan\nNEW,New,9-U9', ws, 'add').rejected > 0);
  assert.ok(csv.previewEmployees(text, ws, 'bad-mode').rejected > 0);
  assert.ok(csv.previewEmployees('employee_id,name\nNEW,New', ws, 'add').rejected > 0);
  assert.ok(csv.previewEmployees('employee_id,active\nDEMO-001,yes', ws, 'update').rejected > 0);
  assert.deepEqual(ws, before);
  const replace = csv.previewEmployees(csv.exportEmployees(ws), ws, 'replace');
  assert.equal(replace.rejected, 0, JSON.stringify(replace.issues));
  assert.equal(replace.workspace.employeeComponents.length, ws.employeeComponents.length);
});

test('numeric normalization uses exact money rounding and preserves zero vs blank', () => {
  const ws = sample();
  const p = csv.previewEmployees('employee_id,current_basic_override,proposed_basic_override,pph_rate,active,pph_method\nDEMO-001,100.499999999999999999,0,0.09, FALSE ,gross-up', ws, 'update');
  assert.equal(p.rejected, 0, JSON.stringify(p.issues));
  assert.equal(p.workspace.employees[0].current_basic_override, 100);
  assert.equal(p.workspace.employees[0].proposed_basic_override, 0);
  assert.equal(p.workspace.employees[0].pph_rate, 0.09);
  assert.equal(p.workspace.employees[0].pph_method, 'gross_up');
  for (const value of ['NaN', 'Infinity', '1e3', 'Rp100', '9007199254740992', '-0.1', '1,000']) {
    const text = csv.stringify([{ employee_id: 'DEMO-001', current_basic_override: value }]);
    assert.ok(csv.previewEmployees(text, ws, 'update').rejected > 0, value);
  }
  assert.equal(csv.previewEmployees('employee_id,current_basic_override\nDEMO-001,100.5', ws, 'update').workspace.employees[0].current_basic_override, 101);
  assert.ok(csv.previewEmployees('employee_id,join_date\nDEMO-001,2026-02-30', ws, 'update').rejected > 0);
});

test('matrix preview upserts canonical keys, preserves other entries and exports scenario metadata', () => {
  const ws = sample(), before = structuredClone(ws);
  const p = csv.previewMatrix('scenario,golongan,basic_salary\ncurrent,01-u01,4100000.5\nproposed,3-PM8,8000000', ws);
  assert.equal(p.rejected, 0, JSON.stringify(p.issues));
  assert.equal(p.updated, 1);
  assert.equal(p.added, 1);
  assert.equal(p.workspace.matrixEntries[0].basic_salary, 4100001);
  assert.equal(p.workspace.matrixEntries[0].golongan, '1-U1');
  assert.deepEqual(ws, before);
  const exported = csv.exportMatrix(ws, 'current');
  assert.ok(csv.parse(exported).every(r => r.scenario === 'current' && r.matrix_name === 'Demo current'));
  const again = csv.previewMatrix(exported, ws);
  assert.equal(again.rejected, 0, JSON.stringify(again.issues));
  assert.equal(again.unchanged, 2);
  assert.throws(() => csv.exportMatrix(ws, 'other'));
});

test('matrix preview rejects malformed, duplicate and inconsistent metadata/dimensions', () => {
  for (const text of [
    'scenario,golongan,basic_salary\nother,1-U1,10',
    'scenario,golongan,basic_salary\ncurrent,bad,10',
    'scenario,golongan,basic_salary\ncurrent,1-U1,-1',
    'scenario,golongan,basic_salary\ncurrent,1-U1,10\ncurrent,1-U1,20',
    'scenario,golongan,basic_salary,salary_group\ncurrent,1-U1,10,2',
    'scenario,golongan,basic_salary,matrix_name\ncurrent,1-U1,10,A\ncurrent,2-PM2,20,B',
    'scenario,golongan,basic_salary,effective_date\ncurrent,1-U1,10,2026-02-30'
  ]) {
    const p = csv.previewMatrix(text, sample());
    assert.ok(p.rejected > 0, text);
    assert.ok(errors(p).length);
  }
  const p = csv.previewMatrix('scenario,golongan,basic_salary\ncurrent,1-U1,10', C.createWorkspace());
  assert.equal(p.rejected, 0, JSON.stringify(p.issues));
  assert.equal(p.workspace.matrices[0].matrix_id, 'matrix-current');
});

test('component money rounds exactly while percentage overrides remain fractional', () => {
  const ws = sample();
  ws.componentDefinitions[0].default_value = '100.499999999999999999';
  ws.employeeComponents[0].current_value = '-100.5';
  ws.employeeComponents[0].proposed_value = '100.499999999999999999';
  let imported = csv.importWorkspace(csv.exportWorkspace(ws));
  assert.equal(imported.componentDefinitions[0].default_value, 100);
  assert.equal(imported.employeeComponents[0].current_value, -101);
  assert.equal(imported.employeeComponents[0].proposed_value, 100);
  ws.componentDefinitions[0].calculation_type = 'percentage_basic';
  ws.componentDefinitions[0].default_value = '0.09';
  ws.employeeComponents[0].current_value = '0.025';
  imported = csv.importWorkspace(csv.exportWorkspace(ws));
  assert.equal(imported.componentDefinitions[0].default_value, 0.09);
  assert.equal(imported.employeeComponents[0].current_value, 0.025);
  ws.componentDefinitions[0].calculation_type = 'manual';
  ws.componentDefinitions[0].default_value = '';
  ws.employeeComponents.forEach(r => { r.current_value = '0'; r.proposed_value = '1'; });
  imported = csv.importWorkspace(csv.exportWorkspace(ws));
  assert.equal(imported.componentDefinitions[0].default_value, '');
});

test('result export flattens core schema, preserves undefined percentages, and blocks errors', () => {
  const values = { basic_salary: 100, gross: 200, employee_bpjs: 1, employer_bpjs: 2, pph: 3, deductions: 4, take_home_pay: 192, employer_cost: 202 };
  const changes = Object.fromEntries(['basic_salary', 'gross', 'take_home_pay', 'employer_cost'].map(k => [k, { amount: 0, percent: null }]));
  const employee = { employee_id: '001', name: 'A, B', unit: 'U', department: 'D', current_golongan: '1-U1', proposed_golongan: '1-U1', current: values, proposed: values, changes, issues: [{ severity: 'warning', message: 'Review' }] };
  const result = { employees: [employee], issues: [] };
  const [row] = csv.parse(csv.exportResults(result));
  assert.equal(row.current_basic_salary, '100');
  assert.equal(row.basic_change_percent, '');
  assert.equal(row.validation_status, 'warning');
  assert.equal(row.employee_id, '001');
  assert.equal(csv.parse(csv.exportResults({ employees: [], issues: [] })).length, 0);
  result.issues.push({ severity: 'error', message: 'blocked' });
  assert.throws(() => csv.exportResults(result));
  assert.throws(() => csv.exportResults({ employees: [{ ...employee, current: {} }] }));
});
