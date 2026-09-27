'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { codexHome, normalizeRateLimits, parseSnapshotLine, CodexReader } = require('./codex-reader.cjs');
const local = require('./codex-local.cjs');

test('CODEX_HOME 优先；默认读用户目录', () => {
  assert.equal(codexHome({ CODEX_HOME: 'D:\\codex', USERPROFILE: 'C:\\other' }), path.resolve('D:\\codex'));
  assert.equal(codexHome({ USERPROFILE: 'C:\\person' }), path.resolve('C:\\person', '.codex'));
});

test('按分钟识别周额度，即使它位于 primary 且 secondary 为空', () => {
  const windows = normalizeRateLimits({
    primary: { used_percent: 9, window_minutes: 10080, resets_at: 1800000000 },
    secondary: null,
  });
  assert.equal(windows.weekly.usedPercent, 9);
  assert.equal(windows.weekly.remainingPercent, 91);
  assert.equal(windows.weekly.resetAt, 1800000000000);
  assert.equal(windows.fiveHour, undefined);
});

test('支持主次位置互换和无效行', () => {
  const data = {
    primary: { used_percent: 45, window_minutes: 10080 },
    secondary: { used_percent: 20, window_minutes: 300 },
  };
  const line = JSON.stringify({
    timestamp: '2026-09-27T00:00:00Z',
    type: 'event_msg',
    payload: { type: 'token_count', rate_limits: data },
  });
  assert.equal(parseSnapshotLine(line).windows.fiveHour.remainingPercent, 80);
  assert.equal(parseSnapshotLine(line).windows.weekly.usedPercent, 45);
  assert.equal(parseSnapshotLine('{invalid'), null);
  assert.equal(
    parseSnapshotLine(JSON.stringify({ type: 'event_msg', payload: { type: 'other', rate_limits: data } })),
    null,
  );
});

test('扫描新会话与归档会话，选择最新有效快照', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pet-codex-'));
  try {
    const active = path.join(home, 'sessions', '2026', '09');
    const archived = path.join(home, 'archived_sessions');
    fs.mkdirSync(active, { recursive: true });
    fs.mkdirSync(archived, { recursive: true });
    const record = (timestamp, rate_limits) =>
      JSON.stringify({ timestamp, type: 'event_msg', payload: { type: 'token_count', rate_limits } });
    fs.writeFileSync(
      path.join(active, 'rollout-one.jsonl'),
      record('2026-09-25T00:00:00Z', { primary: { used_percent: 10, window_minutes: 300 } }) + '\n',
    );
    fs.writeFileSync(
      path.join(archived, 'rollout-two.jsonl'),
      record('2026-09-26T00:00:00Z', { primary: { used_percent: 80, window_minutes: 10080 }, secondary: null }) + '\n',
    );
    const reader = new CodexReader(home);
    const first = await reader.refresh();
    assert.equal(first.sessions, 2);
    assert.equal(first.windows.weekly.usedPercent, 80);
    assert.equal(first.windows.fiveHour, undefined);
    fs.appendFileSync(
      path.join(active, 'rollout-one.jsonl'),
      record('2026-09-27T00:00:00Z', { primary: { used_percent: 30, window_minutes: 300 } }) + '\n',
    );
    const second = await reader.refresh();
    assert.equal(second.windows.fiveHour.usedPercent, 30);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('独立端点返回配置且不暴露任意路径', async () => {
  const config = await local.handleRequest('GET', '/dsh-pet-7340/config');
  assert.equal(JSON.parse(config.body).main.pets[0].display, 'desktop');
  const denied = await local.handleRequest('GET', '/dsh-pet-7340/thumb/main/..%2Fsecret.webm');
  assert.notEqual(denied.status, 200);
});
