'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/state.js');
require('../js/payroll.js');
require('../js/csv.js');

function workspace() {
  const ws = C.sampleWorkspace();
  ws.employees = [ws.employees[0]];
  ws.componentDefinitions = []; ws.employeeComponents = []; ws.bpjsRules = [];
  for (const scenario of ['current', 'proposed']) {
    ws.matrices.push({ matrix_id: scenario + '-custom', scenario, matrix_type: 'contract_2-x', name: 'Custom', effective_date: '' });
    ws.matrixEntries.push({ ...ws.matrixEntries.find(e => e.scenario === scenario), matrix_id: scenario + '-custom', basic_salary: scenario === 'current' ? 8000000 : 9000000 });
  }
  return ws;
}
const errors = ws => C.validate(ws).filter(i => i.severity === 'error');
const exportedRows = ws => C.csv.parse(C.csv.exportWorkspace(ws));

test('type identifiers normalize without coercion or a built-in enum', () => {
  for (const [input, expected] of [[' Regular ', 'regular'], [' CONTRACT_2-X ', 'contract_2-x'], ['a', 'a']]) assert.equal(C.normalizeMatrixType(input), expected);
  for (const input of ['', ' ', null, undefined, 1, {}, '2x', '_a', 'a b', 'a/b', 'é', 'a.b']) assert.equal(C.normalizeMatrixType(input), null);
});

test('APIs isolate scenario/type/cell and derive entry type only from the parent', () => {
  const ws = workspace(), e = ws.employees[0];
  const before = structuredClone(ws);
  assert.equal(C.matrixSalary(ws, e, 'current').basic_salary, 4000000);
  e.current_matrix_type = ' CONTRACT_2-X ';
  assert.equal(C.resolveMatrixType(ws, e, 'proposed'), 'contract_2-x');
  assert.equal(C.resolveBasic(ws, e, 'current'), 8000000);
  assert.equal(C.resolveBasic(ws, e, 'proposed'), 9000000);
  const entry = C.matrixSalary(ws, e, 'current');
  entry.matrix_type = 'regular';
  assert.equal(C.matrixEntryKey(ws, entry), JSON.stringify(['current', 'contract_2-x', '1-U1']));
  assert.equal(errors(ws).length, 0);
  assert.equal(C.resolveMatrixType(ws, e, 'other'), '');
  assert.equal(C.matrixSalary(ws, e, 'other'), null);
  assert.equal(C.resolveBasic(ws, e, 'other'), null);
  delete entry.matrix_type;
  e.current_matrix_type = before.employees[0].current_matrix_type;
  assert.deepEqual(ws, before);
});

test('type and Golongan fallback are independent and never cross scenarios', () => {
  const ws = workspace(), e = ws.employees[0];
  ws.globalRules.proposed_matrix_type_defaults_current = false;
  assert.equal(C.resolveMatrixType(ws, e, 'proposed'), '');
  assert.equal(C.resolveBasic(ws, e, 'proposed'), null);
  e.proposed_matrix_type = 'contract_2-x';
  assert.equal(C.resolveBasic(ws, e, 'proposed'), 9000000);
  ws.globalRules.proposed_defaults_current = false;
  assert.equal(C.resolveBasic(ws, e, 'proposed'), null);
  e.proposed_golongan = '1-U1';
  assert.equal(C.resolveBasic(ws, e, 'proposed'), 9000000);
  e.proposed_matrix_type = 'invalid type';
  ws.globalRules.proposed_matrix_type_defaults_current = true;
  assert.equal(C.resolveMatrixType(ws, e, 'proposed'), '');
});

test('no runtime legacy defaults; active/included employees require current type', () => {
  const ws = workspace(), e = ws.employees[0];
  delete e.current_matrix_type;
  e.current_basic_override = 0; e.proposed_basic_override = 0;
  assert.equal(C.resolveBasic(ws, e, 'current'), 0);
  assert.ok(errors(ws).some(i => /current_matrix_type/.test(i.message)));
  e.active = false;
  assert.equal(errors(ws).length, 0);
  ws.globalRules.include_inactive = true;
  assert.ok(errors(ws).length);
  e.current_matrix_type = 'regular';
  delete ws.matrices[0].matrix_type;
  assert.ok(errors(ws).some(i => /matrix_type/.test(i.message)));
});

for (const [name, mutate] of [
  ['duplicate parent type', ws => ws.matrices.push({ ...ws.matrices[0], matrix_id: 'duplicate', matrix_type: ' REGULAR ' })],
  ['duplicate parent ID', ws => ws.matrices.push({ ...ws.matrices[0], matrix_type: 'different' })],
  ['duplicate cell', ws => ws.matrixEntries.push({ ...ws.matrixEntries[0] })],
  ['dangling parent', ws => { ws.matrixEntries[0].matrix_id = 'missing'; }],
  ['cross-scenario reference', ws => { ws.matrixEntries[0].matrix_id = 'demo-proposed'; }],
  ['invalid scenario', ws => { ws.matrixEntries[0].scenario = 'other'; }]
]) test(name + ' blocks validation and CSV, without guessing a salary', () => {
  const ws = workspace(); mutate(ws);
  assert.ok(errors(ws).length);
  assert.equal(C.matrixSalary(ws, ws.employees[0], 'current'), null);
  assert.equal(C.calculatePayroll(ws).totals, null);
  assert.throws(() => C.csv.exportWorkspace(ws));
});

test('override first includes zero, warns on presence and difference, and requires parent but not cell', () => {
  const ws = workspace(), e = ws.employees[0];
  for (const override of [0, 4000000, 5000000]) {
    e.current_basic_override = override;
    assert.equal(C.resolveBasic(ws, e, 'current'), override);
    const output = C.calculatePayroll(ws);
    assert.ok(output.totals);
    assert.equal(output.employees[0].current.breakdown[0].source, 'override');
    assert.ok(output.issues.some(i => /current basic salary override exists/.test(i.message)));
    assert.equal(output.issues.some(i => /current basic salary override differs/.test(i.message)), override !== 4000000);
  }
  ws.matrixEntries = ws.matrixEntries.filter(row => row.scenario !== 'current');
  assert.ok(C.calculatePayroll(ws).totals);
  ws.matrices = ws.matrices.filter(row => row.scenario !== 'current');
  assert.equal(C.calculatePayroll(ws).totals, null);
});

test('invalid overrides block and never silently fall back to a matrix value', () => {
  for (const value of ['bad', -1, 0.5, Infinity, true]) {
    const ws = workspace(); ws.employees[0].current_basic_override = value;
    assert.ok(errors(ws).some(i => /numeric input.*override/.test(i.message)));
  }
  const ws = workspace(); ws.employees[0].current_basic_override = 'bad';
  assert.equal(C.resolveBasic(ws, ws.employees[0], 'current'), null);
});

test('payroll and result CSV expose resolved types with automatic tax on override salary', () => {
  const ws = workspace(), e = ws.employees[0];
  ws.globalRules.tax_enabled = true;
  ws.globalRules.current_pph_policy = 'gross';
  e.current_matrix_type = 'contract_2-x'; e.proposed_matrix_type = 'regular';
  e.current_basic_override = 10000000;
  const output = C.calculatePayroll(ws), row = output.employees[0];
  assert.ok(output.totals);
  assert.equal(row.current_matrix_type, 'contract_2-x');
  assert.equal(row.proposed_matrix_type, 'regular');
  assert.equal(row.current.matrix_type, 'contract_2-x');
  assert.equal(row.current.pph, 200000);
  assert.equal(row.current.breakdown.find(r => r.code === 'pph').source, 'automatic_pph21');
  const csvRow = C.csv.parse(C.csv.exportResults(output))[0];
  assert.equal(csvRow.current_matrix_type, 'contract_2-x');
  assert.equal(csvRow.proposed_matrix_type, 'regular');
});

test('workspace custom types round-trip, normalize and keep natural keys distinct', () => {
  const ws = workspace(); ws.matrices[2].matrix_type = ' CONTRACT_2-X ';
  const restored = C.csv.importWorkspace(C.csv.exportWorkspace(ws));
  assert.equal(restored.matrices[2].matrix_type, 'contract_2-x');
  assert.equal(restored.matrixEntries.length, ws.matrixEntries.length);
  const rows = exportedRows(ws).reverse();
  assert.equal(C.csv.importWorkspace(C.csv.stringify(rows)).matrixEntries.length, ws.matrixEntries.length);
  rows.find(r => r.record_type === 'matrix' && r.matrix_type === 'contract_2-x').matrix_type = 'regular';
  assert.throws(() => C.csv.importWorkspace(C.csv.stringify(rows)), /Duplicate matrix/);
});

test('workspace migration happens only for absent headers, not blank cells', () => {
  const ws = C.sampleWorkspace();
  const fields = ['matrix_type', 'current_matrix_type', 'proposed_matrix_type', 'proposed_matrix_type_defaults_current'];
  const rows = exportedRows(ws).map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !fields.includes(key))));
  const migrated = C.csv.importWorkspace(C.csv.stringify(rows));
  assert.ok(migrated.matrices.every(m => m.matrix_type === 'regular'));
  assert.ok(migrated.employees.every(e => e.current_matrix_type === 'regular' && e.proposed_matrix_type === ''));
  assert.equal(migrated.globalRules.proposed_matrix_type_defaults_current, true);
  for (const value of ['', ' ', 'bad type']) {
    const invalid = exportedRows(ws); invalid.find(r => r.record_type === 'matrix').matrix_type = value;
    assert.throws(() => C.csv.importWorkspace(C.csv.stringify(invalid)));
  }
  const draft = exportedRows(ws); draft.find(r => r.record_type === 'employee').current_matrix_type = '';
  const restored = C.csv.importWorkspace(C.csv.stringify(draft));
  assert.equal(restored.employees[0].current_matrix_type, '');
  assert.ok(errors(restored).some(i => /current_matrix_type/.test(i.message)));
  const invalid = exportedRows(ws); invalid.find(r => r.record_type === 'global_rule').proposed_matrix_type_defaults_current = '';
  assert.throws(() => C.csv.importWorkspace(C.csv.stringify(invalid)));
});

test('matrix CSV upserts custom types independently, supports filters and legacy regular rows', () => {
  const ws = workspace(), before = structuredClone(ws);
  const p = C.csv.previewMatrix('scenario,matrix_type,golongan,basic_salary,matrix_name\ncurrent, CONTRACT_2-X ,1-U1,8100000,Custom renamed\ncurrent,regular,1-U1,4100000,Regular renamed', ws);
  assert.equal(p.rejected, 0, JSON.stringify(p.issues));
  assert.equal(p.updated, 2);
  assert.deepEqual(ws, before);
  assert.equal(C.resolveBasic(p.workspace, ws.employees[0], 'current'), 4100000);
  const all = C.csv.parse(C.csv.exportMatrix(p.workspace, 'current'));
  assert.equal(all.length, 3);
  assert.equal(C.csv.parse(C.csv.exportMatrix(p.workspace, 'current', ' CONTRACT_2-X ')).length, 1);
  assert.equal(C.csv.parse(C.csv.exportMatrix(p.workspace, 'current', undefined, 'demo-current')).length, 2);
  assert.equal(C.csv.parse(C.csv.exportMatrix(p.workspace, 'current', 'regular', 'current-custom')).length, 0);
  const roundtrip = C.csv.previewMatrix(C.csv.exportMatrix(p.workspace, 'current'), C.createWorkspace());
  assert.equal(roundtrip.rejected, 0);
  assert.equal(roundtrip.workspace.matrices.length, 2);
  const legacy = C.csv.previewMatrix('scenario,golongan,basic_salary\ncurrent,1-U1,123', ws);
  assert.equal(legacy.rejected, 0);
  assert.equal(legacy.workspace.matrixEntries.find(e => e.matrix_id === 'current-custom').basic_salary, 8000000);
  for (const type of ['', 'bad type']) assert.ok(C.csv.previewMatrix(`scenario,matrix_type,golongan,basic_salary\ncurrent,${type},1-U1,1`, ws).rejected);
  assert.ok(C.csv.previewMatrix('scenario,matrix_type,golongan,basic_salary\ncurrent,regular,1-U1,1\ncurrent, REGULAR ,1-U1,2', ws).rejected);
});

test('employee CSV preserves omitted types, clears proposed, blocks blank current and migrates legacy new employees', () => {
  const ws = workspace(); ws.employees[0].current_matrix_type = 'contract_2-x';
  let p = C.csv.previewEmployees('employee_id,notes\nDEMO-001,edited', ws, 'update');
  assert.equal(p.rejected, 0); assert.equal(p.workspace.employees[0].current_matrix_type, 'contract_2-x');
  p = C.csv.previewEmployees('employee_id,current_matrix_type,proposed_matrix_type\nDEMO-001, REGULAR ,', ws, 'update');
  assert.equal(p.rejected, 0); assert.equal(p.workspace.employees[0].current_matrix_type, 'regular');
  assert.equal(p.workspace.employees[0].proposed_matrix_type, '');
  assert.ok(C.csv.previewEmployees('employee_id,current_matrix_type\nDEMO-001,', ws, 'update').rejected);
  p = C.csv.previewEmployees('employee_id,name,current_golongan\nNEW,New,1-U1', ws, 'add');
  assert.equal(p.rejected, 0); assert.equal(p.workspace.employees.at(-1).current_matrix_type, 'regular');
  assert.equal(C.csv.parse(C.csv.exportEmployees(ws))[0].current_matrix_type, 'contract_2-x');
});
