# Frente B — Control de gastos + cierre de budget por stage (CERO-CÓDIGO)

> Diseño final aprobado (read-only research). **Enfoque 100% cero-código en Odoo** (decisión de Esteban: descartar la Automation Rule Python).
> Relacionado: [`AUTOMATIZACION_PROYECTOS.md`](AUTOMATIZACION_PROYECTOS.md) y CLAUDE.md §17.

## Objetivo

Impedir/visibilizar que se carguen **costos** a proyectos que ya entraron a revisión/cierre, **sin** afectar ingresos ni cobranza, y **sin código custom en Odoo**. La rentabilidad por proyecto se lee de `account.analytic.line` por `account_id`; cargar gastos a un proyecto "cerrado" la contamina.

## Mapeo verificado: gasto vs ingreso vs cobranza (por `move_type`)

| Movimiento | `move_type` | Journal | Ejemplo real | ¿Es costo a controlar? |
|---|---|---|---|---|
| **Gasto (costo)** | `in_invoice` / `in_refund` | Vendor Bills | `BILL2757`, `BILL2684` | 🔴 **SÍ** |
| **Ingreso** | `out_invoice` / `out_refund` | Customer Invoices | `INV2000` | 🟢 NO |
| **Cobranza / pago (IVA flujo de efectivo)** | `entry` | "Effectively Paid" | `CBMX/2026/0635` | 🟢 NO |

Los costos entran solo por facturas de proveedor (`in_invoice`). Pagos y cobranza son `entry` automáticos (IVA sobre flujo de efectivo) que netean a cero → no son gasto nuevo.

## Por qué cero-código (se descartó la Automation Rule Python)

Un bloqueo preventivo real al publicar la BILL requería una Automation Rule con "Execute Code" (Python). Decisión FTS: **cero código en Odoo**. En su lugar, se combina:
- **Detección + aviso** (n8n) en la fase de cierre → maneja rezagos legítimos sin trabarlos.
- **Prevención dura NATIVA** (archivar la cuenta analítica) solo en el cierre total, cuando ya no entra nada legítimo.

## Stages (IDs reales) y las 3 fases

| ID | Nombre | Fase |
|---|---|---|
| 1 | To Do | **Fase 1** (gastos libres, sin aviso) |
| 2 | In Progress | Fase 1 |
| 5 | Hold | Fase 1 |
| 3 | Done Operations (Mateo) | **Fase 1** (admin captura rezagos aquí) |
| 7 | Admin - In progress (Gera) | **Fase 2** (detecta + avisa) |
| 9 | Revisión rentabilidad (Richard) | Fase 2 |
| 10 | Aprobado Pago Comisiones (Gera) | Fase 2 |
| 13 | Comisiones Cerradas (Gera) | Fase 2 |
| 8 | Complete TOTAL (Gera) | Fase 2 |
| 4 | Canceled | Fase 2 |
| 6 | Templates | (sin cuenta normalmente) |

---

## FASE 1 — Activo (gastos libres, sin aviso)

Stages `[1, 2, 5, 3]`. Se cargan gastos con total normalidad. **Sin workflow, sin aviso.** El rezago administrativo se captura en **Done Operations (3)**.

## FASE 2 — Cierre en proceso (detecta + avisa, NO bloquea)

Stages `[7, 9, 10, 13, 8, 4]`. **Workflow n8n `fin/detect-gasto-cierre`** (polling frecuente, ~20-30 min):

1. `getAll project.project` `[stage_id in [7,9,10,13,8,4], account_id != false]` → cuentas en cierre.
2. `getAll account.move.line` (**operador verificado: `analytic_distribution 'in' [lista]` acepta listas**):
   ```
   [('analytic_distribution', 'in', <cuentas en cierre>),
    ('move_id.move_type', 'in', ('in_invoice','in_refund')),
    ('parent_state', '=', 'posted'),
    ('display_type', '=', 'product'),
    ('write_date', '>=', <ventana desde última corrida>)]
   ```
3. Code: agrupar por factura, resolver cuenta → proyecto → stage.
4. **Correo a `estebandelacruz@fts.mx`** (credencial `Microsoft Graph - sales`) con: factura (`BILL####`), proveedor (`partner_id`), monto, proyecto, stage, link. Texto: "Entró un gasto a un proyecto en cierre — revisa si es legítimo o reversa".

**NO bloquea** → los rezagos legítimos fluyen; Esteban decide caso por caso.

**Idempotencia (sin tocar Odoo):**
- Ventana temporal `write_date >= última corrida`.
- Dedup en `staticData` de n8n: set de `move_id` ya avisados (podado por antigüedad). → No requiere campo Studio.

**Validado:** la consulta devolvió `BILL2684` (2026-05-08, proyecto 834 en stage 7) como primer resultado → el detective capta el caso real de gasto rezagado en cierre.

## FASE 3 — Cierre total (prevención dura nativa = archivar)

**Workflow n8n `project/archive-budget-cierre`** (polling diario). Archiva la cuenta (`active=False`) + log note **solo si** TODAS:

1. `stage_id in [9, 10, 13, 8, 4, 6]` (recomendado **excluir stage 7** del auto-archivado: admin aún podría capturar rezagos ahí → dejarlo solo en detect-only), **y**
2. **AR=0** (cobranza completa), **y**
3. **AP=0** (pagos a proveedores completos), **y**
4. cuenta aún `active=True`.

**Archivar = prevención dura nativa:** el widget de `analytic_distribution` filtra `active=True` → cuenta archivada **no seleccionable** para gastos nuevos en la UI. Cero código.
**Límite honesto:** API/importación/EDI que escriben el JSON directamente pueden referenciar una cuenta archivada (no hay validación `active` en el write del JSON, solo en el widget). Para FTS (captura manual en UI) cubre el camino real. Por eso se exige AR=0∧AP=0: no quedan ecos legítimos (cobranza/pago) por entrar que se romperían sobre la cuenta archivada.

Log note: *"Cierre definitivo: stage 'XX', AR=0 y AP=0. Cuenta archivada."* Idempotente por el flag `active`.

### Detección AR=0 (cobranza de cliente, vía `sale.order.project_id`)
- `sale.order.amount_to_invoice == 0` (⚠️ NO `invoice_status`, queda "to invoice" aunque esté 100% facturado) **y** `amount_invoiced > 0`, **y**
- todas las `invoice_ids` (`out_invoice`/`out_refund`, `state=posted`) con `amount_residual == 0`.

### Detección AP=0 (pago a proveedores — BILLs ligadas por analítica)
```
account.move.line  domain:
  [('analytic_distribution', 'in', <account_id>),
   ('parent_state', '=', 'posted'),
   ('move_id.move_type', 'in', ('in_invoice','in_refund')),
   ('move_id.amount_residual', '!=', 0)]
```
→ Si devuelve **0 líneas** → **AP=0**. Si devuelve algo → BILLs a crédito pendientes → **NO archivar**.

---

## ¿Uno o dos workflows? → DOS separados

- **`fin/detect-gasto-cierre`** (Fase 2): cadencia **frecuente** (~20-30 min) para avisos oportunos.
- **`project/archive-budget-cierre`** (Fase 3): cadencia **diaria**.

Razones: cadencias muy distintas, lógica distinta, enable/disable independiente. El correo de **aviso** va en el detective; el **log note + reactivación** (si un proyecto archivado vuelve a stage de gasto → reactivar cuenta + correo de reapertura) van en el de archivado.

---

## Ciclo de vida

| Fase | Stage | Gastos (captura BILL) | Pago/Cobranza (`entry`) | Cuenta | n8n |
|---|---|---|---|---|---|
| 1 Activo | 1, 2, 5, 3 | ✅ libres, sin aviso | ✅ | active=True | — |
| 2 Cierre en proceso | 7, 9, 10, 13, 8, 4 | ✅ entran pero **AVISAN** (correo) | ✅ | active=True | detective |
| 3 Cierre total | 9..8 **+ AR=0 + AP=0** | 🔒 archivada → no seleccionable (UI) | terminó todo | active=False | archivado |
| Reapertura | → 1,2,5,3 | ✅ se reactiva | ✅ | n8n reactiva + correo | archivado |

---

## Nota operativa — PO abierta (commitment sin facturar)

Si un proyecto avanza con una orden de compra confirmada sin facturar, su BILL futura caería en fase de aviso (Fase 2) o, si la cuenta ya está archivada (Fase 3), no sería seleccionable en UI. Manejo por proceso: revisar el `committed_amount` del budget antes de avanzar; capturar BILLs pendientes en Fase 1 (Done Operations); si llega tardía, el detective avisa y se evalúa (reabrir si la cuenta fue archivada).

---

## Plan de prueba seguro (proyecto desechable 2344 / cuenta 3078)

1. **Fase 2 detective:** mover 2344 a stage 7/9 → publicar una BILL con analítica 3078 → el detective debe **mandar correo** a Esteban (sin bloquear; la BILL se publica).
2. **Fase 3 archivado:** con 2344 en stage de cierre y SO11758 con AR=0 y AP=0 → el workflow **archiva 3078** + log note. Verificar: cuenta no seleccionable en una BILL nueva (UI); ingresos/cobranza previos intactos; rentabilidad sigue leyendo la historia.
3. **AP>0 / AR>0:** con una BILL a crédito sin pagar o factura sin cobrar → **NO archiva** (espera).
4. **Reapertura:** mover 2344 a stage de gasto → reactiva cuenta + correo.
5. **Idempotencia:** correr de nuevo sin cambios → 0 avisos repetidos, 0 acciones.

⚠️ **Nunca** probar en cuentas de cliente reales — solo 2344/3078.

---

## Pendientes de construcción

- [ ] `fin/detect-gasto-cierre` (Fase 2 detective + correo).
- [ ] `project/archive-budget-cierre` (Fase 3 archivado AR=0∧AP=0 + log note + reapertura).
- [ ] (Descartado) ~~Automation Rule Python~~ → reemplazado por detective + archivado nativo.
