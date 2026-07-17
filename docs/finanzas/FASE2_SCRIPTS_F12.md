# FASE 2 — Scripts F12 (canary + prerequisitos de escritura)

> ✅ **Prereqs COMPLETADOS por Esteban (2026-07-16):** campo `x_studio_codigo_contpaqi` + 27 códigos poblados (incl. `143:'080'`); **Juan = emp 155 (017)** y **Juana = emp 156 (018)** creados (default 513); Miriam 148 archivada; campo `x_studio_solo_bolsa` creado.
> ✅ **RESUELTO 2026-07-16:** `x_studio_solo_bolsa=true` en 97/108/143 (re-corrido + verificado con read-back). Los workflows ya NO usan el mapa en memoria — leen `x_studio_codigo_contpaqi` + `x_studio_solo_bolsa` + `x_studio_cuenta_indirecta_default` + `department_id` de Odoo en cada corrida. **Vacaciones → bolsa madre del depto** (Comercial 608 / Operaciones 3096 / RH 478 / Legal 768 / Admin 513 / Dirección 3095), NO 513 fijo.

> ⚠️ El MCP Odoo está en **read-only** ("read-only YOLO mode") → estos writes se corren en la **consola F12 de Odoo** (con tu sesión). NO ejecutados por CC. Pega primero el helper, luego el bloque que toque.
> Modelos verificados: `budget.line` tiene `x_plan2_id` (bolsas plan 2) + `x_plan20_id` (rubro) + `achieved_amount`. `analytic.line` acepta `x_plan2_id` / `account_id` + `x_plan20_id`.

## Helper (pégalo siempre primero)
```js
async function rpc(m, meth, a=[], k={}) {
  const r = await fetch('/web/dataset/call_kw', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({jsonrpc:'2.0', method:'call', params:{model:m, method:meth, args:a, kwargs:k}})});
  const j = await r.json(); if (j.error) throw j.error; return j.result;
}
```

## A. CANARY — ¿el budget lee la analytic.line por `x_plan2_id`? (la última incógnita)
Crea budget de prueba en bolsa 3095 (DIRECCIÓN) + analytic.line de prueba, lee `achieved_amount`, borra todo, read-back. **Reportar `ACHIEVED` + los IDs.**
```js
const BOLSA=3095, RUBRO=1177;
const bid=await rpc('budget.analytic','create',[{name:'CANARY-DELETE',budget_type:'both',date_from:'2026-07-01',date_to:'2026-12-31',company_id:1}]);
const bl =await rpc('budget.line','create',[{budget_analytic_id:bid,x_plan2_id:BOLSA,x_plan20_id:RUBRO,budget_amount:-1000,date_from:'2026-07-01',date_to:'2026-12-31'}]);
const al =await rpc('account.analytic.line','create',[{name:'CANARY-DELETE',x_plan2_id:BOLSA,x_plan20_id:RUBRO,amount:-500,date:'2026-07-15'}]);
const [line]=await rpc('budget.line','read',[[bl],['budget_amount','achieved_amount','committed_amount','x_plan2_id','x_plan20_id']]);
console.log('▶ ACHIEVED (esperado ~ -500 o 500):', line.achieved_amount, '| committed:', line.committed_amount, line);
// limpieza + read-back
await rpc('account.analytic.line','unlink',[[al]]);
await rpc('budget.line','unlink',[[bl]]);
await rpc('budget.analytic','unlink',[[bid]]);
const rest=await rpc('account.analytic.line','search_count',[[['id','=',al]]]);
const rest2=await rpc('budget.analytic','search_count',[[['id','=',bid]]]);
console.log('▶ LIMPIEZA (0,0):', rest, rest2, '| IDs usados:', {bid,bl,al});
```
- **Si `ACHIEVED` refleja el -500** → `x_plan2_id` funciona → el nodo de escritura (que ya usa `x_plan2_id` para bolsas) es correcto. ✅
- **Si sale 0** → probar con `account_id:BOLSA` en vez de `x_plan2_id` en ambos (budget.line + analytic.line), repetir. Me reportas y ajusto el nodo `Odoo - CREATE` del workflow `j0V9wfpuPTLFO9DZ`.

---

## B. Prerequisitos de escritura (cuando tengas los datos)

### B.1 — Campo `x_studio_codigo_contpaqi` (llave dura)
Recomendado crearlo en **Studio** (Empleado → nuevo campo char "Código CONTPAQi", `required` al alta). Studio maneja el `ir.model.fields` + vistas correctamente. *(Vía RPC es frágil para campos Studio — usar Studio.)*

### B.2 — Poblar los códigos de los ya-existentes (27) — tras crear el campo
> **Corrección 2026-07-16:** código **080 = Arturo Hernández (emp 143)**, que YA existe (nombre completo "Pedro Arturo Hernández Ramírez", misma persona). NO se crea empleado nuevo. Se agrega `143:'080'` al mapa → **27 códigos**.
```js
const COD={25:'002',68:'003',6:'005',8:'006',55:'010',48:'011',63:'012',62:'013',57:'014',59:'016',75:'027',78:'028',79:'029',97:'036',101:'038',108:'044',121:'052',124:'056',127:'058',128:'059',131:'061',130:'062',138:'074',143:'080',149:'081',153:'084',154:'085'};
for(const [emp,cod] of Object.entries(COD)){ await rpc('hr.employee','write',[[+emp],{x_studio_codigo_contpaqi:cod}]); }
console.log('▶ Poblados', Object.keys(COD).length, 'códigos');  // 27
```

### B.3 — Crear SÓLO los asimilados Juan (017) / Juana (018)
> **Corrección 2026-07-16:** Pedro/Arturo (080) YA NO se crea (es el emp 143 existente, ver B.2). Sólo quedan los 2 asimilados.
```js
const juan =await rpc('hr.employee','create',[{name:'Juan De La Cruz Maldonado (asimilado)', department_id:18, x_studio_codigo_contpaqi:'017', x_studio_cuenta_indirecta_default:513}]);
const juana=await rpc('hr.employee','create',[{name:'Juana Camarillo Torrez (asimilado)', department_id:18, x_studio_codigo_contpaqi:'018', x_studio_cuenta_indirecta_default:513}]);
console.log('▶ Creados asimilados:', {juan, juana});
```
⚠️ El nombre de Juan colisiona con la **company_id 2** "JUAN DE LA CRUZ MALDONADO" — son modelos distintos (`hr.employee` vs `res.company`), no hay conflicto técnico, pero distínguelos en el nombre.

### B.4 — Archivar Miriam (emp 148) — deja el user 25 vivo
```js
await rpc('hr.employee','write',[[148],{active:false}]);
console.log('▶ Miriam 148 archivada (user 25 sigue activo)');
```

### B.5 — Template de los 6 budgets de bolsa (montos PENDIENTES — hoy placeholder −1)
```js
const BOLSAS=[[608,'VENTAS'],[3095,'DIRECCION'],[3096,'ADMIN DE OPERACIONES'],[513,'ADMINISTRACION'],[768,'LEGAL'],[478,'RH']];
for(const [b,nm] of BOLSAS){
  const h=await rpc('budget.analytic','create',[{name:'Bolsa '+nm+' 2026', budget_type:'both', date_from:'2026-01-01', date_to:'2026-12-31', company_id:1}]);
  await rpc('budget.line','create',[{budget_analytic_id:h, x_plan2_id:b, x_plan20_id:1177, budget_amount:-1, date_from:'2026-01-01', date_to:'2026-12-31'}]);
  console.log('▶ Budget bolsa', nm, '→', h, '(línea 1177 placeholder −1, poner monto real)');
}
```
*(También faltan las 6 líneas 1177 de proyecto de Auditoría C: 3071 sin budget, 3083/3087 sin 1177, 3038/3091/3094 placeholder −1 — se pueblan con los montos de cotización de Esteban.)*

### B.6 — Campo `x_studio_solo_bolsa` (bool) para la regla per-empleado
> **Corrección 2026-07-16:** solo_bolsa FINAL = **sólo 3** (nunca cargan horas a proyecto). Todos los demás son **híbridos** (respetan checkout), incluidos Aldo, Ana Laura, Magaly, Gerardo, Erick, Eduardo, Luis Ángel, Francisco, Ricardo, Ramiro. Los 3 sí siguen checando en kiosko — el flag sólo afecta el dinero.

Marcar `true` en **sólo**: **Rissia (97)**, **Pablo (108)**, **Arturo (143)** → su bruto va 100% a su `x_studio_cuenta_indirecta_default` (= **608 VENTAS** en los 3). `false` (default) = respeta checkout (Ops, admin, legal, RH, choferes/aux — todos).
> 🚨 **RE-CORRER: el read-back 2026-07-16 mostró los 3 en `false`** (el true de Studio no persistió). Corre esto por RPC (más confiable que el checkbox) y **verifica con el read de abajo**:
```js
for(const emp of [97,108,143]){ await rpc('hr.employee','write',[[emp],{x_studio_solo_bolsa:true}]); }
const chk=await rpc('hr.employee','read',[[97,108,143],['name','x_studio_solo_bolsa','x_studio_cuenta_indirecta_default']]);
console.log('▶ VERIFICA solo_bolsa=true + default 608:', chk);
```
Los asimilados (017/018 = emp 155/156) NO necesitan el flag: van a su default 513 por la regla `asim` (columna sueldo asimilado > 0). El workflow lee `x_studio_solo_bolsa` directo de Odoo (el mapa en memoria ya murió) — si está `false`, el empleado se trata como híbrido.

---

## Cutover (día del primer write real) — verificación + unlink
Estado verificado 2026-07-16: **los 3 [47,48,9] están VIVOS**, todos inyectan `{1177:100}` (prefijos `2023.34` / `102.01.00008` / `101000`, company 1). Verifica de nuevo antes de unlink:
```js
// 1) VERIFICAR cuáles siguen vivos + qué inyectan
const dm = await rpc('account.analytic.distribution.model','read',[[47,48,9],['id','analytic_distribution','account_prefix','company_id']]);
console.log('▶ distribution models vivos:', dm);   // esperado: 3 filas, todas con {"1177":100}
```
```js
// 2) CUTOVER — unlink de los que inyectan 1177 (NUNCA vaciar el modelo; unlink completo)
await rpc('account.analytic.distribution.model','unlink',[[47, 48, 9]]);
console.log('▶ unlinked [47,48,9]');
const rest = await rpc('account.analytic.distribution.model','search_count',[[['id','in',[47,48,9]]]]);
console.log('▶ quedan (esperado 0):', rest);
```
⚠️ **Vaciar el `analytic_distribution` a `{}` crashea el onchange de Odoo (incidente 13-jul §9). SIEMPRE unlink completo, nunca vaciar.**

---

## Rollback del write (si algo sale mal) — unlink por llave de semana
El read-back del workflow devuelve `ids_creados` + `llave_prefijo` (ej. `MO S28/2026 ·`). Rollback limpio:
```js
// 1) Ver qué se escribió (por prefijo de llave de la semana)
const PREFIJO = 'MO S28/2026 ·';   // <-- ajusta al periodo escrito
const rows = await rpc('account.analytic.line','search_read',[[['name','like',PREFIJO]],['id','name','amount','account_id','x_plan2_id','x_plan20_id']]);
console.log('▶ líneas MO de la semana:', rows.length, rows);
```
```js
// 2) ROLLBACK — borra TODAS las líneas MO de esa semana (idempotencia vuelve a cero para esa semana)
const ids = rows.map(r=>r.id);
if(ids.length){ await rpc('account.analytic.line','unlink',[[...ids]]); }
const rest = await rpc('account.analytic.line','search_count',[[['name','like',PREFIJO]]]);
console.log('▶ borradas; quedan (esperado 0):', rest);
```
Tras el rollback la semana queda **no-procesada** (la idempotencia por prefijo vuelve a estar limpia) → puedes re-correr el write. Los `budget.line.achieved_amount` de las bolsas/proyectos se recalculan solos al borrar las `analytic.line`.
