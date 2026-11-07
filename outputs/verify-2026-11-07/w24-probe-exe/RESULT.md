# w24 — مسبار الضيوف `patch-probe.exe` (§4.1) — 2026-11-07

`patch-probe.exe --root <repo> --out <dir> --exe "<agent.exe>" --audit`

| المكان | `buttons` | `candidates` | `clicked` | `vanished` | `threw` | `exceptions` | الخروج |
|---|---:|---:|---:|---:|---:|---:|---|
| `host/` | 68 | 50 | **50** | 0 | 0 | **0** | 0 |
| `win10/` | 68 | 50 | **50** | 0 | 0 | **0** | 0 |
| `win11/` | 68 | 50 | **50** | 0 | 0 | **0** | 0 |

- التوزيع: `status=20 · ai=9 · viewers=8 · log=13` · مستثنى 18 (`window-chrome 12 · destructive 4 · disabled 2`).
- `mismatched` 13/14: فرق **ترتيب الاسم** بين `labelAt` والتعداد، لا زرّ بلا اسم (بوابة a11y = 0).
- الضيفان: `runProgramInGuest -interactive` · `-EncodedCommand` · `probeBytes=93,532,160` مؤكَّد في WIN11.

## الملفات
| الملف | ما هو |
|---|---|
| `host/agent-audit.json` · `run-stdout.txt` | تدقيق المضيف + سطره الملخِّص |
| `win10/agent-audit.json` · `stdout.txt` · `exit.txt` | تدقيق WIN10-VM + رمز الخروج |
| `win11/agent-audit.json` · `stdout.txt` · `exit.txt` | تدقيق WIN11-VM + حجم المسبار ووجود الوكيل |

## البناء
`node scripts/build-probe-exe.cjs` ⇒ `releases/tools/patch-probe.exe` · 93,532,160 بايت · Node v24.20.0 مدموج · `--self-test` = `ok:true`.
`postject` من `%TEMP%\sea-tools` (خارج شجرة المنتج). الملف **متجاهَل في git** كبقية الحزم.
