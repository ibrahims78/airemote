package com.airemote.agent;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

/**
 * 3.11.3 — حوار «طلب اتصال بجهازك» كنشاط مستقل.
 *
 * لماذا: الحوار كان يُعرض على MainActivity فقط عندما تكون «في المقدمة»، ولو كانت
 * الحالة قديمة (أو كانت نشاطاً آخر في الأعلى) لا يراه المستخدم إطلاقاً ويبقى
 * الطلب معلّقاً — بلاغ متكرر من WIN11→TECNO بوضع الملفات.
 * هذا النشاط يُطلق من الخدمة (وهي خدمة أمامية) فيظهر فوق أي شاشة.
 */
public class SessionOfferActivity extends Activity {

    private static final int REQ_CAP = 2001;
    private AlertDialog dlg = null;
    private String pendingSid = "";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        String js = getIntent() != null ? getIntent().getStringExtra("offerJson") : null;
        android.util.Log.d("AiR-Offer", "onCreate hasJson=" + (js != null && !js.isEmpty()) + " len=" + (js == null ? 0 : js.length()));
        if (js == null || js.isEmpty()) { finish(); return; }
        try {
            JSONObject offer = new JSONObject(js);
            final String sid = offer.optString("sessionId", "");
            if (sid.isEmpty()) { finish(); return; }
            JSONObject req = offer.optJSONObject("requester");
            String who = req != null ? req.optString("name", "جهاز") : "جهاز";
            String access = offer.optString("accessLabel", offer.optString("access", ""));
            long ms = offer.optLong("expiresInMs", 60000L);
            long secs = Math.round(ms / 1000.0);
            dlg = new AlertDialog.Builder(this)
                    .setTitle("طلب اتصال بجهازك")
                    .setMessage(who + " يطلب " + access + " — المهلة " + secs + " ثانية.")
                    .setPositiveButton("سماح", (d, w) -> {
                        // 3.11.5 — هدف أندرويد بلا إذن التقاط كان يبدأ الجلسة ثم يفشل البث فوراً
                        // («تفصل» بعد سماح). نطلب الإذن أولاً ثم نُرسل الموافقة.
                        if (CaptureHolder.ready()) {
                            AgentService.sendSessionDecision(sid, true);
                            finish();
                        } else {
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
                    })
                    .setNegativeButton("رفض", (d, w) -> { AgentService.sendSessionDecision(sid, false); finish(); })
                    .setCancelable(true)
                    .create();
            dlg.setOnCancelListener(d -> finish());
            dlg.show();
            // إغلاق تلقائي عند انتهاء المهلة حتى لا يبقى حوار عالق.
            new Handler(Looper.getMainLooper()).postDelayed(this::finish, ms + 1500);
        } catch (Exception e) {
            android.util.Log.e("AiR-Offer", "show failed", e);
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
        try { if (dlg != null) { dlg.dismiss(); dlg = null; } } catch (Exception ignore) { }
        super.onDestroy();
    }
}
