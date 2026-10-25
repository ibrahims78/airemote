package com.airemote.agent;

import android.content.Intent;

/** Holds the MediaProjection permission result between the Activity and the Service. */
public class CaptureHolder {
    public static volatile int resultCode = 0;
    public static volatile Intent data = null;

    public static boolean ready() {
        return data != null && resultCode != 0;
    }
}
