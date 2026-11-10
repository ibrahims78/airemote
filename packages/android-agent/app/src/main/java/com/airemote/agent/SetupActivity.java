package com.airemote.agent;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/**
 * One-screen unassisted setup: every Android permission the remote session
 * needs is shown with its live state and a direct action. Android does not
 * allow a normal app to grant these via a password; this screen makes the
 * required one-time setup explicit and quick.
 */
public class SetupActivity extends Activity {

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

    private LinearLayout list;
    private TextView summary;

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density); }
    private int color(int c) { return c; }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(9, 16, 30));
        getWindow().setNavigationBarColor(Color.rgb(9, 16, 30));

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(9, 16, 30));
        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setPadding(dp(20), dp(22), dp(20), dp(32));
        scroll.addView(list, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);

        TextView title = new TextView(this);
        title.setText(getString(R.string.setup_title));
        title.setTextColor(Color.WHITE);
        title.setTextSize(24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        list.addView(title);

        TextView sub = new TextView(this);
        sub.setText(getString(R.string.setup_desc));
        sub.setTextColor(Color.rgb(148, 163, 184));
        sub.setTextSize(13);
        sub.setPadding(0, dp(8), 0, dp(18));
        list.addView(sub);

        summary = new TextView(this);
        summary.setTextColor(Color.rgb(203, 213, 225));
        summary.setTextSize(13);
        summary.setPadding(dp(14), dp(12), dp(14), dp(12));
        summary.setBackground(round(Color.rgb(30, 41, 59), 14));
        list.addView(summary, marginParams(0, 0, 0, dp(14)));

        addRow(getString(R.string.perm_screen_title), getString(R.string.perm_screen_desc), "screen");
        addRow(getString(R.string.perm_a11y_title), getString(R.string.perm_a11y_desc), "a11y");
        addRow(getString(R.string.perm_write_title), getString(R.string.perm_write_desc), "write");
        addRow(getString(R.string.perm_battery_title), getString(R.string.perm_battery_desc), "battery");
        addRow(getString(R.string.perm_record_title), getString(R.string.perm_record_desc), "record");
        addRow(getString(R.string.perm_notify_title), getString(R.string.perm_notify_desc), "notify");
        addRow(getString(R.string.perm_overlay_title), getString(R.string.perm_overlay_desc), "overlay");
        // 3.16.8 — بدون هذه الصلاحية لا يستطيع الوكيل سرد التخزين المشترك على أندرويد 11+.
        addRow(getString(R.string.perm_files_title), getString(R.string.perm_files_desc), "files");

        Button start = new Button(this);
        start.setText(getString(R.string.setup_start));
        start.setAllCaps(false);
        start.setTextColor(Color.rgb(9, 16, 30));
        start.setTextSize(15);
        start.setTypeface(Typeface.DEFAULT_BOLD);
        start.setBackground(round(Color.rgb(45, 212, 191), 14));
        start.setOnClickListener(v -> {
            startActivity(new Intent(this, MainActivity.class).putExtra("autostart", true).putExtra("requestCapture", true));
            finish();
        });
        list.addView(start, marginParams(0, dp(12), 0, 0));

        Button close = new Button(this);
        close.setText(getString(R.string.setup_close));
        close.setAllCaps(false);
        close.setTextColor(Color.rgb(203, 213, 225));
        close.setBackground(round(Color.rgb(30, 41, 59), 14));
        close.setOnClickListener(v -> finish());
        list.addView(close, marginParams(0, dp(8), 0, 0));

        refresh();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // v3.8.36 (R8) — the wizard is part of our UI: while it is in front the
        // clipboard is readable (Android 10+ only serves the focused app), and the
        // capability probe in AgentService must see that.
        MainActivity.foreground = true;
        refresh();
    }

    @Override
    protected void onPause() {
        MainActivity.foreground = false;
        super.onPause();
    }

    private LinearLayout.LayoutParams marginParams(int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(l, t, r, b);
        return p;
    }

    private GradientDrawable round(int fill, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(radius));
        return d;
    }

    private boolean a11yEnabled() {
        int enabled = 0;
        try { enabled = Settings.Secure.getInt(getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED); } catch (Exception ignore) { }
        String services = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        return enabled == 1 && services != null
                && services.contains(getPackageName() + "/" + AiRemoteA11y.class.getName());
    }

    private boolean batteryOk() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
        } catch (Exception ignore) { return false; }
    }

    private void addRow(String title, String desc, String key) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        card.setBackground(round(Color.rgb(17, 28, 48), 14));

        TextView t = new TextView(this);
        t.setText(title);
        t.setTextColor(Color.WHITE);
        t.setTextSize(16);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        card.addView(t);

        TextView d = new TextView(this);
        d.setText(desc);
        d.setTextColor(Color.rgb(148, 163, 184));
        d.setTextSize(12);
        d.setPadding(0, dp(3), 0, dp(10));
        card.addView(d);

        TextView status = new TextView(this);
        status.setTextColor(Color.rgb(251, 191, 36));
        status.setTextSize(13);
        status.setPadding(0, 0, 0, dp(8));
        status.setTag("status_" + key);
        card.addView(status);

        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(getString(R.string.setup_open));
        b.setTextColor(Color.rgb(203, 213, 225));
        b.setBackground(round(Color.rgb(30, 41, 59), 10));
        b.setOnClickListener(v -> open(key));
        card.addView(b, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        list.addView(card, marginParams(0, dp(6), 0, 0));
    }

    private void open(String key) {
        try {
            if ("screen".equals(key)) {
                startActivity(new Intent(this, MainActivity.class).putExtra("requestCapture", true));
            } else if ("a11y".equals(key)) {
                startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
            } else if ("write".equals(key)) {
                startActivity(new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS,
                        Uri.parse("package:" + getPackageName())));
            } else if ("battery".equals(key)) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } else if ("record".equals(key)) {
                if (Build.VERSION.SDK_INT >= 23) requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 61);
            } else if ("notify".equals(key)) {
                if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 62);
            } else if ("overlay".equals(key)) {
                Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } else if ("files".equals(key)) {
                if (Build.VERSION.SDK_INT >= 30) {
                    try {
                        startActivity(new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                                Uri.parse("package:" + getPackageName())));
                    } catch (Exception e) {
                        startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
                    }
                } else {
                    Toast.makeText(this, getString(R.string.perm_files_desc), Toast.LENGTH_LONG).show();
                }
            }
        } catch (Exception e) {
            Toast.makeText(this, getString(R.string.setup_manual), Toast.LENGTH_LONG).show();
        }
    }

    private void setStatus(String key, boolean ok, String okText, String badText) {
        View v = list.findViewWithTag("status_" + key);
        if (v instanceof TextView) {
            ((TextView) v).setText(ok ? "✓ " + okText : "✗ " + badText);
            ((TextView) v).setTextColor(ok ? Color.rgb(52, 211, 153) : Color.rgb(251, 191, 36));
        }
    }

    private void refresh() {
        boolean capture = AgentService.isCaptureReady();
        boolean a11y = a11yEnabled();
        boolean write = Settings.System.canWrite(this);
        boolean battery = batteryOk();
        boolean record = Build.VERSION.SDK_INT < 23 || checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        boolean notify = Build.VERSION.SDK_INT < 33 || checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        boolean overlay = Settings.canDrawOverlays(this);
        boolean files = Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager();
        setStatus("screen", capture, getString(R.string.perm_screen_ok), getString(R.string.perm_screen_bad));
        setStatus("a11y", a11y, getString(R.string.perm_a11y_ok), getString(R.string.perm_a11y_bad));
        setStatus("write", write, getString(R.string.perm_write_ok), getString(R.string.perm_write_bad));
        setStatus("battery", battery, getString(R.string.perm_battery_ok), getString(R.string.perm_battery_bad));
        setStatus("record", record, getString(R.string.perm_record_ok), getString(R.string.perm_record_bad));
        setStatus("notify", notify, getString(R.string.perm_notify_ok), getString(R.string.perm_notify_bad));
        setStatus("overlay", overlay, getString(R.string.perm_overlay_ok), getString(R.string.perm_overlay_bad));
        setStatus("files", files, getString(R.string.perm_files_ok), getString(R.string.perm_files_bad));
        int ready = (capture ? 1 : 0) + (a11y ? 1 : 0) + (write ? 1 : 0) + (battery ? 1 : 0)
                + (record ? 1 : 0) + (notify ? 1 : 0) + (overlay ? 1 : 0) + (files ? 1 : 0);
        summary.setText(getString(R.string.setup_progress, ready) + "\n" + (ready == 8
                ? getString(R.string.setup_ready)
                : getString(R.string.setup_incomplete)));
    }
}
