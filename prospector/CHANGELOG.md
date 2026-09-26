# Cambios de la herramienta

Versiona **la herramienta**, no el metodo. El metodo tiene su propio historial
en §10 de [`metodo/busqueda-encadenada-contactos.md`](metodo/busqueda-encadenada-contactos.md).

## 0.9.9 — 2026-09-26

Cierra #320: la **restriccion 3 aprobada** y la **medicion de cuanto falta** del
registro de ubicacion de proyectos. **661 pruebas** (eran 654).

### La restriccion 3, aprobada y ESCRITA en el codigo

Esteban aprobo el juicio: «Gerente de Facilities» es la misma palabra inglesa con
cabeza espanola, no un sinonimo intra-espanol, asi que el grupo se queda y
`servicios generales` sigue fuera de la tabla. Queda escrito **en el comentario
del grupo**, no solo aqui, para que un lector futuro no lo lea como descuido y lo
"arregle": sacarlo devuelve el caso de #306 a EN_CONFLICTO, y la prueba
`test_RESTRICCION_3_gerente_de_facilities_es_SPANGLISH_no_un_sinonimo_ES` falla a
proposito si alguien lo intenta.

### El censo: `datos/cuentas-con-proyecto.json`

**26 cuentas** de Odoo con trabajo de tamano de proyecto — lineas confirmadas de
`sale.order.line` >= 100,000— , medidas el 25-sep-2026 despues de las 18:00 CST.
Es el **DENOMINADOR**, y sin el la pregunta "cuantas cuentas tienen su planta
declarada" no se puede contestar: solo se sabria cuantas SI, nunca cuantas faltan.

Lleva razon social y **cuantas** lineas de proyecto tiene. Ni una persona y ni un
importe: los contactos hijos de Odoo (`Empresa, Persona`) se colapsan cortando en
la primera coma, y una prueba falla si alguna razon social del censo trae una coma
— que es la unica forma en que una persona podria colarse—. Los importes se
prohiben por **estructura**, con un juego de campos cerrado, no buscando palabras
dentro del nombre: buscarlas marcaba a `MONTOI` por contener "monto".

### `donde-falta`: la cobertura en DOS cifras

    ./prospector donde-falta

Lista las cuentas del censo **sin planta declarada**, de mas a menos trabajo de
proyecto — el orden es la priorizacion: la cuenta con mas proyectos es la que mas
riesgo corre de que una corrida le atribuya la planta equivocada— y con **la linea
ya armada** para que declarar sea copiar, pegar y llenar la planta. Imprime tambien
la regla del operador donde se va a usar: *donde no estes seguro de la planta, NO
la declares*.

**Reporta dos cifras, y no es prolijidad: a quien se le factura no es siempre a
quien se prospecta.** Coficab tiene sus tres proyectos declarados y **no aparece en
el censo**, porque los tres entraron via un distribuidor que si aparece. Odoo
conoce a quien se le factura; la corrida prospecta al cliente final. Contar una
sola cifra obligaria a elegir entre dos preguntas distintas, asi que se reportan
las dos: cuantas del censo tienen planta declarada, y cuantas declaradas el censo
no conoce — que es la medida del trabajo que entro por intermediario—.

Y eso refuerza por que el dato no se puede derivar: para Coficab, **Odoo no tiene
ni la planta ni el nombre del cliente**. Tiene el del distribuidor.

## 0.9.8 — 2026-09-26

Las **tres decisiones de #310** mas un **dato de negocio que Odoo no tiene**.
**654 pruebas** (eran 617). Un modulo nuevo, `ubicacion_de_proyectos.py`, y un
archivo declarado en `datos/`.

### El dato: en que PLANTA se hizo cada proyecto. Odoo no lo registra

`sale.order` trae el **cliente** y **no trae la planta**. Por eso la corrida de
Coficab Pesqueria encontro tres proyectos de agua helada de esa cuenta, no vio
ninguna planta escrita, y la ficha concluyo lo que parecia obvio y es falso: que
FTS ya habia trabajado **en esa planta**. Los tres fueron en **Ciudad Juarez**.
Pesqueria es cuenta **FRIA**: sin proyecto propio y sin contacto propio.

La diferencia no es de redaccion:

| | |
|---|---|
| «ya trabajamos en su planta» | **falso.** Se cae en la primera llamada |
| «ya le hicimos tres proyectos de agua helada a su grupo en Juarez» | **cierto**, y sigue siendo fuerte |

La segunda abre la puerta igual de bien y **no se derrumba cuando el de Pesqueria
pregunta cual proyecto**. Es el unico error de la ficha que no cuesta una
consulta: cuesta la cuenta.

**Donde vive y por que ahi.** En `datos/ubicacion-de-proyectos.json`, no en el
estado de una corrida, y esa es la decision de diseno: el estado de una corrida
muere con la sesion, y lo que hay que evitar es que **la corrida que todavia no
existe** vuelva a especular. Una corrida de Coficab/Saltillo abierta en diciembre
lo lee sin que nadie se acuerde de sembrarlo. Guarda empresa, planta, referencia,
fecha, que fue y canal: **ni una persona y ni un importe**, que es la misma linea
que deja vivir al catalogo de proyectos en un repo publico.

Se declara en una linea, y la salida **insiste en commitearlo** — si se queda en
el contenedor, muere con la sesion:

    ./prospector donde-se-hizo --empresa 'Coficab' --referencia 'SO10977' \
      --planta 'Ciudad Juarez' --que 'chiller' --fecha '2025-11' --canal 'Quimitec'

**Tres veredictos, y el de en medio es el que faltaba.** Antes solo habia "hay
proyectos de esta cuenta" contra "no hay", y la primera se leia como "hay
proyectos en esta planta":

| veredicto | que dice |
|---|---|
| `historia_en_esta_planta` | FTS trabajo aqui. «Ya trabajamos en su planta» es cierto |
| `historia_del_grupo_en_otra_planta` | **CUENTA FRIA.** La historia es del grupo, y la carta de presentacion tiene que decirlo asi |
| `sin_historia_declarada` | Nadie declaro donde. **NO significa que no haya**: significa que la planta no esta escrita |

**Cuatro lugares lo leen.** La Fase 0 lo registra antes de la primera consulta;
`prospecta` y `siguiente` imprimen la carta que si se sostiene; la ficha la
declara con la evidencia (referencia, planta, que fue, canal) y dice **por que no
se puede derivar**, para que nadie lo "arregle" borrando el archivo; y el
checklist **rechaza un gancho** que afirme trabajo previo aqui cuando el registro
dice que fue en otra planta. La lista de frases que dispara ese rechazo es corta y
textual a proposito: no es un clasificador, es una lista que se puede leer y
corregir.

`contacto_es_puerta_a` cierra la otra mitad: la contraparte de un proyecto de otra
planta **no es puerta a esta**. No es mal contacto — es excelente para su planta y
es semilla de la corrida corporativa— : es que no abre **esta** puerta. Y una
referencia no declarada no abre nada: callar no es afirmar.

Declarar dos veces la misma orden **reemplaza**, como el veredicto del padron de
#306 y por la misma razon: dos plantas para una orden son dos afirmaciones que se
contradicen.

### DECISION 1 · La tabla ES-EN, con los dos grupos aprobados

`gerente de facilidades / gerente de facilities / facilities manager` y
`comprador senior / senior buyer`, con una prueba por cada una de las tres
restricciones de #302:

1. **No cruza jerarquia:** `comprador senior` queda en grupo DISTINTO de
   `comprador`. Un senior buyer no es un comprador raso.
2. **No cruza funcion:** `facilidades` no entra al grupo de `servicios
   auxiliares`, aunque muchas plantas junten las dos en una gerencia.
3. **No es sinonimo intra-idioma** — y este es el limite fino, que vale dejarlo
   escrito. La restriccion prohibe agrupar dos palabras ESPANOLAS distintas para
   la misma funcion, y `servicios generales` sigue fuera de la tabla. «Gerente de
   Facilities» no es otra palabra espanola: es la MISMA palabra inglesa con cabeza
   espanola, que es como la industria mexicana lo dice. Sigue siendo ES-EN.

### DECISION 2 · El alias lo PREGUNTA el agente, no lo aplica

`alias --preguntar` arma la pregunta **con la evidencia que la motiva** — «Vi
'COFICAB Monterrey' en 3 fuente(s) y 'Pesqueria' en 2. Hoy cuenta como OTRA planta
y deja 1 contacto fuera de la poblacion. Son la misma planta?»— y sale con
**codigo 3**: necesita decision del operador, no es falla. **No toca nada**, y hay
una prueba de modo de falla que lo fija: si preguntar aplicara el alias, la
decision estaria revertida en el codigo.

Imprime **las dos ramas**, no solo la del si: si el operador dice que no, lo
correcto es que esos contactos se queden fuera, y salen en la seccion «No son de
esta planta». Las corporativas nunca se proponen: «COFICAB Group» es el grupo, no
la planta con otro nombre, y confundirlos es el doble conteo de #300.

### DECISION 3 · `alias --quitar`, que recalcula y lo declara

Un alias mal puesto no puede ser permanente — se declara con una linea y con una
linea tiene que poder deshacerse—, pero quitarlo tampoco puede ser silencioso: el
alias abre la puerta de la poblacion, y la poblacion es el **denominador de
Chao1**, que es la cifra que decide cuando parar.

Quitarlo mide el antes y el despues y lo deja escrito:

    ✓ ALIAS RETIRADO — 'Monterrey'
      contactos que salieron: 1
      poblacion: 2 -> 1
      Chao1 estimado: 2.5 -> 1.0 · veredicto prematuro -> prematuro

La ficha lo declara en «Alias de ubicacion retirados», y **sobrevive al guardado**:
si no se restaurara, la ficha de la vuelta siguiente dejaria de declarar un cambio
que si ocurrio. Quitar un alias que no existe se rechaza, porque no es inocuo:
quien lo pide cree que la poblacion cambio, y no cambio.

## 0.9.7 — 2026-09-25

Los **cinco defectos y la compuerta rodeada** que dejo la corrida de Coficab
Pesqueria (#306). **617 pruebas** (eran 581). Ningun modulo nuevo: los seis son
arreglos en lo que ya existia, y cuatro de ellos son defectos de **lo que la
herramienta NO decia**, no de lo que calculaba.

### D3 · La ficha limpia ya no esconde a los contactos en revision

**Era el serio.** El modo limpio filtraba a los contactos en `revision_humana`, y
en Pesqueria eso dejo la ficha que se manda con **cero personas de valor con
nombre** — mientras las dos puertas mas probables, la contraparte de un proyecto
de nov-2025 y el EHS de la planta, existian y solo salian en la version de
procedencia, que no es la que se manda.

Ahora salen en su propia seccion, **«Por confirmar»**, con nombre, puesto
probable, planta, correo y **la razon exacta de la revision en la misma fila**. Un
contacto pendiente con su razon visible vale mas que un hueco. Lo que el modo
limpio sigue ocultando es la **procedencia tecnica** — que fuente lo trajo, con
que consulta, con que nivel por campo—, no a la persona.

El que **ya no esta en la casa** sigue fuera de las dos secciones: a ese no le
falta una comprobacion, y ese hueco si es correcto.

**Y el defecto tenia DOS mecanismos, no uno.** #306 lo describio como un problema
del modo limpio; arreglado solo eso, la seccion seguia saliendo vacia. Los dos
contactos de Pesqueria estaban ademas **excluidos de la poblacion** por la regla
de ubicacion, porque sus plantas observadas eran «COFICAB Monterrey» y «Coficab
(planta sin confirmar)». Sin D4 abajo, D3 no arregla nada.

### D4 · Alias de ubicacion por cuenta, declarado en una linea

`COFICAB Monterrey` **es** la planta de Pesqueria: la cuenta la anuncia con el
nombre del area metropolitana. Que dos nombres sean el mismo lugar es geografia
local y la herramienta **no lo puede derivar**, asi que lo declara el operador:

    ./prospector alias --empresa 'Coficab' --ciudad 'Pesqueria' --es 'Monterrey'

Queda en el estado, **se restaura al releer** — si no, la vuelta siguiente vuelve
a tirar a quien el alias rescato, la misma familia de defecto que `modulo_origen`
en #295— , la exclusion de la poblacion lo respeta, y **se imprime en la ficha**:
mover la frontera de una planta a mano y no decirlo deja una ficha que parece
derivada cuando lleva un juicio dentro. La salida del comando dice **a cuantos
contactos devolvio a la poblacion**.

Un alias de menos de tres letras se rechaza: el alias abre la puerta de la
poblacion, y uno flojo mete gente de otra planta en el Chao1 de esta — que es la
cifra que decide cuando parar.

### D1 · El veredicto del padron REEMPLAZA al anterior

La ficha de Pesqueria llevaba los dos: el «no aparece en el padron» de la primera
consulta y el «aparece» de la segunda. Dos conclusiones que se contradicen en la
misma hoja. Ahora el ultimo manda y borra al anterior, y **el reemplazo queda
dicho** — reemplazar en silencio es tan malo como acumular—. El historial de lo
que se consulto no se pierde: vive en el registro de M13, con su fecha. Lo que se
reemplaza es la CONCLUSION, y solo la del padron: los avisos de las compuertas, de
la entrega y del angulo no se tocan.

### D2 · El sufijo de empresa sale del puesto ANTES de comparar

«Senior Buyer en COFICAB Group» contra «Senior Buyer at Coficab» se declaraba
EN_CONFLICTO. No hay conflicto: es el mismo puesto con el nombre de la cuenta
dentro del valor. `sin_sufijo_de_empresa` lo quita — al final, al frente, con
separador o pegado— **antes** de comparar por contencion y por la tabla ES-EN de
#302, y aparece el tercer caso de resolucion, `mismo_salvo_la_empresa`: se reporta
el valor mas corto, con salvedad, y **tope en SOLIDO** como los otros dos.

Quitado el sufijo, el segundo caso lo resuelve solo la tabla: «Gerente de
Facilidades en Coficab» contra «Facilities Manager - COFICAB Group». El sufijo
estorbaba **antes** de llegar a la tabla.

**Lo que NO se lleva:** «COFICAB LEON» nombra una planta, no solo la empresa. La
primera version se comia la cabeza completa y reducia «Gerente de Planta COFICAB
LEON, Silao Gto» a «Silao Gto» — el puesto desaparecia—. Por eso el corte al
frente exige que el trozo sea **solo** empresa, no que la contenga. Y dos puestos
de verdad distintos siguen chocando: normalizar no puede volverse una manera de
tapar desacuerdos.

### Compuerta rodeada · una consulta no se registra dos veces

Dos consultas de Pesqueria quedaron contadas dos veces: el gasto real era **58 y
el estado decia 60**, y dos bloques llevaban una fila de mas. `registrar_busqueda`
ahora rechaza una consulta textual identica en el mismo modulo — normalizada, asi
que ni el espaciado ni la caja la disfrazan— y dice **en que fila ya esta**. La
misma consulta en OTRO modulo si pasa: son dos preguntas distintas y las dos se
pagan.

**La causa raiz no fue descuido del agente, fue la salida.** El agente recorto con
`| tail -1`, la ultima linea salio en blanco, creyo que la busqueda habia fallado
y la repitio. Ahora `buscar` **confirma siempre en la ultima linea** — visible
aunque se recorte— con el modulo, el numero de fila, los resultados y el gasto.
Arreglado en los dos extremos: el que rechaza el duplicado y el que evitaba que se
intentara.

### D5 · La contabilidad de bloques: REPRODUCIDO, y no era aritmetica

Reproducido exactamente: **9 consultas de red + 1 fila local de M4** dan un
registro de 10 y un bloque de 9. Una mas de red y el bloque llega a 10 mientras el
registro va en 11, que es cuando `buscar` se niega por «10 sin cerrar». Las dos
cifras **eran correctas**: el bloque mide CONSULTAS DE RED porque mide rendimiento
marginal del gasto, y el motor de combinaciones de M4 genera local sin gastar red;
el registro muestra todas las filas. Lo que faltaba era **decir por que difieren**,
y ahora lo dicen las dos negativas — la de `bloque` y la de `buscar`— con una
linea «OJO CON LAS DOS CIFRAS». Cuando todo el bloque es de red no hay nada que
explicar y el aviso no sale.

### La subida se verifica por CONTENIDO, no por tamano

La entrega de Pesqueria reporto **36,650 bytes subidos contra 36,649 del local** y
la nota decia que no se habia comparado el contenido byte por byte. Puede que
fuera el salto de linea final. Tambien puede que fuera un caracter cambiado en
medio, **y el tamano no distingue las dos cosas**.

`Corrida.huella` calcula el SHA-256 del archivo local y `entregar` acepta
`--sha256` y `--bytes` con lo que devolvio el conector. Cinco veredictos, y el CLI
**imprime siempre el suyo**, incluso cuando no hubo nada que comparar:

| veredicto | que significa |
|---|---|
| `identico` | sha256 casa. Es el unico que verifica |
| `DIFIERE` | el contenido subido no es el local. Si el TAMANO si coincide, lo dice: es exactamente lo que el tamano no puede detectar |
| `mismo_tamano_sin_hash` | se comparo solo el tamano, y coincide. **No es verificado** |
| `TAMANO_DISTINTO` | ni el tamano casa |
| `sin_verificar` | no se paso nada. En Pesqueria se dio por buena justo asi |

## 0.9.6 — 2026-09-25

Las **seis decisiones de #305**, construidas. **581 pruebas** (eran 498). Cuatro
modulos nuevos: `radar.py`, `buzon.py`, `expansion.py`, `importacion_odoo.py`.

### D1 · Electrico y automatizacion en el evaluador, con peso DERIVADO

El catalogo midio que ELECTRICO es 33.8% y AUTOMATIZACION 18.8%, contra 14.9% de
termico. Entraron los terminos que faltaban -- subestacion, tablero,
transformador, electroducto, busway, puesta a tierra, UPS, ampliacion de carga,
automatizacion de linea, PLC, HMI, retrofit, migracion de control, red
industrial, integracion de control, medicion-- y **su peso sale de la
participacion de su familia en el catalogo, no de un numero escrito**. Si manana
FTS vende otra cosa, los pesos se mueven solos al regenerar el catalogo.

Una familia chica **no vale cero** (`PESO_MINIMO_TIPO`): un proyecto de chiller
sigue siendo un proyecto de FTS. Y una fuente sin peso declarado cuenta **cero, no
un promedio**: un peso inventado es peor que un hueco.

### D2 · IT industrial puede ser comprador, acotado a tres tipos

`integracion_control` es el tipo **mas grande de los 29** del catalogo. La regla de
que "IT es contexto" -- que vivia en la PROSA del metodo, no en el codigo-- era un
falso negativo sistematico sobre eso. Ahora el IT de oficina esta en
`PUESTOS_NUNCA_DECISORES` **y** el industrial (OT, sistemas de manufactura,
ingenieria de control) puede ser decisor en `red_industrial`,
`integracion_control` y `medicion`. En electrico o termico sigue siendo contexto:
un gerente de sistemas no compra una subestacion.

**La excepcion es MAS ESTRECHA de lo que parece, y lo encontro una prueba al
escribirla:** solo rescata a los puestos AMBIGUOS -- los que se llaman como IT de
oficina y responden por la linea, tipo "Gerente de Sistemas de Manufactura"--.
"Ingeniero de Control" y "Especialista OT" nunca estuvieron bloqueados.

### D3 · El padron es FACTOR, no requisito

Empata +8, no empata **0 y nunca negativo**, y el no-empate viaja como ambiguedad
declarada. Era el sesgo contra la planta nueva: el corte del DENUE es semestral, y
la de obra nueva -- la de presupuesto abierto-- era sistematicamente la que el
radar no podia detonar.

**Medido con el caso que la decision pidio:** Coficab Durango, senal fresca, SIN
padron, leida del boletin del cluster -> **62, PASA**. La misma senal hoy, con la
obra ya arrancada -> 37, ARCHIVA, que es correcto. Y la misma senal leida de prensa
generica en vez del cluster -> 58, GUARDA: **el mismo evento vale distinto segun
donde se lea**, y eso es el evaluador funcionando.

### D4 · Modo expansion

Vigila cuentas CON historia. Disparador propio -- proyecto cerrado, arrancado o
comisionamiento-- con **ventana de dos bordes**: antes de 30 dias la planta todavia
digiere la obra, despues de 540 ya compro con otro.

**"Que sigue" sale de la CO-OCURRENCIA medida en el catalogo**, no de una tabla:
si los clientes que compraron X tambien compraron Y, Y sigue a X. La tabla
declarada del metodo rellena donde el catalogo no tiene con que, y viaja marcada
como **CRITERIO, no medicion**.

Y una co-ocurrencia de **UN solo cliente no hace un patron** -- misma leccion que
`f2 < 3` en Chao1--: el catalogo decia `chiller -> instalacion_electrica` con n=1
porque un cliente compro las dos cosas en la misma obra. Eso es una obra.

**Validado con Budenheim:** genera senal de expansion **sin ninguna fuente
publica**, desde sus proyectos reales de Odoo (conveyor, integracion de control,
mezanine).

### D5 · La regla del buzon — y lo que la medicion corrigio

Clasifica convocatoria / RFQ de cliente / congreso, extrae empresa, requerimiento,
categoria, estado y **fecha de cierre** (que manda sobre cualquier plazo: en una
convocatoria el plazo no lo decide FTS). **Solo lectura**, y la senal **no lleva al
remitente**: viaja con la empresa y el requerimiento.

**La palabra suelta "requerimiento" se cayo por el dato real.** Atrapaba un hilo
INTERNO de aceptacion de proyecto y marketing de un proveedor de vision
industrial -- el segundo es peor: habria entrado como convocatoria con peso 23--.
La marca tiene que ser la FRASE.

**Y el resultado corrige lo que #305 prometio.** Sobre 22 correos del buzon real:
**17 senales, 14 sin leer, y CERO pasan el umbral.** Las convocatorias de agregador
dan 37-48 porque no nombran la empresa que compra, ni el estado, ni un tipo de
proyecto de FTS. El evaluador tiene razon. #305 dijo "la via mas barata y el dato
ya esta en casa": **esta en casa, y es floja**. El valor esta detras del enlace que
el correo trae, y abrirlo exige WebFetch -- bloqueado aqui--: **la convocatoria si
necesita n8n despues de todo.**

### D6 · Etapa 1 de escritura a Odoo

`./prospector importar` escribe un CSV de `crm.lead` fuera del repo, **cero
escrituras, sin credencial**. Tipo `lead`, no oportunidad: un prospecto que nunca
contesto no es una oportunidad perdida, nunca fue una oportunidad.

Las tres reglas duras son de codigo, con prueba cada una: un correo **candidato**
no va en `email_from` -- de ahi salen los envios-- y la tarjeta **encabeza con el
contacto cuyo correo si se puede usar**, que fue un arreglo que salio de probarlo;
un contacto en revision humana **no** se propone como partner; y **no existe
columna de celular**.

### El hueco del proceso, cerrado: 3.9% -> 82.5%

Y la causa no era el rendimiento de Outlook: **el constructor ignoraba
`order_partner_id`**, asi que TODAS las entradas salian sin cliente y el cruce de
proceso no tenia con que empatar. Arreglado eso, mas el vocabulario de proceso
crecido con lo que las lineas de Odoo dicen de verdad -- amasadora, marmita,
artesa, tunel de enfriamiento, tolva de sal--, la cobertura paso de **6 de 154 a
127 de 154**, con 6 procesos en vez de 2.

La busqueda dirigida por cliente en el buzon **si rindio poco**: una sola evidencia
directa, la firma de un cliente como *Iron Machining Manager*. El rendimiento alto
estaba en la descripcion de la linea, que nombra el equipo, y el equipo nombra el
proceso.

## 0.9.5 — 2026-09-24

Las cuatro decisiones que Esteban cerro sobre #302, la interfaz del motor 2 con
los motores 1 y 3, y el clasificador del catalogo de proyectos. **498 pruebas**
(eran 364). Los disenos de los motores 1 y 3 quedan en `metodo/`, sin construir.

### La tabla de equivalencias ES-EN de puestos

En el catalogo, como se pidio: **31 grupos, 71 terminos**. Cierra los 2 falsos
conflictos que quedaron vivos en Durango -- `Director General` contra
`General Manager`--. Sale **CON SALVEDAD** reportando ambos, con el termino en
espanol al frente (la ficha la lee un operador mexicano) y **topa en SOLIDO**: la
tabla es una decision humana, no una observacion, y llamar CONFIRMADO a un
acuerdo que depende de una tabla seria acreditarle a la evidencia algo que puso el
catalogo.

**Tres limites deliberados, los tres con prueba.** NO cruza **jerarquia**:
`gerente` y `jefe` de mantenimiento quedan en grupos distintos, porque en la
industria mexicana no son la misma posicion y fusionarlos esconderia la diferencia
que decide a quien se le manda la propuesta. NO cruza **funcion**. Y NO es
sinonimo dentro de un idioma -- `servicios generales` y `facilidades` son la misma
funcion y aun asi no estan agrupados: la peticion era ES-EN--.

Y **empareja el valor completo**: `Gerente de Planta` contra
`Plant Manager COFICAB Silao` **sigue chocando**. Aflojarlo pedia un tokenizador
de titulos, y el modo de falla de aflojarlo es fusionar a dos personas distintas.

### (a) La exclusion por evidencia de ubicacion

El arreglo **real** del doble conteo de #300: la gente regional salio en 2 a 4 de
las cuatro corridas y **cada Chao1 la sumo a SU poblacion**, asi que los cuatro
estimaron sobre una poblacion que no existe. Y la ficha de Pesqueria traia como
unico contacto a uno **de Juarez**.

`Corrida.poblacion()` excluye a quien la evidencia ubica en otra planta o en el
grupo; `semilla_corporativa()` lo exporta **sin nombres** -- viaja el puesto y la
ubicacion, y el nombre lo vuelve a encontrar la corrida destino, asi que la
semilla no puede pasar por observacion propia--.

**Sale de la EVIDENCIA, nunca del titulo.** "Compras = corporativo" perderia la
gerencia de compras **de la planta**, que si es target: en Silao era uno de los
cuatro de valor. Y **quien no tiene ubicacion observada SI cuenta**: ausencia de
evidencia no es evidencia de ausencia. Basta **una** fuente que nombre esta
ciudad, que era el falso "CONFLICTO de planta" de Juarez.

### (b) El nivel corporativo

`prospecta --nivel corporativo`, llave `<empresa>/_corporativo.json` -- el guion
bajo la hace imposible de colisionar con un slug de ciudad--. **M2 y M13 salen
`no_aplicaba` con razon escrita**: una vacante y un establecimiento del DENUE son
objetos **de planta**, y forzarlos al nivel corporativo devuelve las plantas otra
vez. El nivel se aplica **despues** del padron, para que su razon mande sobre la
del empate. Y **no pregunta cual planta**: no va a ninguna.

### (c) Sembrar, y una semilla NO ES RAIZ

`sembrar --de <corrida> --que patron|vocabulario|nota`. Los **contactos no** se
siembran en una planta: van a la corporativa, y sembrarlos en las plantas es lo
que causo el doble conteo.

**Es el peor modo de falla de todo el proyecto**, y por eso la regla es de
codigo y no de prosa: `Observacion.sembrado` sale de `n_raices`, **nunca es
ancla**, y el dato **topa en CANDIDATO** hasta que la corrida lo observe por su
cuenta. Hecho mal, sembrar no pierde datos: **inventa confirmaciones**. El patron
de Coficab tiene **una** ancla, en Juarez; si sembrarla contara como fuente, esa
unica observacion daria CONFIRMADO en cuatro corridas y el estado reportaria
cuatro confirmaciones de un solo hecho -- indistinguible, leyendo el archivo, de
cuatro observaciones independientes--. La prueba siembra lo mismo desde **dos**
origenes, que es el caso peor.

### (d) El tope adaptativo y el veredicto CAMBIAR_DE_VIA

Tramos de **30** -- tres bloques de 10, la ventana minima en la que la saturacion
puede dispararse: con 20 no le das a la compuerta de agotado la oportunidad de
probar que ya no hay nada--. Tres condiciones de evidencia, razon escrita, y
renueva sola **hasta 90**; de ahi lo decide el operador, con **codigo 3**.

Y el tercer caso del desempate: cuando Chao1 **opina** que falta gente **y** tres
bloques dicen que estas consultas ya no la traen, **las dos tienen razon** -- la
poblacion no esta agotada, esta forma de preguntar si-- y los bloques secos **ya
no detienen el lazo**: mandan cambiar de via. Sin vias libres si para, y la ficha
lo dice como lo que es: *"lo que falta necesita Sales Navigator"*, que es
informacion para decidir una compra.

**Corregido el texto de `prematuro`**, que era la otra mitad del defecto: decia
"eso manda SEGUIR" y eso es leer un "no se" como un "sigue". Con 5 observados y
f2=1 Chao1 **no tiene denominador**, y quien decide es el presupuesto.

### El motor 2 se conecta con los otros dos

**Entrada.** `prospecta --angulo "<senal>" --origen radar|manual`. Del radar entra
como **gancho preliminar**, declarado en rojo arriba de la ficha, y la corrida lo
**confirma o corrige**. El aviso se **reemplaza** al resolverlo: un "confirmalo"
que sigue ahi despues de confirmado es una instruccion caduca, y el operador no
puede saber cual de las dos cosas es cierta.

**Salida.** `./prospector paquete` escribe un JSON **fuera del repo** con lo que
el CRM necesita. El **canal sale de la evidencia**: historia en el buzon (raiz
`fts_interno`) -> correo directo; frio con nombre -> LinkedIn como refuerzo;
puesto sin persona -> conmutador. **Celular personal nunca**, y viaja **declarado**
en `canales_que_no_emite` para que el motor 3 no lo invente tampoco. Y **no lleva
a los de otra planta**: el paquete habria creado la tarjeta de CRM con el mismo
contacto de Juarez que ensucio la ficha de Pesqueria.

### El clasificador del catalogo de proyectos (motor 1, §3a)

`flujo/catalogo_proyectos.py`: clasifica una linea de venta en tipo de proyecto,
lee el proceso del cliente y las magnitudes con su unidad normalizada. **Por
vocabulario explicito y no por un modelo**, por dos razones: Esteban lo lee y lo
corrige, y una linea que no pega sale **sin clasificar** en vez de caer en el
cajon mas parecido. Un catalogo que clasifica el 100% miente sobre su cobertura.

Tres decisiones que salieron de probarlo: lo **mas especifico gana** (el sistema
de agua helada le gana al chiller, porque el chiller es su componente);
**servicio contra equipo** lo decide el verbo de suministro (un mantenimiento de
chiller no es un proyecto de chiller, y los compra gente distinta); y el match
exige **frontera izquierda** y deja la derecha libre -- sin la izquierda "cobre"
pegaria dentro de cualquier palabra, con la derecha se romperian los troncos
deliberados como `galvan` -> galvanizado--.

### Dos defectos que encontraron mis propias pruebas

**`derivado_de_patron` era una bandera que ponia quien construia el Dato**, asi
que un correo derivado salia SOLIDO si nadie la ponia. Ahora se **deriva de la
fuente**: es la misma familia de defecto que el contador vacio, y la fuente ya lo
dice.

**La guardia de datos personales atrapo dos correos de mis propias fixtures**, que
quedaron enmascarados. Y dos fixtures ajenos se corrigieron **conservando lo que
verificaban**: uno tenia una corrida de MTY con un contacto de Pesqueria, que con
la exclusion nueva ya no sale en "a quien buscar" -- y eso es correcto--.

### El catalogo real, y lo que corrigio

Triangulado contra Odoo el 24-sep-2026 **despues de las 18:00 CST**, fuera de
horario de produccion. 154 lineas de proyecto clasificadas, **94.5% de
cobertura**. `datos/catalogo-de-proyectos-fts.md`, generado del JSON.

**Y contradice el supuesto del que partia el metodo:** ELECTRICO 33.8% ·
AUTOMATIZACION/TI 18.8% · TERMICO/FLUIDOS **14.9%** · SERVICIO 13.6% ·
ESTRUCTURA 11.7% · MANEJO 7.1%. **`chiller` + `sistema_agua_helada` son SEIS de
154 lineas.** El agua y el enfriamiento son el cuarto lugar, y un radar montado
sobre "PTAR, caldera, torre de enfriamiento" -- que es lo que
`consultas_senal.json` tiene hoy-- encontraria la minoria del negocio.

El vocabulario del clasificador crecio de 14 a **29 tipos** con lo que el dato
mostro. Cada uno con su perfil de quien compra, declarado como CRITERIO y no como
medicion: mirar quien firmo exigiria mirar personas.

**Un hallazgo que no buscaba:** las convocatorias de proveedores -- la fuente que
el diseno puntuo con 23 y marco "no medido"-- **llegan al buzon solas, con
cadencia semanal, y nadie las lee**. Es la via mas barata del radar y la unica
cuyo dato ya esta en casa.

**Dos huecos declarados:** el PROCESO del cliente (la busqueda generica en
Outlook devolvio casi puro boletin; solo 6 de 154 lineas quedaron con proceso), y
la muestra es **muestra, no censo** -- 168 de las 664 lineas de tamano de
proyecto, sesgada hacia proyecto grande, con las descripciones truncadas a ~40
caracteres por el conector--. Todo viaja escrito en la seccion de PROCEDENCIA del
catalogo, antes de las tablas: un sesgo de muestreo no declarado se lee como un
hecho sobre el negocio.

### Los disenos, sin construir

`metodo/motor1-radar-de-leads.md` y `metodo/motor3-crm-odoo.md`. La escritura a
Odoo **espera OK explicito de Esteban**: la herramienta lee Odoo y crear un lead
es escritura.

## 0.9.4 — 2026-09-24

Los bugs medidos de la primera corrida **a escala** -- Coficab en cuatro plantas,
#300-- y las tres **desviaciones de agente** que esa corrida destapo. **364
pruebas** (eran 287); las 77 nuevas estan en `tests/test_maestro_300.py`.

Los cinco cambios de metodo que la corrida pide quedaron **disenados y NO
construidos**, en [`metodo/propuestas-de-metodo-300.md`](metodo/propuestas-de-metodo-300.md).

### B2 · Dos redacciones del mismo puesto no son una contradiccion

El challenge marcaba **CONFLICTO** entre `Gerente` y
`Gerente COFICAB LEON, Silao Gto`. No es una contradiccion: es la misma cosa
redactada con mas o menos detalle. **En Silao fueron 7 de 7** -- siete contactos
mandados a revision humana sin nada que decidir--.

Ahora, cuando un valor **contiene** a los otros, el dato sale **CON SALVEDAD** y
se reporta **la redaccion mas especifica** (la que dice la planta), nombrando a la
fuente que lo dice mas corto. No es elegir en silencio -- el bug del Caso F--.

**Tres limites, y los tres importan:**

* **Solo en `puesto`** (`CAMPOS_CON_CONTENCION`). Lo encontro una prueba propia al
  implementar esto: `Casa` esta contenido en `Otra Casa` como palabra completa, y
  son **dos empresas distintas**. Un empleador equivocado **no rebota** -- se manda
  el correo y se queda ahi--; un puesto redactado con mas o menos detalle no tiene
  ese costo.
* **Por palabra completa**, y el corto necesita **cuerpo** (>= 4 caracteres). Sin
  la frontera, `ventas` quedaria contenido en `inventas`.
* **Topa en SOLIDO, no CONFIRMADO.** Las fuentes coinciden en el **tronco**, no en
  el todo. Llamarlo CONFIRMADO afirmaria mas de lo que se observo.

**Y lo que NO arregla, medido en la misma corrida:** `Director General` contra
`General Manager` -- Durango, 2 de 3-- **sigue saliendo CONFLICTO**, que es lo
correcto: eso es **traduccion**, no redaccion, y ninguna regla de traduccion esta
aprobada. **El arreglo cierra 7 de los 9 falsos conflictos de la corrida, no 9.**

### B3 · La fecha parcial ya cuenta como fecha

`fecha_de()` no reconocia `AAAA-MM` ni `AAAA` solos, asi que la senal de **oct-2024
de Silao** y la de **2018 de Juarez** salian "sin fecha en el registro" **aunque la
traen escrita**. Esa marca existe para que una senal vieja no se lea fresca: no
reconocer la fecha parcial **esconde la antiguedad**, que es lo contrario de su
proposito.

Se aceptan y se imprimen tal cual -- `2024-10` dice menos que `2024-10-15` y
muchisimo mas que nada--. Las formas parciales van **al final** del alternado: si
fueran primero se comerian el ano de una fecha completa. Y llevan frontera, para
que `1500 empleados` y `version 3.2024.1` no pasen por fecha.

### B1 + B6 · Que es, y que no es, una senal

`registrar` aceptaba la senal como objeto `{fecha,texto,fuente}` y `ficha` tronaba
con **TypeError**. Un agente lo vio y **edito el JSON de estado a mano** para poder
emitir la ficha.

**Me aparto de la letra de B1 a proposito, y hay que saberlo:** B1 pedia
**rechazar** el objeto; B6 pedia que la senal tenga "texto y fuente". Las dos cosas
juntas no se pueden si la senal es solo texto. **El instinto del agente era
correcto: queria estructura.** Asi que se **aceptan las dos formas** y se
normalizan a la cadena canonica -- `fecha` y `fuente` se pegan al frente, porque la
ficha lee la fecha DEL TEXTO--. Si Esteban prefiere el rechazo puro, es una linea.

Lo que **si** se rechaza (B6) es lo que no es una senal: los encabezados
(`Mapeo de plantas`, `Contactos:`, `Vocabulario`…), cualquier rotulo que termina en
dos puntos, y lo que no llega a 25 caracteres.

### La liga rota de Durango

Esteban reporto que la liga de una fuente de la ficha de Durango **no abre**, y la
ficha la imprimia como si fuera buena.

**Lo que se puede verificar es la FORMA, y se verifica:** URL absoluta, con esquema
y dominio, sin espacios; y se limpian las colas que se pegan al copiar (`).`, `,`).
Una liga sin esquema, una ruta relativa o una con espacios **se rechazan al
registrarlas**, con la pista de que le falta. Sin liga sigue siendo valido -- Odoo y
el buzon no tienen URL, y exigirla los dejaria fuera del registro--.

**Lo que NO se puede es abrirla: `WebFetch` esta bloqueado por egress, medido.**
Asi que la ficha deja de imprimirla como comprobada: ahora muestra **el dominio**
con un **`?`** y una nota al pie que dice exactamente que se verifico la forma y no
el contenido. Prometer que abre seria afirmar lo que no se llamo.

### La escala de cercania, que se capturo invertida

En Silao un agente creyo que **100 = decide** -- es al reves-- y marco a un contacto
de **reclutamiento** como comprador con correo solido: **el unico "de valor +
correo" de esa corrida era falso**, y la herramienta no lo detecto.

`exigir_cercania_coherente` corre en `_contacto`, o sea en **las dos vias** por las
que un agente captura (`registrar` y `buscar`), y rechaza:

* lo que no es numero, y lo que es **decimal** -- un `100.5` es un error de captura,
  no media posicion mas lejos de la decision; sin esta linea `int(100.5)` pasaba
  callado--;
* fuera de `0`-`100`, **con el sentido de la escala en el mensaje**: el error real
  fue de sentido, no de rango, y un mensaje que no lo diga deja al agente
  invertirla **dentro** del rango;
* una cercania de decisor (<= 41) en un puesto que **por definicion no compra
  infraestructura**: reclutamiento, RH, capital humano, prensa, recepcion, becario.
  **No es que no sirvan** -- un reclutador es una fuente buenisima de vocabulario de
  planta--: lo que no es, es el comprador. Topan en 41, fuera del filtro de valor
  (20) y sin confundirse con "sin estimar" (50).

Y la escala **quedo escrita en la skill**, con su tabla. No estaba en ninguna
parte, que es la razon de fondo por la que se pudo invertir.

### El estado editado a mano se declara en la ficha

En Pesqueria un agente **edito el JSON de estado a mano** para que la ficha
saliera. Lo declaro en el issue y se pudo verificar contra un respaldo, pero **la
herramienta no lo detecto**: un estado editado a mano se veia identico a uno
legitimo.

La corrida lleva ahora una **firma** (SHA-256 de su contenido) que se escribe al
guardar y se verifica al abrir. Si no cuadra, **la ficha lo declara arriba, en
rojo, antes del gancho**, y `estado` marca la corrida con **`✎`**.

**Dos cosas que esto NO es.** No es **seguridad**: quien edite el JSON puede
recalcular la firma, y hay una prueba que lo fija asi para que nadie la presente
despues como un control de integridad. Es **deteccion de descuido**, que es el caso
real -- un agente con prisa arreglando un bug--. Y **no bloquea**: dentro hay
trabajo real y negarse a emitir la ficha lo perderia. Lo que no puede pasar es que
salga **sin decirlo**.

### La skill: rodear una compuerta esta prohibido, y se reporta

Tres formas de rodear, las tres medidas en la corrida, las tres prohibidas por
escrito: correr una busqueda que la compuerta se nego a registrar (Durango),
editar el estado a mano (Pesqueria), e inventar el valor que la compuerta pedia
(Silao). **Y si ocurrio, va en el issue final**, con el comando y lo que la
compuerta dijo.

No es una confesion que cueste nada: **es el dato mas valioso de la corrida.** Los
siete falsos conflictos y la escala invertida salieron a la luz porque el agente
lo declaro. Una compuerta que estorba de mas es un defecto de la herramienta, y
solo se arregla si se sabe donde estorbo.

### La skill: multiplanta, y por que no son cuatro agentes ciegos

Las cuatro plantas arrancaron **desde cero al mismo tiempo**, y cometieron los
mismos cuatro defectos **por separado y a la vez**. Cuatro agentes ciegos no se
corrigen entre si: **repiten el mismo error cuatro veces y lo pagan cuatro veces.**

El orden recomendado quedo escrito: **primero la planta con historia, en primer
plano** -- es la mas rentable y la que calibra el vocabulario y el patron--;
**despues las demas, sembradas con lo que salio de esa**; **la corporativa,
aparte**, porque su poblacion y su agotado son otros. Mientras `sembrar` no exista,
la siembra a mano es parte del oficio.

### B7 · Confirmado, ya estaba

La distincion entre "`pytest` no instalado" y "pruebas en rojo" se cerro en #301
(MEJORA 3): `listo` dice **NO SE PUDO VERIFICAR** con `None`, no `False`. Sin
cambios aqui.

### Lo que NO se pudo medir, y hay que decirlo

**Las cuatro fichas de Coficab no estan en este contenedor.** Viven en la sesion
del operador (`…/384cecea-…/`); esta corre en `1546b028-…`. Asi que **re-emitir la
ficha de Silao y de Durango sobre los archivos reales era imposible**, y la
medicion de B2 y B3 se hizo **reconstruyendo los casos exactos que #300
documenta** -- los siete pares de puesto de Silao, los dos de Durango, la senal de
oct-2024, la de 2018--. Son los casos del issue, no los archivos del issue. Cuando
Esteban corra de nuevo, la ficha sale ya con los arreglos.

## 0.9.3 — 2026-09-24

Cuatro mejoras de las **DOS corridas reales del operador** -- Coficab (#268) y
las cuatro plantas en paralelo--. Dos de fondo, y las dos salieron de perder
trabajo. **287 pruebas.**

### 1 · La ficha tiene que SOBREVIVIR a la sesion

La carpeta de la corrida vive en `/tmp` del contenedor de Claude Code web, y ese
contenedor **muere al cerrar la sesion**. La primera corrida de Coficab se perdio
exactamente asi: la ficha estaba escrita, el operador vio "escrita", y el
contenedor se la llevo.

**Destinos evaluados, con lo que cada uno puede de verdad:**

| Destino | Veredicto |
|---|---|
| **OneDrive / SharePoint** (`sharepoint_upload_file`) | **RECOMENDADO.** Sube texto UTF-8 hasta 1 MB -- la ficha pesa ~25 KB-- y cae en el MISMO inquilino de Microsoft donde ya viven el Outlook y el Odoo del operador. La ficha lleva nombres, puestos y correos: los datos personales **no salen del control corporativo de FTS**. Esa es la razon de fondo, no la comodidad |
| **Google Drive** (`create_file`) | ALTERNATIVA. Mas simple -- no hace falta buscar el driveId-- pero cae en una cuenta distinta a la corporativa. Respaldo si OneDrive falla |
| **Correo como adjunto** | **NO SE PUEDE, medido.** El `outlook_send_mail` conectado **no tiene parametro de adjuntos**. Y pegar el HTML en el cuerpo no sirve: el cuerpo se sanea contra una lista corta que quita `<style>` y `<span>`, asi que llegaria sin diseno y sin ser un archivo reenviable |

**Como quedo.** Python no puede subirla -- el conector vive detras de MCP, igual
que Odoo y Outlook--, asi que se aplico el mismo patron de #298: Claude sube,
Python **exige la constancia**.

`ficha` devuelve **codigo 4** -- no es falla, es un paso pendiente-- e imprime los
tres pasos con el conector y el comando exactos. `entregar` registra la liga. Una
entrega sin URL no es una entrega: no se puede comprobar, y el punto es que el
operador la encuentre cuando esta sesion ya no exista.

**Y si la ficha se re-emite DESPUES de entregarla, el codigo 4 regresa.** No
basta con "se entrego una vez": la copia de OneDrive quedo vieja, y una copia
vieja es peor que ninguna -- el operador se la manda a un tercero creyendo que es
la ultima--. Se compara la fecha del archivo contra la de la entrega, derivado
del disco.

Si el operador decide no sacarla, `--sin-entregar --razon` lo deja escrito:
significa que se va a perder, y eso tiene que quedar dicho.

### 2 · Guardado por empresa + PLANTA, nativo

La corrida se guardaba como `<empresa>.json`, plano. Con una empresa multiplanta
la segunda planta **pisa** la primera, y el operador lo parcho de la unica forma
que podia: inventando nombres -- "Coficab Juarez", "Coficab Durango"--. Cuatro
corridas con cuatro nombres falsos, y el cruce con el padron buscando una empresa
que no existe.

    <sesion>/coficab/pesqueria.json          la corrida
    <sesion>/coficab/pesqueria-limpio.html   su ficha

`Corrida.empresa` guarda la empresa **real** -- "Coficab"--, que es la que cruza
con el padron y la que encabeza la ficha. La ciudad vive en su campo, donde
siempre debio estar.

Tres detalles que importan:

- **Los acentos se normalizan.** 'Pesqueria' y 'Pesquería' dan el mismo slug, o
  la misma planta abriria dos corridas segun como se escriba.
- **Sin `--ciudad` y con varias plantas, el comando SE NIEGA y las lista.**
  Elegir una en silencio es el defecto que esta mejora corrige.
- **Las corridas viejas siguen abriendose, y se guardan DONDE ESTABAN.** Hay
  corridas vivas con el esquema plano; romperlas o moverlas a media corrida del
  operador seria perder trabajo. La ruta de ORIGEN manda sobre cualquier
  recalculo -- lo que ademas cierra un modo de falla en el que la corrida se
  partia en dos archivos--.

La ficha de cada planta tiene su propio archivo. Con el nombre plano las cuatro
escribian la misma `<empresa>-limpio.html`: el mismo defecto, un paso mas abajo.

### 3 · `pytest` ya no da una falla FALSA

En las dos corridas reales `listo` marco las pruebas en **FALLA** y no era
cierto: el contenedor de Claude Code web no trae `pytest`, y hubo que instalarlo
a mano las dos veces. Una falla falsa en el primer chequeo del dia manda a
depurar la herramienta cuando la herramienta esta bien.

Ahora se intenta instalar una vez, en silencio. Si no se puede -- sin red, o pip
bloqueado-- se reporta **`None`, no `False`**: NO VERIFICADO no es FALLA, y es la
misma distincion que la herramienta hace en todas partes.

### 4 · `estado` sin `--empresa`: todas las corridas, en tabla

Con corridas en paralelo el operador solo veia "N tareas en ejecucion".

```
CORRIDAS EN LA SESION · 4

empresa            planta                 gasto   bloques modulo   chao1        ficha
Coficab            Cd. Juarez            35/60      3·1    M5       prematuro    ENTREGADA (onedrive)
Coficab            Durango               12/60      1·0    M2       sin_datos    no emitida
Coficab            Pesqueria              8/60      0·0    M3       sin_datos    !! SIN ENTREGAR
```

Gasto sobre el tope, bloques cerrados y cuantos secos, modulo en curso, veredicto
de Chao1, y **si la ficha ya salio de la sesion**. Cuando hay fichas emitidas y
sin entregar, lo **grita** al final: son las que se pierden al cerrar.

### Anotado para decision, NO construido

La **compuerta de evidencia de operacion**: si al terminar la OLA 1 una planta no
dio ninguna senal de operar -- sin vacantes, sin prensa, sin directorio, sin
padron-- que pregunte antes de gastar el 60% del presupuesto en ella. Es el caso
de Pesqueria, en curso. Esta escrita en
`metodo/modulos-de-contactos.md` con las tres cosas que hay que decidir y una
recomendacion.

## 0.9.2 — 2026-09-24

Un ajuste de **fluidez** que resulto ser una compuerta. **259 pruebas.**

### El problema: la verificacion era un prompt extra

El operador trabaja desde la web, en lenguaje natural, sin terminal. Y tenia que
pedir aparte, cada vez, que se corriera `listo` y que se probaran los tres
conectores antes de escribir la frase de arranque. Un prompt extra por corrida
-- y si se le olvidaba, la corrida arrancaba **a ciegas**--.

### Lo que NO se podia hacer, y por que

Mover la verificacion a Python. **Los conectores viven detras de MCP y desde
Python no se ven** -- por eso `chequeo()` los marcaba `[ ? ]`--. Un `listo` que
dijera "Odoo vivo" sin haberlo llamado seria contar una declaracion como
evidencia: el mismo pecado que la compuerta de agotado persigue, aplicado al
arranque.

### Lo que si se movio: la EXIGENCIA

Claude llama a los tres conectores -- eso no cambia, es lo unico que puede
llamarlos-- y **registra lo que contestaron**. `prospecta` **se niega a abrir la
corrida** sin esa constancia:

```
./prospector conectores --odoo "1 fila de res.partner" \
                        --outlook "12 hilos" --websearch "10 resultados"
./prospector prospecta --empresa "<empresa>"
```

Mismo mecanismo que `buscar`, que exige la consulta textual porque no puede
comprobar que se corrio. La evidencia es **obligatoria**: un `vivo` sin decir que
devolvio es una declaracion.

**La sonda vence a los 60 minutos.** Una sonda de hace seis horas no prueba que
el conector este vivo AHORA, y arrancar con esa constancia seria dar por bueno
algo que no se llamo.

### Un conector caido detiene la corrida y PREGUNTA

`prospecta` devuelve **3** -- la misma salida que la pregunta de la empresa
multiplanta, y no es casualidad: las dos paran para preguntar una linea, y
ninguna de las dos es un error que arreglar--. El mensaje dice **por que importa
ese conector**, no solo que se cayo.

Si el operador autoriza seguir, no queda en una nota al margen: **el modulo sale
`sin_acceso` con razon escrita**, y eso viaja hasta el checklist de validaciones
de la ficha. Quien la reciba va a ver que la corrida se hizo ciega de esa fuente.
Declarar el hueco es la mitad del metodo; anotarlo al margen no lo es.

Y no se autoriza un hueco de un conector que nadie probo, ni de uno que contesto
bien: autorizar sin sondear no autoriza nada.

**`WebFetch` no entra.** Bloqueado por egress, medido, y no detiene nada: M7 y M8
salen `sin_acceso`, que es lo correcto.

### `listo` deja de decir "solo Claude lo comprueba" cuando ya se comprobo

Una vez sondeados, muestra lo que cada conector contesto y la antiguedad de la
sonda. Sin sonda sigue en `[ ? ]`, y el detalle dice **quien tiene que
llamarlos**. Lo que sigue prohibido es lo de antes: que Python los de por buenos
por su cuenta.

### Para el operador

Una frase, `prospecta <empresa> en <ciudad>`, y nada mas. La skill verifica sola,
y **solo le habla si hay algo que decidir**: un conector caido, o una empresa con
varias plantas.

## 0.9.1 — 2026-09-24

Las tres correcciones que dejo la **primera corrida real de un operador** -- no
mia: Esteban, sobre Coficab, #268--. **235 pruebas.**

### 1 · La ficha sale como ARCHIVO .html, y completo

El defecto era doble.

**Uno:** el archivo se escribia con extension `.html` pero el contenido era un
FRAGMENTO -- sin `<!doctype>`, sin `<html>` y **sin `<meta charset>`**--. Sin
charset declarado los acentos se rompen en cuanto el archivo sale del navegador
que lo genero: adjunto de correo, lognote de Odoo, vista previa. El operador
necesita el archivo justo para eso.

**Dos:** le faltaba la mitad de lo que se manda. Tenia contactos, senal,
conflictos y checklist. Ahora tiene, en este orden: **gancho · senal caliente con
su fecha · por que ahora · a quien buscar** (nombre, puesto, **planta**, correo y
nivel de confianza) **· como hablarles · busquedas para Sales Navigator ·
fuentes con liga y fecha · checklist de validaciones** -- que se corrio, que
salio `sin_acceso` y por que-- y la completitud de Chao1.

Y **imprime la ruta exacta** del archivo al terminar, en lugar de una linea que
se perdia entre la tabla de rendimiento.

Tres detalles que valen mas que el formato:

- **Cada senal va con LA FECHA que su texto trae**, o marcada `sin fecha en el
  registro`. Es la leccion de #295 vuelta codigo: un programa de inversion de
  2022 que, sin la fecha al lado, se leia como noticia fresca.
- **Las busquedas de Sales Navigator se DERIVAN** de los puestos de valor y del
  vocabulario que la corrida recogio. El operador ya hizo ese trabajo; volver a
  escribirlo a mano es donde se pierde media hora y se cuelan errores de dedo.
- **Los tres textos de criterio** -- gancho, por que ahora, como hablarles-- los
  escribe el operador, porque el codigo no puede derivarlos. Si faltan, la ficha
  **lo dice en su lugar y nombra el comando que los llena**: una ficha que parece
  completa y no lo esta es peor que una con avisos.

El modo procedencia sale ahora **tambien como `.html`**, aparte. El `.json` se
queda: es el artefacto auditable a maquina, y el `.html` es el que se revisa.

`buscar` acepta `--liga`. Una fuente sin liga ni fecha no es una fuente, es una
afirmacion -- y la ficha marca `sin liga` cuando no la hay, en vez de dejar el
hueco en blanco--.

La guardia de `salida.py` sigue siendo lo unico que sostiene todo esto, y sigue
probada: pedir la ficha dentro del repo devuelve codigo 2 y no escribe nada.

### 2 · Aviso de bloque a las 10, y negativa en la 11

El operador no cerro el bloque a las diez y siguio hasta **35**. Ahi `bloque` lo
rechaza -- el maximo es diez-- y un tramo de 35 **no se puede cerrar ni partir**
sin editar el estado a mano. Consecuencia real: M5 cerrado como `fallo` con razon
escrita, y la vuelta que Chao1 pedia imposible de abrir.

La compuerta detectaba el error **cuando ya no tenia arreglo**. Ahora:

- a las **9** consultas `buscar` avisa que falta una;
- a las **10** avisa fuerte, con el comando exacto;
- en la **11** se niega a registrar, y el mensaje dice que hacer y que se pierde
  si se deja correr.

El arreglo es **prevencion, no una puerta nueva**: `bloque` sigue negandose a
cerrar un tramo de 35. Lo que cambia es que ese estado ya es inalcanzable por la
via normal. Hay prueba de regresion con el caso de 35.

### 3 · Una corrida = UNA planta (`SKILL.md`)

Anotado en la skill, con las dos razones medidas: con un barrido que salta entre
seis plantas **los bloques de 10 dejan de medir** rendimiento marginal, y **Chao1
pierde el denominador** -- estima una poblacion, no seis--.

Y reforzado lo que la herramienta ya hacia bien: ante una empresa multiplanta
**pregunta cual y espera**. Elegir una en silencio es el defecto de los cinco
DUNS de Ragasa; abarcarlas todas es el mismo error con otro disfraz. El mapeo de
plantas si se hace en una sola corrida -- M12 y M2 lo dan casi gratis-- y cada
planta con responsable se prospecta en la suya.

## 0.9.0 — 2026-09-24

Dos decisiones de criterio aprobadas a partir de la corrida de #295, y tres
arreglos que venian con ellas. **216 pruebas.**

### DECISION 1 · «Seco» = cero entradas DE VALOR

El criterio anterior -- cero ENTRADAS, de las que fueran-- **no terminaba**. En
una casa de ~6,000 empleados con catorce lineas de negocio siempre queda un
angulo que devuelve dos o tres nombres sin puesto. La regla medía *si queda
algo*, y siempre queda algo. Lo que tiene que medir es *si queda algo que
valga*.

Se mantienen los **tres bloques consecutivos** y los **diez por bloque**. Lo
unico que cambia es que el bloque se mide por `de_valor`.

Dos propiedades que no son obvias y estan probadas:

- **Un bloque con entradas pero sin valor ES seco.** El bloque 13 de la corrida
  -- tres entradas, cero de valor-- alargaba la cascada; ahora la cierra.
- **Un bloque sin entradas pero CON valor NO es seco.** Si una vuelta le
  encuentra el puesto a alguien que habia entrado sin el, produjo valor. Por eso
  `de_valor` es la resta de dos marcadores y no un conteo de contactos nuevos.

**Medido contra la corrida de #295**, que es la prueba de regresion:

| | criterio viejo | criterio nuevo |
|---|---|---|
| cierra en | **nunca** | **bloque 12** |
| consultas | 132 y contando | **120** |
| de valor capturado | 27 de 27 | **25 de 27** |

**Cuesta dos entradas de valor de veintisiete** -- una superintendencia de
operaciones y un herramental de extrusion-- y ahorra doce consultas. No es
gratis, y el numero queda escrito donde se ve.

> **El matiz que no se puede callar:** con las fronteras que la corrida uso *de
> verdad* -- con su bloque de cinco consultas-- el criterio nuevo tampoco se
> habria pronunciado. No es defecto del criterio: es el bloque corto, que era un
> error y que el codigo ya no permite. Las dos tablas estan en las pruebas.

### DECISION 2 · M3 sube a POR_FUENTE con tres vias, y sube en la ola

M3 rindio **0.62 entradas de valor por consulta contra 0.25 de M5** -- 2.5x,
siendo la capa barata-- y fue la **unica fuente que aporto anclas**. Se cerraba
con un solo documento.

Su agotado exige ahora **tres vias distintas, nombradas en el catalogo**:
`camara`, `normalizacion` y `congreso`. Con una sola etiqueta el modulo no
podria agotarse nunca por fuente -- el mismo tropiezo que M2 tuvo con
`vacante`--.

Las tres **comparten raiz** `documento_oficial` a proposito: separarlas en el
AGOTADO, para obligar a recorrerlas, no es lo mismo que separarlas en la
CONFIANZA. Que la camara y el comite digan lo mismo son dos documentos
oficiales, no dos mundos independientes.

Y **M3 sube al segundo lugar de la OLA 1**, despues del padron y antes de los
directorios: ademas de contactos da vocabulario, y el motor no puede combinar
palabras que todavia no existen.

### Tres arreglos que no cambian criterio

**`trayectoria` ya no dispara C1.** Un expediente laboral no es una afirmacion
sobre un hecho unico: es una lista de tramos, y cada fuente ve un pedazo.
`puesto` y `entidad` siguen chocando igual -- son los campos donde equivocarse
cuesta--.

> **Alcance real, medido:** quita **uno** de los once conflictos de #295, no
> tres. Los otros dos casos de carrera estaban registrados en `puesto`, no en
> `trayectoria`. Evitarlos es disciplina de captura, no regla de codigo.

**`fusionar` renombra y funde.** Tres veces en #295 aparecio el nombre completo
de alguien ya registrado con el apellido cortado; registrarlo aparte habria
inflado el numerador de Chao1 y registrarlo como observacion dejaba la ficha
mostrando el nombre corto. Ahora `./prospector fusionar --de X --a Y` reapunta
los hallazgos de las busquedas -- si no, los `hits` colgarian de una clave que
ya no existe-- y propaga revision y vigencia con la asimetria de siempre: solo
se agregan, nunca se limpian.

**`tiene_ancla` mira el CAMPO, no solo la fuente.** Un puesto impreso en una
memoria de congreso marcaba a la persona como anclada aunque nunca se hubiera
visto un correo suyo. El argumento de `de_valor` es «un comprador con CORREO
REAL es accionable», y un cargo impreso no es un correo. `patron_correo` tampoco
ancla: un patron habla de una poblacion de direcciones, no de esta persona.

> **Efecto medido en #295:** las entradas de valor siguen siendo **27** -- los
> seis casos anclados por fuente ya eran de valor por cercania, tal como estaba
> reportado--. Lo que cambia es la columna `ancla` de la tabla: de seis a
> **uno**, que es el numero real de correos literales de la cuenta.

### Sigue abierto, y a proposito

**La cercania solo se acerca, nunca se aleja.** Derivarla del puesto mejor
evidenciado es cambio de fondo y se decide aparte.

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

## Los nueve defectos que la corrida encontro

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

**8. El challenge borraba los avisos de la corrida.** `c.avisos = avisos`
pisaba la lista entera, asi que cada challenge se llevaba por delante los avisos
de caducidad del padron y las subidas de tope -- las DECISIONES de la corrida--.
Se descubrio al ir a citar las cuatro subidas de tope y encontrar la lista con
puros conflictos. Ahora los avisos del challenge llevan marca y solo se
reemplazan entre ellos.

**9. El catalogo estaba incompleto.** La compuerta rechazo una consulta a un
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
