'use strict';

// Synchronize the editable worker entry without reinstalling or rebuilding min2phase.js.
// The dependency prefix and its original MIT license remain byte-for-byte intact.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const bundlePath = path.join(__dirname, '../src/solver.bundle.js');
const entryPath = path.join(__dirname, '../src/worker-entry.js');
const before = fs.readFileSync(bundlePath, 'utf8');
const entry = fs.readFileSync(entryPath, 'utf8');
const boundary = '\n// StarCube worker-entry sync boundary\n';
const syncedIndex = before.indexOf(boundary);
if (syncedIndex < 0) throw new Error('Unknown dependency bundle layout; refusing to alter the solver.');
const prefix = before.slice(0, syncedIndex);
if (!prefix.includes('min2phase.js') || !prefix.includes('MIT License') || !prefix.includes('function Search()')) {
  throw new Error('Dependency identity or license missing; refusing to alter the solver.');
}
const after = prefix + boundary +
  'var StarCubeBundledMin2Phase = module.exports && module.exports.solve ? module.exports : min2phase;\n' +
  '(function (require) {\n' + entry.replace(/\s*$/, '') + '\n' +
  '})(function (name) {\n' +
  "  if (name === 'min2phase') return StarCubeBundledMin2Phase;\n" +
  "  throw new Error('Unsupported bundled dependency: ' + name);\n" +
  '});\n})();\n';
const prefixAfter = after.slice(0, after.indexOf(boundary));
if (prefixAfter !== prefix) throw new Error('Dependency prefix changed unexpectedly.');
fs.writeFileSync(bundlePath, after, 'utf8');
const proof = {
  dependencySha256Before: hash(prefix),
  dependencySha256After: hash(prefixAfter),
  dependencyBytes: Buffer.byteLength(prefix),
  dependencyUnchanged: true,
  workerEntrySha256: hash(entry),
  bundleSha256Before: hash(before),
  bundleSha256After: hash(after),
  licensePreserved: true,
  bundleChanged: before !== after
};

console.log(JSON.stringify(proof, null, 2));
