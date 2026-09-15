'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../js/state.js');
require('../js/matrix.js');
require('../js/tax.js');
require('../js/validation.js');
require('../js/payroll.js');
require('../js/ui.js');
const U = globalThis.Caroll.ui;

class FakeNode {
  constructor(tag = '', text = '') { this.tag = tag; this.text = text; this.children = []; this.attrs = {}; this.dataset = {}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attrs[key] = value; if (key.startsWith('data-')) this.dataset[key.slice(5)] = value; }
  addEventListener(name, handler) { const previous = (this.listeners ||= {})[name]; this.listeners[name] = event => { previous?.(event); handler(event); }; }
  focus() {}
  querySelectorAll() { return []; }
  get textContent() { return this.text + this.children.map(node => node.textContent).join(''); }
  set textContent(text) { this.text = text; this.children = []; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: tag => new FakeNode(tag), createTextNode: text => new FakeNode('', text) };
const find = (node, predicate) => [node, ...node.children.flatMap(child => find(child, predicate))].filter(predicate);
const tags = (node, tag) => find(node, item => item.tag === tag);
const entry = (group, category, level, salary, scenario = 'current', matrix = 'a') => ({ salary_group: group, professional_category: category, kmk_level: level, basic_salary: salary, scenario, matrix_id: matrix, golongan: group + category + level });
const data = [entry(10, 'Z10', 20, 1234567), entry(2, 'U', 1, 0), entry(2, 'PM', 2, 2300456, 'proposed', 'b'), entry(2, 'PM', 1, 1200345), entry(2, 'PM', 1, 1200456, 'current', 'c'), entry(2, 'Z2', 16, 42), entry(2, 'P', 15, 99), entry(2, 'M', 10, 88)];
const matrices = [{ matrix_id: 'a', name: 'Matriks latihan', scenario: 'current' }, { matrix_id: 'b', name: 'Usulan latihan', scenario: 'proposed' }];

test('separate groups use numeric ordering, merged headers, standard categories and actual extras without mutation', () => {
  const before = JSON.stringify({ data, matrices });
  const grid = U.matrixGrid(data, 'current', matrices, '2025–2026');
  const tables = tags(grid, 'table');
  assert.deepEqual(tags(grid, 'caption').map(node => node.textContent), ['KELOMPOK GAJI 2', 'KELOMPOK GAJI 10']);
  for (const table of tables) {
    const headers = tags(table, 'thead')[0];
    assert.equal(tags(headers, 'th')[0].attrs.rowspan, '2');
    assert.equal(tags(headers, 'th')[1].attrs.colspan, '6');
    assert.deepEqual(tags(tags(headers, 'tr')[1], 'th').map(node => node.textContent), ['PM', 'P', 'M', 'U', 'Z2', 'Z10']);
    assert.deepEqual(tags(tags(table, 'tbody')[0], 'th').map(node => node.textContent), [...Array.from({ length: 15 }, (_, i) => 'KMK' + (i + 1)), 'KMK16', 'KMK20']);
  }
  assert.match(grid.textContent, /Matriks latihan/);
  assert.match(grid.textContent, /2025–2026/);
  assert.equal(find(grid, node => node.className === 'matrix-blocks')[0].attrs.tabindex, '0');
  assert.equal(JSON.stringify({ data, matrices }), before);
});

test('zero is a full Rp value, missing cells are em dashes, and duplicates retain source edit indexes and labels', () => {
  const grid = U.matrixGrid(data, 'current', matrices, '');
  const buttons = tags(grid, 'button');
  assert.equal(buttons.length, 7);
  assert.deepEqual(buttons.map(node => Number(node.dataset.index)).sort((a, b) => a - b), [0, 1, 3, 4, 5, 6, 7]);
  const zero = buttons.find(node => node.dataset.index === '1');
  assert.equal(zero.textContent, U.money(0));
  assert.match(buttons.find(node => node.dataset.index === '0').textContent, /1\.234\.567/);
  const firstRow = tags(tags(tags(grid, 'table')[0], 'tbody')[0], 'tr')[0];
  assert.equal(tags(firstRow, 'td')[1].textContent, '—');
  const duplicates = tags(tags(firstRow, 'td')[0], 'button');
  assert.deepEqual(duplicates.map(node => node.dataset.index), ['3', '4']);
  duplicates.forEach((node, index) => {
    assert.match(node.attrs['aria-label'], /Edit golongan 2PM1/);
    assert.match(node.textContent, new RegExp('Entri ' + (index + 1)));
    assert.equal(node.dataset.action, 'edit');
    assert.equal(node.dataset.collection, 'matrixEntries');
  });
});

test('scenario selection excludes other entries, and empty scenarios offer CRUD/import without invented groups', () => {
  const grid = U.matrixGrid(data, 'proposed', matrices, '2026–2027');
  assert.deepEqual(tags(grid, 'caption').map(node => node.textContent), ['KELOMPOK GAJI 2']);
  assert.deepEqual(tags(grid, 'button').map(node => node.dataset.index), ['2']);
  assert.match(grid.textContent, /Usulan latihan/);
  assert.doesNotMatch(grid.textContent, /Matriks latihan/);
  const empty = U.matrixGrid(data.filter(item => item.scenario === 'current'), 'proposed', matrices, '');
  assert.equal(tags(empty, 'table').length, 0);
  assert.deepEqual(tags(empty, 'button').map(node => node.dataset.action), ['edit', 'import']);
  assert.match(empty.textContent, /Belum ada entri matriks/);
  assert.equal(tags(U.matrixGrid([], 'current', [], ''), 'table').length, 0);
});

test('app defaults to grid, keeps metadata collapsed and list controls, and dispatches exact duplicate record to editor', () => {
  const workspace = globalThis.Caroll.createWorkspace();
  workspace.matrixEntries = structuredClone(data);
  workspace.matrices = [...structuredClone(matrices), { matrix_id: 'c', name: 'Variante latihan', scenario: 'current' }];
  const before = JSON.stringify(workspace);
  const nodes = new Map(['main', 'navigation', 'workspace-name', 'save-status'].map(id => [id, new FakeNode()]));
  const listeners = {};
  let edited;
  const ui = { ...U, toast(message) { throw new Error(message); }, close() {}, confirm(title, body, callback) { callback(); }, form(title, schema, record) { edited = { title, record }; } };
  const C = { ...globalThis.Caroll, ui, sampleWorkspace: () => workspace, validate: () => [], calculatePayroll() {}, change() {}, csv: Object.fromEntries(['parse', 'stringify', 'exportWorkspace', 'importWorkspace', 'exportEmployees', 'previewEmployees', 'previewMatrix', 'exportMatrix', 'exportResults'].map(key => [key, () => {}])) };
  const document = { ...globalThis.document, getElementById: id => nodes.get(id), querySelector: () => new FakeNode(), addEventListener: (name, handler) => { listeners[name] = handler; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/app.js'), 'utf8'), { Caroll: C, document, window: { addEventListener() {} }, console });
  const click = dataset => listeners.click({ target: { closest: () => ({ dataset }) } });
  click({ action: 'sample' });
  click({ action: 'navigate', section: 'matrix' });
  const main = nodes.get('main');
  assert.equal(tags(main, 'table').filter(node => node.className === 'matrix-group').length, 2);
  assert.equal(tags(main, 'details').length, 1);
  assert.equal(tags(main, 'details')[0].attrs.open, undefined);
  assert.ok(!tags(main, 'button').some(node => node.className === 'matrix-salary' && node.dataset.index === '4'));
  listeners.change({ target: { matches: () => true, dataset: { filter: 'matrixId' }, value: 'c' } });
  const duplicate = tags(main, 'button').find(node => node.dataset.collection === 'matrixEntries' && node.dataset.index === '4');
  click(duplicate.dataset);
  assert.equal(edited.title, 'Edit entri matriks');
  assert.deepEqual(JSON.parse(JSON.stringify(edited.record)), data[4]);
  const change = (filter, value) => listeners.change({ target: { matches: () => true, dataset: { filter }, value } });
  change('scenario', 'proposed');
  assert.deepEqual(tags(main, 'button').filter(node => node.className === 'matrix-salary').map(node => node.dataset.index), ['2']);
  change('matrixView', 'list');
  assert.equal(find(main, node => node.className === 'matrix-group').length, 0);
  assert.ok(tags(main, 'button').some(node => node.dataset.action === 'duplicate' && node.dataset.index === '2'));
  assert.ok(tags(main, 'button').some(node => node.dataset.action === 'delete' && node.dataset.collection === 'matrixEntries'));
  assert.equal(JSON.stringify(workspace), before);
});

test('employee validation is summarized, expands scoped issues and links to repairs', () => {
  const workspace = globalThis.Caroll.sampleWorkspace();
  const employee = workspace.employees[0];
  const issues = [
    { severity: 'error', employee_id: employee.employee_id, employee_name: employee.name, message: 'Unresolved current basic salary' },
    { severity: 'warning', employee_id: employee.employee_id, employee_name: employee.name, message: 'Pilih skema PPh current' },
    { severity: 'error', message: 'Isi masa pajak current' }
  ];
  const nodes = new Map(['main', 'navigation', 'workspace-name', 'save-status'].map(id => [id, new FakeNode()]));
  const listeners = {}; let dialog, edited, closed = 0;
  const ui = { ...U, toast() {}, close() { closed++; }, confirm(t, b, accept) { accept(); }, dialog(title, body) { dialog = { title, body }; }, form(title, schema, record) { edited = record; } };
  const C = { ...globalThis.Caroll, ui, sampleWorkspace: () => workspace, validate: () => issues, csv: {} };
  const document = { ...globalThis.document, getElementById: id => nodes.get(id), querySelector: () => new FakeNode(), addEventListener: (name, handler) => { listeners[name] = handler; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/app.js'), 'utf8'), { Caroll: C, document, window: { addEventListener() {} }, console });
  const click = dataset => listeners.click({ target: { closest: () => ({ dataset }) } });
  click({ action: 'sample' }); click({ action: 'navigate', section: 'employees' });
  const actionButtons = tags(nodes.get('main'), 'button').filter(n => n.dataset.action === 'employee-actions');
  assert.equal(actionButtons.length, workspace.employees.length);
  assert.equal(actionButtons[0].textContent, '…');
  assert.match(actionButtons[0].attrs['aria-label'], new RegExp(employee.name));
  assert.equal(tags(nodes.get('main'), 'button').filter(n => ['duplicate', 'delete'].includes(n.dataset.action)).length, 0);
  click(actionButtons[0].dataset);
  assert.match(dialog.title, new RegExp(employee.employee_id));
  assert.deepEqual(tags(dialog.body, 'button').map(n => n.dataset.action), ['edit', 'duplicate', 'delete']);
  click(tags(dialog.body, 'button')[0].dataset);
  assert.equal(edited.employee_id, employee.employee_id);
  const counts = tags(nodes.get('main'), 'button').filter(n => n.dataset.action === 'employee-validation');
  assert.equal(counts.length, 2);
  assert.match(counts[0].textContent, /2 masalah · 1 kesalahan · 1 peringatan/);
  assert.doesNotMatch(nodes.get('main').textContent, /Isi masa pajak current/);
  click(counts[0].dataset);
  assert.match(dialog.title, new RegExp(employee.employee_id));
  assert.match(dialog.title, new RegExp(employee.name));
  assert.equal(tags(dialog.body, 'li').length, 2);
  const links = tags(dialog.body, 'button');
  click(links.find(n => n.dataset.action === 'edit').dataset);
  assert.equal(edited.employee_id, employee.employee_id);
  const before = closed;
  click(links.find(n => n.dataset.section === 'matrix').dataset);
  assert.ok(closed > before);
  assert.match(nodes.get('main').textContent, /Matriks gaji/);
  click({ action: 'employee-validation' });
  assert.equal(tags(dialog.body, 'li').length, 3);
});

test('employee editing preserves inert legacy tax data without manual controls or badges', () => {
  const workspace = globalThis.Caroll.sampleWorkspace();
  Object.assign(workspace.employees[0], { pph_rate: '0.123456789', pph_fixed_override: 123456, pph_method: 'net' });
  const nodes = new Map(['main', 'navigation', 'workspace-name', 'save-status'].map(id => [id, new FakeNode()]));
  const listeners = {};
  let edited;
  const ui = { ...U, toast() {}, close() {}, confirm(title, body, callback) { callback(); }, form(title, schema, record, save) { edited = { schema, record, save }; } };
  const C = { ...globalThis.Caroll, ui, sampleWorkspace: () => workspace, validate: () => [], csv: Object.fromEntries(['parse', 'stringify', 'exportWorkspace', 'importWorkspace', 'exportEmployees', 'previewEmployees', 'previewMatrix', 'exportMatrix', 'exportResults'].map(key => [key, () => {}])) };
  const document = { ...globalThis.document, getElementById: id => nodes.get(id), querySelector: () => new FakeNode(), addEventListener: (name, handler) => { listeners[name] = handler; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/app.js'), 'utf8'), { Caroll: C, document, window: { addEventListener() {} }, console });
  const click = dataset => listeners.click({ target: { closest: () => ({ dataset }) } });
  click({ action: 'sample' });
  click({ action: 'navigate', section: 'employees' });
  assert.equal(find(nodes.get('main'), n => n.className?.includes('badge') && n.textContent === 'Manual').length, 0);
  click({ action: 'edit', collection: 'employees', index: '0' });
  assert.ok(!edited.schema.some(s => ['pph_rate', 'pph_fixed_override'].includes(s.key)));
  const current = edited.schema.find(s => s.key === 'current_golongan');
  const proposed = edited.schema.find(s => s.key === 'proposed_golongan');
  assert.equal(current.readonly, true);
  assert.equal(proposed.readonly, true);
  assert.equal(current.list, undefined);
  assert.equal(edited.record.current_salary_group, '1');
  assert.equal(edited.record.current_professional_category, 'U');
  assert.equal(edited.record.current_kmk_level, '1');
  assert.match(edited.schema.find(s => s.key === 'proposed_salary_group').options[0][1], /Ikuti golongan saat ini/);
  assert.deepEqual(Array.from(edited.schema.find(s => s.key === 'current_professional_category').options, option => option[0]), ['', 'U']);
  const patch = Object.fromEntries(edited.schema.map(s => [s.key, edited.record[s.key] ?? s.default ?? '']));
  patch.name = 'Edited employee';
  assert.throws(() => edited.save({ ...patch, current_salary_group: '9' }), /Pilih golongan/);
  assert.throws(() => edited.save({ ...patch, current_kmk_level: '' }), /Lengkapi KG/);
  edited.save(patch);
  click({ action: 'edit', collection: 'employees', index: '0' });
  assert.equal(edited.record.name, 'Edited employee');
  assert.equal(edited.record.pph_rate, '0.123456789');
  assert.equal(edited.record.pph_fixed_override, 123456);
  assert.equal(edited.record.pph_method, 'net');
  workspace.matrixEntries = workspace.matrixEntries.filter(e => e.scenario === 'current');
  click({ action: 'sample' });
  click({ action: 'edit', collection: 'employees', index: '0' });
  assert.equal(edited.schema.find(s => s.key === 'current_salary_group').type, 'select');
  assert.equal(edited.schema.find(s => s.key === 'proposed_golongan').type, 'text');
});

test('issues show employee ID and name with safe missing-data fallbacks', () => {
  const view = U.issues([
    { severity: 'error', employee_id: '001', employee_name: '<Nama & Karyawan>', message: 'Invalid input' },
    { severity: 'warning', employee_name: 'Tanpa ID', message: 'Missing ID' },
    { severity: 'error', employee_id: '002', message: 'Missing name' },
    { severity: 'error', message: 'Global error' }
  ]);
  const lines = tags(view, 'li').map(n => n.textContent);
  assert.match(lines[0], /001 · <Nama & Karyawan>/);
  assert.match(lines[1], /ID belum diisi · Tanpa ID/);
  assert.match(lines[2], /002 · Nama belum tersedia/);
  assert.equal(lines[3], 'Kesalahan — Global error');
});

function mountTypes() {
  const workspace = globalThis.Caroll.sampleWorkspace();
  const base = workspace.matrices.find(m => m.scenario === 'current');
  const proposed = workspace.matrices.find(m => m.scenario === 'proposed');
  base.generator_settings = '[{"base_salary":123}]';
  for (const scenario of ['current', 'proposed']) {
    workspace.matrices.push({ matrix_id: 'admin-' + scenario, scenario, matrix_type: 'admin', name: 'Admin', generator_settings: '[]' });
    workspace.matrixEntries.push({ ...workspace.matrixEntries.find(e => e.scenario === scenario), matrix_id: 'admin-' + scenario, basic_salary: 9000000 });
  }
  workspace.employees[0].current_basic_override = 0;
  workspace.employees[0].proposed_basic_override = 42;
  const nodes = new Map(['main', 'navigation', 'workspace-name', 'save-status'].map(id => [id, new FakeNode()]));
  const listeners = {}; const capture = { workspace };
  const ui = { ...U, toast(message) { capture.toast = message; }, close() {}, confirm(title, body, accept) { capture.confirm = { title, body, accept }; }, form(title, schema, record, save, extra, ready) { capture.form = { title, schema, record, save, extra, ready }; } };
  const C = { ...globalThis.Caroll, ui, sampleWorkspace: () => workspace, validate(w) { capture.workspace = w; return []; }, csv: Object.fromEntries(['parse', 'stringify', 'exportWorkspace', 'importWorkspace', 'exportEmployees', 'previewEmployees', 'previewMatrix', 'exportMatrix', 'exportResults'].map(key => [key, () => {}])) };
  const document = { ...globalThis.document, getElementById: id => nodes.get(id), querySelector: () => new FakeNode(), addEventListener: (name, handler) => { listeners[name] = handler; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/app.js'), 'utf8'), { Caroll: C, document, window: { addEventListener() {} }, console });
  const click = dataset => listeners.click({ target: { closest: () => ({ dataset }) } });
  const change = (filter, value) => listeners.change({ target: { matches: () => true, dataset: { filter }, value } });
  click({ action: 'sample' }); capture.confirm.accept();
  return { capture, nodes, click, change, base, proposed };
}

for (const scenario of ['current', 'proposed']) {
  for (const override of [2500000, 0, '']) {
    test('editing missing ' + scenario + ' matrix cell with ' + (override === '' ? 'no override rejects' : override + ' override preserves code and permits notes edit'), () => {
      const { capture, click } = mountTypes();
      const employee = capture.workspace.employees[0];
      const code = globalThis.Caroll.golongan(99, 'U', 99);
      employee[scenario + '_matrix_type'] = 'regular';
      employee[scenario + '_golongan'] = code;
      employee[scenario + '_basic_override'] = override;
      const parent = capture.workspace.matrices.find(m => m.scenario === scenario && m.matrix_type === 'regular');
      const entries = capture.workspace.matrixEntries.filter(e => e.matrix_id === parent.matrix_id);
      assert.ok(entries.length > 0, 'availability guard must see a nonempty selected matrix');
      assert.ok(entries.every(e => e.golongan !== code), 'employee code must reference a missing cell');
      const before = structuredClone(capture.workspace);
      click({ action: 'edit', collection: 'employees', index: '0' });
      const { schema, record, save } = capture.form;
      assert.equal(record[scenario + '_golongan'], code);
      assert.equal(record[scenario + '_salary_group'], '99');
      assert.equal(record[scenario + '_professional_category'], 'U');
      assert.equal(record[scenario + '_kmk_level'], '99');
      const patch = Object.fromEntries(schema.map(spec => [spec.key, record[spec.key] ?? spec.default ?? '']));
      patch.notes = 'Notes-only edit with missing matrix cell';
      if (override === '') {
        assert.throws(() => save(patch), /Pilih golongan yang tersedia/);
        assert.deepEqual(capture.workspace, before);
      } else {
        assert.doesNotThrow(() => save(patch));
        const expected = structuredClone(before);
        expected.employees[0].notes = patch.notes;
        assert.deepEqual(JSON.parse(JSON.stringify(capture.workspace)), expected);
        click({ action: 'edit', collection: 'employees', index: '0' });
        assert.equal(capture.form.record[scenario + '_golongan'], code);
        assert.equal(capture.form.record[scenario + '_basic_override'], override);
        assert.equal(capture.form.record.notes, patch.notes);
      }
    });
  }
}

function employeeInputs(form) {
  const inputs = Object.fromEntries(form.schema.map(spec => {
    const node = new FakeNode();
    node.value = String(form.record[spec.key] ?? spec.default ?? '');
    return [spec.key, node];
  }));
  form.ready({ elements: { namedItem: key => inputs[key] } });
  const values = () => Object.fromEntries(form.schema.map(spec => {
    const value = inputs[spec.key].value;
    return [spec.key, spec.type === 'number' && value !== '' ? Number(value) : spec.type === 'checkbox' ? Boolean(form.record[spec.key]) : value];
  }));
  return { inputs, values };
}

for (const scenario of ['current', 'proposed']) {
  for (const override of ['0', '7500000']) {
    for (const partial of [false, true]) {
      test(scenario + ' manual override ' + override + ' saves edited text with ' + (partial ? 'partial' : 'populated') + ' stale dimensions', () => {
        const { capture, click } = mountTypes();
        capture.workspace.employees[0][scenario + '_basic_override'] = '';
        click({ action: 'edit', collection: 'employees', index: '0' });
        const form = capture.form;
        const { inputs, values } = employeeInputs(form);
        const code = inputs[scenario + '_golongan'];
        const salary = inputs[scenario + '_basic_override'];
        assert.equal(code.readOnly, true);
        if (partial) inputs[scenario + '_kmk_level'].value = '';
        salary.value = override;
        salary.listeners.input();
        assert.equal(code.readOnly, false);
        for (const dimension of ['salary_group', 'professional_category', 'kmk_level']) assert.equal(inputs[scenario + '_' + dimension].disabled, true);
        const before = structuredClone(capture.workspace);
        code.value = 'not-a-code';
        assert.throws(() => form.save(values()), /Format golongan tidak valid/);
        assert.deepEqual(capture.workspace, before);
        code.value = '99-U99';
        salary.listeners.change();
        form.save(values());
        assert.equal(capture.workspace.employees[0][scenario + '_golongan'], '99-U99');
        assert.equal(capture.workspace.employees[0][scenario + '_basic_override'], Number(override));
        assert.equal(capture.workspace.employees[0][scenario + '_salary_group'], undefined);
      });
    }
  }

  test(scenario + ' clearing override resets stale dimensions and requires a fresh matrix selection', () => {
    const { capture, click } = mountTypes();
    click({ action: 'edit', collection: 'employees', index: '0' });
    const form = capture.form;
    const { inputs, values } = employeeInputs(form);
    inputs[scenario + '_golongan'].value = '99-U99';
    inputs[scenario + '_basic_override'].value = '';
    inputs[scenario + '_basic_override'].listeners.input();
    inputs[scenario + '_basic_override'].listeners.change();
    assert.equal(inputs[scenario + '_golongan'].readOnly, true);
    for (const dimension of ['salary_group', 'professional_category', 'kmk_level', 'golongan']) assert.equal(inputs[scenario + '_' + dimension].value, '');
    assert.equal(inputs[scenario + '_salary_group'].disabled, false);
    assert.equal(inputs[scenario + '_professional_category'].disabled, true);
    assert.equal(inputs[scenario + '_kmk_level'].disabled, true);
    if (scenario === 'current') assert.throws(() => form.save(values()), /Golongan saat ini wajib/);
    const entry = capture.workspace.matrixEntries.find(e => e.scenario === scenario && e.matrix_id === capture.workspace.matrices.find(m => m.scenario === scenario && m.matrix_type === 'regular').matrix_id);
    inputs[scenario + '_salary_group'].value = String(entry.salary_group);
    inputs[scenario + '_salary_group'].listeners.change();
    assert.throws(() => form.save(values()), /Lengkapi KG/);
    inputs[scenario + '_professional_category'].value = entry.professional_category;
    inputs[scenario + '_professional_category'].listeners.change();
    inputs[scenario + '_kmk_level'].value = String(entry.kmk_level);
    inputs[scenario + '_kmk_level'].listeners.change();
    form.save(values());
    assert.equal(capture.workspace.employees[0][scenario + '_golongan'], entry.golongan);
    assert.equal(capture.workspace.employees[0][scenario + '_basic_override'], '');
  });
}

test('empty matrix manual mode ignores partial stale dimensions and stays editable when override is cleared', () => {
  const { capture, click } = mountTypes();
  capture.workspace.matrixEntries = [];
  click({ action: 'edit', collection: 'employees', index: '0' });
  const form = capture.form;
  const { inputs, values } = employeeInputs(form);
  inputs.current_kmk_level.value = '';
  inputs.current_golongan.value = '99-U99';
  inputs.current_basic_override.value = '';
  inputs.current_basic_override.listeners.input();
  assert.equal(inputs.current_golongan.readOnly, false);
  form.save(values());
  assert.equal(capture.workspace.employees[0].current_golongan, '99-U99');
});

for (const scenario of ['current', 'proposed']) {
  test('copy rejects empty ' + scenario + ' source without erasing target or changing selection', () => {
    const { capture, nodes, click, change } = mountTypes();
    const source = capture.workspace.matrices.find(m => m.scenario === scenario && m.matrix_type === 'regular');
    capture.workspace.matrixEntries = capture.workspace.matrixEntries.filter(e => e.matrix_id !== source.matrix_id);
    click({ action: 'navigate', section: 'matrix' });
    change('scenario', scenario); change('matrixType', 'regular');
    const before = structuredClone(capture.workspace);
    const view = nodes.get('main').textContent;
    const status = nodes.get('save-status').textContent;
    capture.confirm = null;
    click({ action: 'copy-matrix' });
    assert.equal(capture.confirm, null);
    assert.match(capture.toast, /sumber kosong/);
    assert.deepEqual(capture.workspace, before);
    assert.equal(nodes.get('main').textContent, view);
    assert.equal(nodes.get('save-status').textContent, status);
  });
}

test('selected type grid keeps original indexes and copy only replaces matching target type/settings after confirmation', () => {
  const { capture, nodes, click, change, base, proposed } = mountTypes();
  click({ action: 'navigate', section: 'matrix' }); change('matrixType', 'regular');
  const before = structuredClone(capture.workspace);
  const expected = before.matrixEntries.flatMap((e, i) => e.matrix_id === base.matrix_id ? [String(i)] : []);
  assert.deepEqual(tags(nodes.get('main'), 'button').filter(n => n.className === 'matrix-salary').map(n => n.dataset.index).sort(), expected.sort());
  click({ action: 'copy-matrix' });
  assert.deepEqual(capture.workspace, before);
  assert.match(capture.confirm.body.textContent, /regular/);
  capture.confirm.accept();
  const w = capture.workspace;
  assert.deepEqual(JSON.parse(JSON.stringify(w.employees)), before.employees);
  assert.deepEqual(JSON.parse(JSON.stringify(w.matrixEntries.filter(e => e.matrix_id.startsWith('admin-')))), before.matrixEntries.filter(e => e.matrix_id.startsWith('admin-')));
  assert.equal(w.matrices.find(m => m.matrix_id === proposed.matrix_id).generator_settings, base.generator_settings);
  assert.equal(w.matrixEntries.filter(e => e.matrix_id === proposed.matrix_id).length, expected.length);
});

test('bulk type assignment uses filtered employee indexes, confirms scenario/type/count, preserves all overrides and marks dirty', () => {
  const { capture, nodes, click, change } = mountTypes();
  click({ action: 'navigate', section: 'employees' });
  change('search', capture.workspace.employees[0].employee_id);
  const before = structuredClone(capture.workspace);
  click({ action: 'bulk-matrix-type' });
  capture.form.save({ scenario: 'proposed', matrix_type: 'admin' });
  assert.match(capture.confirm.body.textContent, /1 karyawan · proposed · admin/);
  assert.deepEqual(capture.workspace, before);
  capture.confirm.accept();
  const expected = structuredClone(before.employees); expected[0].proposed_matrix_type = 'admin';
  assert.deepEqual(JSON.parse(JSON.stringify(capture.workspace.employees)), expected);
  assert.equal(nodes.get('save-status').textContent, 'Belum disimpan');
  change('proposed_matrix_type', 'regular');
  assert.match(nodes.get('main').textContent, /0 dari/);
});

test('employee type cascades reset KG/prof/KMK and proposed blank follows current independently', () => {
  const { capture, click } = mountTypes();
  capture.workspace.employees[0].current_basic_override = '';
  capture.workspace.employees[0].proposed_basic_override = '';
  click({ action: 'edit', collection: 'employees', index: '0' });
  const { schema, record, ready } = capture.form;
  assert.deepEqual(Array.from(schema.find(s => s.key === 'current_matrix_type').options, o => o[0]), ['', 'admin', 'regular']);
  const inputs = Object.fromEntries(schema.map(s => { const n = new FakeNode(); n.value = String(record[s.key] ?? s.default ?? ''); return [s.key, n]; }));
  inputs.proposed_matrix_type.value = '';
  ready({ elements: { namedItem: key => inputs[key] } });
  inputs.current_matrix_type.value = 'admin'; inputs.current_matrix_type.listeners.change();
  for (const scenario of ['current', 'proposed']) for (const dim of ['salary_group', 'professional_category', 'kmk_level', 'golongan']) assert.equal(inputs[scenario + '_' + dim].value, '');
  inputs.current_salary_group.value = '1'; inputs.current_salary_group.listeners.change();
  assert.deepEqual(tags(inputs.current_professional_category, 'option').map(n => n.attrs.value), ['', 'U']);
  inputs.current_professional_category.value = 'U'; inputs.current_professional_category.listeners.change();
  inputs.current_kmk_level.value = '1'; inputs.current_kmk_level.listeners.change();
  assert.equal(inputs.current_golongan.value, globalThis.Caroll.golongan(1, 'U', 1));
});

test('generator isolates exact identity, auto-creates selected type and keeps employee overrides', () => {
  for (const autoCreate of [false, true]) {
    const { capture, nodes, click, change } = mountTypes();
    if (autoCreate) {
      capture.workspace.matrices = capture.workspace.matrices.filter(m => m.matrix_id !== 'admin-proposed');
      capture.workspace.matrixEntries = capture.workspace.matrixEntries.filter(e => e.matrix_id !== 'admin-proposed');
    }
    click({ action: 'navigate', section: 'matrix' }); change('scenario', 'proposed'); change('matrixType', 'admin');
    const before = structuredClone(capture.workspace);
    const form = tags(nodes.get('main'), 'form')[0];
    const values = Object.fromEntries(tags(form, 'input').map(n => [n.attrs.name, n]));
    for (const [key, node] of Object.entries(values)) node.value = key.startsWith('base_') ? '1000000' : '0';
    form.elements = { namedItem: key => values[key] };
    form.listeners.submit({ preventDefault() {} });
    assert.match(capture.confirm.title, /Pratinjau matriks/);
    assert.deepEqual(capture.workspace, before);
    capture.confirm.accept();
    const w = capture.workspace;
    const target = w.matrices.find(m => m.scenario === 'proposed' && m.matrix_type === 'admin');
    assert.equal(w.matrixEntries.filter(e => e.matrix_id === target.matrix_id).length, 300);
    assert.deepEqual(JSON.parse(JSON.stringify(w.matrixEntries.filter(e => e.matrix_id !== target.matrix_id))), before.matrixEntries.filter(e => e.matrix_id !== target.matrix_id));
    assert.deepEqual(JSON.parse(JSON.stringify(w.employees)), before.employees);
  }
});

test('custom identity type is normalized, unique per scenario/type and selected after creation', () => {
  const { capture, nodes, click } = mountTypes();
  click({ action: 'navigate', section: 'matrix' });
  click({ action: 'edit', collection: 'matrices' });
  const save = capture.form.save;
  const value = { matrix_id: 'custom', name: 'Custom', scenario: 'current', matrix_type: 'Shift_A-2', effective_date: '' };
  assert.throws(() => save({ ...value, matrix_type: '9bad' }), /Jenis matriks/);
  assert.throws(() => save({ ...value, matrix_type: 'REGULAR' }), /sudah ada/);
  save(value);
  assert.equal(capture.workspace.matrices.at(-1).matrix_type, 'shift_a-2');
  assert.equal(find(nodes.get('main'), n => n.dataset.filter === 'matrixType')[0].value, 'shift_a-2');
  assert.equal(find(nodes.get('main'), n => n.dataset.filter === 'matrixId')[0].value, 'custom');
});

test('percentage adjustment only changes selected identity and preserves salary overrides', () => {
  const { capture, click, change } = mountTypes();
  click({ action: 'navigate', section: 'matrix' }); change('matrixType', 'admin');
  const before = structuredClone(capture.workspace);
  click({ action: 'adjust-matrix' });
  assert.match(capture.form.title, /admin-current/);
  capture.form.save({ rate: '0.1', rounding: 1 }, { querySelectorAll: selector => [{ value: selector.includes('group') ? '1' : 'U' }] });
  assert.deepEqual(capture.workspace, before);
  capture.confirm.accept();
  assert.deepEqual(JSON.parse(JSON.stringify(capture.workspace.employees)), before.employees);
  assert.deepEqual(JSON.parse(JSON.stringify(capture.workspace.matrixEntries.filter(e => e.matrix_id !== 'admin-current'))), before.matrixEntries.filter(e => e.matrix_id !== 'admin-current'));
  assert.equal(capture.workspace.matrixEntries.find(e => e.matrix_id === 'admin-current').basic_salary, 9900000);
});

test('invalid legacy PTKP is visible rather than silently replaced by a valid default', () => {
  const node = U.field(U.schemas.employees.find(s => s.key === 'ptkp_status'), 'K/9');
  assert.equal(tags(node, 'select')[0].value, 'K/9');
  assert.match(node.textContent, /Tidak valid \(legacy\): K\/9/);
});

test('payroll breakdown action opens dialog without isOverride error and shows override notice when present', () => {
  const workspace = globalThis.Caroll.sampleWorkspace();
  workspace.componentDefinitions[0] = { ...workspace.componentDefinitions[0], code: 'TUNJ_ANAK', name: 'Tunjangan anak', calculation_type: 'percentage_basic', default_value: '0.05' };
  workspace.employeeComponents.forEach(assignment => { assignment.component_code = 'TUNJ_ANAK'; assignment.current_value = 505542; assignment.proposed_value = 505542; });
  workspace.employees[0].ptkp_status = 'K/2';
  const nodes = new Map(['main', 'navigation', 'workspace-name', 'save-status'].map(id => [id, new FakeNode()]));
  const listeners = {};
  let dialogOpened = null;
  const ui = {
    ...U,
    toast() {},
    close() {},
    dialog(title, body) { dialogOpened = { title, body }; },
    confirm(title, body, callback) { callback(); }
  };
  const C = {
    ...globalThis.Caroll,
    ui,
    sampleWorkspace: () => workspace,
    csv: Object.fromEntries(['parse', 'stringify', 'exportWorkspace', 'importWorkspace', 'exportEmployees', 'previewEmployees', 'previewMatrix', 'exportMatrix', 'exportResults'].map(key => [key, () => {}]))
  };
  const document = { ...globalThis.document, getElementById: id => nodes.get(id), querySelector: () => new FakeNode(), addEventListener: (name, handler) => { listeners[name] = handler; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/app.js'), 'utf8'), { Caroll: C, document, window: { addEventListener() {} }, console });
  const click = dataset => listeners.click({ target: { closest: () => ({ dataset }) } });

  click({ action: 'sample' });
  click({ action: 'calculate' });

  // 1. Without basic salary override
  click({ action: 'breakdown', id: 'DEMO-001' });
  assert.ok(dialogOpened);
  assert.match(dialogOpened.title, /Rincian · Demo Employee One/);
  assert.ok(!dialogOpened.body.textContent.includes('OVERRIDE GAJI POKOK'));
  assert.ok(dialogOpened.body.textContent.includes('Tunjangan anak'));
  assert.ok(dialogOpened.body.textContent.includes('2 anak'));
  assert.ok(dialogOpened.body.textContent.includes('Rp'));

  // 2. With basic salary override
  workspace.employees[0].current_basic_override = 5000000;
  click({ action: 'calculate' });
  click({ action: 'breakdown', id: 'DEMO-001' });
  assert.ok(dialogOpened.body.textContent.includes('OVERRIDE GAJI POKOK'));
});

test('creating an employee with basic salary override succeeds when matrix entries are empty', () => {
  const workspace = globalThis.Caroll.sampleWorkspace();
  workspace.matrixEntries = [];
  workspace.employees = [];
  const nodes = new Map(['main', 'navigation', 'workspace-name', 'save-status'].map(id => [id, new FakeNode()]));
  const listeners = {};
  let edited = null;
  const capture = {};
  const ui = {
    ...U,
    toast() {},
    close() {},
    confirm(title, body, callback) { callback(); },
    form(title, schema, record, save, extra, ready) { edited = { schema, record, save, ready }; }
  };
  const C = {
    ...globalThis.Caroll,
    ui,
    sampleWorkspace: () => workspace,
    validate: (w) => { capture.workspace = w; return []; },
    csv: Object.fromEntries(['parse', 'stringify', 'exportWorkspace', 'importWorkspace', 'exportEmployees', 'previewEmployees', 'previewMatrix', 'exportMatrix', 'exportResults'].map(key => [key, () => {}]))
  };
  const document = { ...globalThis.document, getElementById: id => nodes.get(id), querySelector: () => new FakeNode(), addEventListener: (name, handler) => { listeners[name] = handler; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/app.js'), 'utf8'), { Caroll: C, document, window: { addEventListener() {} }, console });
  const click = dataset => listeners.click({ target: { closest: () => ({ dataset }) } });

  click({ action: 'sample' });
  click({ action: 'edit', collection: 'employees' });

  // Because matrix entries are empty, golongan field should not be readonly
  const currentGolonganSpec = edited.schema.find(s => s.key === 'current_golongan');
  assert.equal(currentGolonganSpec.readonly, false);

  // Saving an active employee with override and explicit format-validated Golongan succeeds
  edited.save({
    employee_id: 'OVERRIDE-01',
    name: 'Override Employee',
    active: true,
    current_matrix_type: 'regular',
    proposed_matrix_type: 'regular',
    current_basic_override: 7500000,
    proposed_basic_override: 8000000,
    current_golongan: '1-U1',
    proposed_golongan: '1-U1',
    tax_category: 'permanent',
    tax_residency: 'domestic',
    tax_period_type: 'ordinary',
    tax_payment_scope: 'monthly',
    ptkp_status: 'TK/0',
    bpjs_kesehatan: true,
    bpjs_ketenagakerjaan: true
  });

  assert.equal(capture.workspace.employees.length, 1);
  assert.equal(capture.workspace.employees[0].employee_id, 'OVERRIDE-01');
  assert.equal(capture.workspace.employees[0].current_golongan, '1-U1');
  assert.equal(capture.workspace.employees[0].current_basic_override, 7500000);
});
