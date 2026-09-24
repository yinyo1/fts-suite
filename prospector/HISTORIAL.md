# Bitácora de la herramienta de prospección

**Copia del historial de decisiones.** Los originales son los issues de
`yinyo1/fts-mcp-odoo` y **siguen ahí, intactos**. Esto es una copia para que se
pueda leer todo desde `fts-suite` sin cambiar de repo.

> **Qué se copió y qué no.** Están copiados los issues **#3 a #9** y **#14 a
> #24**. Los issues **#10 a #13** quedan solo listados al final: mezclan
> prospección con infraestructura de n8n y del conector de Odoo, y esa parte
> **no se mueve**. Los issues **#1 y #2 no son de prospección** —son del acceso
> BI y del conector— y **no se tocaron**.
>
> **Todos los originales siguen abiertos y sin editar en `fts-mcp-odoo`.**

---

## Mapa de issues: dónde leer cada cosa ahora

| Issue original | Qué resolvió | Dónde vive ahora en `fts-suite/prospector` |
|---|---|---|
| **#3** | Auditoría previa, prototipo de la ficha, tres bloqueos | §#3 de esta bitácora |
| **#4** | Alternativas a Lusha medidas · **la red de validación y `origen_raiz`** | §#4 · [`metodo/red-de-validacion.md`](metodo/red-de-validacion.md) |
| **#5** | Padrón de 143, los tres ajustes estructurales, Ragasa e2e | §#5 · [`metodo/fixtures/`](metodo/fixtures/) |
| **#6** | Reconciliación 143 vs 120 · **el cruce por dominio: son 18, no 31** | §#6 · [`metodo/fuentes-de-senal.md`](metodo/fuentes-de-senal.md) |
| **#7** | **El CRM no refleja la cartera real** — por qué salen pocos correos | §#7 de esta bitácora |
| **#8** | 138 operables, 11 consultas de señal, Ragasa revalidada | §#8 · [`datos/consultas_senal.json`](datos/consultas_senal.json) |
| **#9** | 132 operables, vigilante del DENUE, **los cinco estados de cobertura** | §#9 · [`metodo/denue-vigilante.md`](metodo/denue-vigilante.md) |
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

# #3 · Auditoría previa y el prototipo de la ficha

**17-sep-2026** · *`/prospectar` — auditoría previa y prototipo de la ficha. Tres bloqueos que hay que resolver antes del orquestador*

Arranca el proyecto. **No se escribió el orquestador a propósito**: el orden
pedido era prototipo de ficha primero, y la auditoría encontró tres bloqueos que
cambiaban el alcance.

## Los tres bloqueos

| # | Bloqueo |
|---|---|
| 1 | **El padrón del DENUE no estaba en ningún sistema alcanzable.** Ni en `fts-mcp-odoo`, ni en `fts-suite`, ni en las tablas de n8n, ni en Postgres. Las 120 plantas filtradas vivían fuera. |
| 2 | **Google Places no existe en este entorno.** Ni MCP ni llave. Existencia, teléfono y coordenadas no se pueden verificar. |
| 3 | **Lusha: plan free, 20 créditos de 40.** `revealPhone` cuesta **5 créditos por teléfono**. |

## Qué existía de prospección en `fts-suite`: nada, y nunca se intentó

Buscados `prospect`, `denue`, `lusha`, `places`, `scian`, `padron`,
`sales navigator`, `enriquec` sobre 21 MB, 157 documentos y 13 módulos:

- **24 coincidencias de «prospecto»**, y las 24 son el nombre de una etapa del
  `crm.lead` de Odoo. Vocabulario de pipeline, no herramienta.
- `scian`, `denue`, `lusha`, `google places`, `sales navigator`: **cero**.

**Pero no desde el vacío:** dos precedentes reutilizables. `po/radar-detectar`
(lee el buzón por Graph, extrae cliente/RFC/monto/dominio, puntúa confianza y
bifurca por precisión ≥90) y `comercial/clientes` (catálogo de `res.partner`
filtrado por `customer_rank >= 1`).

## Las dos mediciones que cambiaron el diseño

**`autocomplete_by_name("Ragasa Industrias", 156)` devolvió CINCO DUNS con la
misma razón social:**

| DUNS | Ciudad | Estado |
|---|---|---|
| **810001115** | **Guadalupe** | **Nuevo León** |
| 814468195 · 816213409 · 814306833 | Monterrey (64920) | Nuevo León |
| 816388748 | **El Salto** | **Jalisco** |

Cuatro razones sociales idénticas, una sin la coma. **El nombre no desempata:
solo la ciudad lo hace.** El de Jalisco habría pasado un filtro por nombre sin
chistar. La regla de validación cruzada quedó demostrada con el propio caso de
prueba, antes de escribir una línea de orquestador.

**Odoo contestó HTTP 429 `Rate limit exceeded` a la cuarta llamada de la
ráfaga** — nginx de Odoo, no créditos IAP. ~12 peticiones en 10 s desde una IP.
Para 120 plantas eso no es un detalle: el lote necesita paso medido y reintento
con espera, no un bucle.

## Almacenamiento: Postgres, y el repo es público

Recomendado esquema nuevo `prospeccion` en el Postgres de Railway, por índices
reales, histórico con llave foránea y disciplina de migraciones ya probada
—incluida la trampa documentada de **nunca usar `$$` para citar el cuerpo de una
función**, porque el runner lo colapsa a un solo `$`—.

> **Advertencia que cuenta: `fts-suite` es público.** La migración no puede
> llevar contraseñas, y **la ficha con correos y teléfonos no puede terminar
> ahí.** Los datos van a la base; el repo solo lleva el esquema.

Y **nunca leer el CSV de 344 MB en una corrida**: se ingesta una vez y se
consulta por índice, con copia SQLite local para funcionar aunque n8n o Postgres
estén caídos.

## La sonda `a5p6gVKT5i5lsyeJ` no sirve tal cual

Dos rutas funcionan (`A1` por `/jsonrpc`, 4 de 4; `A2` por `/json/2/...`, 3 de 4
con el rate limit en la cuarta). **Pero: el nombre a buscar vive en un nodo
`Set`, así que para consultar otra empresa hay que editar el workflow**, y no es
sub-workflow. Inaceptable para una herramienta que corre por planta.

---

# #4 · Alternativas a Lusha, medidas, y la red de validación

**18-sep-2026** · *Auditoría de alternativas a Lusha (medida) y diseño de la red de validación cruzada*

Sin código a propósito. **Cero créditos gastados: el saldo siguió en 20.**

## El hallazgo que no se buscaba

Buscando «Ragasa» en la bandeja aparecieron correos de LinkedIn con esta forma:

> *«… [Apellido-X] — **Técnico Electromecánico en Ragasa**»*

Son invitaciones de LinkedIn que llegan a Outlook y traen **nombre + puesto +
empresa en el cuerpo**. Medidas: **914**.

Es lo que vende Lusha, ya está en la casa, es gratis y es buscable por Graph.
**Servicios ya pagados por FTS resultaron ser las dos mejores fuentes:**
Microsoft 365 y Odoo — y ninguno de los dos se estaba usando para prospección.

## Lo que cuesta cada alternativa por 120 plantas

| Escenario Lusha | Créditos | Con los 20 que quedan |
|---|---|---|
| Solo búsqueda anclada por dominio | 120 | 20 plantas = 17% |
| Búsqueda + 3 correos revelados | **480** | 5 plantas = **4%** |
| Lo anterior + 1 teléfono | 1,080 | 2 plantas = 1.7% |

| Fuente propia | Costo | Cobertura medida |
|---|---|---|
| Odoo `res.partner` | **0** | 442 contactos con correo, 78 dominios |
| Outlook | **0** | Historia completa + 914 correos con nombre y puesto |
| Patrón de correo | **0** | 110 de 120 plantas traen correo en el DENUE = **91.7%** |
| Búsqueda web | **0** | 1 de cada 3 plantas da nombres operativos |

> **Lusha cuesta 480 créditos para hacer lo que las fuentes propias hacen gratis
> en el 91.7% del padrón.**

## ¿Se puede derivar el patrón de correo sin proveedor? Sí — 97%

Medido sobre los 253 correos válidos de Odoo. **225 de 253 aprovechables (89%)**;
el resto es ruido identificable: 14 correos de FTS dados de alta como contacto
del cliente, 11 buzones genéricos, 4 dominios libres, 2 `example.com`, 1 sin
arroba.

| Dominio | n | Patrón dominante | Cobertura |
|---|---|---|---|
| mdlz.com | 89 | `nombre.apellido` | 99% |
| ecolab.com | 13 | `nombre.apellido` | 100% |
| oxxo.com | 10 | `nombre.apellido` | 100% |
| clarios.com | 7 | `nombre.apellido` | 86% |
| bfusa.com | 5 | `apellidonombre` | 100% |
| missionfoods.com | 5 | `inicial+apellido` | 100% |
| cbre.com | 3 | `nombre.apellido` | 67% |

**13 de 14 dominios (93%) tienen un patrón que explica el 80% o más. Cobertura
promedio 97%.**

**Pero el patrón da un candidato, nunca una dirección verificada**, por dos
razones medidas:

- **8% de las direcciones llevan sufijo numérico** por homónimos
  (`jesus.moreno2`, `luis.reyes2`, `ruben.martinez2`).
- **11% de las empresas usan más de un dominio.** Mission Foods usa
  `missionfoods.com`, `gruma.com` **y** `aztecamilling.com`, con patrones
  distintos entre ellos.

## Hasta dónde llega la búsqueda web: 1 de 3

| Planta | Nombres con puesto | Fuente |
|---|---|---|
| Ragasa Industrias | **1** (key principal) | Directorio D&B. **Cero nombres operativos** |
| Grupo Lala | **3** con puesto | Comunicado de la ampliación de su PTAR |
| Molinos Azteca | **0** | Solo directorio y vacantes |

> **La web entrega nombres cuando hubo evento de prensa, no cuando la planta es
> grande.** Lala salió porque inauguró una tratadora de 110 mdp.

Y un bono: ese comunicado nombró las **gerencias presentes** —Proyectos,
Sustentabilidad, **Energía y Fluidos**, RH—. Un comunicado sin nombres sigue
sirviendo para saber **qué puesto existe**. Las vacantes aparecieron en las tres
búsquedas y **nunca traen nombres**.

## La tarjeta de LinkedIn: no automatizable

Es función de interfaz; los datos no salen por Graph. Confirmado del otro lado:
`search_people` sobre «ecolab» devolvió buzones genéricos con **`jobTitle:
null`**. El acceso programático exige el LinkedIn Partner Program desde 2015.

## La red de validación cruzada, y la trampa de la independencia

No es una secuencia: es una red donde cada fuente puede **desmentir** a otra.
Las seis relaciones de desmentido, cada una con caso medido:

1. **El correo desmiente al CRM.** Cotizaciones **SO11134** (12-sep-2025,
   suavización) y **SO11126** (09-oct-2025, filtros) con contraparte
   `@ecolab.com` y proveedor `NALCO`. Y el remate: **las dos personas de Ecolab
   de esos hilos ya estaban en `res.partner` bajo «Nalco de Mexico»**. El dato
   estaba en la casa, partido en dos sistemas que nadie cruzaba.
2. **El domicilio desmiente al nombre.** Los 5 DUNS de Ragasa.
3. **El estrato desmiente al tamaño del grupo.** Estrato 0–5 es oficina.
4. **La noticia desmiente a la foto.** El padrón es un corte con fecha.
5. **La dirección real desmiente al patrón.**
6. **Sin dominio confirmado no se gasta un crédito.**

> **La trampa de la independencia.** D&B vía Odoo y una ficha de dnb.com **no
> son dos fuentes: son la misma.** Y una que incomoda: **Odoo y Outlook
> comparten raíz** —las dos son FTS—. Que coincidan no son dos confirmaciones
> independientes.

De aquí sale `origen_raiz` y el rechazo del ascenso a verificado cuando dos
testigos comparten raíz. **Es el ancestro directo de `RAICES` y `n_raices` en
`flujo/confianza.py`.**

## Las cinco condiciones conjuntivas para gastar un crédito

1. Es planta, no oficina. 2. El dominio está verificado, no derivado. 3. Las
fuentes gratis ya corrieron y dejaron el hueco. 4. Hay ángulo técnico
verificado. 5. Autorización explícita de esa corrida, con el saldo a la vista.

Topes duros: `revealPhone` apagado por omisión, máximo 1 crédito por planta, y
por debajo de 5 de saldo la opción deja de ofrecerse.

## Las dos fechas

> `fecha_dato` —cuándo fue cierto— y `fecha_consulta` —cuándo lo miramos— son
> distintas y las dos importan. El DENUE consultado hoy sigue siendo una foto de
> mayo. Sin las dos no se puede contestar meses después por qué la herramienta
> dijo lo que dijo.

## El bloqueo que se reportó en vez de rodear

**INEGI está bloqueado por la política de egress:** `CONNECT` a
`www.inegi.org.mx` devuelve 403. El README del proxy dice no rodearlo, así que no
se rodeó — se reportó.

---

# #5 · Almacenamiento, orquestador, y Ragasa de punta a punta

**18-sep-2026** · *Padrón de 143 plantas, los tres ajustes en la estructura, y Ragasa de punta a punta*

Los tres ajustes entraron **en la estructura y no en la costumbre**:

- **Puestos detectados sin nombre → tabla propia** (`puesto_sin_nombre`), con
  `relevancia` y la regla escrita en el comentario de la columna: **alta cuando
  el puesto manda sobre agua, vapor, energía o fluidos**. El caso de Lala
  —«Gerencia de Energía y Fluidos», sin persona— entra como fila.
- **El correo del patrón nunca sale verificado, y no depende de que alguien se
  acuerde:**

```sql
ALTER TABLE prospeccion.ficha_campo
  ADD CONSTRAINT ck_patron_nunca_verificado CHECK (
    NOT (estado = 'verificado' AND fuentes::text LIKE '%"D6_patron_correo"%')
  );
```

- **Dos modos de disparo**, `'lote' | 'senal'`, con `senal_disparo` para guardar
  qué evento abrió la corrida. **Una señal detectada le gana el turno a
  cualquier planta de la lista, por grande que sea.**

## El padrón: son 143, no 120 — y se reportó sin ajustar el filtro

De 9,440 unidades 311/312 en los dos estados: 7,609 excluidas por clase, 1,590
por tamaño, **143 firmes** (110 NL + 33 Coahuila), 95 apartadas como
`pendiente_rescate`, 116 empresas distintas, 112 con correo del DENUE.

> **La reconstrucción dio 143 y la cifra previa era 120. Se reportó tal cual y
> no se ajustó el filtro para que cuadrara.**

Las 95 `pendiente_rescate` **no se resolvieron, y es deliberado**: la regla pide
sitios **nacionales** y en esa fase solo existían dos estados. Llamar «nacional»
a un conteo de dos estados sería mentir con un número que parece medido.

## El hallazgo que cambia el empate

**La razón social del DENUE casi nunca es la marca:**

| Razón social en el DENUE | Es en realidad |
|---|---|
| `COMERCIALIZADORA DE LACTEOS Y DERIVADOS` | Grupo Lala |
| `HERSMEX` | Hershey |
| `GOLLEK INTERAMERICAS` | Kellanova |
| `BEBIDAS MUNDIALES` | Coca-Cola FEMSA |

Lo que traduce una cosa en la otra es el **dominio del correo**, y lo tienen 112
de 143. **Empatar por nombre contra LinkedIn sin pasar por el dominio habría
fallado callado justo en los grupos grandes.**

## Los 914 correos de LinkedIn: hay dos formatos y no sirven para lo mismo

- *«X ha aceptado tu invitación»* → **nombre completo**, sin puesto ni empresa.
- *«…está esperando tu respuesta»* → **puesto y empresa**, pero solo el **nombre
  de pila**.

Contar los 914 como si todos trajeran las tres cosas sería inflar la cifra. El
corpus llega hasta **2021**: los puestos cargan edad real, y eso es `fecha_dato`.

Medido sobre 14 marcas (29 de las 143 plantas): **16 con persona y puesto
utilizable**, 4 con planta ambigua, 9 sin persona confirmada, y **114 plantas de
marcas no probadas — no medidas, no se extrapola**.

Dos advertencias honestas: **presencia de empresa ≠ contacto de planta** (Del
Monte con un LatAm General Manager, Arca con un ingeniero en Tlalpan: empresa
correcta, planta equivocada), y **Grupo Lala no tiene ni una persona en el
corpus**.

> **Mala noticia para el modo señal:** las alertas de vacantes en la bandeja son
> **6 en dos años**, y solo **una** es del padrón. Ese feed no alcanza para
> disparar el modo señal.

## Ragasa de punta a punta, y tres cosas que la ficha se negó a poner bonitas

| Fuente | Qué entregó |
|---|---|
| DENUE | id 9394133 · SCIAN 311222 · 251+ personas · Guadalupe · CP 67120 · `ragasa.com.mx` |
| Odoo | **0 filas** → prospecto, no cliente |
| Outlook | SO11134 (Ecolab, suavización) y SO11126 (Nalco, agua de desperdicio) |
| LinkedIn | «Técnico Electromecánico en Ragasa» |
| Google Places | sin llave → `no_encontrado`, marcado, no sustituido |
| Lusha | **no se llamó** |

- **El DUNS sale `contradicho`, no elegido.**
- **El «ing. [N.]» del hilo de Ecolab sale con bandera**, porque el hilo no
  deja claro si es de Ragasa, de Ecolab o de FTS. No se le asigna patrón de
  correo a un nombre cuyo patrón no se sabe.
- **Que Ragasa no esté en Odoo es un dato `verificado`, no un hueco.** Una
  ausencia comprobada es información.

> El botón de modo no esconde ruido: cambia lo que la ficha **afirma**. Si el
> limpio afirmara algo que el de procedencia marca `supuesto`, el limpio estaría
> mintiendo.

## Dos autocorrecciones

**«El zip nacional está corrupto» era falso.** Directorio central leído byte a
byte: EOCD intacto, firmas correctas, 57,607,659 bytes coincidiendo con
`Content-Length`. Lo que no aguanta es el descompresor de n8n con un miembro de
**345 MB**; uno de **118 MB** pasa.

**«Un Code node no deja pasar binarios» también era falso.** Desconectada la
guarda, el error siguió idéntico. Corregido en la bitácora **porque iba a mandar
a la próxima persona por el camino equivocado**.

## Lo que sí mataba las corridas

Dos corridas de 33 entidades murieron a los 300 s y se culpó al parseo.
**Medido: traer el buffer de 118 MB cuesta 8.6 s y parsearlo 271 ms.** El costo
real era la **carga acumulada** que el runner serializa en cada vuelta.

Dos trampas más: **INEGI contesta 200 con HTML de 1428 bytes cuando el archivo
no existe, no 404** —el error aparece dos nodos abajo como
`Unsupported archive format ".html"`—, y el Code node corre en
`JsTaskRunnerSandbox`: sin `require`, sin `DecompressionStream`, sin
`ReadableStream`.

## El bug que atrapó la prueba local antes de gastar una corrida

Al quitar la puntuación, `S.A.P.I.` deja `S A P I`. Sin cortar la cola jurídica,
«RAGASA INDUSTRIAS S.A.P.I. DE C.V.» y «RAGASA INDUSTRIAS, S.A. DE C.V.» se
contaban como **dos empresas distintas**, y el conteo nacional de la regla de
multiplanta habría salido mal **sin un solo error visible**.

---

# #6 · Reconciliación 143 vs 120, y el cruce por dominio: son 18, no 31

**18-sep-2026** · *Reconciliación 143 vs 120, cruce contra Odoo por dominio (son 18, no 31), y fuentes de señal medidas*

## Dónde divergen los dos conteos: no es el filtro, es la unidad

| Cómo se cuenta lo mismo | Total | NL | Coah |
|---|---|---|---|
| Padrón, **establecimientos** | 143 | 110 | 33 |
| El mismo padrón, **empresa × estado** | **121** | **93** | 28 |
| Corrida previa | 120 | **93** | 27 |

**Nuevo León cuadra exacto en 93.** Los 120 no eran 120 plantas: eran **120
pares empresa-estado**. Los 22 de diferencia son grupos con varias plantas.

**Descartado antes de llegar ahí:** `3121` vs `312` completo **no cambia ni una
planta**, y exigir `raz_social` no vacía habría dado **63, no 120**.

> **Lo que queda sin explicar, y no se maquilló: Coahuila, 28 contra 27.** Una
> empresa de diferencia que no explica ninguna regla. La base tiene 9,440
> unidades 311/312 contra 9,329 — 111 filas más, consistente con otro corte,
> imposible de verificar.

**Y una autocorrección sobre la propia disciplina del proyecto:** el padrón
estaba etiquetado `2026-09`, que es **cuando se consultó**, no la fecha del dato.
El corte real es **DENUE 05/2026, `Modified: 2026-05-20`**, leído del
`metadatos_denue.txt` del propio zip. *Exactamente la confusión
`fecha_dato`/`fecha_consulta` que el esquema de procedencia existe para impedir,
cometida en el propio cargador.*

## El defecto real del 143

**Once de los 143 son Helados Sultana**, y los nombres los delatan:

```
HELADOS SULTANA WALMART CHAPULTEPEC    Monterrey        311520  estrato 101
HELADOS SULTANA HEB PUERTA DE HIERRO   Monterrey        311513  estrato 101
HELADOS SULTANA SORIANA SAN PEDRO      San Pedro        311520  estrato 251
```

Son **mostradores de helado dentro de tiendas**, clasificados en 311520 y con
**el estrato del corporativo, no el del local**. SCIAN y estrato se ven como
planta. **La firma que sí los delata es que comparten el mismo estrato exacto.**

| Corte | Plantas |
|---|---|
| 143 tal cual | 143 |
| Sin los que traen nombre de cadena | 137 |
| Sin todo Helados Sultana | **132** |

## El cruce contra Odoo: son 18, no 31

Los 91 dominios corporativos del padrón contra `res.partner` (fuera `gmail.com`
y `hotmail.com`). **Solo 6 dominios de 91 existen en Odoo → 11 plantas.**

| Dominio | Plantas | Cuenta | `customer_rank` |
|---|---|---|---|
| `gruma.com` | 3 | GRUMA / Mission Foods | 17 |
| `grupobimbo.com` | 3 | Grupo Bimbo | 2 |
| `mdlz.com` | 2 | MONDELEZ MEXICO | **1211** |
| `gepp.com` | 1 | BEBIDAS PURIFICADAS | 40 |
| `bat.com` | 1 | British American Tobacco | 120 |
| `trouwnutrition.com` | 1 | Trouw Nutrition | 1 |

**El punto ciego del método, medido:** 191 de los 561 contactos con correo en
Odoo usan `@fts.mx` o correo libre — **34 de ellos son registros de empresa**.
Ésos no pueden empatar por dominio nunca.

| | Plantas |
|---|---|
| Ya es cuenta **con movimiento** (`customer_rank > 0`) | **12** |
| Existe el registro pero nunca se le vendió | **6** |
| **Total con algún registro** | **18** |
| **Nuevas, sin registro alguno** | **125** |

> **Los 31 de 120 no son reproducibles por ningún método.** Ni por dominio (11),
> ni sumando lo encontrado por nombre (18).

## Fuentes de señal: el reparto, y el hallazgo que invierte la prioridad

> **Claude Code descubre. n8n recorre y lee.** No es preferencia de diseño: es
> lo único que permite la política de egress.

`WebSearch` funciona. **`WebFetch` a cualquier fuente está bloqueado, sin
excepción** — probadas seis, las seis `EGRESS_BLOCKED`. Desde aquí no se puede
leer un artículo. Pero sí buscar: una sola consulta dirigida devolvió una nota
del 3-sep-2026 sobre una **procesadora de carne en Escobedo con 500 mdp**.

Desde n8n en Railway: Vanguardia Industrial y Cluster Industrial dan **RSS**;
Somos Industria, Solili, México Industry y Computrabajo dan 200 sin RSS;
Gobierno de NL, The Logistics World y OCC dan **403**; Plastics Technology, 405.

**El hallazgo que cambia la prioridad:** los dos RSS están vivos y frescos, pero
de las **22 notas** que traían entre los dos: **cero de Nuevo León o Coahuila,
cero de alimentos o bebidas.** Las que pegaban con palabras de disparo eran de
Aguascalientes, SLP, Volvo, BYD.

> **Un feed genérico de industria tiene señal-ruido pésima para este padrón.**
> Suscribirse y esperar es el mismo error que esperar las alertas de LinkedIn.

Así que el orden correcto es **el inverso al intuitivo**: primero consulta
dirigida por empresa del padrón y término de evento; el feed solo como red de
arrastre secundaria, filtrando por municipio y por las 116 razones sociales
**antes** de mirar nada.

**El empate, en tres pasos y nunca por razón social:** por dominio si la nota
enlaza al sitio → por marca contra razón social con el diccionario que salió del
padrón (`grupolala.com` → `COMERCIALIZADORA DE LACTEOS Y DERIVADOS`) → por
municipio, y varias plantas ahí significa **ambiguo, y se marca ambiguo**.

Una nota que no empata **no se descarta**: se guarda como candidata al siguiente
corte.

---

# #7 · El CRM no refleja la cartera real

**18-sep-2026** · *Cuentas grandes sin correo y clientes conocidos que no existen en Odoo*

> **Esto no es un problema de la herramienta de prospección.** Salió de ella,
> pero es un hallazgo de negocio y **se arregla en Odoo, no en el código**.

Medido el 18-sep-2026 cruzando las 143 plantas del padrón contra `res.partner`.

**Es el issue que explica por qué las corridas dan pocos correos**, y por eso se
copia completo.

## 1 · Cuentas grandes existen, pero con el correo vacío

| Cuenta | `customer_rank` | Plantas suyas en el padrón |
|---|---|---|
| HEINEKEN Mexico | 2 | 1 |
| Arca Continental | 0 | 2 |
| PepsiCo de México | 0 | 2 |
| Mars | 0 | 2 |

Un registro de empresa sin correo **no se puede cruzar contra ninguna fuente
externa por dominio**, que es el único empate confiable. **Son invisibles para
cualquier automatización.**

## 2 · Clientes conocidos que no existen en absoluto

`name ilike` devuelve **0 filas** para:

| Empresa | Plantas en el padrón |
|---|---|
| Sigma Alimentos | 5 |
| Grupo Lala | 4 |
| Qualtia Alimentos | 2 |

**Once plantas de tres grupos grandes de alimentos en Nuevo León y Coahuila, y
el CRM no tiene ni el registro.**

## 3 · Un tercio de los contactos con correo no lleva el correo del cliente

| | |
|---|---|
| Contactos con correo en `res.partner` | 561 |
| Con `@fts.mx` o correo libre (gmail/hotmail/outlook) | **191 — el 34%** |
| Registros marcados como empresa dentro de ese grupo | **34** |

Hay registros de empresa cuyo correo es el de un empleado de FTS. Ejemplos
reales: una cuenta con `[empleado-fts]@fts.mx`, otra con `[otro-empleado-fts]@fts.mx`,
varias con `[buzon-fts]@outlook.com`.

## 4 · El reparto es extremadamente desigual

De los 91 dominios corporativos del padrón, **solo 6 existen en Odoo**:

| Cuenta | `customer_rank` | Contactos cargados |
|---|---|---|
| MONDELEZ MEXICO | **1211** | 91 |
| British American Tobacco | 120 | 6 |
| BEBIDAS PURIFICADAS (GEPP) | 40 | 4 |
| GRUMA / Mission Foods | 17 | — |
| Bimbo | 2 | 3 |
| Trouw Nutrition | 1 | 3 |

> Mondelez tiene 91 contactos y rank 1211. Arca Continental tiene un registro
> vacío. **Llamarles a las dos «cliente» en el mismo reporte no informa nada.**

## El número que importa

De las 143 plantas del padrón:

| | Plantas |
|---|---|
| Ya es cuenta **con movimiento** (`customer_rank > 0`) | **12** |
| Existe el registro pero **nunca se le vendió** | **6** |
| **Sin registro alguno en Odoo** | **125** |

## Por qué importa más allá de esta herramienta

1. **Cualquier reporte de cobertura de cartera que salga de Odoo hoy está mal.**
   Si Sigma, Lala y Qualtia no existen, no aparecen en ningún tablero, ninguna
   segmentación y ninguna meta.
2. **El expediente comercial está fuera del CRM.** FTS cotizó tratamiento de
   agua en Ragasa dos veces —SO11134 con Ecolab, SO11126 con Nalco— y Odoo no
   tiene ni la cuenta. El expediente vivía en Outlook. **Ragasa no es la
   excepción: es el patrón.**
3. **Sin correo del cliente, el CRM no se puede enriquecer automáticamente.** Ni
   con esta herramienta ni con ninguna otra. **El dominio es la llave; sin llave
   no hay cruce.**

## Lo que se propuso, para que alguien lo decida

1. **Cargar las tres ausentes** —Sigma, Lala, Qualtia— aunque sea con el
   registro mínimo.
2. **Ponerle correo corporativo a las cuatro que lo tienen vacío**: Heineken,
   Arca, PepsiCo, Mars.
3. **Revisar los 34 registros de empresa** cuyo correo es de FTS o correo libre.
   *El correo de un empleado de FTS en el campo de correo del cliente no es un
   dato del cliente.*
4. **Definir qué significa «cliente»** para los reportes: `customer_rank > 0`, o
   tener registro. Hoy los dos criterios dan 12 contra 18 y **ninguno está
   escrito**.

> **Ninguna de las cuatro la puede hacer esta herramienta, y ninguna se hizo: no
> se escribió nada a Odoo.**

---

# #8 · Las tres decisiones aplicadas: 138 operables y 11 consultas de señal

**18-sep-2026** · *Las tres decisiones aplicadas: 138 plantas operables, 11 consultas de señal, y Ragasa revalidada*

## 1 · Unidad: el establecimiento

Los dos sospechosos descartados quedaron **escritos en la bitácora para que
nadie los vuelva a investigar**: `3121` contra `312` no cambia ni una planta, y
exigir `raz_social` no vacía habría dado 63. **La diferencia de una empresa en
Coahuila quedó anotada como diferencia conocida, sin maquillar.**

Corte fijado **leyéndolo, no suponiéndolo**: `MEX-INEGI.EEC2.05-DENUE-2026`,
`Modified: 2026-05-20`.

## 2 · Exclusión de puntos de venta

Regla ampliada a autoservicio, club de precio, tienda departamental y plaza.
**Comparación por token completo, no por subcadena, para que `HEB` no pegue
dentro de `SCHEBER`.**

| | |
|---|---|
| Padrón firme | 143 |
| Marcados como punto de venta | **5** |
| **Plantas operables** | **138** — 105 NL, 33 Coahuila |

**Ningún falso positivo:** revisadas las 238 filas, la regla solo toca Helados
Sultana. **No se borran:** quedan con `es_punto_venta = si` y la razón legible
en `excluido_por`, y hay una vista `planta_operable` que es lo que recorre el
modo lote.

Va en **migración 011 y no editando la 010**: desde aquí no hay forma de saber
si la 010 ya se aplicó, y adivinar es justo lo que el `db/README.md` prohíbe.

**Lo que la regla NO atrapa, y no se aplicó:** 6 hermanas de Helados Sultana
nombradas por colonia. La señal que las delataría es otra —misma razón social,
10 sitios, estrato idéntico, colonias residenciales— y **quedó propuesta, no
aplicada**. Si se aprueba, el padrón baja a 132.

## 3 · Modo señal por consulta dirigida

**4 familias, 11 plantillas**, versionadas en `consultas_senal.json` para que se
auditen. F1 geografía+sector (semanal, descubrir plantas que el padrón no
tiene) · F2 empresa+evento (mensual, vigilar las que ya están) · F3 agua y
energía · F4 obra nueva, la señal más temprana.

**Los tres riesgos, medidos corriendo las consultas — no imaginados:**

1. **F1 sin la palabra del sector devuelve automotriz.** Geografía + evento sin
   sector trajo GEMMSA, Sigrama, Infinitum Electric y Adient. **Cero de
   alimentos.**
2. **F2 devuelve eventos corporativos de OTRAS plantas.** El capex 2026 de Sigma
   es España y Estados Unidos. La inversión grande de Heineken es una cervecería
   en **Yucatán**, no Monterrey.
3. **F3 genérica devuelve competencia.** Trajo AQUA Systems, Carbotecnia, Grupo
   Rivend e iAgua — proveedores de tratamiento de agua. El JSON trae
   `dominios_proveedor` que se descartan antes de mirar nada, **y Ecolab y Nalco
   están en esa lista**.

## La regla que sale de esos tres

> **Un evento solo cuenta si el artículo nombra un municipio de Nuevo León o
> Coahuila.**

Va en la **extracción**, no en la consulta, porque la consulta no lo puede
garantizar. Es la diferencia entre «Lala invierte» —ruido— y «Lala estrena línea
en el Complejo Industrial Laguna» —que sí pega con sus 4 plantas en Coahuila—.

## 4 · Ragasa revalidada: tres correcciones en la ficha

- **El corte ya no dice 2026-09.** Dice 05/2026 con su `Modified`.
- **El cruce contra Odoo ahora se sostiene en dos vías:** el nombre da 0 filas
  **y** el dominio `ragasa.com.mx` no aparece en ningún `res.partner`. **El
  empate por nombre solo no bastaría.**
- **El dominio dice para qué sirve:** es la llave del cruce contra Odoo y contra
  LinkedIn, y el padrón lo trae en 112 de las 138.

---

# #9 · 132 operables, vigilante del DENUE, y la fase 2 bloqueada

**18-sep-2026** · *132 plantas operables, vigilante del DENUE, cobertura de fuentes — y la fase 2 bloqueada por un tope de 128 MiB*

## 1 · La regla de cadena, generalizada como patrón

Un grupo es cadena de puntos de venta cuando cumple **las cuatro**: 5+ sitios en
la misma zona metropolitana · estrato idéntico en todos · ningún nombre con
marca de planta · menos de la mitad en asentamiento industrial.

**Por qué las cuatro y no menos:** evaluados los diez grupos de 3+ sitios, **cada
grupo multiplanta real falla al menos una**.

| Grupo | Sitios | Por qué NO es cadena |
|---|---|---|
| **Helados Sultana** | 10 | *no falla ninguna* → **cadena** |
| Lala (Torreón) | 4 | Los cuatro son `PLANTA TORREON ...`, 100% en Ciudad Industrial |
| Mondelez | 4 | Estratos distintos, `PLANTA ...` en los nombres |
| Bebidas Mundiales | 5 | Estratos distintos, 3 zonas metropolitanas |
| Qualtia | 6 | **Cuatro** estratos distintos |
| Bimbo | 3 | Solo el umbral de sitios |

> **Bimbo es el caso al filo y quedó dicho en el código:** pasa las otras tres
> condiciones y solo lo salva el umbral. **Quien suba o baje ese número mueve a
> Bimbo.**

| | |
|---|---|
| Puntos de venta marcados | **11** — 5 por nombre, 6 por patrón |
| **Plantas operables** | **132** — 100 NL, 32 Coahuila |
| Empresas distintas · con dominio | 114 · 112 |

## 2 · Fase 2: bloqueada, y por qué no se forzó

Tres corridas murieron **en la misma vuelta, la 6**. Cuatro hipótesis
descartadas en orden:

| Hipótesis | Cómo se descartó |
|---|---|
| La carga acumulada | Salida reducida a 87 números por entidad. **Murió igual.** |
| El patrón de búsqueda | Encontrado y corregido un bug real (`"311` pegaba con `id` al inicio de línea). **Murió igual.** |
| Que la entidad 07 la arrastraran las anteriores | Corrida **sola**. **Murió igual.** |
| El parseo | Quitado **todo** el parseo, solo contar bytes con `buf.indexOf`. **Murió igual.** |

> Esa última cierra el caso: **si contar bytes sin construir una sola cadena
> tampoco vuelve, el problema no está en el código.**

| Entidad | CSV descomprimido | Resultado |
|---|---|---|
| Coahuila (05) | 70,094,168 | llega en **4.9 s** |
| Nuevo León (19) | 118,122,557 | llega en **8.6 s** |
| **Chiapas (07)** | **137,200,944** | **nunca vuelve** |

El límite cae entre 118 MB y 137 MB. **128 MiB = 134,217,728 queda justo en
medio.** No está probado que sea exactamente ése; lo que sí está medido es que
existe y dónde cae. **Once entidades** tienen zip de más de 20 MB y
probablemente pasan el tope.

> **Un conteo parcial no sirve.** La regla pide sitios **nacionales**; resolverla
> con 21 de 32 entidades sería inventar un número que parece medido. **Las 95
> filas apartadas siguen apartadas.**

Tres salidas, **ninguna aplicada**: subir el tope del runner en Railway (es
tocar infraestructura de producción y **lo decide Esteban**) · no pasar el CSV
por el Code node · otra fuente para el conteo nacional.

## 3 · Vigilante del DENUE

**Corrección a la premisa: la ruta con fecha no existe.** Probadas siete formas;
**las siete fechadas devuelven una página HTML de 1428 bytes.** INEGI sirve una
ruta **estable** que reemplaza en su lugar. **Un corte nuevo no se detecta por
URL.**

Lo que sí sirve: la ruta estable expone `Last-Modified` y `ETag`, y un `GET` con
`Range: bytes=0-15` trae los dos por 16 bytes. Esa fecha **coincide** con el
corte de los metadatos — **pero coincidir no es ser lo mismo**: una es del
servidor de archivos y otra del dato. El vigilante usa las cabeceras solo para
saber **si** cambió; la fecha del corte la lee de `metadatos_denue.txt`.

**El veredicto nunca miente por omisión:**

| Veredicto | Cuándo |
|---|---|
| `sin_cambio` | Las tres firmas coinciden. **Único caso en que calla.** |
| `HAY_CORTE_NUEVO` | Alguna cambió |
| `primera_vez` | No hay firma previa |
| `no_se_pudo_comparar` | Nada respondió, o la base no es legible |

> `no_se_pudo_comparar` **no** es `sin_cambio`. **Un vigilante que calla cuando
> no sabe es peor que no tenerlo.**

**No sobrescribir rompía el modelo.** La 010 puso `id` como llave primaria:
funciona con un corte y colisiona con dos. La 012 separa **`planta`** —la
identidad, a la que cuelgan corridas y contactos, vive entre cortes— de
**`denue_planta`** —la foto, una fila por `(id, corte)`—. Una baja tampoco
borra: `vigente` pasa a `false` y la historia sigue valiendo.

## 4 · Cobertura de fuentes: el booleano no alcanzaba

| Estado | Qué significa |
|---|---|
| `respondio` | Contestó. **Cero resultados ES una respuesta.** |
| `no_aplicaba` | Nada que aportar por su naturaleza. **Exige el por qué.** |
| `fallo` | Se intentó y no contestó. **Va a la cola de reintento.** |
| `omitida_por_costo` | **Exige quién decidió.** |
| `sin_acceso` | Hueco declarado, **nunca simulado**. |

> **Confundir `fallo` con «sin resultados» es como se pierde una planta:** la
> ficha diría que no hay nada cuando lo que pasó es que nadie preguntó bien.

**Son los cinco estados que hoy viven en `flujo/estado.py`** como `RESPONDIO`,
`NO_APLICABA`, `FALLO`, `OMITIDA_COSTO` y `SIN_ACCESO`, con la misma exigencia
de razón escrita.

Catálogo completo en `datos/fuentes.json`: **9 siempre**, **2 bajo condición**
(Vibe solo como segunda opinión —registró a LEGO como casa de bolsa de Hong
Kong—; Lusha solo con autorización), **5 sin acceso** (Google Places, D&B
directo, SIEM, CAINTRA, AMPIP).

## El DUNS baja de jerarquía

> **No es llave de empate.** Sirve como identificador estable entre cortes, y
> nada más: sin contrato de D&B no abre árbol corporativo ni contactos, puede
> apuntar a una oficina en vez de la planta —pasó con SuKarne— y Ragasa tiene 5,
> uno en Jalisco.
>
> **La llave operativa es `dominio_correo` + ciudad + código postal.**

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
puesto de [Persona C] (Odoo contra la web) y el CEO (la prensa lo nombra, el
directorio da iniciales).

**Fase 0 contra Odoo volvió a ser lo más rentable:** con una lectura salió
**[Persona C] — Portfolio Manager | Strategic CAPEX Lead**, cero órdenes
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

> **CERRADOS el 24-sep-2026** en la v0.3.0 de la herramienta, y de raíz: el
> contador de agotado ya no se puede declarar —se deriva del registro de
> búsquedas ejecutadas—, M5 lee los bloques reales del `Presupuesto`, y Chao1
> emite un veredicto de cuatro valores del que **solo `saturo` detiene el lazo**.
> Ver `CHANGELOG.md` v0.3.0 y el issue de `fts-suite` enlazado a #281.

---

# Lo que queda solo listado: los issues #10 a #13

**No están copiados.** Son de prospección, pero **cada uno mezcla el método con
infraestructura de n8n y del conector de Odoo**, y esa parte no se movió de
`fts-mcp-odoo`. Se listan porque existen y porque las citas tienen que resolver.

| # | Fecha | Qué documenta | Qué parte es infraestructura |
|---|---|---|---|
| #10 | 18-sep | Fase 2, migraciones 010–013, enriquecimiento orgánico, regresión de Ragasa | **El incidente del kiosk de n8n** |
| #11 | 18-sep | Auditoría de ritmo, horario y frenos; diseño de las salvaguardas | El ritmo contra Odoo vive en `app/` y `scripts/` |
| #12 | 18-sep | Las cuatro salvaguardas construidas y verificadas | Las guardas son `scripts/*_guarda.py` del conector |
| #13 | 18-sep | **No es el Worker, es Redis**: causa raíz del Worker de n8n | Todo el issue |

> Si alguna vez se quiere copiar ese tramo, hay que separar antes qué parte es
> método y qué parte es infraestructura compartida. **Mientras no se separe, se
> leen en el original.**

**Fuera del proyecto de prospección, y no se tocaron:** **#1** (multi-token
read-only para BI) y **#2** (sonda de `autocomplete_by_name`, que es del conector
de Odoo).
