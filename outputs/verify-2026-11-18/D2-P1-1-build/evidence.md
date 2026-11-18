# D2-P1-1 — تنصيص مسار electron-builder (فشل البناء بمسار فيه فراغ)

**التاريخ:** 2026-11-18 · **الجهاز:** ويندوز 10 19045 · المستودع بمسار فيه فراغ: `D:\autoclaw projects-new\AiRemote`

## العيب
`scripts/run-electron-builder.cjs` كان يستدعي `spawnSync(found, args, { shell: true })` بلا تنصيص.
على ويندوز ينفّذ node الأمر عبر `cmd.exe /d /s /c "…"` فيُقسَّم المسار عند أول فراغ:

```
packages/agent-desktop build$ node ../../scripts/run-electron-builder.cjs --win --x64
'd:\autoclaw' is not recognized as an internal or external command
Failed → ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL (exit 1)
```

(مُلتقط أثناء فحص `pnpm -r build` في جولة التشخيص 2026-11-18.)

## الإصلاح
تنصيص مسار الـ`.CMD` وأي وسيط يحوي فراغات قبل تمريرها للقشرة — `scripts/run-electron-builder.cjs:20-30`.

## الإثبات (بعد الإصلاح، نفس المسار بلا تغيير بيئة)
1. `node ../../scripts/run-electron-builder.cjs --version` → `24.13.3` ✅
2. `node ../../scripts/run-electron-builder.cjs --win --x64 --dir` →
   ```
   • electron-builder  version=24.13.3 os=10.0.19045
   • packaging  platform=win32 arch=x64 electron=28.3.3
     appOutDir=…\releases\agent-windows\win-unpacked
   ```
   المخرجات: `AiRemote Agent.exe` + `resources/app.asar` موجودة ✅ (مجلد win-unpacked متجاهل في git)

## النتيجة
`pnpm -r build` لم تعد تنكسر عند agent-desktop على مسارات ويندوز المحتوية فراغات.
