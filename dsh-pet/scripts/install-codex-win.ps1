$ErrorActionPreference = 'Stop'

$source = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$sourceExe = Join-Path $source 'CodexPet.exe'
if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) {
  throw '请从包含 CodexPet.exe 的发布包目录运行 install.ps1。'
}

$base = if (Test-Path -LiteralPath 'D:\' -PathType Container) { 'D:\Apps' } else { Join-Path $env:LOCALAPPDATA 'Programs' }
$base = [IO.Path]::GetFullPath($base).TrimEnd('\')
$installDir = [IO.Path]::GetFullPath((Join-Path $base 'CodexQuotaPet')).TrimEnd('\')
$expected = [IO.Path]::GetFullPath((Join-Path $base 'CodexQuotaPet')).TrimEnd('\')
if (-not [string]::Equals($installDir, $expected, [StringComparison]::OrdinalIgnoreCase) -or
    -not $installDir.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw '安装路径未通过安全检查。'
}
if ([string]::Equals($source, $installDir, [StringComparison]::OrdinalIgnoreCase)) {
  throw '程序已位于安装目录。'
}

$name = 'Codex 配额桌宠'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) ($name + '.lnk')
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexQuotaPet'
$installedExe = Join-Path $installDir 'CodexPet.exe'
$installedIcon = Join-Path $installDir 'codex-pet.ico'
$backup = $null
$hadOldInstall = Test-Path -LiteralPath $installDir

New-Item -ItemType Directory -Path $base -Force | Out-Null
if ($hadOldInstall) {
  $item = Get-Item -LiteralPath $installDir -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw '安装目录是链接，已停止更新。' }
  $backup = [IO.Path]::GetFullPath((Join-Path $base ('CodexQuotaPet-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))))
  if (-not $backup.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $backup)) {
    throw '备份路径未通过安全检查。'
  }
  Get-CimInstance Win32_Process -Filter "Name='CodexPet.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $installedExe, [StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Move-Item -LiteralPath $installDir -Destination $backup
}

try {
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
  foreach ($item in Get-ChildItem -LiteralPath $source -Force) {
    Copy-Item -LiteralPath $item.FullName -Destination $installDir -Recurse -Force
  }
  if (-not (Test-Path -LiteralPath $installedExe -PathType Leaf) -or
      -not (Test-Path -LiteralPath (Join-Path $installDir 'uninstall.ps1') -PathType Leaf) -or
      -not (Test-Path -LiteralPath $installedIcon -PathType Leaf)) {
    throw '安装文件复制不完整。'
  }

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $installedExe
  $shortcut.WorkingDirectory = $installDir
  $shortcut.IconLocation = $installedIcon + ',0'
  $shortcut.Description = '只读本机 Codex 会话日志的配额桌宠'
  $shortcut.Save()

  New-Item -Path $uninstallKey -Force | Out-Null
  $powerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $uninstallCommand = '"' + $powerShellExe + '" -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $installDir 'uninstall.ps1') + '"'
  $fields = @{
    DisplayName = $name
    DisplayVersion = '0.1.5'
    DisplayIcon = $installedIcon
    InstallLocation = $installDir
    UninstallString = $uninstallCommand
    Publisher = 'PC2005-cloud / RetaeFengs1078'
    URLInfoAbout = 'https://github.com/RetaeFengs1078/dsh-pet-codex'
    InstallDate = (Get-Date -Format 'yyyyMMdd')
  }
  foreach ($field in $fields.GetEnumerator()) {
    New-ItemProperty -Path $uninstallKey -Name $field.Key -Value $field.Value -PropertyType String -Force | Out-Null
  }
  foreach ($field in @('NoModify', 'NoRepair')) {
    New-ItemProperty -Path $uninstallKey -Name $field -Value 1 -PropertyType DWord -Force | Out-Null
  }
  Write-Output "已安装：$installDir"
  if ($backup) { Write-Output "旧版备份：$backup" }
} catch {
  if (Test-Path -LiteralPath $installDir) {
    $candidate = [IO.Path]::GetFullPath($installDir).TrimEnd('\')
    if (-not [string]::Equals($candidate, $expected, [StringComparison]::OrdinalIgnoreCase)) { throw '回滚路径未通过安全检查。' }
    Remove-Item -LiteralPath $candidate -Recurse -Force
  }
  if ($backup) { Move-Item -LiteralPath $backup -Destination $installDir }
  if (-not $hadOldInstall) {
    Remove-Item -LiteralPath $shortcutPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $uninstallKey -Recurse -Force -ErrorAction SilentlyContinue
  }
  throw
}
