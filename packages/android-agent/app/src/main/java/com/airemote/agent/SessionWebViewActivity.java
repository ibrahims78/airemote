package com.airemote.agent;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.SslErrorHandler;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.security.MessageDigest;

/**
 * 3.9.0 — نافذة عرض جلسة وكيل↔وكيل.
 * Tracks: WebView معزول + تثبيت شهادة السيرفر (TOFU: أول بصمة تُحفظ ثم تُطابق).
 */
public class SessionWebViewActivity extends Activity {

    // 3.14.0 — الأنشطة تقرأ النصوص بلغة التطبيق لا بلغة النظام.
    @Override
    protected void attachBaseContext(android.content.Context newBase) {
        String lang = Prefs.sp(newBase).getString("lang", "ar");
        android.content.res.Configuration cfg =
                new android.content.res.Configuration(newBase.getResources().getConfiguration());
        java.util.Locale loc = new java.util.Locale(lang);
        cfg.setLocale(loc);
        cfg.setLayoutDirection(loc);
        super.attachBaseContext(newBase.createConfigurationContext(cfg));
    }

    /** 3.11.2 — هل يوجد عارض مفتوح الآن؟ يُستخدم لتقييد طلب إذن الالتقاط حتى لا يحجب الجلسة. */
    public static volatile boolean isOpen = false;
    public static final String ACTION_CLOSED = "com.airemote.agent.SESSION_CLOSED";
    private static final String PIN_PREFS = "session_pin";

    private static final String TAG = "AiR-SessionView";
    private WebView web;
    private String sessionId = "";
    private String viewUrl = "";
    private boolean needsReload = false;
    private BroadcastReceiver closeReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        isOpen = true;
        sessionId = getIntent().getStringExtra("sessionId");
        if (sessionId == null) sessionId = "";
        String url = getIntent().getStringExtra("url");
        String base = httpBase();
        if (url == null || url.isEmpty() || base == null) { finish(); return; }
        if (url.startsWith("/")) url = base + url;
        viewUrl = url;
        // شاشة العرض تبقى مضاءة أثناء الجلسة (T9/T10).
        try { getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); } catch (Exception ignore) {}
        Log.i(TAG, "created hasRt=" + url.contains("rt=") + " hasRk=" + url.contains("rk=") + " sid=" + sessionId);

        // 3.9.4 — تشخيص: تصحيح WebView يُفتح فقط عند تعيين الإعداد العام
        // `airemote_webview_debug=1` (adb settings put global). الافتراضي مغلق.
        try {
            int dbg = android.provider.Settings.Global.getInt(getContentResolver(), "airemote_webview_debug", 0);
            if (dbg == 1) WebView.setWebContentsDebuggingEnabled(true);
        } catch (Exception ignore) {}

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // 3.9.3 — اللمس ملك الجلسة: لا تكبير داخلي ولا تحديد نص ولا قائمة ضغط مطوّل.
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);
        web.setOnLongClickListener(new android.view.View.OnLongClickListener() {
            @Override public boolean onLongClick(android.view.View v) { return true; }
        });
        web.setBackgroundColor(0xFF0B1220);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                try {
                    android.os.Bundle st = android.net.http.SslCertificate.saveState(error.getCertificate());
                    byte[] der = st == null ? null : st.getByteArray("x509-certificate");
                    String fp = der != null ? sha256(der) : sha256(String.valueOf(st).getBytes("UTF-8"));
                    SharedPreferences sp = getSharedPreferences(PIN_PREFS, MODE_PRIVATE);
                    String pinned = sp.getString("pin", "");
                    if (pinned.isEmpty()) {
                        sp.edit().putString("pin", fp).apply();
                        handler.proceed();
                    } else if (pinned.equalsIgnoreCase(fp)) {
                        handler.proceed();
                    } else {
                        // 3.11.2 — كان تغيّر الشهادة (بعد إعادة تثبيت السيرفر) يُغلق النشاط بصمت
                        // فيبقى العارض فارغاً. الآن: حوار ثقة صريح، والموافقة تُعيد التثبيت.
                        final SslErrorHandler h = handler;
                        final String newFp = fp;
                        runOnUiThread(() -> {
                            try {
                                new AlertDialog.Builder(SessionWebViewActivity.this)
                                        .setTitle("شهادة السيرفر تغيّرت")
                                        .setMessage("شهادة الخادم الحالية تختلف عن المحفوظة (يحدث بعد إعادة تثبيت السيرفر).\nهل تثق بهذا الخادم وتُكمل؟")
                                        .setPositiveButton("ثق وأكمل", (d, w) -> { sp.edit().putString("pin", newFp).apply(); h.proceed(); })
                                        .setNegativeButton("إلغاء", (d, w) -> { h.cancel(); finish(); })
                                        .setCancelable(false)
                                        .show();
                            } catch (Exception e) { h.cancel(); finish(); }
                        });
                    }
                } catch (Exception e) {
                    handler.cancel();
                }
            }
        });
        setContentView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.loadUrl(url);

        closeReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                String sid = intent.getStringExtra("sessionId");
                // 3.9.2 — لا تُغلق النافذة على بث بلا معرّف (كان يغلق كل النوافذ).
                if (sid != null && sid.equals(sessionId)) finish();
            }
        };
        IntentFilter f = new IntentFilter(ACTION_CLOSED);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(closeReceiver, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(closeReceiver, f);
    }

    private String httpBase() {
        try {
            String srv = Prefs.server(this);
            if (srv == null) return null;
            srv = srv.replaceFirst("^wss://", "https://").replaceFirst("^ws://", "http://");
            return srv.replaceFirst("/ws/?$", "");
        } catch (Exception e) { return null; }
    }

    private static String sha256(byte[] data) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] d = md.digest(data);
        StringBuilder sb = new StringBuilder();
        for (byte b : d) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // 3.9.3 — SINGLE_TOP يعيد استخدام النافذة؛ بدون هذا المعالج تُتجاهل الجلسة الجديدة
        // ويبقى العنوان القديم (فلا يُفتح /screen للجلسة الجديدة).
        setIntent(intent);
        String sid = intent.getStringExtra("sessionId");
        String url = intent.getStringExtra("url");
        String base = httpBase();
        if (url == null || url.isEmpty() || base == null) return;
        if (url.startsWith("/")) url = base + url;
        sessionId = sid == null ? "" : sid;
        viewUrl = url;
        needsReload = false;
        android.util.Log.i(TAG, "new-intent sid=" + sessionId + " hasRt=" + url.contains("rt="));
        try { if (web != null) web.loadUrl(url); } catch (Exception ignore) {}
    }

    @Override
    protected void onPause() {
        super.onPause();
        // 3.9.2 — مغادرة النافذة ثم العودة = إعادة تحميل حقيقية (تدفع المسار إلى rk).
        needsReload = true;
        Log.i(TAG, "paused");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (needsReload && web != null) {
            needsReload = false;
            Log.i(TAG, "resume-reload hasRk=" + viewUrl.contains("rk="));
            try { web.reload(); } catch (Exception e) { Log.w(TAG, "reload failed: " + e); }
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // configChanges في المانيفست يمنع إعادة الإنشاء، فلا تُفقد الجلسة عند التدوير (T10).
        Log.i(TAG, "config " + newConfig.orientation);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        isOpen = false;
        Log.i(TAG, "destroy sid=" + sessionId);
        try { if (closeReceiver != null) unregisterReceiver(closeReceiver); } catch (Exception ignore) {}
        try { if (web != null) { web.loadUrl("about:blank"); web.destroy(); } } catch (Exception ignore) {}
        super.onDestroy();
    }
}
