# Sprint Resiliencia — Resumen Ejecutivo

> 3 PRs de diseño para blindar el kiosk contra el tipo de outage que ocurrió el 27-may-2026. **Solo diseño — nada implementado todavía.** Esteban revisa y decide.

## Contexto

El **27-may-2026** un outage de backend (~18:16 CST → 06:28 CST, ~12h) dejó **23 de 29 empleados** con `hr.attendance` abierto toda la noche. Pasó **desapercibido 12h** y produjo **11 turnos fantasma de ~24h** sin flag. Forense completo: `docs/INCIDENTES/2026-05-27-kiosk-checkout-outage-12h.md` (ya en `main`).

El sprint ataca las 3 capas que fallaron: **el kiosk mentía** (mostraba éxito sin backend), **perdía el dato** (sin cola offline) y **nadie se enteró** (sin monitoring).

## Los 4 PRs (orden de implementación)

### PR D — Hardening errores + Fix "Seguí en turno"
- **Esfuerzo:** 3–3.5h CC · **Prioridad:** 🔴 ALTA (síntoma inmediato)
- **Hallazgo clave:** el confirm screen ("✓ SALIDA") se renderiza **ANTES** del POST a n8n; el catch del POST solo hace `console.warn` → el empleado ve éxito falso. Además, "Seguí en turno" cierra a la hora actual → turnos fantasma 24h.
- **Diseño:** `docs/SPRINT_RESILIENCIA_PR_D_DESIGN.md` (301 líneas)

### PR C — Queue offline del checkout
- **Esfuerzo:** 6–7h CC · **Prioridad:** 🔴 ALTA (causa raíz)
- **Hallazgo clave:** preservar `ts_evento` (hora REAL del evento, no del replay) mata el turno fantasma y recupera el dato perdido.
- **Dependencia:** requiere **PR D mergeado primero** (contrato `client_tx_id` / `encolarTransaccionFallida`).
- **Diseño:** `docs/SPRINT_RESILIENCIA_PR_C_DESIGN.md` (253 líneas)

### PR B — Status page interna + healthcheck externo
- **Esfuerzo:** 3.5h CC + 15 min Esteban · **Prioridad:** 🟡 MEDIA (visibilidad proactiva)
- **Hallazgo clave:** `status.railway.com` cerró mayo 99.11% "verde" mientras FTS caía 12h — necesitamos un vigía **externo** propio.
- **Independiente:** NO requiere D ni C.
- **Diseño:** `docs/SPRINT_RESILIENCIA_PR_B_DESIGN.md`

### PR E — Cron auto-cierre 2am (NUEVO en este update)
- **Esfuerzo:** ~5h CC · **Prioridad:** 🟠 MEDIA-ALTA (complementa PR C)
- **Hallazgo clave:** el queue offline (PR C) solo ayuda a quien **regresa** al kiosk. PR E cierra automáticamente los attendances de empleados que **NO vuelven** (caso Mario 116, Enoc 128, Ricardo 98 del 27-may, que siguen abiertos porque nunca re-checaron).
- **Independiente:** NO requiere D / C / B.
- Ya estaba en el roadmap original como **Bloque B** (cron 2am pendiente).
- **Diseño:** `docs/SPRINT_RESILIENCIA_PR_E_DESIGN.md` (stub — *diseño detallado en próxima iteración*)

## Esfuerzo total

- **Claude Code:** ~17–19h distribuidas en los 4 PRs.
- **Esteban:** ~30 min (UptimeRobot + validaciones manuales en browser).

## Orden recomendado

1. **PR D** — resuelve el síntoma inmediato del 27-may (UI honesta + no más turnos fantasma).
2. **PR C** — resuelve la causa (preserva el dato durante outages). Depende de D.
3. **PR B** — visibilidad proactiva. Independiente; puede adelantarse si se prioriza monitoring.
4. **PR E** — red de seguridad nocturna para quien no regresa. Independiente; cierra el caso que C no cubre.

## Decisiones que Esteban debe tomar antes de implementar

**PR D**
1. ¿Textos UX exactos por tipo de error? (4-5 propuestos en el doc §1.3)
2. ¿Reemplazar el `alert()` legacy de `confirmarOlvideCheckout` por el modal unificado? (recomendado sí)

**PR C**
1. ¿Encolar sin `foto_base64`? (recomendado, por storage; la selfie diferida pierde valor)
2. Reconciliación con auto-rescate: ¿corrección automática del auto-cierre o revisión RH? (MVP propone revisión RH)
3. ¿Activación opt-in default-OFF (recomendado, hallazgo #14) u opt-out?

**PR B**
1. ¿UptimeRobot o BetterStack?
2. ¿Status page privada (solo admin) o pública?
3. ¿Quién recibe alertas? (solo Esteban, o también Felipe/Ana?)

## Plan calendario propuesto

**Semana 1 (2–6 jun)**
- Lun: Esteban revisa diseños + cierra decisiones abiertas.
- Mar–Mié: Implementar PR D (3.5h) + validar en producción.
- Jue–Vie: Implementar PR C parte 1 (3h).

**Semana 2 (9–13 jun)**
- Lun–Mar: PR C parte 2 + testing (4h) + validación producción.
- Mié–Jue: Implementar PR B (3.5h).
- Vie: UptimeRobot + validación de alertas (apagar webhook a propósito).

**Semana 3 (16–20 jun)**
- Lun–Mar: Diseño detallado + implementación PR E (cron auto-cierre 2am, ~5h).
- Mié: Validación (sembrar orphan, esperar/disparar cron, verificar cierre +9.6h + TAG + incidencia).

**Meta: kiosk resiliente end-to-end + red de seguridad nocturna en ~3 semanas.**

## Rollback general

Cada PR trae su propio rollback:
- PR D/C: `git revert <commit>` + push + bump `KIOSK_BUILD`. PR C además tiene kill-switch `offlineQueueEnabled=0` sin redeploy.
- PR B: desactivar cron del workflow + quitar link a `status.html`. Workflows n8n versionados.

## Métricas de éxito conjuntas (D + C + B + E)

| Escenario | Antes (27-may) | Después |
|---|---|---|
| Outage 12h backend | 23 empleados afectados, 12h sin datos | 0 afectados, demora de sync invisible |
| Empleado ante un fallo | "✓" falso (creía que checó) | UI honesta: "en cola / no se registró" |
| Detectar el outage | 12h (día siguiente) | < 15 min (UptimeRobot) |
| Turno fantasma 24h | 11 generados | imposible (`ts_evento`) |
| **Empleado NO regresa** (Mario, Enoc, Ricardo) | orphan abierto indefinido → corrección manual RH | cron 2am lo cierra a +9.6h + TAG + incidencia (PR E) |
| Forense post-incidente | logs podados/perdidos | 14 días retención + histórico 24h |

## Estado actual al cierre 28-may

✅ Variables Railway de retención aplicadas (logs 14 días)
✅ Forense outage 27-may documentado (PR #47 merged)
✅ Incidencia validación Ricardo creada (PR #48 merged)
✅ Empleados-master.json refrescado (42→40, sync on-change)
✅ 4 docs de diseño en este branch, listos para revisión (PR E como stub)

⏳ Worker + Redis Railway crashed (apagar por etapas — recomendación dada, no urgente)
⏳ UptimeRobot setup (parte de PR B)
⏳ Auditoría: 6 empleados activos en Odoo fuera del roster kiosk (filtro `company_id`) — no urgente

> **Nota de precisión (sobre el recovery del 27-may):** de los 23 orphans, 21 se "sanearon" automáticamente — pero **solo 10 con datos limpios** (auto-rescate +9.6h + incidencia para RH). Los otros **11 quedaron con turnos fantasma de ~24h sin flag** (vía "Seguí en turno") y 2 siguen abiertos. Es decir: el recovery actual *cerró* los registros pero NO con horas reales. Por eso PR C (preservar `ts_evento`) y PR D (fix "Seguí en turno") son ALTA prioridad: el saneo actual disfraza el problema, no lo resuelve.
