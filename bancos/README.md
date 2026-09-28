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
`GET /leeme.md` · `POST /cotejo` · `POST /verificar/idempotencia` · `GET /resumen` · `GET /aceptacion`

## Pruebas

```
cd bancos/procesador
pip install -r requirements.txt pytest httpx reportlab
BANCOS_TEST_PG="host=/tmp port=5433 user=postgres" python -m pytest -q
```
Necesitan un Postgres local (cada prueba crea y tira su base aplicando la migración tal cual).

## Formatos

- **BBVA** (General MXN, Nómina MXN, USD): parser `bbva-1.0.0`, por coordenadas. Etiquetas por alias; si falta un marcador falla con nombre (`MARCADOR_AUSENTE`, `SIN_ENCABEZADO_COLUMNAS`), nunca con vacío.
- **Jeeves, Payana**: enchufables. Hoy se guardan como `formato_no_soportado` en su carpeta y se avisa; el parser se escribe con el primer archivo real de muestra.
