package com.airemote.agent;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * 3.16.17 — عميل المساعد الذكي على أندرويد بنفس عقد وكيل ويندوز (P4).
 *
 * البث: POST /api/ai/chat/stream → SSE بأحداث
 *   data: {"conversationId": "..."}
 *   data: {"delta": "...", "chunk": "..."}
 *   data: {"error": "..."}
 *   data: {"done": true, "stats": ...}
 *   data: [DONE]
 * الإيقاف محلي (قطع الاتصال) ولا يُرسل شيئًا للسيرفر — مقابل AbortController.
 * المحادثات: GET /api/ai/conversations?deviceId= · GET /api/ai/history ·
 *            DELETE /api/ai/conversations/:id — بترويسة X-Device-Token.
 * تنفيذ الكتل محليًا بنفس شكل النتيجة {ok, out, err, code, image?}:
 *   shell/bash/cmd/sh → sh -c (حدود 20k/4k ومهلة 120ث)
 *   screenshot → MediaProjection (captureToFile) ثم data:image/jpeg;base64
 *   control → AiRemoteA11y (التعليمات الاثنتا عشرة)
 *   powershell/record → رفض واضح كما في ويندوز (record) ولغة غير متاحة (powershell).
 */
public final class AiClient {

    /** اللغات التي يظهر لها زر تنفيذ — نفس EXEC_LANGS في وكيل ويندوز. */
    public static final String[] EXEC_LANGS = {
            "powershell", "ps1", "bash", "cmd", "shell", "sh", "control", "screenshot", "record"
    };

    /** تلميح منصة يُحقن في رسالة النظام عبر حقل context المدعوم من السيرفر. */
    private static final String CONTEXT_HINT =
            "هذا الجهاز أندرويد (لا PowerShell). استخدم كتل shell أو bash للأوامر، "
                    + "وشريحة screenshot للقطة الشاشة، وشريحة control للنقر/الكتابة/التمرير. "
                    + "إحداثيات النقر تكون ببكسل الشاشة كما في لقطة screenshot.";

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static volatile HttpURLConnection activeConn = null;
    private static volatile Thread activeThread = null;

    public interface Listener {
        void onConversation(String id);
        void onDelta(String delta);
        void onDone(boolean aborted);
        void onError(String error);
    }

    private AiClient() { }

    public static boolean isBusy() {
        Thread t = activeThread;
        return t != null && t.isAlive();
    }

    /** إيقاف محلي: قطع الاتصال + مقاطعة الخيط. لا طلب للسيرفر. */
    public static void stop() {
        Thread t = activeThread;
        HttpURLConnection c = activeConn;
        if (c != null) {
            try { c.disconnect(); } catch (Exception ignore) { }
        }
        if (t != null) {
            try { t.interrupt(); } catch (Exception ignore) { }
        }
    }

    /** بث رسالة للمساعد عبر SSE. الاستدعاءات تصلك على الخيط الرئيسي. */
    public static void send(final Context ctx, final String text, final Listener l) {
        if (isBusy()) {
            post(() -> l.onError("يوجد طلب قيد التنفيذ — انتظر انتهاءه أو أوقفه"));
            return;
        }
        activeThread = new Thread(() -> {
            HttpURLConnection c = null;
            boolean aborted = false;
            boolean errored = false;
            try {
                String base = apiBase(ctx);
                String tok = Prefs.token(ctx);
                if (base == null || base.isEmpty() || tok == null || tok.isEmpty()) {
                    post(() -> l.onError("الوكيل غير مهيأ — أدخل عنوان الخادم والرمز"));
                    return;
                }
                JSONObject body = new JSONObject();
                body.put("message", text);
                String conv = Prefs.aiConv(ctx);
                if (!conv.isEmpty()) body.put("conversationId", conv);
                String dev = AgentService.currentDeviceId();
                if (!dev.isEmpty()) body.put("deviceId", dev);
                body.put("context", CONTEXT_HINT);

                c = (HttpURLConnection) new URL(base + "/api/ai/chat/stream").openConnection();
                activeConn = c;
                c.setRequestMethod("POST");
                c.setRequestProperty("Content-Type", "application/json");
                c.setRequestProperty("X-Device-Token", tok);
                c.setConnectTimeout(15000);
                c.setReadTimeout(180000);
                c.setDoOutput(true);
                OutputStream os = c.getOutputStream();
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                os.close();
                int code = c.getResponseCode();
                if (code >= 400) {
                    String errBody = readAll(code >= 400 ? c.getErrorStream() : c.getInputStream());
                    errored = true;
                    final String msg = "HTTP " + code + " — " + clip(errBody, 300);
                    post(() -> l.onError(msg));
                    return;
                }
                BufferedReader r = new BufferedReader(
                        new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8));
                String line;
                while ((line = r.readLine()) != null) {
                    if (Thread.currentThread().isInterrupted()) { aborted = true; break; }
                    // نفس قواعد وكيل ويندوز: أسطر data: فقط، وتجاهل [DONE]
                    if (!line.startsWith("data: ")) continue;
                    String data = line.substring(6).trim();
                    if (data.equals("[DONE]")) continue;
                    JSONObject o;
                    try { o = new JSONObject(data); } catch (Exception ignore) { continue; }
                    if (o.has("conversationId")) {
                        String id = o.optString("conversationId", "");
                        if (!id.isEmpty()) Prefs.setAiConv(ctx, id);
                        final String cid = id;
                        post(() -> l.onConversation(cid));
                    }
                    if (o.has("error")) {
                        errored = true;
                        final String e = o.optString("error", "");
                        post(() -> l.onError(e));
                        return;
                    }
                    if (o.has("delta")) {
                        final String d = o.optString("delta", "");
                        if (!d.isEmpty()) post(() -> l.onDelta(d));
                    }
                    // {"done":true,...} يُتجاهل — النهاية من انتهاء الجسم كما في ويندوز
                }
            } catch (Exception e) {
                String msg = e.getMessage() == null ? e.toString() : e.getMessage();
                if (aborted || Thread.currentThread().isInterrupted()
                        || msg.contains("Socket closed") || msg.contains("Interrupted")
                        || msg.contains("Connection reset") || msg.contains("abort")) {
                    aborted = true;
                } else {
                    errored = true;
                    final String m = msg;
                    post(() -> l.onError(m));
                }
            } finally {
                try { if (c != null) c.disconnect(); } catch (Exception ignore) { }
                activeConn = null;
                activeThread = null;
                final boolean ab = aborted || !errored;
                final boolean wasErr = errored;
                if (!wasErr) post(() -> l.onDone(ab));
            }
        }, "ai-stream");
        activeThread.start();
    }

    // ── المحادثات ───────────────────────────────────────────────────────────

    /** GET /api/ai/conversations?deviceId= — السيرفر يعيد مصفوفة خام. */
    public static void listConversations(Context ctx, Consumer<JSONObject> cb) {
        execGet(ctx, conversationsUrl(ctx), json -> {
            JSONObject out = new JSONObject();
            try {
                if (json instanceof JSONArray) {
                    out.put("ok", true);
                    out.put("conversations", json);
                } else if (json instanceof JSONObject) {
                    out = (JSONObject) json;
                    if (!out.has("ok")) out.put("ok", true);
                    if (!out.has("conversations")) out.put("conversations", new JSONArray());
                } else {
                    out.put("ok", true).put("conversations", new JSONArray());
                }
            } catch (Exception ignore) { }
            cb.accept(out);
        });
    }

    /** GET /api/ai/history?conversationId=&deviceId= → {conversationId, messages} */
    public static void loadConversation(Context ctx, String id, Consumer<JSONObject> cb) {
        String base = apiBase(ctx);
        if (base == null) { cb.accept(err("bad-server")); return; }
        StringBuilder u = new StringBuilder(base + "/api/ai/history?conversationId="
                + enc(id));
        String dev = AgentService.currentDeviceId();
        if (!dev.isEmpty()) u.append("&deviceId=").append(enc(dev));
        execGet(ctx, u.toString(), json -> {
            try {
                if (json instanceof JSONObject) {
                    JSONObject o = (JSONObject) json;
                    String cid = o.optString("conversationId", id);
                    if (!cid.isEmpty()) Prefs.setAiConv(ctx, cid);
                    o.put("ok", true);
                    cb.accept(o);
                } else {
                    cb.accept(err("bad-history"));
                }
            } catch (Exception e) { cb.accept(err(e.getMessage())); }
        });
    }

    /** DELETE /api/ai/conversations/:id — السيرفر يعيد 204 بلا جسم. */
    public static void deleteConversation(Context ctx, String id, Consumer<JSONObject> cb) {
        new Thread(() -> {
            JSONObject res = new JSONObject();
            try {
                String base = apiBase(ctx);
                String tok = Prefs.token(ctx);
                if (base == null || tok == null || tok.isEmpty()) { cb.accept(err("unconfigured")); return; }
                HttpURLConnection c = (HttpURLConnection)
                        new URL(base + "/api/ai/conversations/" + enc(id)).openConnection();
                c.setRequestMethod("DELETE");
                c.setRequestProperty("X-Device-Token", tok);
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                int code = c.getResponseCode();
                readAll(code >= 400 ? c.getErrorStream() : c.getInputStream());
                res.put("ok", code >= 200 && code < 300);
                if (code >= 400) res.put("error", "HTTP " + code);
            } catch (Exception e) {
                try { res.put("ok", false).put("error", String.valueOf(e.getMessage())); } catch (Exception ignore) { }
            }
            final JSONObject out = res;
            MAIN.post(() -> cb.accept(out));
        }, "ai-del-conv").start();
    }

    // ── تنفيذ الكتل ─────────────────────────────────────────────────────────

    /** نفس شكل النتيجة في وكيل ويندوز: {ok, out, err, code, image?} */
    public static JSONObject runBlock(Context ctx, String lang, String content) {
        String L = lang == null ? "" : lang.trim().toLowerCase(Locale.ROOT);
        JSONObject res = new JSONObject();
        try {
            if (L.equals("powershell") || L.equals("ps1") || L.equals("powershell.exe") || L.equals("pwsh")) {
                res.put("ok", false).put("out", "").put("code", 1)
                   .put("err", "PowerShell غير متوفر على أندرويد — استخدم shell أو bash");
                return res;
            }
            if (L.equals("record")) {
                res.put("ok", false).put("out", "").put("code", 1)
                   .put("err", "تسجيل الفيديو متاح من لوحة التحكم حالياً");
                return res;
            }
            if (L.equals("screenshot")) return shot(ctx);
            if (L.equals("control")) return control(content);
            if (L.equals("bash") || L.equals("cmd") || L.equals("shell") || L.equals("sh") || L.isEmpty()) {
                return sh(content == null ? "" : content, 120000);
            }
            res.put("ok", false).put("out", "").put("code", 1)
               .put("err", "نوع كتلة غير معروف: " + L);
            return res;
        } catch (Exception e) {
            try {
                res.put("ok", false).put("out", "").put("code", -1)
                   .put("err", e.getMessage() == null ? e.toString() : e.getMessage());
            } catch (Exception ignore) { }
            return res;
        }
    }

    private static final java.util.regex.Pattern DANGER = java.util.regex.Pattern.compile(
            "\\brm\\s+-rf|\\bdel\\s+[^\\n]*\\/[fqs]|Remove-Item|\\brd\\s+\\/s|rmdir\\s+\\/s|\\bformat\\b\\s+[a-zA-Z]:|diskpart|Clear-Disk|Initialize-Disk|\\bshutdown\\b|Stop-Computer|Restart-Computer|taskkill[^\\n]*\\/f|\\breg\\s+delete|\\bsc\\s+delete|net\\s+user[^\\n]*\\/delete|cipher\\s+\\/w|bcdedit|pm\\s+clear|reboot|busybox\\s+ash",
            java.util.regex.Pattern.CASE_INSENSITIVE);

    /** حارس الأوامر الخطرة — نفس قائمة وكيل ويندوز. */
    public static boolean isDangerous(String code) {
        return DANGER.matcher(code == null ? "" : code).find();
    }

    public static boolean isExecLang(String lang) {
        String L = lang == null ? "" : lang.trim().toLowerCase(Locale.ROOT);
        for (String x : EXEC_LANGS) if (x.equals(L)) return true;
        return false;
    }

    /** محلّل أسوار الكود — نفس دلالات parseParts في وكيل ويندوز. */
    public static java.util.List<Object[]> parseParts(String text) {
        // كل عنصر: Object[]{type("text"|"code"), lang, content}
        java.util.List<Object[]> parts = new java.util.ArrayList<>();
        String[] lines = String.valueOf(text == null ? "" : text).split("\n", -1);
        String mode = "text";
        StringBuilder buf = new StringBuilder();
        String lang = "";
        for (String ln : lines) {
            String t = ln.trim();
            if (mode.equals("text") && t.startsWith("```")) {
                if (buf.length() > 0) parts.add(new Object[]{"text", "", buf.toString()});
                buf.setLength(0);
                lang = t.length() > 3 ? t.substring(3).trim().toLowerCase(Locale.ROOT) : "";
                mode = "code";
                continue;
            }
            if (mode.equals("code") && t.startsWith("```")) {
                parts.add(new Object[]{"code", lang, buf.toString()});
                buf.setLength(0);
                lang = "";
                mode = "text";
                continue;
            }
            buf.append(ln).append('\n');
        }
        if (buf.length() > 0) parts.add(new Object[]{mode, lang, buf.toString()});
        return parts;
    }

    // ── منفّذو الكتل ────────────────────────────────────────────────────────

    private static JSONObject sh(String script, long timeoutMs) throws Exception {
        JSONObject res = new JSONObject();
        if (script.trim().isEmpty()) {
            res.put("ok", false).put("out", "").put("err", "empty script").put("code", 1);
            return res;
        }
        Process p = new ProcessBuilder("sh", "-c", script).start();
        StringBuilder out = new StringBuilder();
        StringBuilder err = new StringBuilder();
        Thread t1 = new Thread(() -> consume(p.getInputStream(), out, 20000));
        Thread t2 = new Thread(() -> consume(p.getErrorStream(), err, 4000));
        t1.start();
        t2.start();
        boolean done = p.waitFor(timeoutMs, TimeUnit.MILLISECONDS);
        if (!done) {
            try { p.destroyForcibly(); } catch (Exception ignore) { }
            t1.join(800);
            t2.join(800);
            res.put("ok", false).put("out", clip(out.toString(), 20000))
               .put("err", clip("timeout after " + (timeoutMs / 1000) + "s\n" + err, 4000))
               .put("code", -1);
            return res;
        }
        t1.join(1000);
        t2.join(1000);
        int code = p.exitValue();
        res.put("ok", code == 0)
           .put("out", clip(out.toString(), 20000))
           .put("err", clip(err.toString(), 4000))
           .put("code", code);
        return res;
    }

    private static JSONObject shot(Context ctx) throws Exception {
        JSONObject res = new JSONObject();
        File f = new File(ctx.getCacheDir(), "ai-shot-" + System.currentTimeMillis() + ".jpg");
        String err = AgentService.captureToFilePublic(f.getAbsolutePath());
        if (err != null) {
            res.put("ok", false).put("out", "").put("err", err).put("code", 1);
            return res;
        }
        byte[] b = readFile(f);
        try { f.delete(); } catch (Exception ignore) { }
        if (b == null || b.length == 0) {
            res.put("ok", false).put("out", "").put("err", "capture failed: empty file").put("code", 1);
            return res;
        }
        res.put("ok", true).put("out", "screenshot-ok").put("err", "").put("code", 0)
           .put("image", "data:image/jpeg;base64," + Base64.encodeToString(b, Base64.NO_WRAP));
        return res;
    }

    /**
     * كتل control — نفس أسماء أوامر ويندوز الاثنتا عشرة:
     * clickname, rclick, dclick, drag, click, move, scroll, focus, type, key, wait, info
     */
    private static JSONObject control(String content) throws Exception {
        JSONObject res = new JSONObject();
        StringBuilder logb = new StringBuilder();
        boolean okAll = true;
        String[] lines = String.valueOf(content == null ? "" : content).split("\n");
        for (String raw : lines) {
            String line = raw.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            String[] parts = line.split("\\s+", 2);
            String cmd = parts[0].toLowerCase(Locale.ROOT);
            String rest = parts.length > 1 ? parts[1] : "";
            JSONObject a = new JSONObject();
            String note;
            switch (cmd) {
                case "wait": {
                    int s = 2;
                    try { s = Integer.parseInt(rest.trim()); } catch (Exception ignore) { }
                    a.put("action", "wait").put("seconds", Math.min(Math.max(s, 1), 20));
                    note = AiRemoteA11y.runSync(a);
                    break;
                }
                case "info":
                    a.put("action", "info");
                    note = AiRemoteA11y.runSync(a);
                    break;
                case "type":
                    a.put("action", "type").put("text", rest);
                    note = AiRemoteA11y.runSync(a);
                    break;
                case "key":
                    a.put("action", "key").put("key", rest);
                    note = AiRemoteA11y.runSync(a);
                    break;
                case "click":
                case "rclick":
                case "dclick":
                case "move": {
                    int[] xy = ints(rest, 2);
                    if (xy == null) { note = "bad args: " + line; okAll = false; break; }
                    a.put("action", cmd).put("x", xy[0]).put("y", xy[1]);
                    note = AiRemoteA11y.runSync(a);
                    break;
                }
                case "drag": {
                    int[] xy = ints(rest, 4);
                    if (xy == null) { note = "bad args: " + line; okAll = false; break; }
                    a.put("action", "drag").put("x", xy[0]).put("y", xy[1]).put("x2", xy[2]).put("y2", xy[3]);
                    note = AiRemoteA11y.runSync(a);
                    break;
                }
                case "scroll": {
                    int n = -3;
                    try { n = Integer.parseInt(rest.trim()); } catch (Exception ignore) { }
                    a.put("action", "scroll").put("amount", n);
                    note = AiRemoteA11y.runSync(a);
                    break;
                }
                case "clickname":
                case "focus":
                    // focus على أندرويد = بحث بالاسم ونقر (أقرب مكافئ لـAppActivate)
                    a.put("action", "clickname").put("text", rest);
                    note = AiRemoteA11y.runSync(a);
                    break;
                default:
                    note = "unknown: " + cmd;
                    okAll = false;
            }
            if (note == null) note = "?";
            if (note.startsWith("a11y-not-enabled") || note.startsWith("unknown")
                    || note.startsWith("name-not-found") || note.startsWith("timeout")
                    || note.startsWith("error") || note.startsWith("bad args")
                    || note.startsWith("key not supported") || note.startsWith("type:")
                    || note.startsWith("append")) {
                okAll = false;
            }
            logb.append(line).append(" -> ").append(note).append('\n');
        }
        res.put("ok", okAll)
           .put("out", clip(logb.toString(), 20000))
           .put("err", "")
           .put("code", okAll ? 0 : 1);
        return res;
    }

    // ── أدوات ───────────────────────────────────────────────────────────────

    private static String apiBase(Context c) {
        try {
            String s = Prefs.server(c).trim();
            if (s.startsWith("wss://")) s = "https://" + s.substring(6);
            else if (s.startsWith("ws://")) s = "http://" + s.substring(5);
            int i = s.indexOf("/ws");
            if (i > 0) s = s.substring(0, i);
            while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
            return s;
        } catch (Exception e) { return null; }
    }

    private static String conversationsUrl(Context ctx) {
        String base = apiBase(ctx);
        String dev = AgentService.currentDeviceId();
        return base + "/api/ai/conversations" + (dev == null || dev.isEmpty()
                ? "" : "?deviceId=" + enc(dev));
    }

    private static void execGet(Context ctx, String url, Consumer<Object> cb) {
        new Thread(() -> {
            Object out;
            try {
                String base = apiBase(ctx);
                String tok = Prefs.token(ctx);
                if (base == null || tok == null || tok.isEmpty()) { cb.accept(err("unconfigured")); return; }
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setRequestProperty("X-Device-Token", tok);
                c.setConnectTimeout(8000);
                c.setReadTimeout(10000);
                int code = c.getResponseCode();
                String body = readAll(code >= 400 ? c.getErrorStream() : c.getInputStream());
                if (code >= 400) { cb.accept(err("HTTP " + code + " " + clip(body, 120))); return; }
                String t = body.trim();
                if (t.startsWith("[")) out = new JSONArray(t);
                else if (t.startsWith("{")) out = new JSONObject(t);
                else out = err("empty");
            } catch (Exception e) {
                out = err(e.getMessage() == null ? e.toString() : e.getMessage());
            }
            final Object o = out;
            MAIN.post(() -> cb.accept(o));
        }, "ai-get").start();
    }

    private static JSONObject err(String msg) {
        JSONObject o = new JSONObject();
        try { o.put("ok", false).put("error", msg == null ? "?" : msg); } catch (Exception ignore) { }
        return o;
    }

    private static String readAll(InputStream is) {
        if (is == null) return "";
        try {
            BufferedReader r = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            return sb.toString();
        } catch (Exception e) { return ""; }
    }

    private static void consume(InputStream is, StringBuilder into, int limit) {
        try {
            BufferedReader r = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            char[] buf = new char[2048];
            int n;
            while ((n = r.read(buf)) > 0) {
                if (into.length() < limit) into.append(buf, 0, n);
            }
            r.close();
        } catch (Exception ignore) { }
    }

    private static byte[] readFile(File f) {
        try {
            FileOutputStream tmp = null;
            java.io.FileInputStream in = new java.io.FileInputStream(f);
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) bos.write(b, 0, n);
            in.close();
            return bos.toByteArray();
        } catch (Exception e) { return null; }
    }

    private static int[] ints(String s, int n) {
        try {
            String[] p = s.trim().split("\\s+");
            int[] out = new int[n];
            for (int i = 0; i < n; i++) out[i] = Integer.parseInt(p[i]);
            return out;
        } catch (Exception e) { return null; }
    }

    private static String clip(String s, int n) {
        if (s == null) return "";
        return s.length() <= n ? s : s.substring(0, n);
    }

    private static String enc(String s) {
        try { return URLEncoder.encode(s == null ? "" : s, "UTF-8"); }
        catch (Exception e) { return ""; }
    }

    private static void post(Runnable r) { MAIN.post(r); }
}
