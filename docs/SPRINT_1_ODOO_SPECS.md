# Sprint 1 — Specs paso-a-paso para Esteban en Odoo Studio

> ⚠️ **SUPERSEDED 2026-05-11 por audit quirúrgico.**
>
> Este doc fue la propuesta original via Studio UI (~45-60 min, genera billable code en módulo `studio_customization`).
>
> **Usar en su lugar:** `docs/SPRINT_1_FASE_1_CONSOLE_SNIPPETS.md` — ejecución vía console JS F12 (~10-15 min, zero billable code, zero Studio UI).
>
> Audit que justifica el cambio: `docs/SPRINT_1_FASE_1_AUDIT.md` (reuso → 4 campos reducidos a 2).
>
> Este doc se preserva como contexto histórico y para campos que requieran labels/help text consistentes.

---

**Fecha:** 2026-05-11
**Objetivo (original):** todo lo que Esteban necesita ejecutar manualmente en Odoo Studio para que Sprint 1 quede operativo.
**Tiempo estimado total (original):** ~45-60 min de Studio UI clicks. **Reemplazado por ~10-15 min de console F12 snippets.**
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
| Label | "Categoría nómina (override)" |
| Type | **Selection** |
| Required | **No** (importante — debe permitir null/vacío) |
| Default | **null/vacío** ⚠️ (fallback al default por depto, ver §G.1) |
| Help text | "Override explícito de categoría nómina. Si está vacío, se infiere del departamento (ver PLAN_NOMINA_FTS_SUITE §0.5). Solo poblar para excepciones (e.g., Mateo es 'confianza' aunque su depto sea Operaciones que defaultea a 'hourly_doble')." |
| Selection values | `ceo`, `confianza`, `hourly_doble`, `hourly_sencilla`, `no_he_comercial` |

**Importante (principio autoprogresivo):** dejar este campo NULL es la opción correcta para 32 de 44 empleados. Solo se setea explícitamente para 8 excepciones (ver §G.2). El cálculo de nómina aplica fallback automático cuando está null.

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

## §G — Categorización autoprogresiva (default-por-dept + excepciones, ~10 min)

**Filosofía:** según PLAN §0.5 (principio rector), categorización debe ser autoprogresiva. Esteban NO categoriza 44 empleados uno por uno. **Categorías se infieren del `department_id`** por default, y solo las **excepciones** se setean explícitamente en `x_categoria_nomina`.

### G.1 — Default por depto (NO requiere acción Esteban — solo informativo)

La lógica de cálculo aplica esta tabla cuando `x_categoria_nomina` está null:

| dept_id | dept_name | categoría default | razón |
|---|---|---|---|
| 5 | Dirección | `confianza` | mandos directivos sin HE |
| 6 | Comercial | `no_he_comercial` | variables compensan |
| 9 | Legal | `confianza` | mando medio |
| 16 | Recursos Humanos | `confianza` | mando medio |
| 17 | Ingeniería | `confianza` | ingenieros senior |
| 3 | Operaciones | `hourly_doble` | técnicos campo mayoría |
| (sin depto) | — | `null` | flag rojo en panel admin, NO bloquea kiosk |

**Empleado nuevo dept 3 sin categoría** → recibe `hourly_doble` automático. ✅ Autoprogresivo.

### G.2 — Excepciones explícitas (SÍ requiere acción Esteban — 12 empleados)

Estas 12 contradicen el default por depto y deben tener `x_categoria_nomina` seteado EXPLÍCITAMENTE:

#### G.2.1 — `ceo` (1 empleado, override Dirección)

| ID | Nombre | Setear `x_categoria_nomina` = |
|---|---|---|
| 32 | Jesus Esteban De La Cruz Calderon | `ceo` |

#### G.2.2 — `confianza` overrides en Operaciones (2 empleados)

Estos 2 NO son técnicos hourly aunque su depto sea Operaciones. Sin override caerían a `hourly_doble`.

| ID | Nombre | Setear `x_categoria_nomina` = | Razón |
|---|---|---|---|
| 75 | Mateo Salazar | `confianza` | Senior Supervisor |
| 112 | Felipe Pérez Guzmán | `confianza` | Operations Manager |

#### G.2.3 — `hourly_sencilla` overrides en Operaciones (5 empleados)

Operaciones oficina (entrada 7:30-8:00, no campo). Sin override caerían a `hourly_doble`.

| ID | Nombre | hora_entrada | Setear `x_categoria_nomina` = |
|---|---|---|---|
| 59 | Gerardo Isai Lozano Davila | 7:30 | `hourly_sencilla` |
| 60 | Teresa Ramos Rodríguez | 7:30 | `hourly_sencilla` |
| 62 | Gilberto Gibran Solís Carrillo | 7:30 | `hourly_sencilla` |
| 68 | Jésus Montalvo Ramirez | 8:00 | `hourly_sencilla` |
| 135 | Abraham Said Martínez Leal | 7:30 | `hourly_sencilla` |

### G.3 — Empleados que NO requieren acción explícita (32 empleados)

Estos heredan correctamente del default por depto. **NO** setear `x_categoria_nomina` — dejar vacío para que el sistema use el fallback. Si en futuro la regla por depto cambia, estos empleados se ajustan automáticamente sin tocar cada record.

- **Operaciones (16 → `hourly_doble` default):** Leonel 6, Samuel 57, Carlos Eduardo 76, José Luis Romero 79, Alejandro 110, Nelson 114, Mario 116, Stephany 121, Germán 124, Cesar 127, Enoc 128, Rolando 130, Tomás V 131, José Carlos 132, Hugo 137, Tomás A. Loredo 138
- **Comercial (7 → `no_he_comercial` default):** Francisco 8, Luis Ángel 48, Aldo 78, Diego 85, Rissia 97, Pablo 108, Pedro 143
- **Ingeniería (4 → `confianza` default):** Héctor 25, Juan Manuel 55, Ricardo 98, Vicente 107
- **Legal (1 → `confianza` default):** Magaly 63
- **RH (1 → `confianza` default):** Ana Laura 101

### G.4 — Sin departamento (7 empleados)

Después de §F (sesión Ana):
- Si Esteban + Ana deciden archivar 6 placeholders + asignar depto a Miriam (148): los 7 quedan resueltos.
- Si Miriam queda en algún depto, hereda categoría por default automáticamente.
- Si por alguna razón un placeholder se mantiene activo sin depto: aparece en panel admin RH con flag rojo "REQUIERE CATEGORIZACIÓN" — no bloquea operaciones (fail-open).

### Validación

**Total acciones Esteban en §G: 8 records con override explícito.** Los otros 32 NO requieren acción manual — el sistema los maneja por defecto.

**Test autoprogresivo:** Ana crea empleado nuevo en dept 3 mañana → sin tocar `x_categoria_nomina` → kiosk + nómina funcionan asumiendo `hourly_doble` desde el minuto 1. ✅

✅ **Acción Esteban:** setear `x_categoria_nomina` SOLO para los 8 records en §G.2 (Esteban + Felipe + Mateo + 5 hourly_sencilla). Validar con Ana antes de aplicar.

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
- [ ] §G — Setear `x_categoria_nomina` SOLO en 8 excepciones (Esteban CEO + Felipe + Mateo + 5 hourly_sencilla). NO categorizar los otros 32 (fallback automático por depto)

**Tiempo total estimado: ~30-45 min** (reducido desde 60 min original — la categorización es ahora autoprogresiva y solo requiere 8 excepciones manuales en lugar de 37).

---

## Después de Esteban completar §A-§G

Avisar en chat: "Sprint 1 Studio listo".

Yo (Claude Code) entonces ejecuto:
1. Re-fetch fresco de Odoo → actualizar `shared/config/empleados-master.json` con los nuevos campos populados (commit auto vía workflow o manual via PR).
2. Eliminar `_nota: PLACEHOLDER` de empleados archivados.
3. Sprint 1 Fase 3: workflow n8n `rh/empleados-master/update` + frontend panel admin mínimo.
4. Sprint 1 Fase 4: smoke test E2E.

Después de eso: arrancamos Sprint 2 (cálculo automático nómina semanal).
