# `prospeccion/denue-padron` — como se baja el padron y por que asi

Workflow `z7hMVcLRg9CHsuDX`. **Solo lectura.** No escribe a Odoo ni a ninguna
base. Corre en Railway y no en la sesion de Claude Code porque INEGI esta
bloqueado por la politica de egress de esa sesion (403 al CONNECT). Rodear el
proxy no era opcion; Esteban autorizo la descarga desde n8n el 2026-09-18.

## Lo que costo caro averiguar

### 1. INEGI contesta 200 con HTML cuando el archivo no existe, no 404

Una URL equivocada devuelve **HTTP 200**, `content-type: text/html`, **1428
bytes**. El error no aparece en la descarga: aparece dos nodos mas abajo como
`Unsupported archive format ".html"`, lejos de su causa.

Por eso los 33 nombres de archivo estan **verificados uno por uno** con
`Range: bytes=0-15`, comprobando `206` + `Content-Range` + firma `PK`.

### 2. El archivo nacional baja perfecto y aun asi no se puede usar

`denue_00_31-33_csv.zip` **no esta corrupto**. Se leyo su directorio central
byte a byte:

| | |
|---|---|
| bytes descargados | 57,607,659 (= los que declara `Content-Length`) |
| firma inicial | `PK\x03\x04` |
| EOCD | presente, a 44 bytes del final |
| entradas | 3, las tres con firma local `0x04034b50` correcta |
| metodo | 8 (deflate) en las tres |
| miembro grande | `conjunto_de_datos/denue_inegi_31-33_.csv`, **345,398,090 bytes** |

El nodo Compression de n8n truena con `invalid zip data`. **No es el archivo.**
Se comprobo por eliminacion:

- un zip chico creado y descomprimido por el mismo nodo (round trip) funciona;
- el miembro de **118 MB** de Nuevo Leon descomprime bien;
- el miembro de **345 MB** no.

Es un techo de tamano del descompresor, no un zip malo.

### 3. Un Code node SI deja pasar binarios — la nota anterior estaba mal

Durante el diagnostico se creyo que un Code node intermedio corrompia el
binario, porque al meter un nodo de guarda aparecio `invalid zip data`. Se
desconecto la guarda y **el error siguio igual** (corridas 103800 y 103804).
La guarda nunca fue la causa; la causa siempre fue el tamano del miembro.

Queda escrito porque la conclusion equivocada ya estaba documentada en el
canvas y habria mandado a la proxima persona por el camino falso.

### 4. El Code node de esta instancia corre en `JsTaskRunnerSandbox`

Medido dentro del nodo:

| | |
|---|---|
| `require` | **no** |
| `DecompressionStream` | **no** |
| `ReadableStream` | **no** |
| `Buffer` | si |
| `TextDecoder` | si |

O sea: **no hay forma de descomprimir dentro de un Code node**. La
descompresion tiene que pasar por el nodo Compression, y por eso el techo de
tamano manda sobre el diseno.

## La solucion: 33 archivos por entidad

Ademas de esquivar el techo, es la **unica** forma de cumplir la regla de
rescate multiplanta, que exige contar sitios **nacionales**. Con el archivo
nacional de 31-33 tampoco se podria contar mejor, pero con las entidades se
cuenta el pais entero, que es lo que pide la regla.

Tamanos medidos (`Range: bytes=0-15`, suma 574.2 MB):

- 31 entidades responden `206` con `Content-Range`.
- **Mexico (15) viene partido**: `denue_15_1_csv.zip` (50.6 MB) y
  `denue_15_2_csv.zip` (30.2 MB). `denue_15_csv.zip` **no existe**.
- El mas grande de una sola pieza es CDMX (09), 43.3 MB.
- Nuevo Leon (19): 21.5 MB → 118,122,557 bytes de CSV, 211,350 lineas.
- Coahuila (05): 12.1 MB.

## Como corre

```
Manual
  → Code - Lista de archivos INEGI        (33 items)
  → Loop - Una entidad a la vez           (batchSize 1)
        ├── cada vuelta: HTTP → Compression → Code - Procesar entidad → back
        └── al terminar:  Code - Consolidar padron
```

`Code - Procesar entidad` saca, por entidad:

- **un item de conteo** con `{razon_social_normalizada: n_sitios}` de todo
  SCIAN 311/312 — para la regla nacional;
- **las filas completas solo de Nuevo Leon (19) y Coahuila (05)**.

Contar en las 32 y guardar en 2 es lo que cumple la regla sin cargar el pais
en memoria.

### Dos decisiones de parseo que no son cosmeticas

**Se recorre el Buffer, no `buf.toString()`.** Un `toString()` de 118 MB crea
una cadena JS de ~236 MB en UTF-16 y tumba al worker. Se camina con
`buf.indexOf(10, pos)`, que es nativo, y se decodifica **una linea a la vez**.

**Se filtra por `codigo_act`, no por el nombre del estado.** `codigo_act` es
numerico y ASCII, asi que el filtro es inmune a la codificacion. El DENUE ha
venido en UTF-8 y en Latin-1 segun el corte: filtrar por `"Nuevo León"` en un
archivo Latin-1 devolveria **cero filas sin un solo error**. Solo los campos de
texto se re-decodifican, con caida a Latin-1 si aparece `U+FFFD`.

### El bug que atrapo la prueba local

La normalizacion de razon social se probo en local **antes** de gastar una
corrida, y fallo:

```
FALLA -> ["RAGASA INDUSTRIAS A", "RAGASA INDUSTRIAS", "RAGASA INDUSTRIAS A P I"]
FALLA -> ["GRUPO LALA A B", "GRUPO LALA"]
FALLA -> ["LACTEOS VALLE ALTO R L", "LACTEOS VALLE ALTO"]
```

Al quitar la puntuacion, `S.A.P.I.` deja `S A P I` y `S.A.B.` deja `S A B`.
Borrar solo los tokens conocidos dejaba letras sueltas pegadas al nombre, asi
que **la misma empresa se contaba como dos**. El conteo nacional de la regla de
multiplanta habria salido mal **sin un solo error visible**.

Arreglo: en vez de borrar tokens en todo el nombre — que mutila nombres
legitimos con `DE`, `S`, `C` o `V` — se corta **la cola** de forma juridica,
que siempre va al final y sin puntuacion queda como letras sueltas. Con eso las
seis variantes colapsan y los pares que deben seguir distintos siguen distintos
(`SIGMA ALIMENTOS` ≠ `SIGMA ALIMENTOS LACTEOS`).

## Las reglas del padron

SCIAN 311 y 312 · excluir 311830, 311812, 311813 y 312112 · piso de estrato
**101+** general y **51+** para bebidas y lacteos · rescate de multiplanta con
**5+ sitios nacionales** y estrato **31+**.

---

## La unidad del padrón es el ESTABLECIMIENTO

Decidido por Esteban el 2026-09-18, después de reconciliar dos conteos que no
coincidían.

**El conteo previo de 120 no eran 120 plantas: eran 120 pares empresa-estado.**
Contando mi mismo padrón de esa forma da 121, y **Nuevo León cuadra exacto en
93**. Los 22 establecimientos de diferencia son grupos con varias plantas:
Bebidas Mundiales tiene 5, Mondelez 4, Bimbo 3.

Se descartaron antes dos sospechosos, y conviene dejarlos escritos para que
nadie los vuelva a investigar:

- **`3121` contra `312` completo: cero diferencia.** La implementación aplicaba
  el piso de 51 a todo 312; el criterio dice 3121. El único 3122 del padrón
  (cigarros) pasa el piso de 101 de todos modos.
- **`raz_social` vacía: tampoco.** La regla cae a `nom_estab`; exigir
  `raz_social` no vacía habría dado 63, no 120.

**Por qué el establecimiento.** FTS le vende a una planta, no a un corporativo.
Las 5 plantas de Bebidas Mundiales en dos estados son 5 objetivos que un
vendedor visita por separado; contarlas como 2 pierde 3 visitas reales.

### Diferencia conocida, sin resolver

**Coahuila da 28 empresas y el conteo previo decía 27. Una de diferencia.**
No la explica ninguna regla. Esta base tiene **9,440** unidades 311/312 contra
las **9,329** del conteo previo — **111 filas más**, consistente con un corte
distinto del DENUE, pero no se puede verificar porque no se sabe de qué corte
salió la cifra previa.

Queda anotada como diferencia conocida. **No se maquilla y no se ajusta el
filtro para que cuadre.**

### El corte, leído y no supuesto

`Identifier: MEX-INEGI.EEC2.05-DENUE-2026` · `DENUE 05_2026` ·
`Modified: 2026-05-20`, sacado del `metadatos_denue.txt` del propio zip.

El padrón estuvo etiquetado `2026-09` un rato, que es cuando se consultó, no la
fecha del dato. Es exactamente la confusión `fecha_dato` contra `fecha_consulta`
que el esquema de procedencia existe para impedir.

## Exclusión de puntos de venta

Aprobada por Esteban el 2026-09-18. Implementada en `scripts/cargar_padron.py`
y en `db/migrations/prospeccion/011_puntos_de_venta.sql`.

**La regla:** si el nombre del establecimiento contiene el de una cadena de
autoservicio, club de precio, tienda departamental o plaza comercial, es un
punto de venta y no una planta.

**Por qué ninguna otra columna sirve.** El DENUE clasifica esos mostradores en
311 —manufactura— y les asigna el **estrato del corporativo**, no el del local.
Un mostrador de helado dentro de un Soriana aparece como SCIAN 311520 con 251+
personas: idéntico a una planta en las dos columnas con las que se filtra.

**Resultado medido sobre el corte 2026-05:**

| | |
|---|---|
| Padrón firme | 143 |
| Marcados como punto de venta | **5** |
| **Plantas operables** | **138** |

Los cinco, con su razón:

| Establecimiento | Cadena |
|---|---|
| HELADOS SULTANA WALMART CHAPULTEPEC | Walmart |
| HELADOS SULTANA HEB PUERTA DE HIERRO | HEB |
| HELADOS SULTANA HEB LA PUERTA | HEB |
| HELADOS SULTANA SORIANA SAN PEDRO | Soriana |
| HELADOS SULTANA MOLL APODACA | plaza comercial |

**No se borran.** Se marcan con `es_punto_venta` y la razón legible en
`excluido_por`. Una exclusión que no se puede revisar es indistinguible de un
bug.

### Lo que la regla NO atrapa

Quedan **6 hermanas de Helados Sultana** que son casi con seguridad el mismo
tipo de local, pero cuyo nombre no carga ninguna cadena — están nombradas por
colonia o calle:

```
HELADOS SULTANA                          Saltillo    · Privadas de Aragón
HELADOS SULTANA LA CONCORDIA             Apodaca     · Bosque Real
HELADOS SULTANA RINCON DE LINDA VISTA    Guadalupe   · Rincón de Linda Vista
HELADOS SULTANA AGUASCALIENTES           Guadalupe   · Vivienda Popular
HELADOS SULTANA ELIAS CALLES             Guadalupe   · Hacienda Los Lermas
HELADOS SULTANA SAN JOSÉ                 Monterrey   · San Jorge
```

La señal que sí las delataría es otra: **la misma razón social con 10 sitios,
todos con el estrato idéntico, en colonias residenciales.** Es una regla
distinta a la aprobada y **no se aplicó**. Queda propuesta para que la decida
Esteban, no para aplicarla por cuenta propia.

---

## El tope de 128 MiB del runner, y por qué bloquea la fase 2

Medido el 2026-09-18, después de que tres corridas del conteo nacional murieran
**en la misma vuelta, la 6**.

### Lo que se descartó primero

| Hipótesis | Cómo se descartó |
|---|---|
| La carga acumulada del flujo | Se redujo la salida a 87 números por entidad. Murió igual, en la misma vuelta. |
| El patrón de búsqueda | Se encontró y corrigió un bug real: `"311` pegaba también con el campo `id` al inicio de línea. Murió igual. |
| La entidad 07 arrastra a las demás | Se corrió **sola**. Murió igual. |
| El parseo | Se quitó **todo** el parseo y se dejó solo contar bytes con `buf.indexOf`. **Murió igual.** |

Esa última prueba es la que cierra el caso: si contar bytes sin construir una
sola cadena tampoco vuelve, el problema no está en el código.

### El número

| Entidad | CSV descomprimido | Resultado |
|---|---|---|
| Coahuila (05) | 70,094,168 | llega en 4.9 s |
| Nuevo León (19) | 118,122,557 | llega en 8.6 s |
| **Chiapas (07)** | **137,200,944** | **nunca vuelve** |

El límite cae entre 118 MB y 137 MB. **128 MiB = 134,217,728 bytes** queda justo
en medio, y es el número redondo que suelen tener estos topes. No está probado
que sea exactamente ése; lo que **sí** está medido es que existe y dónde cae.

### Por qué esto bloquea el conteo nacional

`getBinaryDataBuffer` es la única forma de que un Code node vea el CSV, y el
Code node es la única forma de contar. **Once entidades tienen zip de más de
20 MB** y es probable que su CSV pase el tope: 07, 09, 11, 14, 15_1, 15_2, 16,
19, 20, 21 y 30.

**Un conteo parcial no sirve.** La regla pide sitios **nacionales**; resolverla
con 21 de 32 entidades sería inventar un número que parece medido. Las 95 filas
apartadas siguen apartadas.

### Las salidas posibles

1. **Subir el tope del runner** en Railway — `N8N_RUNNERS_TASK_TIMEOUT` y el
   límite de payload. Es un cambio de infraestructura sobre el n8n en
   producción, y lo decide Esteban, no esta herramienta.
2. **No pasar el CSV por el Code node.** Haría falta un nodo que parta el
   archivo antes, y ninguno de los disponibles lo hace.
3. **Otra fuente para el conteo nacional** que no exija descomprimir 32
   archivos.

Ninguna se aplicó. El workflow queda con las 33 entidades y con el tope
explicado en su propio código, para que el siguiente que lo abra no vuelva a
recorrer las cuatro hipótesis.
