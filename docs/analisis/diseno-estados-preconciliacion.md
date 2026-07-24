# Diseño — vista de estados + buscador de bills (Bancos)

> 2026-07-24 · **Diseño, no implementación.** Arranca DESPUÉS del cierre del canary. Sobre datos reales verificados read-only.

---

## 0. Verificación urgente para la instrucción a Gerardo — el patrón "Manual:BILL" NO es solo-Jeeves

`Manual: BILL` existe en **7 journals** (conteo de patas banco, `balance<0`):

| Journal | # patas banco | Σ (patas banco) |
|---|---:|---:|
| Jeeves (61) | 550 | −$1,245,329 |
| PAYANA (74) | 177 | −$2,552,220 |
| BBVA General MXN (8) | 37 | −$5,145,390 |
| BBVA USD (75) | 4 | −$685,803 |
| Cash (72) | 7 | −$57,143 |
| Cash (103) | 13 | −$5,700 |
| JP Morgan Chase (73) | 3 | −$1,853 |
| **TOTAL** | **791** | **−$9,693,439** |

**El workaround es sistémico, no exclusivo de Jeeves** → la instrucción a Gerardo (corte de proceso "cero Manual:BILL nuevos") debe cubrir **todos los journals bancarios**.

⚠️ **CAVEAT honesto (no sobre-vender):** el **−$9.69M es la suma de patas banco Manual:BILL**, NO necesariamente "corrupción". La **doble-contabilización** (= corrupción del saldo) está **confirmada solo para Jeeves** (captura-jeeves importa la transacción real → el banco 223 recibe el movimiento DOS veces: la real + la manual). Para PAYANA/BBVA/Chase la corrupción **depende de si ese journal tiene un feed/import bancario real que también registra el movimiento**. Si NO lo tiene, la entrada Manual:BILL es el ÚNICO registro (legítimo, no corrupción). **Follow-up antes de citar el $9.69M como corrupción:** por cada journal, verificar si hay statement lines / feed que duplique. Confirmado hoy: Jeeves = $1.245M de doble-conteo.

---

## 1. Estado actual (sobre lo que se diseña)

### 1.1 Estado de fila en la UI hoy
- El endpoint `fin/captura-transacciones` devuelve por fila `ok` (= `is_reconciled` de Odoo) + `res` (residual). El front distingue **2 estados de tabla**: `ok=true` → **"✓ conciliada"** · `ok=false` → **"● pendiente"** (columna `ok`, filtro estado ok/pend). No hay más granularidad en la tabla.
- Por fila expandida (acordeón, Etapa C) se consulta `fin/captura-sugerencias` → aparece el **nivel** y candidatos.
- El panel "Hoy" (3 cubetas) depende de **B.2** (NO construido) → hoy degrada a "no disponible".

### 1.2 Qué devuelve `fin/captura-sugerencias` por fila
`{ line_id, comercio, monto, nivel, candidatos:[{bill_aml_id, bill_name, partner, monto_bill, date_bill, days_diff, score, banda, conflicto, pre_marcado}] }`
- `nivel` ∈ `auto-elegible` (único+score>0.7+sin conflicto) · `sugerida` (múltiples o score≤0.7) · `sin-documento` (sin candidato).
- ⚠️ El pool actual solo mira **cuenta 17** → los bills en **285** y los **pagados-manual** son invisibles (§19). Un `sin-documento` de hoy a menudo SÍ tiene bill.

### 1.3 Pendings Jeeves (MCP `list_transactions`, `transactionStatuses:['pending']`)
Shape real (14 pendings ahora): `{ transactionStatus:"pending", transactionDate, totalBaseCurrencyAmount:"695.000000", source:{name:"Felipe Pérez", detail:"4666"}, destination:{name:"Starlink", detail:"<MCC>"} }`.
→ Trae **monto** (`totalBaseCurrencyAmount`), **comercio** (`destination.name`), **tarjeta** (`source.detail`=últimos4), **comprador** (`source.name`), fecha. **NUNCA se escribe a Odoo (regla firmada).**

---

## 2. (a) Mapeo de estados objetivo → datos reales

| Estado | Definición (dato real) | Fuente | Transición |
|---|---|---|---|
| **Conciliado (Liquidado)** | línea `is_reconciled=true` (settled + reconciliada) | `captura-transacciones.ok` + `full_reconcile` + firma `[[CONCFTS]]` | Terminal ✅ |
| **Conciliado (En tránsito)** | **pending** de Jeeves (aún NO en Odoo) que pre-matchea un bill abierto por monto+comercio | MCP pendings (capa UI) + pre-match contra bills abiertos. **Cero Odoo.** | Se **cierra al liquidar**: cuando el pending settlea → línea real → gancho post-sync la concilia → Liquidado |
| **Pre-Conciliado** | línea settled `is_reconciled=false` con candidato bueno **+ confirmación humana** ("lista para el cierre") | `sugerencias` (mejor candidato) + marca de confirmación (§2c) | Al correr Conciliar (botón o batch nocturno) → Liquidado |
| **Pendiente (con candidato)** | settled, sin conciliar, `nivel ∈ {sugerida, auto-elegible}` sin confirmar | `sugerencias` | Humano confirma → Pre-Conciliado |
| **Sin documento** | settled, sin conciliar, sin candidato **tras buscar en 17+285** | `sugerencias` + buscador (§2b) | Buscador encuentra bill → candidato; o queda para Gera |

**Precedencia de cómputo por línea settled:** `is_reconciled` → Liquidado; si no, ¿marca PRECONC? → Pre-Conciliado; si no, ¿nivel con candidato? → Pendiente; si no → Sin documento. **En tránsito** es una **capa aparte** (pendings, no líneas de Odoo) — sección propia, no la tabla settled.

**Regla de oro (En tránsito):** los pendings viven SOLO en la capa UI (leídos del MCP en cada carga), jamás se escriben a Odoo. El pre-match pending↔bill es informativo ("esto va a caer contra BILLxxxx"); el cierre real ocurre cuando settlea y el gancho post-sync concilia la línea verdadera.

---

## 3. (b) Buscador de bills en el acordeón

### Endpoint NUEVO `fin/captura-buscar-bills` (workflow nuevo — NO tocar los existentes)
- **Trigger:** webhook POST, JWT `bancos:read` (mismo patrón que `sugerencias`).
- **Request:** `{ token, q?, folio?, proveedor?, monto?, monto_tol?(def 0.01), companies?, limit?(def 30) }`.
- **Server (SEARCH `account.move.line`):** `account_id in [17, 285]` (**AMBAS payable — no repetir el punto ciego**) · `reconciled=false` · `parent_state='posted'` · `move_id.move_type in [in_invoice,in_refund]` · filtros:
  - `folio` → `move_id.name ilike folio`
  - `proveedor` → `partner_id ilike proveedor`
  - `monto` → `|amount_residual| ∈ [monto−tol, monto+tol]`
  - `q` libre → OR sobre nombre/proveedor.
- **Response:** `{ bills:[{ bill_aml_id, bill_name, move_id, partner, monto, date, cuenta(17|285) }], total }`.
- **NO concilia.** El resultado alimenta el **botón Conciliar existente** (`fin/captura-conciliar {line_id, bill_aml_id}`) con **guards intactos**.

### Flujo UI (en la fila expandida)
1. Debajo de los candidatos automáticos, sección **"Buscar bill"** con inputs: folio BILL · proveedor · monto (±rango).
2. Al buscar → `fin/captura-buscar-bills` → resultados como tarjetas seleccionables (misma UI que candidatos de sugerencias, con badge de cuenta 17/285).
3. Usuario elige un bill → **botón Conciliar** (el existente) → receta con guards → Liquidado.
→ Resuelve los casos `sin-documento`/falso-candidato: el humano encuentra el bill REAL (incl. 285), sin que el motor tenga que verlo.

---

## 4. (c) ¿Dónde se guarda "Pre-Conciliado confirmado por humano"?

| Opción | Pro | Contra | Veredicto |
|---|---|---|---|
| **Chatter `[[PRECONC]]`** (mail.message en el move de la línea) | Patrón YA probado (CONCFTS/CBAUTO); nativo; auditable; **visible en Odoo** (Miriam lo ve); **compartido** entre usuarios/dispositivos; el batch lo lee para cerrar | Requiere parseo de marcador; el pre-confirm es un write chico a Odoo (bancos:write) | ✅ **RECOMENDADO** |
| Campo Studio en la línea (`x_studio_preconc_bill`) | Fuente única, consultable directo | **Studio** (se evita); write igual | Alternativa si algún día se acepta el campo |
| localStorage del front | Cero write Odoo, rápido | **Por dispositivo/navegador**, se pierde, **invisible a Miriam y al batch**, no compartido | ❌ **Rechazado** (rompe el trabajo compartido) |

**Recomendación: marcador `[[PRECONC]]`** `{bill_aml_id, by, ts}` en el chatter del move de la línea. Razones:
- **Miriam también concilia por el widget de Odoo** → el estado debe vivir en Odoo, no en un navegador. Si Miriam concilia primero, la línea queda `is_reconciled=true` → Liquidado, y el guard `LINE_YA_CONCILIADA`/`BILL_YA_CONCILIADO` maneja la carrera (el pre-conf queda moot, sin conflicto).
- El **batch nocturno / botón "cerrar pre-conciliados"** lee los `[[PRECONC]]` y corre la receta Conciliar (con re-validación de guards al write). Desacopla la DECISIÓN humana de la EJECUCIÓN.
- Cero Studio, cero fragilidad de localStorage, auditable.

Write del pre-conf: endpoint chico `fin/captura-preconciliar` (bancos:write) o rama del flujo existente que postea el marcador — **workflow nuevo, no tocar los existentes.**

---

## 5. (d) Estimación por pieza + orden

| # | Pieza | Tipo | Depende de | Estimación |
|---|---|---|---|---|
| 1 | **`fin/captura-buscar-bills` + buscador en acordeón** | endpoint NUEVO + front | — (independiente) | 2-3h endpoint + activación tuya + 1-2h front |
| 2 | **Columna de estado** (Liquidado/Pendiente/Sin-doc) enriquecida | **front-only** | datos que ya existen | ~2h |
| 3 | **Pre-Conciliado** (`[[PRECONC]]` write + read + estado) | endpoint NUEVO (write) + front + lectura en un endpoint | #1 útil pero no bloqueante | 2-3h |
| 4 | **En tránsito** (pendings pre-match contra bills) | front + fuente de pendings | **B.2** (cubeta pendings) o endpoint pendings dedicado | 3-4h (tras B.2) |
| 5 | **Cierre En tránsito→Liquidado** (gancho post-sync) + **pool 285 en el motor auto** | motor v2 | **canary cerrado** + gancho post-sync | motor v2 (post-canary) |

**Orden sugerido:**
1. **#2 (columna de estado, front-only)** — barato, claridad inmediata, cero riesgo, se puede HOY tras el canary.
2. **#1 (buscador de bills)** — el mayor dolor (encontrar el bill real incl. 285); independiente del motor. Alto valor.
3. **#3 (Pre-Conciliado)** — habilita el estado + cierre por batch.
4. **#4 (En tránsito)** — tras B.2.
5. **#5 (cierre auto + pool 285 en el motor)** — motor v2, después del canary + decisiones.

**Qué es front-only (ya, tras canary):** #2, y los consumidores UI de #1/#3. **Qué necesita endpoint nuevo (ritual de activación tuyo):** #1 buscar-bills, #3 preconciliar. **Qué depende de motor v2/B.2:** #4 (B.2), #5 (gancho + pool 285).

---

## 5.5 CORRECCIÓN DE TAXONOMÍA (2026-07-24, v0.5.10) — la fuente de verdad son los 5 estados de Esteban

La implementación v0.5.7 fragmentó los estados en categorías técnicas (`pre-conciliado`, `pendiente con sugerencia`, `sin documento`, `evaluando`, `pendiente neutro`). **Corrección: 5 estados de PRIMER NIVEL, y el detalle del cerebro es PISTA, no estado.**

| Estado (primer nivel) | Definición | Color | Nota |
|---|---|---|---|
| **CONCILIADO (Liquidado)** | `is_reconciled=true` | verde | terminal |
| **CONCILIADO (En tránsito)** | bill **asignada** (confirmada por humano vía Pieza #3, o pre-match del motor sobre pendings vía Pieza #4/B.2) pero **no cerrada formalmente** | ámbar | **absorbe y reemplaza "Pre-conciliado"** — mismo cableado (`state.preconc`), nuevo nombre. Hoy 0 hasta Pieza #3 |
| **FONDEO** | marcador `[FONDEO]` en ref | gris | no cuenta a pendientes/residual |
| **DEVOLUCIÓN** | marcador `[DEVOLUCIÓN]` en ref | azul | no cuenta a pendientes/residual |
| **SIN CONCILIAR** | **TODO lo demás** (candidato + sin-documento + evaluando + neutro) | neutro | el detalle del cerebro es PISTA secundaria en la fila, NO estado |

**Pista del cerebro (dentro de SIN CONCILIAR, sin cambiar el estado):**
- hay candidato → `○ Sin conciliar` **+ bill·score** al lado (visible sin abrir acordeón).
- sin candidato → `○ Sin conciliar` **+ link "buscar bill"**.
- batch en vuelo o sin evaluar → `○ Sin conciliar` **a secas** (nada de "evaluando" como estado).

Agregados: `N conciliadas · M en tránsito · X sin conciliar · fondeos · devoluciones`. Solo SIN CONCILIAR suma al residual. Filtro dropdown = 5 opciones + todos; `ok`/`pend` se mantienen como compat del panel Hoy.

⚠️ **DECISIÓN PENDIENTE (cuando Pieza #3 pueble `En tránsito`):** hoy "En tránsito" está vacío en real, así que el residual = solo SIN CONCILIAR es correcto de facto. Cuando Pieza #3 empiece a marcar bills asignadas (`state.preconc`), **definir si el residual INCLUYE lo En tránsito o lo muestra por separado.** Argumentos: (a) *incluir* — la plata aún no está formalmente cerrada, sigue siendo exposición hasta el cierre → un solo número de "lo que falta cerrar"; (b) *separado* — En tránsito ya tiene bill asignada (decisión humana tomada), es distinto de lo que ni siquiera tiene documento → dos números: "sin conciliar $X · en tránsito $Y". Decisión de Esteban al abordar Pieza #3; afecta la línea de agregados y posiblemente el semáforo.

---

## 5.6 RE-EVALUACIÓN DEL MOTOR D — ya cubierto por diseño (petición #2 de Esteban, confirmado 2026-07-24)

El **motor de la Etapa D** (`captura-concilia-auto`, cron 23:00 CST L–V) hace **`getAll` con `returnAll:true` del universo COMPLETO sin conciliar en cada corrida** — **NO tiene memoria de corridas previas**. Consecuencia (deseada):

> El caso "compra en fin de semana sin PO/Bill, el equipo la crea el lunes, y el motor la concilia el lunes 23:00" **ya está cubierto**. El motor re-evalúa cada línea abierta en cada corrida, así que una línea que hoy no tiene documento y mañana sí, **se concilia sola en la siguiente corrida** sin intervención.

**El equipo puede confiarse en crear PO + Bill y dejar que el motor cierre** (dentro de las reglas del gate D: mismo monto, ventana de fechas, y score de nombre suficiente).

**Limitación honesta (reglas v1 de nombre):** un match con **descriptor débil** (el comercio del banco no se parece al nombre del proveedor del bill) cae a **sugerencia** — aparece como **pista en la fila** (`bill·score`) para que un humano lo confirme, **no se auto-concilia**. Eso lo resuelve el **motor v2** (pool 285 + mejores señales de match). Hasta entonces: auto para los matches limpios, pista para los débiles.

---

## 5.7 Columna "Status Jeeves" — contrato adelantado para Pieza #4 (v0.5.11)

Nueva columna de tabla **"Status Jeeves"** (no visible por default, activable en el menú ⋮). Es una **dimensión distinta del Estado-vs-Odoo**: describe el estado del movimiento **en Jeeves**, no su conciliación contra Odoo.

- **Hoy:** todo lo que entra por captura es **settled por diseño** → la columna muestra **"✓ Liquidado"** en todas las filas. Derivable en el front, **sin tocar el endpoint** (si la fila vino de captura = Liquidado).
- **Cuando llegue Pieza #4/B.2** (pendings a la vista): esos movimientos traerán una marca (`r.jeeves_status='transito'` o `r.jeeves_pending`) y la columna mostrará **"◐ En tránsito"** para ellos. El contrato de la columna ya está puesto por adelantado; Pieza #4 solo inyecta las filas pending con la marca.
- Función `statusJeeves(r)` a **nivel módulo** (no closure) porque la consume `COLS` — misma lección de la regresión v0.5.7 (COLS es de módulo, no ve funciones del closure).

---

## 6. Deuda conocida (post-canary, NO fix hoy)

- **`evalSugg()` corre el cerebro completo en cada carga (sin caché).** Cada carga de la tabla dispara el batch a `fin/captura-sugerencias` (~9 llamadas paginadas × matching contra bills abiertos por cada página). Con **un solo usuario** ocasional es aceptable; con **Gera/Miriam conciliando a diario** esto refritea Odoo en cada refresh. **Fix (post-canary):** cachear el resultado del matching — server-side (TTL en `captura-sugerencias` o tabla de sugerencias materializada) o TTL en el front (p.ej. sugerencias por `line_id` válidas N minutos en memoria/localStorage con invalidación al conciliar). Decisión de dónde cachear = cuando se aborde motor v2 / B.2.
- **Clasificación Fondeo/Devolución por marcador de texto (`ref`), no por dato estructurado.** `isFondeo` = `/FONDEO/i`, `isDevolucion` = `/DEVOLUCI/i` sobre `ref`. Depende de que captura-jeeves siga estampando esos marcadores. Si algún día el formato del `ref` cambia, estos estados se rompen en silencio. Decidido así (v0.5.7) porque el signo del monto NO discrimina (fondeos y devoluciones son ambos positivos). Backlog: si el motor expone un campo de tipo estructurado, migrar a él.

---
_Diseño read-only en su origen (§1-5). §6 = deuda anotada durante la implementación de la Pieza #2 (v0.5.7). Nada de workflows existentes tocado._
