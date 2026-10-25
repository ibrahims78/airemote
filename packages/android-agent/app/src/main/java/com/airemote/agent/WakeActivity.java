package com.airemote.agent;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.view.WindowManager;

/**
 * Transparent, no-UI activity used to turn the display on and raise the app
 * above a non-secure keyguard when a remote viewer connects.
 *
 * Android deliberately does not let a normal app dismiss a secure PIN/password
 * keyguard. This activity therefore only performs the parts the platform
 * allows: wake the display and request dismissal when the keyguard is not
 * secure. A secure lock still requires the device owner to authenticate.
 */
public class WakeActivity extends Activity {
    private PowerManager.WakeLock wakeLock;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        try {
            if (Build.VERSION.SDK_INT >= 27) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
            } else {
                getWindow().addFlags(
                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                                | PowerManager.ACQUIRE_CAUSES_WAKEUP
                                | PowerManager.ON_AFTER_RELEASE,
                        "AiRemote:wake-activity");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(15000L);
            }
            if (Build.VERSION.SDK_INT >= 26) {
                KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                if (km != null && !km.isKeyguardSecure()) {
                    km.requestDismissKeyguard(this, null);
                }
            }
        } catch (Exception ignore) { }
        new Handler(Looper.getMainLooper()).postDelayed(this::finish, 1800L);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // requestDismissKeyguard() is ignored if it is called before the
        // activity has window focus (the common case when starting from a
        // service). Retry after the activity is actually visible. This only
        // dismisses a non-secure swipe keyguard; a PIN/password remains
        // protected by Android.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                if (Build.VERSION.SDK_INT >= 26) {
                    KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                    if (km != null && km.isKeyguardLocked() && !km.isKeyguardSecure()) {
                        km.requestDismissKeyguard(this, null);
                    }
                }
            } catch (Exception ignore) { }
        }, 650L);
    }

    @Override
    protected void onDestroy() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignore) { }
        wakeLock = null;
        super.onDestroy();
    }
}
