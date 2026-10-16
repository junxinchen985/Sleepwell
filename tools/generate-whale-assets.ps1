param(
  [string]$Source = 'C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-b6d6cf58-79b2-4b57-9574-36218421e71c.png',
  [string]$OutputDirectory = 'C:\Users\Administrator\Desktop\Sleepwell-main\assets\whale'
)

Add-Type -AssemblyName System.Drawing
$drawingAssembly = [System.Drawing.Bitmap].Assembly.Location
$drawingPrimitivesAssembly = [System.Drawing.PointF].Assembly.Location
$drawingRuntimeDirectory = Split-Path -Parent $drawingAssembly
$windowsCoreAssembly = Join-Path $drawingRuntimeDirectory 'System.Private.Windows.Core.dll'
$gdiPlusAssembly = Join-Path $drawingRuntimeDirectory 'System.Private.Windows.GdiPlus.dll'

$sourceInfo = [System.Drawing.Image]::FromFile($Source)
$targetWidth = 1080
$targetHeight = 1920
$sourceWidth = $sourceInfo.Width
$sourceHeight = $sourceInfo.Height
$sourceInfo.Dispose()

Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class WhaleAssetBuilder
{
    private static double Clamp(double value, double min, double max)
    {
        return Math.Max(min, Math.Min(max, value));
    }

    private static double Smooth(double value)
    {
        double v = Clamp(value, 0, 1);
        return v * v * (3 - 2 * v);
    }

    private static bool Inside(PointF[] polygon, double x, double y)
    {
        bool inside = false;
        for (int i = 0, j = polygon.Length - 1; i < polygon.Length; j = i++)
        {
            PointF pi = polygon[i];
            PointF pj = polygon[j];
            bool crosses = ((pi.Y > y) != (pj.Y > y)) &&
                (x < (pj.X - pi.X) * (y - pi.Y) / (pj.Y - pi.Y) + pi.X);
            if (crosses) inside = !inside;
        }
        return inside;
    }

    private static double SegmentDistance(double px, double py, PointF a, PointF b)
    {
        double vx = b.X - a.X;
        double vy = b.Y - a.Y;
        double wx = px - a.X;
        double wy = py - a.Y;
        double lengthSquared = vx * vx + vy * vy;
        double t = lengthSquared <= 0 ? 0 : Clamp((wx * vx + wy * vy) / lengthSquared, 0, 1);
        double dx = px - (a.X + t * vx);
        double dy = py - (a.Y + t * vy);
        return Math.Sqrt(dx * dx + dy * dy);
    }

    private static double EdgeDistance(PointF[] polygon, double x, double y)
    {
        double distance = Double.MaxValue;
        for (int i = 0; i < polygon.Length; i++)
        {
            PointF a = polygon[i];
            PointF b = polygon[(i + 1) % polygon.Length];
            distance = Math.Min(distance, SegmentDistance(x, y, a, b));
        }
        return distance;
    }

    private static double Luminance(Color color)
    {
        return color.R * 0.2126 + color.G * 0.7152 + color.B * 0.0722;
    }

    private static Color Blend(Color baseColor, Color overlay, double alpha)
    {
        double a = Clamp(alpha, 0, 1);
        return Color.FromArgb(
            (int)Math.Round(baseColor.R * (1 - a) + overlay.R * a),
            (int)Math.Round(baseColor.G * (1 - a) + overlay.G * a),
            (int)Math.Round(baseColor.B * (1 - a) + overlay.B * a));
    }

    private static void BlendRectangle(Bitmap baseImage, Bitmap overlay, Rectangle rectangle, int feather, double strength)
    {
        int left = Math.Max(0, rectangle.Left);
        int top = Math.Max(0, rectangle.Top);
        int right = Math.Min(baseImage.Width, rectangle.Right);
        int bottom = Math.Min(baseImage.Height, rectangle.Bottom);

        for (int y = top; y < bottom; y++)
        {
            for (int x = left; x < right; x++)
            {
                double edgeX = Math.Min(x - rectangle.Left, rectangle.Right - 1 - x);
                double edgeY = Math.Min(y - rectangle.Top, rectangle.Bottom - 1 - y);
                double alpha = Smooth(Math.Min(edgeX, edgeY) / Math.Max(1, feather)) * strength;
                if (alpha <= 0) continue;
                baseImage.SetPixel(x, y, Blend(baseImage.GetPixel(x, y), overlay.GetPixel(x, y), alpha));
            }
        }
    }

    private static Bitmap CreateBlur(Bitmap source)
    {
        Bitmap small = new Bitmap(90, 160, PixelFormat.Format24bppRgb);
        using (Graphics smallGraphics = Graphics.FromImage(small))
        {
            smallGraphics.CompositingQuality = CompositingQuality.HighQuality;
            smallGraphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            smallGraphics.SmoothingMode = SmoothingMode.HighQuality;
            smallGraphics.DrawImage(source, 0, 0, small.Width, small.Height);
        }

        Bitmap blur = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb);
        using (Graphics blurGraphics = Graphics.FromImage(blur))
        {
            blurGraphics.CompositingQuality = CompositingQuality.HighQuality;
            blurGraphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            blurGraphics.SmoothingMode = SmoothingMode.HighQuality;
            blurGraphics.DrawImage(small, 0, 0, blur.Width, blur.Height);
        }
        small.Dispose();
        return blur;
    }

    private static Bitmap CreateWaterField(Bitmap source)
    {
        Bitmap field = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb);
        for (int y = 0; y < source.Height; y++)
        {
            Color left = source.GetPixel(70, y);
            Color right = source.GetPixel(source.Width - 71, y);
            for (int x = 0; x < source.Width; x++)
            {
                Color color;
                if (y < 400 || y > 1220)
                {
                    double mix = (double)x / Math.Max(1, source.Width - 1);
                    color = Blend(left, right, mix);
                }
                else
                {
                    Color top = source.GetPixel(x, 360);
                    Color bottom = source.GetPixel(x, 1260);
                    double mix = (double)(y - 400) / 820;
                    color = Blend(top, bottom, mix);
                }
                field.SetPixel(x, y, color);
            }
        }
        return field;
    }

    private static void SaveJpeg(Bitmap bitmap, string path)
    {
        ImageCodecInfo encoder = null;
        foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders())
        {
            if (codec.MimeType == "image/jpeg") encoder = codec;
        }
        using (EncoderParameters parameters = new EncoderParameters(1))
        {
            parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 86L);
            bitmap.Save(path, encoder, parameters);
        }
    }

    private static Bitmap CreateMaskedLayer(Bitmap source, PointF[] polygon, double threshold, double range, int edgeFeather)
    {
        Bitmap result = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        int left = source.Width;
        int right = 0;
        int top = source.Height;
        int bottom = 0;

        foreach (PointF point in polygon)
        {
            left = Math.Min(left, (int)Math.Floor(point.X));
            right = Math.Max(right, (int)Math.Ceiling(point.X));
            top = Math.Min(top, (int)Math.Floor(point.Y));
            bottom = Math.Max(bottom, (int)Math.Ceiling(point.Y));
        }

        left = Math.Max(0, left - edgeFeather);
        right = Math.Min(source.Width, right + edgeFeather);
        top = Math.Max(0, top - edgeFeather);
        bottom = Math.Min(source.Height, bottom + edgeFeather);

        for (int y = top; y < bottom; y++)
        {
            for (int x = left; x < right; x++)
            {
                if (!Inside(polygon, x, y)) continue;
                Color color = source.GetPixel(x, y);
                double luminanceAlpha = Clamp((Luminance(color) - threshold) / range, 0, 1);
                double colorAlpha = Clamp(((color.B - color.R) * 1.25 + (color.G - color.R) * 0.5 + 8) / 34, 0, 1);
                double edgeAlpha = Smooth(EdgeDistance(polygon, x, y) / Math.Max(1, edgeFeather));
                int alpha = (int)Math.Round(255 * Math.Pow(luminanceAlpha, 1.08) * colorAlpha * edgeAlpha);
                if (alpha <= 5) continue;
                result.SetPixel(x, y, Color.FromArgb(alpha, color));
            }
        }
        return result;
    }

    public static void Build(string sourcePath, string outputDirectory, int targetWidth, int targetHeight)
    {
        Directory.CreateDirectory(outputDirectory);
        using (Bitmap original = new Bitmap(sourcePath))
        using (Bitmap source = new Bitmap(targetWidth, targetHeight, PixelFormat.Format24bppRgb))
        {
            using (Graphics graphics = Graphics.FromImage(source))
            {
                graphics.CompositingQuality = CompositingQuality.HighQuality;
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.SmoothingMode = SmoothingMode.HighQuality;
                graphics.DrawImage(original, 0, 0, targetWidth, targetHeight);
            }

            using (Bitmap waterField = CreateWaterField(source))
            using (Bitmap clean = new Bitmap(targetWidth, targetHeight, PixelFormat.Format24bppRgb))
            {
                using (Graphics cleanGraphics = Graphics.FromImage(clean))
                {
                    cleanGraphics.DrawImage(source, 0, 0, targetWidth, targetHeight);
                }

                BlendRectangle(clean, waterField, new Rectangle(-220, -20, 1520, 480), 130, 1.0);
                BlendRectangle(clean, waterField, new Rectangle(-220, 1300, 1520, 620), 130, 1.0);
                BlendRectangle(clean, waterField, new Rectangle(-220, 390, 1520, 880), 150, 1.0);
                SaveJpeg(clean, Path.Combine(outputDirectory, "deep-sea-water-base-hd.jpg"));
            }

            PointF[] whale = new PointF[]
            {
                new PointF(0, 620), new PointF(72, 545), new PointF(210, 530),
                new PointF(486, 510), new PointF(742, 530), new PointF(920, 550),
                new PointF(1080, 570), new PointF(1080, 696), new PointF(980, 762),
                new PointF(872, 824), new PointF(760, 922), new PointF(584, 1062),
                new PointF(470, 1134), new PointF(342, 1062), new PointF(252, 952),
                new PointF(120, 824), new PointF(26, 706)
            };
            PointF[] tail = new PointF[]
            {
                new PointF(790, 492), new PointF(900, 470), new PointF(1010, 502),
                new PointF(1080, 560), new PointF(1080, 702), new PointF(1000, 762),
                new PointF(900, 782), new PointF(818, 718)
            };
            PointF[] fin = new PointF[]
            {
                new PointF(206, 790), new PointF(370, 730), new PointF(560, 832),
                new PointF(650, 970), new PointF(600, 1080), new PointF(500, 1150),
                new PointF(400, 1110), new PointF(300, 1010)
            };

            using (Bitmap whaleLayer = CreateMaskedLayer(source, whale, 44, 132, 26))
            using (Bitmap tailLayer = CreateMaskedLayer(source, tail, 48, 138, 20))
            using (Bitmap finLayer = CreateMaskedLayer(source, fin, 46, 136, 20))
            {
                whaleLayer.Save(Path.Combine(outputDirectory, "whale-full-glow.png"), ImageFormat.Png);
                tailLayer.Save(Path.Combine(outputDirectory, "whale-tail-glow.png"), ImageFormat.Png);
                finLayer.Save(Path.Combine(outputDirectory, "whale-fin-glow.png"), ImageFormat.Png);
            }
        }
    }
}
'@ -ReferencedAssemblies @($drawingAssembly, $drawingPrimitivesAssembly, $windowsCoreAssembly, $gdiPlusAssembly)

[WhaleAssetBuilder]::Build($Source, $OutputDirectory, $targetWidth, $targetHeight)

Get-ChildItem -LiteralPath $OutputDirectory |
  Where-Object { $_.Name -like '*whale*' -or $_.Name -like 'deep-sea-water*' } |
  Select-Object Name, Length
