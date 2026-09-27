// 独立桌宠的数据入口。Electron 自定义协议直达此模块，不开放本机 HTTP 端口。
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { CodexReader } = require('./codex-reader.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets');
const reader = new CodexReader();

function readConfig() {
  // 与原插件默认配置保持同一个来源；独立版关闭需要 DSH 模型的功能。
  const source = fs.readFileSync(path.join(ASSETS, 'config.jsonc'), 'utf8');
  const config = JSON.parse(
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^\\:])\/\/.*$/gm, '$1')
      .trim(),
  );
  config.pets = config.pets.map((pet) => ({
    ...pet,
    balanceEnabled: true,
    whisperEnabled: false,
    workStatusEnabled: false,
    display: 'desktop',
  }));
  config.eventsRefreshSec = { ...config.eventsRefreshSec, balance: 300 };
  return { main: config };
}

function desktopPets() {
  return readConfig().main.pets.map((pet, index) => ({ id: pet.id, size: pet.size, index }));
}

function json(body, status = 200) {
  return { status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) };
}

function asset(root, relative) {
  if (!relative || relative.includes('\\') || relative.includes('/') || relative === '.' || relative === '..')
    return null;
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root) + path.sep)) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

function assetResponse(url) {
  const parts = url.pathname
    .split('/')
    .slice(2)
    .map((part) => decodeURIComponent(part));
  let file = null;
  let contentType = '';
  if (parts[0] === 'thumb' && parts.length === 3 && parts[1] === 'main' && parts[2].endsWith('.webm')) {
    file = asset(path.join(ASSETS, 'webm'), parts[2]);
    contentType = 'video/webm';
  } else if (parts[0] === 'font' && parts.length === 2 && parts[1].endsWith('.ttf')) {
    file = asset(path.join(ASSETS, 'fonts'), parts[1]);
    contentType = 'font/ttf';
  } else if (parts[0] === 'pic' && parts.length === 2 && parts[1].endsWith('.png')) {
    file = asset(path.join(ASSETS, 'pic'), parts[1]);
    contentType = 'image/png';
  }
  return file ? { status: 200, contentType, file } : json({ error: '素材不存在' }, 404);
}

function windowData(window) {
  return window
    ? {
        usedPercent: window.usedPercent,
        remainingPercent: window.remainingPercent,
        resetsAt: window.resetAt === null ? null : new Date(window.resetAt).toISOString(),
      }
    : undefined;
}

async function handleRequest(method, route) {
  let url;
  try {
    url = new URL(route, 'http://local.invalid');
  } catch {
    return json({ error: '请求路径非法' }, 400);
  }
  if (!url.pathname.startsWith('/dsh-pet-7340/')) return json({ error: '请求路径非法' }, 404);
  if (method !== 'GET') return json({ error: '仅支持读取' }, 405);
  const name = url.pathname.slice('/dsh-pet-7340/'.length);
  if (name === 'config') return json(readConfig());
  if (name === 'balance') {
    const snapshot = await reader.refresh();
    const fiveHour = windowData(snapshot.windows.fiveHour);
    const weekly = windowData(snapshot.windows.weekly);
    if (!fiveHour && !weekly)
      return json({
        ok: false,
        provider: 'codex',
        reason: 'fetch-error',
        message: snapshot.message || '尚无有效额度快照',
      });
    return json({
      ok: true,
      provider: 'codex',
      kind: 'codex',
      data: { fiveHour, weeklyWindow: weekly, updatedAt: snapshot.updatedAt },
    });
  }
  if (name === 'balance/trigger') return json({ count: 0 });
  if (name === 'broadcast') return json({ ts: 0 });
  if (name === 'work-status') return json({ state: null, ts: 0 });
  if (name === 'whisper' || name === 'whisper/trigger' || name === 'chat') {
    return json({ ok: false, reason: 'unavailable', message: '独立版未连接对话模型' });
  }
  if (name.startsWith('thumb/') || name.startsWith('font/') || name.startsWith('pic/')) {
    try {
      return assetResponse(url);
    } catch {
      return json({ error: '素材路径非法' }, 400);
    }
  }
  return json({ error: '端点不存在' }, 404);
}

module.exports = { readConfig, desktopPets, handleRequest };
