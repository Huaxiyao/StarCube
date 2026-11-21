(function (root) {
  'use strict';

  var LEGACY_KEY = 'starcube.records.v1';
  var PREFIX = 'starcube.records.v2.';
  var ITEM_PREFIX = PREFIX + 'item.';
  var DELETED_PREFIX = PREFIX + 'deleted.';
  var RESTORED_PREFIX = PREFIX + 'restored.';
  var BACKUP_PREFIX = PREFIX + 'backup.';
  var GROUP_PREFIX = 'starcube.groups.v1.item.';
  var DEFAULT_GROUP = 'default';
  var MAX_SAFE = 9007199254740991;
  var serial = 0;

  function error(message, code) {
    var err = new Error(message);
    err.code = code || 'STORE_ERROR';
    return err;
  }

  function validUid(uid) {
    return typeof uid === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(uid);
  }

  function integer(value, min, max) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= min && value <= max;
  }

  var VALID_PUZZLES = ['333', '222', '444', '555', '333oh', 'pyram', 'skewb'];
  function defaultGroup() { return { id: DEFAULT_GROUP, origin: 'builtin-default', name: '默认训练' }; }
  function validateName(name) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 40 || /[\u0000-\u001f\u007f]/.test(name)) {
      throw error('训练名称需为 1–40 个字符，不能包含控制字符', 'INVALID_GROUP');
    }
    return name.trim();
  }
  function validateGroup(group) {
    if (!group || !validUid(group.id) || !validUid(group.origin)) throw error('训练分组身份无效', 'INVALID_GROUP');
    if ((group.id === DEFAULT_GROUP) !== (group.origin === 'builtin-default')) throw error('默认训练身份无效', 'INVALID_GROUP');
    var out = { id: group.id, origin: group.origin, name: validateName(group.name) };
    if (typeof group.puzzle === 'string' && VALID_PUZZLES.indexOf(group.puzzle) !== -1 && group.puzzle !== '333') {
      out.puzzle = group.puzzle;
    }
    return out;
  }
  function recoveredGroup(id) { return { id: id, origin: 'recovered-' + hash(id), name: '恢复的训练 · ' + id.slice(0, 12) }; }

  function validateRecord(record, options) {
    options = options || {};
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw error('成绩必须是对象', 'INVALID_RECORD');
    if (!integer(record.id, 1, MAX_SAFE)) throw error('成绩编号必须是正安全整数', 'INVALID_RECORD');
    if (!integer(record.ms, 0, MAX_SAFE - 2000)) throw error('成绩时间必须是非负安全整数毫秒', 'INVALID_RECORD');
    if (record.penalty !== 'ok' && record.penalty !== '+2' && record.penalty !== 'dnf') throw error('成绩罚时无效', 'INVALID_RECORD');
    if (typeof record.scramble !== 'string' || record.scramble.length > 10000) throw error('打乱文本无效或过长', 'INVALID_RECORD');
    if (typeof record.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(record.at)) {
      throw error('成绩日期必须是完整 ISO 时间', 'INVALID_RECORD');
    }
    var date = new Date(record.at);
    if (!isFinite(date.getTime())) throw error('成绩日期无效', 'INVALID_RECORD');
    var clockPart = record.at.slice(11, 19).split(':').map(Number);
    if (clockPart[0] > 23 || clockPart[1] > 59 || clockPart[2] > 59) throw error('成绩时刻无效', 'INVALID_RECORD');
    // Date parses impossible day-of-month values by rolling into the next month.
    var datePart = record.at.slice(0, 10).split('-').map(Number);
    var days = new Date(Date.UTC(datePart[0], datePart[1], 0)).getUTCDate();
    if (datePart[1] < 1 || datePart[1] > 12 || datePart[2] < 1 || datePart[2] > days) throw error('成绩日期不存在', 'INVALID_RECORD');
    if (record.uid !== undefined && !validUid(record.uid)) throw error('成绩 uid 无效', 'INVALID_RECORD');
    if (options.allowMissingUid === false && !validUid(record.uid)) throw error('成绩缺少 uid', 'INVALID_RECORD');
    if (record.groupId !== undefined && !validUid(record.groupId)) throw error('成绩分组 ID 无效', 'INVALID_RECORD');
    var normalized = { id: record.id, ms: record.ms, penalty: record.penalty, scramble: record.scramble, at: date.toISOString() };
    normalized.groupId = record.groupId === undefined ? DEFAULT_GROUP : record.groupId;
    if (record.uid !== undefined) normalized.uid = record.uid;
    return normalized;
  }

  function isValidRecord(record, options) {
    try { validateRecord(record, options); return true; } catch (err) { return false; }
  }

  // A deterministic 128-bit content fingerprint. It is not a security primitive.
  // Backup writes also compare the complete source key and raw text before reuse.
  function hash(text) {
    var seeds = [2166136261, 2246822507, 3266489909, 668265263];
    for (var p = 0; p < text.length; p++) {
      var c = text.charCodeAt(p);
      for (var i = 0; i < seeds.length; i++) {
        seeds[i] = Math.imul(seeds[i] ^ (c + i * 257), 16777619) >>> 0;
      }
    }
    return seeds.map(function (v) { return ('00000000' + v.toString(16)).slice(-8); }).join('');
  }

  function content(record, includeId) {
    var fields = includeId ? [record.id, record.ms, record.penalty, record.scramble, record.at] :
      [record.ms, record.penalty, record.scramble, record.at];
    // Keep default-group fingerprints byte-compatible with v2 migration IDs.
    if (record.groupId && record.groupId !== DEFAULT_GROUP) fields.push(record.groupId);
    return JSON.stringify(fields);
  }

  function compareRecords(a, b) {
    return a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
  }

  function newUid() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    serial++;
    return 'local-' + Date.now().toString(36) + '-' + serial.toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function create(options) {
    options = options || {};
    var storage = options.storage || null;
    var memoryBackups = new Map();

    function requireStorage() {
      if (!storage) throw error('浏览器存储不可用', 'STORAGE_UNAVAILABLE');
      return storage;
    }

    function keys() {
      var target = requireStorage();
      var result = [];
      var length = target.length;
      for (var i = 0; i < length; i++) {
        var key = target.key(i);
        if (typeof key === 'string') result.push(key);
      }
      return result;
    }

    function uidFromKey(key, prefix) {
      try {
        var uid = decodeURIComponent(key.slice(prefix.length));
        return validUid(uid) ? uid : null;
      } catch (err) { return null; }
    }

    function itemKey(uid) { return ITEM_PREFIX + encodeURIComponent(uid); }
    function deletedKey(uid) { return DELETED_PREFIX + encodeURIComponent(uid); }
    function restoredKey(uid, token) { return RESTORED_PREFIX + encodeURIComponent(uid) + '/' + encodeURIComponent(token); }
    function isDeleted(uid) {
      var target = requireStorage();
      var raw = target.getItem(deletedKey(uid));
      if (raw === null) return false;
      var deletion;
      try { deletion = JSON.parse(raw); } catch (err) { return true; }
      if (!deletion || deletion.uid !== uid || !validUid(deletion.token)) return true;
      var restoredRaw = target.getItem(restoredKey(uid, deletion.token));
      var restored;
      try { restored = JSON.parse(restoredRaw); } catch (err) { return true; }
      return !restored || restored.uid !== uid || restored.token !== deletion.token;
    }
    function groupKey(id) { return GROUP_PREFIX + encodeURIComponent(id); }
    function putGroup(group) {
      var normalized = validateGroup(group);
      var target = requireStorage();
      var raw = target.getItem(groupKey(group.id));
      if (raw !== null) {
        var prior;
        try { prior = validateGroup(JSON.parse(raw)); }
        catch (err) { rememberBackup(groupKey(group.id), raw, '损坏的分组原文', true); }
        if (prior && prior.origin !== normalized.origin) throw error('训练 ID 已被其他训练占用', 'GROUP_CONFLICT');
      }
      target.setItem(groupKey(group.id), JSON.stringify(normalized));
      return normalized;
    }

    function removeGroup(id) {
      if (!validUid(id)) throw error('训练分组 ID 无效', 'INVALID_GROUP');
      if (id === DEFAULT_GROUP) throw error('默认训练不可删除', 'INVALID_GROUP');
      var target = requireStorage();
      var loaded = load();
      if (!loaded.writable) throw error('存储无法写入，未删除训练分组', 'STORAGE_UNAVAILABLE');
      var group = loaded.groups.find(function (item) { return item.id === id; }) || null;
      var groupRecords = loaded.records.filter(function (record) { return record.groupId === id; });
      var removedRecords = 0;
      try {
        groupRecords.forEach(function (record) {
          remove(record.uid);
          removedRecords++;
        });
        // 先为组内全部成绩写入删除标记，再移除分组键，避免中途失败时剩余成绩变成「恢复的训练」。
        target.removeItem(groupKey(id));
      } catch (err) {
        err.partial = { groupId: id, removedRecords: removedRecords, totalRecords: groupRecords.length };
        err.message = '删除训练中断：已删除 ' + removedRecords + ' / ' + groupRecords.length + ' 条成绩；' + err.message;
        throw err;
      }
      return { groupId: id, group: group, removedRecords: removedRecords };
    }

    function probe() {
      if (!storage) return false;
      var key = PREFIX + 'probe.' + newUid();
      try {
        storage.setItem(key, '1');
        storage.removeItem(key);
        return true;
      } catch (err) { return false; }
    }

    function rememberBackup(sourceKey, raw, reason, writable) {
      var identity = JSON.stringify([sourceKey, raw]);
      var base = BACKUP_PREFIX + hash(identity);
      var backup = { sourceKey: sourceKey, raw: raw, reason: reason, at: new Date().toISOString() };
      memoryBackups.set(identity, backup);
      if (!writable) return false;
      var key = base;
      for (var suffix = 0; suffix < 100; suffix++) {
        var old = storage.getItem(key);
        if (old === null) {
          storage.setItem(key, JSON.stringify(backup));
          return true;
        }
        try {
          var prior = JSON.parse(old);
          if (prior.sourceKey === sourceKey && prior.raw === raw) return true;
        } catch (err) {}
        key = base + '.' + (suffix + 1);
      }
      throw error('备份键冲突，原始数据仍被保留', 'BACKUP_CONFLICT');
    }

    function load() {
      var writable = probe();
      var notices = [];
      if (!storage) return { records: [], groups: [defaultGroup()], writable: false, notice: '浏览器存储不可用，当前成绩只保留在本次页面中' };
      var allKeys;
      try { allKeys = keys(); } catch (err) {
        return { records: [], groups: [defaultGroup()], writable: false, notice: '无法读取浏览器存储，原始数据未被改写' };
      }
      var deleted = new Set();
      var existingItemIds = new Set();
      var records = new Map();
      var groups = new Map([[DEFAULT_GROUP, defaultGroup()]]);
      var damaged = 0;
      var readFailures = 0;
      var migrated = 0;

      function backup(sourceKey, raw, reason) {
        try { rememberBackup(sourceKey, raw, reason, writable); }
        catch (err) { writable = false; }
      }

      allKeys.forEach(function (key) {
        if (key.indexOf(GROUP_PREFIX) === 0) {
          var raw;
          try { raw = storage.getItem(key); } catch (err) { readFailures++; return; }
          if (raw === null) return;
          try {
            var group = validateGroup(JSON.parse(raw));
            if (group.id !== uidFromKey(key, GROUP_PREFIX)) throw error('分组 ID 与键不一致');
            groups.set(group.id, group);
          } catch (err) { damaged++; backup(key, raw, '分组损坏：' + err.message); }
        }
        if (key.indexOf(DELETED_PREFIX) === 0) {
          var uid = uidFromKey(key, DELETED_PREFIX);
          if (uid) {
            try { if (isDeleted(uid)) deleted.add(uid); }
            catch (err) { deleted.add(uid); readFailures++; }
          }
        }
        if (key.indexOf(ITEM_PREFIX) === 0) {
          var itemUid = uidFromKey(key, ITEM_PREFIX);
          if (itemUid) existingItemIds.add(itemUid);
        }
      });

      allKeys.forEach(function (key) {
        if (key.indexOf(ITEM_PREFIX) !== 0) return;
        var uid = uidFromKey(key, ITEM_PREFIX);
        if (uid && deleted.has(uid)) return;
        var raw;
        try { raw = storage.getItem(key); } catch (err) { readFailures++; return; }
        if (raw === null) return;
        try {
          var parsed = JSON.parse(raw);
          var normalized = validateRecord(parsed, { allowMissingUid: false });
          if (parsed.groupId === undefined) backup(key, raw, '升级前成绩原文');
          if (normalized.uid !== uid) throw error('uid 与存储键不一致');
          records.set(uid, normalized);
        } catch (err) {
          damaged++;
          backup(key, raw, '成绩条目损坏：' + err.message);
        }
      });

      var legacyRaw;
      try { legacyRaw = storage.getItem(LEGACY_KEY); } catch (err) { readFailures++; }
      if (typeof legacyRaw === 'string') {
        backup(LEGACY_KEY, legacyRaw, '旧版成绩原文');
        var legacy;
        try {
          legacy = JSON.parse(legacyRaw);
          if (!Array.isArray(legacy)) throw error('旧版记录不是数组');
        } catch (err) {
          damaged++;
          notices.push('旧版成绩无法解析，原文已保留，可从备份导出');
          legacy = [];
        }
        var occurrences = new Map();
        legacy.forEach(function (value) {
          var normalized;
          try { normalized = validateRecord(value); }
          catch (err) { damaged++; return; }
          var body = content(normalized, true);
          var occurrence = (occurrences.get(body) || 0) + 1;
          occurrences.set(body, occurrence);
          normalized.uid = 'legacy-' + hash(body) + '-' + occurrence;
          if (deleted.has(normalized.uid) || existingItemIds.has(normalized.uid) || records.has(normalized.uid)) return;
          records.set(normalized.uid, normalized);
          if (writable) {
            try {
              // Deterministic keys make concurrent first migration idempotent.
              if (!isDeleted(normalized.uid) && storage.getItem(itemKey(normalized.uid)) === null) {
                storage.setItem(itemKey(normalized.uid), JSON.stringify(normalized));
                migrated++;
              }
            } catch (err) { writable = false; }
          }
        });
      }
      if (damaged) notices.push('已隔离 ' + damaged + ' 处损坏数据，其余有效成绩仍可使用；原文可从备份导出');
      var recovered = 0;
      records.forEach(function (record) {
        if (!groups.has(record.groupId)) { groups.set(record.groupId, recoveredGroup(record.groupId)); recovered++; }
      });
      if (recovered) notices.push('已恢复 ' + recovered + ' 个缺失的训练分组，成绩完整保留');
      if (readFailures) { writable = false; notices.push('部分存储读取失败，原始数据未被改写'); }
      if (migrated) notices.push('已迁移 ' + migrated + ' 条旧版成绩，旧版原文和备份均保留');
      if (!writable) notices.push('存储无法写入，已显示可读取的历史；新成绩只保留在本次页面中');
      return { records: Array.from(records.values()).sort(compareRecords), groups: Array.from(groups.values()), writable: writable, notice: notices.join('；') };
    }

    function put(record) {
      var normalized = validateRecord(record);
      if (!normalized.uid) normalized.uid = newUid();
      var target = requireStorage();
      if (isDeleted(normalized.uid)) throw error('该成绩已在其他页面删除，未恢复旧记录', 'RECORD_DELETED');
      var oldRaw = target.getItem(itemKey(normalized.uid));
      if (oldRaw !== null) {
        try { if (JSON.parse(oldRaw).groupId === undefined) rememberBackup(itemKey(normalized.uid), oldRaw, '升级前成绩原文', true); }
        catch (err) { if (err instanceof SyntaxError) rememberBackup(itemKey(normalized.uid), oldRaw, '损坏的成绩原文', true); else throw err; }
      }
      target.setItem(itemKey(normalized.uid), JSON.stringify(normalized));
      return normalized;
    }

    function remove(uid) {
      if (!validUid(uid)) throw error('成绩 uid 无效', 'INVALID_RECORD');
      var tombstone = { uid: uid, deletedAt: new Date().toISOString(), token: newUid() };
      requireStorage().setItem(deletedKey(uid), JSON.stringify(tombstone));
      return tombstone;
    }

    function restore(uid, token) {
      if (!validUid(uid) || !validUid(token)) throw error('撤销删除凭据无效', 'INVALID_RESTORE');
      var target = requireStorage();
      var deletion;
      try { deletion = JSON.parse(target.getItem(deletedKey(uid))); }
      catch (err) {
        if (!(err instanceof SyntaxError)) throw err;
      }
      if (!deletion || deletion.uid !== uid || deletion.token !== token) {
        throw error('该成绩的删除状态已变化，无法撤销这次删除', 'RESTORE_CONFLICT');
      }
      var record;
      var recordRaw = target.getItem(itemKey(uid));
      try {
        record = validateRecord(JSON.parse(recordRaw), { allowMissingUid: false });
        if (record.uid !== uid) throw error('成绩 uid 与存储键不一致');
      } catch (err) {
        throw error('原始成绩无法恢复，现有数据仍被保留', 'RECORD_UNAVAILABLE');
      }
      // Keep the deletion itself intact. A restore acknowledges one unique
      // deletion, so a concurrent/newer delete always wins over an old undo.
      // Never rewrite the retained record with a potentially stale UI copy.
      if (isDeleted(uid)) {
        target.setItem(restoredKey(uid, token), JSON.stringify({ uid: uid, token: token, restoredAt: new Date().toISOString() }));
      }
      if (isDeleted(uid)) throw error('该成绩已再次删除，未撤销较新的删除', 'RESTORE_CONFLICT');
      return record;
    }

    function backups() {
      var result = new Map(memoryBackups);
      if (storage) {
        try {
          keys().forEach(function (key) {
            if (key.indexOf(BACKUP_PREFIX) !== 0) return;
            try {
              var value = JSON.parse(storage.getItem(key));
              if (value && typeof value.sourceKey === 'string' && typeof value.raw === 'string') {
                result.set(JSON.stringify([value.sourceKey, value.raw]), value);
              }
            } catch (err) {}
          });
        } catch (err) {}
      }
      return Array.from(result.values()).sort(function (a, b) { return a.sourceKey < b.sourceKey ? -1 : a.sourceKey > b.sourceKey ? 1 : a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0; });
    }

    function importRecords(input) {
      if (typeof input === 'string') {
        try { input = JSON.parse(input); } catch (err) { throw error('导入文件不是有效 JSON', 'INVALID_IMPORT'); }
      }
      var inputBackups = [];
      var inputGroups = [];
      var rawRecords = input;
      if (!Array.isArray(input)) {
        if (!input || input.format !== 'starcube' || (input.version !== 2 && input.version !== 3) || !Array.isArray(input.records)) throw error('导入文件格式或版本不受支持', 'INVALID_IMPORT');
        if (input.version === 3) {
          if (!Array.isArray(input.groups)) throw error('备份缺少分组列表', 'INVALID_IMPORT');
          inputGroups = input.groups.map(validateGroup);
          var seenGroups = new Set();
          var seenOrigins = new Set();
          inputGroups.forEach(function (g) {
            if (seenGroups.has(g.id) || seenOrigins.has(g.origin)) throw error('备份包含重复分组 ID 或来源身份，无法确定归属', 'INVALID_IMPORT');
            seenGroups.add(g.id); seenOrigins.add(g.origin);
          });
        }
        rawRecords = input.records;
        if (input.backups !== undefined) {
          if (!Array.isArray(input.backups)) throw error('导入备份格式无效', 'INVALID_IMPORT');
          inputBackups = input.backups;
        }
      }
      // Complete validation precedes every import write.
      var incoming = rawRecords.map(function (value, index) {
        try { return validateRecord(value); }
        catch (err) { throw error('第 ' + (index + 1) + ' 条导入成绩无效：' + err.message, 'INVALID_IMPORT'); }
      });
      inputBackups.forEach(function (backup) {
        if (!backup || typeof backup.sourceKey !== 'string' || typeof backup.raw !== 'string' ||
            (backup.reason !== undefined && typeof backup.reason !== 'string')) throw error('导入备份内容无效', 'INVALID_IMPORT');
      });
      var loaded = load();
      if (!loaded.writable) throw error('存储无法写入，未导入成绩；请先导出当前数据备份', 'STORAGE_UNAVAILABLE');
      var byUid = new Map();
      var byContent = new Set();
      loaded.records.forEach(function (record) { byUid.set(record.uid, record); byContent.add(content(record, false)); });
      var progress = { added: 0, skipped: 0, conflicts: 0 };
      progress.groupsAdded = 0;
      progress.groupConflicts = 0;
      progress.recoveredGroups = 0;
      var groupMap = new Map(loaded.groups.map(function (g) { return [g.id, g]; }));
      var incomingGroups = new Map(inputGroups.map(function (g) { return [g.id, g]; }));
      incoming.forEach(function (r) {
        if (!incomingGroups.has(r.groupId)) {
          incomingGroups.set(r.groupId, r.groupId === DEFAULT_GROUP ? defaultGroup() : recoveredGroup(r.groupId));
          if (r.groupId !== DEFAULT_GROUP) progress.recoveredGroups++;
        }
      });
      var remap = new Map();
      try {
        incomingGroups.forEach(function (group, originalId) {
          var targetId = originalId, prior = groupMap.get(targetId), suffix = 0;
          var sameIdentity = Array.from(groupMap.values()).find(function (g) { return g.origin === group.origin; });
          if (sameIdentity) { targetId = sameIdentity.id; prior = sameIdentity; }
          if (prior && prior.origin !== group.origin) {
            progress.groupConflicts++;
            do {
              targetId = 'import-group-' + hash(JSON.stringify([originalId, group.origin, suffix++]));
              prior = groupMap.get(targetId);
            } while (prior && prior.origin !== group.origin);
          }
          remap.set(originalId, targetId);
          if (targetId === DEFAULT_GROUP && group.name !== '默认训练' && storage.getItem(groupKey(DEFAULT_GROUP)) === null) prior = null;
          // Names are mutable; the local name wins for the same immutable identity.
          if (!prior) {
            var savedGroup = putGroup({ id: targetId, origin: group.origin, name: group.name });
            groupMap.set(targetId, savedGroup); progress.groupsAdded++;
          }
        });
        incoming.forEach(function (record) {
          record.groupId = remap.get(record.groupId);
          var body = content(record, false);
          if (byContent.has(body)) { progress.skipped++; return; }
          var originalUid = record.uid;
          if (!record.uid) record.uid = 'import-' + hash(body);
          if (isDeleted(record.uid)) { progress.skipped++; return; }
          var prior = byUid.get(record.uid);
          if (prior && content(prior, true) !== content(record, true)) {
            progress.conflicts++;
            record.uid = 'import-' + hash(originalUid + '\n' + content(record, true));
            var index = 0;
            while (byUid.has(record.uid) && content(byUid.get(record.uid), true) !== content(record, true)) {
              index++;
              record.uid = 'import-' + hash(originalUid + '\n' + content(record, true) + '\n' + index);
            }
            if (isDeleted(record.uid)) { progress.skipped++; return; }
          }
          if (byUid.has(record.uid)) { progress.skipped++; return; }
          var saved = put(record);
          byUid.set(saved.uid, saved);
          byContent.add(body);
          progress.added++;
        });
        inputBackups.forEach(function (backup) {
          rememberBackup(backup.sourceKey, backup.raw, backup.reason || '导入的原始备份', true);
        });
      } catch (err) {
        err.partial = Object.assign({}, progress);
        err.message = '导入中断：已写入 ' + progress.added + ' 条成绩、' + progress.groupsAdded + ' 个训练，可重试去重；' + err.message;
        throw err;
      }
      progress.records = Array.from(byUid.values()).sort(compareRecords);
      progress.groups = Array.from(groupMap.values());
      return progress;
    }

    function exportData() {
      var result = load();
      return { format: 'starcube', version: 3, groups: result.groups, records: result.records, backups: backups() };
    }

    function readRaw(key) {
      var target = requireStorage();
      if (key !== undefined) return target.getItem(String(key));
      var result = {};
      keys().forEach(function (name) {
        if (name === LEGACY_KEY || name.indexOf(PREFIX) === 0 || name.indexOf(GROUP_PREFIX) === 0) result[name] = target.getItem(name);
      });
      return result;
    }

    return { load: load, put: put, putGroup: putGroup, removeGroup: removeGroup, remove: remove, restore: restore, importRecords: importRecords, backups: backups, exportData: exportData, readRaw: readRaw };
  }

  var api = { create: create, validateRecord: validateRecord, isValidRecord: isValidRecord,
    validateGroup: validateGroup, validateName: validateName, newUid: newUid, defaultGroup: defaultGroup, defaultGroupId: DEFAULT_GROUP,
    compareRecords: compareRecords, keys: { legacy: LEGACY_KEY, itemPrefix: ITEM_PREFIX, deletedPrefix: DELETED_PREFIX, restoredPrefix: RESTORED_PREFIX, backupPrefix: BACKUP_PREFIX, groupPrefix: GROUP_PREFIX } };
  root.StarCubeStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
