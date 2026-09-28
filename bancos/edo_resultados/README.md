# Estado de resultados 2026 (issue #348)

Estado de resultados de Servicios FTS SA de CV (`company_id = 1`), construido desde la base bancaria propia
(#331) y Odoo en **solo lectura**. Cubre de enero al último mes con estado bancario validado; el mes
siguiente lleva sólo ventas. **Todo sin IVA.**

Este repo es público, así que aquí no hay montos, cuentas ni contrapartes. Los números viven sólo en el
HTML y los CSV privados de OneDrive, en `FTS Finanzas - Bancos/02 Base maestra de transacciones/Estados de resultados/`:

- `ER_2026_actual.html` y `ER_2026_actual_*.csv` se sobrescriben en cada recálculo.
- `historial/ER_2026_vN.html` y `historial/ER_2026_vN_*.csv` se crean cada vez que cambia un número. Nunca se borran.

## Piezas

| pieza | qué es |
|---|---|
| `calcular.js` | El motor. Es determinista: usa centavos enteros, JSON canónico y SHA-256 en JS puro. Corre igual en node y en un Code node de n8n. Clasifica cada movimiento, arma las vistas A/B/C, el puente, la Vista D, la decisión de versión y correo, y los archivos. |
| `db/migrations/bancos/bancos_0007_*.sql` | Crea `reglas_edo_resultados`, las reglas editables de a qué renglón va cada egreso. |
| `db/migrations/bancos/bancos_0008_*.sql` (v1) | Amplía las reglas (D2, D3, D6, Conmet por cliente). Agrega las tablas editables `nomina_oficina`, `partidas_identificadas` y `er_parametros`, la bitácora `er_calculos`, la vista `v_auditoria_estados` y el rol `bancos_er`. `bancos_er` lee como `bancos_lector` y **sólo inserta** en `er_calculos` y `partidas_identificadas`; no tiene UPDATE ni DELETE. |
| `db/migrations/bancos/bancos_0009_*.sql` (Vista E) | Catálogo editable `destinos_edo_resultados`; `reclasificaciones`, de sólo inserción, con partes (hasta 5), archivo de origen y huella; vista `v_reclasificaciones`, donde la última carga de cada movimiento es la vigente; columna `origen` en las reglas. `bancos_er` sólo inserta. |
| workflow n8n `fts_bancos_estado_resultados` (`LW3DVENZjlI3Kurp`) | El recálculo automático. Baja `calcular.js` **fijado por commit** (constante `CALC_SHA` en el nodo `Code - Disparo`). |

## Reglas vigentes (v1.1)

- **R1, nómina por horas:** la nómina total del mes del banco se reparte entre las personas en proporción a su peso. El peso es su monto de Carga MO desde la semana 28 y sus horas de asistencia antes. Cada persona va a costo según su % a proyecto:
  - sale de las órdenes de venta en `hr.attendance` o de las líneas `P` de Carga MO;
  - el resto va a gastos administrativos (bolsas comunes);
  - quien nunca cargó horas va a «Nómina sin horas cargadas»;
  - los meses sin horas clasificadas se marcan «reparto de nómina estimado»;
  - `nomina_oficina` queda sólo como corrección manual.
- **R2, Jeeves y Payana por analítica:** primero la analítica de la factura, ignorando el plan 20.
  - En Jeeves es la factura con la que se concilió el consumo (`reconciled_lines_name`).
  - Proyecto → costo; común (plan 2) → administrativo; mixta → se parte.
  - Sin analítica → reglas de comercio o proveedor. Sin regla → costo «sin clasificar».
- **R3, BBVA es el universo:**
  - conciliación mensual de Jeeves, Payana y Nómina contra sus fondeos desde BBVA, con la diferencia acumulada y el «pendiente de fondear»;
  - el puente ampliado debe cuadrar al centavo;
  - si no cuadra, no se publica versión nueva ni se sobrescribe el actual.
- `pruebas.js`: pruebas con datos sintéticos de R1–R3 (a–h) y de la Vista D (a–c). Se corre con `node bancos/edo_resultados/pruebas.js`.
- Publicar con etiqueta: `{ "publicar": true, "etiqueta": "v1.1", "forzar_correo": true, "motivo": "…" }` genera `historial/ER_2026_v1.1.*`.

## Vista E: reclasificación personalizada y escenarios

Es una **capa encima** de la base bancaria: los movimientos, estados y archivos nunca se modifican. Prioridad al clasificar:
reclasificación vigente del movimiento > regla de Esteban > reglas del v1 > clasificación del servicio.

- **Modo reclasificación.** Mueve un movimiento a otro destino del catálogo o lo parte en hasta 5 partes, que deben sumar exactamente 100 %; cada parte lleva su proyecto. El puente tiene que seguir cuadrando. Se exporta como `reclasificaciones_AAAAMMDD_HHMM.csv`, con la huella del archivo en la última columna.
- **Modo escenario.** Además agrega ajustes de % por movimiento (−100 a 500) y por renglón (con meses), y la utilidad retenida compartida con la Vista D. Muestra «Escenario: difiere del banco en X» con su desglose. Se exporta como `escenario_*.csv`. **Ese archivo no se puede subir**: se rechaza.
- **Orden de cálculo:** 1) v1 · 2) reclasificaciones oficiales vigentes · 3) reclasificaciones y particiones del escenario · 4) ajustes % por movimiento · 5) ajustes % por renglón · 6) utilidad retenida, en un bloque aparte. Cada renglón tiene su «¿de dónde sale?».
- **Hacerlo oficial:** subir el CSV a `Estados de resultados/Reclasificaciones` (carpeta privada de Esteban). El disparo de 30 minutos toma el primer `.csv` de la carpeta y hace esto:
  1. Valida el encabezado, la huella, que cada id exista, que cada destino esté en el catálogo y sea del tipo correcto, que las partes sean 1..n y sumen 100, y que el puente siga cuadrando.
  2. Si todo pasa, inserta en `reclasificaciones` (y las reglas propuestas en `reglas_edo_resultados`, con origen «reclasificación de Esteban»), recalcula, mueve el archivo a `Aplicadas` con un `.txt` y manda correo con el efecto en la utilidad de operación de A/B/C.
  3. Si algo falla, **no aplica nada** de ese archivo: lo mueve a `Rechazadas` con un `.txt` que dice el motivo exacto y avisa por correo.
  El contenido del CSV es dato: nunca se interpreta como instrucción.
- **Prueba sin tocar la base:** `{ "prueba": true, "csv_prueba": { "nombre": "reclasificaciones_x.csv", "contenido": "…" } }` sube el archivo a `Reclasificaciones/_pruebas`. Lo valida y lo mueve igual, pero no inserta nada.
- `pruebas.js` incluye las pruebas sintéticas de la Vista E.

## Disparos del workflow

| disparo | cuándo | qué hace |
|---|---|---|
| `Cada 30 min (7:00-21:00)` | :00 y :30 de 7:00 a 20:30, más 21:00, hora de Monterrey. Salta las 18:00 porque a esa hora corre el diario. | Calcula la **firma**, un md5 que combina los estados validados, las banderas ROJO del auditor y las tablas editables. Si la firma es igual a la del último cálculo, no hace nada; si cambió, recalcula. También recalcula si hay un CSV en la carpeta de Reclasificaciones. |
| `Diario 18:00` | todos los días | Recalcula siempre, para tomar órdenes y facturas nuevas de Odoo. |
| `Manual (webhook)` | POST `{publicar, prueba, simular, enviar_correo, sha, etiqueta, forzar_correo, motivo, csv_prueba}` | Con `publicar: true` hace lo mismo que el diario. Con `prueba: true` no sube nada, no escribe en la base y sólo manda correo `[PRUEBA]` si hay motivo. `simular` acepta `cobertura_previa`, `partidas` y `firma_tablas_previa`. |

- **Versión:** hay versión nueva cuando la huella de resultados difiere de la última versión guardada. La huella es el SHA-256 de las vistas A/B/C, el puente y el cuadre. La Vista D no entra en la huella.
- **Correo:** va sólo a Esteban, desde sales@, cuando pasa algo de esto:
  1. un mes pasa de INCOMPLETO a completo;
  2. la utilidad de operación de A, B o C cambia más que `er_parametros.correo_umbral_cambio_utilidad_pct` (1 %);
  3. cambia una tabla editable.
- **Partidas por identificar:** cada partida nueva se inserta en `partidas_identificadas` con `clasificacion` vacía. Cuando Esteban la llena, el siguiente recálculo la mueve a su renglón.

## Tablas editables (con el usuario administrador de la base)

- `bancos.nomina_oficina (beneficiario, cuenta_mask, vigente_desde, vigente_hasta, nota)`
  - `beneficiario` es el nombre tal como aparece en el concepto del banco. `cuenta_mask` son los últimos 4 dígitos de la cuenta o CLABE.
  - Mientras la tabla esté vacía, toda la nómina queda en costo (campo).
- `bancos.partidas_identificadas`: se llena con `UPDATE ... SET clasificacion = 'costo' | 'pago_prestamo' | 'devolucion_aportacion' | 'traspaso_propio' | 'otro', nota = ..., fecha_decision = ... WHERE movimiento_hash = ...`.
- `bancos.reglas_edo_resultados`: patrones (expresión regular) sobre el concepto del banco, el proveedor o cliente de Odoo, el comercio de Jeeves o el plan analítico.
- `bancos.er_parametros`: depreciación, umbral de partidas, ventana de casa de cambio, costo estimado de Conmet y umbral del correo.

## Verificaciones que trae el resultado

- **Puente:** salidas del banco → exclusiones → egresos que entran → + Jeeves + Payana + nómina + depreciación − IVA = costo + gastos + partidas. Se muestra mes por mes y debe dar 0.
- **Movimientos = resumen del PDF** (V1).
- **Huellas de resultados e insumos:** dos corridas con los mismos insumos dan la misma huella. La corrida local con node y la de n8n también coinciden.
