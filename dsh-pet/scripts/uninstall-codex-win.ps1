$ErrorActionPreference = 'Stop'

$base = if (Test-Path -LiteralPath 'D:\' -PathType Container) { 'D:\Apps' } else { Join-Path $env:LOCALAPPDATA 'Programs' }
$base = [IO.Path]::GetFullPath($base).TrimEnd('\')
$expected = [IO.Path]::GetFullPath((Join-Path $base 'CodexQuotaPet')).TrimEnd('\')
$actual = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
if (-not [string]::Equals($actual, $expected, [StringComparison]::OrdinalIgnoreCase) -or
    -not $actual.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw '卸载脚本不在预期的安装目录，已停止。'
}
$item = Get-Item -LiteralPath $actual -Force
if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw '安装目录是链接，已停止卸载。' }

$installedExe = Join-Path $actual 'CodexPet.exe'
Get-CimInstance Win32_Process -Filter "Name='CodexPet.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $installedExe, [StringComparison]::OrdinalIgnoreCase) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex 配额桌宠.lnk'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexQuotaPet'
Remove-Item -LiteralPath $shortcutPath -Force -ErrorAction SilentlyContinue
Remove-Item -Path $uninstallKey -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $actual -Recurse -Force
Write-Output 'Codex 配额桌宠已卸载；Codex 会话日志未改动。'
