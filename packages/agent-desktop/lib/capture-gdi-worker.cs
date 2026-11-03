// capture-gdi-worker.cs — عامل التقاط GDI كعملية تنفيذية مستقلة (3.11.10).
//
// لماذا: 3.11.9 كان العامل سكربت PowerShell يستدعي Add-Type لبناء هذا النوع
// وقت التشغيل. Add-Type وحده يكلّف ~2s على أجهزة المختبر (ولذلك كان «البارد»
// يعود إلى ~4.9s إن لم يصل التسجيل قبل أول جلسة). التجميع المسبق بـcsc.exe
// وقت البناء يُلغي هذا الزمن، ويُلغي كذلك إقلاع powershell.exe.
//
// البروتوكول مطابق حرفياً لعامل 3.11.9 (لا تغيير في السيرفر ولا في العارض):
//   stdout: [u32 len][u16 cx][u16 cy][u16 sw][u16 sh][u8 flags][jpeg ...]
//   stdin : "A\n" = تفعيل الالتقاط · "P\n" = خمول تام · إغلاق stdin = خروج
//
// يُترجم بـcsc.exe (C# 5) — لا string interpolation ولا expression-bodied members.

using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public class GdiStream
{
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int w, int h);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr d, int x, int y, int w, int h, IntPtr s, int sx, int sy, int rop);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    // 3.12.2 — ضروري قبل أي GetSystemMetrics: بدونه تُحسب الإحداثيات في فضاء 1920 بينما
    // SendInput يطبّقها على 1280 الفعلية ⇒ كل نقرة تهبط عند 0.667 من موضعها (قيس: 400→267).
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    // 3.12.2 — حقن إدخال أصلي داخل نفس العامل: مسار PowerShell كان ينتظر ACK لكل حركة
    // (~20–60ms) فيتأخر المؤشر ويضيع النقر. هنا التنفيذ في نفس العملية بلا any IPC.
    // 3.12.2 (M1) — الإدخال عبر SendInput لا SetCursorPos/mouse_event: في جلسة WIN10
    // (headless) يعيد SetCursorPos القيمة False دائماً، بينما SendInput ينجح ويحرّك المؤشر.
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int cb);
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte sc, uint f, IntPtr e);
    [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public U U; }
    [StructLayout(LayoutKind.Explicit)] public struct U { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    const uint MV = 0x0001, AB = 0x8000, LD = 2, LU = 4, RD = 8, RU = 16, MD = 32, MU = 64, WH = 0x0800, KU = 2;
    static int scrW = 1280, scrH = 720;
    static int maxX = 1279, maxY = 719;

    // 3.12.2 — معايرة: عملية غير واعية بـDPI ترى GetSystemMetrics كبيرة (1920) بينما
    // SendInput يطبّق على العرض الفعلي (1280) ⇒ 400 تهبط 267. نقيس النصف فعلياً ونستنتج العرض.
    static void Calibrate()
    {
        try
        {
            INPUT[] a = new INPUT[1];
            a[0].type = 0;
            a[0].U.mi.dx = 65535; a[0].U.mi.dy = 65535;
            a[0].U.mi.dwFlags = MV | AB;
            SendInput(1, a, Marshal.SizeOf(typeof(INPUT)));
            Thread.Sleep(50);
            POINT p; GetCursorPos(out p);
            if (p.X > 100) maxX = p.X;
            if (p.Y > 100) maxY = p.Y;
        }
        catch { }
    }

    static void MoveTo(int x, int y)
    {
        INPUT[] a = new INPUT[1];
        a[0].type = 0;
        // x,y في فضاء الإطار (نفس فضاء GetCursorPos). نستخدم أقصى انحراف مقيس كمرجع،
        // فيصل النقر إلى نفس البكسل الذي رآه المستخدم بغضّ النظر عن DPI.
        a[0].U.mi.dx = (int)Math.Round(x * 65535.0 / Math.Max(1, maxX));
        a[0].U.mi.dy = (int)Math.Round(y * 65535.0 / Math.Max(1, maxY));
        a[0].U.mi.dwFlags = MV | AB;
        SendInput(1, a, Marshal.SizeOf(typeof(INPUT)));
    }

    static void Btn(uint flag)
    {
        INPUT[] a = new INPUT[1];
        a[0].type = 0;
        a[0].U.mi.dwFlags = flag;
        SendInput(1, a, Marshal.SizeOf(typeof(INPUT)));
    }

    static void Wheel(int delta)
    {
        INPUT[] a = new INPUT[1];
        a[0].type = 0;
        a[0].U.mi.mouseData = (uint)delta;
        a[0].U.mi.dwFlags = WH;
        SendInput(1, a, Marshal.SizeOf(typeof(INPUT)));
    }
    public struct POINT { public int X; public int Y; }
    const int SRCCOPY = 0x00CC0020;

    static readonly object gate = new object();
    static volatile bool active = false;

    static Bitmap Grab(int x, int y, int w, int h)
    {
        IntPtr screenDc = GetDC(IntPtr.Zero);
        IntPtr memDc = CreateCompatibleDC(screenDc);
        IntPtr bmp = CreateCompatibleBitmap(screenDc, w, h);
        IntPtr old = SelectObject(memDc, bmp);
        try
        {
            BitBlt(memDc, 0, 0, w, h, screenDc, x, y, SRCCOPY);
            return Image.FromHbitmap(bmp);
        }
        finally
        {
            SelectObject(memDc, old);
            DeleteObject(bmp);
            DeleteDC(memDc);
            ReleaseDC(IntPtr.Zero, screenDc);
        }
    }

    static Bitmap Scale(Bitmap src, int maxWidth)
    {
        if (maxWidth <= 0 || src.Width <= maxWidth) return null;
        int w = maxWidth;
        int h = (int)Math.Round(src.Height * (maxWidth / (double)src.Width));
        if (h < 2) h = 2;
        Bitmap dst = new Bitmap(w, h, PixelFormat.Format24bppRgb);
        using (Graphics g = Graphics.FromImage(dst))
        {
            g.InterpolationMode = InterpolationMode.Bilinear;
            g.PixelOffsetMode = PixelOffsetMode.HighSpeed;
            g.DrawImage(src, 0, 0, w, h);
        }
        return dst;
    }

    static long Signature(Bitmap b)
    {
        long h = 17;
        int sx = Math.Max(1, b.Width / 16), sy = Math.Max(1, b.Height / 16);
        for (int y = 0; y < b.Height; y += sy)
        {
            for (int x = 0; x < b.Width; x += sx)
            {
                Color c = b.GetPixel(x, y);
                h = h * 31 + (c.R + c.G + c.B) / 3;
            }
        }
        return h;
    }

    static void ILog(string s)
    {
        try
        {
            string p = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "input-worker.log");
            File.AppendAllText(p, DateTime.Now.ToString("HH:mm:ss.fff") + " " + s + "\r\n");
        }
        catch { }
    }

    static void CommandLoop()
    {
        ILog("command-loop-start");
        try
        {
            StreamReader si = new StreamReader(Console.OpenStandardInput());
            string line;
            while ((line = si.ReadLine()) != null)
            {
                line = line.Trim();
                if (line == "A") active = true;
                else if (line == "P") active = false;
                else if (line.Length > 2 && line[1] == ' ')
                {
                    // M x y · C|B|E <L|R|M> x y · W delta · K vk 0|1
                    char c = line[0];
                    string[] a = line.Substring(2).Trim().Split(' ');
                    try
                    {
                        if (c == 'M' && a.Length >= 2) MoveTo(int.Parse(a[0]), int.Parse(a[1]));
                        else if ((c == 'C' || c == 'B' || c == 'E') && a.Length >= 3)
                        {
                            uint dn = a[0] == "R" ? RD : (a[0] == "M" ? MD : LD);
                            uint up = a[0] == "R" ? RU : (a[0] == "M" ? MU : LU);
                            MoveTo(int.Parse(a[1]), int.Parse(a[2]));
                            if (c != 'E') Btn(dn);
                            if (c != 'B') Btn(up);
                        }
                        else if (c == 'W' && a.Length >= 1) Wheel(int.Parse(a[0]));
                        else if (c == 'K' && a.Length >= 2) keybd_event(byte.Parse(a[0]), 0, a[1] == "1" ? KU : 0, IntPtr.Zero);
                    }
                    catch (Exception ex) { ILog("cmd-err " + line + " :: " + ex.Message); }
                }
            }
        }
        catch { }
        // stdin أُغلق ⇒ العملية بلا مستهلك: اخرج بدل أن تظل معلّقة
        active = false;
        Environment.Exit(0);
    }

    public static void Run(int fps, int quality, int maxWidth)
    {
        SetProcessDPIAware();
        scrW = GetSystemMetrics(0); scrH = GetSystemMetrics(1);
        if (scrW < 2) scrW = 1280;
        if (scrH < 2) scrH = 720;
        Calibrate();
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

        while (true)
        {
            if (!active)
            {
                // خمول تام: لا التقاط، لا ترميز — يستهلك ~0% CPU
                wasActive = false;
                Thread.Sleep(120);
                continue;
            }
            if (!wasActive) { wasActive = true; lastSig = 0L; lastSentAt = 0L; }

            sw.Restart();
            using (Bitmap full = Grab(vx, vy, vw, vh))
            {
                Bitmap use = full;
                Bitmap scaled = null;
                try
                {
                    // 3.12.2 — البصمة تُحسب على الإطار الكامل **قبل** التصغير: التصغير هو
                    // العمل الثقيل (1920×1080 → 1600×900 لكل إطار) ولا معنى له لإطار لم يتغيّر.
                    // قياس WIN10: 12 محاولة/ث، 1.4 إطار مُرسل/ث ⇒ 11 تصغيراً مهدوراً كل ثانية.
                    long sig = Signature(full);
                    long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    bool changed = sig != lastSig;
                    if (!changed && now - lastSentAt < 1000)
                    {
                        int idleWait = minInterval - (int)sw.Elapsed.TotalMilliseconds;
                        if (idleWait > 0) Thread.Sleep(idleWait);
                        continue;
                    }
                    lastSig = sig;

                    scaled = Scale(full, maxWidth);
                    if (scaled != null) use = scaled;

                    using (var ms = new MemoryStream())
                    {
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
                        hdr[8] = (byte)(use.Width >> 8); hdr[9] = (byte)use.Width;
                        hdr[10] = (byte)(use.Height >> 8); hdr[11] = (byte)use.Height;
                        hdr[12] = 1;

                        lock (gate)
                        {
                            so.Write(hdr, 0, 13);
                            so.Write(buf, 0, buf.Length);
                            so.Flush();
                        }
                        lastSentAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    }
                }
                finally
                {
                    if (scaled != null) scaled.Dispose();
                }
            }
            int wait = minInterval - (int)sw.Elapsed.TotalMilliseconds;
            if (wait > 0) Thread.Sleep(wait);
        }
    }

    static int Arg(string[] argv, string name, int fallback)
    {
        for (int i = 0; i < argv.Length - 1; i++)
        {
            if (string.Equals(argv[i], name, StringComparison.OrdinalIgnoreCase))
            {
                int v;
                if (int.TryParse(argv[i + 1], out v)) return v;
            }
        }
        return fallback;
    }

    public static int Main(string[] argv)
    {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        try { SetProcessDPIAware(); } catch { }
        int fps = Arg(argv, "-Fps", 12);
        int quality = Arg(argv, "-Quality", 60);
        int maxWidth = Arg(argv, "-MaxWidth", 1600);
        try
        {
            Run(fps, quality, maxWidth);
            return 0;
        }
        catch (Exception e)
        {
            try { Console.Error.WriteLine("capture-gdi-worker: " + e.Message); } catch { }
            return 1;
        }
    }
}
