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
| workflow n8n `fts_bancos_estado_resultados` (`LW3DVENZjlI3Kurp`) | El recálculo automático. Baja `calcular.js` **fijado por commit** (constante `CALC_SHA` en el nodo `Code - Disparo`). |

## Disparos del workflow

| disparo | cuándo | qué hace |
|---|---|---|
| `Cada 30 min (7:00-21:00)` | :00 y :30 de 7:00 a 20:30, más 21:00, hora de Monterrey. Salta las 18:00 porque a esa hora corre el diario. | Calcula la **firma**, un md5 que combina los estados validados, las banderas ROJO del auditor y las tablas editables. Si la firma es igual a la del último cálculo, no hace nada; si cambió, recalcula. |
| `Diario 18:00` | todos los días | Recalcula siempre, para tomar órdenes y facturas nuevas de Odoo. |
| `Manual (webhook)` | POST `{publicar, prueba, simular, enviar_correo, sha}` | Con `publicar: true` hace lo mismo que el diario. Con `prueba: true` no sube nada, no escribe en la base y sólo manda correo `[PRUEBA]` si hay motivo. `simular` acepta `cobertura_previa`, `partidas` y `firma_tablas_previa`. |

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
