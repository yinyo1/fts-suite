# `db/` — el almacén de la suite

**No es del módulo comercial.** Es el Postgres de toda la suite (`fts-suite-db` en Railway),
y este directorio es la única fuente de su estructura: **la base debe poder recrearse desde
cero corriendo estos archivos en orden.**

Diseño y reglas de fundación: [`docs/comercial/ALMACEN.md`](../docs/comercial/ALMACEN.md).
Decidido en el issue #140.

## Cómo está organizado

```
db/migrations/
  comercial/    001_fundacion.sql · 002_… · 003_machote.sql
  rrhh/         (cuando toque)
  proyectos/    (cuando toque)
```

**Un esquema por dominio, un rol por aplicación**, y cada rol con permisos sólo sobre su
esquema. Lo único que vive en `public` es `schema_migrations`, que es de toda la suite.

**La numeración es GLOBAL, no por carpeta.** El siguiente archivo de `rrhh/` será `004_…`,
no `001_…`. La carpeta dice de qué dominio es; el número dice en qué orden se aplicó. Dos
archivos con el mismo número en carpetas distintas harían ambiguo el orden, y el orden es
lo único que garantiza que la base se pueda recrear.

## Reglas

1. **La base no se toca a mano.** Ni DDL improvisado desde un nodo, ni un `ALTER` de
   urgencia por la Console. Todo cambio de estructura es un archivo nuevo.
2. **Un archivo aplicado no se edita jamás.** Se corrige con uno nuevo. El runner guarda el
   `sha256` real de cada uno; editar uno aplicado hace que el checksum deje de cuadrar, que
   es justo la alarma que se quiere.
3. **Idempotentes** (`IF NOT EXISTS`): correr dos veces no rompe nada.
4. **Sin contraseñas.** Este repo es público. Los roles nacen `NOLOGIN` y sin contraseña;
   un humano les pone una después, fuera de git.

## Cómo se aplican

Por el workflow n8n **`comercial/db-migrate`** (id `4hyzXjkr31h8DPPS`), que lee los `.sql`
del repo **por SHA fijo** (no por rama), verifica el `sha256`, los aplica dentro de una
transacción y escribe el renglón de `public.schema_migrations`. Nace INACTIVO y se dispara
a mano.

**Aplica UNA migración por corrida**, y se le dice cuál. Se niega si falta una anterior, y
si el `sha256` de un archivo ya aplicado no cuadra responde `CHECKSUM_DISTINTO` sin tocar
nada. Lo que reporta sale de un **read-back contra la base**, no del `success` del nodo.

**Dos credenciales, dos vidas:**

| credencial | quién la usa | para qué |
|---|---|---|
| `fts-suite-db · fts_admin` | **sólo** `comercial/db-migrate` | DDL: crear esquemas, roles y tablas |
| `fts-suite-db · comercial_app` | los webhooks de la aplicación | leer y escribir datos, sin `DELETE` y sin `CREATE` |

El rol de aplicación **no puede** aplicar migraciones, y es a propósito: uno que pudiera
crear tablas no sería de permisos mínimos.
