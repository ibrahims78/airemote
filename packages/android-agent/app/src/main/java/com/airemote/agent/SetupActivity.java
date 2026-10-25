package com.airemote.agent;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
        title.setText("تهيئة الوصول عن بُعد");
        title.setTextColor(Color.WHITE);
        title.setTextSize(24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        list.addView(title);

        TextView sub = new TextView(this);
        sub.setText("افتح كل صلاحية مرة واحدة. بعد ذلك تعمل كلمة مرور التحكم دون الحاجة إلى موافقة يدوية، مع بقاء قيود Android الأمنية.");
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

        addRow("التقاط الشاشة", "ضروري للبث", "screen");
        addRow("خدمة إمكانية الوصول", "ضروري للتحكم باللمس", "a11y");
        addRow("تعديل إعدادات النظام", "التدوير والإطفاء", "write");
        addRow("العمل في الخلفية", "يمنع تجميد الوكيل", "battery");
        addRow("الميكروفون", "مطلوب لالتقاط الصوت", "record");
        addRow("الإشعارات", "مطلوب للإشعار الدائم", "notify");
        addRow("الرسم فوق التطبيقات", "مطلوب لبعض أدوات الجلسة", "overlay");

        Button start = new Button(this);
        start.setText("تشغيل الوكيل الآن");
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
        close.setText("إغلاق");
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
        refresh();
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
        b.setText("فتح الإعداد");
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
            }
        } catch (Exception e) {
            Toast.makeText(this, "افتح الإعدادات يدوياً لهذه الصلاحية", Toast.LENGTH_LONG).show();
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
        setStatus("screen", capture, "جاهز", "غير ممنوح");
        setStatus("a11y", a11y, "مفعّلة", "غير مفعّلة");
        setStatus("write", write, "مسموح", "غير مسموح");
        setStatus("battery", battery, "مستثنى من توفير الطاقة", "قد يُجمّد في الخلفية");
        setStatus("record", record, "مسموح", "غير مسموح");
        setStatus("notify", notify, "مسموح", "غير مسموح");
        setStatus("overlay", overlay, "مسموح", "غير مسموح");
        int ready = (capture ? 1 : 0) + (a11y ? 1 : 0) + (write ? 1 : 0) + (battery ? 1 : 0)
                + (record ? 1 : 0) + (notify ? 1 : 0) + (overlay ? 1 : 0);
        summary.setText(ready + " من 7 صلاحيات جاهزة\n" + (ready == 7
                ? "الوكيل جاهز للتحكم عن بُعد."
                : "أكمل الصلاحيات الناقصة أعلاه، ثم أعد فتح هذه الشاشة للتأكد."));
    }
}
