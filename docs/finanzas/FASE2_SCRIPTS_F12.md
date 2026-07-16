# FASE 2 — Scripts F12 (canary + prerequisitos de escritura)

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
```js
const COD={25:'002',68:'003',6:'005',8:'006',55:'010',48:'011',63:'012',62:'013',57:'014',59:'016',75:'027',78:'028',79:'029',97:'036',101:'038',108:'044',121:'052',124:'056',127:'058',128:'059',131:'061',130:'062',138:'074',149:'081',153:'084',154:'085'};
for(const [emp,cod] of Object.entries(COD)){ await rpc('hr.employee','write',[[+emp],{x_studio_codigo_contpaqi:cod}]); }
console.log('▶ Poblados', Object.keys(COD).length, 'códigos');
```

### B.3 — Crear Pedro (080) + asimilados Juan (017) / Juana (018)
```js
const pedro=await rpc('hr.employee','create',[{name:'Pedro Arturo Hernández Ramírez', department_id:6, x_studio_codigo_contpaqi:'080', x_studio_cuenta_indirecta_default:608}]);
const juan =await rpc('hr.employee','create',[{name:'Juan De La Cruz Maldonado (asimilado)', department_id:18, x_studio_codigo_contpaqi:'017', x_studio_cuenta_indirecta_default:513}]);
const juana=await rpc('hr.employee','create',[{name:'Juana Camarillo Torrez (asimilado)', department_id:18, x_studio_codigo_contpaqi:'018', x_studio_cuenta_indirecta_default:513}]);
console.log('▶ Creados:', {pedro, juan, juana});
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
Crear en Studio (Empleado, bool "Solo bolsa"). Marcar `true` en: Rissia(97), Pablo(108), Aldo(78), Arturo(143), Ana Laura(101), Magaly(63), Gerardo(59), Erick(149), Eduardo(153), Pedro(080), Juan/Juana. `false` (default) = respeta checkout (Ops, Felipe, Francisco, choferes/aux). El workflow V1 real leerá este campo en vez del mapa en memoria.

---

## Cutover (día del primer run real)
```js
await rpc('account.analytic.distribution.model','unlink',[[47, 48, 9]]);  // los 3 que inyectan 1177 — nunca vaciar
```
Antes: verificar cuál está vivo (ver `docs/INCIDENTES/2026-07-13...` §9).
