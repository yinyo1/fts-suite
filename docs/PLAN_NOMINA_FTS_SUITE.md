# Master Plan Nómina FTS Suite

**Fecha:** 2026-05-11
**Estado:** Draft inicial (Fase 0). Decisiones autónomas marcadas `[AUTO]`, decisiones pendientes de Esteban marcadas `[TBD]`.
**Doc origen:** este archivo + `docs/GAP_ANALYSIS_NOMINA.md` (auditoría previa).
**Sprint actual:** Sprint 1 Fase 0 — catálogos maestros + spec Odoo Studio.

---

## 0. Contexto del producto y problema

FTS Suite necesita un sistema de cálculo de nómina automático que:
- Tome attendances reales de Odoo (`hr.attendance`)
- Aplique reglas LFT México (Art. 67, 71, 74, 132-XVII)
- Distinga categorías de empleados (CEO/confianza/operativo/comercial) para HE
- Considere festivos oficiales + custom FTS
- Apoye supervisores con reporte semanal automático
- Reemplace el cálculo manual actual (que hicimos juntos la semana 1-7 may con resultados validados)

**Source of truth:** Odoo `hr.employee` + `hr.attendance` para datos transaccionales. **`shared/config/empleados-master.json` es espejo cache** para que el kiosk/dashboard/visores no peguen a Odoo en cada request. Sync vía n8n webhook on-change cuando se edita en panel admin (decisión D4=B, ver §5).

**Lo que el cálculo manual reveló como reglas operativas** (semana 1-7 may, 37 empleados procesados):

1. **Día estándar = Lun–Vie.** Sáb/Dom son descanso (todo lo trabajado es HE).
2. **Presencia diaria nominal = 10.1 h** (9.6 h netas + 0.5 h comida unpaid).
3. **Trabajado neto = presencia − 0.5 h** si presencia ≥ 0.5 h.
4. **HE potencial estándar = trabajado_neto − 9.6** (solo si día estándar y trabajado_neto > 9.6).
5. **HE potencial descanso = trabajado_neto completo** (Sáb/Dom o festivo descansado trabajado).
6. **Falta = sin check_in en día estándar.**
7. **Jornada abierta = check_in sin check_out**, no se cuenta para pago (queda en disputa hasta cerrar).
8. **Turno nocturno** (T2: Vie 22:30 → Sáb 07:00 ~8.5h) NO debe disparar auto-rescate ni clasificarse como huérfana.

---

## 0.5 Principio rector — Diseño Autoprogresivo 🔑

Todo módulo del sistema debe funcionar end-to-end para CUALQUIER empleado que exista en Odoo, sin requerir edición de código, JSON o configuración manual cuando entra alguien nuevo.

**Test mental:** *"Ana Laura crea empleado nuevo en Odoo mañana 9 AM. ¿Puede checar entrada a las 9:15 AM y aparecer en Mi Nómina correctamente, sin que Esteban toque código?"*

Si la respuesta es NO, el módulo NO está listo para producción.

### Reglas de implementación

1. **Lookups por `department_id` o `x_categoria_nomina`**, nunca por employee_id específico.
2. **Defaults inteligentes** cuando campos están vacíos (fallback por depto del empleado, no fallback hard-coded global).
3. **Sync automático Odoo → JSON** vía webhook on-change + cron 6am respaldo (no snapshots manuales).
4. **Fail-open en UX de empleado**: mostrar todo, validar en submit, nunca bloquear por config faltante.
5. **Tests deben incluir "empleado fantasma"**: uno que no existía cuando se diseñó el módulo.
6. **Cuando agregas hardcoded list**, justifica por qué no se puede generalizar + agrega TODO de eliminación con prioridad.
7. **Cuando agregas validación obligatoria**, considera si en su lugar puede ser default + warning.

### Anti-patrones detectados y prohibidos

- ❌ Listas de employee_ids en código frontend (ej. `oficinaIds = [89, 91, 113]` en `horarios-base.js:48`)
- ❌ Validaciones que requieren campos custom poblados para empleados nuevos
- ❌ Snapshots manuales de JSON sin mecanismo de regeneración automática

### Categorización autoprogresiva

**Regla por defecto** cuando `x_categoria_nomina` está null (campo vacío Odoo):

| dept_id | dept_name | categoría default |
|---|---|---|
| 5 | Dirección | `confianza` (excepto Esteban → `ceo` override) |
| 6 | Comercial | `no_he_comercial` |
| 9 | Legal | `confianza` |
| 16 | Recursos Humanos | `confianza` |
| 17 | Ingeniería | `confianza` |
| 3 | Operaciones | `hourly_doble` (excepciones a `confianza` o `hourly_sencilla` marcadas explícitamente) |
| sin depto | — | `null` → flag rojo "sin categorizar" en panel admin (NO bloquea checkin) |

**Override explícito vía `x_categoria_nomina` para excepciones:**

- `ceo`: Esteban (id 32)
- `confianza` (override `hourly_doble` default de Operaciones): Felipe (112), Mateo (75)
- `hourly_sencilla` (override `hourly_doble` default de Operaciones): Gerardo (59), Teresa (60), Gibrán (62), Jésus Montalvo (68), Abraham (135)

**Pseudocode lógica de cálculo:**

```python
DEFAULT_POR_DEPT = {
  3: 'hourly_doble',   # Operaciones
  5: 'confianza',      # Dirección
  6: 'no_he_comercial',# Comercial
  9: 'confianza',      # Legal
  16: 'confianza',     # Recursos Humanos
  17: 'confianza',     # Ingeniería
}

def get_categoria(empleado):
  if empleado.x_categoria_nomina:
    return empleado.x_categoria_nomina  # override explícito gana
  if empleado.department_id:
    return DEFAULT_POR_DEPT.get(empleado.department_id, None)
  return None  # sin depto → flag rojo panel admin, fail-open en kiosk
```

Test autoprogresivo: empleado nuevo dept 3 sin `x_categoria_nomina` → recibe `hourly_doble` por default → kiosk y nómina coherentes desde minuto 1. Ana puede después poner override explícito si aplica.

### Fail-open en UX de empleado

- **Kiosk:** empleado nuevo sin categoría puede checar entrada/salida normalmente. Geo + hora se validan; categoría NO es requirement.
- **Mi Perfil → Nueva Incidencia:** todos los tipos de incidencia visibles. Workflow valida al submit. Categoría no filtra el menú.
- **Mi Nómina:** muestra cálculo basado en default por depto + banner amarillo "⚠️ Tu categoría no está configurada, valor mostrado es estimado. Contacta a Ana Laura para asignación oficial."
- **Plan operativo:** empleado se puede asignar a SO desde el primer día (no requiere categoría).
- **Panel admin RH:** SÍ requiere categoría explícita para acciones críticas (aprobar nómina mensual, generar reporte). Fila sin categoría se marca con flag rojo "REQUIERE CATEGORIZACIÓN" y queda excluida de export hasta resolverse.

### Festivos anuales (convención autoprogresiva)

- **Naming:** `shared/config/festivos-mx-YYYY.json`. Ej: `festivos-mx-2027.json`.
- **Sprint 4 backlog (target nov-2026):** workflow n8n cron 15-nov anual:
  - Calcula festivos LFT oficiales del año siguiente (3 son fijos por fecha, 4 son lunes movibles → fórmula determinística).
  - Hereda custom FTS del año anterior como propuesta (Jueves/Viernes Santo, Día Muertos, Virgen Guadalupe, Nochebuena/Fin de Año).
  - Genera `shared/config/festivos-mx-YYYY+1.json` y abre PR autónomo vía gh CLI.
  - Ana + Esteban validan en PR → merge → frontend lo lee automáticamente en enero.
- **Hasta entonces (Sprint 1-3):** generación manual una vez al año en oct/nov (low cost, low risk).

### Update Sprint 1 Fase 1 (audit quirúrgico 2026-05-11): reducción 4 → 2 campos custom

Audit en `docs/SPRINT_1_FASE_1_AUDIT.md` reveló que de los 4 campos custom propuestos originalmente, **solo 2 son estrictamente necesarios**:

| Campo original | Status post-audit | Razón |
|---|---|---|
| `x_categoria_nomina` | ✅ **Crear** | No hay equivalente. Crítico para autoprogresivo. |
| `x_he_tipo` | ❌ **Eliminar del scope** | Derivable 1:1 de `x_categoria_nomina` vía lookup en workflow nómina Sprint 2. |
| `x_aplica_ppa` | ✅ **Crear** | No hay boolean equivalente. |
| `x_dias_laborables` | ❌ **Eliminar del scope** | Ya derivable de `resource_calendar_id.attendance_ids.dayofweek` (campo nativo Odoo). |

Ejecución vía console JS F12 con snippets en `docs/SPRINT_1_FASE_1_CONSOLE_SNIPPETS.md` (zero Studio UI = zero billable code generation por wrapper `studio_customization`).

### Lista de deuda técnica autoprogresiva (prioridad alta — eliminar en Sprint 1 Fase 4 o Sprint 2)

1. **`operaciones/planeacion/js/horarios-base.js:48`**: `oficinaIds = [89, 91, 113]` hardcoded. Refactor a `x_categoria_nomina === 'hourly_sencilla'` o `x_studio_hora_entrada >= 7.5` cuando categorías estén pobladas (post Sprint 1 Fase 2).
2. **`shared/planeacion-config.json`**: mapa `empleados[id].requiere_check` duplica intent de `x_categoria_nomina`. Eliminar archivo cuando frontend planeación migre a `empleados-master.json` categoría (Sprint 2).
3. **Existencia paralela `shared/incidencias.json` (legacy) vs `shared/incidencias-asistencia.json` (F2.1+)**: solo `auto_cierre_pendiente` migrado en Opción 2 F1.5. Ramas `ajuste_hora_entrada` y `ajuste_hora_salida` siguen en legacy. Migración total = Opción 1 F1.5 backlog (Sprint 2).

---

## 1. 5 Categorías de empleados (definidas para Sprint 1)

Campo nuevo `x_categoria_nomina` en `hr.employee`. Selección con 5 valores:

| Valor | Definición | Ejemplos | HE genera | PPA aplica |
|---|---|---|---|---|
| `ceo` | Solo el director general. Salario fijo, sin nómina hourly, sin HE. | Esteban (id 32) | No | No |
| `confianza` | Empleados con cargo de confianza (managers, supervisores senior, mandos medios). Salario fijo mensual, sin HE, asisten todos los días estándar pero sin contar minutos. | [PROPUESTO] Felipe 112, Mateo 75, Ricardo 98, Rissia 97, Magaly 63, Ana 101, Héctor 25, Juan Manuel 55, Vicente 107 | No | Sí (% asistencia) |
| `hourly_doble` | Empleados operativos cuyas HE se pagan al **doble** (Operaciones campo + algunos técnicos). Sigue LFT Art. 67: primeras 9h extras/semana doble, después triple. | [PROPUESTO] La mayoría de Operaciones campo (~16-18 empleados) | Sí (doble/triple) | Sí |
| `hourly_sencilla` | Empleados operativos cuyas HE se pagan al **sencillo** (típicamente Operaciones oficina con jornada nominal 7:30-17:36). No aplica multiplicador LFT por acuerdo interno. | [PROPUESTO] Gibrán 62, Gerardo 59, Teresa 60, Jésus Montalvo 68, Abraham Said 135 | Sí (1×) | Sí |
| `no_he_comercial` | Comerciales que NO generan HE (variables/comisiones compensan). Sí aplican retardos y PPA. | [PROPUESTO] Francisco 8, Luis Ángel 48, Aldo 78, Diego 85, Pablo 108, Pedro 143 | No | Sí |

**[TBD: Esteban valida la propuesta]** — la categorización completa de 44 empleados está en `docs/SPRINT_1_ODOO_SPECS.md` §G. Esteban consulta con Ana Laura para confirmar.

**[AUTO]** decisión: usar 5 valores (no 4 ni 6). Suficiente granularidad para LFT + simplicidad operativa.

---

## 2. 8 Reglas progresivas de cálculo de nómina

Aplicadas en orden — cada regla refina la anterior. La regla N consume el output de la regla N−1.

### Regla 1 — Asistencia

Empleado tiene `check_in` registrado en `hr.attendance` en la fecha. Si NO:
- Día estándar → **Falta**
- Día descanso → **Descanso (sin trabajar)**

### Regla 2 — Retardo

Si `check_in.hora_cst > x_studio_hora_entrada + 10 min`:
- Incrementa `x_studio_retardos_15_dias`
- Si counter ≥ 3 en últimos 15 días → notificación automática a supervisor + Ana Laura
- **[TBD]** ¿Tolerancia de 10 min es global o por categoría?

### Regla 3 — Jornada neta

```
presencia_h = (check_out - check_in) / 3600
trabajado_neto_h = max(0, presencia_h - 0.5)   # 0.5 = comida unpaid LFT Art. 63
```

Si `check_out is null` → estado `jornada_abierta` (no se cuenta hasta resolver).

### Regla 4 — HE potencial diaria

```python
if dia_estandar:
    he_potencial = max(0, trabajado_neto_h - 9.6)
else:  # Sáb/Dom o festivo descansado
    he_potencial = trabajado_neto_h
```

### Regla 5 — HE multiplicador por categoría

Aplica al cálculo de pago (no al conteo). Depende de `x_categoria_nomina`:

| Categoría | Multiplicador HE estándar | Multiplicador HE descanso |
|---|---|---|
| `ceo` | 0 (no aplica) | 0 (no aplica) |
| `confianza` | 0 (no aplica) | 0 (no aplica) |
| `hourly_doble` | 2× | 3× (LFT Art. 73: día descanso triple) |
| `hourly_sencilla` | 1× | 2× |
| `no_he_comercial` | 0 (no aplica) | 0 (no aplica) |

### Regla 6 — HE semanal escalada (LFT Art. 67)

Solo para `hourly_doble`:
- **Primeras 9h extras/semana → 2×**
- **>9h extras/semana → 3×** (triple por exceso semanal)

Para `hourly_sencilla` no escalan (todos son 1×). Para otros no aplica.

### Regla 7 — Festivo

Si fecha ∈ `festivos_descansados` 2026:
- Trabajar el festivo = paga del día + HE descanso (Regla 5)
- No trabajar = paga del día (sin afectar PPA)

Si fecha ∈ `festivos_laborable_doble` (custom FTS, ej: día del padre, etc.):
- Trabajar = paga del día + 1× bonus
- No trabajar = falta común

### Regla 8 — Prima dominical (LFT Art. 71)

Si check_in en domingo (sin excepciones):
- +25% al salario nominal del día (solo en categorías `hourly_*`)

---

## 3. PPA — Prima Por Asistencia

Bonus mensual a empleados que cumplen criterios de asistencia. Ley NO obliga PPA pero es práctica común en industria.

**Criterios propuestos para PPA FTS:**
- Categorías que aplican: `confianza`, `hourly_doble`, `hourly_sencilla`, `no_he_comercial` (todas excepto `ceo`).
- Período: mes calendario natural.
- Requisitos para cobrar:
  - **0 faltas** sin justificar en el mes.
  - **Máximo 2 retardos** en el mes.
  - **Mínimo 95% de asistencia** (días laborables del mes − faltas justificadas / días laborables).
- Monto: **[TBD: Esteban define]**
  - Opción A: % fijo del salario base (e.g., 5%).
  - Opción B: monto fijo (e.g., $1,000 MXN/mes).
  - Opción C: escalado por antigüedad.
- Cálculo: workflow n8n cron mensual día 1 del siguiente mes → genera reporte → Ana Laura aprueba → se incluye en nómina del 15.

**Campo nuevo:** `x_aplica_ppa` (boolean) en `hr.employee`. Default = `true` excepto para `ceo`.

---

## 4. Festivos 2026

Catálogo completo en `shared/config/festivos-mx-2026.json` (creado en este sprint).

### 4.1 Festivos oficiales LFT Art. 74 (descansados)

| Fecha | Día semana | Descripción | Fundamento |
|---|---|---|---|
| 2026-01-01 | Jue | Año Nuevo | LFT 74-I |
| 2026-02-02 | Lun | Día de la Constitución (1er lunes feb) | LFT 74-II |
| 2026-03-16 | Lun | Natalicio Benito Juárez (3er lunes mar) | LFT 74-III |
| 2026-05-01 | Vie | Día del Trabajo | LFT 74-IV |
| 2026-09-16 | Mié | Día de la Independencia | LFT 74-V |
| 2026-11-16 | Lun | Aniversario Revolución Mexicana (3er lunes nov) | LFT 74-VI |
| 2026-12-25 | Vie | Navidad | LFT 74-VIII |

7 festivos LFT (no aplica el LFT 74-VII transición ejecutivo en 2026).

### 4.2 Festivos custom FTS [PROPUESTOS]

Práctica de empresas mexicanas — Esteban valida con Ana Laura:

| Fecha | Día semana | Descripción | Tipo |
|---|---|---|---|
| 2026-04-02 | Jue | Jueves Santo | `festivo_descansado` |
| 2026-04-03 | Vie | Viernes Santo | `festivo_descansado` |
| 2026-05-10 | Dom | Día de las Madres | `festivo_laborable_doble` (paga doble si trabaja) |
| 2026-11-02 | Lun | Día de Muertos | `festivo_descansado` |
| 2026-12-12 | Sáb | Virgen de Guadalupe | `festivo_descansado` |
| 2026-12-24 | Jue | Nochebuena (día completo o medio) | `festivo_descansado` |
| 2026-12-31 | Jue | Fin de Año (día completo o medio) | `festivo_descansado` |

7 festivos custom propuestos. **[TBD: Esteban confirma cuáles aplican y si son completos o medios días]**.

### 4.3 Schema de festivos

```json
{
  "fecha": "YYYY-MM-DD",
  "dia_semana": "Lun|Mar|...",
  "descripcion": "...",
  "tipo": "festivo_descansado" | "festivo_laborable_doble",
  "fundamento": "LFT 74-X" | "Custom FTS",
  "aplica_a": "todos" | ["confianza", "hourly_doble", ...]
}
```

### 4.4 Decisión arquitectónica

**[AUTO]** Opción C (JSON puro en repo) — `shared/config/festivos-mx-2026.json`. Lectores: workflow nómina, kiosk/estado-empleado.

Razones:
- Bajo cardinality (~14/año), low churn.
- Visible en git diff cuando se agrega/edita festivo.
- No requiere extension Odoo Studio.
- Si Odoo HR Payroll se activa en futuro, importar manualmente como `resource.calendar.leaves` (decisión D3 puede revisarse).

---

## 5. Decisiones de diseño (las 10 del GAP_ANALYSIS)

### D1 — Source of truth de empleados

**[AUTO]** Odoo es master. `shared/config/empleados-master.json` es espejo cache.

**Razones:** Odoo ya es fuente única de attendance + nómina nativa potencial. JSON espejo evita N llamadas Odoo en cada kiosk request. Sync on-change preserva consistencia.

### D2 — `x_cita_entrada` (HH:MM) vs `x_studio_hora_entrada` (float)

**[AUTO]** **Reusar `x_studio_hora_entrada` (float)** existente. NO crear `x_cita_entrada` nuevo.

**Razones:**
- Ya tiene 35/44 empleados poblados con datos válidos.
- Float 7, 7.5, 8 ↔ HH:MM "07:00", "07:30", "08:00" es lossless trivial bidireccional.
- Crear campo nuevo causa migración + drift + Studio churn innecesaria.
- Frontend ya puede convertir `Math.floor(h) + ':' + ((h % 1) * 60)` para display.

**Trade-off aceptado:** label "Hora entrada" no usa el sufijo "cita" que el plan original menciona. Cosmético.

### D3 — Festivos catálogo

**[AUTO]** Opción C (`shared/festivos-mx-2026.json` puro en repo). Ver §4.4.

### D4 — Sync Odoo ↔ JSON

**[AUTO]** Opción B (on-change desde panel admin).

**Razones:**
- Editor humano (Ana Laura) es el único actor que cambia campos custom regularmente.
- Cuando ella edita en panel admin: workflow n8n PATCH a Odoo + PUT a `empleados-master.json` en GitHub. Latencia ~5-10s.
- Para campos que Odoo cambia internamente (e.g., calc retardos auto): cron 6am diario que reescribe el JSON desde Odoo.
- Híbrido on-change + cron fallback = robustez sin complejidad excesiva.

**[TBD: Esteban valida]** — si quiere cron solo (sin on-change) para empezar simple, dice y simplificamos.

### D5 — Panel admin escritura

**[AUTO]** Escribe a Odoo vía workflow n8n nuevo (`rh/empleados-master/update`) + el mismo workflow sincroniza JSON.

**Razones:**
- Frontend no expone PAT (seguridad).
- Workflow centraliza validation + audit log + sync.
- Re-utiliza el patrón establecido (kiosk/checkin escribe a Odoo via workflow, no directo).

### D6 — Quién puede editar

**[AUTO]** **Ana Laura (RH)** primary editor. **Esteban (CEO)** override total.

**Razones:**
- Felipe (Ops Mgr) puede ver pero NO editar categorías ni cita (puede solicitar cambios via panel separado o email).
- Permisos via `FTSAuth.role`:
  - `admin` / `master` → edit todo
  - `rh` → edit todo excepto `ceo`
  - `supervisor` → read-only
  - cualquier otro → no acceso

**[TBD: Esteban confirma]** — si quiere Felipe también edite, abrimos.

### D7 — Departamentos zombies (Admin & Finanzas, Management, Operaciones YIN)

**[AUTO]** Archivar los 3 (`active=false`). 0 empleados asignados, sin uso histórico relevante.

Esteban ejecuta via Studio UI. Ver `SPRINT_1_ODOO_SPECS.md` §D.

### D8 — Reasignación masiva resource_calendar_id

**[AUTO]** Incluir en Sprint 1 Fase 1 (no separado).

**Razones:**
- Operaciones campo en calendar "Horas de oficina" es bug visible que afecta cálculo Odoo nativo si se activa.
- 30+ empleados a reasignar — script ad-hoc Studio bulk edit o XML-RPC.
- Si se deja para Sprint posterior, hay riesgo de que el nuevo workflow nómina lea cálculos basados en calendar incorrecto.

Tabla detallada en `SPRINT_1_ODOO_SPECS.md` §C.

### D9 — 7 empleados sin depto (CAJERO 1, Ana Santos, Carlos, Jaime, Perla, Yolanda, Administracion FTS-YIN)

**[AUTO]** Marcar para revisión Ana Laura (no archivar autónomamente). Ver `SPRINT_1_ODOO_SPECS.md` §F.

Hipótesis: probablemente test/legacy del setup inicial de Odoo. Confirmación humana antes de borrar.

### D10 — Bugs `horarios-base.json` (dept 8 vs 16, dept 12 vs 17)

**[AUTO]** Fix inmediato en este sprint (commit 2). NO esperar a que `empleados-master.json` reemplace el archivo.

**Razones:** bugs activos hoy → Ana Laura no obtiene su horario base correcto, Ingeniería cae al fallback. Fix de 2 líneas.

---

## 6. Roadmap nómina (5 sprints)

### Sprint 1 — Catálogos maestros (este sprint, ~10h)

**Fase 0 (en curso, ~2h):** PLAN doc + GAP_ANALYSIS + SPRINT_1_ODOO_SPECS + JSON catálogos + fix horarios bugs + PR autónomo.

**Fase 1 (Esteban Studio, ~45 min):**
- Crear 4 campos custom hr.employee
- Crear 7 festivos LFT + festivos custom como resource.calendar.leaves (si se elige opción B de D3) o ya en JSON (opción C)
- Archive 3 deptos zombies
- Reasignar resource_calendar_id masivo
- Validar 7 sin depto + 8 sin hora_entrada

**Fase 2 (Esteban+Claude, ~2h):** Categorizar 44 empleados (`x_categoria_nomina`) + PPA toggle (`x_aplica_ppa`).

**Fase 3 (Claude, ~2h):** Workflow n8n `rh/empleados-master/update` + frontend admin panel mínimo.

**Fase 4 (Claude, ~2h):** Smoke test E2E (Ana edita → Odoo → JSON sync → kiosk lee correctamente).

### Sprint 2 — Cálculo automático nómina semanal (~12-15h)

- Workflow n8n `nomina/calcular-semanal` que lee attendances + aplica 8 reglas
- Output: JSON estructurado por empleado con resumen + detalle por día
- Visor RH `modulos/rh/nomina/` lee el JSON y muestra tabla editable
- Botón "Aprobar nómina" genera commit log + export Excel (xlsx-js-style)

### Sprint 3 — PPA + retardos automatizados (~6h)

- Workflow cron mensual día 1: calcula PPA elegibles
- Workflow cron diario 6am: revisa retardos del día anterior, notifica supervisores
- Visor RH `modulos/rh/ppa/` con tabla editable + bono

### Sprint 4 — Auto-cierre cron 2am + notificaciones (Bloque B) (~5h)

- Workflow cron 2am: detecta jornadas abiertas >12h, auto-cierra a 9.6h, marca TAG, notifica
- Reemplaza la red de seguridad reactiva F1.5 (que sigue activa como segundo nivel)
- Notificaciones WhatsApp + email vía Twilio/SendGrid

### Sprint 5 — Integración Odoo Nómina nativo (`hr.payslip`) (~15h)

- Migrar del visor RH custom → módulo Odoo HR Payroll
- Sprint 2-3 outputs alimentan a `hr.payslip.create()` automáticamente
- Recibos de nómina nativos Odoo en PDF
- Integración con timbrado SAT (factura nómina) si Odoo Mexico Localization aplica

---

## 7. Backlog post-Sprint-5

- **Migración completa workflow `kiosk/checkin` ramas legacy a F2.1+** (post-F1.5 backlog Opción 1)
- **Limpieza `shared/incidencias.json`** (legacy write-only orphan)
- **UI admin geocercas** con toggle hora mínima (F1.5 backlog)
- **Defensa profunda n8n geocerca** (F1.5 backlog)
- **Webhook secrets HMAC** para todos los workflows (CLAUDE.md §9 pendiente)
- **Cleanup 22 branches stale en remoto** (post auto-delete-on-merge ya activado, solo legacy)
- **Migración `Ingenieria` → `Ingeniería`** (con acento) en Odoo (deuda cosmética CLAUDE.md §11 #8)

---

## 8. Marcadores de decisión

Búsqueda rápida:
- `[AUTO]` — decisión que Claude tomó autónomamente en este sprint. Esteban puede override en cualquier momento.
- `[PROPUESTO]` — propuesta de Claude que necesita validación de Esteban (típicamente con Ana Laura).
- `[TBD: Esteban define]` — placeholder para decisión específica pendiente.

**Decisiones autónomas tomadas (10):** D1=Odoo master, D2=reusar x_studio_hora_entrada, D3=JSON repo, D4=on-change + cron fallback, D5=workflow n8n, D6=Ana primary + Esteban override, D7=archivar zombies, D8=incluir reasignación en Sprint 1, D9=marcar para revisión humana, D10=fix bugs ya.

**Decisiones TBD (validar con Esteban):**
- Categorización 44 empleados (§1, validación Ana)
- Tolerancia retardo (Regla 2)
- Monto PPA (§3)
- Festivos custom FTS específicos (§4.2)
- Workflow on-change vs solo cron (D4)
- Felipe como editor (D6)
- Días completos o medios para Nochebuena/Fin de Año (§4.2)
