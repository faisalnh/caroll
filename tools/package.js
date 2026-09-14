'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const APP_VERSION = '0.1.0';
const ROOT = path.resolve(__dirname, '..');
const ENTRY = 'index.html';
const STYLE_ORDER = ['css/app.css', 'css/print.css'];
const SCRIPT_ORDER = [
  'js/state.js',
  'js/matrix.js',
  'js/tax.js',
  'js/validation.js',
  'js/payroll.js',
  'js/csv.js',
  'js/ui.js',
  'js/app.js'
];
const ALLOWED_STYLES = new Set(STYLE_ORDER);
const ALLOWED_SCRIPTS = new Set(SCRIPT_ORDER);
const OUTPUT = path.join(ROOT, 'dist', `caroll-test-v${APP_VERSION}.html`);

function fail(message) {
  throw new Error(`Packaging failed: ${message}`);
}

function readAppResource(relativePath, allowed) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (!allowed.has(normalized)) fail(`resource is not on the app allowlist: ${relativePath}`);
  if (normalized.startsWith('private/') || normalized.includes('/private/')) fail(`private resource refused: ${relativePath}`);

  const absolutePath = path.resolve(ROOT, normalized);
  if (path.dirname(absolutePath) === path.resolve(ROOT, 'private') || !absolutePath.startsWith(ROOT + path.sep)) {
    fail(`resource escapes the application root: ${relativePath}`);
  }
  const source = fs.readFileSync(absolutePath, 'utf8');
  if (normalized.endsWith('.js') && /<\/script/i.test(source)) fail(`script contains an unsafe closing tag: ${relativePath}`);
  if (normalized.endsWith('.css') && /<\/style/i.test(source)) fail(`stylesheet contains an unsafe closing tag: ${relativePath}`);
  return source;
}

function sha256(source) {
  return `'sha256-${crypto.createHash('sha256').update(source, 'utf8').digest('base64')}'`;
}

function packageApp() {
  let html = fs.readFileSync(path.join(ROOT, ENTRY), 'utf8');
  const styles = [];
  const scripts = [];
  const stylePaths = [];
  const scriptPaths = [];

  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"(?:\s+media="([^"]+)")?\s*>/g, (tag, href, media) => {
    const source = `\n${readAppResource(href, ALLOWED_STYLES)}\n`;
    stylePaths.push(href);
    styles.push(source);
    return `<style${media ? ` media="${media}"` : ''}>${source}</style>`;
  });

  html = html.replace(/\s*<script\s+defer\s+src="([^"]+)"\s*><\/script>/g, (tag, src) => {
    scriptPaths.push(src);
    scripts.push(`\n${readAppResource(src, ALLOWED_SCRIPTS)}\n`);
    return '';
  });

  if (JSON.stringify(stylePaths) !== JSON.stringify(STYLE_ORDER)) fail(`stylesheet order changed: ${stylePaths.join(', ')}`);
  if (JSON.stringify(scriptPaths) !== JSON.stringify(SCRIPT_ORDER)) fail(`script order changed: ${scriptPaths.join(', ')}`);
  if (!html.includes('<span id="app-version">development</span>')) fail('app version marker is missing from index.html');

  html = html.replace('<span id="app-version">development</span>', `<span id="app-version">v${APP_VERSION}</span>`);

  const inlineScripts = scripts.map(source => `<script>${source}</script>`).join('\n');
  html = html.replace('</body>', `${inlineScripts}\n</body>`);

  const csp = [
    "default-src 'none'",
    `script-src ${scripts.map(sha256).join(' ')}`,
    `style-src ${styles.map(sha256).join(' ')}`,
    "img-src data:",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ');
  const originalCsp = /<meta http-equiv="Content-Security-Policy" content="[^"]+">/;
  if (!originalCsp.test(html)) fail('Content Security Policy meta tag is missing');
  html = html.replace(originalCsp, `<meta http-equiv="Content-Security-Policy" content="${csp}">`);

  if (/\b(?:src|href)="(?:css|js|private)\//.test(html)) fail('bundle still references a local app or private resource');
  if (html.includes("'unsafe-inline'")) fail('unsafe-inline must not appear in the bundled CSP');
  if (!html.includes("connect-src 'none'")) fail("connect-src 'none' must be preserved");

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, html, 'utf8');
  console.log(`Created ${path.relative(ROOT, OUTPUT)}`);
}

try {
  packageApp();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
