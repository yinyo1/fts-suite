# Cambios de la herramienta

Versiona **la herramienta**, no el metodo. El metodo tiene su propio historial
en §10 de [`metodo/busqueda-encadenada-contactos.md`](metodo/busqueda-encadenada-contactos.md).

## 0.8.0 — 2026-09-24

La version que salio de una corrida real de **132 consultas** sobre una cuenta
sola. No trae funciones nuevas por gusto: trae ocho defectos que 132 consultas
encontraron y que ninguna prueba de escritorio habia encontrado, mas el modulo
que faltaba en la Fase 0.

### M0c · `search_people` de Microsoft 365

Tercer modulo de la ola interna, despues de Odoo y Outlook. Entrada: el dominio
de correo de la empresa. Salida: **contactos implicitos** -- gente que de verdad
escribio a FTS desde esa casa-- con su correo LITERAL, que es la clase mas
fuerte de ancla que hay.

Comparte raiz `fts_interno` con Outlook a proposito: darle raiz propia habria
inflado `n_raices` con la misma casa dos veces, que es la trampa del #4.

Agotado: **DOS llamadas**, por dominio y por nombre. Cero contactos cuenta, y
significa algo -- que FTS no tiene historia con esa casa--.

### `ANCLAS_PARA_CONFIRMAR = 2`

Un correo literal prueba que ese buzon existe. **Dos** literales de acuerdo
miden la poblacion. Con uno, el patron topa en SOLIDO; con dos y dos raices,
llega a CONFIRMADO aunque un directorio siga diciendo lo contrario.

### `de_valor` y `modulo_origen` en cada entrada

Cada contacto graba si es **de valor para FTS** -- comprador tecnico o decisor
de CAPEX-- y de que modulo salio. La ficha en modo procedencia imprime sola la
tabla de rendimiento de esa corrida.

---

## Los ocho defectos que la corrida encontro

**1. El ancla ascendia a cualquiera.** `de_valor` devolvia cierto por tener un
correo literal, sin mirar la cercania. Un directorio sectorial devolvio un
correo de difusion comercial y entraba como comprador tecnico. Ahora el ancla
solo desempata cuando **nadie estimo la cercania**; si se estimo y dio contexto,
un correo literal no asciende a nadie.

**2. No habia forma de decir "ya no esta".** El asiento de mas valor de toda la
corrida resulto, en la consulta ~100, ser **director general de otra empresa**.
Nuevo campo `sigue_en_la_casa`, que solo se apaga y nunca se reenciende: que un
perfil viejo siga diciendo que trabaja ahi no prueba que siga ahi.

**3. La cercania no se podia afinar.** Alguien entraba como "decision maker" sin
puesto (cercania 50) y dos bloques despues un organigrama lo nombraba director
general, y seguia contando como contexto. Ahora la cercania **se acerca** al
fusionar. (Sigue sin poder ALEJARSE: defecto conocido, declarado abajo.)

**4. `modulo_origen` no sobrevivia al disco.** `_cargar` no lo restauraba, la
corrida volvia con 23 contactos sin origen y la tabla de rendimiento -- la cifra
que ORDENA las prioridades del metodo-- salia con **todas las filas en cero sin
quejarse de nada**. Ahora se DERIVA del registro, como los contadores de agotado
y como `hits`: si la evidencia esta, el origen esta.

**5. El bloque era el ultimo lugar que contaba declaraciones.** `bloque` pedia
`--consultas` y `--nuevas` a mano. A mano sume 58 consultas contra 59
registradas y 50 entradas nuevas contra 46 contactos reales. Ahora las dos
cifras salen del registro, y declarar otras **lanza**.

**6. Medio bloque podia declarar saturacion.** Cerre un bloque de cinco
consultas sin entradas y conto igual que uno de diez. Como tres bloques secos
CIERRAN la cascada, eso permitia declarar saturacion con quince consultas en vez
de treinta. Ahora `seco` exige bloque **completo**, y cerrar uno corto exige
`--parcial`, que nunca cuenta como seco.

**7. Las consultas sin red gastaban presupuesto.** M4 genera su producto sin
pedirle nada a nadie. Ya no cuenta contra el tope.

**8. El catalogo estaba incompleto.** La compuerta rechazo una consulta a un
agregador de organigramas por no tenerlo en la lista de M1. Se corrigio **la
lista, no la compuerta** -- y esa consulta resulto ser la mas rentable del
bloque--.

### `tope`, el comando

El codigo ya decia que subir el tope es una decision y no un descuido. Ahora
tiene donde pedirse: `./prospector tope --empresa X --nuevo N --razon "..."`.
Exige razon, solo sube, y queda en los avisos de la ficha.

### Lo que la corrida NO logro, y queda declarado

**La regla de tres bloques secos no se pronuncio.** 132 consultas, el tope
subido cuatro veces a proposito, 14 bloques, y solo DOS secos -- nunca dos
seguidos--. El bloque 14 trajo siete entradas nuevas. M5 se cerro como
`omitida_por_costo` con razon escrita, no como agotado, y el veredicto de Chao1
al cerrar es `FALTA_BARRER` con 42.5% de cobertura estimada.

## 0.7.1 — 2026-09-24

Cierra el ultimo punto donde la herramienta podia colgar, y lo deja probado.

### `listo` ya no revienta con traza si las pruebas se cuelgan

El `timeout=300` del subproceso lanzaba `TimeoutExpired` **sin capturar**, asi que
`./prospector listo` habria muerto con una traza en vez de reportar la falla.

> Un chequeo que revienta con traza es peor que uno que reporta falla: el que lo
> corre no sabe si el problema es la herramienta o su maquina.

Ahora reporta `FALLA` con el mensaje que dice que la suite normal tarda menos de
un segundo, asi que 300 significa que algo esta colgado, y como verlo a mano.

### Y el barrido que confirma que no hay otro punto

`chequeo()` es el **unico lugar del codigo que lanza un subproceso**, verificado
por grep: en `flujo/` no hay `while True`, ni red, ni `input()`, ni sockets. El
unico camino por el que la herramienta podia quedarse esperando era ese, y queda
cerrado por tres lados: la guarda de recursion por variable de entorno, el
parametro `correr_pruebas=False`, y el timeout capturado.

Los tres con prueba, y la guarda probada **tambien fuera de las pruebas** —
corriendo `PROSPECTOR_CHEQUEO_EN_CURSO=1 ./prospector listo`—.

De paso, los imports de `chequeo()` subieron al modulo: estaban dentro de la
funcion y eso hacia imposible sustituir `subprocess` en una prueba.

### Pruebas

**157 -> 159.**

---

## 0.7.0 — 2026-09-24

**Arranque de una instruccion.** Hasta aqui abrir una cuenta eran cinco comandos y
habia que acordarse del orden, de los nombres de los contadores y de que fuente
le toca a cada modulo. Sirve para desarrollar; no sirve para usar.

### La frase

    prospecta <empresa>
    prospecta <empresa> en <ciudad>

**La empresa es lo unico obligatorio.** Ciudad, giro, entidad y dominio se
infieren del padron. Skill en `.claude/skills/prospecta/SKILL.md`, y el comando
directo es `./prospector prospecta --empresa "X"`.

### Lo que Python hace, y lo que NO

**Python no busca.** No puede: buscar es criterio -si dos empresas de nombre
parecido son la misma, si un puesto compra, que titulo sale de una nota-. Lo que
hace es quitar de enmedio todo lo que no es criterio: resolver la cuenta en el
padron, abrir la corrida fuera del repo, registrar M13 con lo que el padron
contesto de verdad, y **entregar el plan de 12 pasos con los comandos ya
escritos**. Las compuertas siguen gobernando; el arranque no salta ninguna.

### Tres respuestas, y las tres son correctas

| Lo que sale | Cuando |
|---|---|
| El plan con la geografia inferida | La cuenta esta en el padron |
| **Una pregunta de una linea**, salida 3 | Varias plantas de la misma cuenta |
| El plan con una **bandera** | No esta en el mapa, o el mapa esta viejo |

**Ambiguo NO es lo mismo que incompleto**, y confundirlos fue un defecto que
encontre corriendo el humo: con `prospecta Bimbo` -tres plantas en dos
municipios- se abria la corrida con `ciudad = "(sin ciudad)"` y seguia a M0 como
si nada faltara. **Hornear la ambiguedad en una corrida guardada es peor que
preguntar**, y elegir una planta en silencio es el caso de los cinco DUNS de
Ragasa con otro disfraz. Ahora pregunta y **no abre la corrida**.

Sin geografia pero fuera del padron es otra cosa: ahi si abre, con el hueco
declarado. Una corrida sin geografia es mas debil, no imposible.

### El envoltorio

`./prospector` — un script que corre el orquestador desde donde sea, sin recordar
el `-m` ni el `cd`. Los comandos que imprime el plan se pegan tal cual.

### `./prospector listo`

| Lo verifica la maquina | Solo Claude |
|---|---|
| Padron vigente · pruebas en verde · la salida cae fuera del repo | Odoo, Outlook, WebSearch: **hay que llamarlos** |

Los conectores salen `[ ? ]` a proposito:

> Decir que un conector esta vivo sin haberlo llamado es contar una declaracion
> como evidencia — **exactamente lo que la compuerta de agotado existe para
> impedir**. La herramienta no se exime de su propia regla.

`--rapido` salta la suite.

### Corregido: `chequeo()` recursaba sin fondo

`chequeo()` corre la suite en un subproceso, asi que llamarlo **desde** la suite
recursa infinito. **Colgo la maquina** al escribir `tests/test_arranque.py`, y
hubo que matar los procesos a mano. Cerrado por dos lados: el parametro
`correr_pruebas=False`, y una **guarda por variable de entorno** que hace que un
`chequeo()` anidado se niegue a volver a correr las pruebas.

### Y una prueba que me hizo escribir de verdad

`test_cada_paso_del_plan_dice_POR_QUE_ahora` exige mas de 40 caracteres de
justificacion por paso. Fallo en M6, M8 y M9, donde yo habia puesto *"Refuerzo."*
y *"Depende de M5."*. **Subi la justificacion, no baje el umbral**: un plan que
no dice por que invita a saltarse pasos.

### Guias de uso

| Archivo | Que es |
|---|---|
| `USO.md` | Como se invoca, que conectores tienen que estar vivos y **como saberlo**, que entrega, donde queda, y que hacer con cada `sin_acceso` |
| `LISTO-PARA-USAR.md` | La lista de verificacion, la corrida de humo con sus dos casos de borde, y **lo que NO esta listo** |

### `.claude/skills/` se versiona

`.gitignore` pasa de `.claude/` a `.claude/*` + `!.claude/skills/`. Las skills son
la forma de invocar las herramientas del repo y tienen que viajar con el;
`settings.local.json` sigue ignorado, que es de cada maquina.

### Pruebas

**146 -> 157.** Nuevas: `tests/test_arranque.py` (11).

---

## 0.6.0 — 2026-09-24

**No elegir no es lo mismo que no informar.** La compuerta de confianza aprende a
distinguir un desacuerdo que se puede reportar de uno del que hay que abstenerse.

### El defecto, medido en Hershey (#287)

El patron de correo tuvo CUATRO fuentes: tres decian `FLast` -y una de esas tres
era **un correo literal real** visto en un hilo de Outlook- y solo SignalHire
decia lo contrario. La compuerta marco conflicto y **vacio el campo**.

Sin patron de correo, Rissia no le puede escribir a nadie. Y el campo vacio
tiraba informacion buena: que 3 de 4 apuntaban al mismo lado, y que una de esas
3 no era una estadistica de directorio sino una direccion que existio.

### La regla nueva: C1-bis

| Situacion | Que hace |
|---|---|
| **Mayoria clara + ancla dura** | **Informa** el valor, con la disidencia visible al lado |
| Empate, o desacuerdo sin ancla | **Se abstiene**: EN CONFLICTO, campo sin valor |

**Mayoria clara** = al menos **3 fuentes** Y al menos **3 veces** la disidencia.
El tres es el mismo numero que el metodo ya exige en M1 -*minimo tres
directorios contrastados*- porque con dos no hay con que contrastar. Si dos no
alcanzan para agotar un modulo, tampoco para ganarle a una disidencia.

**Ancla dura** = al menos una fuente de la mayoria vio un dato **literal**:
Outlook u Odoo (una direccion real), un PDF publico, un padron de gobierno, un
congreso. **Ningun directorio ancla**: reportan una estadistica sobre la muestra
que ellos juntaron, no una direccion que existio. Y **el ancla tiene que estar
en la MAYORIA**: si el unico que vio un literal dice lo contrario que los tres
directorios, eso es mas razon para abstenerse.

**El techo es SOLIDO, nunca CONFIRMADO.** Hay una fuente viva diciendo lo
contrario; llamarle *verificado* a eso seria el Caso F por la puerta de atras.

### La linea, comprobada contra los dos casos reales

| Caso | Cuentas | Ancla | Resultado |
|---|---|---|---|
| **Hershey** | 3 contra 1 | Outlook vio el literal | **informa** con salvedad |
| **Cuprum** | 2 contra 1 | Outlook vio el literal | **se abstiene** |

Cuprum es el caso que mas trabaja: **ahi si hay ancla** y aun asi se abstiene.

> **Y una correccion a lo que yo mismo escribi primero.** Habia puesto que
> `MINIMO_MAYORIA` era la condicion que separaba los dos casos. **Es falso**, y
> lo vi corriendo la matriz de umbrales en subprocesos limpios: con el minimo en
> 2 y la razon en 3.0, Cuprum sigue dando conflicto porque 2 no es tres veces 1.
> **Cada condicion lo bloquea por su lado; hay que bajar LAS DOS a 2 para que se
> rompa.** Eso quedo fijado en dos pruebas, una por cada direccion.

### Solo aplica al patron de correo

`CAMPOS_CON_MAYORIA = ("patron_correo",)`. Admitir otro campo es una decision, y
el criterio esta escrito en el codigo y en §5.1 del metodo. **`puesto` y
`empleador` no entran y no deben entrar**: un puesto cambia -la disidente puede
ser la que se entero del ascenso, y ahi la mayoria no es la verdad sino la
inercia- y un empleador equivocado no rebota, se manda el correo y se queda ahi.

### En la ficha

Los datos informados con salvedad van en **su propio bloque**, separados de los
conflictos de verdad: un dato usable con una nota **no es un pendiente**, y
mezclarlos vuelve la ficha una lista de tareas. El challenge los reporta como
`CON SALVEDAD`, no como `revision humana`.

### Corregido: la tarjeta no mostraba el patron

Lo encontro ejercitar la ficha de punta a punta, no una prueba. La tarjeta leia
solo `correo` -la direccion de una PERSONA- y el patron de la CUENTA vive en
`patron_correo`. Para un puesto sin persona el patron es justo lo accionable, y
no aparecia: el valor solo salia en el bloque de arriba. Ahora la tarjeta cae al
patron cuando no hay correo, **etiquetado `patron ·`** y no como direccion,
porque no lo es: es la forma, no el buzon.

Lo que ve Rissia:

```
N3  (puesto sin persona)
    Maintenance Supervisor · Utilities & Facilities
    patron · FLast@hersheys.com   SOL
    con salvedad — 3 de 4 fuentes coinciden, y outlook lo vio literal.
    signalhire disiente y dice LastF@hersheys.com -- confirmalo antes de usarlo.
```

### Las otras dos caras de C1 no se tocaron

La regla solo puede dispararse cuando hay **dos o mas valores distintos**. El
choque por FORMA sobre el mismo literal, y el choque por BRECHA de certeza,
siguen vaciando el campo: ahi no hay un valor mayoritario que reportar, porque
lo que se discute es cual de las dos lecturas del mismo literal vale, y eso la
mayoria no lo contesta.

### Pruebas

**108 -> 146.** Nuevas: `tests/test_caso_g_hershey.py` (38). Las 11 del Caso F
**no se tocaron** y siguen pasando: era la condicion del cambio.

---

## 0.5.0 — 2026-09-24

**El padron se reduce a mapa de plantas y aprende a avisar que caduco.** Y la
corrida de punta a punta se hace **desde cero sobre una cuenta nueva**, no sobre
el caso conocido.

### El padron: lo que envejece lento

Se queda lo estructural -establecimiento, razon social, giro/SCIAN,
tamano/estrato, municipio, ciudad, CP, `dominio_correo`- y suelta lo que caduca
rapido. `correoelec` y `telefono` quedan **fuera definitivamente**, por dos
razones que apuntan al mismo lado: son datos de contacto de personas en un repo
publico, y un correo de una fila con `fecha_alta` de 2010 no sirve para llamar
hoy. **El contacto fresco lo consigue la cascada en cada corrida**, que es su
oficio.

`dominio_correo` es la excepcion deliberada: se deriva del correo, **no
identifica a una persona**, y es la llave operativa del metodo -dominio + ciudad
+ CP-. Sin ella el padron dejaria de servir; con ella sirve igual que antes.

**Postgres se posterga.** Mientras la herramienta se pule, el mapa vive como CSV
limpio versionado: es diffable, y un corte contra el siguiente se compara en un
pull request. El enganche a Postgres esta anotado al final de `flujo/padron.py`
-`sincronizar_con_postgres` y `desde_postgres`- y **no esta construido**.

### El aviso de caducidad, en dos disparadores

**Por TIEMPO.** `flujo/padron.py` lee el corte del propio CSV -es la fecha del
DATO, del `metadatos_denue.txt`, no la de la consulta- y calcula la antiguedad.

> **Umbral: 6 meses.** El INEGI publica dos cortes al ano; los medidos fueron
> `2025_11` y `2026_05`. Seis meses es **un ciclo de publicacion**: pasado ese
> punto ya existe un corte mas nuevo, y seguir con el viejo no es una decision,
> es un olvido. Antes de los 6 avisar seria ruido, porque no hay nada mas fresco
> que traer. A los 12 ya se saltaron dos cortes y el aviso sube de tono.

Hoy, con el corte 05/2026, la antiguedad es **4 meses** y no avisa nada. Empieza
a avisar en noviembre, que es justo cuando cae el corte siguiente.

**AVISA, no frena.** Frenar una corrida por la edad del mapa seria peor que
correrla con el mapa viejo: un corte de hace un ano sigue ubicando plantas. Lo
que si frena es que el CSV traiga columnas de contacto: eso no es
envejecimiento, es una fuga.

**Por DATOS.** `vigilar_cobertura()` distingue tres cosas que se ven iguales
desde afuera y no son lo mismo:

| Bandera | Cuando | Que hace falta |
|---|---|---|
| `FUERA_DEL_ALCANCE_DEL_PADRON` | El padron no cubre esa entidad o ese giro | Un corte **mas amplio**, no mas nuevo |
| `NO_EN_PADRON_PERO_EN_ALCANCE` | Lo cubre y la planta no aparece | Primero descartar que el empate fallo por la razon social; luego, corte **mas nuevo** |
| `PLANTA_QUIZA_CERRADA` | Aparece, y la corrida encontro que ya no opera | `vigente = false` -una baja no borra- |

Confundirlas manda a descargar 32 archivos cuando lo que faltaba era una
entidad, o a esperar el corte que no va a traer nada. Las tres apuntan al
**vigilante del DENUE** por `ETag`/`Last-Modified`: es la misma preocupacion
vista del otro lado. El vigilante pregunta *"cambio el archivo?"*; esto pregunta
*"me esta estorbando que no haya cambiado?"*.

### Corregido: la geografia no era un filtro

`Padron.buscar()` devolvia la fila de Monterrey cuando se preguntaba por
Guadalajara. Si se da ciudad o entidad y ningun candidato coincide, la respuesta
es **cero**, no "los demas". Es la leccion de los cinco DUNS de Ragasa -cuatro
en NL y uno en Jalisco con la misma razon social-: el nombre no desempata, el
domicilio si. Lo encontro una prueba con Sigma Alimentos en Jalisco.

### `M13` pasa a ser evidencia, no declaracion

El subcomando `padron` busca la cuenta en el mapa, imprime las banderas y
**registra la busqueda de M13 con lo que el padron contesto de verdad**. Cero
filas cuenta: significa que se busco bien y no esta. Si no aparece, M13 se cierra
`no_aplicaba` con la bandera como razon, y la cascada arranca en M1.

### Pruebas

**91 -> 108.** Nuevas: `tests/test_padron.py` (17).

### La guardia se estreno contra mi propio codigo

`test_sin_datos_personales.py` fallo dos veces en esta version: por
`[persona]@empresa-ejemplo.com` mal escrito en un fixture nuevo, y por
`git@github.com` en una URL de clon del plan de purga. La segunda es un falso
positivo legitimo y quedo permitido **con nombre**, no aflojando el regex.

---

## 0.4.0 — 2026-09-24

**Los contactos salen del repo, y la regla queda fijada.** `fts-suite` es
publico, y la herramienta llevaba datos personales adentro.

### La regla, en una linea

> **Los datos de contactos y personas son datos personales y NUNCA se guardan en
> el repo.** El repo guarda LOGICA; la sesion guarda el resultado de la corrida;
> Postgres guarda los contactos.

Documentada en `README.md` y en §1.1 del metodo. **Y hecha cumplir con codigo**,
no con un parrafo: `flujo/salida.py` resuelve el destino de cada corrida y se
niega con un `raise` si cae dentro del arbol del repositorio, aunque el
`.gitignore` lo cubra.

### Lo que se saco, con numeros

| Qué | Cuánto |
|---|---|
| **`datos/padron_denue.csv`** — columnas `correoelec` y `telefono` | **191 correos**, **59 telefonos** |
| Correos de personas en el metodo, los fixtures y el historial | **11** en 5 archivos |
| Nombres completos de personas reales | **20** en 7 archivos |

Del padron, 136 de los 191 correos tenian forma de correo de persona
(`nombre.apellido@`, o webmail libre que en un negocio chico suele ser la cuenta
del dueno). **`dominio_correo` se conserva**: es la llave operativa del metodo
-dominio + ciudad + CP- y no identifica a nadie. El padron sigue sirviendo igual.

El destino de esas columnas es `prospeccion.denue_planta` en Postgres, y a
futuro Odoo. `herramientas/cargar_padron.py` ahora recorta
`COLUMNAS_SENSIBLES` del CSV que se versiona y las manda al SQLite y al INSERT.

### La salida ya no toca el repo

Antes: `prospector/corridas/`, dentro del arbol, protegida solo por
`.gitignore`. Ahora: `$TMPDIR/prospector-corridas/<sesion>`, o lo que diga
`PROSPECTOR_SALIDA`. La carpeta `corridas/` se elimino del repo -su existencia
invitaba a escribir ahi- y hay una prueba que falla si reaparece.

La compuerta aguanta incluso el intento explicito:

```
$ PROSPECTOR_SALIDA=.../prospector/corridas orquestador siguiente ...
⛔ COMPUERTA: '/.../prospector/corridas' esta dentro del repositorio.
Los contactos y las fichas son datos personales y el repo es PUBLICO: no se
escriben aqui ni con .gitignore de por medio.
```

### La guardia que impide que vuelva a pasar

`tests/test_sin_datos_personales.py` barre todo `prospector/` en cada corrida de
pruebas: correos con forma de persona, telefonos mexicanos de 10 digitos, y las
columnas de contacto del padron. Permite a proposito los marcadores
(`[persona]`, `nombre.apellido@`), los buzones genericos y los dominios de
empresa sueltos.

**Esta prueba existe porque ya paso.** `cargar_padron.py` traia la advertencia
escrita en su propio docstring -*"no puede terminar en fts-suite, que si es
publico"*- y el CSV se copio igual. Una advertencia en un comentario no detiene
a nadie.

### Deuda anotada: el historial de git

Enmascarar hacia adelante **no borra el dato de los commits anteriores**. Los
correos y nombres siguen en el historial de un repo publico. Purgar el historial
(`git filter-repo`) es una operacion aparte y mas delicada, y **queda por
decidir**. Lo que esta hecho es el estado actual.

### Pruebas

**77 -> 91.** Nuevas: `tests/test_salida.py` (10) y
`tests/test_sin_datos_personales.py` (4).

### A futuro, anotado y NO construido

`flujo/salida.py` lleva al final el enganche a Postgres: donde iria
`escribir_en_postgres(corrida)`, desde donde se llamaria -en `cerrar`/`ficha`,
**despues** del challenge, nunca antes- y las dos cosas ya decididas: la cadena
de conexion por variable de entorno, y que la restriccion
`ck_patron_nunca_verificado` de la migracion 010 ya dice lo mismo que la
compuerta de confianza, cada una por su lado. **Es fase posterior.**

---

## 0.3.0 — 2026-09-24

**Las compuertas verifican evidencia, ya no cuentan declaraciones.** Es la
correccion de fondo de los tres defectos que la corrida real de Cuprum dejo
abiertos (#24). La corrida de punta a punta de esta version encontro **tres
defectos mas**, todos corregidos aqui.

### El defecto de raiz: el contador declarable

`EstadoModulo.suma("bolsas")` subia un entero. Para cerrar M2 -que exige tres
bolsas de trabajo- bastaba llamarlo tres veces con nada detras.

Ahora **el contador no se puede tocar**: es una propiedad DERIVADA de
`registros`, una lista de `Busqueda`. Y una `Busqueda` solo existe si trae
consulta textual, fuente permitida **para ese modulo**, y un numero de
resultados. `suma()` queda como tumba que lanza `CompuertaCerrada` con el
mensaje que dice por donde va.

El modelo es el que ya funcionaba en la compuerta de confianza: `n_raices` no es
un contador que alguien sube, es un hecho que se lee de las observaciones.

**Las cuatro variantes del truco, cerradas:**

| Intento | Como se cierra |
|---|---|
| `suma()` tres veces con nada detras | `CompuertaCerrada`: el contador es derivado |
| Asignar `contadores = {"bolsas": 3}` | `AttributeError`: es propiedad de solo lectura |
| Tres consultas reales, las tres a Indeed | El criterio cuenta **vias distintas**; repetir no suma |
| Acreditarle a M1 una nota de prensa | `PERMITIDAS[modulo]` rechaza la fuente ajena |
| La misma consulta con dos etiquetas | Una via distinta exige **su propia consulta** |
| Editar `directorios: 3` en el JSON guardado | Al cargar se restaura la EVIDENCIA; el contador se re-deriva |

**`resultados=0` cuenta.** Cero resultados ES una respuesta: haber preguntado
bien y no encontrar nada es trabajo hecho. Si cero no contara, la compuerta
premiaria mentir.

### M5 lee el presupuesto real

`bloques_secos` ya no es un contador propio de M5: se lee de
`Presupuesto.secos_al_final`, los bloques de verdad de esa corrida. Registrar
busquedas en M5 ya no lo agota -- lo agota gastar.

### Regla C1, en sus tres caras

Un dato choca si las fuentes dan **valores distintos**, si nombran **formas
distintas** (SignalHire con `first_lastinitial` frente a `first.last`), o si dan
el mismo valor con **certezas separadas por mas de 20 puntos**.

Y la cara que faltaba del todo: **una fuente sola que declara menos de 60% de
certeza ya no llega a SOLIDO, baja a CANDIDATO.** El techo por fuente unica
atrapa *cuantos* lo dijeron; esto atrapa *que tan seguros* lo dijeron.

`Dato.motivo_conflicto` dice de cual de las tres se trata. Sin el, un conflicto
por brecha de certeza -que tiene UN solo valor- se imprimia en la ficha como si
no hubiera nada raro.

### El lazo de refuerzo: ya se dispara

La condicion era `est.confiable and est.cobertura < 0.8`. Al principio de una
corrida Chao1 nunca es confiable, asi que **el lazo no arrancaba jamas**:
*"no tengo datos para opinar"* se leia como *"ya termina"*.

Chao1 emite ahora un veredicto de cuatro valores y **solo uno detiene el lazo**:

| Veredicto | Que pasa |
|---|---|
| `sin_datos` · `prematuro` · `falta_barrer` | **SIGUE** |
| `saturo` | **PARA** |

Quien detiene el lazo cuando Chao1 no opina es el **presupuesto**: tres bloques
secos o el tope de la cuenta. Chao1 solo puede terminarlo antes. `f2 < 3` sigue
sin ser confiable.

`abrir_vuelta()` reabre M5-M6-M7 y **exige un bloque nuevo desde la vuelta
anterior**: un lazo que gira en seco es el contador vacio aplicado al flujo.

### Una sola fuente de verdad del progreso

`hits` -lo que alimenta Chao1- ya no es un contador que sube al agregar: es
**en cuantas busquedas distintas aparecio el contacto**, derivado del mismo
registro que sostiene el agotado.

### Corregido, por lo que mostro la corrida de punta a punta

1. **`siguiente_paso` imprimia el modo de conteo en vez del criterio.** Decia
   "Agotado cuando: registros" en lugar de "recorridos los contactos de la
   cuenta". Las tuplas de `AGOTADO` crecieron a cuatro campos y el indice quedo
   corrido.
2. **M2 y M7 no se podian agotar NUNCA.** Su criterio pide tres bolsas y dos
   formas, y el catalogo solo les permitia una etiqueta (`vacante`,
   `pdf_publico`). El catalogo era mas grueso que el criterio. M2 nombra ahora
   sus siete bolsas; M7 distingue por `etiqueta`, no por fuente.
3. **La compuerta de la vuelta en seco no sobrevivia al disco.** `vueltas_loop`
   se guardaba y el marcador de bloques no, asi que al releer la corrida volvia
   con la vuelta abierta y el marcador en cero: cualquier bloque viejo la dejaba
   dar otra vuelta gratis.

### Raices nuevas

Los agregadores de vacantes comparten raiz `bolsa_trabajo` -Indeed y OCC
republican el mismo anuncio, coincidir no confirma-. La bolsa **propia** de la
empresa es otra raiz: es la empresa hablando de si misma.

### Pruebas

**43 -> 77.** Nuevas: `tests/test_evidencia.py` (19) y `tests/test_loop.py` (12), mas 4 de la regla C1 en `test_caso_f_cuprum.py`.

---

## 0.2.0 — 2026-09-24

La herramienta se aisla en `tools/prospeccion/` y se corre **de verdad** sobre
Cuprum, con busquedas en vivo, Odoo y Outlook. La corrida encontro **dos
defectos que la version anterior tenia y las pruebas sinteticas no vieron**.

### Corregido, por lo que mostro la corrida real

1. **La regla C1 no estaba implementada.** `choca` solo comparaba valores, asi
   que tres directorios diciendo `first.last@cuprum.com` al **44%**, **45.45%**
   y **100%** pasaban como SOLIDO. El valor coincide y la certeza no. Ahora
   `Observacion` extrae el porcentaje de la nota y una brecha mayor a **20
   puntos** dispara conflicto. Reportar el 100% porque una fuente lo dijo es
   el bug del Caso F con otro disfraz.
2. **Chao1 se marcaba confiable con `f2=1`.** Con 16 observados, f1=14 y f2=1
   estimaba **114** y decia que era de fiar. El divisor es `2*f2`: el numero
   lo decidia **un solo contacto**. Ahora exige f2>=3 y que no mas del 80%
   aparezca una sola vez, y explica en texto por que no se fia.

### Resultado de la corrida

16 contactos, **3 conflictos atrapados solos**, 6 de 60 consultas gastadas.
Detalle en el issue #24.

## 0.1.0 — 2026-09-23

Primera version corrible. Fases A, B y C del plan del issue #22.

### Construido

- **`confianza.py`** — niveles e **instrumentacion de fuentes por dato**: cada
  campo guarda TODAS las observaciones que lo sostienen, con su fuente y su
  raiz. Es lo que habilita el challenge y desbloquea Chao1.
- **`compuertas.py`** — las tres compuertas como `raise`: agotado, presupuesto
  (bloques de 10, paro tras 3 secos, tope por cuenta) y confianza.
- **`chao1.py`** — estimador de completitud, con marca de *poco confiable*
  cuando hay menos de 10 contactos o ningun f2.
- **`catalogo.py`** — las 13 fuentes descartadas, rechazadas por codigo con su
  razon.
- **`estado.py`** — la corrida que Python posee, con el flujo en cuatro olas y
  las cinco correcciones del issue #22.
- **`ficha.py`** — modo limpio y modo procedencia, con checklist de lo que no
  se pudo hacer.
- **`orquestador.py`** — CLI que dice cual es el paso siguiente.
- **39 pruebas**, incluidos los casos D (LEGO) y F (Cuprum).

### Tres bugs encontrados por las pruebas, no por revision

1. **`KeyError` en vez de compuerta** cuando un modulo no tenia criterio de
   agotado definido. Ahora lanza compuerta legible y M4 tiene el suyo.
2. **El challenge corria con modulos abiertos.** Cruzar a medias produce el
   falso consenso que el Caso F existe para impedir. Ahora se rechaza.
3. **El conflicto no llegaba a la ficha limpia.** Se detectaba, se guardaba en
   avisos y en procedencia, y la ficha que lee Rissia no lo mostraba.
   **Callar un conflicto es afirmar.** Ahora va arriba y visible.

### Pendiente de infraestructura (fase D)

- **M0 · Odoo** — el MCP es independiente de n8n; espera autorizacion, no a Redis.
- **M8 · padrones publicos** — necesitan `WebFetch` o lectura desde n8n.
- **M9 · aduanas** — sin una sola medicion desde la v1.0 del metodo.

### Pendiente por decision, no por codigo

- Invocacion por nombre corto y configuracion de maquinas locales: fase
  posterior, tal como se acordo.
