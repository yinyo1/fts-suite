# fts_po_radar — FASE A: calibración contra los PDF reales

**Sesión 1** · 2026-08-31 · issues #142 / #143 · branch `claude/audit-fts-po-radar-9mop6w`
**Alcance:** calibración con historia real. No se construyó el workflow de producción. No se mergeó a main.

Todo número de este documento se midió abriendo los documentos, no se estimó. El método y sus
límites están en §7.

---

## 0. Los cinco números que cambian el diseño

| Hallazgo | Medición | Qué obliga a cambiar |
|---|---|---|
| El RFC **no** es la llave principal de identidad | Coincide con el cliente real en **38.0%** de los PDF con texto | Baja de "paso 1 que resuelve" a "paso de alta precisión y bajo alcance" |
| Un RFC en el PDF puede ser de un tercero | **5.8%** trae un RFC ajeno que **no** es el del cliente | El clasificador tiene que elegir cuál RFC es del comprador, no tomar el primero |
| Las plataformas de compras casi no aparecen | Ariba + Coupa + Concur + SAP = **~9%** de los documentos | Un clasificador por layout de plataforma es inútil; el vocabulario español manda |
| Los documentos son largos | Promedio **24,582 caracteres**, y **27%** tiene 6+ páginas | "Primera página, 4,000 caracteres" del SPEC 1.0 trunca mal |
| No todo adjunto es PDF | **6.0%** son `.html`, `.doc` o foto | El peso "+20 PDF adjunto" castiga POs reales |

---

## 1. Universo medido

Corpus limpio de la sesión 0: SO confirmadas con `x_studio_purchase_order_file`, excluyendo
Galvaprime (520), Racing Cargo (722) y las dos entidades Mondelez padre (7, 749).

**486 documentos, 57 clientes distintos, de 2021-11 a 2026-08.** Se abrieron los 486.

> Nota de corpus: el corpus de la sesión 0 (~490 SO **con folio**) y este (486 SO **con archivo**)
> no son el mismo conjunto. **41 documentos (9.2%) están en SO que no tienen folio registrado en
> Odoo.** Hay archivo sin folio, y también folio sin archivo.

---

## 2. Formatos: qué son realmente los adjuntos

| | Documentos | % del universo |
|---|---|---|
| **PDF** | 457 | **94.0%** |
| `.html` / `.htm` | 17 | 3.5% |
| `.doc` | 8 | 1.6% |
| `.jpg` / `.jpeg` (foto) | 4 | 0.8% |

De los **457 PDF**:

| | Documentos | % de los PDF |
|---|---|---|
| Se abrieron sin error | 457 | **100%** |
| Con texto extraíble | 445 | **97.4%** |
| **Imagen sin texto → requiere OCR** | **12** | **2.6%** |
| Texto pobre (<250 caracteres) | 2 | 0.4% |

**Cero errores de apertura en 457 PDF.** El extractor nativo de n8n (`Extract from File`, operación
`pdf`) es suficiente: no hace falta una librería externa ni un servicio aparte para el 97.4%.

**Volumen:** 1,849 páginas, 10.9 millones de caracteres. Media 24,582 caracteres por documento.
Distribución de páginas: **128 de 1 página (28%) · 209 de 2 a 5 (46%) · 120 de 6 o más (27%)**.

Los 12 que necesitan OCR se concentran: 2 de British American Tobacco, 2 de Johnson Controls,
2 de Magnekon, 1 de Quimitec y 5 repartidos. **No hay ningún cliente cuyo canal sea 100% escaneo**,
así que el OCR es una red de seguridad, no una dependencia de arranque.

---

## 3. Extraibilidad de campos (sobre los 445 PDF con texto)

| Campo | Detectado | % | Lectura honesta |
|---|---|---|---|
| **Folio** (el de Odoo aparece literal en el PDF) | 374 de 404 evaluables | **92.6%** | Fuerte y confiable |
| **Moneda** (token MXN/USD/$/pesos presente) | 413 | 92.8% | Presencia, no extracción correcta |
| **Monto** (patrón total/importe + número) | 420 | 94.4% | Presencia, no extracción correcta |
| **RFC del cliente** (coincide con Odoo) | 169 | **38.0%** | Medido contra el `vat` real |
| **Tax ID / EIN estadounidense** | 0 | **0%** | Ningún documento trae EIN |

**Sobre moneda y monto:** lo medido es que **existe** un token de moneda y un patrón tipo total.
Que el clasificador extraiga el número correcto es otra cosa y **no está validado**: un PO trae
subtotal, IVA, total, precios unitarios y a veces varias monedas. El 92–94% es el techo de
disponibilidad, no la precisión esperada.

**Los 30 folios no hallados (7.4%)** son de clientes cuyo folio en Odoo se capturó con ruido
(el caso `Budenheim Mexico`: 9 documentos, 1 solo folio hallado — Odoo guarda `0004892049` y el PDF
imprime `4892049`, o al revés). Es un problema de normalización de ceros a la izquierda, no de
lectura del PDF. **Confirma la regla del SPEC de conservar los ceros pero comparar también sin ellos.**

---

## 4. Layouts: cuántos hay y cuáles

Marcadores detectados sobre los 445 documentos con texto (un documento puede disparar varios):

### 4.1 Vocabulario: el corpus es español

| Marcador | % de documentos |
|---|---|
| `IVA` / impuesto | **86.3%** |
| `proveedor` | **76.9%** |
| condiciones de pago / payment terms | 68.1% |
| encabezado **"orden de compra"** | **66.1%** |
| encabezado **"pedido"** | **49.0%** |
| encabezado `purchase order` | 42.0% |
| `vendor` / `supplier` | 40.2% |
| enviar a / facturar a | 36.0% |
| ship to / bill to | 35.3% |

### 4.2 Plataformas de compras: son minoría

| Plataforma | Documentos | % |
|---|---|---|
| SAP | 11 | 2.5% |
| Ariba | 10 | 2.2% |
| Concur | 10 | 2.2% |
| Coupa | 10 | 2.2% |
| Odoo (del cliente) | 1 | 0.2% |
| Oracle / E-Business Suite | 0 | 0% |
| Jaggaer | 0 | 0% |

**~9% del corpus viene de una plataforma reconocible.** El otro 91% es el ERP propio del cliente
o un formato hecho a mano. Y **15.1% no dispara ningún marcador de encabezado conocido**.

### 4.3 Conclusión sobre layouts

**No hay "N layouts" discretos que valga la pena enumerar.** Hay un continuo dominado por el
vocabulario español de compras, con una cola larga de formatos propios por cliente. Agrupando por
lo que de verdad discrimina, son **cuatro familias**:

| Familia | Peso | Cómo se reconoce |
|---|---|---|
| **A. ERP del cliente en español** | ~66% | "orden de compra"/"pedido" + proveedor + IVA |
| **B. ERP del cliente en inglés** | ~35% | purchase order + vendor + ship to (se traslapa con A en bilingües) |
| **C. Plataforma de compras** | ~9% | Ariba / Coupa / Concur / SAP |
| **D. Sin marcador reconocible** | ~15% | ni encabezado ni plataforma; incluye los 12 escaneos |

**Consecuencia de diseño:** un clasificador que dependa de reconocer el layout fracasa en el 15% y
no aporta nada en el 91% que no es plataforma. **El clasificador debe leer semántica, no formato.**

---

## 5. La escalera de identidad contra los partners reales

Medido comparando cada RFC hallado en el PDF contra el `vat` real del partner en Odoo, con rollup
por `parent_id`. Catálogo: 1,887 partners.

### 5.1 Paso 1 — RFC

| Resultado | Documentos | % de los 445 con texto |
|---|---|---|
| RFC hallado **y coincide** con el partner | 169 | **38.0%** |
| RFC ajeno hallado pero **NO** coincide | 26 | **5.8%** |
| Ningún RFC útil en el documento | 250 | **56.2%** |

**Precisión del paso 1 cuando dispara: 169/195 = 86.7%. Alcance: 38.0%.**

Ese 5.8% es el hallazgo importante: son documentos donde aparece un RFC que **no es del cliente**
—de la transportista, de la planta receptora, de un intermediario—. Una regla ingenua de "toma el
primer RFC que no sea de FTS" se equivocaría de cliente en 1 de cada 7 veces que cree acertar.

### 5.2 Dónde funciona y dónde no

| Cliente | Docs | Coincide | No coincide | Sin RFC | `vat` en Odoo |
|---|---|---|---|---|---|
| Nalco de Mexico | 84 | **0** | 0 | 84 | sí |
| MONDELEZ MEXICO | 60 | 50 | 7 | 3 | sí |
| British American Tobacco | 56 | 50 | 6 | 0 | sí |
| OXXO | 48 | **0** | 0 | 48 | sí |
| Empacadora San Marcos | 38 | **0** | 0 | 38 | sí |
| Johnson Controls | 22 | 18 | 0 | 4 | sí |
| Mission Foods | 15 | **0** | 0 | 15 | **NO** |
| Hydro Precision Tubing | 15 | **0** | 0 | 15 | sí |
| Budenheim Mexico | 9 | 9 | 0 | 0 | sí |
| BEBIDAS PURIFICADAS | 8 | 8 | 0 | 0 | sí |

**Los cinco clientes de mayor volumen que no imprimen RFC suman 200 documentos = 45% del corpus.**
Nalco (Ecolab) es el cliente #1 por volumen y su PO **nunca** trae el RFC mexicano.

En contraste, **Bebidas Purificadas acierta 8 de 8**: el vínculo GEPP↔Bebidas por RFC que la sesión 0
identificó como la joya de la escalera **sí funciona**, pero solo para ese cliente.

### 5.3 Estado del catálogo de partners

| | Documentos | % |
|---|---|---|
| El partner de la SO es un **contacto-hijo** (`parent_id`) | 197 | **44.3%** |
| El partner **no tiene `vat`** en Odoo | 38 | 8.5% |
| El partner tiene `vat` genérico (`XEXX`/`XAXX`) | 4 | 0.9% |
| `vat` recuperado subiendo al padre | 0 | 0% |
| RFC genérico impreso dentro del PDF | 0 | 0% |

Dos correcciones a lo que asumió la sesión 0:

1. **El rollup por `parent_id` es obligatorio** —44.3% de las SO cuelgan de un contacto-hijo— pero
   **no rescata ningún `vat`**: cuando el hijo no tiene RFC, el padre tampoco. El rollup sirve para
   agrupar, no para completar.
2. **El RFC genérico `XEXX010101000` resultó ser un riesgo teórico, no medido**: aparece en 4
   partners del catálogo pero **en cero documentos**. La lista negra se queda (cuesta nada y el
   partner sí lo tiene), pero deja de ser una alarma.

### 5.4 Veredicto sobre la escalera

El orden del SPEC 1.0 (RFC → dominio → formato de folio → nombre → SO citada) **es correcto en
prioridad pero está mal calibrado en expectativa**. Con RFC solo se resuelve el 38%. El peso real
tiene que recaer en los pasos 2 y 3:

- **Paso 3 (formato de folio) sube a co-principal:** el folio está en el documento el **92.6%** de
  las veces, contra 38% del RFC. Es la señal más disponible que existe.
- **Paso 2 (dominio) es el que hay que construir**, porque es el único que cubre a Nalco, OXXO,
  San Marcos, Mission y Hydro — el 45% que no imprime RFC.

---

## 6. Seguridad: contenido como dato

Se buscó en los 445 documentos texto que pareciera una instrucción dirigida a un modelo
(`ignore previous`, `system prompt`, `you are an AI`, `act as`).

**Resultado: 0 documentos.** Ni un solo intento de inyección en el corpus histórico.

Esto **no** relaja la regla: el corpus histórico es de clientes conocidos, mientras que el detector
en producción abrirá adjuntos de remitentes arbitrarios. La instrucción anti-inyección del prompt
se queda tal cual, y el resultado se registra como línea base: si un día aparece un documento que
la dispare, es novedad y hay que mirarla.

---

## 7. Método y sus límites

**Cómo se leyeron los binarios sin romper nada.** El MCP de Odoo trunca toda columna a 40
caracteres (`ANCHO_MAX_COLUMNA` en `app/format.py`) y tiene `ir.attachment` en denylist dura
(`app/odoo.py`): **no puede entregar binarios, por diseño**. El único camino es n8n. Se construyó un
workflow TMP de solo lectura (`AWig08C604Ymnjfl`, **ya archivado**) que baja los adjuntos por
JSON-RPC, los abre con `Extract from File` y devuelve **solo conteos**. Ningún PDF, ningún texto
crudo y ningún base64 salió de n8n.

**Tres cosas que se descubrieron construyéndolo y que corrigen a CLAUDE.md:**

1. **`$helpers.httpRequest` NO existe en el Code node de esta instancia.** CLAUDE.md §16 lo da por
   funcional; la prueba (ejecución `81421`) devolvió `sin $helpers.httpRequest en este Code node`.
   Todo HTTP tiene que ir por nodos HTTP Request.
2. **La credencial de RPC es `ODOO_RPC_KEY`, no `ODOO_API_KEY`.** Con `ODOO_API_KEY` (40 caracteres,
   presente) `common.authenticate` devuelve `result: false`. `$env` **sí** resuelve en nodos Set.
3. **`Extract from File` con `onError: continueRegularOutput` descarta el JSON original del item.**
   Si el nodo siguiente depende de los metadatos, hay que fusionarlos por índice contra el nodo
   anterior. Sin eso se pierde de qué documento se trataba justo en los casos que fallan.

**Límites de lo medido — lo que estos números NO dicen:**

- **Moneda y monto miden presencia, no extracción correcta** (§3). El 92–94% es un techo.
- **El "RFC coincide" compara contra el `vat` de Odoo**, que puede estar mal capturado. Un
  documento con el RFC correcto frente a un `vat` equivocado en Odoo cuenta aquí como "no coincide".
- **No se probó ningún clasificador.** Este documento calibra qué señales existen; la precisión del
  clasificador de la etapa 2 sigue sin medir y solo se puede medir con el corpus de correos (FASE B).
- **El folio se buscó como coincidencia literal normalizada.** Un folio partido por un salto de
  línea en el PDF cuenta como no hallado; el 92.6% es piso, no techo.
- **Los 12 escaneos no se pasaron por OCR**: se cuentan, no se leen. Que un OCR los resuelva es
  una hipótesis, no un resultado.
