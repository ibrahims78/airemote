package com.airemote.agent;

import android.app.Activity;
import android.app.Dialog;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * 3.11.3 — حوار «طلب اتصال بجهازك» كنشاط مستقل.
 * 3.14.1 — صار ورقة سفلية (PLAN §2.1): تُفتح وتُغلق باللمس خارجها، ولها زر إغلاق،
 *          ونصوصها من الموارد بلغتي التطبيق بدل نص عربي مكتوب في الكود.
 */
public class SessionOfferActivity extends Activity {

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

    private static final int REQ_CAP = 2001;
    private Dialog sheet = null;
    private String pendingSid = "";

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (android.os.Build.VERSION.SDK_INT >= 27) {
            try { setShowWhenLocked(true); setTurnScreenOn(true); } catch (Exception ignore) { }
        }
        String js = getIntent() != null ? getIntent().getStringExtra("offerJson") : null;
        if (js == null || js.isEmpty()) { finish(); return; }
        try {
            JSONObject offer = new JSONObject(js);
            final String sid = offer.optString("sessionId", "");
            if (sid.isEmpty()) { finish(); return; }
            JSONObject req = offer.optJSONObject("requester");
            String who = req != null ? req.optString("name", getString(R.string.offer_someone)) : getString(R.string.offer_someone);
            String access = offer.optString("accessLabel", offer.optString("access", ""));
            long ms = offer.optLong("expiresInMs", 60000L);
            showSheet(sid, who, access, Math.round(ms / 1000.0));
            new Handler(Looper.getMainLooper()).postDelayed(this::finish, ms + 1500);
        } catch (Exception e) {
            android.util.Log.e("AiR-Offer", "show failed", e);
            finish();
        }
    }

    /** الورقة السفلية: 18dp أعلى، مقبض، عنوان + إغلاق، الرسالة، ثم زرّان بعرض كامل. */
    private void showSheet(final String sid, String who, String access, long secs) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundResource(R.drawable.sheet_bg);
        root.setPadding(dp(18), dp(10), dp(18), dp(18));

        View grabber = new View(this);
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(dp(38), dp(4));
        gp.gravity = Gravity.CENTER_HORIZONTAL;
        gp.bottomMargin = dp(14);
        grabber.setBackgroundResource(R.drawable.sheet_grabber);
        root.addView(grabber, gp);

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);

        TextView title = new TextView(this);
        title.setText(R.string.offer_title);
        title.setTextSize(15f);
        title.setTextColor(getColor(R.color.app_ink));
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        head.addView(title, tp);

        TextView close = new TextView(this);
        close.setText("✕");
        close.setTextSize(17f);
        close.setTextColor(getColor(R.color.app_muted));
        close.setGravity(Gravity.CENTER);
        close.setContentDescription(getString(R.string.offer_close));
        close.setPadding(dp(8), 0, dp(8), 0);
        close.setOnClickListener(v -> finish());
        head.addView(close, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(32)));
        root.addView(head);

        TextView msg = new TextView(this);
        msg.setText(getString(R.string.offer_msg, who, access, secs));
        msg.setTextSize(12.5f);
        msg.setTextColor(getColor(R.color.app_muted));
        msg.setLineSpacing(dp(4), 1f);
        LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        mp.topMargin = dp(8);
        mp.bottomMargin = dp(16);
        root.addView(msg, mp);

        TextView allow = new TextView(this);
        allow.setText(R.string.offer_allow);
        allow.setTextSize(13f);
        allow.setTextColor(0xFFFFFFFF);
        allow.setGravity(Gravity.CENTER);
        allow.setBackgroundResource(R.drawable.btn_primary);
        allow.setOnClickListener(v -> allow(sid));
        root.addView(allow, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(46)));

        TextView deny = new TextView(this);
        deny.setText(R.string.offer_deny);
        deny.setTextSize(13f);
        deny.setTextColor(getColor(R.color.app_ink2));
        deny.setGravity(Gravity.CENTER);
        deny.setBackgroundResource(R.drawable.btn_ghost);
        deny.setOnClickListener(v -> { AgentService.sendSessionDecision(sid, false); finish(); });
        LinearLayout.LayoutParams dp2 = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(46));
        dp2.topMargin = dp(8);
        root.addView(deny, dp2);

        sheet = new Dialog(this);
        sheet.requestWindowFeature(Window.FEATURE_NO_TITLE);
        sheet.setContentView(root);
        sheet.setCanceledOnTouchOutside(true);
        sheet.setOnCancelListener(d -> finish());
        Window w = sheet.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT));
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.gravity = Gravity.BOTTOM;
            lp.width = ViewGroup.LayoutParams.MATCH_PARENT;
            lp.height = ViewGroup.LayoutParams.WRAP_CONTENT;
            lp.dimAmount = 0.45f;
            w.setAttributes(lp);
            w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        }
        sheet.show();
    }

    /** السماح: نطلب إذن الالتقاط أولًا إن لم يكن جاهزًا (3.11.5). */
    private void allow(String sid) {
        if (CaptureHolder.ready()) {
            AgentService.sendSessionDecision(sid, true);
            finish();
            return;
        }
        pendingSid = sid;
        try {
            android.media.projection.MediaProjectionManager mgr =
                    (android.media.projection.MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
            startActivityForResult(mgr.createScreenCaptureIntent(), REQ_CAP);
        } catch (Exception e) {
            AgentService.sendSessionDecision(sid, true);
            finish();
        }
    }

    @Override
    protected void onActivityResult(int req, int res, android.content.Intent data) {
        if (req == REQ_CAP) {
            if (res == RESULT_OK && data != null) {
                CaptureHolder.resultCode = res;
                CaptureHolder.data = data;
                try { if (AgentService.INSTANCE != null) AgentService.INSTANCE.sendCapabilities(); } catch (Exception ignore) { }
                AgentService.sendSessionDecision(pendingSid, true);
            } else {
                AgentService.sendSessionDecision(pendingSid, false);
            }
            finish();
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    protected void onDestroy() {
        try { if (sheet != null) { sheet.dismiss(); sheet = null; } } catch (Exception ignore) { }
        super.onDestroy();
    }
}
