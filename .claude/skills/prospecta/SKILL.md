---
name: prospecta
description: Arma la ficha de contactos de una planta industrial de una sola instruccion. Usar cuando se pida "prospecta <empresa>", "prospecta <empresa> en <ciudad>", prospectar una cuenta, armar su ficha de contactos, o buscar quien compra mantenimiento, agua, vapor, calderas o servicios industriales en una planta. La empresa es lo unico obligatorio; la ciudad y el giro se infieren del padron. La skill verifica sola el padron, las pruebas y los tres conectores -Odoo, Outlook, WebSearch- antes de arrancar: el operador NO tiene que pedirlo aparte.
---

# prospecta

**La frase:** `prospecta <empresa>` — y si hace falta, `prospecta <empresa> en <ciudad>`.

La empresa es **lo único obligatorio**. Todo lo demás se infiere del padrón.

> **Eso es lo único que el operador escribe.** La verificación previa la haces
> tú, sola, sin que te la pidan. Él te habla en lenguaje natural desde la web;
> no tiene terminal y no debería tener que acordarse de pedir `listo` cada vez.
> **Solo le hablas si algo requiere su decisión:** un conector caído, o una
> empresa con varias plantas.

---

## 1 · PRIMER PASO, sin que te lo pidan: verifica

Antes de escribir `prospecta`, dos cosas. No son opcionales y no se saltan.

### 1a · Lo que la máquina verifica

```bash
cd <repo>/prospector && ./prospector listo
```

Padrón vigente, pruebas en verde, salida fuera del repo. Si algo sale `FALLA`,
**dilo y no arranques.**

### 1b · Los tres conectores: LLÁMALOS

`listo` los marca `[ ? ]` porque **Python no los ve** —viven detrás de MCP—.
Llamarlos es tuyo, y llamarlos de verdad:

| Conector | La llamada mínima | Por qué importa |
|---|---|---|
| **Odoo** (M0) | una lectura a `res.partner` con el nombre de la cuenta | dice si la cuenta **ya tiene relación**, y una cuenta con historia se trabaja al revés que una fría |
| **Outlook** (M0b) | una búsqueda en el buzón con el nombre de la cuenta | la **más rentable cuando hay historia**: los correos literales de un hilo son **anclas**, y ninguna otra fuente las da |
| **WebSearch** | una consulta cualquiera | sin ella no hay OLA 1 ni motor. En una cuenta sin historia pone el **100% del valor** (medido en #295) |

Y **registra lo que contestaron de verdad**:

```bash
./prospector conectores \
  --odoo      "1 fila de res.partner, customer_rank=1" \
  --outlook   "12 hilos" \
  --websearch "10 resultados"
```

La evidencia es **obligatoria**: un `vivo` sin decir qué devolvió es una
declaración, y las declaraciones son lo que esta herramienta no acepta.

> **`prospecta` se niega a abrir la corrida sin esa constancia**, y la sonda
> **vence a los 60 minutos** —una sonda de hace seis horas no prueba que el
> conector esté vivo *ahora*—. Es el mismo mecanismo que `buscar`, que exige la
> consulta textual porque no puede comprobar que se corrió.

### 1c · Si un conector está caído

Regístralo como caído, **con lo que pasó**:

```bash
./prospector conectores --outlook-caido "timeout de MCP, no responde"
```

Entonces `prospecta` **se detiene y devuelve 3** —la misma salida que la pregunta
de la empresa multiplanta, porque es lo mismo: una decisión del operador, no un
error que arreglar—. Pásale la pregunta **en una línea**, así:

> «Outlook no responde. Es la fuente más rentable cuando hay historia —los
> correos literales de un hilo son las únicas anclas duras—. ¿Seguimos sin él o
> esperamos a que se reconecte?»

Si dice que sigan, **queda escrito**:

```bash
./prospector conectores --continuar-sin outlook --razon "<lo que dijo>"
```

Eso no es un trámite: M0b queda **`sin_acceso` con razón escrita**, y eso viaja
hasta el checklist de validaciones de la ficha. Quien la reciba va a ver que la
corrida se hizo ciega de esa fuente. **No arranques a ciegas y no simules la
fuente.**

**`WebFetch` no cuenta aquí.** Está bloqueado por egress en este entorno,
medido, y **no detiene nada**: M7 y M8 saldrán `sin_acceso` como ya está
previsto.

---

## 2 · Ahora sí, arranca

```bash
./prospector prospecta --empresa "<empresa>"
```

Eso hace solo: verifica las sondas, resuelve la cuenta en el padrón del DENUE,
infiere ciudad, giro, entidad y dominio, abre la corrida **fuera del repo**,
registra M13 con lo que el padrón contestó de verdad, y **entrega el plan con los
comandos ya escritos**.

Tres respuestas posibles, y las tres son correctas:

| Lo que sale | Qué hacer |
|---|---|
| El plan, con la geografía inferida | Seguirlo |
| **Una pregunta de una línea** (*«tiene 3 plantas, ¿cuál?»*, salida 3) | Preguntársela al usuario tal cual y repetir con `--ciudad`. **No elijas una tú.** |
| El plan con una **bandera** del padrón | Seguirlo igual. La bandera es aviso, no freno. |

### La planta de un proyecto previo NO SE DEDUCE. Se lee del registro.

> **Odoo no tiene este dato, y ahí se perdió una ficha.** `sale.order` trae el
> **cliente** y **no trae la planta**. Así que la corrida de Coficab Pesquería
> encontró tres proyectos de agua helada de esa cuenta, no vio ninguna planta
> escrita, y la ficha concluyó lo que parecía obvio: que FTS ya había trabajado
> **en esa planta**. Los tres fueron en **Ciudad Juárez**. Pesquería es cuenta
> **fría**: sin proyecto propio y sin contacto propio.
>
> Y la diferencia no es de redacción:
>
> | | |
> |---|---|
> | «ya trabajamos en su planta» | **falso.** Se cae en la primera llamada |
> | «ya le hicimos tres proyectos de agua helada a su grupo en Juárez» | **cierto**, y sigue siendo fuerte |
>
> La segunda abre la puerta igual de bien y **no se derrumba cuando el de
> Pesquería pregunta cuál proyecto**. Es el único error de la ficha que no cuesta
> una consulta: cuesta la cuenta.

La Fase 0 lee el registro declarado y te lo dice antes de la primera consulta. Si
la cuenta es fría en esta planta, `prospecta` y `siguiente` imprimen la carta de
presentación que **sí se sostiene**, y la ficha la declara con la evidencia
(referencia, planta, qué fue, canal). El checklist además **rechaza un gancho**
que afirme trabajo previo aquí cuando el registro dice que fue en otra planta.

**Tres reglas, y ninguna es negociable:**

1. **No infieras la planta de un proyecto.** Ni de la dirección de facturación
   —es la del corporativo, o la del intermediario—, ni de que el contacto del
   proyecto aparezca en una búsqueda de esta ciudad.
2. **La contraparte de un proyecto de otra planta no es puerta a ésta.** No es mal
   contacto: es excelente para *su* planta, y es semilla de la corrida
   corporativa. Simplemente no abre **esta** puerta.
3. **Si el operador te dice dónde se hizo algo, GRÁBALO.** Una línea, y vive en el
   repo —no en la sesión— para que la corrida del mes que entra no vuelva a
   especular:

```bash
./prospector donde-se-hizo --empresa "Coficab" --referencia "SO10977" \
  --planta "Ciudad Juarez" --que "chiller" --fecha "2025-11" --canal "Quimitec"
```

**Commítealo.** Si se queda solo en el contenedor, muere con la sesión y el
próximo agente vuelve a adivinar. El registro guarda empresa, planta, referencia,
fecha, qué fue y canal: **ni una persona y ni un importe**, y por eso puede vivir
en un repo público.

### Una corrida = UNA planta

**La herramienta corre una planta a la vez.** Si la empresa tiene varias, es
**una corrida por ciudad**:

```bash
./prospector prospecta --empresa "<empresa>" --ciudad "Pesquería"
./prospector prospecta --empresa "<empresa>" --ciudad "Durango"
```

**Y la herramienta ya lo guarda así, nativamente:**

```
<sesión>/coficab/pesqueria.json      ← la corrida
<sesión>/coficab/pesqueria-limpio.html   ← su ficha
<sesión>/coficab/durango.json
```

**No inventes nombres compuestos.** `--empresa "Coficab Durango"` fue el parche
que el operador tuvo que hacer cuando el guardado era plano; ya no hace falta y
además rompe el cruce con el padrón, que busca una empresa que no existe. La
empresa es `Coficab`; la planta va en `--ciudad`.

**Todos los comandos aceptan `--ciudad`** para decir de qué planta hablan. Si la
empresa tiene varias y no lo dices, **el comando se niega y te las lista** — no
elige una.

No `prospecta <empresa>` con la intención de abarcar «todas las plantas de
México» en una sola corrida. Dos razones, las dos medidas:

1. **Los bloques de 10 dejan de medir.** El bloque existe para medir rendimiento
   marginal *de un barrido*. Si el barrido salta entre seis plantas, el bloque no
   mide nada: una consulta que no rinde en Durango puede rendir en Pesquería, y
   el promedio miente en las dos direcciones.
2. **Chao1 deja de tener denominador.** Estima la población de **una** población.
   Mezclar seis plantas es estimar sobre seis poblaciones a la vez, y el
   resultado no es interpretable ni para seguir ni para parar.

Y hay una razón de oficio encima: el entregable es **por planta**. Rissia trabaja
una planta, con su responsable de mantenimiento y su ciudad.

> **Cuando la herramienta pregunta cuál planta, pregúntasela al usuario y
> espera.** Salida 3 con una pregunta de una línea es la respuesta correcta a una
> empresa multiplanta, no un error a sortear. **No elijas tú, y no las abarques
> todas.** Elegir en silencio es el defecto de los cinco DUNS de Ragasa; abarcar
> todas es el mismo error con otro disfraz.
>
> El mapeo de plantas sí se hace en **una** corrida —M12 y M2 lo dan casi
> gratis—: se anota en la señal, y cada planta con responsable se prospecta en su
> propia corrida.

### La corrida CORPORATIVA va aparte

```bash
./prospector prospecta --empresa "<empresa>" --nivel corporativo
```

**No lleva `--ciudad`**: su población no es geográfica, y el comando se niega si
se la das. Se guarda como `<empresa>/_corporativo.json` — el guion bajo la hace
imposible de colisionar con un slug de ciudad.

**M2 y M13 salen `no_aplicaba` solos**, con razón escrita: una vacante y un
establecimiento del DENUE son **objetos de planta**, y forzarlos al nivel
corporativo devuelve las plantas otra vez.

**Y en las corridas de planta esto ya pasa sin que lo pidas:** un contacto cuya
evidencia lo ubica en **otra planta o en el grupo** sale del Chao1 de esa planta y
la ficha lo lista aparte, con el comando para recogerlos. En #300 la gente
regional salió en 2 a 4 de las cuatro corridas y **cada Chao1 la sumó a su
población**: los cuatro estimaron sobre una población que no existe.

> **Y cuando la cuenta le llama a la planta de otra manera, PREGUNTA.** `COFICAB
> Monterrey` **es** la planta de Pesquería: la cuenta la anuncia con el nombre del
> área metropolitana. Sin declararlo, la exclusión de arriba tira a esa gente como
> «de otra planta» —en Pesquería tiró a las dos puertas más probables, y además
> el modo limpio las escondía por estar en revisión: **dos mecanismos, no uno**—.
>
> **El alias es criterio del operador, no tuyo** (decisión 2 de #310). Tú armas la
> pregunta con la evidencia que la motiva, y él decide en una línea:
>
> ```bash
> ./prospector alias --empresa "<empresa>" --ciudad "<planta>" --preguntar
> #   -> «Vi 'COFICAB Monterrey' en 3 fuentes y 'Pesquería' en 2. Hoy cuenta como
> #      OTRA planta y deja 1 contacto fuera de la población. ¿Son la misma?»
> #   sale con código 3: necesita su decisión, no es falla
>
> ./prospector alias --empresa "<empresa>" --ciudad "<planta>" --es "Monterrey"
> ```
>
> `--preguntar` **no declara nada**. No apliques un alias porque te parezca
> obvio: que dos nombres sean el mismo lugar es geografía local, y una `Monterrey`
> mal puesta mete gente de Apodaca en el Chao1 de Pesquería. Las corporativas
> («COFICAB Group») no se proponen nunca: ésas son el grupo, no la planta con otro
> nombre, y confundirlos es el doble conteo de #300.
>
> **Si resulta que estaba mal, se quita** (decisión 3 de #310), y el retiro
> recalcula población y Chao1 y **la ficha declara el cambio**:
>
> ```bash
> ./prospector alias --empresa "<empresa>" --ciudad "<planta>" --quitar "Monterrey"
> #   -> «1 contacto salió · población 2 -> 1 · Chao1 2.5 -> 1.0»
> ```
>
> Lo declarado y lo retirado **salen impresos en la ficha**, porque mover la
> frontera de una planta a mano y no decirlo deja una ficha que parece derivada
> cuando lleva un juicio dentro.

### Sembrar entre corridas

```bash
./prospector sembrar --empresa "<empresa>" --ciudad "<planta>" \
  --de "<empresa>/<planta de origen>" --que patron --valor "<lo medido>"
```

Se siembra **`patron`, `vocabulario` y `nota`**. **Los contactos NO**: van a la
corrida corporativa, y sembrarlos en una planta es lo que causó el doble conteo.

> **Una semilla no es evidencia, y la herramienta lo hace cumplir:** no cuenta
> como consulta, no mueve el agotado, **no cuenta como raíz** y **topa en
> CANDIDATO** hasta que esta corrida lo observe por su cuenta. La ficha lo declara
> como *«sembrado de X, no observado aquí»*. Sin esa regla, la única ancla del
> patrón de una cuenta produciría CONFIRMADO en cuatro corridas y el estado
> reportaría cuatro confirmaciones de un solo hecho.

### Cuando el tope de 60 se acaba y Chao1 dice que falta gente

```bash
./prospector tramo --empresa "<empresa>" --ciudad "<planta>"            # informa
./prospector tramo --empresa "<empresa>" --ciudad "<planta>" --renovar  # sube
```

Renueva en **tramos de 30** — tres bloques de 10, que es la ventana mínima en la
que la saturación puede dispararse — y **sólo si se cumplen las tres
condiciones**: Chao1 dice que falta gente **y tiene datos** (un `prematuro` no
manda nada), el último bloque **no** salió seco, y **queda alguna vía sin
preguntar**. La razón se escribe y sale en la ficha.

**Hasta 90 renueva sola. De ahí lo decide Esteban**, y el comando sale con
código 3: pregúntale en una línea y vuelve con `--autorizado`.

### Y si los bloques secos y Chao1 se contradicen

Ya no gana el primero que cerró. Tres casos:

| Chao1 dice | Con 3 bloques secos | Qué pasa |
|---|---|---|
| `prematuro` / `sin_datos` | **manda AGOTADO: para** | Con 5 observados y f2=1 Chao1 no tiene denominador. **No dijo «falta gente», dijo «no puedo opinar»** |
| `falta_barrer` **con datos** | **`CAMBIAR_DE_VIA`** | Las dos tienen razón: la población no está agotada, **pero esta forma de preguntar sí**. Abre vuelta con **otra vía**, sin gastar tope |
| `falta_barrer` y **no queda vía** | para, y es un hallazgo | *«La población no está agotada; las vías disponibles sí. Lo que falta necesita Sales Navigator.»* Eso le dice al operador **qué comprar** |

### Multiplanta: el orden, y por qué no son cuatro agentes ciegos

La primera corrida a escala fueron **cuatro plantas de Coficab en paralelo**, las
cuatro arrancadas desde cero al mismo tiempo. Salió trabajo de verdad, y salieron
además cuatro defectos que las cuatro corridas cometieron **por separado y a la
vez**: el mismo falso conflicto de puesto siete veces, la misma señal sin fecha,
la misma escala de cercanía invertida. Cuatro agentes ciegos no se corrigen entre
sí: **repiten el mismo error cuatro veces y lo pagan cuatro veces**.

El orden que sí funciona, y es el recomendado:

1. **Primero, en primer plano, la planta que tiene historia.** La que Odoo o el
   buzón conocen. Es la más rentable (`fts_interno` es la raíz más barata y la que
   más rinde cuando hay historia) y es la que **calibra**: de ella salen el
   vocabulario real de la cuenta, el patrón de correo, el nombre con el que la
   empresa se llama a sí misma y los títulos que de verdad usa. Córrela tú,
   viéndola, hasta la ficha.
2. **Después las demás, sembradas con lo que salió de esa.** Ya en paralelo si
   hace falta, pero **no desde cero**: cada una arranca con el patrón de correo, el
   vocabulario y los títulos que la primera midió. Una planta sembrada gasta menos
   consultas y no vuelve a descubrir lo que ya se sabe.
3. **La corporativa, aparte.** Su población es otra —dirección, compras,
   ingeniería central— y su criterio de agotado también. Mezclarla con una planta
   rompe el denominador de Chao1 igual que mezclar dos plantas.

**Nunca cuatro agentes ciegos desde cero.** Si el operador pide las cuatro ya,
dile esto en una línea —«arranco Silao primero porque ahí hay historia, y con lo
que salga siembro las otras tres»— y arranca la primera. Es más rápido en total,
no más lento.

> Sembrar entre corridas **todavía no está construido**: hoy se hace a mano,
> pasándole al agente de la segunda planta el patrón y el vocabulario de la
> primera en el prompt. Está propuesto como decisión de Esteban; mientras no
> exista, la siembra manual es parte del oficio, no un atajo.

### Si la corrida viene del RADAR, el ángulo entra sembrado

```bash
./prospector prospecta --empresa "<empresa>" --ciudad "<planta>" \
  --angulo "<la señal que lo originó>" --origen radar
```

Con `--origen radar` el ángulo entra como **gancho preliminar** y la ficha lo
declara en rojo: *«el radar sembró esto, esta corrida no lo confirmó»*. **Tu
trabajo es confirmarlo o corregirlo** antes de la ficha:

```bash
./prospector registrar --empresa "<empresa>" --ciudad "<planta>" --modulo M12 \
  --datos '{"angulo_resuelto": "confirmado"}'     # o "corregido"
```

Con `--origen manual` funciona como siempre. Sin `--angulo`, igual que hoy.

## 3 · Corre el plan, paso por paso, de verdad

**Cada búsqueda del plan se ejecuta.** El plan dice qué buscar, con qué vías y
por qué en ese orden; tú corres la búsqueda y registras lo que contestó:

```bash
./prospector buscar --empresa "<empresa>" --modulo M1 --clave directorios \
  --fuente leadiq --consulta '<la consulta textual que corriste>' --resultados N
./prospector cerrar --empresa "<empresa>" --modulo M1
```

> **La compuerta exige que la consulta esté escrita; no puede comprobar que se
> corrió.** Ese hueco lo cierras tú. Registrar una búsqueda que no corriste
> convierte la herramienta en un generador de fichas falsas.

**`--resultados 0` es válido y cuenta.** Cero resultados es una respuesta: haber
preguntado bien y no encontrar nada es trabajo hecho.

> ### No recortes la salida de `buscar`, y no repitas una consulta
>
> En Pesquería un `| tail -1` imprimió una línea en blanco, el agente creyó que la
> búsqueda había fallado y la repitió: dos consultas quedaron contadas dos veces,
> **el gasto real era 58 y el estado decía 60**.
>
> `buscar` ahora **confirma siempre en la última línea** —`REGISTRADA · [M5] fila
> 7 · 3 resultado(s) · gasto 41/90`—, así que si recortas verás la confirmación y
> no un hueco. Y si registras la misma consulta textual dos veces en el mismo
> módulo, **se rechaza diciendo en qué fila ya está**. La misma consulta en otro
> módulo sí pasa: son dos preguntas y las dos se pagan.
>
> **Si `bloque` dice 9 y `buscar` dice 10, las dos tienen razón.** El bloque cuenta
> **consultas de red** porque mide rendimiento del gasto; el registro muestra
> todas las filas, y las de M4 (`patron_derivado`) se generan local sin gastar red.
> Los dos mensajes ahora lo explican con una línea «OJO CON LAS DOS CIFRAS».

### `cercania_decision`: **0 = DECIDE · 100 = contexto**

Léelo dos veces, porque es al revés de lo que la intuición dice, y ya se capturó
invertido una vez. En Silao un agente creyó que 100 era «decide» y marcó a un
contacto de **reclutamiento** como comprador con correo sólido: el único contacto
«de valor + correo» de esa corrida era falso, y nadie lo notó hasta el cruce.

| Valor | Quién |
|---|---|
| `0`–`20` | **Decide o especifica la obra.** Mantenimiento, planta, proyectos, ingeniería, compras técnicas. Es el target. |
| `50` | **Sin estimar.** El default. No es «a medias»: es «no lo sé todavía». |
| `> 41` | **Contexto.** Sirve para vocabulario, para el patrón de correo, para saber cómo se llama la planta. No para mandarle la propuesta. |

La herramienta ahora **se niega** a dos cosas: una cercanía fuera de `0`–`100`, y
una cercanía de decisor en un puesto que por definición no compra infraestructura
—reclutamiento, RH, capital humano, prensa, recepción, becario—. Esos puestos
topan en `41`. **No es que no sirvan**: un reclutador es una fuente buenísima de
vocabulario de planta. Lo que no es, es el comprador.

## 4 · Si una fuente no está, se declara

```bash
./prospector cerrar --empresa "<empresa>" --modulo M8 \
  --estado sin_acceso --razon "<por qué exactamente>"
```

**Nunca la simules.** Los cinco estados son `respondio` · `no_aplicaba` ·
`fallo` · `sin_acceso` · `omitida_por_costo`, y los tres últimos **exigen razón
escrita**.

En este entorno, medido: **`WebFetch` está bloqueado por egress**, así que M7
(PDFs) y M8 (padrones) suelen salir `sin_acceso` legítimamente. Eso no es una
falla de la corrida.

## 5 · Gasto, lazo, cierre

```bash
./prospector estado                              # TODAS las corridas, en tabla
./prospector bloque    --empresa "<empresa>"      # las cifras salen del registro
./prospector siguiente --empresa "<empresa>"     # dice siempre qué toca
./prospector vuelta    --empresa "<empresa>"     # si el paso dice LOOP
./prospector challenge --empresa "<empresa>"     # cruza; se niega si algo está abierto
./prospector ficha     --empresa "<empresa>" --modo limpio        # escribe el .html
./prospector ficha     --empresa "<empresa>" --modo procedencia   # .html + .json
```

### Cierra el bloque cada 10 consultas. En serio.

`bloque` ya **no** lleva `--consultas` ni `--nuevas`: las dos cifras salen del
registro. Lo único que tienes que hacer es cerrarlo a tiempo.

A las 9 consultas `buscar` avisa; **a las 10 se niega a registrar la siguiente**
hasta que cierres. Eso no es un estorbo, es el arreglo de un error real: en la
primera corrida de un operador el bloque quedó en **35**, y un bloque de 35 no se
puede cerrar (el máximo es 10) **ni partir** sin editar el estado a mano.
Consecuencia: M5 cerrado como `fallo` y la vuelta que Chao1 pedía imposible de
abrir. Ahora el error se detecta cuando todavía tiene arreglo.

### La ficha sale como ARCHIVO

`ficha --modo limpio` escribe un **.html autocontenido** en la carpeta de la
corrida e **imprime la ruta exacta**. Ese archivo es el entregable: se adjunta a
un correo, se pega en un lognote de Odoo, se abre en cualquier navegador.

Trae gancho, señal con fecha, por qué ahora, a quién buscar (nombre, puesto,
planta, correo y nivel de confianza), cómo hablarles, las búsquedas ya armadas
para Sales Navigator, las fuentes con liga y fecha, y el checklist de qué se
corrió y qué salió `sin_acceso` y por qué.

**Tres de esas secciones son tuyas**, porque son criterio y el código no puede
derivarlas. Cárgalas antes de emitir:

```bash
./prospector registrar --empresa "<empresa>" --modulo M12 --datos '{
  "gancho": "<una frase: por qué esta planta, ahora>",
  "por_que_ahora": "<la lectura de la señal, con su fecha>",
  "como_hablarles": ["<con qué se le habla al de mantenimiento>", "<y al de compras>"]
}'
```

Si faltan, la ficha **lo dice en su lugar** y nombra el comando. No las deja en
blanco: una ficha que parece completa y no lo está es peor que una con avisos.

**Pásale `--liga` a cada `buscar` que tenga URL.** La ficha las imprime con su
fecha, y es lo que permite que un tercero verifique sin volver a buscar.

### Y ENTRÉGALA. Si no, se pierde.

`ficha` devuelve **código 4** —no es falla, es un paso pendiente— y te dice que
el archivo todavía no sobrevive. **Hazle caso.** La carpeta vive en `/tmp` del
contenedor y **muere al cerrar la sesión**: la primera corrida de Coficab se
perdió así, con la ficha ya escrita.

```bash
# 1. leer el .html que acabas de generar
# 2. subirlo al OneDrive del operador:
#      sharepoint_folder_search   -> el driveId de su OneDrive
#      sharepoint_upload_file     -> filename "<empresa>-<ciudad>-ficha.html",
#                                    content = el HTML completo
# 3. registrar la liga
./prospector entregar --empresa "<empresa>" --ciudad "<ciudad>" \
  --destino onedrive --url '<el webUrl que devolvió>' \
  --sha256 '<el hash que devolvió el conector>'
```

> **Pasa el `--sha256`.** La entrega de Pesquería reportó 36,650 bytes subidos
> contra 36,649 del local y nadie comparó el contenido. Pudo ser el salto de
> línea final; pudo ser un carácter cambiado en medio, y **el tamaño no distingue
> las dos cosas**. Si el conector solo te da el tamaño, pasa `--bytes`, y la
> herramienta te va a decir en voz alta que **eso no verifica**. Si no pasas
> ninguno, queda `sin_verificar` — que es exactamente como se dio por buena la
> subida de Pesquería.

**OneDrive y no otra cosa, por una razón:** es el **mismo inquilino de Microsoft**
donde ya viven su Outlook y su Odoo. La ficha lleva nombres, puestos y correos —
los datos personales no salen del control corporativo de FTS. Si OneDrive falla,
Google Drive sirve de respaldo (`create_file`, `contentMimeType "text/html"`,
`disableConversionToGoogleType true`).

> **Por correo no se puede.** El `outlook_send_mail` conectado **no tiene
> parámetro de adjuntos** —medido, no supuesto— y pegar el HTML en el cuerpo no
> sirve: el cuerpo se sanea quitando `<style>`, así que llegaría sin diseño y sin
> ser un archivo que él pueda reenviar.

Si él decide no sacarla, **queda escrito que se va a perder**:

```bash
./prospector entregar --empresa "<empresa>" --sin-entregar --razon "<lo que dijo>"
```

**Si vuelves a emitir la ficha después de entregarla, el código 4 regresa.** La
copia de OneDrive quedó vieja, y una copia vieja es peor que ninguna: él se la
manda a Rissia creyendo que es la última. Vuelve a subirla.

---

## Lo que tú decides, y el código no puede

El reparto es una línea nítida: **Python es dueño de las compuertas — orden,
presupuesto, agotado, confianza. Tú eres dueño del criterio.**

| Tuyo | Del código |
|---|---|
| Si dos empresas de nombre parecido son **la misma** | El orden de los módulos |
| Si un puesto **compra** agua, vapor o mantenimiento | Cuándo un módulo está agotado |
| Qué **título técnico** sale de una nota de prensa | Qué nivel de confianza merece un dato |
| La **redacción** de la ficha | Si el presupuesto alcanza |

Cuando una compuerta te frena, **no la rodees**: o cumples su criterio, o cierras
el módulo con su estado y su razón. El mensaje del `raise` dice cuál de las dos.

### Rodear una compuerta está prohibido, y hay que reportarlo

Esto es más fuerte que un consejo de estilo. Tres formas de rodear, y las tres
están **prohibidas**:

1. **Correr una búsqueda que la compuerta se negó a registrar.** Si
   `buscar` o `registrar` lanzaron, ese trabajo **no existe**. Volver a llamar a
   WebSearch «de todas formas» y usar el resultado deja un hallazgo en la ficha
   que no tiene fila en el registro: el agotado lo cuenta mal, Chao1 lo estima
   sobre un denominador falso, y la fuente no se puede verificar. La compuerta que
   se negó **ya te dijo qué falta** — la consulta, la fuente, el bloque sin cerrar.
   Arréglalo y regístrala. Si no se puede arreglar, cierra el módulo con su razón.
2. **Editar el JSON de estado a mano.** Pasó de verdad, en Pesquería: un agente
   convirtió las señales de objeto a texto editando el archivo, para que la ficha
   saliera. El bug que lo obligó ya está arreglado — la señal como objeto se acepta
   — pero la regla queda: **el estado sólo lo escribe la herramienta**. Desde ahora
   la corrida lleva una firma y **la ficha declara arriba, en rojo, «ESTADO EDITADO
   A MANO»** si el archivo no cuadra. No bloquea la emisión; la delata.
3. **Inventar el valor que la compuerta pedía** para que deje de estorbar: una
   cercanía puesta al revés para que un contacto pase el filtro de valor, un
   `--resultados` inflado, una razón de cobertura vacía de contenido. Una cifra
   inventada es peor que un hueco: el hueco se ve.

**Y si ocurrió, se reporta.** En el issue final, una línea por vez, con el
comando y lo que la compuerta dijo:

> «Rodeé una compuerta: `buscar` se negó a registrar *<consulta>* por *<motivo>*
> y corrí la búsqueda igual / edité el estado a mano para *<qué>*.»

No es una confesión que cueste nada: es **el dato más valioso de la corrida**. Los
siete falsos conflictos de Silao y la escala invertida salieron a la luz porque el
agente lo declaró. Una compuerta que estorba de más es un defecto de la
herramienta, y sólo se puede arreglar si se sabe dónde estorbó. Callarlo deja el
defecto vivo y la ficha sin aval.

## Dos cosas que no se negocian

1. **Nada de contactos al repo.** La corrida y la ficha van a la carpeta de la
   sesión. `flujo/salida.py` se niega con un `raise` si el destino cae dentro del
   árbol del repositorio. Es un repo **público**.
2. **Cero escrituras a Odoo.** La herramienta lee; nunca escribe. Y Lusha no se
   toca sin autorización explícita de esa corrida.

### Cuando hay varias corridas a la vez

```bash
./prospector estado
```

Sin `--empresa`, una tabla de **todas** las corridas de la sesión: gasto sobre el
tope, bloques cerrados y cuántos secos, módulo en curso, veredicto de Chao1, y
**si la ficha ya se entregó o se va a perder**. Es lo que hay que darle al
operador cuando pregunte cómo van, en vez de «N tareas en ejecución».

---

## La secuencia completa, de memoria

Cuatro comandos. Los tres primeros son tuyos y el operador no los ve; el cuarto
es el que él pidió.

```bash
./prospector listo                                   # 1 · padrón, pruebas, salida
#            ... llamas a Odoo, Outlook y WebSearch de verdad ...
./prospector conectores --odoo "…" --outlook "…" --websearch "…"   # 2 · registras
./prospector prospecta --empresa "<empresa>" --ciudad "<ciudad>"    # 3 · abre
#            ... corres el plan, cierras bloques cada 10 ...
./prospector ficha     --empresa "<empresa>" --ciudad "<ciudad>" --modo limpio
#            ... subes el .html a su OneDrive ...
./prospector entregar  --empresa "<empresa>" --ciudad "<ciudad>" \
              --destino onedrive --url '<webUrl>' --sha256 '<hash>'  # 4 · sobrevive
./prospector paquete   --empresa "<empresa>" --ciudad "<ciudad>"  # 5 · para el CRM
```

**El paso 5 es nuevo y es para la máquina, no para Rissia.** `paquete` escribe un
JSON con lo que el CRM necesita para crear la tarjeta: contactos de valor con su
nivel de confianza, la señal con su fecha, el gancho, el origen, y **el canal
recomendado por contacto** — derivado de la evidencia, no de una preferencia:
historia en el buzón → correo directo; frío con nombre → LinkedIn; puesto sin
persona → conmutador. **Celular personal nunca.**

La ficha y el paquete **no se sustituyen**: la ficha la lee una persona, el
paquete lo lee el motor 3.

Una vez sondeados, `listo` **deja de decir `[ ? ]`** y muestra lo que cada
conector contestó, con la antigüedad de la sonda. Si vuelves a arrancar más de
una hora después, hay que volver a llamarlos: la sonda vence.

## El método

El *por qué* de cada paso está en `prospector/metodo/busqueda-encadenada-contactos.md`.
Léelo antes de proponer un cambio al orden: cada paso tiene un disparador medido
detrás, y §10 dice cómo se versiona una corrección.
