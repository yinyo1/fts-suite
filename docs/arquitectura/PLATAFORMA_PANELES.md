# Plataforma de paneles — arquitectura

Respuesta a la decisión pedida el 2026-09-12, antes del Bloque 2 del semáforo.
Enlazado a #226. **No se construyó nada de producción en esta sesión**: no se tocó
ningún workflow, no se escribió en Odoo, no se creó ninguna carpeta de módulo.

El encargo cambia el alcance: el semáforo deja de ser un módulo suelto y pasa a ser
**el primer panel de una plataforma**. El segundo ya está definido —rentabilidad por
proyecto— y son deliberadamente distintos: uno mide **proceso** (la unidad es el
tiempo), el otro mide **dinero** (la unidad es la acumulación contra un presupuesto).
La prueba de que lo común está bien hecho es que le sirva a los dos. Si sólo le sirve
al semáforo, está mal hecho.

**Rentabilidad no se diseña aquí.** Aparece únicamente como caso de contraste.

---

## PASO 1 · Qué hay hoy (lo que existe, no lo que debería existir)

### 1.1 Cómo se sirve el frontend

Estático puro sobre GitHub Pages, desde `main` de este mismo repo.

```
$ ls -a            → sin 404.html, sin CNAME, sin .nojekyll
$ ls .github/workflows/  → no existe
```

No hay paso de construcción, no hay reescritura tipo SPA y no hay CI de despliegue:
**desplegar = hacer push a `main`**. La ruta de una pantalla es su ruta en el disco.

**28 archivos `index.html`**, uno por carpeta de módulo o submódulo. La navegación es
de dos niveles y está escrita a mano en los dos:

- `index.html` (lanzador, 471 líneas) — **11 tarjetas con el `href` en el HTML**.
- `operaciones/index.html` — 5 tarjetas más un enlace `← Suite` de regreso, también a mano.

**Respuesta a la duda planteada:** sí aguanta varias rutas de panel sin rehacer el
despliegue, y no hace falta inventar nada — *una carpeta es una dirección*.
`operaciones/semaforo/` ya sería una URL propia y estable el día que exista. Lo que
**no** aguanta es que un panel aparezca en dos lugares del menú sin duplicar la
pantalla: hoy eso se resolvería copiando la tarjeta, que es exactamente lo que hay que
evitar. Un panel = una carpeta = una dirección; los dos lugares del menú son **dos
enlaces al mismo sitio**, no dos páginas.

### 1.2 Navegación: hay un registro, y filtra por el login equivocado

Corrijo aquí un punto de mi propia auditoría anterior (`docs/watchdogs/VIVO-AUDITORIA.md`
§2.3, donde escribí que «no hay manifiesto de módulos»). **Sí lo hay:**

`shared/modules-registry.js` (105 líneas) declara 8 módulos con sus submódulos, y el
lanzador lo consume (`index.html` L366-383). Lo que hace con él **no** es pintar las
tarjetas —esas siguen a mano— sino **atenuarlas**:

```js
const tieneAcceso = modulos && modulos[mod.id] && modulos[mod.id].acceso === true;
if(!tieneAcceso){ card.style.opacity='0.4'; card.style.pointerEvents='none'; … '🔒 Sin acceso' }
```

Dos cosas de esto importan para la decisión:

1. **Ese `modulos` viene de `FTSAuth`**, el login viejo (`shared/auth-suite.js`,
   SHA-256 sin sal contra un JSON del repo público), **no de los `scopes` del JWT**.
   O sea: ya existe un mecanismo de permiso por módulo en el lanzador, y está
   cableado al emisor de identidad que estamos abandonando.
2. **El registro ya reserva los dos paneles del caso:** bajo Finanzas están
   `rent-emp` y `rent-proy`. La plataforma no inventa el segundo panel; lo encuentra
   apuntado desde antes.

### 1.3 Sesión y permisos: tres logins vivos, y uno solo sirve

| archivo | objeto | llave | cómo verifica | estado |
|---|---|---|---|---|
| `shared/auth-suite.js` (286) | `FTSAuth` | `fts_session` | SHA-256 **sin sal**, en el navegador, contra un JSON público | vivo en RH y en el lanzador |
| `finanzas/js/auth-fin.js` | `FinAuth` | `fts_fin_session` | `auth/finanzas-login`, PBKDF2 + JWT | vivo en Finanzas |
| `shared/auth-jwt.js` (168) | `SuiteAuth` | `fts_suite_session` | `auth/suite-login`, PBKDF2-SHA256 100k + JWT HS256, usuarios en la Data Table `suite_usuarios` | **el bueno** |

`SuiteAuth` ya trae exactamente lo que la plataforma necesita, y no hay que construirlo:

```js
tieneScope('comercial:read')            // ¿la sesión carga este permiso?
requerir(scope, urlLogin)               // gate: si no, manda al login y deja marca
destino(porDefecto)                     // a dónde volver después de entrar
```

Y del lado del servidor, `docs/n8n-workflows/fase0/jwt-verify.js` (96 líneas) verifica
firma y permiso en un solo lugar:

```js
verifyJWT(token, secret, scopeRequerido)
  → { ok:true,  actor, scopes, exp }
  → { ok:false, error: TOKEN_AUSENTE | TOKEN_MALFORMADO | FIRMA_INVALIDA
                     | PAYLOAD_ILEGIBLE | TOKEN_EXPIRADO | SCOPE_INSUFICIENTE }
```

**¿Aguanta el patrón un scope por panel?** Sí, y sin cambiar una línea: `verifyJWT`
recibe **un** scope requerido, `suite_usuarios` tiene una columna `scopes` separada por
comas, y dar de alta un permiso **no toca el repo ni Railway** — es editar un renglón
(`docs/comercial/ACCESO.md`). Los scopes en uso hoy ya son de esa forma:
`comercial:read`, `comercial:admin`, `nomina:write`, `finanzas:read`. Añadir
`semaforo:read` y mañana `rentabilidad:read` es la continuación del patrón, no una
extensión de él.

> ⚠️ **La tabla `suite_usuarios` no se lee desde aquí.** Tiene columnas `salt` y `hash`
> y `get_data_table_rows` no permite pedir columnas sueltas: leerla traería material de
> credencial al transcript (CLAUDE.md §9). Lo de arriba sale del workflow y de `ACCESO.md`.

**Lo que este gate NO hace, y está escrito en el propio archivo:** GitHub Pages es
público; el gate decide si la pantalla **se pinta**, no si el archivo **se puede
descargar**. Lo que protege de verdad es que cada webhook exija el token y verifique la
firma en el servidor. Para la plataforma esto significa una regla dura: **el permiso de
un panel se hace valer en su endpoint, no en su menú.** El menú es comodidad.

### 1.4 Cliente de datos: existe tres veces, casi idéntico

| archivo | líneas | auth que usa |
|---|---|---|
| `finanzas/js/fin-client.js` | 55 | `FinAuth` |
| `comercial/js/comercial-client.js` | 119 | `FinAuth` ⚠️ (+ firma HMAC por dispositivo) |
| `modulos/rh/nomina-incidencias/js/nom-client.js` | 320 | `NomAuth` |

Los tres implementan el mismo `call(endpoint, params)`: base de n8n desde
`localStorage`, `POST /webhook/...` con **el token en el cuerpo** (nunca en un header
`Authorization`, que fuerza preflight CORS que el webhook de n8n puede no contestar), y
la misma clasificación de la respuesta: `NO_SESSION` · `SESSION_EXPIRED` · `NETWORK` ·
`BAD_RESPONSE` · error del servidor.

Esa clasificación es exactamente la regla §20 #12b —distinguir *sesión muerta* de *no
hay red* de *el servidor falló*— y **ya está escrita tres veces**. Un panel nuevo hoy la
escribiría una cuarta.

⚠️ **Dos formas de error conviviendo**, y esto ya costó caro una vez:

```
endpoints de datos   { _error:true, code:'…', msg:'…', http:… }
auth/suite-login     { ok:false,    error:'…', mensaje:'…' }
```

El comentario de `nom-auth.js` L73 lo cuenta: se copió la forma de Finanzas y **todo
fallo se veía igual** —un «No se pudo iniciar sesión.» genérico que escondía el motivo
real—. Es el mismo modo de falla que §20 #12b, en la capa de abajo.

⚠️ **Anotado, no perseguido (§8):** `comercial/js/comercial-client.js` llama a
`window.FinAuth` y `comercial/leads.html` L136 carga `finanzas/js/auth-fin.js`, mientras
que `comercial/index.html` y todo `comercial/machote/` usan `SuiteAuth`. Es decir:
dentro de un mismo módulo conviven dos emisores de identidad, que es justo lo que
`ACCESO.md` dice haber retirado. No bloquea esta decisión; va al backlog.

### 1.5 Cabecera y componentes de tabla

**Cabecera común: no existe.** Cada pantalla arma la suya. Lo más parecido es
`finanzas/js/router.js` (162 líneas): sidebar colapsable con `localStorage`, migas de
pan, estados vacíos y de error, y un guard de expiración en cada navegación. Es un buen
armazón — pero está amarrado a `FinState` y a `FinAuth`, y su menú sale de un manifiesto
de **submódulos de Finanzas**, no de paneles de la suite.

**Componente de tabla común: no existe.** **20 archivos** arman su propio `<table>`.

Y hay un precedente que conviene mirar de frente, porque es exactamente el error que
esta decisión quiere evitar. `finanzas/js/modules/facturas-core.js` (475 líneas) **sí**
es un componente de tabla reutilizable: filtros, orden, paginación, columnas visibles,
selección, exportación, modo demo/real. Lo reutilizan dos módulos, y cada uno mide
**22 líneas**:

```js
window.FinFacturas.createView({ moduleId:'bills-odoo', endpoint:'/fin/bills-odoo',
  partnerLabel:'Proveedor', columns: window.FinFacturas.defaultColumns('Proveedor') })
```

22 líneas para un módulo entero es un resultado excelente… y es engañoso. El segundo
consumidor es **un clon del primero**: facturas emitidas y facturas recibidas son la
misma tabla con otro `move_type`. El núcleo trae adentro las columnas de `account.move`,
las píldoras de `payment_state`, la conversión a MXN y el filtro `doc_kind`.
**No le serviría al semáforo ni a rentabilidad**, no por estar mal escrito, sino porque
lo común se destiló de **un solo caso**.

> Ésa es la lección empírica que ordena el PASO 2: *ya hicimos una vez una pieza común a
> la medida de un panel, y el único que la pudo reusar fue su gemelo.*

### 1.6 Resumen del PASO 1

| pieza | ¿existe? | estado |
|---|---|---|
| login + validación de token | **sí** | `SuiteAuth` + `jwt-verify.js`, probados 9/9, ya gatean 2 módulos. **No hay que construirlo.** |
| permiso por módulo | **sí, pero** | el lanzador lo aplica con `FTSAuth`, no con los scopes del JWT |
| scope por panel | **aguanta** | `verifyJWT` toma un scope; `suite_usuarios` lo da de alta sin tocar repo ni Railway |
| navegación entre módulos | **parcial** | registro en `shared/modules-registry.js`, pero las tarjetas están a mano, en dos niveles |
| cabecera con usuario / permiso / última medición | **no** | cada pantalla la improvisa |
| botón actualizar con estado de carga | **no** | no hay patrón |
| cliente de datos | **sí ×3** | tres copias casi idénticas, **dos formas de error incompatibles** |
| tabla reagrupable | **no** | 20 tablas a mano + 1 núcleo reutilizable hecho a la medida de facturas |
| sistema de color / estado | **no** | el semáforo tiene el suyo en su prototipo |
| pie que cuadra | **no** | el semáforo lo estrena (`suma === total → "Cuadra."`) |
| despliegue multi-panel | **sí** | una carpeta es una dirección; push a `main` y ya |

---

## PASO 2 · El contrato de respuesta

**La idea:** cada motor devuelve lo suyo, envuelto igual. El sobre es idéntico para
todos los paneles; `datos` es lo único propio.

```jsonc
{
  "ok": true,
  "panel": "semaforo",          // quién contesta
  "contrato": 1,                // versión del SOBRE, no del payload
  "alcance": {                  // a qué se refiere el número (ver abajo)
    "tipo": "instante",         //   "instante" | "periodo"
    "en": "10/Sep/2026 08:00 CST",
    "fuente": "watchdog-semaforo · corrida de producción",
    "respondido": "hoy 09:12 CST"
  },
  "actor": { "nombre": "esteban.delacruz", "scopes": ["semaforo:read"] },
  "salvedades": [               // qué NO cubre este número
    { "codigo": "SIN_LINEA_BASE", "dice": "…", "filas": [2361, 2372] }
  ],
  "datos": { … }                // PROPIO del panel
}
```

Y el error, **una sola forma** para todo (cierra la divergencia de §1.4):

```jsonc
{ "ok": false, "panel": "semaforo", "error": "SCOPE_INSUFICIENTE",
  "mensaje": "Tu cuenta no carga el permiso semaforo:read.", "clase": "sesion" }
```

`clase` es lo que el cliente necesita para no juntar tres cosas distintas en un mensaje
solo: `sesion` (vuelve a entrar) · `red` (espera) · `servidor` (avisa). Va en la
respuesta y no se deduce del código HTTP, porque el webhook de n8n contesta 200 con
cuerpo de error.

### Validación contra los DOS casos

No basta con que quepan; lo útil es **qué cambió del diseño por meter el segundo**.

**`alcance` empezó siendo `medido_en`, un instante.** Le queda perfecto al semáforo: la
medición de las 08:00, que la pantalla repinta sin recalcular. **A rentabilidad no le
sirve**: no es un estado en un momento, es una **acumulación durante un periodo**
(`desde`/`hasta`), leída en vivo, que se vuelve a mover en cuanto alguien postea un
gasto. Con `medido_en` fijo, rentabilidad tendría que meter su periodo dentro de
`datos` — y entonces **la cabecera deja de poder ser común**, porque la cabecera es
justo donde va el «qué estoy viendo y de cuándo».

Por eso `alcance` es una **unión etiquetada**:

```jsonc
{ "tipo":"instante", "en":"10/Sep/2026 08:00 CST", "fuente":"…", "respondido":"…" }
{ "tipo":"periodo",  "desde":"01/Ene/2026", "hasta":"12/Sep/2026",
  "leido_hace":"8 s", "fuente":"Odoo · lectura en vivo", "respondido":"…" }
```

Éste es el cambio concreto que **no** habría aparecido mirando sólo el semáforo.

**`salvedades[]` resultó ser lo más común de todo, y sólo se ve con los dos.** Cada
panel tiene una razón distinta para que su número no sea completo:

| panel | salvedad | por qué |
|---|---|---|
| semáforo | `SIN_LINEA_BASE` | sin nota en la ventana, el delta no se puede calcular: sólo se puede decir en qué estado está hoy |
| semáforo | `CONTADOR_RECALIBRADO` | el contador cambió de medir la edad a medir el tiempo en la etapa (#229) |
| rentabilidad | `COSTO_SIN_PROYECTO` | 59% del gasto de proveedor no trae proyecto (medido en A0) → **todo costo es un piso, no un total** |
| rentabilidad | `PRESUPUESTO_ESQUELETO` | presupuestos creados con monto `−1` como marcador |
| rentabilidad | `MONEDA_MEZCLADA` | totales en MXN al tipo de cambio del día de cada factura |

Con un solo panel esto se habría escrito como «banderas de integridad» —una lista de
problemas *de proyectos*—. Con los dos se ve que son **advertencias sobre el número
mismo**, y que el armazón las pinta igual sin saber de qué hablan. Es la pieza que
sostiene el pie que cuadra.

**El color se queda en el sobre; la leyenda NO.** Los dos usan verde/amarillo/rojo, así
que el armazón puede pintarlos. Pero significan cosas sin relación:

- semáforo → *qué tan tarde va en su etapa*. No dice nada de dinero.
- rentabilidad → *margen contra el esperado*. No dice nada de días.

Si el armazón trajera escrito «verde = al día», estaría mintiendo en el segundo panel.
**La leyenda viaja en `datos` y el armazón la pinta al pie, tal cual.**

**La tabla: filas planas con llaves de grupo, columnas en la respuesta.** Aquí estaba la
trampa de `facturas-core`. Las filas del semáforo son planas; las de rentabilidad son
jerárquicas (proyecto → rubro) y con sumas. Un `filas[]` plano obligaría a rentabilidad
a aplanar y perder la agrupación, o a saltarse la tabla común. La forma que sí les sirve
a los dos:

```jsonc
"tabla": {
  "columnas": [
    { "id":"proyecto", "label":"Proyecto", "agrupable":true },
    { "id":"real",     "label":"Real",     "kind":"num", "suma":true }
  ],
  "agrupar_por": "proyecto",
  "filas": [ { "proyecto":"SO11547 Topo Chico", "real":1602000 } ]
}
```

Las filas van **planas**; las llaves de agrupación son columnas normales; el navegador
agrupa y suma. Así el semáforo reagrupa por etapa o por responsable y rentabilidad por
proyecto o por rubro, **con el mismo componente y sin que el componente sepa de ninguno
de los dos**. La diferencia con `facturas-core` es una sola: **las columnas llegan en la
respuesta, no están escritas en el cliente.**

`tabla` vive **dentro de `datos`**, no en el sobre. El sobre estandariza identidad,
frescura, salvedades y autorización; la tabla es un **componente compartido con una
forma de entrada declarada**. Un panel cuya vista principal no sea una tabla
simplemente no manda `tabla`. Confundir las dos cosas es otra manera de hacer el sobre
a la medida.

#### Límite explícito: qué viaja en `columnas` y qué NO

Las columnas viajan porque el armazón **no puede** saber las de rentabilidad. Pero viaja
sólo lo que el servidor es el único que sabe:

| viaja | no viaja |
|---|---|
| **qué columnas hay** (`id`) | ancho |
| **cómo se llaman** (`label`) | orden preferido de despliegue |
| **de qué tipo son** (`kind`: texto o número) | colores |
| si se puede agrupar por ella (`agrupable`) y si se suma (`suma`) — porque eso es del **dato**, no de la vista | qué va colapsado |

**Esto es un límite, no un criterio**, y la razón es concreta: si el ancho y el orden
también viajaran, **el armazón se vuelve títere del servidor y habría que tocar backend
para mover una columna**. Ancho, orden, color y colapso son del cliente, y el usuario los
cambia en su navegador sin que nadie despliegue nada.

`agrupable` y `suma` caen del lado del servidor por una razón que no es de presentación:
decir que una columna **se puede sumar** es una afirmación sobre el dato (que es aditivo, y
que sumarlo significa algo), no sobre cómo se ve. Sumar «días en la etapa» daría un número
sin sentido; sumar «real» da el costo del grupo. Sólo el motor sabe cuál es cuál.

---

## PASO 3 · El reparto

### Común (se construye una vez, en `shared/panel-shell/`)

| pieza | qué incluye | de dónde sale |
|---|---|---|
| login + validación de token | gate de pantalla + `verifyJWT` en el endpoint | **ya existe**: `SuiteAuth` + `jwt-verify.js` |
| navegación entre paneles | registro `{id, scope, nombre, unidad, ruta}` → menú; **sólo los paneles que esa persona carga** | nuevo (el registro existe, el filtro por scope no) |
| cabecera | nombre del panel, quién entró, qué permiso, **alcance en palabras** (instante o periodo) | nuevo |
| botón actualizar | con estado de carga y deshabilitado mientras corre | nuevo |
| tabla reagrupable | columnas de la respuesta, agrupar por cualquier columna marcada, subtotales y total | nuevo, con la lección de `facturas-core` |
| sistema de color / estado | pinta verde/amarillo/rojo; **la leyenda la pone el panel** | nuevo |
| pie que cuadra | suma de secciones contra el total; dice «Cuadra» o **«NO CUADRA»** | del prototipo del semáforo |
| cliente de datos | un `call()`, **una** forma de error, clasificación `sesion`/`red`/`servidor` **en un solo lugar** | unifica las 3 copias de §1.4 |

### Propio de cada panel

Su motor · su consulta a Odoo · sus umbrales · sus secciones · qué considera anomalía ·
**su leyenda de color** · su vista de detalle.

### Permisos

**Uno por panel, no por vista.** `semaforo:read`; después `rentabilidad:read`. Se
otorgan por persona en `suite_usuarios` (un renglón, sin tocar repo ni Railway) y el
armazón muestra sólo los paneles que esa persona carga.

**Arranque:** `semaforo:read` para **Esteban, Erick, Gerardo y Felipe**.

> El menú es comodidad; **el permiso se hace valer en el endpoint** con
> `verifyJWT(token, secret, 'semaforo:read')`. Esconder un botón no protege nada
> (§1.3, y está escrito en el propio `auth-jwt.js`).

### Entrada

**Una sola dirección por panel**, enlazable desde donde tenga sentido. El semáforo vive
en `operaciones/semaforo/`; que aparezca en el menú de Operaciones **y** en el de
Finanzas son dos enlaces al mismo sitio, no dos páginas. Esto no requiere nada nuevo:
en Pages una carpeta ya es una dirección (§1.1).

---

## PASO 4 · Qué cambia en el Bloque 2, con números

El Bloque 2 se replantea: deja de ser «construir el módulo del semáforo» y pasa a ser
**«construir el armazón y estrenarlo con el semáforo»**.

La unidad es la **sesión**, que es la que este repo viene usando para estimar
(`VIVO-AUDITORIA.md` §Plan de sesiones).

### Costo de más contra construirlo suelto

| | suelto | como primer panel |
|---|---|---|
| endpoint `ops/semaforo` + guardar la medición | 1 | 1 |
| pantalla del semáforo | 1 | 1 |
| armazón (registro + menú + cabecera + actualizar + tabla + pie) | — | **½** |
| **total** | **2** | **2½** |

**El de más es ½ sesión.** Y es menos de lo que parece, porque tres de las piezas
«nuevas» hay que escribirlas igual en la versión suelta:

- la clasificación `sesion`/`red`/`servidor` es **condición 3 de la auditoría anterior**
  para este módulo, con o sin plataforma;
- el pie que cuadra ya está en el prototipo del semáforo;
- el sistema de color también.

Lo genuinamente extra son **el registro con filtro por scope y la cabecera común**, y
ponerlos en `shared/` en vez de en `operaciones/semaforo/js/`.

### Costo de migrarlo después, si se hiciera suelto

Se paga la misma ½ sesión del armazón, **más** el retrofit:

| | sesiones |
|---|---|
| el armazón (se paga igual, sólo que después) | ½ |
| reescribir la pantalla del semáforo para que consuma el armazón (su navegación, su cabecera, su tabla) | ½ |
| re-verificarla mirándola a los dos anchos y volver a probar su ruta de auth (§20 #12) | ½ |
| **total de la migración** | **1½** |

**½ ahora, o 1½ después.** Tres veces, y con una asimetría que no está en la tabla:
la migración toca **una pantalla que ya está en producción y que el equipo apenas está
volviendo a creer** —que es literalmente el motivo por el que el Bloque 3 es
prioritario—. El riesgo de regresión se paga en la moneda que más escasea aquí.

**La salvedad honesta:** si rentabilidad nunca se construyera, la ½ sesión sería
trabajo tirado. Como ya está definido y viene, ésa no es la apuesta.

### Lo que NO cambia

El motor, el correo, el log note y el orden ya confirmado del Bloque 1. El armazón es
frontend y contrato; no toca el watchdog.

---

## Plan de sesiones del Bloque 2

| | qué | depende de | tamaño |
|---|---|---|---|
| **B2.0** | `shared/panel-shell/`: registro de paneles con filtro por scope, cabecera con alcance, botón actualizar, tabla reagrupable, pie que cuadra, **un** cliente de datos con la clasificación en un solo lugar | — | ½ |
| **B2.1** | endpoint `ops/semaforo`: devuelve la medición guardada, en el sobre del PASO 2, con `verifyJWT(…, 'semaforo:read')`. Alta de los 4 scopes en `suite_usuarios` | Bloque 1 (motor) | 1 |
| **B2.2** | `operaciones/semaforo/` conectado, con las 5 secciones del prototipo canónico | B2.0, B2.1 | 1 |
| **B2.3** | enlaces desde el menú de Operaciones y el de Finanzas al **mismo** sitio; lanzador filtrando por scopes del JWT con el lado tolerante primero (sin sesión, muestra todo) | B2.2 | ½ |

**B2.0 no depende de nada y se puede adelantar.** B2.3 es la que cierra la deuda de
§1.2 (el lanzador filtrando por el login equivocado) y se hace por el lado tolerante
para no dejar a nadie afuera al desplegar (§8 anti-trabón).

---

## Prototipo

**[`docs/watchdogs/prototipo/plataforma-paneles.html`](../watchdogs/prototipo/plataforma-paneles.html)**
— un archivo, sin dependencias, se abre con doble clic.

- El **semáforo dentro del armazón**, con el menú de paneles visible **aunque sólo haya
  uno**. Sus 5 secciones y sus datos reales del 10/Sep salen del prototipo canónico
  `semaforo-modulo.html` **extraídos, no transcritos** (su `<style>` y su `<script>`
  se copiaron programáticamente; el único cambio es que el botón *Actualizar* subió al
  armazón, quitado con un reemplazo verificado a 1 ocurrencia).
- Dos casillas **simulan los permisos**, para ver las tres situaciones: sólo semáforo,
  los dos paneles, y ninguno.
- El panel **Rentabilidad es una maqueta de contrato con números inventados**, y lo dice
  en pantalla. Está para una sola cosa: enseñar que el mismo armazón sirve para un
  alcance de **periodo**, una tabla **jerárquica con sumas** y una **leyenda de color
  distinta**.

**Revisado mirándolo** (§20 #12), no leyendo el diff: Chromium a **1440 y a 430 px**, en
las cinco pantallas. **Cero `pageerror`, cero `console.error`, cero scroll horizontal de
página.** Capturas junto al archivo (`plat-*.png`).

> Un bug que sólo se vio en la captura, y que ilustra la regla: con la barra de paneles
> apilada en móvil, `align-items:flex-start` en dirección columna hace que los hijos
> midan **su contenido**, y la tabla de rentabilidad arrastraba `.main` a 658 px en un
> viewport de 430. El CSS «se leía bien». Corregido con `align-items:stretch` en la
> media query.

---

## Anotado, no perseguido (§8)

| hallazgo | dónde |
|---|---|
| El lanzador aplica permisos por módulo con `FTSAuth`, no con los scopes del JWT | `index.html` L366-383 — **lo cierra B2.3** |
| `comercial/leads.html` carga `auth-fin.js` y `comercial-client.js` usa `FinAuth`, mientras el resto de comercial usa `SuiteAuth`: dos emisores en un módulo | backlog |
| Dos formas de error incompatibles entre `auth/*` y los endpoints de datos | **lo cierra el PASO 2** |
| 20 archivos arman su propia tabla | lo alivia B2.0, no lo resuelve |
| Mi propia `VIVO-AUDITORIA.md` §2.3 decía que no hay manifiesto de módulos. Sí lo hay | corregido en §1.2 de este documento |

---

## 🔴 Hallazgo de datos personales, encontrado al armar el prototipo

Al copiar las filas del canónico al armazón, **12 de las 35 traían nombre de contacto del
cliente dentro del `name` del proyecto** (el patrón de Odoo `… - Empresa, Persona`).
Son **6 personas** de 4 clientes.

Los nombres de **empresa** no son el problema y se quedan. Los de **persona** salieron:
se quitaron de los dos archivos con un reemplazo verificado (12 menciones en cada uno,
35 filas intactas, cero rastros al rebarrer). Esto es §20 #7, y el criterio es el mismo
que Esteban ya aplicó a los 61 snapshots: **fuera del árbol, y el historial queda como
riesgo aceptado y documentado.**

⚠️ **Lo que sigue abierto, para Esteban:** `semaforo-modulo.html` se publicó con esos
nombres, así que **ya están en el historial de un repo público**. Borrarlos del archivo
no los borra de ahí. Es el mismo trato que los 8 nombres de contacto de los snapshots:
o se acepta explícitamente, o se reescribe historia — y eso no se hace sin decirlo.

**Y hay una causa de fondo que este parche no toca:** el `name` del proyecto en Odoo trae
el contacto pegado, así que **cualquier cosa que publique nombres de proyecto vuelve a
publicar contactos**. El correo del watchdog los imprime hoy, y el endpoint `ops/semaforo`
los devolvería. El corte va **en el motor**, no en cada consumidor — un solo lugar que
recorte `, Persona` del `name` antes de que salga. Va al backlog del Bloque 3 con este
nombre: *cortar el contacto en el motor, no en la pantalla.*
