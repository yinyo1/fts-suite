# Sprint 1 Fase 4 — Decisiones consolidadas

**Fecha:** 2026-05-12 (cierre día)
**Path elegido:** A — Empleados-first (Botón Nueva Incidencia multi-tipo)
**Decisiones tomadas:** 8 de 8 relevantes
**Decisiones pospuestas:** 2 (HE freestyle vs plan-required, tiempo extra full logic — ambas requieren Vertiente A / plan operativo)

## Decisión 1 — Arquitectura workflows
**Resultado: B — N workflows separados (1 por tipo)**
Razón: coherente con patrón existente (xVNp36, 5SW15h), aislamiento de fallas, sprawl manejable.

Workflows nuevos a crear:
- incidencias/crear-vacaciones
- incidencias/crear-permiso-con-goce
- incidencias/crear-permiso-sin-goce
- incidencias/crear-incapacidad-medica
- incidencias/crear-tiempo-extra (stub hasta Vertiente A)

## Decisión 2 — Persistencia
**Resultado: A — hr.leave nativo Odoo**
Razón: reportería nativa, allocations automáticas, integra con Sprint 2 nómina, audit Odoo.

Setup pre-implementación (Sub-fase 4.2 inicio, console F12, ~10 min):
- Crear 4 hr.leave.type:
  - "Vacaciones LFT" (allocation: días según antigüedad)
  - "Permiso con goce" (allocation: ilimitado, contable)
  - "Permiso sin goce" (allocation: ilimitado, descuento nómina)
  - "Incapacidad médica" (allocation: ilimitado, requiere doc IMSS adjunto)

## Decisión 3 — Foto IMSS storage
**Resultado: A — Adjunto ir.attachment en Odoo**
Razón: vive con hr.leave record, audit completo, Ana ve foto desde Odoo UI, volumen trivial (~3MB/mes vs 25GB cuota).

Implementación: upload a /web/binary/upload con res_model='hr.leave', res_id=<leave_id>, name='IMSS_<folio>_<fecha>.jpg'

## Decisión 4 — Permiso con/sin goce
**Resultado: D — Híbrido motivo predefinido + Ana override**
Razón: balance autonomía empleado + control Ana, política LFT por defecto pero flexible.

Catálogo motivos (crear shared/config/motivos-permiso.json):
- Cita médica personal → CON goce (override posible)
- Cita médica familiar directo → CON goce (override posible)
- Defunción familiar directo → CON goce (NO override, LFT)
- Trámite gubernamental → CON goce (override posible)
- Asunto personal → SIN goce (override posible)
- Vacaciones extra sin saldo → SIN goce (NO override)
- Otro (especificar) → SIN goce (override posible)

Regla adicional: permiso sin goce > 3 días requiere escalado a dirección.

## Decisión 5 — Validación foto IMSS
**Resultado: B — Claude API pre-validación + Ana confirma terminal**
Razón: empleado corrige antes de enviar (fotos borrosas no llegan a Ana), extracción estructurada pre-llena hr.leave, Ana terminal por compliance IMSS legal.

Workflow técnico:
1. Empleado sube foto en modal
2. POST a Claude API con vision tool: prompt extrae {legibilidad: 0-100, paciente, folio_imss, fecha_inicio, fecha_fin, médico, días, confianza}
3. Si legibilidad < 70% → modal pide retomar foto
4. Si OK → frontend pre-llena form hr.leave + muestra extracción al empleado
5. Empleado confirma datos → crea hr.leave state='confirm'
6. Ana ve en visor RH: foto + extracción AI + botones aprobar/ajustar/rechazar (RH terminal)

Costo estimado: ~$0.24/año (24 fotos × $0.01 Claude API).

## Decisión 6 — Notificaciones empleado
**Resultado: E — In-app Sprint 1, WhatsApp en Bloque B**
Razón: foco Sprint 1, WhatsApp ya planeado en Bloque B junto a otras notificaciones (cron 2am, no-checaste-salida).

Implementación Sprint 1 (mínima):
- Schema incidencias-asistencia.json: agregar field _seen_by_empleado: false al crear
- Workflows update status: setean _seen_by_empleado=false al cambiar status (re-notify trigger)
- Frontend Mi Perfil: badge numérico en menú "Mis Incidencias" con count de no-leídos
- Empleado abre Mis Incidencias → API PATCH marca _seen_by_empleado=true → badge desaparece

## Decisión 7 — Auto-descuento saldo vacaciones
**Resultado: A — Auto-descontar + populate allocations mañana**
Razón: Sprint 2 cálculo nómina necesita saldo real, audit Odoo nativo, evita bottleneck Ana.

Setup pre-implementación Sub-fase 4.2 (~30 min):
1. Tabla antigüedad → días LFT (en código + JSON):
   - 1 año: 12 días
   - 2 años: 14 días
   - 3 años: 16 días
   - 4 años: 18 días
   - 5 años: 20 días
   - 6-10 años: 22 días
   - 11-15 años: 24 días
   - 16-20 años: 26 días

2. Script console F12 calcula allocation por empleado:
   - Leer hr.employee.id + create_date (fallback: x_studio_fecha_ingreso si existe, sino create_date)
   - Calcular años antigüedad (current_date - fecha_ingreso)
   - Mapear a días LFT según tabla
   - Crear hr.leave.allocation con number_of_days=<calculado>, holiday_status_id=<vacaciones_type_id>, state='validate', employee_id=<id>

3. Auto-descuento on approve:
   - Workflow aprobar-vacaciones: al hacer hr.leave.action_validate(), Odoo descuenta automático
   - Frontend lee balance: hr.leave.allocation.balance per empleado

Backlog Sprint 2: cron anual 1-enero refresca allocations (+1 año antigüedad → +días si aplica).

## Decisión 8 — Estados terminales
**Resultado: A — Replicar F1 v3 uniformemente (RH terminal default)**
Razón Esteban: "comoquiera ellos me consultan pero quiero eliminar dependencia mía" — reduce founder-dependency, mantiene visibilidad informal.

Tabla final por tipo:

| Tipo | Flow | Terminal | Direccion entra cuando |
|---|---|---|---|
| olvido_entrada | sup → RH | RH | RH escala |
| olvido_checkout | sup → RH | RH | RH escala |
| vacaciones | sup → RH | RH (Ana) | RH escala |
| permiso_con_goce | sup → RH | RH | RH escala |
| permiso_sin_goce ≤ 3 días | sup → RH | RH | RH escala |
| permiso_sin_goce > 3 días | sup → RH → dir | Dirección | Default (regla auto-escalado) |
| incapacidad_medica | RH valida foto AI | RH | RH escala |
| tiempo_extra | RH | RH | Bloqueado hasta Vertiente A |

---

## Decisiones pospuestas (Vertiente B futura)

### TBD-1 — HE pre-autorizada: freestyle vs plan-required
Cuando: cuando ataquemos plan operativo Felipe-first (Vertiente A futura).
Opciones: (a) freestyle con justificación + dirección aprueba, (b) solo si está en plan operativo aprobado.
Decisión pospuesta hasta tener plan operativo persistente.

### TBD-2 — Tiempo extra logic completo
Cuando: cuando exista plan operativo en Odoo (x_plan_operativo_slot).
Implementación Sprint 1 Fase 4: stub workflow incidencias/crear-tiempo-extra que devuelve {error: 'plan_operativo_no_disponible', backlog: 'Vertiente A'}.

---

## Pre-trabajo mañana antes de Sub-fase 4.1

Antes de tocar código, ejecutar (Esteban con CC):

1. Setup hr.leave.type (4 records) via console F12 — ~10 min
2. Script calcular y poblar hr.leave.allocation para 44 empleados — ~20 min
3. Crear shared/config/motivos-permiso.json con catálogo Decisión 4 — ~5 min
4. Validar API key Claude Anthropic disponible para workflow incapacidad (en n8n credentials) — ~5 min

Total pre-trabajo: ~40 min antes de arrancar implementación 4.1.
