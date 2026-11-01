/**
 * Unit — agent pointer coordinates (T1 / 3.9.4).
 * Run: node packages/agent-desktop/test/coords.test.cjs
 *
 * الغرض: قفل السلوك الصحيح لتحويل كسر 0..1 إلى نقطة مطلقة في فضاء سطح
 * المكتب الافتراضي، وإثبات أن الحالات القديمة (شاشة واحدة عند 0,0) لم تتغيّر.
 */
'use strict'
const path = require('path')
const { clamp01, displayPhysicalRect, toAbsolutePoint } = require(path.resolve(__dirname, '..', 'lib', 'coords.js'))

let failed = false
const check = (desc, cond) => { if (cond) console.log('PASS: ' + desc); else { console.error('FAIL: ' + desc); failed = true } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ── الحالة المرجعية: شاشة واحدة 1920×1080 عند 0,0 و100% — يجب ألا يتغيّر شيء
const primary = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 }
const primaryRect = displayPhysicalRect(primary)
check('primary rect is unchanged (0,0,1920,1080)', eq(primaryRect, { x: 0, y: 0, width: 1920, height: 1080 }))
check('centre of primary → 960,540', eq(toAbsolutePoint({ x: 0.5, y: 0.5 }, primaryRect), { x: 960, y: 540 }))
check('top-left of primary → 0,0', eq(toAbsolutePoint({ x: 0, y: 0 }, primaryRect), { x: 0, y: 0 }))

// ── شاشة ثانية على يمين الأساسية: الأصل ليس صفراً
const right = { bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 }
const rightRect = displayPhysicalRect(right)
check('right display origin = 1920', rightRect.x === 1920)
check('centre of right display → 2880,540 (was 960,540)', eq(toAbsolutePoint({ x: 0.5, y: 0.5 }, rightRect), { x: 2880, y: 540 }))

// ── شاشة على يسار الأساسية: أصل سالب
const left = { bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 }
const leftRect = displayPhysicalRect(left)
check('left display origin = -1920', leftRect.x === -1920)
check('centre of left display → -960,540', eq(toAbsolutePoint({ x: 0.5, y: 0.5 }, leftRect), { x: -960, y: 540 }))

// ── تحجيم 150% على شاشة واحدة: البُعد الفيزيائي 2880×1620
const scaled = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1.5 }
const scaledRect = displayPhysicalRect(scaled)
check('150% gives physical 2880x1620', scaledRect.width === 2880 && scaledRect.height === 1620)
check('150% centre → 1440,810', eq(toAbsolutePoint({ x: 0.5, y: 0.5 }, scaledRect), { x: 1440, y: 810 }))

// ── خلط نسب التحجيم: dipToScreenRect تتفوّق على الضرب
const mixed = { bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, size: { width: 1280, height: 1024 }, scaleFactor: 1.25 }
const viaDip = displayPhysicalRect(mixed, () => ({ x: 2400, y: 0, width: 1600, height: 1280 }))
check('dipToScreenRect wins when provided', eq(viaDip, { x: 2400, y: 0, width: 1600, height: 1280 }))
const viaFallback = displayPhysicalRect(mixed)
check('fallback still yields a non-zero origin (2400)', viaFallback.x === 2400)

// ── dipToScreenRect العاطلة لا تُسقط الحساب
const broken = displayPhysicalRect(primary, () => { throw new Error('nope') })
check('throwing dipToScreenRect falls back cleanly', eq(broken, { x: 0, y: 0, width: 1920, height: 1080 }))

// ── الحصر: قيم خارج [0,1] أو غير رقمية
check('clamp01(-0.5) = 0', clamp01(-0.5) === 0)
check('clamp01(2) = 1', clamp01(2) === 1)
check('clamp01(undefined) = 0', clamp01(undefined) === 0)
check('clamp01(NaN) = 0', clamp01(NaN) === 0)
check('x=1 stays inside the display (1919)', toAbsolutePoint({ x: 1, y: 1 }, primaryRect).x === 1919)
check('x=1 stays inside the display vertically (1079)', toAbsolutePoint({ x: 1, y: 1 }, primaryRect).y === 1079)
check('missing point → origin', eq(toAbsolutePoint(undefined, primaryRect), { x: 0, y: 0 }))

// ── التماثل: نفس الكسر على شاشتين متطابقتين يبعد بمقدار العرض
const a = toAbsolutePoint({ x: 0.25, y: 0.25 }, primaryRect)
const b = toAbsolutePoint({ x: 0.25, y: 0.25 }, rightRect)
check('same fraction differs by exactly one display width', b.x - a.x === 1920 && b.y === a.y)

if (failed) { console.error('\nCOORDS TESTS FAILED'); process.exit(1) }
console.log('\nALL COORDS TESTS PASSED (18 checks)')
