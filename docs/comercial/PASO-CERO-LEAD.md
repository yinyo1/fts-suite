# PASO CERO · el enlace entre la oportunidad de Odoo y el machote

**Estado (14-sep-2026):** nuestra mitad está construida. **La mitad de Odoo está pendiente
y la aplica Esteban** — esta sesión no tiene permiso para crear campos en Odoo, sólo para
crear órdenes en borrador con el cliente de prueba.

---

## Lo primero: la premisa del encargo no se sostuvo

El encargo daba por hecho que machote y orden **ya estaban ligados** por
`x_studio_nombre_archivo_xlsx` con el folio COT. Se fue a leerlo, y **no es eso**: ese campo
guarda una **URL de SharePoint al Excel viejo**, no un folio. No hay, hoy, ningún enlace
entre una oportunidad de Odoo y un machote de la suite.

Nuestro lado del puente sí existe desde la migración `003_machote.sql`, y siempre estuvo
vacío:

```
comercial.machote.odoo_lead_id     integer     -- 14-sep: 0 de 13 machotes vivos
comercial.machote.odoo_so_id       integer     -- 14-sep: 0 de 13 (ya no: la Estación 3 lo llena)
comercial.machote.odoo_partner_id  integer     -- 14-sep: 0 de 13
```

La `007` le puso índice a `odoo_lead_id` (`machote_lead_ix`, parcial, sólo filas vivas con
valor) para que buscar «los machotes de esta oportunidad» no barra la tabla.

---

## Por qué este `x_studio_` sí, cuando la regla es no crear más

La regla del módulo es **no agregar campos de Studio** — cada uno es deuda permanente y una
línea en la factura de Odoo. Ésta es la excepción justificada, y conviene decir por qué
para que no se use como precedente:

El puente tiene que poder cruzarse **en los dos sentidos**. Del lado de la suite ya se
cruza: `comercial.machote.odoo_lead_id` dice a qué oportunidad pertenece un machote. Del
lado de Odoo **no hay por dónde**: quien abre una oportunidad en Odoo no tiene manera de
saber que existe una cotización nuestra, ni cuál. Sin eso, el vendedor que vive en Odoo y
el que vive en la suite trabajan sobre el mismo trato sin verse.

Y no puede resolverse desde nuestro lado: para que Odoo lo muestre, el dato tiene que estar
**en Odoo**.

---

## El campo, exacto

Se crea con Studio sobre **`crm.lead`**:

| | |
|---|---|
| **Nombre técnico** | `x_studio_machote_folio` |
| **Etiqueta** | `Cotización FTS Suite` |
| **Tipo** | **Texto** (char), tamaño 32 |
| **Valor** | el folio del machote, tal cual la suite lo enseña: `COT-2026-0014` |
| **Dónde se ve** | formulario de la oportunidad, cerca de `expected_revenue` |
| **Sólo lectura** | **sí** — lo escribe la suite, no se teclea a mano |

### Por qué texto y no un entero con el id

Porque lo que tiene que leer un humano en la pantalla de Odoo es **lo mismo que ve en la
suite**. El uuid del machote no le sirve a nadie: no se puede teclear en el buscador de la
suite ni se reconoce de memoria. El folio sí — es el que sale en el PDF y el que la gente
se dice por teléfono.

El precio de esa decisión es que el folio **no es una llave foránea** y podría quedar
apuntando a nada si un machote se archivara. Se acepta a propósito, por la misma razón que
`odoo_so_id` es referencia externa sin llave foránea: el día que un dominio salga del otro,
ninguno de los dos queda roto (sólo desactualizado, que se arregla mirando).

### Por qué NO se llamó `x_studio_machote_id`

Un nombre con `_id` invita a que el siguiente que lo vea le meta el uuid, o peor, a que
alguien construya una relación encima. Se llama `_folio` porque eso es lo que guarda.

---

## Cómo se llena — la propuesta

**No se teclea nunca.** Un campo que se llena a mano se llena mal, tarde, o no se llena.

**Quién escribe:** un solo escritor, `comercial/orden-crear`, en el mismo momento en que
liga la orden. Ya sabe las dos cosas que hacen falta (el folio del machote y, si lo hay, el
`odoo_lead_id`) y ya está escribiendo en los dos sistemas en esa misma corrida. Un segundo
escritor sería una carrera silenciosa (§20 #4).

**Cuándo:** al crear la orden, no antes. Antes de eso la oportunidad no tiene nada que
mostrar, y llenarlo en la captura del machote pondría un folio en Odoo para cotizaciones
que nunca van a salir.

**Qué pasa si no hay lead:** nada, y es el caso normal hoy — los 13 machotes vivos tienen
`odoo_lead_id` vacío. La rama es best-effort y **no puede tumbar la creación de la orden**:
si no hay oportunidad que marcar, no se marca. El puente se llena solo conforme las
oportunidades y los machotes empiecen a nacer juntos.

**Lo que falta para que se llene solo:** que `odoo_lead_id` deje de estar vacío, o sea que
la suite sepa de qué oportunidad viene el machote. Eso es la pantalla de captura desde el
pipeline, que **no es de esta sesión**.

---

## Lo que NO se hizo, a propósito

- **Ninguna pantalla de CRM.** El encargo lo excluye explícitamente.
- **No se creó el campo.** Los permisos de esta sesión para Odoo son «crear órdenes en
  BORRADOR con cliente de prueba. Nada más». Crear un campo de Studio no es eso.
- **No se escribió la rama que lo llena** en `comercial/orden-crear`: escribir a un campo
  que todavía no existe fallaría en cada corrida. Va en cuanto el campo esté, y es media
  hora — el workflow ya tiene el folio y el `odoo_lead_id` a mano en el mismo nodo.
