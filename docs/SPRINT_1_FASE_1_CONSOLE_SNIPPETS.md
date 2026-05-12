# Sprint 1 Fase 1 — Console F12 Snippets (zero Studio UI)

**Filosofía:** Esteban ejecuta cada snippet desde la console del navegador en Odoo logueado. Cada snippet es 1 llamada JSON-RPC a Odoo via `/web/dataset/call_kw`. Esto bypasea Studio UI por completo, evitando billable code generation.

**Pre-requisitos:**
1. Logueado en https://serviciosfts.odoo.com como `ftsmaster` o cuenta admin (Esteban).
2. F12 → Console.
3. Estar en cualquier pantalla de Odoo (NO en una página de error).

**Cómo ejecutar:**
1. Copiar snippet completo (incluye `await` top-level que solo funciona en console moderna).
2. Pegar en console y Enter.
3. Verificar el `console.log()` final.

**Formato de error esperado si falla:**
```javascript
{ result: undefined, error: { code: 200, message: "...", data: { ... } } }
```

Si ves `error`, leer `error.data.message` para el detalle.

---

## §A — Crear 2 campos custom en hr.employee

### A.1 — `x_categoria_nomina` (Selection, 5 valores)

**Estado actual:** no existe.
**Acción:** crear field manual + 5 selection_ids linked.
**Tiempo:** 30s.
**Reversible:** Sí — borrar field via `ir.model.fields.unlink([<id>])`.

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'ir.model.fields',
      method: 'create',
      args: [{
        name: 'x_categoria_nomina',
        model_id: 336,   // hr.employee (verificado audit §1)
        field_description: 'Categoría nómina (override)',
        ttype: 'selection',
        state: 'manual',
        required: false,
        help: 'Override explícito de categoría nómina. Si vacío, se infiere del departamento (PLAN §0.5). Solo poblar para excepciones.',
        selection_ids: [
          [0, 0, {value: 'ceo',              name: 'CEO',                       sequence: 0}],
          [0, 0, {value: 'confianza',        name: 'Confianza (no HE)',         sequence: 1}],
          [0, 0, {value: 'hourly_doble',     name: 'Hourly — HE doble',         sequence: 2}],
          [0, 0, {value: 'hourly_sencilla',  name: 'Hourly — HE sencilla',      sequence: 3}],
          [0, 0, {value: 'no_he_comercial',  name: 'Comercial (no HE)',         sequence: 4}]
        ]
      }],
      kwargs: {}
    }
  })
}).then(r => r.json());
console.log('x_categoria_nomina field id:', r.result, 'error:', r.error);
```

**Validación post-ejecución:**
- `r.result` debe ser un número (field id), e.g., `97920`. ✅
- `r.error` debe ser `undefined`.
- Confirmar via: `await fetch('/web/dataset/call_kw', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{model:'ir.model.fields', method:'search_count', args:[[['name','=','x_categoria_nomina']]], kwargs:{}}})}).then(r=>r.json()).then(r => console.log('count:', r.result));` — debe retornar 1.

### A.2 — `x_aplica_ppa` (Boolean, default lógico true)

**Estado actual:** no existe.
**Acción:** crear field boolean.
**Tiempo:** 30s.
**Reversible:** Sí.

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'ir.model.fields',
      method: 'create',
      args: [{
        name: 'x_aplica_ppa',
        model_id: 336,
        field_description: 'Aplica PPA',
        ttype: 'boolean',
        state: 'manual',
        required: false,
        help: 'Empleado elegible para Prima Por Asistencia (bono mensual). Default true para todos excepto CEO.'
      }],
      kwargs: {}
    }
  })
}).then(r => r.json());
console.log('x_aplica_ppa field id:', r.result, 'error:', r.error);
```

**Validación:** mismo patrón que A.1.

---

## §B — Setear `x_aplica_ppa = true` masivo (43 empleados)

**Estado actual:** después de §A.2, todos los empleados tienen `x_aplica_ppa = false` (default Odoo para boolean).
**Acción:** write masivo `x_aplica_ppa: true` para todos los empleados activos EXCEPTO Esteban (id 32, ceo no aplica PPA).
**Tiempo:** 30s.
**Reversible:** Sí — write back a false.

```javascript
// Primero: obtener lista de empleados activos excluyendo CEO
const search = await fetch('/web/dataset/call_kw', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'hr.employee',
      method: 'search',
      args: [[['active', '=', true], ['id', '!=', 32]]],
      kwargs: {}
    }
  })
}).then(r => r.json());
const ids = search.result;
console.log('Empleados a actualizar:', ids.length);

// Write masivo
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'hr.employee',
      method: 'write',
      args: [ids, {x_aplica_ppa: true}],
      kwargs: {}
    }
  })
}).then(r => r.json());
console.log('Write result:', r.result, 'count:', ids.length, 'error:', r.error);
```

**Validación:** `r.result` debe ser `true`. Esperado `ids.length === 43` (44 activos − 1 Esteban).

---

## §C — Reasignación masiva resource_calendar_id (19 empleados → calendar 2)

**Estado actual:** 19 empleados Operaciones campo + Ingeniería entrada-7am están en calendar 6 "Horas de oficina" (8-18). Deben estar en calendar 2 "Horas operaciones" (7-17).
**Acción:** write masivo `resource_calendar_id: 2`.
**Tiempo:** 30s.
**Reversible:** Sí — write back a `resource_calendar_id: 6`.

```javascript
// Lista verificada en audit §4.4
const idsToMove = [55, 75, 76, 79, 98, 107, 110, 112, 114, 116, 121, 124, 127, 128, 130, 131, 132, 137, 138];

const r = await fetch('/web/dataset/call_kw', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'hr.employee',
      method: 'write',
      args: [idsToMove, {resource_calendar_id: 2}],
      kwargs: {}
    }
  })
}).then(r => r.json());
console.log('Reasignados:', idsToMove.length, 'result:', r.result, 'error:', r.error);
```

**Validación:** `r.result === true`. Esperado 19 empleados actualizados.

---

## §D — Archive 3 deptos zombie

**Estado actual:** deptos 8, 10, 15 activos con 0 empleados.
**Acción:** `write({active: false})`.
**Tiempo:** 30s.
**Reversible:** Sí — `write({active: true})`.

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'hr.department',
      method: 'write',
      args: [[8, 10, 15], {active: false}],
      kwargs: {}
    }
  })
}).then(r => r.json());
console.log('Archivados deptos zombie:', r.result, 'error:', r.error);
```

**Validación:** post-write, verificar:
```javascript
const check = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.department', method: 'read',
    args: [[8, 10, 15], ['id', 'name', 'active']], kwargs: {}
  }})
}).then(r => r.json());
console.table(check.result);
```
Esperado: los 3 con `active: false`.

---

## §E — Setear `x_categoria_nomina` para 8 excepciones

**Estado actual:** después de §A.1, todos los empleados tienen `x_categoria_nomina = false` (null en Odoo). La lógica autoprogresiva infiere de depto.
**Acción:** override explícito SOLO para 8 empleados que no caen en su default por depto.
**Tiempo:** 1 min (3 writes batched por valor).
**Reversible:** Sí — `write({x_categoria_nomina: false})`.

### E.1 — Esteban (id 32) → `ceo`

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.employee', method: 'write',
    args: [[32], {x_categoria_nomina: 'ceo'}], kwargs: {}
  }})
}).then(r => r.json());
console.log('Esteban → ceo:', r.result, r.error);
```

### E.2 — Felipe + Mateo (ids 75, 112) → `confianza` (override Operaciones)

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.employee', method: 'write',
    args: [[75, 112], {x_categoria_nomina: 'confianza'}], kwargs: {}
  }})
}).then(r => r.json());
console.log('Felipe + Mateo → confianza:', r.result, r.error);
```

### E.3 — Gerardo + Teresa + Gibrán + Jésus M + Abraham (ids 59, 60, 62, 68, 135) → `hourly_sencilla`

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.employee', method: 'write',
    args: [[59, 60, 62, 68, 135], {x_categoria_nomina: 'hourly_sencilla'}], kwargs: {}
  }})
}).then(r => r.json());
console.log('5 ops oficina → hourly_sencilla:', r.result, r.error);
```

**Total setear:** 1 + 2 + 5 = 8 empleados con override explícito. Los otros 36 heredan default por depto (sin write).

---

## §F — Setear `x_studio_hora_entrada` para Pedro (id 143) — único caso accionable

**Estado actual:** Pedro Arturo Hernandez (Comercial, id 143) tiene `x_studio_hora_entrada = 0.0` (no poblado). Default Comercial = 8.0.
**Acción:** write con 8.0.
**Tiempo:** 15s.
**Reversible:** Sí.

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.employee', method: 'write',
    args: [[143], {x_studio_hora_entrada: 8.0}], kwargs: {}
  }})
}).then(r => r.json());
console.log('Pedro x_studio_hora_entrada=8.0:', r.result, r.error);
```

**Los 7 placeholders sin depto + Miriam (148):** dejar a Esteban + Ana decisión separada (no es Sprint 1 Fase 1, va en backlog).

---

## §G — Verificaciones post-ejecución

Después de ejecutar §A-§F, correr estos read-only para confirmar estado.

### G.1 — Campos custom existen

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'ir.model.fields', method: 'search_read',
    args: [[['model', '=', 'hr.employee'], ['name', 'in', ['x_categoria_nomina', 'x_aplica_ppa']]]],
    kwargs: {fields: ['name', 'ttype', 'state']}
  }})
}).then(r => r.json());
console.table(r.result);
```

**Esperado:** 2 rows, ambas con `state: 'manual'`.

### G.2 — `x_categoria_nomina` poblado exactamente en 8

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.employee', method: 'search_count',
    args: [[['x_categoria_nomina', '!=', false]]], kwargs: {}
  }})
}).then(r => r.json());
console.log('Empleados con x_categoria_nomina poblado:', r.result, '(esperado: 8)');
```

### G.3 — Distribución de categoría por valor

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.employee', method: 'read_group',
    args: [[['x_categoria_nomina', '!=', false]], ['x_categoria_nomina'], ['x_categoria_nomina']],
    kwargs: {}
  }})
}).then(r => r.json());
console.table(r.result);
```

**Esperado:** `ceo: 1`, `confianza: 2`, `hourly_sencilla: 5`. (Empleados sin override caen al default por depto en lógica nómina, no aparecen aquí.)

### G.4 — `x_aplica_ppa` poblado en 43 (todos menos Esteban)

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.employee', method: 'search_count',
    args: [[['x_aplica_ppa', '=', true]]], kwargs: {}
  }})
}).then(r => r.json());
console.log('Empleados con x_aplica_ppa=true:', r.result, '(esperado: 43)');
```

### G.5 — Calendar 2 ahora tiene 22 empleados (era 3 + 19 reasignados)

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.employee', method: 'search_count',
    args: [[['resource_calendar_id', '=', 2], ['active', '=', true]]], kwargs: {}
  }})
}).then(r => r.json());
console.log('Empleados en calendar 2 (Horas operaciones):', r.result, '(esperado: 22)');
```

### G.6 — Deptos zombie ahora active=false

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.department', method: 'search_read',
    args: [[['active', '=', false]]], kwargs: {fields: ['id', 'name']}
  }})
}).then(r => r.json());
console.table(r.result);
```

**Esperado:** 3 rows con ids 8, 10, 15.

### G.7 — Pedro hora_entrada actualizada

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.employee', method: 'read',
    args: [[143], ['id', 'name', 'x_studio_hora_entrada']], kwargs: {}
  }})
}).then(r => r.json());
console.log('Pedro:', r.result[0]);
```

**Esperado:** `x_studio_hora_entrada: 8.0`.

---

## §H — Rollback (si algo sale mal)

### H.1 — Revertir §A.1 (eliminar campo `x_categoria_nomina`)

⚠️ **Atención:** esto borra todos los valores poblados en §E también.

```javascript
// Buscar field id
const search = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'ir.model.fields', method: 'search',
    args: [[['model','=','hr.employee'], ['name','=','x_categoria_nomina']]], kwargs: {}
  }})
}).then(r => r.json());
console.log('field id:', search.result);

// Eliminar
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'ir.model.fields', method: 'unlink',
    args: [search.result], kwargs: {}
  }})
}).then(r => r.json());
console.log('Field eliminado:', r.result);
```

### H.2 — Revertir §A.2 (eliminar campo `x_aplica_ppa`)

Mismo patrón, cambiar `'x_categoria_nomina'` → `'x_aplica_ppa'`.

### H.3 — Revertir §C (reasignar de calendar 2 a calendar 6)

```javascript
const idsToRevert = [55, 75, 76, 79, 98, 107, 110, 112, 114, 116, 121, 124, 127, 128, 130, 131, 132, 137, 138];
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.employee', method: 'write',
    args: [idsToRevert, {resource_calendar_id: 6}], kwargs: {}
  }})
}).then(r => r.json());
console.log('Revert calendar:', r.result);
```

### H.4 — Revertir §D (reactivar deptos zombie)

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.department', method: 'write',
    args: [[8, 10, 15], {active: true}], kwargs: {}
  }})
}).then(r => r.json());
console.log('Reactivar zombies:', r.result);
```

### H.5 — Revertir §E (limpiar overrides)

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.employee', method: 'write',
    args: [[32, 59, 60, 62, 68, 75, 112, 135], {x_categoria_nomina: false}], kwargs: {}
  }})
}).then(r => r.json());
console.log('Clear overrides:', r.result);
```

### H.6 — Revertir §F (Pedro hora_entrada a 0)

```javascript
const r = await fetch('/web/dataset/call_kw', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{
    model: 'hr.employee', method: 'write',
    args: [[143], {x_studio_hora_entrada: 0.0}], kwargs: {}
  }})
}).then(r => r.json());
console.log('Pedro hora_entrada reset:', r.result);
```

---

## Orden de ejecución recomendado

Para minimizar el blast radius si algo falla:

1. **§A.1** — Crear `x_categoria_nomina` (test field creation works)
2. **§G.1** — Validar campo existe
3. **§A.2** — Crear `x_aplica_ppa`
4. **§G.1** — Re-validar 2 campos
5. **§D** — Archive zombie deptos (independent operation, low risk)
6. **§G.6** — Validar archive
7. **§C** — Reasignar calendars (medium risk — many records)
8. **§G.5** — Validar count en calendar 2
9. **§B** — Setear x_aplica_ppa masivo
10. **§G.4** — Validar count
11. **§E.1, E.2, E.3** — Setear overrides categoría
12. **§G.2, G.3** — Validar 8 records
13. **§F** — Pedro hora_entrada (opcional, requiere confirmación Ana)
14. **§G.7** — Validar Pedro

**Tiempo total ejecución:** ~10-15 min incluyendo validaciones.

---

## Si surge error inesperado

1. **STOP** — no continuar con siguientes snippets.
2. Copiar el `r.error` completo de la console.
3. Ejecutar el rollback correspondiente de §H.
4. Reportar a Claude Code: "Error en §X.Y: <mensaje>".
5. Claude diagnostica + propone fix.

**Common errors:**
- `Access denied` → cuenta sin admin. Login como `ftsmaster` o admin user.
- `Field already exists` → §A ya se corrió antes. Verificar con §G.1.
- `Cannot find model_id` → audit dice 336 para hr.employee, confirmar con `await fetch('/web/dataset/call_kw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'call',params:{model:'ir.model',method:'search',args:[[['model','=','hr.employee']]],kwargs:{}}})}).then(r=>r.json()).then(r=>console.log(r.result))` — debe retornar `[336]`.
