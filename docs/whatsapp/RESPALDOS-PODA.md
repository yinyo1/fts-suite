# Poda de respaldos (R7): simulada hoy, propuesta para después

Hoy `memoria-mantenimiento` escribe un `pg_dump` diario a `memoria-respaldos` y **nunca borra**. Así se pidió esta
noche: nada de borrar. El bucket crece sin límite, aunque todavía son centavos: la base pesa 0.2 GB y un dump
comprimido medido en local pesó 133 KB.

## Retención propuesta: 14 diarios, 8 semanales y 12 mensuales

Por cada periodo se conserva **el respaldo más reciente**:
- los 14 días más recientes que tengan respaldo;
- las 8 semanas ISO más recientes;
- los 12 meses más recientes.

Un día sin respaldo no gasta uno de los 14. En régimen, eso deja entre 26 y 34 dumps vivos (los periodos se
enciman). Además:
- el respaldo más reciente se conserva siempre;
- una clave con fecha en el futuro se conserva y se marca para revisar a mano;
- **una clave con otro formato no se toca nunca**. Sólo se reconoce lo que escribe `mantenimiento.sh`:
  `pg_dump/AAAA/MM/DD/fts_suite_AAAAMMDDTHHMMSSZ.dump`.

## Simulador: `whatsapp/mantenimiento/poda.ts`

```sh
bun whatsapp/mantenimiento/poda.ts --lista claves.txt   # sin red: una clave por línea
bun whatsapp/mantenimiento/poda.ts                       # lista el bucket con S3_* (sólo lectura)
```

Devuelve:
- `conservar` (cada clave con sus motivos: `diario 2026-09-28`, `semanal 2026-W39`, `mensual 2026-09`);
- `borraria`;
- `ignoradas`;
- `bytes_liberados`.

**No borra nada.** El código no llama a ninguna operación de borrado, y una prueba lo comprueba leyendo la fuente.
Pruebas: `bun test whatsapp/mantenimiento/`, 4/4 con 420 días de claves sintéticas.

## Cómo pasar de simulado a real (decisión de Esteban)

La regla de 14/8/12 **no se puede expresar sólo con una regla de ciclo de vida del bucket**: esas reglas cortan por
prefijo y edad, no por «el más reciente de su semana». Hay dos caminos:

**A · Recomendado: el bucket borra, el script sólo acomoda.** `mantenimiento.sh` escribe el dump del día en
`pg_dump/diario/…`. Si es domingo, lo **copia** del lado del servidor a `pg_dump/semanal/…`. Si es día 1, también a
`pg_dump/mensual/…`. La copia es S3 `CopyObject`: sin bajar ni volver a subir. Luego tres reglas de ciclo de vida:

```json
{ "Rules": [
  { "ID": "diario-15d",   "Filter": { "Prefix": "pg_dump/diario/" },  "Status": "Enabled", "Expiration": { "Days": 15 } },
  { "ID": "semanal-57d",  "Filter": { "Prefix": "pg_dump/semanal/" }, "Status": "Enabled", "Expiration": { "Days": 57 } },
  { "ID": "mensual-366d", "Filter": { "Prefix": "pg_dump/mensual/" }, "Status": "Enabled", "Expiration": { "Days": 366 } }
] }
```

Ventaja: el script **nunca** tiene permiso lógico de borrar, y un error del script no puede llevarse los mensuales.
Costo: tres copias por semana o por mes de un archivo chico.

⚠️ **Pendiente de verificar antes de aplicarla:** que los buckets de Railway (Tigris) acepten
`PutBucketLifecycleConfiguration` con `Expiration` por prefijo. No se probó esta noche porque aplicar la regla ya
es borrar.

**B · El simulador en modo real.** Agregar a `poda.ts` una bandera `--borrar` que sólo borre lo que el plan marque, y
exija antes que exista una `memoria.respaldo_prueba` con `ok = true` más reciente que lo que se va a borrar. Es más
flexible, pero el script tendría que poder borrar, y es justo lo que el camino A evita.

## Qué NO se borra nunca, pase lo que pase

- El respaldo más reciente con **prueba de restauración OK**. En A lo cubren las reglas. En B lo exige el script.
- Los dumps de antes de una migración `memoria_*`. Conviene copiarlos a `pg_dump/migracion/` sin regla de
  expiración: el camino de regreso si una migración sale mal.
