# Orquestador `/prospectar` — copia de referencia

> **Esta copia NO se activa como skill.** Se le quitó el frontmatter a propósito: es documentación para leer, no una skill registrada. La skill viva sigue en `fts-mcp-odoo/.claude/skills/prospectar/SKILL.md`.

# /prospectar

Arma la ficha de una planta. **Solo lectura.** No escribe a Odoo, no gasta
creditos de Lusha sin autorizacion explicita y no llama `enrich_by_duns`.

## Lo primero: el modo

Hay dos formas de entrar y **no dan el mismo resultado**.

### Modo lote

Recorre el padron en orden de tamano. Es el modo para cubrir las 120 plantas.
Entrega direccion, giro, tamano, dominio y patron de correo con buena tasa.
**Casi nunca entrega nombres de personas.**

```
/prospectar "Ragasa Industrias"
/prospectar --lote --desde 1 --hasta 20
```

### Modo senal

Lo dispara un evento detectado, no el turno en la lista. Se abre cuando hay
una nota de prensa, una inauguracion, una ampliacion, una certificacion, una
vacante publicada o un permiso ambiental.

**De donde salen los eventos.** El detalle medido esta en
[`metodo/fuentes-de-senal.md`](metodo/fuentes-de-senal.md). Lo que hay que saber aqui:

- Desde esta sesion **solo pasa `WebSearch`**. `WebFetch` esta bloqueado contra
  todas las fuentes, sin excepcion. Aqui se **descubre**, no se lee.
- n8n desde Railway si alcanza Vanguardia Industrial, Cluster Industrial,
  Somos Industria, Solili, Mexico Industry y Computrabajo. **No** alcanza el
  gobierno de Nuevo Leon, The Logistics World, OCC ni Plastics Technology
  Mexico: esos bloquean al cliente, no es configuracion.
- **La consulta dirigida le gana al feed.** Los dos RSS disponibles estan
  frescos, pero de 22 notas medidas, CERO eran de Nuevo Leon o Coahuila y CERO
  de alimentos. Una sola busqueda dirigida encontro una planta de carne de 500
  mdp en Escobedo. Suscribirse al feed y esperar es el mismo error que esperar
  las alertas de vacantes de LinkedIn: 6 en dos anios, una sola del padron.

```
/prospectar --senal "inauguracion PTAR" "Lacteos Valle Alto"
```

**Por que existe este modo.** Se midio en tres plantas: la web entrego nombres
en **1 de 3**, y la que los entrego fue la que habia inaugurado una planta de
tratamiento. No fue la mas grande. El tamano de la planta no predice si la web
habla de ella; **el evento si**. Recorrer el padron de mayor a menor gasta las
mejores horas en las plantas mas calladas.

Regla practica: **una senal detectada le gana el turno a cualquier planta de la
lista**, por grande que sea la de la lista. La ventana de un evento se cierra.

La senal queda guardada en `corrida.senal_disparo`. Una ficha que salio por
senal y una que salio por lote no se comparan como iguales: la primera tuvo una
fuente que la segunda no tuvo.

## El orden de las fuentes

No es una secuencia, es una red que se corrige sola. El diseno completo, con
quien refuta a quien, esta en [`metodo/red-de-validacion.md`](metodo/red-de-validacion.md). Leelo
antes de cambiar nada aqui.

Lo que no se negocia:

1. **El padron del DENUE manda en identidad y ubicacion.** Es el unico censo
   con cobertura completa. Es una **foto**: `corte_denue` no es opcional.
2. **Odoo y Outlook son la misma raiz** (`fts_interno`). Que los dos digan lo
   mismo **no** es confirmacion independiente.
3. **D&B via Odoo y una ficha de dnb.com tambien son la misma raiz.** Mismo
   caso.
4. **Un campo sube a `verificado` con dos fuentes de raiz distinta.** Con una
   sola queda `supuesto`.
5. **Contradiccion nunca se resuelve en silencio.** Se levanta bandera y se
   guardan los dos valores.
6. **Lusha es ultimo recurso.** No es costo-efectivo. Antes de gastar un
   credito hay que poder decir que hueco concreto llena y por que ninguna
   fuente gratuita lo llena. Sin autorizacion explicita, no se gasta. Y nunca
   se usa su filtro de industria: devuelve basura.
7. **Google Places no tiene llave y no la va a tener por ahora.** Se deja como
   hueco marcado `no_encontrado`. **No se simula ni se sustituye en silencio.**

## Las invitaciones de LinkedIn

Fuente de primera clase, gratuita y propia. Cada invitacion trae el nombre y,
en una parte del corpus, el puesto y la empresa de alguien que **ya quiso
conectar con FTS**.

Hay dos formatos y **no sirven para lo mismo**:

- *"X ha aceptado tu invitacion"* trae **nombre completo**, pero **no** trae
  puesto ni empresa.
- *"... esta esperando tu respuesta"* trae **puesto y empresa**, pero en el
  resumen solo el **nombre de pila**; el nombre completo hay que sacarlo del
  cuerpo.

Cruzarlos por persona es lo que completa nombre + puesto + empresa. Contar el
corpus como si los 914 trajeran las tres cosas seria inflar la cifra.

El empate **nunca** se hace por razon social, ni contra LinkedIn ni contra una
nota de prensa. Se hace por **dominio de correo**, por la misma razon que
invalido el cruce contra Odoo: la razon social del DENUE casi nunca es la marca.
`grupolala.com` es `COMERCIALIZADORA DE LACTEOS Y DERIVADOS`, `hersheys.com` es
`HERSMEX`, `gruma.com` es `MISSION FOODS MEXICO`. El padron trae dominio en 112
de sus 143 plantas, y ese diccionario de dominio a razon social es un activo del
proyecto, no un apanio.

El empate contra el padron se guarda en `prospeccion.contacto_linkedin` con su
grado de certeza. **Un empate ambiguo no se resuelve solo**: si la empresa
empata pero hay varias plantas, se marca `ambiguo`, se guardan los candidatos y
se levanta bandera. Un ambiguo igual vale, porque dice que la persona existe y
en que empresa.

## El campo que no se puede perder: puestos sin nombre

Cuando una fuente nombra un **puesto** sin decir quien lo ocupa, eso **es un
hallazgo**, no un hueco. El comunicado de Lala nombro *"Gerencia de Energia y
Fluidos"* sin decir quien la dirige. Para FTS ese puesto **es el comprador**, y
alimenta la busqueda en Sales Navigator aunque no haya persona.

Va en `prospeccion.puesto_sin_nombre`, es **campo de la ficha**, y se marca
`relevancia = alta` cuando el puesto manda sobre agua, vapor, energia, fluidos,
mantenimiento o servicios industriales.

## El correo deducido del patron

**Nunca sale marcado como verificado.** Da igual que la consistencia del patron
mida 97%: **8%** de las direcciones llevan sufijo numerico por homonimos y
**11%** de las empresas usan mas de un dominio. El patron da un **candidato**.

Esto no depende de que quien escriba la ficha se acuerde: la base lo impide con
`ck_patron_nunca_verificado`.

## Los dos modos de ficha

- **Limpio**: lo que Rissia manda a un vendedor. Sin PII salvo autorizacion
  explicita, sin ruido de procedencia. Los huecos se ven como huecos.
- **Procedencia**: cada campo con su fuente, su fecha de dato, su fecha de
  consulta y su estado.

El mismo dato tiene que verse igual en los dos. Si el limpio afirma algo que el
de procedencia marca `supuesto`, el limpio esta mintiendo.

## Cobertura: agotar lo disponible, no conformarse

**Cada corrida intenta TODAS las fuentes que apliquen.** El catalogo vive en
[`datos/fuentes.json`](datos/fuentes.json). El reporte final declara el estado de **cada una**:

| Estado | Que significa |
|---|---|
| `respondio` | Contesto. **Cero resultados ES una respuesta.** |
| `no_aplicaba` | No tenia nada que aportar por su naturaleza, no por estar caida. **Hay que decir por que.** |
| `fallo` | Se intento y no contesto. Va a la cola de reintento. |
| `omitida_por_costo` | Se decidio no gastar. **Exige decir quien decidio.** |
| `sin_acceso` | No hay credencial hoy. Hueco declarado, **nunca simulado**. |

**Nada queda sin consultar en silencio.** Confundir `fallo` con "sin resultados"
es como se pierde una planta: la ficha sale diciendo que no hay nada cuando lo
que paso es que nadie pregunto bien. Una fuente caida **se marca y se reintenta**,
no se ignora.

La base lo obliga: `ck_razon_obligatoria` exige el por que en `no_aplicaba`,
`omitida_por_costo` y `sin_acceso`; `ck_gasto_autorizado` prohibe un gasto sin
nombre de quien lo autorizo.

### Siempre se intentan

Padron DENUE · Odoo lectura de negocio · Odoo `autocomplete_by_name` para razon
social canonica **y DUNS** · Outlook por historia de la cuenta · Outlook por el
corpus de invitaciones de LinkedIn · busqueda web por proyecto · busqueda web
por angulo tecnico · **lectura de articulos via n8n en Vanguardia Industrial,
Somos Industria, Solili, Cluster Industrial y Mexico Industry** · derivacion del
patron de correo.

Las cinco fuentes de articulos se nombran una por una a proposito. "Lectura de
articulos" en abstracto se cumple leyendo una y declarando la casilla, que es
justo lo que esta regla existe para impedir: **cada sitio es su propia fila del
reporte**, con su propio `respondio` o `fallo`.

### Bajo condicion explicita, declarada en el reporte

- **Vibe, capa gratuita** — solo como **segunda opinion**, nunca como fuente
  unica. Registro a **LEGO como casa de bolsa de Hong Kong**: una fuente que se
  equivoca asi no sostiene un campo sola.
- **Lusha** — solo con **autorizacion por corrida**. Quedan **20 creditos** de
  los **480** que costaria el padron completo. Gastar sin plan quema el 4% del
  recurso en una sola ficha.

### Sin acceso hoy: hueco declarado, jamas simulado

Google Places (no hay llave y no la habra por ahora) · D&B directo (sin
contrato) · SIEM · CAINTRA · AMPIP.

## El DUNS baja de jerarquia

**No es llave de empate.** Sirve como **identificador estable entre cortes** del
padron, y nada mas.

- Sin contrato de D&B **no abre** el arbol corporativo ni los contactos.
- Puede apuntar a **una oficina en vez de la planta** — paso con SuKarne.
- **Ragasa tiene 5 DUNS**, uno de ellos en Jalisco.

**La llave operativa es `dominio_correo` + ciudad + codigo postal.**

## Al cerrar cada corrida

Reportar siempre, aunque salga feo:

- cuantos campos quedaron `verificado`, `supuesto`, `no_encontrado` y
  `contradicho`;
- que fuentes respondieron y cuales no;
- **cuantos creditos de Lusha se gastaron y quien los autorizo** (si el campo
  `autorizo_creditos` esta vacio y el gasto no es cero, eso es un error, no un
  detalle);
- las banderas levantadas, con los dos valores en conflicto.

## El ritmo contra Odoo, y el freno

**Techo: 4 peticiones por cada 10 segundos.** Un tercio del umbral donde Odoo
corto con 429 -12 en 10 s, el 18-sep-2026, mientras Felipe capturaba nomina-.

Vive en `app/transport.py::XmlRpcTransport.execute`, que es el **unico punto de
salida a la red**. Ninguna ruta lo puede saltar: ni las tools, ni los scripts de
`scripts/`. Se configura con `ODOO_CUBETA_CAPACIDAD` y `ODOO_CUBETA_RECARGA_S`.

- **Una ficha de una planta no lo siente**: 4 RPC salen en 0.000 s. Medido.
- **Un lote de 132 plantas tarda ~21 minutos.** Ese es el precio y esta aceptado.

**Ante un 429, la herramienta PARA.** No reintenta. Abre el freno: durante 120 s
-o lo que diga `Retry-After`- **ninguna llamada sale**, y cada intento devuelve
`RateLimitError` al instante. El 429 se registra con hora en el canario de
`metrics`. Un 429 nunca se reintenta, ni una vez.

**Ante un timeout de 60 s de n8n, tampoco se repite la llamada.** Se verifica
estado con las tres consultas de Railway -`get-service-metrics` de memoria,
`get-logs` de deploy y de http- y con eso se decide. Repetir la llamada sobre
una instancia saturada es lo que la hunde mas.

## Antes de correr nada pesado en n8n: leer esto

**n8n es infraestructura COMPARTIDA de produccion.** Ahi corren el kiosk de
checkin de todos los empleados, Carga MO y el panel de incidencias.

El 18-sep-2026 la fase 2 del padron **tumbo el kiosk 2.5 h en hora pico**. El
relato completo, con las mediciones, esta en
`fts-mcp-odoo/docs/n8n/incidente-kiosk-2026-09-18.md` *(se queda allá: es un incidente de la infraestructura de n8n, no del método)*. Lo que no se negocia:

1. **Ningun barrido pesado entre las 7 y las 18 horas de Monterrey.** Aunque lo
   pidan. En ese horario la gente esta checando y capturando nomina.
   **Ya no depende de que me acuerde**: los workflows pesados llevan un nodo
   `Guarda - ventana de produccion` que LANZA en vez de ramificar, y los diez
   scripts de `scripts/` que tocan Odoo salen con codigo 2. Verificado en vivo.
   Lo liviano -una planta, sin descargas del DENUE, <=10 RPC- corre a cualquier
   hora.
2. **Vigilar la memoria del servicio `Primary` en cada corrida y parar en 4 GB.**
   La base sana es ~1 GB y el techo son 8. De 4 al techo fueron 3 h, y la curva
   **se acelera al final**.
3. **Una subcorrida por entidad, nunca 33 vueltas en una ejecucion.** n8n retiene
   la salida de cada nodo en cada vuelta mientras la ejecucion viva.
4. **Avisar antes** de bajar mas de 10 MB a n8n.

**La superficie MCP de n8n NO tiene "cancelar ejecucion".** Si hay que frenar una
corrida, el unico camino medido es archivar la subcorrida que el ciclo invoca:
la siguiente vuelta se queda sin destino y el trabajo para. Funciono -memoria de
3.40 a 1.94 GB-, pero es un truco. Saberlo de antemano vale minutos de caida.

## Limites medidos

- **Hay DOS techos y no son el mismo.** El de los 128 MiB es del *runner*
  y se rodea reduciendo antes. El de los **8 GB es del proceso principal de
  n8n** y NO se rodea reduciendo: se rodea partiendo la ejecucion. Arreglar el
  primero y no medir el segundo es lo que tumbo el kiosk.
- **El runner de n8n mata cualquier tarea de Code a los 300 s.** No es
  negociable desde el flujo. Lo que se controla es cuanto trabajo entra en una
  tarea.
- **Traer un binario al runner cuesta**: 8.6 s para 118 MB. Parsearlo, 271 ms.
  Si una tarea tarda minutos, el culpable casi nunca es el parseo.
- **El padron se recorre por entidad, no nacional.** El CSV nacional de 31-33
  pesa 345 MB descomprimido y el nodo Compression truena con `invalid zip data`
  en ese tamano. Uno de 118 MB pasa bien.
- **Hay un tope al TRASLADO al runner, distinto del de los 300 s.**
  `getBinaryDataBuffer` trae el archivo entero a la memoria del runner: Coahuila
  (70 MB) llega en 4.9 s, Nuevo Leon (118 MB) en 8.6 s, **Chiapas (137 MB) no
  llega nunca** — ni siquiera contando bytes sin parsear. `getBinaryStream`
  aparece en la lista de helpers pero el Code node lo rechaza: *"is not supported
  in the Code Node"*.
  **La salida no fue subir el tope, fue no pasar el archivo por el runner.**
  `Compression`, `Extract from File`, `Filter` y `Summarize` corren en el proceso
  principal, que si aguanta los 137 MB. El Code node recibe unos miles de grupos
  ya sumados. Chiapas, la entidad que nunca volvia, cerro en **171 s**.
- **El DENUE viene en Latin-1 en este corte, y eso rompe empates en silencio.**
  Leerlo como UTF-8 dejo `RASTRO EMPACADORA TREVINO` sin empatar **ni en su
  propio estado**: 86 de 87 claves pegaban y esa una fallaba sin un solo error.
  Se lee en `latin1` —transporte sin perdida— y el Code node repara a UTF-8 si
  hace falta. **Un filtro por texto acentuado contra el DENUE es una trampa;**
  por eso el filtro de giro va por `codigo_act`, que es ASCII.
- **INEGI contesta 200 con HTML de 1428 bytes cuando el archivo no existe**, no
  404. Un nombre de archivo equivocado revienta dos nodos mas abajo.
- **La ruta del DENUE con fecha NO existe.** Se probaron siete formas. Solo hay
  una ruta estable que se reemplaza en su lugar; el cambio se detecta por
  `ETag` y `Last-Modified`.
- **Odoo contesta 429** a partir de unas **12 peticiones en 10 segundos** desde
  una IP. El recorrido de las plantas va a paso, no en rafaga.
- `autocomplete_by_name` **si responde** fuera del navegador, pero su segundo
  argumento es un **id de pais** (156 para Mexico), no una bandera de
  "mundial", y **no devuelve RFC**.


