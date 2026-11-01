'use strict'
/**
 * lib/coords.js — 3.9.4 (T1 — دقة التحكم)
 *
 * الإحداثيات في AiRemote تمرّ بثلاثة فضاءات مختلفة، والخلط بينها هو سبب
 * «النقرة تصل إلى مكان آخر»:
 *
 *   1) فضاء العميل: كسر 0..1 منسوب إلى مستطيل الـcanvas المعروض
 *      (packages/dashboard/src/components/ScreenViewer.tsx).
 *   2) فضاء الشاشة الملتقطة: بكسل فيزيائي داخل شاشة واحدة، أصله أعلى-يسار
 *      تلك الشاشة (وليس أعلى-يسار سطح المكتب).
 *   3) فضاء سطح المكتب الافتراضي: ما يقبله SetCursorPos؛ أصله أعلى-يسار
 *      الشاشة الأساسية، فيصير أصل أي شاشة أخرى غير صفري (وقد يكون سالباً).
 *
 * الخطأ في 3.9.3: تحويل (1) → (3) بضرب الكسر في العرض/الارتفاع فقط، أي
 * إسقاط أصل الشاشة، فتقع كل نقرة على الشاشة الأساسية. هذه الوحدة تفصل
 * الحساب عن Electron لتُختبر بلا تشغيل التطبيق.
 */

/** يحصر الكسر في [0,1]؛ أي قيمة غير رقمية تصبح 0 (سلوك 3.9.3 نفسه). */
function clamp01 (value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/**
 * المستطيل الفيزيائي لشاشة داخل فضاء سطح المكتب الافتراضي.
 *
 * @param {{bounds:{x:number,y:number,width:number,height:number}, size:{width:number,height:number}, scaleFactor?:number}} display
 * @param {(win:null, rect:object) => object} [dipToScreenRect]  screen.dipToScreenRect إن توفّرت (Electron ≥ 30)
 * @returns {{x:number,y:number,width:number,height:number}}
 */
function displayPhysicalRect (display, dipToScreenRect) {
  const bounds = (display && display.bounds) || { x: 0, y: 0, width: 0, height: 0 }
  const size = (display && display.size) || { width: bounds.width, height: bounds.height }

  if (typeof dipToScreenRect === 'function') {
    try {
      const rect = dipToScreenRect(null, bounds)
      if (rect && rect.width > 0 && rect.height > 0) {
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      }
    } catch {}
  }

  // احتياطي: البُعد الفيزيائي = DIP × معامل التحجيم. صحيح تماماً عند 100%،
  // ومطابق لتعدد الشاشات المتساوية التحجيم. الاختلاف يظهر فقط عند خلط
  // نسب تحجيم مختلفة، وهي الحالة التي تغطيها dipToScreenRect.
  const sf = (display && display.scaleFactor) || 1
  return {
    x: Math.round((bounds.x || 0) * sf),
    y: Math.round((bounds.y || 0) * sf),
    width: Math.round((size.width || 0) * sf),
    height: Math.round((size.height || 0) * sf),
  }
}

/**
 * كسر 0..1 داخل شاشة → نقطة مطلقة في فضاء سطح المكتب الافتراضي.
 * تُحصر النقطة داخل حدود الشاشة كي لا تهبط نقرة على الحافة على شاشة مجاورة.
 */
function toAbsolutePoint (point, rect) {
  const x = clamp01(point && point.x)
  const y = clamp01(point && point.y)
  const r = rect || { x: 0, y: 0, width: 1, height: 1 }
  const width = Math.max(1, Math.round(r.width))
  const height = Math.max(1, Math.round(r.height))
  const px = Math.round(r.x || 0) + Math.round(x * width)
  const py = Math.round(r.y || 0) + Math.round(y * height)
  return {
    x: Math.min(px, Math.round(r.x || 0) + width - 1),
    y: Math.min(py, Math.round(r.y || 0) + height - 1),
  }
}

module.exports = { clamp01, displayPhysicalRect, toAbsolutePoint }
