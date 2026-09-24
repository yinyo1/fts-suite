# Trazabilidad por nodos · informe de la sesión 2 (investigación)

**Issue de esta sesión:** [#291](https://github.com/yinyo1/fts-suite/issues/291) · **PR:** [#290](https://github.com/yinyo1/fts-suite/pull/290)
**Rector:** [#127](https://github.com/yinyo1/fts-suite/issues/127) · **Estación 3:** [#244](https://github.com/yinyo1/fts-suite/issues/244) · **Machote:** [#140](https://github.com/yinyo1/fts-suite/issues/140), [#246](https://github.com/yinyo1/fts-suite/issues/246)

**Fecha de medición:** 2026-09-24 (madrugada CST). Continuación de
[`INFORME.md`](INFORME.md) (sesión 0). **Sesión de sólo lectura**: no se escribió nada en
Odoo, ni en Postgres, ni en ningún workflow existente.

> **Este repositorio es PÚBLICO.** Aquí no hay nombres de cliente ni de proveedor, importes,
> RFC ni contactos. Todo son números de documento, ids de Odoo, conteos, porcentajes y
> razones. El detalle nominal y los importes viven en `docs/trazabilidad/_privado/`
> (ignorado por git) y se regeneran con [`consultas/`](consultas/).

Cada cifra de este informe trae su modelo, su dominio y su campo en
[`consultas/sesion-2-dominios.md`](consultas/sesion-2-dominios.md). Lo que no se pudo
confirmar se dice, no se supone.

---

## 0 · Las diez líneas

1. **YIN es otro negocio, no la misma empresa con otra cara.** No entra al grafo. Y su
   contraste es el dato más útil de la sesión: la arista factura → orden está rota en el
   **0.6 %** de sus renglones contra el **27 %** de FTS, en la misma instancia y el mismo
   mes. **La rotura no es de Odoo: es del proceso de FTS.** (§1)
2. **El caso de 17 veces tiene causa, y no es un campo que miente: la orden es en pesos y
   se facturó en dólares.** Nueve de sus diez documentos están en USD con los importes de
   una orden en MXN. En el libro mayor quedaron **18.9 veces** el valor de la orden, y hay
   una nota de crédito en borrador desde hace catorce meses. (§3.1)
3. **`amount_invoiced` y `amount_to_invoice` usan bases distintas** —dinero uno, cantidad el
   otro— y por eso su suma se pasa del total. Comprobado al centavo en dos órdenes
   independientes. No es un bug: es que no se pueden sumar. (§3.2)
4. **Dos de cada tres renglones del libro analítico de proyectos son impuesto** (66.8 % de
   2025 en adelante), y **ningún proyecto activo está limpio**: 125 de los 132 que se han
   movido desde 2025 están contaminados. Los "limpios" lo son porque están muertos. (§4)
5. **El mecanismo nativo de anticipos tiene dos usos en toda la historia, los dos anteriores
   a 2025.** Hoy el anticipo se teclea a mano sobre un renglón cualquiera, y ni eso es
   consistente: hay al menos dos formas distintas según quién capture. (§5)
6. **De los pagos a proveedor sin conciliar, el 92 % del dinero está en el 20 % de los
   documentos** (63 de 321, los dos diarios de BBVA), **61 de esos 63 traen el número de
   factura escrito en el propio pago**, y al leerlos aparecen **pagos duplicados y
   triplicados** contra la misma referencia. No falta información para conciliar: falta
   conciliar. (§6)
7. **La pregunta 7 del #291 cambia de respuesta si se cuentan renglones y no cambia si se
   cuenta dinero.** Por conteo, la mayoría de los bills sin proyecto **sí** son indirectos
   legítimos (56 %); por dinero, no — **el 55 % del dinero está en la cubeta de sólo-rubro**. Y
   el patrón no es
   por factura: **es por proveedor, y parte por tipo de proveedor** — el libro captura el
   material y se le escapa la mano de obra subcontratada. (§7)
8. **La refactura sí reconstruye la arista que falta**, demostrado en dos casos concretos,
   pero sólo donde el comprobante anterior vive en la instancia (4 de 9 uuids) y sólo como
   texto. Sirve para un asistente de reparación, no como liga. (§8)
9. **La rentabilidad real se puede reconstruir a mano en uno de los tres proyectos de
   ejemplo, y en los otros dos no.** Y no se puede LEER de ningún campo en ninguno de los
   tres. Cinco paredes distintas, una por causa. (§9)
10. **El plan que empata con el eje proyecto de toda la empresa tiene UNA cuenta y nació
    ayer.** Si el empate se rompiera al otro lado, 19,687 renglones dejarían de ser
    alcanzables por `account_id` y el campo devolvería **un** renglón, sin un solo error. El
    arreglo es un `sequence` — un campo. (§10)

**Y el bloqueo que nadie ha dicho en voz alta:** `comercial/orden-crear-v2` exige los cinco
compromisos comerciales, y **0 de 24 machotes los tienen**. Hoy, con el código publicado,
ningún machote real puede crear su orden. (§11)

---

## 0-bis · Correcciones a la sesión 0, y por qué importan

Tres cifras del [`INFORME.md`](INFORME.md) no se reprodujeron. Se corrigen aquí con el
dominio pegado, que es lo que faltaba allá.

| dice el #290 | dice esta medición | por qué |
|---|---|---|
| reglas de facturación: A 8 · B 1 · **C 11** · **D 2** · **E 17** · **F 2**, **38** órdenes | A 8 · B 1 · **C 18** · **D 3** · **E 18** · **F 3**, **40** órdenes | A y B coinciden. Los otros cuatro no se reprodujeron con ninguna tolerancia razonable, y el #290 **no dejó escrita ni la tolerancia ni si descontaba solapamientos**, así que no se puede auditar. Esta medición publica las dos cosas: tolerancia 0.5 en la moneda de la orden, reglas literales sin descontar solapamientos |
| **306** pagos a proveedor sin conciliar, de 1,091 `in_process` | **321**, de **1,452** `in_process` | el universo `in_process` de hoy es 1,452. No se puede saber si la diferencia es crecimiento de tres semanas o un dominio distinto, porque el #290 no dejó el dominio |
| **123** `budget.analytic` | **131** en la compañía 1 + **27** en la 6 | la cifra de 123 viene de CLAUDE.md §17 y está stale |

**Y un defecto en una de las reglas de esta misma sesión, que se reporta porque se
encontró:** la regla E ("tiene facturas y facturado en cero") **cuenta las facturas
canceladas**, porque `invoice_count` las cuenta. Al menos una de las 18 órdenes de esa regla
(SO9137) simplemente **nunca se ha facturado**: su único documento está cancelado. Cualquier
watchdog que se construya sobre esto tiene que exigir `state = posted`.

**Y el techo de las 40 órdenes es un PISO, no un tope.** SO11771 tiene una factura
**posteada y pagada** cuyo `invoice_origin` la nombra, y la orden reporta
`invoice_count = 0` — porque ese campo se deriva de la liga de renglón, así que cuando la
liga no existe la orden no tiene facturas **ni para contarlas**. Ninguna de las seis reglas
puede ver ese caso, y es el de la orden más grande del periodo.

---

## 1 · Qué es YIN, y si entra al grafo

La pregunta del encargo no era cuántas órdenes tiene, sino si es el mismo negocio con otra
cara. **No lo es**, y hay siete mediciones independientes que apuntan al mismo lado:

| medición | YIN (compañía 4) | SERVICIOS FTS (1) |
|---|---|---|
| órdenes confirmadas desde 2025-01-01 | 1,753 | 143 |
| ticket promedio | — | **290 veces el de YIN** |
| renglones por orden | 1.01 | 2.8 |
| renglones de nota y de sección | **0 y 0** | 206 y 21 |
| renglones en el libro analítico | **34 en total**, 31 sin cuenta, y dos de las tres cuentas se llaman literalmente "(NO USAR)" | decenas de miles |
| proyectos reales | 24, **todos sin cliente**, 20 creados en una sola tarde con nombres tecleados a mano (uno con typo, otro en minúsculas) | 174 |
| órdenes de compra confirmadas | 1,537 = **0.88 por cada venta** | — |
| oportunidades ligadas a la orden | 0 de 1,753 | 111 de 179 |

Sus diarios son propios (31, 32, 36, 38; los de FTS son otros), su producto es uno solo con
variantes por cliente y ruta, sus proveedores son casetas, combustible y timbrado, y **la
intersección de su padrón de clientes con el de FTS es CERO** — lo único común es SERVICIOS
FTS como *cliente* de YIN, en cuatro órdenes de flete intercompañía.

Es corretaje de flete: compra viajes y los vende. **No entra al grafo. El grafo es la
compañía 1 más la 6.**

### Lo que YIN sí sirve para probar

De sus 1,776 renglones de factura de producto, **10 no tienen liga a un renglón de orden:
0.6 %**. En las compañías 1 y 6 la misma medición da **27 %**. Misma instancia, misma
versión de Odoo, mismo mes, el mismo nodo comunitario. **La arista no está rota por Odoo.**
Y la diferencia de proceso es visible: YIN factura una línea por orden desde un flujo
repetitivo; FTS arma facturas a mano sobre órdenes de veinte renglones.

---

## 2 · El machote sin oportunidad: 24 de 24, y son DOS agujeros

### ¿Falta la pantalla? Sí — y además el lector pregunta por un nombre que no existe

Dos huecos independientes, los dos en el código de `main`:

1. **Nada escribe la oportunidad.** `grep -rn "lead_id" comercial/machote/js/*.js` (sin
   pruebas) devuelve **exactamente tres líneas, y las tres LEEN**: `almacen.js:1391` la
   manda al webhook, `orden.js:790` la pinta en el contrato visible y `orden.js:953` la pasa
   al crear. No hay selector, ni campo, ni entrada. **La tubería está completa de punta a
   punta y lo único que falta es el lugar donde una persona diga cuál oportunidad es.**
2. **Y aunque la base la tuviera, no llegaría.** `comercial/machotes-leer`
   (`Lze4jmkW9pg7Tvad`, nodo `Code - Armar respuesta`) devuelve la columna como
   **`odoo_lead_id`**. La cadena `odoo_lead_id` **no aparece en ningún `.js` de
   `comercial/` fuera de las pruebas**. O sea que `_st.machote.lead_id` vale `undefined`
   **siempre**, por dos razones a la vez. Arreglar sólo la pantalla no alcanza.

### ¿Sigue vacío el folio del machote en los leads?

Sí, y más de lo que decía el #291: **vacío en los 703 leads activos de las compañías 1 y 6,
y vacío en la instancia completa** incluyendo archivados.

**Control del instrumento** (§20 #18 de CLAUDE.md): el mismo dominio con `= false` devuelve
los 703 repartidos en sus seis etapas, así que el comparador sí discrimina. No pude
reproducir el corte exacto de "154 leads vivos" del #291; los cortes que sí medí son 703
activos, 172 sin la etapa de ganados y 207 creados desde 2025. **Con cualquiera de los tres,
la respuesta es cero.**

### Hallazgo nuevo: hay DOS campos Studio hacia la orden, y los dos están muertos

`crm.lead` tiene `x_studio_field_UMzY2` ("Sale Order") **y**
`x_studio_many2one_field_6dQyA` ("Sales Order"), los dos `many2one` a `sale.order`. El
primero está poblado en **21 leads, todos creados en 2021**; el segundo en **4, creados en
2024 y los cuatro tocados en lote el 4-sep-2026**. 25 de 703, los 25 en la etapa de ganados.
Un campo que se usó en 2021, se abandonó, se duplicó en 2024 y nunca se volvió a usar: dos
escritores para la misma arista, que es §20 #4.

Y la arista **nativa** sí vive: `sale.order.opportunity_id` está poblada en **111 de las
179** órdenes del periodo (68 sin oportunidad = 38 %). El problema del machote no es que
Odoo no tenga dónde.

### ¿Qué haría falta para ligar los 24 sin adivinar? No se puede desde la base

Las anclas de identidad de los 24 machotes no borrados:

- **`odoo_partner_id` en 7 de 24** — y cuatro de esos siete son la cuenta de prueba. Un
  partner no identifica una oportunidad: el cliente más repetido de la lista tiene 27
  órdenes confirmadas en el periodo y varias oportunidades abiertas.
- **17 de 24 sólo traen el cliente tecleado a mano.** Entre ellos, el mismo contacto escrito
  de tres formas distintas en cuatro machotes, y uno que dice literalmente "Tecleado a mano,
  sin catálogo".
- **`total` es nulo en 19 de 24** — tampoco se puede casar por importe. Los cinco que lo
  traen son pruebas.

Un empate automático produciría falsos positivos justo en el cliente más repetido, y
equivocarse aquí pega una cotización a la oportunidad de otro cliente. **Los 24 se ligan a
mano, por su dueño, desde la pantalla.** Son 24: es media hora de trabajo humano, no un
backfill.

### Cómo llenarlo de aquí en adelante

Tres pasos, y el orden importa:

1. **Corregir el nombre**: leer `odoo_lead_id`, no `lead_id`. Sin esto lo demás no sirve.
2. **Un selector de oportunidad** en el machote, alimentado del pipeline del cliente ya
   elegido (leads activos de ese partner, etapas no cerradas). **No obligatorio todavía**:
   el lado tolerante primero (CLAUDE.md §8, regla anti-trabón).
3. **Al crear la orden, escribir la arista en los dos sentidos**: `opportunity_id` en la
   orden (el campo **nativo**, no los de Studio) y el folio en el lead. Los dos campos
   Studio viejos se declaran muertos y no se tocan.

---

## 3 · Las órdenes que no cuadran: causa, no conteo

### 3.1 El caso de 17 veces — la orden es en pesos y se facturó en dólares

**SO10344.** Diez documentos con ese `invoice_origin`: cinco facturas posteadas, una nota de
crédito posteada, una nota de crédito **en borrador desde el 16-jul-2025** (catorce meses) y
tres documentos cancelados.

**Nueve de los diez están en USD.** El único en MXN está cancelado. Los números de la cara
son los correctos; la etiqueta de moneda no. La prueba a nivel renglón: el mismo concepto,
con la misma cantidad y el mismo precio unitario, produce un asiento de **un peso por
unidad** cuando el documento está en MXN y de **diecinueve** cuando está en USD.

**En el libro mayor, sumando los seis documentos posteados en moneda de la compañía, quedó
18.9 veces el valor de la orden**, y los seis con residual en cero, o sea que Odoo los da
por saldados. Cuatro de ellos están en `in_payment`, que según CLAUDE.md §17 significa
residual cero con conciliación posiblemente pendiente. **No afirmo que el cliente pagó
dieciocho veces: afirmo que el mayor lo dice, y que eso se compara contra el banco.**

**Por qué `amount_invoiced` dice 17 veces: porque es fiel.** El importe facturado de cada
renglón vale exactamente **17.0435 veces** su propio subtotal — el mismo factor en los
cinco, y ese factor es el tipo de cambio MXN/USD de hoy. Odoo está convirtiendo renglones de
factura *en dólares* a los pesos de la orden. **El campo no miente sobre el dato: el dato
está mal.**

Y dos cosas más de la misma orden: una de las facturas posteadas y **pagadas** no está
ligada a ningún renglón (el conteo por liga devuelve nueve documentos, no diez); y si los
importes se leen como pesos, la facturación neta cuadra **al centavo** con el total de la
orden. **El trabajo está 100 % facturado. Lo que está mal es la moneda.**

### 3.2 Los dos campos de control usan bases distintas, y por eso no se pueden sumar

**SO11547 y SO11762.** Las dos tienen **una** factura, correcta, y los dos campos peleados.

- En SO11547 el anticipo del 50 % se cargó **entero al renglón 1**, que vale menos que el
  anticipo: ese renglón queda sobrefacturado, su pendiente se va a negativo, y los otros
  cinco siguen al 100 % por facturar.
- En SO11762 el anticipo del 80 % se cargó **entero al último renglón**, que vale la décima
  parte: mismo efecto, y los otros dieciocho al 100 %.

El mecanismo, aislado y comprobado **al centavo en los dos casos** (§20 #8: una hipótesis con
un solo caso no es una hipótesis validada):

```
amount_invoiced   = Σ (importe facturado del renglón) × (1 + impuesto)   → base DINERO
amount_to_invoice = Σ (cantidad pendiente × precio unitario) × (1 + imp) → base CANTIDAD
```

Las dos fórmulas son correctas por separado. Cuando un anticipo se carga a un renglón por un
importe mayor que ese renglón, la cantidad que falta y el dinero cobrado dejan de hablar del
mismo universo, y su suma se pasa del total. **`is_downpayment` es falso en los 25 renglones
de las dos órdenes**: el asistente nativo no se usó en ninguna.

### 3.3 La liga de renglón, en el caso de mayor importe

**SO11663.** Una sola factura, posteada, cobrada, cuyo importe cuadra **al centavo** con el
total de la orden. Y la orden reporta facturado en cero. Es el mecanismo del #290
(`sale_line_ids` vacío) en la orden de mayor importe del periodo que lo padece: la factura
entera, invisible para su propia orden.

### 3.4 Se facturó, se canceló con nota de crédito, y la refactura nunca se posteó

**SO10917.** Cuatro documentos: la factura original posteada, la nota de crédito posteada
que la revierte, **la sustituta cancelada** y una cuarta cancelada en cero. El neto posteado
es cero, así que el facturado en cero **es correcto**. El prefijo `01|` del CFDI de la nota
de crédito dice que hay una refactura, y la refactura está cancelada.

O sea: el trabajo se entregó, se facturó, se canceló la factura, y la de reemplazo se quedó
sin postear. **Cinco meses sin factura vigente.** No es un defecto de campo: es dinero sin
cobrar, y es el hallazgo más accionable de los cinco.

### 3.5 Los otros mecanismos, identificados al pasar (para el watchdog, no perseguidos)

- **SO10600**: la razón facturado/total es **exactamente 1.16**. Se facturó tomando el total
  de la orden como base gravable y se le volvió a sumar el IVA.
- **SO11662, SO11773, SO11846, SO11849** (las cuatro de la compañía 6): la razón es
  **exactamente 1.0825** en las cuatro, o sea 8.25 % de impuesto de Estados Unidos. En esa
  compañía la orden se captura sin impuesto y la factura lo agrega, así que
  "facturado > total" es **de configuración, no un error de dato**. Cuatro de las ocho de la
  regla A son esto.
- **SO11108**: razón 1.0550, que no es 1.0825 — impuesto en parte de los renglones. Sin medir.

---

## 4 · La contaminación del libro analítico, en todo el universo

Universo: **19,687 renglones** de `account.analytic.line` de las compañías 1 y 6 con el eje
proyecto poblado, repartidos en **281 cuentas analíticas**.

### Tres cuentas contables lo contaminan, y son de impuesto

| cuenta | tipo | renglones |
|---|---|---|
| `899.01.99` Base Imponible de Impuestos en Base a Flujo | **expense** | 4,761 |
| `119.01.01` IVA pendiente de pago | asset_current | 2,838 |
| `118.01.01` IVA acreditable pagado | asset_current | 1,579 |

**9,178 de 19,687 = 46.6 %.** Y acotando a 2025 en adelante: **9,173 de 13,735 = 66.8 %.
Dos de cada tres renglones.**

Sólo dos diarios los producen: `Effectively Paid` (7,918) y `Vendor Bills` (1,260). Y el
renglón más viejo es del **20-sep-2024**: es el IVA en base a flujo de la localización
mexicana. Al pagar una factura de proveedor, el asiento de traspaso **hereda la distribución
analítica de la factura original**, así que cada pago mete tres renglones más al proyecto y
ninguno es costo.

### El caso completo, medido sobre un proyecto entero

Tres cosas medidas, no deducidas:

1. Los **268 renglones de base imponible suman exactamente 0.00**. Ruido puro — y es el
   grupo más grande de todo el libro.
2. El par de IVA del diario `Effectively Paid` **suma exactamente 0.00** (226 renglones).
   Ruido puro también.
3. Pero los **99 renglones de IVA pendiente del diario de facturas de proveedor NO se
   revierten**. Ese IVA es acreditable, o sea recuperable, y está contado como **costo del
   proyecto**.

Y el ingreso analítico de ese proyecto vale **16 veces** su orden, porque es la factura en
dólares de §3.1 llegando al libro. **Los dos errores se multiplican.**

### ¿Hay proyectos limpios? Sí: los muertos

281 cuentas con renglones · **125 con renglones de impuesto** · **132 con al menos un
renglón desde 2025**. O sea **125 de 132 = 95 %** de los proyectos que se han movido desde
2025 están contaminados, y los 156 "limpios" lo son porque dejaron de moverse **antes** de
que existiera la configuración de IVA en base a flujo. **Ningún proyecto activo está limpio,
y limpio significa muerto.** En los cinco proyectos más grandes la proporción de impuesto va
del 63 % al 69 %.

### Comisiones capturadas como gasto de proyecto

**93 renglones** sobre el eje proyecto en las seis cuentas de comisiones
(`2023.51` clientes, `2023.52` interno y sus cuatro subcuentas por persona). El 90 % del
dinero está en la de clientes, en **18 renglones**: la comisión que el machote calcula como
`comision_cliente` está aterrizando en el libro del proyecto como si fuera costo de obra.
Pocos renglones y mucho dinero — es exactamente lo que el candado de octubre
("comisiones sólo desde un módulo aparte") viene a ordenar, y no es cosmético.

### Dos ruidos grandes, anotados y NO perseguidos (§8)

- **Los diarios de BANCO cargan al eje proyecto**: siete diarios bancarios y de efectivo
  aportan miles de renglones sobre el mismo eje donde ya están las facturas de proveedor. No
  medí si es doble conteo o si es el único registro de gastos sin factura (caja chica,
  tarjeta). **Es la pregunta que hay que contestar antes de calcular rentabilidad**, y es §9.
- **Un solo renglón del diario de operaciones diversas** por un importe de siete cifras sobre el
  eje proyecto. Un asiento manual. Sin revisar.

---

## 5 · Los anticipos, como se hacen hoy

**El universo:** 210 documentos de cliente posteados desde 2025-01-01 en las compañías 1 y 6
(197 facturas + 13 notas de crédito), más 58 cancelados y 5 borradores.

### ¿Cuántos son anticipos? No se puede contestar con un campo, y ése es el hallazgo

1. **`is_downpayment` existe en dos órdenes de toda la instancia**, las dos anteriores a
   2025. El asistente nativo se usó dos veces, hace más de un año, y se abandonó. **Cero
   anticipos nativos en 2025 y 2026.**
2. **No hay convención de nombre.** Buscar "anticipo", "down payment" y "advance" en los
   renglones de las 210 devuelve **siete**, y seis son el renglón de la *fianza* del
   anticipo de SO10344, que es otra cosa.
3. **La única huella medible** es el renglón de orden con pendiente negativo, o sea el que se
   facturó por más de lo que vale: **15 renglones en 11 órdenes**. Y dos de esas once están
   por otra razón (§20 #18): SO11663 y SO10941 tienen renglones de orden con **subtotal
   negativo**, así que su pendiente es negativo por construcción. **Quedan 9 órdenes con la
   huella real.**

### No hay UNA forma: hay al menos dos

- SO11547 y SO11762: el anticipo entero a **un** renglón (§3.2).
- SO10344: el porcentaje **prorrateado** en los cinco renglones — ésa sí es la forma
  proporcional, y es la única de las tres que no rompe la relación entre los dos campos.

La elección depende de quién capture. **Y el 90 % de las 210 facturas las captura un solo
usuario de Odoo** (uid 25, el login compartido de administración); Esteban 19 y operaciones
1. Los diarios son los dos de facturación de cliente, uno por compañía. **No hay diario de
anticipos.**

### Qué cambia paso a paso si se adopta el asistente nativo

**Hoy:** se abre la orden confirmada, "Crear factura", se elige factura normal y **se editan
a mano las cantidades** hasta que el total sea el porcentaje acordado, y se postea.
Resultado: un renglón sobrefacturado, el resto al 100 % pendiente, y los dos campos de
control peleados para siempre.

**Con el asistente** ("Anticipo por porcentaje" o "por importe fijo"): misma pantalla, se
teclea el porcentaje; Odoo **agrega un renglón nuevo a la orden** con `is_downpayment`,
ligado al producto de anticipo de la compañía, y factura sólo ese renglón. Al facturar el
avance real, el asistente **descuenta** el anticipo con un renglón negativo. Resultado: los
dos campos siguen siendo complementarios, los renglones de obra conservan su avance real, y
"¿cuánto llevo facturado de este proyecto?" se contesta con el campo en vez de con una
investigación.

**Lo que hay que decidir ANTES** (no lo decido yo):

a. **El producto de anticipo de cada compañía y su cuenta contable.** Odoo lo exige; con el
   de fábrica, el anticipo cae en una cuenta de ingreso genérica y el libro analítico hereda
   ese destino.
b. **Si el anticipo lleva analítica del proyecto o no.** Si la lleva, entra al libro como
   ingreso del proyecto antes de que haya avance; si no la lleva, el proyecto muestra ingreso
   cero mientras cobra la mitad. **Las dos lecturas son defendibles y hay que elegir una.**
c. **Qué pasa con las 9 órdenes vivas** que ya tienen el anticipo cargado a mano. El
   asistente no las repara.
d. **La fianza del anticipo**, que hoy se factura como un renglón de obra: ¿ingreso del
   proyecto o concepto financiero?

---

## 6 · Los pagos a proveedor sin conciliar

**321** pagos a proveedor en estado `in_process` sin conciliar, de **1,452** `in_process`
(el #290 dijo 306 de 1,091; ver §0-bis). Dominio completo en
[`consultas/`](consultas/sesion-2-dominios.md).

### La separación que pidió el encargo

| cubeta | documentos | qué es |
|---|---|---|
| **RUIDO OPERATIVO** | 90 | 85 pagos del diario de tarjeta de crédito con un promedio por pago **280 veces menor** que el de los de BBVA (el más chico son dos dígitos de pesos), más 5 pagos en dólares que juntos no alcanzan el 0.01 % del total. Cargos que el motor de captura registra y nadie casa contra una factura |
| **INTERMEDIO** | 164 | la plataforma de pagos, con un promedio por pago **35 veces menor** que el de BBVA. Su conciliación es un proceso aparte del bancario |
| **DINERO SIN EXPLICAR** | **63** | los dos diarios de BBVA. **El 92 % del dinero en el 20 % de los documentos**, con un promedio por pago **280 veces mayor** que el de la tarjeta |

**Antigüedad:** el más viejo es de octubre de 2024 (dos años). Prácticamente todo el dinero
es de 2025, y **lo de 2026 junto no llega al 0.03 % del total**: el problema se dejó de crear, no se
limpió.

### La contraparte sí es identificable: está escrita en el pago

De los 63 de BBVA, **61 traen el número de factura en el campo de concepto**. Los dos que no
son una transferencia interna capturada como pago a proveedor (con la propia empresa como
proveedor) y un cargo de tres cifras de pesos. **No falta información para conciliar:
falta conciliar.**

### Y al leerlos aparecen pagos duplicados

Seis referencias con más de un pago registrado. Las peores: una factura de seguridad social
con **tres pagos del mismo importe exacto en tres fechas y dos diarios**; una factura de
proveedor con **dos pagos de importes distintos** en dos diarios a seis días; y **un mismo
número de factura contra dos proveedores distintos** por el mismo importe el mismo día.

No afirmo que se pagó dos o tres veces: afirmo que hay dos o tres **pagos registrados**
contra la misma referencia, y eso sólo se resuelve contra el estado de cuenta. **Es lo
primero que hay que mirar**, y es trabajo con el banco, no de un script.

Nota de campo: los 55 del diario general traen el método de pago como `Manual (False)` —
manual sin diario asociado — y los del otro diario sí lo traen. No sé qué significa el
`False`; queda anotado, no perseguido.

---

## 7 · El 59 % de bills sin proyecto: el patrón, antes de proponer el candado

Universo: **6,369 renglones de producto** de facturas de proveedor posteadas desde
2025-01-01 en las compañías 1 y 6. **Los 6,369 cuadran al renglón con el #290**, y los
2,615 con proyecto también: el instrumento reproduce.

### Cuatro cubetas disjuntas, las cuatro medidas

| cubeta | renglones | % del conteo | del dinero en pesos |
|---|---|---|---|
| 1 · **con proyecto** (planes 1 o 18) | 2,615 | 41 % | 18 % |
| 2 · sin proyecto, **con plan de costo legítimo** (indirecto, activos, combustible, inmuebles, flota) | 2,117 | 33 % | 26 % |
| 3 · **sin ninguna analítica** | 234 | 4 % | 1 % |
| 4 · con analítica pero **sólo rubro** (plan 20) | **1,403** | 22 % | **55 %** |

**Control del instrumento** (§20 #19): la cubeta 4 la calculé primero por resta y después la
medí con su propio dominio. Dio el mismo conteo y **el mismo importe al centavo**.

### La respuesta a la pregunta

De los 3,754 renglones sin proyecto: **por conteo, la mayoría SÍ son indirectos legítimos
(2,117 de 3,754 = 56 %). Por dinero, no** — los indirectos valen la mitad de lo que valen
los de sólo-rubro, con un promedio por renglón tres veces menor. **La pregunta 7 del #291
cambia de respuesta si se cuentan renglones y no cambia si se cuenta dinero. Y lo que se
decide con un candado es dinero.**

Contexto que conviene tener junto: **sólo el 18 % del costo en pesos está atribuido a un
proyecto**. En dólares es al revés: **92 %**. La compañía 6 atribuye; la 1 no.

### El patrón no es por factura: es por proveedor, y parte por TIPO de proveedor

**18 proveedores concentran el 88 % del dinero de la cubeta 4, en 68 renglones de 1,362.**

Y el discriminador duro, medido: de once de esos proveedores, **ninguno tiene un solo
renglón en la cubeta 1**. Nunca han tenido una factura con proyecto. Los que sí llevan
proyecto son otro conjunto entero, y la diferencia está en la **forma**:

- **material** → muchos renglones chicos (dos proveedores con 130 y 103 renglones, promedio
  de dos mil y pico de pesos cada uno) → **sí lleva proyecto**
- **mano de obra subcontratada y servicios externalizados** → pocos renglones enormes (seis y
  siete renglones, con un promedio por renglón **240 veces mayor**) → **nunca lleva proyecto**

**El libro analítico captura el material y se le escapa la mano de obra.** Y eso explica la
anomalía que el A0 de CLAUDE.md §17 ya había medido sin explicar: proyectos con costo del
0 al 35 % del ingreso donde se espera 60-80 %.

### ¿Qué porcentaje es indirecto legítimo? Lo que se puede decir y lo que no

**No lo puedo medir**: no hay campo que lo diga, y clasificar por el nombre del proveedor es
exactamente lo que §20 #17 prohíbe — el atributo que decide vive en un campo, no en mi
lectura de un nombre. Lo que sí puedo hacer es separar los dos grupos por su giro y
**marcarlo como inferencia, no como medición**: los servicios fiscales y administrativos
externalizados son cinco proveedores con **cerca de un tercio** del dinero de la cubeta; los
eléctricos, de construcción y la gente por obra son diez con **cerca de la mitad**; y queda
**un 11 %** ambiguo (impresión y fletes). El detalle nominal está en `_privado/`. **La
confirmación de cada cubeta es de quien autorizó la factura, no mía.**

### Lo que esto cambia para el candado

1. **El candado por línea no es la primera herramienta.** El problema está en 18 proveedores
   que nunca han llevado proyecto. Un **default por proveedor** —una
   `account.analytic.distribution.model` con `partner_id`, que es el mismo mecanismo que ya
   usa la #46 por prefijo de cuenta— atrapa el 88 % del dinero **sin bloquearle la captura a
   nadie**.
2. **La reparación retroactiva es de unas 68 facturas, no de 1,362 renglones.** Es una tarde
   con una lista de 18 proveedores, no un backfill.
3. Y el candado duro (Regla 56, que ya existe y ya rechaza el sólo-rubro al postear) sigue
   siendo el piso. **Lo que falta no es el candado: es el default que evita que la persona
   tenga que acordarse.**

---

## 8 · La refactura como arista

**27 documentos** en toda la historia de las compañías 1 y 6 traen
`l10n_mx_edi_cfdi_origin`, repartidos por tipo de relación del CFDI:

| prefijo | qué significa | documentos | ¿hay arista nativa? |
|---|---|---|---|
| `01\|` | nota de crédito de los relacionados | **15** | **sí, en las 15**: todas traen `reversed_entry_id`. Para las notas de crédito el campo es **redundante** (el #290 midió 13 de 13; hoy son 15) |
| `04\|` | **sustitución de los CFDI previos** = la refactura | **8** | **no, en ninguna** |
| `07\|` | aplicación de anticipo | **1** | — es el único CFDI de anticipo del sistema |
| (sin prefijo) | un uuid pelón | 1 | borrador de 2022, malformado |

### ¿Existe el uuid referenciado? Cuatro de nueve, y los cuatro de 2026

Busqué los nueve uuids de los `04|` como uuid fiscal de cualquier otro asiento de la
instancia. **Cuatro resuelven**; los cinco que no son de 2020 a 2023 — esos comprobantes no
viven en esta instancia o nunca guardaron su uuid.

### ¿Reconstruye la arista que falta? Sí, con dos casos concretos

- Una factura **posteada** de 2026 **sin `invoice_origin`** resuelve por su `04|` a su
  predecesora cancelada, **y la predecesora sí nombra la orden**. La orden se recupera.
- La sustituta sin nombre de otra cadena lleva a su predecesora, que nombra **SO7723** — una
  de las 18 órdenes de la regla E — **y el importe cuadra al centavo con el total de esa
  orden**.

**Los límites, que hay que decir:** sirve sólo donde el predecesor vive en la instancia; lo
que recupera es el `invoice_origin` del predecesor, que es **texto, no la relación**; y da
un **candidato** para que una persona confirme, no algo que se pueda aplicar a ciegas (menos
aún sin compañía: un nombre de factura no es único, §3.2 del #290). Para las notas de crédito
no hace falta.

**Conclusión:** el origen del CFDI es una **tercera arista de texto** que se suma a
`invoice_origin` y a la liga de renglón. Es útil para un asistente de reparación; no
sustituye la liga.

---

## 9 · ¿Se puede calcular la rentabilidad real hoy? La prueba de fuego

Los tres proyectos de ejemplo del [`ARBOLES.md`](ARBOLES.md): SO11547, SO11771 y SO10300.
Nota previa: **SO11547 tiene el proyecto y la cuenta nativos VACÍOS** y sólo el campo Studio
del radar poblado — las dos aristas parciales del #290, en vivo.

### Lo que hay, y lo que no

| | SO11771 | SO10300 | SO11547 |
|---|---|---|---|
| **ingreso** en el libro analítico | **ninguno** | sí, y cuadra **al centavo** con la orden sin IVA | **ninguno**, con un anticipo posteado y **pagado** |
| **costo incurrido** | 8 renglones, **uno solo del 99 %** | 113 renglones menudos | 817 renglones |
| **costo comprometido** (órdenes de compra) | sí — el operador `'in'` sobre la distribución analítica funciona: **1,134 renglones** entre los tres | | |
| **impuesto contado como costo** | sí, y es el 16 % del subcontrato entero | sí | sí |
| **mano de obra** | **cero renglones** | 16 renglones | 70 renglones |
| **la cuenta analítica es suya** | sí | sí | **NO: es el catch-all de la empresa** |

### La mano de obra, y una corrección a lo que primero medí

La cuenta `Timesheet Mano de Obra` tiene **1,067 renglones, todos de 2023**. Cero en 2024,
2025 y 2026. Cualquier reporte que la lea da cero.

La mano de obra de 2025-2026 entra por **Carga MO** (CLAUDE.md §19), como renglones **sin
cuenta contable** con el proyecto en el eje 1 y el rubro "2.1 Mano de Obra" en el plan 20.
Crudo: `unit_amount` en **0.00**, `employee_id` **vacío**, y el número de empleado viajando
como **texto dentro del nombre del renglón**. O sea que **la MO sí está en dinero pero sin
horas y sin empleado: se puede costear, no se puede auditar ni cruzar.**

### El veredicto, proyecto por proyecto

**SO11771 — SÍ se puede, a mano, y el número es creíble.** Su costo son ocho renglones, y
**seis son de un solo proveedor** (equipo eléctrico de potencia) más la fianza y un
reembolso de gasolina. El margen sobre la orden sin IVA sale del **44 %**, que es plausible
para esa obra. **Pero ningún campo nativo lo dice**: el panel de rentabilidad mostraría
pérdida total porque el ingreso analítico es cero, y hay que **restar a mano** el IVA que
está contado como costo.

**SO10300 — NO es creíble.** El ingreso está bien. El costo da un margen aparente del
**85.6 %**, que es el patrón que el A0 ya había marcado: costo del 12 % donde se espera
60-80 %. Ciento trece renglones de unos cientos de pesos cada uno son gastos menudos; la
estructura de la obra **no está en el libro** — está en la cubeta 4 de §7.

**SO11547 — NO, y es el peor de los tres.** Ingreso cero con un anticipo posteado y pagado.
Y su cuenta analítica **es el catch-all que CLAUDE.md §17 A0/R3 ya identificó**: sus 817
renglones de costo incluyen gastos misceláneos de otros proyectos. Ni el ingreso ni el costo
son suyos. **Un proyecto cuya analítica es el basurero de la empresa no tiene rentabilidad:
tiene un promedio.**

### Dónde me topo con pared, y por qué — las cinco paredes

1. **El ingreso.** Dos de tres proyectos tienen cero ingreso analítico **con factura
   posteada y pagada**. Sin la liga de renglón, la distribución analítica de la orden no
   llega a la factura, y sin eso la factura no escribe renglón analítico. Es la **misma**
   rotura de §3 y §5 aterrizando en el libro.
2. **El costo atribuido al proyecto equivocado.** El catch-all. Ninguna suma sobre esa
   cuenta es del proyecto que la lleva en el nombre.
3. **El impuesto contado como costo.** Hay que restar a mano dos cuentas y verificar que la
   tercera suma cero. Ningún campo nativo lo hace (§4).
4. **La mano de obra sin horas ni empleado.**
5. **El costo que nunca entró.** §7: el 55 % del dinero en 18 proveedores de subcontrato que
   nunca han llevado proyecto.

**VEREDICTO:** hoy la rentabilidad real de un proyecto **se puede reconstruir a mano**, con
cuatro consultas y un criterio, **cuando el proyecto tiene un proveedor grande y su propia
cuenta analítica**. **No se puede leer de ningún campo en ninguno de los tres.** Y no se
puede calcular en absoluto cuando la analítica es compartida o cuando el costo de obra se
fugó. **Dos de tres proyectos de ejemplo no dan.**

---

## 10 · El empate de los planes 1 y 22, cuantificado

### Primero, un defecto del instrumento que casi me hace publicar lo contrario

**`odoo_query` con `ids` NO devuelve las filas en el orden de la lista de ids** — las
devuelve en el orden por defecto del modelo. Leer un campo por **posición** de un read con
`ids` atribuye el valor al registro equivocado. Lo detecté porque el mapeo que salió
contradecía a CLAUDE.md §17, y al verificarlo con una agrupación (que imprime el id junto al
nombre) **el mapeo de CLAUDE.md resultó correcto**. Es el mismo modo de falla de §8 ("todo
ID entregado viene con su read crudo"), en la herramienta de lectura.

### El mapa real

19 planes, los 19 sin padre y los 19 con aplicabilidad `optional`. El eje proyecto de México
es el plan **1** (34 cuentas, `sequence` 10) y el de Estados Unidos el **18** (18 cuentas).
El `OK_ROOTS = {1,18,2,5,8,11,13}` de la Regla 56 (CLAUDE.md §17) es **correcto**.

El que empata en `sequence` 10 con el eje proyecto es el plan **22, "GASTOS FINANCIEROS
USA"**, y tiene:

- **una** cuenta, llamada "Comisión Cambiaria", de la compañía 6,
- **creada el 2026-09-23 a las 21:06 UTC** (15:06 CST del 23) — o sea **ayer**,
- y **un** renglón analítico en todo el libro.

**El plan que empata con el eje proyecto de toda la empresa nació ayer y tiene un renglón.**

### El riesgo, en números

`account_id` es la columna del plan de `sequence` más baja; con empate Odoo desempata por
id, y 1 < 22, así que hoy gana el 1 — y por eso **no existe** columna `x_plan1_id` y **sí**
existe `x_plan22_id`. Si se invirtiera:

- **19,687 renglones** dejarían de ser alcanzables por `account_id` y pasarían a
  `x_plan1_id`;
- `account_id` pasaría a contener **un** renglón;
- y **no tronaría nada**: devolvería casi vacío, que es §20 #18 en su peor versión.

Consumidores que rompería, todos medidos en esta sesión:

- el panel **nativo** de rentabilidad de proyecto, que lee por `account_id`;
- `project.project.account_id`, poblado en **173 de los 174** proyectos de la compañía 1 y en
  los **31** de la 6;
- el eje proyecto de los **131 + 27** `budget.analytic` (CLAUDE.md §17 A3 opción B ya lo
  advirtió: `account_id` es la columna primaria que leen la rentabilidad nativa y el budget);
- los dos workflows del Frente B, `zLmmY0pqYC9kjLaw` y `RW7KnoeEzYLvavI0`, que deciden el
  archivado por `analytic_distribution 'in' [cuenta]`;
- el motor de `fin/rentabilidad` y `fin/rentabilidad-motor`;
- y la **Carga MO**, que escribe el proyecto justo en `account_id`.

Cómo podría romperse: cambiar el `sequence` del plan 1 hacia arriba, o el del 22 hacia
abajo, o cualquier escritura sobre un plan que dispare la re-sincronización de columnas. **Y
alguien está trabajando en el plan 22 ahora mismo** —su única cuenta es de ayer—, así que un
`write` sobre ese plan no es hipotético.

### El arreglo, y es de un campo

Ponerle al plan 1 un `sequence` **estrictamente menor** que el de todos los demás (1, o 5).
Un solo campo, sin migrar un dato, reversible, y el empate desaparece para siempre. **No lo
puedo hacer: el MCP de Odoo es de sólo lectura.** Es una escritura de Esteban en la UI, y es
lo más barato de todo este informe.

---

## 11 · El machote contra los candados de octubre, campo por campo

### Lo que el machote guarda hoy, medido

**Del documento** de la última versión de los 24 machotes no borrados: `estado`, `id` y
`nombre` en 24 · `cliente`, `empresa_id` y `moneda` en 23 · `secciones` en 20 · `analista`,
`comision_cliente`, `comision_fts`, `diagnostico`, los tres `equipo_*`, `escenario`,
`factor_proteccion`, `fecha`, `margen_deseado`, `margenes`, `reparto`, `so`, `tc` y
`tc_fuente` en 19 · `cliente_id` en 14 · `ciudad`, `pais` y `region` en 11 ·
`creado_at`/`_por`/`_por_nombre` en 10 · `viaje` en 8. **Treinta y dos llaves, y ninguna se
llama `iva`.**

**De las columnas:** `odoo_partner_id` 7 · `odoo_so_id` 2 · `odoo_lead_id` **0** ·
`pago_dias`, `pago_termino_id`, `pago_hitos`, `incoterm_code`, `entrega_texto`,
`vigencia_dias` y `compromisos_at` **0 de 24 los siete**.

### La tabla

| candado de octubre | qué tiene hoy | qué falta, exactamente |
|---|---|---|
| El portal jala todo del machote | ✅ pantalla `#/confirmar` + `comercial/confirmar` publicado | nada. Sólo se ha ejercido en pruebas (2 filas de confirmación) |
| Anexar la PO del cliente y **cuadrar al centavo** | ❌ ninguna de las 32 llaves es de PO | dos campos en el machote (número y archivo) y la comparación. Odoo ya tiene destino. Y **el 32 % de las 179 órdenes no trae número de PO** |
| Cuenta analítica con MO y materiales | 🟡 `comercial/confirmar` crea analítica y budget; el rubro vive en el plan 20 | que el machote diga **cuánto** de MO y cuánto de material. Hoy `margenes` y `reparto` traen el margen, no el desglose por rubro |
| Teléfono y correo del contacto, **obligatorios** | ❌ `equipo_cliente` guarda nombre y porcentaje | el par teléfono/correo y el candado. ⚠️ **no puede vivir en el repo público** (§20 #7): va a Postgres o a Odoo, nunca al JSON del documento que sirve Pages |
| Contacto de finanzas / reglas de pago del cliente | ❌ nada | campo nuevo; el destino natural es el partner en Odoo, no el machote |
| Días de pago obligatorios antes de enviar | 🟡 **construido y sin usar**: columna de la migración 009 + pantalla de compromisos (421 líneas) + panel en la de orden | **0 de 24 machotes tienen un solo compromiso**. No falta código: falta que la Compuerta 1 lo **exija** y que alguien lo capture |
| Anticipo obligatorio arriba de un monto, con % | ❌ nada en el machote | el porcentaje en el machote **y** el asistente nativo en Odoo (§5) |
| La cotización dice si lleva IVA y cuánto | ❌ **0 de 24**; la llave no existe | la llave, y que el PDF la imprima. Hoy el IVA lo decide la empresa que factura, en el server |
| Leyenda obligatoria cuando no incluye impuestos | ❌ nada | depende de la llave de arriba |
| Tax de EUA sugerido por estado y ciudad | 🟡 el machote **ya sabe** país, región y ciudad (11 de 24) | la tabla de tasas. Medido de paso en §3.5: las facturas de la compañía 6 aplican **8.25 % exacto** en cuatro órdenes — ya hay una tasa de facto |
| Viáticos obligatorios fuera de la sede | ✅ **candado duro** (`viaje-sin-resolver`), y `viaje` en 8 de 24 | nada. ⚠️ la sede es **Nuevo León**, no Monterrey |
| Adicionales como orden nueva ligada al padre | ❌ no hay campo de orden padre | el campo. **Y hay un caso vivo: SO11861 y SO11862, capturadas con nueve segundos de diferencia, mismo importe y las dos sin facturar** — que es exactamente lo que este candado viene a ordenar |
| Sólo el dueño edita su machote | ✅ dueño del token + préstamo con tope de 24 h (migración 005) | nada |
| Comisiones sólo desde un módulo aparte | ❌ viven en el machote (19 de 24) **y** en el libro analítico | el módulo. Y §4 lo cuantifica: **93 renglones de comisión ya están contados como gasto de proyecto**, el 90 % del dinero en la cuenta de comisiones a clientes. **No es cosmético: es dinero mal clasificado** |
| Gasto MX con una tarjeta / EUA con otra | ❌ sin candado | los diarios existen. Medido de paso en §6: **85 pagos del diario de tarjeta sin conciliar** |

### El bloqueo que nadie ha dicho en voz alta

`comercial/orden-crear-v2` **exige los cinco compromisos comerciales**, y **0 de 24 machotes
los tienen**. O sea que hoy, con el código publicado, **ningún machote real puede crear su
orden**. Los dos que la crearon son pruebas y la crearon el 14-sep con la versión 1; la
versión 2 nació el 15-sep. **No es un pendiente de diseño: es una puerta cerrada en
producción, y se abre capturando compromisos, no cambiando código.**

---

## 12 · Los workflows TMP de esta sesión

| id | nombre | qué consulta | estado |
|---|---|---|---|
| `IIqf4eeEhW5FkpVg` | `TMP · trazabilidad sesion 2 (almacen)` | tres `SELECT` con el rol `comercial_app`: (a) los 24 machotes no borrados con sus ligas a Odoo y los cinco compromisos, (b) qué llaves trae el documento de la última versión y en cuántos machotes, (c) las filas de confirmación y handoff | **INACTIVO**, sólo lectura. Ejecutado en manual una vez (111901) |

**El nodo (c) tronó**: `column h.odoo_so_id does not exist` — **la tabla de handoff no guarda
la orden**. Anotado, no perseguido (§8). Los nodos (a) y (b) sí dieron datos.

También se volvió a ejecutar el TMP de la sesión 0, `OTPD4IG2gZj5AxEs`, sin modificarlo.
**Ninguno de los dos se borró**, como pidió el encargo.

---

## 13 · Lo que NO se pudo verificar

- **Si los importes del libro mayor de §3.1 corresponden a dinero que entró.** Cuatro de los
  seis documentos están en `in_payment`, que es residual cero con conciliación posiblemente
  pendiente. Se compara contra el banco, no contra Odoo.
- **Si los diarios de banco sobre el eje proyecto (§4) son doble conteo** o son el único
  registro de gastos sin factura. Es la pregunta que hay que contestar antes de calcular
  rentabilidad y no la medí.
- **Qué porcentaje de la cubeta 4 de §7 es indirecto legítimo.** No hay campo que lo diga y
  no se clasifica por el nombre del proveedor.
- **Si los pagos duplicados de §6 son pagos duplicados o capturas duplicadas del mismo
  pago.** Sólo el estado de cuenta lo dice.
- **El corte exacto de "154 leads vivos"** del #291 (§2).
- **Qué significa el `Manual (False)` del método de pago** de §6.
- **El asiento manual de siete cifras** del diario de operaciones diversas sobre el eje proyecto
  (§4).
- **La razón 1.0550 de SO11108** (§3.5).

---

## 14 · Las preguntas para Esteban

### Bloquean el diseño del módulo de Confirmación

1. **¿El anticipo lleva analítica del proyecto, o no?** (§5-b) Si la lleva, el proyecto
   registra ingreso antes de tener avance; si no, muestra ingreso cero mientras cobra la
   mitad. Las dos son defendibles y el módulo tiene que elegir una para poder crear la
   factura de anticipo.
2. **¿El módulo adopta el asistente nativo de anticipos, o sigue facturando a mano?** (§5)
   De esto depende si `amount_invoiced` vuelve a ser un campo creíble o si la Confirmación
   tiene que calcular el avance por su cuenta para siempre.
3. **¿La oportunidad es obligatoria para confirmar, o sólo se sugiere?** (§2) Hoy 38 % de las
   órdenes no tiene oportunidad y 0 de 24 machotes la traen. Si es obligatoria, el módulo
   nace bloqueando; si se sugiere, nace tolerante y hay que decidir cuándo aprieta.
4. **¿Qué hace la Confirmación cuando la orden ya tiene facturas que no cuadran?** (§3) De
   las 179, 40 caen en alguna de las seis reglas. ¿Bloquea, avisa, o confirma igual y lo
   anota?

### No bloquean, pero cuestan dinero si se dejan

5. **El `sequence` del plan 1** (§10). Un campo, reversible, y quita un riesgo que tiene un
   solo renglón de distancia. Es lo más barato de este informe.
6. **La refactura cancelada de SO10917** (§3.4): cinco meses sin factura vigente por una
   obra entregada.
7. **La moneda de SO10344** (§3.1): nueve documentos en dólares por una orden en pesos, una
   nota de crédito en borrador de catorce meses, y el mayor con dieciocho veces el valor.
   ¿Se corrige, o se documenta y se deja?
8. **Los 63 pagos de BBVA sin conciliar** (§6), con los seis duplicados dentro. Los 61 traen
   su referencia escrita: es conciliación, no investigación.
9. **El default por proveedor** de §7, en vez de (o antes de) apretar el mandatory. 18
   proveedores, 68 facturas de reparación retroactiva.
10. **Los 24 machotes sin oportunidad** (§2): se ligan a mano en media hora, pero sólo
    después de corregir el nombre del campo que lee la pantalla.
11. **Y la puerta cerrada de §11**: `orden-crear-v2` exige los cinco compromisos y nadie los
    ha capturado. ¿Se relaja el webhook, o se capacita y se capturan?
