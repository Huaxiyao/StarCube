'use strict';

const assert = require('assert');
const Store = require('../src/store.js');
const K = Store.keys;
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('PASS ' + name);
}
function record(id = 1, changes = {}) {
  return Object.assign({ id, ms: 10000 + id, penalty: 'ok', scramble: 'R U', at: '2026-10-25T00:00:00.000Z' }, changes);
}
function storage(initial = {}, options = {}) {
  const values = new Map(Object.entries(initial));
  let writes = 0;
  return {
    options, values,
    get length() { if (options.unreadable) throw new Error('SecurityError'); return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { if (options.unreadable) throw new Error('SecurityError'); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (options.readOnly || (options.failAfter !== undefined && writes >= options.failAfter)) throw new Error('QuotaExceededError');
      writes++;
      values.set(key, String(value));
    },
    removeItem(key) { if (options.readOnly) throw new Error('ReadOnlyError'); values.delete(key); },
    get writes() { return writes; }
  };
}

test('missing and unreadable storage are explicit and preserve source', () => {
  const absent = Store.create({ storage: null });
  assert.deepStrictEqual(absent.load().records, []);
  assert.strictEqual(absent.load().writable, false);
  assert.match(absent.load().notice, /不可用/);
  assert.throws(() => absent.put(record()), /不可用/);
  assert.throws(() => absent.remove('anything'), /不可用/);
  const raw = '[broken';
  const st = storage({ [K.legacy]: raw }, { unreadable: true });
  assert.strictEqual(Store.create({ storage: st }).load().writable, false);
  assert.strictEqual(st.values.get(K.legacy), raw);
});

test('mixed legacy data retains valid rows, original bytes and recoverable backup', () => {
  const raw = JSON.stringify([record(), { ...record(2), ms: 'damaged' }, record(3)]);
  const st = storage({ [K.legacy]: raw });
  const api = Store.create({ storage: st });
  const result = api.load();
  assert.strictEqual(result.records.length, 2);
  assert.strictEqual(result.writable, true);
  assert.match(result.notice, /隔离 1/);
  assert.strictEqual(st.getItem(K.legacy), raw);
  assert(api.backups().some(b => b.sourceKey === K.legacy && b.raw === raw));
  assert.match(api.load().notice, /隔离 1/); // Notice must survive successful migration.
});

test('malformed JSON and non-array legacy data are retained verbatim', () => {
  for (const raw of ['[not-json', '{"records":[]}']) {
    const st = storage({ [K.legacy]: raw });
    const api = Store.create({ storage: st });
    const result = api.load();
    assert.strictEqual(result.records.length, 0);
    assert.match(result.notice, /无法解析/);
    assert.strictEqual(st.getItem(K.legacy), raw);
    assert(api.backups().some(b => b.raw === raw));
  }
});

test('read-only storage displays valid legacy and v2 history and exports raw backup', () => {
  const raw = JSON.stringify([record(), { ...record(2), penalty: 'invalid' }]);
  const v2 = record(3, { uid: 'existing' });
  const st = storage({ [K.legacy]: raw, [K.itemPrefix + 'existing']: JSON.stringify(v2) }, { readOnly: true });
  const before = new Map(st.values);
  const api = Store.create({ storage: st });
  const result = api.load();
  assert.strictEqual(result.records.length, 2);
  assert.strictEqual(result.writable, false);
  assert.match(result.notice, /只保留在本次页面/);
  assert.match(result.notice, /隔离 1/);
  assert.deepStrictEqual(st.values, before);
  assert(api.exportData().backups.some(b => b.raw === raw));
});

test('two tabs migrate deterministically and do not duplicate legacy rows', () => {
  const raw = JSON.stringify([record(), record(2), record(2)]);
  const st = storage({ [K.legacy]: raw });
  const a = Store.create({ storage: st });
  const b = Store.create({ storage: st });
  const first = a.load();
  const second = b.load();
  assert.deepStrictEqual(first.records, second.records);
  assert.strictEqual(second.records.length, 3); // Actual duplicate rows in v1 retain occurrence identity.
  assert.strictEqual(new Set(second.records.map(r => r.uid)).size, 3);
  assert.strictEqual([...st.values.keys()].filter(k => k.startsWith(K.itemPrefix)).length, 3);
  assert.strictEqual(a.backups().length, 1);
  assert.strictEqual(st.getItem(K.legacy), raw);
});

test('independent first migrations against identical snapshots produce identical identities', () => {
  const raw = JSON.stringify([record(), record(2)]);
  const a = Store.create({ storage: storage({ [K.legacy]: raw }) });
  const b = Store.create({ storage: storage({ [K.legacy]: raw }) });
  assert.deepStrictEqual(a.load().records.map(r => r.uid), b.load().records.map(r => r.uid));
});

test('two tabs preserve both new records even when display IDs collide', () => {
  const st = storage();
  const a = Store.create({ storage: st });
  const b = Store.create({ storage: st });
  a.load(); b.load();
  const x = a.put(record(1, { ms: 11000 }));
  const y = b.put(record(1, { ms: 12000 }));
  assert.notStrictEqual(x.uid, y.uid);
  assert.deepStrictEqual(a.load().records.map(r => r.ms).sort(), [11000, 12000]);
  assert.deepStrictEqual(a.load().records, b.load().records);
});

test('tombstones prevent stale-tab writes and legacy migration from resurrecting records', () => {
  const raw = JSON.stringify([record()]);
  const st = storage({ [K.legacy]: raw });
  const a = Store.create({ storage: st });
  const b = Store.create({ storage: st });
  const old = a.load().records[0];
  b.load();
  b.remove(old.uid);
  assert.strictEqual(a.load().records.length, 0);
  assert.throws(() => a.put({ ...old, penalty: '+2' }), err => err.code === 'RECORD_DELETED');
  assert.strictEqual(b.load().records.length, 0);
  assert.strictEqual(st.getItem(K.legacy), raw);
  assert.notStrictEqual(st.getItem(K.itemPrefix + old.uid), null); // Raw record remains recoverable.
});

test('normal edits persist without a second copy and survive legacy reload', () => {
  const st = storage({ [K.legacy]: JSON.stringify([record()]) });
  const api = Store.create({ storage: st });
  const old = api.load().records[0];
  api.put({ ...old, penalty: '+2' });
  assert.strictEqual(api.load().records.length, 1);
  assert.strictEqual(api.load().records[0].penalty, '+2');
});

test('one damaged v2 item is isolated and never overwrites unaffected records', () => {
  const good = record(1, { uid: 'good' });
  const badRaw = '{invalid-json';
  const wrongUid = JSON.stringify(record(2, { uid: 'not-the-key' }));
  const st = storage({ [K.itemPrefix + 'good']: JSON.stringify(good), [K.itemPrefix + 'bad']: badRaw, [K.itemPrefix + 'other']: wrongUid });
  const api = Store.create({ storage: st });
  const loaded = api.load();
  assert.strictEqual(loaded.records.length, 1);
  assert.strictEqual(loaded.records[0].uid, 'good');
  assert.match(loaded.notice, /隔离 2/);
  assert(api.backups().some(b => b.raw === badRaw));
  assert.strictEqual(st.getItem(K.itemPrefix + 'bad'), badRaw);
  assert.match(api.load().notice, /隔离 2/);
});

test('strict invalid imports are rejected completely before writes', () => {
  const st = storage();
  const api = Store.create({ storage: st });
  for (const invalid of [record(0), record(1, { ms: -1 }), record(1, { ms: 1.5 }), record(1, { id: 1.2 }),
    record(1, { penalty: 'DNF' }), record(1, { at: 'yesterday' }), record(1, { at: '2026-02-30T00:00:00.000Z' }),
    record(1, { at: '2026-10-25T24:00:00.000Z' }),
    record(1, { uid: 'bad uid' }), record(1, { ms: Number.MAX_SAFE_INTEGER }), record(1, { scramble: null })]) {
    const before = new Map(st.values);
    assert.throws(() => api.importRecords([record(2), invalid]), err => err.code === 'INVALID_IMPORT');
    assert.deepStrictEqual(st.values, before);
  }
  assert.throws(() => api.importRecords({ format: 'other', version: 2, records: [] }), /格式或版本/);
  assert.throws(() => api.importRecords('{invalid'), /有效 JSON/);
});

test('import deduplicates repeat files and merges new rows', () => {
  const api = Store.create({ storage: storage() });
  const first = api.importRecords([record(), record(2), record(1)]);
  assert.strictEqual(first.added, 2);
  assert.strictEqual(first.skipped, 1);
  const second = api.importRecords([record(), record(3)]);
  assert.strictEqual(second.added, 1);
  assert.strictEqual(second.skipped, 1);
  assert.strictEqual(api.load().records.length, 3);
});

test('UID conflicts preserve both different scores and retry deterministically', () => {
  const api = Store.create({ storage: storage() });
  api.put(record(1, { uid: 'shared', ms: 10000 }));
  const result = api.importRecords([record(2, { uid: 'shared', ms: 11000 })]);
  assert.strictEqual(result.added, 1);
  assert.strictEqual(result.conflicts, 1);
  assert.strictEqual(api.load().records.length, 2);
  assert.strictEqual(api.load().records.find(r => r.uid === 'shared').ms, 10000);
  assert.strictEqual(api.importRecords([record(2, { uid: 'shared', ms: 11000 })]).added, 0);
});

test('import respects tombstones instead of reviving known deleted UIDs', () => {
  const api = Store.create({ storage: storage() });
  const saved = api.put(record());
  api.remove(saved.uid);
  const result = api.importRecords([saved]);
  assert.strictEqual(result.added, 0);
  assert.strictEqual(result.skipped, 1);
  assert.strictEqual(api.load().records.length, 0);
});

test('export and import round-trip live records and original raw backups', () => {
  const original = '[bad-json';
  const a = Store.create({ storage: storage({ [K.legacy]: original }) });
  a.load();
  a.put(record(1));
  a.put(record(2, { penalty: '+2' }));
  const exported = a.exportData();
  assert.strictEqual(exported.format, 'starcube');
  assert.strictEqual(exported.version, 3);
  const b = Store.create({ storage: storage() });
  b.importRecords(JSON.stringify(exported));
  assert.deepStrictEqual(b.exportData().records, exported.records);
  assert(b.backups().some(value => value.sourceKey === K.legacy && value.raw === original));
});

test('readonly import refuses writes while history stays visible', () => {
  const st = storage({ [K.legacy]: JSON.stringify([record()]) }, { readOnly: true });
  const api = Store.create({ storage: st });
  assert.throws(() => api.importRecords([record(2)]), /无法写入/);
  assert.strictEqual(api.load().records.length, 1);
});

test('partial quota failure is explicit and retry deduplicates already-saved records', () => {
  const st = storage();
  const api = Store.create({ storage: st });
  // import load writes one probe; then allow only one real record.
  st.options.failAfter = 2;
  assert.throws(() => api.importRecords([record(), record(2)]), err => err.partial && err.partial.added === 1 && /已写入 1/.test(err.message));
  delete st.options.failAfter;
  const retry = api.importRecords([record(), record(2)]);
  assert.strictEqual(retry.added, 1);
  assert.strictEqual(retry.skipped, 1);
  assert.strictEqual(api.load().records.length, 2);
});

test('stable order is ISO time, then display ID, then UID', () => {
  const api = Store.create({ storage: storage() });
  const t = '2026-10-25T01:00:00.000Z';
  api.put(record(2, { uid: 'z', at: t }));
  api.put(record(1, { uid: 'b', at: t }));
  api.put(record(1, { uid: 'a', at: t, ms: 12000 }));
  api.put(record(3, { uid: 'early', at: '2026-10-25T08:00:00+08:00' }));
  assert.deepStrictEqual(api.load().records.map(r => r.uid), ['early', 'a', 'b', 'z']);
});

test('old v1/v2 records resolve to default without changing migration IDs or raw source', () => {
  const oldStore = require('./fixtures/legacy-store-v2.js');
  const raw = JSON.stringify([record(1), record(2)]);
  const st = storage({ [K.legacy]: raw });
  const before = oldStore.create({ storage: st }).load().records;
  const api = Store.create({ storage: st });
  for (let i = 0; i < 3; i++) {
    const loaded = api.load();
    assert.deepStrictEqual(loaded.records.map(r => r.uid), before.map(r => r.uid));
    assert(loaded.records.every(r => r.groupId === 'default'));
    assert.strictEqual(loaded.groups.length, 1);
  }
  assert.strictEqual(st.getItem(K.legacy), raw);
  api.put({ ...api.load().records[0], penalty: '+2' });
  assert(api.backups().some(b => b.raw === JSON.stringify(before[0])));
});

const group = (id, name = '今晚练习', origin = 'origin-' + id) => ({ id, name, origin });
const backup = (groups, records = []) => ({ format: 'starcube', version: 3, groups, records });

test('group validation trims names, rejects empty, too long and malformed identity', () => {
  assert.strictEqual(Store.validateGroup(group('a', '  今晚练习  ')).name, '今晚练习');
  for (const name of ['', '  ', 'x'.repeat(41), 'a\nb']) assert.throws(() => Store.validateGroup(group('a', name)));
  assert.throws(() => Store.validateRecord(record(1, { groupId: '' })));
  assert.throws(() => Store.validateGroup(group('default', 'x', 'other')));
  assert.throws(() => Store.validateGroup(group('other', 'x', 'builtin-default')));
});

test('v3 roundtrip keeps empty groups, same-name groups and identical solves in different groups', () => {
  const a = Store.create({ storage: storage() });
  a.importRecords(backup([group('a'), group('b'), group('empty')], [record(1, { uid: 'a1', groupId: 'a' }), record(1, { uid: 'b1', groupId: 'b' })]));
  const exported = a.exportData();
  const b = Store.create({ storage: storage() });
  assert.strictEqual(b.importRecords(exported).added, 2);
  assert.strictEqual(b.importRecords(exported).added, 0);
  assert.deepStrictEqual(b.exportData().records, exported.records);
  assert.deepStrictEqual(b.exportData().groups, exported.groups);
});

test('group ID collision remaps records deterministically and preserves both trainings on retry', () => {
  const api = Store.create({ storage: storage() });
  api.putGroup(group('a', '本地'));
  api.put(record(1, { uid: 'r', groupId: 'a' }));
  const input = backup([group('a', '外部', 'foreign-a')], [record(1, { uid: 'r', groupId: 'a' })]);
  const result = api.importRecords(input);
  assert.strictEqual(result.groupConflicts, 1); assert.strictEqual(result.added, 1);
  const target = result.records.find(r => r.uid !== 'r').groupId;
  assert.notStrictEqual(target, 'a');
  assert.strictEqual(result.groups.find(g => g.id === target).name, '外部');
  assert.strictEqual(api.importRecords(input).added, 0);
  assert.strictEqual(api.load().groups.length, 3);
  const b = Store.create({ storage: storage() }); b.importRecords(api.exportData());
  assert.deepStrictEqual(b.load().records, api.load().records);
  api.putGroup({ ...api.load().groups.find(g => g.id === target), name: '本地新名' });
  api.importRecords(input);
  assert.strictEqual(api.load().groups.find(g => g.id === target).name, '本地新名');
});

test('missing and damaged groups recover without loss and export their original raw text', () => {
  const st = storage({ [K.groupPrefix + 'lost']: '{broken' });
  const api = Store.create({ storage: st });
  api.put(record(1, { uid: 'r', groupId: 'lost' }));
  const loaded = api.load();
  assert.strictEqual(loaded.records.length, 1); assert.match(loaded.notice, /恢复/);
  assert.match(loaded.groups.find(g => g.id === 'lost').name, /恢复的训练/);
  assert(api.exportData().backups.some(b => b.raw === '{broken'));
  const b = Store.create({ storage: storage() });
  const result = b.importRecords(backup([], [record(1, { uid: 'm', groupId: 'missing' })]));
  assert.strictEqual(result.recoveredGroups, 1); assert.strictEqual(result.added, 1);
  assert.strictEqual(b.importRecords(backup([], [record(1, { uid: 'm', groupId: 'missing' })])).added, 0);
});

test('complete validation rejects ambiguous group IDs before writing any import data', () => {
  const st = storage(); const api = Store.create({ storage: st });
  assert.throws(() => api.importRecords(backup([group('a'), group('a', 'other', 'other')], [record()])), /重复分组/);
  assert.strictEqual(st.writes, 0);
  assert.throws(() => api.importRecords(backup([group('a')], [record(1, { groupId: '*' })])), /分组/);
  assert.strictEqual(st.writes, 0);
  assert.throws(() => api.importRecords(backup([group('a'), group('b', 'different', 'origin-a')])), /来源身份/);
  assert.strictEqual(st.writes, 0);
});

test('renamed default group restores into fresh storage', () => {
  const api = Store.create({ storage: storage() });
  api.importRecords(backup([{ ...Store.defaultGroup(), name: '日常练习' }]));
  assert.strictEqual(api.load().groups[0].name, '日常练习');
});

test('two stores preserve concurrent group records and tombstones beat stale edits', () => {
  const st = storage(), a = Store.create({ storage: st }), b = Store.create({ storage: st });
  a.putGroup(group('a')); b.putGroup(group('b'));
  a.put(record(1, { uid: 'a1', groupId: 'a' })); b.put(record(1, { uid: 'b1', groupId: 'b' }));
  const stale = b.load().records.find(r => r.uid === 'a1'); a.remove('a1');
  assert.throws(() => b.put({ ...stale, penalty: '+2' }), /删除/);
  assert.deepStrictEqual(a.load().records.map(r => r.groupId), ['b']);
});

test('quota failure between group and record writes retries without orphan duplication', () => {
  const st = storage(); const api = Store.create({ storage: st });
  const data = backup([group('a')], [record(1, { uid: 'a1', groupId: 'a' })]);
  st.options.failAfter = 2;
  assert.throws(() => api.importRecords(data), err => err.partial?.groupsAdded === 1 && err.partial.added === 0);
  delete st.options.failAfter;
  assert.strictEqual(api.importRecords(data).added, 1);
  assert.strictEqual(api.importRecords(data).added, 0);
  assert.strictEqual(api.load().groups.length, 2);
  st.options.readOnly = true;
  assert.strictEqual(api.exportData().records[0].groupId, 'a');
});

console.log('\n' + passed + ' store regression groups passed.');
