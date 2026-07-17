# One-pager — Junta con Gerardo (temas financieros abiertos)

> Para imprimir. 5 temas. Cada uno: qué es · monto · qué le pido a Gera · IDs de respaldo.
> Fuente: `FRENTE_A_PLAN.md`, `FRENTE_B_BLOQUEO_GASTOS.md`, `DIAGNOSTICO_CARGA_MO.md`, memoria del proyecto.

---

## G-1 · AJUSTE-HISTORICO-FINAL — $4,105,043.26

**Qué es:** 2 líneas de `account.analytic.line` con concepto "AJUSTE-HISTORICO-FINAL", fecha **31-dic-2024**, por **+$4,105,043.26**. Es un artefacto de conciliación (cuadre histórico), NO costo real de un proyecto. No tiene eje analítico compuesto → no afecta budgets, pero infla la analítica.

**Monto:** +$4,105,043.26 (31-dic-2024).

**Qué le pido a Gera:** ¿lo reclasificamos, lo dejamos como está documentado, o lo limpiamos? Necesito su OK contable antes de tocar cualquier línea histórica.

**Respaldo:** buscar en `account.analytic.line` por nombre `AJUSTE-HISTORICO-FINAL`, `date = 2024-12-31`.

---

## G-2 · Retro-atribución del gasto sin proyecto — ~$24.6M / 12 meses

**Qué es:** $24.6M de gasto de proveedor (963 líneas, 99% en GL `601.84.01`) quedó **sin proyecto** — costo de proyecto fugado que no aparece en la rentabilidad. La regla A3 (candado bills/POs) ya frena lo nuevo; esto es lo histórico.

**Monto:** ~$24.6M; ~15 proveedores concentran ~$20M en ~50 bills. Top: BOSQUE ~$3.28M, INSTALADORES ~$2.5M + ~$1.67M (subcontratistas eléctricos/construcción).

**Qué le pido a Gera:** que revise **por proveedor** (arranca por los top 15) y atribuya cada bill a su proyecto real. Es recuperable — casi todo es subcontrato ligado a un proyecto identificable.

**Respaldo:** `account.move.line` con `parent_state=posted`, GL 601.84.01, sin `analytic_distribution` de plan 1/18; agrupar por `partner_id`.

---

## G-3 · Clarios SO7207 — balance $3.5M artefacto

**Qué es:** la cuenta analítica **479 (SO7207 Clarios)** muestra balance **+$3,549,318** que NO es utilidad real: los costos reales nunca se atribuyeron (misma fuga del 99%). La cuenta ya está archivada.

**Monto:** +$3,549,318 (balance aparente).

**Qué le pido a Gera:** confirmar que este balance es artefacto (no utilidad) y decidir si se ajusta para no distorsionar el histórico de rentabilidad de Clarios.

**Respaldo:** `account.analytic.account` id **479**; cruzar ingresos vs costos posteados con distribución a 479.

---

## G-4 · 80 facturas de cliente HUÉRFANAS sin SO

**Qué es:** 80 facturas de cliente (`out_invoice`) emitidas **sin Sales Order** ligada, creadas manualmente por FTS-YIN. Rompen la trazabilidad SO→factura→cobranza.

**Monto:** 24 siguen **sin cobrar**, hasta **$588k** (la mayor: INV1986 MAGNEKON).

**Qué le pido a Gera (3 preguntas):**
1. ¿Por qué YIN factura sin SO? (proceso)
2. ¿Ligamos retroactivamente estas 80 a su SO?
3. ¿Cómo lo prevenimos a futuro? (¿candado como A3 en facturas de cliente?)

**Respaldo:** `account.move` `move_type=out_invoice`, `invoice_origin` vacío / sin `sale_order` ligada; filtrar `payment_state != paid` para las 24.

---

## G-5 · 5,649 asientos en `in_payment` — conciliación bancaria BBVA

**Qué es:** 5,649 asientos quedaron en estado **`in_payment`** (pagados pero no conciliados con banco). El banco BBVA no se concilió → no avanzan a `paid`. Distorsiona el cash real y la antigüedad de cartera.

**Monto:** 5,649 asientos (backlog de conciliación).

**Qué le pido a Gera:** plan de conciliación bancaria BBVA (¿importamos el extracto a Odoo? ¿lote por mes?). Es prerequisito para que la conciliación Nómina↔banco (capa futura) tenga sentido.

**Respaldo:** `account.move` con `payment_state=in_payment`; GL banco `102.01.00008` (BBVA Nómina) sin movimientos conciliados 2026.

---

**Cierre para la junta:** G-2, G-3, G-4, G-5 son de **medición/cobranza** (dinero real en juego). G-1 es cosmético-contable. Prioridad sugerida en la junta: **G-4 (cobranza $588k) → G-2 (rentabilidad) → G-5 (cash) → G-3 → G-1**.
