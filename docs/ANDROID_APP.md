# StarCube 安卓离线 App 打包与安装指南

StarCube 通过 `mobile/` 目录中的独立 Capacitor 7 工程封装为离线安卓 App（`.apk`），**根目录的单文件 `starcube.html` 与零依赖构建流程不受影响**。

## 安卓版包含的原生增强

- **100% 离线运行**：内置完整随机状态打乱求解器与本地存储，安装后开飞行模式即可使用。
- **原生文件导出（SAF）**：导出 JSON 备份与 CSV 成绩时直接调起安卓系统「保存文件」窗口，无需敏感存储权限，支持直接存到「下载 / Downloads」或任意目录。
- **练习时屏幕常亮**：打开计时器自动保持亮屏，避免观察或思考期间自动息屏。
- **系统状态栏与安全区适配**：切换纯净纸白 / 复古暖纸 / 极简曜黑三套主题时，自动同步系统状态栏与导航栏底色及深浅图标，并兼容 Android 15+ Edge-to-Edge 挖孔屏与底部手势条安全区。
- **手势返回键防误退**：按返回键逐层关闭弹窗、取消观察或从复盘切回计时；**计时进行中自动拦截返回键防止误触退出**；计时页首页 2 秒内连按两次退出。
- **独立数据与高清图标**：成绩独立保存在 App 内部，清理系统浏览器缓存不会丢失记录；内置 StarCube 3D 魔方矢量自适应图标。

---

## 第一步：在 GitHub 上自动打包下载 APK（推荐，本机免装 Android Studio）

1. 将当前代码提交并推送到你的 GitHub 仓库 `main` 分支：
   ```sh
   git push origin main
   ```
2. 打开 GitHub 仓库页面，点击顶部的 **Actions** → 左侧选择 **Build Android APK**。
3. 等待构建完成（也可以随时点击右侧 **Run workflow** 手动触发）。
4. 点进本次运行记录，在底部的 **Artifacts** 区域下载 `StarCube-android-...` 压缩包，解压得到 `.apk` 文件。
5. 将 `.apk` 传到安卓手机点击安装（如系统提示「未知来源应用」，允许安装即可）。

### 发布到 GitHub Releases（方便手机浏览器直接下载）

打一个 `v` 开头的版本标签并推送，工作流会自动创建一个 GitHub Release 并将 `.apk` 挂在附件里：

```sh
git tag v1.0.0
git push origin v1.0.0
```

手机浏览器打开仓库的 **Releases** 页面即可直接下载安装，无需解压。

---

## 第二步（可选）：配置固定签名，实现未来无损覆盖更新

不配置任何 Secrets 时，工作流默认构建 `debug` 安装包，可以直接装到手机使用。

但因为每次 GitHub Actions 虚拟机生成的临时调试签名不同，**未来更新新版 `debug` 包时系统会提示签名不一致**（需要先在 App 里点「导出备份」，卸载旧版再装新版并导入备份）。

如果你希望以后直接下载新版 APK **无损覆盖安装、自动保留全部历史成绩**，只需配置一次自己的固定签名：

1. 在任意有 JDK 的环境（或 Git Bash / Linux / WSL）生成一次签名证书：
   ```sh
   keytool -genkeypair -v -keystore starcube-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias starcube
   ```
2. 将 `starcube-release.jks` 转为 Base64 字符串（妥善保存证书文件，**切勿提交到 Git**）：
   - PowerShell：
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("starcube-release.jks")) | Set-Clipboard
     ```
   - macOS / Linux：
     ```sh
     base64 -w 0 starcube-release.jks
     ```
3. 在 GitHub 仓库中打开 **Settings → Secrets and variables → Actions → New repository secret**，添加以下 4 个 Secrets：
   - `ANDROID_KEYSTORE_BASE64`：上一步生成的 Base64 字符串
   - `ANDROID_KEYSTORE_PASSWORD`：生成证书时设置的 keystore 密码
   - `ANDROID_KEY_ALIAS`：`starcube`
   - `ANDROID_KEY_PASSWORD`：key 密码（通常与 keystore 密码相同）
4. 重新运行 **Build Android APK**，工作流会自动切换为正式签名构建，产出 `StarCube-<版本>-release.apk`。

---

## 本地构建（仅当本机已安装 Android Studio / JDK 21 时）

```sh
npm run build
cd mobile
npm install
npm run prepare:web
npx cap add android
npm run configure:android
cd android
./gradlew assembleDebug
```

生成的 APK 位于 `mobile/android/app/build/outputs/apk/debug/app-debug.apk`。
