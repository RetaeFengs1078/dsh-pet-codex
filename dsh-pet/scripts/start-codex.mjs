#!/usr/bin/env node
// 开发入口；发布包内的 CodexPet.exe 可直接启动，无需 Node 或 DSH。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.env.DSH_PET_ELECTRON_PATH || join(root, '..', 'runtime', 'electron', 'electron.exe');
if (!existsSync(executable)) {
  console.error('未找到 Electron。先将 DSH_HOME 指向仓库根目录下的 runtime，再运行 node scripts/ensure-electron.mjs');
  process.exit(1);
}
const env = { ...process.env, DSH_PET_STANDALONE: '1', DSH_PET_BRIDGE: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.DSH_PET_HOST_PID;
const child = spawn(executable, [join(root, 'runtime', 'electron-helper', 'main.js')], {
  env,
  stdio: 'inherit',
  windowsHide: false,
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
