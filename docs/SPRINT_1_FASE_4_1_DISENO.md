# Sprint 1 Sub-fase 4.1 — Diseño "Nueva Incidencia" multi-step

**Fecha:** 2026-05-12 (sesión nocturna)
**Branch:** `sprint-1/fase-4-1-modal-multi-step`
**Alcance:** modal multi-step base + 2 tipos funcionales (`olvido_entrada` + `olvido_checkout`) + 5 stub

---

## Findings del audit

### Hub Mi Perfil (`shared/mi-perfil/index.html`)
- Login PIN+selfie → dashboard con cards
- Cards activas: "Mis Incidencias", "Panel de Incidencias" (conditional)
- Cards stub: Recibos, Vacaciones, Documentos, Datos personales
- **NO existe** botón / card "Nueva Incidencia". Hay que agregarla.

### Workflow `xVNp36` (`crear-olvido-entrada`)
- Endpoint: `POST /webhook/incidencias/crear-olvido-entrada`
- Payload obligatorio: `empleado_id`, `empleado_nombre`, `motivo` (≥10), `hora_declarada_cst` (HH:MM), `hora_real_checkin_utc` (ISO UTC)
- Opcional: `attendance_id_creado`, `geolocation`, `foto_base64`
- Response: `{success, id_interno, status, mensaje, ...}`

### Workflow `5SW15h` (`crear-olvido-checkout`)
- Endpoint: `POST /webhook/incidencias/crear-olvido-checkout`
- Payload obligatorio: `empleado_id`, `attendance_id`, `hora_propuesta_cst` (HH:MM), `motivo` (≥10)
- Opcional: `geolocation`, `cliente_build`
- Response: `{success, id_interno, status, mensaje, ...}`

### Kiosk flow (consumidor existente)
- olvido_entrada en kiosk: PIN + face + geo + SO → checkin normal → POST incidencia paralela
- olvido_checkout en kiosk: modal hora + motivo → POST directo (sin re-verificar identidad)
- **Decisión:** Mi Perfil reusa los MISMOS endpoints con MISMO payload schema. El kiosk no se toca.

---

## Decisión de arquitectura: página nueva vs overlay modal

**Elegido: página nueva** `shared/mi-perfil/nueva-incidencia/index.html`.

Razones:
- Consistencia con patrón existente (`mis-incidencias/`, `panel-incidencias/` son páginas, no overlays).
- Mejor UX mobile (full-screen wizard sin clip).
- Más simple sin overlay z-index ni gestión de focus trap.
- localStorage draft funciona sin acoplamiento al hub.

---

## Estructura de la página

```
┌─────────────────────────────────────┐
│ Topbar: ← Volver · Nueva Incidencia │
├─────────────────────────────────────┤
│                                     │
│ STEP 1 — Tipo                       │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ │ Olvido  │ │ Olvido  │ │ Vacac.  │ │
│ │ entrada │ │ salida  │ │ 🏖️      │ │
│ │ 📝      │ │ 📝      │ │ próx.   │ │
│ └─────────┘ └─────────┘ └─────────┘ │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ │ Permiso │ │ Permiso │ │ Incap.  │ │
│ │ goce 🤝 │ │ sin goce│ │ 🏥      │ │
│ │ próx.   │ │ ⚠️ próx.│ │ próx.   │ │
│ └─────────┘ └─────────┘ └─────────┘ │
│ ┌─────────┐                         │
│ │ HE ⏰   │                         │
│ │ próx.   │                         │
│ └─────────┘                         │
│                                     │
└─────────────────────────────────────┘

STEP 2 (varía por tipo)
  - olvido_entrada / olvido_checkout:
    * Auto-fetch open attendance via /webhook/kiosk/estado-empleado
    * Si NO hay attendance pendiente para el tipo → mensaje "no aplica"
    * Si SÍ:
      - Muestra: "Tu última jornada abierta empezó el [fecha] a las [hora]"
      - Input HH:MM time picker para hora declarada
      - Textarea motivo ≥10 chars
  - 5 stub: muestra "Esta función estará disponible en Sub-fase 4.X" + botón "OK"

STEP 3 — Confirmación
  - Resumen visual
  - Botón "Crear incidencia"

POST-SUBMIT — Toast success
  - Redirige a mis-incidencias con highlight de la nueva
```

---

## Selfie / foto

**Sub-fase 4.1: SKIP.** Los workflows xVNp36 y 5SW15h aceptan `foto_base64` como **opcional**. En 4.1 no enviamos foto desde Mi Perfil (el kiosk sí la envía). Esto reduce ~150 líneas de código y deja Sub-fase 4.3 (incapacidad obligatoria) como el lugar correcto para introducir la captura de fotos en Mi Perfil.

---

## Estado intermedio (localStorage)

Key: `fts_nueva_inc_draft_<empleado_id>`
```json
{
  "step": 2,
  "tipo": "olvido_entrada",
  "form": { "hora": "07:00", "motivo": "..." },
  "savedAt": 1736832012000
}
```

TTL 24h. Cleanup automático al cargar la página si > 24h o si `step === 3` ya completado.

---

## Tipos stub — 5 cards "Próximamente"

| Tipo | Badge | Sub-fase target |
|------|-------|-----------------|
| `vacaciones` | Próximamente 4.2 | Sub-fase 4.2 |
| `permiso_con_goce` | Próximamente 4.2 | Sub-fase 4.2 |
| `permiso_sin_goce` | Próximamente 4.2 | Sub-fase 4.2 |
| `incapacidad_medica` | Próximamente 4.3 | Sub-fase 4.3 |
| `tiempo_extra_pre_autorizado` | Próximamente 4.4 | Sub-fase 4.4 |

Click → modal informativo "Esta función estará disponible en Sub-fase X" + botón cerrar. NO permite avanzar.

---

## Wiring con mi-perfil hub

Agregar nueva card primaria en `shared/mi-perfil/index.html` dashboard:

```html
<a class="mp-card mp-card-primary mp-card-nueva" href="nueva-incidencia/">
  <div class="mp-card-icon">➕</div>
  <div class="mp-card-title">Nueva Incidencia</div>
  <div class="mp-card-sub">Captura vacaciones, permisos, olvidos y más.</div>
</a>
```

La card "Mis Incidencias" sigue donde está (consultar estado de ya enviadas).

---

## Compatibilidad con kiosk

- **NO se modifica `operaciones/kiosk/js/kiosk.js`.**
- Los endpoints n8n no cambian.
- El payload schema es idéntico a lo que kiosk envía hoy.
- Workflows pre-existentes (`xVNp36`, `5SW15h`) procesan ambos orígenes (kiosk + Mi Perfil) de forma indistinguible.

---

## Plan rollback (<1 min)

Si algo rompe en producción:
1. Revertir el commit en `main` que mergea PR → GitHub Pages redeploya en ~90s.
2. Card "Nueva Incidencia" desaparece, link no funciona, hub Mi Perfil sigue funcionando.
3. No hay state migrado en JSON (las incidencias creadas vía Mi Perfil quedan, son válidas).

---

## Out of scope explícito

- ❌ Selfie/foto opcional desde Mi Perfil (defer a 4.3)
- ❌ Geolocation (defer si el caso de uso lo amerita; el workflow lo acepta nullable)
- ❌ Cambios en kiosk
- ❌ Cambios en workflows n8n
- ❌ Implementación funcional de los 5 stub (cards solo muestran "Próximamente")
- ❌ Notificaciones (Bloque B)
