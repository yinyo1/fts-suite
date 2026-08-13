# Bancos · Panel de fuentes — comportamiento, layout y decisiones

> 2026-08-12 · Sesión de rediseño v0.5.16. Todo lo de aquí es **read-only verificado contra Odoo**
> en la misma sesión (ids, crons y vistas leídos, no citados de memoria). Nada construido todavía.

---

## 1. Qué hace hoy el botón "Sync Now", por fuente

| Fuente | Journal | Botón hoy | Qué dispara realmente |
|---|---|---|---|
| **Jeeves Tarjeta Credito** | 61 | `⟳ Sync Now` **real** | `POST /webhook/captura-jeeves/run` → workflow `captura-jeeves` (`PWEiA37CLfP6lMgg`), `origen:'manual'`, escribe marcador `[[CBRUN]]` al chatter del journal. Resultado **síncrono y verificable**. |
| **Chase BUS COMPLETE CHK** | 122 | *(v0.5.15: ninguno)* | Nada. Lo sincroniza Odoo/Plaid. |
| **Chase Ink Unlimited 9207** | 123 | *(v0.5.15: ninguno)* | Nada. Lo sincroniza Odoo/Plaid. |

En v0.5.15 se quitó de los Chase el botón simulado que quedaba del mock: su handler
toasteaba `Sync … terminado — 0 nuevas · 0 duplicadas`, un resultado **inventado**. Con Jeeves
como única fuente nunca se vio; al entrar Chase habría sido mentirle al operador sobre
producción. Hoy muestran la leyenda *"Sin sync manual: esta fuente la sincroniza Odoo."*

### Cadencia nativa de Odoo (leída de `ir.cron`)

| Cron | Código | Cada | Próxima corrida |
|---|---|---|---|
| `Account: Journal online sync` (id 37) | `_cron_fetch_online_transactions()` | **12 h** | `2026-08-13T15:15:35Z` (= 09:15 CST) |
| `Account: Journal online Waiting Synchronization` (id 99) | `_cron_fetch_waiting_online_transactions()` | **5 min** | `2026-08-13T05:54:45Z` |
| `Account: Journal online sync cleanup` (id 101) | `_cron_delete_unused_connection()` | 1 día | — |

**Las 2×/día quedan confirmadas** por el cron de 12 h.

### Estado real de la conexión

```
account.online.link  id 9  "Chase"   state=connected  auto_sync=true
                     last_refresh = 2026-08-13T04:20:43Z  (= 2026-08-12 22:20 CST)
                     company_id = 6 (FTS FULL TECHNOLOGY SYSTEMS LLC)

account.online.account id 2  "BUS COMPLETE CHK"  journal_ids=[122]  fetching_status=done  balance=190,015.30  last_sync=2026-08-11
account.online.account id 3  "J. CALDERON"       journal_ids=[123]  fetching_status=done  balance=  2,190.41  last_sync=2026-08-11

account.journal 123  account_online_account_id = [3,"J. CALDERON"]  write_date = 2026-08-13T04:20:43Z (= 2026-08-12 22:20 CST)
```

> **Nota al watchdog:** el `[[CBWATCH]]` de las 18:16 CST reportó `no_vinculadas:["J. CALDERON"]`.
> El `write_date` del journal 123 fecha la vinculación a las **22:20 CST**, cuatro horas *después*.
> El watchdog **tenía razón cuando corrió** — no es falso positivo, y la corrida de mañana 08:15
> debería salir con `no_vinculadas: []`.

---

## 2. ¿Se puede disparar el fetch de Odoo por RPC?

**Sí.** Método verificado leyendo el `arch_db` de la vista real (`ir.ui.view` id 3538,
`account.online.link.form`), no de memoria:

```xml
<button name="action_fetch_transactions" string="Fetch Transactions" type="object"
        groups="account.group_account_basic"
        invisible="state == 'disconnected' or not show_sync_actions"/>
```

`type="object"` ⇒ es un método Python invocable por RPC:

```
execute_kw('account.online.link', 'action_fetch_transactions', [[9]])
```

Otros botones del mismo header: `action_update_credentials`, `action_reconnect_account`,
`action_new_synchronization`. Y en la lista de cuentas: `action_reset_fetching_status`
(**el "Reset" que no hay que tocar sobre BUS COMPLETE CHK**).

Condiciones que hoy se cumplen: grupo `account.group_account_basic`, y `state != 'disconnected'`
(el link 9 está `connected`).

### Pero es asíncrono, y ahora sabemos exactamente por qué

`account.online.account.fetching_status` es un `selection` **almacenado** con estados:

```
planned → waiting → processing → done
```

Los ~5 minutos en `waiting` que observaste **no son lentitud de Plaid**: son el cron
`_cron_fetch_waiting_online_transactions()`, que corre **cada 5 minutos** y es quien recoge
las cuentas en `waiting` y termina el trabajo. O sea: el disparo encola, y otro proceso lo
cierra hasta 5 minutos después.

**Consecuencia para un botón:** `action_fetch_transactions` no puede devolver "listo".
Saber cuándo terminó exige **polling sobre `fetching_status`** hasta `done` (o vigilar
`last_refresh` del link), con un timeout. No hay callback ni webhook.

---

## 3. Lectura y recomendación — "Sync Now" vs "Actualizar vista"

**Coincido contigo: para Chase el botón debe decir "Actualizar vista", no "Sync Now".**
Tres razones, en orden de peso:

1. **Un "Sync Now" asíncrono reproduce el anti-patrón ya prohibido en este código.** El
   Hallazgo #15 (`CLAUDE.md`) lo dice sin ambigüedad: *"UI que muestra éxito antes de confirmar
   el backend = el bug más grave (silent corruption)"*. Un botón que se apaga y dice "listo"
   cuando el fetch sigue en `waiting` es exactamente eso.
2. **El cuello de botella no es Odoo, es el banco.** Odoo ya jala 2×/día y tiene un cron de
   rescate cada 5 min. Lo que hace que un cargo no esté es el rezago de liquidación del emisor
   (días), no la frecuencia de polling. Forzar un fetch casi nunca trae algo que las 12 h no
   fueran a traer.
3. **El problema real del panel es la frescura de la VISTA, no la del dato.** Hoy, para ver lo
   que Odoo ya bajó, hay que recargar la página entera. "Actualizar vista" (re-consultar
   `captura-status` + `captura-transacciones`) es instantáneo, honesto y **siempre** útil.

### Dónde matizo

No cerraría la puerta al fetch real, pero como **acción secundaria y explícita**, nunca como
el botón principal:

- Etiqueta del tipo **"Pedir datos al banco"**, que al dispararse diga *"Solicitud enviada —
  Odoo la completa en ~5 min"* y **deje el estado visible** (`fetching_status`), en vez de un
  spinner que finge terminar.
- Requiere un **workflow n8n** (el MCP de Odoo es read-only, UID 2) que llame
  `action_fetch_transactions` y luego exponga `fetching_status` para que el front lo consulte.
- **No verificado:** si Odoo cobra créditos IAP o impone rate-limit por fetch manual. Antes de
  construirlo hay que averiguarlo — un botón que se pueda apretar 40 veces al día sin saber su
  costo es un riesgo abierto.

**Propuesta de alcance:** fase 1 solo "Actualizar vista" (cero riesgo, cero dependencia nueva).
El fetch real queda apuntado aquí, no en el backlog mental.

### 📌 BACKLOG — "Pedir datos al banco" para Chase · **NO construir hasta cerrar (a) y (b)**

> Decidido 2026-08-13 con Esteban. Estado: **documentado, no construido.** Mientras tanto los
> journals Chase muestran el mensaje honesto *"Sin sync manual: esta fuente la sincroniza Odoo."*

**(a) ¿Odoo cobra créditos IAP o limita el fetch manual?** — **hay que saberlo ANTES de exponer
el botón.** Un control que se pueda apretar 40 veces al día sin conocer su costo es un riesgo
abierto: puede consumir créditos de la suscripción o hacer que Plaid corte por rate-limit y deje
la conexión en `error`. Cómo cerrarla: revisar el consumo IAP de la base y/o la documentación de
la suscripción de bank sync; si hay cuota, el botón necesita su propio límite (p. ej. 1 disparo
cada N minutos, con el candado del lado del server, no del front).

**(b) ¿El polling sobre `fetching_status` vale la complejidad?** — el cuello de botella es el
**banco** (rezago de liquidación de días), no Odoo (12 h + cron de rescate cada 5 min). Un fetch
forzado casi nunca adelanta algo que el cron no fuera a traer. La complejidad no es solo el
polling: es que **sin él, el botón mentiría** (Hallazgo #15). Si (b) se responde "no vale", la
conclusión correcta no es hacerlo mal, es **no hacerlo**.

**Si ambas se responden a favor**, la forma mínima honesta es:
- workflow n8n que llame `execute_kw('account.online.link','action_fetch_transactions',[[9]])`
  (el MCP de Odoo es read-only, UID 2 — no puede hacerlo);
- respuesta inmediata *"Solicitud enviada — Odoo la completa en ~5 min"*, **nunca** un spinner
  que finge terminar;
- el `fetching_status` (`planned/waiting/processing/done`) visible en la tarjeta como estado,
  no como carga bloqueante.

---

## 4. Layout de fuentes (cambio #1 y #2)

Mockup navegable con datos reales: **`docs/mockup-fuentes-v0516.html`**
(`http://localhost:8080/docs/mockup-fuentes-v0516.html`).

- **Antes:** 2 encabezados (`FTS MEX` / `FTS USA`) + N barras a todo el ancho.
- **Después:** un encabezado *"Instrumentos sincronizados"* + rejilla
  `repeat(auto-fill, minmax(258px, 1fr))`, cuadros colapsados por default, país como etiqueta
  dentro del cuadro. El **monto sin conciliar es visible sin abrir nada**; el detalle (método,
  último run, schedule/countdown, botón) se abre al clic dentro del propio cuadro.
- **Orden nuevo:** Instrumentos → **Semáforo** → Transacciones → Hoy → En tránsito → Corridas.
- El argumento de escala: el mock del módulo contempla **9 fuentes** (BBVA ×3, Payana, Monex ×2).
  Una rejilla las absorbe en 3 filas; la lista vertical actual serían 9 franjas.

---

## 5. Modo Demo — qué se pierde al quitarlo (cambio #3)

### Se pierde de verdad

1. **El gate obligatorio de render deja de funcionar.** `scripts/local/smoke-front.js` monta el
   módulo con `FinState.getMode → 'demo'` y un stub del `fetch` global. La ruta Real no usa
   `fetch` directo sino `window.FinClient.call`. Si se borra la rama demo de `load()`, **el gate
   truena** y hay que reescribir el harness para stubbear `FinClient`. No es difícil, pero va
   en el **mismo** cambio, no después: es la red que atrapó el `ReferenceError` de v0.5.7.
2. **`state.preconc` se queda sin única fuente.** Solo se puebla en demo
   (`state.preconc = data.preconc || {}`). El estado de fila *"Conciliado (En tránsito)"* pasa a
   ser inalcanzable — **ya lo es en Real** (el comentario de la L154 lo dice: *"hoy vacío en
   real"*), así que operativamente no se pierde nada, pero el código deja de ejercitarse.
3. **La capacidad de enseñar el módulo sin tocar datos de producción.** Pérdida no técnica, real.
4. **El mock es el único artefacto que muestra el estado final con 9 fuentes.** Vale conservar
   el archivo aunque el modo desaparezca de la UI.

### NO se pierde (corrijo dos premisas)

- **`journalList()` no depende del mock.** Su respaldo es `state.allRows` — las filas que ya
  llegaron del server. En Real, si faltara `por_journal`, el fallback sigue funcionando con las
  filas cargadas. El mock solo alimenta la ruta demo.
- **Ya existe una salida honesta cuando n8n no responde.** La rama real tiene `.catch` →
  `state.error` → pantalla `⚠ Error` con el mensaje. Demo **nunca fue** el fallback de caída:
  son datos ficticios, y usarlos como red ante un outage sería peor que el error — pintaría
  dinero falso como si fuera real.
- **La pantalla "Sin datos" ya es casi inalcanzable.** `currentMode()` devuelve `'demo'` en la
  primera visita y `'empty'` **solo** si el usuario lo eligió a propósito. Sin selector, el
  estado deja de existir. Borrarla es seguro.

### Acoplamiento a resolver antes de borrar

`js/router.js:44` pinta en el sidebar un `state-dot` por módulo con `class = FinState.getMode(id)`.
Si este módulo deja de escribir su modo, `getMode` devuelve `'empty'` y **el puntito del sidebar
miente**. Solución de una línea: al montar, `FinState.setMode(MODULE_ID, 'real')`. No hay que
tocar `state.js` ni `router.js` — los comparten `facturas` y `bills`.

### Recomendación

**Quitar la superficie, conservar el camino.** En concreto:

- Fuera: selector de modo, banner DEMO, pantalla "Sin datos", y el arranque en demo
  (`currentMode()` → `'real'` por default).
- Se queda: el archivo `data/mock/instrumentos-pago.mock.json` y la rama demo de `load()`,
  alcanzable solo por consola
  (`localStorage.setItem('fts_fin_mode_instrumentos-pago','demo')`).
- Ganancia: **el gate de render sigue verde sin tocar el harness**, y la demo para capacitación
  sigue existiendo — pero ningún usuario puede caer ahí por accidente, que era el problema.
- A cambio: el `modeToggle()` de este módulo queda muerto y se borra.

La alternativa purista (borrar también la rama demo y reescribir el harness para stubbear
`FinClient`) es más limpia en papel y cuesta ~30 min extra de trabajo con riesgo concentrado
justo en la red de seguridad. Mi voto es la primera; si prefieres la segunda, se hace en el
mismo PR y el gate se valida antes de mergear.

### Lo que sí conviene mejorar

Como Demo deja de ser la salida de emergencia, la pantalla de error debería dejar de ser un
callejón: hoy es un `⚠ Error` con el mensaje crudo y nada más. Le agregaría un **botón
"Reintentar"** que vuelva a llamar `load()`. Ese es el sustituto honesto del "flip a Demo".

---

## 6. Taxonomía de estados v0.5.16 — EN PRODUCCIÓN (aprobada 2026-08-13)

Sustituye el "estado con Odoo" de 5 valores, que mezclaba dos cosas distintas. **Dos ejes:**

**EJE A · TIPO** (qué es el movimiento): `consumo` · `fondeo` · `devolucion` · `traspaso` · `ajuste` · `abono`.
Clasificador idéntico en tres lugares (`fin/captura-status` `tipoMov`, `captura-transacciones` `tipoDe`,
front `rowTipo`). Chase llega sin etiquetas — solo el traspaso es reconocible por texto, y **sus dos
lados casan al centavo**: journal 122 `"Payment to Chase card ending in 9207"` (4 líneas, −$9,419.20)
contra journal 123 `"Payment Thank You-Mobile"` (4 líneas, +$9,419.20). Un positivo sin etiqueta **no**
se declara devolución: eso sería inferir; va a `abono`.

**EJE B · CONCILIACIÓN** (qué falta hacer): `conciliada` · `parcial` · `condoc` · `sindoc` · `noevaluada`.

**El eje "estado en el banco" NO se implementó, y es deliberado.** Tiene un solo valor posible en las
7,786 líneas: `captura-jeeves` solo ingesta `settled` y Plaid no expone pendings ⇒ toda fila es
liquidada por construcción. Un eje de un valor confunde más de lo que informa. Los pendings viven en
la nota de captura y en el acordeón de diagnóstico, que es donde son ciertos.

### Qué murió y por qué
| Estado viejo | Destino |
|---|---|
| `liquidado` | → `conciliada` (+ `parcial` para las 3 líneas con residual ≠ 0) |
| `sinconciliar` | **se partió en 3**: `condoc` (61) · `sindoc` (1,850) · `noevaluada` (473) |
| `fondeo` / `devolucion` | **murieron como estado** → eje TIPO |
| `transito` | **murió**: solo se poblaba en demo (`state.preconc` vacío en real) y su nombre chocaba con "En tránsito" (pendings), que es otra cosa |

---

## 7. El KPI de las tarjetas de fuente — defecto corregido

**Antes:** `sin_conciliar` sumaba `amount_residual` **con signo**. Como los fondeos entran con signo
opuesto al de los consumos, se cancelaban:

| Journal | Consumos pendientes | Fondeos/devoluciones | Lo que mostraba |
|---|---|---|---|
| 61 Jeeves | **+$2,985,255.34** (1,875) | −$2,982,552.81 (36) | **$4,621.09** |
| 122 Chase | +$80,463.11 (310) | −$45,500.78 (12) | $34,962.33 |
| 123 Chase | +$11,999.92 (141) | −$9,809.51 (10) | $2,190.41 |

Jeeves mostraba **$4,621 cuando el trabajo real era ~$2.99M** — tres órdenes de magnitud.

**Ahora:** el protagonista de la tarjeta es `pendiente_consumos` (salidas por casar contra factura),
con su conteo de líneas. El neto sigue visible pero **degradado y con su nombre**
(*"neto con entradas $2,702.53 · 36 fondeos/devoluciones $2,982,552.81"*). El server emite además
`por_tipo` por journal para el desglose completo.

---

## 8. 📌 BACKLOG — el motor no cubre Chase (`journal_id: 61` fijo)

`fin/captura-sugerencias` y `captura-concilia-auto` (y por herencia `fin/concilia-now`) llevan
**`journal_id: 61` como constante** en su nodo `2 - Code config`. Consecuencia medida:
**las 473 líneas de Chase nunca se evalúan.**

Eso es exactamente lo que el estado **`noevaluada`** está diciendo en la UI. La distinción no es
cosmética: pintar "sin documento" afirmaría que se buscó factura y no había — **nadie buscó**.

**Es un frente aparte (ampliar el motor a Chase / Motor AR), no un pendiente de la sesión de UI.**
Lo que habría que resolver ahí, apuntado para cuando se aborde:
- el motor casa contra **bills de proveedor mexicanas** (cuentas 17 y 285); las de FTS USA LLC
  (company 6) son otro universo contable — no basta con cambiar el `journal_id` a una lista;
- Chase es **USD** y el matcher compara montos sin conversión;
- `TOL_MONTO: 0.01` y `VENTANA_DIAS: 5` se calibraron con el patrón de Jeeves, no con el de una
  cuenta de cheques.

---

## 9. 📌 BACKLOG — habilitar "Autoconciliar ahora" (3 cosas)

> Estado 2026-08-13: `fin/concilia-now` (`GYsE6Z8hCAiQE0Vc`) sigue **`active: false`,
> `triggerCount: 0`** — su webhook responde 404. El botón nace `disabled` a propósito.
> **Se deja para el final de la sesión de UI**, cuando ya no se esté iterando contra producción:
> ese botón ESCRIBE a Odoo.

1. **Activar el workflow en la UI de n8n.** Solo Esteban — el API rechaza `activate`.
2. **Escribir el handler en el front.** `EP_CONCILIA_NOW` está declarado pero **no se llama en
   ningún lado**: el botón no está solo deshabilitado, no tiene función detrás.
3. **Decidir si `CANARY_MAX: 20` sigue siendo el cap correcto** tras 33 conciliaciones verificadas
   sin rechazos.

**Verificado que es clon exacto de la nocturna** (`hY6uKxEvs1LLpyf5`): los nodos 1, 3, 4, 5, 6 y 7 son
byte-idénticos; solo difieren `2 - Code config` y `8 - Code ejecutar+log`, y la única divergencia
funcional es `origen:'boton-refresh'` en vez de `'auto'` — que queda trazado en los marcadores
`[[CONCFTS]]` (chatter del bill) y `[[CBAUTO]]` (chatter del journal). Mismos umbrales
(`UMBRAL_PLENO 0.7` / `UMBRAL_SUGERIDA 0.3`), misma ventana (`VENTANA_DIAS 5`), misma tolerancia
(`TOL_MONTO 0.01`), mismo cap (`CANARY_MAX 20`), mismo candado séptuple y mismo auto-revert.

⚠️ **Deuda de sincronía:** al ser clon, **todo edit a la nocturna debe replicarse aquí a mano.**

---

## 10. Motor v2 sobre Jeeves — **DESCARTADO** (Gate 1, 2026-08-13)

> Diagnóstico read-only antes de construir. Las tres cegueras que motivaban v2 resultaron cerradas
> por razones distintas, y **ninguna se abre tocando el matcher**. Queda escrito para que no se
> reproponga.

### La 285 NO es otra cuenta mexicana

```
17   201.01.01 Proveedores nacionales   liability_payable   company 1  SERVICIOS FTS (México)
285  (sin code) Account Payable         liability_payable   company 6  FTS USA LLC
```

Los 22 bills abiertos de la 285 son `company_id: 6` en el **100%**, 21 de 22 en **USD**, con
proveedores estadounidenses (Harbor Freight, Ferguson, HOME DEPOT U.S.A., Lowe's, Alameda Electrical).

**Jeeves es journal 61, company 1, MXN. Odoo no concilia entre compañías.** Agregar la 285 al motor
de Jeeves no es bajo rendimiento: es **estructuralmente imposible**. El `reconcile` los rechazaría.

### Las notas de crédito ya estaban en alcance — no existen

El nodo 5 del motor ya filtra `move_type in ['in_invoice','in_refund']`. Pero de los **146** bills
abiertos en la 17, **los 146 son `in_invoice`**, y en todo 2026 hay **una sola** `in_refund` en el
sistema entero, **cancelada**. Las 19 devoluciones no pueden casar contra notas de crédito porque
**FTS no las usa**.

### La señal "comprador" no tiene contraparte

Jeeves expone `source.name` y `source.detail`, pero **no al 100%**: las transacciones `ADJUSTMENT`
traen `source: {}` vacío. Y del lado del bill hay **cero campos** con relación a `hr.employee` en
`account.move` / `account.move.line` — de 104 campos Studio, ninguno representa a quien compró. El
`partner_id` es el **proveedor**: en una compra de Felipe en Oxxo, el partner es Oxxo.

La jerarquía monto→fecha→comprador **no se puede construir**: el tercer eslabón no tiene con qué
comparar. Habilitarla exige crear **y poblar** un campo en la captura de bills — cambio de proceso,
no de matcher.

### El techo no lo pone el pool

**146 bills abiertos contra 1,886 líneas sin conciliar.** No se concilia contra un documento que no
existe: el techo del motor **no es 1,886, es ~146**. Eso reencuadra el "2.1% conciliado" — el
denominador estaba mal.

---

## 11. Dos frentes separados que salieron del Gate 1

### 11.1 · Aflojar umbrales en Jeeves — el único lever real

`VENTANA_DIAS: 5` y `TOL_MONTO: 0.01` se calibraron con el patrón de Jeeves y son estrictos.
**Medir cuántos candidatos aparecen sobre los 146 bills con `VENTANA_DIAS 15` y `TOL_MONTO ±$1`.**
Es barato (read-only, un cruce) y es lo único que puede mover la aguja del lado de Jeeves.
Hoy el CBAUTO reporta `sugeridas: 61` y `sin_documento: 1850` con los umbrales actuales.

### 11.2 · Los 1,029 cargos menores a $500 — decisión contable, NO backlog

**1,029 de las 1,886 líneas sin conciliar son cargos de menos de $500** (suman $224,752). Son
compras de mostrador — Oxxo, Uber, 7 Eleven — para las que **nadie levanta factura de proveedor**.

**No son backlog de conciliación: son una decisión contable pendiente.** Mientras sigan contándose
como pendientes, inflan el denominador y hacen ver al motor peor de lo que está. El motor no puede
cerrarlas por diseño, no por ceguera.

---

## 12. Motor de Chase — Gate 2: **el techo son 5 bills** (2026-08-13)

La geometría era la correcta —285 (22 bills, USD, company 6) ↔ journals 122/123 (473 líneas, USD,
company 6), misma empresa, misma moneda, pool virgen—. **Pero el volumen no da.**

Cruce de los 22 montos de bills contra las 473 líneas de Chase:

| Bill | Monto | Línea Chase | Δ días | ¿Real? |
|---|---|---|---|---|
| Harbor Freight Tools USA | 431.90 | `Harbor Freight Tools` | **8** | ✓ |
| Alameda Electrical Distributors | 589.08 | `ALAMEDA ELECTRICAL DI CA` | **7** | ✓ |
| Consolidated Electrical Distributors | 731.24 | `(PC) 8850 CED CA` | **7** | ✓ (CED = la abreviatura) |
| FTS LLC (reembolso intercompañía) | 16.43 | `Jack in the Box` | **0** | ✓ |
| Medecins Sans Frontieres USA | 215.98 | `FRONTIER AI DCJI5S CO` | 4 | ✗ **coincidencia de monto** |

**5 de 22, y uno es falso.** Los otros 17 bills no tienen contraparte de monto exacto en el feed.

### Y con las tolerancias de Jeeves encontraría 1, no 5

**Tres de los cuatro matches reales exceden `VENTANA_DIAS: 5`** (7, 7 y 8 días). El bill de Chase se
captura ~una semana después del cargo. Con los umbrales actuales el motor vería **solo el de
Jack in the Box** (Δ 0) y el falso positivo de Frontier (Δ 4).

### El nombre tampoco salva

Normalizando, de los 5: `Harbor Freight Tools` casa bien, `ALAMEDA ELECTRICAL DI` casa por prefijo,
pero **`(PC) 8850 CED CA` no casa con `Consolidated Electrical Distributors`** (CED es abreviatura),
**`Jack in the Box` no casa con `FTS FULL TECHNOLOGY SYSTEMS LLC`** (bill intercompañía), y
**`FRONTIER AI` sí se parece a `Medecins Sans Frontieres`** — o sea, la señal de nombre ayuda en 2 de
5 y **engaña activamente en 1**.

### Moneda y traspasos

- **Sí hay un bill en MXN dentro de la 285**: UBER $500 (`move_id` 57987, `currency_id` 33 MXN,
  `company_id` 6). No casó con nada. Un matcher para Chase tendría que excluirlo o convertir.
- Los **4 traspasos internos** (−$9,419.20 entre 122 y 123) **no casan con ningún monto de bill**, así
  que hoy no contaminarían. Aun así, un motor de Chase debería excluirlos explícitamente por tipo
  (`traspaso`), no confiar en que no coincidan.

### Veredicto

**No se construye.** Mismo criterio que con v2 sobre Jeeves: un motor cuyo techo son 4 conciliaciones
reales —y que con tolerancias calibradas encontraría 1— no paga su complejidad, su superficie de
error ni su mantenimiento. La geometría es correcta; **el volumen no existe todavía**.

**Cuándo reconsiderarlo:** cuando la 285 tenga volumen sostenido (≫22 bills abiertos) y el rezago de
captura de bills se mida y se estabilice. El número a vigilar es simplemente **cuántos bills abiertos
tiene la 285**; hoy son 22.
