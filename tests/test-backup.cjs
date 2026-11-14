'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Backup = require('../src/backup.js');
const KEY = 'starcube.backup.v1';
const groups = [{ id: 'default', origin: 'builtin-default', name: '默认训练' }];
function records(count, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({ uid: 'solve-' + (index + offset), id: index + offset + 1,
    ms: 12000 + index, penalty: 'ok', scramble: 'R U', at: '2026-11-14T00:00:00.000Z', groupId: 'default' }));
}
function storage(initial) {
  const values = new Map(initial || []);
  return { values, reads: [], writes: [],
    getItem(key) { this.reads.push(key); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { this.writes.push([key, value]); values.set(key, value); } };
}
function test(name, check) { check(); console.log('PASS ' + name); }

test('CommonJS 与独立浏览器全局均可创建模型', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/backup.js'), 'utf8'), context);
  assert.equal(typeof context.StarCubeBackup.create, 'function');
  assert.equal(Backup.create({ storage: null }).observe([], []).due, false);
});

test('首次已有成绩在第 100 条触发提醒', () => {
  const model = Backup.create({ storage: storage() });
  assert.equal(model.observe(records(99), groups).due, false);
  assert.equal(model.observe(records(100), groups).due, true);
  assert.equal(model.observe(records(101), groups).pendingCount, 101);
  assert.equal(model.status().lastExportRequestedAt, null);
});

test('重复渲染和排序不重复计数且观察操作不写存储', () => {
  const store = storage();
  const model = Backup.create({ storage: store });
  const rows = records(100);
  const first = model.observe(rows, groups);
  for (let i = 0; i < 10; i++) assert.deepEqual(model.observe(rows.slice().reverse(), groups), first);
  assert.equal(store.writes.length, 0);
});

test('导出请求保存发起时间并在刷新后保持已备份状态', () => {
  const store = storage();
  const model = Backup.create({ storage: store });
  model.observe(records(100), groups);
  assert.deepEqual(model.markExportRequested(1700000000000), {
    due: false, changed: false, pendingCount: 0, lastExportRequestedAt: 1700000000000, metadataWritable: true
  });
  assert.deepEqual(Backup.create({ storage: store }).observe(records(100), groups), model.status());
});

test('导出后净新增第 100 条再次提醒', () => {
  const model = Backup.create({ storage: storage() });
  model.observe(records(100), groups);
  model.markExportRequested(1000);
  assert.equal(model.observe(records(199), groups).due, false);
  assert.equal(model.observe(records(200), groups).due, true);
  assert.equal(model.status().pendingCount, 100);
});

test('罚时、删除、相同数量的导入都标记为未导出更改', () => {
  const model = Backup.create({ storage: storage() });
  const rows = records(100);
  model.observe(rows, groups);
  model.markExportRequested(1000);
  for (const changed of [rows.map((row, i) => i ? row : { ...row, penalty: '+2' }),
    rows.map((row, i) => i ? row : { ...row, penalty: 'dnf' }), rows.slice(1), records(100, 500)]) {
    const status = model.observe(changed, groups);
    assert.equal(status.changed, true);
    assert.equal(status.due, false);
    assert.equal(status.pendingCount, 0);
  }
});

test('新增训练组和重命名能识别，排序变化不产生更改', () => {
  const model = Backup.create({ storage: storage() });
  const both = groups.concat({ id: 'other', origin: 'created-other', name: '练习' });
  model.observe(records(2), both);
  model.markExportRequested(1000);
  assert.equal(model.observe(records(2).reverse(), both.slice().reverse()).changed, false);
  assert.equal(model.observe(records(2), both.map(g => ({ ...g, name: g.name + '新' }))).changed, true);
  assert.equal(model.observe(records(2), both.concat({ id: 'third', origin: 'new', name: '训练' })).changed, true);
});

test('每个成绩导出字段的变化都参与指纹', () => {
  const model = Backup.create({ storage: storage() });
  const rows = records(1);
  model.observe(rows, groups);
  model.markExportRequested(1000);
  const changes = { uid: 'different', id: 7, ms: 999, penalty: '+2', scramble: 'U R',
    at: '2026-11-14T01:00:00.000Z', groupId: 'other' };
  for (const [key, value] of Object.entries(changes)) {
    assert.equal(model.observe([{ ...rows[0], [key]: value }], groups).changed, true, key);
  }
});

test('稍后提醒跨刷新保留，净增 100 条后再出现', () => {
  const store = storage();
  const model = Backup.create({ storage: store });
  model.observe(records(100), groups);
  assert.equal(model.snooze().due, false);
  assert.equal(model.status().pendingCount, 100);
  const reloaded = Backup.create({ storage: store });
  assert.equal(reloaded.observe(records(199), groups).due, false);
  assert.equal(reloaded.observe(records(200), groups).due, true);
  assert.equal(reloaded.status().lastExportRequestedAt, null);
});

test('删除后替换保留未导出标记，提醒采用明确的净增模型', () => {
  const model = Backup.create({ storage: storage() });
  model.observe(records(100), groups);
  model.markExportRequested(1000);
  model.observe(records(50), groups);
  assert.equal(model.observe(records(199, 1000), groups).due, false);
  assert.equal(model.observe(records(200, 1000), groups).due, true);
});

test('跨标签页读取最新导出且稍后提醒不会覆盖导出时间', () => {
  const store = storage();
  const a = Backup.create({ storage: store });
  const b = Backup.create({ storage: store });
  a.observe(records(100), groups);
  b.observe(records(100), groups);
  b.markExportRequested(2000);
  assert.equal(a.status().changed, false);
  assert.equal(a.snooze().lastExportRequestedAt, 2000);
  assert.equal(b.refresh().lastExportRequestedAt, 2000);
});

test('过期标签页不能降低另一个标签页的稍后提醒基线', () => {
  const store = storage();
  const a = Backup.create({ storage: store });
  const b = Backup.create({ storage: store });
  a.observe(records(100), groups);
  b.observe(records(200), groups);
  b.snooze();
  a.snooze();
  assert.equal(a.observe(records(299), groups).due, false);
  assert.equal(b.observe(records(300), groups).due, true);
});

test('延迟的旧时间导出标记不能覆盖较新的标记', () => {
  const store = storage();
  const a = Backup.create({ storage: store });
  const b = Backup.create({ storage: store });
  a.observe(records(100), groups);
  b.observe(records(101), groups);
  b.markExportRequested(2000);
  const raw = store.values.get(KEY);
  assert.equal(a.markExportRequested(1000).lastExportRequestedAt, 2000);
  assert.equal(store.values.get(KEY), raw);
});

test('配额失败不抛错也不破坏原元数据，当前标签页保留请求状态', () => {
  const store = storage();
  const model = Backup.create({ storage: store });
  model.observe(records(100), groups);
  model.markExportRequested(1000);
  const raw = store.values.get(KEY);
  store.setItem = () => { throw new Error('QuotaExceededError'); };
  model.observe(records(200), groups);
  assert.equal(model.markExportRequested(2000).metadataWritable, false);
  assert.equal(model.refresh().changed, false);
  assert.equal(model.status().lastExportRequestedAt, 2000);
  assert.equal(store.values.get(KEY), raw);
});

test('无法读取存储时不尝试写入，模型仍可使用', () => {
  let writes = 0;
  const model = Backup.create({ storage: { getItem() { throw new Error('SecurityError'); }, setItem() { writes++; } } });
  assert.equal(model.observe(records(100), groups).due, true);
  assert.equal(model.markExportRequested(1000).lastExportRequestedAt, 1000);
  assert.equal(model.status().metadataWritable, false);
  model.snooze();
  assert.equal(writes, 0);
});

test('只读存储仍读取已保存的导出标记', () => {
  const store = storage();
  const original = Backup.create({ storage: store });
  original.observe(records(100), groups);
  original.markExportRequested(1000);
  const readonly = Backup.create({ storage: { getItem: key => store.getItem(key) } });
  const result = readonly.observe(records(100), groups);
  assert.equal(result.lastExportRequestedAt, 1000);
  assert.equal(result.changed, false);
  assert.equal(result.metadataWritable, false);
});

test('坏元数据和未知版本保持原样，不能自动覆盖', () => {
  const badValues = ['not json', 'null', '[]', '{}', 'x'.repeat(2049),
    JSON.stringify({ version: 2, lastExportRequestedAt: null, exportedFingerprint: null, exportedCount: 0, reminderCount: 0 }),
    JSON.stringify({ version: 1, lastExportRequestedAt: null, exportedFingerprint: null, exportedCount: -1, reminderCount: 0 }),
    JSON.stringify({ version: 1, lastExportRequestedAt: null, exportedFingerprint: null, exportedCount: 1, reminderCount: 0 }),
    JSON.stringify({ version: 1, lastExportRequestedAt: 1000, exportedFingerprint: 'a'.repeat(32), exportedCount: 10, reminderCount: 0 }),
    JSON.stringify({ version: 1, lastExportRequestedAt: 'today', exportedFingerprint: 'a'.repeat(32), exportedCount: 0, reminderCount: 0 }),
    JSON.stringify({ version: 1, lastExportRequestedAt: 1000, exportedFingerprint: 'bad hash', exportedCount: 0, reminderCount: 0 })];
  for (const raw of badValues) {
    const store = storage([[KEY, raw]]);
    const model = Backup.create({ storage: store });
    assert.equal(model.observe(records(100), groups).metadataWritable, false);
    model.markExportRequested(1000);
    model.snooze();
    assert.equal(store.values.get(KEY), raw);
    assert.equal(store.writes.length, 0);
  }
});

test('元数据被外部修复后可恢复持久化', () => {
  const store = storage([[KEY, 'broken']]);
  const model = Backup.create({ storage: store });
  model.observe(records(100), groups);
  assert.equal(model.status().metadataWritable, false);
  store.values.delete(KEY);
  assert.equal(model.refresh().metadataWritable, true);
  model.markExportRequested(1000);
  assert.equal(store.writes.length, 1);
});

test('读写只触及专用键，不含原始成绩或完整 UID 集合', () => {
  const store = storage([['starcube.records.v1', 'keep']]);
  const model = Backup.create({ storage: store });
  const rows = records(2000);
  model.observe(rows, groups);
  model.markExportRequested(1000);
  model.snooze();
  assert.ok(store.values.get(KEY).length < 250);
  assert.ok(!store.values.get(KEY).includes('solve-'));
  assert.deepEqual([...new Set(store.reads)], [KEY]);
  assert.deepEqual([...new Set(store.writes.map(([key]) => key))], [KEY]);
  assert.equal(store.values.get('starcube.records.v1'), 'keep');
  assert.equal(rows[0].uid, 'solve-0');
  assert.equal(Object.keys(rows[0]).length, 7);
});

test('无效时间、阈值与缺少数据不会写出无效元数据', () => {
  const store = storage();
  const model = Backup.create({ storage: store, threshold: -1 });
  model.markExportRequested(1000);
  model.snooze();
  assert.equal(store.writes.length, 0);
  model.observe(records(99), groups);
  for (const value of [NaN, Infinity, -1, '1000', 1.5, 8640000000000001]) model.markExportRequested(value);
  assert.equal(store.writes.length, 0);
  assert.equal(model.status().due, false);
  assert.equal(model.observe(records(100), groups).due, true);
});

test('允许测试阈值和独立命名空间', () => {
  const store = storage();
  const model = Backup.create({ storage: store, threshold: 2, key: 'isolated.backup' });
  assert.equal(model.observe(records(1), []).due, false);
  assert.equal(model.observe(records(2), []).due, true);
  model.markExportRequested(1000);
  assert.ok(store.values.has('isolated.backup'));
  assert.ok(!store.values.has(KEY));
});
