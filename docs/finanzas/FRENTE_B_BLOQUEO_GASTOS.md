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

## Estado de construcción

- [x] **`fin/detect-gasto-cierre`** (Fase 2 detective + correo) — id `zLmmY0pqYC9kjLaw`, **ACTIVO**, validado e2e (detección + 3 dimensiones Moneda/Origen fondos/Empresa proyecto + resaltado cross-company + idempotencia por staticData).
- [x] **`project/archive-budget-cierre`** (Fase 3 archivado + reapertura) — id `RW7KnoeEzYLvavI0`, **INACTIVO** (en validación), allowlist `TEST_PROJECTS=[2344]`. AR y AP **por analítica** (gemelos, blindados contra huérfanas). Log note vía CREATE `mail.message` (subtype 2). Falta probar con 2344 (negativo→positivo→reapertura) + quitar allowlist + cuantificar lote real antes de producción global.
- [x] (Descartado) ~~Automation Rule Python~~ → reemplazado por detective + archivado nativo.

**Detección AR/AP robusta (ambas por analítica, simétricas):** `account.move.line` con `analytic_distribution 'in' [cuenta]` + `parent_state='posted'` + `move_id.amount_residual != 0`, cambiando `move_id.move_type`: `out_invoice/out_refund` = AR (cobranza), `in_invoice/in_refund` = AP (pago). El operador `'in'` matchea claves single/separado/compuesto (verificado: `'in' 555` devuelve `{"555,1171"}`). AR=0 = `amount_to_invoice==0` (SO) **Y** sin línea AR pendiente por analítica.

---

## ⚠️ Tema APARTE (NO Frente B) — Facturas de cliente HUÉRFANAS (trabajo financiero con Gerardo)

Detectado durante el blindaje del AR de la Fase 3. **No es del Frente B** — es un problema de fondo del ciclo financiero que queda abierto para el trabajo con **Gerardo Lozano (Accounting)**.

**Hallazgo:**
- **80 facturas de cliente** (`out_invoice`/`out_refund`, posted) **sin ligar a su SO** (sin `invoice_origin`, sin `sale_line_ids` en sus líneas), de 5,005 totales.
- **24 sin cobrar** (`amount_residual≠0`), montos grandes: INV1986 **$588,830** (MAGNEKON), INV1973 **$550,362** (MAGNEKON), INV1987 **$447,911** (JCI), INV1996 $123,424 (BEBIDAS), + varias ~$19-75k.
- **Creadas manual por el equipo FTS-YIN** (usuarios `OPERACIONES FTS-YIN` uid 6 y `Administracion FTS-YIN` uid 25), fechas **2023→2026**. Partners: clientes reales + entidades YIN/ajustes (`RAA AJUSTES`, `TECNOLOGIAS Y PRODUCTOS YIN`, `GRUPO KINETICA`, personas físicas).
- **Sí llevan `analytic_distribution`** con la cuenta del proyecto (puesta a mano), pero sin enlace a la SO.

**Impacto:**
- Rompen reportes vía SO (`amount_to_invoice`/`amount_invoiced` no las cuentan), conciliación, y el AR-vía-SO. (El archivado de la Fase 3 **ya quedó blindado** porque detecta AR por analítica, no por SO — pero el problema de fondo persiste.)

**Pendientes para Gerardo:**
1. **¿Por qué YIN factura sin SO?** (refacturación / anticipos / ajustes / operación YIN fuera del flujo SO→factura). Entender la causa antes de decidir.
2. **¿Ligar las 80 retroactivamente** a su SO (o crear las SOs faltantes)? Evaluar caso por caso (algunas viejas de migración, otras recientes).
3. **¿Prevenir a futuro** forzando el flujo SO→factura para la operación YIN? (política / config / restricción de creación manual de `out_invoice`).

**Estado:** problema de fondo **ABIERTO**. El Frente B no depende de resolverlo (AR por analítica lo cubre para el archivado).

### Caso ejemplo de la fuga analítica — Clarios SO7207 (cuenta 479) — PENDIENTE REVISIÓN GERA

Detectado en el dry-run del archivado (2026-06-16). **Proyecto 50** "SO7207 - Clarios - Instalacion transformador" (JOHNSON CONTROLS, FTS MEX, stage 8 Complete TOTAL, creado 2024-11). SO de **$5.11M facturada al 100%**.

**Anomalía:** la cuenta analítica 479 tiene **balance +$3,549,318** que NO es utilidad real. Desglose: **Ventas (401.01.01) +$3,635,603** vs **Costos (601.84.01) solo −$79,405**. Un proyecto de instalación de transformador de $5.1M con solo ~$79k de costos en la analítica = **los costos reales nunca se atribuyeron** (fuga del 99%). Además el ingreso en analítica ($3.6M) < facturado ($5.1M) → ~$1.5M de ingreso tampoco atribuido. **El balance es un artefacto de la fuga, no rentabilidad real.**

Califica para archivar (AR=0, AP=0, `amount_to_invoice=0` — nada pendiente de cobrar/pagar). **Decisión: SE ARCHIVA igual** (incluido en el lote); archivar NO borra las líneas. **Pendiente Gera:** revisar el balance/rentabilidad de este proyecto aparte (ejemplo concreto del impacto de la fuga analítica en reportes). Cuenta 479 queda archivada con su historia intacta para auditoría.
