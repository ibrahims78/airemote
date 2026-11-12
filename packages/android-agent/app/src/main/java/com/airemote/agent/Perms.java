package com.airemote.agent;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;

/**
 * 3.16.16 — مصدر واحد لجاهزية الصلاحيات الثماني.
 * يستخدمه معالج التهيئة وبطاقة التهيئة في الشاشة الرئيسية،
 * حتى لا يختلف الرقم بين الشاشتين.
 */
final class Perms {

    private Perms() { }

    static boolean screen(Context c) {
        return AgentService.isCaptureReady();
    }

    static boolean a11y(Context c) {
        int enabled = 0;
        try {
            enabled = Settings.Secure.getInt(c.getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED);
        } catch (Exception ignore) { }
        String services = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        return enabled == 1 && services != null
                && services.contains(c.getPackageName() + "/" + AiRemoteA11y.class.getName());
    }

    static boolean write(Context c) {
        return Settings.System.canWrite(c);
    }

    static boolean battery(Context c) {
        try {
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName());
        } catch (Exception ignore) {
            return false;
        }
    }

    static boolean record(Context c) {
        return Build.VERSION.SDK_INT < 23
                || c.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean notify(Context c) {
        return Build.VERSION.SDK_INT < 33
                || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean overlay(Context c) {
        return Settings.canDrawOverlays(c);
    }

    static boolean files(Context c) {
        return Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager();
    }

    static int readyCount(Context c) {
        return (screen(c) ? 1 : 0) + (a11y(c) ? 1 : 0) + (write(c) ? 1 : 0) + (battery(c) ? 1 : 0)
                + (record(c) ? 1 : 0) + (notify(c) ? 1 : 0) + (overlay(c) ? 1 : 0) + (files(c) ? 1 : 0);
    }
}
