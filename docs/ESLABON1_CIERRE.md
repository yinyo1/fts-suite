# Eslabón 1 — cierre: integridad de la extracción settled
**Documento vivo.** Estado al 2026-08-12. Fuente de verdad = Odoo, no el log de n8n.

Cadena de 5: **extracción** → motor jala → auto-concilia → concilia manual → escribe a Odoo.
Este doc cubre el eslabón 1. Diagnóstico previo en [`ESLABON1_GATE_A.md`](ESLABON1_GATE_A.md); spec de la ventana en [`ESLABON1_2.1_SPEC_VENTANA.md`](ESLABON1_2.1_SPEC_VENTANA.md).

| Paso | Estado |
|---|---|
| 2.1 Ventana con ancla absoluta | ✅ **VALIDADO** |
| 2.2 Conteo honesto de rechazos | ⏳ **PENDIENTE DE VALIDACIÓN** |
| 2.3 Hash de dedup v2 (llave dual) | ✅ **VALIDADO** |
| 2.4 Barrido de recuperación 2026 | ⛔ **BLOQUEADO** por 2.2 |
| 2.5 Watchdog de integridad | ✅ **ACTIVO** |

---

## 2.1 — Ventana de captura · ✅ VALIDADO

**El bug:** `fromDate = MAX(date del journal 61) − 3 días`. Ese ancla **avanza**, así que el alcance efectivo se encogía solo y las liquidaciones tardías caían fuera **para siempre** (la ventana nunca retrocede).

**El fix:** ancla absoluta `fromDate = MAX(hoy_CST − VENTANA_DIAS, FECHA_PISO)`, con `ventana_dias = 30` parametrizable en el nodo 2. `FECHA_PISO = 2026-01-01` intacto. Se eliminó el nodo `3 - Odoo SEARCH ultima linea` (hacía `returnAll` sobre 7,312 líneas, 27 veces al día, para un máximo que ya no se usa): 21 → 20 nodos.

**Criterio del número 30** — no fue p99 ni "máximo + margen", sino **asimetría de costos**: sobredimensionar cuesta llamadas idempotentes y baratas; subdimensionar cuesta pérdida permanente y silenciosa de datos contables. Medición sobre julio completo (n=192): p50 ≈ 1.7 d · p95 ≈ 2.6 d · p99 ≈ 3.9 d · **máximo 16.64 d**. Solo 2 transacciones del mes superaron 3 días. Dimensionar por p99 habría dado ~4 días — y habría perdido exactamente la transacción que se perdió.

**Prueba de que la fuga se cerró:** la primera corrida recuperó la línea perdida.

| | Antes | Después |
|---|---|---|
| Línea MercadoPago $240 del 2026-07-13 | **no existía** | **id 32911** · `[Primary ****6831] MercadoPago` · −240.00 · `create_date 2026-08-12T23:00:06Z` |
| Journal 61 · 2026 | 1,901 | **1,902** (delta = `nuevas` = 1) |
| `amount:sum` | +68,134.42 | **+67,894.42** (delta −240.00 exacto) |

**Idempotencia probada en vivo:** tres corridas seguidas (17:00, 17:10, 17:16 CST). La primera insertó 1; las dos siguientes `nuevas: 0`. Barrer 179 transacciones tres veces no duplicó nada.

**Instrumento nuevo:** el `[[CBRUN]]` ahora reporta `ventana_dias`, `lag_max_dias` y `lag_max_ref`. Se estrenó señalando `16.64 / "Primary / MercadoPago"` — el propio problema que lo motivó. Si algún día se acerca a 30, hay que subir `ventana_dias` **antes** de perder algo.

**Costo:** ~27 → ~81 llamadas/día a Jeeves (3 páginas por corrida en vez de 1), y **−27 barridos completos** del journal a Odoo.

---

## 2.2 — Conteo honesto de rechazos · ⏳ PENDIENTE DE VALIDACIÓN

**El bug de fondo, que resultó ser topológico.** El nodo 11 (`Odoo CREATE`) tiene `onError: continueRegularOutput`, así que un insert rechazado por la constraint de `unique_import_id` se descartaba en silencio. Pero la causa real de que `rechazadas` fuera *estructuralmente* 0 era el cableado:

```
10 - Code diff ──┬─> 11split ─> 11 - Odoo CREATE ─> (sin salida)
                 └─> 12 - Odoo CREATE mail.message ─> 13
```

**El CBRUN se escribía en una rama paralela que no esperaba al insert**, y el nodo 11 era un callejón sin salida. Ampliar el conteo sin arreglar eso habría dado un número igual de falso.

**El fix:**
```
10 ──┬─> 11split ─> 11 - Odoo CREATE ─┐
     └─> 11b - Code CBRUN honesto ────┴─> 12 ─> 13
```

`11b` cuelga de `10` (por eso **siempre corre**, incluso con `nuevas: 0`) pero lee la salida del nodo 11, que ya completó porque `11split` está listado primero en `main[0]` y en `executionOrder v1` esa rama termina antes. El `onError` del nodo 11 **se conserva**: su propósito (que un duplicado no tumbe el batch) sigue siendo correcto; lo que cambia es que ahora se cuenta.

`11b` emite `intentadas`, `insertadas`, `rechazadas`, `rechazos_por_tipo` (`constraint_duplicado` / `otro`) y `rechazos[]` con `date`/`amount`/`ref`/`hash`/`msg` (tope 20). Esa es la materia prima del watchdog de 2.5.

**Distinción que queda explícita:** `duplicadas` = detectadas por el diff **antes** de escribir · `rechazadas` = pasaron el diff pero la constraint las rechazó **al escribir**. Un `rechazadas > 0` sostenido significaría que el diff y la constraint no coinciden.

### Por qué NO está validado

`11b` se autodiagnostica: `confiable = (toInsert.length === 0) || (outs.length > 0)`. Si hubiera filas que insertar y no llegara ni una salida del nodo 11, reporta `rechazadas: null` con `conteo_confiable: false` — **nunca un 0 inventado**. Es deliberado: no quería repetir el modo de fallo que estoy arreglando.

**En las tres corridas posteriores el CBRUN trajo `conteo_confiable: true`, pero con `intentadas: 0`** — o sea que entró por la **rama trivial**, no por la que importa. El instrumento emite correctamente, pero **todavía no se ha ejercitado**: la suposición sobre el orden de ejecución v1 sigue sin probarse en terreno.

**Se valida solo en la primera corrida con `nuevas > 0`.** Si sale `conteo_confiable: false`, hay que reconectar `11b` aguas abajo del 11.

---

## 2.3 — Hash de dedup v2 (llave dual) · ✅ VALIDADO

**La mina que había que desactivar primero.** Cambiar la llave a secas habría hecho que la **captura viva** re-insertara las ~1,900 líneas ya capturadas: el nodo 9 busca en Odoo por los hashes que le pasa el nodo 8; con v2 esos hashes no existen (las filas guardadas tienen v1) → el diff las declara todas nuevas → y la constraint **no las bloquea**, porque los hashes v2 son genuinamente nuevos. No es el mismo problema que el del barrido (2.4): aquél es sobre el sweep, éste era sobre producción cada 30 minutos.

**El diseño — llave dual: se BUSCAN ambas, se ESCRIBE v2.**

```js
const _base = [fecha, amount.toFixed(2), tag, l4, (dst.name||'')].join('|');
const uid1  = 'jeeves-' + _sha256hex(_base);                              // v1 historica
const uid2  = 'jeeves-' + _sha256hex(_base + '|' + String(t.createdAt||'')); // v2, unica
// se escribe uid2; uid1 viaja como _uid_v1 solo para el diff
const hashes = out.map(r=>r.unique_import_id).concat(out.map(r=>r._uid_v1));
// nodo 10:
toInsert = all.filter(r => !existing.has(r.unique_import_id) && !existing.has(r._uid_v1));
```

`createdAt` es la llave porque tiene precisión de milisegundos, cobertura 100%, reconstruye 35/35 hashes almacenados, y **se estampa al autorizar y sobrevive la transición pending→settled** (evidencia en [`EVIDENCIA_MUTACION_JEEVES.md`](EVIDENCIA_MUTACION_JEEVES.md)).

**Propiedad clave — la llave dual es monótonamente más segura que v1 sola.** Declara nueva una fila solo si **v1 ∉ Odoo Y v2 ∉ Odoo**: condición estrictamente más difícil que la actual. Nunca puede insertar de más; en el peor caso inserta lo mismo.

**Comportamiento por caso:**

| Caso | Resultado |
|---|---|
| Fila vieja (v1 en Odoo) | su v1 coincide → **no se re-inserta** ✓ |
| Gemelas nuevas (v1 idéntico, v2 distinto) | ninguna está en Odoo → **ambas entran** ✓ *(el bug queda cerrado hacia adelante)* |
| Segunda corrida | cada una encuentra su v2 → **no duplica** ✓ |
| Gemela históricamente perdida | sigue perdida → la recupera **2.4**, no la captura |

**Simulación en frío** (35 transacciones reales vs sus 35 líneas reales, criterio tal cual quedó en el nodo 10):
```
con v1 YA en Odoo               : 35 / 35
con v2 ya en Odoo               : 0
=> declaradas NUEVAS por el diff : 0
unicidad de v2 en el lote        : 35 distintos de 35
```
Confirmado contra Odoo: los 5 hashes v2 de muestra → `total: 0`.

**Corrida real:** `nuevas: 0`, `duplicadas: 179`, `toInsert: []`. Journal 61 · 2026 clavado en **1,902** y `amount:sum` en **+67,894.42** — sin cambio, cero duplicación.

**Salvaguarda del build:** el transform verifica que el bloque SHA-256 del nodo 8 quede **byte a byte idéntico** y aborta si cambia un solo carácter. Confirmado en el read-back.

### Política de retiro de v1: **PERMANENTE — no hay corte**

La lectura dual **no** es transitoria. Se queda mientras exista una sola fila con hash v1 en el journal 61, es decir, indefinidamente.

**Razonamiento:** retirar v1 obligaría a un backfill de `unique_import_id` sobre las ~1,902 filas históricas, y ese backfill necesita el `createdAt` de cada transacción — **un dato que Odoo no guarda** (el hash v1 no lo incluye y no hay campo donde viva). Habría que re-derivarlo desde Jeeves fila por fila y escribir a producción sobre datos contables ya conciliados. Todo eso para ahorrar 179 strings por petición.

**Costo de dejarla:** ~12 KB por petición. **Costo de quitarla:** un backfill riesgoso sobre el histórico. La asimetría es obvia.

### Costo del volumen en el nodo 9 — razonado, no cronometrado

El nodo 9 pasa de buscar 179 hashes a 358. **La respuesta no crece, solo la petición:** devuelve solo coincidencias, y los 179 v2 no coinciden con nada, así que siguen volviendo las mismas ~179 filas. Petición ~13 KB → ~25 KB sobre una columna única indexada.

No se parece al problema del nodo 3: aquél hacía `returnAll` **sin filtro** sobre 7,312 filas (escaneo completo + serialización de todo). Esto es un lookup indexado.

⚠️ **No está cronometrado.** `saveDataSuccessExecution` está en `none`, así que las corridas exitosas no se guardan y no hay medición de tiempo. Si el CBRUN empieza a tardar notoriamente, se ve y se ajusta.

---

## 2.4 — Barrido de recuperación 2026 · ⛔ BLOQUEADO

**No arranca hasta que 2.2 esté validado de verdad** — el barrido inserta, y el contador honesto tiene que estar funcionando antes.

Diseño acordado: emparejamiento voraz por multiconjunto contra **`(date, amount, refNorm(payment_ref))`** — la misma `refNorm()` del watchdog, ver el caso 30444 abajo. **No es opcional.** **NO** "aceptar hash viejo o nuevo", que preservaría el bug porque las gemelas comparten el v1. Idempotente: correrlo dos veces no duplica.

**Dry-run obligatorio** con la lista exacta de lo que insertaría, para aprobación. Universo esperado ~18 (menos 1 ya recuperada por 2.1 = ~17). Con la ventana en 30 días puede arrojar más, porque ahora entra terreno que antes ni se consultaba: si pasa, **no es licencia para insertar** — se clasifica cada una por causa (colisión vs ventana) y se espera OK.

---

## 2.5 — Watchdog de integridad · ✅ ACTIVO

**Workflow `fin/watchdog-captura` · id `hckccUkyaAItBmbU` · 18 nodos.**
Cron `15 8 * * 1-5`, `timezone: America/Monterrey` explícito en settings.
**Activado el 2026-08-13T00:19:48Z** — verificado en los cuatro campos, no solo en `active`:
`active: true` · `triggerCount: 1` · `activeVersionId: 5ab3006b…` · `activeVersion: presente`
(historial de publicación: `activated @ 2026-08-13T00:19:48.620Z`). Primera corrida programada: **jueves 2026-08-13, 08:15 CST**.

> ⚠️ **Verificar `active` NO basta: hay que verificar `triggerCount` también.** En el primer intento de activación el flag no se movió y quedó `active: false` / `triggerCount: 0` / `activeVersionId: null` — el `Execute Workflow` había corrido (2 ejecuciones success) pero eso **no publica nada** (lección §18: *Manual Trigger NO activa el Schedule*). Con `triggerCount: 0` el Schedule no está registrado y el workflow no corre, aunque el resto se vea sano.
>
> Y la ironía que hace esto peligroso: el watchdog tiene la alerta `WATCHDOG_SIN_LATIDO` para detectar que murió en silencio, **pero esa alerta la emite él mismo**. Un vigilante que nunca arranca nunca avisa que no arrancó — es indistinguible de uno que no tiene nada que reportar.

*(Deuda cosmética: el nombre del workflow todavía dice `(INACTIVO — pendiente publicar Esteban)`. Es la misma etiqueta fósil que arrastran los 8 workflows de `fin/captura-*`; el flag manda, no el nombre.)*

**El watchdog ES el dry-run de 2.4 corriendo diario.** No cuenta: **empareja**. Corre el mismo matcher voraz por `(date, amount, refNorm(payment_ref))` que usará el barrido, en modo lectura. La alerta dice *qué* falta, no solo cuánto — y cuando 2.4 corra, el watchdog es la verificación independiente: debe caer a 0 solo.

### Decisiones fijadas

| Parámetro | Valor | Justificación |
|---|---|---|
| Destinatario | `estebandelacruz@fts.mx` | alarma técnica, no operativa. Canal Graph, credencial `Microsoft Graph - sales` (`Mh5kBNduMzOl3nzT`) |
| Ruido | `[[CBWATCH]]` **siempre** + correo **solo ante alerta** | un correo diario "todo bien" se vuelve invisible en dos semanas |
| Auto-vigilancia | alerta si >2 días hábiles sin `[[CBWATCH]]` | *un vigilante que muere en silencio es el fallo que perseguimos toda la sesión* |
| Zona de gracia | últimos **3 días** CST excluidos de alerta | lag de liquidación p50 1.7 d · p95 2.6 d · **p99 3.9 d** |
| `GAP_ESPERADO` | **0**, sin umbral | ver abajo |
| Umbral lag | **≥ 20 d** | máximo observado 16.64 d sobre ventana de 30 → 10 d de colchón |
| Chase sync rancio | > 3 días | `last_sync` es fecha, no timestamp: resolución diaria |
| Chase delta | drift > $0.01 | ver abajo |

**Por qué `GAP_ESPERADO = 0` y no 4** (decisión de Esteban, y es la correcta): un umbral que arranca en *"sabemos que hay 4"* normaliza el problema. En tres semanas nadie recuerda de dónde salió el número, y si aparece una quinta pérdida por causa nueva el conteo dice 5 y **sigue pareciendo casi normal**. Implementación: las 4 conocidas van en **cuarentena nominada** (lista `CONOCIDAS` con fecha/monto/concepto explícitos), separadas de las nuevas en el correo. Se vacían solas cuando 2.4 las recupere o cuando envejezcan fuera de la ventana de 30 días.

**Chase — el control es la ESTABILIDAD del delta, no su valor.** `balance_plaid − suma_odoo = $224,977.63` = el saldo inicial nunca contabilizado. No puede ser 0. Pero si ambos lados se mueven en sincronía el delta se mantiene constante; si el sync se salta un movimiento, el banco se mueve y Odoo no → deriva. El delta se guarda en el `[[CBWATCH]]` y se compara contra la corrida anterior. Funciona sin esperar a que se contabilice la apertura, y el día que se contabilice el delta va a 0 y el mismo control sigue sirviendo.
⚠️ **Límites del proveedor, no pendientes de construcción:** `last_sync` tiene resolución diaria; no se detectan transacciones que netean a cero; el sync nativo Plaid entrega **solo liquidadas y no expone pendings**. La cuenta `J. CALDERON` se reporta como aviso *"ofrecida por Plaid, NO vinculada"*.

### Corrida 1 (execution `63711`) — encontró un defecto en su estreno

`status: ALERTA · faltantes_nuevas: 1 · cuarentena_conocidas: 4`. La "faltante nueva" resultó ser **falso positivo del matcher**, y de un tipo que habría hecho daño real. Ver el caso 30444 abajo.

Confirmado en esa corrida: `[[CBWATCH]]` escrito (`mail.message 2927982`), correo enviado (nodo 12, output `{}` = 202 Accepted en Graph).

### Corrida 2 (post-`refNorm`) — limpia · **evidencia de la activación**

`[[CBWATCH]] mail.message 2927988`, 2026-08-12 18:16 CST:

```json
{"jeeves_en_rango":173,"odoo_en_rango":169,"odoo_en_ventana":175,
 "faltantes_nuevas":0,"cuarentena_conocidas":4,
 "cbrun":{"lag_max_dias":16.64,"rechazadas":0,"conteo_confiable":true,"horas_desde_ultimo":0.3},
 "chase":{"cuenta":"BUS COMPLETE CHK","balance_plaid":191224.36,"suma_odoo":-33753.27,
          "delta":224977.63,"last_sync":"2026-08-10","dias_sin_sync":2,
          "no_vinculadas":["J. CALDERON"],"drift":0},
 "alertas":[],"status":"ok"}
```

`faltantes_nuevas: 0` ← la prueba de que `refNorm` cerró el falso positivo · `odoo_en_rango: 169` con `173 − 169 = 4` (las colisiones conocidas) · `drift: 0` · cero alertas · **sin correo** (el nodo 12 no se ejecutó). Contrastable contra el CBWATCH anterior (`2927982`), que traía `faltantes_nuevas: 1` y `"alertas":["FALTANTES_NUEVAS"]`.

**Guardado de ejecuciones:** el watchdog queda en `saveDataSuccessExecution: "all"` — 1 corrida/día hábil, podada a 14 días ⇒ ~10 ejecuciones vivas. Despreciable, y da trazabilidad justo donde se necesita. **`captura-jeeves` se queda en `none`**: 27 corridas/día × 14 días ≈ 378 ejecuciones, cada una con el array completo de 179 transacciones.

---

## El caso 30444 — deriva de etiqueta, y por qué el matcher no puede comparar `payment_ref` crudo

**Hallazgo de la primera corrida del watchdog.** Reportó como faltante una transacción de `2026-07-14`, `−5,987.20`, `[AJUSTE JEEVES] Credit Line`. **La línea sí existía** — id **`30444`**, misma fecha, mismo monto — pero con otro `payment_ref`.

| Odoo tenía | El matcher buscaba |
|---|---|
| `[ADJUSTMENT debit ****] Credit Line` | `[AJUSTE JEEVES] Credit Line` |

**Causa raíz, visible en los `create_date`:**

| id | date | payment_ref | create_date | origen |
|---|---|---|---|---|
| **30444** | 2026-07-14 | `[ADJUSTMENT debit ****] Credit Line` | **2026-07-19T06:02:48Z** | captura incremental |
| 30647 | 2026-06-14 | `[AJUSTE JEEVES] Credit Line` | 2026-07-21T22:17:25Z | carga histórica |
| 30876 | 2026-05-14 | `[AJUSTE JEEVES] Credit Line` | 2026-07-21T22:19:35Z | carga histórica |
| 31035 | 2026-04-30 | `[AJUSTE JEEVES] Credit Line` | 2026-07-21T22:21:05Z | carga histórica |
| 31392 | 2026-03-31 | `[AJUSTE JEEVES] Credit Line` | 2026-07-21T22:24:28Z | carga histórica |

**Entre el 19 y el 21 de julio de 2026 se le agregó al nodo 8 la rama `tag==='ADJUSTMENT'`.** Antes de ese cambio los ajustes caían al fallback genérico:

```js
else{ payment_ref='['+(tag||'?')+' '+type+' ****'+l4+'] '+(dst.name||src.name||''); ... }
```

que con `tag='ADJUSTMENT'`, `type='debit'`, `l4=''` produce literalmente `[ADJUSTMENT debit ****] Credit Line`. La línea 30444 es la **única** capturada por el incremental en esa ventana de dos días; todas las demás llegaron después con el código nuevo.

**Alcance verificado:** barrido de la firma del fallback (`payment_ref` con ` debit ` o ` credit `) sobre 2026 completo → **1 solo registro**. Las categorías especiales están limpias: `[FONDEO] Credit Line` ×17 · `[AJUSTE JEEVES] Credit Line` ×16 · `[DEVOLUCIÓN ****xxxx]` ×17, todas con formato consistente.

**Por qué importaba:** 2.4 usa el mismo criterio de emparejamiento. Sin corregir, el barrido habría **insertado un duplicado de −$5,987.20 en producción**. El watchdog se pagó solo en su primera corrida.

### El fix: `refNorm()` — y es obligatorio que 2.4 use exactamente la misma función

```js
function refNorm(s){ return String(s==null?'':s).replace(/^\[[^\]]*\]\s*/,'').toLowerCase().trim(); }
// clave de emparejamiento: date | amount | refNorm(payment_ref)
```

Se descarta el prefijo entre corchetes (donde vive la deriva: portador, últimos-4, y el rótulo de categoría) y se compara por comercio normalizado. Se eligió la normalización **general** sobre el parche del caso puntual porque **la deriva va a repetirse cada vez que se toque el nodo 8** — un matcher frágil a cambios cosméticos es deuda que se cobra sola. Ya pasó una vez y tardó tres semanas en verse.

**Verificación en frío antes de aplicar** (mismo espíritu que la simulación de 2.3). Sobre 2026 completo: solo **11 pares `(date, amount)`** se repiten en el journal 61, y de esos **6 colapsan** al normalizar. En los 6, Jeeves tiene 2 y Odoo tiene 2:

| Fecha · Monto · Comercio | Jeeves | Odoo | Tarjetas |
|---|---|---|---|
| 2026-03-01 · −1,579.64 · `Days` | 2 | 2 | 4197 / 8948 |
| 2026-03-02 · −1,427.02 · `Garden` | 2 | 2 | 4197 / 8948 |
| 2026-03-02 · −360.82 · `Circle` | 2 | 2 | 4197 / 8948 |
| 2026-03-27 · −399.94 · `Uber` | 2 | 2 | 0802 / 4666 |
| 2026-05-12 · −398.75 · `Ross` | 2 | 2 | 8948 / 1264 |
| 2026-06-04 · −1,700.49 · `Infra` | 2 | 2 | 4548 / 6831 |

El emparejamiento voraz los absorbe sin huérfanos ni sobrantes. **Cero superávit en Odoo**, que es la condición para que aflojar la clave no pueda enmascarar una pérdida real: el enmascaramiento exigiría que una sub-clave tuviera Odoo > Jeeves mientras otra tiene déficit, y no ocurre en ningún caso. Los 5 pares que **no** colapsan tienen comercios distintos (`Gases`/`Autelin`, `Orsan`/`OMA`, `Knights`/`Right Choice`, `Oxxoteran`/`Oxxopipila Mtynl`, `123/Undostres.com.mx Mexico City Mex`/`Undostres`).

> ⚠️ **CONDICIÓN PARA 2.4:** el barrido **debe** usar esta misma `refNorm()`. Que el barrido y el watchdog compartan criterio **no es opcional** — es la condición para que el watchdog sirva de verificación independiente. Si divergen, el watchdog puede dar 0 mientras el barrido inserta duplicados, o al revés.

### Fix cosmético del CBWATCH

`odoo_en_ventana` (175) y `jeeves_en_rango` (173) **no eran comparables**: el primero contaba hasta hoy y el segundo hasta `hoy−4` (zona de gracia). Parecía decir *"Odoo tiene más que la fuente"*. Se agregó **`odoo_en_rango`** con el mismo corte que Jeeves: **169**. Y `173 − 169 = 4` = las colisiones conocidas, cuadrando exacto. **El matcher siempre estuvo bien** — una transacción de ≤ `rango_fin` no puede casar con una línea fechada después; lo defectuoso era el resumen.

---

## Universo de pérdidas 2026 — estado

**18 en total**, reatribuidas con evidencia (corrección de Gate A):

| Causa | n | Estado |
|---|---|---|
| Pérdida de ventana (MercadoPago $240, lag 16.64 d) | 1 | ✅ **recuperada por 2.1** (id 32911) |
| Colisión de hash, julio | 4 | pendiente de 2.4 |
| Colisión de hash, junio (Undostres ×3) | 3 | pendiente de 2.4 |
| Marzo (−3) y mayo (−6), sin enumerar | 9 | pendiente de 2.4 |

El barrido recupera **ambas causas por igual**, porque empareja por `(date, amount, payment_ref)` y no por causa.

---

## Método de edición usado

Todos los cambios se aplicaron por **PUT directo al API público de n8n**, no por MCP. Ver CLAUDE.md §17 quirk 2 (reescrito): el MCP manda campos de más y el schema los rechaza; filtrando `settings` a las 8 claves permitidas el PUT pasa **y preserva `active`**. En 8 PUTs consecutivos (vc 10 → 16) `active: true` y `timezone America/Monterrey` sobrevivieron intactos.

Reglas que se siguieron sin excepción: modificar el JSON **programáticamente desde el GET** (jamás transcribiendo — el nodo 8 lleva SHA-256 inline), validar cada `find` por conteo de ocurrencias antes de reemplazar, encadenar con `&&` y `rm -f put_body.json` previo, y **read-back independiente leyendo el nodo** tras cada edit.

**Respaldo PRE:** `docs/n8n-workflows/captura-jeeves_PRE-2.1_2026-08-12.json` (21 nodos, `versionCounter: 10`).
