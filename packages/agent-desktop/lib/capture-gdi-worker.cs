// capture-gdi-worker.cs — عامل التقاط GDI كعملية تنفيذية مستقلة (3.11.10).
//
// لماذا: 3.11.9 كان العامل سكربت PowerShell يستدعي Add-Type لبناء هذا النوع
// وقت التشغيل. Add-Type وحده يكلّف ~2s على أجهزة المختبر (ولذلك كان «البارد»
// يعود إلى ~4.9s إن لم يصل التسجيل قبل أول جلسة). التجميع المسبق بـcsc.exe
// يُلغي هذا الزمن، ويُلغي كذلك إقلاع powershell.exe.
//
// البروتوكول (مطابق 3.11.10 + امتداد دلتا 3.17.0):
//   stdout — إطار كامل  : [u32 len][u16 cx][u16 cy][u16 sw][u16 sh][u8 flags=1][jpeg ...]
//   stdout — دلتا منطقة : [u32 len][u16 cx][u16 cy][u16 sw][u16 sh][u8 flags=2][u16 rx][u16 ry][jpeg ...]
//     sw/sh = مقاس الخرج الكامل (بعد التصغير) في الحالتين — العارض الثنائي لا يغيّر
//     اللوحة من إطار دلتا، وJPEG هو مقاس المستطيل المتغيّر.
//     rx/ry = أصل المستطيل المتغيّر في فضاء الخرج.
//   stdin : "A\n" = تفعيل الالتقاط · "P\n" = خمول تام · إغلاق stdin = خروج
//
// P1+P2 (r25): دلتا GDI + رفع FPS.
//   - مقارنة بدقة الشاشة (لا تصغير كامل كل إطار) · تصغير القصاصة المتغيّرة فقط.
//   - BitBlt على Bitmap مُعاد استخدامه (لا Create/Delete DC كل إطار).
//   - بلاطة 64px · مستطيل محيط واحد لكل دورة (السيرفر يستبدل الإطار المعلّق).
//   - مفتاح كل 2000ms · إذا غيّر ≥45% من البلاطات يُرسل إطار كامل.
//   - timeBeginPeriod(1) لدقة النوم.
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
    [DllImport("gdi32.dll")] static extern bool GdiFlush();
    [DllImport("gdi32.dll", SetLastError = true)] static extern IntPtr CreateDIBSection(IntPtr hdc, ref BITMAPINFO bmi, uint usage, out IntPtr bits, IntPtr hSection, uint offset);
    [DllImport("msvcrt.dll", CallingConvention = CallingConvention.Cdecl)] static extern int memcmp(IntPtr a, IntPtr b, IntPtr count);
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
    [DllImport("winmm.dll")] static extern uint timeBeginPeriod(uint ms);
    [DllImport("winmm.dll")] static extern uint timeEndPeriod(uint ms);
    [DllImport("kernel32.dll", SetLastError = false, EntryPoint = "RtlMoveMemory")]
    static extern void MemCopy(IntPtr dest, IntPtr src, IntPtr count);
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

    // 3.12.2 — أوامر M/C/B/E تستقبل إحداثيات **مطلقة 0..65535** (نفس فضاء SendInput)،
    // فلا يبقى أي أثر لـDPI أو تصغير الإطار. المشاهد يرسل نسبة 0..1 والوكيل يضربها في 65535.
    static uint MoveTo(int ax, int ay)
    {
        INPUT[] a = new INPUT[1];
        a[0].type = 0;
        a[0].U.mi.dx = ax;
        a[0].U.mi.dy = ay;
        a[0].U.mi.dwFlags = MV | AB;
        return SendInput(1, a, Marshal.SizeOf(typeof(INPUT)));
    }

    static uint Btn(uint flag)
    {
        INPUT[] a = new INPUT[1];
        a[0].type = 0;
        a[0].U.mi.dwFlags = flag;
        return SendInput(1, a, Marshal.SizeOf(typeof(INPUT)));
    }

    static uint Wheel(int delta)
    {
        INPUT[] a = new INPUT[1];
        a[0].type = 0;
        a[0].U.mi.mouseData = (uint)delta;
        a[0].U.mi.dwFlags = WH;
        return SendInput(1, a, Marshal.SizeOf(typeof(INPUT)));
    }
    public struct POINT { public int X; public int Y; }
    const int SRCCOPY = 0x00CC0020;

    static readonly object gate = new object();
    static volatile bool active = false;

    // P1 — ثوابت الدلتا
    const int TILE = 64;            // بلاطة 64×64
    const long KEY_MS = 2000;       // إطار كامل كل ثانيتين حتى على شاشة ساكنة
    const double KEY_RATIO = 0.45;  // تغيّر ≥45% من البلاطات ⇒ إطار كامل بدل دلتا كبيرة

    // BitBlt على سطح مُعاد استخدامه — Create/Delete DC كل إطار كان مكلفاً على VMware.
    static Bitmap screenBmp = null;
    static Graphics screenG = null;

    // P2 (r27) — التقاط DIB section: مؤشر بكسل دائم بلا LockBits كل إطار.
    // LockBits على GDI+ Bitmap كان ينسخ 8MB × 2 كل دورة على 1080p ⇒ سقف ~10fps.
    [StructLayout(LayoutKind.Sequential)]
    struct BITMAPINFOHEADER { public uint biSize; public int biWidth; public int biHeight; public ushort biPlanes; public ushort biBitCount; public uint biCompression; public uint biSizeImage; public int biXPelsPerMeter; public int biYPelsPerMeter; public uint biClrUsed; public uint biClrImportant; }
    [StructLayout(LayoutKind.Sequential)]
    struct BITMAPINFO { public BITMAPINFOHEADER bmiHeader; public uint bmiColors; }
    static IntPtr capDC = IntPtr.Zero;
    static IntPtr capDib = IntPtr.Zero;
    static IntPtr capBits = IntPtr.Zero;
    static IntPtr prevDib = IntPtr.Zero;
    static IntPtr prevBits = IntPtr.Zero;
    static IntPtr scrDC = IntPtr.Zero;
    static int dibW = 0, dibH = 0;
    static bool dibOk = false;
    static bool dibResized = false;

    static bool EnsureDib(int w, int h)
    {
        if (dibOk && dibW == w && dibH == h && capBits != IntPtr.Zero && prevBits != IntPtr.Zero) return true;
        ReleaseDib();
        scrDC = GetDC(IntPtr.Zero);
        if (scrDC == IntPtr.Zero) return false;
        capDC = CreateCompatibleDC(scrDC);
        if (capDC == IntPtr.Zero) { ReleaseDC(IntPtr.Zero, scrDC); scrDC = IntPtr.Zero; return false; }
        BITMAPINFO bmi = new BITMAPINFO();
        bmi.bmiHeader.biSize = (uint)Marshal.SizeOf(typeof(BITMAPINFOHEADER));
        bmi.bmiHeader.biWidth = w;
        bmi.bmiHeader.biHeight = -h; // top-down
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = 0; // BI_RGB
        capDib = CreateDIBSection(capDC, ref bmi, 0, out capBits, IntPtr.Zero, 0);
        prevDib = CreateDIBSection(capDC, ref bmi, 0, out prevBits, IntPtr.Zero, 0);
        if (capDib == IntPtr.Zero || prevDib == IntPtr.Zero || capBits == IntPtr.Zero || prevBits == IntPtr.Zero)
        {
            ReleaseDib();
            return false;
        }
        SelectObject(capDC, capDib);
        dibW = w; dibH = h; dibOk = true;
        dibResized = true;
        return true;
    }

    static void ReleaseDib()
    {
        if (capDib != IntPtr.Zero) { try { DeleteObject(capDib); } catch { } capDib = IntPtr.Zero; }
        if (prevDib != IntPtr.Zero) { try { DeleteObject(prevDib); } catch { } prevDib = IntPtr.Zero; }
        if (capDC != IntPtr.Zero) { try { DeleteDC(capDC); } catch { } capDC = IntPtr.Zero; }
        if (scrDC != IntPtr.Zero) { try { ReleaseDC(IntPtr.Zero, scrDC); } catch { } scrDC = IntPtr.Zero; }
        capBits = IntPtr.Zero; prevBits = IntPtr.Zero;
        dibOk = false; dibW = 0; dibH = 0;
    }

    // يُرجع مؤشر بكسل DIB بعد BitBlt من الشاشة. IntPtr.Zero = فشل (استخدم Grab البديل).
    static IntPtr GrabDib(int x, int y, int w, int h)
    {
        if (!EnsureDib(w, h)) return IntPtr.Zero;
        if (!BitBlt(capDC, 0, 0, w, h, scrDC, x, y, SRCCOPY)) return IntPtr.Zero;
        GdiFlush();
        return capBits;
    }

    static Bitmap BitmapFromDib(IntPtr bits, int srcW, Rectangle r)
    {
        if (bits == IntPtr.Zero || r.Width <= 0 || r.Height <= 0) return null;
        Bitmap bmp = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppRgb);
        BitmapData dd = bmp.LockBits(new Rectangle(0, 0, r.Width, r.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppRgb);
        try
        {
            int row = r.Width * 4;
            for (int y = 0; y < r.Height; y++)
            {
                IntPtr sp = new IntPtr(bits.ToInt64() + (long)(r.Y + y) * srcW * 4 + (long)r.X * 4);
                IntPtr dp = new IntPtr(dd.Scan0.ToInt64() + y * dd.Stride);
                MemCopy(dp, sp, (IntPtr)row);
            }
        }
        finally { bmp.UnlockBits(dd); }
        return bmp;
    }

    static void CopyDibRegion(IntPtr src, IntPtr dst, int srcW, Rectangle r)
    {
        if (src == IntPtr.Zero || dst == IntPtr.Zero || r.Width <= 0 || r.Height <= 0) return;
        int row = r.Width * 4;
        for (int y = 0; y < r.Height; y++)
        {
            IntPtr sp = new IntPtr(src.ToInt64() + (long)(r.Y + y) * srcW * 4 + (long)r.X * 4);
            IntPtr dp = new IntPtr(dst.ToInt64() + (long)(r.Y + y) * srcW * 4 + (long)r.X * 4);
            MemCopy(dp, sp, (IntPtr)row);
        }
    }

    static void CopyDibAll(IntPtr src, IntPtr dst, int w, int h)
    {
        if (src == IntPtr.Zero || dst == IntPtr.Zero) return;
        MemCopy(dst, src, (IntPtr)(w * h * 4));
    }

    // P2 — diff على مؤشر DIB مباشرة (memcmp أصلي) بلا LockBits.
    static Rectangle DiffDib(IntPtr a, IntPtr b, int w, int h, out bool any, out double changedRatio)
    {
        any = false; changedRatio = 0.0;
        if (a == IntPtr.Zero || b == IntPtr.Zero) { any = true; changedRatio = 1.0; return new Rectangle(0, 0, w, h); }
        int stride = w * 4;
        if (memcmp(a, b, (IntPtr)(w * h * 4)) == 0) return Rectangle.Empty; // مسار ساكن سريع
        int tw = (w + TILE - 1) / TILE;
        int th = (h + TILE - 1) / TILE;
        bool[] changed = new bool[tw * th];
        int changedTiles = 0;
        int minTx = tw, minTy = th, maxTx = -1, maxTy = -1;
        for (int y = 0; y < h; y++)
        {
            IntPtr ra = new IntPtr(a.ToInt64() + y * stride);
            IntPtr rb = new IntPtr(b.ToInt64() + y * stride);
            if (memcmp(ra, rb, (IntPtr)stride) == 0) continue;
            int ty = y / TILE;
            int tileTop = ty * TILE;
            int tileBot = Math.Min(h, tileTop + TILE);
            for (int tx = 0; tx < tw; tx++)
            {
                int idx = ty * tw + tx;
                if (changed[idx]) continue;
                int x0 = tx * TILE;
                int x1 = Math.Min(w, x0 + TILE);
                bool hit = false;
                for (int yy = tileTop; yy < tileBot; yy++)
                {
                    IntPtr ta = new IntPtr(a.ToInt64() + yy * stride + x0 * 4);
                    IntPtr tb = new IntPtr(b.ToInt64() + yy * stride + x0 * 4);
                    if (memcmp(ta, tb, (IntPtr)((x1 - x0) * 4)) != 0) { hit = true; break; }
                }
                if (hit)
                {
                    changed[idx] = true;
                    changedTiles++;
                    if (tx < minTx) minTx = tx;
                    if (tx > maxTx) maxTx = tx;
                    if (ty < minTy) minTy = ty;
                    if (ty > maxTy) maxTy = ty;
                }
            }
        }
        if (changedTiles == 0) return Rectangle.Empty;
        any = true;
        changedRatio = (double)changedTiles / (double)(tw * th);
        int rx = minTx * TILE;
        int ry = minTy * TILE;
        int rw = Math.Min(w, (maxTx + 1) * TILE) - rx;
        int rh = Math.Min(h, (maxTy + 1) * TILE) - ry;
        return new Rectangle(rx, ry, rw, rh);
    }

    // يُرجع Bitmap مُعاد استخدامه — الاستدعائي **لا يُتلفه**.
    static Bitmap Grab(int x, int y, int w, int h)
    {
        if (screenBmp == null || screenBmp.Width != w || screenBmp.Height != h)
        {
            if (screenG != null) { try { screenG.Dispose(); } catch { } screenG = null; }
            if (screenBmp != null) { try { screenBmp.Dispose(); } catch { } screenBmp = null; }
            screenBmp = new Bitmap(w, h, PixelFormat.Format32bppRgb);
            screenG = Graphics.FromImage(screenBmp);
        }
        screenG.CopyFromScreen(x, y, 0, 0, new Size(w, h), CopyPixelOperation.SourceCopy);
        return screenBmp;
    }

    static Bitmap ScaleTo(Bitmap src, int w, int h)
    {
        Bitmap dst = new Bitmap(w, h, PixelFormat.Format32bppRgb);
        using (Graphics g = Graphics.FromImage(dst))
        {
            g.InterpolationMode = InterpolationMode.Bilinear;
            g.PixelOffsetMode = PixelOffsetMode.HighSpeed;
            g.DrawImage(src, 0, 0, w, h);
        }
        return dst;
    }

    // نسخة 32bpp متطابقة بكسل-ببكسل — DrawImage قد يزيح نصف بكسل فيخلق فرقاً دائماً.
    static Bitmap Clone32(Bitmap src)
    {
        Rectangle r = new Rectangle(0, 0, src.Width, src.Height);
        Bitmap dst = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppRgb);
        BitmapData sd = src.LockBits(r, ImageLockMode.ReadOnly, PixelFormat.Format32bppRgb);
        BitmapData dd = dst.LockBits(r, ImageLockMode.WriteOnly, PixelFormat.Format32bppRgb);
        try
        {
            int row = Math.Min(Math.Abs(sd.Stride), Math.Abs(dd.Stride));
            for (int y = 0; y < src.Height; y++)
            {
                IntPtr sp = new IntPtr(sd.Scan0.ToInt64() + y * sd.Stride);
                IntPtr dp = new IntPtr(dd.Scan0.ToInt64() + y * dd.Stride);
                MemCopy(dp, sp, (IntPtr)row);
            }
        }
        finally
        {
            src.UnlockBits(sd);
            dst.UnlockBits(dd);
        }
        return dst;
    }

    static void CopyRegion(Bitmap src, Bitmap dst, Rectangle r)
    {
        if (r.Width <= 0 || r.Height <= 0) return;
        if (r.X < 0 || r.Y < 0 || r.X + r.Width > src.Width || r.Y + r.Height > src.Height) return;
        if (r.X + r.Width > dst.Width || r.Y + r.Height > dst.Height) return;
        BitmapData sd = src.LockBits(r, ImageLockMode.ReadOnly, PixelFormat.Format32bppRgb);
        BitmapData dd = dst.LockBits(r, ImageLockMode.WriteOnly, PixelFormat.Format32bppRgb);
        try
        {
            int n = r.Width * 4;
            for (int y = 0; y < r.Height; y++)
            {
                IntPtr sp = new IntPtr(sd.Scan0.ToInt64() + y * sd.Stride);
                IntPtr dp = new IntPtr(dd.Scan0.ToInt64() + y * dd.Stride);
                MemCopy(dp, sp, (IntPtr)n);
            }
        }
        finally
        {
            src.UnlockBits(sd);
            dst.UnlockBits(dd);
        }
    }

    static int MemCmp(IntPtr a, IntPtr b, int count)
    {
        long i = 0;
        long n8 = count - (count % 8);
        for (; i < n8; i += 8)
        {
            if (Marshal.ReadInt64(a, (int)i) != Marshal.ReadInt64(b, (int)i)) return 1;
        }
        for (; i < count; i++)
        {
            if (Marshal.ReadByte(a, (int)i) != Marshal.ReadByte(b, (int)i)) return 1;
        }
        return 0;
    }

    // P1 — مستطيل محيط للبلاطات المتغيّرة. مقارنة صف-بصف أولاً (مسار سريع للشاشة الساكنة).
    static Rectangle DiffBBox(Bitmap a, Bitmap b, out bool any, out double changedRatio)
    {
        any = false;
        changedRatio = 0.0;
        int w = a.Width, h = a.Height;
        if (b.Width != w || b.Height != h) { any = true; changedRatio = 1.0; return new Rectangle(0, 0, w, h); }

        int tw = (w + TILE - 1) / TILE;
        int th = (h + TILE - 1) / TILE;
        bool[] changed = new bool[tw * th];
        int changedTiles = 0;
        int minTx = tw, minTy = th, maxTx = -1, maxTy = -1;

        BitmapData da = a.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppRgb);
        BitmapData db = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppRgb);
        try
        {
            IntPtr pa = da.Scan0, pb = db.Scan0;
            int stride = da.Stride;
            for (int y = 0; y < h; y++)
            {
                IntPtr ra = new IntPtr(pa.ToInt64() + y * stride);
                IntPtr rb = new IntPtr(pb.ToInt64() + y * stride);
                if (MemCmp(ra, rb, w * 4) == 0) continue;
                int ty = y / TILE;
                int tileTop = ty * TILE;
                int tileBot = Math.Min(h, tileTop + TILE);
                for (int tx = 0; tx < tw; tx++)
                {
                    int idx = ty * tw + tx;
                    if (changed[idx]) continue;
                    int x0 = tx * TILE;
                    int x1 = Math.Min(w, x0 + TILE);
                    bool hit = false;
                    for (int yy = tileTop; yy < tileBot; yy++)
                    {
                        IntPtr ta = new IntPtr(pa.ToInt64() + yy * stride + x0 * 4);
                        IntPtr tb = new IntPtr(pb.ToInt64() + yy * stride + x0 * 4);
                        if (MemCmp(ta, tb, (x1 - x0) * 4) != 0) { hit = true; break; }
                    }
                    if (hit)
                    {
                        changed[idx] = true;
                        changedTiles++;
                        if (tx < minTx) minTx = tx;
                        if (tx > maxTx) maxTx = tx;
                        if (ty < minTy) minTy = ty;
                        if (ty > maxTy) maxTy = ty;
                    }
                }
            }
        }
        finally
        {
            a.UnlockBits(da);
            b.UnlockBits(db);
        }

        if (changedTiles == 0) return Rectangle.Empty;
        any = true;
        changedRatio = (double)changedTiles / (double)(tw * th);
        int rx = minTx * TILE;
        int ry = minTy * TILE;
        int rw = Math.Min(w, (maxTx + 1) * TILE) - rx;
        int rh = Math.Min(h, (maxTy + 1) * TILE) - ry;
        return new Rectangle(rx, ry, rw, rh);
    }

    static void WriteFrame(Stream so, byte[] jpeg, int cx, int cy, int w, int h, bool key, int rx, int ry)
    {
        byte[] hdr = new byte[key ? 13 : 17];
        int n = jpeg.Length;
        hdr[0] = (byte)(n >> 24); hdr[1] = (byte)(n >> 16); hdr[2] = (byte)(n >> 8); hdr[3] = (byte)n;
        hdr[4] = (byte)(cx >> 8); hdr[5] = (byte)cx;
        hdr[6] = (byte)(cy >> 8); hdr[7] = (byte)cy;
        hdr[8] = (byte)(w >> 8); hdr[9] = (byte)w;
        hdr[10] = (byte)(h >> 8); hdr[11] = (byte)h;
        hdr[12] = key ? (byte)1 : (byte)2;
        if (!key)
        {
            hdr[13] = (byte)(rx >> 8); hdr[14] = (byte)rx;
            hdr[15] = (byte)(ry >> 8); hdr[16] = (byte)ry;
        }
        lock (gate)
        {
            so.Write(hdr, 0, hdr.Length);
            so.Write(jpeg, 0, jpeg.Length);
            so.Flush();
        }
    }

    static byte[] JpegOf(Bitmap b, ImageCodecInfo jpg, EncoderParameters ep)
    {
        using (MemoryStream ms = new MemoryStream())
        {
            b.Save(ms, jpg, ep);
            return ms.ToArray();
        }
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
                        if (c == 'M' && a.Length >= 2)
                        {
                            uint rm = MoveTo(int.Parse(a[0]), int.Parse(a[1]));
                            if (rm == 0) ILog("M " + a[0] + " " + a[1] + " ok=False");
                        }
                        else if ((c == 'C' || c == 'B' || c == 'E') && a.Length >= 3)
                        {
                            uint dn = a[0] == "R" ? RD : (a[0] == "M" ? MD : LD);
                            uint up = a[0] == "R" ? RU : (a[0] == "M" ? MU : LU);
                            uint rm = MoveTo(int.Parse(a[1]), int.Parse(a[2]));
                            uint r1 = 0, r2 = 0;
                            if (c != 'E') r1 = Btn(dn);
                            if (c != 'B') r2 = Btn(up);
                            bool ok = rm > 0 && (c == 'E' || r1 > 0) && (c == 'B' || r2 > 0);
                            ILog(c + " " + a[0] + " " + a[1] + " " + a[2] + " ok=" + ok);
                        }
                        else if (c == 'W' && a.Length >= 1)
                        {
                            uint rw = Wheel(int.Parse(a[0]));
                            ILog("W " + a[0] + " ok=" + (rw > 0));
                        }
                        else if (c == 'K' && a.Length >= 2)
                        {
                            keybd_event(byte.Parse(a[0]), 0, a[1] == "1" ? KU : 0, IntPtr.Zero);
                            ILog("K " + a[0] + " " + a[1] + " sent");
                        }
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
        try { timeBeginPeriod(1); } catch { }
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
        Bitmap prevFull = null;
        long lastKeyAt = 0L;
        long lastStatAt = 0L;
        int statKeys = 0, statDeltas = 0, statSkips = 0;
        long statMsSum = 0; int statMsN = 0;
        var sw = new Stopwatch();
        bool wasActive = false;
        int outW = 0, outH = 0;
        bool needScale = false;

        ILog("run fps=" + fps + " quality=" + quality + " maxWidth=" + maxWidth + " screen=" + vw + "x" + vh);

        while (true)
        {
            if (!active)
            {
                // خمول تام: لا التقاط، لا ترميز — يستهلك ~0% CPU
                wasActive = false;
                if (prevFull != null) { try { prevFull.Dispose(); } catch { } prevFull = null; }
                Thread.Sleep(120);
                continue;
            }
            if (!wasActive)
            {
                wasActive = true;
                lastKeyAt = 0L;
                lastStatAt = 0L;
                statKeys = 0; statDeltas = 0; statSkips = 0;
                statMsSum = 0; statMsN = 0;
                if (prevFull != null) { try { prevFull.Dispose(); } catch { } prevFull = null; }
            }
            // 2026-11-09 — تغيير دقة الشاشة كان لا يُرى: الحدود تُقرأ كل دورة.
            {
                int nvx = GetSystemMetrics(76), nvy = GetSystemMetrics(77);
                int nvw = GetSystemMetrics(78), nvh = GetSystemMetrics(79);
                if (nvw <= 0 || nvh <= 0) { nvw = GetSystemMetrics(0); nvh = GetSystemMetrics(1); nvx = 0; nvy = 0; }
                if (nvw > 0 && nvh > 0 && (nvw != vw || nvh != vh || nvx != vx || nvy != vy))
                {
                    vx = nvx; vy = nvy; vw = nvw; vh = nvh;
                    if (prevFull != null) { try { prevFull.Dispose(); } catch { } prevFull = null; }
                    outW = 0; outH = 0;
                }
            }
            if (outW == 0)
            {
                outW = vw; outH = vh;
                needScale = false;
                if (maxWidth > 0 && vw > maxWidth)
                {
                    outW = maxWidth;
                    outH = (int)Math.Round(vh * (maxWidth / (double)vw));
                    if (outH < 2) outH = 2;
                    needScale = true;
                }
                ILog("out " + outW + "x" + outH + " scale=" + needScale);
            }

            sw.Restart();
            try
            {
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                POINT p; GetCursorPos(out p);
                int cx = (int)Math.Round((p.X - vx) * (outW / (double)Math.Max(1, maxX)));
                int cy = (int)Math.Round((p.Y - vy) * (outH / (double)Math.Max(1, maxY)));
                if (cx < 0) cx = 0; if (cy < 0) cy = 0;
                if (cx > 65535) cx = 65535; if (cy > 65535) cy = 65535;

                IntPtr cur = GrabDib(vx, vy, vw, vh);
                bool useDib = cur != IntPtr.Zero;
                bool forceKey = !useDib
                    || dibResized
                    || now - lastKeyAt >= KEY_MS;
                if (useDib && (dibResized || lastKeyAt == 0L))
                {
                    CopyDibAll(cur, prevBits, vw, vh);
                    dibResized = false;
                }

                if (!forceKey)
                {
                    bool any = false;
                    double ratio = 0.0;
                    Rectangle bbox = DiffDib(cur, prevBits, vw, vh, out any, out ratio);
                    if (!any)
                    {
                        statSkips++;
                        statMsSum += sw.ElapsedMilliseconds; statMsN++;
                        int idleWait = minInterval - (int)sw.Elapsed.TotalMilliseconds;
                        if (idleWait > 0) Thread.Sleep(idleWait);
                        continue;
                    }
                    if (ratio < KEY_RATIO)
                    {
                        bbox.Intersect(new Rectangle(0, 0, vw, vh));
                        if (bbox.Width > 0 && bbox.Height > 0)
                        {
                            byte[] jb;
                            int rx, ry;
                            if (needScale)
                            {
                                double sx = outW / (double)vw;
                                double sy = outH / (double)vh;
                                int ox = (int)Math.Floor(bbox.X * sx);
                                int oy = (int)Math.Floor(bbox.Y * sy);
                                int ox2 = (int)Math.Ceiling((bbox.X + bbox.Width) * sx);
                                int oy2 = (int)Math.Ceiling((bbox.Y + bbox.Height) * sy);
                                if (ox < 0) ox = 0; if (oy < 0) oy = 0;
                                if (ox2 > outW) ox2 = outW; if (oy2 > outH) oy2 = outH;
                                int ow = ox2 - ox, oh = oy2 - oy;
                                if (ow < 1) ow = 1; if (oh < 1) oh = 1;
                                Bitmap crop = BitmapFromDib(cur, vw, bbox);
                                Bitmap scaled = ScaleTo(crop, ow, oh);
                                if (crop != null) crop.Dispose();
                                jb = JpegOf(scaled, jpg, ep);
                                scaled.Dispose();
                                rx = ox; ry = oy;
                            }
                            else
                            {
                                Bitmap crop = BitmapFromDib(cur, vw, bbox);
                                jb = JpegOf(crop, jpg, ep);
                                if (crop != null) crop.Dispose();
                                rx = bbox.X; ry = bbox.Y;
                            }
                            WriteFrame(so, jb, cx, cy, outW, outH, false, rx, ry);
                            statDeltas++;
                            CopyDibRegion(cur, prevBits, vw, bbox);
                        }
                    }
                    else
                    {
                        forceKey = true;
                    }
                }

                if (forceKey)
                {
                    Bitmap fullBmp = useDib ? BitmapFromDib(cur, vw, new Rectangle(0, 0, vw, vh)) : Grab(vx, vy, vw, vh);
                    if (fullBmp != null)
                    {
                        Bitmap keySrc = needScale ? ScaleTo(fullBmp, outW, outH) : fullBmp;
                        byte[] jb = JpegOf(keySrc, jpg, ep);
                        WriteFrame(so, jb, cx, cy, outW, outH, true, 0, 0);
                        if (needScale) { try { keySrc.Dispose(); } catch { } }
                        if (fullBmp != keySrc) { try { fullBmp.Dispose(); } catch { } }
                    }
                    lastKeyAt = now;
                    statKeys++;
                    if (useDib) CopyDibAll(cur, prevBits, vw, vh);
                }

                long el = sw.ElapsedMilliseconds;
                statMsSum += el; statMsN++;
                if (now - lastStatAt >= 5000 && (statKeys + statDeltas) > 0)
                {
                    ILog("stats keys=" + statKeys + " deltas=" + statDeltas + " skips=" + statSkips
                        + " avgMs=" + (statMsN > 0 ? (statMsSum / statMsN) : 0)
                        + " out=" + outW + "x" + outH + " fps=" + fps + " dib=" + (useDib ? 1 : 0));
                    lastStatAt = now;
                    statKeys = 0; statDeltas = 0; statSkips = 0;
                    statMsSum = 0; statMsN = 0;
                }
            }
            catch (Exception ex)
            {
                ILog("loop-err " + ex.Message);
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
        int fps = Arg(argv, "-Fps", 20);
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
