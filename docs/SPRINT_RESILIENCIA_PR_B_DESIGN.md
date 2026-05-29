# Sprint Resiliencia — PR B: Status page interna + healthcheck externo

> **Estado:** diseño detallado. NO implementado. **Independiente** de PR D y PR C (puede ir en cualquier orden).
> **Autor:** Claude Code · 28-may-2026.

---

## Contexto

El outage del 27-may (`docs/INCIDENTES/2026-05-27-kiosk-checkout-outage-12h.md`) **pasó desapercibido 12 horas** — se descubrió a la mañana siguiente por el efecto (orphans), no por una alerta. Causas:

- **No hay monitoring propio.** Nadie supo que el backend estaba caído hasta que los empleados no pudieron checar.
- **`status.railway.com` no detecta sub-incidentes que SÍ afectan a FTS.** Mayo cerró 99.11% "verde" mientras FTS sufría 12h de caída de su instancia. El status público mide la plataforma agregada, no tu contenedor.
- Se necesita **observabilidad propia + alerta proactiva**.

> *"We have to own our uptime."* — Vasilios Syrakis (Atlassian/Statuspage). El proveedor reporta SU disponibilidad agregada; la disponibilidad que sienten TUS usuarios es responsabilidad tuya de medir.

PR B entrega dos capas complementarias: **(1) healthcheck externo** (alguien fuera de Railway que vigila y avisa) y **(2) status page interna** (dashboard propio con métricas de negocio + histórico para forense).

---

## Parte 1 — Healthcheck externo (UptimeRobot)

Un vigía **fuera** de la infraestructura de FTS. Si Railway entero cae (incluido un health-check interno alojado ahí), el externo igual avisa. Esta es la pieza que faltó el 27-may.

### Setup (manual de Esteban)

Cuenta en https://uptimerobot.com (free tier: 50 monitores / 5 min / SMS limitado — suficiente para FTS hoy).

**Monitor 1 — Webhook `kiosk/empleados`** (el latido del backend)
- URL: `https://primary-production-5c3c.up.railway.app/webhook/kiosk/empleados`
- Method: POST · Body: `{"company_id":1}` · Header: `Content-Type: application/json`
- Interval: 5 min · Keyword esperado: `empleados` · Alert: **SMS + email**

**Monitor 2 — GitHub Pages frontend**
- URL: `https://yinyo1.github.io/fts-suite/operaciones/kiosk/`
- Method: GET · Interval: 5 min · Keyword: `FTS` o `kiosk` · Alert: email

**Monitor 3 — Odoo SaaS**
- URL: `https://serviciosfts.odoo.com/web/login`
- Method: GET · Interval: 5 min · Keyword: `Odoo` · Alert: email

> Nota técnica: UptimeRobot free hace HTTP(S) con keyword. El Monitor 1 (POST con body) es el más valioso — valida la cadena completa kiosk→n8n→Odoo (el webhook hace lookup en Odoo). Si responde con `empleados`, todo el stack está vivo.

### Política de alertas (escalonada)

| Condición | Acción |
|---|---|
| Down 2× consecutivo (~10 min) | SMS + email a Esteban |
| Down 4× consecutivo (~20 min) | + WhatsApp vía Twilio (si se integra) |
| Recovery | email de confirmación |

### Trade-off vs alternativas

| Servicio | Pros | Contras | Costo |
|---|---|---|---|
| **UptimeRobot** | Free generoso (50 mon.) | SMS limitado/mes | **$0** |
| BetterStack | UI superior, status page incluida | 10 monitores free | $0–$25/mes |
| Pingdom | Enterprise-grade | Caro | $15+/mes |
| Uptime Kuma (self-host) | Control total, gratis | **se hostea aparte** (NO en Railway — defeats the purpose) | ~$5/mes en otro proveedor |

**Recomendación:** **UptimeRobot** para arrancar (costo $0, cubre la necesidad). Evaluar **BetterStack** si más adelante se quiere una status page pública bonita sin construirla. ⚠️ NO usar Uptime Kuma en el mismo Railway — un vigía dentro de la cosa que vigila no sirve para outages de la plataforma.

---

## Parte 2 — Status page interna FTS

Complementa al externo: añade **métricas de negocio** (no solo up/down) e **histórico para forense** (los 14 días de logs de PR A más un rolling propio).

### Frontend
- **Path:** `shared/admin/status.html` (NUEVO) — link desde el panel admin de Esteban.
- Vanilla HTML/CSS/JS (mismo stack del repo, sin framework).
- Fetch `shared/admin/health-history.json` on load + auto-refresh cada 60 s.
- Botón "🔄 Validar todos los servicios ahora" → dispara el workflow health-check vía webhook manual.

### Backend — workflow nuevo `admin/health-check`
- Trigger: **Schedule** (`*/5 * * * *`) + Webhook (validación manual).
- Pasos:
  1. POST `kiosk/empleados` → latency + status.
  2. GET Odoo `/web/login` → latency + status.
  3. Odoo aggregate `hr.attendance` `check_out=false` → **orphans count**.
  4. Fetch `shared/incidencias-asistencia.json` → count por `status`.
  5. Fetch `shared/config/empleados-master.json` → `_meta.generated_at` (last_sync).
  6. (Opcional) n8n internal API → workflows con error en últimas 24h.
  7. Build payload de métricas + timestamp.
  8. GitHub PUT `shared/admin/health-history.json` (array rolling, **máx 288 entries** = 24h × 12/h).
  9. Si métrica crítica fuera de rango → WhatsApp a Esteban.

### Mockup ASCII (con datos reales de hoy 28-may)

```
┌─────────────────── FTS · Estado del Sistema ───────────────────┐
│  Actualizado: 28-may 18:05 CST · auto-refresh 60s   [🔄 Validar]│
├─────────────────────────────────────────────────────────────────┤
│  SERVICIOS                                                       │
│   🟢 Webhook kiosk/empleados      200 · 0.34s · uptime 24h 100% │
│   🟢 Webhook kiosk/estado          200 · 0.28s · uptime 24h 100% │
│   🟢 Odoo SaaS                     200 · 0.51s · uptime 24h 100% │
│   🟢 GitHub Pages                  200 · 0.12s · uptime 24h 100% │
│   🟢 n8n (Railway)                 healthy · v2.50.0            │
├─────────────────────────────────────────────────────────────────┤
│  UPTIME 24h    ████████████████████████████████████████  100%   │
│                (el 27-may esta barra habría mostrado 50% rojo)   │
├─────────────────────────────────────────────────────────────────┤
│  NEGOCIO (hoy)                                                   │
│   👥 Empleados activos        40   (JSON master sync 12:53 ✓)   │
│   ✅ Check-ins hoy            27                                 │
│   🚪 Check-outs hoy           — (jornada en curso)              │
│   🔴 Orphans abiertos          2   ⚠️  (umbral alerta: >3)      │
│   📋 Incidencias pendientes    pendiente_rh: 11 · sup: 4        │
├─────────────────────────────────────────────────────────────────┤
│  PENDIENTES OPERATIVOS                                          │
│   • 2 orphans sin cerrar (Mario 116 baja, Enoc 128) → RH        │
│   • Queue offline: 0 items (PR C no desplegado aún)             │
└─────────────────────────────────────────────────────────────────┘
```

> Los datos del mockup son los reales de esta sesión (40 activos, 27 check-ins, ~2-3 orphans, 51 incidencias). En producción se poblan del `health-history.json`.

---

## Métricas tracked

**Uptime (% 24h):** webhooks empleados / checkin / sos / estado-empleado · Odoo · GitHub Pages.
**Latency (p50, p95):** mismos endpoints.
**Negocio:** empleados activos (vs JSON master) · check-ins/check-outs hoy · orphans abiertos · incidencias por status.
**Alertas internas configuradas:**
- Latency p95 > 5 s
- Uptime < 99% en últimas 4h
- Orphans > 3 abiertos
- Sync no ejecutado en > 24h (`_meta.generated_at` viejo)
- (con PR C) Queue offline > 5 items o item > 2h viejo

---

## Tests E2E

| # | Escenario | Esperado |
|---|---|---|
| 1 | health-check corre cada 5 min | `health-history.json` gana 1 entry/5min; máx 288 |
| 2 | `status.html` renderiza con datos reales | servicios + negocio correctos; sin errores consola |
| 3 | UptimeRobot dispara alerta al apagar n8n | SMS+email en ≤10 min (2 ciclos) |
| 4 | Recovery refleja en `status.html` | luz vuelve a verde en ≤60 s (próximo refresh) |
| 5 | Auto-refresh tras 1h idle | sigue refrescando (no se congela) |
| 6 | Validación manual | botón dispara health-check on-demand, actualiza al instante |

---

## Estimación

| Tarea | Tiempo |
|---|---|
| UptimeRobot setup (manual Esteban) | 15 min |
| Workflow `admin/health-check` | 1.5 h CC |
| Frontend `status.html` | 1.5 h CC |
| Testing | 30 min CC |
| **Total** | **3.5 h CC + 15 min Esteban** |

---

## Plan de rollout (3 fases)

**Fase 1 (día 1):** crear workflow `admin/health-check`, activar cron 5 min, validar que genera `health-history.json` correcto.
**Fase 2 (día 2):** crear `status.html`, iterar UI con Esteban, runbook de interpretación.
**Fase 3 (día 3):** Esteban configura UptimeRobot, validar alertas (apagar webhook a propósito), SOP de respuesta a alertas.

## Dependencias

- **PR A** (retención logs Railway) ✅ ya aplicado — da el histórico de 14 días que complementa el rolling de 24h.
- **PR D / PR C NO son pre-requisitos.** PR B es independiente — puede arrancar primero si se prioriza visibilidad.

## Riesgos

- **GitHub API rate limit:** PUT cada 5 min = 288/día. Con PAT autenticado el límite es 5000/h → holgadísimo. ✓
- **Crecimiento `health-history.json`:** ~288 entries × ~180 bytes ≈ 50 KB/24h con rolling. OK.
- **SMS free tier UptimeRobot:** limitado/mes → email como canal primario, SMS solo para `down 2x`.
- **El health-check vive en Railway:** si Railway cae, el health-check interno también → por eso el **externo (UptimeRobot) es la red de seguridad real**. El interno aporta métricas de negocio, no es el vigía de último recurso.

## Métricas de éxito post-PR B

| Métrica | Antes (27-may) | Después (target) |
|---|---|---|
| Tiempo de detección de outage | 12h (mañana siguiente) | **< 15 min** (UptimeRobot 2 ciclos) |
| Visibilidad del estado del sistema | consola F12 ad-hoc | **dashboard URL** |
| Datos para forense | logs podados/perdidos | **histórico 24h + 14 días Railway** |
| Alertas proactivas | 0 | **SMS + email** (+ WhatsApp opcional) |
```
