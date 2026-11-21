'use strict';

const fs = require('fs');
const path = require('path');

const mobileRoot = path.resolve(__dirname, '..');
const androidRoot = path.join(mobileRoot, 'android');
const appMainDir = path.join(androidRoot, 'app', 'src', 'main');
const overridesDir = path.join(mobileRoot, 'android-overrides');

if (!fs.existsSync(appMainDir)) {
  throw new Error('未找到 mobile/android 工程，请先执行 npx cap add android');
}

// 1. 替换 MainActivity.java，接入 SAF 原生文件保存、屏幕常亮、主题状态栏与手势返回
const mainActivitySrc = path.join(overridesDir, 'MainActivity.java');
const mainActivityDst = path.join(appMainDir, 'java', 'com', 'starcube', 'timer', 'MainActivity.java');
fs.mkdirSync(path.dirname(mainActivityDst), { recursive: true });
fs.copyFileSync(mainActivitySrc, mainActivityDst);

// 2. 清理 Capacitor 默认模板里可能覆盖自适应图标的冲突资源
const resDir = path.join(appMainDir, 'res');
const staleIconPaths = [
  path.join(resDir, 'drawable-v24', 'ic_launcher_foreground.xml'),
  path.join(resDir, 'drawable', 'ic_launcher_background.xml'),
  path.join(resDir, 'values', 'ic_launcher_background.xml')
];
for (const filePath of staleIconPaths) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
for (const entry of fs.readdirSync(resDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('mipmap-')) continue;
  const fgPng = path.join(resDir, entry.name, 'ic_launcher_foreground.png');
  if (fs.existsSync(fgPng)) fs.unlinkSync(fgPng);
}

// 3. 写入 StarCube 矢量自适应图标资源
function copyRecursive(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}
copyRecursive(path.join(overridesDir, 'res'), resDir);

// 4. 更新 AndroidManifest.xml：确保屏幕旋转不重载 WebView（保留正在进行的计时状态），且不强行依赖相机等无关特性
const manifestPath = path.join(appMainDir, 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (manifest.includes('android:configChanges=') && !manifest.includes('density')) {
  manifest = manifest.replace(
    /android:configChanges="([^"]+)"/,
    'android:configChanges="$1|density|fontScale"'
  );
  fs.writeFileSync(manifestPath, manifest, 'utf8');
}

// 5. 为 app/build.gradle 注入可选版本号与 Release 签名支持（幂等）
const appGradlePath = path.join(androidRoot, 'app', 'build.gradle');
let gradle = fs.readFileSync(appGradlePath, 'utf8');

const versionCode = process.env.STARCUBE_VERSION_CODE;
if (versionCode && /^\d+$/.test(versionCode)) {
  gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode ' + versionCode);
}
const versionName = process.env.STARCUBE_VERSION_NAME;
if (versionName && /^[\w.\-+]+$/.test(versionName)) {
  gradle = gradle.replace(/versionName\s+"[^"]+"/, 'versionName "' + versionName + '"');
}

const signingMarker = '// STARCUBE_RELEASE_SIGNING';
if (!gradle.includes(signingMarker)) {
  const buildTypesMatch = gradle.match(/^([ \t]*)buildTypes\s*\{/m);
  if (buildTypesMatch) {
    const indent = buildTypesMatch[1];
    const signingBlock = [
      indent + signingMarker,
      indent + 'signingConfigs {',
      indent + '    release {',
      indent + '        if (System.getenv("STARCUBE_KEYSTORE_PATH")) {',
      indent + '            storeFile file(System.getenv("STARCUBE_KEYSTORE_PATH"))',
      indent + '            storePassword System.getenv("STARCUBE_KEYSTORE_PASSWORD")',
      indent + '            keyAlias System.getenv("STARCUBE_KEY_ALIAS")',
      indent + '            keyPassword System.getenv("STARCUBE_KEY_PASSWORD")',
      indent + '        }',
      indent + '    }',
      indent + '}',
      buildTypesMatch[0]
    ].join('\n');

    gradle = gradle.replace(buildTypesMatch[0], signingBlock);
    gradle = gradle.replace(
      /^([ \t]*)release\s*\{/m,
      '$1release {\n$1    if (System.getenv("STARCUBE_KEYSTORE_PATH")) {\n$1        signingConfig signingConfigs.release\n$1    }'
    );
  }
}

fs.writeFileSync(appGradlePath, gradle, 'utf8');
console.log('已完成 Android 原生工程定制：' + androidRoot);
