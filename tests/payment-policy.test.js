'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/state.js'); require('../js/matrix.js'); require('../js/validation.js'); require('../js/tax.js'); require('../js/payroll.js'); require('../js/csv.js');
const C = globalThis.Caroll;
function workspace() {
  const w = C.sampleWorkspace();
  w.employees = [w.employees[0]]; w.componentDefinitions = []; w.employeeComponents = [];
  w.matrixEntries.forEach(e => { e.basic_salary = 10000000; });
  w.globalRules.tax_enabled = true; w.employees[0].pph_rate = '0.1';
  w.bpjsRules = ['kesehatan', 'jht'].map(code => ({ code, tax_program: code, name: code, active: true, employee_enabled: true, employer_enabled: true, employee_rate: '0.01', employer_rate: '0.02', minimum_basis: '', maximum_basis: '', rounding: 1, basis: 'gross' }));
  return w;
}
test('independent scenarios and BPJS schemes change THP without double counting', () => {
  const w = workspace();
  Object.assign(w.globalRules, { current_pph_policy: 'gross', current_bpjs_kesehatan_policy: 'company', current_bpjs_ketenagakerjaan_policy: 'employee', proposed_pph_policy: 'gross_up', proposed_bpjs_kesehatan_policy: 'employee', proposed_bpjs_ketenagakerjaan_policy: 'company' });
  const output = C.calculatePayroll(w); assert.ok(output.totals, JSON.stringify(output.issues));
  const { current: a, proposed: b } = output.employees[0];
  assert.equal(a.gross, 10100000); assert.equal(a.bpjs_allowance, 100000); assert.equal(a.pph, 231750);
  assert.equal(a.take_home_pay, 9668250); assert.equal(a.employer_cost, 10500000);
  assert.equal(b.gross, 10364102); assert.equal(b.pph, 264102); assert.equal(b.take_home_pay, 9900000);
  assert.equal(b.employer_tax_cost, 0); assert.equal(b.employer_cost, 10764102);
  assert.equal(b.tax_allowance, 264102);
  for (const row of [a, b]) {
    assert.equal(row.employee_bpjs, 200000);
    assert.equal(row.employer_bpjs, 400000);
    assert.equal(row.breakdown.find(r => r.code === 'pph').basis_before_allowance, 10300000);
  }
  assert.equal(a.breakdown.find(r => r.code === 'jht').bpjs_allowance, 0);
  assert.equal(b.breakdown.find(r => r.code === 'jht').bpjs_allowance, 100000);
  w.globalRules.proposed_pph_policy = 'gross';
  const gross = C.calculatePayroll(w).employees[0].proposed;
  assert.equal(gross.pph, 231750); assert.equal(gross.gross, 10100000);
  assert.equal(gross.take_home_pay, 9668250); assert.equal(gross.employer_cost, 10500000);
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
  const blocked = C.calculatePayroll(restored);
  assert.equal(blocked.totals, null);
  assert.ok(blocked.issues.some(i => i.severity === 'error' && /Skema net/.test(i.message)));
  restored.globalRules.tax_enabled = false;
  assert.ok(C.calculatePayroll(restored).totals);
  assert.equal(restored.globalRules.current_bpjs_ketenagakerjaan_policy, 'employee');
  const legacy = C.csv.parse(C.csv.exportWorkspace(w)).map(row => Object.fromEntries(Object.entries(row).filter(([k]) => !Object.hasOwn(C.paymentPolicies, k))));
  const migrated = C.csv.importWorkspace(C.csv.stringify(legacy));
  for (const key of Object.keys(C.paymentPolicies)) assert.equal(migrated.globalRules[key], key.includes('_pph_') ? 'gross_up' : 'company');
  const fresh = C.createWorkspace().globalRules;
  assert.equal(fresh.current_pph_policy, 'unconfirmed'); assert.equal(fresh.current_bpjs_kesehatan_policy, 'unconfirmed'); assert.equal(fresh.current_bpjs_ketenagakerjaan_policy, 'employee');
});

test('BPJS participation uses supported programs only, never code names', () => {
  for (const code of ['kesehatan', 'KESEHATAN-custom', 'jht', 'custom']) {
    for (const tax_program of ['', undefined, null, 'other', 'custom', 'KESEHATAN']) {
      assert.equal(C.bpjsParticipation({ code, tax_program }), null);
    }
    for (const tax_program of ['kesehatan', 'jkk', 'jkm', 'jht', 'jp']) {
      assert.equal(C.bpjsParticipation({ code, tax_program }), tax_program === 'kesehatan' ? 'bpjs_kesehatan' : 'bpjs_ketenagakerjaan');
    }
  }
});

for (const tax_enabled of [true, false]) {
  test('unidentified active BPJS blocks payroll with tax_enabled=' + tax_enabled, () => {
    const w = workspace();
    w.globalRules.tax_enabled = tax_enabled;
    for (const tax_program of ['', undefined, null, 'other', 'custom']) {
      for (const code of ['kesehatan', 'custom']) {
        Object.assign(w.bpjsRules[0], { code, tax_program });
        // Identification is required even if no employee participates or shares are disabled.
        for (const enabled of [true, false]) {
          Object.assign(w.employees[0], { bpjs_kesehatan: enabled, bpjs_ketenagakerjaan: enabled });
          Object.assign(w.bpjsRules[0], { employee_enabled: enabled, employer_enabled: enabled });
          const output = C.calculatePayroll(w);
          assert.equal(output.totals, null);
          assert.deepEqual(output.employees, []);
          assert.ok(output.issues.some(i => i.severity === 'error' && /program BPJS/.test(i.message) && i.message.includes(code)));
        }
        w.bpjsRules[0].active = false;
        assert.ok(C.calculatePayroll(w).totals);
        w.bpjsRules[0].active = true;
      }
    }
  });

  test('blank/other BPJS drafts retain CSV values with tax_enabled=' + tax_enabled, () => {
    for (const tax_program of ['', 'other']) {
      const w = workspace();
      w.globalRules.tax_enabled = tax_enabled;
      Object.assign(w.bpjsRules[0], { tax_program, active: false });
      const restored = C.csv.importWorkspace(C.csv.exportWorkspace(w));
      assert.equal(restored.bpjsRules[0].tax_program, tax_program);
      assert.equal(restored.bpjsRules[0].active, false);
      assert.ok(C.calculatePayroll(restored).totals);
      restored.bpjsRules[0].active = true;
      const activeDraft = C.csv.importWorkspace(C.csv.exportWorkspace(restored));
      assert.equal(activeDraft.bpjsRules[0].tax_program, tax_program);
      assert.equal(C.calculatePayroll(activeDraft).totals, null);
    }
  });

  for (const tax_program of ['kesehatan', 'jkk', 'jkm', 'jht', 'jp']) {
    test(tax_program + ' respects participation and scenario policies regardless of code, tax_enabled=' + tax_enabled, () => {
      const w = workspace();
      w.globalRules.tax_enabled = tax_enabled;
      w.bpjsRules = [{ ...w.bpjsRules[0], tax_program }];
      const kind = tax_program === 'kesehatan' ? 'bpjs_kesehatan' : 'bpjs_ketenagakerjaan';
      const other = kind === 'bpjs_kesehatan' ? 'bpjs_ketenagakerjaan' : 'bpjs_kesehatan';
      Object.assign(w.employees[0], { [kind]: true, [other]: false });
      Object.assign(w.globalRules, { ['current_' + kind + '_policy']: 'employee', ['proposed_' + kind + '_policy']: 'company', ['current_' + other + '_policy']: 'unconfirmed' });
      let baseline;
      for (const code of ['kesehatan', 'jht', 'custom']) {
        w.bpjsRules[0].code = code;
        const output = C.calculatePayroll(w);
        assert.ok(output.totals, JSON.stringify(output.issues));
        if (baseline) assert.deepEqual(output.totals, baseline);
        baseline = output.totals;
        const { current, proposed } = output.employees[0];
        for (const row of [current, proposed]) {
          assert.equal(row.employee_bpjs, 100000);
          assert.equal(row.employer_bpjs, 200000);
        }
        assert.equal(current.bpjs_allowance, 0);
        assert.equal(proposed.bpjs_allowance, 100000);
      }
      for (const scenario of ['current', 'proposed']) {
        const key = scenario + '_' + kind + '_policy';
        const policy = w.globalRules[key];
        w.globalRules[key] = 'unconfirmed';
        assert.equal(C.calculatePayroll(w).totals, null);
        w.globalRules[key] = policy;
      }
      Object.assign(w.employees[0], { [kind]: false, [other]: true });
      const excluded = C.calculatePayroll(w);
      assert.ok(excluded.totals, JSON.stringify(excluded.issues));
      for (const scenario of ['current', 'proposed']) {
        assert.equal(excluded.employees[0][scenario].employee_bpjs, 0);
        assert.equal(excluded.employees[0][scenario].employer_bpjs, 0);
        assert.equal(excluded.employees[0][scenario].bpjs_allowance, 0);
      }
    });
  }
}
