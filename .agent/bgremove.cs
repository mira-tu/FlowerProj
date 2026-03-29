using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;

public static class BgRemovalTool {
    private static bool IsBackgroundCandidate(Color c) {
        int max = Math.Max(c.R, Math.Max(c.G, c.B));
        int min = Math.Min(c.R, Math.Min(c.G, c.B));
        int avg = (c.R + c.G + c.B) / 3;
        return avg >= 226 && (max - min) <= 42;
    }

    public static void Remove(string inputPath, string outputPath) {
        using (var source = new Bitmap(inputPath))
        using (var bmp = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb)) {
            using (var g = Graphics.FromImage(bmp)) {
                g.DrawImage(source, 0, 0, source.Width, source.Height);
            }

            int width = bmp.Width;
            int height = bmp.Height;
            bool[] bg = new bool[width * height];
            var queue = new Queue<Point>();

            Action<int,int> enqueueIfBackground = (x, y) => {
                if (x < 0 || y < 0 || x >= width || y >= height) return;
                int idx = y * width + x;
                if (bg[idx]) return;
                var color = bmp.GetPixel(x, y);
                if (!IsBackgroundCandidate(color)) return;
                bg[idx] = true;
                queue.Enqueue(new Point(x, y));
            };

            for (int x = 0; x < width; x++) {
                enqueueIfBackground(x, 0);
                enqueueIfBackground(x, height - 1);
            }
            for (int y = 0; y < height; y++) {
                enqueueIfBackground(0, y);
                enqueueIfBackground(width - 1, y);
            }

            while (queue.Count > 0) {
                var p = queue.Dequeue();
                enqueueIfBackground(p.X + 1, p.Y);
                enqueueIfBackground(p.X - 1, p.Y);
                enqueueIfBackground(p.X, p.Y + 1);
                enqueueIfBackground(p.X, p.Y - 1);
            }

            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    int idx = y * width + x;
                    Color c = bmp.GetPixel(x, y);
                    if (bg[idx]) {
                        bmp.SetPixel(x, y, Color.FromArgb(0, c.R, c.G, c.B));
                        continue;
                    }

                    int max = Math.Max(c.R, Math.Max(c.G, c.B));
                    int min = Math.Min(c.R, Math.Min(c.G, c.B));
                    int avg = (c.R + c.G + c.B) / 3;
                    bool nearBg = avg >= 205 && (max - min) <= 65;
                    bool touchesBg = false;
                    for (int oy = -1; oy <= 1 && !touchesBg; oy++) {
                        for (int ox = -1; ox <= 1; ox++) {
                            int nx = x + ox;
                            int ny = y + oy;
                            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                            if (bg[ny * width + nx]) {
                                touchesBg = true;
                                break;
                            }
                        }
                    }

                    if (nearBg && touchesBg) {
                        int alpha = Math.Max(0, Math.Min(255, (255 - avg) * 6 + (max - min) * 2));
                        bmp.SetPixel(x, y, Color.FromArgb(alpha, c.R, c.G, c.B));
                    }
                }
            }

            bmp.Save(outputPath, ImageFormat.Png);
        }
    }
}
