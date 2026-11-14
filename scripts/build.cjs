'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'src');
const template = fs.readFileSync(path.join(buildDir, 'template.html'), 'utf8');
const stats = fs.readFileSync(path.join(buildDir, 'stats.js'), 'utf8');
const review = fs.readFileSync(path.join(buildDir, 'review.js'), 'utf8');
const store = fs.readFileSync(path.join(buildDir, 'store.js'), 'utf8');
const audio = fs.readFileSync(path.join(buildDir, 'audio.js'), 'utf8');
const backup = fs.readFileSync(path.join(buildDir, 'backup.js'), 'utf8');
const app = fs.readFileSync(path.join(buildDir, 'app.js'), 'utf8');
const solver = fs.readFileSync(path.join(buildDir, 'solver.bundle.js'), 'utf8');

function escapeForInlineScript(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

const appScripts = escapeForInlineScript(stats + '\n' + review + '\n' + store + '\n' + audio + '\n' + backup + '\n' + app);
const solverSource = escapeForInlineScript(solver);
new Function(stats + '\n' + review + '\n' + store + '\n' + audio + '\n' + backup + '\n' + app);
new Function(solver);

if (!template.includes('__SOLVER_SOURCE__') || !template.includes('//__APP_SCRIPTS__')) {
  throw new Error('模板占位符缺失');
}

let output = template
  .replace('__SOLVER_SOURCE__', () => solverSource)
  .replace('//__APP_SCRIPTS__', () => appScripts);

const external = output.match(/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']https?:\/\//gi) || [];
if (external.length) throw new Error('单文件交付不得包含外部脚本或样式');

const target = path.join(root, 'starcube.html');
fs.writeFileSync(target, output, 'utf8');
console.log('已生成 ' + target);
console.log('大小：' + (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1) + ' KB');
console.log('外部脚本或样式：' + external.length);
