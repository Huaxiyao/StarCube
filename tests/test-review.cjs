'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const Review = require('../src/review.js');

function rec(number, ms, penalty = 'ok') {
  return { uid: 'solve-' + number, id: number, ms, penalty, groupId: 'practice', at: '2026-11-13T00:00:00.000Z', scramble: 'R U' };
}
function sequence(length) { return Array.from({ length }, (_, i) => rec(i + 1, (i + 1) * 1000)); }
function test(name, check) { check(); console.log('PASS ' + name); }
function approx(actual, expected) { assert.equal(typeof actual, 'number'); assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' != ' + expected); }

test('空训练不生成虚构的零成绩', () => {
  assert.deepEqual(Review.build([], 50), { total: 0, shown: 0, startIndex: 0, validCount: 0, dnfCount: 0, plus2Count: 0, average: null, best: null, points: [] });
  assert.deepEqual(Review.build(null), Review.build([]));
});

test('单次成绩保持 UID 与序号，不足五次没有 Ao5', () => {
  const result = Review.build([rec(17, 0)]);
  assert.equal(result.average, 0);
  assert.equal(result.best, 0);
  assert.equal(result.validCount, 1);
  assert.deepEqual(result.points, [{ uid: 'solve-17', number: 1, value: 0, ao5: null }]);
  assert.deepEqual(Review.build(sequence(4)).points.map(p => p.ao5), [null, null, null, null]);
});

test('已知五次序列同时处理 +2、DNF、平均与最好成绩', () => {
  const result = Review.build([rec(1, 12000), rec(2, 9000, 'dnf'), rec(3, 13000), rec(4, 14000, '+2'), rec(5, 11000)]);
  assert.equal(result.validCount, 4);
  assert.equal(result.dnfCount, 1);
  assert.equal(result.plus2Count, 1);
  assert.equal(result.average, 13000);
  assert.equal(result.best, 11000);
  assert.deepEqual(result.points.map(p => p.value), [12000, null, 13000, 16000, 11000]);
  approx(result.points[4].ao5, 41000 / 3);
});

test('两个 DNF 使 Ao5 为 DNF，后续窗口可恢复', () => {
  const rows = [rec(1, 1000, 'dnf'), rec(2, 1000, 'dnf'), rec(3, 12000), rec(4, 13000), rec(5, 14000), rec(6, 15000)];
  const result = Review.build(rows);
  assert.equal(result.points[4].ao5, 'DNF');
  assert.equal(result.points[5].ao5, 14000);
  assert.equal(result.average, 13500);
});

test('全 DNF 保留空值，不能在曲线上成为零秒', () => {
  const result = Review.build(sequence(8).map(row => ({ ...row, penalty: 'dnf' })));
  assert.equal(result.validCount, 0);
  assert.equal(result.dnfCount, 8);
  assert.equal(result.average, null);
  assert.equal(result.best, null);
  assert.ok(result.points.every(point => point.value === null));
  assert.deepEqual(result.points.map(point => point.ao5), [null, null, null, null, 'DNF', 'DNF', 'DNF', 'DNF']);
});

test('最近 50 次统计只包含窗口，首点 Ao5 仍使用前四次', () => {
  const result = Review.build(sequence(56), 50);
  assert.equal(result.total, 56);
  assert.equal(result.shown, 50);
  assert.equal(result.startIndex, 6);
  assert.equal(result.average, 31500);
  assert.equal(result.best, 7000);
  assert.deepEqual(result.points[0], { uid: 'solve-7', number: 7, value: 7000, ao5: 5000 });
  assert.deepEqual(result.points[49], { uid: 'solve-56', number: 56, value: 56000, ao5: 54000 });
});

test('窗口之前的 DNF 影响首点 Ao5，但不进入窗口 DNF 次数', () => {
  const rows = sequence(56);
  rows[3].penalty = 'dnf';
  rows[5].penalty = 'dnf';
  const result = Review.build(rows, 50);
  assert.equal(result.dnfCount, 0);
  assert.equal(result.validCount, 50);
  assert.equal(result.points[0].ao5, 'DNF');
  assert.equal(result.points[1].ao5, 'DNF');
  assert.equal(result.points[2].ao5, 8000);
});

test('窗口之前的 +2 参与首点 Ao5，但不进入窗口罚时次数', () => {
  const rows = sequence(56);
  rows[5].penalty = '+2';
  const result = Review.build(rows, 50);
  assert.equal(result.plus2Count, 0);
  approx(result.points[0].ao5, 16000 / 3);
});

test('100 次窗口及其他 limit 回退边界', () => {
  const rows = sequence(103);
  const hundred = Review.build(rows, 100);
  assert.equal(hundred.shown, 100);
  assert.equal(hundred.startIndex, 3);
  assert.equal(hundred.average, 53500);
  assert.equal(hundred.points[0].ao5, null);
  assert.equal(hundred.points[1].ao5, 3000);
  [undefined, null, 0, -1, 20, 51, 101, '100', Infinity, NaN].forEach(limit => {
    assert.equal(Review.build(rows, limit).shown, 50);
    assert.equal(Review.build(rows, limit).startIndex, 53);
  });
});

test('相同值不会产生虚构的变化', () => {
  const result = Review.build(Array.from({ length: 100 }, (_, i) => rec(i + 1, 12345)), 100);
  assert.equal(result.average, 12345);
  assert.equal(result.best, 12345);
  assert.ok(result.points.slice(4).every(p => p.value === 12345 && p.ao5 === 12345));
});

test('十万次训练仍只输出最近窗口，序号与统计准确', () => {
  const result = Review.build(sequence(100000), 100);
  assert.equal(result.total, 100000);
  assert.equal(result.shown, 100);
  assert.equal(result.startIndex, 99900);
  assert.equal(result.average, 99950500);
  assert.equal(result.best, 99901000);
  assert.equal(result.points[0].number, 99901);
  assert.equal(result.points[0].ao5, 99899000);
  assert.equal(result.points[99].ao5, 99998000);
});

test('冻结输入可以复盘，修改输出也不会改写原记录', () => {
  const rows = Object.freeze(sequence(56).map(Object.freeze));
  const before = JSON.stringify(rows);
  const result = Review.build(rows, 50);
  result.points[0].value = 1;
  result.points[0].uid = 'changed';
  assert.equal(JSON.stringify(rows), before);
});

test('无需 CommonJS 的浏览器全局入口可使用现有 Stats', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/stats.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/review.js'), 'utf8'), context);
  const result = context.StarCubeReview.build(sequence(5));
  assert.equal(result.points[4].ao5, 3000);
  assert.equal(result.average, 3000);
  const dateNow = new Date('2026-11-13T12:00:00.000Z');
  const datedRows = sequence(5).map(row => ({ ...row, at: dateNow.toISOString() }));
  const datedResult = context.StarCubeReview.build(datedRows, 'today', dateNow);
  assert.equal(datedResult.shown, 5);
  assert.equal(datedResult.average, 3000);
  assert.equal(datedResult.smallSample, false);
});

function dated(number, ms, at, penalty = 'ok') {
  return { ...rec(number, ms, penalty), at: typeof at === 'string' ? at : new Date(at).toISOString() };
}
function inTimezone(zone, script) {
  return JSON.parse(execFileSync(process.execPath, ['-e',
    'const Review = require(' + JSON.stringify(path.join(__dirname, '../src/review.js')) + ');\n' + script
  ], { env: { ...process.env, TZ: zone }, encoding: 'utf8' }));
}

test('今天从本地午夜到当前时刻包含端点，昨天边界无重叠且未来被排除', () => {
  const now = new Date(2026, 10, 14, 12, 30);
  const start = new Date(2026, 10, 14).getTime();
  const priorStart = new Date(2026, 10, 13).getTime();
  const rows = [
    dated(1, 9000, priorStart - 1), dated(2, 11000, priorStart), dated(3, 13000, start - 1),
    dated(4, 10000, start), dated(5, 14000, now, '+2'), dated(6, 1000, now.getTime() + 1)
  ];
  const result = Review.build(rows, 'today', now);
  assert.equal(result.total, 6);
  assert.equal(result.shown, 2);
  assert.equal(result.chartShown, 2);
  assert.equal(result.startIndex, 3);
  assert.equal(result.plotTruncated, false);
  assert.equal(result.average, 13000);
  assert.equal(result.stddev, 3000);
  assert.equal(result.plus2Count, 1);
  assert.equal(result.comparison.previous.count, 2);
  assert.equal(result.comparison.previous.average, 12000);
  assert.equal(result.comparison.previous.stddev, 1000);
  assert.deepEqual(result.comparison.delta, { average: 1000, stddev: 2000, dnfRate: 0 });
  assert.deepEqual(result.points.map(point => point.number), [4, 5]);
  assert.equal(result.dateRange.periodStart, start);
  assert.equal(result.dateRange.periodEnd, now.getTime());
  assert.equal(result.dateRange.priorStart, priorStart);
  assert.equal(result.dateRange.priorEnd, start);
  assert.equal(result.dateRange.dayKey, '2026-11-14');
  assert.equal(result.dateRange.currentLabel, '今天');
  assert.equal(result.dateRange.priorLabel, '昨天');
  assert.deepEqual(Review.build(rows, 'today', now.getTime()), result);
});

test('正好午夜时新一天只含该时刻，昨天保留完整自然日', () => {
  const now = new Date(2027, 0, 1);
  const rows = [dated(1, 10000, new Date(2026, 11, 31)), dated(2, 14000, now.getTime() - 1),
    dated(3, 12000, now), dated(4, 9999, now.getTime() + 1)];
  const result = Review.build(rows, 'today', now);
  assert.equal(result.shown, 1);
  assert.equal(result.average, 12000);
  assert.equal(result.stddev, null);
  assert.equal(result.comparison.previous.count, 2);
  assert.equal(result.comparison.previous.average, 12000);
  assert.equal(result.comparison.delta.average, 0);
  assert.equal(result.comparison.delta.stddev, null);
  assert.equal(result.dateRange.dayKey, '2027-01-01');
});

test('最近 7 自然日跨年，前 7 天不重叠并排除过早及未来成绩', () => {
  const now = new Date(2027, 0, 3, 10);
  const start = new Date(2026, 11, 28).getTime();
  const priorStart = new Date(2026, 11, 21).getTime();
  const rows = [
    dated(1, 1, priorStart - 1), dated(2, 20000, priorStart), dated(3, 16000, start - 1),
    dated(4, 12000, start), dated(5, 14000, new Date(2027, 0, 1)), dated(6, 16000, now),
    dated(7, 1, now.getTime() + 1)
  ];
  const result = Review.build(rows, '7days', now);
  assert.equal(result.shown, 3);
  assert.equal(result.average, 14000);
  approx(result.stddev, Math.sqrt(8000000 / 3));
  assert.equal(result.comparison.previous.count, 2);
  assert.equal(result.comparison.previous.average, 18000);
  assert.equal(result.comparison.delta.average, -4000);
  assert.equal(result.dateRange.periodStart, start);
  assert.equal(result.dateRange.priorStart, priorStart);
  assert.equal(result.dateRange.priorEnd, start);
  assert.equal(result.dateRange.days, 7);
  assert.equal(result.dateRange.currentLabel, '最近 7 天');
  assert.equal(result.dateRange.priorLabel, '前 7 天');
  assert.deepEqual(result.points.map(point => point.uid), ['solve-4', 'solve-5', 'solve-6']);
});

test('日期范围在跨月及闰年二月仍按日历选择', () => {
  const result = Review.build([], '7days', new Date(2028, 2, 2, 8));
  assert.equal(result.dateRange.periodStart, new Date(2028, 1, 25).getTime());
  assert.equal(result.dateRange.priorStart, new Date(2028, 1, 18).getTime());
  const today = Review.build([], 'today', new Date(2028, 2, 1, 8));
  assert.equal(today.dateRange.priorStart, new Date(2028, 1, 29).getTime());
});

test('空本期与空前期均不构造平均、波动或 DNF 率为零', () => {
  const result = Review.build([], 'today', new Date(2026, 10, 14, 12));
  assert.equal(result.shown, 0);
  assert.equal(result.chartShown, 0);
  assert.equal(result.startIndex, 0);
  assert.equal(result.average, null);
  assert.equal(result.best, null);
  assert.equal(result.stddev, null);
  assert.equal(result.dnfRate, null);
  assert.equal(result.smallSample, true);
  assert.deepEqual(result.comparison.previous, {
    count: 0, validCount: 0, dnfCount: 0, plus2Count: 0, average: null, best: null,
    stddev: null, dnfRate: null, smallSample: true
  });
  assert.deepEqual(result.comparison.delta, { average: null, stddev: null, dnfRate: null });
});

test('全 DNF 和 +2 正确参与日期对比，小样本不冒充有效稳定性', () => {
  const now = new Date(2026, 10, 14, 12);
  const rows = [
    dated(1, 10000, new Date(2026, 10, 13, 12), 'dnf'),
    dated(2, 12000, new Date(2026, 10, 13, 13), 'dnf'),
    dated(3, 10000, new Date(2026, 10, 14, 8)),
    dated(4, 14000, new Date(2026, 10, 14, 9), '+2'),
    dated(5, 20000, new Date(2026, 10, 14, 10), 'dnf')
  ];
  const result = Review.build(rows, 'today', now);
  assert.equal(result.shown, 3);
  assert.equal(result.validCount, 2);
  assert.equal(result.dnfCount, 1);
  assert.equal(result.plus2Count, 1);
  assert.equal(result.average, 13000);
  assert.equal(result.stddev, 3000);
  assert.equal(result.dnfRate, 1 / 3);
  assert.equal(result.smallSample, true);
  assert.equal(result.comparison.previous.average, null);
  assert.equal(result.comparison.previous.stddev, null);
  assert.equal(result.comparison.previous.dnfRate, 1);
  assert.equal(result.comparison.delta.average, null);
  assert.equal(result.comparison.delta.stddev, null);
  approx(result.comparison.delta.dnfRate, -2 / 3);
  rows.slice(2).forEach(row => { row.penalty = 'dnf'; });
  const allDnf = Review.build(rows, 'today', now);
  assert.equal(allDnf.average, null);
  assert.equal(allDnf.stddev, null);
  assert.equal(allDnf.best, null);
  assert.equal(allDnf.dnfRate, 1);
  assert.equal(allDnf.comparison.delta.dnfRate, 0);
});

test('至少五条有效成绩才解除小样本标记，DNF 不增加有效样本数', () => {
  const now = new Date(2026, 10, 14, 12);
  const rows = Array.from({ length: 5 }, (_, i) => dated(i + 1, 12000, new Date(2026, 10, 14, 10), i === 4 ? 'dnf' : 'ok'));
  const four = Review.build(rows, 'today', now);
  assert.equal(four.smallSample, true);
  assert.equal(four.stddev, 0);
  rows[4].penalty = 'ok';
  const five = Review.build(rows, 'today', now);
  assert.equal(five.smallSample, false);
  assert.equal(five.stddev, 0);
});

test('日期过滤可跳过不连续日期和坏时间，保留全组序号与跨日 Ao5', () => {
  const now = new Date(2026, 10, 14, 12);
  const rows = [
    dated(1, 1000, new Date(2026, 10, 13, 21)), dated(2, 2000, new Date(2026, 10, 13, 22)),
    dated(3, 3000, new Date(2026, 10, 13, 23)), dated(4, 4000, new Date(2026, 10, 14, 0)),
    dated(5, 5000, new Date(2026, 10, 14, 1)), { ...rec(6, 6000), at: 'bad date' },
    dated(7, 7000, new Date(2026, 10, 14, 2)), { ...rec(8, 8000), at: null },
    { ...rec(9, 9000), at: '' }, { ...rec(10, 10000), at: 0 }
  ];
  const result = Review.build(rows, 'today', now);
  assert.equal(result.shown, 3);
  assert.equal(result.average, 16000 / 3);
  assert.deepEqual(result.points.map(point => point.number), [4, 5, 7]);
  assert.deepEqual(result.points.map(point => point.ao5), [null, 3000, 5000]);
  assert.equal(result.comparison.previous.count, 3);
  assert.equal(Review.build(rows, 50).shown, 10, '旧次数范围不新增日期过滤');
});

test('日期统计覆盖全部成绩，图表超过 100 条时仅保留最后 100 且序号和 Ao5 准确', () => {
  const now = new Date(2026, 10, 14, 12);
  const rows = Array.from({ length: 1003 }, (_, i) => dated(i + 1, (i + 1) * 1000, new Date(2026, 10, 14, 8)));
  const result = Review.build(rows, 'today', now);
  assert.equal(result.total, 1003);
  assert.equal(result.shown, 1003);
  assert.equal(result.validCount, 1003);
  assert.equal(result.chartShown, 100);
  assert.equal(result.points.length, 100);
  assert.equal(result.plotTruncated, true);
  assert.equal(result.startIndex, 903);
  assert.equal(result.average, 502000);
  assert.equal(result.best, 1000);
  assert.equal(result.points[0].number, 904);
  assert.equal(result.points[0].ao5, 902000);
  assert.equal(result.points[99].number, 1003);
  assert.equal(result.points[99].ao5, 1001000);
  approx(result.stddev, 1000 * Math.sqrt((1003 * 1003 - 1) / 12));
  for (const length of [99, 100, 101, 200]) {
    const boundary = Review.build(rows.slice(0, length), 'today', now);
    assert.equal(boundary.shown, length);
    assert.equal(boundary.chartShown, Math.min(length, 100));
    assert.equal(boundary.plotTruncated, length > 100);
    assert.equal(boundary.points[0].number, Math.max(1, length - 99));
    assert.equal(boundary.points.at(-1).number, length);
  }
});

test('本地时区决定自然日，带时区偏移的相同时间被一致解析', () => {
  const script = `
    const rows = ['2026-11-14T01:00:00.000Z', '2026-11-14T09:00:00.000+08:00'].map((at, i) =>
      ({ uid: 's' + i, ms: 10000, penalty: 'ok', at }));
    const result = Review.build(rows, 'today', Date.parse('2026-11-14T05:00:00.000Z'));
    console.log(JSON.stringify({ shown: result.shown, prior: result.comparison.previous.count,
      start: result.dateRange.periodStart, dayKey: result.dateRange.dayKey }));`;
  const shanghai = inTimezone('Asia/Shanghai', script);
  const newYork = inTimezone('America/New_York', script);
  assert.equal(shanghai.shown, 2);
  assert.equal(shanghai.prior, 0);
  assert.equal(shanghai.start, Date.parse('2026-11-13T16:00:00.000Z'));
  assert.equal(newYork.shown, 0);
  assert.equal(newYork.prior, 2);
  assert.equal(newYork.start, Date.parse('2026-11-14T05:00:00.000Z'));
  assert.equal(shanghai.dayKey, '2026-11-14');
  assert.equal(newYork.dayKey, '2026-11-14');
});

test('夏令时前后以前一自然日比较，春季 23 小时和秋季 25 小时都无遗漏', () => {
  const result = inTimezone('America/New_York', `
    function inspect(now, beforeStart, first, last, firstCurrent) {
      const rows = [beforeStart, first, last, firstCurrent].map((at, i) =>
        ({ uid: 's' + i, ms: 10000, penalty: 'ok', at }));
      const result = Review.build(rows, 'today', now);
      return { hours: (result.dateRange.priorEnd - result.dateRange.priorStart) / 3600000,
        prior: result.comparison.previous.count, current: result.shown };
    }
    const spring = inspect(new Date(2026, 2, 9, 12), '2026-03-08T04:59:59.999Z',
      '2026-03-08T05:00:00.000Z', '2026-03-09T03:59:59.999Z', '2026-03-09T04:00:00.000Z');
    const autumn = inspect(new Date(2026, 10, 2, 12), '2026-11-01T03:59:59.999Z',
      '2026-11-01T04:00:00.000Z', '2026-11-02T04:59:59.999Z', '2026-11-02T05:00:00.000Z');
    const week = Review.build([], '7days', new Date(2026, 2, 14, 12)).dateRange;
    console.log(JSON.stringify({ spring, autumn, week }));`);
  assert.deepEqual(result.spring, { hours: 23, prior: 2, current: 1 });
  assert.deepEqual(result.autumn, { hours: 25, prior: 2, current: 1 });
  assert.equal(result.week.periodStart, Date.parse('2026-03-08T05:00:00.000Z'));
  assert.equal(result.week.priorStart, Date.parse('2026-03-01T05:00:00.000Z'));
  assert.equal(result.week.priorEnd, result.week.periodStart);
});

test('日期模式不修改冻结记录或 now，非法 now 明确拒绝', () => {
  const now = new Date(2026, 10, 14, 12);
  const originalNow = now.getTime();
  const rows = Object.freeze([dated(1, 12345, now)].map(Object.freeze));
  const before = JSON.stringify(rows);
  const result = Review.build(rows, 'today', now);
  result.points[0].value = 1;
  assert.equal(now.getTime(), originalNow);
  assert.equal(JSON.stringify(rows), before);
  for (const invalid of [null, '2026-11-14', NaN, Infinity, new Date(NaN), {}]) {
    assert.throws(() => Review.build(rows, 'today', invalid), RangeError);
  }
});

test('午夜跳时地区按目标日重新归零，不把前期起点错移到凌晨一点', () => {
  const result = inTimezone('America/Sao_Paulo', `
    const now = new Date(2018, 10, 4, 12);
    const today = Review.build([], 'today', now).dateRange;
    const week = Review.build([], '7days', now).dateRange;
    console.log(JSON.stringify({ today, week }));`);
  assert.equal(result.today.periodStart, Date.parse('2018-11-04T03:00:00.000Z'));
  assert.equal(result.today.priorStart, Date.parse('2018-11-03T03:00:00.000Z'));
  assert.equal(result.week.periodStart, Date.parse('2018-10-29T03:00:00.000Z'));
  assert.equal(result.week.priorStart, Date.parse('2018-10-22T03:00:00.000Z'));
});

test('filterHistory 沿用日期边界并在次数模式下保留全部记录', () => {
  const now = new Date(2026, 10, 14, 12, 30, 0);
  const rows = [
    dated(1, 9000, new Date(2026, 10, 6, 23, 59, 59)),
    dated(2, 10000, new Date(2026, 10, 8, 0, 0, 0)),
    dated(3, 11000, new Date(2026, 10, 13, 23, 59, 59)),
    dated(4, 12000, new Date(2026, 10, 14, 0, 0, 0), '+2'),
    dated(5, 13000, now, 'dnf'),
    dated(6, 14000, now.getTime() + 1),
    { ...rec(7, 15000), at: 'not-a-date' }
  ];
  const today = Review.filterHistory(rows, 'today', now);
  assert.equal(today.range.mode, 'today');
  assert.deepEqual(today.entries.map(e => e.record.uid), ['solve-4', 'solve-5']);
  assert.deepEqual(today.entries.map(e => e.index), [3, 4]);

  const week = Review.filterHistory(rows, '7days', now);
  assert.equal(week.range.mode, '7days');
  assert.deepEqual(week.entries.map(e => e.record.uid), ['solve-2', 'solve-3', 'solve-4', 'solve-5']);

  const all = Review.filterHistory(rows, 50, now);
  assert.equal(all.range, null);
  assert.equal(all.entries.length, rows.length);
});

test('historyCsv 输出 UTF-8 BOM、CRLF、历史倒序、原始用时、中文状态与规范转义', () => {
  const t1 = new Date(2026, 10, 14, 8, 5, 9).toISOString();
  const t2 = new Date(2026, 10, 14, 9, 15, 30).toISOString();
  const t3 = new Date(2026, 10, 14, 10, 25, 45).toISOString();
  const entries = [
    { index: 0, record: { uid: 'a', ms: 12345, penalty: 'ok', at: t1, scramble: "R U R' U'" } },
    { index: 1, record: { uid: 'b', ms: 65432, penalty: '+2', at: t2, scramble: 'F, "U2"\nL' } },
    { index: 2, record: { uid: 'c', ms: 9876, penalty: 'dnf', at: t3, scramble: 'B2 D L2' } }
  ];
  const csv = Review.historyCsv(entries);
  assert.equal(csv.charCodeAt(0), 0xFEFF, '必须以 UTF-8 BOM 开头');
  assert.ok(csv.endsWith('\r\n'), '必须使用 CRLF 换行');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], '记录时间,原始用时,状态,打乱公式');
  assert.equal(lines[1], '2026-11-14 10:25:45,9.876,DNF,B2 D L2');
  assert.equal(lines[2], '2026-11-14 09:15:30,1:05.432,+2,"F, ""U2""\nL"');
  assert.equal(lines[3], "2026-11-14 08:05:09,12.345,正常,R U R' U'");
  assert.equal(lines[4], '');
});
