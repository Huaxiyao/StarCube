'use strict';

const fs = require('fs');
const path = require('path');

const mobileRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(mobileRoot, '..');
const sourceHtmlPath = path.join(repoRoot, 'starcube.html');
const bridgePath = path.join(mobileRoot, 'src', 'android-bridge.js');
const wwwDir = path.join(mobileRoot, 'www');
const targetHtmlPath = path.join(wwwDir, 'index.html');

if (!fs.existsSync(sourceHtmlPath)) {
  throw new Error('未找到根目录 starcube.html，请先在项目根目录执行 npm run build');
}

const html = fs.readFileSync(sourceHtmlPath, 'utf8');
const bridgeSource = fs.readFileSync(bridgePath, 'utf8').replace(/<\/script/gi, '<\\/script');
const bridgeTag = '<script data-starcube-native="android">\n' + bridgeSource + '\n</script>\n';

const headCloseIndex = html.indexOf('</head>');
if (headCloseIndex === -1) {
  throw new Error('starcube.html 缺少 </head> 标签，无法注入 Android 原生桥接');
}

const output = html.slice(0, headCloseIndex) + bridgeTag + html.slice(headCloseIndex);

fs.mkdirSync(wwwDir, { recursive: true });
fs.writeFileSync(targetHtmlPath, output, 'utf8');

console.log('已生成 Android Web 资源：' + targetHtmlPath);
console.log('大小：' + (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1) + ' KB');
