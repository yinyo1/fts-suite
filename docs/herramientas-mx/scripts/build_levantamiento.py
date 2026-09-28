"""Sesion nocturna 1 (#330), Bloque 2 · genera el kit de levantamiento fisico del taller.

Salidas (HTML autocontenido, sin red, funciona a 380 px, imprimible, exporta CSV):
  levantamiento_conteo.html    conteo caja por caja (A a S, sueltos, maleta personal) + "buscar tambien"
  levantamiento_medicion.html  medicion con vernier: cajones de cada contenedor y las 40 piezas del carrito base
Los CSV que exportan los lee scripts/ingestar_levantamiento.py.

Datos embebidos: datos/piezas_catalogo.json, datos/odoo_compras_herramienta.tsv, datos/piezas_carrito.json,
datos/validacion_documental.json, diseno_carrito.json. Ningun nombre de persona: quien cuenta se identifica por rol.
"""
import csv, json, os, re
BASE = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(BASE, 'datos')

P = json.load(open(os.path.join(D, 'piezas_catalogo.json'), encoding='utf-8'))
CARR = json.load(open(os.path.join(D, 'piezas_carrito.json'), encoding='utf-8'))
VAL = {v['id']: v for v in json.load(open(os.path.join(D, 'validacion_documental.json'), encoding='utf-8'))['piezas']}
DIS = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
ODOO = list(csv.DictReader(open(os.path.join(D, 'odoo_compras_herramienta.tsv'), encoding='utf-8'), delimiter='\t'))

# ------------------------------------------------------------------ conteo
ORDEN = [chr(c) for c in range(ord('A'), ord('S') + 1)]
cajas = []
for c in ORDEN:
    items = [p for p in P if p['caja_listado'] == c]
    items.sort(key=lambda p: [int(x) if x.isdigit() else x for x in re.split(r'(\d+)', p['numero_interno'])])
    cajas.append({'caja': c, 'titulo': f'Caja {c}', 'items': [
        {'id': p['numero_interno'], 'desc': p['descripcion'].strip(), 'parte': p['numero_parte_corregido'] or '', 'marca': p['marca'] or '',
         'evidencia': p['clasificacion']} for p in items]})
sueltos = [p for p in P if p['caja_listado'] in ('COMPRAR', 'Acomodar', 'ALMACEN', 'S/N') and p['familia'] != 'contenedor'
           and not any(w in p['descripcion'].upper() for w in ('SOLDADORA MILLER', 'ESTANTERIA', 'ENCIMERA'))]
cajas.append({'caja': 'SUELTOS', 'titulo': 'Estuches sueltos y herramienta sin caja', 'items': [
    {'id': p['numero_interno'], 'desc': p['descripcion'].strip(), 'parte': p['numero_parte_corregido'] or '', 'marca': p['marca'] or '',
     'evidencia': p['clasificacion']} for p in sueltos]})
MALETA = [  # hoja "Maleta Personal" del listado 2025, bloque "BOLSA DE TRABAJO INDIVIDUAL" (kit estandar por persona)
    ('Bolsa para herramientas 45.7 cm', 'HD00018', 'HUSKY'), ('Visor BOLT', '48-73-1410', 'MILWAUKEE'),
    ('Careta de seguridad', '48-73-1421', 'MILWAUKEE'), ('Lampara para casco LED magnetica', '2012R', 'MILWAUKEE'),
    ('Casco BOLT tipo 2 clase C', '48-73-1306', 'MILWAUKEE'), ('Guantes Free-Flex (cafes)', '48-73-0014', 'MILWAUKEE'),
    ('Candado LOTO gancho de plastico', '230620', 'MASTER'), ('Tarjeta LOTO', '497AX', 'MASTER'),
    ('Cinto de trabajo 5 cm', '1DMX-604-1', 'MCGUIRE-NICHOLAS'), ('Bolsa de 4 barriles y 5 bolsillos', '300035093', 'HUSKY'),
    ('Chaleco reflejante', '48-73-5022', 'MILWAUKEE'), ('Mangas anticorte (par)', '48739030', 'MILWAUKEE'),
    ('Polainas', '5278', 'INFRA'), ('Mangas para soldar', '5280', 'INFRA'), ('Guantes Free-Flex (negros)', '48-22-8712', 'MILWAUKEE'),
    ('Peto para soldador largo', '5052', 'INFRA'), ('Candado de combinacion', '646DMX', 'MASTER')]
cajas.append({'caja': 'MALETA', 'titulo': 'Maleta personal (una tarjeta por maleta)', 'maleta': True, 'items': [
    {'id': f'MP-{i + 1:02d}', 'desc': d, 'parte': n, 'marca': m, 'evidencia': 'kit_estandar'} for i, (d, n, m) in enumerate(MALETA)]})

repos = {}
for r in ODOO:
    if r['clase'] in ('reposicion', 'duplicado_compra') and r['cruza_con_listado']:
        k = r['cruza_con_listado']
        repos.setdefault(k, {'ref': k, 'desc': r['descripcion_odoo'], 'compras': 0, 'piezas': 0, 'ocs': []})
        repos[k]['compras'] += 1; repos[k]['piezas'] += int(float(r['qty'] or 0)); repos[k]['ocs'].append(r['po'])
BUSCAR = [
    {'id': 'BT-01', 'que': 'Caja PACKOUT de 4 cajones (Odoo P03220, 28-abr-2025, $3,614)', 'como': 'Leer el modelo en la etiqueta de abajo: 48-22-8444 esperado', 'campo': 'modelo leido'},
    {'id': 'BT-02', 'que': 'Caja PACKOUT de 3 cajones de profundidad multiple 48-22-8447 (Odoo P05566, 4-feb-2026, $3,499)', 'como': 'Confirmar 2 cajones delgados + 1 hondo', 'campo': 'modelo leido'},
    {'id': 'BT-03', 'que': 'Caja rodante PACKOUT 48-22-8427 (Odoo P05566)', 'como': 'Ubicar; Odoo no registra recepcion', 'campo': 'modelo leido'},
    {'id': 'BT-04', 'que': 'Placa de la sierra de banda (TPC8): el listado dice 2729-20, Odoo dice 2929-22', 'como': 'Leer el numero en la placa del motor', 'campo': 'numero en placa'},
    {'id': 'BT-05', 'que': 'Estuches 48-22-8450: el listado dice 18, Odoo registra 11 comprados', 'como': 'Contar TODOS los 8450 en taller y planta; los 7 sin orden de compra necesitan ticket', 'campo': 'cuantos hay'},
    {'id': 'BT-06', 'que': 'Sierra sable del listado (6509-31): el SKU de tienda hoy es 6519-31', 'como': 'Leer la placa', 'campo': 'numero en placa'},
    {'id': 'BT-07', 'que': 'Extractor de quijadas Urrea: el listado dice 4212, la descripcion es la del 4216', 'como': 'Leer el numero en el estuche o la pieza', 'campo': 'numero leido'},
    {'id': 'BT-08', 'que': 'Combos M18 (Odoo P01765 y P05567): que herramientas trae cada uno', 'como': 'Anotar modelos de cada herramienta del combo', 'campo': 'modelos'},
] + [{'id': f'BT-R{i + 1:02d}', 'que': f'Reposicion: {v["desc"][:70]} (listado {v["ref"]})',
      'como': f'Compradas {v["piezas"]} en {v["compras"]} ordenes ({", ".join(v["ocs"])}). Contar cuantas hay en total, en cualquier caja', 'campo': 'cuantas hay'}
     for i, v in enumerate(sorted(repos.values(), key=lambda x: -x['piezas']))]

# ------------------------------------------------------------------ medicion
CONT_MED = [  # (modelo, cajones, nota)
    ('48-22-8444', 4, 'la del carrito base; si aparece la de Odoo P03220, medir esa'),
    ('48-22-8447', 3, 'Odoo P05566'),
    ('48-22-8443', 3, 'si hay una en tienda o taller'),
    ('48-22-8442', 2, 'si hay una en tienda o taller'),
    ('48-22-8420', 1, 'cajon frontal; anotar si trae barra o argolla para candado'),
    ('48-22-8450', 1, 'estuche actual: interior bajo la espuma'),
]
REF_CAJON = {'48-22-8444': (414, 318, 58), '48-22-8447': (414, 318, '63 / 63 / 127'), '48-22-8443': (414, 318, 76),
             '48-22-8442': (414, 318, 127), '48-22-8420': (432, 330, 406), '48-22-8450': (480, 320, 114)}
sensibles = set()
for m, v in DIS['modulos'].items():
    pass
import openpyxl
try:
    wb = openpyxl.load_workbook(os.path.join(BASE, 'diseno_carrito.xlsx'), read_only=True)
    for r in wb['Verificacion'].iter_rows(min_row=2, values_only=True):
        if r and r[6] == 'NO': sensibles.add((r[0], r[1]))
except Exception:
    pass
cajon_de = {}
for m, v in DIS['modulos'].items():
    for c in v['cajas']:
        for cj in c['cajones']:
            for q in cj['piezas']:
                cajon_de[q['id']] = (m, f'C{cj["n"]}', c['modelo'])
base = [p for p in CARR if p['modulo'] == 'BASE']
def orden_pieza(p):
    m, c, mdl = cajon_de.get(p['id'], ('BASE', 'C99', ''))
    return (0 if (m, c) in sensibles else 1, int(c[1:]), p['id'])
base.sort(key=orden_pieza)
PIEZAS_MED = []
for p in base:
    v = VAL.get(p['id'], {})
    m, c, mdl = cajon_de.get(p['id'], ('BASE', '', ''))
    PIEZAS_MED.append({'id': p['id'], 'ref': p['ref'], 'desc': p['desc'], 'cajon': c, 'caja': mdl, 'sensible': (m, c) in sensibles,
                       'doc': [p['L'], p['A'], p['H']], 'nivel': [v.get(k, {}).get('nivel', '') for k in ('L', 'A', 'H')], 'peso_doc_kg': p['peso_kg']})

DATA_CONTEO = {'cajas': cajas, 'buscar': BUSCAR, 'generado': '2026-09-28'}
DATA_MED = {'contenedores': [{'modelo': m, 'cajones': n, 'nota': t, 'ref': REF_CAJON[m]} for m, n, t in CONT_MED], 'piezas': PIEZAS_MED,
            'sensibles': sorted(f'{a} {b}' for a, b in sensibles), 'generado': '2026-09-28'}

CSS = r"""
:root{--bg:#f6f5f1;--card:#fff;--ink:#1d1d1b;--mut:#5f5e57;--line:#d9d6cc;--acc:#f2b705;--acc-ink:#1d1d1b;--ok:#2e7d32;--bad:#c62828;--warn:#b26a00;--chip:#efece3}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#171714;--card:#22221e;--ink:#f1efe8;--mut:#b3b0a6;--line:#3a3933;--chip:#2d2c27;--ok:#66bb6a;--bad:#ef5350;--warn:#ffb74d}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--ink);color:var(--bg);padding:10px 16px}
header h1{margin:0;font-size:17px}header p{margin:2px 0 0;font-size:12px;opacity:.8}
main{max-width:860px;margin:0 auto;padding:12px 16px 90px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin:12px 0}
.card h2{margin:0 0 6px;font-size:16px;display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.card h2 small{font-weight:400;color:var(--mut);font-size:12px}
label.f{display:block;font-size:12px;color:var(--mut);margin:6px 0 2px}
input[type=text],input[type=number],select,textarea{width:100%;font:inherit;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)}
.row{border-top:1px solid var(--line);padding:8px 0}
.row .t{font-weight:600;font-size:14px}.row .s{font-size:12px;color:var(--mut)}
.seg{display:flex;gap:4px;margin:6px 0;flex-wrap:wrap}
.seg button{flex:1 1 0;min-width:70px;padding:8px 4px;border:1px solid var(--line);border-radius:8px;background:var(--chip);color:var(--ink);font:inherit;font-size:13px}
.seg button.on[data-v=existe]{background:var(--ok);color:#fff;border-color:var(--ok)}
.seg button.on[data-v=no_existe]{background:var(--bad);color:#fff;border-color:var(--bad)}
.seg button.on[data-v=danada]{background:var(--warn);color:#fff;border-color:var(--warn)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.chip{display:inline-block;background:var(--chip);border-radius:20px;padding:1px 8px;font-size:11px;margin-left:4px}
.chip.w{background:var(--acc);color:var(--acc-ink)}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:8px 16px;display:flex;gap:8px;z-index:6}
.bar button,.btn{flex:1;padding:10px;border-radius:8px;border:0;background:var(--acc);color:var(--acc-ink);font:inherit;font-weight:600}
.bar button.sec{background:var(--chip);color:var(--ink)}
.prog{font-size:12px;color:var(--mut)}
.foto img{max-width:100%;border-radius:8px;margin-top:6px}
nav.idx{display:flex;flex-wrap:wrap;gap:4px}nav.idx a{padding:4px 8px;border-radius:6px;background:var(--chip);color:var(--ink);text-decoration:none;font-size:13px}
nav.idx a.done{background:var(--ok);color:#fff}
svg{max-width:100%;height:auto}.croq{max-width:520px}@media (max-width:520px){.grid3.hdr{grid-template-columns:1fr}}.croq svg{width:100%}.ley{font-size:13px;margin:6px 0 10px;padding-left:22px}
.note{font-size:12px;color:var(--mut)}
@media print{header,.bar,nav.idx,.noprint{display:none!important}body{background:#fff;color:#000;font-size:11px}main{padding:0;max-width:none}
.card{break-inside:avoid;border:1px solid #999;margin:6px 0}.seg{display:none}.pr{display:inline!important}input[type=text],input[type=number],textarea,select{border:0;border-bottom:1px solid #999;border-radius:0;padding:2px;background:#fff;color:#000}}
.pr{display:none}
"""

JS_COMUN = r"""
function $(s,r){return (r||document).querySelector(s)}function $$(s,r){return Array.from((r||document).querySelectorAll(s))}
function guardar(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function leer(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function csvCampo(v){v=v==null?'':String(v);return /[",\n;]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
function descargar(nombre,texto,tipo){const b=new Blob([texto],{type:tipo||'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=nombre;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
function hoy(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
// fotos: se reducen a 1280 px y se guardan en IndexedDB (no en el CSV); se descargan aparte
const DBN='fts_levantamiento_fotos';
function db(){return new Promise((ok,ko)=>{try{const r=indexedDB.open(DBN,1);r.onupgradeneeded=()=>r.result.createObjectStore('f');r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error)}catch(e){ko(e)}})}
async function fotoGuardar(k,dataUrl){try{const d=await db();d.transaction('f','readwrite').objectStore('f').put(dataUrl,k)}catch(e){}}
async function fotoLeer(k){try{const d=await db();return await new Promise(ok=>{const r=d.transaction('f').objectStore('f').get(k);r.onsuccess=()=>ok(r.result);r.onerror=()=>ok(null)})}catch(e){return null}}
function reducir(file){return new Promise(ok=>{const im=new Image();im.onload=()=>{const s=Math.min(1,1280/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=im.width*s;c.height=im.height*s;c.getContext('2d').drawImage(im,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',.72))};im.src=URL.createObjectURL(file)})}
"""

def html(title, sub, body, data, js):
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><style>{CSS}</style></head>
<body><header><h1>{title}</h1><p>{sub}</p></header><main>{body}</main>
<script>const DATA={json.dumps(data, ensure_ascii=False)};{JS_COMUN}{js}</script></body></html>"""

CONTEO_BODY = """
<div class="card"><h2>Antes de empezar</h2>
<div class="grid2"><div><label class="f">Fecha</label><input type="text" id="fecha"></div>
<div><label class="f">Rol de quien cuenta (no escribas nombres)</label><select id="rol"><option>rol-taller</option><option>supervisor_sr</option><option>ingenieria</option><option>segurista</option><option>manager_ops</option><option>otro rol</option></select></div></div>
<label class="f">Lugar</label><input type="text" id="lugar" placeholder="taller FTS, planta del cliente...">
<p class="note">Cada renglon: marca si existe, si no existe o si esta danada. Si ves un numero de parte en la placa, escribelo. Toma una foto por caja con la caja abierta. Se guarda solo en este telefono hasta que exportes.</p>
<nav class="idx" id="idx"></nav></div>
<div id="cajas"></div>
<div class="card" id="buscar"><h2>Buscar tambien <small>cosas que no estan en una caja</small></h2><div id="bt"></div></div>
<div class="bar"><button class="sec" onclick="window.print()">Imprimir</button><button class="sec" onclick="exportarFotos()">Fotos</button><button onclick="exportar()">Exportar CSV</button></div>
"""
CONTEO_JS = r"""
const K='fts_conteo_v1';let S=leer(K,{fecha:hoy(),rol:'rol-taller',lugar:'',it:{},bt:{},fotos:{},maletas:{}});
function save(){guardar(K,S);pintarIdx()}
function estado(id){return (S.it[id]||{}).e||''}
function set(id,campo,v){S.it[id]=S.it[id]||{};S.it[id][campo]=v;save()}
function fila(c,it,mi){const key=mi?c.caja+'#'+mi+'|'+it.id:it.id;const e=(S.it[key]||{}).e||'';const pl=(S.it[key]||{}).p||'';const n=(S.it[key]||{}).n||'';
 return `<div class="row" data-k="${esc(key)}"><div class="t">${esc(it.id)} · ${esc(it.desc)}</div>
 <div class="s">${esc(it.marca)} ${it.parte?'· parte '+esc(it.parte):''} ${it.evidencia==='en_listado_sin_evidencia'?'<span class=chip>sin foto 2025</span>':''}${it.evidencia==='comprada_no_listada'?'<span class="chip w">comprada, no listada</span>':''}</div>
 <div class="seg">${['existe','no_existe','danada'].map(v=>`<button data-v="${v}" class="${e===v?'on':''}" onclick="marcar(this)">${{existe:'Existe',no_existe:'No existe',danada:'Danada'}[v]}</button>`).join('')}</div>
 <span class="pr">[ ] existe  [ ] no existe  [ ] danada</span>
 <div class="grid2"><input type="text" placeholder="numero de parte en la placa" value="${esc(pl)}" oninput="set('${esc(key)}','p',this.value)"><input type="text" placeholder="nota" value="${esc(n)}" oninput="set('${esc(key)}','n',this.value)"></div></div>`}
function marcar(b){const k=b.closest('.row').dataset.k;const cur=(S.it[k]||{}).e;const v=cur===b.dataset.v?'':b.dataset.v;set(k,'e',v);$$('button',b.parentNode).forEach(x=>x.classList.toggle('on',x.dataset.v===v))}
function tarjeta(c){let h=`<div class="card" id="c-${c.caja}"><h2>${esc(c.titulo)} <small id="p-${c.caja}"></small></h2>`;
 if(c.maleta){const n=S.maletas[c.caja]||1;h+=`<label class="f">Cuantas maletas personales vas a contar</label><input type="number" min="1" max="30" value="${n}" onchange="S.maletas['${c.caja}']=+this.value||1;save();render()">`;
  for(let i=1;i<=n;i++){h+=`<h3 style="font-size:14px;margin:12px 0 0">Maleta ${i} <span class="note">(se identifica por numero, nunca por nombre)</span></h3>`+c.items.map(it=>fila(c,it,i)).join('')}}
 else h+=c.items.map(it=>fila(c,it)).join('');
 h+=`<div class="foto noprint"><label class="f">Foto de la caja abierta</label><input type="file" accept="image/*" capture="environment" onchange="foto('${c.caja}',this)"><div id="f-${c.caja}"></div></div><span class="pr">Foto tomada: [ ]</span></div>`;return h}
async function foto(caja,inp){const f=inp.files[0];if(!f)return;const u=await reducir(f);const k='caja_'+caja;await fotoGuardar(k,u);S.fotos[caja]=k+'.jpg';save();$('#f-'+caja).innerHTML=`<img src="${u}" alt="foto caja ${esc(caja)}">`}
function btFila(b){const v=S.bt[b.id]||{};return `<div class="row"><div class="t">${esc(b.id)} · ${esc(b.que)}</div><div class="s">${esc(b.como)}</div>
 <div class="seg">${['encontrado','no_encontrado'].map(x=>`<button data-v="${x==='encontrado'?'existe':'no_existe'}" class="${v.e===x?'on':''}" onclick="btMarcar('${b.id}','${x}',this)">${x==='encontrado'?'Encontrado':'No encontrado'}</button>`).join('')}</div>
 <div class="grid2"><input type="text" placeholder="${esc(b.campo)}" value="${esc(v.v||'')}" oninput="S.bt['${b.id}']=Object.assign(S.bt['${b.id}']||{},{v:this.value});save()"><input type="text" placeholder="donde / nota" value="${esc(v.n||'')}" oninput="S.bt['${b.id}']=Object.assign(S.bt['${b.id}']||{},{n:this.value});save()"></div></div>`}
function btMarcar(id,x,b){const cur=(S.bt[id]||{}).e;const v=cur===x?'':x;S.bt[id]=Object.assign(S.bt[id]||{},{e:v});save();$$('button',b.parentNode).forEach(y=>y.classList.remove('on'));if(v)b.classList.add('on')}
function pintarIdx(){$('#idx').innerHTML=DATA.cajas.map(c=>{const ks=c.maleta?Object.keys(S.it).filter(k=>k.startsWith(c.caja+'#')):c.items.map(i=>i.id);const tot=c.maleta?c.items.length*(S.maletas[c.caja]||1):c.items.length;const hechas=ks.filter(k=>(S.it[k]||{}).e).length;
 const el=$('#p-'+c.caja);if(el)el.textContent=hechas+' de '+tot;return `<a href="#c-${c.caja}" class="${hechas>=tot&&tot?'done':''}">${c.caja==='SUELTOS'?'Sueltos':c.caja==='MALETA'?'Maleta':c.caja} ${hechas}/${tot}</a>`}).join('')}
function render(){$('#cajas').innerHTML=DATA.cajas.map(tarjeta).join('');$('#bt').innerHTML=DATA.buscar.map(btFila).join('');pintarIdx();
 DATA.cajas.forEach(async c=>{if(S.fotos[c.caja]){const u=await fotoLeer('caja_'+c.caja);if(u)$('#f-'+c.caja).innerHTML=`<img src="${u}" alt="">`}})}
function exportar(){const H=['seccion','caja','numero_interno','descripcion','numero_parte_catalogo','estado','parte_leida','nota','foto_caja','fecha','rol','lugar'];const L=[H.join(',')];
 DATA.cajas.forEach(c=>{const reps=c.maleta?(S.maletas[c.caja]||1):1;for(let i=1;i<=reps;i++)c.items.forEach(it=>{const k=c.maleta?c.caja+'#'+i+'|'+it.id:it.id;const v=S.it[k]||{};
  L.push([c.maleta?'maleta':(c.caja==='SUELTOS'?'sueltos':'caja'),c.maleta?'MALETA-'+i:c.caja,it.id,it.desc,it.parte,v.e||'sin_revisar',v.p||'',v.n||'',S.fotos[c.caja]||'',S.fecha,S.rol,S.lugar].map(csvCampo).join(','))})});
 DATA.buscar.forEach(b=>{const v=S.bt[b.id]||{};L.push(['buscar',b.id,b.id,b.que,'',v.e||'sin_revisar',v.v||'',v.n||'','',S.fecha,S.rol,S.lugar].map(csvCampo).join(','))});
 descargar('conteo_'+S.fecha+'.csv','﻿'+L.join('\n'))}
async function exportarFotos(){let n=0;for(const c of DATA.cajas){const u=await fotoLeer('caja_'+c.caja);if(u){const a=document.createElement('a');a.href=u;a.download='caja_'+c.caja+'.jpg';document.body.appendChild(a);a.click();a.remove();n++;await new Promise(r=>setTimeout(r,300))}}if(!n)alert('Todavia no hay fotos')}
$('#fecha').value=S.fecha;$('#rol').value=S.rol;$('#lugar').value=S.lugar;
$('#fecha').oninput=e=>{S.fecha=e.target.value;save()};$('#rol').onchange=e=>{S.rol=e.target.value;save()};$('#lugar').oninput=e=>{S.lugar=e.target.value;save()};
render();
"""

# SVG croquis (1 unidad = 1 mm aproximado, solo ilustrativo)
SVG_CAJON = """<div class="croq"><svg viewBox="0 0 360 170" role="img" aria-label="Que medir en un cajon">
<style>.l{stroke:currentColor;fill:none;stroke-width:1.5}.d{stroke:#c62828;stroke-width:1.3;fill:none;marker-end:url(#a);marker-start:url(#a)}.t{font:12px system-ui;fill:currentColor}.n{fill:#c62828;font:bold 14px system-ui}</style>
<defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#c62828"/></marker></defs>
<text class="t" x="8" y="14">Arriba, cajon abierto</text>
<rect class="l" x="8" y="24" width="140" height="100"/>
<line class="d" x1="8" y1="136" x2="148" y2="136"/><text class="n" x="72" y="156">1</text>
<line class="d" x1="160" y1="24" x2="160" y2="124"/><text class="n" x="166" y="79">2</text>
<text class="t" x="196" y="14">De lado, dos cajones</text>
<rect class="l" x="196" y="24" width="150" height="26"/><text class="t" x="214" y="42">cajon de arriba</text>
<path class="l" d="M196 60 L196 130 L346 130 L346 60"/><path class="l" d="M196 60 L208 60 L208 70"/>
<line class="d" x1="320" y1="130" x2="320" y2="60"/><text class="n" x="326" y="99">3</text>
<line class="d" x1="290" y1="130" x2="290" y2="50"/><text class="n" x="274" y="99">5</text>
<line class="d" x1="220" y1="60" x2="220" y2="70"/><text class="n" x="226" y="72">4</text>
</svg><ol class="ley"><li><b>Ancho</b> interior, de pared a pared (de frente)</li><li><b>Fondo</b> interior, del frente a la pared de atras</li>
<li><b>Alto</b> interior, del piso del cajon al borde</li><li><b>Labio</b>: lo que baja la pestana del frente</li>
<li><b>Alto util</b>: del piso del cajon a la parte baja del cajon de arriba, con los dos cerrados. Es la medida que manda.</li></ol></div>"""
SVG_PIEZA = """<div class="croq"><svg viewBox="0 0 360 150" role="img" aria-label="Que medir en una pieza">
<style>.l{stroke:currentColor;fill:none;stroke-width:1.5}.d{stroke:#c62828;stroke-width:1.3;fill:none;marker-end:url(#b);marker-start:url(#b)}.t{font:12px system-ui;fill:currentColor}.n{fill:#c62828;font:bold 14px system-ui}</style>
<defs><marker id="b" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#c62828"/></marker></defs>
<text class="t" x="8" y="14">Acostada, de arriba</text>
<path class="l" d="M12 40 h110 a14 14 0 0 1 0 28 h-110 z"/><circle class="l" cx="28" cy="54" r="8"/>
<line class="d" x1="12" y1="84" x2="136" y2="84"/><text class="n" x="70" y="104">1</text>
<line class="d" x1="148" y1="40" x2="148" y2="68"/><text class="n" x="154" y="59">2</text>
<text class="t" x="196" y="14">Acostada, de lado</text><rect class="l" x="196" y="30" width="120" height="18"/>
<line class="d" x1="326" y1="30" x2="326" y2="48"/><text class="n" x="334" y="44">3</text>
<text class="t" x="196" y="80">Parada</text><rect class="l" x="230" y="90" width="20" height="50"/>
<line class="d" x1="262" y1="90" x2="262" y2="140"/><text class="n" x="270" y="120">4</text>
</svg><ol class="ley"><li><b>Largo</b>: lo mas largo, con mango y accesorio como se guarda</li><li><b>Ancho</b>: acostada, de lado a lado</li>
<li><b>Alto acostada</b>: del piso al punto mas alto, como va en el cajon</li><li><b>Alto parada</b>: solo si se puede guardar parada</li></ol></div>"""
MED_BODY = """
<div class="card"><h2>Antes de medir</h2>
<div class="grid3 hdr"><div><label class="f">Fecha</label><input type="text" id="fecha"></div>
<div><label class="f">Rol</label><select id="rol"><option>ingenieria</option><option>rol-taller</option><option>supervisor_sr</option><option>otro rol</option></select></div>
<div><label class="f">Instrumento</label><select id="inst"><option>vernier digital 150 mm</option><option>vernier 300 mm</option><option>flexometro</option><option>bascula</option></select></div></div>
<p class="note">Todo en milimetros, sin decimales; el peso en gramos. Primero los cajones de cada contenedor, luego las 40 piezas del carrito base, empezando por las de los cajones sensibles (marcadas). Si no puedes medir algo, deja el campo vacio y escribe por que en la nota.</p></div>
<div class="card"><h2>1. Cajones <small>que medir</small></h2>__SVG_CAJON__<div id="cont"></div></div>
<div class="card"><h2>2. Piezas del carrito base <small>que medir</small></h2>__SVG_PIEZA__<div id="pz"></div></div>
<div class="bar"><button class="sec" onclick="window.print()">Imprimir</button><button onclick="exportar()">Exportar CSV</button></div>
"""
MED_JS = r"""
const K='fts_medicion_v1';let S=leer(K,{fecha:hoy(),rol:'ingenieria',inst:'vernier digital 150 mm',c:{},p:{},extra:{}});
function save(){guardar(K,S)}
function num(k,obj,campo,ph){const v=((S[obj][k]||{})[campo])||'';return `<input type="number" inputmode="numeric" min="0" placeholder="${ph}" value="${esc(v)}" oninput="setv('${obj}','${esc(k)}','${campo}',this.value)">`}
function txt(k,obj,campo,ph){const v=((S[obj][k]||{})[campo])||'';return `<input type="text" placeholder="${ph}" value="${esc(v)}" oninput="setv('${obj}','${esc(k)}','${campo}',this.value)">`}
function setv(o,k,c,v){S[o][k]=S[o][k]||{};S[o][k][c]=v;save()}
function contenedores(){return DATA.contenedores.map(c=>{const n=(S.extra[c.modelo]||1);let h=`<div class="row"><div class="t">${esc(c.modelo)} <span class="chip">${c.cajones} cajon(es)</span></div><div class="s">${esc(c.nota)} · referencia fabricante: ${c.ref.join(' x ')} mm</div>
 <label class="f">Cuantas unidades de este modelo vas a medir</label><input type="number" min="0" max="5" value="${n}" onchange="S.extra['${c.modelo}']=+this.value;save();render()">`;
 for(let u=1;u<=n;u++)for(let j=1;j<=c.cajones;j++){const k=c.modelo+'|'+u+'|'+j;h+=`<div style="margin-top:8px"><b>Unidad ${u} · cajon ${j}</b> <span class="note">(1 = el de arriba)</span>
 <div class="grid3">${num(k,'c','ancho','1 ancho')}${num(k,'c','fondo','2 fondo')}${num(k,'c','alto','3 alto int.')}</div>
 <div class="grid3" style="margin-top:6px">${num(k,'c','labio','4 labio')}${num(k,'c','util','5 alto util')}${txt(k,'c','nota','nota / candado')}</div></div>`}
 return h+'</div>'}).join('')}
function piezas(){return DATA.piezas.map(p=>{const k=p.id;return `<div class="row"><div class="t">${esc(p.id)} · ${esc(p.desc)} ${p.sensible?'<span class="chip w">cajon sensible '+esc(p.cajon)+'</span>':'<span class="chip">'+esc(p.cajon)+'</span>'}</div>
 <div class="s">Ref. ${esc(p.ref)} · hoy en el diseno: ${p.doc.join(' x ')} mm (niveles ${p.nivel.join(' / ')}) · ${p.peso_doc_kg} kg</div>
 <div class="grid2">${num(k,'p','largo','1 largo')}${num(k,'p','ancho','2 ancho')}</div>
 <div class="grid3" style="margin-top:6px">${num(k,'p','alto','3 alto acostada')}${num(k,'p','parada','4 alto parada')}${num(k,'p','peso','peso g')}</div>
 <div class="grid2" style="margin-top:6px">${txt(k,'p','parte','numero de parte leido')}${txt(k,'p','nota','nota')}</div></div>`}).join('')}
function render(){$('#cont').innerHTML=contenedores();$('#pz').innerHTML=piezas()}
function exportar(){const H=['tipo','id','modelo','unidad','cajon','largo_o_ancho_mm','ancho_o_fondo_mm','alto_mm','labio_mm','alto_util_mm','alto_parado_mm','peso_g','parte_leida','nota','fecha','rol','instrumento'];const L=[H.join(',')];
 DATA.contenedores.forEach(c=>{const n=S.extra[c.modelo]||1;for(let u=1;u<=n;u++)for(let j=1;j<=c.cajones;j++){const k=c.modelo+'|'+u+'|'+j;const v=S.c[k]||{};if(!Object.values(v).some(x=>x))continue;
  L.push(['cajon',c.modelo+'-u'+u+'-c'+j,c.modelo,u,j,v.ancho,v.fondo,v.alto,v.labio,v.util,'','','',v.nota,S.fecha,S.rol,S.inst].map(csvCampo).join(','))}});
 DATA.piezas.forEach(p=>{const v=S.p[p.id]||{};if(!Object.values(v).some(x=>x))return;L.push(['pieza',p.id,'','','',v.largo,v.ancho,v.alto,'','',v.parada,v.peso,v.parte,v.nota,S.fecha,S.rol,S.inst].map(csvCampo).join(','))});
 descargar('medicion_'+S.fecha+'.csv','﻿'+L.join('\n'))}
$('#fecha').value=S.fecha;$('#rol').value=S.rol;$('#inst').value=S.inst;
$('#fecha').oninput=e=>{S.fecha=e.target.value;save()};$('#rol').onchange=e=>{S.rol=e.target.value;save()};$('#inst').onchange=e=>{S.inst=e.target.value;save()};
render();
"""

open(os.path.join(BASE, 'levantamiento_conteo.html'), 'w', encoding='utf-8').write(
    html('Conteo fisico de herramienta', 'Proyecto Herramientas MX · caja por caja · se guarda en este telefono', CONTEO_BODY, DATA_CONTEO, CONTEO_JS))
open(os.path.join(BASE, 'levantamiento_medicion.html'), 'w', encoding='utf-8').write(
    html('Medicion con vernier', 'Proyecto Herramientas MX · cajones y carrito base · se guarda en este telefono',
         MED_BODY.replace('__SVG_CAJON__', SVG_CAJON).replace('__SVG_PIEZA__', SVG_PIEZA), DATA_MED, MED_JS))
print('conteo:', sum(len(c['items']) for c in cajas), 'renglones en', len(cajas), 'secciones;', len(BUSCAR), 'buscar tambien')
print('medicion:', len(CONT_MED), 'contenedores,', len(PIEZAS_MED), 'piezas; sensibles', DATA_MED['sensibles'])
