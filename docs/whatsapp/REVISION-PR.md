# Guía para revisar y mergear el PR #327 (Memoria FTS / WhatsApp)

Para Esteban. Tiempo estimado: unos 45 minutos de lectura, más 5 minutos de verificación después del merge.
Estado al escribir esta guía (28-sep, 03:15 CST):

| qué | estado |
|---|---|
| head | `0dbc0cc` |
| conflictos con `main` | ninguno (`git merge-tree` limpio contra `5ba0f6a`) |
| CI `memoria` | **verde**, run 36401432420 |

Nada del PR está desplegado por el merge. Railway lee código por SHA de commit fijo (ver §5), y n8n y la base ya
tienen lo suyo aplicado. **Mergear no cambia nada en vivo.**

---

## 1. Qué contiene: 47 archivos, ~7,790 líneas, todas nuevas

Contado con `git diff --numstat origin/main...HEAD`.

| área | archivos | líneas | qué es |
|---|---:|---:|---|
| **Migraciones** `db/migrations/memoria/` | 7 | 2,307 | `memoria_0001`…`0007`. **Ya están aplicadas en vivo** (bitácora en `schema_migrations`); el PR sólo las pone en el repo |
| **Receptor** `whatsapp/receptor/` | 4 | 1,123 | `index.ts` (399), `autoprueba.ts` (138), `cargador.ts` (14), y `dist/receptor.js` (572), que es el **paquete generado**, no código a leer |
| **Mantenimiento** `whatsapp/mantenimiento/` | 3 | 328 | `mantenimiento.sh`: contraseñas de roles, particiones, respaldo, prueba de restauración, instancia de Evolution. `poda.ts` y su prueba: poda **simulada** |
| **Motores y n8n** `whatsapp/n8n/` | 5 | 201 | Código de los workflows `memoria/db-migrate` y `memoria/motor-avance` y el SHA-256 en JS puro. **La lógica de los motores vive en SQL** (0003–0007), no aquí |
| **Cargador del histórico** `whatsapp/historico/` | 7 | 519 | parser, lector ZIP, cargador y pruebas con exportaciones sintéticas |
| **Derivados** `whatsapp/derivados/` | 6 | 407 | Servicio con ffmpeg y Dockerfile, **sin desplegar** |
| **CI** `.github/workflows/memoria.yml` + `whatsapp/ci/correr.sh` | 2 | 108 | Primera acción de GitHub del repo. Sólo corre en PR que toquen `whatsapp/` o `db/migrations/memoria/` |
| **Bandeja** `whatsapp/bandeja/index.html` | 1 | 100 | Pantalla de grupos, con SuiteAuth `memoria:admin` |
| **Documentos** `docs/whatsapp/` | 12 | 2,697 | Auditoría, arquitectura, plan, decisiones, progreso, contratos, guías, D10, prototipo |

## 2. Orden de lectura: de lo más riesgoso a lo menos

1. **`memoria_0006` y `memoria_0007`** (cerca de 30 min). Tocan permisos y candados de una base que ya está viva.
   - En 0006 lee los `REVOKE` y el reemplazo de `asegurar_particiones_desde`.
   - En 0007, las secciones **R1** (correcciones: GRANT de columna, `evento_default` que rechaza, RLS en
     `propuesta`, trigger de canal) y **R2** (`api_evidencia_*`: qué sale y qué no).
   - La batería (`prueba_motores`) es larga pero mecánica: se puede saltar.
2. **`whatsapp/receptor/index.ts`** (10 min). Es la puerta de entrada de todo lo que capture la memoria:
   - `firmaValida` y el 503 cuando falta configuración;
   - la validación de fecha en `procesar`;
   - `desdeEvolution`: sólo grupos, nunca chats 1:1.
3. **`whatsapp/mantenimiento/mantenimiento.sh`** (5 min). Maneja contraseñas y respaldos. Revisa que:
   - el `ALTER ROLE` lea la contraseña con `\getenv`;
   - `--exclude-schema=memoria_pasarela` esté puesto;
   - el paso de Evolution **nunca** llame rutas de envío.
4. **`memoria_0001`** (5 min, en diagonal): roles y grants del final del archivo.
5. **Documentos:**
   - `DECISIONES-NOCHE.md`, las 33 decisiones: es lo que decidí sin preguntarte.
   - `VINCULAR-MANANA.md`.
6. Lo demás: cargador, derivados, poda, CI. La CI lo cubre (§4).

## 3. Lo que exige tu atención

### 3.1 La lección de la `memoria_0006`: rompió la captura y nadie lo vio

`memoria_0006` quitó a `memoria_captura` el permiso de leer `identidad`, pensando en ocultar teléfonos. El receptor
hace `INSERT … ON CONFLICT (autor_ref)`, y Postgres **exige poder leer la columna del conflicto**. Con 0006 en vivo,
cada mensaje habría dado 500. Lo corrigió `memoria_0007` con `GRANT SELECT (autor_ref)`: sólo esa columna, así que
el teléfono sigue oculto. No se perdió nada porque la captura no había arrancado.

**Por qué importa al revisar:** la batería de motores pasó 19/19 con el error puesto. Corre como dueño de las tablas
y nunca prueba los permisos de la captura. La autoprueba del receptor, que sí los prueba, se había corrido
**antes** de aplicar 0006. **Ahora la CI aplica todas las migraciones y después corre la autoprueba**, así que un
cambio de permisos que rompa la captura falla en el PR. Regla para lo que venga: **ningún REVOKE sin correr la
autoprueba del receptor después.**

### 3.2 Los workflows `memoria/*` usan una credencial de administrador (N12)

Los 11 workflows `memoria/*` (los 10 de la primera noche y `memoria/motor-avance`) se conectan con la credencial
existente **`fts-suite-db · fts_admin`**. Es el dueño de los esquemas, y **no medí si es superusuario**. El mínimo
privilegio sólo se cumple porque cada nodo llama una función `SECURITY DEFINER` cuyo dueño es el rol mínimo:
`memoria_admin` o `memoria_motor`.

**El riesgo:** quien edite un nodo de esos workflows puede correr cualquier SQL con `fts_admin`, sobre `memoria` y
sobre `comercial`, `prospeccion` y lo demás.

**Qué hacer**, en la lista de la mañana:
1. Crear en n8n dos credenciales Postgres, una para `memoria_motor` y otra para `memoria_admin`. Las contraseñas
   las pone `memoria-mantenimiento` al desplegarse.
2. Cambiarlas en los nodos.

Hasta entonces, no actives ningún motor. Hoy ninguno está activo.

### 3.3 Evolution no se puede configurar para que no envíe (N8)

Evolution API v2 **no tiene un interruptor para deshabilitar el envío**. Lo que evita que el número mande algo:

| capa | qué hace |
|---|---|
| Sin dominio público | la pasarela sólo se alcanza por la red privada de Railway |
| La llave de API | vive sólo en las variables de `memoria-pasarela` y `memoria-mantenimiento`; el receptor no la tiene |
| Código propio | ninguna línea nuestra llama una ruta de envío |
| Configuración | `rejectCall=false` y `readMessages=false`, para no mandar ni «visto» ni rechazos de llamada |

**El hueco:** durante los 5 minutos del QR (VINCULAR-MANANA, paso 4), el `/manager` con la llave **sí puede
enviar**. Úsalo sólo para el QR y borra el dominio en cuanto diga «Conectado». Si algún día hace falta una garantía
dura: un proxy delante de Evolution que sólo deje pasar `/instance/*` y `/webhook/*`.

### 3.4 Los datos viven en Europa (para el aviso de privacidad, D7)

- La base `fts-suite-db` está en **`europe-west4` (Países Bajos)**. Ahí vive la bitácora: textos, autores y
  vínculos.
- Los buckets `memoria-archivos` y `memoria-respaldos` están en **`ams` (Ámsterdam)**, elegidos junto a la base
  (N10). Ahí viven fotos, audios, videos y respaldos.
- Evolution y el receptor corren en el mismo proyecto de Railway.

El aviso de privacidad con Legal (D7) tiene que decir que **los mensajes de los grupos se guardan en servidores
fuera de México (Unión Europea)** con un proveedor de nube. Cuando se decida D10, también que se procesan con un
proveedor de IA, probablemente en EE.UU.

Cambiar la región de un bucket no se puede: hay que crear otro y copiar. Mejor decidirlo **antes** de pasar de 3
grupos a todos.

### 3.5 Los precios de D10 no están verificados

`D10-PROVEEDORES.md` estima unos **$26 al mes** y unos **$195** para el histórico. Pero **7 de los 12 precios** no
se leyeron de la página oficial:
- OpenAI;
- AWS;
- Azure;
- Deepgram;
- AssemblyAI.

La red del contenedor los bloquea. Salen de búsquedas en sitios de terceros y van marcados «no verificado».
Anthropic y Google sí se leyeron de su página oficial el 28-sep. **Antes de abrir una cuenta de pago, confirma el
precio en la página del proveedor.**

La recomendación del par para el A/B no cambia aunque los precios se muevan al doble: todo está entre $3 y $30 al
mes, y lo que decide es la calidad con la jerga, que mide el A/B.

## 4. Qué puedes aprobar sin leer línea por línea: la CI lo cubre

La acción `memoria` levanta un Postgres 17 vacío y ejecuta:
- las 7 migraciones en orden y la última dos veces;
- la batería de 34 casos;
- 24 pruebas de Bun y 4 de SHA-256;
- la autoprueba del receptor contra esa base.

Así que esto puedes mirarlo en diagonal:

| archivo | lo que la CI prueba |
|---|---|
| `db/migrations/memoria/*`: sintaxis, orden, idempotencia | que se apliquen limpias en PG17 y que la 0007 se pueda aplicar dos veces |
| Motores (0003–0007): reglas, citas obligatorias, nada interno publicable, acta nunca movida | 34/34 casos, que se revierten solos |
| `whatsapp/receptor/dist/receptor.js` | **no lo leas**: la CI exige que sea exactamente el build de `index.ts` |
| Receptor, de extremo a extremo | 13 casos: 160 envíos, duplicados, dedupe de fotos, permisos de la captura, firmas, 1:1 ignorado |
| `whatsapp/historico/*` | 14 pruebas: parser Android e iOS, ZIP, frontera, huellas estables, firma, reintentos |
| `whatsapp/mantenimiento/poda.ts` | 4 pruebas, incluida una que confirma que no puede borrar |
| `whatsapp/derivados/*` | 6 pruebas con ffmpeg y video sintético, de extremo a extremo contra la base |
| `whatsapp/n8n/sha256.js` | 4 casos contra el SHA-256 de Node |
| `docs/whatsapp/prototipo/` | datos sintéticos; revisado a 380, 760, 900 y 1280 px |

**Lo que la CI no cubre** y sí conviene leer:
- `mantenimiento.sh` completo: necesita el bucket real y Evolution, y en la CI sólo se prueba en partes;
- el texto de las decisiones;
- que no se cuele ningún dato real. Los fixtures y las pruebas usan nombres, números y teléfonos inventados
  (`5210000099011`, `SO99010`); búscalo tú con `git diff origin/main... | grep -E '[0-9]{10}'` si quieres
  confirmarlo.

## 5. Lista de 5 minutos después del merge

El PR se mergea con **squash** y la rama se borra sola (`delete_branch_on_merge`). Los commits de la rama quedan sin
rama, y el receptor y el mantenimiento bajan su código **por SHA de esos commits**. Hay que re-apuntarlos a `main`.

1. **Anota el SHA del merge:** `git log -1 --format=%H origin/main`, o en la página del PR. Lo llamaremos `<M>`.
2. **Comprueba que el contenido es idéntico.** El sha256 no cambia con el squash:
   ```sh
   curl -sL https://raw.githubusercontent.com/yinyo1/fts-suite/<M>/whatsapp/receptor/dist/receptor.js | sha256sum
   #   → 1f18ed1ea108793e1fedbdcd86b69c1fe31ce93453081bbb3e539afbc55e52db   (receptor -3)
   curl -sL https://raw.githubusercontent.com/yinyo1/fts-suite/<M>/whatsapp/mantenimiento/mantenimiento.sh | sha256sum
   #   → cce196eeb084566cd02e608100ab10ad07b30b93b3499563edc3f50932448320
   ```
3. **Railway → `memoria-receptor` → Variables:**
   - `RECEPTOR_URL` = `https://raw.githubusercontent.com/yinyo1/fts-suite/<M>/whatsapp/receptor/dist/receptor.js`
   - `RECEPTOR_SHA256` = `1f18ed1e…` (el completo de arriba)

   Se redespliega solo. En sus logs debe salir `[arranque] receptor-2026.09.28-3 … config_faltante=[]`.
4. **Railway → `memoria-mantenimiento` → Variables:**
   - `MANT_SCRIPT_URL` = `https://raw.githubusercontent.com/yinyo1/fts-suite/<M>/whatsapp/mantenimiento/mantenimiento.sh`
   - `MANT_SCRIPT_SHA256` = `cce196ee…` (el completo de arriba)

   Si todavía no le diste Deploy a lo preparado, hazlo aquí mismo: son los valores del paso 1.0 de
   VINCULAR-MANANA, pero con `<M>`.
5. **CI verde en `main`:** la acción `memoria` corre en PR, no en push a `main`. Para confirmar `main`, abre
   cualquier PR que toque `whatsapp/`, o córrela a mano en local:
   `PGHOST=… PGDATABASE=<base vacía> sh whatsapp/ci/correr.sh`. Si algún día la quieres también en `main`,
   agrega `push: { branches: [main], paths: [...] }` al workflow.
6. Con eso, cierra el check-in del PR: el seguimiento se da por terminado cuando el PR se mergea.

Si algo de esto falla: el receptor y el mantenimiento siguen corriendo con el SHA viejo **mientras GitHub no
recolecte esos commits**, y eso no pasa de inmediato. No hay prisa de minutos, pero sí de días.
