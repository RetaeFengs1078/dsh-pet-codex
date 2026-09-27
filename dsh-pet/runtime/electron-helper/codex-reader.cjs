// 本机 Codex 配额读取器。只读会话日志，不使用 DSH、网络或 API Key。
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const WINDOW_KINDS = new Map([
  [300, 'fiveHour'],
  [10080, 'weekly'],
]);

function codexHome(env = process.env, home = os.homedir()) {
  const configured = String(env.CODEX_HOME || '').trim();
  return path.resolve(configured || path.join(env.USERPROFILE || home, '.codex'));
}

function finiteNumber(raw, keys) {
  for (const key of keys) {
    const value = raw[key];
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeWindow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const minutes = finiteNumber(raw, ['window_minutes', 'windowMinutes', 'period_minutes']);
  const kind = WINDOW_KINDS.get(minutes);
  if (!kind) return null;
  let used = finiteNumber(raw, ['used_percent', 'usedPercent', 'used_pct', 'usage_percent']);
  const remaining = finiteNumber(raw, ['remaining_percent', 'remainingPercent', 'remaining_pct']);
  if (used === null && remaining !== null) used = 100 - remaining;
  if (used === null || used < 0 || used > 100) return null;
  const reset = raw.resets_at ?? raw.reset_at ?? raw.resetAt ?? raw.reset_time;
  let resetAt = null;
  if (typeof reset === 'number' && Number.isFinite(reset)) resetAt = reset < 1e12 ? reset * 1000 : reset;
  else if (typeof reset === 'string' && reset) {
    const numeric = Number(reset);
    resetAt = Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : Date.parse(reset);
    if (!Number.isFinite(resetAt)) resetAt = null;
  }
  if (resetAt !== null && (!Number.isFinite(resetAt) || Math.abs(resetAt) > 8.64e15)) resetAt = null;
  return { kind, windowMinutes: minutes, usedPercent: used, remainingPercent: 100 - used, resetAt };
}

function normalizeRateLimits(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const windows = {};
  for (const item of [raw.primary, raw.secondary]) {
    const window = normalizeWindow(item);
    if (window) windows[window.kind] = window;
  }
  return Object.keys(windows).length ? windows : null;
}

function parseSnapshotLine(line) {
  if (!line.startsWith('{') || !line.includes('rate_limits')) return null;
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }
  if (record?.type !== 'event_msg' || record.payload?.type !== 'token_count') return null;
  const windows = normalizeRateLimits(record.payload.rate_limits ?? record.payload.info?.rate_limits);
  const timestamp = Date.parse(record.timestamp);
  return windows && Number.isFinite(timestamp) ? { timestamp, windows } : null;
}

async function sessionFiles(home) {
  const files = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && /^rollout-.*\.jsonl$/i.test(entry.name)) files.push(file);
    }
  }
  await walk(path.join(home, 'sessions'));
  await walk(path.join(home, 'archived_sessions'));
  return files;
}

class CodexReader {
  constructor(home = codexHome()) {
    this.home = home;
    this.cache = new Map();
    this.pending = null;
  }

  refresh() {
    if (!this.pending)
      this.pending = this.scan().finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  async scan() {
    const files = await sessionFiles(this.home);
    const active = new Set(files);
    let newest = null;
    for (const file of files) {
      let stat;
      try {
        stat = await fs.promises.stat(file);
      } catch {
        continue;
      }
      let item = this.cache.get(file);
      if (!item || item.size !== stat.size || item.mtimeMs !== stat.mtimeMs) {
        let snapshot = null;
        const stream = fs.createReadStream(file, { encoding: 'utf8' });
        try {
          for await (const line of readline.createInterface({ input: stream, crlfDelay: Infinity })) {
            const candidate = parseSnapshotLine(line);
            if (candidate && (!snapshot || candidate.timestamp >= snapshot.timestamp)) snapshot = candidate;
          }
        } catch {
          /* Codex 正在写入时，下次刷新再读取。 */
        } finally {
          stream.destroy();
        }
        item = { size: stat.size, mtimeMs: stat.mtimeMs, snapshot };
        this.cache.set(file, item);
      }
      if (item.snapshot && (!newest || item.snapshot.timestamp >= newest.timestamp)) newest = item.snapshot;
    }
    for (const file of this.cache.keys()) if (!active.has(file)) this.cache.delete(file);
    return {
      home: this.home,
      sessions: files.length,
      updatedAt: newest?.timestamp ?? null,
      windows: newest?.windows ?? {},
      message: !files.length ? '尚未找到 Codex 会话日志' : newest ? '' : '会话日志中尚无有效额度快照',
    };
  }
}

module.exports = { codexHome, normalizeWindow, normalizeRateLimits, parseSnapshotLine, CodexReader };
