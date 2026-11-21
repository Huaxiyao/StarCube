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

`averageDetails(records, n, endUid)` 可固定历史窗口的结束成绩；`bestAo5Details(records)` 返回最早的最佳有效窗口。明细与单次详情共用返回路径，只显示一个原生弹窗，返回时恢复焦点与弹窗滚动位置。删除导致父窗口不足 N 次或结束记录不存在时，跳过已失效的父窗口。从计时页打开时保存根视图与页面滚动，「继续计时」清空详情栈并聚焦计时区，不修改组、打乱或计时状态。鼠标/触摸点击根层关闭（click.detail > 0）也回计时区；键盘/辅助技术点击与 Esc 保持返回入口的语义。

日期复盘使用 `Review.build(records, 'today' | '7days', now)`；旧 50/100 次模式保持兼容。`now` 可传日期或毫秒时间戳用于确定性测试。当前窗口为本地自然日起点至 now（包含），前期为紧邻的完整 1/7 个自然日，采用左闭右开边界；排除未来记录。使用日历加减处理夏令时。`shown` 是当前日期窗口全部次数，`points` 至多最近 100 条并保留全组序号，`plotTruncated` 指示绘图截断。历史复用导出的 `Review.filterHistory(records, limit, now)`（底层沿用 `Review.dateRange(mode, now)` 边界），日期模式按日分段并保留原编号/UID，每次加载 50 条，不受绘图 100 点上限影响；次数模式显示全组历史。`Review.historyCsv(entries)` 沿用同一筛选结果，按历史列表倒序输出带 UTF-8 BOM 与 CRLF 的 CSV（列为记录时间、原始用时、状态、打乱公式），供 Excel 直接打开；CSV 导出不影响全量 JSON 备份提醒状态。本组统计与记录本身不受筛选影响。

两期有效平均和总体标准差只包含有效用时（+2 已计入），标准差采用 Welford 算法且至少需 2 次；DNF 率以全部次数为分母。无数据返回 null，有效次数少于 5 标记小样本，差值为当前减前期。缓存包含数据版本、当前分钟与时区偏移；前台日期视图在趋势或历史任一展开时按分钟同步刷新，离开复盘、两者都折叠或后台时取消定时器，回到前台重新校验。窗口内历史修改、删除和撤销复用数据版本更新机制。

范围偏好保存在现有 `starcube.settings.v1.reviewRange`，仅接受字符串 `50`、`100`、`today`、`7days`，旧或非法值回退到 50 次，保留观察及提示音设置。范围改变会重置历史分页与滚动；「全部历史」将范围设为 50。偏好不保存某个绝对日期，重开页面仍进入计时页，日期范围按当前时间重新计算；写入失败沿用已有存储提示，本页筛选继续工作。

删除后撤销使用 `store.remove(uid)` 返回的唯一 `token`，再调用 `store.restore(uid, token)`。恢复标记只确认对应的那次删除，不改写原记录；更晚的删除使旧撤销失效。应用监听 `keys.restoredPrefix` 以同步其他标签页。撤销栈只保留在当前页面，普通导入仍尊重未撤销的删除；存储失败须显示失败且保留可重试的撤销。旧版已打开页面不识别恢复标记，需要刷新到新版。

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
