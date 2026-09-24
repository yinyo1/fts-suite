# Bitácora de la herramienta de prospección

**Copia del historial de decisiones.** Los originales son los issues de
`yinyo1/fts-mcp-odoo` y **siguen ahí, intactos**. Esto es una copia para que se
pueda leer todo desde `fts-suite` sin cambiar de repo.

> **Qué se copió y qué no.** Se copiaron los issues **#14 a #24**, que es el
> tramo que se pidió migrar. Los issues **#1 y #2 no son de prospección** —son
> del acceso BI y del conector de Odoo— y **no se tocaron**. Los issues **#3 a
> #13 sí son de prospección** y quedaron **fuera de esta copia**; al final hay
> una sección que los lista, porque el historial empieza antes del #14 y
> conviene que eso se vea en vez de suponerse.

---

## Mapa de issues: dónde leer cada cosa ahora

| Issue original | Qué resolvió | Dónde vive ahora en `fts-suite/prospector` |
|---|---|---|
| **#14** | El método documentado | [`metodo/busqueda-encadenada-contactos.md`](metodo/busqueda-encadenada-contactos.md) · [`metodo/fixtures/`](metodo/fixtures/) |
| **#15** | Auditoría de estado: qué está construido y qué es diseño | §#15 de esta bitácora |
| **#16** | §3 — el motor de combinaciones | §3.0–3.4 del método · Caso **C** |
| **#17** | §8 — los tres niveles · §10 — la gobernanza | §8 y §10 del método · Caso **D** |
| **#18** | §3.5 — PDFs públicos con su límite de privacidad | §3.5 del método · Caso **E** |
| **#19** | Módulos con contrato, orden óptimo, matriz de challenge | [`metodo/modulos-de-contactos.md`](metodo/modulos-de-contactos.md) · Caso **F** |
| **#20** | Veredicto de efectividad y rendimiento por módulo | §#20 de esta bitácora |
| **#21** | Inventario completo de fuentes | §3.6, §3.7 y §11 del método |
| **#22** | Flujo validado y empaquetado | [`flujo/`](flujo/) · [`SKILL-criterio.md`](SKILL-criterio.md) |
| **#23** | La herramienta construida | [`flujo/`](flujo/) · [`tests/`](tests/) · [`CHANGELOG.md`](CHANGELOG.md) |
| **#24** | La corrida real de Cuprum | §#24 de esta bitácora · `CHANGELOG.md` v0.2.0 |

**Las citas siguen resolviendo.** Cuando un documento dice *"ver #19"*, se busca
aquí por ese número. El original sigue en
`https://github.com/yinyo1/fts-mcp-odoo/issues/19`.

---

# #14 · La cascada de contactos, documentada

**18-sep-2026** · *Skill de búsqueda encadenada de contactos: documentada. No construida, nada tocado*

Nace el método: 327 líneas del procedimiento y 68 de casos de prueba.

**La decisión de diseño que ordenó todo lo demás:** el método **no contiene un
solo nombre propio**. Los casos concretos viven separados, en fixtures. El
porqué quedó escrito en el propio documento para que nadie lo "simplifique"
después juntándolos:

> Un método con nombres adentro se convierte en una lista y deja de ser un método.

**Lo que el documento fija:**

- **La cascada se agota por fases y la ficha se arma solo al final.** *Armar la
  ficha antes de agotar es, por definición, armarla incompleta: el dato que
  faltaba iba a aparecer en la fase que no se corrió.*
- **Ninguna configuración se salta.** Parecen redundantes por traslape de
  resultados, no porque cubran el mismo universo.
- **El diccionario de puestos no es teórico:** sale del campo `function` de los
  contactos ya cotizados más los títulos cosechados al buscarlos por nombre y
  empresa. Medido: eso **reduce homónimos pero no los elimina**.
- **La Fase 0 arranca por los contactos propios**, porque es reactivación y no
  prospección en frío. Medido: 59 contactos, clusters de ~16 y ~8, patrón de
  correo confirmado por datos duros. **Un movimiento de empresa vale doble**:
  puerta nueva donde llegó, hueco donde estaba.
- **Puerta ≠ decisor.** Mantenimiento, producción y almacén son puerta; el
  decisor CAPEX es proyectos, procurement e ingeniería. Por eso la ficha ordena
  por cercanía a la decisión, **no por jerarquía**.
- **El challenge cruzado es obligatorio antes de la ficha.**
- **Los huecos se declaran:** *"no localizado por fuentes abiertas, requiere
  Sales Navigator"*. Con el porqué: *un contacto de IT puesto donde debía ir el
  comprador no es media ficha, es una ficha que miente.*

**Límite de entorno medido y dicho sin suavizar:** el buscador desde datacenter
da resultados más genéricos que un humano logueado en la ciudad; la geografía en
el texto corrige **70-80%** y no iguala; `uule` por URL no funciona.

---

# #15 · Auditoría de estado

**18-sep-2026** · *Estado completo de la herramienta: qué está construido, qué es diseño, y qué falta*

Auditoría pura, sin tocar nada. **El resumen en una frase:**

> La herramienta es hoy, casi por completo, un conjunto de instrucciones que se
> ejecutan a mano. Muy bien pensada y muy poco construida: de las doce capas,
> **una** tiene código propio.

**El hallazgo que ordenó el resto:** `app/` **no contiene una sola línea de
prospección**. Es el servidor MCP de Odoo. De 503 pruebas del repo, **ninguna**
toca prospección. *(Ese hallazgo es el que sostiene la separación de repos que
se hizo después.)*

**Lo construido de verdad entonces:** `cargar_padron.py` (296 líneas), el padrón
de 238 filas con corte `2026-05` —143 firmes, 95 apartadas—, los catálogos de
fuentes y consultas de señal, cuatro workflows de n8n y `ritmo.py` con sus 20
pruebas. **Las migraciones 010–014: escritas, ninguna aplicada.**

**Tres problemas que este issue nombró por primera vez:**

1. **Los datos viven en tres lugares que no se hablan:** archivos, un esquema de
   Postgres que no existe todavía, y workflows de n8n. Nada los une.
2. **`autocomplete_by_name` no tiene camino por el MCP.** La allowlist del
   transporte está duplicada a propósito en dos módulos, y esa función no está
   en ella. El catálogo **declara una fuente que la arquitectura no puede
   servir**.
3. **La parametrización de industria y geografía no existe, y está cableada en
   contra**: la descripción de la skill dice *"de alimentos o bebidas de Nuevo
   León o Coahuila"*, y ese texto es lo que hace que se dispare.

**La lectura que cambió la prioridad del proyecto:**

> La cascada de contactos de #14 **no depende del PAT, ni de Redis, ni del
> Worker, ni de las migraciones.** Es la única capa grande que se podría
> construir con la infraestructura exactamente como está.

---

# #16 · El motor de combinaciones

**18-sep-2026** · *Sección 3 corregida: el diccionario no se busca palabra por palabra, se combina*

**Qué estaba mal:** el método decía *"para cada puesto del diccionario, cruzar
estas dimensiones"*. Eso se lee como tomar cada término suelto y variarle la
forma. **El diccionario no es una lista de queries: es un inventario de piezas.**

La §3 pasó de una tabla a cinco subsecciones. **La mitad del rendimiento está en
un detalle:** se combinan **raíces entre sí**, no solo raíz + nivel. Cadenas como
`operations facilities manager` o `capex project manager` no están escritas en
ningún lado del diccionario — solo salen de combinar dos raíces.

**El disparador medido:** la combinación de dos palabras —raíz + nivel— trajo al
gerente de facilities responsable de la compra. **La raíz suelta no lo trajo.**
Misma empresa, misma sesión, mismo buscador.

**Una contradicción real que salió al escribir:** la versión anterior decía
*"siempre añadir `-jobs -empleos -vacantes`"*. Con las vacantes ya dentro de la
matriz, esa regla se muerde la cola: **aplicada a todo, deja ciega a la capa que
cosecha títulos.** Resuelto por forma — la exclusión va en las que buscan
personas, no en la que busca vacantes.

**Caso C**, en fixtures. Tiene una propiedad especial: **se verifica sin tocar
ninguna fuente**. Y su criterio de falla es más exigente que "encontró al
gerente":

> Si el motor produce una sola de las variantes, no está combinando: está
> concatenando.

---

# #17 · Los tres niveles, y la gobernanza de la skill

**18-sep-2026** · *v1.2: la ficha entrega tres niveles, y la skill aprende a versionarse*

**El diagnóstico, más interesante que el síntoma:** el tope de ~5 contactos **no
venía de la búsqueda**. La cascada encontraba más; fallaba el **criterio de
inclusión** — solo subían nombre y apellido completos.

**Medido: 5 → 21 contactos** al soltarlo. Entre los descartados venían decisores
de obra.

**Los tres niveles:** confirmados · parciales · **puestos-objetivo sin persona**.
El nivel 3 no es relleno: un puesto identificado ya es accionable en Sales
Navigator. Meta **20+** en empresas grandes.

**Dos contradicciones que no se dejaron pasar:**

1. *"Cabe en una pantalla"* no convive con 21 contactos. Resuelto separando: la
   pantalla es para el **argumento**; la lista va completa debajo.
2. El filtro de valor parecía permiso para tirar por confianza. Quedó en dos
   ejes: **descartar por correctitud sí, por confianza no.**

**Y el orden, que era el sesgo entrando por la puerta de atrás:** la ficha ordena
por cercanía a la decisión técnica. Un puesto-objetivo que decide la obra va
**arriba** de un confirmado que no decide nada.

## La gobernanza (§10)

> Una corrección no entra sin **(a)** el disparador medido y **(b)** un caso de
> regresión que la verifique.

**Y el hallazgo de mirar las dos correcciones juntas:** son **la misma falla**.

| Versión | El error | La forma |
|---|---|---|
| v1.1 (§3) | el diccionario como palabras sueltas | **recortó el universo antes de mirarlo** |
| v1.2 (§8) | solo nombres completos | **recortó los hallazgos antes de entregarlos** |

Un criterio de calidad aplicado demasiado pronto. De ahí el corolario —**recortar
tarde, nunca temprano**— y una predicción escrita **para poder refutarse**:

> Si aparece un tercer error en esta skill, lo más probable es que sea de la
> misma familia.

---

# #18 · Los PDFs públicos, con su límite

**20-sep-2026** · *v1.3: PDFs públicos indexados, con su límite de recolección escrito al lado*

Fuente nueva, **idea de Montalvo, validada por él en un caso real**: el buscador
indexa PDFs, y ponencias, fichas técnicas y directorios de cámara traen datos de
contacto directos.

Entra como **un tipo de consulta más de la matriz de §3**, no como capa aparte —
así queda incluida en la cascada sin tocar la secuencia de fases.

**El límite de recolección se escribió en el mismo apartado que la fuente**, no
en un documento de políticas aparte, para que quien implemente lo lea en la misma
pantalla:

| Qué aparece | Qué hace la herramienta |
|---|---|
| Correo corporativo o teléfono de oficina en ficha, ponencia o directorio | **Recolecta.** Se publicó a propósito |
| CV suelto con celular personal, domicilio, RFC | **NO entra a la base.** Va a revisión humana |

> **Que sea alcanzable no lo vuelve recolectable.** Un correo en el directorio de
> una cámara es la empresa diciendo *"escríbanle aquí"*. Un celular en un CV es
> una persona buscando trabajo en 2019 que nunca pensó que su número acabaría en
> el CRM de un proveedor industrial.

**El PDF dentro de un post de LinkedIn queda fuera de alcance por diseño**, y con
la prohibición explícita de raspar LinkedIn autenticado: arriesga el baneo de la
cuenta de la que depende el remate de todas las fichas.

**Caso E** queda como **deuda declarada**: la fuente entró con su disparador pero
sin el caso concreto. Se escribió como hueco visible en vez de omitirse.

---

# #19 · Módulos con contrato, orden óptimo y matriz de challenge

**20-sep-2026** · *Auditoría y v1.4*

Auditoría del método antes de diseñar. **Ocho hallazgos, tres de fondo:**

1. **Dos espinas dorsales compitiendo.** §3 es "configuraciones" y §4 es "fases",
   pero vacantes y PDFs tienen entrada, salida y momento propios. **El lugar de
   un paso dependía de cuándo se agregó, no de qué es.**
2. **El bloque "Orden inviolable" estaba incompleto** — y es el más citado del
   documento. No mencionaba ni vacantes ni PDFs.
3. **Las dependencias existían solo como prosa.** Aristas de un grafo que nadie
   dibujó.

Y cinco más: dos escalas distintas llamadas "niveles", el challenge ilustrado con
un ejemplo en vez de definido, §6 sin los límites medidos, cero tasas de
rendimiento, y duplicación silenciosa con el orquestador.

**Nace `modulos-de-contactos.md`:** doce módulos con contrato —entrada, salida,
fuentes, criterio de agotado, rendimiento medido, a quién alimenta—, el diagrama
de dependencias, la matriz de challenge de nueve reglas y la tabla de rendimiento.

**Las dos reglas de orden que más consultas ahorran:**

- **El motor no corre antes que las vacantes y los congresos.** El desperdicio de
  correrlo pelado **es invisible**: las consultas genéricas devuelven resultados
  genéricos, no errores.
- **La historia de cuenta va antes que cualquier redacción.** Cuesta ocho
  consultas y evita el error más caro.

**Correcciones al método:** el orden reescrito por olas, §5 gana el nivel **EN
CONFLICTO** alineado con el orquestador, y §6 gana los límites de `filetype:pdf`
y `WebFetch`.

**Caso F**, completo y verificable sin tocar fuentes: el patrón de Cuprum
reportado al 100% desde una sola fuente. **No hubo mala elección: no había
casilla para "las fuentes chocan".**

---

# #20 · Veredicto de efectividad

**20-sep-2026** · *El denominador se puede estimar sin pagar una corrida de saturación*

**La corrección de fondo:** era cierto que nunca se declaró saturación, pero
**era falso que hiciera falta una corrida de saturación para estimar el
denominador.**

Al recontar las ocho cuentas apareció la curva:

| Cuenta | Consultas | Entradas | Por consulta |
|---|---|---|---|
| International | 4 | 15 | **3.75** |
| Amazon | 3 | 11 | **3.67** |
| LEGO | **16** | 32 | **2.00** |
| Ragasa | 12 | 22 | 1.83 |

**Las cuentas con menos consultas rindieron más por consulta.** Ninguna se
detuvo por seca: todas por presupuesto.

**La respuesta barata: instrumentar, no correr.** El estimador **Chao1** —de
biología de campo— estima lo no visto a partir de cuántos contactos aparecieron
una vez contra cuántos dos veces. **Cuesta cero consultas.** Lo único que faltaba
era registrar cuántas consultas distintas trajeron a cada contacto, **un dato que
se tiraba**.

**Las tres fugas:**

1. **El presupuesto se repartía por orden de llegada.** Las tres primeras cuentas
   se llevaron 40 de 64 consultas, y fueron las de *menor* rendimiento marginal.
   Repartir parejo daría ~**17% más entradas con el mismo gasto**. Cuesta cero.
2. **Ninguna cuenta se acercó a saturación.** Se recupera entre un tercio y la
   mitad de lo que las fuentes abiertas pueden dar.
3. **El sesgo de IP**: 20-30% invisible. Lo más barato de probar es el tier
   gratuito de SerpAPI.

**Y el hallazgo más incómodo:** la matriz de challenge **no habría atrapado el
error de Cuprum por sí sola** — una regla de contraste no se dispara con una
fuente. Lo que lo atrapa es el **criterio de agotado**, que es una compuerta, no
un cruce. De ahí el hueco: *nada impedía reportar un dato de un módulo que nunca
llegó a su criterio.*

**Siete de los ocho patrones de correo descansaban en un solo directorio.**
Cuprum no era especial: **era el único que se había revisado.**

---

# #21 · Inventario completo de fuentes

**21-sep-2026** · *Faltaban diez, una de ellas produjo las ocho señales calientes*

De 29 fuentes, **19 estaban y 10 faltaban**.

**El hueco grave:** la **prensa** no tenía contrato — y es el módulo que produjo
**las ocho señales calientes de las ocho cuentas**.

Y al escribirlo apareció lo que cambió su lugar en el flujo: **en tres de ocho
cuentas, el título que encuentra al comprador salió de la nota de prensa, no del
diccionario** — *jefe de calderas*, *tratamiento de superficie*, *superintendente
de pintura*. Ninguno está en §3.4. **La prensa alimenta al motor, igual que las
vacantes.**

También faltaban **DENUE como módulo** —entrega el `dominio_correo` que los
directorios necesitan— y tres clusters: **CLAUT, Supply Hub NL y Herramentales**.

**Y una divergencia entre dos documentos propios:** las listas de directorios no
coincidían. Faltaban cinco en uno y dos en el otro. *Exactamente la divergencia
silenciosa contra la que advertía el hallazgo 8 del #19.*

**Nace §11 · Fuentes descartadas:** trece entradas con su razón y si es
reversible, para que ninguna se reintente por olvido.

---

# #22 · El flujo validado y el empaquetado

**21-sep-2026** · *Python dueño de las compuertas, Claude dueño del criterio*

El flujo propuesto coincidía en estructura, con **cinco correcciones**. Dos de
colocación —la prensa y los congresos son vocabulario, van antes del motor— y una
que cambia comportamiento:

> **"Una sola fuente = en conflicto" es incorrecto.** Una sola fuente no está en
> conflicto con nada: **topa en SÓLIDO**. Si se marcara como conflicto, la mayor
> parte de cada ficha iría a revisión humana y el vendedor recibiría pendientes
> en vez de contactos.

**El empaquetado, con su argumento decisivo:** una skill es *instrucciones*, y hay
evidencia directa de este proyecto de que la prosa no obliga —la regla de no
reportar una fuente única como confirmada **estaba escrita** y aun así se reportó
el 100% de Cuprum; la regla de derivar correos del patrón **también**, y no se
aplicó en 58 filas.

> Dos veces la prosa no obligó a quien escribió el documento. No va a obligar a
> un operador con prisa.

**El reparto:** Python decide orden, presupuesto, agotado y confianza. Claude
decide entidad, valor, ángulo técnico y redacción. **El estado vive en un archivo
que Python posee.**

Y una corrección al supuesto de la máquina de Pablo: `WebFetch` sí se desbloquea,
pero **el sesgo de IP no se arregla** — la búsqueda sale por servidor, no por su
conexión.

---

# #23 · La herramienta construida

**23-sep-2026** · *Las compuertas ya no son prosa*

1,304 líneas de código y pruebas. Solo biblioteca estándar.

**La instrumentación de #20 quedó hecha:** cada campo guarda **todas** las
observaciones que lo sostienen, con su fuente y su raíz. Eso habilita el
challenge, desbloquea Chao1, y hace que el código sepa que **dos directorios son
la misma raíz y no confirman nada**.

**Tres bugs los encontraron las pruebas, no la revisión:**

1. `KeyError` en vez de compuerta con un módulo sin criterio de agotado.
2. **El challenge corría con módulos abiertos** — así se produce el falso
   consenso que el Caso F existe para impedir.
3. **El conflicto no llegaba a la ficha limpia.** Se detectaba, se guardaba en
   avisos y en procedencia, y **la ficha que lee Rissia no lo mostraba.**
   *Callar un conflicto es afirmar.*

---

# #24 · La corrida real de Cuprum

**24-sep-2026** · *Tres conflictos atrapados solos, dos defectos encontrados*

Corrida de punta a punta con búsquedas en vivo, Odoo y Outlook. **16 contactos,
3 conflictos atrapados solos, 6 de 60 consultas.**

**La compuerta frenó exactamente donde septiembre pasó de largo:**

```
⛔ COMPUERTA: [M1] NO agotado: MINIMO TRES directorios consultados
y contrastados. Lleva directorios=1, se exigen 3.
```

**Los tres conflictos, ninguno señalado a mano:** el patrón de correo (tres
directorios dan `first.last@cuprum.com`, SignalHire da `first_lastinitial`), el
puesto de Oscar Quintero (Odoo contra la web) y el CEO (la prensa lo nombra, el
directorio da iniciales).

**Fase 0 contra Odoo volvió a ser lo más rentable:** con una lectura salió
**Oscar Quintero Hdz — Portfolio Manager | Strategic CAPEX Lead**, cero órdenes
de venta. Y Outlook destapó un tercer punto de contacto: **una solicitud de cita
vía CAINTRA que quedó sin agendar** porque el comprador no tenía espacio.

**Dos defectos que las pruebas sintéticas no vieron:**

1. **La regla C1 no estaba implementada.** Tres directorios diciendo el mismo
   formato al **44%**, **45.45%** y **100%** pasaban como SÓLIDO. *El valor
   coincide, la certeza no.*
2. **Chao1 se declaraba confiable con `f2=1`**, donde el divisor vale 2 y la
   estimación entera la decide un solo contacto: 16 observados → 114 estimados.

## Y lo incómodo, que sigue abierto

> **La compuerta de agotado no verifica nada.** Cuenta lo que le declaran. Para
> cerrar un módulo que exige tres bolsas de trabajo, se incrementó el contador
> tres veces con registros vacíos y la compuerta quedó satisfecha.
>
> **Detiene el descuido, no la determinación.**

Más dos emparentados: **M5 lee un contador de bloques secos distinto** del que
`Presupuesto` ya lleva, y **el loop quedó sin disparador** al principio de una
corrida, porque depende de que Chao1 sea confiable y al principio nunca lo es.

---

# Antecedentes: los issues #3 a #13

**No están copiados aquí.** Son de prospección y quedaron fuera del tramo que se
pidió migrar. Se listan porque **el historial empieza antes del #14** y eso debe
verse, no suponerse.

| # | Fecha | Qué documenta |
|---|---|---|
| #3 | 17-sep | Auditoría previa y prototipo de la ficha; tres bloqueos antes del orquestador |
| #4 | 18-sep | Alternativas a Lusha, medidas, y diseño de la red de validación cruzada |
| #5 | 18-sep | Padrón de 143 plantas y Ragasa de punta a punta |
| #6 | 18-sep | Reconciliación 143 vs 120; cruce contra Odoo **por dominio**: son 18, no 31 |
| #7 | 18-sep | **El CRM no refleja la cartera real**: cuentas grandes sin correo, clientes que no existen en Odoo |
| #8 | 18-sep | 138 plantas operables, 11 consultas de señal, Ragasa revalidada |
| #9 | 18-sep | 132 operables, vigilante del DENUE, y la fase 2 bloqueada por el tope de 128 MiB |
| #10 | 18-sep | Fase 2, migraciones, enriquecimiento orgánico — **y el incidente del kiosk** |
| #11 | 18-sep | Auditoría de ritmo, horario y frenos; diseño de las salvaguardas |
| #12 | 18-sep | **Las cuatro salvaguardas construidas y verificadas** |
| #13 | 18-sep | **No es el Worker, es Redis**: causa raíz del Worker de n8n |

> **#10, #11, #12 y #13 mezclan prospección con infraestructura de n8n y del
> conector.** El ritmo contra Odoo y las guardas viven en `app/` y `scripts/` de
> `fts-mcp-odoo`, que es código del servidor MCP y **no se movió**. Si se quiere
> copiar ese tramo, conviene decidir antes qué parte es método y qué parte es
> infraestructura compartida.

**Fuera del proyecto de prospección, y no se tocaron:** **#1** (multi-token
read-only para BI) y **#2** (sonda de `autocomplete_by_name`, que es del conector
de Odoo).
