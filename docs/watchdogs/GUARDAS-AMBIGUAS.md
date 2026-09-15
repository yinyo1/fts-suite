# Barrido de guardas: las que avisan igual ante una falla total y ante una condicion normal

Issue #240. Pedido explicito de Esteban al aprobar el cambio 3 del parche S4:
*"Revisa si hay otras guardas con el mismo defecto: una que avise igual ante una
falla total que ante una condicion normal. Si las hay, reportalas aunque no las
arregles hoy."*

**Las hay: 6 de las 9.** Ninguna se arregla en este commit.

Medido el 15-sep-2026 leyendo el `jsCode` **vivo** de `Code - MAIN` en
`ops/semaforo-motor` (`RtP77DIATk4nogR5`, `versionId == activeVersionId ==
85f1b1c7-11dc-48de-8435-13a5f4b977e7`). La copia de
`docs/n8n-workflows/s1-semaforo/Code-MAIN.js` resulto **identica** en el bloque
de guardas, pero es del 9-sep y anterior a la extraccion del motor (#229), asi
que el barrido se hizo contra el server, no contra ella.

---

## El defecto, en una linea

Las nueve lecturas de Odoo pasan por **la misma** guarda, que emite **el mismo
texto** en los nueve casos:

```js
function rowsOf(nodo, llave, critico){
  ...
  if(!out.length){
    _diag.push({nodo:nodo, problema:'devolvio 0 filas utilizables (llave "'+llave+'" ausente)',
                items_crudos:all.length, critico:!!critico});
  }
  return out;
}
```

Para seis de las nueve, **"0 filas" es a la vez el sintoma de un fallo y el
resultado de un dia normal**. La guarda no puede distinguirlos, asi que elige el
peor por omision: avisa siempre.

Y hay un segundo problema encima: `items_crudos` es el unico dato que podria
desempatar —"el nodo no devolvio nada" contra "devolvio filas sin la llave"— y
**el correo no lo imprime**. `secReporte` en `buildEmail` solo saca `d.nodo` y
`d.problema`. El unico discriminador que existe no llega al lector.

Es el mismo modo de falla que CLAUDE.md §9 (`insertadas: 0` se ve identico a un
exito), §20 #11 (un `[]` no prueba que la consulta sirva) y §20 #12b (sesion /
red / servidor colapsados en un mensaje): **dos estados distintos con una sola
salida, y la salida elegida es la que invita a la accion equivocada.**

---

## Las nueve, una por una

| # | nodo | llave | `critico` | filtro | ambiguo | condicion NORMAL que da 0 |
|---|---|---|---|---|---|---|
| 1 | `getAll projects` | `id` | **si** | `stage_id in [1,2,5,3,7,13]` + 3 mas | **no** | ninguna: sin proyectos no hay watchdog |
| 2 | `getAll SO` | `id` | no | `id in prep.soIds` | **si** (cascada) | ningun proyecto vigilado con `sale_order_id` |
| 3 | `getAll partners` | `id` | no | `id in prep.partnerIds` | **no** | los proyectos se filtran `partner_id != false` |
| 4 | `getAll termlines` | `payment_id` | no | **ninguno** (tabla entera) | **no** | 0 = la tabla esta vacia, o el nodo fallo |
| 5 | `getAll msg94` | `res_id` | **si** | `res_id in projIds` + `subtype_id 94` | **si** | nadie movio un proyecto de etapa |
| 6 | `getAll msgComment` | `res_id` | no | `res_id in projIds` + `message_type comment` | **si** | nadie escribio una nota |
| 7 | `getAll trackedMsgs` | `res_id` | no | `res_id in projIds` + `date >= corte` | **si** | ningun mensaje en los 30 dias |
| 8 | `getAll trackingVals` | `field_id` | no | `id in extractIds.trkIds` | **si** (cascada de #7) | idem #7 |
| 9 | `getAll attachments` | `id` | no | `id in extractIds.attIds` | **si** (cascada de #6) | ninguna nota con adjunto, o AP apagada |

### Las cascadas NO son probables: son estructurales

`Code - prep` y `Code - extractIds` sustituyen la lista vacia por el centinela
`[0]`:

```js
// Code - prep
soIds: soIds.length?soIds:[0],  partnerIds: partnerIds.length?partnerIds:[0]
// Code - extractIds
trkIds: trkIds.length?trkIds:[0],  attIds: attIds.length?attIds:[0]
```

O sea que cuando el padre viene vacio, el hijo consulta `id in [0]` y devuelve
**0 filas garantizadas**. No es una coincidencia que a veces pase: es el diseno.

```
#7 trackedMsgs vacio  ->  extractIds.trkIds = [0]  ->  #8 trackingVals 0 filas, SIEMPRE
#6 msgComment  vacio  ->  extractIds.attIds = [0]  ->  #9 attachments   0 filas, SIEMPRE
```

Un dia sin mensajes rastreados y sin notas produce **cuatro** renglones en
`Problemas del propio reporte` por **dos** condiciones normales. Eso no solo
avisa de mas: entrena al lector a ignorar la seccion, que es la forma en que una
guarda deja de servir sin dejar de existir.

El centinela `[0]` es correcto por su cuenta —sin el, `id in []` en Odoo
devolveria la tabla entera— pero nadie le dijo a la guarda que existe.

### El caso critico, y por que es el peor de los seis

**#5 `msg94` esta marcado `critico:true`.** Su vacio significa "nadie cambio de
etapa", que en una empresa de 36 proyectos es un martes cualquiera. O sea: la
unica de las seis que se imprime con `(CRITICO)` es tambien una de las que se
dispara por una condicion normal.

Y su vacio **es exactamente el fallo del 10-sep**, cuando la lectura si murio y
los 35 proyectos cayeron a `create_date`. Los dos casos — el martes tranquilo y
la lectura muerta — producen el mismo renglon con la misma palabra `CRITICO`. La
senal que si los separa es la **proporcion de `fuente_a == create_date`**, que es
precisamente lo que el cambio 3 del parche S4 arregla, pero **del lado del
correo**. La guarda de origen sigue igual.

### #9 attachments: lo unico que se toca hoy, y solo a medias

El parche S4 lo silencia **en el correo** mientras
`ap_confirmacion.aplica_stages` este vacio (`AP_VIVA`). Estado en `main` hoy:
`[]`, apagado en S1 (#220) tras disparar en 8 de 8 proyectos del stage 13 y
acumular 509 apariciones. El unico consumidor de `R_ATT` esta detras de
`if(apTpl && ...)`, asi que con el control apagado esa lectura no se usa para
nada y su vacio no significa nada.

Pero **no arregla la guarda**: el motor sigue empujando el renglon a `_diag`, y
por lo tanto sigue en los snapshots. Se filtra al imprimir, no al medir. El nodo
se queda donde esta, como pidio Esteban, y la guarda vuelve sola cuando
`aplica_stages` se repueble — sale de la config viva, sin tocar codigo.

---

## Lo que haria falta (no se hace hoy)

No es un fix de una linea, y por eso va a backlog en vez de al parche:

1. **`rowsOf` necesita un tercer estado**, no un booleano `critico`. Algo como
   `vacio_normal` / `vacio_sospechoso` / `no_se_pudo_leer`, decidido por una
   condicion propia de cada lectura y no por el mismo `!out.length`.
2. **El centinela `[0]` tiene que ser visible para la guarda.** Si el filtro de
   un nodo es `id in [0]`, su vacio es la consecuencia esperada de un padre
   vacio y no debe levantar nada. Una condicion, una alarma.
3. **`items_crudos` tiene que llegar al correo.** Hoy se mide y se tira.
4. **`msg94` no debe apoyarse en su propio vacio** para decidir si hay fallo,
   sino en la proporcion de filas que cayeron a `create_date` — la misma senal
   que el parche S4 ya usa del otro lado.

Prioridad: **media**. No corrompe ningun dato ni bloquea ningun flujo; el costo
es que `Problemas del propio reporte` pierde credibilidad, y una guarda que
nadie lee es una guarda que no existe. El fallo real del 10-sep si se detecto —
pero se detecto por la proporcion de `create_date`, no por esta guarda.
