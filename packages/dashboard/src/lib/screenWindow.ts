/**
 * 3.12.4 — نقطة فتح واحدة لنافذة الشاشة المستقلة.
 *
 * قبلها كان كل سطح يفتح النافذة باسم ومقاس مختلفين
 * (1400×900 في خمسة مواضع، و1280×820 في دردشة AI).
 */
export const SCREEN_WINDOW_WIDTH = 1400
export const SCREEN_WINDOW_HEIGHT = 900

/** اسم النافذة: جهاز واحد = نافذة واحدة (إعادة الفتح تُعيد التركيز). */
export function screenWindowName(deviceId: string): string {
  return `airemote-stream-${deviceId}`
}

/** يفتح نافذة العرض المستقلة ويعيد مرجعها (أو null إن منعها المتصفح). */
export function openScreenWindow(deviceId: string, params?: { rt?: string; rk?: string; access?: string }): Window | null {
  if (!deviceId) return null
  // 3.16.8 — a session ticket must travel with the pop-out, or the new window lands on /login.
  const q = new URLSearchParams()
  if (params?.rt) q.set('rt', params.rt)
  if (params?.rk) q.set('rk', params.rk)
  if (params?.access) q.set('access', params.access)
  const qs = q.toString()
  const url = `/view/${encodeURIComponent(deviceId)}${qs ? '?' + qs : ''}`
  const features = `width=${SCREEN_WINDOW_WIDTH},height=${SCREEN_WINDOW_HEIGHT}`
  return window.open(url, screenWindowName(deviceId), features)
}
