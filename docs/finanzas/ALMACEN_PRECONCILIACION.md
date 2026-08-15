# Almacén de preconciliación — modelo `x_preconciliacion`

> **Por qué existe este doc.** Todo lo demás que se construyó en este frente deja rastro:
> el frontend en git, los workflows en n8n. Este modelo **solo existe dentro de la instancia
> de Odoo** — se creó a mano desde la consola del navegador, no hay módulo ni migración que
> lo describa. Sin este documento, clonar el repo no basta para reconstruirlo.
>
> Creado el **2026-08-14**. `ir.model` id **3992**.

---

## 1 — Qué guarda

Una **pending de Jeeves** (autorización del banco que todavía no liquida) emparejada con la
**PO confirmada + bill sin pagar** que le corresponde, para que cuando el banco liquide el
cargo la conciliación ya esté decidida y no haya que re-buscarla.

Es el almacén que consumen los motores de la cadena:

| Motor | Qué hace con el almacén |
|---|---|
| **1 — captura de pending** | No escribe. Solo muestra las pending en pantalla (`_pending:true`, fuera de todo contador) |
| **2 — preconciliación** | **Escribe** las filas: casa pending contra PO+bill y crea el registro en `activa` |
| **4 — liquidación** | **Cierra** las filas: al liquidar el banco, marca `aplicada` / `divergente` / `caducada` |

Un registro **nunca se borra**: se marca `revertida`. Por eso la ACL de usuario interno
niega `unlink` — la regla no depende de la disciplina de nadie (§4).

---

## 2 — Los 10 campos

`x_name` lo genera Odoo solo al crear un modelo manual; sirve de `display_name`. Los otros 9
son los del diseño.

| Campo | Tipo | Relación | Para qué |
|---|---|---|---|
| `x_name` | char | — | Referencia legible. **Lo crea Odoo automáticamente**, no el script |
| `x_uid_v2` | **char** | — | Hash de la transacción (llave dual v2 = base v1 + `\|createdAt`). **char, no text**: el motor busca por igualdad exacta. **Sin índice** a propósito (§5) |
| `x_purchase_order_id` | many2one | `purchase.order` | La PO confirmada que originó el cargo |
| `x_bill_id` | many2one | `account.move` | El bill sin pagar contra el que se concilia. **No estaba en la spec original de 6 campos** — sin él, el motor 4 tendría que volver a saltar de PO a bill, que es justo lo que el diseño elimina |
| `x_monto` | float | — | Monto de la pending al preconciliar. Se compara contra el liquidado para detectar mutación |
| `x_score` | float | — | Confianza del matcher. Barato ahora, **irreconstruible después**: sin él nunca se podrá responder si los matches de score bajo acertaron |
| `x_fecha_pending` | date | — | Fecha de la autorización |
| `x_caduca` | date | — | Fecha límite; alimenta los escalones `sospechosa` (>7d) y `caducada` (>30d) |
| `x_estado` | selection | — | Ciclo de vida (§3) |
| `x_origen` | selection | — | **Quién preconcilió.** Ver §3.1 — es el campo que valida todo el diseño |

---

## 3 — Selections

### `x_estado` — 6 valores

| Valor | Etiqueta | Quién lo pone | Terminal |
|---|---|---|---|
| `activa` | Activa | motor 2 al preconciliar | no |
| `sospechosa` | Sospechosa (>7d) | motor 4 al pasar 7 días sin liquidar | no |
| `aplicada` | Aplicada | motor 4 al liquidar por el mismo monto | **sí** |
| `divergente` | Divergente (monto cambió) | motor 4 al liquidar por otro monto | **sí** |
| `caducada` | Caducada (>30d) | motor 4 al expirar | **sí** |
| `revertida` | Revertida | Eduardo al deshacer antes de liquidar | **sí** |

No existe `duplicada`: la llave dual v2 hace imposible el duplicado, y un valor que nunca se
puede poblar es peor que no tenerlo.

### 3.1 — `x_origen` — 3 valores, y por qué no se deduce

| Valor | Etiqueta |
|---|---|
| `motor` | Motor automático |
| `eduardo` | Eduardo |
| `otro` | Otro |

> **`create_uid` NO distingue quién escribió.** Todas las escrituras a Odoo pasan por n8n con
> la misma credencial (`Odoo FTS`, uid 2). Verificado en la prueba de escritura del
> 2026-08-14: un `create` del motor quedó firmado `create_uid: [2, "Jesus Esteban De La Cruz"]`.
> Eduardo escribiendo desde el frontend produciría **exactamente lo mismo**.
>
> La métrica que valida toda la cadena es *"cuántas preconcilió el motor 2 vs cuántas Eduardo"*.
> Sin este campo, esa pregunta es **incontestable a posteriori**.

`x_statement_line_id` se descartó por derivable: `x_uid_v2` **es** el `unique_import_id` de la
línea liquidada.

---

## 4 — Las 2 ACL (no son opcionales)

Un modelo sin ninguna fila en `ir.model.access` **le niega el acceso a todo el mundo salvo al
superusuario**. uid 2 es un usuario normal (`share:false`), no el superusuario — los motores
tronarían con `AccessError` al primer `create`. Esto se descubrió *antes* de construir el motor 2,
no depurándolo dentro.

| ACL | Grupo | read | write | create | unlink |
|---|---|---|---|---|---|
| `x_preconciliacion.user` | Internal User (`base.group_user`, id 1) | ✓ | ✓ | ✓ | **✗** |
| `x_preconciliacion.admin` | Administrator (`base.group_system`, id 3) | ✓ | ✓ | ✓ | ✓ |

**`perm_unlink: 0` para usuarios internos es deliberado**: convierte "nunca se borra, se marca
`revertida`" en una restricción de base de datos. La ACL de admin existe solo para limpiar
datos de prueba.

---

## 5 — Decisiones que parecen omisiones

- **Sin índice en `x_uid_v2`.** `ir.model.fields.index` es un boolean escribible (no `readonly`),
  pero Studio no lo expone y a ~200 registros/mes un escaneo sobre un char cuesta microsegundos.
  Los índices empiezan a importar arriba de ~100k filas. Se agrega sin migración si algún día pesa.
- **Sin vista, acción ni menú.** El modelo no es navegable en la UI de Odoo. Los motores escriben
  por RPC y la auditoría se hace por MCP. Si se necesita revisarlo a mano, hay que crear la vista.
- **`is_mail_thread: false`.** Sin chatter: la traza de quién hizo qué vive en `x_origen`,
  no en mensajes.

---

## 6 — Cómo reconstruirlo

Ambos scripts corren en la **consola del navegador de Odoo** (F12), con sesión iniciada. Usan
`fetch` contra `/web/dataset/call_kw` en vez de `odoo.__DEBUG__`/`__WOWL_DEBUG__`, que dependen
del modo debug y cambian entre versiones.

Los dos son **idempotentes**: verifican antes de crear, así que si uno falla a la mitad se
vuelve a correr y solo crea lo que falte. Cada `create` es su propia transacción — no hay
rollback automático.

### 6.1 — Modelo + 10 campos

```js
(async () => {
  const kw = async (model, method, args, kwargs = {}) => {
    const r = await fetch('/web/dataset/call_kw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs } })
    });
    const d = await r.json();
    if (d.error) throw new Error(JSON.stringify(d.error.data?.message || d.error).slice(0, 300));
    return d.result;
  };

  const MODEL = 'x_preconciliacion';

  let [m] = await kw('ir.model', 'search_read', [[['model', '=', MODEL]], ['id']]);
  if (!m) {
    const id = await kw('ir.model', 'create', [{
      name: 'Preconciliación Jeeves', model: MODEL, state: 'manual', transient: false
    }]);
    m = { id };
    console.log('modelo creado:', id);
  } else console.log('modelo ya existía:', m.id);

  const sel = vals => vals.map((v, i) => [0, 0, { value: v[0], name: v[1], sequence: i }]);
  const CAMPOS = [
    { name: 'x_name',              ttype: 'char',      field_description: 'Referencia' },
    { name: 'x_uid_v2',            ttype: 'char',      field_description: 'UID v2 (hash de la transacción)' },
    { name: 'x_purchase_order_id', ttype: 'many2one',  field_description: 'Purchase Order', relation: 'purchase.order' },
    { name: 'x_bill_id',           ttype: 'many2one',  field_description: 'Bill',           relation: 'account.move' },
    { name: 'x_monto',             ttype: 'float',     field_description: 'Monto' },
    { name: 'x_score',             ttype: 'float',     field_description: 'Score del matcher' },
    { name: 'x_fecha_pending',     ttype: 'date',      field_description: 'Fecha del pending' },
    { name: 'x_caduca',            ttype: 'date',      field_description: 'Caduca' },
    { name: 'x_estado',            ttype: 'selection', field_description: 'Estado',
      selection_ids: sel([['activa','Activa'],['sospechosa','Sospechosa (>7d)'],['aplicada','Aplicada'],
                          ['divergente','Divergente (monto cambió)'],['caducada','Caducada (>30d)'],
                          ['revertida','Revertida']]) },
    { name: 'x_origen',            ttype: 'selection', field_description: 'Origen',
      selection_ids: sel([['motor','Motor automático'],['eduardo','Eduardo'],['otro','Otro']]) }
  ];

  for (const c of CAMPOS) {
    const [ya] = await kw('ir.model.fields', 'search_read', [[['model', '=', MODEL], ['name', '=', c.name]], ['id']]);
    if (ya) { console.log('  ya existía:', c.name); continue; }
    const id = await kw('ir.model.fields', 'create', [Object.assign({
      model: MODEL, model_id: m.id, state: 'manual', store: true
    }, c)]);
    console.log('  creado:', c.name, '->', id);
  }
  console.log('LISTO. Modelo', MODEL, 'id', m.id);
})();
```

> En la creación original, `x_name` salió como *"ya existía"*: Odoo lo genera solo al crear el
> modelo, con etiqueta `Name`. Es lo esperado.

### 6.2 — Las 2 ACL

Resuelve los grupos por XML ID, no por id numérico.

```js
(async () => {
  const kw = async (model, method, args, kwargs = {}) => {
    const r = await fetch('/web/dataset/call_kw', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({jsonrpc:"2.0",method:"call",params:{model,method,args,kwargs}})});
    const d = await r.json();
    if (d.error) throw new Error(JSON.stringify(d.error.data?.message || d.error).slice(0,300));
    return d.result;
  };
  const grupo = async (mod, nm) => {
    const [x] = await kw('ir.model.data','search_read',[[['module','=',mod],['name','=',nm]],['res_id']]);
    if (!x) throw new Error('no encontre el grupo ' + mod + '.' + nm);
    return x.res_id;
  };

  const [mod] = await kw('ir.model','search_read',[[['model','=','x_preconciliacion']],['id']]);
  const ACLS = [
    { name: 'x_preconciliacion.user',  g: ['base','group_user'],   r:1, w:1, c:1, u:0 },
    { name: 'x_preconciliacion.admin', g: ['base','group_system'], r:1, w:1, c:1, u:1 }
  ];
  for (const a of ACLS) {
    const [ya] = await kw('ir.model.access','search_read',[[['name','=',a.name]],['id']]);
    if (ya) { console.log('  ya existia:', a.name); continue; }
    const id = await kw('ir.model.access','create',[{
      name: a.name, model_id: mod.id, group_id: await grupo(a.g[0], a.g[1]),
      perm_read: a.r, perm_write: a.w, perm_create: a.c, perm_unlink: a.u, active: true
    }]);
    console.log('  ACL creada:', a.name, '->', id);
  }
  console.log('LISTO. Recarga con Ctrl+F5 para limpiar el cache de permisos.');
})();
```

### 6.3 — Empezar de cero

Borrar el `ir.model` **cascadea a sus campos y tira la tabla**. Seguro con el modelo vacío;
con datos dentro, se pierden.

```js
const [m] = await kw('ir.model','search_read',[[['model','=','x_preconciliacion']],['id']]);
await kw('ir.model','unlink',[[m.id]]);
```

---

## 7 — Cómo verificar que quedó bien

Read-only, por MCP o por consola:

```
ir.model                     model='x_preconciliacion' · state 'manual' · transient false
ir.model.fields              model='x_preconciliacion'  -> 10 + los 6 de base
                             x_uid_v2 debe decir ttype 'char' (NO 'text')
                             x_purchase_order_id -> relation 'purchase.order'
                             x_bill_id           -> relation 'account.move'
ir.model.fields.selection    x_estado -> 6 valores · x_origen -> 3 valores
ir.model.access              model_id del modelo -> 2 filas, user con perm_unlink false
```

Y la prueba que de verdad importa, porque las ACL no se validan leyéndolas: **un `create`
real desde n8n con la credencial `Odoo FTS`**, comprobando que el read-back devuelve
`create_uid: 2`. El patrón usado fue un workflow TMP con Webhook → Odoo CREATE → Odoo READ →
Respond, activado a mano, disparado por MCP y borrado al terminar.

---

## 8 — Notas de plataforma (Odoo 19)

- Las selections **no** son el campo de texto `selection` de `ir.model.fields`: son filas del
  modelo `ir.model.fields.selection` (`value`, `name`, `sequence`), que se crean con comandos
  one2many `[(0, 0, {...})]` sobre `selection_ids`.
- `res.users.groups_id` **ya no existe**; el campo es `all_group_ids` (o `group_ids`).
- El allowlist del conector `fts-mcp-odoo` **no vive en Odoo** — no hay ningún modelo `mcp.*`.
  Está en la configuración del servidor desplegado en Railway (repo `yinyo1/fts-mcp-odoo`).
  `x_preconciliacion` debe agregarse ahí **solo en lectura**: a este modelo, como al resto,
  se escribe únicamente por n8n.
