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
Cada cambio de estructura es un `.sql` numerado en `comercial/db/migrations/`, aplicado en
orden y registrado en `public.schema_migrations` con el **sha256 real del archivo**.
**La base nunca se toca a mano ni con DDL improvisado desde un nodo.** Debe poder
recrearse desde cero corriendo los archivos en orden.

> El renglón de bitácora lo inserta el runner, no el propio `.sql`: un archivo no puede
> contener su propio hash, y un checksum inventado es peor que no tenerlo.

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
La credencial vive **solo** en n8n.

### 6. No espejees Odoo
Postgres guarda **únicamente** lo que Odoo no modela. Nada de copiar clientes, leads,
montos u órdenes "por si acaso": dos verdades es exactamente el problema que la limpieza
de la sesión 1 acaba de resolver. Se referencia por `odoo_lead_id`, no se duplica.

---

## Las tablas de 1.0

`001_fundacion.sql` — esquema, rol, bitácora y el trigger de auditoría.
`002_evidencia_propuesta_expediente.sql` — las tres tablas.

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

## El único paso que no está en git, a propósito

El rol `comercial_app` se crea **`NOLOGIN` y sin contraseña**. Ponerle una en un `.sql`
versionado sería meter un secreto al repo.

Un humano corre esto **una sola vez**, contra `fts_suite`:

```sql
ALTER ROLE comercial_app WITH LOGIN PASSWORD '<generada, no reusada de otro lado>';
```

Y luego crea en n8n una credencial Postgres con:

```
host      fts-suite-db.railway.internal
port      5432
database  fts_suite
user      comercial_app
password  <la de arriba>
SSL       deshabilitado (red privada de Railway)
```

La contraseña no pasa por el repo, ni por un issue, ni por el chat.

---

## Cómo se aplican las migraciones

Por el workflow n8n `comercial/db-migrate`, que lee los `.sql` del repo **por SHA fijo**
(no por rama), verifica el `sha256`, los aplica en orden dentro de una transacción y
escribe el renglón de `public.schema_migrations`. Mismo patrón que
`comercial/limpieza-2026-08`: n8n ejecuta un artefacto congelado, no improvisa.

Nace INACTIVO y se dispara a mano.

---

## Respaldo

El volumen `fts-suite-db-data` entra en los respaldos de volumen de Railway. Para una
salida independiente del proveedor, `pg_dump` contra la red privada.

⚠️ **Pendiente:** no hay respaldo programado propio todavía. Mientras el almacén esté
vacío no urge; **antes de que entre el primer dato real, sí.**
