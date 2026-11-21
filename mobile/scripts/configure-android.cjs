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

// 3. 写入 StarCube 矢量自适应图标与启动过场资源
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

// 3.5 修补 styles.xml：使用 StarCube 品牌启动背景替代默认黑屏/占位 Splash
const stylesPath = path.join(resDir, 'values', 'styles.xml');
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  styles = styles.replace(/@drawable\/splash\b/g, '@drawable/launch_screen_bg');
  if (styles.includes('AppTheme.NoActionBarLaunch') && !styles.includes('windowSplashScreenBackground')) {
    styles = styles.replace(
      /(<style\s+name="AppTheme\.NoActionBarLaunch"[^>]*>)/,
      '$1\n        <item name="android:windowBackground">@drawable/launch_screen_bg</item>\n        <item name="windowSplashScreenBackground">#F3F4F6</item>\n        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_splash_window_icon</item>'
    );
  }
  fs.writeFileSync(stylesPath, styles, 'utf8');
}

// 4. 更新 AndroidManifest.xml：屏幕旋转不重载 WebView，且声明应用内更新安装权限
const manifestPath = path.join(appMainDir, 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (manifest.includes('android:configChanges=') && !manifest.includes('density')) {
  manifest = manifest.replace(
    /android:configChanges="([^"]+)"/,
    'android:configChanges="$1|density|fontScale"'
  );
}
if (!manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
  manifest = manifest.replace(
    /<\/manifest>/,
    '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n</manifest>'
  );
}
fs.writeFileSync(manifestPath, manifest, 'utf8');

// 4.5 确保 FileProvider 暴露私有缓存 updates/ 目录用于拉起应用内安装包
const filePathsPath = path.join(resDir, 'xml', 'file_paths.xml');
fs.mkdirSync(path.dirname(filePathsPath), { recursive: true });
if (fs.existsSync(filePathsPath)) {
  let filePaths = fs.readFileSync(filePathsPath, 'utf8');
  if (!filePaths.includes('path="updates/"')) {
    filePaths = filePaths.replace(
      /<\/paths>/,
      '    <cache-path name="starcube_updates" path="updates/" />\n</paths>'
    );
    fs.writeFileSync(filePathsPath, filePaths, 'utf8');
  }
} else {
  fs.writeFileSync(
    filePathsPath,
    '<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n    <cache-path name="starcube_updates" path="updates/" />\n</paths>\n',
    'utf8'
  );
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
