package com.airemote.agent;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Accessibility-based control service: tap, swipe, type, click-by-name, global keys. */
public class AiRemoteA11y extends AccessibilityService {

    public static volatile AiRemoteA11y I = null;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        I = this;
        MainActivity.log("خدمة التحكم (إمكانية الوصول) متصلة ✓");
        try { if (AgentService.INSTANCE != null) AgentService.INSTANCE.sendCapabilities(); } catch (Exception ignore) { }
    }

    @Override
    public void onDestroy() {
        if (I == this) I = null;
        super.onDestroy();
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) { }
    @Override public void onInterrupt() { }

    /** Runs one AICTL action; called from a worker thread, executed on the main thread. */
    public static String runSync(JSONObject action) {
        final AiRemoteA11y svc = I;
        if (svc == null) return "a11y-not-enabled";
        String act = action.optString("action", "").toLowerCase();
        if (act.equals("wait")) {
            int s = action.optInt("seconds", 2);
            try { Thread.sleep(Math.min(Math.max(s, 1), 20) * 1000L); } catch (InterruptedException ignore) { }
            return "waited " + s + "s";
        }
        final String[] out = new String[] { "?" };
        final CountDownLatch latch = new CountDownLatch(1);
        MAIN.post(() -> {
            try {
                out[0] = svc.perform(action);
            } catch (Exception e) {
                out[0] = "error: " + e.getMessage();
            } finally {
                latch.countDown();
            }
        });
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) return "timeout";
        } catch (InterruptedException e) {
            return "interrupted";
        }
        return out[0];
    }

    private String perform(JSONObject o) throws Exception {
        String act = o.optString("action", "").toLowerCase();
        int x = o.optInt("x", 0), y = o.optInt("y", 0);
        int x2 = o.optInt("x2", 0), y2 = o.optInt("y2", 0);
        int amount = o.optInt("amount", -3);
        String text = o.optString("text", "");
        String key = o.optString("key", "").toLowerCase();

        switch (act) {
            case "click": {
                tap(x, y);
                return "clicked " + x + "," + y;
            }
            case "dclick": {
                tap(x, y);
                MAIN.postDelayed(() -> tap(x, y), 180);
                return "dclicked " + x + "," + y;
            }
            case "rclick": {
                longPress(x, y);
                return "long-pressed " + x + "," + y;
            }
            case "move":
                return "move " + x + "," + y + " (noop on Android)";
            case "drag": {
                Path p = new Path();
                p.moveTo(x, y);
                p.lineTo(x2, y2);
                GestureDescription g = new GestureDescription.Builder()
                        .addStroke(new GestureDescription.StrokeDescription(p, 0, 320))
                        .build();
                dispatchGesture(g, null, null);
                return "dragged " + x + "," + y + " -> " + x2 + "," + y2;
            }
            case "scroll": {
                int w = getResources().getDisplayMetrics().widthPixels;
                int h = getResources().getDisplayMetrics().heightPixels;
                int cx = w / 2;
                int step = Math.min(Math.abs(amount) * 220, h / 2);
                Path p = new Path();
                if (amount < 0) { p.moveTo(cx, h * 2 / 3); p.lineTo(cx, h * 2 / 3 - step); }
                else { p.moveTo(cx, h / 3); p.lineTo(cx, h / 3 + step); }
                GestureDescription g = new GestureDescription.Builder()
                        .addStroke(new GestureDescription.StrokeDescription(p, 0, 260))
                        .build();
                dispatchGesture(g, null, null);
                return "scrolled " + amount;
            }
            case "append": {
                AccessibilityNodeInfo focus2 = findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                if (focus2 == null) focus2 = findFirstEditable();
                if (focus2 == null) return "append: no editable field";
                CharSequence cur = focus2.getText();
                String merged = (cur == null ? "" : cur.toString()) + text;
                Bundle ab = new Bundle();
                ab.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, merged);
                boolean ok2 = focus2.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, ab);
                return ok2 ? "appended" : "append failed";
            }
            case "keybackspace": {
                AccessibilityNodeInfo f3 = findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                if (f3 == null) f3 = findFirstEditable();
                if (f3 == null) return "backspace: no field";
                CharSequence cs3 = f3.getText();
                String s3 = cs3 == null ? "" : cs3.toString();
                if (s3.length() > 0) s3 = s3.substring(0, s3.length() - 1);
                Bundle b3 = new Bundle();
                b3.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, s3);
                f3.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b3);
                return "backspace";
            }
            case "keyenter": {
                AccessibilityNodeInfo f4 = findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                if (f4 == null) f4 = findFirstEditable();
                if (f4 == null) return "enter: no field";
                CharSequence cs4 = f4.getText();
                Bundle b4 = new Bundle();
                b4.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, (cs4 == null ? "" : cs4.toString()) + "\n");
                f4.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b4);
                return "enter";
            }
            case "type": {
                AccessibilityNodeInfo focus = findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                if (focus == null) focus = findFirstEditable();
                if (focus == null) return "type: no editable field";
                Bundle args = new Bundle();
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
                boolean ok = focus.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
                return ok ? "typed " + text.length() + " chars" : "type failed";
            }
            case "autorotate": {
                if (Build.VERSION.SDK_INT >= 23 && !Settings.System.canWrite(this)) {
                    return "write-settings-not-granted";
                }
                boolean enabled = o.optBoolean("enabled", true);
                boolean ok = Settings.System.putInt(getContentResolver(),
                        Settings.System.ACCELEROMETER_ROTATION, enabled ? 1 : 0);
                return ok ? ("auto-rotate " + (enabled ? "on" : "off")) : "auto-rotate failed";
            }
            case "rotate": {
                if (Build.VERSION.SDK_INT >= 23 && !Settings.System.canWrite(this)) {
                    return "write-settings-not-granted";
                }
                int current = Settings.System.getInt(getContentResolver(),
                        Settings.System.USER_ROTATION, 0);
                int next = (current + 1) % 4;
                // USER_ROTATION only takes effect when the accelerometer is
                // disabled; 0=0°, 1=90°, 2=180°, 3=270°.
                Settings.System.putInt(getContentResolver(),
                        Settings.System.ACCELEROMETER_ROTATION, 0);
                boolean ok = Settings.System.putInt(getContentResolver(),
                        Settings.System.USER_ROTATION, next);
                return ok ? ("rotated " + next) : "rotate failed";
            }
            case "screenoff": {
                if (Build.VERSION.SDK_INT >= 28) {
                    performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN);
                    return "screen-off";
                }
                return "screen-off-not-supported";
            }
            case "key": {
                if (key.equals("back")) { performGlobalAction(GLOBAL_ACTION_BACK); return "back"; }
                if (key.equals("home")) { performGlobalAction(GLOBAL_ACTION_HOME); return "home"; }
                if (key.equals("recents") || key.equals("apps") || key.equals("meta") || key.equals("win") || key.equals("os")) { performGlobalAction(GLOBAL_ACTION_RECENTS); return "recents"; }
                if (key.equals("notifications")) { performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS); return "notifications"; }
                return "key not supported: " + key;
            }
            case "focus":
            case "clickname": {
                String needle = text.isEmpty() ? key : text;
                if (needle.isEmpty()) return act + ": needs text";
                AccessibilityNodeInfo node = findNodeByText(needle);
                if (node == null) {
                    // try launching an app package if it looks like one
                    if (needle.contains(".")) {
                        boolean launched = openApp(needle);
                        return launched ? "launched " + needle : "name-not-found";
                    }
                    return "name-not-found";
                }
                AccessibilityNodeInfo clickable = node;
                for (int i = 0; i < 6 && clickable != null; i++) {
                    if (clickable.isClickable()) break;
                    clickable = clickable.getParent();
                }
                if (clickable != null && clickable.isClickable()) {
                    clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    return "invoked";
                }
                Rect r = new Rect();
                node.getBoundsInScreen(r);
                tap(r.centerX(), r.centerY());
                return "invoked (gesture)";
            }
            case "closeapp": {
                performGlobalAction(GLOBAL_ACTION_BACK);
                MAIN.postDelayed(() -> { try { performGlobalAction(GLOBAL_ACTION_BACK); } catch (Exception ignore) { } }, 450);
                return "close (back x2)";
            }
            case "openapp": {
                String pkg = text.isEmpty() ? key : text;
                boolean launched = openApp(pkg);
                return launched ? "launched " + pkg : "app-not-found";
            }
            case "info": {
                int w = getResources().getDisplayMetrics().widthPixels;
                int h = getResources().getDisplayMetrics().heightPixels;
                String pkg = "?";
                try {
                    AccessibilityNodeInfo root = getRootInActiveWindow();
                    if (root != null) pkg = String.valueOf(root.getPackageName());
                } catch (Exception ignore) { }
                return "screen=" + w + "x" + h + " pkg=" + pkg;
            }
            default:
                return "unknown action: " + act;
        }
    }

    private void tap(int x, int y) {
        Path p = new Path();
        p.moveTo(x, y);
        GestureDescription g = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(p, 0, 60))
                .build();
        dispatchGesture(g, null, null);
    }

    private void longPress(int x, int y) {
        Path p = new Path();
        p.moveTo(x, y);
        GestureDescription g = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(p, 0, 650))
                .build();
        dispatchGesture(g, null, null);
    }

    private boolean openApp(String pkg) {
        try {
            android.content.Intent li = getPackageManager().getLaunchIntentForPackage(pkg.trim());
            if (li == null) return false;
            li.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(li);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private AccessibilityNodeInfo findFirstEditable() {
        try {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) return null;
            ArrayDeque<AccessibilityNodeInfo> q = new ArrayDeque<>();
            q.add(root);
            int guard = 0;
            while (!q.isEmpty() && guard++ < 4000) {
                AccessibilityNodeInfo n = q.poll();
                if (n == null) continue;
                try {
                    if (n.isEditable()) return n;
                } catch (Exception ignore) { }
                for (int i = 0; i < n.getChildCount(); i++) {
                    AccessibilityNodeInfo c = n.getChild(i);
                    if (c != null) q.add(c);
                }
            }
        } catch (Exception ignore) { }
        return null;
    }

    private AccessibilityNodeInfo findNodeByText(String needle) {
        String n = needle.toLowerCase();
        // focused window first
        try {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            AccessibilityNodeInfo hit = scanTree(root, n);
            if (hit != null) return hit;
        } catch (Exception ignore) { }
        // all windows
        try {
            List<android.view.accessibility.AccessibilityWindowInfo> wins = getWindows();
            if (wins != null) {
                for (android.view.accessibility.AccessibilityWindowInfo w : wins) {
                    try {
                        AccessibilityNodeInfo hit = scanTree(w.getRoot(), n);
                        if (hit != null) return hit;
                    } catch (Exception ignore) { }
                }
            }
        } catch (Exception ignore) { }
        return null;
    }

    private AccessibilityNodeInfo scanTree(AccessibilityNodeInfo root, String needleLower) {
        if (root == null) return null;
        ArrayDeque<AccessibilityNodeInfo> q = new ArrayDeque<>();
        q.add(root);
        int guard = 0;
        while (!q.isEmpty() && guard++ < 6000) {
            AccessibilityNodeInfo node = q.poll();
            if (node == null) continue;
            try {
                CharSequence t = node.getText();
                CharSequence d = node.getContentDescription();
                String s = (t != null ? t.toString() : "") + " " + (d != null ? d.toString() : "");
                if (!s.trim().isEmpty() && s.toLowerCase().contains(needleLower)) {
                    return node;
                }
            } catch (Exception ignore) { }
            try {
                for (int i = 0; i < node.getChildCount(); i++) {
                    AccessibilityNodeInfo c = node.getChild(i);
                    if (c != null) q.add(c);
                }
            } catch (Exception ignore) { }
        }
        return null;
    }
}
