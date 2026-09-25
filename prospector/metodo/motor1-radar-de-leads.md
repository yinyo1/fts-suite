# Motor 1 · El radar de leads — diseño

**Qué se construye ya:** el catálogo de proyectos (§3a, hecho — ver
[`datos/catalogo-de-proyectos-fts.md`](../datos/catalogo-de-proyectos-fts.md)) y
el evaluador (§3c, es código puro y no necesita red).
**Qué espera n8n:** el cron y la lectura de artículos. `WebFetch` está bloqueado
por egress desde aquí, medido.
**Qué espera OK de Esteban:** nada de este documento. Lo que sí lo espera es la
escritura a Odoo del motor 3 — ver [`motor3-crm-odoo.md`](motor3-crm-odoo.md).

Este documento **no empieza de cero**: [`fuentes-de-senal.md`](fuentes-de-senal.md)
ya midió qué alcanza cada lado y dejó cuatro familias de consulta dirigida en
`datos/consultas_senal.json`. Lo que falta, y es lo que aquí se diseña, son las
**tres piezas que convierten esas consultas en un radar**: las fuentes que le
faltan, el **evaluador** que decide qué pasa, y el **lazo de aprendizaje** con el
motor 3.

---

## El reparto entre los tres motores

```
MOTOR 1 · RADAR            MOTOR 2 · PROSPECTOR        MOTOR 3 · CRM
detecta la señal     --->  encuentra a las personas --->  da seguimiento
                     ángulo sembrado          paquete JSON
        ^                                                     |
        +------------- qué señal convirtió --------------------+
```

El lazo de retorno es lo que separa un radar de una suscripción a noticias: **sin
saber qué señal convirtió, los pesos del evaluador son una opinión.**

---

> ## CONSTRUIDO sobre #305 — este documento ya no es solo diseño
>
> Las seis decisiones de #305 quedaron **construidas**, y el código manda sobre el
> texto de abajo donde difieran:
>
> | Decisión | Dónde vive |
> |---|---|
> | **D1** términos eléctricos y de automatización, con peso derivado del catálogo | `flujo/radar.py` |
> | **D2** IT industrial puede decidir, acotado a tres tipos | `flujo/confianza.py` |
> | **D3** el padrón es factor (+8 / 0), nunca negativo | `flujo/radar.py` |
> | **D4** modo expansión, con «qué sigue» por co-ocurrencia medida | `flujo/expansion.py` |
> | **D5** la regla del buzón para convocatorias | `flujo/buzon.py` |
> | **D6** etapa 1 de escritura a Odoo (CSV de importación) | `flujo/importacion_odoo.py` |
>
> **Y lo que la construcción corrigió del propio diseño**, medido sobre el buzón
> real el 25-sep-2026: de 22 correos revisados salieron **17 señales, 14 de ellas
> sin leer — y CERO pasaron el umbral.** Las convocatorias de agregador dan 37-48
> porque no nombran la empresa que compra, ni el estado, ni un tipo de proyecto de
> FTS. El evaluador tiene razón, y este documento decía que esa fuente era «la más
> barata y el dato ya está en casa». **Está en casa, y es floja.** El valor real
> está detrás del enlace que el correo trae, y abrir ese enlace exige WebFetch, que
> está bloqueado aquí: **la convocatoria sí necesita n8n después de todo.**

## LO QUE EL CATÁLOGO REAL CORRIGIÓ DE ESTE DOCUMENTO

Este documento se escribió **antes** de construir el catálogo de §3a. El catálogo
se construyó después, contra Odoo, y **corrigió su premisa central**. Se deja
escrito aquí arriba porque cambia cómo hay que leer todo lo de abajo.

Sobre 154 líneas de proyecto clasificadas
([el catálogo](../datos/catalogo-de-proyectos-fts.md)):

| Familia | % de las líneas |
|---|---|
| **Eléctrico** — tableros, transformadores, electroducto, instalación, subestación, tierras, UPS | **33.8%** |
| **Automatización y TI industrial** — control, PLC/HMI, red industrial, medición | **18.8%** |
| Térmico y fluidos — agua helada, chiller, torre, tubería, bombeo, tratamiento | 14.9% |
| Servicio — comisionamiento, maniobras, mantenimiento | 13.6% |
| Estructura y obra — mezanine, estructura metálica, civil | 11.7% |
| Manejo de material — conveyor, polipasto | 7.1% |

> **`chiller` + `sistema_agua_helada` son 6 de 154 líneas.**

**Tres consecuencias, y las tres son decisiones de método, no detalles:**

1. **El evaluador no puede puntuar sólo con vocabulario de agua y enfriamiento.**
   `datos/consultas_senal.json` tiene hoy en `terminos_evento.alto`
   «PTAR, cogeneración, caldera, torre de enfriamiento» — y eso cubre **15%** de
   lo que FTS vende de verdad. Un radar montado sobre esas palabras encontraría
   sistemáticamente la minoría del negocio. Hay que sumar los términos
   eléctricos y de automatización: *subestación, tablero, transformador, media
   tensión, ampliación de carga, electroducto, automatización de línea, PLC,
   retrofit, migración de control, red industrial*.
2. **El perfil de quién compra cambia por familia, y el método tenía una regla
   que ahora choca.** El método dice que «IT o RH que sólo mencionan la palabra
   son contexto, no target». Para `red_industrial` — 19% del negocio junto con
   control — **el comprador puede estar en IT industrial**, y la compuerta de
   cercanía lo mandaría a contexto. No lo cambié: es criterio, y es tuyo. Lo dejo
   nombrado porque es un falso negativo sistemático sobre la segunda familia más
   grande.
3. **La señal de obra nueva vale más de lo que este documento decía, no menos.**
   Una ampliación de planta mueve **carga eléctrica** antes que carga térmica:
   subestación, tablero, electroducto. Es la familia más grande de FTS y la que
   una nota de «ampliación» delata primero.

**Y una cosa que el catálogo NO pudo establecer, declarada como hueco:** el
**proceso del cliente**. La triangulación con Outlook, buscando por palabras de
proceso en todo el buzón, devolvió casi puro boletín y convocatoria: sólo **6 de
154** líneas quedaron con proceso identificado. El proceso hay que sacarlo con
búsqueda **dirigida por cliente**, no genérica — la misma lección que
`fuentes-de-senal.md` ya había medido para los feeds. Sin eso, el factor «match
de proceso» del evaluador (25 de 50 puntos) no tiene con qué calcularse todavía.

---

# 3b · Las fuentes del radar

Tres grupos, y el tercero es el que nadie más tiene.

## Grupo 1 · Públicas

| Fuente | Qué da | Dónde corre | Estado medido |
|---|---|---|---|
| **Vacantes técnicas** (OCC, Indeed, Computrabajo, LinkedIn Jobs público) | La señal más honesta de que una planta **opera y crece**: nadie contrata un técnico de mantenimiento para una nave que no existe | `WebSearch` desde la sesión | OCC devuelve **403** al raspado; Computrabajo **200**. Por búsqueda, las cuatro funcionan |
| **Prensa industrial** | Obra nueva, inversión, inauguración | n8n lee; la sesión busca | 5 de 11 fuentes responden 200. Dos con RSS vivo |
| **Convocatorias de proveedores** | La señal **más fuerte que existe**: la empresa dice en público que va a comprar | **ya llegan al buzón** | **MEDIDO: están llegando hoy y nadie las mina** |
| **Licitaciones** | Obra pública y paraestatales | CompraNet / ComprasMX | no medido |

**El ajuste que la medición obliga.** `fuentes-de-senal.md` midió que un feed
genérico de industria tiene **relación señal-ruido pésima** para este padrón: de
22 notas entre los dos RSS vivos, **cero** eran de Nuevo León o Coahuila y
**cero** de alimentos. Y las alertas de vacantes de LinkedIn dieron **6 en dos
años, una sola del padrón**. Así que el radar **no se suscribe y espera**:
arranca por **consulta dirigida** y usa el feed como red de arrastre secundaria.
Eso ya está decidido; aquí solo se hereda.

**Las vacantes suben de nivel, y eso sí es nuevo.** Hoy `consultas_senal.json`
las tiene en `terminos_evento.bajo`. Propongo subirlas a **alto cuando el puesto
manda sobre fluidos o mantenimiento** y dejarlas en bajo si no, porque son la
única fuente pública que dice **que la planta opera hoy**, no que invirtió hace
un año. En #300 fueron las vacantes activas de OCC e Indeed las que confirmaron
que Pesquería opera, contra la duda de si la planta existía.

**Las convocatorias ya están en el buzón, y ése es el hallazgo del 24-sep-2026.**
Buscando en Outlook aparecieron, con cadencia semanal o quincenal, correos de
agregadores de requerimientos industriales — del tipo «empresas buscan
proveedores de estos productos y servicios», con requerimientos por categoría y
por estado— más avisos de congresos del sector y, lo más valioso, **una RFQ real
de un cliente reenviada por un vendedor de FTS** (iluminación y obra civil para
el acceso de una planta).

Eso cambia el plan: **la fuente que este documento puntuó con 23 y marcó «no
medido» está entrando sola, por correo, y nadie la está leyendo.** No hace falta
raspar portales para empezar: hace falta **una regla sobre el buzón** que
clasifique esos correos, cruce el requerimiento contra el catálogo de §3a y
levante la señal. Es la vía más barata de todo el radar y la única que ya tiene
el dato en casa.

Los portales de compras corporativos (`proveedores.<dominio>`,
`supplier.<dominio>`) siguen siendo el siguiente paso, y siguen siendo trabajo de
n8n. Pero van **después**.

## Grupo 2 · Cámaras y clusters

CAINTRA, CLAUT, los clusters estatales (CLID en Durango, que es donde se
inauguró Coficab II). Dan tres cosas que la prensa no da:

1. **calendario de eventos** — quién va a estar dónde, que es el canal `evento`
   del motor 3;
2. **altas de socios nuevos** — una planta nueva se afilia antes de arrancar;
3. **directorios con jerarquía**, que ya son M3 en el motor 2.

Esto **no es fuente nueva**: M3 ya las consulta, y en #295 fue la vía que dio los
ingenieros con nombre y título en documento oficial. Lo nuevo es **mirarlas en
modo radar** — altas y calendario— y no solo en modo directorio.

## Grupo 3 · Tu terreno — y es el más valioso

Aquí no hay competencia, porque nadie más tiene el buzón de FTS.

### 3.1 · Frases de necesidad futura en Outlook

Buscar en el histórico de correo las frases con las que un cliente anuncia una
compra que todavía no existe:

```
"próximamente"        "vamos a requerir"      "estamos evaluando"
"en el presupuesto"   "para el próximo año"   "nos están pidiendo"
"estamos cotizando"   "cuando arranque"       "en cuanto se libere"
```

**Esto ya dio una señal medida, y es la mejor de las cuatro corridas de #300.**
El 31-jul-2026 un intermediario escribió en el hilo de una puesta en marcha:
«luego ocuparán uno de **200 TR**» — un segundo chiller, **siete veces** el de 30
TR que se arrancó en agosto. Esa frase no está en ninguna nota de prensa, no está
en ninguna vacante, y vale más que las dos juntas.

**El modo de falla, y hay que decirlo:** una frase de necesidad futura en un
hilo **no dice de qué planta es**, y en #300 exactamente eso dejó un contacto en
revisión humana. El radar tiene que emitir la señal **con su ambigüedad
declarada**, nunca resuelta a la fuerza.

### 3.2 · Identificación de visitante por IP corporativa en el sitio

Quién entra al sitio de FTS desde el rango de IP de una empresa. Es señal de
intención real, es **dato de la propia infraestructura de FTS**, y no requiere
comprar nada: basta el log del servidor más una resolución de IP a organización.

**Su límite, declarado:** identifica **la empresa, no la persona**, y con NAT y
VPN corporativa la tasa de acierto baja. Sirve para **subir el peso** de una
cuenta que ya está en el radar, no para crear un lead de la nada.

## DESCARTADO, y queda escrito

| Descartado | Por qué |
|---|---|
| **Interceptar correo ajeno** | Es intervención de comunicaciones privadas. Ilegal, y ninguna cuenta lo vale. No hay versión "suave" de esto |
| **Interceptar navegación ajena** | Igual. Un pixel, un script de terceros o un proveedor que "enriquece" visitantes con datos de navegación individual cae aquí |

Las dos van al catálogo de fuentes descartadas (`flujo/catalogo.py`), que ya
**rechaza con un raise** en vez de confiar en que alguien se acuerde. La
diferencia con la IP corporativa del sitio propio no es de grado: es que ahí el
visitante llegó **al servidor de FTS**, y lo que se lee es el log propio.

## Intent data de pago — enchufable después, no ahora

Bombora, G2 Buyer Intent, 6sense y los demás venden señal de intención
agregada. **Diseño: entran como una fuente más del grupo 1**, con su peso, su
`sin_acceso` cuando no hay contrato, y su entrada en `catalogo.PERMITIDAS`. **No
ahora**, y no por precio: porque el evaluador todavía no tiene el lazo de
aprendizaje calibrado, y sin eso no habría forma de saber si lo que se compró
sirve. Se compra **después** de tener 20 tarjetas cerradas con su resultado.

---

# 3c · El evaluador

Cada señal se puntúa. **Tres factores, y el tercero es el que evita el error que
`fuentes-de-senal.md` ya midió** — que una nota de prensa genérica pese lo mismo
que un correo del cliente.

## La fórmula

```
puntaje = match_catalogo(0-50) + frescura(0-25) + fuerza_de_fuente(0-25)
```

### Factor 1 · Match contra el catálogo de proyectos (0–50)

Esto es lo que hace que el radar sea **de FTS** y no un lector de noticias
industriales. El catálogo de §3a dice qué ha hecho FTS de verdad, con qué
industria y con qué proceso. El match se calcula en tres capas:

| Capa | Puntos | Qué compara |
|---|---|---|
| **Proceso** | 0–25 | El proceso del cliente que aparece en la señal contra los procesos que generaron proyectos reales. «funde cobre» → fundición → **está en el catálogo de chillers** |
| **Tipo de obra** | 0–15 | Lo que la señal dice que va a pasar contra los tipos de proyecto de FTS (chiller, agua helada, circuito cerrado, torre, intercambiador, subestación, integración) |
| **Capacidad** | 0–10 | Si la señal trae una magnitud (TR, m³/h, kW, MDD de inversión) y cae en el rango de los proyectos que FTS sí ha hecho |

**Y la capa de capacidad corta por arriba, no solo por abajo.** Una señal de
1,500 TR no es mejor que una de 200: es de otro tamaño de empresa y de otro
competidor. El catálogo dice cuál es el rango donde FTS gana.

### Factor 2 · Frescura (0–25)

| Antigüedad | Puntos | Por qué |
|---|---|---|
| ≤ 30 días | 25 | La decisión todavía no se tomó |
| 31–90 días | 18 | Se está cotizando |
| 91–180 días | 10 | Probablemente ya hay proveedor, pero la obra siguiente viene |
| 181–365 días | 4 | Contexto |
| > 365 días | 0 | No es señal, es historia |

**Una señal sin fecha NO vale cero: vale lo mínimo y se marca.** Poner cero
equivale a descartarla, y `fecha_de()` acaba de arreglarse justo porque no
reconocía fechas parciales (#302, B3): una señal de `2024-10` es vieja y hay que
saberlo, no desaparecerla.

### Factor 3 · Fuerza de la fuente (0–25)

Este es el factor que Esteban nombró explícitamente, y el orden importa:

| Fuente | Puntos | Por qué |
|---|---|---|
| **Correo propio** — frase de necesidad futura en el buzón de FTS | **25** | Es el cliente diciéndolo, a FTS, por escrito. Nada le gana |
| **Convocatoria pública de proveedores** | **23** | La empresa declara en público que va a comprar |
| **Licitación publicada** | 20 | Igual de declarativa, con calendario |
| **Vacante técnica activa** con puesto de fluidos o mantenimiento | 16 | Prueba que la planta opera **hoy** |
| **Boletín de cámara / alta de socio** | 12 | Movimiento verificable, con fuente institucional |
| **Nota de prensa industrial** | 8 | Puede ser corporativa y de otra planta. `fuentes-de-senal.md` lo midió: el capex de Sigma es España y EE. UU. |
| **Visita al sitio desde IP corporativa** | 6 | Intención real, pero identifica la empresa y no la persona |
| **Feed genérico** | 3 | 0 de 22 notas pegaron con el padrón |

## El umbral, y qué pasa con lo que no lo alcanza

```
>= 60   PASA -> detona el motor 2 con el ángulo sembrado
40-59   GUARDA -> vuelve a mirarse; dos señales de 45 en la misma cuenta suman
 < 40   ARCHIVA -> no se borra. Entra al padrón candidato
```

**Nada se descarta**, y no es generosidad: es la regla que
`fuentes-de-senal.md` ya fijó — una nota que no empata con el padrón es
**candidata a entrar en el siguiente corte del DENUE**, porque el corte es de
mayo y una planta de junio no existe ahí.

**La acumulación es la parte que no se puede omitir.** Una cuenta con tres
señales de 45 en dos meses vale más que una con una de 62. El evaluador suma por
**cuenta y ventana** (90 días), con tope, para que veinte notas de prensa no
sumen lo que un correo.

## Y el evaluador tiene que declarar su cuenta

Igual que todo lo demás en esta herramienta: **el puntaje se deriva y se
escribe**, nunca se declara. Cada señal que pasa lleva su desglose, y ese
desglose es el que viaja como `--angulo` al motor 2:

```json
{
  "puntaje": 71,
  "desglose": {"match_catalogo": 38, "frescura": 25, "fuerza_de_fuente": 8},
  "por_que": "proceso 'fundicion de cobre' pega con 3 proyectos de chiller del catalogo · nota de 16 dias · prensa industrial",
  "ambiguedad": "la nota no dice cual de las dos plantas de Durango",
  "fuente": "prensa_industrial",
  "liga": "https://...",
  "fecha_senal": "2025-12-08"
}
```

El campo `ambiguedad` **no es opcional**: es la lección de los cinco DUNS de
Ragasa y del hilo que no decía de qué planta era. Una señal ambigua que llega al
motor 2 sin declararlo hace que el motor 2 elija en silencio.

---

# 3d · La pregunta de validación

## ¿Habría encontrado a Coficab Durango?

**La señal, sí. El empate contra el padrón, NO — y ése es el hueco.**

El puntaje, calculado con la fórmula de arriba sobre lo que #300 documenta:

| Factor | Puntos | De dónde |
|---|---|---|
| Match catálogo · proceso | 25 | «el piso superior **funde cobre** (OFC)» → fundición, que es proceso de chiller en el catálogo |
| Match catálogo · tipo de obra | 12 | Nave nueva con carga de enfriamiento → agua helada / circuito cerrado |
| Match catálogo · capacidad | 6 | 60 MDD y 500 → 2,000 empleos: tamaño de planta donde FTS ha vendido |
| Frescura | 4 | Inauguración del 8–9 dic 2025, leída hoy: >280 días |
| Fuerza de fuente | 12 | Boletín del cluster (CLID) + prensa industrial |
| **Total** | **59** | **GUARDA, no PASA** |

Dos cosas salen de ahí, y las dos son hallazgos:

**1. Con la señal fresca habría pasado holgado.** En diciembre de 2025 la
frescura valía 25 y no 4: **80 puntos**. El radar la habría detonado la semana de
la inauguración. Que hoy dé 59 es correcto: **la obra ya arrancó**.

**2. El empate falla, y no por la señal.** Coficab **no está en el corte del
DENUE 2026-05** — #300 lo midió: bandera `NO_EN_PADRON_PERO_EN_ALCANCE`. El
empate por dominio (`coficab.com`) resuelve la identidad, pero el padrón no
tiene la planta. Con la regla actual, la nota cae en «candidata a entrar al
padrón» **y se queda ahí esperando un corte del DENUE que puede tardar meses**.

> **LO QUE FALTA, y es el arreglo que este ejercicio destapa:** una señal de
> puntaje alto cuya cuenta **no está en el padrón** tiene que poder **detonar el
> motor 2 igual**, con la bandera puesta. Hoy el padrón es la llave de entrada; y
> el padrón es un corte semestral, así que las plantas **nuevas** —que son las de
> obra nueva, las de presupuesto abierto, las que más valen— son sistemáticamente
> las que el radar no puede detonar. Es un sesgo contra el mejor prospecto que
> existe.
>
> Propuesta: el padrón deja de ser **requisito** y pasa a ser **un factor más**
> (+8 si empata, 0 si no, nunca negativo), y la falta de empate viaja como
> `ambiguedad: "no esta en el corte <fecha> del DENUE"`.

## ¿Y Budenheim? ¿Por qué señal?

**Por ninguna de las públicas, y ahí está el segundo hallazgo: Budenheim ya es
cliente de FTS.** Está en Odoo con órdenes de venta, tiene comisiones asignadas
por cuenta, aparece en el radar de PO con dominio y RFC, y tiene término de
crédito en discusión. No es un prospecto que descubrir: es una cuenta con
historia.

Eso quiere decir que **el radar tiene dos modos y hasta ahora solo se diseñó
uno**:

| Modo | Para quién | Fuente que manda | Qué pregunta responde |
|---|---|---|---|
| **Descubrimiento** | cuentas sin historia | públicas + cámaras | ¿quién nuevo se está moviendo? |
| **Expansión** | cuentas **con** historia en Odoo/Outlook | **el buzón y Odoo** | ¿qué va a necesitar el que ya me conoce? |

El modo **expansión** es el que aplica a Budenheim, y es más rentable por tres
razones medibles:

1. **La fuente pesa 25, la máxima.** Una frase de necesidad futura en el buzón es
   el cliente diciéndolo por escrito.
2. **El canal ya no es frío.** El motor 3 le pone `correo_directo` en el primer
   toque — y en el paquete del motor 2 eso ya está implementado: la raíz
   `fts_interno` en el correo del contacto es lo que lo decide.
3. **El histórico de Odoo dice qué comprar.** Si FTS ya le hizo un
   intercambiador, el catálogo de §3a dice qué suele venir después en ese proceso.

**Y el modo expansión tiene un disparador que el de descubrimiento no tiene: el
proyecto que se cierra.** Cuando una SO se entrega, el catálogo sabe qué sigue en
ese proceso y a los cuántos meses. Eso es una señal que FTS **genera**, no que
espera — y no depende de que nadie publique nada.

## Lo que falta, en una lista

1. **El padrón como factor, no como requisito** (arriba). Es el hueco que la
   validación de Coficab destapó, y sesga contra la obra nueva.
2. **El modo expansión**, que la pregunta de Budenheim destapó: el radar
   diseñado hasta aquí solo sabe descubrir.
3. **Las convocatorias de proveedores no tienen fuente medida.** Es la segunda
   más fuerte de la tabla y nadie ha probado si se puede leer. Hay que medirlo
   antes de darle 23 puntos.
4. **La acumulación por cuenta necesita ventana y tope** para que veinte notas de
   prensa no sumen lo que un correo. Está diseñada, no calibrada.
5. **El lazo de aprendizaje no puede calibrarse sin el motor 3.** Los pesos de
   arriba son un punto de partida razonado, **no medidos**. Hasta que 20 tarjetas
   cierren con su resultado, cualquier número de este documento es una hipótesis
   — y este documento la declara como tal.
