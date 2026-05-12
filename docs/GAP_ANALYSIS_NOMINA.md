# Gap Analysis — Sprint 1 Master Plan Nómina FTS Suite

**Fecha:** 2026-05-11
**Modo:** investigación read-only. **NO se modificó nada** en repo, Odoo ni n8n.
**Doc origen:** `docs/PLAN_NOMINA_FTS_SUITE.md` — ⚠️ **referenciado por el prompt pero NO existe en el repo**. Audit se hizo contra las needs explícitas listadas en el prompt (EJE 4.1).

---

## 1. Resumen ejecutivo

🟢 **Más infraestructura existe de la esperada.** Ya hay `shared/horarios-base.json` v2 con 6 perfiles, `shared/planeacion-config.json` con flag `requiere_check`, y Odoo tiene `x_studio_hora_entrada` poblado en 35/44 empleados activos.

🟡 **3 inconsistencias críticas** entre lo que existe: (a) `resource_calendar_id` mal asignado (Operaciones campo usa "Horas de oficina"), (b) `horarios-base.json` apunta a dept 8 para Ana RH pero ella está en dept 16, (c) `x_studio_hora_entrada` (float horas decimal) duplica intent del `x_cita_entrada` (string HH:MM) que el Sprint quiere crear.

🔴 **Sprint 1 NO debe crear desde cero**: debe *consolidar* lo que existe + extender con los campos nuevos (categoría nómina, he_tipo, ppa, festivos). Sino se duplica deuda.

⚡ **Decisiones bloqueantes para Esteban (resumen):** 10 decisiones de diseño numeradas en §7. Las 3 más críticas: source-of-truth Odoo vs JSON, qué hacer con `x_studio_hora_entrada` existente, festivos como modelo custom vs `resource.calendar.leaves` nativo.

📋 **Sin cron workflows en n8n** (Bloque B sigue pendiente). Sync Odoo↔JSON tendría que ser el primer cron — o evento on-change desde panel admin.

---

## 2. Estado actual del repo

### 2.1 Archivos relevantes en `shared/`

| Archivo | Versión | Estructura | Quién lee | Quién escribe |
|---|---|---|---|---|
| `horarios-base.json` | v2 (2026-04-28) | 6 perfiles (operaciones_campo, operaciones_oficina, ingenieria, comercial, rh, legal) c/u con `entrada`, `salida`, `comida_minutos`, `horas_netas`, `departamento_id` | `operaciones/planeacion/js/horarios-base.js` (loader con localStorage cache + GitHub fallback) | Manual via commit |
| `planeacion-config.json` | v1 (2026-04-28) | mapa `empleados[id] = {requiere_check, nombre}`. 11 empleados (8 con check=true, 3 con false: Gibrán/Gerardo/Teresa) | `operaciones/planeacion/js/planeacion.js` + `horarios-base.js` (decide oficina vs campo) | Manual via commit + `feat/config-master-users-crud` (PR cerrado) |
| `users-suite.json` | — | Login FTS Suite (username + password_hash + role + modulos por usuario). **Separado de hr.employee Odoo.** | `shared/fts-auth.js` (login) | Manual + UI master |
| `sitios-autorizados.json` | v1 (2026-04-28) | 5 sitios (legacy schema id/radio_m/activo). **No usado por kiosk actualmente** | nadie (write-only orphan) | Manual |
| `public-config.json` | v1.1.0 (2026-05-11) | 5 geolocations con campos F1.5 (`aplica_hora_minima_checkin`, `hora_minima_checkin` para Topo Chico) | `operaciones/kiosk/js/kiosk.js` (geo validation) | Manual via commit |
| `incidencias.json` | — | 29 incidencias schema legacy (`estado`, `id`, `fecha_solicitud`) | NADIE | `a7mEjjdwIzzvomXs` ramas `ajuste_hora_*` (write-only legacy) |
| `incidencias-asistencia.json` | — | 13 incidencias schema F2.1+ (`status`, `id_interno`, `fecha_creacion`, `propuestas[]`) | visor RH, panel-incidencias, mis-incidencias | `xVNp36`, `5SW15h`, `0L0y2X`, `a7mEjjdwIzzvomXs` rama auto_rescate (F1.5) |
| `audit-log.json` | — | append-only audit eventos suite | dashboard | n8n + frontend |
| `ops-config.json` | v1 | blob cifrado | algo de ops | manual |

### 2.2 Lo que NO existe en repo

- ❌ `shared/empleados.json` o `empleados-master.json` (catálogo espejo de hr.employee)
- ❌ `shared/festivos.json` o catálogo de holidays
- ❌ `shared/config/categorias-nomina.json`
- ❌ `modulos/rh/config-empleados/` (panel admin para editar categorías)
- ❌ Cualquier referencia a `x_categoria_nomina`, `x_he_tipo`, `x_aplica_ppa`, `x_cita_entrada` (todos cero matches en grep)

### 2.3 Cómo se determina HOY la cita de entrada

Frontend `kiosk.js` no llama a `horarios-base.json`. La cita aparece solo en módulo planeación (`operaciones/planeacion/`) para mostrar/comparar hora real vs cita programada. **El kiosk NO valida tarde/temprano contra cita** — solo geo y candados.

Lógica decisor existente (`horarios-base.js:46-59`):
```javascript
perfilParaDepto(deptId, empleado){
  if (deptId === 3){
    const oficinaIds = [89, 91, 113];  // ← HARDCODE: Gibrán, Gerardo, Teresa
    if (empleado && oficinaIds.indexOf(empleado.id) !== -1) return 'operaciones_oficina';
    if (empleado && window.PLANEACION_CONFIG &&
        !window.PLANEACION_CONFIG.requiereCheck(empleado.id)){
      return 'operaciones_oficina';
    }
    return 'operaciones_campo';
  }
  const map = { 6: 'comercial', 8: 'rh', 9: 'legal', 12: 'ingenieria' };
  return map[deptId] || 'operaciones_campo';
}
```

**Bugs detectados en esta lógica:**
1. `map[8] = 'rh'` pero **dept 8 es "Administración y Finanzas" sin empleados activos**. Ana Laura (RH) está en dept **16** "Recursos Humanos", que NO aparece en el map → cae a `operaciones_campo`.
2. `map[12] = 'ingenieria'` pero **dept 12 no existe** en Odoo — Ingeniería es dept **17**.
3. `oficinaIds = [89, 91, 113]` hardcoded — duplica lo de `planeacion-config.json` (que sí tiene 89, 91, 113 con `requiere_check:false`) pero pierde sincronía si se edita uno y no el otro.

---

## 3. Estado actual de Odoo

### 3.1 Campos custom en `hr.employee` (Studio)

| Campo | Tipo | Poblado | Uso actual | Conflicto con Sprint 1? |
|---|---|---|---|---|
| `x_currency_id` | many2one | — | Nómina link | No |
| `x_studio_adjunto` | binary (computed) | — | Adjunto archivo | No |
| **`x_studio_hora_entrada`** | float | **35/44 activos** (valores 0, 7, 7.5, 8) | Cita programada de entrada en horas decimal | ⚠️ **OVERLAP con `x_cita_entrada` (HH:MM)** propuesto en Sprint 1 |
| `x_studio_link_nomina` | char | — | Link externo de nómina legacy | No |
| `x_studio_retardos_15_dias` | integer | poblado | Counter retardos | Parcial (Sprint 1 puede reusar) |
| `x_studio_ultimo_retardo_notificado` | date | — | Tracking notificaciones retardo | Parcial |

### 3.2 Resource calendars (`resource.calendar`)

| ID | Name | hours_per_day | tz | two_weeks | # employees asignados (de 44) |
|---|---|---|---|---|---|
| 1 | Standard 40 hours/week | 8 | UTC | false | 0 (zombie) |
| **2** | **Horas operaciones** | **10** | **Mexico/General** | false | **3** (Leonel 6, Héctor 25, Samuel 57) |
| 3 | Standard 38 Hours/Week | 7.6 | UTC | false | 0 |
| 4-5, 7-13 | Standard 40 hours/week | 8 | mixed | false | placeholders + zombies |
| **6** | **Horas de oficina** | **10** | **Mexico/General** | false | **38** (mayoría) |
| 14 | Appointment Resource Default Calendar | 24 | Mexico/General | false | 0 |
| 15 | Opening time | 4 | Mexico/General | false | 0 |

⚠️ **Inconsistencia crítica:** la mayoría de empleados Operaciones campo (Felipe Pérez id 112, Tomás Loredo 138, Stephany 121, etc., todos con `x_studio_hora_entrada=7`) están en calendar id=6 "Horas de oficina" — debería ser id=2 "Horas operaciones".

⚠️ Solo 2 calendars productivos de los 15. **13 zombies** (mayoría Standard 40/week sin uso).

### 3.3 Departamentos (`hr.department`)

| ID | Name | Active | # empleados |
|---|---|---|---|
| 3 | **Operaciones** | ✓ | **23** |
| 5 | **Dirección** | ✓ | **1** (Esteban) |
| 6 | **Comercial** | ✓ | **7** |
| 8 | Administración y Finanzas | ✓ | 0 (zombie, pero referenciado por `horarios-base.json` rh) |
| 9 | **Legal** | ✓ | **1** (Magaly) |
| 10 | Operaciones YIN | ✓ | 0 (zombie) |
| 15 | Management | ✓ | 0 (zombie) |
| 16 | **Recursos Humanos** | ✓ | **1** (Ana Laura) |
| 17 | **Ingenieria** (sin acento) | ✓ | **4** |

Total productivos: 6 departamentos / 37 empleados con depto. + 7 placeholders sin depto = 44.

### 3.4 Festivos y leaves

- **`resource.calendar.leaves`**: **0 registros para 2026**. Sin festivos cargados.
- **`hr.leave.type`**: 11 tipos activos (Vacaciones, Paid Time Off, Sick, Unpaid, Maternity IMSS, Disability IMSS, Work risk IMSS, Compensatory Days, Extra Hours, Extra Time Off, Home Workings). Infraestructura nativa Odoo lista, pero sin uso intensivo aparente.

### 3.5 Empleados activos (count)

- 44 totales con `active=true`
- 37 con departamento asignado
- 7 placeholders sin depto: CAJERO 1 (id 81), Ana Santos (87), Carlos (88), Jaime (95), Perla (104), Yolanda (115), Administracion FTS-YIN (148)

---

## 4. Estado actual de n8n

### 4.1 Workflows activos (14)

| ID | Nombre | Toca empleados | Toca incidencias | Cron? |
|---|---|---|---|---|
| `a7mEjjdwIzzvomXs` | kiosk/checkin v4.2 | ✓ READ + auto-rescate F1.5 | ✓ write a `incidencias-asistencia.json` (rama auto) + legacy `incidencias.json` | webhook |
| `U13fngg2dTKgDQ8Y` | kiosk/estado-empleado v3 | ✓ READ employee + attendances | NO | webhook |
| `2UGWLjNwYRGtXq5y` | kiosk/empleados v3.1 | ✓ READ list | NO | webhook |
| `JLiuczUd61xVNp36` | incidencias/crear-olvido-entrada | ✓ READ + UPDATE TAG | ✓ write asistencia.json | webhook |
| `IRtG38Aknb5SW15h` | incidencias/crear-olvido-checkout | ✓ UPDATE attendance + TAG | ✓ write asistencia.json | webhook |
| `Oc2ceMHX2O0L0y2X` | incidencias/resolver v2.1 | ✓ UPDATE attendance + TAG cleanup | ✓ write asistencia.json | webhook |
| `WkgYjDeL2kQInz3H` | kiosk/cerrar-registro v2.0 | ✓ UPDATE attendance | partial | webhook (LEGACY post-F1) |
| `Bqnfsx8gx2TpzfwM` | asistencias/admin | ✓ heavy (36 nodos) | ✓ admin ops | webhook |
| `nNNQrFMTSjIfqHep` | dashboard/resumen v4.3 | ✓ READ + aggregates | NO | webhook |
| `m6dyGa0yV1zYPwJF` | kiosk/sos v3.4 | NO | partial (Bloque B SOS) | webhook |
| `HwPq9dqxjy2KETi7` | accesos-incidencias/guardar v2.2 | NO | ✓ auth/persistencia | webhook |
| `f59LMsbjPmO8pzWu` | panel/derivar-roles F2.1 | ✓ READ + parent_id reverso | NO | webhook |
| `G9mo4xkJKpbPDaT4` | pmo/chat-apply | NO | NO | webhook (PMO module) |
| `jnegpT9jEQrhR3hI` | pmo/chat-direct | NO | NO | webhook (PMO module) |

### 4.2 Workflows inactivos (22)

Todos son versiones archivadas (`isArchived:true`) de los activos. **Ningún** cron entre ellos.

### 4.3 Sin cron workflows

Cero workflows scheduled trigger en TODO el repo (activos + inactivos). El roadmap Bloque B (cron 2am auto-cierre) sigue pendiente — sería el primer scheduled trigger del sistema.

### 4.4 Schemas que asumen los workflows sobre hr.employee

Los workflows leen estos campos de `hr.employee` (no escriben):
- `id`, `name`, `active`, `company_id`, `department_id`, `parent_id`
- `work_email`, `work_phone`, `mobile_phone` (snapshot supervisor)
- `resource_calendar_id` (no leído activamente pero referenciado)

**Ninguno lee** `x_studio_hora_entrada`, `x_categoria_nomina`, etc. Sprint 1 puede agregar campos custom sin romper workflows existentes.

---

## 5. Gap Analysis — Sprint 1

### 5.1 Campos custom hr.employee

| Campo Sprint 1 | Estado actual | Decisión |
|---|---|---|
| `x_categoria_nomina` (CEO/confianza/hourly_doble/hourly_sencilla/no_he_comercial) | ❌ no existe | Crear nuevo (decisión 4) |
| `x_he_tipo` (dobles/sencillas/no_aplica) | ❌ no existe | Crear nuevo |
| `x_cita_entrada` (HH:MM) | 🟡 **OVERLAP con `x_studio_hora_entrada` (float)** existente con 35 valores | Decisión 2: ¿migrar a HH:MM? ¿usar float existente? |
| `x_dias_laborables` (array M-F) | 🟡 implícito via `resource_calendar_id` | Decisión: ¿campo redundante o reemplaza calendar? |
| `x_aplica_ppa` (bool) | ❌ no existe | Crear nuevo |

### 5.2 Festivos catálogo

| Necesidad | Opciones |
|---|---|
| Festivos calendar | **A. Custom model `x_festivos_calendario`** (más control) <br>**B. `resource.calendar.leaves` nativo Odoo** (ya existe infra, 0 records 2026) <br>**C. JSON puro en repo `shared/festivos.json`** (no Odoo) |

### 5.3 Schedules resource.calendar

| Sprint 1 dice | Realidad |
|---|---|
| Operaciones CAMPO 7:00-17:06 | ✅ existe id=2 "Horas operaciones" (10h, Mexico) — pero solo 3 empleados asignados (deberían ser ~15-20 ops campo) |
| Operaciones OFICINA 7:30-17:36 | ✅ existe id=6 "Horas de oficina" (10h, Mexico) — pero ABUSADO (38 empleados asignados, mayoría Operaciones campo mal asignados) |
| Comercial 8:00-18:06 | ❌ no existe específico — comerciales usan id=6 |
| Ana RH 7:00-17:06 | ❌ no existe específico — Ana usa id=6 |
| Legal 7:30-17:36 | ❌ no existe específico — Magaly usa id=6 |
| Ingeniería 7:00-17:06 | ❌ no existe específico — usa id=2 (Héctor) o id=6 (Vicente/Juan Manuel/Ricardo) inconsistentemente |

**Acción:** crear los 4 calendars faltantes (Comercial, RH, Legal, Ingeniería) + corregir asignaciones masivamente.

### 5.4 Otros

| Necesidad | Estado |
|---|---|
| `shared/config/empleados-master.json` (espejo) | ❌ no existe (pero `planeacion-config.json` es ~10% del scope) |
| `modulos/rh/config-empleados/` (panel admin) | ❌ no existe |
| Sync Odoo ↔ JSON | ❌ no existe (depende decisión 4) |
| Doc plan `docs/PLAN_NOMINA_FTS_SUITE.md` | ❌ **referenciado pero no en repo** |

---

## 6. Riesgos arquitectónicos

1. **Duplicación `x_studio_hora_entrada` vs `x_cita_entrada`**: si se crea el campo nuevo sin migrar, hay 2 fuentes de verdad para "cita programada". Riesgo alto de drift.

2. **`resource_calendar_id` mal asignado en producción**: 30+ empleados Operaciones campo con calendar "oficina". Sprint 1 va a tener que tocar masivamente esta asignación. Acción muy visible — comunicar antes de hacerla.

3. **`horarios-base.json` tiene 2 bugs**:
   - dept 8 (Admin y Finanzas zombie) en lugar de dept 16 (Recursos Humanos) para Ana
   - dept 12 (no existe en Odoo) para Ingeniería en lugar de dept 17
   
   Ana ha estado cayendo a fallback "operaciones_campo" silenciosamente. Confirmar antes de fixear (puede ser intencional?).

4. **`oficinaIds = [89, 91, 113]` hardcoded en horarios-base.js**: 3 IDs en string literal. Si se agrega otro Operaciones oficina o uno se cambia de rol, hay que editar JS + redeploy. Sprint 1 debería migrar a `x_categoria_nomina='confianza'` y eliminar el hardcode.

5. **Empleados sin departamento (7 activos)**: pueden ser tests, ex-empleados que olvidaron desactivar, o usuarios reales sin asignar. Cualquier query sobre `hr.employee` que filtre por departamento los pierde.

6. **No cron en n8n**: si Sprint 1 quiere sync Odoo→JSON automático nocturno, este sería el primer cron. Requiere validar trigger schedule + tz + monitoring (Bloque B también necesita esto, sinergia).

7. **2 archivos de incidencias paralelos** (legacy + F2.1+): post-F1.5 la rama auto_rescate ya está en el archivo nuevo, pero ajuste_hora_entrada y ajuste_hora_salida siguen en el legacy. Sprint 1 idealmente termina la migración (Opción 1 del backlog).

8. **`tag_disputa_activo` flag dispersa**: existe el campo en incidencias-asistencia.json (F2.1+), también en attendance (`x_studio_horario_en_disputa`), y se setea desde varios workflows. Sprint 1 NO debería tocarlo, pero documentar.

9. **44 empleados activos en Odoo vs 37 con depto + 7 placeholders**: Sprint 1 catálogo necesita decidir si los 7 placeholders forman parte del scope o no.

---

## 7. Decisiones de diseño pendientes

Numeradas para tu revisión (Esteban):

1. **Source of truth de empleados:** ¿Odoo es master + `empleados-master.json` espejo? ¿O JSON master + Odoo update? ¿O ambos sincronizados con timestamp `last_modified`?

2. **Campo `x_cita_entrada` (HH:MM string)**: 3 opciones:
   - **A.** Crear nuevo `x_cita_entrada` (char HH:MM), migrar valores de `x_studio_hora_entrada` (float 7.0 → "07:00", 7.5 → "07:30", 8 → "08:00"), deprecar el float
   - **B.** Mantener `x_studio_hora_entrada` (float) y agregar getter/setter en frontend para convertir HH:MM ↔ float
   - **C.** Renombrar `x_studio_hora_entrada` → `x_cita_entrada` y cambiar tipo a char (rompe valores existentes — backfill)
   
3. **Festivos catálogo**: 3 opciones:
   - **A.** Modelo custom `x_festivos_calendario` (control total, otro Studio model)
   - **B.** `resource.calendar.leaves` nativo (infra ya existe, integración con cálculo de horas trabajadas automática)
   - **C.** `shared/festivos.json` puro repo (kiosk lee, no Odoo)

4. **Sync Odoo ↔ JSON**: 3 opciones:
   - **A.** n8n cron diario 1am: `READ hr.employee` → escribe `shared/empleados-master.json` via GitHub PUT. Sencillo.
   - **B.** On-change: panel admin escribe a Odoo (vía webhook n8n) Y reescribe JSON en mismo flujo. Latencia 0.
   - **C.** Pull-on-demand: kiosk no lee JSON, llama a workflow `kiosk/empleados v3.1` para datos frescos. JSON solo cache. (Es lo que se hace **HOY** — el workflow returns lista live.)

5. **Panel admin (`modulos/rh/config-empleados/`)**:
   - ¿Escribe directo a Odoo via workflow n8n + sync JSON automático?
   - ¿O escribe a JSON only, batch sync nocturno a Odoo?
   - ¿O escribe a Odoo via XML-RPC directo desde frontend (PAT en localStorage)?
   - Cualquiera + reemplaza/extiende `shared/planeacion-config.json` (donde vive el flag `requiere_check`)?

6. **¿Quién puede editar?** Roles autorizados para Sprint 1 categoría/cita/HE_tipo:
   - Solo Ana (RH dept)?
   - Ana + Felipe (Ops Manager)?
   - Ana + Felipe + Director (Esteban)?
   - Esquema fine-grained: Ana edita TODO, Felipe solo edita su depto, Esteban edita todo?

7. **Departamentos zombies** (Admin & Finanzas, Management, Operaciones YIN): mantener active=true o archive? Si archive: `horarios-base.json` rh debe re-apuntar a dept 16.

8. **Reasignación masiva de `resource_calendar_id`**: ~30 empleados Operaciones campo están en calendar "oficina". ¿Corregirlos como parte de Sprint 1 (job de migración data) o dejarlo para sprint separado?

9. **7 empleados sin depto activos**: archivar (`active=false`) si son tests/legacy, o asignar dept correcto?

10. **Bug `horarios-base.json`** dept 8 vs 16 para Ana RH + dept 12 vs 17 para Ingeniería: fixear inmediatamente (1 commit) o esperar a Sprint 1 que reemplaza el archivo entero?

---

## 8. Recomendación de orden — Sprint 1

### Fase 0 — Bloqueante (necesita Esteban)

- **0.1** Responder decisiones 1-10 arriba. Esperado: 30-45 min de revisión.
- **0.2** Crear `docs/PLAN_NOMINA_FTS_SUITE.md` (referenciado pero no existe). Si tienes el doc en Claude.ai pásamelo o lo redactamos juntos basado en este audit.

### Fase 1 — Catálogos Odoo (paralelo, ~2h)

Puede hacerse en paralelo si tienes Studio UI abierto:

- **1A.** Crear campos custom en hr.employee según decisión 2 + decisiones 4 (categoría/he_tipo/aplica_ppa/dias_laborables si aplica). Backfill valores desde `x_studio_hora_entrada` existente.
- **1B.** Limpiar zombies `resource.calendar` (mantener id=2, id=6, archivar 1, 3-5, 7-13, 14-15 excepto los necesarios).
- **1C.** Crear los 4 calendars faltantes (Comercial 8:00, Legal 7:30, RH 7:00, Ingeniería 7:00) según decisión 3 si aplica `_check_validity` con lunch break unpaid.
- **1D.** Reasignar `resource_calendar_id` masivo (script ad-hoc Odoo Studio o XML-RPC).
- **1E.** Festivos: implementar opción elegida en decisión 3.

### Fase 2 — Catálogos data (~1h)

- **2A.** Cargar festivos 2026 (~14 días de México: año nuevo, constitución, Benito Juárez, día del trabajo, etc.).
- **2B.** Categorizar 44 empleados activos (asignar categoría_nomina + he_tipo). Tabla espreadable.
- **2C.** Validar `parent_id` (supervisor jerárquico) consistente con depto.

### Fase 3 — Repo + sync (~2h)

- **3A.** Crear `shared/config/empleados-master.json` con el espejo inicial (full dump).
- **3B.** Crear workflow n8n `sync/empleados-master` (cron o on-change según decisión 4).
- **3C.** Migrar consumers existentes (kiosk/empleados, panel-incidencias, mi-perfil) a leer del nuevo archivo o keep status quo si decisión 4=C.
- **3D.** Fixear `horarios-base.js` bugs (dept 8 → 16, dept 12 → 17) si no se elimina el archivo completo.

### Fase 4 — Panel admin (~3h)

- **4A.** Crear `modulos/rh/config-empleados/index.html` con tabla de empleados editable.
- **4B.** Frontend invoca workflow n8n para writes a Odoo + auto-sync JSON.
- **4C.** Permisos via FTSAuth.role + decisión 6.

### Fase 5 — Validación E2E (~1h)

- **5A.** Smoke test: Ana edita categoría de un empleado → guarda → Odoo refleja → JSON refleja → kiosk muestra cita correcta para retardo.
- **5B.** Smoke test: agregar festivo → kiosk/estado-empleado lo respeta (no marca falta).
- **5C.** Smoke test: panel admin asigna calendar nuevo → cálculo de horas paid/unpaid funciona.

### Total estimado

**8-10 horas de trabajo neto** + decisiones bloqueantes de Esteban (~45 min).

Si las decisiones definen sync = on-change (decisión 4B) y un solo rol editor (decisión 6 = solo Ana), simplifica fase 3-4. Si quieres todos los roles + cron + custom festivos model, sube a 12-14h.

---

## Anexo — Datos verificados (raw)

- 44 empleados activos en Odoo verificados via `search_records('hr.employee', [['active','=',true]])`
- 15 resource.calendar verificados (2 productivos, 13 zombies)
- 9 hr.department verificados (6 con empleados, 3 zombies)
- 11 hr.leave.type verificados (Vacaciones, IMSS, etc.)
- 0 resource.calendar.leaves para 2026 (sin festivos cargados)
- 6 campos x_* custom en hr.employee
- 14 workflows n8n activos + 22 archivados; 0 cron workflows
- horarios-base.json v2 con 6 perfiles
- planeacion-config.json v1 con 11 empleados (8 require_check + 3 no_require)

Audit hecho sin escribir nada a Odoo, n8n, o repo (excepto este doc).
