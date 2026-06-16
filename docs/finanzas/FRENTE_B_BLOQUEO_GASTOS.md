# Frente B — Bloqueo de gastos + cierre definitivo del budget por stage

> Diseño final (read-only research → aprobado). Estado: **diseñado, en construcción (Pieza 1 primero).**
> Relacionado: [`AUTOMATIZACION_PROYECTOS.md`](AUTOMATIZACION_PROYECTOS.md) (creación de proyecto+analítica al confirmar SO) y CLAUDE.md §17.

## Objetivo

Cada `project.project` tiene una cuenta analítica (`account_id`). El objetivo NO es archivar la cuenta cuando el proyecto cierra — eso es demasiado brusco (bloquea **todo**: gastos, ingresos y cobranza). El objetivo es:

1. **Bloquear la captura de COSTOS** (facturas de proveedor) en proyectos que ya entraron a revisión/cierre, **sin** afectar ingresos ni cobranza.
2. **Archivar la cuenta** solo en el **cierre definitivo** (cuando ya no hay nada que cobrar ni que pagar).
3. **Visibilidad**: log note en el proyecto + correo a Esteban en reaperturas.

## Por qué importa (contexto de la fuga analítica)

El control presupuestal de FTS (`budget.analytic` + `budget.line`, modelo real de Odoo 19; **NO** `crossovered.budget` de v16) cruza **proyecto (plan 1 MX / 18 USA) × rubro (plan 20 "Upgraded Budget Plan")**. La rentabilidad por proyecto se lee de `account.analytic.line` agregada por `account_id`. Si se cargan gastos a un proyecto ya "cerrado" operativamente, la rentabilidad queda contaminada. De ahí la necesidad de cerrar la ventana de costos en el momento correcto del ciclo de vida.

## Mapeo verificado: gasto vs ingreso vs cobranza (por `move_type`)

La distinción es limpia a nivel de asiento contable (`account.move.move_type`):

| Movimiento | `move_type` | Journal | Ejemplo real | ¿Bloquear costos? |
|---|---|---|---|---|
| **Gasto (costo)** | `in_invoice` / `in_refund` | Vendor Bills | `BILL2757 [UBER]`, `BILL2684` | 🔴 **SÍ** |
| **Ingreso** | `out_invoice` / `out_refund` | Customer Invoices | `INV2000` (+217,548 ventas) | 🟢 NO |
| **Cobranza / pago (IVA flujo de efectivo)** | `entry` | "Effectively Paid" | `CBMX/2026/0635` | 🟢 NO |

Los **costos entran exclusivamente por facturas de proveedor** (`in_invoice`). Los **pagos** (a proveedores) y la **cobranza** (de clientes) generan asientos `entry` automáticos (mecanismo mexicano de IVA sobre flujo de efectivo) que **netean a cero** y NO son gasto nuevo. Por eso el bloqueo se acota a `in_invoice`/`in_refund` y todo lo demás fluye.

## Stages (IDs reales)

| ID | Nombre | Clasificación |
|---|---|---|
| 1 | To Do | 🟢 acepta gasto |
| 2 | In Progress | 🟢 acepta gasto |
| 5 | Hold | 🟢 acepta gasto |
| **3** | **Done Operations (Mateo)** | 🟢 **acepta gasto** (ops terminó, admin NO) |
| **7** | **Admin - In progress (Gera)** | 🟢 **acepta gasto** (admin captura BILLs/POs rezagadas) |
| 9 | Revisión rentabilidad (Richard) | 🔴 **bloquea** (costos finales para el review) |
| 10 | Aprobado Pago Comisiones (Gera) | 🔴 bloquea |
| 13 | Comisiones Cerradas (Gera) | 🔴 bloquea |
| 8 | Complete TOTAL (Gera) | 🔴 bloquea (terminal) |
| 4 | Canceled | 🔴 bloquea |
| 6 | Templates | 🔴 bloquea (sin cuenta normalmente) |

**`EXPENSE_STAGES = [1, 2, 5, 3, 7]`** — el bloqueo de gastos entra en **stage 9 (Revisión rentabilidad)** o posterior.

**Dato que lo respalda:** el proyecto 834 (SO10977, actualmente stage 7 "Admin in progress") recibió la factura de proveedor `BILL2684` el 2026-05-08 estando ya en stage 7 → admin SÍ captura costos después de "Done Operations". Bloquear antes de stage 9 cortaría gastos legítimos rezagados e inflaría la rentabilidad.

---

## Las 3 piezas

### Pieza 1 — Bloqueo de gastos (Automation Rule Python en `account.move`)

**Única pieza de código custom en Odoo de FTS.** Razón: no existe mecanismo nativo que bloquee costos de UN proyecto por su stage sin bloquear también ingresos/cobranza (ni `budget.analytic.state`, ni lock dates —globales por fecha—, ni archivar la cuenta —bloquea todo—).

- Sobre `account.move`, dispara al **publicar** (`state → posted`), filtrado a `move_type in ('in_invoice','in_refund')`.
- Por cada línea con `analytic_distribution`, resuelve la(s) cuenta(s) → `project.project` (por `account_id`) → `stage_id`. Si el stage **no** está en `EXPENSE_STAGES` → `raise` (rollback → la factura no se publica).
- **NO** toca `out_invoice` (ingreso) ni `entry` (cobranza/pago). El **pago** de una BILL ya capturada FLUYE (es `entry`, no entra al filtro).
- La cuenta analítica permanece **ACTIVA** en esta fase (para que ingresos/cobranza entren).
- Maneja `analytic_distribution` compuesta `{"3034,1176":100}` y separada `{"3034":100,"1176":100}` (split por coma; solo el eje proyecto matchea `project.account_id`; los rubros se ignoran solos). Factura sin analítica → no aplica. Factura multi-proyecto (unos cerrados, otros no) → bloquea toda la factura y lista los infractores (Odoo no publica parcialmente).

### Pieza 2 — Archivado al cierre definitivo (workflow n8n, polling)

Archiva la cuenta (`active=False`) + log note **solo si** se cumplen TODAS:

1. `stage_id in [9, 10, 13, 8, 4, 6]` (ya no se capturan gastos por Pieza 1).
2. **AR=0** (cobranza del cliente completa).
3. **AP=0** (pago a proveedores completo).
4. La cuenta aún está `active=True`.

**Por qué AR=0 Y AP=0:** archivar la cuenta bloquea **todo** movimiento futuro. Si quedan facturas por cobrar (AR>0) o BILLs a crédito por pagar (AP>0), al cobrarlas/pagarlas después el **eco IVA-flujo** (que hereda la `analytic_distribution`) intentaría postear sobre la cuenta archivada → riesgo. Exigir AR=0 y AP=0 garantiza que no quedan ecos futuros → archivar es seguro, sin víctimas.

**Detección de AR=0** (cobranza de cliente, vía la SO — `sale.order.project_id` está poblado):
- `sale.order.amount_to_invoice == 0` (⚠️ usar este, NO `invoice_status` — comprobado que queda "to invoice" aunque esté 100% facturado) **y** `amount_invoiced > 0`, **y**
- todas las `invoice_ids` (`out_invoice`/`out_refund`, `state=posted`) con `amount_residual == 0`.

**Detección de AP=0** (pago a proveedores — las BILLs se ligan al proyecto por la analítica de sus líneas, no por SO). Operador `analytic_distribution 'in' <cuenta>` **verificado funcional**:
```
account.move.line  domain:
  [('analytic_distribution', 'in', <account_id>),
   ('parent_state', '=', 'posted'),
   ('move_id.move_type', 'in', ('in_invoice','in_refund')),
   ('move_id.amount_residual', '!=', 0)]
```
→ Si devuelve **0 líneas** → **AP=0**. Si devuelve algo → hay BILLs a crédito pendientes → **NO archivar, esperar**.

Idempotente: el flag `account.active` es el marcador de estado; una cuenta ya archivada no se re-procesa.

### Pieza 3 — Visibilidad (n8n)

- **Log note** (cierre/archivado/reapertura) vía **JSON-RPC `message_post`** sobre `project.project` (HTTP Request a Odoo; el modelo tiene `message_ids`/mail.thread). Fallback: CREATE `mail.message`.
- **Correo de reapertura** a `estebandelacruz@fts.mx` vía credencial `Microsoft Graph - sales` (patrón handoff validado). Se dispara cuando un proyecto archivado vuelve a stage de gasto → n8n reactiva la cuenta + correo. El bloqueo de gastos (Pieza 1) se levanta solo, automático, al volver el stage a `EXPENSE_STAGES`.
- Asunto: `[Budget Reabierto] <proyecto> volvió a stage activo`.

---

## Ciclo de vida del budget

| Fase | Stage | Gastos (Pieza 1) | Pago BILLs / Cobranza | Cuenta (Pieza 2) |
|---|---|---|---|---|
| Operación + admin | 1, 2, 5, **3, 7** | ✅ se capturan | ✅ | active=True |
| Revisión+ (costos finales) | **9**, 10, 13, 8, 4, 6 | 🔴 bloqueados | ✅ pagos/cobranza fluyen (`entry`) | active=True |
| Cierre definitivo | 9..8 **+ AR=0 + AP=0** | 🔴 | terminó todo | 🔒 archivada (n8n) |
| Reapertura | → 1, 2, 5, 3, 7 | ✅ se reactivan solos | ✅ | n8n reactiva + correo |

**Pieza 1 y Pieza 2 son complementarias, sin conflicto:** Pieza 1 nunca archiva (solo bloquea costos por stage, en tiempo real al publicar BILL). Pieza 2 nunca bloquea costos (solo archiva cuando AR=0 y AP=0, momento en que el costo ya está stage-bloqueado y no quedan movimientos pendientes). Disparadores distintos (Pieza 1 = al publicar BILL; Pieza 2 = polling).

---

## Nota operativa — PO abierta (commitment sin facturar)

Si un proyecto entra a stage 9 (bloqueo) con una **orden de compra confirmada pero sin facturar**, su BILL futura quedaría bloqueada (es un costo comprometido legítimo). Manejo **por proceso, no por código**:

- **Antes de avanzar a stage 9**, revisar el `committed_amount` del budget del proyecto (ya refleja POs comprometidas) → capturar las BILLs pendientes estando aún en stage 7 (Admin in progress).
- **Si llega una factura tardía** ya en stage 9+: regresar el proyecto a **stage 7** → capturar la BILL → avanzar de nuevo. El bloqueo se levanta y se vuelve a poner solo por stage.

---

## Plan de prueba seguro (proyecto desechable 2344 / cuenta 3078)

1. **Pieza 1 — corte en stage 9:** mover 2344 a **"Admin in progress" (7)** → publicar BILL con analítica 3078 → **debe PASAR**. Mover a **"Revisión rentabilidad" (9)** → publicar otra BILL → **debe BLOQUEAR**.
2. **Pieza 1 — pago fluye:** con 2344 en stage 9, **pagar** una BILL ya capturada → **debe fluir** (es `entry`).
3. **Pieza 1 — ingreso permitido:** con 2344 en stage 9, publicar una factura de cliente (`out_invoice`) con analítica 3078 → **debe publicar**.
4. **Pieza 2 — AR=0 Y AP=0:** con 2344 en stage 9 y BILL a crédito sin pagar → workflow **NO archiva**. Pagar la BILL + cobrar la factura → archiva + log note.
5. **Reapertura:** mover a stage de gasto → reactiva + correo + log note.
6. **Idempotencia:** correr de nuevo sin cambios → 0 acciones, 0 correos.

⚠️ **Nunca** probar en cuentas de cliente reales — solo 2344/3078.

---

## Despliegue seguro de la Pieza 1 (intercepta TODAS las facturas de proveedor)

- **Fase de validación acotada:** crear la Automation Rule con una **lista blanca de proyectos de prueba** en el código (`TEST_PROJECTS = [2344]`) que solo bloquee esos → validar sin riesgo para producción → **quitar la lista blanca** para ir global.
- **Apagado de emergencia:** Ajustes → Técnico → Reglas de automatización → la regla → toggle **Activo = OFF** (efecto inmediato; deja de interceptar).

---

## Pendientes de construcción

- [ ] Pieza 1: crear la Automation Rule en Studio (código abajo en el handoff de build). MCP Odoo es read-only → la crea Esteban en la UI.
- [ ] Pieza 2: workflow n8n `project/sync-budget-stage` (archivar AR=0 ∧ AP=0 + log note).
- [ ] Pieza 3: nodo de log note (JSON-RPC) + correo de reapertura.
