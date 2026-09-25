# Cómo se usa — guía corta

> Esto es la guía de **uso**. El *por qué* de cada paso está en
> [`metodo/`](metodo/); el estado del código, en [`README.md`](README.md).

---

## La instrucción

```
prospecta <empresa>
```

Y si hace falta:

```
prospecta <empresa> en <ciudad>
```

**La empresa es lo único obligatorio.** La ciudad, el giro, la entidad y el
dominio se sacan del padrón del DENUE. Si no aparece ahí, la corrida arranca
igual y lo dice.

> **Y es lo único que escribes.** La verificación previa —padrón, pruebas, y las
> tres llamadas a Odoo, Outlook y WebSearch— **la hace Claude sola, antes de
> arrancar, sin que se la pidas.** No hay que acordarse de `listo` ni de probar
> los conectores: si algo está caído, la corrida se detiene y te pregunta en una
> línea. Si todo está en verde, arranca.
>
> **Solo te habla si hay algo que decidir:** un conector caído, o una empresa con
> varias plantas.

### Si prefieres el comando directo

```bash
cd prospector
./prospector prospecta --empresa "Hershey"
```

---

## Qué pasa cuando la dices

| Respuesta | Qué significa | Qué haces |
|---|---|---|
| Sale **el plan** con la geografía ya puesta | La cuenta está en el padrón y se resolvió sola | Nada: Claude lo sigue |
| Sale **una pregunta de una línea** — *«tiene 3 plantas, ¿cuál?»* | Varias plantas de la misma cuenta. **No elige una en silencio** | Contestas la ciudad |
| Sale el plan con **una bandera** del padrón | La cuenta no está en el mapa, o el mapa está viejo | Nada: la bandera avisa, no frena |

> **Por qué pregunta en vez de elegir:** el padrón tiene tres plantas de Bimbo en
> dos municipios. Elegir una sin decirlo es el error que en Ragasa dio cinco DUNS
> con la misma razón social, uno de ellos en Jalisco. **El nombre no desempata;
> el domicilio sí.**

---

## Qué conectores tienen que estar vivos

| Conector | Para qué | Si está caído |
|---|---|---|
| **Odoo** | M0 · ¿ya es cliente? Si lo es, el patrón de correo es **real**, no derivado | La corrida sigue. Se pierde saber si hay cuenta y el patrón real |
| **Outlook** | M0b · ¿hay historia? | La corrida sigue, **y pierde la fuente más rentable** |
| **WebSearch** | Directorios, vacantes, prensa, personas | Sin esto la cascada **no sirve**: es donde vive casi todo |

### Cómo se comprueban — y por qué no lo hace Python

```bash
./prospector listo
```

Verifica lo que la máquina puede: padrón, pruebas, destino de salida.

**Los conectores no los puede ver:** viven detrás de MCP. Darlos por buenos sin
llamarlos sería el mismo pecado que la compuerta de agotado persigue —contar una
declaración como si fuera evidencia—.

Así que **los llama Claude, de verdad, y registra lo que contestaron.** Eso pasa
solo, antes de abrir la corrida. Tú no escribes nada:

```
CONECTORES verificados antes de abrir:
  [ OK ] odoo       1 fila: res.partner, customer_rank=1
  [ OK ] outlook    12 hilos
  [ OK ] websearch  10 resultados

Corrida abierta: Grupo Cuprum · tope 60 consultas
```

Y **no es una cortesía: es una compuerta.** `prospecta` se niega a abrir la
corrida si esas tres llamadas no están registradas, y la constancia **vence a los
60 minutos** —una sonda de hace seis horas no prueba que el conector esté vivo
ahora—. Después de sondear, `listo` deja de marcarlos `[ ? ]` y muestra lo que
cada uno contestó.

**`WebFetch` no entra en la cuenta.** Está bloqueado por egress en este entorno,
medido, y **no detiene nada**: M7 y M8 saldrán `sin_acceso`, que es lo correcto.

### Si uno está caído

La corrida **se detiene antes de empezar** y te pregunta en una línea:

> «Outlook no responde. Es la fuente más rentable cuando hay historia —los
> correos literales de un hilo son las únicas anclas duras—. ¿Seguimos sin él o
> esperamos a que se reconecte?»

Si dices que sigan, **queda escrito en la ficha**: el módulo sale `sin_acceso`
con tu razón, y aparece en el checklist de validaciones. Quien reciba la ficha va
a ver que la corrida se hizo ciega de esa fuente.

**Nunca arranca a ciegas, y nunca simula la fuente.**

### Reconectar

Ajustes → Conectores en claude.ai. Odoo es `FTS_Odoo`; Outlook, `Microsoft_365`.
Cuando la sesión lleva horas, la de Odoo caduca y hay que reautenticarla: el
síntoma es `MCP server session expired`.

---

## Varias plantas, varias corridas

**Una corrida es una planta.** Si la empresa tiene cuatro, son cuatro corridas:

```
prospecta Coficab en Pesquería
prospecta Coficab en Durango
```

Y se guardan separadas sin que tengas que inventar nombres:

```
<sesión>/coficab/pesqueria.json
<sesión>/coficab/durango.json
```

**No hace falta escribir «Coficab Durango».** Eso era un parche de cuando el
guardado era plano, y encima rompía el cruce con el padrón —que buscaba una
empresa que no existe—.

### Y la gente REGIONAL ya no ensucia las cuatro fichas

Antes, compras corporativas o EHS regional aparecían en las cuatro corridas y
**cada una los contaba como suyos**. La ficha de una planta llegaba con un
contacto de otra ciudad, y la estimación de cuánta gente falta se calculaba sobre
una población que no existe.

Ahora salen aparte, y tienen su propia corrida:

```
prospecta Coficab a nivel corporativo
```

La ficha de cada planta te dice cuántos encontró que **no son de esa planta**, y
el comando exacto para recogerlos. **Y nadie se excluye por su puesto**: sólo por
lo que una fuente dijo de dónde está. Si nadie lo dijo, cuenta como de la planta.

### Cuando la cuenta le llama a la planta de otra manera

`COFICAB Monterrey` **es** la planta de Pesquería: la cuenta la anuncia con el
nombre del área metropolitana. La herramienta no lo puede adivinar —que dos
nombres sean el mismo lugar es geografía local—, y sin decírselo **excluye a esa
gente como «de otra planta»**. En Pesquería eso tiró a las dos puertas más
probables de la corrida.

Se declara en una línea:

```
./prospector alias --empresa 'Coficab' --ciudad 'Pesqueria' --es 'Monterrey'
```

Queda en la corrida, **sobrevive a releerla**, la exclusión lo respeta, y **sale
impreso en la ficha**: es criterio tuyo, no evidencia, y quien lea la ficha tiene
derecho a saber que la frontera de esa planta se movió a mano. El comando te dice
**a cuántos contactos devolvió a la población**.

Un alias de dos letras se rechaza: abre la puerta de la población, y uno flojo
mete gente de otra planta en el Chao1 de esta —que es la cifra que decide cuándo
parar—.

### Si la primera planta ya midió algo, la segunda arranca con eso

```
siembra en la corrida de Durango el patrón de correo que salió en Juárez
```

Se siembra el **patrón de correo** y el **vocabulario** — no los contactos, que
van a la corporativa. Lo sembrado entra marcado: la ficha dice *«sembrado de la
corrida de Juárez, no observado aquí»*, y **se queda en «candidato»** hasta que
esa corrida lo verifique por su cuenta.

> Eso último no es prudencia de más. Si una semilla contara como fuente, el único
> correo real que se encontró en Juárez haría que las cuatro corridas dijeran
> «confirmado» — cuatro confirmaciones de un solo dato, y leyendo el archivo no
> habría forma de notarlo.

### Cuando se acaban las 60 consultas y todavía falta gente

La herramienta **sube el tope sola, en tramos de 30, hasta 90** — y sólo si la
evidencia lo justifica: que la estimación diga que falta gente **y tenga datos
para decirlo**, que el último tramo no saliera vacío, y que quede alguna fuente
sin preguntar. Deja escrito por qué, y sale en la ficha.

**De 90 para arriba te pregunta a ti.** Una línea, y sigue.

Y hay un caso nuevo que antes se resolvía mal: cuando los últimos tres tramos no
trajeron nada **pero la estimación dice que sí falta gente**, las dos cosas son
ciertas — **la población no se agotó, la forma de preguntar sí**. Entonces no para
ni gasta más: **cambia de vía**. Y si ya no queda ninguna, para y te lo dice como
lo que es: *«lo que falta necesita Sales Navigator»*, que es información para
decidir una compra.

### Cómo van todas a la vez

Pregúntale «¿cómo van las corridas?» y verás una tabla: gasto sobre el tope,
bloques cerrados y cuántos secos, en qué módulo va cada una, y **si la ficha ya
se entregó o se va a perder**. No «N tareas en ejecución».

### Si la señal vino del radar

Cuando el radar (que todavía no existe) detecte algo, la corrida arranca con ese
ángulo ya puesto:

```
prospecta Coficab en Durango con el ángulo "inauguración de la nave nueva, funde cobre" desde el radar
```

La ficha lo marca en rojo como **gancho preliminar**: *el radar lo supuso, esta
corrida no lo confirmó*. La corrida lo confirma o lo corrige, y hasta que lo haga
el aviso se queda. **Un gancho que nadie verificó no puede salir con el mismo
peso que uno medido.**

---

## Qué entrega, y dónde queda

> ### La ficha NO se queda en la sesión: se entrega
>
> La carpeta de la corrida vive en `/tmp` del contenedor de Claude Code, y ese
> contenedor **muere al cerrar la sesión**. La primera corrida de Coficab se
> perdió exactamente así, con la ficha ya generada.
>
> Ahora, al cerrar la ficha, **Claude la sube a tu OneDrive** y te da la liga. Es
> automático: no hay que pedirlo. Si algo falla, te lo dice y no se queda callado.
>
> **Por qué OneDrive y no correo:** el conector de Outlook **no puede mandar
> adjuntos** —medido—. Y OneDrive es tu mismo inquilino de Microsoft, así que los
> nombres y correos de la ficha no salen del control de FTS. Google Drive queda
> como respaldo.
>
> Si prefieres no sacarla, se puede —pero **queda escrito** que esa ficha se
> pierde al cerrar.
>
> ### Y la subida se comprueba por CONTENIDO, no por tamaño
>
> La entrega de Pesquería reportó **36,650 bytes subidos contra 36,649 del
> local**, y nadie comparó el contenido. Pudo ser el salto de línea final. Pudo
> ser un carácter cambiado en medio: **el tamaño no distingue las dos cosas**.
>
> Claude pasa el hash que le devolvió el conector y la herramienta lo compara
> contra el del archivo en disco:
>
> ```
> ./prospector entregar --empresa 'Coficab' --ciudad 'Pesqueria' \
>   --destino onedrive --url '<webUrl>' --sha256 '<el hash que devolvió>'
> ```
>
> El veredicto **se imprime siempre**, incluso cuando no hubo nada que comparar:
> `identico` es el único que verifica; `mismo_tamano_sin_hash` dice en voz alta
> que solo se comparó el tamaño; `sin_verificar` dice que no se comparó nada. En
> Pesquería se dio por buena justo así, y por eso ahora lo dice.

**Archivos**, en **la carpeta de la sesión** — y la ruta exacta la imprime
`ficha` al terminar, para copiar y pegar:

| Archivo | Para quién |
|---|---|
| `<empresa>/<ciudad>-limpio.html` | **Rissia y Pablo, y el lognote de Odoo.** Documento autocontenido: gancho, señal con su fecha, por qué ahora, a quién buscar (nombre, puesto, planta, correo y confianza), cómo hablarles, las búsquedas ya armadas para Sales Navigator, las fuentes con liga y fecha, y el checklist de validaciones |
| `<empresa>/<ciudad>-procedencia.html` | Revisar de dónde salió cada dato, abriéndolo |
| `<empresa>/<ciudad>-procedencia.json` | Auditar a máquina. Cada campo con todas sus fuentes, su raíz y su fecha |

Los `.html` son **documentos completos**, con `charset` declarado: se adjuntan a
un correo y se pegan en un lognote sin que los acentos se rompan. Hasta la v0.9.0
eran fragmentos y sí se rompían — lo destapó la primera corrida de un operador.

**Los contactos que le faltan una comprobación SÍ salen en la ficha limpia**, en
su propia sección «**Por confirmar**», con su nombre, su puesto probable y **la
razón exacta de lo que falta, en la misma fila**. Un contacto pendiente con su
razón visible vale más que un hueco: la ficha de Pesquería salió con cero
personas con nombre mientras las dos puertas más probables estaban justo ahí, en
revisión. Lo que la ficha limpia sí oculta es la **procedencia técnica** —qué
fuente lo trajo, con qué consulta—, no a la persona. El que **ya no trabaja ahí**
sigue fuera: a ese no le falta una comprobación.

**Tres secciones de la ficha son tuyas**, porque son criterio: el gancho, el «por
qué ahora» y el «cómo hablarles». Se cargan con `registrar` antes de emitir, y si
faltan la ficha **lo dice en su lugar** en vez de dejarlas en blanco.

La ruta también la imprime el arranque. Por omisión:

```
$TMPDIR/prospector-corridas/<sesión>/
```

### Nunca en el repo, y no es por descuido

> Los contactos son **datos personales** y este repositorio es **público**. La
> ficha lleva nombres, puestos y correos.

`flujo/salida.py` **se niega con un error** si el destino cae dentro del árbol del
repositorio, incluso si se lo pides a mano con `PROSPECTOR_SALIDA`. El
`.gitignore` sigue ahí, pero es la red, no la cerradura.

**La ficha vive con la sesión.** Si la vas a guardar, descárgala. A futuro los
contactos van a Postgres y de ahí a Odoo; hoy no, a propósito.

---

## Qué hacer si una fuente sale `sin_acceso`

**Nada urgente. Es información, no una falla.** La ficha trae un checklist de
cierre que declara cada hueco con su razón, y ésa es la diferencia entre *«no hay
nada»* y *«nadie preguntó»*.

| Sale `sin_acceso` | Por qué, y qué hacer |
|---|---|
| **M7 · PDFs** y **M8 · padrones** | `WebFetch` está bloqueado por la política de egress. **Medido, no supuesto.** No se arregla desde aquí: el camino es n8n. Normal que salgan así |
| **M9 · aduanas** | Panjiva y el detalle de Veritrade piden suscripción |
| **M0b · Outlook** | El conector está caído. **Esto sí vale reconectar**: fue la fuente que destapó las dos cotizaciones de Ragasa y el NDA de Hershey |
| **M0 · Odoo** | Igual: reconectar |

Los cinco estados y lo que significan:

| Estado | Qué dice |
|---|---|
| `respondio` | Contestó. **Cero resultados ES una respuesta** |
| `no_aplicaba` | Nada que aportar por su naturaleza. **Exige el por qué** |
| `fallo` | Se intentó y no contestó. Va a la cola de reintento |
| `sin_acceso` | Hueco declarado, **nunca simulado** |
| `omitida_por_costo` | **Exige quién decidió** |

---

## Además de la ficha: el paquete para el CRM

```
saca el paquete de la corrida de Durango
```

Escribe un **JSON** con lo que un CRM necesita para abrir la tarjeta: los
contactos de valor con su nivel de confianza, la señal con su fecha, el gancho, y
**por qué canal conviene el primer toque de cada uno** — si hay historia en el
buzón, correo directo; si es frío pero tiene nombre, LinkedIn como refuerzo; si es
un puesto sin persona, el conmutador de la planta. **Celular personal, nunca.**

La ficha es para leerse; el paquete es para que una máquina lo consuma. **Las dos,
no una.** Y el paquete **no incluye a la gente de otra planta**, justo para que la
tarjeta no nazca con el contacto equivocado.

## Lo que la herramienta NO hace

- **No escribe a Odoo.** Lee. Nunca escribe.
- **No gasta Lusha** sin autorización explícita de esa corrida.
- **No raspa LinkedIn autenticado.** Arriesga el baneo de la cuenta de Rissia, y
  eso no es reversible.
- **No elige entre fuentes que chocan**, salvo cuando hay mayoría clara de tres
  contra una *y* alguien vio un dato literal. Entonces reporta el valor **con la
  disidencia al lado** — ver §5.1 del método.
- **No corre barridos pesados en horario de producción** (07:00–18:00 CST).

---

## Cuando algo te frena

El mensaje dice qué falta y cómo cumplirlo. Ejemplo real:

```
⛔ COMPUERTA: [M1] NO agotado: MINIMO TRES directorios DISTINTOS consultados
y contrastados. Lleva directorios=1, se exigen 3. Vías distintas en el
registro: leadiq. Repetir la misma vía, o repetir la misma consulta con otra
etiqueta, no suma.
```

Dos salidas, y ninguna es rodearla:

1. **Cumplir el criterio** — correr dos directorios más.
2. **Cerrar el módulo con su estado y su razón** — si de verdad no hay más.

> La compuerta no está para estorbar. Está porque en septiembre una ficha salió
> diciendo *«patrón 100%, el más limpio de las ocho»* con **un solo directorio**
> detrás.
