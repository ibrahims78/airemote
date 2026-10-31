package com.airemote.agent;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 3.9.0 — أزرار «سماح/رفض» في إشعار طلب الجلسة. */
public class SessionActionReceiver extends BroadcastReceiver {
    public static final String ACTION_ACCEPT = "com.airemote.agent.SESSION_ACCEPT";
    public static final String ACTION_DENY = "com.airemote.agent.SESSION_DENY";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        String sessionId = intent == null ? null : intent.getStringExtra("sessionId");
        if (sessionId == null || sessionId.isEmpty()) return;
        boolean accept = ACTION_ACCEPT.equals(action);
        AgentService.sendSessionDecision(sessionId, accept);
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(sessionId.hashCode());
        } catch (Exception ignore) {}
    }
}
