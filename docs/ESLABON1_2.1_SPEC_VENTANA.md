# 2.1 — Ventana de captura: ancla absoluta + lag máximo en CBRUN
**Workflow:** `captura-jeeves` · id `PWEiA37CLfP6lMgg` · **aplicar en la UI de n8n**

## Por qué no se aplicó por MCP

`n8n_update_partial_workflow` con `validateOnly:true` → `{"valid":true,"operationsToApply":6}`.
El apply real → `{"success":false,"error":"Invalid request: request/body must NOT have additional properties","code":"VALIDATION_ERROR"}`.

Es el quirk de CLAUDE.md §16, con un matiz nuevo que conviene registrar: **`validateOnly` pasa porque no toca la API de n8n — solo el apply se rechaza.** Un `validateOnly` verde NO es evidencia de que el edit vaya a entrar.

Read-back tras el fallo: `active: true`, `updatedAt: 2026-07-22T19:31:35.623Z` (sin cambio). **La operación es atómica: no quedó nada a medias.**

`update_full` se descartó a propósito: obliga a retranscribir los 21 nodos (~35k caracteres, incluida la implementación completa de SHA-256 del nodo 8) dentro de una llamada. Un carácter alterado cambia todos los hashes del pipeline vivo. El riesgo de transcripción no se justifica para 4 ediciones puntuales.

---

## Cambio 1 — Nodo `2 - Set origen config`

Renombrar el campo `traslape_dias` → `ventana_dias` y cambiar su valor de `3` a `30`.

| Campo | Antes | Después |
|---|---|---|
| `traslape_dias` (number) | `={{ 3 }}` | **eliminar** |
| `ventana_dias` (number) | — | **`={{ 30 }}`** |

Los otros 6 campos (`origen`, `journal_id`, `arranque`, `page_size`, `partner_fondeo`, `fecha_piso`) **no se tocan**. `fecha_piso` sigue en `2026-01-01`.

## Cambio 2 — Nodo `4 - Code fromDate` · reemplazar el jsCode completo

```js
// [4] fromDate = MAX( hoy(CST) - VENTANA_DIAS , FECHA_PISO )  -- ANCLA ABSOLUTA
// Antes: fromDate = MAX(date) del journal 61 - traslape. Ese ancla AVANZA, asi que el
// alcance efectivo se encogia solo y las liquidaciones tardias caian fuera para siempre
// (probado: MercadoPago $240 del 13-jul, lag 16.64 d, nunca capturado).
// Ahora el look-back es constante y no depende de lo que ya este en Odoo.
// La API de Jeeves filtra por createdAt, por eso la ventana se mide contra hoy, no contra date.
const cfg=$('2 - Set origen config').first().json;
const VENTANA=Number(cfg.ventana_dias)||30;
const hoyCst=new Date(Date.now()-6*3600*1000).toISOString().slice(0,10);
const dt=new Date(hoyCst+'T00:00:00.000Z');
dt.setUTCDate(dt.getUTCDate()-VENTANA);
const candDate=dt.toISOString().slice(0,10);
const pisoDate=String(cfg.fecha_piso||cfg.arranque||'2026-01-01').slice(0,10);
const chosen=(candDate>=pisoDate)?candDate:pisoDate;
const fromDate=chosen+'T00:00:00.000Z';
return [{json:{fromDate, page:1, origen:cfg.origen, journal_id:cfg.journal_id, arranque:cfg.arranque, ventana_dias:VENTANA, page_size:cfg.page_size, partner_fondeo:cfg.partner_fondeo, fecha_piso:pisoDate, hoy_cst:hoyCst, from_date_candidato:candDate}}];
```

Ya **no** referencia al nodo 3, y deja de emitir `ultima_fecha` y `traslape_dias`. Verificado que nadie los consume: el nodo 5 usa `includeOtherFields:true` (pasa lo que llegue) y el nodo 6 solo lee `fromDate`, `page_size`, `origen`, `journal_id`, `partner_fondeo`, `arranque`.

## Cambio 3 — Eliminar el nodo `3 - Odoo SEARCH ultima linea` y reconectar

1. Borrar el nodo `3 - Odoo SEARCH ultima linea`.
2. Conectar `2 - Set origen config` → `4 - Code fromDate`.

Ese nodo hacía `returnAll` sobre las **7,312** líneas del journal 61 en cada corrida (27 veces al día) solo para sacar un máximo que ya no se usa.

## Cambio 4 — Nodo `10 - Code diff` · 1 reemplazo (el nodo 8 NO se toca)

> **Rediseño respecto a la primera versión del spec.** El plan original tocaba el nodo
> `8 - Code Construir filas` con 3 find/replace para calcular el lag. Se descartó: ese
> nodo contiene la implementación de SHA-256 y es el que produce `unique_import_id`.
> Cualquier accidente ahí cambia todos los hashes futuros.
>
> El lag se puede calcular **igual de bien en el nodo 10**, leyendo las filas CRUDAS de
> Jeeves directamente del nodo 6 (`$('6 - Code Fetch Jeeves SSE').first().json.rows`),
> que sí conservan `transactionPostedDate` — el nodo 8 lo descarta al mapear.
> El nodo 6 es ancestro del 10 (cadena 6→7→8→9→10), así que la referencia resuelve.
>
> **Resultado: 4 ediciones en vez de 5, y ninguna toca el nodo del hash.**

```
BUSCAR (una sola línea, tal cual):
const cbrun={journal_id:61,desde:b.fromDate,hasta:hoyCst,total_api:b.total_api,filas:all.length,nuevas:nuevas,duplicadas:duplicadas,rechazadas:0,status:status};
```

```js
REEMPLAZAR POR:
let _vent=null,_lagMax=0,_lagRef='';
try{ _vent=$('4 - Code fromDate').first().json.ventana_dias||null; }catch(e){ _vent=null; }
try{
  const _raw=$('6 - Code Fetch Jeeves SSE').first().json.rows||[];
  for(const t of _raw){
    if(t&&t.transactionPostedDate&&t.transactionDate){
      const _l=(new Date(t.transactionPostedDate)-new Date(t.transactionDate))/86400000;
      if(_l>_lagMax){ _lagMax=Math.round(_l*100)/100; _lagRef=((t.source&&t.source.name)||'')+' / '+((t.destination&&t.destination.name)||''); }
    }
  }
}catch(e){}
const cbrun={journal_id:61,desde:b.fromDate,hasta:hoyCst,ventana_dias:_vent,total_api:b.total_api,filas:all.length,nuevas:nuevas,duplicadas:duplicadas,rechazadas:0,lag_max_dias:_lagMax,lag_max_ref:_lagRef,status:status};
```

Ambas lecturas van por referencia explícita a nodo no adyacente (patrón CLAUDE.md §3)
y cada una en su `try/catch`: si algo falla, el CBRUN sale igual con `lag_max_dias: 0`.
Nunca tumba el log.

---

## Qué esperar en el primer `[[CBRUN]]` después del cambio

```json
{"journal_id":61,"desde":"2026-07-14T00:00:00.000Z","hasta":"2026-08-13",
 "ventana_dias":30,"total_api":~250,"filas":~250,
 "nuevas":N,"duplicadas":~250-N,"rechazadas":0,
 "lag_max_dias":16.64,"lag_max_ref":"Primary / MercadoPago","status":"ok"}
```

- `desde` debe ser **hoy − 30 días**, no una fecha derivada del journal.
- `duplicadas` sube a ~250 (antes ~14). **Es lo esperado y es sano** — la captura es idempotente por hash; el traslape amplio solo cuesta llamadas.
- `nuevas` debería traer el **MercadoPago $240 del 13-jul** (`transactionDate 2026-07-13T16:35:08Z`), que hoy no existe en Odoo. Es la primera prueba de que la fuga quedó cerrada.
- `lag_max_dias` es el dato nuevo de vigilancia: si algún día se acerca a 30, hay que subir `ventana_dias` **antes** de perder algo.

## Costo medido

| | Antes | Después |
|---|---|---|
| Ventana | ~3 días (variable) | **30 días (fija)** |
| Transacciones por corrida | ~15 | ~250 |
| Páginas por corrida | 1 | 3 |
| Llamadas/día a Jeeves (27 corridas) | ~27 | **~81** |
| `returnAll` de 7,312 líneas a Odoo | 27/día | **0** |

Neto: +54 llamadas/día a Jeeves, −27 barridos completos del journal a Odoo.

## Gates

1. Aplicar los 5 cambios en la UI.
2. **Confirmar `active`** tras guardar (quirk §17 — todo edit termina con read-back del flag).
3. Primera corrida supervisada.
4. Verificación independiente en Odoo: (a) que aparezca la línea del MercadoPago $240 con `date 2026-07-13`; (b) que el conteo total del journal 61 en 2026 **suba exactamente** en el número de `nuevas` reportado — es decir, que no duplicó nada del histórico.

Ese punto 4 es el gate para pasar a 2.4.
