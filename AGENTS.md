# StarCube 协作开发规范（AGENTS.md）

本项目采用**双端分工协作**模式：网页端（桌面与手机浏览器）与安卓 App 共用同一套离线核心算法与本地数据格式，同时通过独立分支与独立工作目录（`git worktree`）隔离开发与构建，避免互相覆盖冲突。

---

## 1. 分工边界

### 网页端（桌面与手机浏览器单文件 — Codex 负责）
- 核心交付物：`starcube.html`（离线单文件，零外部资源依赖，覆盖桌面端与手机浏览器体验）
- 主要负责文件：
  - `src/template.html`（页面结构、主题、桌面端及手机浏览器响应式样式）
  - `src/app.js`（核心计时、复盘、历史与网页端交互）
  - `src/formulas.js`、`src/formula-catalog.js`、`src/formula-moves.js`（公式练习库）
  - `tests/browser/` 与网页核心回归测试
  - `README.md`、`docs/DEVELOPMENT.md`

### 安卓端（Android 离线 App — Antigravity 负责）
- 核心交付物：离线 Android `.apk`（通过 Capacitor 7 封装，GitHub Actions 自动编译发布）
- 主要负责文件：
  - `mobile/` 整个目录（`capacitor.config.json`、`package.json`、`src/android-bridge.js`、安卓专属样式与注入脚本 `scripts/`、`android-overrides/`）
  - `.github/workflows/android-apk.yml`
  - `docs/ANDROID_APP.md`
  - `tests/test-mobile.cjs`
  - 安卓原生能力（震动、SAF 系统文件选择、状态栏、应用内检查更新与直下等）、App 触控手感、安卓专属样式与 APK 构建

### 共享核心底座（双方共建、单人落代码 + 另一方复核）
- `src/stats.js`、`src/store.js`、`src/review.js`、`src/backup.js`、`src/audio.js`、`src/puzzles.js`、`src/challenge.js`
- `scripts/build.cjs`、`scripts/test.cjs`
- 涉及计时、存储或备份格式变更时，每项改动指定一方落代码、另一方复核兼容性，确保向后兼容。

---

## 2. 必须守住的架构契约

1. **根目录零依赖 & 单文件纯净**：
   - 根目录 `package.json` 保持零第三方依赖，仅用 Node.js 内置模块完成构建与测试。
   - `starcube.html` 不得引入任何外部 `<script src>` 或 `<link href>`，保证离线双击即用。
2. **原生桥接接口契约**：
   - `src/app.js` 与安卓端通过可选全局对象 `window.StarCubeNative`（主题状态栏同步、SAF 原生导出、触觉震动、屏幕常亮、首帧就绪回调、版本查询、应用内更新检查与直下）及 `window.StarCubeApp`（安卓返回键逐层处理、`showToast`）交互。
   - 重构 `src/app.js` 或 `src/template.html` 时，不得破坏上述桥接钩子、现有 DOM ID 或手机端 `@media (max-width:720px)` 布局。
3. **跨端数据互通**：
   - 保持 `localStorage` 键名与 JSON 备份格式（v3）向后兼容，确保网页端与安卓 App 导出的 JSON 备份可以无损互相导入合并。
4. **安卓专属功能外置隔离**：
   - 震动、系统文件选择、应用内更新、App 触控增强与安卓专属样式统一放在 `mobile/` 中，通过 `mobile/scripts/prepare-web.cjs` 注入到 `mobile/www/index.html`，避免反向侵入网页端核心源码。

---

## 3. 并行工作流、合并与验收规范

1. **独立分支 + 独立工作目录（`git worktree`）并行**：
   - 由于 `mobile/scripts/prepare-web.cjs` 会读取根目录 `starcube.html` 再注入原生桥接代码，双方不在同一工作目录并行修改与构建。
   - 约定工作目录与分支布局：
     - 网页端（Codex）：`F:\StarCube`（`main` 或网页功能分支）
     - 安卓端（Antigravity）：`F:\StarCube-mobile`（`mobile/dev` 或 `mobile/*` 分支）
   - 各自在独立目录内修改代码并运行 `npm run build` 生成各自的 `starcube.html`。
2. **合并顺序（先合源码，再重建单文件）**：
   - 跨分支合并时，**先合并源码改动，再统一重新执行一次 `npm run build` 重新生成 `starcube.html`**，严禁手工解决生成产物的合并冲突。
   - 每次提交前先检查 `git status`，确保不误提交无关或另一端的改动。
3. **分端验收真实入口**：
   - **共同基线**：每次改动结束后运行 `npm run build` 与 `npm test`，确保全量本地测试套件通过。
   - **网页端交付**：额外执行浏览器专项测试（`npm run test:browser`）。
   - **安卓端发版**：额外进行 APK 真机安装与核心流程实测验收（触控手感、原生能力、更新流程）。
   - **备份格式变化**：加做一次网页端与安卓 App 的双向导出/导入核对，确认成绩、分组与新增字段无损兼容。
4. **安全与仓库清洁**：
   - 切勿提交签名证书（`*.jks`、`*.keystore`）、私钥、Token 或构建缓存目录（`_build/`、`mobile/android/`、`mobile/www/`、`mobile/node_modules/`）。
   - 版本发布时保持 `mobile/package.json` 中的 `version` 与 GitHub Release 标签（如 `v2.1.0`）一致，以便应用内检查更新准确对比版本。
