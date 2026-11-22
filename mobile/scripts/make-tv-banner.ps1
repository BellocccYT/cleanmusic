# Erzeugt das TV-Banner (320 x 180) für den Android-TV-/Fire-TV-Startbildschirm.
# Einmalig ausführen:  powershell -ExecutionPolicy Bypass -File mobile/scripts/make-tv-banner.ps1
# Ergebnis: mobile/android/app/src/main/res/drawable-xhdpi/tv_banner.png

param(
  [string]$Icon = (Join-Path $PSScriptRoot '..\..\renderer\assets\icon.png'),
  [string]$Out = (Join-Path $PSScriptRoot '..\android\app\src\main\res\drawable-xhdpi\tv_banner.png')
)

Add-Type -AssemblyName System.Drawing

$width = 320
$height = 180
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# Hintergrund: Nacht-Blau mit Akzent
$bg = New-Object System.Drawing.Rectangle 0, 0, $width, $height
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bg,
  ([System.Drawing.Color]::FromArgb(255, 8, 10, 14)),
  ([System.Drawing.Color]::FromArgb(255, 18, 28, 52)), 25
$graphics.FillRectangle($brush, $bg)

# Akzentbogen
$glow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(38, 91, 140, 255))
$graphics.FillEllipse($glow, 150, -70, 250, 200)

# Logo
if (Test-Path $Icon) {
  $logo = [System.Drawing.Image]::FromFile((Resolve-Path $Icon))
  $size = 104
  $graphics.DrawImage($logo, 22, [int](($height - $size) / 2), $size, $size)
  $logo.Dispose()
}

# Schrift
$fontBig = New-Object System.Drawing.Font 'Segoe UI', 27, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fontSmall = New-Object System.Drawing.Font 'Segoe UI', 17, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 232, 236, 243))
$accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 91, 140, 255))
$graphics.DrawString('CleanMusic', $fontBig, $white, 142, 56)
$graphics.DrawString('TV Lite', $fontSmall, $accent, 144, 96)

$graphics.Dispose()
$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Output "TV-Banner geschrieben: $Out"
