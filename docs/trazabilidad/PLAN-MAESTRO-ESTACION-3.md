# Estación 3 · plan maestro de la Confirmación y la cotización desde la suite

**Issue de esta sesión:** [#291](https://github.com/yinyo1/fts-suite/issues/291) · **PR:** [#290](https://github.com/yinyo1/fts-suite/pull/290)
**Rector:** [#127](https://github.com/yinyo1/fts-suite/issues/127) · **Estación 3:** [#244](https://github.com/yinyo1/fts-suite/issues/244) · **Machote:** [#140](https://github.com/yinyo1/fts-suite/issues/140), [#246](https://github.com/yinyo1/fts-suite/issues/246)

**Fecha de medición:** 2026-09-24. Tercera sesión de investigación, y la primera de **diseño**.
**Sólo lectura**: no se escribió nada en Odoo, ni en Postgres, ni en ningún workflow. **Nada
de esto está construido.**

> **Este repositorio es PÚBLICO.** Aquí no hay nombres de persona —ni de empleados de FTS ni
> de contactos de cliente—, importes, RFC ni contactos. Todo son códigos de cuenta, ids de
> Odoo, conteos, porcentajes y razones. El detalle nominal y los importes viven en
> `docs/trazabilidad/_privado/sesion-3-comisiones.md`, que está en `.gitignore` y **no se
> commitea**.

Cada cifra trae su modelo, su dominio y su campo en
[`consultas/sesion-3-dominios.md`](consultas/sesion-3-dominios.md).

Lee antes: [`INFORME.md`](INFORME.md) (sesión 0) y
[`INFORME-SESION-2.md`](INFORME-SESION-2.md) (sesión 2). Esta sesión **no vuelve a medir** lo
que ya estaba medido, salvo donde lo dice.

---

## 0 · Las diez líneas

1. **Las comisiones SÍ están ligadas al plan analítico. El problema es otro y es peor:** la
   tabla que hace la liga tiene **reglas ambiguas** —cinco compitiendo por el prefijo del IVA
   y trece por el del lado cliente— y la que gana estampa el rubro de **una persona que ya no
   está en la empresa** sobre **2,633 renglones de IVA**, 187 de ellos de 2026. (§1)
2. **El catálogo de comisiones que hace falta ya existe en Odoo**: 19 cuentas analíticas en el
   plan 20 (7 personas internas + 2 de bono + 12 del lado cliente) con sus 8 cuentas
   contables. **El machote no lo lee**: trae cuatro nombres de pila escritos a mano en
   `calc.js`. (§1)
3. **Tres de esos cuatro nombres salieron de la empresa en los últimos cinco meses**, y **16
   de los 19 machotes con comisiones llevan exactamente esos cuatro**, al 25 % cada uno. La
   salida más reciente es de este mes: los machotes de esta semana también la reparten. (§1)
4. **Una comisión se paga como factura de proveedor, y el proveedor es la persona.** Cadencia
   medida: **tres viernes consecutivos de septiembre de 2025 y nada más**. Doce meses sin
   pagar una comisión interna. **Y no existe ningún campo que la ligue al cobro del cliente.** (§1)
5. **CORRECCIÓN a mi informe de la sesión 2:** dije que `orden-crear-v2` bloquea a los 24
   machotes por los compromisos. **La inferencia estaba mal**: el endpoint los lee del
   **cuerpo de la petición**, no de las columnas. La puerta no la cierra el webhook — la
   cierra que la pantalla nunca se usó. Y son **cuatro** obligatorios, no cinco. (§2)
6. **La Fase 1 no se construye de cero.** `comercial/confirmar` y `comercial/orden-crear-v2`
   están **activos y publicados de verdad** (`versionId == activeVersionId`). Lo que cambia es
   **de dónde saca los datos**: hoy la pantalla teclea a mano los tres montos del presupuesto
   que el motor del machote ya calcula. (§2)
7. **Y hay un rubro de viajes que Esteban creó el 9 de julio y nunca ha recibido una línea**,
   mientras el motor del machote separa el costo de viaje **a propósito** para que no
   contamine el de materiales. Es el arreglo más barato del plan. (§2)
8. **La forma real de una orden de FTS, medida:** 2.5 renglones con precio y 1.7 notas por
   orden; **secciones en sólo 13 % de las órdenes**; y **328 productos distintos para 449
   renglones**, el más usado un marcador que se llama «NO USAR». Imitar el selector de
   producto de Odoo sería imitar una función que el equipo esquiva. (§3)
9. **El 38 % de órdenes sin oportunidad desaparece por construcción** si la cotización nace en
   la suite. El hueco que queda —quien siga creando órdenes en Odoo— no lo cierra la suite. (§3, §4)
10. **Diez reparaciones no necesitan que se construya nada**, y las tres más baratas
    (un campo y dos limpiezas de filas) son las tres más caras de no hacer. (§6)

---

## 1 · Las comisiones: lo que no sabíamos

### 1.1 · Se controlan con TRES catálogos paralelos, mantenidos a mano

| capa | modelo | cuántos | qué hace |
|---|---|---|---|
| contable | `account.account` | **8** cuentas, todas de la cía 1, todas `expense` | `2023.51` para **todo** el lado cliente · `2023.52` genérica interna · `2023.52.11`, `.11.1`, `.12`, `.13`, `.14`, `.15` una **por persona** |
| analítica | `account.analytic.account`, **plan 20** (el plan RUBRO) | **19** | `3` interna + `3.1`…`3.6` por persona · `4.1` y `4.2` de bono · `5.` cliente + **once** contactos `5.1.1`…`5.9` |
| enlace | `account.analytic.distribution.model` | **49** filas | mapea prefijo de cuenta contable → rubro |

**Las seis reglas específicas del enlace son limpias y correctas** (una cuenta por persona →
su rubro). Y en las 93 líneas reales de comisión **el pareo cuenta↔rubro es 1:1 perfecto**.
Así que la respuesta corta a *«no están ligadas al plan analítico»* es: **sí lo están**, y
además con el eje **compuesto** (proyecto + rubro en la misma línea), que es justo lo que el
A2 de CLAUDE.md §17 pedía y casi nada más tiene.

### 1.2 · El bug: reglas ambiguas sobre el mismo prefijo

| prefijo de cuenta | reglas que compiten | consecuencia medida |
|---|---|---|
| `119.01.01` (IVA pendiente de pago) | **5**, cada una con el rubro de una persona distinta | el rubro de **una** de ellas se estampa en **2,633 renglones de IVA** (2,448 de 2025 · **187 de 2026** · 2 de 2024). A los otros cuatro se les fugan 4 líneas cada uno |
| `2023.51` (comisiones a clientes) | **13**, una por contacto | las **18** líneas de comisión a clientes caen **todas** en el rubro de **un solo contacto** |
| `1.1` | **18** | sin medir |
| `2023.52` | **3** | — |

**Qué significa, en una frase:** la persona cuyo rubro ganó el sorteo del IVA **ya salió de
la empresa**, su rubro lleva 2,633 renglones que no son comisiones, y su presupuesto aparece
**al 90 % consumido** cuando sus comisiones reales son menos de la mitad de eso.

Y del lado cliente el mismo mecanismo produce un **catch-all**: el rubro de un contacto
concreto recibe todo, con un presupuesto de tres órdenes de magnitud menos que lo que
recibe. Es el patrón del catch-all `3034` de CLAUDE.md §17 R3, reproducido dentro de los
rubros de comisión.

⚠️ **Trampa de instrumento, para quien vuelva a medir esto:** filtrar por
`code like '2023.5'` **también atrapa** la cuenta `2023.5`, que es de **la taquería**
(CLAUDE.md §9, negocio ajeno que no se toca) y aporta 291 líneas y un signo contrario. Hay
que **enumerar los seis códigos**, no usar prefijo.

### 1.3 · El presupuesto por persona existe, y el lado cliente es invisible

**456 renglones de `budget.line`** con rubro de comisión o bono, en 18 rubros. Es el plan;
`achieved_amount` es lo pagado.

| familia | rubros | renglones | `achieved` |
|---|---|---|---|
| internas (`3.*`) | 7 | 276 | entre **1.7 %** y **90 %** del presupuesto, según la persona |
| bonos (`4.1`, `4.2`) | 2 | 104 | 11 % y 16 % |
| **lado cliente (`5.*`)** | **12** | **74** | **0.00 en los DOCE** |

**El presupuesto del lado cliente es el más grande de los tres —unas 5 veces el interno— y su
`achieved` es cero en los doce rubros**, mientras el gasto real de comisión a clientes está
**todo** en el rubro catch-all, cuyo presupuesto es **tres órdenes de magnitud menor** que lo
que recibe. **El lado cliente es invisible para su propio presupuesto, en las dos direcciones
a la vez.**

### 1.4 · Los 93 renglones: de qué proyectos, qué diarios, desde cuándo

- **93 renglones**, **−1.23 MMXN**, **29 proyectos distintos**, y **todos llevan proyecto**
  (el conteo sin filtrar por proyecto da los mismos 93).
- **Diarios: sólo dos.** `Vendor Bills` (80 renglones) y `BBVA General MXN` (13).
- **Años: 2025 → 92 · 2026 → 1.** Un solo renglón de comisión en todo 2026.
- Reparto: 6 rubros. Dos de los seis pareos, aunque técnicamente consistentes, **significan
  otra cosa**: la cuenta genérica interna se usa **sólo** para el bono de técnicos (que es un
  bono, no una comisión), y el rubro de un contacto se usa para todo el lado cliente.

### 1.5 · Cómo se paga, de punta a punta

**26 documentos pagan todas las comisiones de la historia**: 23 facturas de proveedor, 3
asientos de banco y **1 borrador sin postear desde noviembre de 2025**.

| caso | forma | proveedor |
|---|---|---|
| comisión interna | **una factura de proveedor por persona**, con varios renglones de proyecto dentro | **la persona misma**, como `res.partner` |
| bono de técnicos y supervisores | **asiento de banco**, sin factura | el banco (los técnicos no son proveedores) |
| comisión a cliente | factura de proveedor de un solo renglón | **el cliente**, o **FTS a sí misma**, o un empleado de FTS |

**El momento: semanal, y sólo tres semanas.** Las facturas por persona son de **tres viernes
consecutivos de septiembre de 2025**. Antes no hay ninguna y después tampoco: **doce meses
sin pagar una comisión interna.** Es una cadencia de nómina, no de evento.

**Y no hay ningún campo que ligue la comisión al cobro del cliente.** El único vínculo con la
SO es el eje analítico del proyecto. La cadencia fija lo confirma: se pagó sin mirar el estado
de cobro de la factura. Si el negocio quiere «se comisiona cuando el cliente paga», **hoy no
hay dónde escribirlo.**

### 1.6 · Qué trae el machote, y por qué es texto suelto

El machote guarda **cadenas de texto**, no ids. La plantilla de `calc.js:257-260` nace con
**cuatro nombres de pila en mayúsculas al 25 % cada uno**, y:

| medición | resultado |
|---|---|
| machotes con sección de comisiones | **19** de 24 (los 5 restantes son de prueba) |
| llevan exactamente los cuatro nombres de la plantilla | **16 de 19** |
| de esos cuatro, **ya no están en la empresa** | **3**, con salidas repartidas en los últimos cinco meses |
| personas activas con rubro de comisión que **no** aparecen en el machote | **2** (una de ellas la jefa del área), más una que sólo tiene rubro |
| la misma persona escrita con **dos ortografías** | **2 casos** (una con mayúscula/minúscula, otra con dos nombres distintos) |
| renglones con el **nombre en blanco** | **3**, en 2 machotes |
| lado operaciones | las **cuatro etiquetas genéricas** de la plantilla en **19 de 19**; nunca una persona |
| lado cliente | el **placeholder** en **19 de 19**, al 100 % — mientras Odoo tiene **once contactos con rubro propio** |
| `reparto` venta/operaciones | **0.73 / 0.27 en 19 de 19**: nunca se ha tocado |
| tasa de comisión FTS | **0.055 en 17, 0.06 en 2** |
| **un machote cuyo reparto suma 125 %** | **1** — y la regla dura `reparto-descuadrado` **lo bloquea**, así que la regla sirve |
| historial completo | **490 versiones · 6 combinaciones distintas de equipo · 2 tasas** |

**No hay tabla de correspondencia.** `grep` de esos nombres en todo el repo devuelve
**sólo** la plantilla, la demo y una prueba. `shared/comercial/` no tiene catálogo de
personas. Los nombres se pueden casar con las cuentas de Odoo **leyéndolos**; el machote no
lo sabe y nadie lo escribió nunca.

⚠️ **Y un hueco de regla:** `comision-sin-nombre` (`reglas.js:198`) es **blanda**, sólo mira
el lado cliente, y **el placeholder cuenta como nombre** — así que los cuatro machotes que
cobran 5 % de comisión de cliente sin nombrar a nadie **no la disparan**.

---

## 2 · Fase 1 · La Confirmación jalando del machote

### 2.1 · Lo que ya existe (leído hoy)

| workflow | id | `active` | `versionId == activeVersionId` | nodos |
|---|---|---|---|---|
| `comercial/confirmar` | `Cyapm1EfPPbTxSi5` | **sí** | **sí** (`4cb4ad58`) | 21 |
| `comercial/orden-crear-v2` | `H2HOG8LqoYUVg3hU` | **sí** | **sí** (`c8b06545`) | 25 |

Los dos están **publicados de verdad** (§17 quirk 2b: lo guardado ES lo que corre).
`confirmar` ya tiene los 4 modos y las 7 escrituras; la pantalla (`confirmar.js`, 535 líneas)
ya muestra «paso N **de 7**» cuando un intento queda a medias.

### 2.2 · CORRECCIÓN a la sesión 2

En el §11 del `INFORME-SESION-2.md` escribí: *«`orden-crear-v2` exige los cinco compromisos y
0 de 24 machotes los tienen → hoy ningún machote real puede crear su orden»*. **La primera
mitad es cierta; la inferencia está mal.** El código lee
`var c = p.compromisos || {}` — **del cuerpo de la petición**, no de las columnas del machote.

Tres precisiones que cambian la decisión:
1. **La puerta no la cierra el webhook: la cierra la pantalla, que nadie ha usado.** El
   endpoint acepta los compromisos si la pantalla los manda.
2. **Son CUATRO los obligatorios** (términos de pago, incoterm, tiempo de entrega, vigencia).
   Los hitos de pago se leen con `Array.isArray(...) ? ... : []`: **son opcionales**.
3. Que las siete columnas de la migración 009 estén en 0 de 24 significa que nadie los ha
   **capturado y guardado**, no que el endpoint esté bloqueado.

### 2.3 · El contrato de datos: qué cambia

La orden ya está resuelta en [`../comercial/ORDEN-CONTRATO.md`](../comercial/ORDEN-CONTRATO.md)
y se hereda. **Lo que cambia es el handoff**, que hoy se teclea completo
(`confirmar.js:272-330`):

| campo | hoy | propuesta | de dónde saldría |
|---|---|---|---|
| presupuesto **Ingreso** (rubro `1171`) | input numérico | **del machote** | el precio del escenario elegido |
| presupuesto **Mano de Obra** (`1177`) | input numérico | **del machote** | el costo de MO sumado por el motor |
| presupuesto **Materiales** (`1176`) | input numérico | **del machote** | el costo de material sumado |
| presupuesto **VIAJES** (`3097` MX / `3098` USA) | **el renglón no existe** | **agregar** | el motor lo separa **a propósito** («para que la línea Materiales del BUDGET ODOO no diga que se compraron materiales por 40 mil pesos») |
| presupuesto **comisiones por persona** | no existe | **agregar** | el `reparto` del machote × la bolsa |
| fechas de obra | input date | **a mano, con propuesta** | el machote no tiene fecha de obra |
| quién dirige la obra | **texto libre + id opcional** | **selector de `hr.employee`** | el machote sólo tiene etiquetas genéricas. Un nombre sin id es la misma enfermedad de las comisiones |
| entregables | textarea | **borrador del machote** | diagnóstico + alcance de las secciones |

**Los rubros de viaje existen y están vacíos.** `3097 VIAJES FTS MEX` y `3098 VIAJES FTS USA`
fueron **creados por Esteban el 2026-07-09** y **no han recibido una sola línea analítica**.
La pantalla de confirmación ofrece tres rubros; falta ése y faltan las comisiones.

### 2.4 · Los candados de octubre, con su domicilio

| candado | dónde vive el candado | estado hoy |
|---|---|---|
| **PO con número** | servidor, en `comercial/confirmar` | el campo existe; **32 %** de las órdenes sin número |
| **PO con archivo, validado AL SUBIR** | **pantalla + servidor, en el momento del upload** | **22 %** sin archivo. ⚠️ `ir.attachment` está bloqueado para el MCP: un PDF en blanco **sólo se detecta al subirlo**. Validar después **no es opción**, y es una razón técnica, no una preferencia |
| **Cuadre al centavo** | servidor: cuerpo vs Postgres | ⚠️ **hay que decidir contra qué**: la PO del cliente suele traer el **total con impuesto** y el machote razona en **subtotal** |
| **Contacto con teléfono y correo** | servidor | el machote no los tiene. ⚠️ **NO pueden vivir en el JSON del documento** que sirve Pages (§20 #7): van a Postgres o a Odoo |
| **Días de pago** | servidor (ya existe en la v2) | la columna en 0 de 24; el webhook ya lo exige del cuerpo |
| **Anticipo arriba del umbral con su %** | servidor | ⚠️ **tres decisiones** (§7). Y la factura debe usar el **asistente nativo**, con **2 usos en toda la instancia, los dos anteriores a 2025** |
| **Decisión de IVA + leyenda** | servidor (la leyenda la escribe el server) | la llave `iva` **no existe** entre las 32 del documento |
| **Tax de EUA por estado/ciudad** | servidor | el machote ya sabe país/región/ciudad (11 de 24); falta la tabla. La cía 6 ya aplica **8.25 % exacto** en cuatro órdenes |
| **Viáticos foráneos** | ✅ **candado DURO ya construido** (V1.26) | ⚠️ la sede es **Nuevo León**, no Monterrey |
| **Adicionales como orden hija** | servidor | **no hay campo de orden padre**. Caso vivo: dos órdenes capturadas con **nueve segundos** de diferencia, mismo importe, las dos sin facturar |
| **Comisiones desde un módulo aparte** | §1 y §5 | **93 renglones ya contados como gasto de proyecto** |

### 2.5 · Las siete escrituras: orden, reversibilidad y fallo a la mitad

El principio es **lo irreversible al final**:

| # | escritura | reversible | si falla aquí |
|---|---|---|---|
| 0 | *(Postgres)* reservar el intento con su `idempotencia` | sí | aborta, nada de Odoo tocado |
| 1 | `res.partner` del contacto si no existe | sí (archivar) | aborta |
| 2 | **cuenta analítica** del plan correcto (**1 en MX, 18 en EUA, resuelto en vivo**) | sí (archivar) | aborta |
| 3 | **proyecto**, ligado a la analítica **y a la orden por los DOS caminos** | sí (archivar) | se archiva la analítica huérfana |
| 4 | `budget.analytic` + `budget.line` con **los montos reales del machote**, con viajes y comisiones | sí (archivar) | se archivan proyecto y analítica |
| 5 | escribir en la orden: PO + archivo, términos, incoterm, fecha comprometida, contacto, proyecto, analítica | sí (re-escribir) | se archiva lo anterior; la orden queda **sin confirmar**, que es el estado seguro |
| 6 | **factura de anticipo por el asistente NATIVO**, si aplica | sí (cancelar) | se archiva lo anterior |
| 7 | **confirmar la orden** | **NO** | es el último: no hay nada después que pueda fallar |
| 8 | *(Postgres)* el resultado de los 7 pasos | — | queda «a medias» y **lo ve el watchdog** |

**La regla, en una frase:** ningún paso irreversible corre antes que uno que pueda fallar, así
que **una confirmación a medias nunca deja una orden confirmada sin su proyecto** — deja, como
mucho, un proyecto y una analítica archivados y la orden sin confirmar. La pantalla ya sabe
mostrarlo y el reintento es idempotente por la reserva del paso 0.

⚠️ **Lo único irreversible que no es el paso 7: el archivo de la PO.** Crea un `ir.attachment`
que el MCP no puede leer ni borrar. Por eso va en el paso 5 —después de todo lo que puede
fallar por datos— y por eso se valida **antes** de escribirlo.

⚠️ **Para quien lo construya:** cada paso lleva su **read-back**. Un `create` que devuelve id
no prueba que los campos se guardaron (§9), y un many2one escrito como string **se anula en
silencio** (§9: va como número).

### 2.6 · La puerta cerrada: ¿relajar o capturar?

**Ninguna de las dos, y la pregunta estaba mal planteada — la mía.** El webhook no bloquea
nada; lee del cuerpo. Lo que falta es que **la pantalla se use y que lo capturado se GUARDE**.

**Recomendación: NO relajar, y agregar el guardado.**
1. Relajar quitaría el único candado del sistema ya escrito **y probado del lado servidor**,
   justo el mes en que se quiere endurecer todo.
2. Los cuatro compromisos son **exactamente** los cuatro campos que están vacíos en las
   órdenes reales. El #290 midió el primero: **51 de 179 órdenes (28 %) sin términos de
   pago**. Los otros tres los dejó medidos el propio comentario de la v2, sobre las 176
   órdenes de ese momento: **CERO con incoterm, CERO con fecha comprometida, UNA con
   vigencia** — y la más grande sin términos de pago es una orden de ocho cifras. No son
   burocracia: son el agujero.
3. Capturarlos cuesta minutos por cotización, y hoy son 24 machotes.

**Lo que sí hay que arreglar, y es de una sesión:** que `comercial/machote-guardar` **persista
los compromisos** en las columnas de la 009, para que la Confirmación los lea de Postgres en
vez de volver a pedirlos. Hoy viajan en el cuerpo y se pierden.

---

## 3 · Fase 2 · La cotización nace en la suite

### 3.1 · La forma REAL de una orden de FTS (medida)

795 renglones en las 179 órdenes confirmadas:

| tipo de renglón | renglones | órdenes que lo usan |
|---|---|---|
| producto (con precio) | **449** (2.5 por orden) | — |
| nota | **312** | **126 de 179 = 70 %** |
| encabezado de sección | **34** | **24 de 179 = 13 %** |

Y **328 productos distintos para 449 renglones**. El más usado es un **producto marcador cuyo
nombre incluye literalmente «NO USAR»**, en 71 renglones; el segundo es un recordatorio de
proceso. El resto son de un solo uso y **su nombre ES el texto del alcance** — uno arranca con
la palabra «Description» pegada del portapapeles.

Y del catálogo de notas que la #244 ya cosechó: *«el TEXTO de las notas NO se reutiliza: 308
notas dan 287 textos distintos»*. (Mi medición de hoy da 312 notas en 179 órdenes: crece
igual, el instrumento reproduce.)

### 3.2 · La evaluación honesta

Lo que Esteban quiere —la interfaz igualita a la de Odoo— tiene una razón buena: el equipo ya
está acostumbrado. Pero **lo que el equipo usa de esa interfaz es una fracción pequeña**, y
copiar el resto sería copiar una pantalla que nadie llena.

**Vale la pena imitar, y es barato:**
1. **El armazón visual**: encabezado arriba, rejilla de renglones en medio, **totales a la
   derecha**. Es lo que el ojo reconoce en medio segundo, y es CSS.
2. **Los tres botones**: «Agregar producto», «Agregar sección», «Agregar nota». Es *el* gesto
   de Odoo, y son tres tipos de renglón. **Las notas van como ciudadanas de primera** (70 %).
3. **Edición en línea** con el total recalculando al teclear.
4. **Arrastrar para reordenar**: es lo que hace que la cotización se lea como documento.

**NO vale la pena imitar:**
1. **El selector de producto del catálogo.** 328 productos para 449 renglones prueba que se
   usa como campo de texto. **Descripción libre y producto creado al vuelo al guardar** — que
   es lo que `orden-crear-v2` YA hace. El catálogo, como autocompletado opcional.
2. **Impuestos por renglón**: el IVA lo decide la empresa que factura, en el servidor.
3. **Listas de precios, descuentos, unidad de medida, estados de entrega y facturación,
   productos opcionales, la pestaña «Otra información»**: cero uso medido.
4. **La columna de margen**: el costo jamás sale al cliente.
5. **Las secciones como estructura obligatoria**: 13 % de uso. Disponibles, no impuestas.

**El riesgo que hay que nombrar:** imitar al pixel tiene una trampa — cuando alguien encuentre
una diferencia, y la va a encontrar, va a concluir que la pantalla de la suite «está
incompleta». **La forma de evitarlo no es copiar más campos: es que la pantalla se vea
claramente como la de FTS**, no como un clon con partes faltantes. Es la lección del pad como
hoja de cálculo de la V1.42: se copió el **gesto** de Excel, no Excel.

### 3.3 · De dónde sale cada cosa
La cotización **no se captura de cero**: nace del machote. Encabezado de sección ← nombre de
la sección · renglón con precio ← **uno por sección** (decisión cerrada en
`ORDEN-CONTRATO.md`), con desglose opcional cuando el cliente lo pide para armar su PO ·
notas ← las plantillas ya cosechadas + los compromisos + la leyenda de IVA · totales ← el
motor, y **la suma cuadra exacto** por una regla dura que ya existe.

---

## 4 · Fase 3 · El machote exige la oportunidad

### 4.1 · Los dos agujeros, verificados contra `origin/main` de hoy (`3b84d67`)
- **`lead_id` aparece 3 veces en `comercial/machote/js/`, y las tres LEEN.** No hay selector,
  ni campo, ni entrada. La tubería está completa de punta a punta.
- **`odoo_lead_id` aparece CERO veces** en todo `comercial/` (sin pruebas), y es el nombre que
  devuelve `comercial/machotes-leer`. El valor que lee la pantalla es `undefined` **siempre**.

**El orden importa:** si se construye el selector sin corregir el nombre, la pantalla va a
guardar bien y seguir diciendo «sin oportunidad», y alguien va a concluir que el guardado
falla. **Primero el nombre —una línea—, después el selector.**

### 4.2 · Los 24 a mano, y por qué no hay backfill
Medido en el #290: sólo 7 machotes traen cliente del catálogo —cuatro de ellos la cuenta de
prueba—, 17 lo traen **tecleado a mano**, y el total es nulo en 19 de 24, así que **tampoco se
puede casar por importe**. Un empate automático produciría falsos positivos justo en el
cliente más repetido.

**El mecanismo:** una **pastilla «sin oportunidad»** en la lista (el patrón visual que ya usa
«Sin handoff»); al abrir, un **selector alimentado del pipeline del cliente ya elegido**
(leads activos, etapas no cerradas); para los que no tienen cliente del catálogo, búsqueda por
nombre sobre los **703 leads activos** con el nombre tecleado como arranque. **La persona
confirma; el sistema no adivina.** Cada liga se escribe **en los dos sentidos** y queda en el
historial con quién y cuándo.

⚠️ **Los dos campos Studio viejos de `crm.lead` hacia `sale.order` no se tocan: se declaran
muertos** (uno con 21 leads **todos de 2021**, el otro con 4 de 2024 **tocados en lote el
4-sep-2026**). La arista nativa es la que vive, con 111 de 179 órdenes poblada.

### 4.3 · Sugerida primero, obligatoria después — y el disparador escrito como número

**Tu inclinación es la correcta y los datos la respaldan.**

| tiempo | qué | cuándo |
|---|---|---|
| **1 · sugerida** | el selector existe, la pastilla molesta a la vista, la Compuerta 1 **la marca** al enviar y no bloquea | desde que exista el selector |
| **2 · obligatoria** | sin oportunidad no se emite la orden: `SIN_OPORTUNIDAD` del lado servidor | cuando la pantalla lo permita **y** los 24 estén ligados |

1. **Exigir algo que no se puede capturar frena al equipo el primer día** — el trabón que §8
   prohíbe. Hoy la captura **no existe**.
2. **Ya pasó y está documentado**: el 18-jul-2026 se aplicó el lado estricto del servidor
   antes de publicar el frontend y el panel de Confirmar Horas quedó trabado en producción
   justo antes del write de nómina. La regla literal: **si una mitad va primero, la tolerante**.
3. El 38 % **no es culpa del equipo**: es que no había dónde ligarla.

**El disparador para el tiempo 2:** los 24 ligados, y el selector funcionando en la pantalla
de **alguien que no sea quien lo construyó**.

---

## 5 · El catálogo vivo de comisiones

**El catálogo ya existe** (§1.1). Lo que falta es que el machote lo lea.

| # | pieza | costo | por qué en este orden |
|---|---|---|---|
| 1 | **limpiar las reglas ambiguas** del enlace | escritura de Esteban/Gerardo, minutos | **sin esto el catálogo apunta a un mapeo roto** |
| 2 | endpoint de sólo lectura con los rubros activos por lado | 1 sesión | el patrón está hecho: `comercial/clientes` ya hace esto para clientes |
| 3 | **el machote guarda el ID, no el nombre**, tolerando los nombres viejos | 1 sesión | mientras guarde texto, cada reporte adivina |
| 4 | el **selector** en la pestaña de comisiones | misma sesión | |
| 5 | la Confirmación escribe `budget.line` **por persona** desde el reparto | dentro de la Fase 1 | hay 456 renglones hechos por fuera y el machote sabe el reparto |

**Dar de alta a alguien nuevo son TRES escrituras y sólo UNA está probada:** la cuenta
analítica **sí** (el flujo de confirmación crea cuentas analíticas desde junio); la **cuenta
contable** y la **fila del enlace**, **no**.

**Recomendación: el alta no la haga la suite todavía.** Un botón «falta alguien» que deje un
pendiente con nombre y lado, y el alta la hace Gerardo en Odoo con los tres pasos. Porque (a)
dos de tres escrituras son de contabilidad y no están probadas, (b) el catálogo crece dos o
tres veces al año, y (c) **automatizar un alta de tres piezas mal coordinadas es exactamente
cómo nació la ambigüedad que hay que limpiar en el paso 1**.

**Dos decisiones de negocio que el diseño no puede tomar:**
- **Los rubros de quien ya salió**: propuesta = **archivar la cuenta analítica** (sale del
  selector, el histórico se conserva) y **no borrar nada**, por el principio del #127.
- **El lado cliente**: ¿el machote debe nombrar al beneficiario, o se decide al pagar? Si debe
  nombrarlo, el selector tiene que traer **los contactos del cliente elegido**, no una lista
  global.

---

## 6 · Las reparaciones que NO dependen de construir nada

| # | reparación | quién | costo | qué se rompe si no se hace |
|---|---|---|---|---|
| **R1** | **`sequence` del plan 1** estrictamente menor que todos | Esteban, UI | **un campo** | el plan que empata tiene **una** cuenta y **nació el 23-sep**. Si el empate se invierte, **19,687 renglones** dejan de ser alcanzables por `account_id` y el campo devuelve **uno** — **sin un solo error**. Rompe la rentabilidad nativa, `project.project.account_id` (173+31 proyectos), 131+27 `budget.analytic`, dos workflows del Frente B y la Carga MO |
| **R2** | **borrar cuatro de las cinco reglas del prefijo `119.01.01`** (o las cinco: el IVA no necesita rubro de comisión) | Esteban/Gerardo | minutos | el rubro de una persona que **ya salió de la empresa** lleva **2,633 renglones de IVA**, 187 de ellos de 2026, y su presupuesto aparece **al 90 %** consumido |
| **R3** | **dejar una regla (o ninguna) en el prefijo `2023.51`**, hoy trece | Esteban/Gerardo | minutos | las 18 líneas de comisión a clientes caen **todas** en el rubro de un contacto; los otros once tienen cero líneas, y **el presupuesto de comisión más grande de los tres** (el del lado cliente, ~5 veces el interno) muestra `achieved` cero en sus doce rubros |
| **R4** | **default de analítica por proveedor** para los 18 que concentran el **88 %** del costo sin proyecto | Gerardo | ~18 filas | **55 %** del costo en pesos queda en «sólo rubro» y la rentabilidad sigue mostrando costo del 12 % donde se espera 60-80 %. Reparación retroactiva: **~68 facturas**, no 1,362 renglones |
| **R5** | **adoptar el asistente nativo de anticipos** | Finanzas + Esteban (producto y cuenta) | capacitación | cada anticipo a mano deja un renglón sobrefacturado y **el campo de facturado roto para siempre**. Hoy: **2 usos en toda la instancia, los dos anteriores a 2025** |
| **R6** | **postear o cancelar la refactura de SO10917** | Gerardo | un documento | **cinco meses** de obra entregada **sin factura vigente** |
| **R7** | **la moneda de SO10344** | Gerardo + decisión de Esteban | contra el banco | nueve documentos en dólares por una orden en pesos, **18.9 veces** el valor en el mayor, y una nota de crédito **en borrador desde julio de 2025** |
| **R8** | **los 63 pagos de BBVA sin conciliar**, con seis referencias duplicadas | Gerardo, contra el estado de cuenta | una sesión de trabajo | **92 % del dinero sin conciliar en 20 % de los documentos**, y **61 de 63 traen su referencia escrita en el propio pago**. Es conciliación, no investigación |
| **R9** | **el borrador de factura de comisión sin postear desde noviembre de 2025** | Gerardo | un documento | **diez meses** en borrador, mismo importe y proveedor que una que **sí** está posteada |
| **R10** | **archivar los rubros de comisión de quien ya salió** (no borrar) | Esteban | minutos | el selector futuro ofrecería tres personas que no están — el defecto que se quiere quitar |

**R1, R2 y R3 son las tres más baratas y las tres más caras de no hacer**: son un campo y dos
limpiezas de filas, ninguna toca código, y las tres sostienen números que hoy se leen como
ciertos.

---

## 7 · El plan maestro, con secuencia y dependencias

### 7.1 · Para octubre (está a una semana): lo que no necesita pantalla nueva

| # | qué | sesiones CC |
|---|---|---|
| **R** | las diez reparaciones de §6 | **0** (Esteban y Gerardo) |
| **F1b** | `machote-guardar` **persiste los compromisos** en las columnas de la 009 | **1** |
| **F1c** | capturar los cuatro compromisos en los machotes vivos | **0** (el equipo) |
| **F3a+b** | **corregir el nombre** del campo y **el selector de oportunidad**, sugerida | **1** |
| **F1d** | la Confirmación **jala el presupuesto del machote** y **agrega el rubro de viajes** | **1** |

**Cinco piezas, tres sesiones de CC.** Nada cambia la forma de trabajar: llena campos que ya
existen y corrige un nombre.

### 7.2 · Después de octubre

| # | qué | sesiones | depende de |
|---|---|---|---|
| **F1e** | la Confirmación completa jalando del machote (contacto, fechas propuestas, entregables borrador, **selector de `hr.employee`**) | 1–2 | F1b, F1d |
| **F1f** | los candados que faltan: PO validada al subir, cuadre al centavo, IVA + leyenda, anticipo por monto | 2–3 | decisiones de §8 |
| **C1** | módulo de comisiones: catálogo + ids + selector | 1–2 | **R2 y R3 limpias** |
| **C2** | la Confirmación escribe el presupuesto de comisión por persona | 1 | C1 + F1d |
| **F3c** | la oportunidad pasa a **obligatoria** | 0.5 | los 24 ligados + F3b probado por alguien más |
| **F2** | **la cotización nace en la suite** | **4–6** | F1 cerrada, F3 en «sugerida» |
| **F2b** | el candado de Odoo (esconder el botón, o `ir.rule`) | **0** | F2 siendo ya el camino normal |
| **A** | adicionales como orden hija (campo de orden padre) | 1 | F2 |

### 7.3 · Las dependencias, una línea cada una
- **F1b → F1c → F1e**: sin guardar los compromisos, la Confirmación los vuelve a pedir.
- **F3a → F3b → F3c**: sin el nombre corregido, el selector guarda bien y la pantalla miente.
- **R2/R3 → C1**: sin limpiar la ambigüedad, el catálogo alimenta un mapeo que estampa el
  rubro equivocado.
- **F1 + F3 → F2**: la cotización hereda el contrato de la Confirmación y el candado de la
  oportunidad. Construir F2 antes es construir sobre un contrato abierto.
- **F2 → F2b**: bloquear Odoo antes de que la suite sirva deja al equipo sin cotizar (§8).
- **F2 → A**: no hay dónde colgar una orden hija si la orden no nace en la suite.

### 7.4 · Lo que NO recomiendo meter a octubre
- **F2**: 4–6 sesiones sobre la pantalla que el equipo usa a diario. Con una semana de margen
  es cómo se rompe producción.
- **El alta automática de personas** en el catálogo de comisiones: dos de tres escrituras sin
  probar.
- **`mandatory` del eje de proyecto**: la herramienta correcta es el **default por proveedor**
  (18 proveedores, 88 % del dinero), no el candado por línea.

---

## 8 · Lo que necesito que decidas

### Bloquean el diseño
1. **¿La analítica del anticipo lleva el proyecto, o no?** *(sigue abierta del #291)* Si la
   lleva, el proyecto registra ingreso antes de tener avance; si no, muestra ingreso cero
   mientras cobra la mitad. Las dos son defendibles y el módulo tiene que elegir **una** para
   poder crear la factura.
2. **¿Se adopta el asistente nativo de anticipos?** *(sigue abierta)* De esto depende si el
   campo de facturado vuelve a ser creíble o si la Confirmación calcula el avance por su
   cuenta para siempre.
3. **¿La oportunidad es obligatoria, y desde cuándo?** *(sigue abierta)* Mi recomendación:
   **sugerida ahora, obligatoria cuando los 24 estén ligados** (§4.3).
4. **¿Qué hace la Confirmación con una orden cuyas facturas no cuadran?** *(sigue abierta)*
   40 de 179 caen en alguna regla. ¿Bloquea, avisa, o confirma y lo anota?
5. **El cuadre al centavo: ¿contra el subtotal o contra el total con impuesto?** La PO del
   cliente suele traer el total; el machote razona en subtotal. Sin esto el candado no se
   puede escribir.
6. **El anticipo: (a) ¿sobre total o subtotal? (b) ¿en pesos, y qué pasa con las órdenes en
   dólares** —112 contra 101 en 2026, no son un caso raro— **(c) ¿el porcentaje es fijo o por
   cliente?**
7. **¿El machote nombra al beneficiario de la comisión de cliente, o se decide al pagar?**
   De esto depende si el selector del lado cliente trae los contactos del cliente elegido o
   una lista global.

### No bloquean, pero cuestan dinero si se dejan
8. **R1, R2 y R3** (§6): un campo y dos limpiezas de filas. Las tres más baratas del informe.
9. **¿Se comisiona cuando el cliente paga?** Hoy **no hay dónde escribirlo** y la cadencia
   medida dice que se pagó sin mirar el cobro. Si la respuesta es sí, hace falta el campo.
10. **¿Se archivan los rubros de comisión de quien ya salió?** Propuesta: sí, archivar; nunca
    borrar.
11. **R4 a R9** (§6): el default por proveedor, la refactura sin postear, la moneda de
    SO10344, los 63 pagos, el borrador de diez meses.

---

## 9 · Los workflows TMP de esta sesión

| id | nombre | qué consulta | estado |
|---|---|---|---|
| `tURR0FDHK41kzjS8` | `TMP · comisiones del machote (sesion 3)` | tres `SELECT` con el rol `comercial_app`: (a) qué personas aparecen en las comisiones de los 24 machotes y en cuántos, por lado; (b) la sección de comisiones machote por machote; (c) cuántas versiones tocaron alguna vez las comisiones | **INACTIVO**, sólo lectura. Ejecutado en manual una vez (**112471**, `success`) |

**No se borró ningún TMP**, ni el de esta sesión ni los de las anteriores.

---

## 10 · Lo que NO se pudo verificar
- **Si el 90 % consumido del presupuesto de una persona es por el IVA de su rubro.** Es el
  único candidato a la vista y el orden de magnitud cuadra, pero no lo medí como causa.
- **Cómo resuelve Odoo la ambigüedad** entre reglas del mismo prefijo (¿menor id, última
  creada?). Se ve el resultado, no la regla de desempate.
- **Las 18 reglas del prefijo `1.1`**: contadas, no medidas.
- **Si los `in_payment` de las facturas de comisión son cobros reales**: se compara contra el
  banco, no contra Odoo.
- **`comercial/confirmar` nodo por nodo**: leí su metadatos, su estado de publicación y la
  pantalla que lo consume, no sus 21 nodos. El contrato de §2.3 es **diseño nuevo**, no una
  descripción de lo que ya hace.
