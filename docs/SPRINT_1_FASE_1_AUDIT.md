# Sprint 1 Fase 1 — Audit quirúrgico Odoo (minimizar billable code)

**Fecha:** 2026-05-11
**Modo:** READ-ONLY. Cero writes a Odoo en este audit.
**Filosofía:** maximizar reuso, minimizar campos custom nuevos. Cada campo creado en Studio genera billable code (módulo `studio_customization`). Crear vía `ir.model.fields.create()` directo (state='manual') evita ese overhead.

---

## TL;DR — Reducción de fricción

| Antes (SPECS §A original) | Después (este audit) |
|---|---|
| 4 campos custom nuevos | **2 campos custom nuevos** |
| `x_categoria_nomina` (Selection) — crear | ✅ Crear (no hay equivalente) |
| `x_he_tipo` (Selection) — crear | ❌ **NO crear** — derivar de categoría en lógica nómina |
| `x_aplica_ppa` (Boolean) — crear | ✅ Crear (no hay equivalente) |
| `x_dias_laborables` (Char) — crear | ❌ **NO crear** — derivar de `resource_calendar_id.attendance_ids.dayofweek` |

**Resultado:** 2 campos en lugar de 4. **~50% menos billable code generation** vs Studio UI clicks.

---

## §1 — Campos custom existentes en hr.employee

Audit vía `ir.model.fields` con filtro `model='hr.employee' AND name like 'x_%'`:

| ID | name | label | ttype | state | required | help |
|---|---|---|---|---|---|---|
| 7855 | `x_currency_id` | Currency | many2one | manual | false | (sin help) |
| 59171 | `x_studio_adjunto` | Adjunto | binary | **base** | false | (sin help) |
| 31748 | **`x_studio_hora_entrada`** | Hora entrada | **float** | manual | false | (sin help) |
| 20576 | `x_studio_link_nomina` | Link Nomina | char | manual | false | (sin help) |
| 31738 | `x_studio_retardos_15_dias` | Retardos últimos 15 días | integer | manual | false | (sin help) |
| 31736 | `x_studio_ultimo_retardo_notificado` | ultimo retardo notificado | date | manual | false | (sin help) |

### Notas

- **`state: 'manual'`** significa que el campo fue creado vía `ir.model.fields.create()` (forma estándar de Odoo para custom fields). NO requiere Studio.
- **`state: 'base'`** significa que viene de un módulo Python instalado. `x_studio_adjunto` es probablemente un campo computed agregado por alguna extension.
- **`x_studio_hora_entrada` es FLOAT** (no string HH:MM). Confirmado.
- Ningún campo existente cubre las necesidades semánticas de Sprint 1 (categoría/PPA).

---

## §2 — Evaluación de reuso para los 4 campos propuestos del plan

### 2.1 — `x_categoria_nomina` (Selection 5 valores)

**Reuso posible:** ❌ NO. No hay ningún campo Selection en hr.employee con semantic similar.

**Verdict:** **CREAR NUEVO.** Único campo crítico para el principio autoprogresivo (default-por-dept fallback).

### 2.2 — `x_he_tipo` (Selection: dobles/sencillas/no_aplica)

**Reuso posible:** ❌ No hay campo.

**Pero:** ✅ **DERIVABLE 1:1 de `x_categoria_nomina`** vía lookup table:

```python
HE_TIPO_BY_CATEGORIA = {
  'ceo': 'no_aplica',
  'confianza': 'no_aplica',
  'hourly_doble': 'dobles',
  'hourly_sencilla': 'sencillas',
  'no_he_comercial': 'no_aplica',
}
```

**Verdict:** **NO CREAR.** Eliminar del scope Sprint 1. La lógica nómina (Sprint 2) lo deriva inline. Si en futuro alguien necesita un override edge case (raro), se evalúa.

**Ahorro:** ~10-15 líneas billable + 1 selection field + 3 ir.model.fields.selection records.

### 2.3 — `x_aplica_ppa` (Boolean)

**Reuso posible:** ❌ No hay boolean similar.

**Verdict:** **CREAR NUEVO.** Default `true`. Aplicar default vía write masivo después de creación (ver §C de snippets).

### 2.4 — `x_dias_laborables` (Char "LMMJV")

**Reuso posible:** ✅ **YA EXISTE** vía `resource_calendar_id.attendance_ids.dayofweek`. Odoo nativamente modela días laborables en `resource.calendar.attendance`.

Confirmado audit:
```
Calendar 2 "Horas operaciones": dayofweek = ['0','1','2','3','4']  (Mon-Fri)
Calendar 6 "Horas de oficina":  dayofweek = ['0','1','2','3','4']  (Mon-Fri)
```

Ambos calendars productivos solo tienen lunes-viernes. Si en futuro hay schedule con sábado (e.g., guardia weekend), se modela en `resource.calendar.attendance` NO en hr.employee.

**Verdict:** **NO CREAR.** Eliminar del scope. La lógica nómina lee directamente de `empleado.resource_calendar_id.attendance_ids.dayofweek`.

**Ahorro:** ~5 líneas billable + 1 char field + cero migration data.

### 2.5 — Reusar `x_studio_hora_entrada` (existente) para cita programada

**Estado actual:** 36/44 empleados activos poblados con valores 7.0, 7.5, 8.0 (float decimal).

**Workflows que lo usan:** según audit n8n de §13 CLAUDE.md, ningún workflow lo consume actualmente. Solo el frontend `operaciones/planeacion` lee de horarios-base.json (perfil por depto). Future Sprint 2 nómina lo consume.

**Verdict:** **REUSAR.** Lossless float ↔ HH:MM conversion en frontend/workflow. NO cambiar tipo (sería breaking).

---

## §3 — hr.department real state

Audit vía `search_records('hr.department', [], ['id','name','active','member_ids','total_employee'])`:

| ID | Name (exact Odoo string) | Active | # Members | Members IDs | Status |
|---|---|---|---|---|---|
| 3 | Operaciones | ✓ | 23 | 6,57,59,60,62,68,75,76,79,110,112,114,116,121,124,127,128,130,131,132,135,137,138 | ✅ Productivo |
| 5 | Dirección | ✓ | 1 | 32 | ✅ Productivo (Esteban CEO) |
| 6 | Comercial | ✓ | 7 | 8,48,78,85,97,108,143 | ✅ Productivo |
| **8** | **Administración y Finanzas** | ✓ | **0** | (empty) | 🔴 **Zombie real** |
| 9 | Legal | ✓ | 1 | 63 | ✅ Productivo (Magaly) |
| **10** | **Operaciones YIN** | ✓ | **0** | (empty) | 🔴 **Zombie real** |
| **15** | **Management** | ✓ | **0** | (empty) | 🔴 **Zombie real** |
| 16 | Recursos Humanos | ✓ | 1 | 101 | ✅ Productivo (Ana Laura) |
| 17 | **Ingenieria** *(sin acento)* | ✓ | 4 | 25,55,98,107 | ✅ Productivo |

### Confirmaciones críticas

- **Nombres EXACTOS** (no modificar):
  - `"Operaciones"`, `"Dirección"`, `"Comercial"`, `"Legal"`, `"Recursos Humanos"`, **`"Ingenieria"` (SIN tilde)**
  - Workflows xVNp36 y 5SW15h tienen lista `DEPTOS_VALIDOS` que coincide. ✅
- **3 zombies confirmados** (member_ids vacío + active=true): 8, 10, 15.
- **Total empleados activos en deptos productivos:** 23+1+7+1+1+4 = **37** (los 7 sin depto = 81, 87, 88, 95, 104, 115, 148).

---

## §4 — resource.calendar real state

### 4.1 Calendars audit

15 calendars totales en el sistema:

| ID | Name | hours_per_day | tz | # employees | Status |
|---|---|---|---|---|---|
| 1 | Standard 40 hours/week | 8 | UTC | 0 | zombie |
| **2** | **Horas operaciones** | **10** | **Mexico/General** | **3** | ✅ Productivo (Leonel 6, Héctor 25, Samuel 57) |
| 3 | Standard 38 Hours/Week | 7.6 | UTC | 0 | zombie |
| 4-5, 7 | Standard 40 hours/week | 8 | mixed | 0 | zombies |
| **6** | **Horas de oficina** | **10** | **Mexico/General** | **38** | ✅ Productivo (mayoría — pero con misasignación) |
| 8-13 | Standard 40 hours/week | 8 | varios | 0-1 placeholders | zombies |
| 14 | Appointment Resource Default | 24 | Mexico/General | 0 | system |
| 15 | Opening time | 4 | Mexico/General | 0 | zombie |

### 4.2 Attendance details (Mon-Fri schedules)

```
Calendar 2 "Horas operaciones":
  Monday    07:00 → 17:00 (morning)
  Tuesday   07:00 → 17:00
  Wednesday 07:00 → 17:00
  Thursday  07:00 → 17:00
  Friday    07:00 → 17:00
  
Calendar 6 "Horas de oficina":
  Monday    08:00 → 18:00 (morning)
  Tuesday   08:00 → 18:00
  Wednesday 08:00 → 18:00
  Thursday  08:00 → 18:00
  Friday    08:00 → 18:00
```

### 4.3 Hallazgo crítico — calendars sin lunch break configurado

Ambos calendars productivos son **single morning block 10h** sin lunch break unpaid configurado. Esto es **divergente** de `shared/horarios-base.json` que declara `comida_minutos: 30` y `horas_netas: 9.6`.

**Implicaciones:**
- Odoo `hr.attendance.worked_hours` calcula 10h presence (no descuenta lunch).
- Cuando Sprint 2 calcule nómina, debe aplicar la regla LFT-Art-63 (0.5h lunch unpaid) en el workflow, NO confiar en Odoo's worked_hours.
- Esto **NO** es un problema bloqueante para Sprint 1 Fase 1 (la migración de calendars es cosmética). Workflow nómina maneja la deducción.

### 4.4 Misasignaciones reales detectadas (post-PR #33 stable)

Empleados Operaciones campo + Ingeniería con `x_studio_hora_entrada = 7.0` (campo entrada 7am) actualmente en calendar 6 (oficina 8-18) — deberían estar en calendar 2 (operaciones 7-17):

| ID | Nombre | Depto | hora_entrada | Calendar actual | Calendar correcto |
|---|---|---|---|---|---|
| 55 | Juan Manuel Sánchez Lugo | Ingenieria | 7.0 | 6 | **2** |
| 75 | Mateo Salazar | Operaciones | 7.0 | 6 | **2** |
| 76 | Carlos Eduardo Manzanares | Operaciones | 7.0 | 6 | **2** |
| 79 | José Luis Romero Grados | Operaciones | 7.0 | 6 | **2** |
| 98 | Ricardo Alán Hernández González | Ingenieria | 7.0 | 6 | **2** |
| 107 | Vicente Martínez Cruz | Ingenieria | 7.0 | 6 | **2** |
| 110 | Alejandro Reyes Galvez | Operaciones | 7.0 | 6 | **2** |
| 112 | Felipe Pérez Guzmán | Operaciones | 7.0 | 6 | **2** |
| 114 | Nelson Israel Márquez Carvajal | Operaciones | 7.0 | 6 | **2** |
| 116 | Mario Armando Ruiz Ramirez | Operaciones | 7.0 | 6 | **2** |
| 121 | Stephany Ventura Arevalo | Operaciones | 7.0 | 6 | **2** |
| 124 | Germán Emmanuel Merino Falcón | Operaciones | 7.0 | 6 | **2** |
| 127 | Cesar Gildardo Gómez Cano | Operaciones | 7.0 | 6 | **2** |
| 128 | Enoc Natanael Maldonado soto | Operaciones | 7.0 | 6 | **2** |
| 130 | Rolando vazquez garcia | Operaciones | 7.0 | 6 | **2** |
| 131 | Tomas Vázquez García | Operaciones | 7.0 | 6 | **2** |
| 132 | José Carlos Ortiz romero | Operaciones | 7.0 | 6 | **2** |
| 137 | Hugo Ernesto González Moreno | Operaciones | 7.0 | 6 | **2** |
| 138 | Tomas Arnoldo Loredo Mares | Operaciones | 7.0 | 6 | **2** |

**Total: 19 empleados a migrar de calendar 6 → 2.**

Empleados que SE QUEDAN en calendar 6 (mantienen Oficina, entrada 7:30-8:00):
- Operaciones oficina (entrada 7:30 o 8): Gerardo 59, Teresa 60, Gibrán 62, Jésus M 68, Abraham 135 — 5 empleados
- Comercial (entrada 8): Francisco 8, Luis 48, Aldo 78, Diego 85, Rissia 97, Pablo 108, Pedro 143 — 7 empleados
- Legal (entrada 8): Magaly 63
- RH (entrada 8): Ana Laura 101
- Dirección (entrada 7): Esteban 32

Empleado Ingeniería que ya está correcto en calendar 2: Héctor 25.

---

## §5 — Empleados sin x_studio_hora_entrada (valor = 0.0)

8 empleados con `x_studio_hora_entrada = 0.0` (no 9 como mencionó el prompt original):

| ID | Nombre | Depto | Hipótesis | Acción Sprint 1 |
|---|---|---|---|---|
| 81 | CAJERO 1 | sin depto | test/placeholder | Archive en §F |
| 87 | Ana Santos | sin depto | test/placeholder | Archive en §F |
| 88 | Carlos | sin depto | test/placeholder (parent loop) | Archive en §F |
| 95 | Jaime | sin depto | test/placeholder | Archive en §F |
| 104 | Perla | sin depto | test/placeholder | Archive en §F |
| 115 | Yolanda | sin depto | test/placeholder | Archive en §F |
| **143** | **Pedro Arturo Hernandez** | **Comercial** | **Empleado REAL** | Setear `x_studio_hora_entrada=8.0` (Comercial default) |
| 148 | Administracion FTS-YIN | sin depto | real (Miriam admin) | Esteban define depto + hora_entrada |

---

## §6 — Cross-reference con workflows n8n

¿Algún workflow consume `x_studio_hora_entrada`, `x_studio_retardos_15_dias`, otros campos custom hr.employee?

| Campo | Workflows consumidores | Notas |
|---|---|---|
| `x_studio_hora_entrada` | NINGUNO (frontend planeación lo lee de horarios-base.json) | Sprint 2 nómina lo usará |
| `x_studio_retardos_15_dias` | NINGUNO (campo populado por alguna lógica que no encontramos) | Sprint 3 PPA lo usará |
| `x_studio_link_nomina` | NINGUNO | Legacy |
| `x_studio_ultimo_retardo_notificado` | NINGUNO | Sprint 3 |
| `x_currency_id` | NINGUNO | Probable extension Odoo |

**Implicación:** crear los 2 nuevos campos (`x_categoria_nomina`, `x_aplica_ppa`) NO rompe ningún workflow existente. Pueden agregarse independientemente.

---

## §7 — Acciones para Sprint 1 Fase 1 (minimal billable)

| Acción | Estado | Tiempo | Doc snippet |
|---|---|---|---|
| §A — Crear 2 campos custom (`x_categoria_nomina`, `x_aplica_ppa`) | pendiente | 2 min | CONSOLE_SNIPPETS §A |
| §B — Setear `x_aplica_ppa=true` masivo (todos active menos Esteban) | pendiente | 30s | CONSOLE_SNIPPETS §B |
| §C — Reasignar 19 empleados a calendar 2 | pendiente | 30s | CONSOLE_SNIPPETS §C |
| §D — Archive 3 deptos zombie (8, 10, 15) | pendiente | 30s | CONSOLE_SNIPPETS §D |
| §E — Setear `x_categoria_nomina` para 8 excepciones | pendiente | 1 min | CONSOLE_SNIPPETS §E |
| §F — Setear `x_studio_hora_entrada=8.0` para Pedro (143) + Esteban define los demás | parcial | 30s | CONSOLE_SNIPPETS §F |
| §G — Verificaciones post-ejecución | pendiente | 2 min | CONSOLE_SNIPPETS §G |

**Tiempo total ejecución Esteban (console F12):** ~10 minutos efectivos (vs ~45 min con Studio UI).

**Líneas billable evitadas:** ~30-50 (Studio crea wrapper Python + selección records + view modifications). Nuestro approach crea solo lo que necesita la lógica.

---

## §8 — Decisiones que cambian respecto al PR #33

### Cambios menores al PLAN_NOMINA_FTS_SUITE.md

1. **`x_he_tipo` ELIMINADO del scope Sprint 1.** Derivar en lógica nómina (lookup table en workflow).
2. **`x_dias_laborables` ELIMINADO del scope Sprint 1.** Leer de `resource_calendar_id.attendance_ids.dayofweek` directamente.

### Sin cambio

- §0.5 Principio autoprogresivo (default-por-dept) sigue válido y aplica.
- §G refactor a 8 excepciones explícitas sigue válido.
- D2 reuso de `x_studio_hora_entrada` confirmado.

---

## Cross-validation: ¿Esto rompe algo?

| Workflow / Frontend | ¿Afectado? |
|---|---|
| `a7mEjjdwIzzvomXs` kiosk/checkin | ❌ No. No lee campos custom hr.employee. |
| `U13fngg2dTKgDQ8Y` kiosk/estado-empleado | ❌ No. |
| `JLiuczUd61xVNp36` crear-olvido-entrada | ❌ No. Lee `parent_id`, `department_id` (estándar). |
| `IRtG38Aknb5SW15h` crear-olvido-checkout | ❌ No. |
| `Oc2ceMHX2O0L0y2X` resolver | ❌ No. |
| Frontend planeación | ❌ No. Lee horarios-base.json. |
| Frontend kiosk | ❌ No. |
| Frontend Mi Perfil / panel-incidencias | ❌ No. |

Los 2 campos custom nuevos están en hr.employee pero **NO son consumidos** por ningún componente actual. Se agregan únicamente para Sprint 2 (workflow nómina) y Sprint 1 Fase 3 (panel admin RH).

✅ **Cero riesgo de regresión por agregar los campos.**
