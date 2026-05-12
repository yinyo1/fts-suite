# Sprint 1 — Fase 4: Botón "Nueva Incidencia" multi-tipo

**Status:** 📋 Planning — pre-implementation
**Fecha planificación:** 2026-05-12
**Target arranque:** 2026-05-13
**Estimación total:** ~9h en 4 sub-fases mergeable independientes
**Dependencias previas resueltas:** F1 v3 (olvido_checkout), F1.1 (olvido_entrada), F2.1 (multiplexor base + roles dinámicos), Sprint 1 Fases 0-3 (categoría autoprogresiva)

---

## Sección 1 — Objetivo y alcance

### 1.1 Brecha actual

Hoy los empleados de FTS resuelven incidencias **fuera del sistema**:

| Incidencia                | Canal actual                                | Costo |
|---------------------------|---------------------------------------------|-------|
| Vacaciones                | WhatsApp a Felipe / Ana                     | Manual, sin trail |
| Permiso con goce          | WhatsApp + correo informal                  | Decisión ad-hoc |
| Permiso sin goce          | WhatsApp Ana                                | Sin política clara |
| Tiempo extra pre-autorizado | WhatsApp grupo + auto-aprobación tras hecho | HE no presupuestada |
| Incapacidad médica IMSS   | Foto WhatsApp + Ana captura manual          | Riesgo error nómina |
| Olvido_entrada/checkout   | Sistema (F1.1, F1 v3) ✅                    | Resuelto |

El objetivo de Fase 4 es **cerrar esta brecha**: empleado captura desde Mi Perfil, supervisor/RH/dirección aprueban según política, queda registro auditable, y la información alimenta el cálculo de nómina del Sprint 2.

### 1.2 Outcomes esperados

- **Empleado:** 1 botón en Mi Perfil → puede capturar cualquiera de los 7 tipos de incidencia (2 existentes + 5 nuevos).
- **Supervisor:** ve incidencias de su equipo en panel-incidencias (igual que hoy con olvido_entrada).
- **RH (Ana):** ve incidencias pendientes en visor RH con filtros por tipo, aprueba/rechaza/ajusta.
- **Dirección (Esteban):** ve solo las escaladas (sin_goce > 3 días, permisos sin supervisor, etc.).
- **Sistema:** vacaciones/permisos se escriben en `hr.leave` nativo de Odoo (compatible con módulos nómina/HR Enterprise futuros).
- **Auditoría:** todas las incidencias quedan en `shared/incidencias-asistencia.json` con metadata completa (snapshot supervisor F2.1, timestamps, decisiones, ajustes).

### 1.3 Out of scope (intencional)

- ❌ Notificaciones WhatsApp/email cuando cambia status → Bloque B del roadmap, separado.
- ❌ Wizard alta/baja empleado (Memory #21) → Sprint 2+.
- ❌ Cálculo nómina en sí → Sprint 2 (Fase 4 SOLO captura datos correctos).
- ❌ Migración de las 27 incidencias legacy de `shared/incidencias.json` → backlog F1.5 Opción 1.
- ❌ Pantalla admin config-empleados → posible stretch al final de Fase 4, pero no obligatorio.

### 1.4 Por qué AHORA, antes del cálculo de nómina

Sprint 2 (cálculo de nómina) necesita data **completa y confiable** sobre:
- Días trabajados (de `hr.attendance`)
- Días NO trabajados con detalle del por qué (vacaciones / permiso con goce / sin goce / incapacidad / falta no justificada)
- HE pre-autorizadas vs HE no autorizadas

Sin Fase 4, el cálculo de nómina del Sprint 2 tendría que asumir defaults o seguir dependiendo de Ana capturando manualmente en una hoja paralela. **Capturar ahora → cálculo limpio después.**

---

## Sección 2 — Catálogo de tipos de incidencia

### 2.1 Tabla maestra

| # | Tipo | Aprobador(es) | Plan op. req. | Campos clave | Destino Odoo | Workflow |
|---|------|---------------|----------------|---------------|---------------|----------|
| 1 | `olvido_entrada` (existe) | sup → RH | No | `hora_estimada` HH:MM | `hr.attendance` UPDATE check_in + TAG | `xVNp36` ✅ |
| 2 | `olvido_checkout` (existe) | sup → RH | No | `hora_estimada` HH:MM | `hr.attendance` UPDATE check_out + TAG | `5SW15h` ✅ |
| 3 | `tiempo_extra_pre_autorizado` | RH (+ dir si > 4h) | **Sí** (Vertiente A) | `horas`, `so_id`, `motivo`, `fecha` | TAG custom `x_he_autorizada` en `hr.attendance` + nuevo modelo `x_he_plan` | `tbd-4.4` |
| 4 | `vacaciones` | RH → dirección | No | `fecha_ini`, `fecha_fin`, `dias_corridos` | `hr.leave` (type `time_off` Odoo native) | `tbd-4.2-vac` |
| 5 | `permiso_con_goce` | sup → RH | No | `fecha_ini`, `fecha_fin`, `motivo`, `dias` | `hr.leave` (type `compensatory` o custom) | `tbd-4.2-pcg` |
| 6 | `permiso_sin_goce` | sup → RH → dir (si >3d) | No | `fecha_ini`, `fecha_fin`, `motivo`, `dias` | `hr.leave` (type `unpaid`) | `tbd-4.2-psg` |
| 7 | `incapacidad_medica` | RH (valida foto IMSS) | No | `fecha_ini`, `fecha_fin`, `tipo_imss`, `foto_url`, `folio_imss` | `hr.leave` (type `sick`) | `tbd-4.3` |

### 2.2 Reglas de negocio por tipo

#### 2.2.1 `tiempo_extra_pre_autorizado` (nuevo)
- **LFT:** Art. 67-68 — HE dobles (primeras 9 hrs/semana) y triples (después).
- **Política FTS:** HE solo se paga si fue pre-autorizada por RH (en empleados `hourly_doble` / `hourly_sencilla`). Sin pre-autorización → no se paga, queda como hora regular si entra en banda LFT, o se descarta del cálculo.
- **Categorías que aplican:** `hourly_doble`, `hourly_sencilla`. Para `confianza`, `ceo`, `no_he_comercial` el sistema rechaza la creación con mensaje "Tu categoría no califica para HE".
- **Plan operativo:** la HE pre-autorizada debe corresponder a un plan operativo activo (Vertiente A, Bloque E). Si Vertiente A no está implementada, **stub:** acepta sin validar plan pero marca `tag_sin_plan: true` para cleanup futuro.
- **Cap diario:** 3h/día máximo (LFT 9-hr semana → ~1.8h/día promedio, con flexibilidad). Cap configurable por categoría en `shared/config/limites-incidencias.json` (Sprint 2+).
- **Escalación:** > 4h → requiere aprobación dirección además de RH.

#### 2.2.2 `vacaciones` (nuevo)
- **LFT 2023 reform Art. 76:** 12 días primer año, escala 14/16/18/20 por años subsecuentes, +2/quinquenio después de 5 años.
- **Política FTS:** acumulable hasta 1 año fiscal posterior. Después, prescribe (avisar 60 días antes).
- **Anticipación mínima:** 15 días antes (configurable). Excepción: emergencias familiares con aprobación dirección directo.
- **Bloqueos automáticos:** no se permite traslapar con permiso sin goce ni incapacidad. Sistema verifica `hr.leave` activos del empleado.
- **Saldo:** se descuenta automáticamente de `hr.leave.allocation` al aprobar (decisión TBD — ver Sección 8).
- **Aplica a:** todos los empleados activos con > 6 meses de antigüedad (LFT Art. 76).

#### 2.2.3 `permiso_con_goce` (nuevo)
- **Política FTS:** discreción de Ana/Felipe. Casos típicos: cita médica del empleado, fallecimiento familiar inmediato (1-3 días), matrimonio (3 días), nacimiento de hijo (5 días LFT).
- **Cap anual:** sin cap explícito, pero > 5 días/año en un empleado se escala a dirección automáticamente.
- **Sin restricción de antigüedad.**
- **Trail obligatorio:** motivo libre + categoría (médico / familiar / otro).

#### 2.2.4 `permiso_sin_goce` (nuevo)
- **Política FTS:** discrecional, requiere justificación. Empleado pierde día(s) de salario + proporcional de prestaciones.
- **Escalación dirección:** si `dias > 3`, requiere aprobación dirección además de RH.
- **Cap:** sin cap formal, pero acumulado anual > 15 días lanza warning al panel admin RH.
- **Sin restricción de antigüedad.**

#### 2.2.5 `incapacidad_medica` (nuevo)
- **LFT Art. 42-VIII + LSS:** las incapacidades IMSS se pagan al 60% del SBC desde el día 4 (los primeros 3 los cubre FTS al 100% como política interna).
- **Tipos IMSS:** enfermedad general (EG), riesgo de trabajo (RT), maternidad (MAT).
- **Requisito de foto:** OBLIGATORIA del formato IMSS con folio visible. Sin foto → rechazo automático.
- **Validación foto:** Ana valida manualmente en Fase 4. Stretch (Sprint 2+): Claude API valida legibilidad como primera capa antes de Ana.
- **Cap:** sin cap (LFT no lo permite).

### 2.3 Validaciones frontend mínimas por tipo

Todas las validaciones se duplican en backend (defense in depth). Frontend solo mejora UX.

| Tipo | Validaciones frontend |
|------|------------------------|
| `tiempo_extra_pre_autorizado` | Categoría aplicable (lookup `x_categoria_nomina`), fecha no pasada > 2 días, SO existente (lookup Odoo), horas <= 3 (cap diario) |
| `vacaciones` | Antigüedad > 6 meses (lookup Odoo `create_date`), fecha_ini >= hoy+15d, no traslape con leave activos (workflow lookup) |
| `permiso_con_goce` | Motivo no vacío, categoría seleccionada |
| `permiso_sin_goce` | Motivo no vacío, dias <= 30 (warning > 15) |
| `incapacidad_medica` | Foto presente (file input), folio_imss no vacío, fecha_ini <= hoy (no se permite incapacidad futura) |

### 2.4 Estado machine extendida (reuso F1 v3)

Los 5 status existentes siguen aplicando. **No se inventan status nuevos** para Fase 4 (decisión de simplicidad):

```
pendiente_supervisor  →  pendiente_rh  →  pendiente_direccion
                                       ↓
                          aprobada_tal_cual / aprobada_con_ajuste / aprobada_por_direccion
                                       ↓
                          rechazada_por_rh / rechazada_por_direccion
```

Diferencias por tipo:
- `vacaciones` y `permiso_sin_goce > 3d`: inicia en `pendiente_rh`, escala automático a `pendiente_direccion` después.
- `incapacidad_medica`: SOLO va a RH (Ana valida foto), no toca supervisor (es derecho LFT, no decisión).
- `tiempo_extra_pre_autorizado` con horas > 4: escala a dirección después de RH.

El helper `esEstadoTerminal()` del resolver `Oc2ceMHX2O0L0y2X` sigue sirviendo sin modificación.

---

## Sección 3 — Arquitectura técnica

### 3.1 Frontend (modal "Nueva Incidencia")

**Ubicación:** botón en `mi-perfil/index.html`, sección hero. Modal renderizado vía `mi-perfil/js/modal-nueva-incidencia.js` (nuevo).

**Flujo multi-step:**

```
┌───────────────────────────────────────────┐
│ Step 1 — Selección de tipo                │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│ │ Vacac.  │ │ Permiso │ │ Permiso │       │
│ │ 🏖️      │ │ con goce│ │ sin goce│       │
│ │         │ │ 🤝      │ │ ⚠️      │       │
│ └─────────┘ └─────────┘ └─────────┘       │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│ │ Incapac.│ │ HE pre  │ │ Olvidé  │       │
│ │ 🏥      │ │ autoriz │ │ checar  │       │
│ │         │ │ ⏰      │ │ 📝      │       │
│ └─────────┘ └─────────┘ └─────────┘       │
└───────────────────────────────────────────┘
        ↓ (selecciona tipo)
┌───────────────────────────────────────────┐
│ Step 2 — Form dinámico                    │
│ Render según tipo: fechas, motivo, etc.   │
│ (Validación inline progresiva)            │
└───────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────┐
│ Step 3 — Foto/selfie (si aplica)          │
│ Incapacidad: OBLIGATORIO (foto IMSS)      │
│ Otros: opcional                           │
│ Compresión cliente JPEG quality 0.7,      │
│ max 2MB → blob a GitHub                   │
└───────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────┐
│ Step 4 — Revisar + Enviar                 │
│ Preview de toda la captura                │
│ Botón "Enviar" → POST a workflow n8n      │
└───────────────────────────────────────────┘
```

**Estado intermedio:**
- `localStorage` key: `fts_incidencia_draft_{empleado_id}` con `{step, tipo, payload, foto_blob_b64}`.
- TTL 24h (cleanup automático al cargar Mi Perfil).
- Empleado puede cerrar accidentalmente el modal y retomar donde quedó.

**Validación frontend:**
- Inline progresiva por campo (visual rojo/verde al perder focus).
- Submit deshabilitado hasta que TODOS los campos requeridos pasen.
- Mensajes en español MX directo (no IA-ish).

**Build header convention:**
```javascript
// Build: 20260513-fase4-modal-nueva-incidencia
'use strict';
```

### 3.2 Backend workflows n8n — decisión arquitectónica

**Opción A: 1 workflow multiplexor `/webhook/incidencias/crear`** ⭐ recomendado

```
Webhook → Code Validar → Switch por tipo → [N branches]
                                          ├─ vacaciones flow
                                          ├─ permiso_con_goce flow
                                          ├─ permiso_sin_goce flow
                                          ├─ incapacidad flow
                                          └─ tiempo_extra flow
                            → Merge → Odoo + GitHub PUT JSON → Respond
```

**Pros:**
- 1 webhook URL → frontend tiene 1 endpoint para todos los tipos nuevos.
- Reutiliza pattern F2.1 (multiplexor `panel/derivar-roles` ya validado).
- Una sola validación de auth + payload upstream.
- Más fácil para audit de logs (1 workflow, 1 timeline).

**Contras:**
- 1 workflow puede crecer a 40-50 nodos (xVNp36 tiene 12, este crecería más).
- Falla en 1 branch corrompe ejecución completa (low risk, pero existe).
- Debug de un tipo específico requiere filtrar ejecuciones por payload.

**Opción B: N workflows separados** (`crear-vacaciones`, `crear-permiso-con-goce`, etc.)

**Pros:**
- Aislamiento total — bug en vacaciones no afecta incapacidad.
- Más fácil debug aislado.
- Más fácil rollback granular.

**Contras:**
- 5 webhooks nuevos (vs 1).
- Duplicación de lógica común: auth, snapshot supervisor F2.1, lookup empleados-master, write GitHub JSON.
- Frontend tiene que mapear `tipo → URL`.
- Más sprawl en lista de workflows productivos (CLAUDE.md §2 sería 18 vs 14).

**Mi voto:** Opción A. Razón principal: la lógica común (auth + snapshot supervisor F2.1 + lookup CEO autoprogresivo + write JSON) es ~60% de cada workflow y es DRY automáticamente con Opción A. La diferencia entre tipos es solo: validaciones específicas + escritura a `hr.leave` vs `hr.attendance`. Eso encaja perfecto en Switch.

**Pero:** dejo decisión final a Esteban (Sección 8 decisión #1).

### 3.3 Persistencia Odoo

#### 3.3.1 Vacaciones / Permisos / Incapacidad → `hr.leave` nativo

Odoo 19 SaaS Enterprise YA incluye módulo HR Time Off. Tabla `hr.leave` campos relevantes:

| Campo | Tipo | Uso FTS |
|-------|------|---------|
| `employee_id` | many2one hr.employee | empleado.id |
| `holiday_status_id` | many2one hr.leave.type | tipo: vacaciones / sick / unpaid / compensatory |
| `request_date_from` | date | fecha_ini |
| `request_date_to` | date | fecha_fin |
| `number_of_days` | float | calculado por Odoo automáticamente |
| `state` | selection | draft → confirm → validate1 → validate (mapea a nuestros status) |
| `name` | char | motivo en español |
| `attachment_ids` | one2many | foto IMSS (incapacidad) |

**Beneficios de usar nativo:**
- Compatible con módulo de nómina Enterprise (si lo activamos Sprint 3+).
- Calendario visual de ausencias en Odoo UI.
- Saldo automático con `hr.leave.allocation`.
- Reportes nativos de Odoo (días por empleado, por tipo, por período).

**Setup pre-requisito:** crear `hr.leave.type` registros para FTS:
- `vacaciones` (ya existe en Odoo SaaS por default)
- `permiso_con_goce_fts` (nuevo — `requires_allocation: no_validation`, `leave_validation_type: hr`)
- `permiso_sin_goce_fts` (nuevo — `unpaid: True`)
- `incapacidad_medica_fts` (nuevo — `leave_validation_type: hr`)

Setup vía JSON-RPC console F12 (mismo patrón Sprint 1 Fase 1 que evita Studio billable).

#### 3.3.2 Tiempo extra pre-autorizado → custom tag + modelo nuevo

`hr.attendance` ya tiene `x_studio_horario_en_disputa` + `x_studio_incidencia_pendiente_id` (F1 v3). Agregamos:
- `x_he_autorizada` (boolean) — flag binario.
- `x_he_autorizada_horas` (float, max 3.0).
- `x_he_plan_id` (char, link a futuro plan operativo Vertiente A).

Si Vertiente A no existe al momento de Fase 4 (probable): `x_he_plan_id` queda null + flag `tag_sin_plan: true` en el JSON. Cuando Vertiente A se implemente, un workflow de backfill puede asociar HEs históricas a planes retro.

#### 3.3.3 Olvido_entrada / Olvido_checkout → `hr.attendance` (sin cambio)

Ya funcionan. No tocar.

#### 3.3.4 Foto IMSS → ¿dónde?

Decisión TBD (Sección 8 #2). Opciones:
- **A) GitHub raw** (path: `shared/incidencias-fotos/INC-INC-{id}-{ts}.jpg`)
  - Pro: cero infra extra, mismo flujo que JSONs.
  - Contra: público (cualquiera con URL la ve). IMSS folios son sensibles.
- **B) Odoo `ir.attachment` linkeado a `hr.leave`** ⭐ recomendado
  - Pro: privado por defecto (Odoo respeta access rights), keep todo en Odoo.
  - Contra: tamaño limitado por Odoo (default 50MB workspace), no streaming.
- **C) Cloudinary / S3 con signed URLs**
  - Pro: privado + escalable.
  - Contra: infra nueva, billing extra, integración compleja.

Mi voto: B (Odoo nativo). Volumen estimado: ~10 incapacidades/mes × 2MB = 240MB/año. Cabe holgado en SaaS.

### 3.4 Visor RH cosmético

Ampliar `modulos/rh/visor-incidencias.html`:

```javascript
const TIPO_LABELS = {
  // existentes:
  olvido_entrada:    { label: 'Olvido entrada', icono: '📝' },
  olvido_checkout:   { label: 'Olvido salida',  icono: '📝' },
  auto_cierre_pendiente: { label: 'Auto-cierre 16h', icono: '⚠️' },
  // nuevos Fase 4:
  vacaciones:        { label: 'Vacaciones',     icono: '🏖️' },
  permiso_con_goce:  { label: 'Permiso (goce)', icono: '🤝' },
  permiso_sin_goce:  { label: 'Permiso (sin)',  icono: '⚠️' },
  incapacidad_medica:{ label: 'Incapacidad',    icono: '🏥' },
  tiempo_extra_pre_autorizado: { label: 'HE autorizada', icono: '⏰' }
};
```

Filtros nuevos en el visor:
- Dropdown "Tipo" con todos los 8 tipos.
- Quick filter "Solo pendientes RH" (estado `pendiente_rh`).
- Counter por tipo en badge superior.

### 3.5 Mi Perfil → "Mis Incidencias"

Hub donde el empleado ve el estado de sus propias incidencias (todas las que él/ella creó). Ya existe parcialmente (post F2.1). Extensiones para Fase 4:
- Card por tipo con icono + status badge.
- Click expande detalle (timestamps, decisiones, ajustes).
- Botón "Nueva Incidencia" arriba.
- Filtro por estado (todas / pendientes / aprobadas / rechazadas).

---

## Sección 4 — Principio autoprogresivo aplicado

Reuso estricto del PLAN_NOMINA §0.5 + lecciones del Sprint 1 cleanup.

### 4.1 Reglas universales para Fase 4

1. **NO hardcodear employee_ids específicos.** Si la lógica dice "Esteban tiene permiso ilimitado de X", se modela como `x_categoria_nomina === 'ceo'`, no `empleado_id === 32`.
2. **NO hardcodear listas de "ciertos empleados aplican / no aplican".** Usar `x_categoria_nomina` + lookup.
3. **Defaults sensatos por categoría** cuando empleado nuevo entra sin override.
4. **Fail-open:** empleado nuevo (Odoo recién creado, sin overrides) puede crear cualquier tipo de incidencia desde minuto 1 con valores razonables.

### 4.2 Aplicación específica por tipo

| Validación | Patrón autoprogresivo |
|-------------|------------------------|
| ¿Quién puede crear HE? | Lookup `x_categoria_nomina ∈ ['hourly_doble', 'hourly_sencilla']`. Nuevo empleado en Operaciones sin override → categoría default `hourly_doble` → puede crear. Nuevo empleado en Comercial → default `no_he_comercial` → no puede. Sin tocar código. |
| ¿Cuántos días de vacaciones tiene? | Lookup Odoo `hr.leave.allocation.remaining_leaves` (nativo). Antigüedad calculada por Odoo desde `create_date`. Sin lista FTS. |
| ¿Permiso sin goce > 3d requiere dirección? | Constante `LIMITE_DIRECCION_DIAS = 3` en workflow, aplicable a cualquier empleado. CEO/Felipe pueden subirlo via PR (no via code per-empleado). |
| ¿Permiso del CEO mismo? | Tabla decisión F2.1 ya cubre: `parent_id === empleado_id` → `es_ceo: true` → `pendiente_rh` (Ana lo aprueba). CEO no se aprueba a sí mismo. |
| ¿Empleado sin departamento? | Tabla F2.1 ya cubre: `sin_departamento: true` → `pendiente_rh`. Funciona para los 5 tipos nuevos sin cambios. |
| ¿Incapacidad de empleado nuevo? | No requiere antigüedad (es derecho LFT desde día 1). Categoría irrelevante. Funciona sin overrides. |

### 4.3 Smoke test obligatorio

**Empleado fantasma:** Pedro Hernández (id 143, Comercial, sin overrides). Antes de cerrar Fase 4, ejecutar smoke test creando 1 de cada tipo nuevo desde Pedro:

| Tipo | Resultado esperado |
|------|---------------------|
| `vacaciones` | ✅ Se crea, estado `pendiente_rh` (Comercial no tiene supervisor jerárquico en este caso) |
| `permiso_con_goce` | ✅ Se crea, estado `pendiente_supervisor` (si tiene `parent_id`) o `pendiente_rh` |
| `permiso_sin_goce` (2 días) | ✅ Se crea, estado `pendiente_rh` (no escala dir) |
| `permiso_sin_goce` (5 días) | ✅ Se crea, estado `pendiente_rh`, flag `requiere_direccion: true` |
| `incapacidad_medica` | ✅ Se crea con foto IMSS, estado `pendiente_rh` |
| `tiempo_extra_pre_autorizado` | ❌ Rechazado en validación frontend: "Tu categoría (`no_he_comercial`) no califica para HE". |

Pedro nunca tocó código para que esto funcione → autoprogresivo verificado.

---

## Sección 5 — Plan de implementación 4 sub-fases

Cada sub-fase entrega valor mergeable independiente. Mantiene la disciplina de PRs pequeños del Sprint 1.

### 5.1 Sub-fase 4.1 — Infraestructura modal + refactor olvido_* (~3h)

**Entregables:**
- `mi-perfil/js/modal-nueva-incidencia.js` (nuevo, ~400 líneas).
- Step engine multi-step con localStorage persistence.
- Botón "Nueva Incidencia" en Mi Perfil.
- Refactor `olvido_entrada` + `olvido_checkout` para usar el nuevo modal (DRY). El kiosk-side de olvido_checkout (jornada activa) sigue igual.
- Step 1 = grid de 7 tipos visuales (Sub-fases siguientes lo activan progresivamente).

**Out of scope esta sub-fase:**
- Los workflows backend de los nuevos 5 tipos (cards quedan deshabilitadas con tooltip "Próximamente").

**Test:**
- Smoke E2E: empleado crea `olvido_entrada` desde el nuevo modal (no kiosk). Validar payload idéntico al kiosk-flow.
- Verifica panel-incidencias muestra la incidencia con el supervisor correcto (F2.1).

**Commit / PR:**
- Branch: `sprint-1/fase-4-1-modal-base`
- 2-3 commits: nuevo JS, integración mi-perfil, refactor para reusar olvido_*.

---

### 5.2 Sub-fase 4.2 — Vacaciones + permisos (~2h)

**Entregables:**
- Workflow multiplexor n8n `/webhook/incidencias/crear` con switch por tipo (Opción A confirmada por Esteban en Sección 8 #1).
- Setup `hr.leave.type` records en Odoo via JSON-RPC console (4 tipos custom).
- Activación cards: `vacaciones`, `permiso_con_goce`, `permiso_sin_goce` en modal.
- Form dinámico Step 2 para cada tipo.
- Validaciones específicas: traslape, antigüedad, escalación dirección si dias > 3.
- Lectura saldo `hr.leave.allocation` para empleado en `vacaciones`.

**Setup Odoo (console F12):**
```javascript
// Snippet de creación de hr.leave.type (NO usar Studio)
// Detalle en docs/SPRINT_1_FASE_4_ODOO_SETUP.md (a crear sub-fase 4.2)
```

**Test:**
- 3 smoke tests (1 por tipo) con Pedro (143) + 1 con Felipe (112, override `confianza`).
- Validar registro en `hr.leave` Odoo + JSON `shared/incidencias-asistencia.json`.
- Validar visor RH muestra correctamente con TIPO_LABELS nuevos.

**Commit / PR:**
- Branch: `sprint-1/fase-4-2-vacaciones-permisos`
- ~4 commits: workflow n8n, frontend forms, setup Odoo doc, smoke tests.

---

### 5.3 Sub-fase 4.3 — Incapacidad médica (~2h)

**Entregables:**
- Branch del switch n8n para `incapacidad_medica`.
- Activación card en modal.
- Upload de foto IMSS:
  - Compresión cliente (JPEG quality 0.7, max width 1600px).
  - Validación tamaño max 2MB.
  - POST a Odoo `ir.attachment` linkeado al `hr.leave` creado (decisión confirmada Sección 8 #2 = B).
- Form fields: tipo IMSS (EG / RT / MAT), folio, fechas.
- Validación: `fecha_ini <= hoy` (incapacidad no es futura).

**Decisión validación foto:**
- Fase 4: validación manual de Ana (ver en visor RH la foto preview, aprueba/rechaza).
- Sprint 2+ stretch: Claude API valida legibilidad/folio como pre-filtro.

**Test:**
- 1 smoke test creando incapacidad con foto sample (foto IMSS de prueba, NO real).
- Validar foto se guarda como `ir.attachment` en Odoo.
- Validar visor RH muestra preview clickeable.

**Commit / PR:**
- Branch: `sprint-1/fase-4-3-incapacidad`
- ~3 commits: workflow branch incapacidad, frontend upload, visor RH preview.

---

### 5.4 Sub-fase 4.4 — Tiempo extra pre-autorizado (~2h)

**Entregables:**
- Branch del switch n8n para `tiempo_extra_pre_autorizado`.
- Activación card en modal con validación frontend de categoría (deshabilitado para `confianza`/`ceo`/`no_he_comercial`).
- Form fields: fecha, horas (max 3, validation client + server), SO ID (lookup Odoo), motivo.
- Escalación automática a dirección si `horas > 4` (no aplicable si cap = 3, pero queda para futuro relajar el cap).
- Stub Vertiente A: si no existe plan operativo, marca `tag_sin_plan: true` en JSON, no bloquea creación.

**Test:**
- 2 smoke tests:
  - Felipe (override `confianza`) → modal rechaza en frontend (esperado).
  - Stephany (default `hourly_doble`) → crea HE 2h con SO, queda `pendiente_rh`.

**Commit / PR:**
- Branch: `sprint-1/fase-4-4-tiempo-extra`
- ~2 commits: workflow branch HE, frontend categoría guard.

---

### 5.5 Estimación total y cadencia

| Sub-fase | Horas | Mergeable | Esperado |
|----------|-------|------------|-----------|
| 4.1 | ~3h | ✅ standalone | 2026-05-13 AM |
| 4.2 | ~2h | depende 4.1 | 2026-05-13 PM |
| 4.3 | ~2h | depende 4.1 | 2026-05-14 AM |
| 4.4 | ~2h | depende 4.1 | 2026-05-14 PM |
| **Total** | **~9h** | **4 PRs separados** | **2 días calendario** |

Si surge feedback de Esteban sobre 4.1 (modal UX), recalibrar 4.2-4.4 según el feedback en lugar de avanzar a ciegas.

---

## Sección 6 — Dependencias y orden

### 6.1 Diagrama de dependencias

```
4.1 (modal base)
 ├──> 4.2 (vacaciones + permisos)
 ├──> 4.3 (incapacidad)
 └──> 4.4 (tiempo extra) ──── depende parcial ───> Vertiente A (plan op.)
                                                    └── si no existe: stub OK
```

### 6.2 Bloqueos externos

| Dependencia | Status | Impacto |
|-------------|--------|---------|
| F1 v3 (olvido_checkout) | ✅ DONE | Refactor en 4.1 reusa flow |
| F1.1 (olvido_entrada) | ✅ DONE | Refactor en 4.1 reusa flow |
| F2.1 (multiplexor + roles) | ✅ DONE | Workflow nuevo lo reusa |
| Sprint 1 Fases 0-3 (categoría) | ✅ DONE | Permite reglas autoprogresivas Sección 4 |
| Vertiente A (plan operativo) | ❌ NO START | 4.4 sale en stub mode (acceptable) |
| Setup hr.leave.type en Odoo | ⏳ PENDIENTE | Pre-req 4.2, setup via console F12 |

### 6.3 Orden óptimo

1. **4.1 PRIMERO** — base de todo lo demás. Si el modal no funciona, nada funciona.
2. **4.2 SEGUNDO** — vacaciones y permisos son lo que más impacta a empleados (volumen). Quick win visible.
3. **4.3 TERCERO** — incapacidad es menos frecuente pero tiene componente foto que es independiente.
4. **4.4 ÚLTIMO** — HE es la más sensible (afecta nómina directo) y stub Vertiente A. Mejor último para incorporar feedback.

### 6.4 Quick wins paralelos (cualquier punto)

- Visor RH TIPO_LABELS + íconos (5 min trivial). Hacer en 4.2 cuando ya hay tipos nuevos para mostrar.
- Documentar `docs/SPRINT_1_FASE_4_REPORTE.md` al final de cada sub-fase.

---

## Sección 7 — Test plan E2E

### 7.1 Tests por sub-fase (ya enumerados arriba en Sec 5)

### 7.2 Test maestro "Empleado fantasma" (al cerrar Fase 4)

**Setup:** crear empleado test en Odoo (NO en producción):
- ID: assign by Odoo
- Name: "Test Fantasma"
- Departamento: Comercial (default `no_he_comercial`)
- parent_id: 112 (Felipe)
- Sin overrides en `x_categoria_nomina`.
- `create_date`: hace 8 meses (para que tenga antigüedad de vacaciones).

**Tests:**

| # | Tipo | Acción esperada | Validación |
|---|------|-----------------|-------------|
| 1 | `vacaciones` 5 días | Modal acepta, crea → `pendiente_supervisor` (Felipe) | `hr.leave` creado en Odoo, JSON registra |
| 2 | `permiso_con_goce` 1 día | Modal acepta → `pendiente_supervisor` | `hr.leave` tipo `permiso_con_goce_fts`, JSON |
| 3 | `permiso_sin_goce` 2 días | Modal acepta → `pendiente_supervisor`, sin escalación dir | JSON |
| 4 | `permiso_sin_goce` 7 días | Modal acepta → `pendiente_supervisor`, flag `requiere_direccion: true` | JSON |
| 5 | `incapacidad_medica` con foto | Modal acepta → `pendiente_rh` directo (skip sup) | `hr.leave` tipo `incapacidad_medica_fts`, `ir.attachment` adjunto, JSON |
| 6 | `tiempo_extra_pre_autorizado` 2h | Modal RECHAZA frontend "categoría no califica" | NO crea registro |
| 7 | `olvido_entrada` (regresión) | Modal acepta → `pendiente_supervisor` | Igual que F1.1 |
| 8 | `olvido_checkout` (regresión) | Modal acepta → `pendiente_supervisor` | Igual que F1 v3 |

**Cleanup post-test:** archivar empleado test (no eliminar, Odoo prefiere `active: false`).

### 7.3 Test de regresión

- Verificar que olvido_entrada y olvido_checkout DESDE EL KIOSK siguen funcionando (no se rompen al refactor 4.1).
- Verificar panel-incidencias sigue mostrando incidencias correctamente.
- Verificar visor RH sigue funcionando con tipos existentes + nuevos.

---

## Sección 8 — Decisiones TBD para Esteban

Antes de arrancar implementación 4.1, necesito decisión sobre estos 8 puntos:

### 8.1 Arquitectura

**1. ¿1 workflow multiplexor o N workflows por tipo?**
- Mi recomendación: **1 multiplexor** (Opción A, Sec 3.2).
- Alternativa: 5 separados (más simple debug, más sprawl).
- **Tu decisión:**

**2. ¿Dónde guarda la foto IMSS?**
- Opciones: A) GitHub raw (público), B) Odoo `ir.attachment` (privado, recomendado), C) Cloudinary/S3.
- Mi recomendación: **B** (Sec 3.3.4).
- **Tu decisión:**

### 8.2 Reglas de negocio

**3. ¿Tiempo extra requiere plan operativo (Vertiente A) o también acepta freestyle?**
- Política estricta: solo HE si hay plan activo pre-aprobado.
- Política flexible: HE sin plan pero con motivo + aprobación dirección.
- Mi recomendación: **stub Vertiente A** ahora (acepta sin plan + flag `tag_sin_plan: true`), refactor a estricto cuando Vertiente A esté lista.
- **Tu decisión:**

**4. ¿Permisos con vs sin goce — quién define el corte?**
- Opción A: Automático por categoría de motivo (cita médica = con goce, asunto personal = sin goce).
- Opción B: Empleado lo elige y Ana confirma/cambia al aprobar.
- Opción C: Ana SIEMPRE elige (empleado no propone).
- Mi recomendación: **B** (empleado propone, Ana confirma/cambia con justificación en notas).
- **Tu decisión:**

**5. ¿Quién valida foto IMSS — manual Ana, o Claude API primera capa?**
- Fase 4 baseline: manual Ana.
- Stretch Sprint 2+: Claude API valida legibilidad + folio.
- Mi recomendación: **manual Ana en Fase 4**, agregar Claude API después si volumen lo justifica.
- **Tu decisión:**

### 8.3 Política

**6. Estados terminales — ¿quién cierra definitivamente cada tipo?**
- Vacaciones / permiso con goce: ¿RH cierra o necesita dirección?
- Mi recomendación: RH (Ana) cierra todos excepto `permiso_sin_goce > 3d` (dirección). Sigue tabla F2.1.
- **Tu decisión:**

**7. ¿Vacaciones descuentan automáticamente del saldo `hr.leave.allocation` al aprobar?**
- Sí automático (Odoo lo hace solo si usamos hr.leave nativo).
- No manual (Ana decide después si descontar o "regalar").
- Mi recomendación: **automático** (es la mecánica estándar Odoo, intervención manual la queda como override en casos edge).
- **Tu decisión:**

**8. ¿Notificación al empleado cuando cambia status?**
- Opción A: Solo en-app (badge en Mi Perfil al entrar).
- Opción B: WhatsApp/email automático.
- Opción C: WhatsApp solo para terminal (aprobada/rechazada), email para intermedio.
- Mi recomendación: **A en Fase 4**, B/C en Bloque B (roadmap separado de notificaciones).
- **Tu decisión:**

---

## Sección 9 — Backlog explícito (NO en este sprint)

Estos items NO entran en Fase 4 pero quedan documentados para no perderlos:

| # | Item | Origen | Próximo sprint |
|---|------|--------|----------------|
| B-1 | Notificaciones WhatsApp/email status change | Bloque B roadmap original | Bloque B |
| B-2 | Wizard alta/baja empleado RH | Memory #21 | Sprint 2+ |
| B-3 | Migrar 27 incidencias legacy `incidencias.json` | F1.5 Opción 1 | F6 cleanup |
| B-4 | Refactor `PLANEACION_CONFIG` legacy duplicado | Sprint 1 cleanup pending | Sprint 2 |
| B-5 | HMAC en webhook `rh/empleados-master/refresh` | Sprint 1 Fase 4 stretch | Fase 4 stretch |
| B-6 | Panel admin RH `config-empleados` | Sprint 1 Fase 4 stretch | Fase 4 stretch |
| B-7 | Claude API valida foto IMSS | Sección 8 #5 | Sprint 2+ |
| B-8 | Cron 2am auto-cierre attendance | Bloque B | Bloque B |
| B-9 | Vertiente A — plan operativo completo | Bloque E | Bloque E |
| B-10 | Visor RH cosmético olvido_entrada hardcoded | F1.1 backlog | Quick win 4.2 |
| B-11 | Acentuación `Ingenieria` → `Ingeniería` en Odoo | F1.1 §11 #8 | Quick win Sprint 2 |

---

## Sección 10 — Riesgos y mitigaciones

### 10.1 Riesgos técnicos

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|--------|---------------|---------|-----------|
| R-1 | `hr.leave.type` custom no se puede crear vía JSON-RPC (Odoo restringe) | Media | Alto (bloquea 4.2) | Pre-validar en Sprint 1 Fase 4 día -1 con creación dummy. Si bloquea: usar tipos default Odoo (`vacaciones`, `sick`, `unpaid`) + tag custom para distinguir |
| R-2 | Foto IMSS pesa demasiado, satura `ir.attachment` Odoo | Baja | Medio | Compresión cliente JPEG q0.7 + max 2MB hard limit. Si crece > 240MB/año, migrar a S3 (decisión Sprint 2+) |
| R-3 | Workflow multiplexor crece a 50+ nodos, ilegible | Media | Medio | Mantener cada branch del switch en 5-8 nodos. Si una branch crece, extraer a workflow secundario llamado via Execute Workflow node |
| R-4 | Empleado abusa de incidencias (vacaciones falsas, permisos repetidos) | Media | Medio | Dashboard agregado en visor RH: contador anual por empleado por tipo. Alerta dirección si > 5 permisos sin goce/año |
| R-5 | Drift entre `hr.leave` Odoo y JSON FTS | Baja | Alto | JSON FTS es source of truth para estado de aprobación. `hr.leave` es source of truth para data nativa Odoo. Workflow valida sync al cierre de cada incidencia (compara state) |
| R-6 | Empleado pierde captura por F5 accidental | Alta | Bajo | localStorage draft autosave cada step (Sec 3.1) |
| R-7 | Race condition: 2 empleados crean incidencia simultánea, GitHub PUT conflict | Baja | Bajo | Reintentar 3 veces con backoff. Ya validado en F2.1 sin issue real en producción |

### 10.2 Riesgos de adopción

| # | Riesgo | Mitigación |
|---|--------|-----------|
| A-1 | Empleados siguen mandando WhatsApp en vez de usar el modal | Felipe comunica a Operaciones, Ana a oficinas. Eventualmente Ana NO acepta WhatsApp más (política gradual) |
| A-2 | Curva de aprendizaje del modal multi-step | Modal hace inline help. Video tutorial 2 min en hub si es necesario |
| A-3 | Ana no entiende el flujo nuevo en visor RH | Sesión 30 min con Ana antes de cerrar Fase 4 |

### 10.3 Riesgos legales

| # | Riesgo | Mitigación |
|---|--------|-----------|
| L-1 | Datos sensibles IMSS en GitHub público | Decisión 8 #2 = B (Odoo privado) |
| L-2 | Falta de firma electrónica en aprobaciones (LFT 47-bis) | Audit trail con timestamps + IP + sesión FTSAuth ya cumple "evidencia digital" mínimo. Sprint 2+ evaluar firma cripto avanzada si compliance requiere |
| L-3 | Negativa de incapacidad genera disputa | Trail en visor RH preserva foto IMSS + decisión Ana + notas → defensa en junta de conciliación |

---

## Anexos

### A.1 Referencias cruzadas

- `docs/PLAN_NOMINA_FTS_SUITE.md` — Master plan donde Fase 4 captura inputs.
- `docs/SPRINT_1_FASE_1_AUDIT.md` — Setup categorías que habilita autoprogresivo.
- `CLAUDE.md` §6 Bloque F — Roadmap incidencias rediseño original.
- `CLAUDE.md` §11 — Hallazgos arquitectónicos cross-cutting.
- `CLAUDE.md` §13 — Deuda autoprogresiva (items #1-#4).

### A.2 Comandos útiles para implementación

```bash
# Crear branch sub-fase
git checkout -b sprint-1/fase-4-1-modal-base

# PR autónomo (gh CLI ya configurado, ver CLAUDE.md §12)
GH=/c/Users/esteb/AppData/Local/Microsoft/WinGet/Links/gh.exe
"$GH" pr create --title "feat(mi-perfil): modal Nueva Incidencia base + refactor olvido_*" \
  --base main --body-file .claude/.tmp/pr-body.md

# Validar workflow antes de activar
# (vía MCP n8n_validate_workflow)
```

### A.3 Convenciones de naming

- Branches: `sprint-1/fase-4-{N}-{descripcion-corta}`
- Commits: `{tipo}({area}): descripción imperativa`
  - tipo: `feat | fix | docs | chore | refactor | test`
  - area: `mi-perfil | n8n | odoo | visor-rh | shared`
- Files nuevos:
  - JS frontend: `kebab-case.js`
  - Workflows n8n: nombre estable + tag versión interno
  - Docs: `SCREAMING_SNAKE_CASE.md`

### A.4 Workflows n8n nuevos esperados

| ID estimado | Nombre | Sub-fase |
|-------------|--------|----------|
| TBD | `incidencias/crear` (multiplexor) | 4.2 (también activa branches 4.3 y 4.4) |
| — | (no se crean workflows separados si Opción A) | — |

---

**Fin del plan. Listo para arranque 2026-05-13 una vez Esteban confirme las 8 decisiones de Sección 8.**
