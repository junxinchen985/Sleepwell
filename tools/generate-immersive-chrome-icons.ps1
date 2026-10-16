$outputDirectory = 'C:\Users\Administrator\Desktop\Sleepwell-main\assets\chrome'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

Add-Type -AssemblyName System.Drawing

function New-IconCanvas {
  $bitmap = New-Object System.Drawing.Bitmap 96, 96
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Save-Icon {
  param(
    [hashtable]$Canvas,
    [string]$Name
  )
  $path = Join-Path $outputDirectory $Name
  $Canvas.Bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $Canvas.Graphics.Dispose()
  $Canvas.Bitmap.Dispose()
}

$lineColor = [System.Drawing.Color]::FromArgb(255, 242, 247, 252)

$canvas = New-IconCanvas
$pen = New-Object System.Drawing.Pen $lineColor, 6
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$canvas.Graphics.DrawLine($pen, 27, 27, 69, 69)
$canvas.Graphics.DrawLine($pen, 69, 27, 27, 69)
$pen.Dispose()
Save-Icon $canvas 'close.png'

$canvas = New-IconCanvas
$pen = New-Object System.Drawing.Pen $lineColor, 5
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$brush = New-Object System.Drawing.SolidBrush $lineColor
$canvas.Graphics.DrawLine($pen, 18, 28, 78, 28)
$canvas.Graphics.DrawLine($pen, 18, 48, 78, 48)
$canvas.Graphics.DrawLine($pen, 18, 68, 78, 68)
$canvas.Graphics.FillEllipse($brush, 30, 21, 14, 14)
$canvas.Graphics.FillEllipse($brush, 52, 41, 14, 14)
$canvas.Graphics.FillEllipse($brush, 36, 61, 14, 14)
$pen.Dispose()
$brush.Dispose()
Save-Icon $canvas 'settings.png'

$canvas = New-IconCanvas
$pen = New-Object System.Drawing.Pen $lineColor, 5
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$canvas.Graphics.DrawEllipse($pen, 24, 18, 48, 48)
$canvas.Graphics.DrawLine($pen, 20, 58, 76, 38)
$pen.Dispose()
Save-Icon $canvas 'focus.png'

$canvas = New-IconCanvas
$pen = New-Object System.Drawing.Pen $lineColor, 5
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$canvas.Graphics.DrawEllipse($pen, 39, 15, 18, 18)
$canvas.Graphics.DrawArc($pen, 23, 42, 50, 36, 180, 180)
$pen.Dispose()
Save-Icon $canvas 'body.png'

$canvas = New-IconCanvas
$pen = New-Object System.Drawing.Pen $lineColor, 5
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$brush = New-Object System.Drawing.SolidBrush $lineColor
$canvas.Graphics.DrawLine($pen, 48, 12, 48, 32)
$canvas.Graphics.DrawLine($pen, 48, 64, 48, 84)
$canvas.Graphics.DrawLine($pen, 12, 48, 32, 48)
$canvas.Graphics.DrawLine($pen, 64, 48, 84, 48)
$canvas.Graphics.FillEllipse($brush, 42, 42, 12, 12)
$pen.Dispose()
$brush.Dispose()
Save-Icon $canvas 'world.png'

$canvas = New-IconCanvas
$pen = New-Object System.Drawing.Pen $lineColor, 5
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$canvas.Graphics.DrawRectangle($pen, 27, 14, 42, 68)
$canvas.Graphics.DrawLine($pen, 37, 36, 59, 36)
$canvas.Graphics.DrawLine($pen, 37, 52, 59, 52)
$canvas.Graphics.DrawLine($pen, 37, 68, 54, 68)
$pen.Dispose()
Save-Icon $canvas 'record.png'

Get-ChildItem -LiteralPath $outputDirectory | Select-Object Name, Length
