# Contrato del bloque marcado — semáforo · `[[SEM]]` v1

> **Nada de esto está en producción.** El workflow que lo contiene
> (`ops/semaforo-linea-base`, `uRRGqSz9TR5bvtfT`) está **inactivo**, es **sólo
> lectura**, y **no escribe a Odoo**. `ops/watchdog-semaforo` no se tocó.
> Issue **#240**, frente **#229**.

## El problema

El delta del correo —«nuevo», «empeoró», «mejoró»— se calcula hoy contra
`staticData` (`s1_prevA` en `Code - buildEmail`). `staticData` **sólo persiste en
corridas de producción**, así que una corrida manual no lo ve, y si el workflow se
reimporta se pierde. Y el log note que el watchdog ya escribe en el chatter es
**prosa**: reconstruir el estado parseando `ESTANCAMIENTO VERDE (7d en stage)` con
una expresión regular se rompe en silencio el día que alguien mejore la redacción.

El bloque separa las dos lecturas: **la persona lee la prosa, la máquina lee el
bloque**, en la misma nota.

## El formato

Es el de la casa, no uno nuevo. `fin/watchdog-captura` lleva desde agosto
escribiendo `[[CBWATCH]]{json}[[/CBWATCH]]` en `mail.message`, con el mismo
`author_id 3` y `subtype_id 2`, y leyéndolo de vuelta — **eso ya prueba en
producción que un JSON entre marcas sobrevive al saneador de HTML de Odoo**, que
era la única duda real del formato.

```html
<p><b>Watchdog</b> (In Progress): ESTANCAMIENTO ROJO (21d en stage) · SEGUIMIENTO ROJO (40d sin nota).</p>
<p style="font-size:11px;color:#888">[[SEM]]{"v":1,"f":"2026-09-14","a":"rojo","ar":"rojo","b":"rojo","da":21,"db":40,"ta":"16-30","sa":false,"rn":2,"g":["stage_atras"]}[[/SEM]]</p>
```

| clave | qué es | por qué está |
|---|---|---|
| `v`  | versión del contrato | va DENTRO; la marca `[[SEM]]` no cambia nunca, para que un `body like %[[SEM]]%` siga sirviendo cuando el contenido evolucione |
| `f`  | fecha de la medición | |
| `a`  | `color_a` | |
| `ar` | `color_a_rep` | **el que compara el correo**. Hoy coincide con `a` porque `observacion.stages` está vacío: es una coincidencia de configuración, no una garantía |
| `b`  | `color_b` | |
| `da` / `db` | días en etapa / sin seguimiento | |
| `ta` | `tramo_a` | el delta compara TRAMO, no día: si no, todo renglón «cambia» cada 24 h |
| `sa` | `sin_avance` | |
| `rn` | `racha_nota` | |
| `g`  | tipos de bandera | el `tipo`, no el `detalle` |

**`ar`, `sa` y `ta` no son opcionales:** la firma que el correo compara hoy es
`color_a_rep | tramo_a | sin_avance` (`firmaDe`). Un bloque sin esos tres no puede
sustituir a `staticData` — reconstruiría un delta distinto del que el equipo viene
recibiendo.

**Estado completo, no delta**, por modo de falla: guardando sólo el delta habría
que sumar la cadena, y una nota perdida correría todo lo posterior para siempre.
Con estado completo, una nota perdida afecta **un día**.

## Los tres estados

| estado | cuándo | qué se puede decir |
|---|---|---|
| `con_linea_base` | hay bloque en la ventana | **qué cambió** |
| `nuevo` | hay línea base del CONJUNTO y este proyecto no estaba en ella | **entró a la lista** |
| `sin_linea_base` | no hay bloque de este proyecto en la ventana | **sólo en qué estado está hoy** |

El código de hoy sólo tiene dos, y ahí está el bug que esto arregla
(`Code - buildEmail`): `if (p === undefined) NUEVO.push(r);` — o sea que «no tengo
con qué comparar» se reporta como «entró hoy». Son dos afirmaciones distintas:
**«nuevo» es una noticia; «sin línea base» es una ausencia de medición**, y
presentarla como noticia inventa un cambio que nadie hizo. Por eso `sin_linea_base`
no viaja como renglón de trabajo sino como **salvedad** (`SIN_LINEA_BASE` del
contrato de #237).

## El arranque

El primer día ningún proyecto tiene bloque. Sin una regla explícita el correo
saldría con ~36 renglones diciendo «sin línea base»: ruido puro, y encima entrena
al equipo a ignorar la sección.

**La regla:** si NINGÚN proyecto tiene línea base, el conjunto está *sembrando*, y
eso se dice **una vez, en una frase, sin listar proyectos**; la sección de delta no
se imprime, y `nuevo` no existe (no se puede saber quién es nuevo sin saber quién
estaba). Copiado del precedente que ya corre: `fin/watchdog-captura` hace
`avisos.push('primera corrida: no hay CBWATCH previo')`.

## La ventana: 90 días, no 30

El motor usa 30 días para las banderas de integridad y copiar ese número aquí sería
el error. La nota sólo se escribe **cuando el estado cambia**, así que un proyecto
tranquilo pasa semanas sin ninguna. Medido sobre 61 días hábiles y 72 proyectos, el
hueco entre notas consecutivas del mismo proyecto fue **mediana 1 · p90 5 · p99 26 ·
máximo 48 días hábiles**. Con ventana corta, el proyecto tranquilo aparece como
«nuevo» cada vez que la rebasa: ruido periódico que se ve igual que un cambio real.

## Cómo se ejerció el LECTOR — con datos reales, y sin escribir nada

Ejecución **`98429`** (`uRRGqSz9TR5bvtfT`, manual, 2026-09-14 14:56 UTC, 10.5 s):

```
proyectos: 36 · con_linea_base: 0 · nuevos: 0 · sin_linea_base: 36
notas_watchdog_en_ventana: 99      <- la consulta SÍ devuelve filas reales
notas_con_bloque: 0                <- nadie ha escrito un bloque todavía
notas_solo_prosa: 99
arranque: true
ida_y_vuelta: { probados: 36, ok: 36, fallos: [] }
salvedades: 1 sola, con filas: []  <- NO lista los 36
_diag: []
```

Leer 0 bloques se ve **idéntico** a un parser roto (§20 #11: un `[]` no prueba que
la consulta sirva). Las dos comprobaciones separan las dos cosas sin tocar Odoo:

- **99 notas reales** del watchdog volvieron de la consulta → la consulta funciona.
  Si hubieran sido 0, el nodo levanta un `_diag` crítico que lo dice con todas sus
  letras, en vez de dejar pasar un cero tranquilizador.
- **36 de 36 ida y vuelta**: el cuerpo que el escritor produjo en esa misma corrida,
  con proyectos reales, se pasó por el parser y la firma reconstruida salió idéntica
  a la de la fila.

## Lo que falta antes de que esto pueda ir a producción

No son detalles de implementación: son condiciones.

1. **Read-back de la escritura en la misma corrida.** La guarda está escrita
   (`docs/watchdogs/parches/Code-buildEmail_CON-GUARDA-ESCRITURA.js`) y **no está
   aplicada**. Sin ella, una nota que no se escriba deja al proyecto sin línea base
   y nadie se entera — que es exactamente cómo el log note estuvo muerto del 19-jun
   al 9-sep.
2. **Alinear el criterio de escritura con el del correo.** Hoy no coinciden:
   `notable` (`color==='rojo'` o banderas) contra `enLista` (`color_a!=='verde'` o
   `sin_avance` o banderas). Medido: **28 de 1,225 apariciones (2%)** salen en el
   correo y no generan nota → se quedarían sin línea base para siempre. Y los
   **verdes nunca reciben nota**, así que serían `sin_linea_base` permanente.
3. **La compuerta de modo**, que es el punto 1 de esta misma sesión: mientras la
   línea base viva en `staticData`, una corrida manual no la contamina porque
   `staticData` no persiste. En el chatter **sí** se puede escribir desde una corrida
   manual. Esa red desaparece justo cuando se adopta el bloque.
