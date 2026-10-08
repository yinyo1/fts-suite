# Kiosko · zona región USA y selección de SO MX+USA

Issue: ver el issue "Kiosko: check-in/out en todo USA y selección de SO MX+USA" (enlazado a #282 y #334).
Build: `20261008-kiosk-zona-usa`.

## Qué hace

1. **Zona región USA.** Si la checada NO cae en un sitio autorizado y el interruptor
   "Permitir checada en todo USA" está prendido, el kiosko pregunta si el punto está dentro
   de EE.UU. continental. Si sí, la checada queda **autorizada** (`geo_sitio = "USA (región)"`,
   `geo_zona = "usa"`, `geo_pais = "US"`) y no va a aprobación. Si no, sigue el camino de hoy
   (modal fuera de zona → motivo → aprobación).
2. **Polígono real, no rectángulo.** `shared/geo/usa-continental.json` (~525 KB, sale
   comprimido por Pages) se genera con `scripts/geo/generar-usa-continental.js` desde
   `@geo-maps/countries-land-100m` (OpenStreetMap, ODbL). La frontera con México y Canadá se
   conserva casi intacta (25 m); costa e interior se simplifican a 300 m; islas < 1 km² fuera.
   Solo se descarga cuando hace falta (fuera de sitio + interruptor prendido).
3. **Falla hacia el lado tolerable.** Si el contorno no carga, NO se autoriza: la checada va a
   aprobación como hoy y el payload lleva `geo_region_error`.
4. **Mixto.** Cada evento se valida solo y manda su propia zona. Entrada en Monterrey y
   salida en Laredo TX (o al revés) es válido; el servidor ya no compara zonas entre eventos.
5. **SO en zona USA.** En la salida desde zona USA la lista es México (company 1) + USA
   (company 6), con la empresa como etiqueta en cada renglón, y elegir SO es **obligatorio**:
   no se ofrece bolsa ni "sin proyecto" (cualquier perfil). El plan del día sigue ganando
   (confirmar el plan es elegir SO). Fuera de USA, todo igual que hoy.
6. **Obligatoria solo si hay de dónde elegir.** Si el catálogo USA falla (error, 12 s sin
   respuesta, lista vacía, o el servidor ignora `company_id`), la SO deja de ser obligatoria,
   se avisa en pantalla y la salida se puede registrar como hoy. Obligar a elegir de una lista
   incompleta es obligar a mentir, y dejar al empleado sin salida rompe I4 de #282.
7. **Interruptor** en Operaciones → Config → Kiosk ("🇺🇸 Zona región USA"). Se publica en
   `shared/public-config.json` → `zonas_region.usa.activo` junto con los sitios. La fuente de
   verdad es el archivo publicado: el panel lo relee al abrir y el kiosko al cargar. Si la
   llave no existe, **encendido** (default ON).

## Contrato kiosko → `kiosk/checkin` (campos nuevos, hoy ignorados por el servidor)

| campo | valores | para qué |
|---|---|---|
| `geo_zona` | `sitio` · `usa` · `fuera` · `sin_restriccion` | con qué se validó el evento |
| `geo_pais` | `US` · `NO_US` · país del sitio · `null` | país con que se validó |
| `geo_region_error` | texto o `null` | el contorno no cargó |
| `tz_evento` | zona IANA del teléfono (`America/Los_Angeles`) | hora local del evento |
| `utc_offset_min` | p. ej. `-420` | desfase del teléfono en el evento |
| `so_company_id` / `so_empresa` | `1`/`MX`, `6`/`USA` | empresa de la SO elegida |

Esta es la **mitad tolerante** (CLAUDE.md §8): el kiosko manda los campos y el servidor de hoy
los ignora sin romperse. La hora que se guarda en Odoo ya es UTC del servidor
(`fechaOdoo = new Date()` en "Code - Preparar parámetros"), así que la zona del teléfono no
la altera.

## Cambio propuesto en n8n — NO aplicado, NO publicado

### `kiosk/checkin` (`a7mEjjdwIzzvomXs`)

Requiere antes 4 campos Studio en `hr.attendance` (Esteban): `x_studio_zona_in`,
`x_studio_zona_out` (char 40) y `x_studio_tz_in`, `x_studio_tz_out` (char 40).

1. **Code - Preparar parámetros**, después de `const geo_status = …`:
   ```js
   const geo_zona = String(body.geo_zona || '');
   const geo_pais = String(body.geo_pais || '');
   const tz_evento = String(body.tz_evento || '');
   const zona_evento = geo_zona === 'sitio' ? ('sitio:' + geo_sitio).slice(0, 40) : geo_zona;
   ```
   y en el `return` agregar `geo_zona, geo_pais, tz_evento, zona_evento`.
2. **Odoo - CREATE Entrada**, dos campos más en `fieldsToCreateOrUpdate.fields`:
   `x_studio_zona_in = {{ $json.zona_evento }}`, `x_studio_tz_in = {{ $json.tz_evento }}`.
3. **Odoo - UPDATE Salida**, dos campos más:
   `x_studio_zona_out = {{ $('Code - Preparar parámetros').first().json.zona_evento }}`,
   `x_studio_tz_out = {{ $('Code - Preparar parámetros').first().json.tz_evento }}`.
   (Referencia explícita al nodo, no `$json`: regla de §3 «auditoría post-inserción».)

Son `char`, no many2one: no aplica la trampa del literal string de §9. Tras el edit:
read-back de `active` **y** `versionId == activeVersionId` (§3, §17 2b), y verificar
**releyendo los campos** en una asistencia de prueba (§9).

### `kiosk/sos` (`m6dyGa0yV1zYPwJF`)

**No se pudo leer:** el workflow no está habilitado para MCP. Hace falta confirmar dos cosas:
(a) que respeta `company_id` del body — su vecino `kiosk/empleados` **lo ignora** y fija la
empresa 1 en el código; (b) que cada renglón trae `company_id`. Si (a) falla, el kiosko lo
detecta (`SERVIDOR_IGNORA_COMPANY_ID`) y no obliga ni etiqueta como USA. Cambio propuesto si
hace falta: filtrar `project.project` por `company_id in [body.company_id]` y agregar
`company_id` a cada renglón de la respuesta.

## Pruebas

```
node tests/kiosko-usa/zona-usa.test.js       # 47 ✓ — puntos, catálogo, resolverZona
node tests/kiosko-usa/tz-viaje.test.js       # 14 ✓ — reglas de hoy ante un viaje CST→PT
node tests/kiosko-usa/e2e-kiosko-usa.js      # 51 ✓ — página real, 10 escenarios, POST capturado
node tests/kiosko-usa/captura-config.js      # panel muestra el valor publicado
```
Capturas en `docs/kiosko/usa/capturas/` (380, 760, 900, 1280 px).
