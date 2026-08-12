# Eslabón 1 — Gate A: los tres diagnósticos previos a construir
**2026-08-12** · read-only. Evidencia = id de registro Odoo, response crudo de MCP o fragmento literal del workflow.

Contexto: eslabón 1 de 5 (extracción → motor jala → auto-concilia → concilia manual → escribe a Odoo). Este doc congela el diagnóstico que autoriza la construcción del Paso 2. Los tres veredictos quedan firmes y no se reabren.

---

## 1.1 — Ventana de captura: hay mismatch, y hay una fuga ACTIVA distinta

### Cómo se construye hoy (fragmento literal, `captura-jeeves` `PWEiA37CLfP6lMgg`)

Nodo **`3 - Odoo SEARCH ultima linea`** — lee el journal 61 pidiendo solo `["id","date"]`.

Nodo **`4 - Code fromDate`**:
```js
// [4] fromDate = MAX( (ultima fecha del journal || ARRANQUE) - TRASLAPE_DIAS , FECHA_PISO )
// El piso ([2] fecha_piso) es un tope duro: nunca se arranca antes de esa fecha (protege ejercicio 2025).
const cfg=$('2 - Set origen config').first().json;
const rows=$('3 - Odoo SEARCH ultima linea').all().map(i=>i.json).filter(r=>r&&r.date);
let maxDate=null;
for(const r of rows){const d=String(r.date).slice(0,10);if(!maxDate||d>maxDate)maxDate=d;}
const base=maxDate||cfg.arranque;
const dt=new Date(base+'T00:00:00.000Z');
dt.setUTCDate(dt.getUTCDate()-(Number(cfg.traslape_dias)||3));
const candDate=dt.toISOString().slice(0,10);
const pisoDate=String(cfg.fecha_piso||cfg.arranque||'2026-01-01').slice(0,10);
const chosen=(candDate>=pisoDate)?candDate:pisoDate;
const fromDate=chosen+'T00:00:00.000Z';
```

Ese `fromDate` viaja al nodo 6 como `startDate` de la API de Jeeves.

**El mismatch:** el ancla es `date` — una fecha **CST** derivada de `transactionDate` — pero **la API de Jeeves filtra por `createdAt`** (confirmado en la sesión previa: una ventana que cerraba `2026-06-05T05:59:59Z` devolvió un registro con `transactionDate 2026-06-05T06:28:00Z` porque su `createdAt` era `2026-06-05T04:28:01.069Z`).

### Cuánto pesa el mismatch por sí solo: poco

Medición sobre 35 settled + 9 pending:

| Población | n | `createdAt − transactionDate` |
|---|---|---|
| debit | 33 | +2.3 s … +4.2 s |
| credit | 2 | −7,199 s (exactamente −2 h) |

Los debits solo cambian de día CST si la compra cae en los ~4 segundos alrededor de medianoche. Los credits (devoluciones) cambian de día si `transactionDate` cae entre 06:00 y 08:00 UTC. Población chica, sin pérdida observada.

### La prueba que cierra el universo de las 18

`aggregate_records` de `account.bank.statement.line` (journal 61, 2026) agrupado por `date:month` × `create_date:month`:

| Mes de la línea | Mes en que se creó | count |
|---|---|---|
| Enero 2026 | **Julio 2026** | 172 |
| Febrero 2026 | **Julio 2026** | 254 |
| Marzo 2026 | **Julio 2026** | 393 |
| Abril 2026 | **Julio 2026** | 338 |
| Mayo 2026 | **Julio 2026** | 325 |
| Junio 2026 | **Julio 2026** | 174 |
| Julio 2026 | Julio 2026 | 168 |
| Julio 2026 | Agosto 2026 | 19 |
| Agosto 2026 | Agosto 2026 | 58 |

**Las 1,656 líneas de enero a junio se crearon TODAS en julio 2026.** Fue una carga histórica en bloque, no la ventana incremental. Por lo tanto **los gaps de marzo (−3) y mayo (−6) no pueden originarse en la ventana: la ventana nunca procesó esos meses.** Y las 7 pérdidas enumeradas ya están probadas como colisión de hash (cada una con su gemela de hash idéntico presente en Odoo).

> **VEREDICTO 1.1 (CORREGIDO 2026-08-12) — el universo de pérdidas sigue siendo 18, pero NO todas son colisión.**
>
> ⚠️ **Corrección posterior, con evidencia.** El veredicto original decía "las 18 son colisión de hash, cerrado". Eso era **incorrecto por sobre-extensión**: el argumento de la carga histórica prueba que **ene–jun** no pudo perder por ventana (esas 1,656 líneas entraron por backfill en bloque), pero **jul–ago SÍ corrieron por ventana incremental** y la conclusión se extendió indebidamente a ellos.
>
> **Reatribución probada:** los 5 gaps de julio son **4 colisiones + 1 pérdida de ventana** — el `MercadoPago $240` del `2026-07-13` (`transactionDate 2026-07-13T16:35:08Z`, `transactionPostedDate 2026-07-30T07:56:04Z`, **lag 16.64 días**). No tenía gemela: simplemente nunca entró en la ventana de consulta.
>
> **Prueba en terreno:** al aplicar 2.1 (ancla absoluta, `ventana_dias: 30`), la primera corrida lo insertó — línea **id 32911**, `date 2026-07-13`, `[Primary ****6831] MercadoPago`, −240.00, `create_date 2026-08-12T23:00:06Z`. El conteo del journal 61 en 2026 pasó de **1,901 → 1,902** y `amount:sum` de **+68,134.42 → +67,894.42** (delta exacto de −240.00).
>
> **El conteo total de 18 no cambia** — el MercadoPago ya estaba dentro (su `createdAt` cae en julio, cuenta en los 192 de Jeeves y faltaba en los 187 de Odoo). Lo que cambia es la **causa**. Y el barrido de 2.4 recupera ambas causas por igual, porque empareja por `(date, amount, payment_ref)` y no por causa.

### El hallazgo nuevo: fuga ACTIVA por liquidación tardía

La ventana alcanza `maxDate − 3d`. Como `maxDate` va ~2 días detrás de la realidad (lag de liquidación), el **alcance efectivo es ~5 días**. Todo lo que liquide más tarde cae fuera de la ventana — y **no vuelve nunca, porque la ventana solo avanza**.

**Caso probatorio — línea `32863`:**

| Dato | Valor |
|---|---|
| `payment_ref` | `[Tarjeta gastos ****4548] Europcar` |
| `amount` | −0.01 |
| `date` (CST) | 2026-08-03 |
| `transactionDate` (Jeeves) | 2026-08-03T19:23:02Z |
| `transactionPostedDate` (Jeeves) | 2026-08-08T10:01:47Z → **lag de liquidación 4.6 días** |
| `create_date` (Odoo) | **2026-08-10T13:00:17Z** → capturada 7 días después de su fecha |

Reconstrucción del margen: la corrida del 2026-08-07 13:00 insertó líneas fechadas Aug 5, así que `maxDate` quedó en **Aug 5**. Aug 8 y Aug 9 fueron sábado y domingo (cron `1-5`), sin corridas. En la corrida del **Aug 10 13:00**, `maxDate` seguía en Aug 5 → `fromDate = Aug 2`. El `createdAt` Aug 3 19:23 entró con **~1.8 días de margen**.

**Sobrevivió por casualidad.** Si el cron hubiera estado al día y `maxDate` fuera Aug 7, `fromDate` habría sido Aug 4 y la transacción se pierde en silencio.

### El cómplice que lo hace invisible

Nodo **`11 - Odoo CREATE statement lines`** tiene `"onError": "continueRegularOutput"`. Un insert rechazado por la constraint única de `unique_import_id` se descarta por item, el batch continúa, y el `[[CBRUN]]` sigue reportando `rechazadas: 0` — porque el conteo se calcula **antes** del insert:

```js
existRows = $('9 - Odoo SEARCH dedupe').all()...filter(r=>r&&r.unique_import_id);
const existing=new Set(existRows.map(r=>r.unique_import_id));
toInsert=all.filter(r=>!existing.has(r.unique_import_id));
duplicadas=all.length-toInsert.length;
```

El filtro dedupea **contra Odoo**, no **dentro del lote**. En una carga con gemelas, las 4 copias entran a `toInsert`; Odoo acepta 1 y rechaza 3 por constraint; el `onError` las traga. Resultado observable: `status:"ok"`, `rechazadas:0`, y 3 transacciones reales desaparecidas.

---

## 1.2 — Payana / BBVA: la impresión es medio correcta

| Journal | source | statement lines | conciliadas | **líneas en 2026** | `Manual: BILL` sin conciliar |
|---|---|---|---|---|---|
| 74 PAYANA | `online_sync` | 52 | **52 (100%)** | **0** | 202 · −$2,760,769.33 |
| 8 BBVA General MXN | `file_import` | 301 | 148 (49%) | **0** | 40 · −$5,366,131.55 |
| 75 BBVA USD | `file_import` | 1 | 0 | **0** | 4 · −$685,803.28 |
| 61 Jeeves | `file_import` | 7,312 | 4,195 | 1,901 | 554 · −$1,256,865.87 |

Distribución por año de las líneas bancarias: **PAYANA** todas en 2025 (52). **BBVA General** 2019 (35), 2020 (122), 2024 (1), 2025 (143).

**Resolución de la contradicción:** Payana tiene su historia **100% conciliada** y BBVA General casi la mitad — de ahí la impresión de que "están bien". Y en su propio marco lo están. Pero **ninguno de los dos tiene una sola línea bancaria en 2026**: la captura ahí se detuvo. Los `Manual: BILL` de esas cuentas (246 líneas, **−$8.81M**) están 100% sin conciliar porque **no existe extracto 2026 contra el cual casarlos**. No es un problema de cómo se lleva la contabilidad; es ausencia de fuente bancaria.

> **VEREDICTO 1.2 — fuera de alcance de esta sesión. Es eslabón 1 de OTRAS fuentes; va al roadmap.**

---

## 1.3 — Puente PO→bill: confiable hoy

**Corrección de una lectura intermedia:** `invoice_origin` aparece en solo 35 de 500 bills (7%), pero **no es el campo del vínculo**. `purchase_id` no es *stored* (falla en SQL). El vínculo real vive en `purchase_line_id`, a nivel de línea.

| Medición | Resultado |
|---|---|
| Bills company 1, `in_invoice`, posted, `invoice_date >= 2026-05-12` | **500** |
| …con `line_ids.purchase_line_id` poblado | **498 (99.6%)** |
| …con `invoice_origin` poblado | 35 (7%) — pista falsa |
| …con campos Studio de PO (`x_studio_po_`, `..._LHHPw`, `..._RgHGm`) | **0** |
| Subconjunto Jeeves (13 bills conciliados por el motor, Aug 3–5) | **13 de 13** con `purchase_line_id` |

Ejemplos crudos: `BILL3190 → POL 12374 "Renta de Carro en Cd. Juarez"` · `BILL3180 → POL 12378 "60108INOX,ABRAZADERA U-120 3\"" + POL 12380 "ANCLA ARPON 3/8\" X 2\""`.

### Lag transacción → bill (n = 13, los que el motor concilió)

| Línea (fecha CST tx) | Bill | `create_date` del bill | lag |
|---|---|---|---|
| 32532 Aug 3 | BILL3160 (60906) | 2026-08-03T23:29:04Z | 0 d |
| 32535 Aug 3 | BILL3163 (60909) | 2026-08-03T23:36:36Z | 0 d |
| 32530 Aug 3 | BILL3164 (60910) | 2026-08-03T23:39:12Z | 0 d |
| 32525 Aug 3 | BILL3176 (60967) | 2026-08-04T23:34:34Z | 1 d |
| 32544 Aug 4 | BILL3173 (60958) | 2026-08-04T23:19:26Z | 0 d |
| 32542 Aug 4 | BILL3175 (60963) | 2026-08-04T23:22:49Z | 0 d |
| 32539 Aug 4 | BILL3177 (60968) | 2026-08-04T23:42:28Z | 0 d |
| 32541 Aug 4 | BILL3185 (61015) | 2026-08-06T16:45:53Z | 2 d |
| 32558 Aug 5 | BILL3180 (61009) | 2026-08-06T16:39:56Z | 1 d |
| 32556 Aug 5 | BILL3181 (61010) | 2026-08-06T16:40:57Z | 1 d |
| 32553 Aug 5 | BILL3182 (61011) | 2026-08-06T16:41:56Z | 1 d |
| 32552 Aug 5 | BILL3189 (61020) | 2026-08-06T23:06:07Z | 1 d |
| 32551 Aug 5 | BILL3190 (61022) | 2026-08-06T23:07:29Z | 1 d |

**Media 0.62 días · máximo 2 días.**

**El dato que más importa para la arquitectura:** el bill llega **antes** que la línea liquidada. `BILL3190` se creó `2026-08-06T23:07:29Z`; su línea `32551` se capturó `2026-08-07T13:00:05Z` — el bill existía **14 horas antes**.

### Pool y analítica

- **POs abiertos** company 1: **176 confirmados `to invoice` ($3,416,529.24)**, más 450 en `state=purchase, invoice_status=no` ($1,075,480.24).
- **Analítica en PO:** 206 de 338 líneas del pool `to invoice` (**60.9%**) traen `analytic_distribution`, y es **solo proyecto** — muestras crudas `{"3083":100}`, `{"576":100}`.
- **Analítica en bill:** las líneas traen rubro **y** proyecto, en grupos separados — `{"1176":100,"3071":100}` (el patrón R2 documentado en CLAUDE.md §17).

> **VEREDICTO 1.3 — el puente es confiable hoy. No hay que reforzarlo.**
> Dos matices para el diseño posterior: (a) contra PO se valida **proyecto, no rubro** — la clasificación completa solo existe en el bill; (b) 39% de las líneas del pool no traen analítica.

---

## Estado al cerrar Gate A

| Frente | Veredicto |
|---|---|
| Universo de pérdidas por colisión | **18, cerrado** |
| Ventana de captura | **fuga ACTIVA por liquidación tardía** — se cierra antes de trapear el histórico |
| Conteo de rechazos | **falso `rechazadas: 0`** — el `onError` traga los rechazos de constraint |
| Puente PO→bill | **confiable, no tocar** |
| Payana / BBVA | **fuera de alcance** — sin extracto 2026, va al roadmap |
