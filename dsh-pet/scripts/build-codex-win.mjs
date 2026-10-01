#!/usr/bin/env node
// 把已下载的 Electron 运行时与桌宠资源打成免安装 Windows 目录。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rcedit } from 'rcedit';

if (process.platform !== 'win32') throw new Error('此构建脚本仅支持 Windows');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const plugin = path.join(project, 'dsh-pet');
const electron = path.join(project, 'runtime', 'electron');
const output = path.join(project, 'dist', 'CodexPet-win32-x64');
const icon = path.join(plugin, 'assets', 'pic', 'codex-pet.ico');
if (output !== path.join(project, 'dist', 'CodexPet-win32-x64') || !output.startsWith(project + path.sep))
  throw new Error('输出路径异常');
if (!fs.existsSync(path.join(electron, 'electron.exe')))
  throw new Error('未找到 Electron；先设置 DSH_HOME=<仓库>\\runtime，运行 pnpm run ensure:electron');
if (!fs.existsSync(path.join(plugin, 'runtime', 'electron-helper', 'shared-core.js')))
  throw new Error('缺少桌面核心；先运行 pnpm run build:desktop-core');

if (!fs.existsSync(icon)) throw new Error('缺少 codex-pet.ico；先运行 powershell -File scripts/build-codex-icon.ps1');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(electron, output, { recursive: true });
fs.renameSync(path.join(output, 'electron.exe'), path.join(output, 'CodexPet.exe'));
await rcedit(path.join(output, 'CodexPet.exe'), { icon });
fs.copyFileSync(icon, path.join(output, 'codex-pet.ico'));

const app = path.join(output, 'resources', 'app');
fs.mkdirSync(app, { recursive: true });
fs.writeFileSync(
  path.join(app, 'package.json'),
  JSON.stringify(
    { name: 'codex-quota-pet', version: '0.1.5', main: 'dsh-pet/runtime/electron-helper/main.js' },
    null,
    2,
  ) + '\n',
);

const helper = path.join(app, 'dsh-pet', 'runtime', 'electron-helper');
fs.cpSync(path.join(plugin, 'runtime', 'electron-helper'), helper, {
  recursive: true,
  filter: (entry) => !entry.endsWith('.test.cjs'),
});
fs.writeFileSync(path.join(helper, 'codex-standalone.flag'), 'Codex standalone edition\n');
const assets = path.join(app, 'dsh-pet', 'assets');
fs.mkdirSync(assets, { recursive: true });
for (const name of ['webm', 'fonts', 'pic'])
  fs.cpSync(path.join(plugin, 'assets', name), path.join(assets, name), { recursive: true });
fs.copyFileSync(path.join(plugin, 'assets', 'config.jsonc'), path.join(assets, 'config.jsonc'));
fs.copyFileSync(path.join(project, 'LICENSE'), path.join(output, 'LICENSE'));
fs.copyFileSync(path.join(plugin, 'scripts', 'install-codex-win.ps1'), path.join(output, 'install.ps1'));
fs.copyFileSync(path.join(plugin, 'scripts', 'uninstall-codex-win.ps1'), path.join(output, 'uninstall.ps1'));
fs.writeFileSync(
  path.join(output, 'README.txt'),
  [
    'Codex 配额桌宠（dsh-pet fork）',
    '',
    '安装为 Windows 应用：在此目录执行 powershell -NoProfile -ExecutionPolicy Bypass -File .\\install.ps1',
    '安装目录优先 D:\\Apps\\CodexQuotaPet；开始菜单和 Windows 已安装应用中会出现入口。',
    '双击 CodexPet.exe 启动。右键桌宠可查看配额、选择动作或退出。',
    '程序只读 %USERPROFILE%\\.codex\\sessions 和 archived_sessions；设置 CODEX_HOME 可指定其他目录。',
    '使用前先在 Codex 中产生至少一条含配额的本机会话日志。',
    '支持 5 小时和周窗口：已用、剩余、重置时间；每 5 分钟自动刷新。',
    '无需 DSH、Codex Desktop、网络或 API Key。',
    '',
    '原作者：PC2005-cloud',
    '原项目：https://github.com/PC2005-cloud/dsh-pet',
    '代码许可证见 LICENSE。原项目动画等素材为非商业使用。',
    '',
  ].join('\r\n'),
);
console.log(output);
