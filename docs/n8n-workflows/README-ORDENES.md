# `comercial/ordenes` · el contrato

> ## ✅ YA ESTÁ CONSTRUIDO · 30-sep-2026 (V1.50, #294)
>
> Workflow **`y9hucRX0ZEExjIub`**, 24 nodos, **INACTIVO**. Leído del servidor ese día:
> `active: false` · `activeVersionId: null` · `triggerCount: 0` — nunca se ha publicado.
>
> **Se construyeron los CINCO modos** de esta nota: `listar`, `buscar`, `ligar`,
> `desligar` y `descripcion`. Lo que sigue es el contrato que consume el navegador y
> sigue vigente tal cual.
>
> **Dos decisiones que se apartan de lo que recomendaba esta nota, y por qué:**
>
> 1. **El total NO sale de un `search_count` por JSON-RPC.** Sale de leer los ids
>    (`Odoo - ids`, ~1,500 números) y contar en un Code. El RPC obligaba a traer una
>    **segunda llave** al workflow y con ella toda la superficie de §9 —un nodo que
>    truena publica su entrada, o sea el secreto—. Leer ids es barato y deja el
>    endpoint con **un solo secreto**, el del JWT. Se eligió el camino cuyo modo de
>    fallo es soportable, no el más elegante. **Y sale mejor de lo que pedía el
>    diseño:** como se filtra sobre el conjunto completo y no sobre la página,
>    `ocultas` es exacto **del total**, no «de esta página».
> 2. **`notIn` no existe en el nodo Odoo v1** (ya estaba medido aquí): el filtrado de
>    prueba/canceladas/ajenas se hace **en el Code**, no en el dominio.
>
> **Para publicarlo:** un clic en n8n, y antes confirmar que `SUITE_JWT_SECRET` está en
> el entorno. Detalle y censo de lo que se destrabó con eso en
> [`docs/comercial/CENSO-CALLEJONES.md`](../comercial/CENSO-CALLEJONES.md).

Esta nota existe para que quien lo toque no vuelva a derivar lo que ya se midió, y
para que el contrato no se invente dos veces.

---

## Por qué no se construyó en la sesión del 29-sep

La mitad del navegador está hecha, probada y con su contrato fijo
(`comercial/machote/js/almacen.js`, funciones `listarOrdenes`, `ligarOrden` y
`desligarOrden`; prueba `V1.46 · la lista NO se trae las 1,546`). Mientras el
endpoint no exista, la pantalla corre en **modo de ejemplo** y lo dice en una
banda ámbar antes de la tabla — no se disfraza de datos reales.

**Decisión propia, y el porqué:** al llegar a este punto quedaban dos
restricciones **medidas** que obligan a un diseño que no cabía en lo que
quedaba de turno sin hacerlo a medias (ver abajo), y la regla de la casa es que
la mitad que va primero sea la **tolerante**, nunca la estricta. La pantalla en
modo de ejemplo no rompe nada; un endpoint a medio medir sí.

---

## El contrato, que ya está fijo

### `modo: 'listar'`

```
→  { token, modo:'listar', limite, desde, solo_mias, sin_cancelar, ver_prueba }
←  { ok:true, ordenes:[…], total:<entero>, ocultas:<entero> }
```

Cada orden:

```
{ id, nombre, estado, empresa_id, cliente, descripcion, po,
  cotizador, cotizador_estado, total, moneda, fecha, pricelist,
  machote: null | { id, id_local, folio_txt, nombre, duenio, version, principal },
  machotes_mas: <entero opcional>, es_prueba: <bool opcional> }
```

- **`estado`** son los de Odoo tal cual: `draft` · `sent` · `sale` · `done` · `cancel`.
- **`cotizador_estado`** es `'activo'` · `'archivado'` · `'sin_casar'`. Lo decide el
  servidor cruzando el `selection` de Odoo contra el padrón **con archivados**
  (`active in [true,false]`), porque quien ya salió es justo el caso que hay que
  marcar. La pantalla **no traduce nada**: pinta el nombre tal cual y añade la
  marca (ver §3.2 del comentario de auditoría en el #294).
- **`ocultas`** son las que los filtros dejaron fuera. La pantalla lo dice en la
  banda: un filtro que no se anuncia se lee como registros que faltan.

### `modo: 'descripcion'` — la única escritura a Odoo de esta pantalla

```
→  { token, modo:'descripcion', odoo_so_id, descripcion }
←  { ok:true, odoo_so_id, descripcion, write_date }
```

Escribe `x_studio_proyect_description` en `sale.order`. Existe porque ese campo
de Odoo es texto libre que nadie vigila —trae «prueba 4 marzo 2026» y «aaa» en
órdenes reales— y la Confirmación lo LEE para nombrar el proyecto, la analítica
y el presupuesto. La descripción buena vive en el machote, que tiene dueño,
versión e historial.

Reglas del modo, y ninguna es opcional:

- **Nunca automático.** Lo dispara una persona con un botón y una confirmación.
  Si la pantalla lo copiara sola, sería un segundo escritor del campo y una
  carrera silenciosa con quien lo edite en Odoo (§20 #4).
- **Se relee después de escribir** y se devuelve el `write_date`. Un `write` que
  contesta éxito no prueba que el campo quedó (§9). La pantalla repinta desde
  esta respuesta, nunca desde haber apretado.
- **Sólo sobre órdenes en `draft` o `sent`.** Una orden confirmada ya tiene su
  proyecto creado con el nombre viejo; cambiarle la descripción después no
  renombra nada y sólo deja los dos textos discrepando.
- **Exige `comercial:write`**, como el resto de las escrituras del módulo.

### `modo: 'ligar'` y `modo: 'desligar'`

```
→  { token, modo:'ligar', odoo_so_id, odoo_so_name, machote_id, principal }
→  { token, modo:'desligar', odoo_so_id, motivo }
←  { ok:true, … }
```

Los dos escriben en `comercial.machote_orden` (migración **011**). **Nada se
borra**: desligar escribe `desligado_at` y quién fue. Los dos índices parciales
de la 011 son los que sostienen la cardinalidad —varios machotes por orden, uno
principal— y no hay que re-implementarla en el workflow: la base la rechaza.

---

## Las DOS restricciones medidas que mandan en el diseño

### 1 · El nodo Odoo v1 no tiene `notIn`

Los tokens de operador **medidos** en este proyecto son `equal`, `in`,
`greaterOrEqual`, `lesserOrEqual` y `like` (§17 quirk 1 de `CLAUDE.md`, donde
consta que `greaterThan` **no existe** y llega como `None`, y Odoo truena con un
`NoneType` en `domains.py`).

O sea que **la basura de prueba no se puede excluir en el dominio** con un
`notIn` sobre `partner_id`. Los caminos:

- **(a)** Filtrarla en el Code, sobre la página ya traída, y pedir a Odoo un
  puñado de más para que la página siga saliendo completa. Simple, y el costo
  es que `ocultas` es *de esta página*, no del total.
- **(b)** Estrenar la v2 del nodo, que tiene otro constructor de filtros.
  ⚠️ Estrenarla aquí obliga a **volver a medir las cuatro cosas** que este
  proyecto tiene medidas de la v1 (el operador ausente, `fieldsList` como
  arreglo, el many2one que se anula escrito como texto, y «Always Output Data»
  en OFF causando un fallo silencioso del workflow entero).

**Recomendación: (a).** Son **9 órdenes de 5,217** — 0.17%, medido el 29-sep — y
no justifican estrenar una versión de nodo cuyo comportamiento habría que
re-medir entero.

### 2 · El nodo Odoo v1 no sabe contar

No hay operación de conteo, y `returnAll` sobre `sale.order` traería más de
cinco mil registros para saber un número.

El total tiene que salir de un **`search_count` por JSON-RPC**, que es
exactamente lo que ya hace `comercial/confirmar` con su helper `kw(...)`.

🔴 **Y eso arrastra la regla de §9, que aquí no es opcional:** ese camino usa un
secreto (`Set` con `$env`), y **si el nodo que lo consume truena, n8n devuelve
su ENTRADA** en `nodeExecutionStack` — o sea el secreto en claro, en el
transcript de quien esté depurando. Pasó el 8-sep-2026 y hubo que rotar la
llave. El nodo que consuma el `Set` va **entero en `try/catch`** y devuelve el
fallo como DATO, con un objeto NUEVO.

⚠️ `onError: continueRegularOutput` **no sirve** aquí: manda el secreto río
abajo, que es peor.

---

## Lo que hay que reusar, no reescribir

El verificador de sesión (SHA-256 + HMAC + JWT en JS puro, porque el sandbox de
n8n no expone `require` ni `crypto`) ya está en el repositorio:

```
docs/n8n-workflows/comercial-comision-pedir.json  →  nodo «Code - Verificar»
```

Se extrae **programáticamente** de ahí y se le agrega el cuerpo propio de este
endpoint. **No se transcribe**: un carácter distinto en esa implementación
cambia todas las firmas, y el fallo se ve como «sesión no válida», que manda a
buscar al lugar equivocado.

---

## Cuando exista

1. Nace **INACTIVO** (el API de esta instancia no deja activar por MCP: es un
   clic de Esteban).
2. Al encenderlo, la pantalla deja de decir «datos de ejemplo» **sola**: la
   banda sale de `demo:true`, que sólo aparece cuando el webhook contesta que no
   está registrado.
3. Read-back obligatorio: `active`, y además `versionId` contra
   `activeVersionId` (§17 quirk 2b: lo guardado puede no ser lo publicado).
