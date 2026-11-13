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
                int secs = (int) Math.round(expiresMs / 1000.0);
                android.util.Log.d("AiR-Offer", "show sid=" + sid + " finishing=" + isFinishing());
                // إغلاق أي حوار سابق **فورًا** قبل بناء الجديد. كان `dismissSessionOffer("")`
                // يُنشر إلى الطابور فيُنفَّذ بعد `dlg.show()` ويُغلق الحوار الجديد في اللحظة نفسها
                // (لأن sid الفارغ لا يمرّره حارس المطابقة) — وهو سبب «لا حوار» المقيس.
                try { if (offerDialog != null) offerDialog.dismiss(); } catch (Exception ignore) { }
                offerDialog = null;
                offerSid = "";
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
            } catch (Exception e) {
                android.util.Log.e("AiR-Offer", "dialog failed: " + e, e);
            }
        });
    }
    private static final Handler UI = new Handler(Looper.getMainLooper());
    private static final StringBuilder LOG = new StringBuilder();

    /** 3.16.17 — رسائل المساعد/الدردشة كفقاعات (static لتنجو من recreate). */
    private static class AiMsg {
        final String role;   // user | bot
        String text;
        boolean err;
        AiMsg(String role, String text, boolean err) { this.role = role; this.text = text; this.err = err; }
    }
    private static class ChatMsg {
        final String from;
        final String text;
        final boolean mine;
        ChatMsg(String from, String text, boolean mine) { this.from = from; this.text = text; this.mine = mine; }
    }
    private static final java.util.List<AiMsg> AI = new java.util.ArrayList<>();
    private static final java.util.List<ChatMsg> CHAT = new java.util.ArrayList<>();
    private static final int MAX_MSGS = 200;

    private TextView tbState;
    private TextView statusTitle;
    private TextView statusSub;
    private View statusDot;
    private View cardDot;
    private TextView connServer;
    private TextView connDevinfo;
    private TextView connUptime;
    private TextView footerTarget;
    private TextView setupStatus;
    private TextView logView;
    private TextView aiStatus;
    private ScrollView aiScroll;
    private ScrollView chatScroll;
    private ScrollView logScroll;
    private LinearLayout aiRows, chatRows;
    private TextView aiEmpty, chatEmpty;
    private Button aiStop, aiHist;
    private ProgressBar pwBar;
    private TextView pwLabel;
    private TextView connIpLocal, connIpPublic, badgeLive, badgeCap;
    private Button lvlAll, lvlInfo, lvlWarn, lvlErr;
    private String logLevel = "all";
    private TextView streamingText;
    private EditText inpServer;
    private EditText inpToken;
    private EditText inpCtrlPw;
    private Button btnAuthConsent, btnAuthPassword;
    // 3.16.16 — contextual start/stop + separate device-id line + log search
    private Button btnStart, btnStop;
    private TextView connDevid;
    private EditText logSearch;
    private String logFilterQ = "";
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
        applyTitlebarInsets();

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
        statusDot = findViewById(R.id.status_dot);
        cardDot = findViewById(R.id.card_dot);
        connServer = findViewById(R.id.conn_server);
        connDevinfo = findViewById(R.id.conn_devinfo);
        connUptime = findViewById(R.id.conn_uptime);
        connDevid = findViewById(R.id.conn_devid);
        footerTarget = findViewById(R.id.footer_target);
        logView = findViewById(R.id.log_view);
        aiStatus = findViewById(R.id.ai_status);
        aiScroll = findViewById(R.id.ai_scroll);
        chatScroll = findViewById(R.id.chat_scroll);
        logScroll = findViewById(R.id.log_scroll);
        aiRows = findViewById(R.id.ai_rows);
        chatRows = findViewById(R.id.chat_rows);
        aiEmpty = findViewById(R.id.ai_empty);
        chatEmpty = findViewById(R.id.chat_empty);
        aiStop = findViewById(R.id.ai_stop);
        aiHist = findViewById(R.id.ai_hist);
        pwBar = findViewById(R.id.pw_bar);
        pwLabel = findViewById(R.id.pw_label);
        connIpLocal = findViewById(R.id.conn_ip_local);
        connIpPublic = findViewById(R.id.conn_ip_public);
        badgeLive = findViewById(R.id.badge_live);
        badgeCap = findViewById(R.id.badge_cap);
        inpServer = findViewById(R.id.inp_server);
        inpToken = findViewById(R.id.inp_token);
        inpCtrlPw = findViewById(R.id.inp_ctrl_pw);
        btnStart = findViewById(R.id.btn_start);
        btnStop = findViewById(R.id.btn_stop);
        btnAuthConsent = findViewById(R.id.btn_auth_consent);
        btnAuthPassword = findViewById(R.id.btn_auth_password);
        if (btnAuthConsent != null) btnAuthConsent.setOnClickListener(v -> setAuthMode("consent"));
        if (btnAuthPassword != null) btnAuthPassword.setOnClickListener(v -> setAuthMode("password"));
        refreshAuthUi();
        aiInput = findViewById(R.id.ai_input);
        chatInput = findViewById(R.id.chat_input);
        barCpu = findViewById(R.id.bar_cpu);
        barRam = findViewById(R.id.bar_ram);
        barDisk = findViewById(R.id.bar_disk);
        pctCpu = findViewById(R.id.pct_cpu);
        pctRam = findViewById(R.id.pct_ram);
        pctDisk = findViewById(R.id.pct_disk);

        // 3.16.17 — recreate() لا يمسح الفقاعات (المخازن static) ويعيد رسمها
        renderAi();
        renderChat();

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
        setupStatus = findViewById(R.id.setup_status);
        // 3.16.16 — log search + copy (parity with the Windows agent log toolbar)
        logSearch = findViewById(R.id.log_search);
        if (logSearch != null) logSearch.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(android.text.Editable s) { logFilterQ = s.toString(); renderLog(); }
        });
        findViewById(R.id.btn_copy_log).setOnClickListener(v -> copyLog());
        findViewById(R.id.btn_export_log).setOnClickListener(v -> exportLog());
        findViewById(R.id.btn_clear_log).setOnClickListener(v -> {
            LOG.setLength(0);
            logFilterQ = "";
            if (logSearch != null) logSearch.setText("");
            logView.setText("—");
        });
        lvlAll = findViewById(R.id.lvl_all);
        lvlInfo = findViewById(R.id.lvl_info);
        lvlWarn = findViewById(R.id.lvl_warn);
        lvlErr = findViewById(R.id.lvl_err);
        if (lvlAll != null) lvlAll.setOnClickListener(v -> setLogLevel("all"));
        if (lvlInfo != null) lvlInfo.setOnClickListener(v -> setLogLevel("info"));
        if (lvlWarn != null) lvlWarn.setOnClickListener(v -> setLogLevel("warn"));
        if (lvlErr != null) lvlErr.setOnClickListener(v -> setLogLevel("error"));
        paintLogLevels();

        // 3.16.17 — نسخ IP المحلي/العام ومعرّف الجهاز (P2)
        findViewById(R.id.btn_copy_ip_local).setOnClickListener(v ->
                copyText("ip-local", connIpLocal == null ? "" : connIpLocal.getText().toString()));
        findViewById(R.id.btn_copy_ip_public).setOnClickListener(v ->
                copyText("ip-public", connIpPublic == null ? "" : connIpPublic.getText().toString()));
        if (connDevid != null) connDevid.setOnLongClickListener(v -> {
            copyText("device-id", connDevid.getText().toString().replace(getString(R.string.lbl_devid), ""));
            return true;
        });

        // 3.16.17 — شريط قوة كلمة السر (P3)
        if (inpCtrlPw != null) inpCtrlPw.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(android.text.Editable s) { updatePwStrength(s.toString()); }
        });

        aiInput.setOnEditorActionListener((v, actionId, event) -> { sendAiMessage(); return true; });
        findViewById(R.id.ai_send).setOnClickListener(v -> sendAiMessage());
        if (aiStop != null) aiStop.setOnClickListener(v -> { AiClient.stop(); });
        if (aiHist != null) aiHist.setOnClickListener(v -> showHistory());
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

    /** 3.16.16 — keep the header chips below the status bar / camera cutout;
     *  on cutout devices the hidden status-bar window still eats taps in that strip. */
    private void applyTitlebarInsets() {
        try {
            View content = findViewById(android.R.id.content);
            content.setOnApplyWindowInsetsListener((v, insets) -> {
                int top = insets.getSystemWindowInsetTop();
                View tb = findViewById(R.id.titlebar);
                if (tb != null && top > 0) {
                    tb.setPadding(tb.getPaddingLeft(), top + dp(4), tb.getPaddingRight(), tb.getPaddingBottom());
                }
                return insets.consumeSystemWindowInsets();
            });
            content.requestApplyInsets();
        } catch (Exception ignore) { }
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

    /** 3.16.16 — «n من 8» داخل بطاقة التهيئة، من نفس مصدر رقم المعالج. */
    private void refreshSetupStatus() {
        if (setupStatus == null) return;
        int ready = Perms.readyCount(this);
        setupStatus.setText(getString(R.string.setup_progress, ready));
        setupStatus.setTextColor(getResources().getColor(ready == 8 ? R.color.app_ok : R.color.app_muted));
    }

    @Override
    protected void onResume() {
        super.onResume();
        foreground = true;
        refreshConnectionStatus();
        refreshSetupStatus();
        refreshBadges();
        MainActivity.updateIps(AgentService.currentLocalIp(), AgentService.publicIp());
        if (AgentService.isRunning() && !AgentService.isConnected()) {
            AgentService.restartNow();
        }
        if (AgentService.isConnected() && AI.isEmpty() && Prefs.aiConv(this).isEmpty()) {
            restoreLatestConversation();
        }
    }

    private void restoreLatestConversation() {
        AiClient.listConversations(this, r -> UI.post(() -> {
            if (!AI.isEmpty()) return;
            org.json.JSONArray arr = r.optJSONArray("conversations");
            if (arr != null && arr.length() > 0) {
                String id = arr.optJSONObject(0).optString("id", "");
                if (!id.isEmpty()) {
                    AiClient.loadConversation(this, id, h -> UI.post(() -> {
                        org.json.JSONArray msgs = h.optJSONArray("messages");
                        if (msgs != null) {
                            for (int k = 0; k < msgs.length(); k++) {
                                JSONObject mm = msgs.optJSONObject(k);
                                if (mm == null) continue;
                                String role = "user".equals(mm.optString("role")) ? "user" : "bot";
                                String ct = mm.optString("content", "");
                                if (!ct.isEmpty()) addAiMsg(role, ct, false);
                            }
                        }
                    }));
                }
            }
        }));
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
            tabs[i].setTextColor(on ? getResources().getColor(R.color.app_ink) : getResources().getColor(R.color.app_muted));
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
        if (srv.isEmpty() || tok.isEmpty()) { toast(getString(R.string.toast_need_config)); return; }
        Prefs.save(this, srv, tok);
        footerTarget.setText(srv);
        String pw = inpCtrlPw.getText().toString().trim();
        if (!pw.isEmpty()) { Prefs.saveControlPassword(this, pw); Prefs.setAuthMode(this, "password"); }
        refreshAuthUi();
        AgentService svc = AgentService.INSTANCE;
        if (svc != null) svc.sendCapabilities();
        toast(getString(pw.isEmpty() ? R.string.toast_saved : R.string.toast_saved_pw));
        log("حُفظت الإعدادات — كلمة مرور التحكم: " + (Prefs.hasControlPassword(this) ? "مفعّلة" : "غير مفعّلة"));
    }

    // ── وضع التحكم: موافقة يدوية | كلمة سر (مطابق لوكيل ويندوز) ──────
    private void setAuthMode(String mode) {
        boolean password = "password".equals(mode);
        if (password && !Prefs.hasControlPassword(this)) {
            toast(getString(R.string.toast_auth_need_pw));
            try { inpCtrlPw.requestFocus(); } catch (Exception ignore) {}
            return;
        }
        Prefs.setAuthMode(this, mode);
        refreshAuthUi();
        AgentService svc = AgentService.INSTANCE;
        if (svc != null) svc.sendCapabilities();
        log("وضع التحكم: " + (password ? "كلمة سر" : "موافقة يدوية"));
    }

    /** يُبرز الوضع الفعّال، ويُظهر حقل كلمة السر في وضعها فقط. */
    private void refreshAuthUi() {
        boolean pw = "password".equals(Prefs.getAuthMode(this));
        try {
            // 3.16.16 — btn_ghost كان بلون البطاقة نفسها فيختفي الزر غير المحدد
            btnAuthConsent.setBackgroundResource(pw ? R.drawable.btn_soft : R.drawable.btn_primary);
            btnAuthConsent.setTextColor(getResources().getColor(pw ? R.color.app_ink2 : R.color.app_on_accent));
            btnAuthPassword.setBackgroundResource(pw ? R.drawable.btn_primary : R.drawable.btn_soft);
            btnAuthPassword.setTextColor(getResources().getColor(pw ? R.color.app_on_accent : R.color.app_ink2));
            inpCtrlPw.setEnabled(pw);
            inpCtrlPw.setHint(pw ? getString(R.string.fld_ctrl_pw) : getString(R.string.fld_auth_consent_hint));
        } catch (Exception ignore) { }
    }

    /** 3.16.17 — شريط قوة كلمة السر (P3): طول + تنوع المحارف. */
    private void updatePwStrength(String pw) {
        if (pwBar == null || pwLabel == null) return;
        if (pw == null || pw.isEmpty()) {
            pwBar.setProgress(0);
            pwLabel.setText("");
            return;
        }
        int score = 0;
        if (pw.length() >= 8) score += 25;
        if (pw.length() >= 12) score += 15;
        if (pw.matches(".*[a-z].*") && pw.matches(".*[A-Z].*")) score += 20;
        if (pw.matches(".*\\d.*")) score += 20;
        if (pw.matches(".*[^a-zA-Z0-9].*")) score += 20;
        if (pw.length() < 6) score = Math.min(score, 20);
        int label, color;
        if (score < 40) { label = R.string.pw_weak; color = R.color.app_warn; }
        else if (score < 60) { label = R.string.pw_medium; color = R.color.app_warn; }
        else if (score < 80) { label = R.string.pw_good; color = R.color.app_accent; }
        else { label = R.string.pw_strong; color = R.color.app_ok; }
        pwBar.setProgress(score);
        pwLabel.setText(getString(label));
        pwLabel.setTextColor(getResources().getColor(color));
        pwBar.setProgressTintList(android.content.res.ColorStateList.valueOf(getResources().getColor(color)));
    }

    private void deleteControlPassword() {
        Prefs.saveControlPassword(this, "");
        Prefs.setAuthMode(this, "consent");
        inpCtrlPw.setText("");
        refreshAuthUi();
        AgentService svc = AgentService.INSTANCE;
        if (svc != null) svc.sendCapabilities();
        toast(getString(R.string.toast_pw_cleared));
        log("حُذفت كلمة مرور التحكم");
    }

    // ── Agent control ───────────────────────────────────────────────────────
    private void startAgent() {
        android.util.Log.d("AiRemoteAgent", "MainActivity.startAgent");
        ensureBatteryExemption();
        String srv = inpServer.getText().toString().trim();
        String tok = inpToken.getText().toString().trim();
        if (srv.isEmpty() || tok.isEmpty()) { toast(getString(R.string.toast_need_config_first)); return; }
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
            } catch (Exception ignore) { toast(getString(R.string.toast_battery_settings)); }
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
        } catch (Exception ignore) { toast(getString(R.string.toast_system_settings)); }
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
                toast(getString(R.string.toast_admin_on));
            }
        } catch (Exception ignore) { toast(getString(R.string.toast_admin_fail)); }
    }

    private void requestCapture() {
        try {
            MediaProjectionManager mgr = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
            startActivityForResult(mgr.createScreenCaptureIntent(), REQ_CAPTURE);
        } catch (Exception e) { logE("تعذر طلب إذن الالتقاط: " + e.getMessage()); }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_CAPTURE) {
            if (resultCode == RESULT_OK && data != null) {
                CaptureHolder.resultCode = resultCode;
                CaptureHolder.data = data;
                log("منح إذن التقاط الشاشة ✓");
                try { if (AgentService.INSTANCE != null) AgentService.INSTANCE.resetCaptureSession(); } catch (Exception ignore) { }
                try { if (AgentService.INSTANCE != null) AgentService.INSTANCE.sendCapabilities(); } catch (Exception ignore) { }
            } else {
                logW("رُفض إذن التقاط الشاشة");
            }
        }
    }

    // ── AI chat (SSE + conversations + block exec) — Windows agent contract ─
    private void sendAiMessage() {
        final String text = aiInput.getText().toString().trim();
        if (text.isEmpty()) return;
        if (AiClient.isBusy()) { toast(getString(R.string.ai_busy)); return; }
        aiInput.setText("");
        addAiMsg("user", text, false);
        aiStatus.setText(getString(R.string.ai_thinking));
        setAiBusy(true);
        streamingText = null;
        final String[] acc = { "" };
        final boolean[] errored = { false };
        AiClient.send(this, text, new AiClient.Listener() {
            @Override public void onConversation(String id) { }
            @Override public void onDelta(String d) {
                if (errored[0]) return;
                acc[0] += d;
                UI.post(() -> {
                    if (errored[0]) return;
                    if (AI.isEmpty() || !"bot".equals(AI.get(AI.size() - 1).role)) {
                        addAiMsg("bot", acc[0], false);
                    } else {
                        AI.get(AI.size() - 1).text = acc[0];
                    }
                    if (streamingText != null) {
                        streamingText.setText(acc[0]);
                        aiScroll.post(() -> aiScroll.fullScroll(View.FOCUS_DOWN));
                    } else {
                        renderAi();
                    }
                });
            }
            @Override public void onDone(boolean aborted) {
                UI.post(() -> {
                    setAiBusy(false);
                    aiStatus.setText("");
                    if (errored[0]) return;
                    if (AI.isEmpty() || !"bot".equals(AI.get(AI.size() - 1).role)) {
                        addAiMsg("bot", acc[0].isEmpty() ? (aborted ? "أُوقِف البث" : "") : acc[0], false);
                    } else {
                        AI.get(AI.size() - 1).text = acc[0];
                    }
                    streamingText = null;
                    renderAi();
                });
            }
            @Override public void onError(String e) {
                errored[0] = true;
                UI.post(() -> {
                    setAiBusy(false);
                    aiStatus.setText("");
                    streamingText = null;
                    addAiMsg("bot", e == null ? "خطأ" : e, true);
                });
            }
        });
    }

    private void setAiBusy(boolean busy) {
        if (aiStop != null) aiStop.setVisibility(busy ? View.VISIBLE : View.GONE);
        if (aiHist != null) aiHist.setEnabled(!busy);
        findViewById(R.id.ai_send).setEnabled(!busy);
    }

    private void addAiMsg(String role, String text, boolean err) {
        AI.add(new AiMsg(role, text, err));
        if (AI.size() > MAX_MSGS) AI.remove(0);
        renderAi();
    }

    private void renderAi() {
        if (aiRows == null) return;
        aiRows.removeAllViews();
        streamingText = null;
        if (aiEmpty != null) aiEmpty.setVisibility(AI.isEmpty() ? View.VISIBLE : View.GONE);
        for (AiMsg m : AI) aiRows.addView(buildAiBubble(m));
        aiScroll.post(() -> aiScroll.fullScroll(View.FOCUS_DOWN));
    }

    private View buildAiBubble(AiMsg m) {
        boolean user = "user".equals(m.role);
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams wlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        wlp.topMargin = dp(6);
        wrap.setLayoutParams(wlp);
        wrap.setGravity(user ? android.view.Gravity.END : android.view.Gravity.START);

        LinearLayout bubble = new LinearLayout(this);
        bubble.setOrientation(LinearLayout.VERTICAL);
        bubble.setBackgroundResource(user ? R.drawable.bubble_user : R.drawable.bubble_bot);
        bubble.setPadding(dp(10), dp(8), dp(10), dp(8));
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
                (int) (getResources().getDisplayMetrics().widthPixels * 0.82f),
                LinearLayout.LayoutParams.WRAP_CONTENT);
        bubble.setLayoutParams(blp);

        TextView tv = new TextView(this);
        tv.setTextSize(13);
        tv.setTextColor(getResources().getColor(user ? R.color.app_on_accent
                : (m.err ? R.color.app_warn : R.color.app_ink)));
        tv.setText(m.text == null ? "" : m.text);
        tv.setTextIsSelectable(true);
        bubble.addView(tv);
        if (!user) streamingText = tv;

        if (!user && !m.err) {
            java.util.List<Object[]> parts = AiClient.parseParts(m.text);
            boolean hasCode = false;
            for (Object[] p : parts) {
                if (!"code".equals(p[0])) continue;
                hasCode = true;
                bubble.addView(buildCodeBlock((String) p[1], (String) p[2]));
            }
            if (hasCode && aiStatus != null) aiStatus.setText(getString(R.string.ai_run_hint));
        }
        wrap.addView(bubble);
        return wrap;
    }

    private View buildCodeBlock(String lang, String content) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundResource(R.drawable.code_bg);
        box.setPadding(dp(8), dp(6), dp(8), dp(6));
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        blp.topMargin = dp(6);
        box.setLayoutParams(blp);

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(android.view.Gravity.CENTER_VERTICAL);
        TextView lg = new TextView(this);
        lg.setText(lang == null || lang.isEmpty() ? "code" : lang);
        lg.setTextSize(10);
        lg.setTextColor(getResources().getColor(R.color.app_muted));
        head.addView(lg);

        View sp = new View(this);
        sp.setLayoutParams(new LinearLayout.LayoutParams(0, 1, 1f));
        head.addView(sp);

        Button copy = new Button(this);
        copy.setText(getString(R.string.ai_copy));
        copy.setAllCaps(false);
        copy.setTextSize(10);
        copy.setMinHeight(dp(28));
        copy.setMinimumHeight(dp(28));
        copy.setPadding(dp(8), 0, dp(8), 0);
        copy.setBackgroundResource(R.drawable.btn_soft);
        copy.setTextColor(getResources().getColor(R.color.app_ink2));
        copy.setOnClickListener(v -> copyText("ai-block", content));
        head.addView(copy);

        if (AiClient.isExecLang(lang)) {
            Button run = new Button(this);
            run.setText(getString(R.string.ai_run));
            run.setAllCaps(false);
            run.setTextSize(10);
            run.setMinHeight(dp(28));
            run.setMinimumHeight(dp(28));
            run.setPadding(dp(8), 0, dp(8), 0);
            run.setBackgroundResource(R.drawable.btn_primary);
            run.setTextColor(getResources().getColor(R.color.app_on_accent));
            TextView res = new TextView(this);
            res.setTextSize(11);
            res.setTextColor(getResources().getColor(R.color.app_muted));
            res.setVisibility(View.GONE);
            run.setOnClickListener(v -> runAiBlock(lang, content, res));
            head.addView(run);
            box.addView(head);
            box.addView(res);
        } else {
            box.addView(head);
        }

        TextView pre = new TextView(this);
        pre.setText(content == null ? "" : content);
        pre.setTextSize(11);
        pre.setTypeface(android.graphics.Typeface.MONOSPACE);
        pre.setTextColor(getResources().getColor(R.color.app_ink));
        pre.setTextIsSelectable(true);
        box.addView(pre);
        return box;
    }

    private void runAiBlock(String lang, String content, TextView res) {
        if (AiClient.isBusy()) { toast(getString(R.string.ai_busy)); return; }
        if (AiClient.isDangerous(content) && !Boolean.TRUE.equals(res.getTag())) {
            res.setTag(Boolean.TRUE);
            res.setVisibility(View.VISIBLE);
            res.setTextColor(getResources().getColor(R.color.app_warn));
            res.setText(getString(R.string.ai_danger) + " " + getString(R.string.ai_confirm));
            return;
        }
        res.setTag(null);
        res.setVisibility(View.VISIBLE);
        res.setTextColor(getResources().getColor(R.color.app_muted));
        res.setText(getString(R.string.ai_running));
        new Thread(() -> {
            JSONObject r = AiClient.runBlock(this, lang, content);
            UI.post(() -> {
                res.setVisibility(View.VISIBLE);
                boolean ok = r.optBoolean("ok", false);
                res.setTextColor(getResources().getColor(ok ? R.color.app_ok : R.color.app_warn));
                StringBuilder sb = new StringBuilder();
                sb.append(getString(ok ? R.string.ai_done : R.string.ai_failed));
                if (r.has("code")) sb.append(" (").append(getString(R.string.ai_exit, r.optInt("code", -1))).append(')');
                String out = r.optString("out", "");
                String err = r.optString("err", "");
                if (!out.isEmpty()) sb.append('\n').append(clipStr(out, 2500));
                if (!err.isEmpty()) sb.append('\n').append(clipStr(err, 1200));
                res.setText(sb.toString());
                if (r.has("image")) {
                    try {
                        android.widget.ImageView iv = new android.widget.ImageView(this);
                        byte[] b = android.util.Base64.decode(
                                r.getString("image").replaceFirst("^data:image/[^;]+;base64,", ""),
                                android.util.Base64.DEFAULT);
                        android.graphics.Bitmap bm = android.graphics.BitmapFactory.decodeByteArray(b, 0, b.length);
                        if (bm != null) {
                            iv.setImageBitmap(bm);
                            iv.setAdjustViewBounds(true);
                            iv.setMaxHeight(dp(220));
                            LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(
                                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                            ilp.topMargin = dp(6);
                            iv.setLayoutParams(ilp);
                            LinearLayout parent = (LinearLayout) res.getParent();
                            parent.addView(iv, Math.max(0, parent.indexOfChild(res)));
                        }
                    } catch (Exception ignore) { }
                }
            });
        }, "ai-run").start();
    }

    private static String clipStr(String s, int n) {
        if (s == null) return "";
        return s.length() <= n ? s : s.substring(0, n) + "…";
    }

    private void showHistory() {
        aiStatus.setText(getString(R.string.ai_thinking));
        AiClient.listConversations(this, r -> UI.post(() -> {
            aiStatus.setText("");
            if (!r.optBoolean("ok", false)) {
                toast(getString(R.string.ai_hist_fail));
                return;
            }
            org.json.JSONArray arr = r.optJSONArray("conversations");
            int n = arr == null ? 0 : arr.length();
            if (n == 0) { toast(getString(R.string.ai_hist_none)); return; }
            LinearLayout box = new LinearLayout(this);
            box.setOrientation(LinearLayout.VERTICAL);
            for (int i = 0; i < n; i++) {
                JSONObject c = arr.optJSONObject(i);
                if (c == null) continue;
                final String id = c.optString("id", "");
                String title = c.optString("title", getString(R.string.ai_title_hist));
                String when = c.optString("updated_at", "");
                LinearLayout row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setGravity(android.view.Gravity.CENTER_VERTICAL);
                row.setPadding(dp(10), dp(8), dp(10), dp(8));
                TextView tv = new TextView(this);
                tv.setText(title + "\n" + when);
                tv.setTextSize(12);
                tv.setTextColor(getResources().getColor(R.color.app_ink));
                tv.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
                row.addView(tv);
                Button del = new Button(this);
                del.setText("✕");
                del.setAllCaps(false);
                del.setTextSize(10);
                del.setMinHeight(dp(32));
                del.setMinimumHeight(dp(32));
                del.setBackgroundResource(R.drawable.btn_soft);
                del.setTextColor(getResources().getColor(R.color.app_warn));
                del.setOnClickListener(v -> AiClient.deleteConversation(this, id, d -> UI.post(() -> {
                    toast(getString(R.string.ai_deleted));
                    if (id.equals(Prefs.aiConv(this))) {
                        Prefs.setAiConv(this, "");
                        AI.clear();
                        renderAi();
                    }
                })));
                row.addView(del);
                row.setOnClickListener(v -> {
                    if (dlg != null) { try { dlg.dismiss(); } catch (Exception ignore) { } }
                    AiClient.loadConversation(this, id, h -> UI.post(() -> {
                        AI.clear();
                        org.json.JSONArray msgs = h.optJSONArray("messages");
                        if (msgs != null) {
                            for (int k = 0; k < msgs.length(); k++) {
                                JSONObject mm = msgs.optJSONObject(k);
                                if (mm == null) continue;
                                String role = "user".equals(mm.optString("role")) ? "user" : "bot";
                                String ct = mm.optString("content", "");
                                if (!ct.isEmpty()) addAiMsg(role, ct, false);
                            }
                        }
                    }));
                });
                box.addView(row);
            }
            android.widget.ScrollView sv = new android.widget.ScrollView(this);
            sv.addView(box);
            dlg = new AlertDialog.Builder(this)
                    .setTitle(getString(R.string.ai_title_hist))
                    .setView(sv)
                    .setNegativeButton(getString(R.string.setup_close), null)
                    .show();
        }));
    }
    private AlertDialog dlg;

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
            // 3.14.0 — D64 رأس البطاقة (يسبق كل الحقول)
            title.setText(getString(R.string.card_connect));
            title.setTextColor(getResources().getColor(R.color.app_ink));
            title.setTextSize(14);
            title.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
            card.addView(title);

            devState = new TextView(this);
            devState.setText(getString(R.string.dev_hint));
            devState.setTextColor(getResources().getColor(R.color.app_muted));
            devState.setTextSize(12);
            devState.setPadding(0, dp(4), 0, dp(6));
            card.addView(devState);

            TextView devLbl = new TextView(this);
            devLbl.setText(getString(R.string.dev_title));
            devLbl.setTextColor(getResources().getColor(R.color.app_accent));
            devLbl.setTextSize(12);
            devLbl.setPadding(0, dp(8), 0, dp(2));
            card.addView(devLbl);

            devSpinner = new android.widget.Spinner(this);
            devSpinner.setBackgroundResource(R.drawable.input_bg);
            // 3.16.16 — نص السبينر كان يتبع ثيم النظام (أسود على داكن) — الآن مواردي
            devAdapter = new android.widget.ArrayAdapter<>(this, R.layout.spinner_item, devLabels);
            devAdapter.setDropDownViewResource(R.layout.spinner_dropdown_item);
            devSpinner.setAdapter(devAdapter);
            devSpinner.setMinimumHeight(dp(44));
            devSpinner.setPadding(dp(4), dp(10), dp(4), dp(10));
            card.addView(devSpinner);

            devAccess = new android.widget.RadioGroup(this);
            devAccess.setOrientation(LinearLayout.HORIZONTAL);
            // 3.16.16 — مقطع (segmented) مثل وكيل ويندوز بدل راديو النظام
            devAccess.setBackgroundResource(R.drawable.seg_group_bg);
            devAccess.setPadding(dp(3), dp(3), dp(3), dp(3));
            String[][] opts = {{"view", getString(R.string.access_view)}, {"control", getString(R.string.access_control)}, {"files", getString(R.string.access_files)}};
            for (int i = 0; i < opts.length; i++) {
                android.widget.RadioButton rb = new android.widget.RadioButton(this);
                rb.setId(1000 + i);
                rb.setText(opts[i][1]);
                rb.setTextSize(12);
                rb.setTextColor(getResources().getColorStateList(R.color.seg_item_text));
                rb.setButtonDrawable(null);
                rb.setBackgroundResource(R.drawable.seg_item_bg);
                rb.setPadding(dp(6), 0, dp(6), 0);
                rb.setGravity(android.view.Gravity.CENTER);
                rb.setMinHeight(dp(40));
                rb.setMinimumHeight(dp(40));
                LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(0, dp(40), 1f);
                rlp.setMargins(dp(1), 0, dp(1), 0);
                rb.setLayoutParams(rlp);
                rb.setTag(opts[i][0]);
                devAccess.addView(rb);
                if (i == 1) rb.setChecked(true);
            }
            LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            alp.setMargins(0, dp(6), 0, 0);
            card.addView(devAccess, alp);

            devPw = new android.widget.EditText(this);
            devPw.setHint(getString(R.string.card_pw_field));
            devPw.setBackgroundResource(R.drawable.input_bg);
            devPw.setTextColor(getResources().getColor(R.color.app_ink));
            devPw.setHintTextColor(getResources().getColor(R.color.app_hint));
            devPw.setMinHeight(dp(44));
            devPw.setPadding(dp(8), dp(10), dp(8), dp(10));
            devPw.setLayoutParams(new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(44)));
            devPw.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
            devPw.setTextSize(12);
            devPw.setVisibility(View.VISIBLE);
            card.addView(devPw);
            TextView devPwHint = new TextView(this);
            devPwHint.setText(getString(R.string.card_pw_hint));
            devPwHint.setTextColor(getResources().getColor(R.color.app_muted));
            devPwHint.setTextSize(10);
            devPwHint.setPadding(0, dp(3), 0, dp(6));
            card.addView(devPwHint);

            LinearLayout btns = new LinearLayout(this);
            btns.setOrientation(LinearLayout.HORIZONTAL);
            Button refresh = new Button(this);
            refresh.setText(getString(R.string.btn_refresh));
            refresh.setAllCaps(false);
            refresh.setBackgroundResource(R.drawable.btn_soft);
            refresh.setTextColor(getResources().getColor(R.color.app_ink2));
            refresh.setMinHeight(dp(44));
            refresh.setMinimumHeight(dp(44));
            refresh.setOnClickListener(v -> loadDevices());
            btns.addView(refresh);
            Button send = new Button(this);
            send.setText(getString(R.string.btn_request));
            send.setAllCaps(false);
            send.setBackgroundResource(R.drawable.btn_primary);
            send.setTextColor(getResources().getColor(R.color.app_on_accent));
            send.setMinHeight(dp(44));
            send.setMinimumHeight(dp(44));
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
            sTitle.setTextColor(getResources().getColor(R.color.app_accent));
            sTitle.setTextSize(13);
            sTitle.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
            sesCard.addView(sTitle);

            sesState = new TextView(this);
            sesState.setText(getString(R.string.ses_loading));
            sesState.setTextColor(getResources().getColor(R.color.app_muted));
            sesState.setTextSize(12);
            sesState.setPadding(0, dp(4), 0, dp(6));
            sesCard.addView(sesState);

            sesRows = new LinearLayout(this);
            sesRows.setOrientation(LinearLayout.VERTICAL);
            sesCard.addView(sesRows);

            Button sRefresh = new Button(this);
            sRefresh.setText(getString(R.string.btn_refresh_ses));
            sRefresh.setAllCaps(false);
            sRefresh.setBackgroundResource(R.drawable.btn_soft);
            sRefresh.setTextColor(getResources().getColor(R.color.app_ink2));
            sRefresh.setMinHeight(dp(44));
            sRefresh.setMinimumHeight(dp(44));
            sRefresh.setOnClickListener(v -> loadSessions());
            sesCard.addView(sRefresh);

            // 3.16.16 — البطاقتان تُلحقان ثم يُعاد ترتيب اللوحة: الحالة والاتصال أولًا
            // (كانت بطاقة «الاتصال بجهاز آخر» تدفع زر البدء/الإيقاف أسفل الشاشة).
            card.setId(R.id.devices_card);
            sesCard.setId(R.id.sessions_card);
            root.addView(sesCard);
            root.addView(card);
            int[] order = {R.id.status_card, R.id.conn_strip_card, R.id.devices_card, R.id.sessions_card,
                    R.id.setup_card, R.id.note_card, R.id.settings_card, R.id.resources_card};
            for (int id : order) {
                View v = root.findViewById(id);
                if (v != null && v.getParent() == root) { root.removeView(v); root.addView(v); }
            }
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
                final String m = getString(R.string.ses_error, e.getMessage());
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
            String who = s.optString("requesterName", getString(R.string.offer_someone));
            String to = s.optString("targetName", s.optString("targetDeviceId", ""));
            String acc = s.optString("access", "");
            String accLabel = "view".equals(acc) ? getString(R.string.access_view) : ("control".equals(acc) ? getString(R.string.access_control) : ("files".equals(acc) ? getString(R.string.access_files) : acc));
            String stLabel = "requested".equals(state) ? getString(R.string.sess_state_requested) : ("active".equals(state) ? getString(R.string.sess_state_active) : getString(R.string.sess_state_suspended));
            final String rowSid = s.optString("id", "");
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(android.view.Gravity.CENTER_VERTICAL);
            TextView tv = new TextView(this);
            tv.setText(who + " ← " + to + " · " + accLabel + " · " + stLabel);
            tv.setTextSize(12);
            tv.setTextColor(getResources().getColor(R.color.app_ink2));
            tv.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            row.addView(tv);
            // 3.11.4 — قطع قسري للجلسة من الوكيل (كانت تعلق فتمنع إنشاء جلسة جديدة).
            Button cut = new Button(this);
            cut.setText(getString(R.string.btn_cut));
            cut.setAllCaps(false);
            cut.setTextSize(11);
            cut.setMinHeight(dp(44));
            cut.setMinimumHeight(dp(44));
            cut.setBackgroundResource(R.drawable.btn_soft);
            cut.setTextColor(getResources().getColor(R.color.app_warn));
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
                UI.post(() -> { toast(getString(R.string.toast_session_closed)); loadSessions(); });
            } catch (Exception e) {
                UI.post(() -> toast(getString(R.string.toast_session_close_fail)));
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
            String ses = "active".equals(d.optString("session")) ? getString(R.string.dev_in_session)
                    : ("requested".equals(d.optString("session")) ? getString(R.string.dev_pending) : "");
            devLabels.add(name + (kind.isEmpty() ? "" : " · " + kind) + (online ? "  ● " + getString(R.string.state_online) : "  ○ " + getString(R.string.state_offline)) + ses);
            devIds.add(id);
        }
        if (devAdapter != null) devAdapter.notifyDataSetChanged();
        if (devState != null) {
            devState.setText(n == 0
                    ? getString(R.string.dev_none)
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
        if (base == null || tok == null || tok.isEmpty()) { toast(getString(R.string.toast_agent_unconfigured)); return; }
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
                    msg = getString(R.string.req_pending);
                } else if (code == 403 && ("password_required".equals(errCode) || errCode.isEmpty())) {
                    msg = getString(R.string.req_pw_mode);
                    askPw = true;
                } else if (code == 409) {
                    msg = getString(R.string.req_exists);
                } else if (code == 503) {
                    msg = getString(R.string.req_offline);
                } else if (code == 403) {
                    msg = getString(R.string.req_forbidden);
                } else {
                    msg = getString(R.string.req_fail, errCode.isEmpty() ? ("HTTP " + code) : errCode);
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

    // ── Viewer chat (bubbles) ───────────────────────────────────────────────
    private void sendViewerMessage() {
        String text = chatInput.getText().toString().trim();
        if (text.isEmpty()) return;
        AgentService svc = AgentService.INSTANCE;
        if (svc == null) { toast(getString(R.string.toast_start_agent_first)); return; }
        svc.sendScreenChat(text);
        addChatMsg(getString(R.string.chat_you), text, true);
        chatInput.setText("");
    }

    private void addChatMsg(String from, String text, boolean mine) {
        CHAT.add(new ChatMsg(from, text, mine));
        if (CHAT.size() > MAX_MSGS) CHAT.remove(0);
        renderChat();
    }

    private void renderChat() {
        if (chatRows == null) return;
        chatRows.removeAllViews();
        if (chatEmpty != null) chatEmpty.setVisibility(CHAT.isEmpty() ? View.VISIBLE : View.GONE);
        for (ChatMsg m : CHAT) chatRows.addView(buildChatBubble(m));
        chatScroll.post(() -> chatScroll.fullScroll(View.FOCUS_DOWN));
    }

    private View buildChatBubble(ChatMsg m) {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams wlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        wlp.topMargin = dp(4);
        wrap.setLayoutParams(wlp);
        wrap.setGravity(m.mine ? android.view.Gravity.END : android.view.Gravity.START);

        LinearLayout bubble = new LinearLayout(this);
        bubble.setOrientation(LinearLayout.VERTICAL);
        bubble.setBackgroundResource(m.mine ? R.drawable.bubble_user : R.drawable.bubble_bot);
        bubble.setPadding(dp(10), dp(6), dp(10), dp(6));
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
                (int) (getResources().getDisplayMetrics().widthPixels * 0.78f),
                LinearLayout.LayoutParams.WRAP_CONTENT);
        bubble.setLayoutParams(blp);

        TextView who = new TextView(this);
        who.setText(m.from);
        who.setTextSize(9);
        who.setTextColor(getResources().getColor(m.mine ? R.color.app_on_accent : R.color.app_accent));
        bubble.addView(who);

        TextView tv = new TextView(this);
        tv.setTextSize(13);
        tv.setTextColor(getResources().getColor(m.mine ? R.color.app_on_accent : R.color.app_ink));
        tv.setText(m.text == null ? "" : m.text);
        tv.setTextIsSelectable(true);
        bubble.addView(tv);
        wrap.addView(bubble);
        return wrap;
    }

    static void viewerChat(String sender, String text) {
        UI.post(() -> {
            MainActivity a = instance;
            if (a != null) a.addChatMsg(sender == null || sender.isEmpty() ? "مشاهد" : sender, text, false);
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
    public static void log(String line) { logL("I", line); }
    public static void logW(String line) { logL("W", line); }
    public static void logE(String line) { logL("E", line); }

    private static void logL(String lvl, String line) {
        final String ts = new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(new java.util.Date());
        UI.post(() -> {
            LOG.append(ts).append(' ').append(lvl).append(' ').append(line).append('\n');
            if (LOG.length() > 16000) LOG.delete(0, LOG.length() - 16000);
            MainActivity a = instance;
            if (a != null) a.renderLog();
        });
    }

    public static void setStatus(String s, boolean ok) {
        UI.post(() -> {
            MainActivity a = instance;
            if (a != null) {
                int okC = a.getResources().getColor(R.color.app_ok);
                int mutC = a.getResources().getColor(R.color.app_muted);
                if (a.tbState != null) { a.tbState.setText(ok ? a.getString(R.string.state_online) : s); a.tbState.setTextColor(ok ? okC : mutC); }
                if (a.statusTitle != null) { a.statusTitle.setText(s); a.statusTitle.setTextColor(ok ? okC : a.getResources().getColor(R.color.app_ink)); }
                if (a.statusSub != null) a.statusSub.setText(ok ? a.getString(R.string.agent_active) : a.getString(R.string.hint_press_start));
                // 3.15.0 (P1-2) — النقطتان كانتا @drawable/btn_ghost ثابتة ولا تعكسان الحالة.
                // 3.16.16 — الثيم الفاتح كان يجعل العنوان أبيض شبه شفاف (ألوان ثابتة).
                android.content.res.ColorStateList tint = android.content.res.ColorStateList.valueOf(ok ? okC : mutC);
                if (a.statusDot != null) a.statusDot.setBackgroundTintList(tint);
                if (a.cardDot != null) a.cardDot.setBackgroundTintList(tint);
                // 3.16.16 — زر سياقي واحد مثل وكيل ويندوز: بدء عند التوقف، إيقاف أثناء التشغيل.
                boolean running = AgentService.isRunning();
                if (a.btnStart != null) a.btnStart.setVisibility(running ? View.GONE : View.VISIBLE);
                if (a.btnStop != null) a.btnStop.setVisibility(running ? View.VISIBLE : View.GONE);
            }
        });
    }

    public static void updateConn(String server, String device, String uptime) {
        UI.post(() -> {
            MainActivity a = instance;
            if (a == null) return;
            if (a.connServer != null && server != null) a.connServer.setText(a.getString(R.string.lbl_server) + server);
            if (device != null) {
                // 3.16.16 — الخدمة ترسل "name — id" كسلسلة واحدة؛ نعرض الاسم عاديًا
                // والمعرّف في سطر mono خاص به (كان يتكسّر السطر ويصعب نسخه).
                String name = device, id = "";
                int ix = device.indexOf(" — ");
                if (ix > 0) { name = device.substring(0, ix); id = device.substring(ix + 3); }
                if (a.connDevinfo != null) a.connDevinfo.setText(a.getString(R.string.lbl_device) + name);
                if (a.connDevid != null) a.connDevid.setText(id.isEmpty() ? "" : a.getString(R.string.lbl_devid) + id);
            }
            if (a.connUptime != null && uptime != null) a.connUptime.setText(a.getString(R.string.lbl_uptime) + uptime);
            a.refreshBadges();
        });
    }

    public static void updateIps(String loc, String pub) {
        UI.post(() -> {
            MainActivity a = instance;
            if (a == null) return;
            if (a.connIpLocal != null) a.connIpLocal.setText(loc == null || loc.isEmpty() ? "—" : loc);
            if (a.connIpPublic != null) a.connIpPublic.setText(pub == null || pub.isEmpty() ? "—" : pub);
            a.refreshBadges();
        });
    }

    private void refreshBadges() {
        boolean cap = AgentService.isCaptureReady();
        boolean live = AgentService.isStreaming();
        if (badgeCap != null) {
            badgeCap.setText(getString(cap ? R.string.badge_cap_on : R.string.badge_cap_off));
            badgeCap.setTextColor(getResources().getColor(cap ? R.color.app_ok : R.color.app_warn));
        }
        if (badgeLive != null) badgeLive.setVisibility(live ? View.VISIBLE : View.GONE);
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

    /** 3.16.17 — search + level filter (all/info/warn/error). */
    private void renderLog() {
        if (logView == null) return;
        String q = logFilterQ == null ? "" : logFilterQ.trim();
        StringBuilder sb = new StringBuilder();
        for (String line : LOG.toString().split("\n")) {
            if (line.isEmpty()) continue;
            if ("warn".equals(logLevel) && !line.contains(" W ")) continue;
            if ("error".equals(logLevel) && !line.contains(" E ")) continue;
            if ("info".equals(logLevel) && (line.contains(" W ") || line.contains(" E "))) continue;
            if (!q.isEmpty() && !line.contains(q)) continue;
            sb.append(line).append('\n');
        }
        logView.setText(sb.length() == 0 ? "—" : sb.toString());
    }

    private void setLogLevel(String lvl) {
        logLevel = lvl;
        paintLogLevels();
        renderLog();
    }

    private void paintLogLevels() {
        if (lvlAll == null) return;
        paintLvl(lvlAll, "all");
        paintLvl(lvlInfo, "info");
        paintLvl(lvlWarn, "warn");
        paintLvl(lvlErr, "error");
    }

    private void paintLvl(Button b, String lvl) {
        boolean on = lvl.equals(logLevel);
        b.setBackgroundResource(on ? R.drawable.btn_primary : R.drawable.btn_soft);
        b.setTextColor(getResources().getColor(on ? R.color.app_on_accent : R.color.app_ink2));
    }

    private void copyLog() {
        try {
            android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (cm != null) {
                cm.setPrimaryClip(android.content.ClipData.newPlainText("airemote-log", LOG.toString()));
                toast(getString(R.string.log_copied));
            }
        } catch (Exception ignore) { }
    }

    private void copyText(String label, String v) {
        try {
            if (v == null || v.isEmpty()) return;
            android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (cm != null) {
                cm.setPrimaryClip(android.content.ClipData.newPlainText(label, v));
                toast(getString(R.string.toast_copied));
            }
        } catch (Exception ignore) { }
    }

    private void exportLog() {
        final String text = LOG.toString();
        if (text.trim().isEmpty()) { toast(getString(R.string.log_empty)); return; }
        final String name = "airemote-log-" + new java.text.SimpleDateFormat("yyyyMMdd-HHmmss", java.util.Locale.US).format(new java.util.Date()) + ".txt";
        new Thread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    android.content.ContentValues cv = new android.content.ContentValues();
                    cv.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name);
                    cv.put(android.provider.MediaStore.Downloads.MIME_TYPE, "text/plain");
                    android.net.Uri uri = getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri != null) {
                        java.io.OutputStream os = getContentResolver().openOutputStream(uri);
                        os.write(text.getBytes("UTF-8"));
                        os.close();
                        UI.post(() -> toast(getString(R.string.log_exported_dl, name)));
                        return;
                    }
                }
            } catch (Exception ignore) { }
            try {
                java.io.File dir = getExternalFilesDir("logs");
                if (dir == null) dir = getFilesDir();
                java.io.File f = new java.io.File(dir, name);
                java.io.FileOutputStream fos = new java.io.FileOutputStream(f);
                fos.write(text.getBytes("UTF-8"));
                fos.close();
                UI.post(() -> toast(getString(R.string.log_exported, f.getAbsolutePath())));
            } catch (Exception e) {
                UI.post(() -> toast(getString(R.string.log_export_fail)));
            }
        }, "log-export").start();
    }

    private void toast(String s) {
        try { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); } catch (Exception e) { }
    }

    // ── 3.14.0 — مبدّل الثيم: يقلب مؤهّلات الموارد للتطبيق كله (API 31+) ──
    private static final String PREF_THEME_DARK = "theme_dark";

    private void setupThemeToggle() {
        // 3.16.16 — شريحة واحدة تكفي (كانت شريحتا «فاتح/داكن» تدفعان الشريط خارج الشاشة
        // على هواتف 360dp). الشريحة تعرض الوضع الذي ستتحول إليه، مثل زر الشمس/القمر.
        final TextView btn = findViewById(R.id.tb_theme);
        if (btn == null) return;
        boolean isDark = Prefs.sp(this).getBoolean(PREF_THEME_DARK, false);
        paintThemeToggle(btn, isDark);
        btn.setOnClickListener(v -> applyNightMode(!Prefs.sp(this).getBoolean(PREF_THEME_DARK, false)));
    }

    private void paintThemeToggle(TextView btn, boolean isDark) {
        btn.setText(getString(isDark ? R.string.theme_light : R.string.theme_dark));
        btn.setTextColor(getColor(isDark ? R.color.app_muted : R.color.app_accent));
        btn.setBackgroundResource(isDark ? 0 : R.drawable.tab_active);
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
