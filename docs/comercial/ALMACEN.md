# Almacén de la suite — Postgres

**Estándar de toda la suite, no solo de comercial.** Decidido en el issue #140.

Odoo es la base de datos del resultado. Este almacén es el taller: guarda **solo lo que
Odoo no sabe modelar**, y se liga a Odoo por referencia, nunca por copia.

---

## Por qué Postgres y no n8n Data Tables

La comparación completa está en el issue #140. En corto: el nodo Data Table v1.1 ofrece
`get`/`insert`/`update`/`upsert`/`deleteRows` sobre tablas planas de `string`, `number`,
`boolean` y `date` — **sin join, sin agregación, sin SQL, sin transacción y sin llave
foránea**. El esquema de 1.0 ya es relacional (`propuesta → evidencia`), y el machote
futuro con BOM y versiones congeladas lo es mucho más.

Data Tables se quedan donde son buenas: blobs por renglón sin relaciones, como
`incidencias_media`. No es que no sirvan; es que no son un almacén relacional.

---

## El servicio

Railway, proyecto `cheerful-comfort`, entorno `production`:

| | |
|---|---|
| Servicio | **`fts-suite-db`** · `26d65170-10f3-4d3e-9661-61ed6c89e3e0` |
| Imagen | `postgres:17-alpine` (corriendo 17.11) |
| Base | `fts_suite` |
| Volumen | `fts-suite-db-data` · `ab07276a-4741-456b-8d5d-3521e9442445` en `/var/lib/postgresql/data` |
| `PGDATA` | `/var/lib/postgresql/data/pgdata` |
| Checksums | activados (`--data-checksums`) |
| Red interna | `fts-suite-db.railway.internal:5432` |

**Es un servicio aparte del Postgres de n8n, a propósito.** La base de n8n tiene un dueño
—n8n— y meterle datos de aplicación es darle dos: un restore para arreglar un problema de
n8n haría rollback del expediente sin que nadie lo pida.

⚠️ **`PGDATA` apunta a un subdirectorio del volumen, no a su raíz.** Un volumen recién
creado trae `lost+found`, e `initdb` se niega a inicializar sobre un directorio no vacío.
Montar en la raíz es el error clásico de este montaje.

---

## Las seis reglas de fundación

Fijadas por Esteban en #140. **El almacén se crea con miras a que un día reemplace a
Odoo**; esto no cambia el alcance de 1.0, cambia cómo se construye para que crecer después
no exija rehacerlo.

### 1. Esquemas por dominio, no una bolsa plana
Las tablas de 1.0 viven en el esquema `comercial`, no en `public`. `operaciones`, `rrhh` y
lo que siga entran igual, cada uno con su rol. Lo único en `public` es
`schema_migrations`, que es de toda la suite.

### 2. Migraciones versionadas en git, desde el archivo cero
Cada cambio de estructura es un `.sql` numerado en `db/migrations/<dominio>/`, aplicado en
orden y registrado en `public.schema_migrations` con el **sha256 real del archivo**.
**La base nunca se toca a mano ni con DDL improvisado desde un nodo.** Debe poder
recrearse desde cero corriendo los archivos en orden.

> El renglón de bitácora lo inserta el runner, no el propio `.sql`: un archivo no puede
> contener su propio hash, y un checksum inventado es peor que no tenerlo.

**Las migraciones viven en `db/` en la raíz, no dentro del módulo** (decisión de Esteban,
6-sep): la base es un recurso de **toda la suite**, no del módulo comercial. Un `.sql` de
`rrhh` no puede vivir bajo `comercial/` sin mentir sobre a quién pertenece.

```
db/
  README.md                    ← cómo se aplican, y las dos credenciales
  migrations/
    comercial/                 ← 001, 002, 003
    rrhh/                      ← cuando exista
    proyectos/                 ← cuando exista
```

**La numeración es GLOBAL, no por carpeta.** El siguiente archivo de cualquier dominio
toma el número que sigue al más alto que exista en todo `db/migrations/`. La carpeta dice
de qué dominio es; el número dice en qué orden se aplicó a **esta** base, que es una sola.
Numerar por carpeta produciría dos `004` distintos y un orden de aplicación ambiguo.
El detalle operativo completo está en [`db/README.md`](../../db/README.md).

### 3. Llaves primarias propias (UUID), no ids de Odoo
Toda tabla tiene `id uuid DEFAULT gen_random_uuid()`. El id de Odoo entra como
**referencia externa** (`odoo_lead_id`), sin llave foránea contra nada. El día que un
dominio salga de Odoo, los datos no quedan apuntando a ids que dejaron de existir.

### 4. Nada se borra
`created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` en toda tabla. Sin
`DELETE` físico.

**Y no queda encomendado a que el código se acuerde:** al rol `comercial_app` **no se le
otorga `DELETE`**. La base no acepta el borrado; el borrado lógico es un `UPDATE` de
`deleted_at`. `updated_at` lo pone un trigger, por la misma razón — un campo de auditoría
que depende de que cada escritura lo recuerde, tarde o temprano no se pone.

### 5. Un rol por aplicación, permisos mínimos
n8n entra como **`comercial_app`**: `USAGE` en el esquema `comercial` y `SELECT`/`INSERT`/
`UPDATE` en sus tablas. Nunca superusuario, nunca el dueño del esquema (`fts_admin`).
La credencial vive **solo** en n8n. Cada dominio que entre trae su propio rol
(`rrhh_app`, `proyectos_app`), con permisos **solo sobre su esquema**.

**Dos credenciales, no una** — la separación es lo que hace real el "permisos mínimos":

| Credencial n8n | Rol | Para qué | Quién la usa |
|---|---|---|---|
| `fts-suite-db · fts_admin` | `fts_admin` (dueño) | **DDL**: crear esquemas, tablas, roles | **solo** `comercial/db-migrate` |
| `fts-suite-db · comercial_app` | `comercial_app` | **datos**: leer y escribir las tablas de `comercial` | los webhooks de la aplicación |

`comercial_app` **no puede aplicar migraciones aunque se le pida**: `001` a propósito no le
da `CREATE` sobre el esquema. Y al revés, ningún webhook de aplicación toca la credencial
de `fts_admin`. Un webhook comprometido no puede alterar la estructura; el runner de
migraciones no anda leyendo datos de nadie.

### 6. No espejees Odoo
Postgres guarda **únicamente** lo que Odoo no modela. Nada de copiar clientes, leads,
montos u órdenes "por si acaso": dos verdades es exactamente el problema que la limpieza
de la sesión 1 acaba de resolver. Se referencia por `odoo_lead_id`, no se duplica.

---

## Las tablas de 1.0

`001_fundacion.sql` — esquema, rol, bitácora y el trigger de auditoría.
`002_evidencia_propuesta_expediente.sql` — las tres tablas.
`003_machote.sql` — el machote y su historial de versiones (abajo, sección propia).
`004_folio.sql` — el folio con el que se habla de una cotización (`COT-0042`).
Lo reparte una **secuencia** como `DEFAULT` de la columna, así que ningún código
tiene que acordarse de pedirlo y dos personas capturando a la vez no pueden
llevarse el mismo número. La forma legible es una **columna generada**
(`folio_txt`), para que el panel, el correo y el PDF no puedan citar folios
distintos del mismo machote. Diseño completo y decisiones abiertas en
[`FOLIO.md`](FOLIO.md).

| Tabla | Qué guarda | Regla que hace cumplir el esquema |
|---|---|---|
| `comercial.evidencia` | lo que alguien dijo o escribió, sin interpretar | `texto_literal NOT NULL` y no vacío |
| `comercial.propuesta` | lo que el motor sugiere hacer con una evidencia | **`evidencia_id NOT NULL`** — "sin cita literal no hay propuesta" (ROADMAP §3) es regla del esquema, no del código |
| `comercial.expediente` | lo que Odoo no modela: planta, compromiso, contra quién se perdió | un compromiso sin fecha ni dueño no es un compromiso |

Detalles que valen la pena:

- **`evidencia.odoo_lead_id` es NULLable a propósito.** Una evidencia sin amarrar es
  huérfana, y las huérfanas no se pierden: ahí aparecen los leads nuevos (ROADMAP §3).
  Tienen su propio índice porque son una bandeja de trabajo, no basura.
- **Dedupe por `hash` parcial** (`WHERE deleted_at IS NULL`): la misma cita no entra dos
  veces, y el borrado lógico libera el hash.
- **`propuesta.estado`** tiene un check que obliga a que una propuesta resuelta traiga
  `resuelto_por` **y** `resuelto_at`, las dos o ninguna.

---

## El machote y su historial (`003_machote.sql`)

Dos tablas. La forma sale de una decisión de Esteban (#140, 6-sep): **jsonb para el
documento congelado, más columnas para lo que se consulta**. El machote va a cambiar de
forma varias veces este año; columnas rígidas obligarían a una migración cada vez. Y a la
vez, filtrar por total o por margen leyendo jsonb en cada renglón no se sostiene.

| Tabla | Qué guarda |
|---|---|
| `comercial.machote` | la identidad: de quién es, contra qué lead/SO/cliente de Odoo va, y en qué estado está |
| `comercial.machote_version` | **una fila por versión guardada, para siempre** |

### El historial se comporta como el de SharePoint, con dos diferencias

Cualquier versión anterior se abre y se ve **completa tal como estaba** — por eso el
documento entero viaja congelado en `documento jsonb`, no un diff. Las diferencias:

1. **Ver no es restaurar.** No hay vuelta atrás: la orden se confirma con la última, y ésa
   queda como definitiva para crear las analíticas. En la pantalla eso significa que el
   botón de restaurar **no existe** — no está deshabilitado, no está. Prototipo:
   [`prototipos/historial-versiones.html`](prototipos/historial-versiones.html).
2. **El motivo es obligatorio cuando cambian las comisiones o el margen.** El caso real que
   lo motivó: un machote modificado al final para cambiar el reparto de comisión, sin que
   quedara rastro de por qué.

### Lo que hace cumplir el esquema, no el código

- **`mv_exige_motivo`** — trigger `BEFORE INSERT`: compara contra la versión anterior y si
  cambió `comision_fts`, `comision_cliente` o `margen` sin `motivo`, rechaza el `INSERT`
  nombrando qué cambió. Un frontend que se le olvide pedirlo no puede colar el cambio.
- **`mv_version_consecutiva`** — la versión nueva tiene que ser exactamente la última + 1.
  Junto con `UNIQUE (machote_id, version)` da el bloqueo optimista: dos personas guardando
  encima de la misma versión leída, la segunda choca en vez de pisar a la primera.
- **Append-only por permisos, no por disciplina.** A `comercial_app` se le dan `SELECT` e
  `INSERT` sobre `machote_version`, y se le **revoca `UPDATE`** explícitamente (`001` da
  `UPDATE` por default a todas las tablas futuras del esquema — sin ese `REVOKE` el
  append-only se rompería en silencio). Una versión guardada no se puede modificar ni
  borrar desde la aplicación. Ni con un bug, ni a propósito.

Las tres cosas están **probadas contra la base real**, entrando como `comercial_app` —el
rol que de verdad escribe— y no sólo contra un Postgres local: motivo exigido y aceptado,
choque de concurrencia, y `UPDATE`/`DELETE` rebotando con `permission denied`.

> ⚠️ **En estos `.sql` no se usa `$$` para citar un cuerpo de función.** Se usan etiquetas
> con nombre (`$rol$`, `$touch$`, `$motivo$`, `$consec$`) porque el runner mete el archivo
> en el nodo con `={{ $json.sql }}` y **en esa sustitución `$$` se colapsa a un solo `$`**.
> El archivo sale bien del repo y llega mutilado a Postgres. Medido aplicando la `001`.
> El detalle y los otros patrones que muerden igual (`$1`, `$&`, `` $` ``, `$'`) están en
> [`db/README.md`](../../db/README.md), regla 4.

---

## Estado: EN PRODUCCIÓN desde el 7-sep-2026

Las tres migraciones están aplicadas contra `fts_suite` y verificadas con read-back:

```
migraciones       001, 002, 003
esquemas          comercial, public
tablas comercial  evidencia, expediente, machote, machote_version, propuesta
roles             comercial_app (LOGIN, sin CREATE sobre el esquema), fts_admin
```

Y los dos endpoints de la aplicación, **INACTIVOS** hasta que Esteban dé el va:

| workflow | id | qué hace |
|---|---|---|
| `comercial/machotes-leer` | `Lze4jmkW9pg7Tvad` | sin `machote_id`: la última versión de cada machote · con `machote_id`: todas las de ése |
| `comercial/machote-guardar` | `18FIeK835R6h96K3` | crea o reusa la identidad por `id_local` y **agrega UNA versión** |

Los dos usan `fts-suite-db · comercial_app`. **El dueño sale del token (`ses.actor`),
nunca del cuerpo**, y guardar sobre el machote de otra persona se rechaza con
`MACHOTE_DE_OTRA_PERSONA` — probado, no supuesto.

> ⚠️ **Los webhooks exigen `comercial:read`, no `comercial:write`.** Hoy **ninguno** de los
> seis usuarios del módulo tiene scope de escritura (leído de `suite_usuarios`). Exigirlo
> dejaría a los capturistas sin poder guardar desde el primer día — el lado estricto
> desplegado primero, que es lo que prohíbe la regla anti-trabón de `CLAUDE.md` §8. Lo que
> protege no es el scope sino la propiedad. Para separar lectura de escritura el orden es:
> **primero** agregar el scope a las filas, **después** endurecer el webhook.

---

## Los dos pasos que no están en git, a propósito

Ninguna contraseña entra al repo, así que las dos credenciales las crea un humano a mano,
una sola vez. **El orden importa: sin la primera, el runner no se puede conectar y no
aplica ni la migración `001`.**

### Paso 1 — la credencial de DDL (`fts_admin`)

`fts_admin` **ya existe** (lo crea Railway al levantar el servicio) y su contraseña vive en
la variable `POSTGRES_PASSWORD` del servicio. No hay nada que crear en la base: solo hay
que darle esa contraseña a n8n, en una credencial Postgres llamada
**`fts-suite-db · fts_admin`**:

```
host      fts-suite-db.railway.internal
port      5432
database  fts_suite
user      fts_admin
password  el valor de POSTGRES_PASSWORD del servicio fts-suite-db
SSL       deshabilitado (red privada de Railway)
```

⚠️ Ese valor se copia **desde la pestaña Variables del servicio en Railway directo a n8n**.
No pasa por el chat, ni por un issue, ni por un archivo.

### Paso 2 — la credencial de aplicación (`comercial_app`)

El rol `comercial_app` lo crea la migración `001`, **`NOLOGIN` y sin contraseña**: ponerle
una en un `.sql` versionado sería meter un secreto al repo. Así que **después de aplicar
`001`**, en la Console del servicio `fts-suite-db`:

```
PGPASSWORD=$POSTGRES_PASSWORD psql -U fts_admin -d fts_suite
\password comercial_app        ← la pide dos veces y NO la muestra en pantalla
ALTER ROLE comercial_app WITH LOGIN;
```

`\password` se usa en vez de `ALTER ROLE … PASSWORD '…'` a propósito: el segundo dejaría
la contraseña en claro en el historial de `psql` y en los logs del servidor.

Y con ella, la segunda credencial en n8n, **`fts-suite-db · comercial_app`**: los mismos
`host`/`port`/`database`/`SSL` de arriba, con `user comercial_app` y esa contraseña.

---

## Cómo se aplican las migraciones

Por el workflow n8n **`comercial/db-migrate`** (id `4hyzXjkr31h8DPPS`), que lee los `.sql`
del repo **por SHA fijo** (no por rama), verifica el `sha256`, los aplica dentro de una
transacción y escribe el renglón de `public.schema_migrations`. Mismo patrón que
`comercial/limpieza-2026-08`: n8n ejecuta un artefacto congelado, no improvisa.

Nace INACTIVO y se dispara a mano. Usa la credencial **`fts-suite-db · fts_admin`** — es el
único workflow que la toca.

Cómo se comporta, y por qué así:

- **Aplica UNA migración por corrida.** Se le dice cuál. Un runner que aplica "todas las
  pendientes" convierte un error en la 003 en un estado a medias que nadie pidió.
- **Se niega si hay un hueco.** Si le piden la 003 y la 002 no está aplicada, para.
- **Detecta el archivo editado.** Si el `sha256` de un `.sql` ya aplicado no coincide con
  el de la bitácora, responde `CHECKSUM_DISTINTO` y no hace nada. Una migración aplicada
  no se edita: se escribe otra.
- **Reporta desde un read-back contra la base**, no desde el `success` del nodo — la misma
  regla de §8 de `CLAUDE.md`: el estado del proceso no sustituye al del destino.

---

## Respaldo

El volumen `fts-suite-db-data` entra en los respaldos de volumen de Railway. Para una
salida independiente del proveedor, `pg_dump` contra la red privada.

⚠️ **Pendiente:** no hay respaldo programado propio todavía. Mientras el almacén esté
vacío no urge; **antes de que entre el primer dato real, sí.**

---

## El tablero de dirección (`comercial/machotes-control`)

**Workflow `PLAw9IYGgMh0PRPL`. INACTIVO** — lo activa Esteban en la UI, como los otros dos.

Contesta una pregunta distinta de la de `machotes-leer`, y por eso es otra puerta:

| | `machotes-leer` | `machotes-control` |
|---|---|---|
| pregunta | ¿qué hay **de lo mío**? | ¿cuánto hay **de cada quien**? |
| scope | `comercial:read` | `comercial:admin` |
| devuelve | los machotes con su documento | sólo conteos y fechas |

**No devuelve ni un documento, ni un nombre de cotización, ni un monto.** Un tablero de
dirección no necesita el contenido, y no mandarlo es la diferencia entre «cuántos llevas»
y «déjame leer lo tuyo».

La suma la hace Postgres con un `group by dueno`; el navegador no podría calcularla porque
sólo conoce lo suyo.

### El permiso, y dónde vive de verdad

`comercial:admin` nació sin dueño a propósito: **primero la puerta, después la llave**.
Mientras tanto la pantalla no era un callejón — decía qué faltaba y enseñaba, marcado como
demostración, cómo se iba a ver.

> ⚠️ **Corrección (8-sep-2026).** Aquí decía que el permiso se daba con
> `UPDATE comercial.suite_usuario SET scopes = …`. **Esa tabla no existe** — no la crea
> ninguna migración, y el SQL nunca se ejecutó. Los usuarios de la suite **no viven en
> Postgres**: viven en una *Data Table* de n8n llamada `suite_usuarios`
> (`YWCP0KoVmgxX2RzL`, proyecto `eWfPdSbGqqG91Eja`), que es de donde `auth/suite-login` las
> lee. La columna `scopes` es **una cadena separada por comas**, no un arreglo de Postgres.

Dárselo sigue siendo un campo, pero se edita en la Data Table:

| columna | antes | después |
|---|---|---|
| `scopes` de `esteban.delacruz` | `comercial:read` | `comercial:read,comercial:admin` |

El MCP de n8n **no tiene herramienta para editar una fila** de una Data Table (sólo crear y
leer), así que el cambio se hace desde la UI de n8n o con un workflow que use el nodo
`Data Table` (`resource: row`, `operation: update`, que además trae `dryRun`).

**Aplicado el 8-sep-2026, sólo a Esteban** (`updatedAt 2026-09-08T03:20:44Z`, leído de vuelta).
Los otros siete usuarios siguen sin `comercial:admin`.

No va en una migración porque es un **permiso**, no una estructura — y porque la estructura
está en otro sistema.

### Verificado en vivo contra la base real (7-sep-2026)

| ejecución | token | resultado |
|---|---|---|
| `89656` | con `comercial:admin` | `ok:true` · 1 machote · 2 versiones · 1 persona — que es exactamente lo que hay |
| `89719` | sólo `comercial:read` | `NO_AUTORIZADO`; **el nodo de Postgres ni siquiera corrió** |
| `89653` | token vencido | `TOKEN_EXPIRADO` — y no `FIRMA_INVALIDA`, que es la prueba de que la firma se verificó bien |

Ese tercer renglón es el que vale doble: la cripto del workflow tuvo que viajar por el
MCP como texto, y un solo carácter cambiado en el SHA-256 habría dado `FIRMA_INVALIDA`.
Que diga `TOKEN_EXPIRADO` prueba que el HMAC calcula el valor correcto.

### Límite honesto

Sólo aparece **quien ya subió algo**: quien nunca ha subido no tiene última vez. El
endpoint no conoce la lista del equipo, así que «4 personas» nunca quiere decir «el equipo
son 4». La pantalla lo dice con esas palabras.



---

## La sesión que no puede mentir (V1.21, 8-sep-2026)

**El defecto.** Esteban rotó `SUITE_JWT_SECRET`. A partir de ahí el navegador siguió
mandando el token viejo —que vive en `localStorage` y **no se borra con Ctrl+Shift+R**—, el
servidor lo rechazó con `FIRMA_INVALIDA`, y la franja de entonces dijo **«No se pudo
confirmar con el servidor»**. (La franja se retiró en V1.24 — ver
`docs/comercial/ANDAMIO.md`; la clasificación sesión/red/servidor que salió de este
incidente se quedó, y vive en `js/sesion.js`.)

Ese mensaje era falso y además el peor de los tres posibles: «no se pudo confirmar» invita
a esperar y reintentar, cuando lo que hacía falta era volver a entrar — y reintentar con un
token muerto no arregla nada. Se resolvió borrando la llave desde la consola del navegador.
Nadie más del equipo sabe hacer eso.

**Los tres casos, que antes decían lo mismo:**

| caso | qué pasó | qué hacer |
|---|---|---|
| **sesión** | el servidor contestó y dijo que la credencial no vale | volver a entrar. Reintentar NUNCA sirve |
| **red** | no hubo respuesta: sin internet, servidor caído, tiempo agotado | esperar. Lo capturado sigue aquí |
| **servidor** | contestó, con un error suyo | no es tu sesión; ni entrar de nuevo lo arregla |

`comercial/machote/js/sesion.js` los clasifica y les pone un texto distinto a cada uno.

**La regla dura:** al caducar se borra **SÓLO** `fts_suite_session`. Nunca `fts_machote_v1`
ni `fts_machote_sync_v1` — ahí hay captura real de tres personas, y una sesión vencida no
es motivo para perder trabajo. No queda al cuidado de quien escriba el código:

- las dos llaves están declaradas como `LLAVES_INTOCABLES`;
- antes de borrar se comprueba que la llave de sesión no coincide con ninguna, y si
  coincidiera **no borra nada** y lo dice por consola;
- hay una prueba que siembra las dos, caduca la sesión y exige que sigan **idénticas**.

**Dónde se engancha, y por qué ahí.** En `postear()` de `almacen.js` y en el `postear()` de
`cotizacion.js` — el único punto por el que pasa toda respuesta del servidor. En cada
llamador se habría olvidado en el primer endpoint nuevo; ahí no se puede.

---

## La demo no se sincroniza (V1.21)

El 8-sep se colaron **cuatro demostraciones a la base de producción** con `id_local`
`M-1041` … `M-1044`: la aplicación arranca con ellas en memoria, alguien tocó «Subir ahora»
y subieron como si fueran captura.

- **La marca va en ORIGEN**: `_demo: true` en los cuatro de `demo.js`.
- **El filtro va en `empujar()`** de `almacen.js` —el único sitio por donde sube todo—, más
  un segundo candado en `empujarUno()` por si alguien lo llama directo.
- **Se descuentan antes de contar**, tanto en `estadoServidor()` como en `pendientes()`.
  Si entraran, el aviso de la lista diría «4 sin subir» para siempre y nada podría bajar el
  número —los ejemplos no se suben—: un pendiente que no se puede resolver es peor que no
  avisar.
- Se conserva al editar: capturar encima de una demo la deja siendo demo. Para que deje de
  serlo hay que crear un machote nuevo — así nadie convierte por accidente un ejemplo en la
  cotización de un cliente.

**Cómo se identificaron con certeza, antes de borrar nada.** El `id_local` de los cuatro es
el **literal escrito a mano en `demo.js`** (`M-1041`…`M-1044`); la aplicación genera
`M-<epoch en milisegundos>` para toda captura real, así que ningún machote de verdad puede
llamarse así. Además los nombres coinciden carácter por carácter con `demo.js` y los cuatro
se crearon **en 1.7 segundos** (04:14:33.998 → 04:14:35.243), que es una subida en lote, no
alguien tecleando.

**Borrado lógico aplicado** (ejecución `90758`): 8 machotes visibles → 4. Los cuatro
borrados son los cuatro demos, todos de `esteban.delacruz`. **Los dos de
`ricardo.hernandez` no se tocaron**, ni el «Suministro de Pantalla HMI» ni el «Machote de
prueba Lifter robert» de Esteban — ésos son captura real y en la duda no se borra.

---

## `005_prestamo.sql` — el permiso temporal de escritura

`sha256 ba5b828eb89f51918217a8063847a3a57f6a906e22c458e30b922ea7321b8144`.
Aplicada a producción el 2026-09-10 por `comercial/db-migrate`, tras ensayo en
seco; el read-back del runner devolvió `migraciones: 001, 002, 003, 004, 005`.

Una tabla, `comercial.machote_prestamo`: quién presta un machote, a quién,
desde cuándo y hasta cuándo, y si se recogió antes de tiempo.

**El tope de 24 horas es un `CHECK` de la base**, no una validación de pantalla
ni de workflow — misma razón que el folio: una regla en un solo lugar es una
regla que ningún camino nuevo puede saltarse por olvido. Hay dos `CHECK` más
(vencer después de otorgar; nadie se presta a sí mismo) y un índice único
parcial que impide dos préstamos vivos del mismo machote a la misma persona.
Los tres se ejercieron contra un clúster local antes de aplicar; el detalle
está en `docs/comercial/PERMISO_TEMPORAL.md` §6.

**Sin `DELETE`,** como el resto del esquema: un préstamo no se borra, se
recoge. `revocado_at` es la marca; la traza de que existió es parte de lo que
hace auditable el permiso.

⚠️ La tabla existe y el candado de `machote-guardar` ya la consulta, pero
**todavía no hay manera de crear un préstamo** —el endpoint no está construido,
a la espera de las cinco decisiones abiertas de la propuesta— así que hoy la
tabla está vacía y el candado se comporta exactamente como antes.

## Cambios de V1.24 sin migración

Ninguno de estos tocó el esquema:

- **La lectura se abrió a todo el módulo.** `comercial/machotes-leer` dejó de
  filtrar por `dueno` y de mirar `comercial:admin`: cualquiera con
  `comercial:read` recibe los machotes de todos. El `actor` sigue saliendo del
  token y es lo único que marca qué filas son ajenas.
- **La traducción `id de pantalla -> uuid` acepta las dos formas.**
  `idServidor()` reconoce un uuid y lo devuelve tal cual, en vez de buscarlo
  siempre en la libreta de sincronización —que está indexada por `id_local` y
  sólo guarda lo propio—. Era la causa de que el historial de un machote ajeno
  contestara que no había subido.
- **La autoría ya estaba separada de la propiedad** y sigue igual:
  `machote.dueno` es de quién es, `machote_version.autor` es quién escribió esa
  versión, y el segundo sale del token. Vale la pena saberlo porque es la mitad
  del permiso temporal, ya construida.
