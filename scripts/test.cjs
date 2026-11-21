'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--report')) {
  console.error('Usage: node scripts/test.cjs [--report]');
  process.exit(1);
}
const scripts = [
  'test-stats.js',
  'test-average.cjs',
  'test-audio.cjs',
  'test-backup.cjs',
  'test-review.cjs',
  'test-store.cjs',
  'test-puzzles.cjs',
  'test-challenge.cjs',
  'test-domain-regression.cjs',
  'test-app-regression.cjs',
  'test-mobile.cjs',
  'test-build.cjs'
];
const results = scripts.map(name => {
  const run = spawnSync(process.execPath, [path.join(root, 'tests', name)], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  const result = {
    name,
    passed: run.status === 0,
    exitCode: run.status,
    checks: (run.stdout?.match(/^PASS /gm) || []).length,
    stdout: run.stdout || '',
    stderr: run.stderr || '',
    error: run.error?.message
  };
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${name} (${result.checks} checks)`);
  if (!result.passed) console.error(result.stdout + result.stderr + (result.error || ''));
  return result;
});
const passed = results.every(result => result.passed);
console.log(`${results.reduce((sum, result) => sum + result.checks, 0)} checks; ${passed ? 'all suites passed' : 'one or more suites failed'}.`);

if (args.includes('--report')) {
  const output = path.join(root, 'test-results', 'local-results.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({
    at: new Date().toISOString(),
    htmlSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'starcube.html'))).digest('hex'),
    passed,
    results
  }, null, 2) + '\n');
  console.log('Report: test-results/local-results.json');
}
if (!passed) process.exitCode = 1;
