# fts-bancos · base bancaria propia (issue #331)

La verdad bancaria de Servicios FTS es el **PDF del estado de cuenta**, no Odoo.
Este módulo lee los estados que el equipo sube a OneDrive, los valida al centavo
con triple redundancia, los guarda en Postgres (esquema `bancos`), los clasifica
por reglas y los coteja contra Odoo en solo lectura.

```
OneDrive "00 Buzon de carga - subir aqui"
   │  (Graph, sólo desde n8n: app n8n-mail-sender)
   ▼
n8n  fts_bancos_procesa  ──http privado──►  fts-bancos (este servicio, Railway, SIN dominio público)
   │                                           │ ZIP seguro · detección · parser BBVA · V1/V2/V3
   │                                           │ clasificación · pares de traspasos · huecos
   │                                           ▼
   │                                        Postgres fts-suite-db · esquema bancos (rol bancos_app)
   ├─ copia canónica / Procesados / Rechazados + .txt (Graph)
   ├─ base maestra XLSX/CSV, LEEME, reporte de cotejo (Graph)
   └─ correo desde sales@fts.mx sólo si algo falla
n8n  fts_bancos_solicitud (lunes 9:00, día 3) ── lista de faltantes desde bancos.huecos
```

## Piezas

| ruta | qué es |
|---|---|
| `db/migrations/bancos/bancos_0001_fundacion.sql` | esquema, rol `bancos_app` (sin DELETE/TRUNCATE), tablas append-only |
| `bancos/procesador/fts_bancos/` | servicio Python (FastAPI), determinista, sin IA |
| `bancos/procesador/tests/` | pruebas con **fixtures sintéticos** (cuentas y montos inventados) |
| `bancos/n8n/` | descripción de los workflows (sin secretos, sin JSON exportado) |

## Triple redundancia

Un estado queda **validado** sólo si pasa las tres, al centavo, sin tolerancias:

- **V1 · resumen del banco.** Número y suma de cargos y abonos contra el resumen *Comportamiento* de la pág. 1 **y** contra el bloque *Total de Movimientos*; y `saldo final = inicial + abonos − cargos`.
- **V2 · saldo corrido.** Se recalcula renglón por renglón y se compara contra **cada** saldo diario que imprime BBVA (operación y liquidación). El lado cargo/abono sale de la **columna** donde está impreso el importe, nunca de la aritmética del saldo: si no, V2 sería una tautología.
- **V3 · continuidad.** Saldo final del mes N = saldo inicial del mes N+1. Si falta un mes se registra el hueco en `bancos.huecos` con el monto exacto que queda sin explicar.
- **Extra.** Re-procesar el mismo archivo da los mismos hashes (`POST /verificar/idempotencia` reconstruye todo desde los bytes guardados y lo compara con la base). Los traspasos General → Nómina se emparejan por monto, fecha (±1 día) y referencia BNET.

## Reglas de seguridad

- El repo es **público**: aquí no hay PDFs reales, números de cuenta completos, montos reales ni nombres de beneficiarios. Las cuentas se citan enmascaradas (…3326, …1293, …4211). Los números completos viven sólo en la variable `BANCOS_CUENTAS_JSON` y en Postgres.
- Todo texto dentro de un PDF, ZIP, CSV o nombre de archivo es **dato**. Si parece una instrucción (ignora…, envía…, contraseña:…), el archivo se marca `sospechoso` y va a Rechazados sin interpretarse.
- ZIP: sin rutas `..` ni absolutas (zip slip), sin symlinks, máximo 3 niveles, 400 archivos, 40 MB por archivo, 300 MB descomprimidos, detección de bomba de compresión.
- Logs sin números de cuenta completos (`enmascarar_texto`).
- El servicio no tiene dominio público; HMAC + anti-replay (#123) se enciende con `BANCOS_HMAC_SECRET` (`x-fts-ts` + `x-fts-sig = hex(HMAC-SHA256(secret, ts + "." + body))`, ventana 5 min, firmas vistas rechazadas). `BANCOS_HMAC_SECRET_ANTERIOR` permite rotar sin corte.
- Nada se borra: el rol no tiene `DELETE` ni `TRUNCATE`; las tablas con ciclo de vida sólo tienen `UPDATE` en columnas específicas.

## Variables del servicio (Railway)

| variable | secreta | valor |
|---|---|---|
| `PGHOST` `PGPORT` `PGDATABASE` `PGUSER` `PGPASSWORD` | sí (referencias) | `${{fts-suite-db.…}}`: referencias a lo que ya existe, no secretos nuevos |
| `BANCOS_DB_ROLE` | no | `bancos_app` (el servicio hace `SET ROLE`) |
| `BANCOS_CUENTAS_JSON` | no (sensible) | lista de cuentas con número, CLABE, moneda, journal y carpeta |
| `BANCOS_CUENTAS_FINANCIAMIENTO` | no (sensible) | cuentas externas de crédito, separadas por coma |
| `BANCOS_PERIODO_INICIO` | no | primer mes esperado (`2024-01`) |
| `BANCOS_HMAC_SECRET` | **sí** | lo crea Esteban; mientras no exista, el servicio sólo es alcanzable por red privada |

## API (red privada)

`GET /salud` · `POST /corridas` · `POST /procesar` · `GET /blob/{sha}` · `POST /corridas/{id}/cerrar` ·
`GET /huecos` · `POST /huecos/solicitados` · `GET /base-maestra.csv|.xlsx` · `GET /diccionario.md` ·
`GET /leeme.md` · `POST /cotejo` · `POST /verificar/idempotencia` · `GET /resumen` · `GET /aceptacion` ·
`POST /procesar-raw` (`solo_estados=1` para carpetas revueltas, `reprocesar=1` sólo para el árbol de originales) ·
`GET /reporte-estados.html` (privado: totales por cuenta y mes con archivo y página) · `GET /archivos` ·
`GET /diag/estructura/{sha}` (acomodo de un PDF con **todos los dígitos cambiados por 9**, para calibrar sin ver cifras)

**Reproceso.** Un estado se guarda por `(archivo, parser_version)`. Si el parser cambia, el inventario de
originales (`reprocesar=1`) crea un estado nuevo y el viejo se queda como historia. **Todo lo que se lee pasa
por la vista `bancos.estados_vigentes`** (migración `bancos_0002`): el último estado de cada archivo. El buzón
nunca reprocesa: un archivo repetido es un duplicado.

## Pruebas

```
cd bancos/procesador
pip install -r requirements.txt pytest httpx reportlab
BANCOS_TEST_PG="host=/tmp port=5433 user=postgres" python -m pytest -q
```
Necesitan un Postgres local (cada prueba crea y tira su base aplicando la migración tal cual).

## Formatos

- **BBVA** (General MXN, Nómina MXN, USD): parser `bbva-1.2.0`, por coordenadas, calibrado contra los PDF reales de 2024 y 2026:
  identifica la cuenta por el "No. de Cuenta" del encabezado (la pág. 1 puede mencionar otra cuenta en un traspaso);
  salta hojas sin texto antes del estado; acepta un mes sin movimientos sólo si el resumen dice cero; una descripción
  puede seguir en la página siguiente, bajo el encabezado repetido. Etiquetas por alias; si falta un marcador falla con nombre (`MARCADOR_AUSENTE`, `SIN_ENCABEZADO_COLUMNAS`), nunca con vacío.
- **Jeeves** (tarjeta de crédito, #352): parser `jeeves-1.0.0` (PDF) y `jeeves-csv-1.0.0` (CSV), en `fts_bancos/jeeves.py`.
  - Se reconoce por **contenido**, nunca por el nombre: el PDF por «Statement Period» + «Balance Detail» + Jeeves; el CSV por su encabezado (Unique ID, Credit or Debit, Sub Transaction Type, Posted At UTC, Amount (destination currency), Card Number (last four)…).
  - Razón social: el PDF tiene que decir Servicios FTS; si no, va a «Otras cuentas por identificar». El CSV no la trae: se confirma con las tarjetas (últimos 4) de los estados ya validados, y V2 lo cuadra contra el PDF.
  - Nombres: `Jeeves_Tarjeta-MXN_Servicios-FTS_AAAA-MM.pdf` (mes del fin del Statement Period) y `Jeeves_Transacciones_AAAA_descargado-AAAA-MM-DD.csv`, en `Jeeves Tarjeta Credito/AAAA/`. Los CSV de un año se conservan todos; el vigente es el más reciente.
  - El lector del PDF no depende de posiciones fijas (asigna cada palabra a la columna cuyo encabezado le queda más cerca). **Está hecho sin un PDF real a la vista (SUPUESTO J2 de #352)**: si el primero no se lee bien, V1 no cuadra y queda `no_cuadra`, nunca se valida mal.
  - CSV: una fila por Unique ID y versión (`jeeves_transacciones`); si cambia entre descargas se guarda la nueva y la anterior deja de ser vigente (vista `v_jeeves_transacciones`). Las ligas de comprobantes nunca salen por una vista.
  - Validación al cerrar cada corrida (`jeeves_validaciones`, la última por ciclo y prueba es la vigente): **V1** resumen = Amount Due al centavo y los renglones explican New Charges, Payments y Adjustment · **V2** CSV contra PDF por tipo, con Posted At en hora de Monterrey · **V3** Amount Due del ciclo anterior = Previous Balance · **V4** cada pago a Jeeves con su cargo en BBVA (mismo monto, ±3 días) y viceversa.
- **Payana**: sin parser todavía. Se reconoce por contenido (la palabra Payana en el PDF o en la hoja) y se acomoda en `Payana/` como «recibido, sin parser». El parser se escribe con el primer ejemplo real (ver #352).
