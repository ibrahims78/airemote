param(
  [int]$Fps = 12,
  [int]$Quality = 60,
  [int]$MaxWidth = 1600
)

# capture-gdi.ps1 — عامل التقاط بديل لوكيل ويندوز.
# يكتب إطارات JPEG ثنائية على stdout بالترتيب:
#   [u32 len][u16 cx][u16 cy][u16 sw][u16 sh][u8 flags][jpeg ...]
# السبب: مسار getDisplayMedia/desktopCapturer في Chromium على هذه الأجهزة يُرجع
# سطحاً أسود 100% (مُقاس)، بينما BitBlt عبر GDI يُرجع السطح الحقيقي (مُقاس 134.9 سطوع).
#
# 3.11.9 — وضع الخمول: العامل لا يلتقط شيئاً حتى تصل "A" على stdin (تفعيل جلسة)،
# و"P" (إيقاف مؤقت). بهذا يصبح التسخين المبكر مجانياً تقريباً (لا BitBlt ولا JPEG).
# الفائدة: أول إطار ~0ms بدل ~5s، بلا استهلاك CPU أثناء الخمول.

$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public class GdiStream {
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hWnd);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
  [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hdc);
  [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int w, int h);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
  [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr d, int x, int y, int w, int h, IntPtr s, int sx, int sy, int rop);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
  [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  public struct POINT { public int X; public int Y; }
  const int SRCCOPY = 0x00CC0020;

  static readonly object gate = new object();
  static volatile bool active = false;

  static Bitmap Grab(int x, int y, int w, int h) {
    IntPtr screenDc = GetDC(IntPtr.Zero);
    IntPtr memDc = CreateCompatibleDC(screenDc);
    IntPtr bmp = CreateCompatibleBitmap(screenDc, w, h);
    IntPtr old = SelectObject(memDc, bmp);
    try {
      BitBlt(memDc, 0, 0, w, h, screenDc, x, y, SRCCOPY);
      return Image.FromHbitmap(bmp);
    } finally {
      SelectObject(memDc, old);
      DeleteObject(bmp);
      DeleteDC(memDc);
      ReleaseDC(IntPtr.Zero, screenDc);
    }
  }

  static Bitmap Scale(Bitmap src, int maxWidth) {
    if (maxWidth <= 0 || src.Width <= maxWidth) return null;
    int w = maxWidth;
    int h = (int)Math.Round(src.Height * (maxWidth / (double)src.Width));
    if (h < 2) h = 2;
    Bitmap dst = new Bitmap(w, h, PixelFormat.Format24bppRgb);
    using (Graphics g = Graphics.FromImage(dst)) {
      g.InterpolationMode = InterpolationMode.Bilinear;
      g.PixelOffsetMode = PixelOffsetMode.HighSpeed;
      g.DrawImage(src, 0, 0, w, h);
    }
    return dst;
  }

  static long Signature(Bitmap b) {
    long h = 17;
    int sx = Math.Max(1, b.Width / 16), sy = Math.Max(1, b.Height / 16);
    for (int y = 0; y < b.Height; y += sy) {
      for (int x = 0; x < b.Width; x += sx) {
        Color c = b.GetPixel(x, y);
        h = h * 31 + (c.R + c.G + c.B) / 3;
      }
    }
    return h;
  }

  static void CommandLoop() {
    try {
      StreamReader si = new StreamReader(Console.OpenStandardInput());
      string line;
      while ((line = si.ReadLine()) != null) {
        line = line.Trim();
        if (line.StartsWith("A")) active = true;
        else if (line.StartsWith("P")) active = false;
      }
    } catch { }
    // stdin أُغلق ⇒ العملية بلا مستهلك: اخرج بدل أن تظل معلّقة
    active = false;
  }

  public static void Run(int fps, int quality, int maxWidth) {
    SetProcessDPIAware();
    int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77);
    int vw = GetSystemMetrics(78), vh = GetSystemMetrics(79);
    if (vw <= 0 || vh <= 0) { vw = GetSystemMetrics(0); vh = GetSystemMetrics(1); vx = 0; vy = 0; }
    if (vw <= 0 || vh <= 0) return;

    Thread t = new Thread(new ThreadStart(CommandLoop));
    t.IsBackground = true;
    t.Start();

    Stream so = Console.OpenStandardOutput();
    EncoderParameters ep = new EncoderParameters(1);
    ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);
    ImageCodecInfo jpg = null;
    foreach (var c in ImageCodecInfo.GetImageEncoders()) if (c.FormatID == ImageFormat.Jpeg.Guid) jpg = c;

    int minInterval = (int)Math.Floor(1000.0 / Math.Max(1, fps));
    long lastSig = 0L;
    long lastSentAt = 0L;
    var sw = new Stopwatch();
    bool wasActive = false;

    while (true) {
      if (!active) {
        // خمول تام: لا التقاط، لا ترميز — يستهلك ~0% CPU
        wasActive = false;
        Thread.Sleep(120);
        continue;
      }
      if (!wasActive) { wasActive = true; lastSig = 0L; lastSentAt = 0L; }
              // 2026-11-09 — تغيير دقة الشاشة كان لا يُرى: الحدود تُقرأ مرة واحدة قبل الحلقة.
              // نُعيد قراءتها كل دورة ونُصفّر البصمة عند التغيّر ليُرسل إطار كامل.
              {
                  int nvx = GetSystemMetrics(76), nvy = GetSystemMetrics(77);
                  int nvw = GetSystemMetrics(78), nvh = GetSystemMetrics(79);
                  if (nvw <= 0 || nvh <= 0) { nvw = GetSystemMetrics(0); nvh = GetSystemMetrics(1); nvx = 0; nvy = 0; }
                  if (nvw > 0 && nvh > 0 && (nvw != vw || nvh != vh || nvx != vx || nvy != vy))
                  {
                      vx = nvx; vy = nvy; vw = nvw; vh = nvh;
                      lastSig = 0L; lastSentAt = 0L;
                  }
              }

      sw.Restart();
      using (Bitmap full = Grab(vx, vy, vw, vh)) {
        Bitmap use = full;
        Bitmap scaled = null;
        try {
          scaled = Scale(full, maxWidth);
          if (scaled != null) use = scaled;

          long sig = Signature(use);
          long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
          bool changed = sig != lastSig;
          if (!changed && now - lastSentAt < 1000) {
            int idleWait = minInterval - (int)sw.Elapsed.TotalMilliseconds;
            if (idleWait > 0) Thread.Sleep(idleWait);
            continue;
          }
          lastSig = sig;

          using (var ms = new MemoryStream()) {
            use.Save(ms, jpg, ep);
            byte[] buf = ms.ToArray();
            POINT p; GetCursorPos(out p);
            int cx = p.X - vx, cy = p.Y - vy;
            if (cx < 0) cx = 0; if (cy < 0) cy = 0;
            if (cx > 65535) cx = 65535; if (cy > 65535) cy = 65535;

            byte[] hdr = new byte[13];
            int n = buf.Length;
            hdr[0] = (byte)(n >> 24); hdr[1] = (byte)(n >> 16); hdr[2] = (byte)(n >> 8); hdr[3] = (byte)n;
            hdr[4] = (byte)(cx >> 8); hdr[5] = (byte)cx;
            hdr[6] = (byte)(cy >> 8); hdr[7] = (byte)cy;
            hdr[8] = (byte)(use.Width >> 8);  hdr[9] = (byte)use.Width;
            hdr[10] = (byte)(use.Height >> 8); hdr[11] = (byte)use.Height;
            hdr[12] = 1;

            lock (gate) {
              so.Write(hdr, 0, 13);
              so.Write(buf, 0, buf.Length);
              so.Flush();
            }
            lastSentAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
          }
        } finally {
          if (scaled != null) scaled.Dispose();
        }
      }
      int wait = minInterval - (int)sw.Elapsed.TotalMilliseconds;
      if (wait > 0) Thread.Sleep(wait);
    }
  }
}
'@

[GdiStream]::Run($Fps, $Quality, $MaxWidth) | Out-Null
