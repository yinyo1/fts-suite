# El machote real — estructura, motor de precio y universo histórico

Levantado el 2026-09-03 leyendo SharePoint y Odoo directamente. Sustituye a los supuestos
del issue #148, que se escribieron sin acceso a los machotes.

**Regla que gobierna este documento:** nada de lo que sigue es una inferencia de un solo
archivo. Cada afirmación dice en cuántos ejemplares se verificó (§20 regla 8: una hipótesis
validada con un solo caso no está validada).

---

## 1. El universo

`ComercialFTS/Documentos compartidos/Cotizaciones/` (driveId
`b!N5Plc_3EukOtnOQQY-7nswcuvwDHu7RApT4N_36pMkn-uWUFrq1WRaVIMOvOKZ1s`).

- **301 archivos** inventariados, en **29 carpetas de cliente** más subcarpetas por planta
  (Mission Foods tiene 12 ciudades, Nalco 6 sitios, Clarios 4).
- La plantilla vacía vive en `Cotizaciones/Machote/` (6 archivos, entre ellos
  `Machote general MXN - SO.xlsx`, que es el original).
- Clientes con más volumen: Mission Foods (81 archivos contando ciudades), Nalco (52),
  calbee (34), Budenheim (17), Bridgestone (9).

### Cómo se amarra un machote a su orden

Dos llaves, y las dos funcionan:

1. **`sale.order.x_studio_nombre_archivo_xlsx`** (etiqueta en Odoo: "Excel Sharepoint :"),
   char con la URL de SharePoint. **711 órdenes lo tienen poblado**: 161 `sale`, 220 `sent`,
   281 `draft`, 49 `cancel`. Es el campo vivo.
   ⚠️ El MCP de Odoo trunca los char a 40 caracteres, así que por esa vía la URL **no se
   puede leer completa**. Para cruzar por URL hace falta otro camino de lectura.
2. **El número de SO en el nombre del archivo.** 25 de los 301 archivos lo traen
   (`SO11737`, `SO_11595`, `SO11272_`, `MXN - SO11697`). **Los 25 cruzan contra Odoo: 25/25.**
   La convención es real, pero **solo cubre el 8% del acervo** — se adoptó tarde.

El campo `x_studio_liga_sharepoint_presupuesto` existe pero **está poblado en 1 sola orden**
(SO9056). No es el campo de la liga; no usarlo.

---

## 2. Anatomía del libro

11 ó 12 hojas: `DESGLOSE COTIZACION` + `Seccion (1)` … `Seccion (9)`/`(10)`.

En cotizaciones grandes las hojas de sección **se renombran al nombre real del alcance**
(SO11547: `1. Desmontaje de equipos existe`, `2. Interconexiones en tuberías`). La estructura
interna no cambia — cambia la etiqueta. Un lector que busque la cadena "Seccion (" falla ahí.

### 2.1 Hoja de sección — encabezado (columna C)

| fila | concepto | fórmula |
|---|---|---|
| 2 | Mano de obra (costo) | `SUM(MO[PRECIO TOTAL])` |
| 3 | Materiales y servicio (costo) | `SUM(MAT[PRECIO TOTAL])` |
| 4 | Costos sumados | `C3+C2` |
| 6 | Comisiones CLIENTE | `(C9+C7)*F6` |
| 7 | Comisiones FTS | `C9*F7` |
| 8 | Costos totales (cuánto le cuesta a FTS) | `SUM(C4:C7)` |
| 9 | Precio de venta FTS (antes de comisiones) | `SUM(MO[PRECIO CON UTILIDAD])+SUM(MAT[PRECIO CON UTILIDAD])` |
| 10 | Precio de venta a cliente (después de comisiones) | `C9+C6+C7` |
| 11 | Utilidad | `C10-C8` |
| 12 | % utilidad obtenido | `C11/C10` |
| 13 | Horas sección | `Σ(qty × personas)` de las filas de MO |
| 16 | Nombre de sección | texto |

⚠️ **Las etiquetas de las filas 6 y 7 están cruzadas entre archivos.** En unos dice
"Comisiones CLIENTE / Comisiones FTS" y en otros al revés. Lo que manda es la posición de la
celda, no el texto. (§20 regla 2: los nombres mienten.)

### 2.2 La tabla de márgenes (E1:F5) — el corazón del motor

```
Concepto      Margen de utilidad
Programador   4,4
Mano de obra  2,5
Materiales    1,8
Servicios     1,7
Comision FTS  5,5%      (F6, = 'DESGLOSE COTIZACION'!B7)
Comision CLIENTE 0%     (F7, = 'DESGLOSE COTIZACION'!B8)
```

**El margen es un MULTIPLICADOR por concepto, no un porcentaje global.** Precio de una
partida = costo × multiplicador.

Verificado en 12 ejemplares, cinco de ellos cotizaciones de 2026 (SO11737, SO11738, SO11790, SO11836 y el USD de calbee). Lo que **no** varía:

| concepto | valor | ejemplares |
|---|---|---|
| Programador | **4,4** | 12 de 12 |
| Mano de obra | **2,5** | 12 de 12 |
| Horas extras | **mano de obra × 2 = 5,0** (fórmula `=$F$3*2`) | 12 de 12 |

Lo que **sí** varía por cotización — y por eso son campos, no constantes:

| concepto | valores vistos |
|---|---|
| Materiales | 1,4 · 1,6 · **1,8** · 2,5 |
| Servicios | 1,5 · **1,7** · 1,8 |
| Comisión FTS | 0% · 5% · **5,5%** · 6% |
| Comisión cliente | 0% · 5% · 5,2% · 5,5% · 10% |
| Margen deseado | 40% · 41,6% · 52,98% |

(negritas = valor de la plantilla original)

### 2.3 Bloque COSTO MANO DE OBRA

Columnas: `QTY | UNIDAD | Personas | DESCRIPCIÓN | PRECIO UNITARIO | PRECIO TOTAL | MONEDA | Margen utilidad | PRECIO CON UTILIDAD`

Doce renglones fijos en tres grupos:

- **Diseño y Programación** — `diseño` $200 (×2,5) · `PROGRAMADOR` $300 (×4,4)
- **En Planta** — `Supervisor Sr` $200 · `Supervisor Jr - seguridad` $140 · `Técnicos` $140 (×2,5)
- **Extras** — horas extras de supervisor / Jr-seguridad / técnicos / programador / diseño (×5,0)

Fórmulas: `PRECIO TOTAL = PRECIO UNITARIO × Personas × QTY` — el costo de mano de obra es
**tridimensional** (tarifa × gente × horas), no tarifa × horas.
`PRECIO CON UTILIDAD = margen × PRECIO TOTAL`.

Las tarifas son de la plantilla y el capturista las pisa. Los roles son cinco, no seis, y
**"soldador", "eléctrico", "mecánico", "ayudante" no existen** en el machote.

### 2.4 Bloque COSTO MATERIALES Y SERVICIOS

Columnas: `QTY | UNIDAD | Tipo | DESCRIPCIÓN | MODELO | MARCA | PRECIO UNITARIO | MONEDA | PRECIO TOTAL | Margen utilidad | PRECIO CON UTILIDAD | Link | Comentario`

- **`Tipo` ∈ {Materiales, Servicios}** y es lo que elige el multiplicador:
  `=IF(Tipo="Materiales", F4, F5)`. Es la columna que decide el precio; sin ella no hay motor.
- **`Link`** es la URL del proveedor (Home Depot, Elektron, Walmart, Sodimac…). Ese es el
  origen del precio en la práctica. No hay ninguna clasificación de confianza tipo
  "cotización / lista / histórico / estimado".
- ~180 renglones en blanco por sección, precargados con el multiplicador. El capturista
  llena hacia abajo.
- `MONEDA` es **por renglón**, no por documento.

### 2.5 Hoja DESGLOSE COTIZACION

**Tres escenarios** en un HLOOKUP sobre `D3:E9`, elegidos en `D1`
("ELIGE UN ESCENARIO PARA TU COTIZACIÓN"): **COSTO · CON UTILIDAD · MARGEN DESEADO**.
7 de 8 ejemplares quedaron en MARGEN DESEADO; SO11547 quedó en CON UTILIDAD.

```
C9  = costo total
D9  = precio escenario CON UTILIDAD  (suma de los multiplicadores por partida + comisiones)
E9  = precio escenario MARGEN DESEADO = C9 / (1 − margen − %comFTS − %comCliente)
H14 = Factor_req = 1 / (1 − margen × (1+comFTS) × (1+comCliente))
```

En el escenario MARGEN DESEADO **el precio se reparte a prorrata del costo**, no por sección:
`I18 = E9 × (MO_costo_seccion / C9)`. Es decir: el margen deseado es una restricción global y
las secciones heredan; NO se fija margen por sección.

`RESUMEN BUDGET` reparte el precio entre MANO DE OBRA / MATERIALES Y SERVICIOS por su peso
en el costo. `HORAS PROYECTO` = suma de horas de todas las secciones.

### 2.6 Bloque BUDGET ODOO

Es lo que se captura como presupuesto del proyecto en Odoo:

```
INGRESO                +precio de venta (del escenario elegido)
MANO DE OBRA           −costo MO
MATERIALES Y SERVICIOS −costo materiales
ALDO / ANGEL / DIEGO / MONTY / Rissia   −comisión de cada vendedor
BONO SUPERVISOR        −
BONO TECNICO           −
TOTAL                  = utilidad que debería reportar Odoo
COINCIDE CON LA TABLA?  VERDADERO / FALSO   ← cuadre automático
```

Amarra directo con el bloque A1 de §17 de CLAUDE.md, que ya crea `budget.analytic` +
`budget.line` al confirmar la SO con los rubros 1171 Ingreso / 1177 Mano de Obra /
1176 Materiales. **Las comisiones y bonos son justo lo que A1 dejó pendiente para fase 2.**

### 2.7 Tabla de comisiones y bonos

```
EQUIPO DE FTS INTERNO      100%  = comisión FTS
  EQUIPO DE VENTA           73%  → repartido entre vendedores nominales
  EQUIPO DE OPERACIONES     27%  → SUPERVISOR FTS 0,25 · SEGURIDAD · TECNICO1..4
```

Los nombres del equipo de venta están **escritos a mano en cada archivo** (ALDO, ANGEL,
DIEGO, MONTY, Rissia, RICARDO) con su porcentaje. En la plantilla son 0,25 cada uno.

⚠️ **Defecto real encontrado:** en `Paso de Gato MXN - SO11782.xlsx` los porcentajes de venta
son 0,20 + 0,15 + 0,05 + 0,70 + 0,15 = **1,25**, y la celda de cuadre dice `FALSO`. El machote
detecta el descuadre pero no lo impide. Eso es exactamente una regla dura para el revisador.

---

### 2.8 El margen se puede pisar renglón por renglón

La columna `Margen utilidad` de materiales trae la fórmula
`=IF(Tipo="Materiales", F4, F5)`, pero **es una celda como cualquier otra y la
gente escribe encima**.

Caso concreto: en `SO11737` la partida **"riel"** de $200, marcada como
`Materiales` (multiplicador 1,4), tiene **1,5** escrito a mano. De ahí salían
exactamente $20 de diferencia cuando se reconstruía el archivo suponiendo que
el Tipo mandaba siempre. Con el margen pisado respetado, el libro cuadra al peso:
venta de materiales 142,295 · precio con utilidad 305,839 · utilidad 136,070.

El motor respeta el valor pisado **y lo marca**, porque un margen sobrescrito
en una de cuarenta partidas no lo ve nadie leyendo la hoja.

---

## 2.9 Las ranuras son diez, aunque haya más secciones

La tabla RESUMEN de `DESGLOSE COTIZACION` tiene **diez** filas de sección, y de
ahí sale el precio. Pero un libro puede tener más hojas de sección: el machote
USD de calbee de 2026 tiene **once**, más una hoja suelta `Analisis` que no es
sección.

Las hojas de sección también se renombran al alcance real y ocupan la ranura por
posición, no por nombre: en ese mismo archivo las ranuras 1 y 2 son `MO` y
`MATERIALS`. **Una sección más allá de la ranura diez no llega al precio y nada
lo advierte.**

Conteo de hojas de sección en los cinco machotes de 2026 revisados: 6 · 7 · 9 · 9 · 11.

---

## 3. El machote NO es universal

`cuarto de boilers SO11557 - PEP.xlsx` (Mission Foods USA, USD $19,800, orden confirmada)
**no usa el machote**: es un libro libre con hojas `Presupuesto`, `Materials enchaquetado`,
`MO Enchaquetado`, `Materials pintura` y columnas propias (`item | pz | Material | subtotal | total`).

Conclusión de diseño: la aplicación tiene que modelar el machote **y** aceptar que parte del
acervo histórico no lo sigue. Un importador que asuma la estructura fallaría en silencio
sobre esos archivos.

---

## 4. Qué se corrige del prototipo (issue #148)

| # | Supuesto del prototipo | Realidad |
|---|---|---|
| 1 | Margen global en % sobre el total | Multiplicador por concepto (4,4 / 2,5 / 1,8 / 1,7) |
| 2 | Una sola comisión | Dos: FTS y cliente, cada una con su base |
| 3 | Origen del precio como enum de confianza | La columna `Link` al proveedor |
| 4 | Seis oficios inventados con tarifas inventadas | Cinco roles reales: diseño, programador, supervisor Sr, supervisor Jr-seguridad, técnicos |
| 5 | Horas extra como factor de turno (1,15 / 1,25) | Renglones propios con multiplicador ×2 sobre el de mano de obra |
| 6 | Costo MO = tarifa × horas | tarifa × personas × horas |
| — | (no existía) | Columna `Tipo` Materiales/Servicios, que elige el multiplicador |
| — | (no existía) | Tres escenarios de precio y `Factor_req` |
| — | (no existía) | Diez ranuras fijas de sección |
| — | (no existía) | Bloque BUDGET ODOO y tabla de comisiones/bonos |

---

## 5. Evidencia

Ejemplares leídos completos: `Machote general MXN - SO.xlsx` (plantilla),
`Laufan tuberia 4 in.xlsx`, `Paso de Gato MXN - SO11782`, SO11737, SO11772, SO11788,
SO11774, SO11547, SO11557 (el que no es machote), `Machote de Flete.xlsx`.

Órdenes verificadas contra Odoo (25/25 cruzan por nombre de archivo): SO11262, SO11266,
SO11268, SO11272, SO11290, SO11313, SO11314, SO11324, SO11547, SO11555, SO11557, SO11595,
SO11636, SO11697, SO11704, SO11718, SO11729, SO11737, SO11738, SO11772, SO11774, SO11782,
SO11788, SO11790, SO11836.
