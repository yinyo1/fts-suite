# Línea base de la Capa 2 · 2026-10-15

Salida de `node tests/auth/navegador-paridad.js` sobre `main` en `c91fd70` (los archivos de auth no cambian desde `1172012`).
Se generó con datos de prueba: usuarios clásicos con contraseñas `prueba-<usuario>`, sesiones Suite sembradas con los
scopes de `../suite_usuarios.snapshot.json` y un `ops-config.json` falso, con un token falso adentro. **Aquí no hay
ninguna credencial real.**

- `resultado.json`: grilla (celdas que no coinciden), P-01…P-15, pageerrors, red bloqueada e índice de capturas.
- `grilla.md`: las 480 celdas leídas del DOM; las que no coinciden con la Capa 1 llevan ❌.
- `capturas/`: lanzador (login, Esteban, Montalvo) y `shared/login.html?falta=` a 380, 760, 900 y 1280 px.

Resultado: **478/480 celdas iguales al modelo.** Las 2 diferencias son reales y no son de esta prueba: Nómina usa la
misma llave `fts_suite_session` que SuiteAuth, pero exige `expires_at` donde SuiteAuth guarda `exp`. Una sesión de
`shared/login.html` no abre Nómina, y la sesión que deja el login de Nómina no abre Comercial (P-07). La Capa 1 las
cuenta como «abre» porque modela el permiso, no el formato. Se reporta en #419 y no se arregla aquí.

Para re-generarla: `node tests/auth/navegador-paridad.js` (escribe en esta carpeta) o `SALIDA=/tmp/x node …`.
