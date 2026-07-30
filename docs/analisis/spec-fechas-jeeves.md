# Spec — fechas Jeeves (transacción vs liquidación) en captura bancaria

> 2026-07-24 · Read-only + spec. **El edit a captura-jeeves NO se hace hoy** (regla del día: intocable; el finde no hay cron → se aplica mañana con cabeza fresca + §17). Este doc = crudos + hallazgo + spec del edit + backfill + columna front.

---

## 0. ⚠️ HALLAZGO que el crudo revela (leer antes de decidir)

La decisión original asumía: *"el dedupe se calcula con la fecha settled; agregar la de transacción sin tocarlo"*. **El crudo del mapeo dice lo contrario:**

**La fecha que HOY se guarda en la línea de banco YA ES la `transactionDate` (fecha de compra), y el hash de dedupe usa esa.** NO se está usando la fecha de liquidación en ningún lado.

→ Consecuencia: **la "fecha de transacción" (la que casa con PO/Bill) YA es la visible.** Lo que **falta** es la **fecha de liquidación** (`transactionPostedDate`), que hoy **no se captura**. Y el tooltip que puse en v0.5.11 (`"Fecha de liquidación (settled)"`) está **invertido** — la columna actual es la de transacción, no la de liquidación. **Corregir el tooltip es parte de este trabajo.**

---

## 1. Shape crudo de Jeeves (ambas fechas) — MCP `list_transactions`

De una transacción **settled** real (crudo, 2026-07-24):
```jsonc
{
  "transactionType": "debit",
  "transactionTypeTag": "CARD",
  "transactionStatus": "settled",
  "transactionDate": "2026-07-22T23:23:26.000Z",        // ← FECHA DE COMPRA (la que usa la captura hoy)
  "transactionPostedDate": "2026-07-24T10:02:05.000Z",  // ← FECHA DE LIQUIDACIÓN (settled/posted) — HOY NO SE CAPTURA
  "createdAt": "2026-07-22T23:23:29.309Z",              // ~= transactionDate (momento de registro en Jeeves)
  "totalBaseCurrencyAmount": "325.000000",
  "source": { "name": "Tarjeta gastos", "detail": "4548" },
  "destination": { "name": "THE Home Depot", "detail": "Department Stores" }
}
```
- En **pending**, `transactionPostedDate` = `null` (aún no liquida). Confirmado: los 20 movs del 23-24 tienen `transactionPostedDate:null`.
- Nombres EXACTOS confirmados: **`transactionDate`** (compra) · **`transactionPostedDate`** (liquidación) · `createdAt`.

---

## 2. Mapeo actual de captura-jeeves (crudo del nodo `8 - Code Construir filas`, READ)

```js
function toCstDate(iso){ const d=new Date(iso); const c=new Date(d.getTime()-6*3600*1000); return c.toISOString().slice(0,10); }
...
const fecha = toCstDate(t.transactionDate);   // ← usa transactionDate (COMPRA)
...
const hashInput = [fecha, amount.toFixed(2), tag, l4, (dst.name||'')].join('|');
const uid = 'jeeves-' + _sha256hex(hashInput);   // ← dedupe usa `fecha` = transactionDate
out.push({ journal_id:JOURNAL, date:fecha, payment_ref, amount, unique_import_id:uid, partner_id });
```
→ **`account.bank.statement.line.date` = `toCstDate(transactionDate)`** (compra). **El hash usa esa misma fecha.** No hay rastro de `transactionPostedDate`.

---

## 3. Spec del edit (MAÑANA, captura-jeeves) — SIN tocar el dedupe

**Objetivo:** capturar TAMBIÉN la fecha de liquidación, sin romper hashes.

1. **`date` se queda igual** = `toCstDate(transactionDate)` (compra) → **el hash NO cambia** → cero duplicados. (La visible-default ya es la correcta; NO se cambia.)
2. **Agregar** la fecha de liquidación a un **campo nuevo** de `account.bank.statement.line`:
   - Requiere **campo Studio** (Esteban): p.ej. `x_studio_fecha_liquidacion` (date). `account.bank.statement.line` no tiene un 2º campo de fecha nativo libre.
   - En el nodo 8: `fecha_liq = t.transactionPostedDate ? toCstDate(t.transactionPostedDate) : null;` → escribir al campo nuevo en el CREATE (nodo 11).
   - **NO** incluir `fecha_liq` en `hashInput` (el dedupe sigue idéntico).
3. **Corregir el tooltip del front** (v0.5.11 está invertido): la columna `Fecha` actual = **fecha de transacción/compra**; el nuevo campo = **fecha de liquidación**.

**Alternativa sin Studio (evaluar):** guardar la liquidación en el `payment_ref` o un `narration` sería sucio y rompería el parse de comercio/tarjeta → **descartado**. El campo Studio es el camino limpio.

---

## 4. Backfill de las 1,776 existentes — evaluación

- **Viabilidad:** el MCP Jeeves entrega `transactionPostedDate` de las settled. Un script backfill: fetch settled (paginado) → por cada una, recomputar el `unique_import_id` (mismo hash) → match contra `account.bank.statement.line` por `unique_import_id` → escribir `x_studio_fecha_liquidacion`. **Idempotente** (match por hash exacto).
- **Costo:** ~1,776 settled × (fetch por lote de 100 + write por lote). Read-only en Jeeves; write acotado al campo nuevo (no toca `date` ni el hash).
- **Precondición:** el campo Studio debe existir primero. Y correr **fuera de horario de cron** (finde OK).
- **Riesgo:** bajo (write a un solo campo nuevo, no toca dedupe ni conciliación). Aun así: dry-run primero (contar matches vs no-matches antes de escribir).
- **Recomendación:** backfill como workflow/script dedicado DESPUÉS de que el edit de captura-jeeves esté vivo y verificado (para que el mapeo del hash sea idéntico al del backfill).

---

## 5. Columna front "Fecha transacción" (o corrección de la actual)

Dado el hallazgo (la actual YA es transactionDate):
- **Opción A (recomendada, mínima):** NO agregar columna nueva. **Renombrar/retooltip** la columna `Fecha` actual a **"Fecha transacción"** (visible default, es la que casa con PO/Bill) + **agregar** una columna opcional **"Fecha liquidación"** (el campo Studio nuevo, en ⋮). Corrige el tooltip invertido.
- **Opción B (la del brief literal):** agregar "Fecha transacción" visible default + mover la actual a opcional — **pero la actual YA es la de transacción**, así que Opción B duplicaría. **Opción A es la correcta dado el crudo.**
- El shape del endpoint `captura-transacciones` ya trae `d` = la fecha actual (transactionDate). Para la liquidación, agregar `dl` (nuevo) al mapeo del endpoint (leyendo el campo Studio) cuando exista.

---

## 6. Orden de aplicación (mañana)
1. Esteban crea el campo Studio `x_studio_fecha_liquidacion` (date) en `account.bank.statement.line`.
2. Edit captura-jeeves nodo 8 + nodo 11 (agregar el campo, SIN tocar hash) → §17 + smoke.
3. Backfill dry-run → real.
4. Front: retooltip "Fecha" → "Fecha transacción" + columna opcional "Fecha liquidación" (`dl`). Bump.

---
_Read-only + spec. Nada de captura-jeeves tocado hoy. El hallazgo del §0 (la fecha actual ya es la de transacción, no la de liquidación) es lo que ajusta el brief._
