'use strict';

const assert = require('assert');
const S = require('../src/stats.js');

function rec(ms, penalty) {
  return { id: 0, ms: ms, penalty: penalty || 'ok', scramble: 'R U', at: '2026-10-20T00:00:00.000Z' };
}
function approx(actual, expected, label) {
  assert.strictEqual(typeof actual, 'number', label + ' 应为数字，实际 ' + actual);
  assert.ok(Math.abs(actual - expected) < 0.5, label + ' 期望 ' + expected + '，实际 ' + actual);
  console.log('PASS ' + label + ' = ' + actual.toFixed(3));
}

// 设计文档第 10 节样本 1：12.000, DNF, 13.000, 14.000(+2), 11.000
const s1 = [rec(12000), rec(0, 'dnf'), rec(13000), rec(14000, '+2'), rec(11000)];
approx(S.aoN(s1, 5), (12000 + 13000 + 16000) / 3, '样本1 Ao5');

// 设计文档第 10 节样本 2：DNF, DNF, 12.000, 13.000, 14.000
const s2 = [rec(0, 'dnf'), rec(0, 'dnf'), rec(12000), rec(13000), rec(14000)];
assert.strictEqual(S.aoN(s2, 5), 'DNF', '样本2 Ao5 应为 DNF');
console.log('PASS 样本2 Ao5 = DNF');

// 不足 N 条
assert.strictEqual(S.aoN([rec(1000), rec(2000), rec(3000), rec(4000)], 5), null);
console.log('PASS 不足 5 条 Ao5 = null');
assert.strictEqual(S.aoN([], 5), null);
console.log('PASS 空记录 Ao5 = null');

// 全部 DNF
assert.strictEqual(S.aoN(s2.slice(0, 2).concat([rec(0, 'dnf'), rec(0, 'dnf'), rec(0, 'dnf')]), 5), 'DNF');
console.log('PASS 全 DNF Ao5 = DNF');

// 单个 DNF：去掉最好与 DNF 后剩余正常
const oneDnf = [rec(10000), rec(11000), rec(12000), rec(13000), rec(0, 'dnf')];
approx(S.aoN(oneDnf, 5), (11000 + 12000 + 13000) / 3, '单 DNF Ao5 去掉 DNF 与最好');

// Ao12：构造 12 条，验证取最近 12 条并去尾
const twelve = [];
for (let i = 1; i <= 12; i++) twelve.push(rec(i * 1000));
approx(S.aoN(twelve, 12), (2 + 11) * 1000 / 2, 'Ao12 去尾平均');

// Ao50 / Ao100 数据不足
assert.strictEqual(S.aoN(twelve, 50), null);
assert.strictEqual(S.aoN(twelve, 100), null);
console.log('PASS Ao50/Ao100 数据不足 = null');

// 长平均两端各去 5%，向上取整；非对称异常值避免错误去尾恰好抵消。
const fifty = [].concat(Array(3).fill(1000), Array(44).fill(10000), Array(3).fill(100000)).map((ms) => rec(ms));
const hundred = [].concat(Array(5).fill(1000), Array(90).fill(10000), Array(5).fill(100000)).map((ms) => rec(ms));
approx(S.aoN(fifty, 50), 10000, 'Ao50 两端各去 3 条');
approx(S.aoN(hundred, 100), 10000, 'Ao100 两端各去 5 条');
const fiftyThreeDnf = Array.from({ length: 47 }, () => rec(10000)).concat(Array.from({ length: 3 }, () => rec(0, 'dnf')));
approx(S.aoN(fiftyThreeDnf, 50), 10000, 'Ao50 三条 DNF 被去尾');
fiftyThreeDnf[0] = rec(0, 'dnf');
assert.strictEqual(S.aoN(fiftyThreeDnf, 50), 'DNF');
console.log('PASS Ao50 四条 DNF 平均为 DNF');

// 总平均：排除 DNF，+2 计入
approx(S.overallAverage(s1), (12000 + 13000 + 16000 + 11000) / 4, '总平均');
assert.strictEqual(S.overallAverage([rec(0, 'dnf')]), null);
console.log('PASS 全 DNF 总平均 = null');

// 单次 PB
const pb = S.personalBest(s1);
assert.strictEqual(pb.value, 11000);
assert.strictEqual(pb.record.ms, 11000);
const pbPlus = S.personalBest([rec(10000), rec(9000, '+2'), rec(9500)]);
assert.strictEqual(pbPlus.value, 9500);
console.log('PASS 单次 PB = 11.000 / +2 记录有效值 11.000 参与比较');

// 最佳 Ao5：遍历窗口
const best = [rec(20000), rec(21000), rec(22000), rec(23000), rec(24000), rec(1000), rec(1000), rec(1000), rec(1000), rec(1000)];
const bestValue = S.bestAo5(best);
approx(bestValue, 1000, '最佳 Ao5 取最小窗口');
assert.strictEqual(S.bestAo5([rec(1000), rec(2000), rec(3000), rec(4000)]), null);
console.log('PASS 最佳 Ao5 不足 5 条 = null');

// 观察判定边界
assert.strictEqual(S.inspectionPenalty(14999, true), 'ok');
assert.strictEqual(S.inspectionPenalty(15000, true), '+2');
assert.strictEqual(S.inspectionPenalty(15001, true), '+2');
assert.strictEqual(S.inspectionPenalty(16999, true), '+2');
assert.strictEqual(S.inspectionPenalty(17000, true), 'dnf');
assert.strictEqual(S.inspectionPenalty(17001, true), 'dnf');
assert.strictEqual(S.inspectionPenalty(99999, false), 'ok');
console.log('PASS 观察判定边界：15.000 起 +2，17.000 起 DNF');

// 格式化
assert.strictEqual(S.formatMs(12345), '12.345');
assert.strictEqual(S.formatMs(60000), '1:00.000');
assert.strictEqual(S.formatMs(62345), '1:02.345');
assert.strictEqual(S.formatResult(rec(14000, '+2')), '16.000+');
assert.strictEqual(S.formatResult(rec(0, 'dnf')), 'DNF');
console.log('PASS 三位小数 / m:ss.mmm / +2 后缀 / DNF 显示');

// 空列表
assert.strictEqual(S.personalBest([]), null);
assert.strictEqual(S.overallAverage([]), null);
assert.strictEqual(S.bestAo5([]), null);
console.log('PASS 空列表 PB/总平均/最佳 Ao5 = null');

console.log('\n全部统计校验通过');
