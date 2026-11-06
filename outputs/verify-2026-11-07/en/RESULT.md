# English leak check — live 3.14.0 server (2026-11-07)

Measured with `shot-surface.cjs --lang en` against `https://127.0.0.1:3001`;
the counter reads Arabic characters in `document.body.innerText` after load.

| route | Arabic chars in EN |
|---|---:|
| `/` | **0** |
| `/devices` | **0** |
| `/sessions` | **0** |
| `/settings` | **0** |
| `/audit` | **0** |
| `/users` | **0** |
| `/notifications` | **0** |
| `/ai` | **0** |
| `/help` | 19,689 — the guide is Arabic by decision, and the language switch is hidden there |

Result: zero Arabic on every operational route with the language set to EN.
