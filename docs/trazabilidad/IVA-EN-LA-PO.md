# Detectar si la PO del cliente trae IVA

**Issue:** [#294](https://github.com/yinyo1/fts-suite/issues/294) · hermano de
[`ESPECIFICACION-CONFIRMACION.md`](ESPECIFICACION-CONFIRMACION.md) §3.1 candado 12

**2026-09-25 · diseño, no construido.** Sale de la **respuesta 5**: *«Hay clientes que ponen
IVA en su PO y otros que no. El código tiene que detectarlo, no preguntarlo.»* **No estaba en
el plan maestro y es trabajo nuevo.**

---

## 1 · El hallazgo que cambia el planteamiento

🔴 **No existe ningún campo en Odoo con el importe de la PO del cliente.** Medido:
`sale.order`, los **cuatro** campos que contienen «purchase»:

| campo | tipo | qué guarda |
|---|---|---|
| `x_studio_purchase_order_number` | `char` | el número |
| `x_studio_purchase_order_file` | `binary` | el archivo |
| `x_studio_purchase_order_file_filename` | `char` | el nombre del archivo |
| `purchase_order_count` | `integer` | *(nativo, cuenta POs de compra de Odoo — no es esto)* |

**Consecuencias, y hay que decirlas antes de proponer nada:**

1. **La heurística no se puede validar hacia atrás.** No hay historia contra la cual probarla:
   el dato que necesita **nunca se ha capturado**. Cualquier cifra de acierto que yo pusiera
   aquí sería inventada.
2. **El archivo no sirve para detectarlo.** Es un `binary` que el MCP no puede leer, y leerlo
   en el servidor significaría interpretar un PDF —a veces escaneado— para sacarle un total.
   Eso es una dependencia frágil dentro de un candado que bloquea dinero.
3. **Por lo tanto la detección arranca con la primera orden que pase por la pantalla nueva.**
   Y el diseño tiene que ser útil desde la primera, no cuando haya muestra.

---

## 2 · La heurística

**Se le pide a la persona UN número: el total que dice su PO.** No se le pregunta si trae IVA.

```
capturado = po_cliente.importe
subtotal  = machote.subtotal          (lo que el motor calculó)
total     = subtotal × (1 + tasa)     (si la orden lleva impuesto)
tol       = 0.01                      (un centavo)
```

| comparación | veredicto | qué significa |
|---|---|---|
| `|capturado − subtotal| ≤ tol` | **`SIN_IVA`** | el cliente emite su PO sobre el subtotal |
| `|capturado − total| ≤ tol` | **`CON_IVA`** | el cliente emite su PO con el impuesto dentro |
| la orden **no lleva impuesto** (`subtotal == total`) | **`NO_APLICA`** | no hay IVA que incluir: la pregunta no existe |
| ninguna de las dos | **`NO_DETERMINADO`** | §4 |

📌 **Esto SÍ es «el código lo detecta, no lo pregunta».** Pedir el total de la PO no es
preguntar por el IVA: es pedir un número que la persona está leyendo de todos modos, y del que
el código **deduce** la convención. La diferencia importa porque una pregunta de sí/no se
contesta en automático y mal; un número se copia.

### 2.1 · El caso `NO_APLICA` no es un fallo, y por eso tiene nombre propio

Medido: `sale.order`, `state='sale'`, cías 1 y 6, `date_order >= 2025-01-01`, `amount_tax = 0`:

| compañía · moneda | órdenes sin impuesto |
|---|---|
| cía 6 · USD | 19 |
| cía 1 · USD | 6 |
| cía 1 · MXN | 5 |
| **total** | **30 de 180 = 16.7 %** |

En esas 30, `subtotal == total`: **las dos comparaciones dan el mismo resultado** y el sistema
no puede —ni necesita— distinguir. Reportarlo como «no se pudo determinar» sería juntar dos
estados distintos en un mensaje y **elegir el peor por omisión**. Son estados separados.

En las otras **150 (83.3 %)** la comparación discrimina limpiamente.

---

## 3 · La memoria por cliente, y la llave correcta

Cada veredicto se guarda. A la siguiente orden del mismo cliente, la pantalla **ya sabe qué
esperar** y avisa cuando cambia.

```sql
CREATE TABLE comercial.po_convencion_iva (
  commercial_partner_id integer PRIMARY KEY,   -- ⚠️ ver abajo
  convencion   text NOT NULL,        -- 'con_iva' | 'sin_iva'
  veces        integer NOT NULL DEFAULT 1,
  veces_contra integer NOT NULL DEFAULT 0,     -- cuantas veces salio la contraria
  visto_ultimo timestamptz NOT NULL DEFAULT now(),
  ultima_orden text,
  CONSTRAINT po_convencion_ck CHECK (convencion IN ('con_iva','sin_iva'))
);
```

### 3.1 · 🔴 La llave es `commercial_partner_id`, NO `partner_id`

Medido sobre las 180 órdenes confirmadas de 2025+:

| agrupado por | grupos |
|---|---|
| `partner_id` | **44** |
| `commercial_partner_id` | **29** |

Un mismo cliente aparece como **la empresa y sus contactos**: en un caso, **cinco registros
distintos** del mismo cliente. Agrupando por contacto, sus 27 órdenes se parten en 15 + 5 + 2 +
2 + 1.

**Si la memoria se guardara por `partner_id`, diría «no sé» de un cliente al que le hemos
facturado veintisiete veces** — porque esta vez la orden vino a nombre de otro contacto suyo.
Es un índice que sólo cubre parte del universo y contesta «no» por lo que no cubre.

**Y la concentración hace que valga la pena:** los cuatro clientes mayores acumulan **99 de 180
órdenes (55 %)**. La memoria acierta pronto donde más se usa.

### 3.2 · Qué hace la memoria, y qué NO hace

✅ **Pre-llena** el importe esperado en el campo, para que la persona compare en vez de teclear
a ciegas.
✅ **Avisa cuando cambia**: *«este cliente siempre manda su PO con IVA, y ésta cuadra contra el
subtotal. ¿Cambió su forma, o hay un error?»* — y **deja pasar** si la persona confirma.
❌ **No decide.** El veredicto siempre sale de la comparación de esta orden. La memoria es un
copiloto, no una fuente.

⚠️ **Y `veces_contra` no es adorno.** Un cliente con 12 «con IVA» y 7 «sin IVA» **no tiene
convención**: tiene dos áreas que emiten distinto. La pantalla lo dice —*«este cliente manda de
las dos formas»*— en vez de sostener una mayoría que no significa nada. Un promedio sobre un
comportamiento bimodal es un número que miente con confianza.

---

## 4 · Cuando no se puede determinar

Es el caso que Esteban pidió expresamente: *«qué pasa cuando no se puede determinar»*.

**`NO_DETERMINADO` = el importe capturado no cuadra ni con el subtotal ni con el total.** Y eso
casi nunca es un problema de IVA: es que **la PO y la cotización no dicen lo mismo**, que es
justo lo que el candado del cuadre existe para atrapar.

**Bloquea.** Y enseña los tres números juntos, que es lo único que permite decidir:

> **La orden de compra no cuadra con la cotización.**
>
> | | |
> |---|---|
> | Tu PO dice | **$1,234,567.00** |
> | La cotización, sin IVA | **$1,000,000.00** |
> | La cotización, con IVA (16 %) | **$1,160,000.00** |
>
> No coincide con ninguno de los dos. Diferencia contra el más cercano: **$74,567.00**.
>
> Puede ser que el cliente haya puesto otro monto, que la cotización haya cambiado después de
> mandarla, o que la PO cubra **más de una** cotización.
> `[ Revisar la cotización ]  [ Corregir el importe ]  [ La PO cubre varias — anotar y seguir ]`

### 4.1 · El tercer botón, y por qué existe

**Una PO que cubre varias cotizaciones es un caso real**, no una excusa: el cliente junta tres
pedidos en una orden de compra. Sin salida, la persona **acabaría tecleando el número que hace
cuadrar** para poder confirmar, y el candado habría producido exactamente el dato falso que
venía a impedir.

Con salida: se anota el motivo, **queda con autor y fecha**, el veredicto de IVA se guarda como
`no_determinado` (**no contamina la memoria del cliente**), y sale en el vigilante para que
alguien lo mire con calma.

📌 **La lección, y es general:** un candado sin salida no produce cumplimiento. Produce
**elusión creativa**, y la elusión es invisible. Más vale una salida que deja rastro que un
muro que se rodea en silencio.

---

## 5 · Cómo se comprueba que la heurística sirve

No se puede hacia atrás (§1). Se comprueba **hacia adelante**, y el propio sistema lleva la
cuenta:

| indicador | qué se espera | qué significa si no |
|---|---|---|
| `NO_DETERMINADO` sobre el total | **< 10 %** | si es más, la heurística no está midiendo lo que creemos, o las POs no cuadran de verdad — **y las dos son hallazgos** |
| clientes con `veces_contra > 0` | pocos | los que manden de las dos formas, nombrados |
| veredictos por cliente después de 3 órdenes | estable | si oscila, la memoria no sirve para ese cliente y hay que decirlo |

⚠️ **Y la trampa a evitar al leerlo:** un `NO_DETERMINADO` **bajo** puede significar que la
heurística funciona **o** que casi nadie ha usado la pantalla. **Hay que exigir
`total_evaluado > 0` y decir cuántos son**, antes de declarar que algo funciona. Un cero en el
numerador se ve idéntico a un éxito.

---

## 6 · Lo que esto NO resuelve

- **No lee la PO.** Si la persona teclea mal el importe, la heurística cree lo que le dijeron.
  Lo que sí hace es que **un error de dedo casi siempre cae en `NO_DETERMINADO`** y se atrapa.
- **No detecta una PO por un alcance distinto** al mismo importe. Eso lo ve un humano.
- **No cubre monedas distintas** entre la PO y la orden. Si el cliente emite en dólares una
  orden en pesos, los números no se parecen y sale `NO_DETERMINADO` — correcto, pero el mensaje
  no lo nombra. Queda apuntado, no perseguido.
