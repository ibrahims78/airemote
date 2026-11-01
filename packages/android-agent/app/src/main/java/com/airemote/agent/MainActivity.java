package com.airemote.agent;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Bundle;
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

    /** 3.9.0 — حوار موافقة داخل التطبيق (يُستدعى من AgentService على الخيط الرئيسي). */
    public void showSessionOffer(final JSONObject offer) {
        runOnUiThread(() -> {
            try {
                if (isFinishing()) return;
                JSONObject req = offer.optJSONObject("requester");
                String who = req != null ? req.optString("name", "جهاز") : "جهاز";
                String access = offer.optString("accessLabel", offer.optString("access"));
                final String sid = offer.optString("sessionId", "");
                new AlertDialog.Builder(this)
                        .setTitle("طلب اتصال بجهازك")
                        .setMessage(who + " يطلب " + access + "\nالمهلة 60 ثانية.")
                        .setPositiveButton("سماح", (d, w) -> AgentService.sendSessionDecision(sid, true))
                        .setNegativeButton("رفض", (d, w) -> AgentService.sendSessionDecision(sid, false))
                        .setCancelable(true)
                        .show();
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
        setContentView(R.layout.activity_main);
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

    private void refreshConnectionStatus() {
        if (AgentService.isConnected()) {
            setStatus("متصل ✓", true);
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
        aiStatus.setText("جارٍ التفكير…");
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
            UI.post(() -> { appendAi("المساعد: " + out + "\n"); aiStatus.setText(""); });
        }).start();
    }

    // ── 3.9.4: الأجهزة وطلب التحكم (وكيل ↔ وكيل) ─────────────────────────────
    private LinearLayout devRows;
    private TextView devState;

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
            title.setText("الأجهزة — اتصال وكيل بوكيل");
            title.setTextColor(0xFF93C5FD);
            title.setTextSize(13);
            title.setTypeface(null, android.graphics.Typeface.BOLD);
            card.addView(title);

            devState = new TextView(this);
            devState.setText("اضغط «تحديث» لجلب أجهزة حسابك.");
            devState.setTextColor(0xFF94A3B8);
            devState.setTextSize(12);
            devState.setPadding(0, dp(4), 0, dp(6));
            card.addView(devState);

            Button refresh = new Button(this);
            refresh.setText("تحديث الأجهزة");
            refresh.setAllCaps(false);
            refresh.setOnClickListener(v -> loadDevices());
            card.addView(refresh);

            devRows = new LinearLayout(this);
            devRows.setOrientation(LinearLayout.VERTICAL);
            card.addView(devRows);

            root.addView(card, 0);
        } catch (Exception ignore) { }
    }

    private void loadDevices() {
        final String base = apiBase();
        final String tok = Prefs.token(this);
        if (base == null || tok == null || tok.isEmpty()) {
            if (devState != null) devState.setText("لم يُهيَّأ الوكيل بعد (لا عنوان ولا رمز).");
            return;
        }
        if (devState != null) devState.setText("جارٍ التحميل…");
        if (devRows != null) devRows.removeAllViews();
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
                UI.post(() -> { if (devState != null) devState.setText("تعذر جلب الأجهزة: " + msg); });
            }
        }).start();
    }

    private void renderDevices(JSONArray arr) {
        if (devRows == null) return;
        devRows.removeAllViews();
        int n = arr == null ? 0 : arr.length();
        if (devState != null) devState.setText(n == 0 ? "لا توجد أجهزة أخرى في حسابك." : ("متاح " + n + " جهازاً"));
        for (int i = 0; i < n; i++) {
            JSONObject d = arr.optJSONObject(i);
            if (d == null) continue;
            final String id = d.optString("id");
            final String name = d.optString("name", "جهاز");
            boolean online = d.optBoolean("online", false);
            JSONObject acc = d.optJSONObject("access");
            boolean canControl = acc == null || acc.optBoolean("control", true);

            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setPadding(0, dp(6), 0, dp(6));
            row.setGravity(android.view.Gravity.CENTER_VERTICAL);

            TextView tv = new TextView(this);
            tv.setText(name + (online ? "   ● متصل" : "   ○ غير متصل"));
            tv.setTextColor(online ? 0xFFE2E8F0 : 0xFF64748B);
            tv.setTextSize(13);
            LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            tv.setLayoutParams(tlp);
            row.addView(tv);

            Button b = new Button(this);
            b.setText("طلب تحكم");
            b.setAllCaps(false);
            b.setTextSize(12);
            b.setEnabled(online && canControl);
            b.setOnClickListener(v -> requestControl(id, name));
            row.addView(b);

            devRows.addView(row);
        }
    }

    private void requestControl(final String targetId, final String targetName) {
        final String base = apiBase();
        final String tok = Prefs.token(this);
        if (base == null || tok == null || tok.isEmpty()) { toast("الوكيل غير مهيّأ"); return; }
        if (devState != null) devState.setText("جارٍ إرسال الطلب إلى " + targetName + "…");
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("targetDeviceId", targetId);
                body.put("access", "control");
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
                String msg;
                if (code == 201) {
                    msg = "تم إرسال الطلب إلى " + targetName + " — بانتظار الموافقة على الجهاز الهدف.";
                } else if (code == 409) {
                    msg = "يوجد جلسة قائمة على " + targetName + ". أغلقها أولاً.";
                } else if (code == 503) {
                    msg = "الجهاز الهدف غير متصل الآن.";
                } else if (code == 403) {
                    msg = "غير مصرح بالتحكم بهذا الجهاز.";
                } else {
                    String err = "";
                    try { err = new JSONObject(js).optString("error", ""); } catch (Exception ignore) {}
                    msg = "تعذر إرسال الطلب (HTTP " + code + ")" + (err.isEmpty() ? "" : " — " + err);
                }
                final String out = msg;
                UI.post(() -> { if (devState != null) devState.setText(out); });
            } catch (Exception e) {
                final String msg = "تعذر الاتصال: " + e.getMessage();
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
                    .setTitle("طلب تحكم")
                    .setMessage((requester == null ? "شخص ما" : requester) + " يطلب التحكم في شاشتك.\nهل تسمح بالتحكم الكامل؟")
                    .setPositiveButton("السماح", (d, w) -> cb.accept(true))
                    .setNegativeButton("رفض", (d, w) -> cb.accept(false))
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
                if (a.tbState != null) { a.tbState.setText(ok ? "متصل" : s); a.tbState.setTextColor(ok ? 0xFF34D399 : 0xFF94A3B8); }
                if (a.statusTitle != null) { a.statusTitle.setText(s); a.statusTitle.setTextColor(ok ? 0xFF34D399 : 0xFFF1F5F9); }
                if (a.statusSub != null) a.statusSub.setText(ok ? "الوكيل نشط على هذا الجهاز" : "اضغط «بدء» للاتصال بالخادم");
            }
        });
    }

    public static void updateConn(String server, String device, String uptime) {
        UI.post(() -> {
            MainActivity a = instance;
            if (a == null) return;
            if (a.connServer != null && server != null) a.connServer.setText("الخادم: " + server);
            if (a.connDevinfo != null && device != null) a.connDevinfo.setText("الجهاز: " + device);
            if (a.connUptime != null && uptime != null) a.connUptime.setText("مدة الجلسة: " + uptime);
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
}
