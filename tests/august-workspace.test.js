'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const C = require('../js/state.js');
require('../js/payroll.js');
require('../js/csv.js');
const root = path.resolve(__dirname, '..');

// Python owns build orchestration; this helper only checks artifacts and never
// starts another build. It deliberately does not consult source paths.
function checkArtifacts(folder, configFile) {
  const file = path.join(folder, 'mws-agustus-2026-caroll-workspace.csv');
  const auditFile = path.join(folder, 'mws-agustus-2026-audit.json');
  const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
  // Suppress exceptions/diffs that could include private rows in test output.
  let ws;
  try { ws = C.csv.importWorkspace(fs.readFileSync(file, 'utf8')); }
  catch { assert.fail('Private workspace import failed'); }
  assert.equal(ws.matrices.length, 4);
  assert.equal(new Set(ws.matrices.map(m => m.scenario + ':' + C.normalizeMatrixType(m.matrix_type))).size, 4);
  assert.equal(ws.globalRules.proposed_matrix_type_defaults_current, true);
  assert.equal(ws.globalRules.tax_enabled, false);
  assert.ok(ws.employees.every(e => !e.tax_category && !e.tax_residency && !e.tax_period_type && !e.tax_payment_scope));
  assert.equal(ws.employees.length, audit.employee_count);
  const profile = JSON.parse(fs.readFileSync(configFile, "utf8")).reconciliation;
  assert.equal(ws.employees.reduce((sum, e) => sum + C.resolveBasic(ws, e, "current"), 0), profile.totals.basic);
  for (const [metric, expected] of Object.entries(profile.totals)) {
    assert.equal(audit.totals[metric].source, expected);
    assert.equal(audit.totals[metric].mapped, expected);
  }
  assert.equal(audit.mismatches.length, profile.mismatch_count);
  assert.ok(audit.mismatches.every(m => m.metric === profile.mismatch_metric && Math.abs(m.difference) === profile.mismatch_absolute_difference));
  assert.ok(audit.cell_reconciliation.every(c => c.source === c.mapped));
  const currentAdmin = ws.matrices.find(m => m.scenario === 'current' && m.matrix_type === 'admin');
  const cells = ws.matrixEntries.filter(e => e.matrix_id === currentAdmin.matrix_id);
  assert.equal(cells.length, Object.keys(audit.current_admin_evidence).length);
  assert.ok(cells.every(c => audit.current_admin_evidence[c.golongan]?.length));
  assert.ok(ws.employees.every(e => !e.current_matrix_type || C.normalizeMatrixType(e.current_matrix_type)));
  const result = C.calculatePayroll(ws);
  const unresolved = audit.unresolved_classifications.length;
  assert.equal(unresolved, audit.unresolved_count);
  assert.equal(path.basename(audit.audit_json), 'mws-agustus-2026-audit.json');
  assert.equal(path.basename(audit.results_csv), 'mws-agustus-2026-caroll-results.csv');
  assert.equal(audit.blocking_error_count, result.issues.filter(i => i.severity === 'error').length);
  if (unresolved) {
    assert.equal(result.totals, null);
    assert.ok(result.issues.some(i => i.severity === 'error'));
    let blocked = false;
    try { C.csv.exportResults(result); } catch { blocked = true; }
    assert.ok(blocked);
    assert.equal(audit.results_exported, false);
    assert.ok(!fs.existsSync(path.join(folder, 'mws-agustus-2026-caroll-results.csv')));
    assert.ok(audit.unresolved_classifications.every(e => e.candidate_evidence));
  } else {
    assert.ok(result.totals);
    assert.equal(audit.blocking_error_count, 0);
    assert.equal(audit.results_exported, true);
    const resultsFile = path.join(folder, 'mws-agustus-2026-caroll-results.csv');
    assert.ok(fs.existsSync(resultsFile));
    assert.ok(fs.readFileSync(resultsFile, 'utf8') === C.csv.exportResults(result), 'Private result export must match core output');
    for (const scenario of ['current', 'proposed']) {
      for (const [metric, key] of Object.entries({ basic: 'basic_salary', gross: 'gross', thp: 'take_home_pay' })) {
        assert.equal(result.totals[scenario][key], audit.scenario_totals[scenario][metric]);
      }
    }
  }
  try {
    const restored = C.csv.importWorkspace(C.csv.exportWorkspace(ws));
    assert.equal(restored.matrixEntries.length, ws.matrixEntries.length);
  } catch { assert.fail('Private draft round-trip failed'); }
}

if (process.argv[2] === '--check-artifacts') {
  // Never expose private assertion diffs, parse errors or rows to a test runner.
  try { checkArtifacts(process.argv[3], process.argv[4]); }
  catch { process.stderr.write('Private artifact checks failed; details suppressed.\n'); process.exitCode = 1; }
} else {
  test('August builder policy, atomic publication and private artifact regressions', { timeout: 180000 }, t => {
    const result = spawnSync('python3', [
      '-B', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_august_workspace.py', '-v'
    ], { cwd: root, encoding: 'utf8', timeout: 170000 });
    // Only relay fixed test statuses, never raw subprocess output.
    for (const line of (result.stderr || '').split('\n')) {
      const status = line.match(/^(test_[a-z_]+) \([^\n]+\) \.\.\. (ok|FAIL|ERROR|skipped)(?: |$)/);
      if (status) t.diagnostic(`${status[1]}: ${status[2]}`);
    }
    assert.equal(result.status, 0, 'August Python regressions failed (requires Python/openpyxl and Node); private output suppressed');
  });
}
