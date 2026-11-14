'use strict';

// Use only a dedicated verification browser/profile: these tests reset StarCube data.
// node scripts/test-browser.cjs <browser-cdp-websocket-url> [suite]
// node scripts/test-browser.cjs --check
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const browserDir = path.join(__dirname, '..', 'tests', 'browser');
const suites = ['existing', 'training', 'review', 'layout', 'usability', 'theme', 'redesign', 'polish'];
const entryMarker = '(async()=>{';
const read = name => fs.readFileSync(path.join(browserDir, name), 'utf8');

function preamble(source, name) {
  const boundary = source.indexOf(entryMarker);
  if (boundary < 0) throw new Error('Missing browser test entry: ' + name);
  return source.slice(0, boundary);
}

function replaceOnce(source, before, after, label) {
  if (source.split(before).length !== 2) throw new Error('Expected one ' + label);
  return source.replace(before, after);
}

function compileSuite(suite) {
  const base = read('base.cjs');
  let source = suite === 'existing'
    ? base
    : preamble(base, 'base') + '\n' + read(suite + '-browser-cases.js');

  if (suite === 'polish') {
    source = preamble(base, 'base') + '\n'
      + preamble(read('theme-browser-cases.js'), 'theme') + '\n'
      + read('polish-browser-cases.js');
  }

  // Preserve the final theme suite's dark-surface and held-feedback coverage.
  if (suite === 'theme') {
    source = replaceOnce(source,
      "assert.deepEqual(result.failures,[],label+' text contrast failures');return result;",
      "assert.deepEqual(result.failures,[],label+' text contrast failures');await checkDarkSurface(label);return result;",
      'contrast hook');
    source = replaceOnce(source,
      "await tap();await key('keyDown');await wait(420);assert.equal((await state()).status,'按住');",
      "await tap();await key('keyDown');await wait(80);await checkContrast('holding-feedback');await shot('phone-theme-holding');await wait(340);assert.equal((await state()).status,'按住');",
      'held-feedback hook');
    source = source.replace(entryMarker, read('dark-surface-checks.js') + '\n' + entryMarker);
  }

  return new Function('require', '__dirname', 'process', 'suite', source);
}

if (process.argv[2] === '--check') {
  for (const suite of suites) {
    compileSuite(suite);
    console.log('PASS browser suite syntax: ' + suite);
  }
} else {
  const suite = process.argv[3] || 'existing';
  if (suite !== 'all' && !suites.includes(suite)) throw new Error('Unknown suite. Choose: all, ' + suites.join(', '));
  if (!/^wss?:\/\//.test(process.argv[2] || '')) {
    throw new Error('Usage: node scripts/test-browser.cjs <isolated-browser-CDP-WebSocket-URL> [suite]');
  }
  if (process.argv.length > 4) throw new Error('Unexpected argument after suite.');
  if (suite === 'all') {
    for (const name of suites) {
      console.log('\nRUN browser suite: ' + name);
      const result = spawnSync(process.execPath, [__filename, process.argv[2], name], {
        stdio: 'inherit',
        windowsHide: true,
      });
      if (result.status !== 0) {
        process.exitCode = 1;
        if (result.error) console.error(result.error.message);
        if (result.signal) console.error('Browser suite interrupted by ' + result.signal);
      }
    }
  } else {
    compileSuite(suite)(require, browserDir, process, suite);
  }
}
