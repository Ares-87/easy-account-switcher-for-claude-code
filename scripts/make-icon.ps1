Add-Type -AssemblyName System.Drawing
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

$bg = [System.Drawing.ColorTranslator]::FromHtml('#1F1E1D')
$coral = [System.Drawing.ColorTranslator]::FromHtml('#D97757')
$cream = [System.Drawing.ColorTranslator]::FromHtml('#F5F0E8')

# rounded square background
$r = 56
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $r, $r, 180, 90)
$path.AddArc($size - $r, 0, $r, $r, 270, 90)
$path.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
$path.AddArc(0, $size - $r, $r, $r, 90, 90)
$path.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush $bg), $path)

function Draw-Person($g, $brush, $cx, $cy, $s) {
  # head
  $hr = 22 * $s
  $g.FillEllipse($brush, $cx - $hr, $cy - 46 * $s, 2 * $hr, 2 * $hr)
  # shoulders (half ellipse)
  $w = 84 * $s; $h = 70 * $s
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($cx - $w / 2, $cy + 4 * $s, $w, $h, 180, 180)
  $p.CloseFigure()
  $g.FillPath($brush, $p)
}

# back person (cream) and front person (coral) with dark outline for separation
Draw-Person $g (New-Object System.Drawing.SolidBrush $cream) 104 118 1.0
$outline = New-Object System.Drawing.SolidBrush $bg
Draw-Person $g $outline 152 134 1.16
Draw-Person $g (New-Object System.Drawing.SolidBrush $coral) 152 134 1.0

# swap arrows (two arcs with arrow caps)
$pen = New-Object System.Drawing.Pen $coral, 14
$pen.StartCap = 'Round'
$pen.CustomEndCap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap 3, 3
$g.DrawArc($pen, 28, 28, 200, 200, 200, 70)
$pen2 = New-Object System.Drawing.Pen $cream, 14
$pen2.StartCap = 'Round'
$pen2.CustomEndCap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap 3, 3
$g.DrawArc($pen2, 28, 28, 200, 200, 20, 70)

$out = Join-Path $PSScriptRoot '..\images'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$bmp.Save((Join-Path $out 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output 'ok'

