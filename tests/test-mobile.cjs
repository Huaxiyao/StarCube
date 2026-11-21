'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const mobileRoot = path.join(root, 'mobile');

let passed = 0;
let failures = 0;
const pending = [];

function test(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      pending.push(res.then(() => {
        passed++;
        console.log('PASS ' + name);
      }, err => {
        failures++;
        console.error('FAIL ' + name + '\n' + err.stack);
      }));
      return;
    }
    passed++;
    console.log('PASS ' + name);
  } catch (err) {
    failures++;
    console.error('FAIL ' + name + '\n' + err.stack);
  }
}

test('android-bridge.js bridges exportFile promises, theme sync, haptics, splash ready, json accept and double-back exit', async () => {
  let now = 10000;
  const calls = { themes: [], exports: [], toasts: [], exits: 0, haptics: [], ready: 0 };
  const attrs = {};
  const importInput = {
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] ?? null; }
  };
  const metas = {
    'meta[name="theme-color"]': { getAttribute: () => '#efe6d5' },
    'meta[name="color-scheme"]': { getAttribute: () => 'light' }
  };
  let backHandled = true;
  const appToasts = [];
  const window = {
    StarCubeAndroid: {
      onAppReady() { calls.ready++; },
      haptic(kind) { calls.haptics.push(kind); },
      setSystemTheme(color, isDark) { calls.themes.push({ color, isDark }); },
      exportFile(reqId, filename, mimeType, content) { calls.exports.push({ reqId, filename, mimeType, content }); },
      showToast(msg) { calls.toasts.push(msg); },
      exitApp() { calls.exits++; }
    },
    StarCubeApp: {
      handleBack() { return backHandled; },
      showToast(msg) { appToasts.push(msg); }
    }
  };
  const document = {
    readyState: 'complete',
    querySelector(sel) { return metas[sel] || null; },
    getElementById(id) { return id === 'importFile' ? importInput : null; },
    addEventListener() {}
  };
  const FakeDate = { now: () => now };
  const context = { window, document, Date: FakeDate, Promise, Object, String };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(mobileRoot, 'src', 'android-bridge.js'), 'utf8'), context, {
    filename: 'android-bridge.js'
  });

  // 初始主题已同步、启动页就绪已通知、importFile accept 已放宽、震动桥接正常
  assert.deepEqual(calls.themes, [{ color: '#efe6d5', isDark: false }]);
  assert.equal(calls.ready, 1);
  window.StarCubeNative.haptic('ready');
  assert.deepEqual(calls.haptics, ['ready']);
  assert.match(importInput.getAttribute('accept'), /application\/octet-stream/);

  // 原生导出 Promise 配对回调
  const exportPromise = window.StarCubeNative.exportFile({
    filename: 'backup.json',
    mimeType: 'application/json',
    content: '{"ok":true}'
  });
  assert.equal(calls.exports.length, 1);
  window.__starCubeOnExportResult(calls.exports[0].reqId, 'saved', '');
  const exportResult = await exportPromise;
  assert.equal(exportResult.status, 'saved');
  assert.equal(exportResult.message, '');

  // App 消费返回键时不触发退出
  window.__starCubeOnBackPressed();
  assert.equal(calls.exits, 0);
  assert.equal(appToasts.length, 0);

  // 首页第一次按返回提示「再按一次退出 StarCube」，2 秒内第二次按调用 exitApp
  backHandled = false;
  window.__starCubeOnBackPressed();
  assert.equal(calls.exits, 0);
  assert.deepEqual(appToasts, ['再按一次退出 StarCube']);
  now += 1500;
  window.__starCubeOnBackPressed();
  assert.equal(calls.exits, 1);
});

test('prepare-web.cjs builds offline Android index.html with inline native bridge and no external assets', () => {
  const run = spawnSync(process.execPath, [path.join(mobileRoot, 'scripts', 'prepare-web.cjs')], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const outPath = path.join(mobileRoot, 'www', 'index.html');
  assert.ok(fs.existsSync(outPath), 'mobile/www/index.html must be generated');
  const html = fs.readFileSync(outPath, 'utf8');
  assert.match(html, /<script data-starcube-native="android">/);
  assert.doesNotMatch(html, /<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']https?:\/\//i);
});

test('configure-android.cjs patches MainActivity, adaptive icons, manifest, version and signing idempotently', () => {
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'starcube-android-test-'));
  try {
    // 在临时目录镜像 mobile/scripts 与 mobile/android-overrides + 模拟 Capacitor android 工程
    const tempMobile = path.join(tempBase, 'mobile');
    fs.cpSync(path.join(mobileRoot, 'scripts'), path.join(tempMobile, 'scripts'), { recursive: true });
    fs.cpSync(path.join(mobileRoot, 'android-overrides'), path.join(tempMobile, 'android-overrides'), { recursive: true });

    const appMain = path.join(tempMobile, 'android', 'app', 'src', 'main');
    fs.mkdirSync(path.join(appMain, 'java', 'com', 'starcube', 'timer'), { recursive: true });
    fs.mkdirSync(path.join(appMain, 'res', 'drawable-v24'), { recursive: true });
    fs.mkdirSync(path.join(appMain, 'res', 'mipmap-hdpi'), { recursive: true });
    fs.mkdirSync(path.join(appMain, 'res', 'values'), { recursive: true });
    fs.writeFileSync(path.join(appMain, 'java', 'com', 'starcube', 'timer', 'MainActivity.java'), 'package com.starcube.timer;\npublic class MainActivity {}\n');
    fs.writeFileSync(path.join(appMain, 'res', 'drawable-v24', 'ic_launcher_foreground.xml'), '<vector/>');
    fs.writeFileSync(path.join(appMain, 'res', 'mipmap-hdpi', 'ic_launcher_foreground.png'), 'stub');
    fs.writeFileSync(path.join(appMain, 'res', 'values', 'styles.xml'), '<resources><style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen"><item name="android:background">@drawable/splash</item></style></resources>');
    fs.writeFileSync(path.join(appMain, 'AndroidManifest.xml'), '<manifest><application><activity android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation" /></application></manifest>');
    fs.writeFileSync(path.join(tempMobile, 'android', 'app', 'build.gradle'), [
      'android {',
      '    defaultConfig {',
      '        versionCode 1',
      '        versionName "1.0"',
      '    }',
      '    buildTypes {',
      '        release {',
      '            minifyEnabled false',
      '        }',
      '    }',
      '}'
    ].join('\n'));

    const env = Object.assign({}, process.env, {
      STARCUBE_VERSION_CODE: '42',
      STARCUBE_VERSION_NAME: '1.2.3'
    });
    const scriptPath = path.join(tempMobile, 'scripts', 'configure-android.cjs');
    const run1 = spawnSync(process.execPath, [scriptPath], { env, encoding: 'utf8', windowsHide: true });
    assert.equal(run1.status, 0, run1.stderr || run1.stdout);
    const run2 = spawnSync(process.execPath, [scriptPath], { env, encoding: 'utf8', windowsHide: true });
    assert.equal(run2.status, 0, run2.stderr || run2.stdout);

    const javaText = fs.readFileSync(path.join(appMain, 'java', 'com', 'starcube', 'timer', 'MainActivity.java'), 'utf8');
    assert.match(javaText, /StarCubeAndroidBridge/);
    assert.match(javaText, /FLAG_KEEP_SCREEN_ON/);
    assert.equal(fs.existsSync(path.join(appMain, 'res', 'drawable-v24', 'ic_launcher_foreground.xml')), false);
    assert.equal(fs.existsSync(path.join(appMain, 'res', 'mipmap-hdpi', 'ic_launcher_foreground.png')), false);
    assert.ok(fs.existsSync(path.join(appMain, 'res', 'drawable', 'ic_launcher_foreground.xml')));
    assert.ok(fs.existsSync(path.join(appMain, 'res', 'drawable', 'ic_launcher_background.xml')));
    assert.ok(fs.existsSync(path.join(appMain, 'res', 'drawable', 'ic_splash_mark.xml')));
    assert.ok(fs.existsSync(path.join(appMain, 'res', 'drawable', 'launch_screen_bg.xml')));
    assert.ok(fs.existsSync(path.join(appMain, 'res', 'mipmap-anydpi-v26', 'ic_launcher.xml')));

    const styles = fs.readFileSync(path.join(appMain, 'res', 'values', 'styles.xml'), 'utf8');
    assert.match(styles, /@drawable\/launch_screen_bg/);
    assert.match(styles, /windowSplashScreenAnimatedIcon/);
    assert.equal((styles.match(/windowSplashScreenBackground/g) || []).length, 1, 'styles.xml patch must be idempotent');

    const manifest = fs.readFileSync(path.join(appMain, 'AndroidManifest.xml'), 'utf8');
    assert.match(manifest, /density\|fontScale/);
    assert.equal((manifest.match(/density/g) || []).length, 1, 'Manifest patch must be idempotent');

    const gradle = fs.readFileSync(path.join(tempMobile, 'android', 'app', 'build.gradle'), 'utf8');
    assert.match(gradle, /versionCode 42/);
    assert.match(gradle, /versionName "1\.2\.3"/);
    assert.equal((gradle.match(/STARCUBE_RELEASE_SIGNING/g) || []).length, 1, 'Signing block patch must be idempotent');
  } finally {
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
});

Promise.all(pending).then(() => {
  console.log('\n' + passed + ' passed, ' + failures + ' failed');
  if (failures) process.exitCode = 1;
});
