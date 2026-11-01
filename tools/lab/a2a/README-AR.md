# tools/lab/a2a — أدوات اختبار وكيل↔وكيل (3.9.4 → 3.9.9)

أُضيفت أثناء إغلاق ميزة التحكم وكيل↔وكيل. كلها **أدوات مختبر**، لا تُشحن مع المنتج.

## المتطلبات

- PowerShell 5.1 على المضيف، وNode 24.
- بيانات ضيف الـVMs في `%APPDATA%\AiRemote\lab-credentials.txt` (مفتاحا `vm_guest_user` · `vm_guest_password`).
- `adb` من سلسلة الأدوات offline (انظر `docs/ANDROID-TOOLCHAIN-AND-KEY-AR.md`).
- **لا تُطبع أي سرّ**: `vmguest.cjs` يُنقّي رسائل الخطأ (المستخدم/كلمة المرور) قبل عرضها.

## أدوات الضيف (VM)

| الملف | الغرض |
|---|---|
| `vmguest.cjs` | تشغيل أوامر/سكربتات داخل WIN10/WIN11 عبر `vmrun` مع تنقية الأخطاء. `probe` · `start-agent` · `ps <vm> <file.ps1>` · `shot [vm]` |
| `dims.ps1` | أبعاد سطح المكتب الافتراضي (`WxH @x,y`) |
| `cursor.ps1` | موضع مؤشّر الضيف |
| `guestshot.ps1` | لقطة شاشة للضيف |
| `bootcheck.ps1` | زمن الإقلاع + زمن بدء الوكيل + مفتاح Run |
| `runkey.ps1` | مفاتيح Run وعدد عمليات الوكيل |
| `check-startup.ps1` | إعدادات الوكيل في المجلدين + مصادر التشغيل التلقائي |
| `sync-cfg.ps1` | توحيد `serverUrl` بين مجلدَي الإعداد |
| `enable-trace.ps1` | تثبيت `AIRREMOTE_INPUT_DEBUG=1` على مستوى المستخدم |
| `start-agent.ps1` | تشغيل الوكيل مع وراثة متغيّر السجل |
| `swap-debug.ps1` | تبديل `app.asar` + تشغيل مع سجل الإدخال |
| `probe-full.ps1` · `probe-form.ps1` | نافذة قياس نقرات (ملء/صغيرة) |
| `reset-log.ps1` | تصفير `clicks.txt` في الضيف |

## اختبارات (Node)

| الملف | ما يقيسه |
|---|---|
| `create-session.cjs` | إنشاء جلسة TECNO→WIN10 وقبولها |
| `t-control-proof.cjs` | **إثبات حتمي بلا هاتف:** جلسة كجهاز → تذكرة → مقبس → move/click/keys → أثر الوكيل + المؤشّر |
| `t-touch-map.cjs` | ما يصِل WebView من إحداثيات عند نقاط فيزيائية معروفة |
| `t-centre-tap.cjs` | نقرة على مركز الـcanvas (يتوقع 0.5,0.5 ومؤشّراً في المركز) |
| `t-textpad.cjs` · `t-final-control-text.cjs` | حقل النص: فتح/كتابة/إرسال + أثر المفاتيح |
| `t-devices-ui.cjs` | واجهة «الأجهزة» في تطبيق أندرويد |
| `t-android-forward.cjs` | هل يصل فأرة/مفتاح إلى وكيل أندرويد؟ |
| `t-home-key.cjs` | تحكم ويندوز→أندرويد بمفتاح Home |
| `t-screen-err.cjs` | رسائل JSON من السيرفر (سبب إغلاق الجلسة) |
| `t9-t10.cjs` | T9 (الخلفية) وT10 (التدوير) |
| `cdp-probe.cjs` · `cdp-detail.cjs` · `cdp-scripts.cjs` | فحص داخل WebView عبر CDP |
| `patch.cjs` | ترقيع نصي آمن (يرفض التكرار أو الانكماش) |
| `bbox.py` | مستطيل المحتوى غير الأسود في لقطة |

## تشغيل سريع

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
node tools\lab\devs.cjs                     # يجب أن تظهر الأجهزة الأربعة online
node tools\lab\a2a\create-session.cjs       # تجهيز جلسة TECNO→WIN10
node tools\lab\a2a\t-touch-map.cjs          # قياس إسقاط اللمس
node tools\lab\a2a\t-control-proof.cjs      # إثبات مسار التحكم كاملاً (بلا هاتف)
```

## حقائق مثبتة (لا تُعاد من الصفر)

- `injectMouse` يتوقع كسراً 0..1 ويضيف أصل الشاشة الفيزيائي (`packages/agent-desktop/lib/coords.js`).
- أوامر عرض الجلسة على الهاتف تُوسم بجلسة التذكرة لا بجلسة الجهاز (3.9.8).
- وكيل أندرويد يحتاج **إذن التقاط الشاشة** في كل تشغيل للتطبيق؛ بدونه يُغلق السيرفر الجلسة.
- أثر الإدخال: `%APPDATA%\airemote-agent-desktop\input-trace.log` (ويندوز) — يتطلب `AIRREMOTE_INPUT_DEBUG=1`.
- سجل دورة حياة الشاشة في السيرفر: `%TEMP%\airemote-screen.log`.
