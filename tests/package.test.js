'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'dist', 'caroll-test-v0.1.0.html');

function hash(source) {
  return `'sha256-${crypto.createHash('sha256').update(source, 'utf8').digest('base64')}'`;
}

test('package script creates a self-contained, hash-authorized test release', () => {
  const result = spawnSync(process.execPath, ['tools/package.js'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const html = fs.readFileSync(OUTPUT, 'utf8');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
  assert.ok(csp, 'bundled CSP is missing');
  assert.match(csp, /connect-src 'none'/);
  assert.doesNotMatch(csp, /'unsafe-inline'|'self'/);
  assert.doesNotMatch(html, /\b(?:src|href)="(?:css|js|private)\//);
  assert.match(html, /<span id="app-version">v0\.1\.0<\/span>/);

  const styles = [...html.matchAll(/<style(?: media="([^"]+)")?>([\s\S]*?)<\/style>/g)];
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(styles.length, 2);
  assert.equal(styles[0][1], undefined);
  assert.equal(styles[1][1], 'print');
  assert.equal(scripts.length, 8);
  assert.ok(scripts[0].index > html.indexOf('</main>'), 'scripts must follow the page markup');

  for (const style of styles) assert.ok(csp.includes(hash(style[2])), 'CSP lacks an exact style hash');
  for (const script of scripts) assert.ok(csp.includes(hash(script[1])), 'CSP lacks an exact script hash');

  const markers = [
    'globalThis.Caroll = globalThis.Caroll || {}',
    'C.golongan =',
    'C.tax =',
    'C.validate =',
    'C.calculatePayroll =',
    'C.csv =',
    'C.ui =',
    "const state = { workspace: null"
  ];
  let previous = -1;
  for (const marker of markers) {
    const index = html.indexOf(marker);
    assert.ok(index > previous, `missing or out-of-order script marker: ${marker}`);
    previous = index;
  }
});
