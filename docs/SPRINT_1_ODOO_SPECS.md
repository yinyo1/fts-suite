# Sprint 1 — Specs paso-a-paso para Esteban en Odoo Studio

**Fecha:** 2026-05-11
**Objetivo:** todo lo que Esteban necesita ejecutar manualmente en Odoo Studio para que Sprint 1 quede operativo.
**Tiempo estimado total:** ~45-60 min de Studio UI clicks.
**Pre-requisito:** `docs/PLAN_NOMINA_FTS_SUITE.md` aprobado (decisiones [AUTO] OK, decisiones [TBD] resueltas o aceptadas como están).

---

## Cómo usar este doc

Cada sección es un bloque independiente. Puedes ejecutarlas en cualquier orden EXCEPTO §A (campos) que debe ir primero porque §G depende de los campos creados.

Al terminar cada sección, marca `[ ] → [x]` en el checklist final (§H).

---

## §A — Crear 4 campos custom en hr.employee (~10 min)

**Ruta:** Apps → Employees → cualquier empleado → click "..." (top right) → Studio → Add field. Para cada uno:

### A.1 — `x_categoria_nomina`

| Atributo | Valor |
|---|---|
| Field name | `x_categoria_nomina` |
| Label | "Categoría nómina" |
| Type | **Selection** |
| Required | No |
| Default | (vacío — se llenará en §G) |
| Help text | "Categoría para cálculo de nómina y HE según LFT" |
| Selection values | `ceo`, `confianza`, `hourly_doble`, `hourly_sencilla`, `no_he_comercial` |

Display labels en la UI:
- `ceo` → "CEO"
- `confianza` → "Confianza (no HE)"
- `hourly_doble` → "Hourly — HE doble"
- `hourly_sencilla` → "Hourly — HE sencilla"
- `no_he_comercial` → "Comercial (no HE)"

### A.2 — `x_he_tipo`

| Atributo | Valor |
|---|---|
| Field name | `x_he_tipo` |
| Label | "Tipo HE" |
| Type | **Selection** |
| Required | No |
| Default | (vacío) |
| Help text | "Tipo de pago de horas extra. Auto-derivado de x_categoria_nomina pero override manual posible." |
| Selection values | `dobles`, `sencillas`, `no_aplica` |

Reglas auto:
- `ceo` → `no_aplica`
- `confianza` → `no_aplica`
- `hourly_doble` → `dobles`
- `hourly_sencilla` → `sencillas`
- `no_he_comercial` → `no_aplica`

### A.3 — `x_aplica_ppa`

| Atributo | Valor |
|---|---|
| Field name | `x_aplica_ppa` |
| Label | "Aplica PPA" |
| Type | **Boolean** |
| Required | No |
| Default | `true` |
| Help text | "Empleado elegible para Prima Por Asistencia (bono mensual por asistencia)" |

### A.4 — `x_dias_laborables`

| Atributo | Valor |
|---|---|
| Field name | `x_dias_laborables` |
| Label | "Días laborables" |
| Type | **Char (string)** |
| Required | No |
| Default | `"LMMJV"` |
| Help text | "Días de la semana que debe trabajar el empleado. Formato compacto: L=Lun, M=Mar, Mi=Mié, J=Jue, V=Vie, S=Sáb, D=Dom. Ejemplo: 'LMMJV' (lunes a viernes), 'LMMJVS' (incluye sábado)." |
| Size | 10 |

**Nota:** Decisión [AUTO] D2 confirma que NO se crea `x_cita_entrada` nuevo — reusamos `x_studio_hora_entrada` (float) que ya existe.

### Validación post-creación

Después de crear los 4 campos, abrir el form view de `hr.employee` y confirmar que aparecen en una pestaña visible (e.g., "Información laboral" o sección dedicada "Nómina FTS"). Crear pestaña nueva si quieres organizar mejor.

---

## §B — Cargar 14 festivos 2026 (~5 min)

**Decisión arquitectónica:** según `docs/PLAN_NOMINA_FTS_SUITE.md` §4.4, los festivos viven en `shared/config/festivos-mx-2026.json` (decisión [AUTO] D3=C). **NO requiere carga en Odoo.**

**Si decides después que también quieres en Odoo** (e.g., para Odoo Payroll futuro):
- Ir a Time Off → Configuration → Public Holidays
- Crear cada festivo del JSON con `calendar_id = false` (aplica a todos los calendars)

Por ahora, **skip esta sección**. El catálogo en repo es suficiente para Sprint 2 (cálculo nómina semanal).

✅ **Acción Esteban: ninguna (catálogo ya está en repo).**

---

## §C — Reasignación masiva resource_calendar_id (~15 min)

**Problema:** la mayoría de empleados Operaciones campo están en calendar id=6 "Horas de oficina" (debería ser id=2 "Horas operaciones"). Visible en `empleados-master.json`.

**Solución corto plazo (este sprint):** reasignar a calendarios correctos.

**Solución mediano plazo (Sprint 2):** crear 4 calendarios faltantes (Comercial 8:00, Legal 7:30, RH 7:00, Ingeniería 7:00) — backlog.

### C.1 — Tabla de reasignación (corregir 30 empleados)

**Ruta:** Apps → Employees → seleccionar empleado → Work Information → Working Hours.

**Cambios requeridos (de "Horas de oficina" id=6 → "Horas operaciones" id=2):**

| ID | Nombre | Depto | Hora entrada | Calendar actual | Calendar correcto |
|---|---|---|---|---|---|
| 59 | Gerardo Isai Lozano Davila | Operaciones | 7:30 | id 6 ❌ | id 2 (campo) — `[VERIFICAR: es oficina admin?]` |
| 60 | Teresa Ramos Rodríguez | Operaciones | 7:30 | id 6 | id 6 ✓ (oficina admin) |
| 62 | Gilberto Gibran Solís Carrillo | Operaciones | 7:30 | id 6 | id 6 ✓ (oficina supply chain) |
| 68 | Jésus Montalvo Ramirez | Operaciones | 8:00 | id 6 | id 6 ✓ (oficina) |
| 75 | Mateo Salazar | Operaciones | 7:00 | id 6 ❌ | id 2 (campo Sr Sup) |
| 76 | Carlos Eduardo Manzanares | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 79 | José Luis Romero Grados | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 110 | Alejandro Reyes Galvez | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 112 | Felipe Pérez Guzmán | Operaciones | 7:00 | id 6 ❌ | id 2 (campo Ops Mgr) |
| 114 | Nelson Israel Márquez Carvajal | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 116 | Mario Armando Ruiz Ramirez | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 121 | Stephany Ventura Arevalo | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 124 | Germán Emmanuel Merino Falcón | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 127 | Cesar Gildardo Gómez Cano | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 128 | Enoc Natanael Maldonado Soto | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 130 | Rolando Vázquez García | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 131 | Tomas Vázquez García | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 132 | José Carlos Ortiz Romero | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 135 | Abraham Said Martínez Leal | Operaciones | 7:30 | id 6 | id 6 ✓ (oficina admin) o id 2 `[VERIFICAR]` |
| 137 | Hugo Ernesto González Moreno | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 138 | Tomas Arnoldo Loredo Mares | Operaciones | 7:00 | id 6 ❌ | id 2 (campo) |
| 25 | Héctor Cruz Hernández | Ingeniería | 7:00 | id 2 | id 2 ✓ (ya correcto) |
| 55 | Juan Manuel Sánchez Lugo | Ingeniería | 7:00 | id 6 ❌ | id 2 (Ing entrada 7:00) |
| 98 | Ricardo Alán Hernández González | Ingeniería | 7:00 | id 6 ❌ | id 2 (Ing entrada 7:00) |
| 107 | Vicente Martínez Cruz | Ingeniería | 7:00 | id 6 ❌ | id 2 (Ing entrada 7:00) |

**Resumen:**
- 16 empleados Operaciones campo → cambiar a id=2 "Horas operaciones"
- 4 empleados Ingeniería → cambiar a id=2
- 5 empleados Operaciones oficina (Teresa, Gibrán, Jésus M, Abraham, Gerardo) → mantener en id=6
- Comerciales (7), Ana RH (1), Magaly Legal (1), Esteban CEO (1) → mantener en id=6 hasta que se creen calendars específicos (Sprint 2 backlog)

### C.2 — Método rápido en Studio

Opción A: editar uno por uno (~15 min).

Opción B (más rápido, pero requiere XML-RPC): script Python ad-hoc:

```python
import xmlrpc.client
url = 'https://serviciosfts.odoo.com'
db = 'serviciosfts'
uid = <tu_uid>
pwd = '<api_key>'
common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Lista IDs a cambiar a calendar 2 (Horas operaciones)
ids_a_campo = [75, 76, 79, 110, 112, 114, 116, 121, 124, 127, 128, 130, 131, 132, 137, 138, 55, 98, 107]
models.execute_kw(db, uid, pwd, 'hr.employee', 'write', [ids_a_campo, {'resource_calendar_id': 2}])
print(f'Updated {len(ids_a_campo)} employees to calendar 2')
```

✅ **Acción Esteban:** ejecutar reasignación (opción A o B). Si tienes dudas en alguno marcado `[VERIFICAR]`, confirma con Felipe.

---

## §D — Archivar 3 departamentos zombies (~3 min)

**Decisión [AUTO] D7:** archivar deptos sin empleados asignados.

**Ruta:** Apps → Employees → Configuration → Departments

| ID | Nombre | Estado actual | Acción |
|---|---|---|---|
| 8 | Administración y Finanzas | active=true, 0 emp | **Archive** |
| 10 | Operaciones YIN | active=true, 0 emp | **Archive** |
| 15 | Management | active=true, 0 emp | **Archive** |

Click en cada uno → toggle `active` a false (botón "Archive" en menu top).

✅ **Acción Esteban:** archivar 3 deptos arriba.

---

## §E — Empleados sin `x_studio_hora_entrada` (~5 min revisión)

8 empleados activos tienen `x_studio_hora_entrada = 0.0` (NO poblado):

| ID | Nombre | Depto | Notas |
|---|---|---|---|
| 81 | CAJERO 1 | sin depto | PLACEHOLDER — revisar §F |
| 87 | Ana Santos | sin depto | PLACEHOLDER — revisar §F |
| 88 | Carlos | sin depto | PLACEHOLDER — revisar §F |
| 95 | Jaime | sin depto | PLACEHOLDER — revisar §F |
| 104 | Perla | sin depto | PLACEHOLDER — revisar §F |
| 115 | Yolanda | sin depto | PLACEHOLDER — revisar §F |
| 143 | Pedro Arturo Hernandez | Comercial | **EMPLEADO REAL** — Comercial default 8:00 sugerido |
| 148 | Administracion FTS-YIN | sin depto | Miriam admin — revisar §F |

### Acción específica para id 143 (Pedro)

Pedro Arturo Hernandez (Comercial) tiene cita programada vacía. Sugerencia:
- Hora entrada = 8.0 (default Comercial)
- Si Pedro tiene cita diferente (e.g., remoto, horario flexible), Esteban actualiza en Studio.

```
Ana valida con Pedro su cita y la setea.
```

### Acción para los 7 placeholders

Ver §F.

✅ **Acción Esteban:** discutir con Ana Laura, setear hora_entrada de Pedro (id 143).

---

## §F — Empleados sin departamento (~5 min revisión)

7 empleados activos sin `department_id` asignado:

| ID | Name | parent_id | Calendar | hora_entrada | Hipótesis |
|---|---|---|---|---|---|
| 81 | CAJERO 1 | null | 13 | 0 | Test data, archivar |
| 87 | Ana Santos | 88 (Carlos) | 13 | 0 | Test data, archivar |
| 88 | Carlos | 88 (auto-loop) | 13 | 0 | Test data, archivar |
| 95 | Jaime | 88 (Carlos) | 13 | 0 | Test data, archivar |
| 104 | Perla | 88 (Carlos) | 13 | 0 | Test data, archivar |
| 115 | Yolanda | 88 (Carlos) | 13 | 0 | Test data, archivar |
| 148 | Administracion FTS-YIN | null | 6 | 0 | Real account de Miriam admin — asignar dept y hora_entrada |

**Patrón observable:** 6 de los 7 (todos excepto 148) están en calendar 13 "Standard 40 hours/week" (placeholder Odoo) y comparten parent_id = Carlos (88, auto-loop). Probablemente datos de prueba creados en setup inicial.

### Acción recomendada [TBD: Ana confirma]

**Para los 6 (81, 87, 88, 95, 104, 115):**
- Si son test → archivar (active=false) los 6.
- Si alguno es legitimate → asignar dept + hora_entrada + parent_id correcto.

**Para 148 (Administracion FTS-YIN / Miriam):**
- Asignar `department_id` = 8 (Admin & Finanzas) — ⚠️ pero ese dept se archiva en §D
- Alternativa: crear dept nuevo "Administración FTS-YIN" o asignar a Dirección (5) si admin general
- Setear hora_entrada (probable 8:00 oficina)

✅ **Acción Esteban:** sesión 10 min con Ana Laura, decidir caso por caso.

---

## §G — Categorización inicial 44 empleados → `x_categoria_nomina` (~10 min)

**Propuesta inicial basada en cargo conocido + departamento.** Esteban valida con Ana antes de aplicar masivamente.

### G.1 — `ceo` (1 empleado)

| ID | Nombre |
|---|---|
| 32 | Jesus Esteban De La Cruz Calderon |

### G.2 — `confianza` (9 propuestos)

| ID | Nombre | Depto | Razón |
|---|---|---|---|
| 25 | Héctor Cruz Hernández | Ingeniería | Ingeniero senior, no técnico hourly |
| 55 | Juan Manuel Sánchez Lugo | Ingeniería | Ingeniero senior |
| 63 | Magaly Estefanía Pérez García | Legal | Mando medio Legal |
| 75 | Mateo Salazar | Operaciones | Senior Supervisor |
| 97 | Rissia Xavier de Araujo | Comercial | Mando medio Comercial (manager de comerciales) |
| 98 | Ricardo Alán Hernández González | Ingeniería | PMO / Manager Ingeniería |
| 101 | Ana Laura Acevedo Flores | RH | Mando medio RH |
| 107 | Vicente Martínez Cruz | Ingeniería | Ingeniero senior |
| 112 | Felipe Pérez Guzmán | Operaciones | Operations Manager |

### G.3 — `hourly_doble` (16 propuestos)

Operaciones campo (técnicos con HE doble por turnos largos campo):

| ID | Nombre |
|---|---|
| 6 | Leonel Cruz Cristobal |
| 57 | Samuel Ulises Alcántara |
| 76 | Carlos Eduardo Manzanares |
| 79 | José Luis Romero Grados |
| 110 | Alejandro Reyes Galvez |
| 114 | Nelson Israel Márquez Carvajal |
| 116 | Mario Armando Ruiz Ramirez |
| 121 | Stephany Ventura Arevalo |
| 124 | Germán Emmanuel Merino Falcón |
| 127 | Cesar Gildardo Gómez Cano |
| 128 | Enoc Natanael Maldonado Soto |
| 130 | Rolando Vázquez García |
| 131 | Tomas Vázquez García |
| 132 | José Carlos Ortiz Romero |
| 137 | Hugo Ernesto González Moreno |
| 138 | Tomas Arnoldo Loredo Mares |

### G.4 — `hourly_sencilla` (5 propuestos)

Operaciones oficina con entrada 7:30-8:00 (gestores, supply chain):

| ID | Nombre | hora_entrada |
|---|---|---|
| 59 | Gerardo Isai Lozano Davila | 7:30 |
| 60 | Teresa Ramos Rodríguez | 7:30 |
| 62 | Gilberto Gibran Solís Carrillo | 7:30 |
| 68 | Jésus Montalvo Ramirez | 8:00 |
| 135 | Abraham Said Martínez Leal | 7:30 |

### G.5 — `no_he_comercial` (6 propuestos)

Comerciales (variables compensan HE):

| ID | Nombre |
|---|---|
| 8 | Francisco Montalvo Ramirez |
| 48 | Luis Ángel García Cruz |
| 78 | Aldo Jesús Méndez Garza |
| 85 | Diego Andrés Clavijo Chaparro |
| 108 | Pablo Bayly Fernández |
| 143 | Pedro Arturo Hernandez |

### G.6 — Sin categorizar (7)

Los 7 placeholders sin depto (§F). Tras decisión §F:
- Si archivados: NA
- Si activados como reales: asignar categoría según cargo definitivo

### Validación

**Total: 1 (ceo) + 9 (confianza) + 16 (hourly_doble) + 5 (hourly_sencilla) + 6 (no_he_comercial) = 37 empleados categorizados de 37 activos con depto.** ✓

✅ **Acción Esteban:** validar G.2-G.5 con Ana Laura. Cambios típicos:
- Algún técnico operaciones es promovido a "confianza" → mover de G.3 a G.2
- Algún comercial recibe HE (raro) → mover de G.5 a G.3 o G.4
- Empleado nuevo no listado → categorizar

Después de validación: aplicar masivamente en Studio (1 vez por empleado, ~15s c/u, ~10 min total) o via XML-RPC script.

---

## §H — Checklist final ejecución Esteban

Marca con `[x]` cuando completes:

- [ ] §A.1 — Campo `x_categoria_nomina` creado con 5 valores selección
- [ ] §A.2 — Campo `x_he_tipo` creado con 3 valores selección
- [ ] §A.3 — Campo `x_aplica_ppa` creado boolean default true
- [ ] §A.4 — Campo `x_dias_laborables` creado char default "LMMJV"
- [ ] §B — Festivos (skip — viven en JSON repo, no requiere Odoo)
- [ ] §C — Reasignación resource_calendar_id de 19+ empleados a id=2
- [ ] §D — Archivar 3 deptos zombies (8, 10, 15)
- [ ] §E — Sesión con Ana: cita Pedro (id 143)
- [ ] §F — Sesión con Ana: archivar 6 placeholders + asignar Miriam (148)
- [ ] §G — Categorizar 37 empleados con depto según propuesta G.1-G.5 (con Ana)

**Tiempo total estimado: ~45-60 min.**

---

## Después de Esteban completar §A-§G

Avisar en chat: "Sprint 1 Studio listo".

Yo (Claude Code) entonces ejecuto:
1. Re-fetch fresco de Odoo → actualizar `shared/config/empleados-master.json` con los nuevos campos populados (commit auto vía workflow o manual via PR).
2. Eliminar `_nota: PLACEHOLDER` de empleados archivados.
3. Sprint 1 Fase 3: workflow n8n `rh/empleados-master/update` + frontend panel admin mínimo.
4. Sprint 1 Fase 4: smoke test E2E.

Después de eso: arrancamos Sprint 2 (cálculo automático nómina semanal).
