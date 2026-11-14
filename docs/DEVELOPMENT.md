# 开发与验证

## 修改与构建

需要 Node.js 22 或更高版本；没有 npm 依赖，不需要安装依赖。

```sh
node scripts/build.cjs
node scripts/test.cjs --report
```

构建将 `src/template.html`、`stats.js`、`review.js`、`store.js`、`audio.js`、`backup.js`、`app.js` 和 `solver.bundle.js` 内联到根目录的 `starcube.html`。生成文件也纳入版本控制，下载后即可使用；平均明细、提示音和备份提醒均不增加联网依赖。

`src/worker-entry.js` 是内置求解器的可编辑 Worker 入口。修改它后，先执行 `node scripts/sync-solver.cjs`，再构建与测试。同步脚本检查并保留已有 cubejs 依赖部分，不重新下载依赖。

本地回归覆盖统计、平均明细、观察提示音、备份提醒、复盘模型、存储与迁移、领域规则与求解器、应用状态和构建一致性。运行器输出各套件与总检查数；测试使用合成记录，不读取日常浏览器的数据。

平均值明细从 Ao5 / Ao12 进入，展示最近 N 次成绩。`StarCubeStats.averageDetails` 按有效用时从两端各去掉 5%（向上取整），同分按原序稳定去尾，明细保持原顺序；保留项含 DNF 时平均为 DNF，总和为空。

`audio.js` 使用浏览器音频能力本地生成提示音。开关默认关闭，试听独立于开关及计时状态；观察 8 秒一声、12 秒两声。不可用或播放失败时需有可见反馈，音频失败不得阻断计时。

`backup.js` 按全部训练组的成绩总数判断提醒：自上次导出或「稍后提醒」起净新增 100 条后提醒，首次已有至少 100 条也提醒。导出记录的是发起下载的时点，不能视为确认文件落盘；提醒状态只保存在本机。

`tests/fixtures/legacy-store-v2.js` 保留升级前的存储实现，用于验证迁移后的记录身份。它是测试夹具，不是应用运行时模块。

## 浏览器回归

浏览器测试通过 Chrome DevTools Protocol 操作浏览器，使用 Node.js 内置 WebSocket。必须使用**独立测试配置**：测试会清空该配置中的 StarCube 记录。

先启动已安装的 Chromium 浏览器，开启本地调试端口并指定专用配置目录。下面是 Windows PowerShell 示例，Chrome 路径可按本机安装位置调整：

```powershell
$profilePath = Join-Path (Get-Location).Path 'test-results\chrome-profile'
$chromeArguments = @(
    '--headless=new',
    '--remote-debugging-port=0',
    ('--user-data-dir="' + $profilePath + '"'),
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
)
$browserProcess = Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' `
    -ArgumentList $chromeArguments -WindowStyle Hidden -PassThru

# 等待启动生成 DevToolsActivePort 后执行：
$endpointParts = Get-Content (Join-Path $profilePath 'DevToolsActivePort')
$cdpUrl = 'ws://127.0.0.1:' + $endpointParts[0] + $endpointParts[1]
node scripts/test-browser.cjs $cdpUrl all

# 验证完成后只关闭刚启动的测试进程。
$browserProcess | Stop-Process
```

也可用浏览器 `/json/version` 返回的 `webSocketDebuggerUrl` 运行单套：

```sh
node scripts/test-browser.cjs '<isolated-browser-CDP-WebSocket-URL>' existing
```

支持 `existing`、`training`、`review`、`layout`、`usability`、`theme`、`redesign`、`polish`、`enhancements` 和 `all`。`all` 顺序执行所有套件，任意一套失败即返回非零退出码；实际检查数以运行报告为准。

`enhancements` 在断网条件下检查平均值明细与原生弹窗、独立试听、8/12 秒音频调度、不支持音频时的反馈、备份阈值与真实下载、跨标签页状态，以及 1280 / 375 / 320 像素视口。音频断言检查 Web Audio 调度，不能代替实体设备的听感验收。

结果、截图和下载保存在 `test-results/browser/<suite>/`，不提交到 Git。每份报告记录实际 HTML 的 SHA256。只检查套件能否拼接和解析，可运行 `node scripts/test-browser.cjs --check`；该命令不代表浏览器验收通过。

`polish` 含 Windows Segoe UI 字体的专项断言，其他系统的字体回退不能用这套断言直接验收。当前浏览器验证使用 Chromium；手机仅做视口与触摸模拟，未覆盖实体设备、真实读屏器或 Safari / Firefox。

## 仓库边界

- `src/` 是后续维护的源码，`scripts/` 是稳定构建和测试入口。
- `.local/` 保存本机整理前的历史资料；不参与构建，也不随 Git 发布。
- `.finesse/`、`test-results/`、依赖目录、环境覆盖文件和常见密钥文件均被忽略。
- 构建保持离线单文件形式；提交前运行构建和本地测试，并确认 `starcube.html` 与当前源码一致。
- `package.json` 的 `private: true` 用来防止意外发布到 npm，与 GitHub 仓库的公开/私有设置无关。

项目原始代码尚未指定开源许可证；cubejs 的第三方许可单独记录在 `THIRD_PARTY_NOTICES.md`。
