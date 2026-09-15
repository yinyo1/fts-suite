# Parche S4 — los seis cambios aprobados al correo del semaforo

Estado: **CONSTRUIDO, VERIFICADO CONTRA DATOS REALES, NO APLICADO.**
Issue #240. Nodo destino: `Code - buildEmail` de `ops/watchdog-semaforo`
(`29eaGe2wkS98lRMU`).

**Requiere una pegada manual en la UI de n8n.** El porque esta abajo, en
*Por que va como parche y no aplicado*.

---

## Base: de donde sale y contra que se diffea

`Code-buildEmail_BASE.js` es el `jsCode` **publicado** leido del server el
15-sep-2026, no una copia de `docs/`. La version corriendo en ese momento:

```
id               29eaGe2wkS98lRMU
active           true
triggerCount     1
versionId        fe8a4b06-7ccc-4eb7-b975-f8495e88be34
activeVersionId  fe8a4b06-7ccc-4eb7-b975-f8495e88be34   <- iguales: lo guardado ES lo que corre
activeVersion.sameAsDraft  true
```

```
Code-buildEmail_BASE.js   25,799 chars   388 lineas   sha256 6d0798e5444abd36181bc6203e0e85204afff893d9efb7f59ca942c32c619b43
Code-buildEmail_S4.js     31,830 chars   484 lineas   sha256 b09307eb4b655c42d778fe9959665c662f3e053b195cd0e494d6c223dd471cf4
```

`S4.diff` = los **9 hunks** completos. `chip-solo.diff` = el hunk de `chip()`
aislado, **uno solo**, para poder revisarlo sin leer el resto.

Construido programaticamente desde el BASE con guardas de conteo por hunk
(cada `find` se aborta si no calza exactamente 1 vez), no transcribiendo.

---

## Los seis cambios

### 1. Seccion `No pueden esperar`, por CONDICION y no por cambio

Va **primero**, todos los dias, sin tocar el delta. Lo que sale ahi **no se
repite** en `Lo que cambio`.

Criterio: **rojo Y (vencido >45 dias O >90 dias en la etapa)**.

```js
const A1_VENCIDO_DIAS = 45;
const A1_ETAPA_DIAS   = 90;
const A1_TOPE         = 8;   // valvula: si el universo crece, la seccion no explota
function noPuedeEsperar(r){
  if(r.color_a_rep!=='rojo') return false;
  const v = diasVencido(r);
  return (v!==null && v > A1_VENCIDO_DIAS) || ((r.dias_en_stage||0) > A1_ETAPA_DIAS);
}
```

**El `O` es lo que salva el caso que motiva la seccion.** SO10337 (id 212)
trae **248 dias en la etapa** y solo **14 de vencido**, porque la fecha de
compromiso se puede mover y los dias en la etapa no. Un criterio que mida solo
cuanto lleva vencido lo pierde:

| criterio | 11-sep | 13-sep | 14-sep | pierde SO10337 |
|---|---|---|---|---|
| rojo + vencido (cualquiera) | 21 | 21 | 21 | no, pero trae 21 renglones |
| rojo + vencido >30d | 11 | 11 | 11 | **si** |
| rojo + vencido >60d | 4 | 4 | 4 | **si** |
| rojo + >60d en la etapa | 5 | 5 | 5 | no |
| **rojo + (vencido >45 O >90d etapa)** | **7** | **7** | **9** | **no** |
| rojo + (vencido >30 O >60d etapa) | 10 | 11 | 13 | no |

Nueve renglones estables, repartidos 4 Operaciones + 5 Admin.

### 2. `Ya no piden nada`: encabezado nuevo, sin lista

Se imprime el titulo con el conteo y el criterio. Los sanos no se listan.
El encabezado del resumen tambien cambia: ya no promete "lo que cambio" cuando
la primera seccion sale por condicion —

```
Hoy el correo trae todo lo que pide algo; los que no piden nada van contados al pie, sin listar.
```

y el token del asunto pasa de `lo que cambio` a `todo lo que pide algo`.

### 3. El aviso de `create_date`, por PROPORCION

Era una guarda que avisaba **igual** ante una falla total de la lectura de
etapas y ante una condicion perfectamente normal. Medido:

```
10-sep   35 de 35   <- la lectura de msg94 FALLO. Alarma real.
11-sep    2 de 36   \
13-sep    2 de 36    >  SIEMPRE los mismos: ids 2377 y 2376
14-sep    2 de 36   /
```

Lectura cruda de Odoo de esos dos: `write_date == create_date`, los dos en
`To Do`. **Nunca se movieron de etapa**, asi que no existe ningun
`mail.message subtype_id=94` que leer y **su numero es correcto**.

El corte es 50%:

```
>= 50%  "la lectura de cambios de etapa FALLO ... Los numeros de hoy no son comparables con los de ayer."
<  50%  "nunca han cambiado de etapa desde que se crearon, asi que su edad es su tiempo en la etapa y el numero es correcto."
```

Las dos ramas ejercidas localmente (ver *Verificacion*).

### 4. La guarda de `Odoo - getAll attachments`, condicionada al consumidor

**El nodo NO se borra.** Lo que cambia es que la guarda solo avisa cuando el
consumidor esta encendido:

```js
const AP_VIVA = !!(C.ap_confirmacion && (C.ap_confirmacion.aplica_stages||[]).length);
const diagVisible = diag.filter(function(d){
  if(d.nodo === 'Odoo - getAll attachments' && !AP_VIVA) return false;
  return true;
});
```

Estado hoy en `main`: `ap_confirmacion.aplica_stages: []` — apagado en S1
(#220) tras disparar en 8 de 8 proyectos del stage 13. El unico consumidor de
`R_ATT` esta detras de `if(apTpl && ...)` en el motor, asi que con el control
apagado esa lectura no se usa para nada y su vacio no significa nada. Cuando
Esteban lo reactive poniendo `aplica_stages: [13]`, **la guarda vuelve sola**:
sale de la config viva, no hay que tocar codigo.

Efecto colateral buscado: `REVISAR MEDICION` desaparece del asunto, porque el
token ahora sale de `diagVisible`, no de `diag`.

### 5. El KPI, por grupo y sin llamarse semanal cuando es la foto de un dia

El defecto: `rows` y `aAll` son de modulo (los 36 proyectos) y `buildMsg`
recibe `subset`. Los dos correos imprimian el **mismo 39%**, que no cuadra
contra el encabezado de ninguno de los dos.

```
antes:  Operaciones 39%   Admin 39%
ahora:  Operaciones 45% (9/20)   Admin 31% (5/16)   +  "toda la empresa: 39%"
```

Y el nombre deja de mentir: `KPI <grupo> (foto de hoy)` cuando la serie tiene
menos de 4 dias, `(promedio de N dias)` cuando ya es un promedio. Antes decia
`KPI semanal` en los dos casos.

**El cambio se explica dentro del propio correo**, una linea bajo el numero,
porque es un numero que el equipo ya vio distinto:

> Este numero cambio el 15-sep: antes se imprimia el de TODA la empresa en los
> dos correos, asi que no cuadraba contra el encabezado de ningun grupo. Ahora
> es el de <grupo>.

### 6. `chip()`: el separador en el TEXTO, no solo en el CSS

Un hunk, aislado en `chip-solo.diff`. Con CSS se ve igual; sin CSS se sigue
entendiendo. Afecta cuatro sitios donde la etiqueta se pegaba a lo anterior.

Esteban confirmo en Outlook que **el sitio que el veia sale bien** con
espacio; esto entra como robustez para los otros tres, que nunca han salido.

---

## Verificacion (datos reales, CERO correos)

Arnes local: sustituye `$()`, `$execution` y `$getWorkflowStaticData` por el
snapshot commiteado del 14-sep (36 proyectos) y la config viva de `main`,
envuelve el nodo en `new Function` y captura lo que `buildEmail` habria
producido. **No manda nada: no hay nodo Graph.**

```
correos que produciria: 2

[Semaforo Operaciones] 14/Sep/2026 - 10 nuevos · todo lo que pide algo
PARA: los 4 de la lista de Operaciones (recipients_por_grupo, sin cambio)
  ## No pueden esperar [4]
  ## Lo que cambio desde el correo anterior [10]
  ## Siguen pendientes, sin cambio [0]
  ## Ya no piden nada [6]
  ## Problemas del propio reporte [1]
La cuenta: 20 vigilados = 4 no pueden esperar + 10 con cambio + 0 pendientes
sin cambio + 6 que no piden nada. Cuadra.
KPI Operaciones (foto de hoy): 45% en tiempo (meta >=90%) · toda la empresa: 39%

[Semaforo Admin] 14/Sep/2026 - 7 nuevos · todo lo que pide algo
PARA: los 4 de la lista de Admin (recipients_por_grupo, sin cambio)
  ## No pueden esperar [5]
  ## Lo que cambio desde el correo anterior [7]
  ## Siguen pendientes, sin cambio [0]
  ## Ya no piden nada [4]
  ## Problemas del propio reporte [0]
La cuenta: 16 vigilados = 5 no pueden esperar + 7 con cambio + 0 pendientes
sin cambio + 4 que no piden nada. Cuadra.
KPI Admin (foto de hoy): 31% en tiempo (meta >=90%) · toda la empresa: 39%
```

Primeros renglones de `No pueden esperar`, en orden:

```
Ops    R SO10337  Bridgestone      In Progress   248 dias  compromiso 2026-08-31  [atorado 248d]
       R SO9428   Nalco            In Progress   149 dias  compromiso 2026-08-31  [atorado 149d]
       R SO11547  Nalco            In Progress   119 dias  compromiso 2026-08-31  [atorado 119d]
       R SO11037  Johnson Controls  Hold          52 dias  compromiso 2026-07-30  [vencido 46d]
Admin  R SO7723   MAGNEKON         En plazo cred.  63 dias  compromiso 2025-12-23  [vencido ...]
       R SO11511  Bebidas Purif.   En plazo cred.  62 dias  compromiso 2026-03-18  [vencido 180d]
       ...
```

SO10337 sale primero, que es el punto: el 14-sep aparecio **solo porque era
dia de digest**. Ahora sale todos los dias por condicion.

Las dos ramas del aviso de `create_date`, ejercidas:

```
2/20  ->  "2 proyecto(s) nunca han cambiado de etapa desde que se crearon, asi que su
           edad es su tiempo en la etapa y el numero es correcto. Sale de la lista en
           cuanto alguien los mueva de etapa."
20/20 ->  "20 de 20 proyectos miden los dias desde create_date: la lectura de cambios
           de etapa FALLO y esos contadores son la EDAD del proyecto, no su tiempo en
           la etapa. Los numeros de hoy no son comparables con los de ayer."
```

Sintaxis: `node --check` limpio en los tres `.js`.
Un bug propio atrapado antes de correr: `diasVencido()` usaba `hoyISO`, que
**no existe en este nodo** (vive en `Code - MAIN`); habria tirado un
`ReferenceError` y matado el render entero. Corregido a `fechaStr`.

---

## Por que va como parche y no aplicado

`update_workflow` del MCP **no tiene operacion de parche**: editar un Code node
exige reenviar el `jsCode` COMPLETO (aqui ~26 KB) como parametro, o sea
reescribirlo — justo contra la regla de CLAUDE.md §17 de *modificar
programaticamente, nunca transcribiendo*. Y la ruta alterna del §17 #3 (PUT al
API publico, que si permite transformar el JSON sin teclearlo) necesita
`N8N_API_KEY`, **que esta sesion no tiene**.

Asi que la pegada en la UI es la unica ruta que no pasa por una
transcripcion a mano de 26 KB. Es el mismo camino que ya se uso para el parche
S2 de este mismo nodo (`docs/watchdogs/parches/`), cuyo codigo — `wdiag`,
`guardaLogNote`, `guardaSnapshot` — **esta vivo hoy**, aunque su README siga
diciendo "NO APLICADO".

**Desvio que hay que decir:** Esteban pidio `chip()` *"como paso unico, con el
diff de un solo hunk"*. El diff de un solo hunk esta (`chip-solo.diff`). El
**paso** separado no se pudo: cada aplicacion por MCP retransmite el nodo
entero, asi que dos pasos serian dos reescrituras completas de 26 KB en vez de
una. Va en la misma pegada, aislado y diffeado por su cuenta.

## Como aplicarlo (Esteban)

1. n8n -> `ops/watchdog-semaforo` -> nodo `Code - buildEmail`.
2. Seleccionar todo el contenido y pegar `Code-buildEmail_S4.js`.
3. Guardar. **Publicar** (el flag `active` no basta: hay que comparar
   `versionId` con `activeVersionId`, §17 quirk 2b).
4. Avisar, para leer de vuelta y confirmar que `versionId == activeVersionId`.

Antes de pegar, la llave de reversa es el `activeVersionId` de arriba
(`fe8a4b06-...`): `restore_workflow_version` deshace todo.
