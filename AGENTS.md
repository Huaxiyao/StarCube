# StarCube 协作开发规范（AGENTS.md）

本项目采用**双端分工协作**模式：网页端与手机端共用同一套离线核心算法与本地数据格式，同时按目录边界隔离开发，避免互相覆盖冲突。

---

## 1. 分工边界

### 网页端（Web / 桌面单文件 — Codex 负责）
- 核心交付物：`starcube.html`（离线单文件，零外部资源依赖）
- 主要负责文件：
  - `src/template.html`（桌面端结构、主题与样式）
  - `src/app.js`（核心计时、复盘、历史与桌面端交互）
  - `src/formulas.js`、`src/formula-catalog.js`、`src/formula-moves.js`（公式练习库）
  - `tests/browser/` 与网页核心回归测试
  - `README.md`、`docs/DEVELOPMENT.md`

### 手机端（Android 离线 App — Antigravity 负责）
- 核心交付物：离线 Android `.apk`（通过 Capacitor 7 封装，GitHub Actions 自动编译发布）
- 主要负责文件：
  - `mobile/` 整个目录（`capacitor.config.json`、`package.json`、`src/android-bridge.js`、`scripts/`、`android-overrides/`）
  - `.github/workflows/android-apk.yml`
  - `docs/ANDROID_APP.md`
  - `tests/test-mobile.cjs`
  - 移动端响应式样式（`@media (max-width:720px)`）、手机触控防断触逻辑与原生能力适配

### 共享核心底座（双方共建、修改需保持向后兼容）
- `src/stats.js`、`src/store.js`、`src/review.js`、`src/backup.js`、`src/audio.js`、`src/puzzles.js`、`src/challenge.js`
- `scripts/build.cjs`、`scripts/test.cjs`

---

## 2. 必须守住的架构契约

1. **根目录零依赖 & 单文件纯净**：
   - 根目录 `package.json` 保持零第三方依赖，仅用 Node.js 内置模块完成构建与测试。
   - `starcube.html` 不得引入任何外部 `<script src>` 或 `<link href>`，保证离线双击即用。
2. **原生桥接接口契约**：
   - `src/app.js` 与手机端通过可选全局对象 `window.StarCubeNative`（主题状态栏同步、SAF 原生导出、触觉震动、屏幕常亮、首帧就绪回调、版本查询、应用内更新检查与直下）及 `window.StarCubeApp`（安卓返回键逐层处理、`showToast`）交互。
   - 重构 `src/app.js` 或 `src/template.html` 时，不得破坏上述桥接钩子、现有 DOM ID 或手机端 `@media (max-width:720px)` 布局。
3. **跨端数据互通**：
   - 保持 `localStorage` 键名与 JSON 备份格式（v3）向后兼容，确保网页端与安卓 App 导出的 JSON 备份可以无损互相导入合并。
4. **手机端优先外置隔离**：
   - 手机端新增的专属原生能力与样式优先放在 `mobile/` 中通过 `mobile/scripts/prepare-web.cjs` 注入，尽量减少对桌面端核心源码的侵入。

---

## 3. 防冲突与提交规范

1. **开工前先查工作区**：修改共享文件（尤其是 `src/app.js`、`src/template.html`、`scripts/build.cjs`）前，先运行 `git status` 检查是否有另一端尚未提交的改动，严禁直接覆盖未提交代码。
2. **错峰修改共享文件**：避免同一时间并行编辑同一个共享文件；改完一个功能模块及时 `commit`。
3. **统一验收护栏**：每次改动结束后必须运行以下命令确认全部测试通过（包含构建一致性与移动端桥接测试）：
   ```sh
   npm run build
   npm test
   ```
4. **安全与仓库清洁**：
   - 切勿提交签名证书（`*.jks`、`*.keystore`）、私钥、Token 或构建缓存目录（`_build/`、`mobile/android/`、`mobile/www/`、`mobile/node_modules/`）。
   - 版本发布时保持 `mobile/package.json` 中的 `version` 与 GitHub Release 标签（如 `v2.1.0`）一致，以便应用内检查更新准确对比版本。
