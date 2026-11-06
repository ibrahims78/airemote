'use strict'
/**
 * messages-en.js - English for every Arabic message the server can return.
 *
 * The API keeps `error` exactly as it was; an onSend hook adds `message_en`
 * when the Arabic text is in this table. Nothing is rewritten, so every
 * existing client keeps working.
 */
const MESSAGES_EN = {
  "غير مصرح بالوصول لهذا الجهاز": "Not allowed to access this device",
  "المالك أو المدير فقط يدير الجهاز": "Only the owner or an admin can manage this device",
  "غير مصرح بالوصول لهذه الجلسة": "Not allowed to access this session",
  "لا توجد جلسة بهذا المعرّف": "No session with this identifier",
  "لا يوجد جهاز بهذا المعرّف": "No device with this identifier",
  "غير مصرح بالوصول لهذا التسجيل": "Not allowed to access this recording",
  "بيانات الدخول غير صحيحة": "Wrong email or password",
  "الوصول مقفل مؤقتاً بعد محاولات فاشلة": "Access is locked for a while after failed attempts",
  "لا يوجد مستخدم بهذا المعرّف": "No user with this identifier",
  "الجهاز الهدف غير متصل": "The target device is offline",
  "غير مصرح بهذه القدرة على هذا الجهاز": "This capability is not granted on this device",
  "تذكرة جلسة غير صالحة": "The session ticket is not valid",
  "التذكرة لا تخص هذا الجهاز": "This ticket belongs to another device",
  "الجهاز غير موجود": "Device not found",
  "الجهاز غير متصل": "Device is offline",
  "المالك أو المدير فقط يضبط كلمة مرور الوصول": "Only the owner or an admin can set the access password",
  "لا توجد كلمة مرور لهذا الجهاز": "This device has no password",
  "كلمة مرور الجهاز يجب أن تكون 8 أحرف على الأقل": "The device password must be at least 8 characters",
  "كلمة المرور طويلة جداً": "The password is too long",
  "code أو deviceId مطلوب": "code or deviceId is required",
  "الوصول غير المراقب غير مُفعَّل لهذا الجهاز": "Unattended access is not enabled for this device",
  "كلمة مرور الجهاز غير صحيحة": "Wrong device password",
  "المالك أو المدير فقط يرى الصلاحيات": "Only the owner or an admin can view permissions",
  "المالك أو المدير فقط يمنح الصلاحيات": "Only the owner or an admin can grant permissions",
  "المالك يملك كل القدرات أصلاً": "The owner already has every capability",
  "المالك أو المدير فقط يسحب الصلاحيات": "Only the owner or an admin can revoke permissions",
  "تعذّر إرسال حزمة WOL: ": "Could not send the WOL packet: ",
  "وضع الملفات: تذكرة غير صالحة أو الجلسة ليست بوضع الملفات": "Files mode: the ticket is invalid or the session is not in files mode",
  "النقل غير موجود": "Transfer not found",
  "أمر محجوب بسياسة الوكيل: ": "Command blocked by the agent policy: ",
  "focus يحتاج عنوان النافذة في text": "focus needs the window title in text",
  "clickname يحتاج نصاً في text": "clickname needs text in text",
  "action غير مدعوم: ": "Unsupported action: ",
  "التوكن و Chat ID مطلوبان": "Token and chat ID are required",
  "التوكن غير صالح — تحقق من Bot Token": "Invalid token — check the bot token",
  "يتطلب مفتاح OpenAI — أو استخدم المزود المجاني: الرابط https://text.pollinations.ai بدون مفتاح": "An OpenAI key is required — or use the free provider at https://text.pollinations.ai with no key",
  "مفتاح API غير صالح (401)": "Invalid API key (401)",
  "خدمة OpenAI غير متاحة من منطقتك (403) — استخدم المزود المجاني: الرابط https://text.pollinations.ai بدون مفتاح": "OpenAI is not available in your region (403) — use the free provider at https://text.pollinations.ai",
  "مفتاح Z.ai API مطلوب": "A Z.ai API key is required",
  "مفتاح Z.ai غير صحيح (": "Wrong Z.ai key (",
  "مزود Z.ai مزدحم مؤقتاً (429) — الطبقة المجانية مضغوطة، أعد المحاولة بعد دقيقة": "Z.ai is busy (429) — the free tier is saturated, retry in a minute",
  "مفتاح API مطلوب": "An API key is required",
  "مفتاح Google غير صالح": "Invalid Google key",
  "مزود غير معروف: ": "Unknown provider: ",
  "هذا المسار للوكلاء": "This route is for agents",
  "access غير مدعوم": "Unsupported access value",
  "غير مصرح بهذا النوع من الوصول لهذا الجهاز": "This access type is not allowed on this device",
  "requesterDeviceId يجب أن يطابق الجهاز المصادق": "requesterDeviceId must match the authenticated device",
  "كلمة مرور الجهاز مطلوبة أو غير صحيحة": "The device password is required or wrong",
  "يوجد جلسة قائمة أو معلّقة على هذا الجهاز": "This device already has an active or suspended session",
  "سعة Relay ممتلئة": "Relay capacity is full",
  "قرار الجلسة لمالك الجهاز الهدف فقط": "Only the target device owner can decide",
  "الجلسة ليست بانتظار قرار": "The session is not awaiting a decision",
  "تذكرة العرض لجهاز الطالب فقط": "The view ticket is only for the requesting device",
  "الجلسة غير نشطة": "The session is not active"
}

module.exports = { MESSAGES_EN }
