# MVP — el workflow que detecta y reenvía órdenes de compra

**Workflow n8n:** `po/radar-detectar (MVP)` · id **`sQ5GYhQTq1UHDt6Y`** · 18 nodos.
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
| `destino` | `estebandelacruz@fts.mx` | a dónde llega el reenvío. **Aquí va `newordersnotification@fts.mx` cuando se abra** |
| `modo_envio` | `real` | `dry` arma el correo completo y **no** lo manda |
| `ventana_min` | `90` | solape de lectura, en minutos |
| `umbral_reenvio` | `45` | de qué precisión para abajo ya no se reenvía |
| `forzar_desde` | *(vacío)* | ISO para reprocesar una ventana histórica. Solo para pruebas |
| `reset_estado` | `false` | borra la memoria de dedupe. Solo para pruebas |

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

Cinco corridas contra correo real. Cada una destapó algo que el diseño no había previsto:

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

## 6. Lo que falta y lo que conviene vigilar

- **Un falso positivo conocido:** el digest `Confirm orders from your buyers` de Ariba se reenvía
  como probable al 51%. Es un aviso administrativo del portal, no una orden. Se deja pasar a
  propósito mientras el sistema es nuevo: en esta etapa conviene ver de más. Si molesta, se ataja
  con una línea en el prompt.
- **No hay bitácora persistente.** El dedupe vive en `$getWorkflowStaticData`, que se pierde si el
  workflow se reimporta. Las tablas `po_radar_bitacora` (`U90obrC1LWxbEhXR`) y
  `po_radar_hilos_propios` (`k8Z8D1bcd2Z6nyBi`) están creadas y reservadas para eso.
- **No hay interfaz.** El MVP es correo a correo; no hay pantalla que validar.
- **El Schedule ya está encendido.** Se activó con `publish_workflow` del MCP `n8n_FTS` — al
  contrario de lo que dice §17 quirk 2, que describe el servidor MCP anterior, este sí activa. El
  read-back que exige la regla dura de §3 quedó en `active: true` · `triggerCount: 1` ·
  `activeVersionId == versionId` (`b99208d3-7039-47be-8d5f-216ad242708d`). Para apagarlo:
  `unpublish_workflow`, o el toggle **Active** en la UI.
- **Zona horaria:** el cron es cada 15 minutos, así que el desfase de TZ que sí muerde a los
  Schedule diarios (§18) aquí no aplica.
