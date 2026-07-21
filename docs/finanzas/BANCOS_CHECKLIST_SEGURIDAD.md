# Checklist de seguridad — Instrumentos de pago (Bancos)

**Fecha:** 2026-07-20 · **Estado:** entregado junto al demo (Paso 6). **Modo Real GATEADO** (`IP_REAL_ENABLED=false`) hasta que Dirección cierre este checklist.

Los puntos (a) y (c) son **propuestas** — decide Esteban. El punto (b) es un **barrido ejecutado**; abajo van los resultados reales.

---

## (a) Expiración corta del JWT + claims por rol — PROPUESTA

**Hoy:** el login de Finanzas (`auth/finanzas-login`, JWT HMAC-SHA256) emite un token con vida **8 h** y un solo usuario (`finanzas`). Cada endpoint `fin/*` revalida la firma + expiración (patrón probado en facturas/bills). El secreto vive server-side en Railway (`FINANZAS_JWT_SECRET`) — **nunca en el repo** (confirmado en el barrido (b)).

**Debilidad para Bancos:** 8 h es largo para una superficie que en el futuro **escribe** (conciliación). Y no hay noción de rol: cualquier sesión válida podría, el día que exista `fin/captura-conciliar`, disparar un write.

**Propuesta:**
1. **Expiración más corta** para la superficie Bancos: token de **1–2 h** con *refresh* transparente (re-login silencioso), en vez de 8 h. Los 3 endpoints actuales son de lectura, pero el hábito corto se hereda al de escritura.
2. **Claims por rol/scope** en el JWT. Añadir al payload:
   - `scope: ["bancos:read"]` para status/transacciones/dataset.
   - `scope: ["bancos:write"]` **solo** cuando exista `fin/captura-conciliar` (motor Fase 2), y **solo** para usuarios autorizados a conciliar.
   Cada endpoint valida el scope requerido (rechazo `403 SCOPE_INSUFFICIENT` si falta), no solo la firma.
3. **Usuarios reales por persona** (hoy hay un único `finanzas`). Para trazar quién concilia, migrar a credenciales por persona (Gera, Esteban…) con su `sub` en el token. Prerrequisito del write, no del read.

**Costo:** cambios acotados al workflow `auth/finanzas-login` (payload + expiración) y a un guard de scope reutilizable en los endpoints. No toca el front (el token viaja en el body igual).

---

## (b) Auditoría de secretos en TODO el historial git — EJECUTADO

Barrido con *pickaxe* (`git log -G/-S`) sobre **1,241 commits** (no solo HEAD). Patrones: llaves privadas, GitHub PAT, AWS `AKIA`, Slack `xox`, `FINANZAS_JWT_SECRET/USER_HASH/USER_SALT`, `SECRET/HMAC/API_KEY` con valor. **Los valores encontrados se reportan por ubicación, nunca su contenido.**

### Resultado por la superficie Finanzas/Bancos: **LIMPIA ✅**
- Los secretos del login (`FINANZAS_JWT_SECRET`, `FINANZAS_USER_HASH`, `FINANZAS_USER_SALT`) **nunca** se commitearon. En el historial solo aparecen los **nombres** de las env vars dentro de un doc (`docs/finanzas/PLAN.md`, commit `4467471`), describiendo que viven en Railway. Cero valores.
- **Ningún JSON de workflow con secretos** fue exportado al repo en toda la historia (regla CLAUDE.md §15 #3 respetada).
- Sin llaves privadas (`-----BEGIN`), sin AWS `AKIA`, sin Slack `xox`.
- Único match de PAT: un **placeholder** `GITHUB_TOKEN = ghp_xxxx…` en `operaciones/incidencias/n8n-webhook.md` (commit `0adfd72`) — documentación, no es un token real.

### Hallazgos ajenos a Bancos (preexistentes — reportados, no bloquean este entregable)
1. **`pmo/index.html` — HMAC hardcodeado VIVO en HEAD** (líneas ~999 y ~1687, `HARDCODED_SECRET`/`SECRET`). Es un secreto client-side en un repo público (GitHub Pages) → **cualquiera puede leerlo**. Ya estaba registrado como deuda (memoria `pmo-hmac-secret-cliente.md`). **Recomendación:** rotar + mover la validación a server-side (n8n), como hace Finanzas. Prioridad media-alta, tarea aparte.
2. **`docs/n8n-workflows/pmo-chat-apply-code-code-validar-auth.js`** — el `SECRET` ya fue **rotado a placeholder** en HEAD (`<SECRETO_HMAC_VIVE_EN_N8N_NO_COMMITEAR>`, 2026-07-17). El valor real **pre-rotación sigue en el historial** pero está **muerto** (ya se rotó). **Recomendación:** aceptable como está; purga total del historial (BFG / `git filter-repo`) es **opcional** — solo cosmético dado que la llave ya no sirve.

### Conclusión (b)
La integración de Bancos **no introduce ni expone ningún secreto** y su cadena de auth (secreto server-side, token en body) es el patrón correcto. Los 2 hallazgos son de PMO, preexistentes, y no bloquean el go-live de Bancos. Si se desea higiene total del historial, la purga con `git filter-repo` del secreto PMO muerto se puede agendar aparte.

---

## (c) Control de acceso (ej. Cloudflare Access) — PROPUESTA

**Hoy:** `finanzas/` es parte de un **GitHub Pages público** (`yinyo1.github.io/fts-suite/finanzas/`). Cualquiera con la URL llega al *login gate* (JWT). La única barrera es la contraseña de Finanzas. El código front es público por definición (Pages).

**Riesgo:** la superficie de ataque (fuerza bruta al login, fuzzing de endpoints) está expuesta a todo Internet. El lockout (5→15 min en `staticData`) mitiga, pero es la única defensa de red.

**Opciones (de menor a mayor esfuerzo):**
1. **Cloudflare Access (Zero Trust) delante de `/finanzas`** *(recomendada)* — gate a nivel de red **antes** de que cargue la app: solo emails/identidades autorizadas (Google Workspace / OTP) ven siquiera el login. El JWT de Finanzas queda como segundo factor. Requiere poner el dominio detrás de Cloudflare (o servir Finanzas desde un host propio proxied). Costo: config Zero Trust + posible cambio de hosting de la sección.
2. **Allowlist de IP / VPN** — restringir Finanzas a IPs de oficina + VPN. Simple pero rígido (rompe acceso remoto legítimo).
3. **Mover Finanzas fuera de Pages público** a un host con auth de plataforma (Cloudflare Pages con Access, o un contenedor tras Access). Más limpio a largo plazo; más trabajo.

**Recomendación:** opción 1 (Cloudflare Access) cuando se habilite el modo Real de Bancos — la conciliación toca dinero, amerita el gate de red. Mientras Bancos siga en demo, la exposición es nula (no hay datos reales servidos).

---

## Gate de liberación del modo Real (resumen)

Antes de flip `IP_REAL_ENABLED=true` + merge a main:
- [ ] (a) Decisión sobre expiración/claims del JWT (o aceptar 8h read-only como suficiente para v1).
- [ ] (b) ✅ Barrido de secretos — superficie Bancos limpia. (2 hallazgos PMO ajenos, opcionales.)
- [ ] (c) Decisión sobre control de acceso de red (Cloudflare Access u aceptar riesgo para read-only).
- [ ] Revisión visual del demo (Artifact) aprobada.
