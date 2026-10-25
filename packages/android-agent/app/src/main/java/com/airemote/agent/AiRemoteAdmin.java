package com.airemote.agent;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

/** Minimal device-admin receiver used only for force-lock (screen-off) support. */
public class AiRemoteAdmin extends DeviceAdminReceiver {
    @Override
    public void onEnabled(Context context, Intent intent) {
        Toast.makeText(context, "تم تفعيل إدارة الجهاز لإطفاء الشاشة", Toast.LENGTH_SHORT).show();
    }
}
