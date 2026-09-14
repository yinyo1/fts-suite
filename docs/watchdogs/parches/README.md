# Parche: guarda de vacio para nodos de ESCRITURA (S2)

Estado: **CONSTRUIDO Y VERIFICADO QUE PARSEA, NO APLICADO.** Issue #220.

## Que arregla

La guarda de vacio de S1 cubre los 9 nodos Odoo de **lectura**. Los de
**escritura** quedaron fuera, y traen el mismo `onError: continueRegularOutput`:
un fallo viaja como DATO y el nodo reporta `success`. Consecuencia medida:
`Odoo - CREATE log note` llevaba desde el go-live del 19-jun devolviendo
`MissingError` en verde, y el correo nunca lo dijo.

Con este parche, una escritura fallida:
1. sale impresa en la seccion DATOS QUE NO CUADRAN, con el motivo crudo;
2. aparece en el asunto como `ESCRITURA FALLIDA`;
3. **obliga a mandar el correo aunque no haya ningun cambio** -- sin esto, un
   dia quieto se traga el fallo, que es donde el fallo se queda a vivir.

## En que se apoya (medido, no supuesto)

Ejecucion **93268**: las tres ramas que salen de `Code - col-main` corren en
SERIE, no en paralelo. `startTime` crudo:

```
1789002423781  Code - buildLogNotes      (10 ms)
1789002423791  Odoo - CREATE log note    (6118 ms)
1789002429909  Code - buildSnapshot      (8 ms)
1789002430870  Code - buildEmail         (12 ms)
```

`buildEmail` arranca **despues** de que la escritura termino, asi que puede
leer su resultado sin re-cablear nada. Esto importa: el re-cableado en serie
era la otra opcion y es PELIGROSO, porque `Code - buildLogNotes` devuelve `[]`
cuando no hay notas que escribir (o en modo prueba silenciado) y en n8n una
rama que devuelve `[]` **corta todo lo que sigue** -- encadenar el correo
detras de la escritura haria que un dia sin notas no mandara correo.

Casos benignos que la guarda NO reporta, a proposito:
- `buildLogNotes` devolvio 0 notas -> que el nodo de escritura no corra es lo
  correcto, no un fallo.
- El PUT del snapshot devolviendo 422 `already exists` -> es el caso NORMAL al
  re-correr el mismo dia (el PUT sin `sha` solo puede CREAR).

## Los 4 hunks

```
47a48,97     el bloque de la guarda (wdiag)
166a217,218  render en DATOS QUE NO CUADRAN
225c277,279  wdiag entra en `hay` -> fuerza el envio
275a330      'ESCRITURA FALLIDA' en el asunto
```

Base: el `jsCode` **publicado** de `Code - buildEmail` leido del server
(no la copia de `docs/`, que estaba 2 hunks atrasada y se refresco en este
mismo commit). sha256 del resultado: `5673289fdbcfb216ab9ab914...`

## Por que no se aplico todavia

Aplicarlo exige reenviar los 24 KB del `jsCode` completo por MCP (§17: no hay
update parcial de un Code node), y el renderizador del correo se esta
rediseniando en la TAREA 1 de esta misma sesion. Escribir 24 KB que el
redisenio va a reescribir es trabajo tirado. La guarda es **requisito del
redisenio**: el correo nuevo tiene que traerla desde el primer dia.

Si se decide aplicarlo antes del redisenio, el procedimiento es el de §17:
`setNodeParameter /jsCode` con el contenido de
`Code-buildEmail_CON-GUARDA-ESCRITURA.js`, read-back, exigir que el sha256
coincida, y publicar comparando `versionId` con `activeVersionId`.
