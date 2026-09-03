# MVP — el workflow que detecta y reenvía órdenes de compra

**Workflow n8n:** `po/radar-detectar (MVP)` · id **`sQ5GYhQTq1UHDt6Y`** · 21 nodos.
Issue rector: **#142**. Construido y probado contra correo real el **2026-09-03**.

Lo que hace, en una frase: cada 15 minutos lee el buzón de `estebandelacruz@fts.mx`, decide cuáles
de los correos nuevos traen una orden de compra, y reenvía esos desde `sales@fts.mx` **con sus
adjuntos originales**, encabezados por un resumen de folio, cliente, monto y por qué se detectó.

El destino del MVP es el propio `estebandelacruz@fts.mx`. Cuando Esteban dé el visto bueno se
cambia el campo `destino` a `newordersnotification@fts.mx` y no hay nada más que tocar.

---

## 1. La cadena

```
Schedule 15min ─┐
Manual ─────────┴→ Set - config → Code - Ventana → HTTP - Graph list
  → Code - Etapa 1 → IF - hay candidatos?
      · no  → Code - Resumen
      · sí  → HTTP - Graph adjuntos → Code - Prep binario → Extract PDF
              → Code - Armar prompt → HTTP - Clasificador → Code - Decidir
              → IF - reenviar?
                  · no → Code - Resumen
                  · sí → Code - Build sendMail → IF - enviar de verdad?
                            · dry  → Code - Resumen
                            · real → HTTP - sendMail → Code - Resumen
```

Dos filtros en serie, baratos primero. La **etapa 1** es determinista y cuesta cero: descarta el
grueso del buzón con expresiones regulares. Solo lo que sobrevive paga una llamada al **clasificador**
(`claude-opus-5`), que es lo caro. En la ventana de prueba, de **100 correos revisados pasaron 19** a
etapa 2, y de esos el clasificador dejó **1 orden confirmada y 1 probable**.

## 2. La configuración

Todo lo ajustable vive en el nodo `Set - config`, en texto plano, sin tocar código:

| Campo | Valor de operación | Para qué |
|---|---|---|
| `mailbox_lectura` | `estebandelacruz@fts.mx` | de qué buzón se lee |
| `mailbox_envio` | `sales@fts.mx` | quién firma el reenvío (nunca sale del payload del correo) |
| `destino` | `estebandelacruz@fts.mx` | a dónde llega el reenvío. **Aquí va `newordersnotification@fts.mx` cuando se cumplan los criterios de §8** |
| `modo_envio` | `real` | `dry` arma el correo completo y **no** lo manda |
| `ventana_min` | `90` | solape de lectura, en minutos |
| `umbral_reenvio` | `45` | de qué precisión para abajo ya no se reenvía |
| `forzar_desde` | *(vacío)* | ISO para reprocesar una ventana histórica. Solo para pruebas |
| `reset_estado` | `false` | borra la memoria de dedupe. Solo para pruebas |
| `hora_latido` | `18` | hora CST del corte diario (§7) |

**El solape de 90 minutos es deliberado.** La dedupe absorbe lo que se repita; un hueco, en cambio,
pierde una orden de compra para siempre. Se elige el error barato.

## 3. Qué decide qué

**Etapa 1 (determinista).** Suma señales: acto de entrega en el texto +35, buzón de rol o plataforma
de compras +15, folio +15, adjunto +20, remitente externo +5; y resta cotización −30, factura −25,
contrato −20, código de un solo uso −30. Por debajo de 20 el correo ni se mira. Antes de eso hay
descartes duros: lo que viene de `sales@`/`ventas@`, los `[Nuevo Proyecto Confirmado]` que manda el
propio sistema (§17), y cualquier hilo ya marcado como propio — es el candado anti-bucle, sin el cual
el radar se detectaría a sí mismo.

**Etapa 2 (clasificador).** Recibe asunto, remitente, cuerpo y el **texto completo del PDF adjunto**
(hasta 60k caracteres, con recorte por los extremos: el total de una orden vive al final, y el 27% de
los documentos reales tiene 6+ páginas). Devuelve JSON: `es_po`, `es_revision`, `cliente_probable`,
`rfc`, `po_number`, `moneda`, `monto`, `confianza`, `razones`. El prompt es el de SPEC 1.1, con las
correcciones que salieron de medir los 486 PDF reales de FASE A.

**La precisión publicada** es `0.6 × confianza + 0.4 × score`. De 80 para arriba se reenvía como
orden; del umbral (45) para arriba, marcada como probable. Si el clasificador no contesta, **se
reenvía marcada, nunca se ignora** (invariante I6): el sistema falla hacia el lado de molestar, no
hacia el de perder una orden.

## 4. Lo que se rompió al probarlo

Seis corridas contra correo real. Cada una destapó algo que el diseño no había previsto:

**El modo `dry` no era dry (corrida 85362).** No había nada entre `Code - Build sendMail` y
`HTTP - sendMail`: la bandera `_dry` se calculaba y nadie la leía. La primera prueba "en seco" mandó
un correo de verdad. Se agregó el nodo `IF - enviar de verdad?`. Es el modo de falla que ya está
documentado en el CLAUDE.md desde el incidente del kiosk: **una bandera que se calcula pero no se
verifica no protege nada.**

**De dos órdenes en una ventana solo se reenviaba la primera.** `Code - Build sendMail` corría en
modo "todos los items" pero leía `$input.first()`. Con una sola orden en la prueba, el bug era
invisible.

**Un `2026` de boletín contaba como folio (85362).** El regex aceptaba cualquier número de 4+ dígitos
sin contexto, así que un correo de Santander sumaba +15 y se ganaba una llamada al clasificador.
Ahora el número o viene precedido de una palabra de orden de compra, o tiene 5+ dígitos; y un año
suelto nunca es folio. La tasa de paso a etapa 2 cayó de **42% a 19%**.

**La misma orden de GEPP se reenvió tres veces (85450).** La llave de dedupe era folio + nombre del
cliente, y el clasificador escribió ese nombre distinto en cada correo: `BEPUSA (GEPP)`,
`GEPP (Gepp Mexico)`, `BEPUSA (Bebidas Purificadas...)`. Tres llaves para una sola orden.
**El texto libre de un modelo no sirve como llave.** Ahora la llave es folio + **dominio del
remitente**, que es un dato duro del sobre, más una marca por `conversationId` ya reenviado.

**El radar tronaba entero en toda ventana tranquila (85589).** `Code - Resumen` referenciaba
`$('Code - Decidir')` de frente, pero cuando la ventana no trae ningún candidato el
`IF - hay candidatos?` manda el centinela por el atajo y `Code - Decidir` **nunca corre** —
`ExpressionError: Node 'Code - Decidir' hasn't been executed`, corrida abortada. No se había visto
porque todas las pruebas anteriores cayeron, por casualidad, en ventanas con al menos un candidato; y
las ventanas sin candidatos son **la mayoría**. Lo destapó la prueba del latido, no una prueba del
detector. Ahora Resumen toma Decidir dentro de un `try` y, si no corrió, lee su propio `$input`.

**Los adjuntos se perdían y nadie se enteraba (85545).** El mismo correo devolvía 0 adjuntos en dos
corridas y 2 adjuntos en otra. No era intermitencia: era **`429 ApplicationThrottled` de Graph**, y
`neverError: true` lo convertía en un 200 vacío — un reenvío sin el PDF se veía idéntico a un correo
que de verdad no traía archivo. Se quitó `neverError`, se activó reintento 5× con 5 s de espera y se
agruparon las llamadas de 5 en 5. Los fallos pasaron de **6 de 19 a 0**, y `Code - Prep binario`
ahora publica el `statusCode` crudo para que un fallo futuro se vea en el resumen y en el propio
correo reenviado.

Las tres últimas son la misma lección en superficies distintas, y es la que este repo ya tenía
escrita: **medir el efecto en el destino, no el reporte del proceso** (§20 regla 5). Un `success` de
n8n, un `200` de Graph y una bandera `_dry` calculada no prueban nada por sí solos.

## 5. La prueba en vivo

Ventana forzada al 12-ago-2026 15:00 UTC, que es cuando llegó de verdad la orden de GEPP.
Corrida **85564**, `modo_envio: real`:

```
candidatos 19 · revisados 100 · enviados 1 · probables 1 · ignorados 17
fallos_adjunto 0 · adjuntos_enviados 2 · sendmail_ok 2 · sendmail_error 0
```

El correo llegó a `estebandelacruz@fts.mx` a las 20:37 UTC, desde `sales@fts.mx`, con los dos
adjuntos originales y este encabezado:

```
[PO 2688378] BEBIDAS PURIFICADAS S. DE R.L. DE C.V. (Grupo GEPP) — 96%
Folio    2688378
Cliente  BEBIDAS PURIFICADAS S. DE R.L. DE C.V. (Grupo GEPP)
Monto    <monto real, omitido: repo público>
RFC      <RFC del comprador, omitido: repo público>
```

Monto y RFC salieron del PDF (44,347 caracteres de texto) y aquí van omitidos porque este repo es
público y son datos comerciales de un cliente. Lo que importa del caso es que el RFC extraído fue el
del **comprador**, que es justamente el error caro que FASE A midió y que el prompt corregido evita.

Las otras dos copias de esa misma orden — una del buzón automático del cliente y otra reenviada a
mano por una persona de su equipo — quedaron como `duplicado_folio` y no se reenviaron.

## 6. Dos formatos de orden probados, no uno

El detector no está calibrado a un solo cliente. Se probó contra los dos canales por los que llegan
órdenes reales, y los dos salen al 96%:

| Canal | Correo | Folio | Precisión | Adjuntos |
|---|---|---|---|---|
| ERP del cliente (GEPP) | `FYI: BEPUSA - Orden de Compra Standard 2688378, 0` | 2688378 | 96% | 2, PDF de 44,347 caracteres |
| Plataforma de compras (Ariba/GRUMA) | `GRUMA sent a new Purchase Order 7500314675` | 7500314675 | 96% | 2, PDF de 3,290 caracteres |

En la ventana de 100 correos del 10-13 de agosto, ya con el aviso de Ariba silenciado: **12
candidatos, 1 orden reenviada, 0 probables, 0 falsos positivos.**

**Lo que esto NO mide es el recall.** Sabemos que lo que reenvía está bien; no sabemos cuántas
órdenes deja pasar. Eso solo se mide contra un conjunto etiquetado (FASE B, bloqueada) o cruzando
contra las SO confirmadas en Odoo de la misma semana. Ver §8.

## 7. El latido diario

Sin esto no hay forma de saber que el radar sigue vivo: **"hoy no llegaron órdenes" y "el radar está
muerto" se ven idénticos desde la bandeja** — en los dos casos no llega nada. Es el hallazgo #14 del
CLAUDE.md (un feature en bypass silencioso durante semanas porque a nadie le fallaba) esperando a
repetirse.

Cada corrida acumula sus conteos del día en `staticData`. En la primera corrida después de las
**18:00 CST** sale un correo con el corte del día, **aunque no haya habido ninguna orden**:

```
[po_radar] corte del 2026-09-03 · 0 orden(es) · 9 correos

po_radar — corte del 2026-09-03 (sano)
1 corridas · 9 correos revisados · 0 pasaron el primer filtro
0 orden(es) reenviada(s) · 0 probable(s)
Hoy no llegó ninguna orden de compra.

Este correo llega todos los días, aunque no haya órdenes.
Si un día no llega, el radar está caído.
```

Marca **con incidencias** en ámbar si hubo fallos de adjunto o del clasificador. A partir de aquí la
**ausencia** del correo es la alarma, que es la única forma de que el silencio signifique algo.

## 8. Cuándo apuntarlo al grupo, y con qué criterio

Hoy el reenvío va al buzón de Esteban. El destino final es `newordersnotification@fts.mx`, que es un
grupo de distribución: **un falso positivo ahí no cuesta una mirada, cuesta credibilidad.** Un
sistema nuevo que se equivoca en su primera semana se silencia y ya no se vuelve a leer — que es
justo cómo el reconocimiento facial pasó semanas apagado sin que nadie lo notara (hallazgo #14).

Lo que ya está medido, y lo que no:

- **Precisión: buena.** 200 correos de dos ventanas, 2 órdenes reales detectadas al 96%, 0 falsos
  positivos después de silenciar el aviso de Ariba.
- **Recall: sin medir.** No sabemos cuántas órdenes deja pasar, y **esperar no lo mide**: apuntar al
  buzón de Esteban una semana más no dice nada sobre lo que el radar no vio.

Por eso el criterio para el cambio no es "que pase el tiempo" sino esto:

1. **Una semana hábil de operación** con el latido diario en verde, para ver el ruido de una semana
   normal y no solo el de las dos ventanas muestreadas.
2. **Cruce contra Odoo**, que es la única prueba de recall al alcance sin FASE B: toda SO confirmada
   en esa semana tuvo una orden de compra que llegó por correo. Si el radar reenvió una por cada SO
   confirmada, el recall es bueno; las que falten nombran los formatos que faltan por cubrir.

Con esas dos, el cambio es **un campo** del nodo `Set - config`.

## 9. Lo que falta y lo que conviene vigilar

- **El falso positivo diario de Ariba, silenciado.** El digest `Confirm orders from your buyers`
  llega **todos los días a las 11:01 UTC** (medido: 28/29/30-jun, 9/10-jul, 11/12/13-ago…) y se
  reenviaba como probable al 51-57%. No entrega ninguna orden: recuerda confirmar las que ya
  existen. Las órdenes de verdad de esa misma plataforma llegan aparte y **con su folio en el
  asunto**, así que descartarlo no pierde ninguna. Va como descarte duro en etapa 1. También se
  agregó vocabulario de factura en inglés (`invoice`, `scheduled payment`, `remittance`): las notas
  de Ariba pasaban etapa 1 usando el número de cuenta como folio y gastaban una llamada al
  clasificador.
- **No hay bitácora persistente.** El dedupe vive en `$getWorkflowStaticData`, que se pierde si el
  workflow se reimporta. Las tablas `po_radar_bitacora` (`U90obrC1LWxbEhXR`) y
  `po_radar_hilos_propios` (`k8Z8D1bcd2Z6nyBi`) están creadas y reservadas para eso.
- **No hay interfaz.** El MVP es correo a correo; no hay pantalla que validar.
- **El Schedule ya está encendido.** Se activó con `publish_workflow` del MCP `n8n_FTS` — al
  contrario de lo que dice §17 quirk 2, que describe el servidor MCP anterior, este sí activa. El
  read-back que exige la regla dura de §3 quedó en `active: true` · `triggerCount: 1` ·
  `activeVersionId == versionId` (`05dc9693-5683-4410-a98f-c98c11febe81`). Para apagarlo:
  `unpublish_workflow`, o el toggle **Active** en la UI. El Schedule ya disparó solo: corrida
  `85584`, `mode: trigger`, ventana `19:15:27Z → 20:45:27Z`, y descartó los correos que el propio
  radar acababa de mandar — el candado anti-bucle probado en producción, no en teoría.
- **Zona horaria:** el cron es cada 15 minutos, así que el desfase de TZ que sí muerde a los
  Schedule diarios (§18) aquí no aplica.
