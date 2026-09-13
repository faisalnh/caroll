'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../js/state.js');
require('../js/matrix.js');
require('../js/ui.js');
const U = globalThis.Caroll.ui;

class FakeNode {
  constructor(tag = '', text = '') { this.tag = tag; this.text = text; this.children = []; this.attrs = {}; this.dataset = {}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attrs[key] = value; if (key.startsWith('data-')) this.dataset[key.slice(5)] = value; }
  addEventListener() {}
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
