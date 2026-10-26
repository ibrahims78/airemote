package com.airemote.agent;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.provider.Settings;
import android.text.method.ScrollingMovementMethod;

public class Prefs {
    private static final String NAME = "airemote-agent";

    public static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences(NAME, Context.MODE_PRIVATE);
    }

    public static String server(Context c) {
        return sp(c).getString("server", "ws://192.168.0.176:3001/ws");
    }

    public static String token(Context c) {
        return sp(c).getString("token", "");
    }

    private static boolean bootstrapped = false;

    /**
     * v3.7.0 — provisioning: if nothing is configured yet, read
     * &lt;external files dir&gt;/airemote-config.json ({"server":"wss://...","token":"..."}).
     * Allows fleet/lab deployment without typing on the device.
     */
    public static void bootstrap(Context c) {
        if (bootstrapped) return;
        bootstrapped = true;
        try {
            SharedPreferences p = sp(c);
            if (!p.getString("token", "").isEmpty() && !p.getString("server", "").isEmpty()) return;
            java.io.File dir = c.getExternalFilesDir(null);
            if (dir == null) return;
            java.io.File f = new java.io.File(dir, "airemote-config.json");
            if (!f.exists()) return;
            java.io.FileInputStream in = new java.io.FileInputStream(f);
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            org.json.JSONObject o = new org.json.JSONObject(new String(out.toByteArray(), "UTF-8"));
            String server = o.optString("server", "");
            String token = o.optString("token", "");
            if (!server.isEmpty() && !token.isEmpty()) {
                save(c, server, token);
            }
        } catch (Exception ignored) {
        }
    }

    public static void save(Context c, String server, String token) {
        sp(c).edit().putString("server", server).putString("token", token).apply();
    }

    // ── v1.2.0 — control password (same model as the Windows agent) ──
    public static void saveControlPassword(Context c, String pw) {
        if (pw == null || pw.trim().isEmpty()) {
            sp(c).edit().remove("ctrlSalt").remove("ctrlHash").apply();
            return;
        }
        try {
            byte[] salt = new byte[16];
            new java.security.SecureRandom().nextBytes(salt);
            String saltHex = toHex(salt);
            String hash = sha256(saltHex + ":" + pw.trim());
            sp(c).edit().putString("ctrlSalt", saltHex).putString("ctrlHash", hash).apply();
        } catch (Exception ignore) { }
    }

    public static boolean hasControlPassword(Context c) {
        String h = sp(c).getString("ctrlHash", "");
        return h != null && !h.isEmpty();
    }

    public static boolean verifyControlPassword(Context c, String pw) {
        try {
            String saltHex = sp(c).getString("ctrlSalt", "");
            String hash = sp(c).getString("ctrlHash", "");
            if (saltHex.isEmpty() || hash.isEmpty()) return false;
            return hash.equals(sha256(saltHex + ":" + (pw == null ? "" : pw).trim()));
        } catch (Exception e) { return false; }
    }

    private static String sha256(String s) throws Exception {
        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
        return toHex(md.digest(s.getBytes("UTF-8")));
    }

    private static String toHex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
