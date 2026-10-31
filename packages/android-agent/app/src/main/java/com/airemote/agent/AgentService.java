package com.airemote.agent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.ActivityManager;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.media.AudioRecord;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Base64;
import android.util.DisplayMetrics;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.io.InputStreamReader;
import java.io.RandomAccessFile;
import java.net.NetworkInterface;
import java.net.URI;
import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.Locale;

/** Foreground service: WebSocket agent for AiRemote (Android). */
public class AgentService extends Service {

    public static final String ACTION_START = "com.airemote.agent.START";
    public static final String ACTION_STOP = "com.airemote.agent.STOP";

    private volatile WebSocketClient ws = null;
    private volatile String deviceId = "";
    private volatile boolean running = false;
    private long reconnectDelay = 3000;
    // v3.8.12 — مهمة إعادة اتصال واحدة (لا تراكم) حتى لا تتوالد حلقتا اتصال.
    private final Runnable reconnectTask = () -> { if (running) connect(); };
    private Handler hbHandler;
    private HandlerThread hbThread;

    private long lastCpuTotal = -1, lastCpuIdle = -1;
    private volatile int cachedCpuPercent = -1;
    private volatile int cpuFromTop = -1;
    private volatile long cpuFromTopAt = 0;
    private volatile boolean cpuSampling = false;
    private long lastAppCpuTicks = -1, lastAppCpuAt = 0;
    private volatile long cachedCpuAt = 0;

    // v1.1 — screen streaming state
    private volatile boolean streamRunning = false;
    private Thread streamThread = null;
    private volatile String streamSessionId = "";
    // v3.8.36 (R8) — one-way clipboard sync (text). Android 10+ only lets a focused
    // app read the clipboard, so the watch ack reports honestly whether background
    // reads are allowed (AppOps) instead of pretending to work.
    private Handler clipHandler = null;
    private volatile boolean clipSyncEnabled = false;
    private volatile String clipSyncDirection = "to-device";
    private volatile String clipSyncSession = "";
    private volatile String clipSyncLastHash = "";
    private Runnable clipPoll = null;
    private volatile int streamQuality = 60;
    private volatile int streamMaxWidth = 1280;
    // v3.8.2 - binary frames (no base64/JSON) negotiated by the server.
    private volatile boolean streamBinary = false;
    private Bitmap bmpFull = null;
    private android.graphics.Canvas scaleCanvas = null;
    private ByteArrayOutputStream frameBos = null;
    private long perfFrames = 0, perfBytes = 0, perfEncodeMs = 0, perfLastLog = 0;
    // v3.8.3 - delta frames: only the changed rectangle is encoded and sent.
    private static final int DELTA_MAX_RUN = 20;
    private static final long KEYFRAME_INTERVAL_MS = 2000;
    private boolean streamDelta = true;
    private int[] curPixels = null, prevPixels = null;
    private int prevFw = 0, prevFh = 0, deltaRun = 0;
    private long lastFrameMs = 0, perfSkipped = 0;
    // v3.8.4 - low-end phones encode WebP slower than they can stream it; fall back to JPEG.
    private int slowEncodeStreak = 0;
    private boolean forceJpeg = false;
    private volatile MediaProjection activeProjection = null;
    private volatile VirtualDisplay activeVd = null;
    private volatile ImageReader activeReader = null;
    private volatile int activeW = 0, activeH = 0, activeDpi = 0;
    private PowerManager.WakeLock screenWakeLock = null;
    // Keep the CPU and Wi-Fi radio alive while the foreground agent is running.
    // Without these, aggressive OEM power saving (seen on TECNO) freezes the
    // process or drops Wi-Fi when the screen turns off, so a remote wake/start
    // command can never arrive. These are released when the user stops the agent.
    private PowerManager.WakeLock agentCpuWakeLock = null;
    private PowerManager.WakeLock agentScreenLock = null;
    private android.net.wifi.WifiManager.WifiLock agentWifiLock = null;
    // Screen-off streaming mode: release the panel wake lock while keeping
    // CPU/network alive so MediaProjection can continue.
    private volatile boolean screenOffMode = false;
    private volatile boolean registered = false;
    private volatile long agentStartedAt = 0;
    private volatile String deviceDisplay = "";
    private boolean displaySettingsSaved = false;
    private int preStreamBrightnessMode = 1;
    private int preStreamBrightness = 255;
    private int preStreamAccel = 1;
    private int preStreamUserRotation = 0;
    private boolean brightnessSaved = false;
    private int savedBrightness = 255;
    private int savedBrightnessMode = 1;
    private android.view.View screenOffOverlay = null;
    private android.view.WindowManager screenOffWm = null;
    private volatile boolean audioRunning = false;
    private AudioRecord audioRecord = null;
    private Thread audioThread = null;
    private int audioSeq = 0;
    private volatile int streamFps = 8;
    private volatile int capW = 0, capH = 0;
    // v3.8.28 - the system band MediaProjection mirrors is not always at the top: a
    // 90-degree rotation moves it to the left edge (measured 72px on TKL4 at 1600x720),
    // which the top-only crop of v3.8.22 left visible as a black column. Crops are now
    // measured on all four edges, applied only where the band really is black, and touch
    // input adds the same offsets back per axis.
    private volatile int cropL = 0, cropT = 0, cropR = 0, cropB = 0;
    private volatile boolean insetChecked = false;
    private volatile int lastDownX = -1, lastDownY = -1;
    private final java.util.List<Long> ctrlAuthAttempts = new java.util.ArrayList<>();

    /** v1.3.0 — running instance for the UI */
    public static volatile AgentService INSTANCE = null;

    @Override
    public void onCreate() {
        super.onCreate();
        INSTANCE = this;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Prefs.bootstrap(this);
        ensureChannel();
        startForeground(11, buildNotification("AiRemote Agent — يعمل"));

        boolean manual = intent != null && intent.getBooleanExtra("manual", false);
        if (manual) Prefs.sp(this).edit().putBoolean("kicked", false).apply();
        if (Prefs.sp(this).getBoolean("kicked", false) && !manual) {
            MainActivity.setStatus("متوقف by server", false);
            MainActivity.log("Server متوقف the connection - manual start required");
            return START_STICKY;
        }
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            stopAgent();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!running) startAgent();
        else if (!isConnected()) reconnectNow();
        return START_STICKY;
    }


    private void ensureProjectionForeground() {
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                startForeground(11, buildNotification("AiRemote Agent - screen capture"), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
            } catch (Exception ignore) { }
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            NotificationChannel ch = new NotificationChannel("agent", getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(ch);
            NotificationChannel chat = new NotificationChannel("chat_v2", "رسائل الدردشة", NotificationManager.IMPORTANCE_HIGH);
            chat.setDescription("رسائل المشاهدين الواردة إلى الوكيل");
            chat.setSound(null, null);
            chat.enableVibration(false);
            chat.setShowBadge(true);
            chat.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            nm.createNotificationChannel(chat);
        }
    }

    private long lastChatNotifyAt = 0;
    private String lastChatNotifyText = "";
    private int chatNotifyId = 2100;

    private void notifyChat(final String sender, final String text) {
        try {
            if (text == null || text.trim().isEmpty()) return;
            if (Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
            long now = System.currentTimeMillis();
            if (text.equals(lastChatNotifyText) && now - lastChatNotifyAt < 1800) return;
            lastChatNotifyText = text;
            lastChatNotifyAt = now;

            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            android.content.Intent open = new android.content.Intent(this, MainActivity.class);
            open.putExtra("openChat", true);
            open.setFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                    | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int piFlags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) piFlags |= android.app.PendingIntent.FLAG_IMMUTABLE;
            android.app.PendingIntent pi = android.app.PendingIntent.getActivity(this, 7, open, piFlags);

            Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new Notification.Builder(this, "chat_v2")
                    : new Notification.Builder(this);
            b.setContentTitle("رسالة من " + (sender == null ? "مشاهد" : sender))
                    .setContentText(text)
                    .setSmallIcon(android.R.drawable.stat_notify_chat)
                    .setAutoCancel(true)
                    .setContentIntent(pi)
                    .setCategory(Notification.CATEGORY_MESSAGE)
                    .setVisibility(Notification.VISIBILITY_PRIVATE)
                    .setOnlyAlertOnce(true);
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_DEFAULT);
            nm.notify(chatNotifyId++, b.build());
        } catch (Exception ignore) { }
    }

    private Notification buildNotification(String text) {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) b = new Notification.Builder(this, "agent");
        else b = new Notification.Builder(this);
        return b.setContentTitle("AiRemote Android")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setOngoing(true)
                .build();
    }

    private void startAgent() {
        running = true;
        agentStartedAt = android.os.SystemClock.elapsedRealtime();
        reconnectDelay = 3000;
        acquireAgentLocks();
        MainActivity.log("جارٍ الاتصال بالخادم...");
        // v3.8.12 — المؤقّت قبل أول connect(): onClose مبكر كان يصطدم بـhbHandler=null
        // فيبقى الوكيل يعمل بلا أي محاولة اتصال لاحقة (سبب «الوكيل يعمل وغير متصل»).
        if (hbThread == null) {
            hbThread = new HandlerThread("airemote-hb");
            hbThread.start();
        }
        if (hbHandler == null) hbHandler = new Handler(hbThread.getLooper());
        hbHandler.postDelayed(hbLoop, 2500);
        connect();
    }

    // ── v3.8.36 (R8) — clipboard sync helpers ─────────────────────────────
    private static String sha256Hex(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(value.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception ignore) { return ""; }
    }

    /** null = the platform refused the read (background restriction). */
    private String readClipboardText() {
        try {
            android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip() || cm.getPrimaryClip() == null) return "";
            if (cm.getPrimaryClip().getItemCount() <= 0) return "";
            CharSequence cs = cm.getPrimaryClip().getItemAt(0).coerceToText(AgentService.this);
            return cs == null ? "" : cs.toString();
        } catch (Throwable ignore) {
            return null;
        }
    }

    /**
     * Android 10+ serves clipboard reads only to the app that currently has focus
     * (or the default IME); AppOps READ_CLIPBOARD does not lift that restriction.
     * So the only honest signal is "our own UI is in front right now" — which is
     * why Android is push-only unless the agent window is open.
     */
    private boolean clipboardReadAllowed() {
        try { return MainActivity.visibleNow(); } catch (Throwable ignore) { return false; }
    }

    private void stopClipPoll() {
        try { if (clipHandler != null && clipPoll != null) clipHandler.removeCallbacks(clipPoll); } catch (Exception ignore) { }
        clipPoll = null;
    }

    private void startClipPoll() {
        if (clipHandler == null) clipHandler = new Handler(android.os.Looper.getMainLooper());
        if (clipPoll != null) return;
        clipPoll = new Runnable() {
            @Override public void run() {
                try {
                    if (clipSyncEnabled && "to-viewer".equals(clipSyncDirection)) {
                        String txt = readClipboardText();
                        if (txt != null && txt.length() > 0) {
                            String h = sha256Hex(txt);
                            if (!h.equals(clipSyncLastHash)) {
                                clipSyncLastHash = h;
                                JSONObject o = new JSONObject();
                                o.put("sessionId", clipSyncSession);
                                o.put("text", txt);
                                o.put("hash", h);
                                o.put("at", System.currentTimeMillis());
                                sendMsg("agent:screen_clipboard_change", o);
                            }
                        }
                    }
                } catch (Throwable ignore) { }
                if (clipSyncEnabled && clipHandler != null) clipHandler.postDelayed(this, 600);
            }
        };
        clipHandler.postDelayed(clipPoll, 600);
    }

    private void configureClipSync(String sessionId, boolean enabled, String direction) {
        boolean wasViewer = "to-viewer".equals(clipSyncDirection);
        clipSyncSession = sessionId == null ? "" : sessionId;
        clipSyncDirection = "to-viewer".equals(direction) ? "to-viewer" : "to-device";
        // Entering pull: forget the last applied hash so the viewer receives the
        // current clipboard once (same initial snapshot the desktop agent sends).
        if (enabled && "to-viewer".equals(clipSyncDirection) && !wasViewer) clipSyncLastHash = "";
        clipSyncEnabled = enabled;
        boolean watching = false;
        String reason = "";
        if (!enabled) {
            stopClipPoll();
            reason = "disabled";
        } else if ("to-viewer".equals(clipSyncDirection)) {
            watching = clipboardReadAllowed();
            if (watching) startClipPoll(); else { stopClipPoll(); reason = "background-denied"; }
        } else {
            // Pushing needs no read access on this device.
            stopClipPoll();
            watching = true;
        }
        try {
            JSONObject ack = new JSONObject();
            ack.put("sessionId", clipSyncSession);
            ack.put("watching", watching);
            ack.put("direction", clipSyncDirection);
            ack.put("reason", reason);
            sendMsg("agent:screen_clipboard_watch_ack", ack);
        } catch (Exception ignore) { }
        if (!enabled) MainActivity.log("📋 أُوقفت مزامنة الحافظة");
        else if (!watching) MainActivity.log("📋 مزامنة الحافظة: قراءة الخلفية غير مسموحة");
        else MainActivity.log("📋 مزامنة الحافظة: " + clipSyncDirection);
    }

    private void stopAgent() {
        running = false;
        stopClipPoll();
        clipSyncEnabled = false;
        registered = false;
        try { if (ws != null) ws.close(); } catch (Exception ignore) { }
        ws = null;
        if (hbHandler != null) hbHandler.removeCallbacksAndMessages(null);
        if (hbThread != null) hbThread.quitSafely();
        releaseAgentLocks();
        MainActivity.setStatus("متوقف", false);
        MainActivity.log("أُوقف الوكيل");
    }

    private final Runnable hbLoop = new Runnable() {
        @Override
        public void run() {
            if (running) {
                acquireAgentLocks();
                if (registered) MainActivity.updateConn(Prefs.server(AgentService.this), deviceDisplay, formatUptime());
            }
            try {
                if (ws != null && ws.isOpen()) {
                    JSONObject stats = buildStats();
                    MainActivity.updateStats(stats);
                    JSONObject payload = new JSONObject();
                    payload.put("deviceId", deviceId);
                    payload.put("stats", stats);
                    payload.put("tunnelLayer", "relay");
                    payload.put("capabilities", buildCapabilities());
                    sendMsg("agent:heartbeat", payload);
                }
            } catch (Exception ignore) { }
            if (hbHandler != null && running) hbHandler.postDelayed(this, 5000);
        }
    };

    private JSONObject buildCapabilities() throws Exception {
        JSONObject cap = new JSONObject();
        cap.put("pty", false);
        cap.put("shell", "sh");
        cap.put("fs", true);
        cap.put("screenControl", true);
        cap.put("clipboard", true);
        cap.put("chat", true);
        cap.put("ai", true);
        cap.put("multiMonitor", false);
        cap.put("docker", false);
        cap.put("android", true);
        cap.put("accessibility", AiRemoteA11y.I != null);
        cap.put("capture", CaptureHolder.ready());
        cap.put("streaming", true);
        cap.put("controlAuth", Prefs.hasControlPassword(this) ? "password" : ("con" + "sent"));
        return cap;
    }
    private void scheduleReconnect(long delay) {
        if (hbHandler == null) return;
        hbHandler.removeCallbacks(reconnectTask);
        hbHandler.postDelayed(reconnectTask, delay);
    }
    private void connect() {
        registered = false;
        if (!running) return;
        // v3.8.12 — اتصال واحد فقط: لا مقبس ثانٍ فوق مفتوح، ولا ترك مقبس قديم حيّ.
        // العَرَض الذي أُصلح: تسجيلان متزامنان ثم استبدال كل 10 ثوانٍ (code=4000/1006).
        WebSocketClient prev = ws;
        if (prev != null) {
            boolean open = false;
            try { open = prev.isOpen(); } catch (Exception ignore) { }
            if (open) return;
            try { prev.close(); } catch (Exception ignore) { }
            ws = null;
        }
        final String url = Prefs.server(this);
        final String token = Prefs.token(this);
        try {
            final URI uri = new URI(url);
            final WebSocketClient client = new WebSocketClient(uri) {
                @Override
                public void onOpen(ServerHandshake handshake) {
                    android.util.Log.d("AiRemoteAgent", "WebSocket onOpen");
                    reconnectDelay = 3000;
                    MainActivity.setStatus("متصل — جارٍ التسجيل", true);
                    MainActivity.updateConn(Prefs.server(AgentService.this), "جارٍ التسجيل…", "—");
                    registered = true;
                    MainActivity.log("✅ اتصل بالخادم");
                    try {
                        JSONObject payload = new JSONObject();
                        payload.put("token", token);
                        JSONObject info = new JSONObject();
                        info.put("hostname", Build.MODEL);
                        info.put("platform", "Android");
                        info.put("osVersion", "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
                        info.put("arch", Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "?");
                        info.put("ipLocal", localIp());
                        info.put("ipPublic", "");
                        info.put("agentVersion", com.airemote.agent.BuildConfig.VERSION_NAME + "-android");
                        payload.put("info", info);
                        payload.put("stats", buildStats());
                        payload.put("tunnelLayer", "relay");
                        payload.put("capabilities", buildCapabilities());
                        JSONObject reg = new JSONObject();
                        reg.put("type", "agent:register");
                        reg.put("payload", payload);
                        reg.put("timestamp", System.currentTimeMillis());
                        send(reg.toString());
                    } catch (Exception e) {
                        MainActivity.log("فشل إرسال التسجيل: " + e.getMessage());
                    }
                }

                @Override
                public void onMessage(String message) {
                    try {
                        handleMessage(new JSONObject(message));
                    } catch (Exception e) {
                        MainActivity.log("رسالة غير مفهومة");
                    }
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    android.util.Log.d("AiRemoteAgent", "WebSocket onClose code=" + code + " reason=" + reason);
                    // v3.8.12 — مقبس مُستبدل: لا تلمس الحالة ولا تُفرغ المرجِع الحيّ.
                    if (ws != this) return;
                    MainActivity.setStatus("انقطع — إعادة المحاولة", false);
                    MainActivity.log("انقطع الاتصال (" + code + ")");
                    ws = null;
                    if (code == 4001) {
                        Prefs.sp(AgentService.this).edit().putBoolean("kicked", true).apply();
                        MainActivity.setStatus("أوقفه الخادم — بانتظار السماح", false);
                        MainActivity.log("أوقف الخادم الاتصال — إعادة محاولة كل 5 ثوانٍ حتى يسمح");
                        running = true;
                        startKickPoller();
                        scheduleReconnect(5000);
                        return;
                    }
                    if (running) {
                        final long delay = reconnectDelay;
                        reconnectDelay = Math.min(reconnectDelay + 3000, 30000);
                        scheduleReconnect(delay);
                    }
                }

                @Override
                public void onError(Exception ex) {
                    android.util.Log.e("AiRemoteAgent", "WebSocket onError", ex);
                    MainActivity.log("خطأ اتصال: " + (ex != null ? ex.getMessage() : "?"));
                }
            };
            android.util.Log.d("AiRemoteAgent", "connect() url=" + url + " tokenLen=" + token.length());
            ws = client;
            // Keep small audio/video frames from waiting behind Nagle coalescing.
            try { client.setTcpNoDelay(true); } catch (Exception ignore) { }
            client.connect();
        } catch (Exception e) {
            MainActivity.log("عنوان غير صالح: " + e.getMessage());
            if (running) scheduleReconnect(reconnectDelay);
        }
    }



    private android.os.Handler kickHandler = null;

    private void startKickPoller() {
        try {
            if (kickHandler == null) kickHandler = new android.os.Handler(android.os.Looper.getMainLooper());
            kickHandler.removeCallbacksAndMessages(null);
            final Runnable[] poll = new Runnable[1];
            poll[0] = new Runnable() {
                @Override
                public void run() {
                    if (!Prefs.sp(AgentService.this).getBoolean("kicked", false)) return;
                    new Thread(new Runnable() {
                        @Override
                        public void run() {
                            boolean allowed = false;
                            try {
                                String srv = Prefs.server(AgentService.this);
                                String http = srv.replaceFirst("^ws://", "http://").replaceFirst("^wss://", "https://");
                                int q = http.indexOf("/ws");
                                if (q > 0) http = http.substring(0, q);
                                String tok = Prefs.token(AgentService.this);
                                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(
                                        http + "/api/agent/allowed?token=" + java.net.URLEncoder.encode(tok, "UTF-8")).openConnection();
                                c.setConnectTimeout(6000);
                                c.setReadTimeout(6000);
                                int code = c.getResponseCode();
                                if (code == 200) {
                                    java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(c.getInputStream()));
                                    StringBuilder sb = new StringBuilder();
                                    String line;
                                    while ((line = br.readLine()) != null) sb.append(line);
                                    br.close();
                                    allowed = sb.toString().contains("\"allowed\":true");
                                }
                            } catch (Exception ignore2) { }
                            final boolean ok = allowed;
                            kickHandler.post(new Runnable() {
                                @Override
                                public void run() {
                                    if (ok) {
                                        if (kickHandler != null) kickHandler.removeCallbacksAndMessages(null);
                                        Prefs.sp(AgentService.this).edit().putBoolean("kicked", false).apply();
                                        MainActivity.setStatus("مسموح — إعادة الاتصال", false);
                                        MainActivity.log("سمح الخادم بالاتصال — إعادة المحاولة");
                                        running = true;
                                        connect();
                                    } else {
                                        kickHandler.postDelayed(poll[0], 5000);
                                    }
                                }
                            });
                        }
                    }).start();
                }
            };
            kickHandler.postDelayed(poll[0], 3000);
        } catch (Exception ignore) { }
    }

    private android.view.View chatOverlay = null;
    private android.os.Handler chatHide = null;

    private void showChatOverlay(final String sender, final String text) {
        try {
            if (Build.VERSION.SDK_INT >= 23 && !android.provider.Settings.canDrawOverlays(this)) {
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() ->
                    android.widget.Toast.makeText(getApplicationContext(), sender + ": " + text, android.widget.Toast.LENGTH_LONG).show());
                return;
            }
            final android.view.WindowManager wm = (android.view.WindowManager) getSystemService(WINDOW_SERVICE);
            new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                try {
                    if (chatOverlay == null) {
                        android.widget.LinearLayout ll = new android.widget.LinearLayout(AgentService.this);
                        ll.setOrientation(android.widget.LinearLayout.VERTICAL);
                        ll.setBackgroundColor(0xE6202124);
                        int pad = (int) (14 * getResources().getDisplayMetrics().density);
                        ll.setPadding(pad, pad, pad, pad);
                        android.widget.TextView tv = new android.widget.TextView(AgentService.this);
                        tv.setTextColor(0xFFFFFFFF);
                        tv.setTextSize(15);
                        tv.setId(android.R.id.text1);
                        ll.addView(tv);
                        android.view.WindowManager.LayoutParams lp = new android.view.WindowManager.LayoutParams(
                                android.view.WindowManager.LayoutParams.WRAP_CONTENT,
                                android.view.WindowManager.LayoutParams.WRAP_CONTENT,
                                Build.VERSION.SDK_INT >= 26 ? android.view.WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : android.view.WindowManager.LayoutParams.TYPE_PHONE,
                                android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                                android.graphics.PixelFormat.TRANSLUCENT);
                        lp.gravity = android.view.Gravity.TOP | android.view.Gravity.CENTER_HORIZONTAL;
                        lp.y = (int) (42 * getResources().getDisplayMetrics().density);
                        wm.addView(ll, lp);
                        chatOverlay = ll;
                    }
                    android.widget.TextView tv = chatOverlay.findViewById(android.R.id.text1);
                    tv.setText(sender + ": " + text);
                    chatOverlay.setVisibility(android.view.View.VISIBLE);
                    if (chatHide != null) chatHide.removeCallbacksAndMessages(null);
                    chatHide = new android.os.Handler(android.os.Looper.getMainLooper());
                    chatHide.postDelayed(() -> { if (chatOverlay != null) chatOverlay.setVisibility(android.view.View.GONE); }, 9000);
                } catch (Exception ignore) { }
            });
        } catch (Exception ignore) { }
    }

    // ── 3.9.0 — جلسات وكيل↔وكيل: عرض/موافقة/نافذة عرض ─────────────────────
    public static void sendSessionDecision(String sessionId, boolean accept) {
        AgentService s = INSTANCE;
        if (s == null || sessionId == null || sessionId.isEmpty()) return;
        try {
            JSONObject p = new JSONObject();
            p.put("sessionId", sessionId);
            if (!accept) p.put("reason", "denied");
            s.sendMsg(accept ? "session:accept" : "session:deny", p);
        } catch (Exception ignore) {}
    }

    private void handleSessionOffer(JSONObject offer) {
        if (offer == null) return;
        if (offer.optString("sessionId", "").isEmpty()) return;
        if (MainActivity.foreground && MainActivity.instance != null) {
            MainActivity.instance.showSessionOffer(offer);
        } else {
            notifySessionOffer(offer);
        }
    }

    private void notifySessionOffer(JSONObject offer) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel("sessions_v1", "طلبات الجلسات", NotificationManager.IMPORTANCE_HIGH);
                nm.createNotificationChannel(ch);
            }
            String sid = offer.optString("sessionId");
            JSONObject req = offer.optJSONObject("requester");
            String who = req != null ? req.optString("name", "جهاز") : "جهاز";
            String access = offer.optString("accessLabel", offer.optString("access"));
            int piFlags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) piFlags |= android.app.PendingIntent.FLAG_IMMUTABLE;
            Intent open = new Intent(this, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            android.app.PendingIntent pi = android.app.PendingIntent.getActivity(this, sid.hashCode(), open, piFlags);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new Notification.Builder(this, "sessions_v1")
                    : new Notification.Builder(this);
            b.setContentTitle("طلب اتصال بجهازك")
                    .setContentText(who + " يطلب " + access)
                    .setSmallIcon(android.R.drawable.stat_sys_warning)
                    .setContentIntent(pi)
                    .setAutoCancel(true);
            Intent acc = new Intent(this, SessionActionReceiver.class).setAction(SessionActionReceiver.ACTION_ACCEPT).putExtra("sessionId", sid);
            Intent den = new Intent(this, SessionActionReceiver.class).setAction(SessionActionReceiver.ACTION_DENY).putExtra("sessionId", sid);
            Notification.Action a1 = new Notification.Action.Builder(android.R.drawable.checkbox_on_background, "سماح",
                    android.app.PendingIntent.getBroadcast(this, sid.hashCode() + 1, acc, piFlags)).build();
            Notification.Action a2 = new Notification.Action.Builder(android.R.drawable.checkbox_off_background, "رفض",
                    android.app.PendingIntent.getBroadcast(this, sid.hashCode() + 2, den, piFlags)).build();
            b.addAction(a1).addAction(a2);
            nm.notify(sid.hashCode(), b.build());
        } catch (Exception ignore) {}
    }

    private void openSessionView(JSONObject payload) {
        try {
            String url = payload.optString("viewUrl", "");
            if (url.isEmpty()) return;
            Intent i = new Intent(this, SessionWebViewActivity.class);
            i.putExtra("url", url);
            i.putExtra("sessionId", payload.optString("sessionId", ""));
            // 3.9.2 — أعِد استخدام النافذة القائمة بدل تكديس نوافذ جديدة.
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(i);
        } catch (Exception ignore) {}
    }

    private void sendMsg(String type, JSONObject payload) {
        try {
            JSONObject m = new JSONObject();
            m.put("type", type);
            m.put("payload", payload);
            m.put("timestamp", System.currentTimeMillis());
            send(m.toString());
        } catch (Exception ignore) { }
    }

    private void send(String s) {
        WebSocketClient c = ws;
        if (c != null && c.isOpen()) {
            try { c.send(s); } catch (Exception ignore) { }
        }
    }

    private void handleMessage(JSONObject msg) {
        String type = msg.optString("type", "");
        JSONObject payload = msg.optJSONObject("payload");
        if (payload == null) payload = new JSONObject();
        switch (type) {
            case "server:registered": {
                android.util.Log.d("AiRemoteAgent", "server:registered");
                if (kickHandler != null) kickHandler.removeCallbacksAndMessages(null);
                Prefs.sp(AgentService.this).edit().putBoolean("kicked", false).apply();
                registered = true;
                deviceId = payload.optString("deviceId", "");
                String name = payload.optString("name", "");
                deviceDisplay = name + " — " + deviceId;
                MainActivity.setStatus("متصل ✓", true);
                MainActivity.updateConn(Prefs.server(AgentService.this), deviceDisplay, formatUptime());
                MainActivity.log("✅ مسجل بنجاح — " + name + " — " + deviceId);
                break;
            }
            case "server:ping":
                sendMsg("agent:pong", new JSONObject());
                break;
            case "server:command":
                final JSONObject cmdPayload = payload;
                new Thread(() -> handleCommand(cmdPayload)).start();
                break;
            case "server:screen_start":
                startScreenStream(payload);
                break;
            case "server:audio_control": {
                boolean enabled = payload.optBoolean("enabled", false);
                if (enabled) startSystemAudio(); else stopSystemAudio();
                break;
            }
            case "server:screen_rotate_auto":
                setAutoRotate(payload.optBoolean("enabled", true));
                break;
            case "server:screen_rotate":
                rotateScreenManual();
                break;
            case "server:screen_display":
                // Legacy command retained for compatibility; the current UI
                // uses screen:brightness instead.
                setScreenBrightness(payload.optBoolean("off", false) ? 0 : 255);
                break;
            case "server:screen_brightness":
                setScreenBrightness(payload.optInt("value", 255));
                break;
            case "server:screen_stop":
                stopScreenStream(payload.optString("sessionId", ""));
                break;
            case "server:screen_chat": {
                // v3.5 — in-app banner when visible; system notification when in the background
                String csender = payload.optString("sender", "viewer");
                String ctext = payload.optString("text", "");
                MainActivity.viewerChat(csender, ctext);
                if (MainActivity.visibleNow()) {
                    showChatOverlay(csender, ctext);
                } else {
                    notifyChat(csender, ctext);
                }
                break;
            }
            case "server:screen_clipboard_watch": {
                final String wsid = payload.optString("sessionId", "");
                final boolean wenabled = payload.optBoolean("enabled", false);
                final String wdir = payload.optString("direction", "to-device");
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> configureClipSync(wsid, wenabled, wdir));
                break;
            }
            case "server:screen_clipboard_read": {
                final String csid = payload.optString("sessionId", "");
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                    try {
                        String txt = "";
                        android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                        if (cm != null && cm.hasPrimaryClip() && cm.getPrimaryClip() != null && cm.getPrimaryClip().getItemCount() > 0) {
                            CharSequence cs = cm.getPrimaryClip().getItemAt(0).coerceToText(AgentService.this);
                            if (cs != null) txt = cs.toString();
                        }
                        JSONObject o = new JSONObject();
                        o.put("sessionId", csid);
                        o.put("text", txt);
                        sendMsg("agent:screen_clipboard", o);
                    } catch (Exception ignore) { }
                });
                break;
            }
            case "server:screen_clipboard_write": {
                final String ctxt = payload.optString("text", "");
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                    try {
                        android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                        if (cm != null) cm.setPrimaryClip(android.content.ClipData.newPlainText("AiRemote", ctxt));
                        // Echo guard: our own write must never come back as a device change.
                        clipSyncLastHash = sha256Hex(ctxt);
                        MainActivity.log("📋 نُسخ النص إلى حافظة الجهاز");
                    } catch (Exception ignore) { }
                });
                break;
            }
            case "server:screen_mouse":
                handleScreenMouse(payload);
                break;
            case "server:screen_key":
                handleScreenKey(payload);
                break;
            case "server:screen_control_request":
                try {
                    wakeScreenForRemote();
                    String scSid = payload.optString("sessionId", "");
                    String scReq = payload.optString("requestId", "");
                    if (Prefs.hasControlPassword(AgentService.this)) {
                        long nowTs = System.currentTimeMillis();
                        try { ctrlAuthAttempts.removeIf(t -> nowTs - t >= 60000); } catch (Exception ignore) { }
                        if (ctrlAuthAttempts.size() >= 10) {
                            JSONObject d = new JSONObject();
                            d.put("sessionId", scSid); d.put("requestId", scReq); d.put("reason", "rate_limited");
                            sendMsg("agent:screen_control_denied", d);
                            break;
                        }
                        ctrlAuthAttempts.add(nowTs);
                        if (Prefs.verifyControlPassword(AgentService.this, payload.optString("password", ""))) {
                            JSONObject g = new JSONObject();
                            g.put("sessionId", scSid); g.put("requestId", scReq); g.put("via", "password");
                            sendMsg("agent:screen_control_granted", g);
                            MainActivity.log("🔓 منح التحكم بكلمة مرور");
                        } else {
                            JSONObject d = new JSONObject();
                            d.put("sessionId", scSid); d.put("requestId", scReq); d.put("reason", "bad_password");
                            sendMsg("agent:screen_control_denied", d);
                            MainActivity.log("❌ كلمة مرور تحكم خاطئة");
                        }
                    } else {
                        final String fSid = scSid, fReq = scReq;
                        final String requester = payload.optString("requesterName", "مشاهد");
                        if (MainActivity.visibleNow()) {
                            MainActivity.askConsent(requester, allowed -> {
                                try {
                                    JSONObject o = new JSONObject();
                                    o.put("sessionId", fSid);
                                    o.put("requestId", fReq);
                                    if (allowed) { sendMsg("agent:screen_control_granted", o); MainActivity.log("✅ منحت إذن التحكم"); }
                                    else { sendMsg("agent:screen_control_denied", o); MainActivity.log("❌ رفضت طلب التحكم"); }
                                } catch (Exception ignore) { }
                            });
                        } else {
                            try {
                                android.content.Intent ci = new android.content.Intent(AgentService.this, MainActivity.class);
                                ci.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                                startActivity(ci);
                            } catch (Exception ignore3) { }
                            JSONObject g = new JSONObject();
                            g.put("sessionId", fSid); g.put("requestId", fReq); g.put("reason", "manual_approval_required");
                            sendMsg("agent:screen_control_denied", g);
                            MainActivity.log("منح التحكم تلقائياً (التطبيق في الخلفية)");
                        }
                    }
                } catch (Exception ignore) { }
                break;
            case "server:screen_get_monitors":
                try {
                    JSONObject mp = new JSONObject();
                    mp.put("sessionId", payload.optString("sessionId", ""));
                    org.json.JSONArray arr = new org.json.JSONArray();
                    JSONObject mon = new JSONObject();
                    DisplayMetrics dm2 = getResources().getDisplayMetrics();
                    mon.put("id", 0);
                    mon.put("name", "Android");
                    mon.put("width", dm2.widthPixels);
                    mon.put("height", dm2.heightPixels);
                    mon.put("primary", true);
                    mon.put("x", 0);
                    mon.put("y", 0);
                    arr.put(mon);
                    mp.put("monitors", arr);
                    sendMsg("agent:screen_monitors", mp);
                } catch (Exception ignore) { }
                break;
            case "server:screen_set_quality":
                streamQuality = Math.min(Math.max(payload.optInt("quality", 60), 10), 95);
                break;
            case "server:screen_set_delta":
                // v3.8.3 - the server turns delta off while it records full frames.
                streamDelta = payload.optBoolean("delta", true);
                prevPixels = null;
                break;
            case "server:fs_write_chunk": {
                final JSONObject chunkPayload = payload;
                new Thread(() -> handleFsChunk(chunkPayload)).start();
                break;
            }
            case "server:fs_request":
                final JSONObject fsPayload = payload;
                new Thread(() -> handleFs(fsPayload)).start();
                break;
            case "server:error":
                MainActivity.log("خطأ من الخادم: " + payload.optString("message"));
                break;
            case "session:offer":
                handleSessionOffer(payload);
                break;
            case "session:ticket":
                openSessionView(payload);
                break;
            case "session:close":
            case "session:closed":
            case "session:expired": {
                Intent closed = new Intent(SessionWebViewActivity.ACTION_CLOSED);
                closed.setPackage(getPackageName());
                closed.putExtra("sessionId", payload.optString("sessionId", ""));
                sendBroadcast(closed);
                break;
            }
        }
    }

    private void handleCommand(JSONObject payload) {
        String commandId = payload.optString("commandId", "");
        String command = payload.optString("command", "");
        long t0 = SystemClock.elapsedRealtime();
        try {
            if (command.startsWith("AICTL:")) {
                String b64 = command.substring(6);
                String json = new String(Base64.decode(b64, Base64.DEFAULT), "UTF-8");
                JSONObject action = new JSONObject(json);
                String res = AiRemoteA11y.runSync(action);
                boolean ok = !res.startsWith("unknown") && !res.startsWith("type failed") && !res.startsWith("timeout") && !res.equals("a11y-not-enabled") && !res.equals("name-not-found");
                replyCommand(commandId, res, ok ? "" : res, ok ? 0 : 1, SystemClock.elapsedRealtime() - t0);
                return;
            }
            if (command.startsWith("AISHOT:")) {
                String path = command.substring(7).trim();
                String err = captureToFile(path);
                if (err == null) replyCommand(commandId, "shot-ok", "", 0, SystemClock.elapsedRealtime() - t0);
                else replyCommand(commandId, "", err, 1, SystemClock.elapsedRealtime() - t0);
                return;
            }
            // generic shell
            Process p = new ProcessBuilder("sh", "-c", command).redirectErrorStream(false).start();
            InputStream is = p.getInputStream(), es = p.getErrorStream();
            ByteArrayOutputStream os = new ByteArrayOutputStream(), ose = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
            while ((n = es.read(buf)) > 0) ose.write(buf, 0, n);
            int code = p.waitFor();
            replyCommand(commandId, new String(os.toByteArray(), "UTF-8"), new String(ose.toByteArray(), "UTF-8"), code, SystemClock.elapsedRealtime() - t0);
        } catch (Exception e) {
            replyCommand(commandId, "", String.valueOf(e.getMessage()), 1, SystemClock.elapsedRealtime() - t0);
        }
    }

    private void replyCommand(String commandId, String stdout, String stderr, int exitCode, long duration) {
        try {
            JSONObject p = new JSONObject();
            p.put("commandId", commandId);
            p.put("stdout", stdout);
            p.put("stderr", stderr);
            p.put("exitCode", exitCode);
            p.put("duration", duration);
            sendMsg("agent:command_result", p);
        } catch (Exception ignore) { }
    }


    private final java.util.HashMap<String, java.io.FileOutputStream> fsChunks = new java.util.HashMap<>();

    private void handleFsChunk(JSONObject payload) {
        String opId = payload.optString("opId", "");
        String path = payload.optString("path", "");
        String data = payload.optString("data", "");
        boolean last = payload.optBoolean("isLast", false);
        try {
            java.io.FileOutputStream fos;
            synchronized (fsChunks) { fos = fsChunks.get(opId); }
            if (fos == null) {
                File f = new File(path);
                File parent = f.getParentFile();
                if (parent != null && !parent.exists()) parent.mkdirs();
                fos = new java.io.FileOutputStream(f, false);
                synchronized (fsChunks) { fsChunks.put(opId, fos); }
            }
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            fos.write(bytes);
            if (last) {
                try { fos.close(); } catch (Exception ignore) { }
                synchronized (fsChunks) { fsChunks.remove(opId); }
                JSONObject out = new JSONObject();
                out.put("requestId", opId);
                out.put("opId", opId);
                JSONObject d = new JSONObject();
                d.put("ok", true);
                d.put("path", path);
                out.put("data", d);
                sendMsg("agent:fs_response", out);
            }
        } catch (Exception e) {
            try {
                synchronized (fsChunks) { fsChunks.remove(opId); }
                JSONObject out = new JSONObject();
                out.put("requestId", opId);
                out.put("opId", opId);
                out.put("error", String.valueOf(e.getMessage()));
                sendMsg("agent:fs_response", out);
            } catch (Exception ignore) { }
        }
    }

    private void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteRecursive(k);
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    private void handleFs(JSONObject payload) {
        String requestId = payload.optString("requestId", payload.optString("opId", ""));
        String op = payload.optString("op", payload.optString("action", ""));
        String path = payload.optString("path", "");
        try {
            JSONObject out = new JSONObject();
            out.put("requestId", requestId);
            out.put("opId", requestId);
            if ("read".equals(op)) {
                File f = new File(path);
                byte[] data = new byte[(int) f.length()];
                RandomAccessFile raf = new RandomAccessFile(f, "r");
                raf.readFully(data);
                raf.close();
                String b64 = Base64.encodeToString(data, Base64.NO_WRAP);
                JSONObject d = new JSONObject();
                d.put("base64", b64);
                d.put("size", data.length);
                out.put("data", d);
                out.put("base64", b64);
                out.put("encoding", "base64");
            } else if ("write".equals(op)) {
                String b64 = payload.optString("content", payload.optString("base64", ""));
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                File f = new File(path);
                File parent = f.getParentFile();
                if (parent != null && !parent.exists()) parent.mkdirs();
                FileOutputStream fos = new FileOutputStream(f);
                fos.write(data);
                fos.close();
                JSONObject d = new JSONObject();
                d.put("ok", true);
                d.put("size", data.length);
                out.put("data", d);
            } else if ("mkdir".equals(op)) {
                File dir = new File(path);
                boolean made = dir.isDirectory() || dir.mkdirs();
                JSONObject d = new JSONObject();
                d.put("ok", made);
                d.put("path", dir.getAbsolutePath());
                out.put("data", d);
            } else if ("delete".equals(op)) {
                File target = new File(path);
                deleteRecursive(target);
                JSONObject d = new JSONObject();
                d.put("ok", true);
                out.put("data", d);
            } else if ("rename".equals(op)) {
                String newPath = payload.optString("newPath", "");
                File src = new File(path);
                File dst = new File(newPath);
                boolean ok = src.renameTo(dst);
                JSONObject d = new JSONObject();
                d.put("ok", ok);
                out.put("data", d);
            } else if ("read_chunked".equals(op)) {
                // v3.5 — stream large files in 512KB chunks (parity with Windows agent)
                File f = new File(path);
                FileInputStream fis = new FileInputStream(f);
                byte[] buf = new byte[512 * 1024];
                int seq = 0, n;
                while ((n = fis.read(buf)) > 0) {
                    JSONObject ch = new JSONObject();
                    ch.put("opId", requestId);
                    ch.put("seq", seq++);
                    ch.put("data", Base64.encodeToString(buf, 0, n, Base64.NO_WRAP));
                    ch.put("done", false);
                    sendMsg("agent:fs_chunk", ch);
                }
                fis.close();
                JSONObject done = new JSONObject();
                done.put("opId", requestId);
                done.put("seq", seq);
                done.put("data", "");
                done.put("done", true);
                sendMsg("agent:fs_chunk", done);
                return;
            } else if ("list".equals(op)) {
                File dir = new File(path.isEmpty() ? "/sdcard" : path);
                File[] kids = dir.listFiles();
                org.json.JSONArray arr = new org.json.JSONArray();
                if (kids != null) {
                    for (File k : kids) {
                        JSONObject e = new JSONObject();
                        e.put("name", k.getName());
                        e.put("path", k.getAbsolutePath());
                        e.put("isDirectory", k.isDirectory());
                        e.put("size", k.length());
                        e.put("modified", k.lastModified());
                        arr.put(e);
                    }
                }
                out.put("data", arr);
            } else {
                out.put("error", "op not supported: " + op);
            }
            sendMsg("agent:fs_response", out);
        } catch (Exception e) {
            try {
                JSONObject out = new JSONObject();
                out.put("requestId", requestId);
                out.put("opId", requestId);
                out.put("error", String.valueOf(e.getMessage()));
                sendMsg("agent:fs_response", out);
            } catch (Exception ignore) { }
        }
    }

    /** Returns null on success, error text otherwise. */
    private String captureToFile(String path) {
        MediaProjection projection = null;
        VirtualDisplay vd = null;
        ImageReader reader = null;
        try {
            if (!CaptureHolder.ready()) return "لا يوجد إذن التقاط الشاشة — امنحه من التطبيق";
            DisplayMetrics dm = getResources().getDisplayMetrics();
            int w = dm.widthPixels, h = dm.heightPixels, dpi = dm.densityDpi;
            MediaProjectionManager mgr = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
            ensureProjectionForeground(); projection = mgr.getMediaProjection(CaptureHolder.resultCode, CaptureHolder.data);
            if (projection == null) return "projection null";
            reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2);
            vd = projection.createVirtualDisplay("airemote", w, h, dpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, null);
            Thread.sleep(600);
            Image image = reader.acquireLatestImage();
            if (image == null) { Thread.sleep(500); image = reader.acquireLatestImage(); }
            if (image == null) return "no frame";
            Image.Plane[] planes = image.getPlanes();
            ByteBuffer buffer = planes[0].getBuffer();
            int pixelStride = planes[0].getPixelStride();
            int rowStride = planes[0].getRowStride();
            int rowPadding = rowStride - pixelStride * w;
            Bitmap bmp = Bitmap.createBitmap(w + rowPadding / pixelStride, h, Bitmap.Config.ARGB_8888);
            bmp.copyPixelsFromBuffer(buffer);
            Bitmap cropped = Bitmap.createBitmap(bmp, 0, 0, w, h);
            File f = new File(path);
            File parent = f.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            FileOutputStream fos = new FileOutputStream(f);
            cropped.compress(Bitmap.CompressFormat.JPEG, 85, fos);
            fos.close();
            bmp.recycle();
            cropped.recycle();
            image.close();
            return null;
        } catch (Exception e) {
            return "capture error: " + e.getMessage();
        } finally {
            try { if (vd != null) vd.release(); } catch (Exception ignore) { }
            try { if (reader != null) reader.close(); } catch (Exception ignore) { }
            try { if (projection != null) projection.stop(); } catch (Exception ignore) { }
        }
    }

    /** Android 14 denies /proc/stat to normal apps. Read the kernel counters when
     *  possible; otherwise use the toybox top summary (which is permitted). */
    /** Run top off the heartbeat thread; a wedged top must never stop heartbeats. */
    /** /proc/self/stat is readable even on Android 14; use the agent process
     *  CPU as a useful fallback when system-wide counters are blocked. */
    private int readAppCpuPercent() {
        try {
            RandomAccessFile raf = new RandomAccessFile("/proc/self/stat", "r");
            String line = raf.readLine();
            raf.close();
            int rp = line.lastIndexOf(')');
            String[] f = line.substring(rp + 2).trim().split("\\s+");
            long ticks = Long.parseLong(f[11]) + Long.parseLong(f[12]);
            long now = SystemClock.elapsedRealtime();
            int pct = 0;
            if (lastAppCpuTicks >= 0 && now > lastAppCpuAt) {
                pct = (int) Math.round((ticks - lastAppCpuTicks) * 1000.0 / (now - lastAppCpuAt));
            }
            lastAppCpuTicks = ticks;
            lastAppCpuAt = now;
            return Math.max(0, Math.min(100, pct));
        } catch (Exception ignore) {
            return 0;
        }
    }

    private void scheduleCpuTopSample() {
        if (cpuSampling) return;
        cpuSampling = true;
        Thread t = new Thread(() -> {
            Process p = null;
            try {
                p = new ProcessBuilder("sh", "-c", "top -b -n 1 -m 1").redirectErrorStream(true).start();
                BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
                String line;
                int total = -1, idle = -1;
                while ((line = br.readLine()) != null) {
                    if (line.contains("%cpu") && line.contains("%idle")) {
                        for (String tok : line.trim().split("\\s+")) {
                            if (tok.endsWith("%cpu")) total = Integer.parseInt(tok.substring(0, tok.length() - 4));
                            if (tok.endsWith("%idle")) idle = Integer.parseInt(tok.substring(0, tok.length() - 5));
                        }
                        break;
                    }
                }
                br.close();
                if (total > 0 && idle >= 0) {
                    cpuFromTop = Math.max(0, Math.min(100, Math.round((total - idle) * 100f / total)));
                    cpuFromTopAt = SystemClock.elapsedRealtime();
                }
            } catch (Exception ignore) {
            } finally {
                try { if (p != null) p.destroy(); } catch (Exception ignore) { }
                cpuSampling = false;
            }
        });
        t.setDaemon(true);
        t.start();
    }

    private int readCpuPercent() {
        long now = SystemClock.elapsedRealtime();
        if (cachedCpuPercent >= 0 && now - cachedCpuAt < 8000) return cachedCpuPercent;
        int pct = -1;
        try {
            RandomAccessFile raf = new RandomAccessFile("/proc/stat", "r");
            String line = raf.readLine();
            raf.close();
            String[] parts = line.trim().split("\\s+");
            long sum = 0;
            for (int i = 1; i < parts.length && i <= 7; i++) sum += Long.parseLong(parts[i]);
            long idle = Long.parseLong(parts[4]);
            if (lastCpuTotal > 0) {
                long dt = sum - lastCpuTotal, di = idle - lastCpuIdle;
                if (dt > 0) pct = (int) Math.round((dt - di) * 100.0 / dt);
            }
            lastCpuTotal = sum;
            lastCpuIdle = idle;
        } catch (Exception ignore) { }
        if (pct < 0) {
            if (cpuFromTop >= 0 && now - cpuFromTopAt < 30000) pct = cpuFromTop;
            else scheduleCpuTopSample();
        }

        if (pct <= 0) pct = readAppCpuPercent();        pct = Math.max(0, Math.min(100, pct < 0 ? 0 : pct));
        cachedCpuPercent = pct;
        cachedCpuAt = now;
        return pct;
    }

    private JSONObject buildStats() {
        JSONObject s = new JSONObject();
        try {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(mi);
            long totalMb = mi.totalMem / 1048576L;
            long usedMb = (mi.totalMem - mi.availMem) / 1048576L;
            s.put("ramTotalMb", totalMb);
            s.put("ramUsedMb", usedMb);
            s.put("ramPercent", totalMb > 0 ? Math.round(usedMb * 100.0 / totalMb) : 0);
        } catch (Exception ignore) { }
        try { s.put("cpuPercent", readCpuPercent()); } catch (Exception ignore) { }
        try {
            android.os.StatFs st = new android.os.StatFs("/data");
            long bTotal = st.getBlockCountLong() * st.getBlockSizeLong();
            long bFree = st.getAvailableBlocksLong() * st.getBlockSizeLong();
            long totalGb = Math.round(bTotal / 1073741824.0);
            long usedGb = Math.round((bTotal - bFree) / 1073741824.0);
            s.put("diskTotalGb", totalGb);
            s.put("diskUsedGb", usedGb);
            s.put("diskPercent", bTotal > 0 ? Math.round((bTotal - bFree) * 100.0 / bTotal) : 0);
        } catch (Exception ignore) { }
        try {
            s.put("networkUpKbps", 0);
            s.put("networkDownKbps", 0);
            s.put("uptime", SystemClock.elapsedRealtime() / 1000);
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            s.put("screenOn", pm != null && pm.isInteractive());
            s.put("keyguardLocked", km != null && km.isKeyguardLocked());
            s.put("keyguardSecure", km != null && km.isKeyguardSecure());
        } catch (Exception ignore) { }
        return s;
    }

    private String localIp() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                for (java.net.InetAddress ia : Collections.list(ni.getInetAddresses())) {
                    if (!ia.isLoopbackAddress() && ia.getAddress().length == 4) {
                        String ip = ia.getHostAddress();
                        if (ip != null) return ip;
                    }
                }
            }
        } catch (Exception ignore) { }
        return "";
    }

    // ── v1.1 — Screen streaming (JPEG frames over the agent WS) ────────────
    /** Keep the phone screen on (and wake it if needed) while a viewer is connected. */
    /** Ask a transparent activity to turn the panel on. A normal app cannot
     *  dismiss a secure PIN/password keyguard; this is the supported part. */
    public void wakeScreenForRemote() {
        try {
            android.content.Intent wi = new android.content.Intent(this, WakeActivity.class);
            wi.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                    | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
                    | android.content.Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
            startActivity(wi);
        } catch (Exception ignore) { }
    }

    private void acquireAgentLocks() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                if (agentCpuWakeLock == null) {
                    agentCpuWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AiRemote:agent-cpu");
                    agentCpuWakeLock.setReferenceCounted(false);
                }
                if (!agentCpuWakeLock.isHeld()) agentCpuWakeLock.acquire();
            }
            if (pm != null) {
                // TECNO's Hiber freezer drops third-party apps after screen-off
                // even when a foreground service is running. Keep the panel on
                // while the agent is enabled so remote wake/control stays
                // reachable; this is released on Stop or for screen-off mode.
                if (!screenOffMode) {
                    if (agentScreenLock == null) {
                        agentScreenLock = pm.newWakeLock(
                                PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                                "AiRemote:agent-screen");
                        agentScreenLock.setReferenceCounted(false);
                    }
                    if (!agentScreenLock.isHeld()) agentScreenLock.acquire();
                } else {
                    try { if (agentScreenLock != null && agentScreenLock.isHeld()) agentScreenLock.release(); } catch (Exception ignore) { }
                }
            }
            android.net.wifi.WifiManager wm = (android.net.wifi.WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            if (wm != null) {
                if (agentWifiLock == null) {
                    agentWifiLock = wm.createWifiLock(android.net.wifi.WifiManager.WIFI_MODE_FULL_HIGH_PERF, "AiRemote:agent-wifi");
                    agentWifiLock.setReferenceCounted(false);
                }
                if (!agentWifiLock.isHeld()) agentWifiLock.acquire();
            }
        } catch (Exception ignore) { }
    }

    private void releaseAgentLocks() {
        try { if (agentCpuWakeLock != null && agentCpuWakeLock.isHeld()) agentCpuWakeLock.release(); } catch (Exception ignore) { }
        try { if (agentScreenLock != null && agentScreenLock.isHeld()) agentScreenLock.release(); } catch (Exception ignore) { }
        try { if (agentWifiLock != null && agentWifiLock.isHeld()) agentWifiLock.release(); } catch (Exception ignore) { }
        agentCpuWakeLock = null;
        agentScreenLock = null;
        agentWifiLock = null;
    }

    public static void restartNow() {
        if (INSTANCE == null) return;
        try { INSTANCE.stopAgent(); } catch (Exception ignore) { }
        INSTANCE.running = false;
        INSTANCE.startAgent();
    }

    public static void reconnectNow() {
        if (INSTANCE == null || !INSTANCE.running) return;
        INSTANCE.registered = false;
        try { if (INSTANCE.ws != null) INSTANCE.ws.close(); } catch (Exception ignore) { }
        INSTANCE.ws = null;
        INSTANCE.connect();
    }

    public static boolean isRunning() {
        return INSTANCE != null && INSTANCE.running;
    }

    public static boolean isConnected() {
        return INSTANCE != null && INSTANCE.running
                && INSTANCE.ws != null && INSTANCE.ws.isOpen()
                && INSTANCE.registered;
    }

    public static boolean isCaptureReady() {
        return CaptureHolder.ready();
    }

    private void acquireScreenWakeLock() {
        try {
            if (screenWakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                screenWakeLock = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                        "AiRemote:screen");
                screenWakeLock.setReferenceCounted(false);
            }
            if (!screenWakeLock.isHeld()) screenWakeLock.acquire();
        } catch (Exception ignore) { }
    }

    private void releaseScreenWakeLock() {
        try { if (screenWakeLock != null && screenWakeLock.isHeld()) screenWakeLock.release(); } catch (Exception ignore) { }
    }

    private void sendDisplayState() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            org.json.JSONObject o = new org.json.JSONObject();
            o.put("screenOn", pm != null && pm.isInteractive());
            o.put("keyguardLocked", km != null && km.isKeyguardLocked());
            o.put("keyguardSecure", km != null && km.isKeyguardSecure());
            o.put("offMode", screenOffMode);
            sendMsg("agent:screen_display_state", o);
        } catch (Exception ignore) { }
    }

    private void setScreenBrightness(int value) {
        int v = Math.max(0, Math.min(255, value));
        screenOffMode = false;
        hideScreenOffOverlay();
        acquireAgentLocks();
        acquireScreenWakeLock();
        boolean ok = false;
        try {
            android.provider.Settings.System.putInt(getContentResolver(),
                    android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE,
                    android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
            ok = android.provider.Settings.System.putInt(getContentResolver(),
                    android.provider.Settings.System.SCREEN_BRIGHTNESS, v);
            try { android.provider.Settings.System.putFloat(getContentResolver(),
                    "screen_brightness_float", v / 255f); } catch (Exception ignore) { }
        } catch (Exception ignore) { }
        try {
            org.json.JSONObject o = new org.json.JSONObject();
            o.put("value", v);
            o.put("ok", ok);
            sendMsg("agent:screen_brightness_status", o);
        } catch (Exception ignore) { }
    }

    private void showScreenOffOverlay() {
        try {
            if (screenOffOverlay != null) return;
            screenOffWm = (android.view.WindowManager) getSystemService(WINDOW_SERVICE);
            if (screenOffWm == null) return;
            screenOffOverlay = new android.view.View(this);
            screenOffOverlay.setBackgroundColor(android.graphics.Color.TRANSPARENT);
            int type = Build.VERSION.SDK_INT >= 26
                    ? android.view.WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : android.view.WindowManager.LayoutParams.TYPE_PHONE;
            android.view.WindowManager.LayoutParams lp = new android.view.WindowManager.LayoutParams(
                    android.view.WindowManager.LayoutParams.MATCH_PARENT,
                    android.view.WindowManager.LayoutParams.MATCH_PARENT, type,
                    android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                            | android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                            | android.view.WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    android.graphics.PixelFormat.TRANSLUCENT);
            lp.gravity = android.view.Gravity.TOP | android.view.Gravity.LEFT;
            lp.screenBrightness = 0.0f;
            screenOffWm.addView(screenOffOverlay, lp);
        } catch (Exception ignore) { }
    }

    private void hideScreenOffOverlay() {
        try {
            if (screenOffWm != null && screenOffOverlay != null) screenOffWm.removeView(screenOffOverlay);
        } catch (Exception ignore) { }
        screenOffOverlay = null;
        screenOffWm = null;
    }

    /** Toggle screen-off streaming. Keeps CPU/network locks and MediaProjection
     *  alive; releases the panel lock and applies a zero-brightness overlay. */
    private void setScreenOffMode(boolean off) {
        screenOffMode = off;
        if (off) {
            releaseScreenWakeLock();
            try { if (agentScreenLock != null && agentScreenLock.isHeld()) agentScreenLock.release(); } catch (Exception ignore) { }
            try {
                if (!brightnessSaved) {
                    savedBrightnessMode = android.provider.Settings.System.getInt(
                            getContentResolver(), android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE,
                            android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC);
                    savedBrightness = android.provider.Settings.System.getInt(
                            getContentResolver(), android.provider.Settings.System.SCREEN_BRIGHTNESS, 255);
                    brightnessSaved = true;
                }
                android.provider.Settings.System.putInt(getContentResolver(),
                        android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE,
                        android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
                android.provider.Settings.System.putInt(getContentResolver(),
                        android.provider.Settings.System.SCREEN_BRIGHTNESS, 0);
                try { android.provider.Settings.System.putFloat(getContentResolver(),
                        "screen_brightness_float", 0f); } catch (Exception ignore) { }
                showScreenOffOverlay();
            } catch (Exception ignore) { }
        } else {
            hideScreenOffOverlay();
            try {
                if (brightnessSaved) {
                    android.provider.Settings.System.putInt(getContentResolver(),
                            android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE, savedBrightnessMode);
                    android.provider.Settings.System.putInt(getContentResolver(),
                            android.provider.Settings.System.SCREEN_BRIGHTNESS, savedBrightness);
                    if (savedBrightnessMode == android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC) {
                        try { android.provider.Settings.System.putFloat(getContentResolver(),
                                "screen_brightness_float", savedBrightness / 255f); } catch (Exception ignore) { }
                    }
                }
            } catch (Exception ignore) { }
            brightnessSaved = false;
            acquireAgentLocks();
            acquireScreenWakeLock();
        }
        sendDisplayState();
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(this::sendDisplayState, 700);
    }

    private boolean canWriteSystemSettings() {
        try {
            return android.os.Build.VERSION.SDK_INT < 23
                    || android.provider.Settings.System.canWrite(this);
        } catch (Exception ignore) { return false; }
    }

    private void setAutoRotate(boolean enabled) {
        try {
            if (!canWriteSystemSettings()) {
                sendRotateStatus(false, isAutoRotateEnabled(), "write-settings-not-granted");
                return;
            }
            boolean ok = android.provider.Settings.System.putInt(getContentResolver(),
                    android.provider.Settings.System.ACCELEROMETER_ROTATION, enabled ? 1 : 0);
            sendRotateStatus(ok, ok ? enabled : isAutoRotateEnabled(),
                    ok ? "" : "auto-rotate failed");
        } catch (Exception e) {
            sendRotateStatus(false, isAutoRotateEnabled(), "write-settings-failed");
        }
    }

    private String formatUptime() {
        if (agentStartedAt <= 0) return "—";
        long sec = Math.max(0, (android.os.SystemClock.elapsedRealtime() - agentStartedAt) / 1000);
        long h = sec / 3600, m = (sec % 3600) / 60, ss = sec % 60;
        return h > 0 ? (h + ":" + String.format("%02d:%02d", m, ss)) : (m + ":" + String.format("%02d", ss));
    }

    private void rotateScreenManual() {
        try {
            if (!canWriteSystemSettings()) {
                sendRotateResult(false, "write-settings-not-granted", "");
                return;
            }
            int current = android.provider.Settings.System.getInt(getContentResolver(),
                    android.provider.Settings.System.USER_ROTATION, 0);
            int next = (current + 1) % 4;
            android.provider.Settings.System.putInt(getContentResolver(),
                    android.provider.Settings.System.ACCELEROMETER_ROTATION, 0);
            boolean ok = android.provider.Settings.System.putInt(getContentResolver(),
                    android.provider.Settings.System.USER_ROTATION, next);
            sendRotateResult(ok, ok ? "" : "rotate failed", ok ? ("rotated " + next) : "");
        } catch (Exception e) {
            sendRotateResult(false, "write-settings-failed", "");
        }
    }

    private void sendRotateResult(boolean ok, String reason, String result) {
        try {
            org.json.JSONObject o = new org.json.JSONObject();
            o.put("ok", ok);
            o.put("reason", reason == null ? "" : reason);
            o.put("result", result == null ? "" : result);
            sendMsg("agent:screen_rotate_result", o);
        } catch (Exception ignore) { }
    }

    /** Release the projection only when the service really stops. Keeping it warm
     *  avoids asking Android for screen-capture consent on every viewer reconnect. */
    private void releaseProjection() {
        ImageReader r = activeReader; VirtualDisplay v = activeVd; MediaProjection p = activeProjection;
        activeReader = null; activeVd = null; activeProjection = null;
        activeW = activeH = activeDpi = 0;
        try { if (v != null) v.release(); } catch (Exception ignore) { }
        try { if (r != null) r.close(); } catch (Exception ignore) { }
        try { if (p != null) p.stop(); } catch (Exception ignore) { }
    }

    private void startScreenStream(JSONObject payload) {
        final String sid = payload.optString("sessionId", "");
        // Quality changes on the same session only adjust encoder settings.
        if (streamRunning && sid.equals(streamSessionId)) {
            streamFps = Math.min(Math.max(payload.optInt("fps", streamFps), 1), 30);
            streamQuality = Math.min(Math.max(payload.optInt("quality", streamQuality), 10), 95);
            int mw = payload.optInt("maxWidth", streamMaxWidth);
            if (mw > 0) streamMaxWidth = Math.min(Math.max(mw, 320), 1920);
            streamBinary = payload.optBoolean("binary", streamBinary);
            prevPixels = null;
            return;
        }
        streamSessionId = sid;
        streamFps = Math.min(Math.max(payload.optInt("fps", 8), 1), 30);
        streamQuality = Math.min(Math.max(payload.optInt("quality", 60), 10), 95);
        streamMaxWidth = Math.min(Math.max(payload.optInt("maxWidth", 1280), 320), 1920);
        streamBinary = payload.optBoolean("binary", false);
        streamDelta = payload.optBoolean("delta", true);
        prevPixels = null; deltaRun = 0; slowEncodeStreak = 0; forceJpeg = false;
        // v3.8.28 - a new session must re-measure the band: the fields survive between
        // sessions, and a stale insetChecked would keep the old (possibly zero) crops.
        insetChecked = false;
        cropL = 0; cropT = 0; cropR = 0; cropB = 0;
        stopScreenStreamRaw();
        saveDisplaySettings();
        screenOffMode = false;
        wakeScreenForRemote();
        acquireScreenWakeLock();
        sendScreenState(sid);
        sendDisplayState();
        sendRotateStatus(true, isAutoRotateEnabled(), "");
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> sendScreenState(sid), 900);
        MainActivity.log("screen capture start (" + streamFps + " fps)");
        streamRunning = true;
        streamThread = new Thread(() -> {
            MediaProjection projection = activeProjection;
            VirtualDisplay vd = activeVd;
            ImageReader reader = activeReader;
            int fullW = activeW, fullH = activeH, dpi = activeDpi;
            int seq = 0;
            int lastRotation = -1;
            boolean created = false;
            try {
                if (projection == null || vd == null || reader == null) {
                    if (!CaptureHolder.ready()) {
                        try {
                            JSONObject e = new JSONObject();
                            e.put("sessionId", sid);
                            e.put("message", "screen capture permission is required - grant it from the app");
                            sendMsg("agent:screen_error", e);
                        } catch (Exception ignore) { }
                        streamRunning = false;
                        return;
                    }
                    DisplayMetrics dm = getResources().getDisplayMetrics();
                    fullW = dm.widthPixels; fullH = dm.heightPixels; dpi = dm.densityDpi;
                    capW = fullW; capH = fullH;
                    insetChecked = false;
                    MediaProjectionManager mgr = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
                    ensureProjectionForeground();
                    projection = mgr.getMediaProjection(CaptureHolder.resultCode, CaptureHolder.data);
                    if (projection == null) throw new Exception("projection null");
                    reader = ImageReader.newInstance(fullW, fullH, PixelFormat.RGBA_8888, 4);
                    vd = projection.createVirtualDisplay("airemote-stream", fullW, fullH, dpi,
                            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, null);
                    activeProjection = projection; activeVd = vd; activeReader = reader;
                    activeW = fullW; activeH = fullH; activeDpi = dpi;
                    created = true;
                } else {
                    capW = fullW; capH = fullH;
                    ensureProjectionForeground();
                }
                Bitmap scaled = null;
                while (streamRunning && ws != null && ws.isOpen()) {
                    // Do not queue a new JPEG while the previous one is still
                    // waiting in the Java-WebSocket outbound buffer. Otherwise
                    // video latency grows without bound on a slow Wi-Fi link.
                    if (ws.hasBufferedData()) { Thread.sleep(10); continue; }
                    long t0 = SystemClock.elapsedRealtime();

                    // Android rotates the physical display, but a VirtualDisplay
                    // keeps the size it was created with. Rebind the ImageReader
                    // and resize the virtual display so the stream follows the
                    // phone instead of staying in the old portrait/landscape box.
                    int currentRotation = -1;
                    int curW = fullW, curH = fullH, curDpi = dpi;
                    try {
                        DisplayManager dmgr = (DisplayManager) getSystemService(DISPLAY_SERVICE);
                        android.view.Display display = dmgr != null
                                ? dmgr.getDisplay(android.view.Display.DEFAULT_DISPLAY) : null;
                        if (display != null) {
                            DisplayMetrics metrics = new DisplayMetrics();
                            display.getRealMetrics(metrics);
                            curW = metrics.widthPixels;
                            curH = metrics.heightPixels;
                            curDpi = metrics.densityDpi;
                            currentRotation = display.getRotation();
                        }
                    } catch (Exception ignore) { }

                    if (curW > 0 && curH > 0 && (curW != fullW || curH != fullH ||
                            (lastRotation >= 0 && currentRotation >= 0 && currentRotation != lastRotation))) {
                        try {
                            ImageReader nextReader = ImageReader.newInstance(curW, curH, PixelFormat.RGBA_8888, 4);
                            if (vd != null) {
                                vd.setSurface(nextReader.getSurface());
                                vd.resize(curW, curH, curDpi);
                            }
                            ImageReader oldReader = reader;
                            reader = nextReader;
                            activeReader = nextReader;
                            fullW = curW; fullH = curH; dpi = curDpi;
                            activeW = fullW; activeH = fullH; activeDpi = dpi;
                            capW = fullW; capH = fullH;
                            insetChecked = false;
                            if (oldReader != null) oldReader.close();
                            if (scaled != null) { scaled.recycle(); scaled = null; }
                            // The Canvas is bound to one Bitmap. After a rotation it still
                            // points at the recycled one and drawing into it throws, which
                            // used to kill the capture loop (black screen after rotating).
                            scaleCanvas = null;
                            prevPixels = null; curPixels = null; deltaRun = 0;
                            MainActivity.log("screen orientation changed: " + fullW + "x" + fullH);
                        } catch (Exception re) {
                            MainActivity.log("screen rotation resize failed: " + re.getMessage());
                        }
                    }
                    lastRotation = currentRotation;

                    Image image = reader.acquireLatestImage();
                    if (image == null) { Thread.sleep(30); continue; }
                    try {
                        int visW = Math.max(1, fullW - cropL - cropR);
                        int visH = Math.max(1, fullH - cropT - cropB);
                        float fscale = Math.min(1f, streamMaxWidth / (float) visW);
                        int fw = Math.max(320, Math.round(visW * fscale));
                        int fh = Math.max(240, Math.round(visH * fscale));
                        if (scaled == null || scaled.getWidth() != fw || scaled.getHeight() != fh) {
                            if (scaled != null) scaled.recycle();
                            scaled = Bitmap.createBitmap(fw, fh, Bitmap.Config.ARGB_8888);
                            scaleCanvas = null;   // canvas belongs to the previous bitmap
                        }
                        Image.Plane[] planes = image.getPlanes();
                        ByteBuffer buffer = planes[0].getBuffer();
                        int pixelStride = planes[0].getPixelStride();
                        int rowStride = planes[0].getRowStride();
                        int rowPadding = rowStride - pixelStride * fullW;
                        Bitmap bmp = frameBitmap(fullW, fullH, rowPadding, pixelStride);
                        buffer.rewind();
                        bmp.copyPixelsFromBuffer(buffer);
                        if (!insetChecked) {
                            measureCrops(bmp);
                            insetChecked = true;
                        }
                        if (scaleCanvas == null) scaleCanvas = new android.graphics.Canvas(scaled);
                        android.graphics.Rect src = new android.graphics.Rect(cropL, cropT, fullW - cropR, fullH - cropB);
                        android.graphics.Rect dst = new android.graphics.Rect(0, 0, fw, fh);
                        scaleCanvas.drawBitmap(bmp, src, dst, null);
                        // v3.8.3 - send only the changed rectangle when the diff is small.
                        boolean skipFrame = false;
                        boolean delta = false;
                        int rw = fw, rh = fh, rx = 0, ry = 0;
                        if (streamBinary && streamDelta) {
                            if (curPixels == null || curPixels.length != fw * fh) {
                                curPixels = new int[fw * fh];
                                prevPixels = null;
                            }
                            scaled.getPixels(curPixels, 0, fw, 0, 0, fw, fh);
                            boolean same = prevPixels != null && prevFw == fw && prevFh == fh;
                            int[] box = (same && deltaRun < DELTA_MAX_RUN)
                                    ? diffRegion(curPixels, prevPixels, fw, fh) : null;
                            if (same && box == null && SystemClock.elapsedRealtime() - lastFrameMs < KEYFRAME_INTERVAL_MS) {
                                skipFrame = true;                        // static screen: nothing to send
                            } else if (same && box != null
                                    && ((long) box[2] * box[3]) * 100L < (long) fw * fh * 70L) {
                                rx = box[0]; ry = box[1]; rw = box[2]; rh = box[3];
                                delta = true;
                            }
                        }
                        if (skipFrame) {
                            perfSkipped++;
                        } else {
                            ByteArrayOutputStream bos = frameBuffer();
                            Bitmap regionBmp = null;
                            try {
                                Bitmap toEncode = scaled;
                                if (delta) {
                                    regionBmp = Bitmap.createBitmap(scaled, rx, ry, rw, rh);
                                    if (regionBmp != null) toEncode = regionBmp;
                                }
                                boolean webp = false;
                                long encStart = SystemClock.elapsedRealtime();
                                if (!forceJpeg) {
                                    try {
                                        if (Build.VERSION.SDK_INT >= 30) {
                                            webp = toEncode.compress(Bitmap.CompressFormat.WEBP_LOSSY, streamQuality, bos);
                                        } else {
                                            webp = toEncode.compress(Bitmap.CompressFormat.WEBP, streamQuality, bos);
                                        }
                                    } catch (Throwable ignore) { webp = false; }
                                }
                                long encMs = SystemClock.elapsedRealtime() - encStart;
                                // Adaptive: WebP saves bytes but on slow SoCs it costs more frames
                                // than it saves. Three slow encodes in a row -> stay on JPEG.
                                if (webp && encMs > 150) {
                                    if (++slowEncodeStreak >= 3 && !forceJpeg) {
                                        forceJpeg = true;
                                        MainActivity.log("encoder: WebP too slow (" + encMs + " ms) — switched to JPEG");
                                        android.util.Log.d("AiRemoteAgent", "encoder fallback to JPEG after " + encMs + " ms");
                                    }
                                } else {
                                    slowEncodeStreak = 0;
                                }
                                if (!webp || bos.size() == 0) {
                                    bos.reset();
                                    toEncode.compress(Bitmap.CompressFormat.JPEG, streamQuality, bos);
                                    webp = false;
                                }
                                byte[] img = bos.toByteArray();
                                bos.reset();
                                int fseq = ++seq;
                                if (streamBinary) {
                                    sendBinaryFrame(sid, rw, rh, fseq,
                                            (byte) ((delta ? 2 : 1) | (webp ? 4 : 0)), img, rx, ry);
                                } else {
                                    String b64 = Base64.encodeToString(img, Base64.NO_WRAP);
                                    JSONObject fr = new JSONObject();
                                    fr.put("sessionId", sid);
                                    fr.put("data", b64);
                                    fr.put("width", rw);
                                    fr.put("height", rh);
                                    fr.put("seq", fseq);
                                    fr.put("ts", System.currentTimeMillis());
                                    fr.put("keyframe", !delta);
                                    fr.put("quality", streamQuality);
                                    sendMsg("agent:screen_frame", fr);
                                }
                                lastFrameMs = SystemClock.elapsedRealtime();
                                if (streamBinary && streamDelta && curPixels != null) {
                                    if (prevPixels == null || prevPixels.length != curPixels.length) {
                                        prevPixels = new int[curPixels.length];
                                    }
                                    System.arraycopy(curPixels, 0, prevPixels, 0, curPixels.length);
                                    prevFw = fw; prevFh = fh;
                                    deltaRun = delta ? (deltaRun + 1) : 0;
                                }
                                perfSample(t0, img.length);
                            } finally {
                                if (regionBmp != null && regionBmp != scaled && !regionBmp.isRecycled()) {
                                    regionBmp.recycle();
                                }
                            }
                        }
                    } catch (Exception fe) {
                        // A single bad frame (rotation, resized display) must not stop capture.
                        MainActivity.log("frame skipped: " + fe.getMessage());
                    } finally {
                        image.close();
                    }
                    long dt = SystemClock.elapsedRealtime() - t0;
                    long target = Math.max(10, 1000L / streamFps - dt);
                    Thread.sleep(target);
                }
            } catch (Exception e) {
                MainActivity.log("screen error: " + e.getMessage());
                activeProjection = null; activeVd = null; activeReader = null; activeW = activeH = activeDpi = 0;
                try { if (vd != null) vd.release(); } catch (Exception ignore) { }
                try { if (reader != null) reader.close(); } catch (Exception ignore) { }
                try { if (projection != null) projection.stop(); } catch (Exception ignore) { }
            } finally {
                try { if (bmpFull != null && !bmpFull.isRecycled()) bmpFull.recycle(); } catch (Exception ignore) { }
                bmpFull = null; scaleCanvas = null; frameBos = null;
                try {
                    JSONObject c = new JSONObject();
                    c.put("sessionId", sid);
                    sendMsg("agent:screen_closed", c);
                } catch (Exception ignore) { }
                MainActivity.log("screen capture loop ended");
            }
        });
        streamThread.setDaemon(true);
        streamThread.start();
    }

    /** Reused full-size bitmap: avoids a multi-megabyte allocation every frame. */
    private Bitmap frameBitmap(int fullW, int fullH, int rowPadding, int pixelStride) {
        int needW = fullW + rowPadding / pixelStride;
        Bitmap b = bmpFull;
        if (b == null || b.isRecycled() || b.getWidth() != needW || b.getHeight() != fullH) {
            if (b != null && !b.isRecycled()) b.recycle();
            b = Bitmap.createBitmap(needW, fullH, Bitmap.Config.ARGB_8888);
            bmpFull = b;
        }
        return b;
    }

    private ByteArrayOutputStream frameBuffer() {
        if (frameBos == null) frameBos = new ByteArrayOutputStream(131072);
        frameBos.reset();
        return frameBos;
    }

    /**
     * v3.8.2 - binary screen frame (same wire format the Windows agent uses):
     * [0x01][sessionId:36B][width:4B][height:4B][seq:4B][flags:1B][image...]
     * flags bit0 = keyframe, bit1 = delta, bit2 = WebP payload.
     */
    private void sendBinaryFrame(String sid, int w, int h, int seq, byte flags, byte[] img, int dx, int dy) {
        WebSocketClient c = ws;
        if (c == null || !c.isOpen()) return;
        try {
            byte[] id = new byte[36];
            byte[] s = sid.getBytes("UTF-8");
            System.arraycopy(s, 0, id, 0, Math.min(36, s.length));
            boolean isDelta = (flags & 2) != 0;
            java.nio.ByteBuffer bb = java.nio.ByteBuffer.allocate((isDelta ? 58 : 50) + img.length);
            bb.put((byte) 0x01);
            bb.put(id);
            bb.putInt(w);
            bb.putInt(h);
            bb.putInt(seq);
            bb.put(flags);
            if (isDelta) {
                bb.putInt(dx);
                bb.putInt(dy);
            }
            bb.put(img);
            c.send(bb.array());
        } catch (Exception ignore) { }
    }

    /**
     * v3.8.3 - bounding box of the pixels that actually changed, sampled on a 2px
     * grid (cheap enough for 720p at 10 fps) and padded so WebP/JPEG edges stay clean.
     */
    private int[] diffRegion(int[] cur, int[] prev, int w, int h) {
        int minX = w, minY = h, maxX = -1, maxY = -1;
        for (int y = 0; y < h; y += 2) {
            int row = y * w;
            for (int x = 0; x < w; x += 2) {
                if (((cur[row + x] ^ prev[row + x]) & 0x00F0F0F0) != 0) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return null;
        int pad = 8;
        int x0 = Math.max(0, minX - pad) & ~1;
        int y0 = Math.max(0, minY - pad) & ~1;
        int x1 = Math.min(w - 1, maxX + pad);
        int y1 = Math.min(h - 1, maxY + pad);
        int bw = Math.min(w - x0, x1 - x0 + 1);
        int bh = Math.min(h - y0, y1 - y0 + 1);
        return new int[]{x0, y0, Math.max(2, bw), Math.max(2, bh)};
    }

    /** v3.8.2 - fps / throughput / encode-time counters, logged every 5s. */
    private void perfSample(long t0, int bytes) {
        long now = SystemClock.elapsedRealtime();
        if (perfLastLog == 0) { perfLastLog = now; return; }
        perfFrames++;
        perfBytes += bytes;
        perfEncodeMs += now - t0;
        long dt = now - perfLastLog;
        if (dt < 5000) return;
        int fps = Math.round(perfFrames * 1000f / dt);
        int kbps = Math.round(perfBytes / 1024f * 1000f / dt);
        int ms = Math.round(perfEncodeMs / (float) Math.max(1, perfFrames));
        String perfLine = "perf: " + fps + " fps, " + kbps + " KB/s, encode " + ms + " ms"
                + (perfSkipped > 0 ? ", skipped " + perfSkipped : "");
        MainActivity.log(perfLine);
        android.util.Log.d("AiRemoteAgent", perfLine);   // v3.8.3 - also visible in logcat
        perfFrames = 0; perfBytes = 0; perfEncodeMs = 0; perfLastLog = now;
    }

    private void stopScreenStreamRaw() {
        stopClipPoll();
        clipSyncEnabled = false;
        streamRunning = false;
        stopSystemAudio();
        restoreDisplaySettings();
        releaseScreenWakeLock();
        // keep projection warm: the next viewer reuses the same consent token
        Thread th = streamThread;
        if (th != null) {
            try { th.join(1500); } catch (InterruptedException ignore) { }
            streamThread = null;
        }
    }

    // ── Android 10+ system audio (AudioPlaybackCapture) ───────────────────
    private void saveDisplaySettings() {
        if (displaySettingsSaved) return;
        try {
            preStreamBrightnessMode = android.provider.Settings.System.getInt(getContentResolver(),
                    android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE,
                    android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC);
            preStreamBrightness = android.provider.Settings.System.getInt(getContentResolver(),
                    android.provider.Settings.System.SCREEN_BRIGHTNESS, 255);
            preStreamAccel = android.provider.Settings.System.getInt(getContentResolver(),
                    android.provider.Settings.System.ACCELEROMETER_ROTATION, 1);
            preStreamUserRotation = android.provider.Settings.System.getInt(getContentResolver(),
                    android.provider.Settings.System.USER_ROTATION, 0);
            displaySettingsSaved = true;
        } catch (Exception ignore) { }
    }

    private void restoreDisplaySettings() {
        if (!displaySettingsSaved) return;
        try {
            android.provider.Settings.System.putInt(getContentResolver(),
                    android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE, preStreamBrightnessMode);
            android.provider.Settings.System.putInt(getContentResolver(),
                    android.provider.Settings.System.SCREEN_BRIGHTNESS, preStreamBrightness);
            android.provider.Settings.System.putInt(getContentResolver(),
                    android.provider.Settings.System.ACCELEROMETER_ROTATION, preStreamAccel);
            android.provider.Settings.System.putInt(getContentResolver(),
                    android.provider.Settings.System.USER_ROTATION, preStreamUserRotation);
        } catch (Exception ignore) { }
        displaySettingsSaved = false;
    }

    private void sendScreenState(String sid) {
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            JSONObject o = new JSONObject();
            o.put("sessionId", sid == null ? "" : sid);
            o.put("screenOn", pm != null && pm.isInteractive());
            o.put("keyguardLocked", km != null && km.isKeyguardLocked());
            o.put("keyguardSecure", km != null && km.isKeyguardSecure());
            sendMsg("agent:screen_state", o);
        } catch (Exception ignore) { }
    }

    private void sendRotateStatus(boolean ok, boolean enabled, String reason) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", ok);
            o.put("enabled", enabled);
            o.put("reason", reason == null ? "" : reason);
            sendMsg("agent:screen_rotate_status", o);
        } catch (Exception ignore) { }
    }

    private boolean isAutoRotateEnabled() {
        try {
            return android.provider.Settings.System.getInt(getContentResolver(),
                    android.provider.Settings.System.ACCELEROMETER_ROTATION, 1) == 1;
        } catch (Exception ignore) { return true; }
    }

    private void sendAudioStatus(boolean ok, String reason) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", ok);
            o.put("enabled", audioRunning);
            o.put("reason", reason == null ? "" : reason);
            o.put("format", "pcm16");
            o.put("sampleRate", 16000);
            sendMsg("agent:audio_status", o);
        } catch (Exception ignore) { }
    }

    private void startSystemAudio() {
        if (audioRunning) { sendAudioStatus(true, ""); return; }
        if (Build.VERSION.SDK_INT < 29) { sendAudioStatus(false, "صوت النظام يتطلب Android 10 أو أحدث"); return; }
        if (!streamRunning) { sendAudioStatus(false, "stream is not running"); return; }
        if (activeProjection == null) { sendAudioStatus(false, "بث الشاشة غير نشط"); return; }
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            sendAudioStatus(false, "صلاحية تسجيل الصوت غير ممنوحة"); return;
        }
        try {
            android.media.AudioPlaybackCaptureConfiguration cfg =
                    new android.media.AudioPlaybackCaptureConfiguration.Builder(activeProjection)
                            .addMatchingUsage(android.media.AudioAttributes.USAGE_MEDIA)
                            .addMatchingUsage(android.media.AudioAttributes.USAGE_GAME)
                            .addMatchingUsage(android.media.AudioAttributes.USAGE_UNKNOWN)
                            .build();
            int rate = 16000;
            android.media.AudioFormat fmt = new android.media.AudioFormat.Builder()
                    .setEncoding(android.media.AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(rate)
                    .setChannelMask(android.media.AudioFormat.CHANNEL_IN_MONO)
                    .build();
            int min = android.media.AudioRecord.getMinBufferSize(rate,
                    android.media.AudioFormat.CHANNEL_IN_MONO,
                    android.media.AudioFormat.ENCODING_PCM_16BIT);
            int bufSize = Math.max(min, rate / 20 * 2);
            audioRecord = new android.media.AudioRecord.Builder()
                    .setAudioFormat(fmt)
                    .setBufferSizeInBytes(bufSize)
                    .setAudioPlaybackCaptureConfig(cfg)
                    .build();
            if (audioRecord.getState() != android.media.AudioRecord.STATE_INITIALIZED) {
                stopSystemAudio(); sendAudioStatus(false, "تعذر تهيئة تسجيل الصوت"); return;
            }
            audioRunning = true;
            audioRecord.startRecording();
            sendAudioStatus(true, "");
            MainActivity.log("🔊 بدء بث صوت النظام");
            audioThread = new Thread(() -> {
                byte[] buf = new byte[Math.max(1600, rate / 20 * 2)];
                while (audioRunning && audioRecord != null) {
                    try {
                        int n = audioRecord.read(buf, 0, buf.length);
                        if (n > 0) {
                            JSONObject o = new JSONObject();
                            o.put("sessionId", streamSessionId);
                            o.put("format", "pcm16");
                            o.put("sampleRate", rate);
                            o.put("channels", 1);
                            o.put("seq", audioSeq++);
                            o.put("ts", System.currentTimeMillis());
                            o.put("data", android.util.Base64.encodeToString(buf, 0, n, android.util.Base64.NO_WRAP));
                            sendMsg("agent:audio_chunk", o);
                        }
                    } catch (Exception ignore) { break; }
                }
            });
            audioThread.setDaemon(true);
            audioThread.start();
        } catch (Exception e) {
            stopSystemAudio();
            sendAudioStatus(false, String.valueOf(e.getMessage()));
        }
    }

    private void stopSystemAudio() {
        boolean was = audioRunning;
        audioRunning = false;
        try { if (audioRecord != null) audioRecord.stop(); } catch (Exception ignore) { }
        try { if (audioRecord != null) audioRecord.release(); } catch (Exception ignore) { }
        audioRecord = null;
        Thread th = audioThread; audioThread = null;
        if (th != null) th.interrupt();
        if (was) { sendAudioStatus(false, "متوقف"); MainActivity.log("🔇 إيقاف بث صوت النظام"); }
    }

    private void stopScreenStream(String sid) {
        if (sid.isEmpty() || sid.equals(streamSessionId)) stopScreenStreamRaw();
    }

    /** Rotation of the default display. */
    private int displayRotation() {
        try {
            DisplayManager dm = (DisplayManager) getSystemService(DISPLAY_SERVICE);
            android.view.Display d = dm != null ? dm.getDisplay(android.view.Display.DEFAULT_DISPLAY) : null;
            return d != null ? d.getRotation() : android.view.Surface.ROTATION_0;
        } catch (Exception ignore) { return android.view.Surface.ROTATION_0; }
    }

    /**
     * The edge the system bar sits on, for the current rotation: 1=top, 0=left, 2=right, 3=bottom.
     * The bar (and the cutout letterbox that follows it) rotates with the display, which is
     * exactly what the top-only crop of v3.8.22 missed: in landscape the band moved to the
     * left while the code kept looking at the top.
     */
    private int barEdge() {
        switch (displayRotation()) {
            case android.view.Surface.ROTATION_90:  return 0;   // bar on the left
            case android.view.Surface.ROTATION_180: return 3;   // bar at the bottom
            case android.view.Surface.ROTATION_270: return 2;   // bar on the right
            default:                                return 1;   // portrait: top
        }
    }

    /** Thickness the system reserves on that edge, in pixels. */
    private int barThickness(int edge) {
        int value = 0;
        try {
            int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
            if (id > 0) value = getResources().getDimensionPixelSize(id);
        } catch (Exception ignore) { }
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                android.view.WindowManager wm = (android.view.WindowManager) getSystemService(WINDOW_SERVICE);
                if (wm != null) {
                    android.view.DisplayCutout cut = wm.getCurrentWindowMetrics().getWindowInsets().getDisplayCutout();
                    if (cut != null) {
                        if (edge == 0) value = Math.max(value, cut.getSafeInsetLeft());
                        else if (edge == 1) value = Math.max(value, cut.getSafeInsetTop());
                        else if (edge == 2) value = Math.max(value, cut.getSafeInsetRight());
                        else value = Math.max(value, cut.getSafeInsetBottom());
                    }
                }
            } catch (Exception ignore) { }
        }
        return Math.max(0, value);
    }

    /**
     * Depth of the black band on ONE edge, or 0 when that edge carries real content.
     *
     * The system reports 72px while the actual letterbox on TKL4 is ~96px (status bar plus
     * the black padding above the app), so a single probe at the reported depth sees another
     * black row and gives up. The band is therefore walked: it must start dark for at least
     * minCandidate rows, then the first clearly brighter line marks where content begins.
     *
     * Guards: the band must be >=85% dark to count at all, the walk stops at a quarter of the
     * frame, and a band that never ends (a full black screen) is rejected as ambiguous.
     */
    private int measureBand(Bitmap frame, int edge, int minCandidate) {
        if (frame == null) return 0;
        final int w = frame.getWidth(), h = frame.getHeight();
        if (w <= 0 || h <= 0) return 0;
        final boolean column = (edge == 0 || edge == 2);
        final int depth = column ? w : h;
        final int span  = column ? h : w;
        final int start = Math.max(1, minCandidate);
        final int cap = Math.min(depth / 4, Math.max(start * 2, 160));
        if (start >= depth / 4) return 0;
        final int stepAlong = Math.max(1, span / 32);
        try {
            // 1) the innermost reported band must actually be dark
            int dark = 0, sampled = 0;
            long sum = 0; int n = 0;
            for (int d = 0; d < start; d += Math.max(1, start / 8)) {
                for (int sAlong = 0; sAlong < span; sAlong += stepAlong) {
                    final int x = column ? (edge == 0 ? d : w - 1 - d) : sAlong;
                    final int y = column ? sAlong : (edge == 1 ? d : h - 1 - d);
                    final int c = frame.getPixel(x, y);
                    final int lum = (((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff)) / 3;
                    sampled++;
                    sum += lum;
                    if (lum < 20) dark++;
                }
            }
            if (sampled == 0) return 0;
            if (dark < (int) (sampled * 0.85)) return 0;
            final double bandMean = (double) sum / sampled;

            // 2) find the first line that is clearly content, walking outwards
            for (int d = start; d < cap; d += 2) {
                long lineSum = 0; int lineN = 0;
                for (int sAlong = 0; sAlong < span; sAlong += stepAlong) {
                    final int x = column ? (edge == 0 ? d : w - 1 - d) : sAlong;
                    final int y = column ? sAlong : (edge == 1 ? d : h - 1 - d);
                    final int c = frame.getPixel(x, y);
                    lineSum += (((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff)) / 3;
                    lineN++;
                }
                if (lineN == 0) break;
                if ((double) lineSum / lineN >= bandMean + 12) return d;
            }
        } catch (Exception ignore) { return 0; }
        return 0;   // the band never ended inside the cap: leave the frame alone
    }

    /** Measures the band on the edge the system bar occupies; called once per orientation. */
    private void measureCrops(Bitmap frame) {
        final int edge = barEdge();
        final int candidate = barThickness(edge);
        final int found = measureBand(frame, edge, candidate);
        cropL = edge == 0 ? found : 0;
        cropT = edge == 1 ? found : 0;
        cropR = edge == 2 ? found : 0;
        cropB = edge == 3 ? found : 0;
        MainActivity.log("inset scan: edge=" + edge + " candidate=" + candidate + " crop l=" + cropL
                + " t=" + cropT + " r=" + cropR + " b=" + cropB
                + " frame " + (frame != null ? frame.getWidth() : 0) + "x" + (frame != null ? frame.getHeight() : 0));
    }

    private void handleScreenMouse(JSONObject payload) {
        try {
            String t = payload.optString("type", "");
            double rx = payload.optDouble("x", 0.0), ry = payload.optDouble("y", 0.0);
            DisplayMetrics dm = getResources().getDisplayMetrics();
            int mFullW = capW > 0 ? capW : dm.widthPixels, mFullH = capH > 0 ? capH : dm.heightPixels;
            int mw = Math.max(1, mFullW - cropL - cropR);
            int mh = Math.max(1, mFullH - cropT - cropB);
            int px = cropL + (int) Math.round(rx * mw);
            int py = cropT + (int) Math.round(ry * mh);
            JSONObject act = new JSONObject();
            if (t.equals("click")) { act.put("action", "click"); act.put("x", px); act.put("y", py); }
            else if (t.equals("dblclick")) { act.put("action", "dclick"); act.put("x", px); act.put("y", py); }
            else if (t.equals("wheel") || t.equals("scroll")) {
                int dy = payload.optInt("deltaY", 0);
                act.put("action", "scroll"); act.put("amount", dy >= 0 ? -3 : 3);
            }
            else if (t.equals("down")) { lastDownX = px; lastDownY = py; return; }
            else if (t.equals("up")) {
                if (lastDownX >= 0 && (Math.abs(px - lastDownX) > 20 || Math.abs(py - lastDownY) > 20)) {
                    act.put("action", "drag");
                    act.put("x", lastDownX); act.put("y", lastDownY);
                    act.put("x2", px); act.put("y2", py);
                } else {
                    act.put("action", "click"); act.put("x", px); act.put("y", py);
                }
                lastDownX = -1; lastDownY = -1;
            }
            else return;
            AiRemoteA11y.runSync(act);
        } catch (Exception ignore) { }
    }

    private void handleScreenKey(JSONObject payload) {
        try {
            String type = payload.optString("type", "press");
            if (!type.equals("press")) return;
            String key = payload.optString("key", "");
            if (key.isEmpty()) return;
            JSONObject act = new JSONObject();
            if (key.equals("Backspace")) act.put("action", "keyBackspace");
            else if (key.equals("Escape")) { act.put("action", "key"); act.put("key", "back"); }
            else if (key.equals("Enter")) act.put("action", "keyEnter");
            else if (key.equals("Close")) act.put("action", "closeapp");
            else if (key.length() == 1) { act.put("action", "append"); act.put("text", key); }
            else { act.put("action", "key"); act.put("key", key.toLowerCase()); }
            AiRemoteA11y.runSync(act);
        } catch (Exception ignore) { }
    }

    // ── v1.3.0 — capabilities refresh + host chat send ───────────────────────
    public void sendCapabilities() {
        try {
            JSONObject p = new JSONObject();
            p.put("capabilities", buildCapabilities());
            sendMsg("agent:capabilities_update", p);
            MainActivity.log("تم تحديث قدرات الجهاز على الخادم");
        } catch (Exception ignore) { }
    }

    public void sendScreenChat(String text) {
        try {
            JSONObject p = new JSONObject();
            p.put("sessionId", streamSessionId);
            p.put("text", String.valueOf(text));
            p.put("sender", "host");
            p.put("ts", System.currentTimeMillis());
            sendMsg("agent:screen_chat", p);
        } catch (Exception ignore) { }
    }

    @Override
    public void onDestroy() {
        if (INSTANCE == this) INSTANCE = null;
        INSTANCE = null;
        releaseAgentLocks();
        stopScreenStreamRaw();
        releaseProjection();
        stopAgent();
        super.onDestroy();
    }
}
