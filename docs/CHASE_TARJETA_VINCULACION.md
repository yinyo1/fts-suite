# Vincular la tarjeta de crédito Chase (FTS USA LLC) — diagnóstico, propuesta y resultado
**2026-08-13** · Company 6 = FTS FULL TECHNOLOGY SYSTEMS LLC. El journal de cheques **122 `BUS COMPLETE CHK` no se tocó**.

> ## ✅ EJECUTADO — la tarjeta está vinculada y sincronizando
>
> **Journal 123 `Chase Ink Unlimited 9207` (BNK3) · cuenta 1558 `liability_credit_card` · 151 líneas · suma −2,190.41**
> El total **cuadra exacto** con el saldo que muestra la app de Chase. `bank_statements_source: online_sync` escrito por OdooBot a las 04:20:43.
>
> Resultado completo en la sección **[Resultado de la vinculación](#resultado-de-la-vinculación-2026-08-13)** al final.
> **Dos hallazgos que cambian el alcance de lo que se puede hacer con esta tarjeta — léelos antes de planear nada encima.**

---

## PASO 1 — Diagnóstico

### 1.1 Estado actual del vínculo Plaid

`account.online.link` (2 registros; el modelo `account.online.account` **no tiene campo `active`**, así que estos 2 son el universo completo):

| id | name | state | provider | auto_sync | has_unlinked_accounts | accounts | journals | create_date |
|---|---|---|---|---|---|---|---|---|
| **9** | Chase | **connected** | plaid | true | **true** | [2, 3] | [122] | 2026-08-09T21:29:44Z |
| 10 | *(false)* | **disconnected** | *(false)* | true | true | [] | [] | 2026-08-10T16:08:00Z |

`link 9`: `last_refresh 2026-08-12T15:15:51Z` · `next_refresh 2026-08-13T03:15:35Z` · `expiring_synchronization_date: false` (sin fecha de expiración marcada).
`link 10` es un **huérfano** de un intento fallido del 10-ago: sin nombre, sin provider, sin cuentas, sin journals. No estorba, pero ensucia el diagnóstico.

`account.online.account`:

| id | name | online_identifier | balance | available_balance | last_sync | journal_ids | fetching_status | currency |
|---|---|---|---|---|---|---|---|---|
| 2 | BUS COMPLETE CHK | `6Y9a173g…qg4K` | 191,224.36 | 189,946.61 | 2026-08-10 | **[122]** | done | USD |
| **3** | **J. CALDERON** | `LALwgYOe…bn4` | **125.77** | **1,225.96** | **false** | **[]** | false | USD |

> ✅ **Confirmado: la cuenta 3 sigue sin vincular.** `journal_ids: []`, `last_sync: false`, `fetching_status: false`. Y `has_unlinked_accounts: true` en el link es la confirmación legible por máquina de que Plaid ya la ofrece dentro del consentimiento vigente. **Incorporarla es vincular, no re-autorizar.**

⚠️ **Odoo NO expone tipo/subtipo ni últimos dígitos.** `account_number: ""` y `account_data: false` en ambas cuentas. Los únicos identificadores disponibles son el nombre (`J. CALDERON`) y las cifras de saldo. **Esto importa — ver el riesgo R-1 abajo.**

### 1.2 Qué hizo Odoo al vincular la de cheques — la cronología predice el comportamiento

| Hora (2026-08-09) | Evento | `create_uid` |
|---|---|---|
| 21:29:44 | se crea `account.online.link` 9 "Chase" | Esteban |
| 21:31:43 | se crean **AMBAS** cuentas, 2 y 3 (mismo segundo) | Esteban |
| 21:31:56 | se crea el **journal 122** (13 s después) | Esteban |

Y para contraste, el journal 73 `JP Morgan Chase USD` fue creado por **OdooBot** el 2024-01-09 — es parte del plan de cuentas original de la company, no del flujo Plaid.

**Lectura:** Plaid devolvió las **dos** cuentas al completar el consentimiento (21:31:43), pero solo se creó **un** journal — el de la cuenta que se eligió vincular. `create_uid: Esteban` no significa creación manual: significa creación **dentro de su sesión de UI**, que es como se comporta el asistente de vinculación. Los 13 segundos son consistentes con el wizard, no con crear un journal a mano.

**Predicción para la cuenta 3:** el mismo asistente ofrecerá crear un journal. Y aquí está lo que hay que interceptar:

> ⚠️ **El asistente creó también la cuenta contable `1557 BUS COMPLETE CHK` con `account_type: asset_cash`.** Para una cuenta de cheques es correcto. **Para una tarjeta de crédito es incorrecto** — una tarjeta es pasivo, no activo bancario. Si se deja al wizard por su cuenta, va a crear otra `asset_cash` y la contabilidad nace mal desde el origen.

### 1.3 Plan de cuentas de company 6 — no hay cuenta apta

La company 6 tiene **44 cuentas** y **ninguna usa `code`** (todas `code: false`). Candidatas de pasivo:

| id | name | account_type | reconcile | ¿Sirve como default de tarjeta? |
|---|---|---|---|---|
| 284 | Current Liabilities | liability_current | false | genérica, es el contenedor |
| 285 | Account Payable | liability_payable | true | **no** — reservada a proveedores, la usan los bills |
| 286 | Bills to receive | liability_current | true | **no** — propósito definido |
| 287 | Tax Received | liability_current | false | **no** |
| 288 | Tax Payable | liability_current | false | **no** |
| 289 | Non-current Liabilities | liability_non_current | false | **no** — no es de corto plazo |

**Veredicto: hay que crear una cuenta nueva.**

Dos datos de contexto para la decisión del tipo:

- **`liability_credit_card` no lo usa ninguna cuenta en toda la instancia.** Conteo por `account_type` sobre las 1,514 cuentas de todas las companies: aparecen `liability_current` (179), `liability_non_current` (100), `liability_payable` (14) — pero **cero** `liability_credit_card`. No pude verificar por MCP si la opción existe en el desplegable de esta versión; **hay que mirarlo en la UI** (es un vistazo).
- **Precedente interno:** la tarjeta Jeeves de MX, cuenta **223 `102.01.007 Jeeves Tarjeta Credito`**, está como **`asset_cash`** — el mismo patrón que el wizard aplicaría. Es decir: si se replica el precedente, queda consistente con MX; si se corrige a pasivo, queda contablemente mejor pero distinto de MX.

### 1.4 Ventana de historial de Plaid — se consume una sola vez

| Dato | Valor |
|---|---|
| Link creado | 2026-08-09 |
| Statement lines del journal 122 | 312 |
| Fecha mínima | **2026-05-09** |
| Fecha máxima | 2026-08-10 |
| **Retroactividad entregada** | **92 días** |

Es el backfill estándar de ~90 días de Plaid Transactions.

> 🕐 **El costo del retraso es lineal y permanente.** Vinculando hoy (2026-08-13) Plaid entregaría desde ~**2026-05-15**. Cada día que pasa se pierde un día de historial por la cola, y **no se recupera**: si se vincula, se borra el journal y se re-vincula, Plaid entrega desde 90 días antes de *ese* momento, no del original. Desde que se creó el link ya se perdieron ~4 días de cola.

---

## PASO 2 — Propuesta (NO ejecutada, requiere aprobación)

### Ruta A — recomendada: crear la cuenta de pasivo ANTES de vincular

**Paso A1 — crear la cuenta contable (UI de Odoo, company 6).**

| Campo | Valor propuesto | Por qué |
|---|---|---|
| name | `Chase Credit Card — J. CALDERON` | identificable; ajústalo a tu gusto |
| account_type | **`liability_credit_card`** si el desplegable lo ofrece; si no, **`liability_current`** | una tarjeta es pasivo. Ver la disyuntiva con el precedente de MX abajo |
| code | *(vacío)* | company 6 no usa códigos en ninguna de sus 44 cuentas |
| reconcile | **false** | igual que 1557 y 223: la conciliación va por statement line, no por apunte |
| currency | *(vacío)* | usa la de la company (USD), igual que 1557 |

**Paso A2 — vincular la cuenta 3** desde *Contabilidad → Configuración → Sincronización bancaria → Chase*, usando la acción de vincular cuentas pendientes (aparece porque `has_unlinked_accounts: true`).

En el asistente, cuando pida journal: **crear uno nuevo**. Y **acto seguido, antes de que entren líneas**, corregir en el journal:
- `default_account_id` → la cuenta del paso A1 *(el wizard va a poner una `asset_cash` nueva; esto es lo que hay que interceptar)*
- `suspense_account_id` → **309 `Bank Suspense Account`** (el mismo que usa el 122)
- verificar `bank_statements_source: online_sync`

**Paso A3 — verificación post-vinculación (read-only, la hago yo):**
- journal nuevo con `default_account_id` = la cuenta de pasivo y `suspense_account_id: 309`
- `account.online.account` id 3 con `journal_ids` poblado y `last_sync` con fecha real
- rango de statement lines: mínimo ≈ hoy − 90 días
- `has_unlinked_accounts` del link 9 debería pasar a **false**
- el watchdog dejará de reportar *"ofrecida por Plaid, NO vinculada"* en su CBWATCH
- **signo de los importes** — ver R-4

### Ruta B — dejar que el wizard cree todo y corregir después

Más simple de ejecutar, pero abre una ventana en la que las líneas entran contra una cuenta de **activo**. Si además se concilian en ese lapso, cambiar el tipo después es más engorroso. **No la recomiendo** habiendo margen para hacer A1 primero.

### La disyuntiva que te toca decidir

| Opción | Pro | Contra |
|---|---|---|
| `liability_credit_card` (o `liability_current`) | contablemente correcto: la tarjeta es pasivo | queda **distinta** del precedente MX (Jeeves 223 es `asset_cash`) |
| `asset_cash`, como el wizard y como MX | consistente con Jeeves; los reportes que ya existan tratan ambas igual | perpetúa una clasificación incorrecta en una company que apenas arranca |

Mi recomendación: **pasivo**. La company 6 tiene 44 cuentas y prácticamente nada de historia — es el momento barato para hacerlo bien. Corregir Jeeves MX después es otro frente, y no bloquea este.

---

## Riesgos

### R-1 · ¿Es la tarjeta correcta? — **verificar en chase.com ANTES de vincular** 🔴

`balance: 125.77` y `available_balance: 1,225.96` implican un límite de **~$1,352 USD**. Si de verdad hay tarjetas adicionales para los ingenieros de campo, ese límite parece bajo para ese uso.

Dos lecturas posibles: (a) es una tarjeta distinta a la que tienes en mente; (b) Plaid reporta solo una parte del arreglo. **Odoo no puede desempatarlo**: `account_number: ""` y `account_data: false`, así que no hay últimos-4 ni tipo/subtipo que comparar.

**Es el único riesgo que puede hacernos montar contabilidad sobre el objeto equivocado.** Confirma en el portal el número y el límite de la tarjeta rotulada "J. CALDERON" antes de dar el paso A2.

### R-2 · ¿Afecta el sync de cheques? — improbable, pero es el riesgo real del paso

Ambas cuentas cuelgan del **mismo link 9**, que está `connected` con `last_refresh` de hoy y `expiring_synchronization_date: false` — el token está vivo y sin expiración marcada. Vincular una segunda cuenta **no debería** re-negociar el consentimiento, porque las dos ya están dentro de `account_online_account_ids`.

⚠️ Pero **si el flujo de Odoo reabre Plaid Link**, podría pedir credenciales de nuevo. Eso solo se sabe al hacerlo, y es lo único de este procedimiento que podría tocar el sync del journal 122. Si pasa: completar la re-autenticación, no abandonarla a medias.

### R-3 · ¿Duplica líneas? — no

La cuenta 3 no tiene journal, así que **no tiene ni una línea**. El journal 122 no se toca. Y Plaid dedupe por `online_transaction_identifier`, que está poblado en las 312 líneas existentes y es único por transacción.

### R-4 · Signo de los importes en tarjeta de crédito

`account.online.account` tiene `inverse_balance_sign` e `inverse_transaction_sign`, ambos en **`false`** para las cuentas 2 y 3. En una tarjeta de crédito los cargos pueden llegar con signo invertido respecto a una cuenta de banco.

**Verificar en el primer lote:** un consumo debe quedar como **negativo** en la statement line (igual que Jeeves). Si llega al revés, esos dos booleanos son el interruptor — pero hay que revisarlos **antes** de conciliar nada.

### Lo que NO se puede deshacer

- **La ventana de 90 días de Plaid.** Se consume una vez. Borrar el journal y re-vincular no recupera el historial anterior.
- Las statement lines que se concilien. Desconciliar es posible pero deja rastro y trabajo.

*(El link 10 huérfano se puede borrar sin consecuencia — no tiene cuentas ni journals. No es urgente, pero conviene para que no confunda diagnósticos futuros.)*

---

## PASO 3 — Atribución por portador: la primera verificación después de vincular

**No es respondible hoy.** La cuenta 3 no tiene ni una línea, así que no hay dato que inspeccionar. Lo del recon anterior (15 líneas con `narration`, `ref`, `online_partner_information` y `account_number` todos en `false`) era del journal **122, la cuenta de cheques** — donde el concepto de "tarjeta adicional" ni siquiera aplica.

**Método, para ejecutar en cuanto haya líneas reales:**

1. Traer una muestra de 15 líneas del journal nuevo con **todos** los campos de texto en crudo: `payment_ref`, `narration`, `ref`, `partner_name`, `online_partner_information`, `online_transaction_identifier`, `transaction_type`, `account_number`.
2. Buscar en ellos: últimos-4 de tarjeta, nombre de portador (`cardholder`), o cualquier discriminante por persona.
3. Contrastar con Jeeves, donde **sí** funciona: cada transacción trae `source.name` (portador) y `source.detail` (últimos-4) — por eso Motor v2 puede usar "comprador" como señal ahí.

**Veredicto binario a producir:** si el feed de Plaid trae portador → la tarjeta Chase es el gemelo real de Jeeves y el mismo motor aplica. Si no lo trae → es un límite del proveedor, y la atribución por ingeniero tendría que venir de otra vía (estado de cuenta en papel, o captura manual). **Ese veredicto decide si esta tarjeta puede entrar al mismo pipeline o necesita uno distinto.**

---

## Resumen para decidir

| Pregunta | Respuesta |
|---|---|
| ¿Hay que re-autorizar Plaid? | **No.** La cuenta ya está en el consentimiento (`has_unlinked_accounts: true`) |
| ¿Odoo crea el journal solo? | **Sí**, dentro del asistente — pero con cuenta `asset_cash`, que es lo que hay que interceptar |
| ¿Hay cuenta de pasivo apta? | **No.** Hay que crearla |
| ¿Cuánto historial se recupera? | **~90 días.** Hoy: desde ~2026-05-15. Se pierde 1 día por cada día de retraso |
| ¿Qué es irreversible? | La ventana de 90 días |
| ¿Riesgo mayor? | **R-1**: confirmar en chase.com que "J. CALDERON" es la tarjeta que crees (límite implícito ~$1,352 USD) |
| ¿Se puede atribuir por ingeniero? | **Indeterminable hasta vincular.** Es la primera verificación post-vinculación |

---

# Resultado de la vinculación (2026-08-13)

## Infraestructura creada

| Objeto | id | Detalle |
|---|---|---|
| Cuenta contable | **1558** | `Chase Ink Unlimited ****9207` · código 212000 · **`liability_credit_card`** · USD · `reconcile: false` · **activa** |
| Journal | **123** | `Chase Ink Unlimited 9207` · BNK3 · type bank · default_account **1558** · suspense **309** |
| Cuenta huérfana | 1559 | `asset_cash` que Odoo auto-creó al crear el journal · **archivada** (`active: false`) ✓ |

La recomendación de usar **pasivo** se aplicó: `liability_credit_card` sí existe en el desplegable de esta versión. Queda **distinta del precedente MX** (Jeeves 223 sigue como `asset_cash`) — decisión consciente.

## Cronología — el journal vacío no era un fallo, era cronología

| Hora (UTC) | Evento | Prueba |
|---|---|---|
| 01:45:26 | se crea el journal 123 | `create_date` |
| 03:15:56 | ciclo automático → 10 líneas al **122** | `connection_state_details: {"122": {…}}` |
| **04:10:51** | se asigna el journal 123 a la cuenta 3 | `account.online.account` id 3 → `journal_ids: [123]` |
| 04:15:31 | `Fetch Transactions` → cuenta 2 `done`, **cuenta 3 `waiting`** | `fetching_status` |
| **04:20:43** | completa el pull de la tarjeta | `bank_statements_source` → `online_sync`, `write_uid: OdooBot` |

> El ciclo de las 03:15 corrió **55 minutos antes** de que existiera el vínculo, así que la cuenta 3 quedó fuera: **el fetch es por cuenta vinculada al momento de correr**.
>
> Y `fetching_status: "waiting"` **no es error**: es el estado mientras Plaid hace el pull inicial de una cuenta *enumerada* en el consentimiento pero nunca *activada* para Transactions. Tardó ~5 min. Diagnosticarlo como falla habría llevado a rehacer el Link sin necesidad.

## 1 · Backfill — **75 días, no los 92 esperados**

| | Journal 122 (cheques) | Journal 123 (tarjeta) |
|---|---|---|
| Fecha del pull | 2026-08-09 | 2026-08-13 |
| `date:min` | 2026-05-09 | **2026-05-30** |
| `date:max` | 2026-08-11 | 2026-08-11 |
| Retroactividad | **92 días** | **75 días** |
| Líneas | 322 | **151** |
| Suma | −34,962.33 | **−2,190.41** ← cuadra exacto con la app de Chase |

Se esperaba desde ~2026-05-13 y llegó desde **2026-05-30**: **17 días menos**. Dos lecturas, y **no se distinguen desde Odoo**:

- **(a)** la tarjeta no tuvo movimientos antes del 30-may → no falta nada;
- **(b)** Plaid entregó ventana más corta → 17 días perdidos, **irrecuperables** (re-vincular cuenta 90 días desde el nuevo momento).

**Verificable en un minuto en la app:** ¿hay actividad en la …9207 entre el 13 y el 29 de mayo?

## 2 · Signo — correcto, sin tocar `inverse_transaction_sign`

`inverse_transaction_sign: false` y los consumos entran **negativos**:

| id | date | payment_ref | amount |
|---|---|---|---|
| 33072 | 2026-08-11 | CVS | **−39.80** |
| 33071 | 2026-08-10 | RaceTrac | **−16.92** |
| 33068 | 2026-08-10 | ELLIOTT ELECTRIC SUPPL 1 | **−412.90** |
| 33067 | 2026-08-10 | ELLIOTT ELECTRIC | **+97.22** *(devolución, correcto)* |
| 33066 | 2026-08-10 | Chevron | **−3.56** |

**No hay que tocar el interruptor.**

## 3 · ⛔ ATRIBUCIÓN POR PORTADOR: **NO SE PUEDE**

Se leyeron **todos** los campos de texto de 15 líneas, enumerados vía `fields_get` — no solo los obvios: `payment_ref`, `payment_reference`, `ref`, `narration`, `partner_name`, `online_partner_information`, `extract_partner_name`, `account_number`, `transaction_type`, `online_transaction_identifier`, `internal_index`, y los 3 campos Studio.

**Solo 4 vienen poblados**, y ninguno identifica al portador:

| Campo | Valor típico |
|---|---|
| `payment_ref` | `"CVS"`, `"RaceTrac"`, `"Chevron"`, `"ELLIOTT ELECTRIC SUPPL 1"` |
| `partner_name` | `"CVS"`, `"Elliott Electric Supply"` *(enriquecimiento Plaid)* |
| `online_transaction_identifier` | `9Yn6B8kVqRFArBore7vMiBown1av5gtgkZK7d` |
| `internal_index` | `2026081121474836460000033072` |

**Todos los demás en `false`, sin excepción.** Barrido sobre las **151 líneas** buscando los últimos-4 de los seis titulares (…9207, …9231, …9223, …9249, …9215, …3142): **cero coincidencias**.

Detalle revelador: el descriptor de la **tarjeta** es *más pobre* que el de **cheques**. Cheques trae `"RACETRAC 583 ARLINGTON TX 026761 08/10"` (comercio + ciudad + estado + terminal + fecha); la tarjeta trae `"RaceTrac"` a secas. **Plaid normaliza el descriptor para tarjetas y descarta todo el detalle**, incluido cualquier rastro del plástico usado.

> ### Veredicto: NO se puede costear gasto de campo por ingeniero con el feed de Plaid.
>
> Es **límite del proveedor**, no pendiente de construcción. Y marca una **diferencia estructural con Jeeves**, donde cada transacción trae `source.name` (portador) y `source.detail` (últimos-4) — justo lo que permite que Motor v2 use "comprador" como señal.
>
> **La tarjeta Chase NO es el gemelo de Jeeves que se suponía.** Comparte la forma (gasto de campo, muchos consumos chicos) pero le falta la dimensión que hace útil ese modelo. Si se quiere atribución por ingeniero, tiene que venir de otra vía — estado de cuenta PDF de Chase (que sí separa por tarjeta) o captura manual. **Es decisión de alcance, no desarrollo pendiente.**

---

# 🔻 Consecuencia para el plan: la tarjeta Chase NO es el gemelo de Jeeves

**Este es el hallazgo que más cambia el plan, y conviene que quede aparte de los detalles técnicos que lo sustentan.**

La hipótesis de trabajo hasta hoy era que la tarjeta Chase era el **gemelo estructural de Jeeves**: gasto de campo, muchos consumos chicos, dueño identificable. Las dos primeras siguen siendo ciertas. **La tercera no.**

| Dimensión | Jeeves (MX) | Chase Ink …9207 (USA) |
|---|---|---|
| Gasto de campo, muchos consumos chicos | sí | sí |
| Múltiples portadores sobre una línea de crédito | sí | sí — **6 titulares** |
| **El feed identifica QUIÉN compró** | **sí** — `source.name` + `source.detail` (últimos-4) | **NO** — ningún campo lo trae |
| Descriptor del comercio | crudo, con terminal y plaza | normalizado por Plaid, sin detalle |

**Comparte la forma pero le falta la dimensión que hace útil el modelo.** En Jeeves, el portador es lo que permite que el motor use "comprador" como señal de emparejamiento y que el gasto se costee por persona. Aquí esa columna simplemente no existe en el origen.

## Qué implica, concretamente

1. **Motor v2 no le aplica igual.** Las reglas que usan comprador como señal quedan sin insumo en Chase. Lo que sí es portable: monto, fecha, comercio normalizado. Lo que no: todo lo que dependa de saber quién gastó.
2. **El costeo por ingeniero en USA necesita otra pieza.** No es un ajuste al motor; es una fuente de datos adicional. Dos vías conocidas:
   - **PDF del estado de cuenta de Chase** — sí separa los consumos por tarjeta. Implica parseo de PDF y un ciclo mensual, no diario.
   - **Captura en origen desde el portal de Chase** — la vista por tarjeta existe en la web de Chase; habría que extraerla, con lo que eso implica de acceso y mantenimiento.
3. **El ciclo es distinto.** El feed de Plaid es diario y el estado de cuenta es mensual. Cualquier solución de atribución en USA va a operar con un desfase que en MX no existe.

**No es un pendiente de construcción: es una decisión de alcance.** Se puede vivir con gasto Chase sin atribuir por persona (agregado a nivel empresa/proyecto) y eso ya es mucho mejor que hoy. Atribuir por ingeniero es un frente aparte, con su propio costo, y no bloquea nada de lo que ya está funcionando.

---

## 4 · ⚠️ Pagos de la tarjeta duplicados en dos journals — **$9,419.20**

El pago automático aparece **dos veces**: el mismo hecho económico en ambos journals.

| Fecha | Journal 123 (tarjeta) | id j122 | Journal 122 (cheques) | `payment_ref` en cheques |
|---|---|---|---|---|
| 2026-06-12 | **+18.76** | 32689 | **−18.76** | `Payment to Chase card ending in 9207 06/12` |
| 2026-07-31 | **+5,656.44** | 32790 | **−5,656.44** | `…07/31` |
| 2026-08-01 | **+2,500.00** | 32792 | **−2,500.00** | `…08/03` |
| 2026-08-05 | **+1,244.00** | 32826 | **−1,244.00** | `…08/06` |
| **Total** | **+9,419.20** | | **−9,419.20** | |

En el 123 llegan como `"Payment Thank You-Mobile"`; en el 122 el descriptor **sí nombra la tarjeta** (`ending in 9207`), lo que hace el emparejamiento trivial.

**Requieren tratamiento de transferencia interna.** Si cada uno se concilia contra un gasto por su lado, **se infla el gasto en $9,419.20** — la salida de cheques y el abono a la tarjeta son la misma operación.

*(De las 10 líneas positivas del journal 123 (+9,809.51), estas 4 son $9,419.20; los $390.31 restantes son devoluciones legítimas de comercio, como `ELLIOTT ELECTRIC +97.22`.)*

Cada ciclo agrega más pagos. **Conviene definir la regla antes de conciliar el primer mes.**

## 5 · `has_unlinked_accounts` sigue en `true`

Pese a que **ambas** cuentas ya tienen journal (`link 9 → journal_ids: [122, 123]`), el flag no bajó. Campo computado sin recalcular, o Plaid ofrece alguna cuenta más que Odoo no registró (solo hay 2 `account.online.account`). **No bloqueante** — se vigila, no se actúa.

## Pendientes que deja esta vinculación

| # | Pendiente | Urgencia |
|---|---|---|
| 1 | Definir el tratamiento de los 4 pagos como **transferencia interna** entre journals 122 y 123 | **antes de conciliar el primer mes** |
| 2 | Confirmar en la app si hubo actividad 13–29 may (decide si los 17 días son pérdida o no existieron) | baja, 1 minuto |
| 3 | Decidir de dónde saldrá la atribución por ingeniero, si se quiere | decisión de alcance |
| 4 | El journal 123 **no tiene asiento de saldo inicial**, igual que el 122 | media |
| 5 | Vigilar `has_unlinked_accounts` · borrar el link 10 huérfano | ninguna |
