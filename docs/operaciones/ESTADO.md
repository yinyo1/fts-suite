# Carga MO — estado al 2026-08-11

Punto de arranque para una sesión nueva. Todo lo de aquí está verificado contra la fuente
real el 11-ago-2026, no redactado de memoria: los montos salen de `account.analytic.line`
en Odoo, el build sale de Pages, los gates de correrlos.

Contexto profundo (por qué falló el parser v1, arquitectura, quirks): `PARSER_V2.md`.
Este archivo es el "dónde quedó", no el "por qué".

---

## 1. Las 3 semanas escritas

Las tres semanas de nómina que llevaban ~3 semanas sin distribuir ya están en Odoo.

| Semana | Jueves (fecha de las líneas) | Líneas | Monto | Rango de ids |
|---|---|---:|---:|---|
| SEM 30 | 2026-07-23 | 48 | $208,608.12 | 61854 – 61901 |
| SEM 31 | 2026-07-30 | 38 | $199,463.73 | 61902 – 61939 |
| SEM 32 | 2026-08-06 | 37 | $180,499.13 | 61940 – 61976 |
| **Total** | | **123** | **$588,570.98** | 61854 – 61976 |

El total cuadra al centavo con los $588,570.98 que arrojó el audit inicial. Los montos en
Odoo son **negativos** (son costo); la tabla los muestra en valor absoluto.

### Llaves de rollback

La llave de cada semana es el **prefijo del campo `name`**, que el motor construye como
`MO <semana> · emp<id> · <destino>`:

```
MO S30/2026 ·        MO S31/2026 ·        MO S32/2026 ·
```

Para deshacer una semana completa, en `account.analytic.line`:

```python
[('name', 'like', 'MO S30/2026 ·')]      # 48 registros
```

Verifica el count ANTES de borrar. El rango de ids es contiguo y sirve como segunda
llave de control, pero la llave buena es el `name` — es la que usa la idempotencia del
propio workflow para negarse a escribir dos veces la misma semana.

### Idempotencia

`Odoo - idempotencia` busca por ese mismo prefijo antes de escribir. Si la semana ya
existe, el motor devuelve `_write:false` con motivo
`la semana Sxx/2026 YA fue procesada -> no se vuelve a escribir`. **Para re-escribir una
semana hay que borrar sus líneas primero**; no hay flag para forzar.

---

## 2. La cuenta puente

**Cuenta 3106 · `MO · POR REASIGNAR`** (plan 2, gasto indirecto). La creó Esteban el
11-ago para que el dinero que el sistema no sabe atribuir **aparezca** en vez de
absorberse en silencio en alguna bolsa.

Saldo actual: **$8,741.90** en 3 líneas. Es todo lo que hay — la cuenta nació ese día.

| Línea | Semana | Qué es |
|---|---|---|
| 61892 | SEM 30 | finiquito de un empleado dado de baja que SÍ trabajó parte de la semana |
| 61930 | SEM 31 | viáticos: concepto clasificado `A_BOLSA` con destino puente |
| 61970 | SEM 32 | finiquito de un empleado dado de baja SIN horas esa semana |

**Los montos por línea no van en este documento.** Dos de las tres son finiquitos, o sea
compensación de una persona identificable, y el repo es público. El detalle vive en Odoo:
`account.analytic.line`, cuenta 3106, o filtrando por `name like 'MO S3'`. Quien tenga que
reasignar el dinero tiene acceso a Odoo; quien no lo tiene, no necesita las cifras.

Los tres son casos de diseño, no errores. Lo que el puente **no** contiene es igual de
importante: los sueldos de esos mismos empleados archivados por los días que sí
trabajaron se repartieron a sus proyectos reales, y sus vacaciones a la bolsa de su
departamento. Al puente solo llega lo que de verdad nadie puede atribuir.

**Este saldo es trabajo pendiente, no un resultado.** Alguien tiene que decidir a dónde
va cada peso y moverlo. Ver §6, módulo de reasignación.

---

## 3. Qué está vivo

### Frontend (GitHub Pages)

```
https://yinyo1.github.io/fts-suite/operaciones/carga-mo/
build   20260811-cmo-parser-v2c
main    434d15a
```

El build se ve en la barra superior. Si no dice `v2c`, es caché: Ctrl+F5.

### Catálogo de conceptos

```
shared/operaciones/contpaqi_conceptos.json
version  2026.3
sha      8a68f27d817c71ea1b4c103ae4010e1f69a4cbb3   (corto 8a68f27)
```

34 conceptos: 8 percepciones `POR_HORAS`, 6 percepciones `A_BOLSA`, 20 deducciones
`INFORMATIVO`. Más marcadores de segmentación, alias del trío, 7 validaciones
(A2/A3/A4/A5/A6/L2) y 3 alertas.

La página lo lee por la **API de GitHub** (fresca al instante) con el raw como respaldo,
y muestra `catálogo v2026.3 · main @ 8a68f27` arriba a la derecha. Ese sha es la forma
de saber qué catálogo está usando de verdad.

⚠️ `destinos.PUENTE` sigue en `null` en el catálogo mientras el motor tiene `3106`
hardcoded. Funciona, pero es exactamente el anti-patrón del §13 de CLAUDE.md. Pendiente
en §6.

### Workflows n8n

| Workflow | id | Estado |
|---|---|---|
| `planeacion/carga-mo` (dry-run) | `HV1UE5JxN5fKdC2Y` | activo · 12 nodos · motor `14d2dd11d3c25769` |
| `planeacion/carga-mo-WRITE` | `j0V9wfpuPTLFO9DZ` | activo · 21 nodos · motor `14a5a3ac0fba5cb9` · correo `e362c891055825` |

Los sha son `sha256(jsCode)` del nodo, verificados por **read-back** contra el archivo
fuente — no por la respuesta del PUT. Completos:

```
Code - MOTOR        (dry-run)  14d2dd11d3c257699787cfce95b5d8243d8ae4d54d9a03ce5d468ed36fb0a1dd
Code - MOTOR write  (WRITE)    14a5a3ac0fba5cb95e3c84e95b445789296f6b3e640574d97ed026c4a00fc656
Code - Build correo (WRITE)    e362c891055825360148fd1973e74a36b9f9abd71bd0d063df16b2cfd12a663a
```

**El dry-run ya no manda correo.** Sus dos nodos de correo se eliminaron (de 14 a 12
nodos): antes salía un correo en cada validación, incluida la que no escribe nada. Hoy el
correo sale únicamente del WRITE y sólo desde `Code - report written`, o sea sólo cuando
la escritura a Odoo ya ocurrió. El cuerpo vive en `scripts/local/build-correo-write.js`
(gitignored) y **informa, no autoriza**: el asunto dice «revisa antes de dispersar», no
«puedes dispersar», porque lo único verificado es que la escritura cuadra consigo misma.

Los dos cuerpos de motor salen de la **misma plantilla** (`scripts/local/motor-v2.js`).
Difieren en exactamente **2 líneas de 182**: el WRITE agrega `lineAgg` y el cuerpo real
de `addLine()` para materializar las líneas. La clasificación, la rama de archivados, el
trío, el puente y el control de los 3 pedazos son el mismo código. Si alguna vez los shas
dejan de derivar de la misma plantilla, algo se editó a mano y hay que reconciliar.

---

## 4. Los gates

Viven en `scripts/local/` (gitignored — leen los Excel de nómina reales desde
`C:\Users\esteb\nomina_tmp`, que nunca tocan el repo). Se corren **desde la raíz del
repo**:

```bash
cd C:/Users/esteb/Repos/fts-suite
node scripts/local/test-parser-v2.js       # 6/6   oráculo: 6 Excel reales
node scripts/local/check-mutaciones.js     # 8/8   mutaciones inyectadas a propósito
node scripts/local/smoke-front-cargamo.js  # PASS  render de la página sin navegador
node scripts/local/test-motor-v2.js        # 34/34 motor dry-run
node scripts/local/test-motor-write.js     # 20/20 motor WRITE + read-back
```

Los cinco en verde al cierre del 11-ago. Ninguno toca red, Odoo ni n8n.

Qué cubre cada uno, en una línea:

- **oráculo** — el resolver reproduce los totales de los 6 Excel y NO reproduce el fallo
  del parser v1.
- **mutaciones** — se corrompe el archivo a propósito de 8 maneras y las 8 se detectan,
  cada una en su nivel correcto (INTEGRIDAD bloquea / CLASIFICACIÓN avisa y sigue).
- **smoke-front** — corre el render real. `node -c` no ve errores de runtime; este sí.
  Incluye el assert de 3 vías del puente: bloque == KPI == `puente_total` del servidor.
- **motor v2** — clasificación, archivados, trío, precedencias, control de los 3 pedazos.
- **motor WRITE** — que el WRITE reparta **idéntico** al dry-run aprobado, y que el
  read-back cace `FALTA_EN_ODOO` / `MONTO_DISTINTO` / `SOBRA_EN_ODOO`, incluido el caso
  de un destino movido con el mismo total (que el gran total no ve).

**Regla:** ningún merge de UI que toque el render pasa sin `smoke-front`; ningún cambio
de motor pasa sin sus dos tests. Un `node -c` limpio no es un gate.

---

## 5. Cómo se corre una semana

1. Abrir la página, elegir el **viernes** de la semana (VIE→JUE).
2. Soltar el Excel de CONTPAQi. La página clasifica y muestra KPIs, bloque del puente y
   la revisión del archivo.
3. Si hay fallas de **INTEGRIDAD**, el botón queda cerrado. CLASIFICACIÓN y AVISO no
   bloquean: lo no clasificado se va al puente y se ve.
4. **Validar nómina** → el servidor responde con el pivote completo, y a partir de ahí
   el bloque del puente se pinta desde el servidor, no desde la estimación local. Esta
   validación **no manda correo** y no escribe nada.
5. Revisar: `roster_odoo` (debe ser el roster completo, hoy 132), `excepciones: []`,
   `listo_para_escribir: true`, Δ $0.00, y que los tres pedazos del control cierren en 0.
6. Botón rojo **Enviar a FTS (Correo + Odoo)**. El WRITE repite todo el cálculo, escribe,
   **relee de Odoo**, compara renglón por renglón y recién entonces manda el correo.

Si el read-back no cuadra, la respuesta viene con `modo:'ESCRITO_CON_DISCREPANCIA'` y
`escritura_ok:false`, más el detalle de qué renglón difiere. **No lanza excepción a
propósito**: un throw mataría el correo y con él el diagnóstico. Es falla dura en lo
único que importa — no se puede confundir con éxito.

---

## 6. Pendientes

### UI (3 arreglos, acordados para después del WRITE) — ✅ hechos en el rediseño

Rediseño para Ulises (build `20260811-cmo-ui-ulises`, **construido y con los 5 gates en
verde; pendiente de push**). La pantalla dejó de estar pensada para quien conoce Odoo: la
pregunta que contesta ahora es una sola, «¿puedo mandar esta nómina o no?».

1. ✅ **Botón al pie.** Los dos botones subieron a la barra superior, en una línea con la
   fecha y el selector de archivo: **Validar nómina** y **Enviar a Odoo**.
2. ✅ **KPIs y puente se pintan completos aunque haya falla de INTEGRIDAD.** Con
   integridad > 0 ambos bloques quedan atenuados y con la nota de que sus números salen
   de un archivo que no cuadra.
3. ✅ **Tres avisos para la misma persona.** Los AVISO se agrupan por persona (`cod
   nombre` al inicio del `dato`); un finiquito es ahora una sola tarjeta con sus tres
   líneas de detalle. INTEGRIDAD y CLASIFICACIÓN NO se agrupan: cada uno es accionable
   por separado.

Cambios de la misma iteración: título "Validación de Nómina y Carga de Mano de Obra";
**la palabra "DRY-RUN" desapareció de la interfaz** (el `modo:'dry_run'` del payload NO
cambió — es contrato con el motor, no texto de pantalla); banner de estado grande con
semana, total, empleados y Δ; y todo el detalle colapsado (nómina leída, pivote por
proyecto, respuesta del servidor) **salvo avisos y cuenta puente, que nunca se colapsan**
porque son justo lo que hay que leer antes de mandar.

⚠️ El **pivote por proyecto** queda colapsado por defecto pero visible: expone la
estructura de costos por obra a un contador externo. Decisión de Esteban: se acepta por
ahora; más adelante se evalúa esconderlo por rol.

### Motor / backend

4. **`destinos.PUENTE` sigue `null` en el catálogo** y el motor tiene `3106` hardcoded.
   Mover el id al catálogo y que el motor lo lea. Anti-patrón §13 de CLAUDE.md.
5. **Control `ok:null`** — cuando los 3 pedazos no son comparables (p.ej. hay códigos sin
   empleado), el control se calla en vez de reportar la discrepancia. Aprobado el cambio
   a "reporta el delta aunque no sea comparable", no implementado.
6. **Baselines de desviación al motor.** `DESVIACION_INDIVIDUAL` existe en el resolver
   pero está inerte: los baselines por persona son datos sensibles y se sacaron del
   catálogo (repo público). Decisión tomada: viven en n8n. Sin eso, la alerta no dispara.
7. **W8 — watchdog "semana sin cargar".** P0.5. Nadie avisa si una semana no se cargó;
   así fue como se acumularon tres. Debería correr los viernes y gritar.

### Accesos

8. **Segundo operador.** Erick Belmont (empleado 149) tiene que poder correr la carga sin
   el login de Esteban. Aprobada la opción (b): usuario propio + scope `nomina:write` en
   el JWT, en vez de compartir credencial. Sin empezar.
9. **Scope en el JWT.** Hoy el token de Finanzas es todo-o-nada. Falta el scope por
   módulo para que `nomina:write` signifique algo.

### Módulos nuevos

10. **RH — alta de empleado con campos obligatorios.** El alta debe exigir código
    CONTPAQi, cuenta indirecta default y la decisión `solo_bolsa`. Hoy un empleado nuevo
    sin código rompe la carga con "código sin empleado" y aborta la semana entera.
11. **Reasignación del puente.** Los $8,741.90 no se mueven solos. Hace falta una
    pantalla que liste las líneas de 3106, deje elegir destino y escriba el movimiento.
    Sin esto el puente se convierte en un cajón donde el dinero entra y no sale, que es
    justo lo que la cuenta existe para evitar.

---

## 7. Quirks descubiertos el 11-ago

Los cuatro son variantes del mismo error: **algo que parece verificado y no lo está.**
Están aquí porque cada uno costó tiempo y ninguno es evidente leyendo el código.

### `=` doble en expresiones de n8n

Pegar `={{ ... }}` en un campo que YA está en modo Expression antepone otro `=`. Queda
`=={{ ... }}` y el valor deja de evaluarse — se manda el string literal. En un filtro de
Odoo eso llega al dominio como basura.

Peor todavía: en un caso el valor quedó `"=\t={{ [true, false] }}"` — doble `=` **y** un
tab. Y **mi propio verificador dio verde**, porque evaluaba solo lo de adentro de las
llaves en vez de la semántica completa de n8n. El chequeo correcto es: el valor debe
empezar con **un solo `=`**, no contener tabs ni saltos, y evaluarse al tipo esperado.

### `active_test` implícito en Odoo

Toda búsqueda en Odoo filtra `active = True` **sin que aparezca en el dominio**. El
workflow traía `roster_odoo: 34` en vez de 132 y el motivo no estaba a la vista.

Y el detalle que importa: quitar el filtro `active` **no basta** — sin mención explícita
de `active`, el filtro implícito sigue puesto. Hay que decirlo:

```
fieldName: active   operator: in   value: ={{ [true, false] }}
```

Los empleados dados de baja son precisamente los que hay que ver: su finiquito es lo que
alimenta el puente. Un roster que los esconde reparte mal y no se queja.

### `update_partial` valida verde y no escribe

El API de esta instancia rechaza `update_partial` con
`request/body must NOT have additional properties`, pero la validación previa pasa. Se
reporta éxito y el workflow queda igual.

Alternativa que sí funciona: **PUT directo al API** con solo las claves permitidas
(`name`, `nodes`, `connections`, `settings`) — leyendo el workflow completo, parchando en
memoria y volviéndolo a subir. Así se aplicó el motor al WRITE sin transcribir 17 KB a
mano. La clave del API está en `~/.claude.json` → `mcpServers['n8n-mcp'].env`.

### `validateOnly:true` es engañoso

Nunca toca el API. Devuelve verde sobre un workflow que jamás vio el servidor. **No es
evidencia de nada.**

### El PUT rechaza `settings.binaryMode`, que el propio GET devuelve

Al aplicar un edit por PUT directo, el API contesta
`400 request/body/settings must NOT have additional properties`. El culpable es
`settings.binaryMode: "separate"`: **viene en la respuesta del GET** pero no está en el
esquema del PUT. Hay que quitar esa clave del body y mandar el resto de `settings`
intacto. El valor sobrevive del lado servidor — verificado en read-back, sigue en
`separate`.

Es la misma trampa que `customResource`, que se vacía al importar un JSON: **lo que el
API entrega no es necesariamente lo que el API acepta de vuelta, ni lo que conserva.**
Corolario operativo: después de cualquier PUT hay que releer y comparar campo por campo
lo que creías estar preservando. Un 200 no dice nada sobre lo que quedó guardado.

### Y la regla que las une

`update_full` togglea `active` de forma no determinista, y el API rechaza re-activar.
Todo edit termina con **read-back desde cero**: `active`, `versionId == activeVersionId`,
sha256 del jsCode, y los parámetros crudos pegados. La respuesta del PUT no cuenta —
hay que volver a preguntar.

---

## 8. Dónde está cada cosa

```
operaciones/carga-mo/index.html          la página (build en CMO_BUILD, arriba del todo)
operaciones/carga-mo/js/resolver.js      el parser v2, UMD: corre en browser y en node
shared/operaciones/contpaqi_conceptos.json   el catálogo de conceptos
docs/operaciones/PARSER_V2.md            por qué falló v1, arquitectura, lecciones
docs/operaciones/ESTADO.md               este archivo

scripts/local/    (gitignored, NO subir — leen nómina real)
  motor-v2.js            plantilla única del motor: cuerpoMotor(MODO_WRITE)
  motor-write-tail.js    cola del WRITE + el nodo 'Code - report written'
  test-*.js check-*.js smoke-*.js        los 5 gates
  _write_wf.json         copia del workflow WRITE (para parchar sin re-bajarlo)

C:\Users\esteb\nomina_tmp\               los Excel de CONTPAQi. Nunca al repo.
```

**El repo es público.** Nada de nombres de empleado, montos individuales ni ids de
attendance en lo que se commitea — incluido lo que parece configuración. Un dato
sensible disfrazado de config ya se coló una vez en el catálogo y hubo que sacarlo en dos
barridos.
