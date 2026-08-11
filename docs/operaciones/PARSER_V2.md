# Carga MO · Parser v2 — arquitectura, reglas duras y lecciones

> **Fecha:** 2026-08-11 · **Estado:** resolver + página construidos y probados; motor n8n en despliegue.
>
> ⚠️ **Este documento NO contiene montos individuales de nómina.** El repo es público
> (ver memoria `repo-publico-datos-sensibles`). Los números por persona viven en los
> reportes confidenciales de la auditoría, fuera del repo. Aquí sólo van reglas y lecciones.

---

## 1. Qué falló y por qué existe este rediseño

El parser v1 leía las columnas del Excel de CONTPAQi **por índice fijo**
(`const C = { …bruto:13… }`, `HEADER_ROW = 7`). CONTPAQi sólo imprime la columna de un
concepto si esa semana tuvo movimiento, así que el layout **se recorre solo**:
`TOTAL PERCEPCIONES` estuvo en las columnas **N · N · N · P · O · Q** en SEM 26/28/29/30/31/32
de 2026. Cuatro posiciones distintas en seis semanas.

Consecuencia: tres semanas de nómina sin distribuir. Y lo peor no fue el error de lectura
sino que **la suma de control daba verde en las cuatro semanas**, porque comparaba la
columna consigo misma: tanto los renglones de empleado como la fila de totales se leían
del mismo índice 13. Un checksum que valida consistencia interna de una columna equivocada.

> **La lección raíz, que se repitió todo el proyecto:** un control que se valida contra sí
> mismo no es un control. Apareció **cinco veces en un solo día**, con cinco caras
> distintas. Ver §1.1.

### 1.1 Las cinco caras del mismo error

En la construcción de este parser, el mismo defecto reapareció cinco veces en lugares que
no se parecen entre sí:

| # | Dónde | Qué hacía |
|---|---|---|
| 1 | La suma de control del parser v1 | comparaba la columna consigo misma: ambos lados salían del mismo índice fijo |
| 2 | El KPI «Va al puente» | discrepaba del bloque del puente, calculados por caminos distintos |
| 3 | `validateOnly` de `update_partial` | validaba la forma de la operación contra el MCP, sin tocar nunca el API de la instancia |
| 4 | El control de los tres pedazos | se apagaba solo cuando había códigos abortados, justo cuando había algo que decir |
| 5 | El verificador de expresiones n8n | evaluaba el interior de `{{ }}` en vez de la expresión completa, y daba verde a un valor que n8n iba a devolver como string |

> **Las cinco se ven bien. Las cinco mienten por la misma razón: verifican una parte del
> sistema contra sí misma, no contra la realidad que dicen representar.**

Que la quinta apareciera **en la herramienta que existe para detectar las otras cuatro** es
lo más ilustrativo: nada vacuna contra este error, ni siquiera estar cazándolo.

**Las tres preguntas que lo detectan:**

1. ¿Contra qué se compara este control — contra otra parte de sí mismo, o contra una fuente
   independiente?
2. ¿Qué hace cuando las condiciones son raras: grita, o se calla? (§5.4: un control que se
   silencia con ruido falla exactamente cuando lo necesitas.)
3. ¿Estoy verificando el todo, o una parte del todo que da verde por su cuenta?

**Y el remedio no es la corrección puntual, es el guardia.** Cada una de estas se arregló
dejando un assert que impide que vuelva: el smoke compara KPI contra bloque contra
`puente_total` del servidor —las tres cifras, no dos—, el resolver emite
`TOTALES_INCONSISTENTES`, el control degrada a `ok:null` con el delta visible, y el
verificador de expresiones evalúa la semántica completa de n8n. La cuarta cara apareció
*después* de arreglar la segunda, y eso fue la prueba de que el patrón necesitaba guardia y
no parche.

---

## 2. Arquitectura

```
Excel  →  operaciones/carga-mo/js/resolver.js   (función pura, sin DOM ni fetch)
              ↑ shared/operaciones/contpaqi_conceptos.json  (catálogo, leído de main EN VIVO)
          ↓ payload con _layout + clasificación
       n8n  planeacion/carga-mo (DRY-RUN)  →  reporte, sin escribir
       n8n  planeacion/carga-mo-WRITE      →  account.analytic.line
```

**El parseo vive en el browser** — el sandbox de Code de n8n no tiene SheetJS, y subir el
binario de nómina a un webhook sin HMAC empeoraría la superficie de riesgo. Lo que cambió
respecto de v1 no es *dónde* se parsea sino **qué viaja**: antes viajaba un número desnudo,
ahora viaja el número **con su procedencia** (`_layout`, `col_header`, fila). El servidor
puede rechazar lo que no reconoce; antes no tenía manera de saber si le habían mentido.

### Archivos

| Ruta | Qué es | En repo |
|---|---|---|
| `operaciones/carga-mo/js/resolver.js` | resolver puro, UMD (browser + Node) | sí |
| `operaciones/carga-mo/index.html` | página de ingesta | sí |
| `shared/operaciones/contpaqi_conceptos.json` | catálogo de conceptos + baselines | sí |
| `scripts/local/test-parser-v2.js` | oráculo de 6 semanas + caso negativo | **no** (gitignored) |
| `scripts/local/check-mutaciones.js` | 8 mutaciones sobre el Excel | **no** |
| `scripts/local/smoke-front-cargamo.js` | gate de UI con fake-DOM | **no** |
| `scripts/local/test-motor-v2.js` | 34 pruebas del motor n8n offline | **no** |
| `scripts/local/motor-v2.js` | cuerpo del motor (fuente única de los 2 workflows) | **no** |

Los `scripts/local/` están gitignored porque leen los `.xlsx` reales, que viven fuera del
repo en `C:\Users\esteb\nomina_tmp` y **nunca se copian adentro**.

---

## 3. Reglas duras del resolver

No relajar ninguna sin releer este documento entero.

1. **Cero índices hardcodeados.** Todo se resuelve por marcador y nombre normalizado.
2. **La fila de encabezados se DETECTA, no se asume.** Se barren las primeras 15 filas y gana
   la que maximiza coincidencias contra el catálogo. El `hint` sólo desempata.
3. **Match EXACTO tras normalizar. Nunca substring.** `FONDO DE AHORRO` existe en las dos
   zonas: como percepción (`FONDO DE AHORRO EMPLEADO`) y como deducción (`FONDO DE AHORRO`).
   Un substring los confundiría y mandaría una deducción al reparto.
4. **A2 suma TODAS las columnas de la zona de percepciones, catalogadas o no.** Si sólo
   sumara las conocidas, un concepto nuevo dispararía un ALTO TOTAL cuando la regla correcta
   es mandarlo al puente y seguir. A2 valida la aritmética del Excel, no el catálogo.
5. **Nada se descarta en silencio.** Una fila con dinero que no se entiende va al puente con
   su nombre. El parser v1 tiraba las filas sin código y con monto cero como "basura de
   Excel", y así perdía al trío cuando el nombre venía escrito distinto.
6. **La zona de percepciones no arranca en un índice fijo.** Es todo lo que hay entre el
   último campo fijo y `TOTAL PERCEPCIONES`.

### 3.1 Por qué la regla 6 existe

La especificación decía que los conceptos arrancaban en la **columna 3**. Arrancan en la **2**
(`C = SUELDO`). Si el arranque se hubiera hardcodeado en 3, el resolver habría tirado SUELDO
en las seis semanas y A2 habría reventado en cada renglón.

> **Es la mejor evidencia de que la arquitectura protege incluso contra el error de quien
> especifica.** El diseño dinámico absorbió un dato equivocado en la spec sin que nadie
> tuviera que adivinar.

Dato complementario: `HEADER_ROW = 7` del parser viejo **sí era correcto** en los seis
archivos. El bug era 100 % de columnas, no de fila. La detección dinámica igual se conserva,
porque "correcto en los seis archivos que tenemos" no es lo mismo que "correcto".

---

## 4. Niveles de falla

**Lo definido nunca se detiene por lo indefinido.**

| Nivel | Qué lo dispara | Efecto | ¿Gatea el botón? |
|---|---|---|---|
| 🔴 **INTEGRIDAD** | A2/A3/A4/A5/A6 · marcador ausente o desordenado · campo requerido sin resolver · código sin empleado · totales que no reconstruyen el bruto | **ALTO TOTAL**, no se escribe nada | **SÍ** |
| 🟡 **CLASIFICACIÓN** | concepto nuevo · empleado archivado · alias de trío desconocido · dinero sin destino resoluble | **al puente, el resto se escribe** | NO |
| 🔵 **AVISO** | desviación individual · firma de baja · concepto inusual · Δ% inter-semanal | se reporta | NO |

`canSend` se gatea **sólo por INTEGRIDAD**. En v1 no miraba ni el checksum: un ✗ rojo de
descuadre dejaba el botón habilitado.

### 4.1 Formato obligatorio de todo mensaje

El destino final de la página es Ulises, que no conoce Odoo ni los proyectos.
**Regla: quien lo lee debe poder decidir si sigue o se detiene sin preguntarle a nadie.**

```
[NIVEL] QUÉ pasó
        Dato:   <valor concreto: id, columna, fecha, monto>
        Acción: <qué hacer, y dónde>
```

El mensaje que realmente recibió el operador el 24-jul fue
`codigo sin empleado en Odoo (ABORTA en produccion) — $0.00`: no decía quién, ni cuándo
causó baja, ni qué hacer, y el monto era mentira del parser. Un finiquito paralizó tres
semanas de nómina y el mensaje no daba una sola salida.

---

## 5. Reglas de negocio y precedencias

### 5.1 Clasificación por concepto, no por campo

El catálogo clasifica **cada concepto** en `POR_HORAS` · `A_BOLSA` · `INFORMATIVO`, y el
monto que se prorratea es:

```
a_repartir = TOTAL PERCEPCIONES − Σ(A_BOLSA) − Σ(no catalogado)
invariante: a_repartir + Σ(A_BOLSA) + Σ(no catalogado) == TOTAL PERCEPCIONES  (±0.01)
```

Un catálogo por *campo* (bruto/vac/asim) dejaría Aguinaldo y Fondo de ahorro EMPLEADO
**dentro** del bruto, y el finiquito de una baja se repartiría entre proyectos reales
cuadrando perfecto y en verde. Silencioso.

### 5.2 Precedencia: archivado-sin-horas gana sobre solo_bolsa

> Un empleado era `solo_bolsa` **Y** estaba archivado. Con el orden original, el sueldo de una
> semana que no trabajó se habría ido callado a Ventas. Habría cuadrado, nadie se entera, y un
> centro de costos carga el sueldo de un fantasma.
>
> **La regla general: quien se fue y no trabajó tiene que APARECER, no absorberse.**

Orden correcto de la cascada para el remanente repartible:

```
1. archivado && sin horas   → PUENTE  (con la fecha de baja en el motivo)
2. solo_bolsa               → su bolsa
3. tiene horas              → prorrateo por horas   (aunque esté archivado)
4. hubo vacaciones a depto  → bolsa del departamento
5. resto                    → cola de excepción
```

### 5.3 El puente es para lo que genuinamente no tiene dueño

Al implementar la rama de archivados, el monto proyectado al puente bajó de ~$30 K a ~$8.7 K.
**Bajó por la razón correcta:** esa gente sí trabajó y sus horas están en Odoo, así que su
sueldo se atribuye a proyectos reales y sólo el finiquito llega al puente.

> Es la diferencia entre apartar dinero porque no sé qué hacer con él y apartarlo porque
> genuinamente no le toca a ningún proyecto.

Corolario para la UI: el bloque del puente **se pinta con detalle por persona y motivo**.
Un saldo en el puente sin explicación es un fracaso del diseño, no un dato.

### 5.4 El motor tiene que honrar lo que la página promete

La página y el motor deben coincidir **al centavo, y en los tres pedazos por separado**
(`a_repartir`, `a_bolsa`, `puente`). Un total que cuadra puede esconder dos errores que se
cancelan. Si difieren, es bug y bloquea.

El control se **desactiva** cuando hay códigos sin empleado: sus montos no entran al reparto,
así que los pedazos no son comparables y el control gritaría una discrepancia inventada
encima del problema real.

### 5.5 El prorrateo por viaje YA viene hecho

Cuando alguien viaja a USA, su costo lo paga FTS USA LLC y **CONTPAQi ya entrega el sueldo
prorrateado** (p. ej. 1/5 exacto por un solo día en México). El parser **no debe recalcular
nada**: sólo hay que verificar que la persona no esté además checando el kiosk mexicano esos
días, porque entonces el dinero y las horas dejarían de corresponderse.

---

## 6. Cómo se prueba

Cuatro gates, todos obligatorios antes de cualquier merge:

| Gate | Qué prueba |
|---|---|
| `test-parser-v2.js` | los 6 Excel contra el oráculo, **y** que el fallo del parser viejo sea inalcanzable |
| `check-mutaciones.js` | 8 mutaciones del Excel: cada una debe producir su código de falla y su nivel |
| `smoke-front-cargamo.js` | render con fake-DOM: 6 archivos × 3 estados de viernes + 5 respuestas del servidor |
| `test-motor-v2.js` | 34 casos del motor con mocks de Odoo, incluyendo la cascada legacy |

### 6.1 Probar que las validaciones DISPARAN, no sólo que pasan

Un set de validaciones que nunca se activa es indistinguible de no tener ninguna.
`check-mutaciones.js` corrompe el Excel a propósito —altera un concepto, mueve el total,
borra un marcador, los desordena, inyecta un concepto nuevo, destruye la fila de
encabezados, cambia un nombre del trío— y **falla si la validación correspondiente no salta
con el nivel correcto**.

> Probar que las validaciones disparan es lo que separa un parser que funciona de uno que
> sólo no ha fallado todavía.

### 6.2 Dos testigos independientes

El oráculo se validó por dos caminos que no se hablan entre sí: los totales medidos a mano
sobre los Excel, y las líneas ya escritas en Odoo de las dos semanas cargadas. La segunda
semana **no se le dio al runner como oráculo** y aun así su total salió idéntico al de Odoo.

### 6.3 Cuando el propio código se contradice

Un bug encontrado en el resolver durante este trabajo: el KPI "Va al puente" y el bloque
del puente calculaban distinto, así que la pantalla habría mostrado `$0.00` arriba y un
monto real abajo. El smoke no lo cazó porque sólo verificaba que el bloque **se pintara**,
no que **coincidiera** con el KPI.

> Una página que se contradice es peor que una que falla.

El arreglo fue doble: corregir el cálculo **y dejar el guardia** — el smoke ahora extrae el
número del KPI y el del bloque y falla si difieren. Además el resolver emite
`TOTALES_INCONSISTENTES` como INTEGRIDAD si los tres pedazos no reconstruyen el bruto.

### 6.4 Sobre las expectativas del que escribe los tests

Durante la construcción del motor, **tres expectativas del test estaban mal y el código
bien**. Eso es buena señal: significa que los tests prueban el comportamiento, no la opinión
de quien los escribió. Cuando un test falla, la primera hipótesis debe ser que la
expectativa está equivocada, no el código — y comprobarlo con datos antes de "arreglar" nada.

---

## 7. Quirks de n8n confirmados (2026-08-11)

Complementan CLAUDE.md §16 y §17.

### 7.1 `update_partial` valida verde y falla al escribir

```
validateOnly:true  → {"success": true, "valid": true, "operationsToApply": 1}
updateNode         → "request/body must NOT have additional properties"
patchNodeField     → "request/body must NOT have additional properties"
```

> `validateOnly` da verde porque **nunca toca el API**. Es el mismo patrón que venimos
> cazando todo el día: un checksum que valida contra sí mismo.

Valida la forma de la operación contra el MCP, no contra la instancia. **No lo uses como
prueba de que un edit va a funcionar.** La única prueba es el edit real seguido de read-back.

### 7.2 Ediciones grandes: cuándo NO usar `update_full`

`update_full` sí funciona, pero exige retransmitir **todos** los nodos, incluidos ~8 KB de
criptografía JS pura en el nodo `Validar JWT`. Retranscribir eso a mano para ahorrar cinco
minutos de copiar-pegar es mal negocio: el modo de falla es romper la autenticación de la
página en producción.

**Criterio:** si el cambio cabe en uno o dos nodos de Code, es preferible entregar el cuerpo
en un archivo con su sha256 y que un humano lo pegue en la UI, verificando el hash después.

### 7.3 Read-back obligatorio tras cualquier edit

Todo edit termina con: (a) `active`, porque el API togglea sin avisar y **rechaza reactivar
por MCP**; (b) sha256 del `jsCode` contra el archivo fuente; (c) los parámetros de los nodos
Odoo tocados.

---

## 8. Deuda y hallazgos abiertos

### Del sistema de incidencias

- **El bug del TAG huérfano vive sólo en la rama `auto_cierre_pendiente`.** Las incidencias
  `olvido_entrada` / `olvido_checkout` sí limpian `x_studio_horario_en_disputa` en Odoo al
  cerrarse; las de auto-cierre no. Cada semana genera huérfanos nuevos mientras no se arregle.
- **El TAG puede quedar apuntando a una incidencia que no existe** cuando se crean dos casi
  simultáneas para la misma attendance (diferencia de milisegundos en el `id_interno`).
  El cleanup resultó robusto porque borra por `attendance_id`, no por coincidencia de id.
- **Escribir por consola no genera la nota del panel**, así que W3/W4 del watchdog no ven esas
  correcciones. Trade-off aceptable en volúmenes de 2-3 registros; no como práctica.

### Del auto-cierre

- **El auto-rescate >16h es reactivo, no programado.** Vive en `kiosk/checkin` y sólo dispara
  cuando el empleado vuelve a checar. El cron 2am de Bloque B nunca se construyó.
- **Corolario:** todo mecanismo de rescate que dependa de que el empleado regrese falla
  permanentemente justo con los empleados que se fueron — y ésos son los que traen finiquito.
  Hay una attendance abierta desde mayo de una persona ya dada de baja que no se cerrará nunca.

### De la planeación

- **`planning.slot` no tiene autoría real:** `create_uid` y `write_uid` son uid 2 en los 133
  slots, o sea la credencial del webhook. Hoy no se puede auditar quién planeó qué.
- **La unión `planning.slot ↔ empleado` es por `work_email`.** Hay gente atada a un Gmail
  personal; si le cambian el correo en Odoo, sus slots quedan huérfanos en silencio.
- El proyecto va codificado en el `name` como `SO#<project_id>|<nombre> · <actividad>`, y ese
  `<project_id>` es el mismo que usa `x_studio_project_id` de la attendance.

### De los datos maestros

- `x_studio_solo_bolsa` es booleano: **no distingue "false por decisión" de "false por
  omisión"**. Si algún día importa, necesita un tercer estado.
- `x_studio_cuenta_indirecta_default` sigue sin poblar en ~41 % del roster activo (deuda E-9),
  y aplica justo a casos que hemos tenido que resolver a mano.
- Hay personal del trío sin código CONTPAQi (correcto: facturan como proveedor) y personal
  archivado con código (correcto: se necesita para las semanas donde aún salen en la nómina).

### Frente USA (backlog, no perseguir)

El costo de MO de FTS USA no entra a la analítica por ningún lado, así que los proyectos US
muestran margen inflado. Los pagos a personas **sí son identificables** en el feed de Chase
(`ONLINE … WIRE TRANSFER` + `A/C:`/`BEN:/` + nombre, y los internacionales traen el monto MXN
y el tipo de cambio en el propio memo). **El bloqueador no es leer el banco: es que no existe
captura de horas USA por proyecto**, o sea no hay denominador para repartir.

> No es un frente aparte. **La declaración semanal de RH es lo que lo desbloquea:** si "viaje
> a USA" se declara con días y proyecto, el denominador aparece y el lado del banco se vuelve
> una lectura mecánica.

### Correlaciones detectadas

- **Aguinaldo + Fondo de ahorro EMPLEADO juntos = firma de finiquito.** Aparecen sólo en las
  semanas con baja. El resolver los detecta y emite `POSIBLE_BAJA`.
- **Bono desviado + viáticos, misma persona y misma semana = firma de viaje.** Es el tipo de
  correlación que ninguna validación de un solo lado ve. Candidata a entrar al formato de
  declaración de RH.

### La configuración es el disfraz favorito de los datos sensibles

Al preparar el primer commit de este trabajo, el catálogo llevaba adentro tres bloques que
nunca debieron ir a un repo público: los nombres completos del trío, su pago semanal por
persona, y la mediana de compensación de 21 empleados que alimentaba la alerta de desviación.

> **Un dato sensible se disfrazó de configuración. No fue descuido: nadie lo pensó como
> publicable porque no se sentía como dato de nómina, se sentía como parámetro. Ese es el
> mecanismo exacto por el que se filtra información en repos públicos.**

Y tiene una segunda cara igual de traicionera: las **notas explicativas**. El barrido inicial
dejó pasar cuatro campos `_nota` y `_origen` donde se documentaba la regla con el caso real
que la originó — con nombre, monto e ids de attendance. Documentar con ejemplos reales es
buen instinto técnico y mala higiene de datos. La regla se conserva; el caso se manda al
reporte confidencial y se referencia.

**Dónde quedó la línea en este proyecto:**

| Dato | Público | Por qué |
|---|---|---|
| Alias del trío (nombres de pila sueltos) | **sí** | sin ellos la fila se descarta en silencio; no llevan monto al lado |
| Nombre completo de una persona | no | |
| Cualquier monto ligado a una persona o a un código | no | es compensación individual identificable |
| Ids de attendance en ejemplos | no | permiten reconstruir a la persona vía Odoo |
| Baselines de la alerta de desviación | no | viven en el motor n8n, detrás de autenticación |

Corolario de arquitectura: **si un dato sensible es necesario en runtime, no lo pongas en el
lado público y lo aceptes; muévelo al lado autenticado.** La alerta `DESVIACION_INDIVIDUAL`
se calcula en el motor n8n justamente por eso. El resolver degrada limpio si no recibe
baselines — no evalúa desviación y no genera falsos positivos.

Agravante que hace esto no-reversible: si algo sensible llega a `main` y hubo PR, un
force-push **no lo borra**. Los commits quedan pinneados y se pueden descargar por SHA. El
remedio es un ticket a GitHub Support, no un `git revert`.

### El bug que sólo aparece con el dato real

Al alinear el KPI del puente con el bloque, el arreglo usaba `String.replace` con un
reemplazo **de cadena**:

```js
k.innerHTML.replace(re, '$1' + money(total) + '$2');   // ✗
```

`money()` devuelve `"$1,234.56"`, y en un reemplazo de cadena **`$2` es una referencia al
grupo 2 de la expresión regular**. El HTML salió partido en dos. Con cualquier valor que no
empezara con `$` habría funcionado; con formato de dinero, nunca.

```js
k.innerHTML.replace(re, function(_m, ini, fin){ return ini + money(total) + fin; });  // ✓
```

No es la misma familia que las cinco caras de §1.1 —es escapado, no verificación circular—
pero sí la misma moraleja operativa: **lo cazó el smoke, no la lectura del código.** Un
`node -c` pasa, una revisión visual pasa, y el defecto sólo se manifiesta cuando el dato real
atraviesa la función. Por eso el gate corre con los Excel de verdad y no con fixtures
inventados.

### Alertas: señal contra ruido

La alerta original de "avisar si el concepto ≠ 0" sobre un concepto recurrente dispararía
**52 veces al año**, y el ruido constante hace que nadie lea las alertas. Se sustituyó por
**desviación contra el baseline propio de cada persona** (mediana de las últimas semanas,
umbral 20 %). Los avisos por semana bajaron de 7–11 a 1–4, y todos los que quedan son
accionables. Los baselines viven en el catálogo y se refrescan con
`scripts/local/merge-baselines.js`.

---

## 9. Antes de tocar cualquier cosa de Carga MO

1. Correr los cuatro gates de §6. Si alguno falla, no mergear.
2. Si el cambio toca la UI, el smoke-front es obligatorio: `node -c` no ve errores de runtime.
3. Si el cambio toca un workflow, read-back de §7.3 sin excepción.
4. Nunca desplegar la rama de archivados sin que el motor honre la clasificación:
   **la primera sin la segunda empeora el problema**, porque el dinero que hoy aborta
   empezaría a repartirse mal en vez de quedar visible.
5. Los `.xlsx` de nómina no entran al repo. Nunca.
6. **Antes de commitear cualquier `.json` de configuración, grep de nombres y de montos —
   la configuración es el disfraz favorito de los datos sensibles.** Incluye los campos
   `_nota`, `_doc` y `_origen`: documentar la regla con el caso real que la originó es el
   segundo camino por el que se cuela. El barrido debe cubrir nombres, montos con centavos
   e ids de registro (attendance, incidencia) que permitan reconstruir a la persona.
