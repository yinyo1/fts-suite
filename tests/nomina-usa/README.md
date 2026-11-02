# Pruebas de Nómina USA (#448)

`tests/nomina-usa/correr.sh` corre todo. Ninguna fase se mergea sin `TODO VERDE`.

| Archivo | Qué prueba |
|---|---|
| `fase-*.test.js` | Reglas puras (la `fase-g` es el alimentador de evidencia comercial; la `fase-h`, los ajustes de Esteban del 2-nov: bandera por país, zona de la última checada, destinatarios y fijo todo o nada) (`shared/nomina-usa/*.js`) y el esquema `nomina_usa` en un Postgres real desechable |
| `kiosko-e2e.js` | El kiosko real en Chromium: flujo USA por persona y **México igual que hoy** |
| `fase-i.test.js` | MVP de punta a punta: avisos entre pasos y vigilante (en sombra: cero filas en `retardos.envio`), asiento de costo por SO, conciliación de Auris, `bolsa_de_machote` por `odoo_so_id`, y el Code de `costo-odoo`/`odoo-lectura` con Odoo simulado |
| `ensayo-general.js` | Ensayo general: la pantalla en modo REAL contra las funciones reales de la base, sembrada con la semana real 30-oct → 5-nov (`fixtures/semana-30oct-real.json`), reloj fijo miércoles 4-nov 08:30 CST |
| `pantalla.js` | La pantalla de RH en modo práctica, por rol, a 380/760/900/1280 px, sin errores JS ni desborde |
| `../kiosko-usa/*` | Las pruebas del kiosko que ya existían (#394). Tienen que seguir verdes sin tocarlas |

## Postgres de pruebas
Las pruebas SQL crean una base nueva, aplican **todas** las migraciones de `retardos` y `nomina_usa` en orden y la tiran al final. Por omisión buscan el clúster en el socket `/var/tmp/pgnusa`, puerto `55432` (`NUSA_PGHOST`, `NUSA_PGPORT` para otro). Para levantarlo en el contenedor (Postgres no corre como root):
```
P=/var/tmp/pgnusa; mkdir -p $P && chown nobody $P
su -s /bin/sh nobody -c "/usr/lib/postgresql/16/bin/initdb -D $P/d -U postgres -A trust && /usr/lib/postgresql/16/bin/pg_ctl -D $P/d -o '-p 55432 -k $P' -l $P/log start"
```
