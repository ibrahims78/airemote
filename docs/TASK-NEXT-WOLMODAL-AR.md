# مهمة جاهزة للتنفيذ — تحويل `WolModal` إلى `Modal` (R6)

**الملف:** `packages/dashboard/src/pages/DevicesPage.tsx` · **النطاق:** الأسطر 11–106
**القاعدة:** لا تُعدّل شيئاً آخر في الملف. النافذة الثانية `AgentInstallModal` تبدأ من السطر 107 وتُترك لالتزام منفصل.

---

## 1. ما هو موجود الآن (متحقَّق بالقراءة)

- غلاف: `div.fixed inset-0 bg-black/60 …` ثم `div.glass rounded-2xl w-full max-w-sm`.
- ترويسة (44–61): أيقونة `Zap` داخل `w-9 h-9 bg-warning/15`، عنوان `Wake-on-LAN`، سطر `device.name`، زر `X`.
- نموذج: `<form onSubmit={handleSend} className="p-5 space-y-4">` وفيه حقلا MAC وBroadcast.
- نتيجة: `div` ملوّن يدوياً (`bg-success/10` أو `bg-danger/10`).
- ذيل (≈96–104): زر `type="submit"` بعرض كامل + `</form></div></div>`.

## 2. التعديل المطلوب (استبدال دقيق)

**أ) الاستيراد:** في سطر `components/ui` أضف `Alert, Button, Modal`. وتحقق أن `X` ما زال مستخدماً في `AgentInstallModal` قبل حذفه.

**ب) الترويسة:** احذف الغلافين وكتلة الترويسة، وضع مكانها:

```tsx
<Modal
  open
  onClose={onClose}
  title="Wake-on-LAN"
  description={device.name}
  size="sm"
  footer={<>
    <Button onClick={onClose}>{t('cancel')}</Button>
    <Button variant="primary" type="submit" form="wol-form" loading={sending} disabled={!mac.trim()} icon={<Zap size={14} />}>
      {sending ? t('wol_sending') : t('wol_send')}
    </Button>
  </>}
>
  <form id="wol-form" onSubmit={handleSend} className="space-y-4">
```

**ج) الذيل:** احذف زر `type="submit"` القديم كاملاً، وأغلق بـ`</form></Modal>`.

**د) نتيجة الإرسال:**

```tsx
<Alert tone={result.ok ? 'success' : 'danger'}>{result.msg}</Alert>
```

## 3. معيار القبول

- [ ] لا وجود لـ`fixed inset-0` داخل `WolModal`.
- [ ] Esc يُغلق، والتركيز يعود إلى زر الفتح، والصفحة لا تُمرَّر تحته.
- [ ] `npx tsc --noEmit` = 0 و`npx vite build` ناجح.
- [ ] لقطة `/devices` فاتحة وداكنة تُظهر النافذة بنفس عقد `PasswordModal`.
- [ ] التزام واحد: `feat(ui): R6 - WolModal moves to the shared Modal`.

## 4. بعدها

`AgentInstallModal` (السطر 107) — الأكبر: يحتوي كتل أوامر ونسخ؛ يُنفَّذ بنفس النمط مع إبقاء النسخ كما هو، ثم `AiPage`/`SetupPage`.
