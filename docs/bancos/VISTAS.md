# Base bancaria · contrato de las vistas de lectura (issue #331)

La base bancaria (esquema `bancos` en `fts-suite-db`) es una **fuente independiente de Odoo**:
la verdad es el PDF del estado de cuenta, validado al centavo (V1 resumen del banco, V2 saldo
corrido, V3 continuidad). **Nunca se sobrescribe ni se "corrige" con datos de Odoo; Odoo se valida
contra ella.**

Otros módulos (Rentabilidad #332, el futuro estado de resultados…) la leen **sólo** por estas cinco
vistas, con el rol `bancos_lector`. Ninguna tabla es parte del contrato: pueden cambiar; las vistas no
cambian sin avisar en #331.

| vista | un renglón es | se actualiza |
|---|---|---|
| `bancos.v_estados_validados` | un estado de cuenta (cuenta + mes) que pasó V1 y V2 | al terminar cada corrida del buzón (cada 30 min de 7 a 20 h) |
| `bancos.v_movimientos_validados` | un movimiento de un estado validado | igual |
| `bancos.v_saldos_mensuales` | cuenta + mes, en moneda original | igual |
| `bancos.v_faltantes` | un mes que se pide y todavía no está cerrado | al consultar (se calcula con la fecha de Monterrey) |
| `bancos.v_cotejo_odoo` | resultado del cotejo por corrida, journal y mes | cada cotejo diario (21:10); una fila por corrida = historial |

## Rastreo hasta el PDF

Todo renglón con un número trae `archivo` (nombre canónico del PDF en OneDrive), `pagina` y `sha256`
(huella de los bytes del PDF, guardados en la base). Con esos tres datos cualquier cifra se puede
encontrar en el PDF original. En `v_saldos_mensuales`, `pagina_resumen = 1`: los saldos y totales salen
del resumen de la página 1.

## Reglas para quien consume

- **Montos en moneda original.** `moneda` es MXN o USD; nunca se convierte. Quien necesite pesos
  convierte por su cuenta y lo dice.
- **Traspasos internos.** `es_traspaso_interno = true` es dinero entre cuentas propias (General →
  Nómina, etc.). **Se excluyen** del ingreso y del gasto. `par_traspaso_id` es el movimiento pareja en
  la otra cuenta.
- **Cuentas enmascaradas.** Las vistas sólo exponen `numero_mask` (`…NNNN`). El número completo no
  sale de la base.
- **Validación.** `estado_validacion`:
  - `validado`: V1, V2 y V3 en verde.
  - `validado_hueco_registrado`: V1 y V2 en verde; V3 no aplica porque falta el mes anterior (queda en
    `v_faltantes`).
  - `descuadre_continuidad`: V1 y V2 en verde, pero el saldo inicial no es el final del mes anterior.
    Úsese con cuidado.
  - `v3_pendiente`: recién llegado; la continuidad se calcula al cerrar la corrida.
- **Un mes sin renglón no es un mes en cero.** Si un mes no aparece en `v_estados_validados`, no se
  sabe; mírese `v_faltantes`.

## Columnas

### `v_estados_validados`
| columna | significado |
|---|---|
| `estado_id` | id interno del estado (estable) |
| `banco`, `alias`, `numero_mask`, `moneda`, `journal_odoo` | cuenta (journal de Odoo para cruzar) |
| `periodo` | `AAAA-MM`, sale de la página 1 ("Periodo DEL … AL …"), nunca del nombre del archivo |
| `periodo_inicio`, `periodo_fin` | fechas impresas del periodo |
| `saldo_inicial`, `saldo_final` | del resumen |
| `total_cargos`, `num_cargos`, `total_abonos`, `num_abonos`, `comisiones` | del resumen, verificados contra los movimientos (V1) |
| `num_movimientos` | renglones leídos |
| `v1_ok`, `v2_ok` | siempre `true` aquí |
| `v3_resultado`, `v3_diferencia` | `ok` · `primero` · `hueco` · `sin_anterior` · `descuadre`; diferencia contra el mes anterior |
| `estado_validacion` | ver arriba |
| `archivo`, `sha256`, `paginas` | rastreo; `paginas` dice en qué página está cada dato del resumen |
| `parser_version`, `huella`, `creado_at` | versión del lector; huella = sha256 de los movimientos en orden |

### `v_movimientos_validados`
| columna | significado |
|---|---|
| `movimiento_id`, `estado_id` | ids internos |
| `banco`, `alias`, `numero_mask`, `moneda`, `journal_odoo`, `periodo` | cuenta y mes |
| `renglon`, `fecha_operacion`, `fecha_liquidacion`, `codigo`, `descripcion`, `referencia` | lo impreso |
| `cargo`, `abono` | positivos; cada renglón es cargo **o** abono |
| `neto` | `abono − cargo` |
| `saldo_calculado`, `saldo_operacion_impreso` | saldo corrido calculado y el que imprime el banco (sólo al cierre del día) |
| `categoria`, `subcategoria`, `contraparte`, `regla`, `confianza`, `version_clasificacion` | clasificación vigente por reglas |
| `es_traspaso_interno`, `par_traspaso_id` | ver reglas |
| `estado_validacion` | del estado de origen |
| `archivo`, `pagina`, `sha256`, `hash` | rastreo; `hash` = huella del movimiento (idempotente) |

### `v_saldos_mensuales`
| columna | significado |
|---|---|
| `banco`, `alias`, `numero_mask`, `moneda`, `journal_odoo`, `periodo` | cuenta y mes |
| `saldo_inicial`, `saldo_final`, `total_abonos`, `total_cargos`, `neto` | del resumen |
| `abonos_traspaso_interno`, `cargos_traspaso_interno` | parte que es traspaso entre cuentas propias |
| `abonos_externos`, `cargos_externos` | total menos traspasos internos (lo que sirve para ingreso y gasto) |
| `estado_validacion`, `archivo`, `pagina_resumen`, `sha256` | validación y rastreo |

### `v_faltantes`
| columna | significado |
|---|---|
| `fuente`, `etiqueta`, `tipo`, `orden` | `general`, `nomina`, `usd` (BBVA), `payana`, `jeeves` |
| `cuenta_id`, `numero_mask`, `moneda` | cuenta (vacío si la fuente no tiene cuenta dada de alta) |
| `periodo` | mes abierto |
| `motivo` | `faltante` · `no_cuadra` · `conflicto_version` · `continuidad` · `en_validacion` · `recibido_sin_lector` |
| `detalle` | explicación en español simple |
| `disponible_desde` | primer día hábil del mes siguiente: antes de esa fecha el mes no se pide |
| `dias_habiles` | días hábiles que lleva abierto (el día en que se vuelve exigible cuenta como 1) |
| `es_mes_reciente` | `true` si es el mes recién cerrado |
| `archivo`, `sha256`, `pagina` | el archivo relacionado cuando el motivo no es `faltante` |

### `v_cotejo_odoo`
| columna | significado |
|---|---|
| `corrida_id`, `corrido_at` | cada cotejo es una corrida: la vista guarda el historial completo |
| `journal_id`, `periodo` | journal de Odoo (8 General, 96 Nómina, 75 USD, 74 Payana, 61 Jeeves) y mes |
| `exactos`, `probables` | movimientos del banco encontrados en Odoo (monto exacto, fecha ±3 días; exacto si además coincide la referencia) |
| `banco_sin_odoo` | movimientos del banco que Odoo no tiene |
| `odoo_sin_banco` | apuntes de Odoo sin movimiento en el banco (sólo en meses con estado cargado) |
| `movimientos_banco`, `cobertura_odoo_pct` | cobertura de Odoo contra el banco; compararla entre corridas dice si mejora o empeora |
| `archivo`, `sha256` | estado validado del mes (rastreo) |

## Acceso

```sql
-- rol sin login, sólo SELECT sobre las cinco vistas (y EXECUTE de las dos funciones que usa v_faltantes)
SET ROLE bancos_lector;
SELECT periodo, saldo_final FROM bancos.v_saldos_mensuales WHERE alias = 'General' ORDER BY periodo;
```
`bancos_lector` no puede leer tablas (`bancos.estados`, `bancos.movimientos`, `bancos.blobs`…), ni
escribir, ni ejecutar las funciones de solicitud. Nace `NOLOGIN`: para que otro servicio lo use sin
`SET ROLE`, Esteban le da `LOGIN` y contraseña (no vive en el repo).
