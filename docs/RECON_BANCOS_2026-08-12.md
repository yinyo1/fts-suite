# RECON BANCOS — fotografía forense 2026-08-12

**Modo:** read-only absoluto. Cero writes a Odoo, cero edits/activaciones en n8n, cero commits.
**Regla de evidencia:** todo dato lleva su origen consultable (execution ID, `mail.message` id, hash de commit, id de registro Odoo, código HTTP). Lo que no se pudo ejecutar está en §4 NO VERIFICABLE, no inferido.
**Fecha de corte:** 2026-08-12, ~17:30 UTC (11:30 CST).

---

## 1. Tabla semáforo

| Componente | Estado | Evidencia (cruda) | Último latido |
|---|---|---|---|
| **captura-jeeves** (`PWEiA37CLfP6lMgg`) | 🟡 **degradado** | `active:true`, `versionCounter:10`, `triggerCount:2`, TZ `America/Monterrey`. CBRUN `mail.message 2927821`. Línea Odoo 32910 `create_date 2026-08-12T13:00:09Z`. **Pero:** 3/3 ejecuciones retenidas en error + pérdida silenciosa por colisión de hash (§5 R-1) | 2026-08-12 17:00 UTC (11:00 CST) |
| **Motor D** — pase auto (`hY6uKxEvs1LLpyf5`) | 🟢 **vivo** | `active:true`, exec **62867** `2026-08-12T05:00:00.200Z` status `success`; 10/10 success, 0 error. CBAUTO `mail.message 2927641` | 2026-08-12 05:00 UTC (2026-08-11 23:00 CST) |
| **B.1 sugerencias** (`43ueZWEXzLyty0LF`) | 🟢 **vivo** | `active:true`. `POST /webhook/fin/captura-sugerencias` → **HTTP 401** `{"_error":true,"code":"BAD_TOKEN","http":401}` (webhook registrado, gate JWT operante) | probe 2026-08-12 |
| **B.2 cubetas** (en_transito / conciliable_pendiente / conciliadas_hoy) | ⚫ **nunca existió** | `Code - build status` desplegado en `OJTTEfXlT9p5onEI` retorna literalmente `{por_journal, global, cron, residual_umbral}`. Cero cubetas. Además `fin/captura-pendings-status` → **HTTP 404 "not registered"** (`AylUIUvOfxdZpcO6` `active:false`) | — |
| **concilia-now** (`GYsE6Z8hCAiQE0Vc`) | 🔴 **caído / nunca activado** | `active:false`. `POST /webhook/fin/concilia-now` → **HTTP 404** `"The requested webhook POST fin/concilia-now is not registered"` | nunca |
| **endpoints `fin/*`** | 🟢 **vivos** | 401 BAD_TOKEN en: `captura-status`, `captura-transacciones`, `captura-sugerencias`, `captura-conciliar`, `captura-dataset`, `captura-buscar-bills`. `captura-jeeves/run` → 401 `"Firma invalida"` | probe 2026-08-12 |
| **UI Pages** (Instrumentos de pago) | 🟡 **degradado** | `IP_BUILD = '0.5.14'` en `finanzas/js/modules/instrumentos-pago.js:23`; árbitro `git log -L 23,23` → último cambio **`4fb1d7e` 2026-07-29**. Sin commits a `finanzas/` en 14 días. `IP_REAL_ENABLED = true` (L22) | 2026-07-29 |
| **sync Chase / Plaid** | 🟡 **degradado** | `account.online.account` id 2, `last_sync 2026-08-10`, `fetching_status "done"`, `write_date 2026-08-12T15:15:53Z` (OdooBot). Jala bien, **pero 0% conciliado y sin saldo inicial** | 2026-08-12 15:15 UTC |
| **pool 17 / 285** | 🟢 **vivo** | `account.move.line` abiertas posted `in_invoice+in_refund`: cuenta **17** = 138 líneas / residual **−$687,299.44**; cuenta **285** = 22 líneas / **−$34,259.69** | consulta 2026-08-12 |
| **ir.cron 52** (auto-match nativo) | 🟢 **desactivado, como se diseñó** | `{"id":52,"cron_name":"Try to reconcile automatically your statement lines","active":false,"nextcall":"2026-07-21T18:40:13+00:00"}` — congelado el día que se apagó | apagado desde 2026-07-20/21 |

---

## 2. Los 6 números duros

> ### (a) Journal 61 — 2026: **1,901 líneas · 40 conciliadas = 2.10%**
> `aggregate_records` por `is_reconciled`, domain `journal_id=61 AND date>=2026-01-01`:
> `false → 1,861` (amount:sum **+112,700.69**) · `true → 40` (amount:sum −44,566.27).
> Histórico completo del journal = **7,312 líneas** (2023: 4,148 · 2024: 1,247 · 2025: 16 · 2026: 1,901). El 2023 está 99.9% conciliado (4,144/4,148) — es de otra era, no de este sistema.
>
> ### (b) Desfase Jeeves ↔ Odoo en 15 días: **2 transacciones perdidas · $1,429.99**
> Jeeves `list_transactions` settled 2026-07-28→2026-08-12 = **95**. Odoo journal 61 mismo rango en fecha CST (2026-07-28→2026-08-11) = **93**.
> Las 2 faltantes, identificadas por cruce de montos:
> - **$74.99** — `Steren`, tarjeta ****4548, 2026-07-28 (Jeeves trae **dos**: 16:43:29 y 19:03:05 UTC; Odoo solo la línea **32481**)
> - **$1,355.00** — `SD`, tarjeta ****4548, 2026-07-29 (Jeeves trae **dos**: 16:20:31 y 17:38:21 UTC; Odoo solo la línea **32491**)
>
> Verificación directa: `search_records account.bank.statement.line [journal_id=61, amount in (−74.99,−1355), date>=2026-07-20]` → **total: 2** (una de cada una). Causa raíz en §5 R-1.
>
> ### (c) Desviación de la 223: **≈ $1.49M** (de los cuales $1,256,865.87 son asientos manuales)
> - Saldo contable Odoo cuenta **223 `102.01.007 Jeeves Tarjeta Credito`**, `parent_state=posted`, company 1: **−$1,514,701.21** (8,665 líneas). *(Además: `cancel` +7,386,708.06 / 32 líneas, `draft` −97,875.78 / 10 líneas.)*
> - Porción atribuible a `name like "Manual: BILL"` en la 223: **554 líneas / −$1,256,865.87** = **83.0%** del saldo posted.
> - Realidad Jeeves: estado de cuenta **julio 2026** (id 373172, `status: completed`) cerró en **−$21,014.03**. Junio cerró en 0.
> - → La 223 en libros dice **$1.51M** de deuda de tarjeta; la tarjeta real cerró julio en **$21 mil**. **Creció** respecto de la cifra previa documentada (~$1.245M → $1.2569M en la porción manual).
>
> ### (d) "Manual: BILL" en las últimas 3 semanas: **58 líneas (29 asientos)** — pero solo **2 líneas (1 asiento)** tocan la 223
> Conteo `account.move.line` por semana de `create_date` (2 líneas = 1 asiento):
>
> | Semana | Todas las cuentas | Solo cuenta 223 (Jeeves) |
> |---|---|---|
> | W26 (jun 21) | 36 | 16 |
> | W27 (jun 28) | 98 | 44 |
> | W28 (jul 5) | 166 | 62 |
> | W29 (jul 12) | 98 | 42 |
> | W30 (jul 19) | 76 | **33** |
> | W31 (jul 26) | 4 | **0** |
> | W32 (ago 2) | 42 | **2** (−$10,697.52) |
> | W33 (ago 9, parcial) | 12 | **0** |
>
> **La hemorragia sobre Jeeves SÍ se detuvo** (33 → 0 → 2 → 0 tras la instrucción a Gera). Lo que **no** se detuvo es la práctica en sí: sigue corriendo sobre **PAYANA (cuenta 316)** y **BBVA General MXN (cuenta 38)**. Ejemplos crudos recientes: `aml 204733/204734 "Manual: BILL3211"` (cuenta 316, −$1,287.60, `create_date 2026-08-11T15:44:43Z`), `aml 204722/204723 "Manual: BILL3210"` (cuenta 316, `2026-08-11T15:43:30Z`).
> Distribución total del patrón (1,650 líneas): cuenta 17 `+10,053,937.63` · cuenta 316 PAYANA `−2,739,436.93` · cuenta 38 BBVA `−5,366,131.55` · cuenta 223 Jeeves `−1,256,865.87` · cuenta 227 BBVA USD `−685,803.28` · resto menor.
>
> ### (e) Chase: **312 líneas · 0 conciliadas = 0.00%**
> Journal **122 `BUS COMPLETE CHK`** — `aggregate_records` por `is_reconciled` devuelve **un solo grupo**: `false → 312` (amount:sum −33,753.27). No existe grupo `true`.
> Rango: **mayo 2026 → 2026-08-10** (may 85 · jun 87 · jul 50 · ago 90). Todas con `online_transaction_identifier` poblado (muestra: 32903, 32902, 32901, 32900).
> Journal **73 `JP Morgan Chase USD`**: **cero líneas** de statement.
>
> ### (f) Versión real en main: **v0.5.14**
> `finanzas/js/modules/instrumentos-pago.js:23` → `var IP_BUILD = '0.5.14';`
> `finanzas/index.html:11,70` → cache-busters `?v=0.5.14` (coherentes).
> Árbitro `git log -L 23,23:finanzas/js/modules/instrumentos-pago.js` → **`4fb1d7e` "feat(bancos): v0.5.14 — nota 'en tránsito' junto a Sincronizar"**, fecha **2026-07-29**. Sin deploy fantasma: el badge, los cache-busters y el commit coinciden.

---

## 3. Discrepancias doc/memoria vs terreno

| # | Lo que afirma la fuente | Lo que dice el terreno | Fuentes |
|---|---|---|---|
| **D-1** | Los nombres de 8 workflows dicen **"(INACTIVO — gate Esteban)"** | **`active: true`** en todos: `captura-jeeves`, `captura-concilia-auto`, `captura-status`, `captura-transacciones`, `captura-dataset`, `captura-sugerencias`, `captura-conciliar`, `captura-buscar-bills`. El nombre es una etiqueta fósil; el flag manda | `n8n_list_workflows` crudo vs. nombre del workflow |
| **D-2** | `receta-conciliacion-rpc.md:276` — "**`IP_REAL_ENABLED=false` intacto** → Conciliar solo corre en demo". Memoria `bancos-real-flip-precondiciones.md` — "live en demo (IP_REAL_ENABLED=false)" | **`IP_REAL_ENABLED = true`** (L22, comentario: "flip 2026-07-23; checklist: JWT ok, Cloudflare diferido"). **Real está habilitado en producción** con Cloudflare Access diferido | `instrumentos-pago.js:22` |
| **D-3** | `receta-conciliacion-rpc.md:288` — "**2 noches** limpias → **decidir nuevo `CANARY_MAX`** (subir/quitar) en la sesión siguiente" | `CANARY_MAX: 20` **sin tocar** tras ~14 corridas nocturnas limpias. La decisión nunca se tomó. *(Es moot: `auto_elegibles` nunca pasó de 5 — el tope jamás se activó, `en_espera_canary: 0` en las 15 corridas)* | nodo `2 - Code config` de `hY6uKxEvs1LLpyf5` |
| **D-4** | `receta-conciliacion-rpc.md:289` — diferidos hasta 2 noches limpias: "(1) gancho post-sync … (2) B.2" | Las 2 noches limpias ocurrieron hace ~3 semanas. **Ninguno de los dos diferidos se construyó.** B.2 sigue ausente (confirmado 4ª vez, ahora contra el jsCode desplegado) | `Code - build status` + probe 404 pendings |
| **D-5** | El nombre de `GYsE6Z8hCAiQE0Vc` dice "gate primer-clic-mañana", sugiriendo que faltaba solo el gate | **Nunca se activó.** `active:false` + webhook **404 no registrado**. No es que esté esperando un clic: no existe en producción | `n8n_list_workflows` + probe HTTP |
| **D-6** | Memoria `bancos-hallazgo-manual-bill.md` — "$1.245M ficción" en la 223 | **−$1,256,865.87** hoy. Creció ~$11.9k (2 líneas en W32) | `aggregate_records` por `account_id` |
| **D-7** | Memoria `bancos-motor-etapa-d.md` — "canary night-0 limpia 9/9 (exec 45112)" | Confirmado y **extendido**: hoy son **33 conciliaciones `origen:auto`** acumuladas, 15 marcadores CBAUTO, 0 rechazos en toda la serie. El motor no solo sobrevivió, siguió trabajando | `mail.message` total 33 / 15 |
| **D-8** | `receta-conciliacion-rpc.md:191` — condición para reactivar cron 52: backlog 186 limpio **y** motor Fase 2 vivo | El motor está vivo, pero el cron sigue apagado y **congelado** (`nextcall 2026-07-21T18:40:13Z`, no avanza). Correcto operativamente — solo que nadie volvió a evaluarlo | `ir.cron` id 52 con `active in [true,false]` |

**Nota de método:** `ir.cron` id 52 aparece **vacío** en una búsqueda normal por el `active_test` implícito de Odoo. Hay que pedir `["active","in",[true,false]]` para verlo — el mismo quirk documentado en `ESTADO.md §7` para el roster de nómina. Sin ese truco, la lectura ingenua es "el cron no existe", que es falso.

---

## 4. NO VERIFICABLE en esta sesión

| Ítem | Por qué |
|---|---|
| **E1/E2 — payload autenticado de `fin/captura-status`, `captura-transacciones`, `captura-sugerencias`** | Se probó **liveness** (401 BAD_TOKEN en los 3), pero no se obtuvo un JWT válido. Mintearlo exige el patrón "runner TMP" (crear + **activar** un workflow), que viola el modo read-only de esta sesión ("cero edits", "cero activar/desactivar"). No hay password de `auth/finanzas-login` disponible sin pedírsela a Esteban. **La forma de los responses de status se leyó del jsCode desplegado, no de un response en vivo** — está etiquetado como tal en §1. |
| **E2 — bug 25-jul "fuentes de pago vacías en ambas empresas"** | Requiere el response autenticado de `captura-transacciones`. No probado. |
| **Magnitud total de la pérdida por colisión de hash en 2026** | Confirmada la **tasa** (2 de 95 = 2.1% en la ventana de 15 días muestreada) y el mecanismo exacto. Extrapolar a las 1,901 líneas de 2026 daría ~40 transacciones, pero **eso es aritmética, no medición**. Cuantificarlo de verdad exige barrer Jeeves 2026-01-01→hoy (~7 páginas de 100) y cruzar contra Odoo. No se hizo. |
| **`versionCounter` de la mayoría de los workflows** | Solo se leyeron 3 (`captura-jeeves`=10, `captura-concilia-auto`=2, `captura-status`=2). Los demás requerirían una llamada `mode:details` por workflow; se priorizó no quemar contexto. `id`/`name`/`active`/`updatedAt` sí están crudos para los 81. |
| **Deuda real de la tarjeta Jeeves al día de hoy** | `list_accounts` expone `availableBalance: 183,656.93` (crédito **disponible**, no deuda) y no hay tool de saldo vivo. El dato duro más cercano es el **corte de julio: −$21,014.03** (statement 373172, completed). El corte de agosto aún no existe. |
| **Historial de ejecuciones exitosas de `captura-jeeves`** | La instancia solo retiene **3** ejecuciones, las 3 en error. Los ~200 runs exitosos de las últimas 2 semanas no se guardan (config de la instancia). Se probó la salud por vía indirecta: 467 marcadores CBRUN en chatter + `create_date` de líneas nuevas. |

---

## 5. Riesgos detectados — ordenados por costo de esperar

### R-1 · Pérdida silenciosa de transacciones por colisión de hash — 🔴 el más caro
**Magnitud medida: 2 transacciones / $1,429.99 en 15 días. Tasa 2.1% de todo lo capturado.**

El nodo `8 - Code Construir filas` de `captura-jeeves` construye la llave de deduplicación así:

```js
const hashInput = [fecha, amount.toFixed(2), tag, l4, (dst.name||'')].join('|');
const uid = 'jeeves-' + _sha256hex(hashInput);
```

La llave es **fecha CST | monto | tag | últimos-4 | comercio**. **No incluye el ID de transacción de Jeeves ni la hora.** Dos compras genuinas del mismo día, mismo monto, misma tarjeta y mismo comercio producen **hash idéntico** → la segunda se descarta.

Lo que convierte esto en riesgo de primer orden no es la tasa, es que **la telemetría reporta éxito**: la transacción perdida se cuenta como `duplicadas`, y el run cierra con `status:"ok", rechazadas:0`. El CBRUN de hoy dice `{"total_api":14,"filas":14,"nuevas":0,"duplicadas":14,"rechazadas":0,"status":"ok"}` — indistinguible de un run sano. Es exactamente el anti-patrón "la UI muestra éxito antes de confirmar" del Hallazgo #15, movido al backend.

Costo de esperar: se acumula a ~2 transacciones/15 días **y jamás va a levantar una alarma**. Cuanto más tarde se detecte, más grande el barrido retroactivo contra Jeeves para reconstruir lo perdido. Además contamina el número (a): parte del 97.9% "sin conciliar" son transacciones que nunca llegaron.

### R-2 · La 223 declara $1.51M de deuda contra $21 mil reales — 🔴
Desviación **≈$1.49M**, de la cual **$1,256,865.87 (83%)** son los asientos `Manual: BILL`. La hemorragia sobre Jeeves se detuvo (§2d), pero **el pasivo ya inyectado sigue íntegro en libros** — nadie lo ha revertido. Cualquier estado financiero, razón de apalancamiento o reporte de flujo emitido hoy carga ese $1.49M de ficción. Costo de esperar: el desenredo se hace más caro con cada cierre mensual que lo consolida, y son 554 líneas a revisar.

### R-3 · La práctica manual migró, no murió — 🟠
W32 tuvo **42 líneas** `Manual: BILL` con solo 2 en Jeeves: las otras 40 fueron a **PAYANA (316)** y **BBVA (38)**. El patrón acumulado fuera de Jeeves ya suma **−$2.74M (PAYANA)** y **−$5.37M (BBVA General)**. La instrucción a Gera corrigió el síntoma en una cuenta; el proceso subyacente (cerrar el bill con entrada manual porque no hay conciliación bancaria en esa cuenta) sigue operando donde no hay captura automática. Costo de esperar: se está construyendo el mismo problema de la 223 en dos cuentas más grandes, en tiempo real.

### R-4 · Chase: 312 líneas, 0% conciliado, sin saldo inicial — 🟠
El sync Plaid funciona (`last_sync 2026-08-10`), pero **ninguna** línea se ha conciliado desde mayo. No existe asiento de saldo inicial: la línea posted más antigua de la cuenta 1557 es `aml 204033 / BNK2/2026/00001` del **2026-05-09**, y es una comisión de tipo de cambio (−$0.26), no una apertura. Las 312 líneas de statement son las 312 líneas de la cuenta → **la contabilidad de FTS USA arranca de cero en mayo sin saldo de apertura**, con $191,224.36 reportados por el banco que no están cuadrados contra nada. Suma **76 documentos en `in_payment`** (23 `in_invoice` + 53 `out_invoice`), arriba de los 74 previos.

### R-5 · Cuenta bancaria personal dentro del scope OAuth — 🟠
`account.online.account` id **3, "J. CALDERON"**, `company_id: 6`, balance $125.77, sigue colgando del mismo `account_online_link_id: [9, "Chase"]`. Hoy está inerte (`journal_ids: []`, `last_sync: false`), así que no contamina libros. El riesgo es de exposición y de accidente: un vínculo a journal por error mete movimientos personales en la contabilidad de la empresa. Costo de esperar: bajo mientras nadie la toque, alto e irreversible el día que alguien la asocie.

### R-6 · Real habilitado en producción con el checklist a medias — 🟠
`IP_REAL_ENABLED = true` desde el 2026-07-23, con **Cloudflare Access diferido** por decisión explícita. Los docs y la memoria siguen diciendo `false` (§3 D-2). El riesgo no es el flag —fue una decisión tomada— sino que **la documentación no lo refleja**: cualquier sesión futura que planee asumiendo "Real está gateado" va a razonar sobre un sistema que no existe, y `captura-conciliar` **escribe a producción**.

### R-7 · El motor está sano pero el backlog crece más rápido de lo que concilia — 🟡
Motor D funciona correctamente (33/33 conciliaciones verificadas limpias, 0 rechazos). Pero su rendimiento cae a cero por falta de insumo, no por fallas:

| Fecha (CBAUTO) | evaluadas | auto-elegibles | conciliadas | sugeridas | sin-documento |
|---|---|---|---|---|---|
| 2026-08-05 | 1,869 | 0 | 0 | 47 | 1,822 |
| 2026-08-06 | 1,882 | 4 | 4 | 51 | 1,827 |
| 2026-08-07 | 1,887 | 4 | 4 | 53 | 1,830 |
| 2026-08-08 | 1,896 | 5 | 5 | 54 | 1,837 |
| 2026-08-11 | 1,905 | 0 | 0 | 59 | 1,846 |
| 2026-08-12 | 1,907 | 0 | 0 | 60 | **1,847** |

`sin-documento` subió **+25 en 7 días** mientras el motor concilió 13. El cuello no es el motor: **1,847 de 1,907 líneas (96.9%) no tienen bill contra el cual conciliar** — y R-1/R-2/R-3 explican por qué (los bills existen, pero ya fueron "pagados" con entradas manuales, así que salen del pool de abiertos). El pool disponible hoy es de solo 160 bills ($721,559.13). Costo de esperar: el backlog es monótonamente creciente; cada semana que pasa suma ~25 líneas irreconciliables más.

### R-8 · Ceguera de observabilidad en `captura-jeeves` — 🟡
La instancia retiene **3** ejecuciones de este workflow y las 3 son errores (`59294` 2026-08-08, `56822` 2026-08-05, `51630` 2026-07-30) — los éxitos no se guardan. El error es siempre el mismo, transitorio: `SSE sin data` en `6 - Code Fetch Jeeves SSE` (30s de timeout contra la API de Jeeves). Cada uno **salta una ventana de captura completa**; la ventana de traslape (`traslape_dias: 3`) la recupera después, así que no hay pérdida por esta vía. El riesgo es de diagnóstico: sin ejecuciones exitosas retenidas, la única forma de saber si el sistema respira es leer el chatter de Odoo. Un fallo sostenido tardaría en notarse.

---

## Apéndice — evidencia cruda de referencia

**Inventario n8n del frente** (crudo de `n8n_list_workflows`; `versionCounter` solo donde se leyó con `mode:details`):

| Nombre | id | active | versionCounter | updatedAt |
|---|---|---|---|---|
| `captura-jeeves (INACTIVO — pendiente visto bueno Esteban)` | `PWEiA37CLfP6lMgg` | **true** | 10 | 2026-07-22T19:31:35.623Z |
| `captura-concilia-auto (INACTIVO — gate Esteban)` | `hY6uKxEvs1LLpyf5` | **true** | 2 | 2026-07-23T20:55:04.133Z |
| `fin/captura-status (INACTIVO — gate Esteban)` | `OJTTEfXlT9p5onEI` | **true** | 2 | 2026-07-19T07:05:54.105Z |
| `fin/captura-transacciones (INACTIVO — gate Esteban)` | `S9D7ZAtZ5QaPyWC7` | **true** | n/l | 2026-07-25T00:41:13.795Z |
| `fin/captura-dataset (INACTIVO — gate Esteban)` | `KqHX9TnlAhT0mW6Z` | **true** | n/l | 2026-07-19T06:44:40.787Z |
| `fin/captura-conciliar (INACTIVO — gate Esteban)` | `PcnlIPWh30l2LrwW` | **true** | n/l | 2026-07-23T16:59:01.134Z |
| `fin/captura-sugerencias (INACTIVO — gate Esteban)` | `43ueZWEXzLyty0LF` | **true** | n/l | 2026-07-23T17:13:45.559Z |
| `fin/captura-buscar-bills (INACTIVO — gate Esteban)` | `nUUyGlThlhs0nhsG` | **true** | n/l | 2026-07-24T23:13:58.542Z |
| `fin/concilia-now (INACTIVO — gate primer-clic-mañana)` | `GYsE6Z8hCAiQE0Vc` | **false** | n/l | 2026-07-25T00:17:39.844Z |
| `fin/captura-pendings-status (INACTIVO — gate Esteban)` | `AylUIUvOfxdZpcO6` | **false** | n/l | 2026-07-30T04:44:40.448Z |
| `auth/finanzas-login` | `ykNzGCvdjzjdXYhc` | **true** | n/l | 2026-07-23T02:24:03.092Z |
| `TMP - test pendings (BORRAR)` | `1l6d9p4tPlLDlJmo` | false | n/l | 2026-07-30T04:48:37.951Z |

**A2 — Schedule de `captura-jeeves` (crudo, sin cambios respecto al doc):**
`0,30 7-16 * * 1-5` · `*/10 17 * * 1-5` · `0 18 * * 1-5` · `settings.timezone: "America/Monterrey"`. Coincide con lo que declara `Code - config` de `captura-status`.

**A4 — `CANARY_MAX` (crudo, nodo `2 - Code config`):**
```js
return [{json:{ CONFLICT_PAIRS:CONFLICT_PAIRS, UMBRAL_PLENO:0.7, UMBRAL_SUGERIDA:0.3,
                VENTANA_DIAS:5, TOL_MONTO:0.01, journal_id:61, CANARY_MAX:20 }}];
```

**B2 — muestra de 5 conciliaciones `origen:'auto'` verificadas una por una** (las más recientes, CBAUTO del 2026-08-08). Las 3 capas cuadran: línea `is_reconciled=true` + residual 0; `aml` del bill `reconciled=true` + `full_reconcile_id` poblado + cuenta **17 `201.01.01`**; `account.move` `payment_state="paid"` + `state="posted"`. Comercio ↔ partner coherente en los 5, monto exacto, mismo día:

| line_id | payment_ref (línea) | monto | bill_aml | move | partner | amount_total | full_reconcile | payment_state |
|---|---|---|---|---|---|---|---|---|
| 32551 | `[Tarjeta gastos ****4548] Europcar` | −3,511.33 | 203791 | 61022 BILL3190 | EUROPCAR (2339) | 3,511.33 | 8998 | paid |
| 32552 | `[Felipe Pérez ****4666] Airbnb` | −1,288.41 | 203785 | 61020 BILL3189 | AIRBNB (2065) | 1,288.41 | 9000 | paid |
| 32553 | `[Felipe Pérez ****4666] Airbnb` | −944.24 | 203757 | 61011 BILL3182 | AIRBNB (2065) | 944.24 | 9002 | paid |
| 32556 | `[Felipe Pérez ****4666] Viva Aerobus Apo Mex` | −2,014.92 | 203754 | 61010 BILL3181 | Viva Aerobus (1850) | 2,014.92 | 9004 | paid |
| 32558 | `[Felipe Pérez ****4666] Birlos` | −1,819.83 | 203751 | 61009 BILL3180 | BIRLOS Y TORNILLOS (1341) | 1,819.83 | 9006 | paid |

**D3 — branches / PRs:** `gh pr list --state open` → `[]` (**cero PRs abiertos**). Sin ramas remotas pendientes de este frente; las 3 remotas vivas (`feat/carga-mo-panel-dryrun`, `docs/carga-mo-shas-quirk`, `feat/carga-mo-ui-etiquetas`) son de Carga MO, ya mergeadas a main. **2 archivos sin trackear** en el working tree: `docs/jeeves-mcp-tools.md` y `docs/mockup-finanzas-bancos.html`.

**D4 — auditoría de secretos en `finanzas/`:** limpia. Único endpoint hardcodeado es la base pública de n8n (`https://primary-production-5c3c.up.railway.app` en `js/auth-fin.js:11` y `js/fin-client.js:14`). Cero API keys, cero tokens, cero secretos HMAC. El password viaja por `body` desde el form de login, como está diseñado.

**C1/C4 — las tres cifras juntas:**
| Cifra | Valor | Fuente |
|---|---|---|
| Crédito disponible Jeeves (hoy) | $183,656.93 MXN | `list_accounts`, `jeeves-pay-credit` |
| Cierre real de tarjeta, julio 2026 | **−$21,014.03** | statement 373172, `status: completed` |
| Saldo contable Odoo cuenta 223 (posted) | **−$1,514,701.21** | `aggregate_records`, company 1 |
| Porción `Manual: BILL` de esa cuenta | **−$1,256,865.87** (83.0%) | `aggregate_records` por `account_id` |
