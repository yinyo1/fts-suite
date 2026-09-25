# Cuándo se comisiona · los escenarios, mapeados

**Issue:** [#294](https://github.com/yinyo1/fts-suite/issues/294) · hermanos
[`ESPECIFICACION-CONFIRMACION.md`](ESPECIFICACION-CONFIRMACION.md) ·
[`APROBACION-BENEFICIARIO.md`](APROBACION-BENEFICIARIO.md)

**2026-09-25 · diseño, no construido.** Sale de la **respuesta 8**: *«hay varios escenarios y
los quiero mapeados y flexibles»*.

---

## 1 · El punto de partida, medido

De la investigación del [#291](https://github.com/yinyo1/fts-suite/issues/291):

| medición | resultado |
|---|---|
| renglones de comisión en la historia | **93**, −1.23 MMXN, **29 proyectos** |
| documentos que los pagan | **26**: 23 facturas de proveedor, 3 asientos de banco, **1 borrador sin postear desde nov-2025** |
| cuándo se pagaron las internas | **tres viernes consecutivos de sept-2025 y nada más** |
| meses sin pagar una comisión interna desde entonces | **doce** |
| campo que ligue la comisión al cobro del cliente | **ninguno** |
| renglones de comisión en 2026 | **1** |

🔴 **La frase que resume el problema: la cadencia medida es de NÓMINA, no de evento.** Tres
viernes seguidos y después nada. Se pagó **sin mirar el estado de cobro** de ninguna factura,
porque **no hay dónde mirarlo**: no existe el campo.

**Por eso la respuesta 8 es la pregunta correcta.** Mientras «cuándo se comisiona» no sea un
dato del sistema, es una decisión que alguien toma un viernes.

---

## 2 · Los escenarios

Los cuatro que Esteban nombró son **E1, E2, E3 y E4**. Los otros tres salen de mirar el ciclo
completo y de lo medido; van marcados **añadido**.

| # | disparador | típico de | qué tiene que ser cierto para dispararlo | ¿existe hoy el dato? |
|---|---|---|---|---|
| **E1** | **se aprueba para pago tras la entrega** | internos de FTS | la obra entregada **y** alguien la aprobó | ⚠️ «entregada» no es un estado del sistema |
| **E2** | ídem, **externos** | brokers, contactos de cliente | lo mismo | ⚠️ igual |
| **E3** | **se aprueba un anticipo** | los dos | la factura de anticipo **posteada** | ✅ `account.move.state = 'posted'` |
| **E4** | **se recibe el dinero del anticipo** | los dos | el pago **conciliado** contra la factura | ✅ pero ⚠️ ver §4 |
| **E5** *(añadido)* | **el cliente paga la factura final** | el caso que Esteban preguntó en el §8.9 del plan | `payment_state = 'paid'` | ✅ y ⚠️ igual que E4 |
| **E6** *(añadido)* | **se confirma la orden** | el más temprano posible | `state = 'sale'` | ✅ **es el único totalmente limpio hoy** |
| **E7** *(añadido)* | **a mano**, por decisión | la válvula | alguien con permiso lo decide | ✅ |

### 2.1 · Qué implica cada uno, en serio

| # | implica | riesgo |
|---|---|---|
| **E1/E2** | hay que **inventar el estado «entregado»**, que hoy no existe. Candidato natural: el stage de cierre del proyecto, que el watchdog del semáforo ya vigila | que «entregado» quede a criterio de quien mueve el stage |
| **E3** | comisionar sobre dinero **facturado, no cobrado** | si el cliente no paga, la comisión ya se devengó. **Necesita reversa** |
| **E4** | el más sano de caja: dinero **en el banco** | depende de la **conciliación**, y hay **63 pagos sin conciliar** con 6 referencias duplicadas |
| **E5** | el más conservador | tarda; y con cobranza lenta la comisión se siente como un castigo |
| **E6** | trivial de construir | comisiona sobre una promesa. **Sólo defendible con reversa automática** |
| **E7** | resuelve el caso raro | si es el único camino, vuelve el viernes de septiembre |

📌 **Ninguno es el correcto para todo.** Un interno de FTS y un broker externo no corren el
mismo riesgo ni hacen el mismo trabajo, y por eso la respuesta 8 pide **flexible**.

---

## 3 · Cómo se configura sin que quede rígido

**Una regla por (lado, tipo de beneficiario), no una constante global, y NO una regla por
persona.**

```sql
CREATE TABLE comercial.comision_regla (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A quien aplica. NULL = "cualquiera". Lo mas especifico gana.
  lado              text,        -- 'interno' | 'cliente' | NULL
  beneficiario_id   uuid REFERENCES comercial.comision_beneficiario(id),

  -- El disparador.
  evento    text NOT NULL,       -- 'orden_confirmada' | 'anticipo_facturado'
                                 -- | 'anticipo_cobrado' | 'entrega_aprobada'
                                 -- | 'factura_cobrada'  | 'manual'

  -- Cuanto de la comision se devenga con ESTE evento. Permite partirla:
  -- 40% al cobrar el anticipo y 60% al entregar son DOS renglones.
  proporcion numeric(6,4) NOT NULL DEFAULT 1.0,

  -- Si el hecho se revierte (nota de credito, pago devuelto, orden cancelada),
  -- se revierte el devengo.
  reversible boolean NOT NULL DEFAULT true,

  activo    boolean NOT NULL DEFAULT true,
  vigente_desde date NOT NULL DEFAULT current_date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,

  CONSTRAINT regla_evento_ck CHECK (evento IN ('orden_confirmada','anticipo_facturado',
    'anticipo_cobrado','entrega_aprobada','factura_cobrada','manual')),
  CONSTRAINT regla_proporcion_ck CHECK (proporcion > 0 AND proporcion <= 1)
);
```

**Tres decisiones dentro de esa tabla, y cada una evita un problema concreto:**

1. **`proporcion` permite partir la comisión entre eventos.** «40 % al cobrar el anticipo y
   60 % al entregar» son dos renglones que suman 1.0. Sin esto, cada cambio de política sería
   código.
2. **`vigente_desde` y nunca un `UPDATE` destructivo.** Cambiar la política **no** debe
   recalcular lo ya devengado. Se agrega una regla nueva con fecha; la vieja se queda diciendo
   bajo qué reglas se devengó lo de antes.
3. **`beneficiario_id` existe pero se usa poco.** La excepción por persona tiene que ser
   posible —siempre hay un caso— pero **si acaba siendo la norma, la tabla es una lista de
   acuerdos individuales** y nadie puede decir cuál es la política. Si más de un tercio de las
   reglas son por persona, eso es un hallazgo, no una configuración.

⚠️ **Y una regla ausente NO es «no comisiona».** Sin regla aplicable, el sistema **no devenga
en silencio**: deja el devengo en `sin_regla` y lo dice. Un beneficiario sin regla es una
omisión de configuración, no una decisión de no pagarle.

### 3.1 · El devengo, append-only

```sql
CREATE TABLE comercial.comision_devengo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiario_id uuid NOT NULL REFERENCES comercial.comision_beneficiario(id),
  odoo_so_id      integer NOT NULL,
  odoo_analytic_id integer,                 -- el proyecto
  evento    text NOT NULL,
  evento_ref text,                          -- la factura, el pago, el stage
  ocurrido_at timestamptz NOT NULL,
  base      numeric(18,2) NOT NULL,         -- SIEMPRE el subtotal (respuesta 6)
  moneda    text NOT NULL,
  tasa      numeric(6,4) NOT NULL,
  importe   numeric(18,2) NOT NULL,
  regla_id  uuid REFERENCES comercial.comision_regla(id),
  revertido_de uuid REFERENCES comercial.comision_devengo(id),
  pagado_move_id integer,                   -- la factura de proveedor, cuando se paga
  created_at timestamptz NOT NULL DEFAULT now()
);
```

📌 **Una reversa es un renglón NUEVO con `revertido_de`, no un borrado.** El mismo principio
del historial de versiones: lo que pasó, pasó. Y si nunca se borra, se puede explicar por qué
alguien cobró de más en marzo.

📌 **`base` es el subtotal, siempre**, por la respuesta 6. Queda escrito en el renglón y no se
recalcula: si mañana cambia la tasa de IVA, lo devengado no se mueve.

---

## 4 · La recomendación

**Por omisión, y hasta que haya datos para otra cosa:**

| lado | evento | proporción | por qué |
|---|---|---|---|
| **interno** | `entrega_aprobada` (E1) | 1.0 | es lo que Esteban nombró primero, y alinea la comisión con el trabajo hecho |
| **cliente** | `anticipo_cobrado` (E4) | 0.4 | el externo trae el negocio; se le reconoce cuando entra dinero |
| **cliente** | `entrega_aprobada` (E2) | 0.6 | el resto, al cerrar |

**Y tres cosas que hay que construir antes de que E1 y E4 sean posibles:**

1. 🔴 **«Entregado» no existe como estado.** Hoy lo más cercano es el stage de cierre del
   proyecto, que el watchdog del semáforo ya vigila. **Hay que decidir si ése es el hecho** o
   si hace falta un acto explícito. **Es una decisión de negocio, no de diseño**, y bloquea E1
   y E2 — o sea, bloquea la recomendación de arriba para los internos.
2. ⚠️ **E4 y E5 dependen de la conciliación, y la conciliación está atrasada:** **63 pagos sin
   conciliar**, con **seis referencias duplicadas**, y **61 de los 63 traen su referencia
   escrita en el propio pago**. Comisionar sobre «cobrado» con ese atraso significa comisiones
   que se devengan tarde y en lote — **el viernes de septiembre otra vez, con otro nombre**.
3. ✅ **E6 es el único evento totalmente limpio hoy.** Si hiciera falta arrancar ya, arrancaría
   por ahí **con reversa automática** al cancelar la orden — y se diría claramente que es un
   arranque, no la política.

---

## 5 · Qué cambia en la Confirmación

Poco, y a propósito:

- La Confirmación **escribe el presupuesto** de comisión por beneficiario (`budget.line`,
  paso 5 de las ocho escrituras). **Eso es el plan, no el devengo.**
- **El devengo lo produce un vigilante** que mira los eventos y aplica las reglas. Nunca la
  pantalla de confirmar.
- **El pago lo sigue haciendo Contabilidad**, como hoy: una factura de proveedor por persona.
  Lo que cambia es que ahora **hay una lista de lo devengado y no pagado**, que hoy no existe.

⚠️ **Y la razón de separar plan, devengo y pago en tres cosas** es que hoy están mezclados: los
**456 renglones de `budget.line`** de comisión se hicieron **por fuera**, el devengo no existe,
y el pago es una factura suelta. Con los tres separados se puede responder «¿cuánto le debemos
a quién?», que es la pregunta que hoy no tiene respuesta.

---

## 6 · La respuesta 9, construida: archivar, nunca borrar

**Decisión de Esteban: los rubros de quien ya salió se archivan.**

| qué | cómo |
|---|---|
| la cuenta analítica del plan 20 | `active = false` — sale del selector, **el histórico se conserva** |
| el renglón de `comercial.comision_beneficiario` | `estado = 'archivado'` con autor y fecha |
| lo devengado y no pagado | **se queda y se sigue viendo**. Salir de la empresa no borra lo que se le debe |
| los machotes que ya lo nombran | **no se tocan** — y al abrirlos, la pantalla marca «ya no está en la empresa» |

⚠️ **Medido hoy: las 32 cuentas del plan 20 están `active = true`**, incluidas las de las tres
personas que salieron en los últimos cinco meses. **La reparación R10 del plan maestro sigue
sin hacerse**, y es minutos de trabajo en la interfaz de Odoo. Mientras no se haga, cualquier
selector que se construya va a ofrecer a tres personas que no están — que es exactamente el
defecto que el selector viene a quitar.
