'use strict';

// Synchronize the editable worker entry without reinstalling or rebuilding cubejs.
// The minified dependency prefix and its original license remain byte-for-byte intact.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const bundlePath = path.join(__dirname, '../src/solver.bundle.js');
const entryPath = path.join(__dirname, '../src/worker-entry.js');
const before = fs.readFileSync(bundlePath, 'utf8');
const entry = fs.readFileSync(entryPath, 'utf8');
const boundary = '\n// StarCube worker-entry sync boundary\n';
const originalEntryMarker = 'var tt=_e(()=>{var Oe=Qe(),Ze=';
const syncedIndex = before.indexOf(boundary);
const originalIndex = before.indexOf(originalEntryMarker);
const prefixEnd = syncedIndex >= 0 ? syncedIndex : originalIndex;
if (prefixEnd < 0) throw new Error('Unknown dependency bundle layout; refusing to alter the solver.');
const prefix = before.slice(0, prefixEnd);
if (!prefix.includes('cubejs v1.3.2') || !prefix.includes('MIT License') || !prefix.includes('var Qe=')) {
  throw new Error('Dependency identity or license missing; refusing to alter the solver.');
}
const after = prefix + boundary +
  'var StarCubeBundledCube = Qe();\n' +
  '(function (require) {\n' + entry.replace(/\s*$/, '') + '\n' +
  '})(function (name) {\n' +
  "  if (name === 'cubejs') return StarCubeBundledCube;\n" +
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
