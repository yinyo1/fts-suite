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
| 2.5 Watchdog de integridad | ⬜ no iniciado |

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

Diseño acordado: emparejamiento voraz por multiconjunto contra `(date, amount, payment_ref)`. **NO** "aceptar hash viejo o nuevo", que preservaría el bug porque las gemelas comparten el v1. Idempotente: correrlo dos veces no duplica.

**Dry-run obligatorio** con la lista exacta de lo que insertaría, para aprobación. Universo esperado ~18 (menos 1 ya recuperada por 2.1 = ~17). Con la ventana en 30 días puede arrojar más, porque ahora entra terreno que antes ni se consultaba: si pasa, **no es licencia para insertar** — se clasifica cada una por causa (colisión vs ventana) y se espera OK.

---

## 2.5 — Watchdog de integridad · ⬜ no iniciado

Compara conteo y suma Jeeves vs journal 61 por día alineado a CST, corre diario, alerta ante gap. Consume además el `rechazadas: N` de 2.2 y el `lag_max_dias` de 2.1 como señales secundarias. Umbral y destinatario a proponer antes de fijarlos.

Para Chase: evaluar si `last_sync` + balance de `account.online.account` sirven como señal de frescura y cuadre. Nota previa: **el sync nativo Plaid entrega solo liquidadas y no expone pendings** — es límite del proveedor, no pendiente de construcción.

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
