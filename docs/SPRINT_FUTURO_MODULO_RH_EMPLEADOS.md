# Sprint Futuro — Módulo RH Empleados (CRUD)

**Status:** 📋 propuesta de diseño · **NO implementado**
**Audiencia:** Esteban (decisor final), Ana Acevedo (RH consumer principal), Magaly Pérez (Legal consumer)
**Generado:** 2026-05-21 vía audit profundo (Odoo MCP + n8n MCP + filesystem FTS Suite)
**Implementación esperada:** 4 sprints, ~18-26 hrs CC total

---

## Resumen ejecutivo

Ana (RH) y Magaly (Legal) hoy necesitan entrar a `serviciosfts.odoo.com` para dar de alta, editar o archivar empleados. Esto:
- Las obliga a aprender la UI de Odoo (curva)
- Da acceso al backend completo (over-permisos vs. necesidad)
- No deja audit log centralizado en FTS Suite
- Bloquea cualquier validación de negocio propia (PIN único FTS, horario en rango, etc.)

**Propuesta:** módulo nuevo `shared/rh/empleados/` paralelo a los visores existentes en `modulos/rh/`, que cubre **lista + alta + edición + archivado + reactivación** vía 4 webhooks n8n nuevos.

**Camino crítico:** la creación de empleado en Odoo dispara el workflow existente `rh/empleados-master/sync` (5nzVRsCMlCZlq5s4) vía su Webhook trigger (alterno a Schedule 6am CST), lo que mantiene `shared/config/empleados-master.json` fresco sin esperar al cron.

**Riesgo principal:** los 8 workflows productivos que leen `empleados-master.json` o `hr.employee` directamente asumen ciertos campos (`x_studio_hora_entrada`, `x_categoria_nomina`, etc.). El form de alta DEBE garantizar que esos campos se pueblen o tengan default seguro — de lo contrario el siguiente checkin/cron rompe.

---

## ⚠ Advertencia metodológica

Odoo MCP **se desconectó** durante este audit (turn 21-may post-cleanup foto). Por lo tanto:

- ✅ Schema confirmado live: empleados-master.json (15 campos) + hr.attendance + hr.employee parcial (turns previos en sesión).
- 🟡 Schema asumido: campos hr.employee Odoo 19 estándar (no re-verificados live HOY). **Antes de implementar el sprint A, RE-correr `fields_get('hr.employee')` para confirmar.**
- ✅ Workflows topológicamente confirmados via n8n MCP (estaba online): nodos + conexiones de `2UGWLjNwYRGtXq5y` (kiosk/empleados) y `5nzVRsCMlCZlq5s4` (rh/empleados-master/sync).
- 🟡 Permisos finos: FTSAuth tiene `master | admin | user` (coarse). Roles dinámicos vienen de `panel/derivar-roles` (f59LMsbjPmO8pzWu) — patrón confirmado en CLAUDE.md §11 #7.

Donde dice 🟡 abajo, el implementador debe re-verificar.

---

## EJE 1 — Schema `hr.employee` (audit completo)

### 1.A Campos confirmados VIVOS (verified live durante esta sesión)

Estos campos están en `shared/config/empleados-master.json` (sync 19-may cron 6am, 45 empleados, _meta v3) — confirma que el workflow los lee de `hr.employee` correctamente:

| Campo | Tipo | Fuente | Notas FTS |
|---|---|---|---|
| `id` | int (PK) | Odoo standard | Inmutable. Llave en kiosk + incidencias + audit-log |
| `name` | char | Odoo standard | Display name "Nombre Segundo Apellido1 Apellido2" |
| `active` | bool | Odoo standard | `false` = archivado. Cron sync filtra `active=true` |
| `work_email` | char | Odoo standard | Notificaciones RH (snapshot al crear incidencia) |
| `work_phone` | char | Odoo standard | Defensivo, puede ser null |
| `mobile_phone` | char | Odoo standard | Idem, defensivo |
| `department_id` | many2one(hr.department) | Odoo standard | **Requerido** para `panel/derivar-roles` y `Code - Merge incidencia`. Empleado sin depto cae en `pendiente_rh` |
| `department_name` | string (de tuple) | Computed | Reflejo de department_id[1] |
| `parent_id` | many2one(hr.employee) | Odoo standard | **Fuente de verdad supervisor** (CLAUDE.md §4). Usado por workflows xVNp36 + 5SW15h al snapshot supervisor |
| `parent_name` | string | Computed | Reflejo |
| `resource_calendar_id` | many2one(resource.calendar) | Odoo standard | Define hora_entrada/salida + lunch. **Requerido** para overtime/payroll futuro |
| `resource_calendar_name` | string | Computed | Reflejo |
| `x_studio_hora_entrada` | float (0-23.5) | Custom Studio | Override de entrada nominal CST. Si `null`, fallback a calendar. 37/45 empleados lo tienen, 8 sin él |
| `x_studio_retardos_15_dias` | int | Custom Studio | Counter rolling — calculado por payroll workflows. No editable en form RH (read-only) |
| `x_categoria_nomina` | char (selection) | Custom NO-Studio | Override categoría payroll. Valores observados: `ceo`, `hourly_sencilla`, `confianza`. 8 con override explícito, 37 con `null` (= default-por-depto) |
| `x_aplica_ppa` | bool | Custom NO-Studio | Prima Patronal Adicional. Default true (43/45), 2 con `false` |

### 1.B Campos asumidos Odoo 19 estándar 🟡 (NO re-verificados HOY)

Estos vienen de mi conocimiento de Odoo 19 enterprise + CLAUDE.md menciones. **RE-VERIFICAR con `fields_get('hr.employee')` antes de sprint A.**

#### Grupo A — Esenciales para alta (form mínimo)
| Campo | Tipo | Necesario? | Notas |
|---|---|---|---|
| `name` | char | **REQ** | Ya cubierto arriba |
| `work_email` | char | REC | Para notificaciones |
| `mobile_phone` | char | REC | WhatsApp ops |
| `work_phone` | char | OPT | |
| `company_id` | many2one(res.company) | REQ | Default 1 (FTS) — readonly en form |
| `department_id` | many2one(hr.department) | **REQ** | Selector con 6 deptos válidos (CLAUDE.md §4) |
| `job_id` | many2one(hr.job) | OPT | Cargo descriptivo, no usado por workflows |
| `job_title` | char | OPT | Free text (puede prevalecer sobre job_id) |
| `parent_id` | many2one(hr.employee) | **REQ** | Supervisor — autocomplete |
| `resource_calendar_id` | many2one(resource.calendar) | **REQ** | Selector de calendars activos |
| `gender` | selection(male/female/other) | OPT | Demográfico |
| `birthday` | date | OPT | Para cumpleaños / payroll legal |
| `country_id` | many2one(res.country) | OPT | Default México |

#### Grupo B — Importantes para operación FTS
| Campo | Tipo | Necesario? | Notas |
|---|---|---|---|
| `active` | bool | sí (toggle) | `false` = archivado. Form: NO editable directo, solo via acción "Archivar/Reactivar" |
| `departure_date` | date | REQ al archivar | Fecha efectiva de baja |
| `departure_reason_id` | many2one(hr.departure.reason) | REQ al archivar | Selector. Opciones típicas: Resignación, Despido, Fin contrato, Otro (🟡 verificar IDs reales) |
| `departure_description` | text | OPT | Notas adicionales del archivado |
| `pin` | char | **REQ** | Kiosk PIN. **Validar único en FTS** |
| `image_1920` | binary | OPT | Foto del empleado (Odoo redimensiona auto a `image_128`, `image_256`, etc) |
| `image_128` | binary | computed | Thumb usado por kiosk + visores. **NO editable** |
| `identification_id` | char | OPT | CURP / RFC / similar |
| `passport_id` | char | OPT | Solo extranjeros |
| `x_studio_hora_entrada` | float | **REQ** (con default por calendar) | Ya cubierto 1.A |
| `x_categoria_nomina` | selection | OPT (default vía get-categoria.js) | Ya cubierto 1.A |
| `x_aplica_ppa` | bool | OPT (default true) | Ya cubierto 1.A |
| `marital` | selection | OPT | single/married/cohabitant/widower/divorced |
| `children` | int | OPT | Para legales / INFONAVIT |
| `work_location_id` | many2one(hr.work.location) | OPT | Topo Chico / Mzo / FTS Monterrey |

#### Grupo C — Avanzados (NO en MVP)
Estos viven en Odoo enterprise pero **no se incluyen en el form FTS de MVP**. Editables únicamente entrando a Odoo directo (mantener flow legacy).

- `bank_account_ids` (cuentas bancarias) — sensible, separar a Magaly o RH ampliado
- `certification_ids`, `resume_line_ids` (CV detallado)
- `private_email`, `private_phone`, `private_street`, etc. (datos privados)
- `emergency_contact`, `emergency_phone`
- `visa_no`, `visa_expire`, `work_permit_*` (solo extranjeros)
- `coach_id`, `leave_manager_id` (gestión separada del manager)
- `spouse_*`, `place_of_birth`, `country_of_birth`
- `category_ids` (tags genéricos Odoo)
- `rate_per_hour`, contract fields (gestión via `hr.contract` aparte)

**Justificación:** son raramente editados, agregan complejidad UI, y para el 95% de casos operativos los 23 campos del Grupo A+B alcanzan. Si Ana necesita uno de éstos puntualmente, entra a Odoo directo.

### 1.C Cross-reference con FTS Suite

#### Workflows que CONSUMEN hr.employee live:

| Workflow | ID | Campos que lee | Acción si campo falta |
|---|---|---|---|
| `kiosk/empleados (v3.1)` | `2UGWLjNwYRGtXq5y` | id, name, image_128, **pin**, parent_id, work_email, mobile_phone, x_studio_hora_entrada, x_categoria_nomina, x_aplica_ppa | Empleado sin `pin` no aparece en kiosk → no puede checar |
| `rh/empleados-master/sync` | `5nzVRsCMlCZlq5s4` | (idem) + active filter | Empleado active=false excluido del JSON |
| `kiosk/checkin v4.2` | `a7mEjjdwIzzvomXs` | id, parent_id, department_id, work_email | Sin parent_id → incidencia `sin_supervisor: true → pendiente_rh` |
| `panel/derivar-roles (F2.1)` | `f59LMsbjPmO8pzWu` | id, name, department_id, parent_id, work_email, mobile_phone | Roles derivados — empleado sin depto no obtiene rol |
| `incidencias/crear-olvido-entrada` | `JLiuczUd61xVNp36` | id, name, department_id, parent_id (+ snapshot supervisor) | Sin depto → `depto_invalido: true` |
| `incidencias/crear-olvido-checkout` | `IRtG38Aknb5SW15h` | Idem | Idem |
| `incidencias/resolver v2.1` | `Oc2ceMHX2O0L0y2X` | id, name (read-only de incidencia.empleado_*) | No falla por hr.employee |
| `dashboard/resumen v4.3` | `nNNQrFMTSjIfqHep` | id, department_id, x_categoria_nomina | KPIs por categoría |

**Conclusión campos OBLIGATORIOS para form FTS alta:**

| Campo | Razón |
|---|---|
| `name` | Display universal |
| `active` (auto-true al crear) | Workflows filtran |
| `department_id` | derivar-roles, incidencias, dashboard, payroll |
| `parent_id` | supervisor, snapshot incidencias |
| `resource_calendar_id` | overtime/payroll/horario nominal |
| `pin` (único) | kiosk gating |
| `x_studio_hora_entrada` (con fallback calendar.hour_from) | candado hora mínima, cálculo retardos |

Lo demás es opcional pero recomendado (`work_email`, `mobile_phone`, `x_categoria_nomina`, `x_aplica_ppa`).

---

## EJE 2 — Reglas de negocio FTS

### 2.A Validaciones al CREAR

| Validación | Implementación |
|---|---|
| `name` no vacío, >= 5 chars | client + server |
| `pin` 4 dígitos, único contra `empleados-master.json` actual | client (consulta JSON) + server (consulta Odoo) |
| `work_email` formato válido + único | client regex + server Odoo |
| `x_studio_hora_entrada` ∈ [0, 23.5] step 0.5 | client number input |
| `department_id` ∈ {Comercial, Dirección, Ingenieria, Legal, Operaciones, Recursos Humanos, Administracion y Finanzas} | server whitelist (de CLAUDE.md §3 `DEPTOS_VALIDOS` + descubrimiento live) |
| `parent_id` debe existir y `active=true` | server query Odoo |
| `parent_id !== self` (no se puede asignar a sí mismo) | server check |
| `resource_calendar_id` debe existir y active | server query |
| `x_categoria_nomina` ∈ {null, "ceo", "confianza", "hourly_sencilla", "hourly_doble"} (🟡 confirmar valores reales con dump) | client select |
| `x_aplica_ppa` bool (default true) | client checkbox |

### 2.B Validaciones al EDITAR (no son las mismas que crear)

| Campo | Permite cambio? | Trigger consecuencia |
|---|---|---|
| `name` | sí | Update kiosk display, incidencias snapshot (datos antiguos persisten en incidencias antiguas, por diseño) |
| `pin` | sí (con confirmación) | Validar nuevo único; empleado debe re-aprender. Audit log obligatorio |
| `department_id` | sí (con confirmación) | Cambia derivar-roles. Si está dentro de jornada activa, no afecta attendance en curso |
| `parent_id` | sí | Mismo |
| `resource_calendar_id` | sí (raro) | Solo Esteban (Dirección) — afecta overtime |
| `x_studio_hora_entrada` | sí | Solo RH (Ana) — affects candado kiosk |
| `x_categoria_nomina` | sí | Solo Esteban — afecta payroll |
| `x_aplica_ppa` | sí | Solo Esteban |
| `active` | NO (usar acción Archivar) | Separa preocupaciones; acción específica fuerza departure_date |

### 2.C Validaciones al ARCHIVAR

| Pre-check | Acción si falla |
|---|---|
| `departure_date` requerido | bloquear |
| `departure_reason_id` requerido | bloquear |
| Attendance abierto (sin check_out) HOY | warning con prompt: ¿cerrar manual primero? (link a editor-asistencias) |
| Incidencias `pendiente_*` con `empleado_id = self` | warning lista las incidencias abiertas, prompt: ¿cerrar antes? |
| Es manager de >0 empleados activos | **bloqueante** — primero reasignar parent_id de subordinados, luego archivar |
| Es CEO (x_categoria_nomina='ceo') | **bloqueante** — caso especial Dirección |

### 2.D Validaciones al REACTIVAR

| Pre-check | Acción |
|---|---|
| `active=false` | requerido (no se reactiva uno activo) |
| Limpiar `departure_date` + `departure_reason_id` | auto al reactivar |
| Audit log: `reactivado_por`, `reactivado_at`, `razon` (opcional) | obligatorio |

---

## EJE 3 — Permisos y roles

### 3.A Estado actual de auth en FTS Suite

| Sistema | Granularidad | Fuente |
|---|---|---|
| `FTSAuth` (auth-suite.js) | Coarse: `master \| admin \| user` | localStorage / login |
| `panel/derivar-roles` workflow | Fine: `direccion \| rh \| supervisor` derivados de Odoo (department_id + parent_id heuristics) | runtime, cache 5min |

### 3.B Permisos propuestos para el módulo empleados

| Acción | master | direccion (Esteban) | rh (Ana, Magaly) | supervisor (Felipe, Mateo) | user |
|---|---|---|---|---|---|
| Ver lista empleados | ✅ | ✅ | ✅ | ✅ (solo sus subordinados) | ❌ |
| Ver detalle empleado | ✅ | ✅ | ✅ | ✅ (solo sus subordinados) | ❌ |
| Crear nuevo empleado | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar campos básicos (name, email, phones) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar `pin` | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar `department_id`, `parent_id` | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar `x_studio_hora_entrada` | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar `x_categoria_nomina`, `x_aplica_ppa` | ✅ | ✅ | ❌ (read-only) | ❌ | ❌ |
| Editar `resource_calendar_id` | ✅ | ✅ | ❌ (read-only) | ❌ | ❌ |
| Archivar empleado | ✅ | ✅ | ✅ | ❌ | ❌ |
| Reactivar empleado | ✅ | ✅ | ❌ | ❌ | ❌ |

**Patrón:** `rh` controla campos operativos del día a día. `direccion` controla campos de payroll/horario. `supervisor` solo read de sus subordinados.

### 3.C Audit log

Cada acción de write genera entry en `shared/audit-log.json` (archivo existente) con schema:

```json
{
  "tipo": "rh_empleado_create" | "rh_empleado_update" | "rh_empleado_archive" | "rh_empleado_reactivate",
  "actor_user_id": <FTSAuth.session.userId>,
  "actor_nombre": <FTSAuth.session.nombre>,
  "actor_role_runtime": "rh" | "direccion" | "master",
  "target_employee_id": <hr.employee.id>,
  "target_nombre": <hr.employee.name>,
  "diff": { "campo": ["antes","despues"], ... },
  "razon": <texto user> | null,
  "timestamp": ISO8601
}
```

---

## EJE 4 — Arquitectura propuesta

### 4.A Ubicación

```
shared/rh/empleados/
  index.html              ← lista + filtros + acción "Nuevo"
  detalle.html?id=N       ← form edición o vista solo-lectura
  nuevo.html              ← form alta
  archivar.html?id=N      ← confirmación archivado
  js/empleados.js         ← lógica común
  js/validaciones.js      ← reglas de negocio
```

Path público: `https://yinyo1.github.io/fts-suite/shared/rh/empleados/`

**Entry point:** desde `modulos/rh/index.html` agregar card "Gestión Empleados" al lado de "Visor Check-ins" y "Visor Incidencias".

### 4.B Workflows n8n a crear (4 nuevos)

#### B1. `empleados/list` (search + paginación + filtros)

| Param | Type | Notas |
|---|---|---|
| `active` | bool | default true; "ver archivados" pasa false |
| `department_id` | int | opcional, filtro |
| `q` | string | búsqueda en `name` ILIKE |
| `limit` | int | default 50, max 200 |
| `offset` | int | paginación |

Response: `{ total, returned, empleados: [...campos Grupo A+B...] }`

**Nodos:** Webhook → Code Validate Auth (HMAC) → Odoo SEARCH `hr.employee` con domain dinámico + fieldsList → Code Map → Respond.

#### B2. `empleados/create` (alta)

Body: `{ <campos Grupo A+B obligatorios + opcionales>, _actor: { user_id, nombre, role_runtime } }`

Flow:
1. Webhook → Code Validate Auth HMAC
2. Code Validate Payload (server-side de las reglas EJE 2.A)
3. Odoo SEARCH `hr.employee WHERE pin=X AND active=true` — si encuentra, error `PIN_DUPLICATED`
4. Odoo CREATE `hr.employee`
5. HTTP POST a `rh/empleados-master/sync` webhook (regenera JSON inmediato)
6. HTTP PUT `audit-log.json` (append entry `rh_empleado_create`)
7. Respond `{ id, name, sync_triggered: true }`

#### B3. `empleados/update` (edición parcial)

Body: `{ id, patch: { <solo campos a cambiar> }, _actor: {...}, _reason?: "..." }`

Flow:
1. Webhook → Validate Auth
2. Odoo READ `hr.employee` actual (para diff)
3. Validate patch (campos permitidos para el role del actor)
4. Si patch incluye `pin`: validate uniqueness
5. Si patch incluye `parent_id`: validate self-ref + existe + active
6. Odoo UPDATE `hr.employee`
7. POST sync trigger
8. PUT audit-log con `diff: {...}`
9. Respond

#### B4. `empleados/archive` y `empleados/reactivate`

Comparten estructura:

Body archive: `{ id, departure_date, departure_reason_id, departure_description?, _actor, _reason }`
Body reactivate: `{ id, _actor, _reason? }`

Pre-checks server-side (lista en EJE 2.C):
- Para archive: managers-of-subordinates check, attendance abierto, incidencias pendientes
- Para reactivate: validar `active=false` antes

Odoo UPDATE → sync trigger → audit-log → Respond.

### 4.C Sync inmediato post-write

La pieza clave: cada CREATE/UPDATE/ARCHIVE/REACTIVATE de empleado dispara el **Webhook trigger** del workflow ya existente `rh/empleados-master/sync` (5nzVRsCMlCZlq5s4). Ese workflow re-genera `shared/config/empleados-master.json` desde Odoo en ~3 segundos.

**Beneficio:** kiosk, dashboard, paneles operativos ven al empleado nuevo / actualizado **sin esperar 6am**.

**Workflow `rh/empleados-master/sync` ya tiene Webhook trigger** (verified vía structure mode: `n02-webhook` node existe). NO requiere modificación. Solo invocar.

### 4.D Workflows existentes que **NO** cambian

- Sin tocar: kiosk/checkin, kiosk/empleados, derivar-roles, incidencias/*, resolver, dashboard, sos.
- Los 4 workflows nuevos son aditivos.

---

## EJE 5 — Wireframes ASCII

### 5.A Lista de empleados

```
┌──────────────────────────────────────────────────────────────────┐
│ ← RH    Gestión Empleados · build-N   ana@fts.mx · Cerrar sesión │
├──────────────────────────────────────────────────────────────────┤
│ FILTROS                                                          │
│ ┌────────────────────┐  ┌─────────────────┐  ┌──────────────┐   │
│ │ 🔍 Buscar nombre…  │  │ Departamento ▾  │  │ Activos ▾    │   │
│ └────────────────────┘  └─────────────────┘  └──────────────┘   │
│ [Limpiar] [+ Nuevo empleado]                                     │
├──────────────────────────────────────────────────────────────────┤
│ Total: 45 activos · 3 archivados · página 1/1                    │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ 📷 Leonel Cruz Cristobal (#6) · Operaciones                │   │
│ │    Sup: Felipe P. · 7:00 entrada · PPA · sin categoría     │   │
│ │                                                  [Editar] │   │
│ └────────────────────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ 📷 Ana Laura Acevedo (#101) · Recursos Humanos             │   │
│ │    Sup: Esteban · 8:00 entrada · PPA · sin categoría       │   │
│ │                                                  [Editar] │   │
│ └────────────────────────────────────────────────────────────┘   │
│ ... 43 más ...                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 5.B Form alta (nuevo)

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Empleados    Nuevo empleado                                     │
├──────────────────────────────────────────────────────────────────┤
│ DATOS BÁSICOS                                                     │
│ Nombre completo *  [____________________________________]         │
│ Email work         [____________________________________]         │
│ Tel móvil          [____________________________________]         │
│ Tel work           [____________________________________]         │
│                                                                   │
│ ESTRUCTURA ORGANIZACIONAL                                         │
│ Departamento *     [Operaciones ▾]                                │
│ Supervisor *       [Felipe Pérez Guzmán ▾] (autocomplete)         │
│ Calendario *       [Horas operaciones ▾]                          │
│                                                                   │
│ ASISTENCIA                                                        │
│ PIN kiosk *        [____] (4 dígitos, único)                      │
│ Hora entrada       [7.0 ▾]  ⓘ formato decimal: 7.5 = 7:30am       │
│                                                                   │
│ PAYROLL (solo Dirección puede editar)                             │
│ Categoría nómina   [⌀ default por depto ▾] (read-only para RH)    │
│ Aplica PPA         [✓]                       (read-only para RH)  │
│                                                                   │
│ * = obligatorio                                                   │
│                                                                   │
│ [Cancelar]                                       [Crear empleado] │
└──────────────────────────────────────────────────────────────────┘
```

### 5.C Form edición

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Empleados    Editar: Leonel Cruz Cristobal (#6)                 │
│                                              [Archivar empleado] │
├──────────────────────────────────────────────────────────────────┤
│ 📷 (foto del empleado de Odoo)                                    │
│                                                                   │
│ DATOS BÁSICOS                                                     │
│ Nombre             [Leonel Cruz Cristobal__________________]      │
│ Email work         [leoncruzcriz261987@gmail.com___________]      │
│ Tel móvil          [____________________________________]         │
│ Tel work           [+52 81 1665 1692______________________]       │
│                                                                   │
│ ESTRUCTURA                                                        │
│ Departamento       [Operaciones ▾]                                │
│ Supervisor         [Felipe Pérez Guzmán ▾]                        │
│ Calendario         [Horas operaciones ▾]  (solo Dirección)        │
│                                                                   │
│ ASISTENCIA                                                        │
│ PIN kiosk          [• • • •] [Cambiar PIN]                        │
│ Hora entrada       [7.0]                                          │
│ Retardos 15d       [2]  (read-only, calculado por payroll)        │
│                                                                   │
│ PAYROLL                                                           │
│ Categoría nómina   [⌀ default por depto ▾] (read-only RH)         │
│ Aplica PPA         [✓]                       (read-only RH)       │
│                                                                   │
│ Razón del cambio (opcional)   [_________________________]         │
│                                                                   │
│ [Cancelar]                              [Guardar cambios]         │
└──────────────────────────────────────────────────────────────────┘
```

### 5.D Confirmación archivar

```
┌──────────────────────────────────────────────────────────────────┐
│ ⚠️  Archivar empleado: Leonel Cruz Cristobal (#6)                │
├──────────────────────────────────────────────────────────────────┤
│ Pre-checks:                                                       │
│  ✅ No es manager de ningún subordinado activo                    │
│  ⚠️  Tiene 1 attendance abierto HOY (id 13201). Cerrar primero?   │
│      [Abrir editor asistencias]                                   │
│  ✅ Sin incidencias pendientes                                    │
│  ✅ No es CEO                                                     │
│                                                                   │
│ Fecha efectiva *   [2026-05-21]                                   │
│ Razón *            [Renuncia voluntaria ▾]                        │
│ Notas              [_________________________________________]    │
│                                                                   │
│ Después de archivar:                                              │
│  • active = false en Odoo                                         │
│  • Empleado deja de aparecer en kiosk en ~3 seg (sync)            │
│  • Incidencias históricas se preservan                            │
│  • Foto y datos quedan en Odoo (no se borran)                     │
│  • Reactivable después si regresa                                 │
│                                                                   │
│ [Cancelar]                                  [⚠️ Confirmar archivado] │
└──────────────────────────────────────────────────────────────────┘
```

---

## EJE 6 — Plan de implementación (4 sprints)

### Sprint A — Read-only (lista + view)
**Estimado:** 4-6 hrs CC

- Workflow `empleados/list` (n8n)
- `shared/rh/empleados/index.html` — lista con filtros (depto, activos)
- `shared/rh/empleados/detalle.html?id=N` — view solo-lectura
- Card "Gestión Empleados" en `modulos/rh/index.html`
- Reuso 100% del CSS pattern `.rh-topbar` / `.vi-*`
- Testing: 45 empleados visibles, filtros funcionan
- **Sin escritura. Sin riesgo de romper sync.**

### Sprint B — Edit campos básicos
**Estimado:** 5-7 hrs CC

- Workflow `empleados/update` (validate auth + diff + Odoo UPDATE + sync trigger + audit log)
- Form edición en `detalle.html` (campos Grupo A + algunos B, con permisos por role)
- Validaciones client-side y server-side
- Audit log entry por cada update
- Testing: editar Leonel (depto, supervisor, hora entrada) → ver cambio en kiosk inmediato (sync)

### Sprint C — Alta nueva + archivar
**Estimado:** 6-8 hrs CC

- Workflow `empleados/create` con pre-validate PIN único, supervisor válido, etc.
- Workflow `empleados/archive` con pre-checks (managers, attendance, incidencias)
- Workflow `empleados/reactivate` con limpieza de departure_*
- `nuevo.html`, `archivar.html`
- Testing E2E: crear empleado dummy → kiosk lo ve → archivarlo → kiosk no lo ve

### Sprint D — Validaciones avanzadas + permisos por rol
**Estimado:** 3-5 hrs CC

- Integración con `panel/derivar-roles` (decidir UI por rol runtime)
- Gating de campos sensibles (payroll fields read-only para Ana, editables solo Esteban)
- Refinamiento UX (autocompletes en supervisor, depto)
- Documentación operativa para Ana (PDF / .md)

**Total:** ~18-26 hrs CC (puede variar ±20% según rigor de testing y descubrimientos durante sprint A).

---

## EJE 7 — Riesgos y mitigaciones

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Crear empleado sin `pin` rompe kiosk login | 🔴 | Form: `pin` requerido. Validar único en server. |
| Editar `parent_id` mientras hay incidencia abierta del subordinado | 🟡 | Snapshot supervisor en incidencias ya preserva (CLAUDE.md §3). No requiere bloqueo. |
| Archivar empleado con attendance abierto | 🟡 | Pre-check con prompt. Fix manual antes de archivar. |
| Cambio masivo de categoría_nomina en payroll en proceso | 🟡 | Solo Esteban edita. Por convenio no cambiar campos payroll a mitad de quincena. |
| Sync trigger falla → empleados-master.json desactualizado | 🟢 | Cron 6am es red de seguridad. Audit log marca discrepancia. |
| Schema Odoo 19 cambia en upgrade futuro | 🟢 | Workflows usan campos por nombre, no por position. Re-test al upgrade. |
| PIN duplicado por race condition (2 RH creando simultáneo) | 🟡 | Optimistic concurrency — Odoo SQL constraint UNIQUE en pin? 🟡 verificar. Si no, validate-then-create + retry. |
| Permisos role-based mal configurados (RH edita payroll por error) | 🟡 | Server-side gating (workflow rechaza updates de campos prohibidos). UI deshabilita visualmente pero NO confiar en client. |

---

## EJE 8 — Preguntas abiertas para Esteban (decisión previa a Sprint A)

1. **¿Sprint A se arranca cuando?** Está listo para empezar — no bloqueante con otros sprints en curso.
2. **Magaly (Legal) permisos:** ¿mismos que Ana (RH) o limitado a baja/archivado (su uso típico)?
3. **PIN: 4 dígitos sigue siendo la convención?** Hoy 1234/5678/0000 (demos) — verificar que en Odoo real son PINs distintos por empleado (no observado live en este audit).
4. **Foto: ¿se permite cargar/cambiar en el form?** Pesa más por cada empleado (~50-200 KB binary). Sprint C podría incluirlo opcional, o dejar "edita foto en Odoo directo" como excepción.
5. **¿Quieres notificación email/WA al supervisor cuando se crea un nuevo subordinado?** Trigger adicional post-create. Sprint D opcional.
6. **Hard delete vs archivar:** Odoo recomienda archivar, nunca borrar. Mantener convención. ¿OK?

---

## Apéndice A — Lista live de IDs útiles

Confirmados live durante sesiones previas:

- Depto IDs (CLAUDE.md §3 `DEPTOS_VALIDOS` + audit FASE 0 PMO 20-may): 3 Operaciones, 5 Dirección, 6 Comercial, 9 Legal, 16 Recursos Humanos, 17 Ingeniería, 18 Administración y Finanzas
- Calendar IDs: 2 Horas operaciones (7-17 CST), 6 Horas de oficina (8-18 CST)
- CEO ID: 32 (Esteban) — `x_categoria_nomina='ceo'` (único)
- Total empleados activos al 19-may-2026 6am cron: 45
- RH lead: Ana Acevedo emp 101
- Supervisores principales: Felipe Pérez (112), Mateo Salazar (75)

---

## Apéndice B — Acción inmediata si Esteban dice GO

1. **Pre-sprint:** re-correr `fields_get('hr.employee')` cuando Odoo MCP esté de regreso (HOY estaba caído). Verificar contra el grupo 1.B y ajustar este doc si hay discrepancia. ~10 min.
2. **Pre-sprint:** identificar IDs reales de `hr.departure.reason` para el dropdown del form archivar. ~5 min.
3. **Sprint A kickoff:** branch `feat/rh-empleados-sprint-a-readonly`, generar workflow n8n + páginas read-only. Estimado 4-6 hrs.

---

**Status final del audit:** Diseño completo. Sin código escrito. Sin modificaciones a Odoo, workflows, o filesystem (excepto este archivo `.md`). Pendiente GO de Esteban para arrancar Sprint A.
