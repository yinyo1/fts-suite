# Auditoría del almacén del machote — 2026-09-06

> Sesión **de auditoría**. No se tocó código, ni migraciones, ni workflows, ni Odoo, ni se
> mergeó nada. Rector: #127 · Persistencia: #140 · Módulo en **V1.16** (`3c4263d`).
> `main` al momento de auditar: **`7b8beb8`**.

**Todo lo marcado ✅ se ejecutó y se observó en este turno.** Lo marcado 🟡 es supuesto y
está dicho como supuesto. Lo marcado ⛔ es algo que decidí **no** ejecutar, con su razón.

---

## 0. El resumen en cinco renglones

1. **`almacen.js` sí es la única costura.** Ninguna otra pieza del machote escribe el
   almacén. Cambiarlo a Postgres toca **un archivo**.
2. **Y no hay nada más.** No hay exportar, no hay importar, no hay respaldo, no hay copia
   fuera del navegador de cada quien. Lo capturado hoy vive en un solo lugar y se puede
   perder sin aviso.
3. **La persistencia en servidor está al ~40%:** el servicio de Postgres existe y las dos
   primeras migraciones están escritas, pero **ninguna corrió**, no hay credencial y el
   workflow que las aplicaría **no existe**.
4. **El modelo de datos de `ALMACEN.md` NO soporta el histórico que se quiere.** No hay
   tabla de machote, ni versión, ni congelado de precio o tipo de cambio. Es un hueco de
   diseño, no un pendiente de implementación.
5. **Lo urgente no es Postgres, es el respaldo.** Un exportar/importar cuesta una sesión y
   quita el riesgo de pérdida hoy; Postgres bien hecho cuesta tres o cuatro.

---

## 1. Almacenamiento actual

### 1.1 Qué guarda exactamente `fts_machote_v1` ✅

Una sola llave de `localStorage` con **todo el módulo dentro**, reescrita completa en cada
guardado (`comercial/machote/js/almacen.js:63-69`):

```json
{ "v": 1, "guardado_at": "<ISO>", "machotes": [ … ], "handoff": { … } }
```

Cada machote, leído del motor (`calc.js:machoteNuevo`), trae **24 campos**:

| grupo | campos |
|---|---|
| identidad | `id`, `nombre`, `cliente`, `cliente_id`, `so`, `estado`, `analista`, `fecha` |
| dinero | `empresa_id`, `moneda`, **`tc`**, **`factor_proteccion`**, **`tc_fuente`** |
| precio | `margenes{programador,mano_obra,materiales,servicios}`, `comision_fts`, `comision_cliente`, `margen_deseado`, `escenario` |
| reparto | `reparto{venta,operaciones}`, `equipo_venta[]`, `equipo_operaciones[]`, `equipo_cliente[]` |
| contenido | `diagnostico{tipo,respuestas}`, **`secciones[]`** |

Y sí, **está todo lo que importa**:

- **Secciones completas** — cada una `{id, nombre, margenes, mo[10], partidas[30]}`.
- **Multiplicadores por sección** (V1.15) — `margenes` propio de cada sección.
- **Renglones de mano de obra** — `{rol, qty, personas, pu, moneda}`.
- **Renglones de materiales** — `{qty, unidad, tipo, descripcion, modelo, marca, pu, moneda, margen, link, comentario}`.
- **Comisiones** — a nivel machote, como debe ser.
- **Moneda y tipo de cambio** — `moneda` del documento, `moneda` por renglón, `tc`,
  `tc_fuente` y `factor_proteccion`.

**Dos huecos que sí importan para lo que se quiere construir encima:**

- ⚠️ **`analista` nunca se llena.** `vNuevo()` no lo pasa, así que `d.analista || ''`
  deja cadena vacía en **todo machote real**. Solo los cuatro de demostración lo traen.
  **Los machotes que Montalvo, Ricardo y Esteban están capturando hoy no dicen quién los
  capturó.** Verificado por grep: el campo solo se escribe en `demo.js`.
- ⚠️ **`modelo` y `marca` siguen en el objeto** aunque V1.14 les quitó la columna. No
  estorban, pero al diseñar la tabla hay que decidir si se conservan.

### 1.2 ¿`almacen.js` es de verdad la única costura? ✅ **Sí**

Barrido de **toda** escritura a `localStorage`/`sessionStorage` en `comercial/` y `shared/`:

| Quién escribe | Qué llave | ¿Es del machote? |
|---|---|---|
| `machote/js/almacen.js` | `fts_machote_v1` | **sí — el único** |
| `machote/js/app.js:257` | `fts_suite_avisar_password` | no, aviso de sesión |
| `shared/auth-jwt.js` | `fts_suite_session` | no, la sesión |
| `shared/config-sync.js`, `shared/admin/*` | `ops_*`, `key_*` | no, otros módulos |

**Solo `app.js:48` referencia `MachoteAlmacen`.** La pantalla no sabe contra qué guarda,
que es exactamente como se diseñó. **Migrar a Postgres cambia el cuerpo de `leer` y
`escribir`, y nada más.** Es la mejor noticia de esta auditoría.

⚠️ **Pero el origen de `localStorage` es compartido.** `yinyo1.github.io` es un solo
origen para toda la suite: la cuota no es del machote, se reparte con `ops_kiosk_*`,
`key_*`, sesiones y todo lo demás. El techo real es menor que el nominal.

### 1.3 Tamaño y cuántos caben ✅ medido

Medido serializando el motor real (`calc.js` + `demo.js`) fuera del navegador:

| | bytes JSON |
|---|---:|
| Machote **en blanco**, 1 sección | **5,941** |
| Una sección vacía (10 MO + 30 partidas) | 5,101 |
| Machote de demostración mayor (`M-1041`) | 3,145 |
| **Machote lleno proyectado** (4 secciones × 25 partidas con descripción y link) | **35,512 (34.7 KB)** |

> Un machote **real recién creado pesa más que los de demostración**: los de demo se
> escribieron a mano con pocos renglones, mientras que cada sección real nace con 40.

**Cuántos caben** (🟡 supuesto: cuota de 5 MB por origen y 2 bytes por carácter, que es
como los navegadores contabilizan UTF-16; ninguna de las dos cosas la medí contra un
navegador real):

| tamaño | caben |
|---|---:|
| en blanco | ~441 |
| lleno proyectado | **~73** |

**Setenta y tres machotes llenos, compartidos con el resto de la suite en el mismo
origen.** No es un problema de este trimestre, pero tampoco es holgura infinita — y el
modo de falla importa: `escribir()` devuelve `false` al llenarse y **el pulso se queda en
"sin guardar"**, que es visible pero fácil de ignorar mientras se captura.

### 1.4 ¿Hay exportar o importar? ✅ **No. Nada.**

Cero coincidencias de `download`, `Blob`, `createObjectURL`, `exportar`, `importar`,
`.csv` o `clipboard` en todo el módulo. **La única salida de los datos es la pantalla.**

---

## 2. Qué tan lejos está la persistencia en servidor (#140)

### 2.1 Lo que ya está escrito ✅

`docs/comercial/ALMACEN.md` (159 líneas, en `main` desde `2dd891c`) está **bien hecho y
sirve**: la decisión Postgres vs Data Tables con su razonamiento, el servicio y su
configuración, las seis reglas de fundación con **cómo las hace cumplir el esquema y no el
código** (sin `DELETE` al rol, `updated_at` por trigger, `evidencia_id NOT NULL`), el paso
manual del rol y el diseño del runner de migraciones.

**Lo que le falta es justo lo del machote:** el documento cubre `evidencia`, `propuesta` y
`expediente` — la capa de ingesta de 1.0 — y **no menciona el machote ni una vez**.

### 2.2 Migraciones ✅

| archivo | qué hace | ¿corrió? |
|---|---|---|
| `001_fundacion.sql` | esquema `comercial`, rol `comercial_app`, `public.schema_migrations`, trigger de auditoría | **NO** |
| `002_evidencia_propuesta_expediente.sql` | las tres tablas de 1.0 | **NO** |
| `003_machote.sql` | — | **no existe** |

**Ninguna corrió, y no podían:** no hay credencial de Postgres en n8n y no hay runner.
`public.schema_migrations` es la prueba que faltaría, y no se puede leer todavía.

### 2.3 El workflow `comercial/db-migrate` ✅ **No existe**

`search_workflows("db-migrate")` → **0 resultados**. Está **diseñado** en `ALMACEN.md`
(lee los `.sql` por SHA fijo, verifica sha256, aplica en transacción, escribe la bitácora)
y **no construido**.

Los cinco workflows `comercial/*` que sí existen:

```
comercial/limpieza-2026-08          buJ1oxU7OpwVCxlk   active:false
comercial/clientes                  RyeFlCTdLu301Gjz   active:false   ← V1.14, sin activar
comercial/pipeline (T3)             60ZLskz1xJ7nU5kt   active:false
comercial/captura (T3)              tEra7MVCvnWjAqjR   active:false
comercial/watchdog-enviadas         hJNTUd8E57W4rfjU   active:false
```

⚠️ **`auth/comercial-login` (`GhSt6pNUDhL0e0hx`) ya no existe.** El reporte de la sesión 2
lo daba por creado. Hoy no aparece ni buscando `auth` ni buscando `comercial`. Ver §3.1.

### 2.4 Railway ✅

**El servicio existe**, con el id exacto que documenta `ALMACEN.md`:

```
proyecto cheerful-comfort  4f4b4d53-3d88-4204-9d8e-b5a4fd8db846 / production
  fts-suite-db   26d65170-10f3-4d3e-9661-61ed6c89e3e0   ← el almacén
  Primary        b5168f3e-…   (n8n)
  Postgres       9f5091f8-…   (la base operativa de n8n, otra cosa)
  Worker         ef4110d9-…      Redis   b2be579f-…
```

⛔ **No leí las variables del servicio, a propósito.** `list-variables` documenta que
*"con un token de Railway los valores se devuelven en texto plano y pueden contener
secretos"*, y `POSTGRES_PASSWORD` vive ahí. Es la regla de CLAUDE.md §9 que ya costó rotar
la `ODOO_RPC_KEY`. **Queda sin verificar si `POSTGRES_PASSWORD` se resolvió o quedó como
el literal `${{secret(40)}}`** — el mismo pendiente que la sesión 2 dejó abierto.

**Lo que sí pude verificar del lado de n8n:** las credenciales son **seis, y ninguna es
Postgres** (Odoo ×3, GitHub, Anthropic, Graph). Confirmado: el paso manual nunca se dio.

### 2.5 Los pasos que requieren mano humana

De una sentada, en este orden. **Los cuatro primeros son obligados; sin ellos no hay
almacén.**

| # | Qué | Dónde | Por qué no se puede automatizar |
|---|---|---|---|
| 1 | Mirar `POSTGRES_PASSWORD` de `fts-suite-db`; si dice `${{secret(40)}}` literal, cambiarla | Railway | leerla desde aquí la metería al transcript |
| 2 | `ALTER ROLE comercial_app WITH LOGIN PASSWORD '<nueva>';` contra `fts_suite` | consola SQL de Railway | el rol nace `NOLOGIN` a propósito, para no meter un secreto a git |
| 3 | Crear credencial Postgres en n8n: `fts-suite-db.railway.internal:5432`, base `fts_suite`, usuario `comercial_app`, SSL off | n8n | el secreto no pasa por el repo |
| 4 | Marcar **Available in MCP** en el workflow del runner cuando exista | n8n | el API no lo expone |
| 5 | Activar `comercial/clientes` (`RyeFlCTdLu301Gjz`) | n8n | pendiente desde V1.14; el API rechaza activar |

**Tiempo de Esteban: ~15 minutos.** Todo lo demás lo hace CC.

---

## 3. Interacción con el resto de la suite

### 3.1 Identidad — ✅ y con una divergencia que hay que resolver

Lo que **corre hoy**: `comercial/login.html` y `machote/index.html` cargan
`shared/auth-jwt.js` → `SuiteAuth` → **`auth/suite-login`** (`kLhyPxVSMbDRwxfC`, **activo**,
issue #136), sesión en `fts_suite_session`, scope **`comercial:read`**.

Lo que **#140 planeó**: `auth/comercial-login` con `fts_com_session`, `roles[]` y `dndole`.

**Son dos diseños distintos y el segundo ya no existe.** El módulo convergió al login
único de la suite — que es hacia donde apuntaba #140 §A ("cuando exista un login único
de toda la suite, solo cambie quién firma el token"), así que **la divergencia se resolvió
sola y para bien**. Lo que falta es escribirlo: hoy `ALMACEN.md` y #140 describen un
emisor que no está.

⚠️ **Y hay un tercer camino de auth vivo en el repo:** `comercial/js/comercial-client.js`
usa `FinAuth` (el JWT de **Finanzas**) + un HMAC de dispositivo en `localStorage`. El
machote **no lo usa**, pero está ahí y apunta a otro emisor.

**Consecuencia directa para el almacén:** el token de `auth/suite-login` trae `sub` y
`nombre`. **Ahí está el autor que `analista` no tiene.** Al mover a Postgres, `created_by`
sale del token, no de un campo que nadie llena.

### 3.2 Clientes desde Odoo ✅

`machote/js/clientes.js` → `POST comercial/clientes` con el token en el cuerpo. Guarda
`cliente_id` (el `res.partner`) y lee el nombre vivo. **El workflow sigue inactivo**, así
que hoy el campo degrada a texto libre y lo avisa — por diseño.

**Esto ya es la mitad del patrón que Postgres necesita:** referencia por id, nombre por
lectura. Es exactamente la regla 6 de fundación.

### 3.3 Handoff a Odoo ✅ **no escribe nada**

El machote hace **exactamente una** llamada de red en todo el módulo: la de clientes.
`grep fetch(` sobre `machote/js/*.js` devuelve **una sola línea**.

"Enviado a Odoo" es hoy **un cambio de estado local**: congela la edición
(`congelado: true`), exige `so` (`exige_so`) e impide borrar (`sin_borrar`). **No existe
la orden en Odoo.** El README ya lo dice; lo confirmo.

### 3.4 `fts_archivos` ✅ **no existe**

Issue #125, abierto, sin construir. Solo aparece citado en documentos. **Nada del machote
depende de él hoy**, y el PDF de propuesta y los adjuntos de evidencia sí lo necesitarán.

### 3.5 Qué se rompe al cambiar de localStorage a Postgres

**Lo que NO debe cambiar — y hoy no tiene por qué:**

| | por qué aguanta |
|---|---|
| `calc.js`, `reglas.js`, `pegar.js` | no saben que existe un almacén |
| La pantalla | habla con `MachoteAlmacen`, no con `localStorage` |
| El pulso de autoguardado | ya distingue guardado / sin guardar / guardando |
| La máquina de estados | es del dato, no del almacén |

**Lo que sí se rompe, y hay que resolver antes de escribir la primera línea:**

1. **`leer`/`escribir` son síncronos.** `escribir()` devuelve `true`/`false` de inmediato y
   `app.js` lo usa así. Contra un webhook eso es una promesa. **La firma cambia, y con
   ella el pulso y el arranque.** Es el trabajo real de la migración, no el SQL.
2. **Hoy se reescribe TODO el módulo en cada guardado.** Contra Postgres eso es mandar
   todos los machotes de la persona en cada tecla. **Hay que pasar a guardar uno.**
3. **No hay concurrencia hoy y sí la habrá.** Dos personas sobre el mismo machote, o la
   misma persona en dos pestañas: hoy el archivo es de cada quien y nadie pisa a nadie.
   Con almacén compartido, **el último en guardar gana y sin aviso** — salvo que la tabla
   lleve versión y el guardado la exija.
4. **`id` es `'M-' + Date.now()`.** Único en un navegador; **no único entre personas**.
   Dos capturando al mismo tiempo pueden colisionar. La regla 3 de fundación (UUID) lo
   resuelve, pero hay que mapear los ids ya capturados.
5. **Sin red no hay captura.** Hoy funciona con el avión en modo avión. Conviene mantener
   `localStorage` como caché de escritura pendiente, no tirarlo.

---

## 4. Rescate de lo ya capturado

**La buena noticia primero: publicar una versión nueva NO borra nada.** `localStorage` es
por origen y llave; `yinyo1.github.io` + `fts_machote_v1` siguen siendo los mismos después
de un deploy. **No hay prisa de minutos.** Lo que sí borra es limpiar datos del sitio,
cambiar de navegador o de equipo, y el modo privado.

**Por eso la única condición dura es: no cambiar la llave `fts_machote_v1` ni el formato
del sobre mientras no estén rescatados.**

### La propuesta: un botón, sin herramientas de desarrollador

En **V1.17**, dos botones en la pantalla de inicio del machote:

- **Exportar todo** → descarga `machotes-<persona>-<fecha>.json` con el blob completo más
  quién lo exportó (del token) y desde qué navegador. Un archivo, un clic.
- **Importar** → lee ese archivo y **fusiona por `id`**, sin pisar: si un `id` ya existe,
  entra como copia con marca de origen. Importar nunca debe poder destruir.

**El flujo con las tres personas:** cada quien abre el machote en **el mismo navegador
donde capturó**, presiona Exportar, y manda el archivo por Teams. Eso es todo. CC no
necesita sus máquinas y ellos no necesitan la consola.

**Por qué así y no de otra forma:**

- Un *bookmarklet* evita esperar a V1.17, pero pide pegar código en la barra de
  direcciones — para muchos navegadores es más fricción que un botón, y es exactamente el
  gesto que enseña a pegar código desconocido.
- La consola (F12) queda excluida por instrucción, y con razón.
- Exportar **también es la red de seguridad permanente**, no solo el rescate. Cuando exista
  Postgres, seguirá sirviendo para llevarse una copia.

⚠️ **Riesgo real del rescate:** si alguien capturó en **dos navegadores** (laptop y
teléfono), son **dos blobs distintos** y ninguno es el completo. Hay que preguntarlo
explícitamente, no suponerlo.

⚠️ **Y no sabremos quién capturó qué por el dato**, porque `analista` va vacío (§1.1): la
autoría saldrá del **archivo que cada quien mande**, no del contenido. El exportador debe
estampar `sub` del token para que a partir de ahí sí quede.

---

## 5. Diseño del histórico

### 5.1 La pregunta directa: ¿`ALMACEN.md` soporta versionado append-only con congelado?

**No. Y no es que le falte un campo: le falta la tabla.**

`ALMACEN.md` describe tres tablas — `evidencia`, `propuesta`, `expediente` — que son la
capa de ingesta de 1.0. **Ninguna guarda un machote.** No hay `machote`, ni
`machote_version`, ni partidas, ni precios. `003_machote.sql` no existe.

Lo que **sí** está y ayuda: las seis reglas de fundación son las correctas para lo que se
quiere (UUID propio, referencia externa a Odoo sin llave foránea, nada se borra por
permiso del rol, migraciones versionadas). **El cimiento sirve; el piso del machote no
está puesto.**

Y el rector ya lo pedía: #127 §4 2.x dice *"versión congelada en Postgres"* y *"Precios
versionados insert-only"*. **La intención está escrita desde agosto y el modelo no la
recogió.**

### 5.2 Qué le falta al dato de hoy para poder congelarse

| lo que se quiere | qué hay hoy | hueco |
|---|---|---|
| Cada revisión es versión nueva | `estado` congela **el mismo objeto** | **no hay cadena de versiones**: revisar sobrescribe |
| Precio de material congelado | `pu` por renglón | **sin fecha, sin fuente, sin confianza**. #127 pide `sin_dato` explícito y nivel de confianza; no existen |
| Tipo de cambio congelado | `tc`, `tc_fuente`, `factor_proteccion` **por machote** | el dato **existe** — pero al no haber versión, se pisa al editar |
| Cotizado contra ejecutado | — | sin versión congelada no hay contra qué comparar |

**El tipo de cambio es el caso más ilustrativo:** el campo ya está y ya se captura con su
fuente declarada. **No falta el dato, falta el renglón que lo guarde para siempre.**

### 5.3 Lo que habría que cambiar

Sin entrar en SQL — eso es de la sesión que construya —, la forma es:

- **`machote`** — la identidad estable: id propio, `odoo_lead_id`/`odoo_so_id` como
  referencia externa, dueño, cliente por `partner_id`. **Muta poco.**
- **`machote_version`** — **append-only**: número de versión, quién y cuándo, estado, y el
  documento completo congelado, incluidos `tc`, `tc_fuente` y los precios **tal como
  estaban**. Sin `UPDATE`: una versión no se toca. La regla 4 y el rol sin `DELETE` ya
  empujan hacia ahí; hay que quitarle también el `UPDATE` sobre esta tabla.
- **Las partidas**, si se quieren consultables (comparar cotizado contra ejecutado, o
  entrenar sobre ellas), **desnormalizadas por versión** — no una tabla de partidas que se
  edita, porque eso vuelve a pisar el histórico.

**La decisión de fondo que necesita criterio de Esteban, no mío:** ¿la versión guarda el
documento **como JSON** (`jsonb`) o **desarmado en columnas**? JSON es fiel al momento y
tolera que el machote cambie de forma —y va a cambiar—; columnas se consultan mejor. Mi
inclinación es **`jsonb` para el congelado + columnas para lo que se consulta** (totales,
margen, moneda, tc), pero es una decisión de arquitectura con consecuencias largas.

### 5.4 El costo de cambiarlo ahora contra después

**Ahora: casi cero.** Las tablas del machote **no existen**, y las tres que sí están
escritas **no se han aplicado**. Nacer con versionado es escribir `003_machote.sql` bien la
primera vez. **No hay datos que migrar, no hay código que reescribir, no hay nada que
romper.**

**Después: caro y del tipo que no se ve venir.** Si el machote nace sin versión y el equipo
captura tres meses, agregarla obliga a: migrar filas vivas a "versión 1" inventando fechas
y autores que nadie registró; decidir qué hacer con los que ya se sobrescribieron —cuyo
histórico **ya no existe y no se puede reconstruir**; y cambiar todo el código que asume
"un machote es una fila".

**El punto que decide:** los machotes que se están capturando **esta semana** son los
primeros datos reales. Si el almacén nace sin versión, **ese histórico no se pierde en el
futuro: ya se está perdiendo**, cada vez que alguien revisa una cotización y la sobrescribe.

---

## 6. Propuesta de corte en dos entregas

### V1.17 — respaldo inmediato · **una sesión**

**Objetivo único: que lo capturado deje de poder perderse.** Nada de servidor.

1. **Exportar todo** a JSON, con quién exportó (del token) y cuándo.
2. **Importar** con fusión por `id`, que nunca pisa.
3. **Estampar el autor**: `analista` (o mejor, `creado_por`) desde `sub` del token al crear.
   Es el campo que hoy va vacío y sin él no hay atribución.
4. **Aviso visible cuando `escribir()` devuelve `false`** — hoy solo se ve en el pulso.

**Por qué esto primero:** quita el riesgo de pérdida **hoy**, no depende de Railway ni de
n8n ni de que Esteban haga nada, y el exportador sigue sirviendo después. **Y el punto 3
es requisito del almacén compartido**, no un extra: sin autor, Postgres no sabe de quién es
cada machote.

### #140 — persistencia real · **tres a cuatro sesiones**

| # | Qué | Depende de |
|---|---|---|
| 1 | **Decidir la forma del histórico** (§5.3): `jsonb` vs columnas | criterio de Esteban |
| 2 | `003_machote.sql` con `machote` + `machote_version` append-only | #1 |
| 3 | Construir `comercial/db-migrate` y **aplicar 001, 002 y 003** con read-back | los 3 pasos manuales |
| 4 | Dos webhooks: leer los machotes de la persona, guardar uno | #3 |
| 5 | Reescribir `almacen.js` a asíncrono, guardando **uno**, con `localStorage` como caché de pendientes | #4 |
| 6 | Importar los JSON del rescate | V1.17 |

**El orden importa:** #1 antes que #2, y **los tres pasos manuales antes que #3**. Sin la
credencial, la sesión que intente aplicar migraciones se detiene igual que la sesión 2.

---

## 7. Riesgos y supuestos

### Verificado en este turno ✅

- `almacen.js` es el único escritor del machote — barrido completo de `comercial/` y `shared/`.
- No existe exportar ni importar — cero coincidencias.
- `analista` solo se escribe en `demo.js`; en machotes reales va vacío.
- Tamaños: 5,941 B en blanco · 35,512 B lleno proyectado — medidos sobre el motor real.
- `fts-suite-db` existe en Railway con el id documentado.
- n8n tiene 6 credenciales y **ninguna es Postgres**.
- `comercial/db-migrate` **no existe**; `auth/comercial-login` **tampoco**.
- `comercial/clientes` sigue `active: false`.
- El machote hace **una sola** llamada de red; no escribe a Odoo.
- `001` y `002` están en `main` (`2dd891c`); no hay `003`.

### Supuesto, no verificado 🟡

- **Cuota de 5 MB y 2 bytes por carácter.** Es la contabilidad habitual de los navegadores;
  **no la medí contra ninguno**. El número de "~73 machotes" se mueve con esa premisa.
- **Que las tres personas capturaron cada quien en un solo navegador.** Si alguien usó dos,
  hay dos blobs parciales. **Hay que preguntarlo.**
- **Que las migraciones nunca corrieron.** Lo infiero de que no hay credencial ni runner;
  la prueba dura sería leer `public.schema_migrations`, y no se puede sin credencial.
- **Que nadie limpió datos del sitio.** Si alguien lo hizo, ya se perdió y no hay rastro.

### No ejecutado a propósito ⛔

- **Las variables de Railway.** `list-variables` devuelve secretos en texto plano y
  `POSTGRES_PASSWORD` está ahí. **Sigue sin verificarse si se resolvió.**

### Riesgos

| riesgo | probabilidad | qué cuesta | mitigación |
|---|---|---|---|
| Alguien limpia datos del sitio antes del rescate | baja | su captura completa | V1.17 ya |
| Se cambia la llave o el sobre antes de rescatar | baja | todo lo capturado | **no tocar `fts_machote_v1`** |
| El almacén nace sin versionado | **alta si no se decide** | el histórico, para siempre | §5.3 antes de `003` |
| Dos personas pisan el mismo machote | media, al compartir | el trabajo del que perdió | versión en la tabla desde el día uno |
| `id` colisiona entre personas | baja | dos machotes fusionados | UUID en la migración |

---

## 8. Estimación

| entrega | sesiones | de Esteban |
|---|---:|---|
| **V1.17** exportar/importar/autor | **1** | 0 — solo pedir a los tres que exporten |
| Decidir forma del histórico | — | una lectura y un "va" |
| Los tres pasos manuales | — | **~15 min** |
| `003` + runner + aplicar | 1 | marcar Available in MCP |
| Webhooks + `almacen.js` asíncrono | 1–2 | — |
| Importar el rescate | dentro de la anterior | — |
| **Total #140** | **3–4** | ~20 min |

🟡 **Supuesto de la estimación:** que los tres pasos manuales se hacen **antes** de la
sesión que aplica migraciones. Si no, esa sesión se detiene sin construir nada — ya pasó
en la sesión 2, y es el riesgo de calendario más real de los que hay aquí.
