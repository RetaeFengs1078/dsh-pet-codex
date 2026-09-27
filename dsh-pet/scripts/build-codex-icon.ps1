$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$assets = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets\pic'))
$originalPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets\memes\可爱.png'))
$sourcePath = Join-Path $assets 'codex-pet-avatar.png'
$iconPath = Join-Path $assets 'codex-pet.ico'
if (-not (Test-Path -LiteralPath $originalPath -PathType Leaf)) { throw 'Original avatar image is missing.' }

$original = [Drawing.Image]::FromFile($originalPath)
$portrait = [Drawing.Bitmap]::new(384, 384)
$portraitGraphics = [Drawing.Graphics]::FromImage($portrait)
try {
  $portraitGraphics.Clear([Drawing.Color]::White)
  $portraitGraphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $portraitGraphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
  $portraitGraphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $portraitGraphics.DrawImage(
    $original,
    [Drawing.Rectangle]::new(0, 0, 384, 384),
    [Drawing.Rectangle]::new(64, 12, 256, 256),
    [Drawing.GraphicsUnit]::Pixel
  )
  $portrait.Save($sourcePath, [Drawing.Imaging.ImageFormat]::Png)
} finally {
  $portraitGraphics.Dispose()
  $portrait.Dispose()
  $original.Dispose()
}

$source = [Drawing.Image]::FromFile($sourcePath)
$frames = @()
try {
  foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
    $bitmap = [Drawing.Bitmap]::new($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $stream = [IO.MemoryStream]::new()
    try {
      $graphics.Clear([Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($source, [Drawing.Rectangle]::new(0, 0, $size, $size))
      $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
      $frames += [pscustomobject]@{ Size = $size; Bytes = $stream.ToArray() }
    } finally {
      $stream.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally { $source.Dispose() }

$output = [IO.File]::Open($iconPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
$writer = [IO.BinaryWriter]::new($output)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$frames.Count)
  $offset = 6 + 16 * $frames.Count
  foreach ($frame in $frames) {
    $writer.Write([byte]($frame.Size % 256))
    $writer.Write([byte]($frame.Size % 256))
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$frame.Bytes.Length)
    $writer.Write([uint32]$offset)
    $offset += $frame.Bytes.Length
  }
  foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
} finally { $writer.Dispose() }

$test = [Drawing.Icon]::new($iconPath)
try { Write-Output "Icon generated: $iconPath ($($test.Width)x$($test.Height))" }
finally { $test.Dispose() }
