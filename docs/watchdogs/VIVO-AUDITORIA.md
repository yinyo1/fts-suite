# Semáforo en vivo — auditoría previa

Sesión de investigación pedida el 2026-09-09. **No se construyó el módulo, no se
modificó ningún workflow, no se escribió en Odoo.** Continúa la auditoría #220.

Entregables: este documento (pasos 1-4) y el prototipo en
[`docs/watchdogs/prototipo/semaforo-vivo.html`](prototipo/semaforo-vivo.html).

---

## Veredicto en un párrafo

**Procede, y no hay que construir autenticación: ya existe y está viva.** El bloqueo que
se temía —repo público, Pages— no es un bloqueo porque el modelo de la suite nunca fue
«página privada»: es **página pública con datos gateados**, y eso ya corre en producción
en dos módulos. Lo que sí hay que cambiar es de dónde salen los datos: **la vista en vivo
no puede leer los snapshots del repo**, porque esos son públicos hoy. Y hay una condición
de orden: **va después de S3**, porque S3 cambia el reloj de Administración y construir la
pantalla contra un reloj que está por cambiar es trabajo tirado.

---

## PASO 1 · El gate de acceso

### 1.1 El repo es público y sirve Pages — confirmado

`yinyo1/fts-suite` es público y `https://yinyo1.github.io/fts-suite/` sirve desde él.
Cualquier archivo commiteado es legible por cualquiera, y **borrarlo no lo borra del
historial** (CLAUDE.md §20 #7).

### 1.2 ¿Se construyó el login de #131? Sí, y va más allá de comercial

#131 **define** la forma del JWT (punto 4: «se construye en sesión 2, pero el JWT nace ya
con la forma final: `sub` = persona, `roles` = lista por módulo»). Lo que se construyó es
más ambicioso que un login de comercial: es un **login de suite**.

**Vivo y activo en n8n**, leído hoy:

```
auth/suite-login · id kLhyPxVSMbDRwxfC · active: true · triggerCount: 1
  "Login server-side de la Suite. PBKDF2-SHA256 100k + JWT HS256 (8h) en JS puro.
   Lee suite_usuarios (Data Table) y SUITE_JWT_SECRET via nodo Set.
   Lockout 5 -> 15 min en staticData. Fase 0 del issue #136."
```

El lado que **verifica** también existe y está probado: `docs/n8n-workflows/fase0/jwt-verify.js`,
el cuerpo de Code que se inserta justo después del Webhook en cada workflow protegido.

```
verifyJWT(token, secret, scopeRequerido)
  -> { ok:true,  actor, scopes, exp }
  -> { ok:false, error: TOKEN_AUSENTE | TOKEN_MALFORMADO | FIRMA_INVALIDA
                      | PAYLOAD_ILEGIBLE | TOKEN_EXPIRADO | SCOPE_INSUFICIENTE }
```

Su README documenta 9/9 casos de JWT probados (válido, expirado, scope insuficiente,
secreto equivocado, **payload manipulado**, malformado, ausente, y dos de compatibilidad),
y la cripto validada contra dos oráculos independientes: los vectores estándar de
PBKDF2-HMAC-SHA256 y el `crypto` de Node.

Los scopes ya se usan por módulo (`comercial:read`, `comercial:admin`, `nomina:write`,
`finanzas:read`…), con la regla anti-trabón aplicada: un token viejo sin `scopes` hereda
los de finanzas en vez de ser rechazado.

> ⚠️ **No leí la tabla `suite_usuarios`.** Sus columnas incluyen `salt` y `hash`, y
> `get_data_table_rows` no permite pedir columnas sueltas: leerla habría traído material
> de credencial al transcript de la sesión (CLAUDE.md §9). El roster y los scopes se
> confirmaron desde `docs/comercial/ACCESO.md` y `ALMACEN.md`.

### 1.3 Qué protege al kiosko hoy

**Un PIN de 4 dígitos, y nada más.** `operaciones/kiosk/index.html` es HTML público que
pide PIN en un teclado en pantalla. El reconocimiento facial está en opt-in explícito
desde el Hallazgo #14. No hay gate de página.

Comercial es el caso más duro que existe hoy: token JWT en el **cuerpo** más una firma
HMAC en un header, con el secreto HMAC sembrado a mano en `localStorage` por dispositivo.
Dos factores sobre el webhook, cero sobre la página.

**El patrón de la suite, entonces, es uniforme: la página es pública, los datos no.**

### 1.4 El problema real, y ya es nuestro

El bloqueo no es que no haya auth. Es que **los datos del semáforo YA son públicos**:

```
shared/operaciones/semaforo_snapshots/  ·  60 archivos  ·  1.3 MB
  del 2026-06-17 al 2026-09-08, uno por día hábil
  cada uno: nombre de proyecto, cliente, etapa, días, banderas, racha de notas
```

S1 (#223) redactó el campo `cliente` **de aquí en adelante**; los 8 nombres de contacto ya
publicados quedaron como riesgo aceptado. Pero el resto sigue: qué proyectos hay, de qué
cliente, cuántos días llevan y qué está atorado. **La pregunta no es si se puede publicar
esta información — ya se publicó. La pregunta es si la vista nueva debe seguir haciéndolo.**

### 1.5 Opciones reales, con su costo

| | Qué es | Costo | Veredicto |
|---|---|---|---|
| **A** | Repo privado | **Mata Pages en el plan gratuito.** Toda la suite cambia de hosting | ❌ desproporcionado |
| **B** | Servir el frontend desde Railway detrás de auth | Servicio nuevo, ruta de deploy nueva, rompe el modelo «un repo, Pages» por un módulo | ❌ caro para el problema |
| **C** | **Página pública, datos gateados** | ~0 infraestructura nueva. Un webhook con `jwt-verify.js` y scope `ops:read` | ✅ **recomendada** |
| **D** | Segundo repo privado para módulos sensibles | Parte el código en dos, dos rutas de deploy, dos historiales | ❌ deuda permanente |

**Recomendación: C.** No por elegante: porque **ya está en producción dos veces** (finanzas
y comercial), la auth está viva y probada, y es la única cuyo costo es un webhook. La
página se sirve vacía; pide los datos y el workflow decide si los da.

**Tres condiciones para que C no sea teatro:**

1. **La vista en vivo NO lee los snapshots del repo.** Si los lee, el gate es decorativo:
   los datos siguen siendo descargables sin token.
2. **Los snapshots dejan de crecer en superficie.** Siguen sirviendo para historia y para
   el análisis (así se reconstruyó todo #220), pero conviene decidir explícitamente qué
   campos merecen ser públicos. La redacción de `cliente` fue el primer paso.
3. **La app tiene que sobrevivir una rotación de secreto sin que nadie abra la consola.**
   Al rotar `SUITE_JWT_SECRET` el 8-sep, la pantalla dijo «no se pudo confirmar con el
   servidor» y hubo que borrar la llave a mano (§20 #12b). El módulo nuevo nace con esa
   clasificación `sesion`/`red`/`servidor` en un solo lugar, no la hereda rota.

### 1.6 Lo que hay que decir aunque no sea de este módulo

`docs/comercial/SECRETOS-EN-EL-NAVEGADOR.md` (8-sep) documenta tres cosas **peores que
cualquiera que este módulo pudiera introducir**, y siguen abiertas:

- 🔴 `pmo/index.html` L1000 declara un **secreto HMAC de 64 hex en literal** y lo escribe a
  `localStorage`. Está **publicado**. (CLAUDE.md §15 #3 dice que se rotó — eso fue cierto
  para la copia en `docs/`; **la de `pmo/index.html` sigue viva**.)
- 🟠 `shared/config-sync.js` barre **todas** las llaves `fts_*` / `ops_*` / `key_*` con una
  lista negra de cuatro, las cifra y las commitea a `shared/ops-config.json` **público**.
  El JWT de la suite y el PAT de GitHub no están excluidos.
- 🟡 `shared/users-suite.json` (el login viejo, `FTSAuth`) guarda hashes SHA-256 **sin sal**
  en un archivo público.

**No es de este módulo arreglarlos y no los toqué.** Los menciono porque cambian el cálculo
de la decisión: agregar una pantalla *gateada* a una suite que publica un HMAC vivo no es
el riesgo marginal. Van al backlog de #220 con dueño, como pide §8.

### 1.7 Respuesta directa a «¿debe esperar a que exista auth?»

**No. La auth existe, está activa, está probada y ya gatea dos módulos.** El trabajo del
módulo nuevo no es construir auth: es **usarla**, y dejar de servir los datos por un canal
que la esquiva.

---

## PASO 2 · El frontend hoy

### 2.1 Estructura

Ocho carpetas de módulo en la raíz más el launcher:

```
comercial/  finanzas/  hatch/  ingenieria/  modulos/  operaciones/  pmo/  seguridad/
+ shared/  docs/  db/  scripts/  tests/  website/
```

`index.html` (471 líneas) es el launcher. Declara **ocho cards con el `href` escrito a
mano**: comercial, finanzas, hatch, ingenieria, operaciones, pmo, seguridad y
`shared/mi-perfil/`.

`operaciones/` tiene ocho subcarpetas: `carga-mo`, `config`, `confirmar-horas`,
`dashboard`, `incidencias`, `kiosk`, `planeacion`, `shared`.

### 2.2 `operaciones/semaforo/` NO existe

```
$ ls operaciones/semaforo/
ls: cannot access 'operaciones/semaforo/': No such file or directory
```

CLAUDE.md §18 lo lista como pendiente #5 desde el go-live del watchdog (19-jun). **Nunca
se empezó.** Es tierra virgen: no hay nada que migrar ni que romper.

### 2.3 Navegación y permisos por módulo

**No hay manifiesto de módulos.** El launcher no lee ninguna lista: los ocho `href` están
en el HTML. Consecuencia directa: **no hay forma de ocultarle una card a quien no debe
verla**, porque el launcher no sabe quién está mirando.

### 2.4 Cómo consumen datos los módulos — tres patrones conviviendo

| Patrón | Ejemplo | Gate |
|---|---|---|
| JSON del repo por API de GitHub o raw | panel-incidencias, kiosk, watchdog | ninguno |
| Webhook n8n con token en el cuerpo | finanzas, comercial, RH | JWT + scope |
| `localStorage` | config del kiosko, secreto HMAC de comercial | por dispositivo |

Y **tres llaves de sesión** conviviendo, herencia de tres logins nacidos por separado:
`fts_session` (viejo, sin sal), `fts_fin_session` (finanzas), `fts_suite_session` (el
bueno). La propuesta de unificarlas está escrita y no aplicada.

### 2.5 ¿Sirven los 60 snapshots como fuente?

**Para historia sí; para «en vivo» no.** Son la foto de las 08:00, una por día hábil, y hoy
sirvieron para reconstruir todo #220 cuando n8n solo retiene 14 días de ejecuciones. Pero:

- son el estado de las 08:00, no el de ahora;
- son **públicos** (§1.4);
- y **el PUT que los escribe solo puede CREAR, nunca actualizar** — hallazgo medido hoy en
  S1: manda el body sin `sha`, GitHub responde 422 y `onError:continueRegularOutput` lo
  convierte en dato, así que el nodo reporta `success` con el snapshot viejo intacto.
  Una re-corrida del mismo día no refresca nada.

---

## PASO 3 · Todo en una sola estructura, sin URLs por módulo

### 3.1 Qué se rompe primero

**El launcher**, y por dos motivos distintos:

1. **Crecimiento.** Ocho cards escritas a mano. La novena se agrega editando HTML. No es
   grave por sí solo — es una línea — pero es el síntoma.
2. **Permisos.** Este sí es grave. El launcher no sabe quién mira, así que **enseña las
   ocho puertas a todo el mundo**. Hoy no importa mucho porque los datos están gateados
   detrás de cada puerta. Importará el día que un módulo dependa de que su card no se vea.

Lo segundo que se rompe son **las llaves de sesión**: tres logins, y un `config-sync` que
barre `fts_*` a un archivo público (§1.6). Cada módulo nuevo que estrene una llave se
suma al barrido, porque la regla es lista negra, no lista blanca.

### 3.2 Opciones

| | Qué | Costo | Reversible |
|---|---|---|---|
| **1** | Dejarlo así | 0 | — |
| **2** | **Manifiesto `shared/modulos.json` + launcher que lo renderiza y filtra por scopes del JWT** | ~media sesión | **Sí: se borra el JSON y vuelven las cards** |
| **3** | URL o subdominio por módulo | Alto: DNS, deploy por módulo, se pierde el «un repo» | No de facto |

### 3.3 Recomendación: opción 2, y con el lado tolerante primero

`shared/modulos.json` con `{ruta, titulo, icono, scope}` por módulo. El launcher lo lee y
renderiza. **Si hay sesión, filtra por `scopes`; si no hay sesión, muestra todo** — que es
exactamente lo que hace hoy, así que desplegarlo no deja a nadie afuera (§8 anti-trabón).
Endurecer viene después, módulo por módulo, cuando cada uno tenga su scope repartido.

**Implicación de deploy: ninguna.** Mismo repo, mismo Pages, mismo push.

**Reversibilidad:** total y en un commit. Si el manifiesto molesta, se borran el JSON y el
render, y vuelven las ocho cards escritas a mano.

---

## PASO 4 · De dónde salen los datos vivos

El criterio que decide no es la frescura ni el costo. Es, en palabras de Esteban: *«si el
correo dice una cosa y la pantalla otra, se pierde la credibilidad que apenas estamos
recuperando»*.

| | **A · snapshot 08:00** | **B · recálculo bajo demanda** | **C · caché en Railway Postgres** |
|---|---|---|---|
| Frescura | hasta 24 h de atraso | segundos | minutos |
| Costo por carga | 0 | ~9 s y ~10 consultas a Odoo | ~0 tras el escritor |
| Costo de construir | bajo | bajo | **alto**: servicio, esquema, escritor, respaldo |
| Historia | sí, 60 días | **no** | sí |
| **Riesgo de discrepancia con el correo** | **cero por construcción** | **alto** | medio |

### 4.1 Por qué B es la trampa

B es la que suena mejor y es la que rompe el criterio. El correo se calcula a las 08:00 con
`bizDays` en hora de pared de Monterrey y una línea base de delta guardada en
`staticData`. Recalcular a las 15:00 da **números distintos por razones correctas**: pudo
pasar un día hábil, pudo escribirse una nota, pudo moverse una etapa. La pantalla tendría
razón, el correo tendría razón, **y dirían cosas distintas**.

Y hay un límite duro, no de criterio sino de mecánica: **las secciones de delta no se
pueden recalcular.** «Nuevo hoy», «empeoró», «se resolvió» se computan contra
`staticData`, que solo persiste en corridas de producción. Un recálculo bajo demanda no
tiene contra qué comparar.

### 4.2 Por qué C es caro para lo que resuelve

C compra frescura de minutos a cambio de un servicio nuevo con esquema, escritor, respaldo
y un segundo lugar donde la verdad puede desincronizarse. Es la respuesta correcta el día
que haya varios consumidores de la medición. Hoy hay uno.

### 4.3 Recomendación: A, con una forma precisa

**La vista lee el MISMO artefacto con el que se construyó el correo. Un solo escritor, una
sola medición, cero posibilidad de que discrepen.**

En concreto:

1. Al final de su corrida, el watchdog **guarda la medición** (las 35 filas de
   `Code - MAIN` más el `_diag` y la marca de tiempo) en una Data Table de n8n. Es el
   mismo array que ya alimenta al correo y al snapshot: **no se calcula nada nuevo**.
2. Un webhook **`ops/semaforo`** la devuelve, con `jwt-verify.js` exigiendo `ops:read`.
3. La pantalla la pinta y **dice arriba cuándo se midió**: «Medición del 9-sep 08:00 CST».

Ese tercer punto no es cosmética. **Una pantalla que dice cuándo se midió no está
desactualizada; una que finge estar en vivo y no lo está, miente.** Es la misma regla que
«la UI no es fuente de verdad de estado» (§8), aplicada al eje del tiempo.

### 4.4 Cómo ganar frescura después sin romper el invariante

Un botón **«recalcular»** que dispara **el mismo workflow** en un modo que recalcula **y
reescribe la medición guardada**. Así la pantalla y el correo siguen compartiendo una sola
fuente: el siguiente correo saldrá del mismo número que vio quien apretó el botón.

**Lo que nunca debe existir es un segundo camino de cálculo.** Dos implementaciones de
`bizDays` divergen; es el anti-patrón que CLAUDE.md §11 #12 ya documentó cuando dos
workflows usaron ventanas distintas sobre el mismo dataset.

---

## PASO 5 · El prototipo

**[`docs/watchdogs/prototipo/semaforo-vivo.html`](prototipo/semaforo-vivo.html)** — un solo
archivo, ~30 KB, **cero dependencias externas y cero backend**. Se abre con doble clic.

- **Datos DEMO anonimizados.** Estructura y forma de los números del snapshot real del
  8-sep-2026; nombres de proyecto, cliente, SO e ids **sustituidos** (10 clientes →
  `Cliente A`…`Cliente J`). Verificado con grep: cero nombres reales en el archivo. Una
  barra morada permanente arriba lo declara, para que nadie confunda la demo con el estado
  de la operación.
- **Las dos vistas** por pestaña: **Operaciones** (19) y **Administración** (16). El
  submódulo *Watchdog* de Operaciones abriría en la primera y el módulo *Watchdog* de
  Finanzas en la segunda; es la misma pantalla, gateada por scope.
- **Filtros:** búsqueda libre, etapa, solo con banderas, solo nota repetida, y los
  **KPI son clicables** como filtro de color. Ordenamiento por cualquier columna.
- **Detalle por proyecto** con etapa, semáforo, días y tramo, fecha compromiso, racha de
  notas, banderas, la acción sugerida y una sección **«cómo se midió»** que dice en la cara
  que el contador sale de `create_date` y que hoy es la edad del proyecto (error #1 de
  #220).
- La vista de Administración lleva impreso que **S3 le cambia el reloj** al vencimiento de
  la factura, con el dato de #225: hoy el número y el vencimiento coinciden en 1 de 9.

**Revisado mirándolo** (§20 #12), no leyendo el diff: abierto en Chromium a 1440 y a 430 px,
ejercitando pestañas, detalle, filtros y el caso de lista vacía. **Cero `pageerror` y cero
`console.error`.**

Una decisión de honestidad: el snapshot del 8-sep todavía traía 8 banderas
`ap_sin_confirmacion`, la regla que S1 apagó. **Se quitaron del demo.** Un prototipo que
sirve para decidir no debe enseñar una regla retirada como si estuviera viva.

---

## Recomendación final y condición

**Procede.** Bajo tres condiciones, en este orden:

1. **Va después de S3.** S3 cambia el reloj de Administración de «días en etapa» a
   «vencimiento de la factura», y la vista de Administración es la mitad del módulo.
   Construirla contra el reloj que está por cambiar es trabajo tirado.
2. **La vista NO lee los snapshots del repo.** Lee `ops/semaforo`, gateado por `ops:read`
   con `jwt-verify.js`. Si lee los snapshots, el gate es decorativo.
3. **Un solo cálculo.** El endpoint devuelve la medición que el correo usó, guardada por
   el propio watchdog. Nunca un recálculo paralelo.

**Si alguna de las tres no se puede cumplir, la recomendación es esperar**, no construir a
medias: una pantalla que contradiga al correo cuesta más credibilidad de la que gana en
comodidad.

---

## Plan de sesiones, si procede

| | Qué | Depende de | Tamaño |
|---|---|---|---|
| **V1** | Guardar la medición al final de la corrida + webhook `ops/semaforo` con `jwt-verify.js` y scope `ops:read` | S3 | ~1 sesión |
| **V2** | `shared/modulos.json` + launcher que lo renderiza y filtra por scopes (lado tolerante primero) | — | ~½ sesión |
| **V3** | `operaciones/watchdog/` con el prototipo conectado al endpoint, más la clasificación `sesion`/`red`/`servidor` en un solo lugar | V1 | ~1 sesión |
| **V4** | `finanzas/watchdog/` (misma pantalla, vista de Administración) + botón «recalcular» | V3, S3 | ~½ sesión |

V2 no depende de nada y se puede adelantar.

---

## Anotado en esta sesión, no perseguido (backlog #220)

| Hallazgo | Dueño |
|---|---|
| El PUT del snapshot solo puede CREAR: sin `sha`, 422 silencioso tras `onError` | watchdog |
| Secreto HMAC en literal y publicado en `pmo/index.html` L1000 | Esteban + PMO |
| `config-sync` barre `fts_*` a un archivo público con lista negra de 4 | operaciones |
| PAT de GitHub en claro y por duplicado en `localStorage` | Esteban |
| Tres llaves de sesión conviviendo; `users-suite.json` con SHA-256 sin sal, público | transversal |
| `operaciones/semaforo/` lleva pendiente desde el go-live del 19-jun (§18 #5) | este plan lo cierra |
