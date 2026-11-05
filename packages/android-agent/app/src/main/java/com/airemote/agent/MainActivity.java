package com.airemote.agent;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;

import java.util.Locale;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.function.Consumer;

/** v1.3.0 — full redesign: dark tabs UI matching the Windows agent. */
public class MainActivity extends Activity {

    private static final int REQ_CAPTURE = 1001;
    public static volatile MainActivity instance;
    public static volatile boolean foreground = false;

    /** 3.11.2 — حوار العرض كان يبقى معروضاً بعد انتهاء الجلسة فيحجب العارض (بلاغ مستخدم). */
    private static volatile AlertDialog offerDialog = null;
    private static volatile String offerSid = "";

    /** يُغلق حوار العرض؛ sid فارغ = أغلق أي حوار. */
    public static void dismissSessionOffer(final String sid) {
        UI.post(() -> {
            try {
                if (offerDialog == null) return;
                if (sid != null && !sid.isEmpty() && !sid.equals(offerSid)) return;
                offerDialog.dismiss();
                offerDialog = null;
                offerSid = "";
            } catch (Exception ignore) { }
        });
    }

    /** 3.9.0 — حوار موافقة داخل التطبيق (يُستدعى من AgentService على الخيط الرئيسي). */
    public void showSessionOffer(final JSONObject offer) {
        runOnUiThread(() -> {
            try {
                if (isFinishing()) return;
                JSONObject req = offer.optJSONObject("requester");
                String who = req != null ? req.optString("name", "جهاز") : "جهاز";
                String access = offer.optString("accessLabel", offer.optString("access"));
                final String sid = offer.optString("sessionId", "");
                // P4 — نفس جملة وكيل ويندوز حرفياً: «<الطالب> يطلب <الوصول> — المهلة N ثانية.»
                long expiresMs = offer.optLong("expiresInMs", 60000L);
                String secs = String.valueOf(Math.round(expiresMs / 1000.0));
                // حوار واحد فقط: أي عرض جديد يُغلق السابق
                dismissSessionOffer("");
                AlertDialog dlg = new AlertDialog.Builder(this)
                        .setTitle(getString(R.string.dlg_request))
                        .setMessage(getString(R.string.dlg_who, who, access, secs))
                        .setPositiveButton(getString(R.string.dlg_allow), (d, w) -> {
                            offerDialog = null; offerSid = "";
                            AgentService.sendSessionDecision(sid, true);
                        })
                        .setNegativeButton(getString(R.string.dlg_deny), (d, w) -> {
                            offerDialog = null; offerSid = "";
                            AgentService.sendSessionDecision(sid, false);
                        })
                        .setCancelable(true)
                        .create();
                dlg.show();
                offerDialog = dlg;
                offerSid = sid;
                // 3.11.2 — الحوار ظاهر الآن: أخفِ إشعار الطلب لتفادي عرضين لنفس الطلب.
                AgentService.cancelOfferNotification(sid);
                // إغلاق تلقائي بعد انتهاء المهلة حتى لا يبقى فوق العارض
                UI.postDelayed(() -> dismissSessionOffer(sid), expiresMs + 2000);
            } catch (Exception ignore) {}
        });
    }
    private static final Handler UI = new Handler(Looper.getMainLooper());
    private static final StringBuilder LOG = new StringBuilder();
    private static final StringBuilder AI_CHAT = new StringBuilder();
    private static final StringBuilder VIEWER_CHAT = new StringBuilder();

    private TextView tbState;
    private TextView statusTitle;
    private TextView statusSub;
    private TextView connServer;
    private TextView connDevinfo;
    private TextView connUptime;
    private TextView footerTarget;
    private TextView logView;
    private TextView aiList;
    private TextView aiStatus;
    private TextView chatList;
    private ScrollView aiScroll;
    private ScrollView chatScroll;
    private ScrollView logScroll;
    private EditText inpServer;
    private EditText inpToken;
    private EditText inpCtrlPw;
    private EditText aiInput;
    private EditText chatInput;
    private ProgressBar barCpu, barRam, barDisk;
    private TextView pctCpu, pctRam, pctDisk;

    private final TextView[] tabs = new TextView[4];
    private final View[] panes = new View[4];
    private int activeTab = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Prefs.bootstrap(this);
        instance = this;
        applySavedNightMode();
        setContentView(R.layout.activity_main);
        setupThemeToggle();
        setupLangToggle();
        // v3.8.3 - version labels must follow BuildConfig, never a hardcoded string
        TextView verTop = findViewById(R.id.tv_ver_top);
        if (verTop != null) verTop.setText("v" + com.airemote.agent.BuildConfig.VERSION_NAME);
        TextView verBottom = findViewById(R.id.tv_ver_bottom);
        if (verBottom != null) verBottom.setText("v" + com.airemote.agent.BuildConfig.VERSION_NAME + " · AiRemote Agent");
        hideSystemUi();

        // v3.5 — file manager needs storage access on Android 9 and below
        try {
            if (android.os.Build.VERSION.SDK_INT <= 28 &&
                checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                    android.Manifest.permission.WRITE_EXTERNAL_STORAGE,
                    android.Manifest.permission.READ_EXTERNAL_STORAGE
                }, 77);
            }
        } catch (Exception ignore) { }

        tbState = findViewById(R.id.tb_state);
        statusTitle = findViewById(R.id.status_title);
        statusSub = findViewById(R.id.status_sub);
        connServer = findViewById(R.id.conn_server);
        connDevinfo = findViewById(R.id.conn_devinfo);
        connUptime = findViewById(R.id.conn_uptime);
        footerTarget = findViewById(R.id.footer_target);
        logView = findViewById(R.id.log_view);
        aiList = findViewById(R.id.ai_list);
        aiStatus = findViewById(R.id.ai_status);
        chatList = findViewById(R.id.chat_list);
        aiScroll = findViewById(R.id.ai_scroll);
        chatScroll = findViewById(R.id.chat_scroll);
        logScroll = findViewById(R.id.log_scroll);
        inpServer = findViewById(R.id.inp_server);
        inpToken = findViewById(R.id.inp_token);
        inpCtrlPw = findViewById(R.id.inp_ctrl_pw);
        aiInput = findViewById(R.id.ai_input);
        chatInput = findViewById(R.id.chat_input);
        barCpu = findViewById(R.id.bar_cpu);
        barRam = findViewById(R.id.bar_ram);
        barDisk = findViewById(R.id.bar_disk);
        pctCpu = findViewById(R.id.pct_cpu);
        pctRam = findViewById(R.id.pct_ram);
        pctDisk = findViewById(R.id.pct_disk);

        // 3.9.4 — بطاقة «الأجهزة» لبدء جلسة وكيل↔وكيل من الهاتف نفسه.
        buildDevicesCard();

        tabs[0] = findViewById(R.id.tab_status);
        tabs[1] = findViewById(R.id.tab_ai);
        tabs[2] = findViewById(R.id.tab_chat);
        tabs[3] = findViewById(R.id.tab_log);
        panes[0] = findViewById(R.id.pane_status);
        panes[1] = findViewById(R.id.pane_ai);
        panes[2] = findViewById(R.id.pane_chat);
        panes[3] = findViewById(R.id.pane_log);

        for (int i = 0; i < 4; i++) {
            final int idx = i;
            tabs[i].setOnClickListener(v -> selectTab(idx));
        }
        selectTab(0);

        inpServer.setText(Prefs.server(this));
        inpToken.setText(Prefs.token(this));
        footerTarget.setText(Prefs.server(this));

        findViewById(R.id.btn_start).setOnClickListener(v -> startAgent());
        findViewById(R.id.btn_stop).setOnClickListener(v -> stopAgent());
        findViewById(R.id.btn_save).setOnClickListener(v -> saveSettings());
        findViewById(R.id.btn_del_pw).setOnClickListener(v -> deleteControlPassword());
        findViewById(R.id.btn_setup).setOnClickListener(v -> startActivity(new Intent(this, SetupActivity.class)));
        findViewById(R.id.btn_clear_log).setOnClickListener(v -> { LOG.setLength(0); logView.setText("—"); });

        aiInput.setOnEditorActionListener((v, actionId, event) -> { sendAiMessage(); return true; });
        findViewById(R.id.ai_send).setOnClickListener(v -> sendAiMessage());
        chatInput.setOnEditorActionListener((v, actionId, event) -> { sendViewerMessage(); return true; });
        findViewById(R.id.chat_send).setOnClickListener(v -> sendViewerMessage());

        log("وكيل الأندرويد جاهز — الإصدار " + com.airemote.agent.BuildConfig.VERSION_NAME);
        if (!AgentService.isRunning() && !Prefs.token(this).isEmpty()) UI.postDelayed(this::startAgent, 900);
        // 3.11.2 — طلب الإذن تلقائياً صار مقيّداً: مرة كل 6 ساعات، ولا يُطلب أثناء فتح جلسة عرض
        // (كان يظهر فوق العارض في كل تشغيل ويحجب الشاشة).
        if (!CaptureHolder.ready() && !SessionWebViewActivity.isOpen) {
            long lastAsk = Prefs.sp(this).getLong("cap_ask_at", 0L);
            if (System.currentTimeMillis() - lastAsk > 6L * 3600L * 1000L) {
                Prefs.sp(this).edit().putLong("cap_ask_at", System.currentTimeMillis()).apply();
                UI.postDelayed(this::requestCapture, 1600);
            }
        }
        // 3.11.3 — خدمة الوصول شرط تنفيذ الإدخال ولا يمكن تفعيلها برمجياً (قيد Android).
        // إشعار دائم يفتح إعدادات الوصول مباشرة، بدل تنبيه عابر يضيع.
        if (AiRemoteA11y.I == null) UI.postDelayed(this::notifyA11yMissing, 2400);

        Intent it = getIntent();
        handleExtras(it);
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 77);
        }
        if (android.os.Build.VERSION.SDK_INT >= 29 &&
                checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 78);
        }
    }

    private void handleExtras(Intent it) {
        if (it == null) return;
        String srv = it.getStringExtra("server");
        String tok = it.getStringExtra("token");
        if (srv != null) inpServer.setText(srv);
        if (tok != null) inpToken.setText(tok);
        if (srv != null || tok != null) Prefs.save(this, inpServer.getText().toString().trim(), inpToken.getText().toString().trim());
        String cpw = it.getStringExtra("ctrlPassword");
        if (cpw != null && !cpw.trim().isEmpty()) {
            inpCtrlPw.setText(cpw);
            Prefs.saveControlPassword(this, cpw);
        }
        footerTarget.setText(Prefs.server(this));
        // 3.11.2 — طلب اتصال وصل والتطبيق في الخلفية: يُفتح بالحوار فوراً.
        String offerJson = it.getStringExtra("offerJson");
        if (offerJson != null && !offerJson.isEmpty()) {
            it.removeExtra("offerJson");
            try {
                final JSONObject off = new JSONObject(offerJson);
                UI.postDelayed(() -> showSessionOffer(off), 500);
            } catch (Exception ignore) { }
        }
        if (it.getBooleanExtra("autostart", false)) {
            UI.postDelayed(this::startAgent, 500);
            it.removeExtra("autostart");
        }
        if (it.getBooleanExtra("requestCapture", false)) {
            UI.postDelayed(this::requestCapture, 900);
            it.removeExtra("requestCapture");
        }
        setIntent(it);
        if (it.getBooleanExtra("openChat", false)) UI.postDelayed(() -> selectTab(2), 350);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleExtras(intent);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    /** v3.5 — full-screen agent UI like the Windows viewer (swipe to reveal bars). */
    private void hideSystemUi() {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                getWindow().setDecorFitsSystemWindows(false);
                android.view.WindowInsetsController c = getWindow().getInsetsController();
                if (c != null) {
                    c.hide(android.view.WindowInsets.Type.statusBars() | android.view.WindowInsets.Type.navigationBars());
                    c.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                        android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                | android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                                | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                | android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            }
        } catch (Exception ignore) { }
    }

    @Override
    protected void onResume() {
        super.onResume();
        foreground = true;
        refreshConnectionStatus();
        if (AgentService.isRunning() && !AgentService.isConnected()) {
            AgentService.restartNow();
        }
    }

    /** إشعار دائم «التحكّم معطّل» يفتح إعدادات خدمة الوصول مباشرة. */
    private void notifyA11yMissing() {
        try {
            android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= 26) {
                android.app.NotificationChannel ch = new android.app.NotificationChannel(
                        "setup_v1", "التهيئة والصلاحيات", android.app.NotificationManager.IMPORTANCE_DEFAULT);
                nm.createNotificationChannel(ch);
            }
            Intent open = new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= android.app.PendingIntent.FLAG_IMMUTABLE;
            android.app.PendingIntent pi = android.app.PendingIntent.getActivity(this, 9001, open, flags);
            android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new android.app.Notification.Builder(this, "setup_v1")
                    : new android.app.Notification.Builder(this);
            b.setContentTitle("التحكّم معطّل على هذا الجهاز")
                    .setContentText("خدمة الوصول غير مفعّلة — اضغط لتفعيل AiRemote ليعمل التحكّم")
                    .setSmallIcon(android.R.drawable.stat_notify_error)
                    .setContentIntent(pi)
                    .setOngoing(true)
                    .setAutoCancel(false);
            nm.notify(9001, b.build());
        } catch (Exception ignore) { }
    }

    private void refreshConnectionStatus() {
        if (AgentService.isConnected()) {
            setStatus(getString(R.string.state_online) + " ✓", true);
        } else if (AgentService.isRunning()) {
            setStatus("جارٍ الاتصال…", false);
        } else {
            setStatus("متوقف", false);
        }
    }


    @Override
    protected void onPause() { foreground = false; super.onPause(); }

    // ── Tabs ────────────────────────────────────────────────────────────────
    private void selectTab(int idx) {
        activeTab = idx;
        for (int i = 0; i < 4; i++) {
            boolean on = i == idx;
            tabs[i].setBackgroundResource(on ? R.drawable.tab_active : R.drawable.btn_ghost);
            tabs[i].setTextColor(on ? 0xFFF1F5F9 : 0xFF94A3B8);
            panes[i].setVisibility(on ? View.VISIBLE : View.GONE);
        }
        if (idx == 3) logScroll.post(() -> logScroll.fullScroll(View.FOCUS_DOWN));
        if (idx == 1) aiScroll.post(() -> aiScroll.fullScroll(View.FOCUS_DOWN));
        if (idx == 2) chatScroll.post(() -> chatScroll.fullScroll(View.FOCUS_DOWN));
    }

    // ── Settings ────────────────────────────────────────────────────────────
    private void saveSettings() {
        String srv = inpServer.getText().toString().trim();
        String tok = inpToken.getText().toString().trim();
        if (srv.isEmpty() || tok.isEmpty()) { toast("أدخل عنوان الخادم والرمز"); return; }
        Prefs.save(this, srv, tok);
        footerTarget.setText(srv);
        String pw = inpCtrlPw.getText().toString().trim();
        if (!pw.isEmpty()) Prefs.saveControlPassword(this, pw);
        AgentService svc = AgentService.INSTANCE;
        if (svc != null) svc.sendCapabilities();
        toast("تم حفظ الإعدادات" + (pw.isEmpty() ? "" : " وكلمة المرور"));
        log("حُفظت الإعدادات — كلمة مرور التحكم: " + (Prefs.hasControlPassword(this) ? "مفعّلة" : "غير مفعّلة"));
    }

    private void deleteControlPassword() {
        Prefs.saveControlPassword(this, "");
        inpCtrlPw.setText("");
        AgentService svc = AgentService.INSTANCE;
        if (svc != null) svc.sendCapabilities();
        toast("حُذفت كلمة المرور — الآن تتم الموافقة يدوياً على الجهاز");
        log("حُذفت كلمة مرور التحكم");
    }

    // ── Agent control ───────────────────────────────────────────────────────
    private void startAgent() {
        android.util.Log.d("AiRemoteAgent", "MainActivity.startAgent");
        ensureBatteryExemption();
        String srv = inpServer.getText().toString().trim();
        String tok = inpToken.getText().toString().trim();
        if (srv.isEmpty() || tok.isEmpty()) { toast("أدخل عنوان الخادم والرمز أولاً"); return; }
        Prefs.save(this, srv, tok);
        footerTarget.setText(srv);
        String pw = inpCtrlPw.getText().toString().trim();
        if (!pw.isEmpty() && !Prefs.hasControlPassword(this)) Prefs.saveControlPassword(this, pw);
        Intent svc = new Intent(this, AgentService.class);
        svc.setAction(AgentService.ACTION_START);
        svc.putExtra("manual", true);
        if (android.os.Build.VERSION.SDK_INT >= 26) startForegroundService(svc); else startService(svc);
        setStatus("جارٍ الاتصال…", false);
        log("بدأ الوكيل → " + srv);
    }

    /** Ask once for exemption from Doze/OEM battery killing. A user tap is
     *  required by Android; without it the OS may freeze the agent and drop
     *  Wi-Fi while the screen is off, so remote wake cannot arrive. */
    private void ensureBatteryExemption() {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 23) {
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    android.content.Intent i = new android.content.Intent(
                            android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            android.net.Uri.parse("package:" + getPackageName()));
                    startActivity(i);
                }
            }
        } catch (Exception ignore) { }
    }

    private void stopAgent() {
        Intent svc = new Intent(this, AgentService.class);
        svc.setAction(AgentService.ACTION_STOP);
        startService(svc);
        setStatus("متوقف", false);
        log("أُوقف الوكيل");
    }

    /** Open TECNO's Auto-start/background manager. Hiber can freeze a
     *  foreground service and destroy its WebSocket unless this app is
     *  explicitly allowed; the setting is OEM-specific and needs one user tap. */
    private void openBackgroundSettings() {
        try {
            android.content.Intent i = new android.content.Intent();
            i.setClassName("com.transsion.phonemaster", "com.cyin.himgr.autostart.AutoStartActivity");
            startActivity(i);
        } catch (Exception e) {
            try {
                android.content.Intent i = new android.content.Intent(
                        android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        android.net.Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } catch (Exception ignore) { toast("افتح إعدادات البطارية واسمح للتطبيق بالعمل في الخلفية"); }
        }
    }

    private void openWriteSettings() {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 23) {
                android.content.Intent i = new android.content.Intent(
                        android.provider.Settings.ACTION_MANAGE_WRITE_SETTINGS,
                        android.net.Uri.parse("package:" + getPackageName()));
                startActivity(i);
            }
        } catch (Exception ignore) { toast("افتح إعدادات النظام واسمح بتعديل الإعدادات"); }
    }

    private void openDeviceAdmin() {
        try {
            android.app.admin.DevicePolicyManager dpm = (android.app.admin.DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
            android.content.ComponentName admin = new android.content.ComponentName(this, AiRemoteAdmin.class);
            if (dpm != null && !dpm.isAdminActive(admin)) {
                android.content.Intent i = new android.content.Intent(android.app.admin.DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
                i.putExtra(android.app.admin.DevicePolicyManager.EXTRA_DEVICE_ADMIN, admin);
                i.putExtra(android.app.admin.DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                        "يُستخدم لإطفاء شاشة الجهاز أثناء البث فقط.");
                startActivity(i);
            } else {
                toast("إدارة الجهاز مفعّلة بالفعل");
            }
        } catch (Exception ignore) { toast("تعذر فتح إدارة الجهاز"); }
    }

    private void requestCapture() {
        try {
            MediaProjectionManager mgr = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
            startActivityForResult(mgr.createScreenCaptureIntent(), REQ_CAPTURE);
        } catch (Exception e) { log("تعذر طلب إذن الالتقاط: " + e.getMessage()); }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_CAPTURE) {
            if (resultCode == RESULT_OK && data != null) {
                CaptureHolder.resultCode = resultCode;
                CaptureHolder.data = data;
                log("منح إذن التقاط الشاشة ✓");
                try { if (AgentService.INSTANCE != null) AgentService.INSTANCE.sendCapabilities(); } catch (Exception ignore) { }
            } else {
                log("رُفض إذن التقاط الشاشة");
            }
        }
    }

    // ── AI chat (server-backed, device token) ───────────────────────────────
    private void sendAiMessage() {
        final String text = aiInput.getText().toString().trim();
        if (text.isEmpty()) return;
        aiInput.setText("");
        appendAi("\nأنت: " + text + "\n");
        aiStatus.setText(getString(R.string.ai_thinking));
        new Thread(() -> {
            String reply = "";
            try {
                String base = Prefs.server(this).replace("wss://", "https://").replace("ws://", "http://").replaceAll("/+$", "").replaceAll("/ws(\\?.*)?$", "");
                String tok = Prefs.token(this);
                JSONObject body = new JSONObject();
                body.put("message", text);
                URL u = new URL(base + "/api/ai/chat");
                HttpURLConnection c = (HttpURLConnection) u.openConnection();
                c.setRequestMethod("POST");
                c.setRequestProperty("Content-Type", "application/json");
                c.setRequestProperty("X-Device-Token", tok);
                c.setConnectTimeout(15000);
                c.setReadTimeout(120000);
                c.setDoOutput(true);
                OutputStream os = c.getOutputStream();
                os.write(body.toString().getBytes("UTF-8"));
                os.close();
                int code = c.getResponseCode();
                BufferedReader r = new BufferedReader(new InputStreamReader(code >= 400 ? c.getErrorStream() : c.getInputStream(), "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
                r.close();
                try {
                    JSONObject j = new JSONObject(sb.toString());
                    reply = j.optString("response", j.optString("error", "خطأ غير معروف"));
                } catch (Exception e) { reply = sb.length() > 0 ? sb.toString() : ("HTTP " + code); }
            } catch (Exception e) { reply = "تعذر الاتصال: " + e.getMessage(); }
            final String out = reply;
            UI.post(() -> { appendAi(getString(R.string.ai_prefix) + out + "\n"); aiStatus.setText(""); });
        }).start();
    }

    // ── 3.9.4: الأجهزة وطلب التحكم (وكيل ↔ وكيل) ─────────────────────────────
    private TextView devState;
    // P3 — قائمة منسدلة واحدة بدل صفوف: اختيار جهاز + مستوى وصول + كلمة مرور عند الحاجة.
    private android.widget.Spinner devSpinner;
    private android.widget.ArrayAdapter<String> devAdapter;
    private final java.util.List<String> devLabels = new java.util.ArrayList<>();
    private final java.util.List<String> devIds = new java.util.ArrayList<>();
    private android.widget.RadioGroup devAccess;
    private android.widget.EditText devPw;
    private int devPendingSeq = 0;
    // P4 — قسم «الجلسات» بنفس مفردات وكيل ويندوز.
    private LinearLayout sesRows;
    private TextView sesState;

    private String apiBase() {
        try {
            String s = Prefs.server(this).trim();
            if (s.startsWith("wss://")) s = "https://" + s.substring(6);
            else if (s.startsWith("ws://")) s = "http://" + s.substring(5);
            int i = s.indexOf("/ws");
            if (i > 0) s = s.substring(0, i);
            while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
            return s;
        } catch (Exception e) { return null; }
    }

    private int dp(float v) { return Math.round(getResources().getDisplayMetrics().density * v); }

    private void buildDevicesCard() {
        try {
            android.widget.ScrollView sv = findViewById(R.id.pane_status);
            if (sv == null || sv.getChildCount() == 0) return;
            LinearLayout root = (LinearLayout) sv.getChildAt(0);

            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setBackgroundResource(R.drawable.card_bg);
            card.setPadding(dp(12), dp(12), dp(12), dp(12));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.bottomMargin = dp(8);
            card.setLayoutParams(lp);

            TextView title = new TextView(this);
            title.setText(getString(R.string.dev_title));
            title.setTextColor(0xFF93C5FD);
            title.setTextSize(13);
            title.setTypeface(null, android.graphics.Typeface.BOLD);
            card.addView(title);

            devState = new TextView(this);
            devState.setText(getString(R.string.dev_hint));
            devState.setTextColor(0xFF94A3B8);
            devState.setTextSize(12);
            devState.setPadding(0, dp(4), 0, dp(6));
            card.addView(devState);

            devSpinner = new android.widget.Spinner(this);
            devSpinner.setBackgroundResource(R.drawable.card_bg);
            devAdapter = new android.widget.ArrayAdapter<>(this, android.R.layout.simple_spinner_item, devLabels);
            devAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
            devSpinner.setAdapter(devAdapter);
            card.addView(devSpinner);

            devAccess = new android.widget.RadioGroup(this);
            devAccess.setOrientation(LinearLayout.HORIZONTAL);
            String[][] opts = {{"view", getString(R.string.access_view)}, {"control", getString(R.string.access_control)}, {"files", getString(R.string.access_files)}};
            for (int i = 0; i < opts.length; i++) {
                android.widget.RadioButton rb = new android.widget.RadioButton(this);
                rb.setId(1000 + i);
                rb.setText(opts[i][1]);
                rb.setTextSize(12);
                rb.setTextColor(0xFFE2E8F0);
                rb.setTag(opts[i][0]);
                devAccess.addView(rb);
                if (i == 1) rb.setChecked(true);
            }
            card.addView(devAccess);

            devPw = new android.widget.EditText(this);
            devPw.setHint("كلمة مرور الجهاز (إن لزمت)");
            devPw.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
            devPw.setTextSize(12);
            devPw.setVisibility(View.GONE);
            card.addView(devPw);

            LinearLayout btns = new LinearLayout(this);
            btns.setOrientation(LinearLayout.HORIZONTAL);
            Button refresh = new Button(this);
            refresh.setText(getString(R.string.btn_refresh));
            refresh.setAllCaps(false);
            refresh.setOnClickListener(v -> loadDevices());
            btns.addView(refresh);
            Button send = new Button(this);
            send.setText(getString(R.string.btn_request));
            send.setAllCaps(false);
            send.setOnClickListener(v -> sendRequest());
            btns.addView(send);
            card.addView(btns);

            LinearLayout sesCard = new LinearLayout(this);
            sesCard.setOrientation(LinearLayout.VERTICAL);
            sesCard.setBackgroundResource(R.drawable.card_bg);
            sesCard.setPadding(dp(12), dp(12), dp(12), dp(12));
            LinearLayout.LayoutParams slp2 = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            slp2.bottomMargin = dp(8);
            sesCard.setLayoutParams(slp2);

            TextView sTitle = new TextView(this);
            sTitle.setText(getString(R.string.ses_title));
            sTitle.setTextColor(0xFF93C5FD);
            sTitle.setTextSize(13);
            sTitle.setTypeface(null, android.graphics.Typeface.BOLD);
            sesCard.addView(sTitle);

            sesState = new TextView(this);
            sesState.setText(getString(R.string.ses_loading));
            sesState.setTextColor(0xFF94A3B8);
            sesState.setTextSize(12);
            sesState.setPadding(0, dp(4), 0, dp(6));
            sesCard.addView(sesState);

            sesRows = new LinearLayout(this);
            sesRows.setOrientation(LinearLayout.VERTICAL);
            sesCard.addView(sesRows);

            Button sRefresh = new Button(this);
            sRefresh.setText(getString(R.string.btn_refresh_ses));
            sRefresh.setAllCaps(false);
            sRefresh.setOnClickListener(v -> loadSessions());
            sesCard.addView(sRefresh);

            root.addView(sesCard, 1);
            root.addView(card, 0);
            loadDevices();
            loadSessions();
        } catch (Exception ignore) { }
    }

    private void loadDevices() {
        final String base = apiBase();
        final String tok = Prefs.token(this);
        if (base == null || tok == null || tok.isEmpty()) {
            if (devState != null) devState.setText(getString(R.string.dev_not_setup));
            return;
        }
        if (devState != null) devState.setText(getString(R.string.dev_loading));
        devLabels.clear();
        devIds.clear();
        if (devAdapter != null) devAdapter.notifyDataSetChanged();
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(base + "/api/relay/devices").openConnection();
                c.setRequestProperty("X-Device-Token", tok);
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                int code = c.getResponseCode();
                BufferedReader r = new BufferedReader(new InputStreamReader(code >= 400 ? c.getErrorStream() : c.getInputStream(), "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
                r.close();
                if (code != 200) throw new Exception("HTTP " + code + " " + sb);
                JSONObject j = new JSONObject(sb.toString());
                final JSONArray arr = j.optJSONArray("devices");
                UI.post(() -> renderDevices(arr));
            } catch (Exception e) {
                final String msg = e.getMessage();
                UI.post(() -> { if (devState != null) devState.setText(getString(R.string.dev_error, msg)); });
            }
        }).start();
    }

    private void loadSessions() {
        final String base = apiBase();
        final String tok = Prefs.token(this);
        if (base == null || tok == null || tok.isEmpty()) {
            if (sesState != null) sesState.setText(getString(R.string.dev_not_setup2));
            return;
        }
        if (sesState != null) sesState.setText(getString(R.string.ses_loading));
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(base + "/api/relay/sessions").openConnection();
                c.setRequestProperty("X-Device-Token", tok);
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                int code = c.getResponseCode();
                BufferedReader r = new BufferedReader(new InputStreamReader(code >= 400 ? c.getErrorStream() : c.getInputStream(), "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
                r.close();
                if (code != 200) throw new Exception("HTTP " + code);
                JSONObject j = new JSONObject(sb.toString());
                final JSONArray arr = j.optJSONArray("sessions");
                UI.post(() -> renderSessions(arr));
            } catch (Exception e) {
                final String m = "تعذّر جلب الجلسات: " + e.getMessage();
                UI.post(() -> { if (sesState != null) sesState.setText(m); });
            }
        }).start();
    }

    private void renderSessions(JSONArray arr) {
        if (sesRows == null) return;
        sesRows.removeAllViews();
        int n = arr == null ? 0 : arr.length();
        int shown = 0;
        for (int i = 0; i < n; i++) {
            JSONObject s = arr.optJSONObject(i);
            if (s == null) continue;
            String state = s.optString("state", "");
            if (!("requested".equals(state) || "active".equals(state) || "suspended".equals(state))) continue;
            // السيرفر يعيد حقولاً مسطّحة (requesterName/targetName) لا كائناً متداخلاً.
            String who = s.optString("requesterName", "جهاز");
            String to = s.optString("targetName", s.optString("targetDeviceId", ""));
            String acc = s.optString("access", "");
            String accLabel = "view".equals(acc) ? "عرض" : ("control".equals(acc) ? "تحكم" : ("files".equals(acc) ? "ملفات" : acc));
            String stLabel = "requested".equals(state) ? "بانتظار الموافقة" : ("active".equals(state) ? "نشطة" : "معلّقة");
            final String rowSid = s.optString("id", "");
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(android.view.Gravity.CENTER_VERTICAL);
            TextView tv = new TextView(this);
            tv.setText(who + " ← " + to + " · " + accLabel + " · " + stLabel);
            tv.setTextSize(12);
            tv.setTextColor(0xFFE2E8F0);
            tv.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            row.addView(tv);
            // 3.11.4 — قطع قسري للجلسة من الوكيل (كانت تعلق فتمنع إنشاء جلسة جديدة).
            Button cut = new Button(this);
            cut.setText(getString(R.string.btn_cut));
            cut.setAllCaps(false);
            cut.setTextSize(11);
            cut.setOnClickListener(v -> closeSessionById(rowSid));
            row.addView(cut);
            sesRows.addView(row);
            shown++;
        }
        if (sesState != null) sesState.setText(shown == 0 ? getString(R.string.ses_none) : getString(R.string.ses_count, shown));
    }

    private void closeSessionById(final String sid) {
        if (sid == null || sid.isEmpty()) return;
        final String base = apiBase();
        final String tok = Prefs.token(this);
        if (base == null || tok == null || tok.isEmpty()) return;
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(base + "/api/relay/" + sid + "/close").openConnection();
                c.setRequestMethod("POST");
                c.setRequestProperty("Content-Type", "application/json");
                c.setRequestProperty("X-Device-Token", tok);
                c.setDoOutput(true);
                OutputStream os = c.getOutputStream();
                os.write("{\"reason\":\"android_force\"}".getBytes("UTF-8"));
                os.close();
                c.getResponseCode();
                UI.post(() -> { toast("أُغلقت الجلسة"); loadSessions(); });
            } catch (Exception e) {
                UI.post(() -> toast("تعذّر إغلاق الجلسة"));
            }
        }).start();
    }

    private void renderDevices(JSONArray arr) {
        devLabels.clear();
        devIds.clear();
        int n = arr == null ? 0 : arr.length();
        for (int i = 0; i < n; i++) {
            JSONObject d = arr.optJSONObject(i);
            if (d == null) continue;
            String id = d.optString("id");
            String name = d.optString("name", "جهاز");
            boolean online = d.optBoolean("online", false);
            String platform = d.optString("platform", "");
            String kind = "android".equals(platform) ? "أندرويد" : ("windows".equals(platform) ? "ويندوز" : "");
            // P5-fix — أظهر أن الجهاز داخل جلسة وكيل↔وكيل الآن.
            String ses = "active".equals(d.optString("session")) ? "  · في جلسة"
                    : ("requested".equals(d.optString("session")) ? "  · طلب معلّق" : "");
            devLabels.add(name + (kind.isEmpty() ? "" : " · " + kind) + (online ? "  ● " + getString(R.string.state_online) : "  ○ " + getString(R.string.state_offline)) + ses);
            devIds.add(id);
        }
        if (devAdapter != null) devAdapter.notifyDataSetChanged();
        if (devState != null) {
            devState.setText(n == 0
                    ? "لا توجد أجهزة أخرى في حسابك."
                    : (getString(R.string.dev_pick_hint, n)));
        }
    }

    private void sendRequest() {
        int pos = devSpinner == null ? -1 : devSpinner.getSelectedItemPosition();
        if (pos < 0 || pos >= devIds.size()) { toast(getString(R.string.dev_pick_first)); return; }
        String access = "view";
        try {
            int sel = devAccess == null ? -1 : devAccess.getCheckedRadioButtonId();
            android.widget.RadioButton rb = sel >= 0 && devAccess != null ? devAccess.findViewById(sel) : null;
            if (rb != null && rb.getTag() != null) access = String.valueOf(rb.getTag());
        } catch (Exception ignore) { }
        String pw = devPw == null ? "" : devPw.getText().toString().trim();
        requestControl(devIds.get(pos), devLabels.get(pos), access, pw);
    }

    private void requestControl(final String targetId, final String targetName, final String access, final String password) {
        final String base = apiBase();
        final String tok = Prefs.token(this);
        if (base == null || tok == null || tok.isEmpty()) { toast("الوكيل غير مهيّأ"); return; }
        // النصوص تطابق وكيل ويندوز حرفياً (P3): نفس الحالات ونفس الترتيب.
        if (devState != null) devState.setText(getString(R.string.ses_sending));
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("targetDeviceId", targetId);
                body.put("access", access);
                if (password != null && !password.isEmpty()) body.put("password", password);
                HttpURLConnection c = (HttpURLConnection) new URL(base + "/api/relay/request").openConnection();
                c.setRequestMethod("POST");
                c.setRequestProperty("Content-Type", "application/json");
                c.setRequestProperty("X-Device-Token", tok);
                c.setConnectTimeout(8000);
                c.setReadTimeout(10000);
                c.setDoOutput(true);
                OutputStream os = c.getOutputStream();
                os.write(body.toString().getBytes("UTF-8"));
                os.close();
                int code = c.getResponseCode();
                BufferedReader r = new BufferedReader(new InputStreamReader(code >= 400 ? c.getErrorStream() : c.getInputStream(), "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
                r.close();
                String js = sb.toString();
                String errCode = "";
                try { errCode = new JSONObject(js).optString("code", ""); } catch (Exception ignore) { }
                String msg;
                boolean askPw = false;
                if (code == 201) {
                    msg = "بانتظار موافقة الطرف الآخر (60 ثانية)…";
                } else if (code == 403 && ("password_required".equals(errCode) || errCode.isEmpty())) {
                    msg = "هذا الجهاز في وضع كلمة المرور.";
                    askPw = true;
                } else if (code == 409) {
                    msg = "تعذّر الطلب: session_exists";
                } else if (code == 503) {
                    msg = "تعذّر الطلب: device_offline";
                } else if (code == 403) {
                    msg = "تعذّر الطلب: forbidden";
                } else {
                    msg = "تعذّر الطلب: " + (errCode.isEmpty() ? ("HTTP " + code) : errCode);
                }
                final String out = msg;
                final boolean showPw = askPw;
                final boolean pendingNow = (code == 201);
                // P3 — مهلة الطلب 60 ثانية كما في وكيل ويندوز، مع إبطال المؤقّت عند أي نتيجة لاحقة.
                final int mySeq = ++devPendingSeq;
                UI.post(() -> {
                    if (devState != null) devState.setText(out);
                    if (devPw != null && showPw) devPw.setVisibility(View.VISIBLE);
                    if (pendingNow) {
                        UI.postDelayed(() -> {
                            if (devState != null && devPendingSeq == mySeq) devState.setText(getString(R.string.ses_timeout));
                        }, 60000);
                    }
                });
            } catch (Exception e) {
                final String msg = "تعذّر الطلب: " + e.getMessage();
                UI.post(() -> { if (devState != null) devState.setText(msg); });
            }
        }).start();
    }

    private void appendAi(String s) {
        AI_CHAT.append(s);
        if (AI_CHAT.length() > 12000) AI_CHAT.delete(0, AI_CHAT.length() - 12000);
        aiList.setText(AI_CHAT.toString());
        aiScroll.post(() -> aiScroll.fullScroll(View.FOCUS_DOWN));
    }

    // ── Viewer chat ─────────────────────────────────────────────────────────
    private void sendViewerMessage() {
        String text = chatInput.getText().toString().trim();
        if (text.isEmpty()) return;
        AgentService svc = AgentService.INSTANCE;
        if (svc == null) { toast("ابدأ الوكيل أولاً"); return; }
        svc.sendScreenChat(text);
        appendViewer("أنت (المضيف): " + text);
        chatInput.setText("");
    }

    private void appendViewer(String line) {
        VIEWER_CHAT.append(line).append('\n');
        if (VIEWER_CHAT.length() > 12000) VIEWER_CHAT.delete(0, VIEWER_CHAT.length() - 12000);
        chatList.setText(VIEWER_CHAT.toString());
        chatScroll.post(() -> chatScroll.fullScroll(View.FOCUS_DOWN));
    }

    static void viewerChat(String sender, String text) {
        UI.post(() -> {
            MainActivity a = instance;
            if (a != null) a.appendViewer((sender == null ? "مشاهد" : sender) + ": " + text);
        });
    }

    // ── Consent dialog (no-password mode) ───────────────────────────────────
    public static boolean visibleNow() {
        MainActivity a = instance;
        return a != null && foreground;
    }

    public static void askConsent(final String requester, final Consumer<Boolean> cb) {
        UI.post(() -> {
            MainActivity a = instance;
            if (a == null) { cb.accept(false); return; }
            try {
                new AlertDialog.Builder(a)
                    .setTitle(a.getString(R.string.dlg_title))
                    .setMessage(a.getString(R.string.dlg_body, requester == null ? a.getString(R.string.dlg_someone) : requester))
                    .setPositiveButton(a.getString(R.string.dlg_allow2), (d, w) -> cb.accept(true))
                    .setNegativeButton(a.getString(R.string.dlg_deny), (d, w) -> cb.accept(false))
                    .setCancelable(false)
                    .show();
            } catch (Exception e) { cb.accept(false); }
        });
    }

    // ── UI updates from service ─────────────────────────────────────────────
    public static void log(String line) {
        final String ts = new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(new java.util.Date());
        UI.post(() -> {
            LOG.append(ts).append("  ").append(line).append('\n');
            if (LOG.length() > 12000) LOG.delete(0, LOG.length() - 12000);
            MainActivity a = instance;
            if (a != null && a.logView != null) a.logView.setText(LOG.toString());
        });
    }

    public static void setStatus(String s, boolean ok) {
        UI.post(() -> {
            MainActivity a = instance;
            if (a != null) {
                if (a.tbState != null) { a.tbState.setText(ok ? a.getString(R.string.state_online) : s); a.tbState.setTextColor(ok ? 0xFF34D399 : 0xFF94A3B8); }
                if (a.statusTitle != null) { a.statusTitle.setText(s); a.statusTitle.setTextColor(ok ? 0xFF34D399 : 0xFFF1F5F9); }
                if (a.statusSub != null) a.statusSub.setText(ok ? a.getString(R.string.agent_active) : a.getString(R.string.hint_press_start));
            }
        });
    }

    public static void updateConn(String server, String device, String uptime) {
        UI.post(() -> {
            MainActivity a = instance;
            if (a == null) return;
            if (a.connServer != null && server != null) a.connServer.setText(a.getString(R.string.lbl_server) + server);
            if (a.connDevinfo != null && device != null) a.connDevinfo.setText(a.getString(R.string.lbl_device) + device);
            if (a.connUptime != null && uptime != null) a.connUptime.setText(a.getString(R.string.lbl_uptime) + uptime);
        });
    }

    public static void updateStats(final JSONObject s) {
        if (s == null) return;
        UI.post(() -> {
            MainActivity a = instance;
            if (a == null) return;
            int cpu = s.optInt("cpuPercent", 0);
            int ram = s.optInt("ramPercent", 0);
            int disk = s.optInt("diskPercent", 0);
            if (a.barCpu != null) a.barCpu.setProgress(cpu);
            if (a.barRam != null) a.barRam.setProgress(ram);
            if (a.barDisk != null) a.barDisk.setProgress(disk);
            if (a.pctCpu != null) a.pctCpu.setText(cpu + "%");
            if (a.pctRam != null) a.pctRam.setText(ram + "%");
            if (a.pctDisk != null) a.pctDisk.setText(disk + "%");
        });
    }

    private void toast(String s) {
        try { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); } catch (Exception e) { }
    }

    // ── 3.14.0 — مبدّل الثيم: يقلب مؤهّلات الموارد للتطبيق كله (API 31+) ──
    private static final String PREF_THEME_DARK = "theme_dark";

    private void setupThemeToggle() {
        final TextView light = findViewById(R.id.tb_theme_light);
        final TextView dark  = findViewById(R.id.tb_theme_dark);
        if (light == null || dark == null) return;
        boolean isDark = Prefs.sp(this).getBoolean(PREF_THEME_DARK, false);
        paintThemeToggle(light, dark, isDark);
        light.setOnClickListener(v -> applyNightMode(false));
        dark.setOnClickListener(v -> applyNightMode(true));
    }

    private void paintThemeToggle(TextView light, TextView dark, boolean isDark) {
        light.setTextColor(getColor(isDark ? R.color.app_muted : R.color.app_accent));
        dark.setTextColor(getColor(isDark ? R.color.app_accent : R.color.app_muted));
        light.setBackgroundResource(isDark ? 0 : R.drawable.tab_active);
        dark.setBackgroundResource(isDark ? R.drawable.tab_active : 0);
    }



    // ── 3.14.0 — تبديل اللغة: يغيّر لغة الموارد ويُعيد إنشاء النشاط ──
    private static final String PREF_LANG = "lang";

    private String currentLang() {
        return Prefs.sp(this).getString(PREF_LANG, "ar");
    }

    @Override
    protected void attachBaseContext(Context newBase) {
        String lang = Prefs.sp(newBase).getString(PREF_LANG, "ar");
        Configuration cfg = new Configuration(newBase.getResources().getConfiguration());
        Locale loc = new Locale(lang);
        cfg.setLocale(loc);
        cfg.setLayoutDirection(loc);
        super.attachBaseContext(newBase.createConfigurationContext(cfg));
    }

    private void setupLangToggle() {
        final TextView ar = findViewById(R.id.tb_lang_ar);
        final TextView en = findViewById(R.id.tb_lang_en);
        if (ar == null || en == null) return;
        boolean isAr = "ar".equals(currentLang());
        paintLangToggle(ar, en, isAr);
        ar.setOnClickListener(v -> setLang("ar"));
        en.setOnClickListener(v -> setLang("en"));
    }

    private void paintLangToggle(TextView ar, TextView en, boolean isAr) {
        ar.setTextColor(getColor(isAr ? R.color.app_accent : R.color.app_muted));
        en.setTextColor(getColor(isAr ? R.color.app_muted : R.color.app_accent));
        ar.setBackgroundResource(isAr ? R.drawable.tab_active : 0);
        en.setBackgroundResource(isAr ? 0 : R.drawable.tab_active);
    }

    private void setLang(String lang) {
        if (lang.equals(currentLang())) return;
        Prefs.sp(this).edit().putString(PREF_LANG, lang).apply();
        recreate();
    }

    private void applyNightConfiguration(boolean dark) {
        Configuration cfg = new Configuration(getResources().getConfiguration());
        cfg.uiMode = (cfg.uiMode & ~Configuration.UI_MODE_NIGHT_MASK)
                | (dark ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
        getResources().updateConfiguration(cfg, getResources().getDisplayMetrics());
    }

    // التفضيل يحكم فقط إذا اختاره المستخدم؛ أول تشغيل يتبع النظام.
    private void applySavedNightMode() {
        if (!Prefs.sp(this).contains(PREF_THEME_DARK)) return;
        applyNightConfiguration(Prefs.sp(this).getBoolean(PREF_THEME_DARK, false));
    }

    private void applyNightMode(boolean dark) {
        Prefs.sp(this).edit().putBoolean(PREF_THEME_DARK, dark).apply();
        if (Build.VERSION.SDK_INT >= 31) {
            UiModeManager um = getSystemService(UiModeManager.class);
            if (um != null) {
                um.setApplicationNightMode(dark ? UiModeManager.MODE_NIGHT_YES : UiModeManager.MODE_NIGHT_NO);
            }
        } else {
            // API < 31: لا يوجد UiModeManager.setApplicationNightMode — نقلب المؤهّلات يدويًا
            applyNightConfiguration(dark);
            recreate();
        }
    }
}
