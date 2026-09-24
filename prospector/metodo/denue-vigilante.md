# `prospeccion/denue-vigilante` — que el padrón no envejezca en silencio

Workflow `Zjg3NhllpAU7peS7`. **Inactivo** hasta que las migraciones 010–013
estén aplicadas en `fts-suite-db`.

El padrón depende de un archivo bajado a mano con corte 05/2026. Sin vigilante,
esa fecha se aleja sola y nadie se entera.

## Lo que se midió antes de construirlo

### La ruta con fecha no existe

Se probaron siete formas, incluida la que parecía predecible:

```
denue/2026_05/denue_00_31-33_0526_csv.zip   200 + HTML
denue/2026_05/denue_05_0526_csv.zip         200 + HTML
denue/2026_05/denue_19_0526_csv.zip         200 + HTML
denue/2025_11/denue_00_31-33_1125_csv.zip   200 + HTML
denue/2026_02/denue_00_31-33_0226_csv.zip   200 + HTML
denue/denue_00_31-33_0526_csv.zip           200 + HTML
denue/2026_05/denue_00_31-33_csv.zip        200 + HTML
denue/denue_00_31-33_csv.zip                206 · 57,607,659 bytes · PK
```

**Las siete fechadas devuelven una página HTML de 1428 bytes.** INEGI sirve una
ruta **estable** que reemplaza en su lugar. Un corte nuevo **no se detecta por
URL**, así que el diseño obvio —construir la URL del mes y ver si existe— no
funciona.

### Lo que sí sirve: `Last-Modified` y `ETag`

La ruta estable los expone, y un `GET` con `Range: bytes=0-15` trae 16 bytes y
las dos cabeceras:

| Archivo | Bytes | `Last-Modified` | `ETag` |
|---|---|---|---|
| `denue_00_31-33_csv.zip` | 57,607,659 | Wed, 20 May 2026 12:01:21 GMT | `4089975f50e8dc1:0` |
| `denue_19_csv.zip` | 21,475,515 | Wed, 20 May 2026 12:04:14 GMT | `79e4ebc650e8dc1:0` |
| `denue_05_csv.zip` | 12,113,938 | Wed, 20 May 2026 12:03:49 GMT | `289e2bb850e8dc1:0` |

Esa fecha **coincide** con el corte que declaran los metadatos
(`Modified: 2026-05-20`).

### Pero coincidir no es ser lo mismo

`Last-Modified` es la fecha del **servidor de archivos**. El corte es la fecha
del **dato**. Hoy coinciden; nada garantiza que coincidan siempre — INEGI podría
re-subir el mismo corte y mover la cabecera sin cambiar el dato.

Por eso el vigilante usa las cabeceras **solo para saber SI cambió**, y la fecha
del corte la lee de `metadatos_denue.txt` dentro del zip. Nunca de la cabecera,
nunca de la fecha de descarga.

## Cómo corre

```
Cada mes día 1, 09:00  ─┐
Manual - Revisar ahora ─┴→ Code - Firma remota      (3 peticiones de 16 bytes)
                          → Postgres - Última firma guardada
                          → Code - Hay corte nuevo
                          → IF hay algo que decir
                               sí → Code - Redactar el aviso  → (proceso + diff)
                               no → Postgres - Guardar la firma vista
```

### El veredicto nunca miente por omisión

| Veredicto | Cuándo |
|---|---|
| `sin_cambio` | Las tres firmas coinciden. **Único caso en que calla.** |
| `HAY_CORTE_NUEVO` | Alguna firma cambió |
| `primera_vez` | No hay firma previa contra qué comparar |
| `no_se_pudo_comparar` | Ningún archivo respondió, o la base no es legible |

`no_se_pudo_comparar` **no** es lo mismo que `sin_cambio`. Un vigilante que
calla cuando no sabe es peor que no tener vigilante.

Probado el 2026-09-18 con el trigger manual: leyó las tres firmas, reportó
`primera_vez` —correcto, porque `denue_firma` está vacía— y redactó el aviso.

## Lo que hace cuando hay corte nuevo

1. Baja los archivos por entidad y les lee **la fecha de corte de los
   metadatos**.
2. Los procesa con **las mismas reglas**, incluidas las exclusiones de punto de
   venta por nombre y por patrón de cadena.
3. Saca el diff contra el padrón vigente: **altas, bajas, cambios de estrato,
   domicilio, correo, sitio web y SCIAN**.
4. Avisa el resumen.

### Un salto de estrato hacia arriba es señal comercial

Va a `denue_cambio` con `es_senal = true` y alimenta el modo señal igual que una
nota de prensa. Que una planta pase de *51 a 100* a *101 a 250* significa que
creció, y eso mueve su turno sin que nadie haya publicado nada.

Un alta también es señal: la planta no existía en el corte anterior.

## Por qué hizo falta la migración 012

**El requisito de no sobrescribir rompía el modelo.** La 010 puso `id` como
llave primaria de `denue_planta`: eso funciona con un corte y colisiona con dos.

La 012 separa dos cosas que estaban mezcladas:

| Tabla | Qué es | Vida |
|---|---|---|
| `prospeccion.planta` | La **identidad**. A esto cuelgan corridas, contactos y puestos. | Entre cortes |
| `prospeccion.denue_planta` | La **foto** del censo. Una fila por `(id, corte)`. | Un corte |

Así el padrón de mayo sigue existiendo cuando llegue el de noviembre, y lo que
FTS construyó encima —historia, contactos, resultado de llamadas— **no se cae
con el cambio**. Una baja tampoco borra nada: `planta.vigente` pasa a `false` y
la historia sigue valiendo.
