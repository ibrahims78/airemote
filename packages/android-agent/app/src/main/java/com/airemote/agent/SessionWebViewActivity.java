package com.airemote.agent;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
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
    public static final String ACTION_CLOSED = "com.airemote.agent.SESSION_CLOSED";
    private static final String PIN_PREFS = "session_pin";

    private WebView web;
    private String sessionId = "";
    private BroadcastReceiver closeReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sessionId = getIntent().getStringExtra("sessionId");
        if (sessionId == null) sessionId = "";
        String url = getIntent().getStringExtra("url");
        String base = httpBase();
        if (url == null || url.isEmpty() || base == null) { finish(); return; }
        if (url.startsWith("/")) url = base + url;

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
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
                        handler.cancel();
                        Toast.makeText(SessionWebViewActivity.this, "شهادة السيرفر تغيّرت — أُوقف الاتصال", Toast.LENGTH_LONG).show();
                        finish();
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
                if (sid == null || sid.isEmpty() || sid.equals(sessionId)) finish();
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
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        try { if (closeReceiver != null) unregisterReceiver(closeReceiver); } catch (Exception ignore) {}
        try { if (web != null) { web.loadUrl("about:blank"); web.destroy(); } } catch (Exception ignore) {}
        super.onDestroy();
    }
}
