# Trazabilidad por nodos · informe de la sesión 0 (investigación)

**Issue de esta sesión:** [#291](https://github.com/yinyo1/fts-suite/issues/291) · **PR:** [#290](https://github.com/yinyo1/fts-suite/pull/290)
**Rector:** [#127](https://github.com/yinyo1/fts-suite/issues/127) · **Estación 3:** [#244](https://github.com/yinyo1/fts-suite/issues/244) · **Machote:** [#140](https://github.com/yinyo1/fts-suite/issues/140), [#246](https://github.com/yinyo1/fts-suite/issues/246)

**Fecha de medición:** 2026-09-24 (madrugada CST). **Sesión de sólo lectura**: no se escribió
nada en Odoo, ni en Postgres, ni en ningún workflow existente.

> **Este repositorio es PÚBLICO.** Aquí no hay nombres de cliente, importes, RFC ni contactos.
> Todo son números de documento, conteos y porcentajes. El detalle nominal vive en
> `docs/trazabilidad/_privado/` (ignorado por git) y se regenera con
> [`consultas/`](consultas/).

---

## 0 · Lo que hay que saber si sólo se leen diez líneas

1. **La cadena no está rota en un punto: está rota en juntas distintas, y cada junta tiene
   su propia causa.** Tres son de proceso humano, dos son límites de Odoo y dos son huecos
   de la suite. Mezclarlas lleva a arreglar lo que no falla.
2. **El eje analítico ya es el hilo del proyecto**, de hecho y sin que nadie lo decidiera:
   505 órdenes de compra cuelgan de los tres proyectos de ejemplo **por la distribución
   analítica de sus renglones**, y **ninguna** por el campo de cabecera. La recomendación de
   §5 sale de ahí.
3. **`amount_invoiced` de la orden no se puede creer**: 38 de 179 órdenes confirmadas (21 %)
   tienen una inconsistencia de facturación medible, incluida una con **17 veces** su propio
   monto facturado.
4. **El mecanismo nativo de anticipos NUNCA se ha usado** —cero renglones `is_downpayment`
   desde 2025— y ésa es la causa raíz, no un misterio: cada anticipo es una factura manual
   sin liga a la orden.
5. **Las notas de crédito SÍ están ligadas** (13 de 13). Lo que no tiene liga nativa es la
   **refactura**, y para eso ya existe una pista legible: `l10n_mx_edi_cfdi_origin`.
6. **El gasto de tarjeta no aparece en la SO porque en Odoo no puede aparecer**: la tarjeta
   abona a proveedores y el costo con analítica vive en la factura del proveedor. Es un
   límite del modelo, no un error de captura — y se resuelve con el hilo de §5, no
   arreglando la conciliación.
7. **El libro analítico de un proyecto está contaminado**: en el proyecto de ejemplo de
   SO10300, **298 de 444 renglones (67 %) son IVA o base imponible**. Cualquier
   "rentabilidad real" que sume `account.analytic.line` sin filtrar cuenta contable está mal.
8. **El enlace oportunidad ↔ machote sigue en cero por los dos lados**: el campo existe en
   Odoo desde la sesión 1 de la Estación 3 y está vacío en **todos** los leads; la columna
   existe en Postgres y está vacía en **los 24** machotes.
9. **Los cinco compromisos comerciales (pago, hitos, incoterm, entrega, vigencia) están
   construidos y sin estrenar**: 0 de 19 machotes vivos los tienen.
10. **Los viáticos foráneos YA son un candado duro** desde la V1.26/V1.27 — con una
    corrección que conviene conocer: la sede es **el estado de Nuevo León**, no la ciudad de
    Monterrey.

---

## 1 · El universo medido, y por qué éste

**Compañías activas: nueve.** `res.company` (`active = si`), leído el 2026-09-24:

| id | compañía | moneda | ¿entra en la cadena? |
|---|---|---|---|
| 1 | SERVICIOS FTS | MXN | **sí** — es el grueso |
| 6 | FTS FULL TECHNOLOGY SYSTEMS LLC | USD | **sí** — la de EUA |
| 4 | TECNOLOGIAS Y PRODUCTOS YIN | MXN | **no, y hay que decirlo** (abajo) |
| 11 | FTS INDUSTRIAL BRASIL LTDA | BRL | no — 3 cotizaciones borrador, sin ninguna aplicabilidad analítica configurada |
| 2, 3, 5, 8, 10 | personas físicas y un negocio ajeno | MXN | no |

**La sorpresa del alcance: YIN tiene más órdenes confirmadas que FTS.**
`sale.order`, `date_order >= 2025-01-01`, agrupado por `company_id` y `state`:

| compañía | draft | sent | sale | cancel |
|---|---|---|---|---|
| SERVICIOS FTS (1) | 398 | 275 | **143** | 65 |
| FTS LLC (6) | 110 | 20 | **36** | 18 |
| YIN (4) | 39 | 2 | **1,753** | 8 |
| Brasil (11) | 3 | — | — | — |

**Toda la auditoría de abajo es sobre las compañías 1 y 6**, que son las de la cadena
comercial (es el mismo recorte que usa el radar de confirmación). **YIN queda fuera a
propósito y es una decisión que hay que confirmar**: son 1,753 órdenes confirmadas —doce
veces las de FTS— de otra línea de negocio. Si el grafo objetivo pretende cubrir "cada
proyecto", hay que decidir si YIN entra (§8, pregunta 1).

**Universo de la cadena: 179 órdenes confirmadas** (143 + 36) desde 2025-01-01.
**210 facturas de cliente posteadas** (197 `out_invoice` + 13 `out_refund`).
**3,598 órdenes de compra confirmadas.** **6,369 renglones de factura de proveedor.**

**El cliente en disputa legal (partner `250`) NO toca este universo:** 0 de las 179. Sus 50
órdenes confirmadas son anteriores a 2025 o de otra compañía. La exclusión que pide el
encargo para el backfill no le quita nada a la medición.

---

## 2 · La suite, auditada primero

### 2.1 Dónde vive el machote

| pieza | dónde | estado |
|---|---|---|
| Pantalla | `comercial/machote/` (GitHub Pages), V1.42 | en producción, en uso real |
| Motor de cálculo | `comercial/machote/js/calc.js` | 10 renglones fijos de mano de obra + 3 de viaje (V1.26) |
| Reglas / candados | `comercial/machote/js/reglas.js` | **16 duras, 17 blandas** |
| Almacén | Postgres Railway, esquema `comercial` | migraciones `001`–`009` en `db/migrations/comercial/` |
| Escrituras | n8n, prefijo `comercial/` | 11 workflows; la orden y la confirmación ya existen |

**Identidad y versiones.** `comercial.machote` (identidad estable) + `comercial.machote_version`
(**append-only**, una fila por revisión, con el documento congelado en `jsonb`). El id de
pantalla es `id_local` (`M-<epoch>`), **no** la llave: la llave es un uuid y el número con el
que se habla es el `folio` (`COT-000N`), asignado por el servidor con una secuencia.

**Medido hoy** (TMP `OTPD4IG2gZj5AxEs`, tabla `comercial.machote` + última versión de cada uno):

```
machotes no borrados   24      vivos 19      archivados 5
versiones (tabla)      490
dueños distintos        5
con odoo_lead_id        0   ← el enlace con la oportunidad, vacío
con odoo_so_id          2
con odoo_so_name        2
orden_creada_at         2
confirmada_at           1
odoo_project_id         1     odoo_analytic_id 1     odoo_budget_id 1
odoo_partner_id         7   ← 12 de los 19 vivos no tienen cliente del catálogo
```

**Los cinco compromisos comerciales (migración `009`, V1.33): construidos y sin estrenar.**

```
pago_dias 0 · pago_termino_id 0 · pago_hitos 0 · incoterm_code 0
entrega_texto 0 · vigencia_dias 0 · compromisos_at 0      (de 24)
```

**Qué trae el documento del machote** (llaves presentes en la última versión de cada uno):

```
comision_fts 19 · comision_cliente 19 · reparto 19 · margenes 19
empresa_id 23 · moneda 23 · cliente_id 14
pais 11 · region 11 · ciudad 11     ← el bloque de lugar (V1.26)
viaje 8                              ← el bloque de viaje
iva 0                                ← NO EXISTE. El impuesto no está en el machote.
```

### 2.2 Qué de la Estación 3 ya existe, y qué falta para octubre

Construido y **publicado** (leído hoy: `active:true` y `versionId == activeVersionId`):
`comercial/orden-crear-v2` (`H2HOG8LqoYUVg3hU`) y `comercial/confirmar` (`Cyapm1EfPPbTxSi5`).
También `comercial/compuerta` (Compuerta 1 + panel de aprobadores), `comercial/machotes-leer`,
`-guardar`, `-archivar`, `-prestar`, `machotes-control`, `clientes`, `cotizacion`, `db-migrate`.

Uso real hasta hoy: `compuerta_envio` 4 filas, `confirmacion` 2, `handoff` 1,
`documento_orden` 0. Es decir: **la maquinaria existe y sólo se ha ejercido en pruebas.**

| candado de octubre | ¿existe hoy? | dónde falta |
|---|---|---|
| El portal jala todo del machote | **sí** | pantalla `#/confirmar` (V1.32) |
| Anexar PO del cliente y **cuadrar al centavo** | **no** | el machote no tiene campo de PO; Odoo sí (`x_studio_purchase_order_number` + `_file`) |
| Cuenta analítica con MO y materiales del machote | **parcial** | `comercial/confirmar` crea analítica y budget; el desglose por rubro existe (plan 20) |
| Teléfono y correo del contacto, obligatorios | **no** | `equipo_cliente` sólo guarda nombre y porcentaje |
| Contacto de finanzas / reglas de pago del cliente | **no** | — |
| Días de pago obligatorios antes de enviar | **construido, sin usar** | `pago_dias` (migración 009) + Compuerta 1 |
| Anticipo obligatorio arriba de un monto, con % | **no** | ver §4: el camino nativo existe y no se usa |
| La cotización dice si lleva IVA y cuánto | **no** | el documento no tiene llave `iva` (0 de 24) |
| Leyenda obligatoria cuando no incluye impuestos | **no** | — |
| Tax de EUA sugerido por estado y ciudad | **no** | el machote ya sabe país/región/ciudad (11 de 24) |
| **Viáticos obligatorios fuera de la sede** | **sí, y es candado DURO** | regla `viaje-sin-resolver`. ⚠️ la sede es **Nuevo León**, no Monterrey |
| Adicionales como orden nueva ligada al padre | **no** | no hay campo de orden padre |
| Sólo el dueño edita su machote | **sí** | dueño del token + préstamo con tope de 24 h (migración 005) |
| Comisiones sólo desde un módulo aparte | **no** | hoy viven en el machote y en `budget.line` (plan 20) |
| Gasto MX con Jeeves / EUA con Chase | **no** | los diarios existen (61 · 122/123/73); no hay candado |

### 2.3 Los módulos vecinos que tocan la cadena

- **Conciliación de tarjeta** (`fin/captura-*`, Jeeves diario 61): **ver §4.3**, es la
  pregunta de Felipe y tiene respuesta estructural.
- **Nómina a analíticas** (Carga MO, `HV1UE5JxN5fKdC2Y` dry-run y `j0V9wfpuPTLFO9DZ` write):
  escribe `account.analytic.line` **sin cuenta contable**, con el proyecto en `account_id` y
  el rubro "2.1 Mano de Obra" en `x_plan20_id`. Medido: **790 renglones así desde 2025**, de
  los cuales **524 (66 %) no llevan proyecto** — son las bolsas indirectas, por diseño.
- **Rentabilidad** (`fin/rentabilidad`, `fin/rentabilidad-motor`): lee `project.project` +
  `budget.line` + `account.analytic.line`. **Hereda la contaminación de §3.7.**
- **Watchdog / semáforo** (`ops/watchdog-semaforo`, `29eaGe2wkS98lRMU`): ya manda dos correos
  diarios con dos semáforos. Es el sitio natural del watchdog de ligas rotas (§5.5).
- **Login**: `auth/suite-login` con JWT y scopes (`comercial:read`, `comercial:admin`).

---

## 3 · La auditoría de datos, arista por arista

Todo lo de abajo es `2025-01-01 → 2026-09-24`, compañías **1 y 6**, y cada renglón lleva el
modelo, el dominio y el campo de donde salió. Los guiones están en
[`consultas/`](consultas/).

### 3.1 Tabla de aristas

| # | arista | denominador | rotas | % | modelo · campo | causa probable |
|---|---|---|---|---|---|---|
| 1 | cotización → oportunidad | 1,065 cotizaciones | 367 | **34 %** | `sale.order.opportunity_id = false` | la orden nace suelta; sólo se liga si se creó desde el lead |
| 1b | idem, sólo confirmadas | 179 | 68 | **38 %** | idem + `state = sale` | igual, y aquí duele más |
| 2 | oportunidad → varias cotizaciones | 483 oportunidades con cotización | — | — | `read_group` por `opportunity_id` | 698 cotizaciones en 483 oportunidades ⇒ **≥215 son la 2ª o posterior**. La cardinalidad 1→N del grafo objetivo **se cumple** |
| 3 | machote → oportunidad | 24 machotes | **24** | **100 %** | `comercial.machote.odoo_lead_id` | nunca se construyó ninguna de las dos mitades |
| 3b | oportunidad → machote (lado Odoo) | todos los leads | **todos** | **100 %** | `crm.lead.x_studio_machote_folio` | el campo existe desde la sesión 1 y **nadie lo escribe** |
| 4 | machote → cotización | 19 machotes vivos | 17 | **89 %** | `comercial.machote.odoo_so_id` | sólo 2 órdenes se han creado desde la suite |
| 5 | SO confirmada → proyecto (nativo) | 179 | 41 | **23 %** | `sale.order.project_id = false` | — |
| 5b | SO confirmada → proyecto (Studio del radar) | 179 | 134 | **75 %** | `x_studio_project_id_created_1 = false` | el radar sólo corre desde 2026-05-01 |
| 5c | **sin ninguno de los dos** | 179 | **28** | **16 %** | ambos `= false` | **hay dos aristas parciales y ninguna completa** |
| 6 | SO confirmada → cuenta analítica | 179 | 41 | **23 %** | `sale.order.project_account_id = false` | idéntico al 5: el proyecto y la analítica nacen juntos |
| 6b | SO → analítica por el campo Studio viejo | 179 | 166 | **93 %** | `x_studio_analytic_account` poblado en 13 | campo muerto que duplica al nativo |
| 7 | SO confirmada → número de PO del cliente | 179 | 57 | **32 %** | `x_studio_purchase_order_number` vacío o `''` | se captura a mano, no es obligatorio |
| 8 | SO confirmada → archivo de la PO | 179 | 39 | **22 %** | `x_studio_purchase_order_file_filename = false` | **20 órdenes tienen archivo y NO tienen número** (medido, no deducido: 8 en la 1 y 12 en la 6) |
| 9 | SO confirmada → términos de pago | 179 | 51 | **28 %** | `payment_term_id = false` | ya reportado en la sesión 3 de #244 |
| 10 | factura de cliente → origen (texto) | 210 | 34 | **16 %** | `invoice_origin` vacío | factura manual |
| 11 | **renglón de factura → renglón de orden** | 352 renglones producto | **95** | **27 %** | `account.move.line.sale_line_ids = false` | **anticipos y facturas manuales — la causa de §3.2** |
| 11b | idem, contado por factura | 210 facturas | **53** | **25 %** | ≥1 renglón sin liga | — |
| 12 | NC → factura original | 13 `out_refund` | **0** | **0 %** | `reversed_entry_id` | **la arista nativa funciona: 13 de 13** |
| 13 | refactura → factura original | — | **no existe la arista** | — | — | Odoo no liga la factura de reemplazo. Pista: `l10n_mx_edi_cfdi_origin` (`01\|uuid`, `07\|uuid`) |
| 14 | orden de compra → proyecto | 3,598 POs | **3,598** | **100 %** | `purchase.order.project_id = false` | el campo nativo **jamás** se usa |
| 14b | orden de compra → SO (campo Studio) | 3,598 | 2,537 | **71 %** | `x_studio_many2one_field_LFiHc` poblado en 1,061 | sólo compañía 1; en la 6 es 0 |
| 14c | orden de compra → proyecto (Studio) | 3,598 | 2,462 | **68 %** | `x_studio_many2one_field_SNpub` poblado en 1,136 | — |
| 15 | **renglón de PO → analítica** | 7,512 renglones | 2,375 | **32 %** | `analytic_distribution = false` | ésta es la arista que **sí** sostiene el grafo de costo |
| 16 | **renglón de bill → renglón de PO** | 6,369 renglones producto | **143** | **2 %** | `purchase_line_id = false` | **la arista más sana de toda la cadena** |
| 17 | renglón de bill → analítica | 6,369 | 234 | **4 %** | `analytic_distribution = false` | la Automation Rule A3 hace su trabajo |
| 17b | renglón de bill → **proyecto** (plan 1 o 18) | 6,369 | **3,754** | **59 %** | `distribution_analytic_account_ids.root_plan_id in (1,18)` → 2,615 con proyecto | lleva analítica pero **de rubro o indirecto**, no de proyecto |
| 18 | **gasto de tarjeta → analítica** | 8,898 renglones (diarios 61·73·122·123) | **8,898** | **100 %** | `analytic_distribution = false` | **no es un error: ver §4.3** |
| 19 | mano de obra → proyecto | 790 renglones analíticos de Carga MO | 524 | **66 %** | `account.analytic.line.account_id = false` | por diseño: son las bolsas indirectas |
| 20 | cobro → factura | 180 cobros de cliente | **3** | **2 %** | `account.payment.is_reconciled` | — |
| 21 | pago a proveedor → documento | 1,091 pagos `in_process` | 306 | **28 %** | `is_reconciled` vacío | — |

### 3.2 La hipótesis 3, medida: `amount_invoiced` no se puede creer

Se evaluaron las 179 órdenes confirmadas con **seis reglas mecánicas** sobre los campos
`amount_total`, `amount_invoiced`, `amount_to_invoice`, `invoice_count` e `invoice_status`:

| regla | qué detecta | órdenes |
|---|---|---|
| **A** | `facturado > total` | **8** |
| **B** | `por facturar` negativo | **1** |
| **C** | `facturado + por facturar > total` | **11** |
| **D** | estado «facturado» con facturado en cero | **2** |
| **E** | **tiene facturas y `facturado = 0`** | **17** |
| **F** | `facturado + por facturar < total` teniendo facturas | **2** |
| | **órdenes distintas afectadas** | **38 de 179 = 21 %** |

El caso extremo de la regla A factura **17 veces** el monto de su propia orden. Otras tres
órdenes distintas tienen `invoice_status = 'invoiced'` con cero facturado, o `to invoice` con
cero pendiente.

**El mecanismo, aislado sobre un caso completo** (`INV1854` de SERVICIOS FTS, 21 renglones
producto):

- `invoice_origin` dice la orden correcta;
- el importe cuadra **al centavo** con el `amount_to_invoice` de esa orden;
- la distribución analítica apunta a la cuenta analítica de esa misma orden;
- y **los 21 renglones tienen `sale_line_ids` vacío**.

Por eso Odoo dice que la orden tiene cero facturado teniendo una factura pagada por su
importe exacto. **`invoice_origin` es texto y no cuenta; `sale_line_ids` es la relación y es
la que Odoo suma.**

⚠️ **Dos trampas del instrumento**, medidas, que hay que respetar en cualquier script futuro:

1. **`amount_invoiced` y `amount_to_invoice` NO son filtrables** (no están almacenados):
   un dominio que los use tira un error del ORM. Hay que leerlos y comparar fuera.
2. **El nombre de una factura NO es único.** Las diez que pidió revisar el encargo
   devolvieron **dos registros cada una**: una de YIN de 2025 y otra de SERVICIOS FTS de
   2026. Cualquier consulta por `name` **tiene que llevar `company_id`**, y cualquier
   backfill que case por número de documento sin compañía casaría mal.

### 3.3 Las hipótesis, una por una

| # | hipótesis | veredicto | evidencia |
|---|---|---|---|
| 1 | Facturas sin SO ligada | **confirmada, y es peor de lo que parecía** | 27 % de los renglones y 25 % de las facturas. El caso que se citó tiene origen, importe exacto y analítica correcta — y aun así cero liga |
| 2 | Refacturas y NC sueltas | **mitad y mitad** | las **NC sí** están ligadas (13 de 13, `reversed_entry_id`). La **refactura no tiene arista nativa**; sí tiene rastro en `l10n_mx_edi_cfdi_origin` |
| 3 | `amount_invoiced` no confiable | **confirmada** | 38 de 179 (21 %) con al menos una inconsistencia |
| 4 | 294 cobros `in_process` sin aplicar | **NO confirmada como problema de aplicación** | de 91 cobros de cliente `in_process`, **90 están aplicados**. `in_process` es un estado, no una falta de aplicación. Lo que sí hay: **306 pagos a proveedor** sin conciliar |
| 5 | La PO del cliente vive en `x_studio_purchase_order_number` | **confirmada** | el campo existe con su binario y su nombre de archivo, y está poblado en el 68 % de las confirmadas |
| 6 | En Odoo 16 la liga factura→SO era un many2many manual perdido en la migración | **no verificable desde aquí** | la instancia es 19 y no guarda el rastro del modelo viejo. Hoy la relación nativa `sale_line_ids` existe y funciona cuando la factura se crea **desde** la orden |

### 3.4 Lo que el eje analítico ya sostiene, sin que nadie lo decidiera

Para los tres proyectos de ejemplo:

- órdenes de compra ligadas por el **campo de cabecera** (`x_studio_many2one_field_LFiHc`): **0**
- órdenes de compra ligadas por `project_id` nativo: **0**
- órdenes de compra cuyos **renglones** llevan la analítica del proyecto: **505**

`purchase.order.line`, dominio `[['distribution_analytic_account_ids','in',[3034,3101,668]],
['state','=','purchase']]`, agrupado por `order_id` → **505 grupos**.

**El grafo de costo ya existe y su arista es la distribución analítica del renglón.** Ninguna
de las dos aristas de cabecera aporta nada hoy. Eso es lo que decide la recomendación de §5.2.

### 3.5 Los 19 planes analíticos, y una fragilidad que conviene conocer

`account.analytic.plan`: **19 planes, todos con `parent_id` vacío** (no hay jerarquía) y
**todos `optional`** — las 135 filas de `account.analytic.applicability` son `optional`, **cero
`mandatory`**. O sea que **ningún candado analítico es nativo**; el único que existe es la
Automation Rule A3 (Python), que es lo que CLAUDE.md §17 documenta.

La columna `account_id` de `account.analytic.line` es la del plan de **menor `sequence`**, y
hay **un empate**: el plan 1 («Gasto Directo a proyectos») y el plan 22 («GASTOS FINANCIEROS
USA») tienen los dos `sequence = 10`. Hoy gana el 1 —se comprueba porque existe `x_plan22_id`
y **no** existe `x_plan1_id`—, pero **un empate es una moneda al aire**: si alguien reordena
los planes, `account_id` podría pasar a significar otra cosa en todo el histórico, sin aviso
y sin error. Vale la pena separar esas secuencias (§8, pregunta 6).

### 3.6 Los tres árboles

El detalle está en [`ARBOLES.md`](ARBOLES.md). El resumen:

| | SO11547 | SO11771 | SO10300 |
|---|---|---|---|
| oportunidad | ✅ | ❌ **rota** | ✅ |
| machote | ❌ (anterior a la suite) | ❌ | ❌ |
| `project_id` nativo | ❌ **rota** | ✅ | ✅ |
| proyecto del radar (Studio) | ✅ | ✅ | ❌ (anterior al radar) |
| `project.sale_order_id` nativo | ❌ | ❌ | ✅ |
| número de PO del cliente | ❌ **rota** (sí hay archivo) | ✅ | ✅ |
| términos de pago | ✅ | ❌ **rota** | ✅ |
| facturas ligadas por `sale_line_ids` | 0 de 2 | — (no hay) | 1 de 6 |
| presupuesto con montos reales | ✅ 11 renglones | ❌ **esqueleto `−1`** | ✅ 5 renglones |
| `achieved` del budget vs costo real | **0.9 %** | 0 % | **42 %** |
| ingreso en el libro analítico | ❌ **cero** | — | ✅ |
| POs ligadas por cabecera | 0 | 0 | 0 |

### 3.7 El hallazgo que no estaba en las hipótesis: el libro analítico está contaminado

`account.analytic.line` del proyecto de SO10300 (cuenta `668`), **444 renglones**:

| cuenta contable | renglones | qué es |
|---|---|---|
| 899.01.99 Base Imponible de Impuestos | **150** | ruido de importe cero |
| 119.01.01 IVA pendiente de pago | **97** | **IVA dentro del proyecto** |
| 118.01.01 IVA acreditable pagado | **51** | **IVA dentro del proyecto** |
| 601.84.01 Otros gastos generales | 113 | el costo de verdad |
| (sin cuenta) | 16 | mano de obra de Carga MO |
| 2023.34 Egreso Nóminas | 8 | nómina |
| 401.01.01 Ventas | 7 | el ingreso |
| 2023.51 Comisiones Clientes | **1** | **una comisión cargada como costo de proyecto** |
| 201.01.01 Proveedores | 1 | una línea de pasivo |

**298 de 444 (67 %) son IVA o base imponible.** Y hay una comisión capturada como gasto del
proyecto — justo lo que la junta de octubre prohíbe, con un caso vivo.

En el otro extremo: la cuenta analítica de **SO11547 no tiene un solo renglón de ingreso**
(cero en 401.01.01) aunque sus dos facturas están pagadas. El costo sí llegó. O sea que el
P&L de ese proyecto, leído del libro analítico, muestra una pérdida que no existe.

**Consecuencia para el diseño:** cualquier lectura de "estado financiero real" tiene que
filtrar por cuenta contable y no confiar en el saldo de la cuenta analítica.

---

## 4 · Causa raíz, separada en tres cubetas

El encargo pide distinguir proceso humano, límite de Odoo y hueco de la suite. Mezclarlas es
lo que hace que se arregle lo que no falla.

### 4.1 Proceso humano (se arregla con candados, no con código nuevo)

| arista rota | dónde exactamente se rompe | señal medible |
|---|---|---|
| cotización sin oportunidad (38 % de las confirmadas) | la orden se crea desde el módulo de ventas, no desde el lead; nadie la liga después | `create_uid` de las confirmadas se concentra en tres usuarios de captura; ninguno es el comercial que cotizó |
| PO del cliente sin número (32 %) / sin archivo (22 %) | se captura a mano después de confirmar, cuando ya nadie la necesita | 20 órdenes tienen el archivo **y no** el número: alguien adjuntó y no tecleó |
| términos de pago vacíos (28 %) | el campo no bloquea nada al confirmar | ya estaba reportado en #244 sesión 3 |
| comisión cargada como gasto de proyecto | captura contable | 1 caso vivo en el proyecto de SO10300 |
| gasto de proyecto en la tarjeta equivocada | no hay candado por diario | 4 diarios activos, ninguna regla |

**El anticipo manual merece su propio renglón porque es el de mayor impacto.** Medido: **cero
renglones `is_downpayment` desde 2025**. El asistente nativo de anticipos de Odoo crea un
renglón en la orden y una factura **cuyos renglones sí traen `sale_line_ids`**. Nadie lo usa:
cada anticipo es una factura tecleada. De ahí salen casi todas las facturas sin liga, el
`amount_invoiced` en cero y las reversiones posteriores (`INV2019`, `INV2020`, `INV2024`).
**Esto no es un defecto de Odoo: es un camino que existe y no se toma.**

### 4.2 Límite de Odoo (no se arregla con disciplina; hay que rodearlo)

1. **No existe arista `refactura → factura original`.** Reversar y refacturar deja ligada la
   NC (`reversed_entry_id`) pero la factura nueva nace huérfana. Lo único que las une es el
   CFDI (`l10n_mx_edi_cfdi_origin`, con `01|uuid` para NC y `07|uuid` para aplicación de
   anticipo). Sirve para reconstruir, no para navegar.
2. **No existe arista `costo → orden de venta`.** Ni siquiera conceptualmente: el costo vive
   en la analítica y la orden sólo conoce el margen de sus propios renglones. **Cualquier
   "cuánto llevo gastado de esta SO" pasa por el proyecto y su cuenta analítica.**
3. **`amount_invoiced` y `amount_to_invoice` no son almacenados**: no se pueden filtrar, así
   que ningún watchdog puede preguntarlos en un dominio.
4. **`has_invalid_analytics` tampoco es filtrable.** `analytic_coverage` **sí** lo es — y es
   el único indicador analítico nativo utilizable en un dominio (36,576 renglones con
   cobertura menor a 100 en el periodo).
5. **`project.project.account_id` está atado al plan 1.** Los proyectos de EUA, cuyo eje es
   el plan 18, no caben en esa columna; es la raíz del hallazgo del radar en #244.
6. **El nombre de documento no es único entre compañías.**

### 4.3 La pregunta de Felipe, respondida

> *"Aunque se concilien gastos desde la suite, no aparecen cargados en las SO."*

**Es cierto, y no es un error de la conciliación.** El asiento que crea la captura de Jeeves
tiene dos renglones, leídos hoy:

```
debe   201.01.01 Proveedores nacionales      ← se concilia contra la factura del proveedor
haber  102.01.007 Jeeves Tarjeta Credito     ← la tarjeta
```

Ninguno lleva analítica, y **es correcto que no la lleve**: el asiento paga un pasivo, no
registra un gasto. El gasto con su analítica vive en la **factura del proveedor**, y de ahí
sí llega al proyecto. Medido: sólo el 4 % de los renglones de bill no tiene analítica.

Entonces el gasto **sí** llega al proyecto y **nunca** llega a la SO, porque —punto 2 de
arriba— esa arista no existe en Odoo. Lo que Felipe ve es real; lo que falta no es
conciliación sino **el hilo del proyecto y una pantalla que lo lea**.

Con dos matices medidos que sí son problema:
- **306 pagos a proveedor `in_process` sin conciliar**: ahí el gasto no tiene bill y por lo
  tanto no tiene analítica ni proyecto.
- **59 % de los renglones de bill llevan analítica pero no de proyecto** (van a rubro o a
  indirecto). El costo existe, está clasificado, y no le pega a ningún proyecto.

### 4.4 Hueco de la suite (lo que toca construir)

1. **El enlace oportunidad ↔ machote**: las dos mitades siguen en cero.
2. **El machote no tiene PO del cliente**, así que la validación "al centavo" de octubre no
   tiene contra qué compararse dentro de la suite.
3. **El machote no tiene impuesto**: ni bandera de IVA, ni leyenda, ni tax de EUA.
4. **El machote no tiene contacto del cliente** con teléfono y correo.
5. **No hay orden padre** para los adicionales.
6. **No hay candado de anticipo** por monto.
7. **Lo construido y sin estrenar** (los cinco compromisos) no es un hueco de código sino de
   despliegue: está y nadie lo usa.

---

## 5 · Propuesta de diseño del módulo de Confirmación (sin construir)

### 5.1 Contrato de datos

El detalle está en [`CONTRATO-CONFIRMACION.md`](CONTRATO-CONFIRMACION.md). En una frase: la
Confirmación **no recibe campos sueltos, recibe el folio del machote y la versión**, y todo
lo demás lo lee del documento congelado — la misma regla que ya siguen `orden-crear-v2` y
`confirmar`.

### 5.2 El hilo del proyecto: tres candidatos y una recomendación

| candidato | robustez | costo en SaaS | fricción | resiste actualizaciones |
|---|---|---|---|---|
| **A · la cuenta analítica como hilo** | **alta**: ya la usan 505 POs, los bills, la nómina y el budget | **cero** | baja: ya existe | **sí**, es modelo nativo |
| B · el proyecto como hilo | media: `project.project` no viaja a bills ni a la analítica de EUA | cero | media | sí |
| C · un id propio de la suite propagado por n8n | alta en la suite, **nula en Odoo**: nada nativo lo hereda | un campo Studio por modelo | **alta**: hay que escribirlo en cada nodo | frágil: 4+ campos Studio que mantener |

**Recomendación: A, la cuenta analítica, con el proyecto como su cara visible.**

Por qué:
- **Ya es el hilo de hecho.** No hay que convencer a nadie ni migrar nada: 505 órdenes de
  compra, todos los bills y toda la nómina ya cuelgan de ahí.
- Es **nativa**, así que la heredan solas la PO → el bill → el asiento → `analytic.line`.
- Cuesta cero en SaaS y no agrega campos Studio que mantener.
- Y tiene el atributo que ningún otro candidato tiene: **un nodo nuevo la hereda sin que
  nadie lo programe**.

Con tres precisiones que la vuelven segura:

1. **El eje depende de la compañía**: plan 1 en México, plan 18 en EUA. Se resuelve **en
   vivo leyendo `root_plan_id`**, nunca con una tabla escrita a mano (es el hallazgo 1 de la
   sesión 2 de #244).
2. **La analítica no reemplaza al identificador de negocio.** El número que la gente lee
   sigue siendo el folio `COT-` y el `SOxxxxx`. El hilo es para las máquinas.
3. **Hace falta UNA arista que la analítica no da: `analítica → machote`.** Es un campo
   Studio en `account.analytic.account` con el folio del machote — **una** excepción a la
   regla de no crear campos Studio, del mismo tipo que la que ya se aceptó para
   `crm.lead.x_studio_machote_folio`.

### 5.3 Cómo hereda cada nodo aguas abajo

| nodo | cómo recibe el hilo | ¿automático? |
|---|---|---|
| SO → proyecto y analítica | los crea la Confirmación | sí, es el acto de confirmar |
| SO → factura | **por el asistente nativo de anticipos y por «crear factura» desde la orden** | sí, y ahí se arregla `sale_line_ids` gratis |
| proyecto → PO | `analytic_distribution` en el renglón, sembrada desde el proyecto | hoy manual; se puede sembrar con `account.analytic.distribution.model` |
| PO → bill | `purchase_line_id` nativo | **sí, ya funciona al 98 %** |
| bill → asiento → `analytic.line` | nativo | sí |
| tarjeta → bill | conciliación | sí |
| nómina → proyecto | Carga MO ya escribe `account_id` | sí |
| adicional → orden padre | **no existe**: hay que crearlo | ver §5.4 |

### 5.4 Qué candado va dónde

**En la suite (bloquean antes de que exista el problema):**
PO del cliente con archivo y número · cuadre al centavo contra el machote · contacto con
teléfono y correo · días de pago · anticipo por monto con porcentaje · decisión de IVA y
leyenda · viáticos foráneos *(ya existe)* · sólo el dueño edita *(ya existe)*.

**En la configuración de Odoo (cero código):**
- **Retirar el botón Confirmar**: `invisible` en el propio botón vía Studio, condicionado para
  que Esteban lo conserve. Es lo que ya documenta CLAUDE.md §17 quirk 4. **Sólo esconde la
  UI**, que es justo lo que se quiere: la API la sigue usando la suite.
- **Candado duro opcional**: una `ir.rule` global de `perm_write` sobre `sale.order` que
  impida dejar una orden en `state = sale` si no trae la marca de la suite. Es el mismo
  mecanismo de la `ir.rule` 815 que ya bloquea el PAID manual del diario 61. ⚠️ **No se
  instala sin probarlo con el flujo real corriendo**: la lección de la 814 es que el momento
  en que un campo se puebla **no se deduce, se comprueba** (CLAUDE.md §9).
- **Aplicabilidad analítica**: hoy las 135 filas son `optional`. Pasar el eje de proyecto a
  `mandatory` en `bill` y `purchase_order` para la compañía 1 es cero-código y atacaría el
  59 % del §3.1/17b — pero **exige antes el bucket "sin proyecto"**, o bloquea los
  indirectos legítimos (es el análisis A3 de CLAUDE.md §17).

**Lo que sólo se detecta después (watchdog):**
factura sin `sale_line_ids` · refactura sin su original · PO sin analítica · bill sin PO ·
pago sin conciliar · proyecto sin ingreso en su analítica · presupuesto esqueleto (`−1`) ·
comisión cargada como gasto · gasto de proyecto en el diario de la otra compañía.

### 5.5 Watchdog diario de ligas rotas

Entra como **tercer semáforo** de `ops/watchdog-semaforo` (`29eaGe2wkS98lRMU`), que ya manda
dos correos a las 8:00 CST y ya tiene el patrón de umbrales en
`shared/operaciones/sla_stages.json`.

Mide **sobre las órdenes confirmadas de los últimos 90 días**, una fila por orden:

| señal | verde | amarillo | rojo |
|---|---|---|---|
| oportunidad ligada | sí | — | no |
| proyecto y analítica | los dos | uno | ninguno |
| PO del cliente (número **y** archivo) | los dos | uno | ninguno |
| términos de pago | sí | — | no |
| facturas con `sale_line_ids` | 100 % | ≥ 1 y < 100 % | 0 % teniendo facturas |
| cuadre de facturación (reglas A–F de §3.2) | ninguna dispara | F | A, B, C, D o E |
| ingreso en el libro analítico | > 0 teniendo factura pagada | — | 0 |
| presupuesto | con montos | sólo ingreso | esqueleto `−1` |

**Verde global** sólo si todas están en verde. **Y la regla que hace que el semáforo sirva:
el rojo nombra la orden y el campo, no un porcentaje.** Un tablero que dice "83 % de
cumplimiento" no lo arregla nadie; uno que dice "SOxxxxx: sin términos de pago" sí.

⚠️ **Dos restricciones medidas para quien lo construya:** `amount_invoiced` no se puede poner
en un dominio (hay que leer y comparar), y `has_invalid_analytics` tampoco. `analytic_coverage`
sí.

---

## 6 · Backfill 2025-2026 · estrategia, sin ejecutar

**Nada de esto se ejecuta en esta sesión.** Es la estrategia para una sesión posterior, con
respaldo previo, dry-run y revisión de Gerardo antes de cualquier escritura.

**Exclusión obligatoria:** el cliente en disputa legal (partner `250`) se separa en su propio
lote y **no se toca**. Medido: no aparece en las 179 órdenes del periodo, así que la exclusión
no le quita nada al alcance.

### 6.1 Qué se puede casar, y con qué

| arista a reparar | señales disponibles | cuántas |
|---|---|---|
| factura → orden | `invoice_origin` (texto), `ref`, importe exacto, analítica de la factura, cliente, fecha | 53 facturas |
| refactura → original | `l10n_mx_edi_cfdi_origin` (`01\|uuid`, `07\|uuid`), importe, cliente, secuencia de fechas | por censar |
| PO → orden | analítica del renglón, cliente final, fecha | 505 POs sólo en los 3 ejemplos |
| orden → oportunidad | cliente + ventana de fechas + descripción | 68 confirmadas |

### 6.2 Score de confianza

Suma de evidencias independientes, y **ninguna evidencia vale por sí sola**:

| evidencia | puntos |
|---|---|
| importe **exacto al centavo** y misma moneda | 40 |
| `invoice_origin` o `ref` cita el número de la orden | 30 |
| la distribución analítica apunta a la analítica de esa orden | 20 |
| mismo cliente | 10 |
| fecha dentro de los 120 días de la orden | 10 |
| el número de PO del cliente coincide | 20 |
| **penalización**: la orden ya está cubierta al 100 % por otras facturas | −40 |
| **penalización**: hay más de un candidato con el mismo score | −30 |

| umbral | acción |
|---|---|
| ≥ 80 y candidato único | **auto-proponer** (sigue necesitando el clic de un humano) |
| 50 – 79 | **revisar** una por una |
| < 50 | **descartar** y dejarlo anotado |

**La trampa a evitar, que ya nos mordió antes** (CLAUDE.md §20 #8): una hipótesis validada
con un caso no está validada. El importe exacto parece definitivo y **no lo es** — el propio
encargo cita un caso donde dos órdenes distintas tienen el mismo monto. Por eso el importe
vale 40 y no 100, y por eso hay penalización por empate.

### 6.3 Cómo se prueba antes de escribir

1. **Respaldo** de los registros a tocar, como el `dump-pre-limpieza` que ya se hizo en #131.
2. **Dry-run** que escribe el plan a una tabla de la suite y **no toca Odoo**.
3. **Control del instrumento** (CLAUDE.md §20 #19): se le da de comer al matcher **diez
   parejas que ya están bien ligadas** y tiene que reconocerlas con score alto. Un matcher
   que nunca encuentra nada da exactamente el mismo resultado que uno que funciona sobre
   datos limpios.
4. **Revisión de Gerardo** sobre el plan, no sobre el resultado.
5. Escritura **por lotes pequeños con read-back**, el patrón de `comercial/db-migrate`.

⚠️ **Y un aviso que vale oro para quien lo construya:** casar por número de documento **sin
compañía** produce parejas falsas. Las diez facturas que pidió revisar el encargo devolvieron
dos registros cada una, una de YIN y otra de SERVICIOS FTS.

---

## 7 · Encaje en el roadmap (#127)

| pieza | estación | ¿octubre? | depende de |
|---|---|---|---|
| Enlace oportunidad ↔ machote (las dos mitades) | 3.x | **sí, primero** | nada. Es el paso cero que lleva pendiente desde #244 |
| PO del cliente en el machote + cuadre al centavo | 3.x | **sí** | enlace anterior |
| Contacto del cliente con teléfono y correo | 2.x (campo) / 3.x (candado) | **sí** | nada |
| Días de pago obligatorios al enviar | 3.x | **sí** — ya construido, falta encenderlo | Compuerta 1 |
| Anticipo por monto **usando el asistente nativo** | 3.x | **sí** | decisión de §8 pregunta 3 |
| Decisión de IVA + leyenda obligatoria | 2.x | **sí** | nada |
| Retirar el botón Confirmar en Odoo | configuración | **sí** | que la Confirmación esté en producción |
| Analítica con MO y materiales del machote | 3.x | **sí** — existe, hay que quitarle el esqueleto `−1` | — |
| Viáticos foráneos | 2.x | **ya está** | — |
| Tax de EUA por estado y ciudad | 2.x | **no** — después | catálogo de tasas |
| Adicional ligado a su orden padre | 3.x | **no** — después | campo nuevo |
| Watchdog de ligas rotas | 3.x | **no** — después, pero pronto | que existan las ligas que vigila |
| Módulo de comisiones | 4.x | **no** | sacarlas del machote |
| Backfill 2025-2026 | 4.x | **no** | revisión de Gerardo |
| ¿YIN entra al grafo? | — | **decisión**, no construcción | §8 pregunta 1 |

**El orden importa y no es negociable:** sin el enlace oportunidad ↔ machote, la pantalla de
Confirmación puede enseñar la orden y su machote pero no de qué oportunidad salieron. Es la
misma frase del rector de la Estación 3, y sigue siendo cierta un mes después.

---

## 8 · Preguntas para Esteban, antes de construir

1. **¿YIN entra al grafo?** Son 1,753 órdenes confirmadas desde 2025 —doce veces las de
   FTS— y hoy están fuera de todo lo que mide la suite. Si el objetivo es "cada proyecto",
   hay que decidirlo antes de diseñar el watchdog.
2. **El anticipo: ¿se adopta el asistente nativo de Odoo?** Es el cambio de mayor impacto y
   el más barato: repara `sale_line_ids`, `amount_invoiced` y el estado de facturación **sin
   escribir una línea**. A cambio, cambia el hábito de Finanzas.
3. **¿Los $200,000 del candado de anticipo son por orden, en pesos, y qué pasa con las
   órdenes en dólares?** ¿Se convierte al tipo de cambio del día o hay un umbral propio en
   USD?
4. **¿El botón Confirmar se esconde (Studio) o se bloquea (`ir.rule`)?** Esconder es
   reversible y no rompe nada; bloquear es de verdad pero pide una prueba en vivo como la de
   la regla 815, y una válvula.
5. **¿La comisión sale del machote?** Hoy vive ahí y en `budget.line` por persona. Si va a un
   módulo aparte ligado a cobros reales, el machote deja de escribirla — y eso toca la
   Compuerta 1.
6. **Las secuencias de los planes 1 y 22 están empatadas en 10.** ¿Se separan? Es un cambio
   de un número que hoy no rompe nada y que mañana puede reinterpretar todo el histórico.
7. **El eje de proyecto, ¿pasa a `mandatory`?** Atacaría el 59 % de bills sin proyecto, pero
   necesita antes un bucket "sin proyecto" o bloquea los indirectos legítimos.
8. **¿Quién limpia el IVA del libro analítico?** El 67 % de los renglones del proyecto de
   ejemplo son IVA o base imponible. Mientras eso siga así, ningún tablero de rentabilidad va
   a ser creíble.

---

## 9 · Cómo se midió · workflows TMP creados

Todos **INACTIVOS**, **de sólo lectura**, creados en esta sesión con el permiso explícito del
encargo. **No se borró ninguno.**

| id | qué consulta | ejecución |
|---|---|---|
| `OTPD4IG2gZj5AxEs` | `comercial.machote` + última versión: ligas a Odoo, compromisos y llaves del documento; y conteo de filas por tabla del esquema `comercial` | `111884` |

Todo lo demás se midió con el MCP de Odoo en **sólo lectura** (`search_read`, `read_group`,
`fields_get`), sin crear nada. Los dominios exactos están en [`consultas/`](consultas/).

**TMP de sesiones anteriores que siguen ahí y no son míos de borrar:** `0o0mEAAblpGFDv8J`,
`sUUO4FFXLH2fcdHA`, `z2xY6n23OCU2aVBE`, `T6pOksI56vy6Autc`, `sPUeaEXdOZcpuSzW`,
`Q7IsxD2Q0GnkRwhN`, `bgrIfrgmOWsjgUtk`, `2R2SJA4HuBCq1dRd`, `1l6d9p4tPlLDlJmo`,
`hrBgqWGZgf1G9ezq`, `PzeJ7jAfvgUn70pg`, `rR7bhz8u5JblkIfa`, `F2IMCBa1kBABundZ`.

---

## 10 · Lo que esta sesión NO pudo comprobar

Dicho como tal, no escondido:

- **La hipótesis 6** (el many2many de Odoo 16 perdido en la migración): la instancia es 19 y
  no conserva rastro del modelo viejo. No se puede confirmar ni descartar desde aquí.
- **El contenido de los archivos de PO**: `ir.attachment` está bloqueado para el MCP. Se sabe
  que el archivo existe (por `x_studio_purchase_order_file_filename`) pero **no si está en
  blanco**, que es justo lo que el candado de octubre quiere impedir. La validación tendrá
  que leerlo en el momento de subirlo, no después.
- **Por qué YIN tiene 1,753 órdenes confirmadas**: está fuera del alcance de esta sesión.
- **Si los 306 pagos a proveedor sin conciliar son un problema real o ruido de estado**: se
  midió el conteo, no se revisó ninguno.
