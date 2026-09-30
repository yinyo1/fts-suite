# Bloquear la confirmación en Odoo, y apagar el radar

**Pasos 2 y 3 del rumbo de la Estación 3 · escrito el 29-sep-2026 · #294**

> ⚠️ **NADA DE ESTE DOCUMENTO ESTÁ EJECUTADO.** No se creó ninguna regla, no se
> tocó ningún permiso, ningún grupo y ningún workflow. Son clics de Esteban en
> Odoo, y están aquí para que los haga sabiendo qué se rompe con cada camino.

---

## 0 · El orden de los tres pasos no es preferencia, es dependencia

```
1. que se pueda confirmar desde la suite          ← hecho (V1.46)
2. que NO se pueda confirmar en Odoo, salvo tú    ← este documento
3. apagar el radar que descubre las confirmadas   ← este documento
```

**El 2 no puede ir antes del 1** porque dejaría al equipo sin forma de confirmar.
**El 3 no puede ir antes del 2** porque el radar es hoy lo único que le pone
proyecto, analítica y presupuesto a una orden confirmada a mano en Odoo: apagarlo
mientras esa puerta siga abierta produce órdenes confirmadas sin nada detrás, y
ésas no dan error — simplemente no aparecen en ningún reporte de rentabilidad.

---

## 1 · Qué es «confirmar», técnicamente

Medido leyendo el paso 6 de `comercial/confirmar` (`Cyapm1EfPPbTxSi5`, activo):

```
await kw('sale.order', 'action_confirm', [[soId]]);
```

`action_confirm` es un **método**, y por dentro hace un `write` de `state` a
`'sale'`. Eso importa para elegir el candado: lo que hay que impedir es que un
`sale.order` **acabe** en `state = 'sale'`, no que alguien apriete un botón —
porque el botón no es el único camino (la importación y el API llegan al mismo
sitio sin pasar por la vista).

---

## 2 · Los cuatro caminos, con su mecanismo y su modo de fallo

### A · Esconder el botón desde Studio

**Qué es.** Poner `invisible` en el propio botón Confirmar de la vista de
`sale.order`, condicionado al usuario.

| | |
|---|---|
| **Mantenimiento** | Ninguno. Es una propiedad de la vista. |
| **Reversible** | Un clic. |
| **Qué NO cubre** | **El API, la importación y cualquier automatización.** Una vista no es un permiso: es lo que se dibuja. |
| **Precedente en casa** | Sí — está documentado en `CLAUDE.md` §17 quirk 4 que un `required` de vista **no** bloquea el Confirmar y que poner `invisible` en el botón sí, para la interfaz. |

🔎 **Lo que hay que comprobar y NO está comprobado:** que la condición pueda
referirse al usuario. En las vistas de Odoo el contexto de evaluación de los
modificadores suele traer `uid`, o sea algo de la forma
`invisible="context.get('uid') != 2"`. **Eso es una deducción, no una medición.**
Si no funciona, este camino esconde el botón para **todos**, tú incluido, y deja
de servir para lo que se quiere.

**Sirve para:** quitar el camino fácil mientras se prueba otro. No como candado.

---

### B · Una `ir.rule` global sobre `sale.order`

**Qué es.** Una regla de registro **global** —no de grupo— con `perm_write`, cuyo
dominio excluya el estado confirmado salvo para el usuario maestro. Algo de la
forma:

```
modelo:   sale.order
global:   sí
permisos: sólo escritura
dominio:  ['|', ('state', '!=', 'sale'), ('write_uid', '=', <uid maestro>)]
```

| | |
|---|---|
| **Mantenimiento** | Ninguno una vez puesta. |
| **Reversible** | Desmarcar `Activo`. |
| **Qué cubre** | Todo: interfaz, API, importación. Ningún grupo esquiva una `ir.rule`; sólo el superusuario uid 1, que aquí está inactivo. |
| **Por qué GLOBAL** | Las reglas no globales son **permisivas y se combinan con OR entre grupos**, así que una regla restrictiva metida en un grupo no restringe nada mientras otro grupo dé acceso. Está medido y escrito en `CLAUDE.md` §9 a propósito de la `ir.rule` 814. |

🔎 **Las DOS deducciones que hay que probar antes de confiar:**

1. **Que Odoo re-evalúe la regla DESPUÉS del `write`.** El candado de arriba
   funciona sólo si, al terminar de escribir, Odoo vuelve a exigir que el
   registro siga cumpliendo el dominio. Si sólo comprobara ANTES, un registro en
   `draft` pasaría la prueba y acabaría en `sale` igual.
2. **Que `write_uid` ya valga el usuario que escribe en el momento de la
   comprobación.**

⚠️ **Y aquí está la lección que costó cuatro días.** La `ir.rule` **814** se
diseñó con un razonamiento idéntico de plausible —«el asiento de la captura
tendrá `statement_line_id`»— y resultó falso, porque Odoo crea el `account.move`
**antes** de enlazar la línea bancaria. Rechazó seis transacciones en cada corrida
durante cuatro días. La frase que quedó escrita entonces vale palabra por palabra
aquí:

> **el momento del enlace no se deduce del perfil del campo ni del patrón de
> herencia, sólo se comprueba probando.**

---

### C · Quitar el permiso de escritura al grupo de ventas

**No.** Se documenta para que nadie lo proponga en tres meses: quitarle `write`
sobre `sale.order` al grupo de vendedores impide confirmar **y también** editar
una cotización, cambiar un renglón, corregir un cliente. El candado sería más
ancho que la puerta.

---

### D · Una Automation Rule con Python (`base.automation`)

**Qué es.** Exactamente el patrón que FTS ya usa dos veces: las reglas **56 y 57**
del candado A3, con disparador `on_state_set` y un `raise UserError` cuando la
condición no se cumple. Aquí sería sobre `sale.order`, disparo a *Sales Order*, y
unas pocas líneas: si `self.env.uid` no es el maestro, `raise`.

| | |
|---|---|
| **Mantenimiento** | Bajo, pero **no nulo**: es código, y el código se lee mal dentro de un año. |
| **Reversible** | Desmarcar `Activo`. Un clic, igual que las 56/57. |
| **Qué cubre** | Todo lo que pase por el ORM, que es todo lo que nos importa. |
| **Precedente en casa** | **El más fuerte de los cuatro.** Es lo que ya corre en producción desde junio para el candado analítico, con su prueba 5/5 antes del flip y su válvula documentada. |
| **El costo que ya conoces** | Una Automation Rule con Python **cuenta como custom** en el modelo de cobro de Odoo SaaS. Ya lo pesaste y lo aceptaste para A3; aquí es la segunda vez, no la primera. |

**La ventaja que ninguno de los otros tiene:** el mensaje. Un `raise UserError`
puede decir *«la confirmación se hace desde la Suite; esta orden se queda en
borrador»* y poner la liga. Una `ir.rule` sólo puede decir su **nombre** —el texto
del error no es personalizable sin Python, y eso también está medido (§9, 814)—,
así que con B el nombre de la regla **es** la instrucción, y no hay más.

---

## 3 · Recomendación

**D (Automation Rule) como candado, y A (esconder el botón) encima si se puede
condicionar al usuario.**

Las razones, en orden:

1. **Es el único con precedente medido en esta casa.** B es más elegante y
   depende de dos deducciones que ya fallaron una vez en una superficie parecida.
2. **El mensaje importa más de lo que parece aquí.** El equipo no está haciendo
   algo malo: está haciendo lo de siempre en el sitio de siempre. Un error que
   sólo dice el nombre de una regla enseña a buscar a quien lo quite, no a usar
   la suite.
3. **A y D no compiten, se suman.** A quita el camino fácil y D cierra los demás.
   Si A no se puede condicionar al usuario, se deja A fuera y D solo basta.

⚠️ **Y lo que NO recomiendo hacer nunca, con ninguno de los cuatro:** encenderlo
sin haber confirmado una orden de prueba desde la suite **ese mismo día**. El
candado y el camino nuevo se prueban juntos o no se prueban.

---

## 4 · La válvula, antes de encender nada

Sea cual sea el camino, **antes** de activarlo tiene que estar escrito cómo se
apaga, y tiene que ser un clic:

| camino | cómo se apaga |
|---|---|
| A · botón escondido | quitar la condición `invisible` en Studio |
| B · `ir.rule` | desmarcar `Activo` en la regla |
| D · Automation Rule | desmarcar `Activo` en la regla |

Y **quién** lo apaga tiene que poder hacerlo sin Claude Code y sin consola: si la
válvula exige pegar un `fetch` en F12 —como la de la 815— entonces sólo la puede
abrir quien sepa hacer eso, y a las 7 de la mañana de un lunes eso es nadie.

---

## 5 · Paso 3 · Apagar el radar sin dejar órdenes a medio camino

### 5.1 · Qué hace hoy el radar, medido

`u7Ni2cRAxu3zfBid` (`crear-proyecto-al-confirmar`, Schedule **cada 5 minutos**,
28 nodos) busca órdenes en `state = 'sale'` con `x_studio_project_created = False`
y les crea proyecto, cuenta analítica y presupuesto, y manda el correo de handoff.

### 5.2 · El enclavamiento que ya existe, y es la clave

Esto **no** hay que construirlo: ya está, y está medido. El paso 5 de
`comercial/confirmar` marca la bandera **antes** del paso 6, y el porqué está
escrito en el propio nodo:

> *«El radar (u7Ni2cRAxu3zfBid) corre cada 5 minutos buscando órdenes en `sale`
> con `x_studio_project_created` en falso. Confirmar primero abriría una ventana
> de hasta cinco minutos en la que el radar vería la orden libre y crearía un
> SEGUNDO proyecto, otra analítica y otro presupuesto. Marcando antes, nunca la
> ve libre.»*

O sea: **hoy los dos conviven sin pisarse.** Apagar el radar no es urgente ni
arriesgado por ese lado; lo que el radar cubre es el **otro** camino, el de
confirmar en Odoo a mano.

### 5.3 · El orden, y la comprobación de cada paso

```
1. Encender el candado del paso 2 y dejarlo correr UNA SEMANA.
   ↳ comprobación: cero órdenes nuevas en `sale` con la bandera en falso.
     Si aparece alguna, alguien encontró un camino y el candado no está cerrado.

2. Barrer lo que quedó atrás ANTES de apagar nada.
   ↳ las órdenes ya confirmadas con la bandera en falso son exactamente las que
     el radar todavía tiene pendientes. Se deja que las termine.

3. Apagar el radar (desmarcar Active en n8n).
   ↳ ⚠️ el API de esta instancia NO deja activar ni desactivar por MCP. Es un
     clic tuyo en la interfaz, y el read-back del flag hay que mirarlo después
     (`CLAUDE.md` §3, y §17 quirk 2b: `active` no basta, hay que comparar
     `versionId` con `activeVersionId`).

4. Dejar una semana más con el radar apagado y volver a contar lo mismo.
   ↳ si sale un cero de verdad, el ciclo está cerrado. Si sale un cero porque
     nadie confirmó nada esa semana, **eso no es un cero**: es la trampa del
     `insertadas: 0` de §9. Hay que exigir que el caso haya ocurrido —órdenes
     confirmadas > 0— antes de dar la prueba por buena.
```

### 5.4 · Lo que se pierde al apagarlo, dicho claro

El radar también manda **el correo de handoff** al grupo de producción. Antes de
apagarlo hay que comprobar que `comercial/confirmar` lo manda también, o el
equipo de operaciones deja de enterarse de las órdenes nuevas — y ése es un fallo
que nadie reporta el primer día, porque no se ve: simplemente no llega nada.

**No lo medí.** Está en la lista de lo que queda pendiente del turno.

---

## 6 · El plan de prueba, antes de confiar en cualquiera de los cuatro

Sobre una **orden de prueba**, no sobre una real:

1. Con el candado **apagado**: confirmar desde la suite y que funcione.
2. Encender el candado.
3. Intentar confirmar **en Odoo** con un usuario normal → tiene que fallar, y hay
   que **leer el mensaje** que sale: si no dice a dónde ir, el candado va a
   producir una llamada telefónica, no un cambio de hábito.
4. Intentar confirmar **en Odoo** con el usuario maestro → tiene que funcionar.
5. Confirmar **desde la suite** → tiene que seguir funcionando. **Éste es el paso
   que la 814 se saltó**, y por eso rompió la captura cuatro días: se probó que
   el bloqueo bloqueaba y no que lo demás seguía vivo.
6. Y exigir que el caso **haya ocurrido**: si en el paso 5 no había nada que
   confirmar, no se probó nada.

---

## 7 · Corrección del 30-sep-2026: el paso 1 del plan de prueba HOY NO PASA

Todo lo de arriba sigue en pie, con una salvedad que cambia el calendario: **el
paso 1 —«confirmar desde la suite y que funcione»— no se puede cumplir todavía.**

Al recorrer el ciclo se midió que la suite **no puede confirmar por ningún
camino**: `orden-crear-v2` no completa (cuatro lecturas de Odoo encadenadas sin
`executeOnce`, ~47,000 llamadas) y `orden-crear` v1 crea líneas sin producto, que
Odoo se niega a confirmar. Los dos defectos y sus arreglos, en
[`POR-QUE-NO-SE-PODIA-CONFIRMAR.md`](POR-QUE-NO-SE-PODIA-CONFIRMAR.md).

**Por qué esto importa para este documento, y no es un detalle de secuencia:** el
rumbo que fijó Esteban es *primero se logra confirmar desde la suite, luego se
bloquea en Odoo, luego se apaga el radar*. Encender el candado **antes** de que
la suite pueda confirmar dejaría a la empresa sin ninguna forma de confirmar una
orden salvo el usuario maestro. O sea, el orden no era una preferencia: es lo que
evita convertir dos defectos en un paro.

📌 **Y es exactamente la lección de la `ir.rule` 814 otra vez, un paso antes.**
Aquella probó que el bloqueo bloqueaba y no que lo demás seguía vivo. Aquí el
riesgo es más temprano todavía: probar que el bloqueo bloquea **cuando el camino
alterno nunca funcionó**. El paso 1 no es un trámite del plan de prueba — es su
única precondición real.

**Así que el paso 2 del rumbo queda bloqueado por el paso 1**, y el paso 1
necesita los tres cambios del otro documento. Aplicados y con el ciclo en verde,
este plan de prueba se puede correr tal como está escrito.
