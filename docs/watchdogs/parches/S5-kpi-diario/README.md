# Parche S5 — el KPI del grupo, todos los días, con su período dicho

Estado: **GUARDADO COMO DRAFT EN n8n, SIN PUBLICAR.** Issue #240.
Nodo: `Code - buildEmail` de `ops/watchdog-semaforo` (`29eaGe2wkS98lRMU`).

```
versionId del draft   3e88e677-867e-4978-bc2b-61bf47eae5d4   <- S5, esperando publicación
activeVersionId       a4080c64-522f-4184-9119-6f4b9c938092   <- S4, lo que corre hoy
llave de reversa      restore_workflow_version -> a4080c64-…
```

## Qué cambia — un solo hunk

Son **dos arreglos distintos** y conviene no confundirlos:

- **QUÉ número sale** (esto ya venía en S4): antes se imprimía el GLOBAL debajo de
  un encabezado que hablaba de un grupo, así que los dos correos decían el mismo
  39% y ninguno cuadraba contra su propio encabezado.
- **CUÁNDO sale** (esto es S5): antes, sólo los días de digest. Un número que
  aparece un día de cada cinco se lee como adorno — el correo diario decía qué
  hacer pero no si vamos mejorando.

**El período va dicho en cada cifra, no deducido del día:**

```
📊 KPI Operaciones · hoy: 45% en tiempo (9 de 20, meta ≥90%) · toda la empresa hoy: 39% (14 de 36)
📊 KPI Admin       · hoy: 31% en tiempo (5 de 16, meta ≥90%) · toda la empresa hoy: 39% (14 de 36)
```

Las dos cifras son la **foto de hoy** y las dos llevan su **denominador**, que es
lo que permite cuadrarlas contra el encabezado. No se mezcla una foto con un
promedio en el mismo renglón: eso es exactamente como nació la confusión.

## Hallazgo de paso: `kpiSem` es código muerto, y ya lo era

Al escribir la línea del promedio descubrí que **no puede imprimirse nunca**:

```js
const semana  = sd.history.filter(h => new Date(h.fecha) >= mondayOf(today));
const kpiSem  = (semana.length < 4) ? {modo:'simple', …} : {modo:'prom', …};
if (esLunes) { … }        // el digest cae en LUNES
```

`semana` se recorta con `mondayOf(hoy)` y el digest cae en lunes, así que el día
que se imprimiría el promedio la semana lleva **1 día**, nunca los 4 que pide la
rama. Medido:

```
digest lunes 14-sep · lunes de esa semana 14-sep · días en la semana: 2 -> modo simple
digest lunes 21-sep · lunes de esa semana 21-sep · días en la semana: 1 -> modo simple
```

Ya era muerto antes de este cambio: la etiqueta `promedio de N dias` que S4
llevaba en el mismo sitio **no se imprimió nunca**. Aquí **no se imprime ningún
promedio**, en vez de imprimir uno que miente, y el porqué queda escrito en el
propio nodo.

**Lo que haría falta para responder «¿vamos mejorando?»** es una ventana **móvil**
de N días hábiles, no la semana en curso. Es un cambio aparte y no se coló aquí.

## Verificación (datos reales, CERO correos)

Byte a byte contra el servidor, con el diff que el propio n8n calcula:

```
S4 local      31829  b09307eb4b655c42
__old server  31828  e7f4f67762a68d94   IGUAL
S5 local      33041  f2b541fb538dc7e7
__new server  33040  5822bbbd26d531fd   IGUAL
nodesModified 1 (Code - buildEmail, sólo /parameters) · añadidos 0 · quitados 0
hunks S4 -> S5 en el servidor: 1     @@ -444,17 +444,34 @@
```

Y el arnés corrido sobre **la copia del servidor**, no sobre la local, en un día
de digest y en uno normal:

```
16-sep (miércoles)   2 correos
  [Semaforo Operaciones] 16/Sep/2026 - 8 nuevos
  20 vigilados = 6 no pueden esperar + 8 con cambio + 0 sin cambio + 6 que no piden nada. Cuadra.
  KPI Operaciones · hoy: 45% (9 de 20) · toda la empresa hoy: 39% (14 de 36)

14-sep (lunes)       2 correos
  [Semaforo Operaciones] 14/Sep/2026 - 10 nuevos · todo lo que pide algo
  20 vigilados = 4 no pueden esperar + 10 con cambio + 0 sin cambio + 6 que no piden nada. Cuadra.
  KPI Operaciones · hoy: 45% (9 de 20) · toda la empresa hoy: 39% (14 de 36)
```

El KPI sale en los dos. El arnés no tiene nodo Graph: no puede mandar nada.
