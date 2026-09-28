"""Sesion nocturna 1 (#330), Bloque 3 · vista_3d_carrito.html: carrito base armado y cada modulo en 3D, con cajones que
se abren (toque o clic). Autocontenido: incrusta three.js r128 y OrbitControls (licencia MIT), funciona sin senal.

Entrada: diseno_carrito.json (acomodo) y las cotas exteriores del fabricante. Salida: vista_3d_carrito.html.
Uso: python3 scripts/build_vista_3d.py /ruta/three.min.js /ruta/OrbitControls.js
"""
import json, os, sys
BASE = os.path.join(os.path.dirname(__file__), '..')
d = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
EXT = {  # exterior (frente x fondo x alto) en mm, fabricante; la 8420 con ruedas
    '48-22-8420': (483, 610, 502), '48-22-8444': (564, 414, 363), '48-22-8447': (564, 414, 363),
    '48-22-8442': (564, 414, 363), '48-22-8443': (564, 414, 363)}
FAM = {'mecanica_general': '#cfd8dc', 'electrico': '#f2b705', 'soldadura_metalmecanica': '#ff7043', 'perforacion_corte': '#ba68c8',
       'medicion_trazo': '#4fc3f7', 'tuberia': '#81c784', 'inalambricas_energia': '#546e7a', 'izaje_amarre': '#8d6e63'}
# Sesion nocturna 2 (#338): cada pieza lleva la malla de su modelo parametrico (cad/modelos_herramienta) ya colocada en
# el cajon, y su estado del chequeo de interferencias (datos/interferencias_3d.json). FALLA se pinta en rojo.
sys.path.insert(0, os.path.join(BASE, 'scripts')); sys.path.insert(0, os.path.join(BASE, 'cad', 'modelos_herramienta'))
import modelos; modelos.SEG = 10
import interferencias_3d as I3
EST = {}
_ruta_int = os.path.join(BASE, 'datos', 'interferencias_3d.json')
if os.path.exists(_ruta_int):
    for r in json.load(open(_ruta_int, encoding='utf-8'))['cajones']:
        for x in r['piezas']: EST[(r['modulo'], x['activo'])] = (x['estado'], x['holgura_min_mm'], x['chequeo'])
VAR_EST = {}
if os.path.exists(_ruta_int):
    for r in (json.load(open(_ruta_int, encoding='utf-8')).get('variantes') or {}).get('M18 con bateria puesta', []):
        for x in r['piezas']: VAR_EST[x['activo']] = (x['estado'], x['holgura_min_mm'], x['chequeo'])
def malla(q, variante=None):
    t, m, env = modelos.modelo(q, variante)
    mm = I3.colocar(m, q, I3.ESP_LOSETA + I3.BASE_FICHA, env)
    return {'v': [round(float(c)) for c in mm.vertices.flatten()], 'f': [int(i) for i in mm.faces.flatten()]}
mods = {}
for m, v in d['modulos'].items():
    cajas = []
    for c in reversed(v['cajas']):          # de abajo hacia arriba
        cajas.append({'modelo': c['modelo'], 'ext': EXT[c['modelo']], 'cajones': [
            {'n': cj['n'], 'ancho': cj['ancho'], 'fondo': cj['fondo'], 'alto': cj['alto'], 'ocup': cj['ocupacion'], 'peso': cj['peso_kg'],
             'piezas': [{'id': q['id'], 'act': q['activo'], 'd': q['corto'][:60], 'x': q['x'], 'y': q['y'], 'w': q['w'], 'h': q['h'], 'H': q['H'],
                         'f': q['familia'], 'g': malla(q), 'e': EST.get((m, q['activo']), ('SIN DATO', None, ''))} for q in cj['piezas']]} for cj in c['cajones']]})
    mods[m] = {'cajas': cajas, 'alto': v['metricas']['alto_mm']}
# variante para ver en rojo: carrito base con las M18 con bateria puesta (no cierran el cajon de 76 mm)
import copy as _c
mods['BASE_BAT'] = _c.deepcopy(mods['BASE'])
for c in mods['BASE_BAT']['cajas']:
    for cj in c['cajones']:
        for q in cj['piezas']:
            if q['id'] in ('IMP38', 'IMP14', 'ROTO18'):
                src = [p for cc in d['modulos']['BASE']['cajas'] for k in cc['cajones'] for p in k['piezas'] if p['activo'] == q['act']][0]
                q['g'] = malla(src, 'con_bateria'); q['e'] = VAR_EST.get(q['act'], ('SIN DATO', None, ''))
three = open(sys.argv[1], encoding='utf-8').read(); orbit = open(sys.argv[2], encoding='utf-8').read()
NOMBRE = {'BASE_BAT': 'Carrito base con las M18 con bateria puesta (no cabe: en rojo)', 'BASE': 'Carrito base', 'ELE': 'Electrico', 'SOL': 'Soldadura', 'TUB': 'Tuberia', 'CIV': 'Obra civil', 'MED': 'Medicion'}
html = """<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Carrito FTS en 3D</title><style>
:root{--bg:#f6f5f1;--ink:#1d1d1b;--mut:#5f5e57;--line:#d9d6cc;--card:#fff;--acc:#f2b705}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#171714;--ink:#f1efe8;--mut:#b3b0a6;--line:#3a3933;--card:#22221e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}
header{padding:10px 16px;background:var(--ink);color:var(--bg)}header h1{margin:0;font-size:17px}header p{margin:2px 0 0;font-size:12px;opacity:.8}
.wrap{display:grid;grid-template-columns:1fr 300px;gap:0;min-height:calc(100vh - 52px)}
#v{position:relative;min-height:420px}#v canvas{display:block;width:100%;height:100%;touch-action:none}
aside{border-left:1px solid var(--line);padding:12px 16px;background:var(--card);overflow:auto}
select,button{font:inherit}select{width:100%;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
.cj{display:flex;justify-content:space-between;gap:6px;align-items:center;width:100%;margin:4px 0;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);text-align:left}
.cj.on{border-color:var(--acc);box-shadow:inset 3px 0 0 var(--acc)}.m{font-size:12px;color:var(--mut)}
ul{margin:6px 0;padding-left:18px;font-size:13px}#tip{position:absolute;left:8px;bottom:8px;font-size:12px;color:var(--mut);background:var(--card);padding:4px 8px;border-radius:6px;border:1px solid var(--line)}
@media (max-width:760px){.wrap{grid-template-columns:1fr}#v{height:60vh}aside{border-left:0;border-top:1px solid var(--line)}}
</style></head><body><header><h1>Carrito FTS en 3D</h1><p>Proyecto Herramientas MX · modelos parametricos e interferencias de la sesion nocturna 2 · en rojo lo que falla · medidas no validadas</p></header>
<div class="wrap"><div id="v"><div id="tip">Arrastra para girar · pellizca o rueda para acercar · toca un cajon para abrirlo</div></div>
<aside><label class="m" for="mod">Que ver</label><select id="mod"></select><p class="m" id="res"></p><div id="lista"></div><div id="det"></div><p class="m" id="ley"></p></aside></div>
<script>""" + three + "\n" + orbit + """</script>
<script>
const D=__DATA__, NOM=__NOM__, FAM=__FAM__;
const cont=document.getElementById('v');let W=cont.clientWidth,H=cont.clientHeight||420;
const ren=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});ren.setPixelRatio(Math.min(2,window.devicePixelRatio||1));ren.setSize(W,H);cont.prepend(ren.domElement);
const esc=new THREE.Scene();const osc=matchMedia('(prefers-color-scheme: dark)').matches;esc.background=new THREE.Color(osc?0x171714:0xf6f5f1);
const cam=new THREE.PerspectiveCamera(40,W/H,10,20000);const ctl=new THREE.OrbitControls(cam,ren.domElement);ctl.enableDamping=true;
esc.add(new THREE.HemisphereLight(0xffffff,0x555555,0.9));const dl=new THREE.DirectionalLight(0xffffff,0.6);dl.position.set(800,1500,1200);esc.add(dl);
const piso=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),new THREE.MeshLambertMaterial({color:osc?0x2a2a25:0xe9e6dc}));piso.rotation.x=-Math.PI/2;esc.add(piso);
let grupo=null,cajones=[],abierto=null;
const mRojo=new THREE.MeshLambertMaterial({color:0xc62828}),mNegro=new THREE.MeshLambertMaterial({color:0x222222}),mInt=new THREE.MeshLambertMaterial({color:0x8e1b1b});
function caja(w,h,d,m){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m)}
function at(o,x,y,z){o.position.set(x,y,z);return o}
function construir(mod){if(grupo)esc.remove(grupo);grupo=new THREE.Group();cajones=[];abierto=null;let y=0;const M=D[mod];
 M.cajas.forEach((c,ci)=>{const [ew,ed,eh]=c.ext;const g=new THREE.Group();g.position.y=y;
  const es8420=c.modelo==='48-22-8420';const tapa=es8420?60:40,fondo=es8420?40:20;
  // carcasa: laterales, fondo trasero, tapa negra con la huella PACKOUT
  g.add(at(caja(ew,eh-tapa,20,mRojo),0,(eh-tapa)/2,-ed/2+10));
  [-1,1].forEach(s=>g.add(at(caja(20,eh-tapa,ed,mRojo),s*(ew/2-10),(eh-tapa)/2,0)));
  g.add(at(caja(ew,tapa,ed,mNegro),0,eh-tapa/2,0));
  g.add(at(caja(ew,fondo,ed,mRojo),0,fondo/2,0));
  if(es8420)[-1,1].forEach(s=>{const r=new THREE.Mesh(new THREE.CylinderGeometry(115,115,60,24),mNegro);r.rotation.z=Math.PI/2;r.position.set(s*(ew/2+30),115,-ed/2+120);g.add(r)});
  // cajones: se reparten en la altura libre en proporcion a su alto interior
  const libre=eh-tapa-fondo,suma=c.cajones.reduce((a,b)=>a+b.alto,0);let yy=fondo;
  c.cajones.slice().reverse().forEach(cj=>{const hs=libre*cj.alto/suma;const t=new THREE.Group();t.position.set(0,yy,0);
   const iw=cj.ancho,id=cj.fondo;const fr=caja(ew-44,hs-4,14,mRojo);fr.position.set(0,hs/2,ed/2-7);t.add(fr);
   const pis=caja(iw,4,id,mInt);pis.position.set(0,2,ed/2-14-id/2);t.add(pis);
   cj.piezas.forEach(p=>{const falla=p.e[0]==='FALLA';const col=new THREE.Color(falla?'#d50000':(FAM[p.f]||'#bdbdbd'));
    const geo=new THREE.BufferGeometry();const v=new Float32Array(p.g.v.length);
    for(let i=0;i<p.g.v.length;i+=3){v[i]=-iw/2+p.g.v[i];v[i+1]=p.g.v[i+2];v[i+2]=ed/2-14-id+p.g.v[i+1]}
    geo.setAttribute('position',new THREE.BufferAttribute(v,3));geo.setIndex(p.g.f);geo.computeVertexNormals();
    const b=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:col,side:THREE.DoubleSide}));b.userData.p=p;t.add(b)});
   t.userData={cj,caja:c.modelo,prof:id+20,ci};g.add(t);cajones.push(t);yy+=hs});
  grupo.add(g);y+=eh});
 esc.add(grupo);const alto=y;cam.position.set(1400,alto*0.9+300,1700);ctl.target.set(0,alto/2,0);ctl.update();
 document.getElementById('res').textContent=`${NOM[mod]}: ${M.cajas.length} cajas, pila de ${M.alto} mm, ${cajones.filter(t=>t.userData.cj.piezas.length).length} cajones con herramienta`;
 lista()}
function lista(){const L=document.getElementById('lista');L.innerHTML='';cajones.slice().reverse().forEach((t,i)=>{const c=t.userData.cj;const b=document.createElement('button');b.className='cj'+(t===abierto?' on':'');const fx=c.piezas.filter(p=>p.e[0]==='FALLA').length;
 b.innerHTML=`<span>C${c.n} · ${t.userData.caja.slice(6)} · ${c.alto} mm</span><span class="m">${c.piezas.length} pzas · ${c.ocup}%${fx?' · <b style=\"color:#d50000\">'+fx+' falla</b>':''}</span>`;b.onclick=()=>toggle(t);L.appendChild(b)})}
function toggle(t){if(abierto&&abierto!==t)abierto.userData.obj=0;abierto=(abierto===t)?null:t;cajones.forEach(x=>x.userData.obj=(x===abierto?x.userData.prof:0));lista();detalle()}
function detalle(){const el=document.getElementById('det');if(!abierto){el.innerHTML='';return}const c=abierto.userData.cj;
 el.innerHTML=`<p><b>Cajon C${c.n}</b> · ${abierto.userData.caja} · ${c.ancho} x ${c.fondo} x ${c.alto} mm · ${c.peso} kg</p><ul>`+c.piezas.map(p=>`<li><b>${p.act}</b> ${p.d} <span class="m" style="${p.e[0]==='FALLA'?'color:#d50000;font-weight:700':''}">· ${p.e[0]}${p.e[1]!==null?' · holgura '+p.e[1]+' mm':''}${p.e[0]!=='PASA'&&p.e[2]?' · '+p.e[2]:''}</span></li>`).join('')+'</ul>'}
const ray=new THREE.Raycaster(),mp=new THREE.Vector2();let down=null;
ren.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
ren.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;const r=ren.domElement.getBoundingClientRect();
 mp.x=(e.clientX-r.left)/r.width*2-1;mp.y=-(e.clientY-r.top)/r.height*2+1;ray.setFromCamera(mp,cam);const hit=ray.intersectObjects(cajones,true)[0];
 if(hit){let o=hit.object;while(o&&!cajones.includes(o))o=o.parent;if(o)toggle(o)}});
function loop(){requestAnimationFrame(loop);cajones.forEach(t=>{const obj=t.userData.obj||0;t.position.z+=(obj-t.position.z)*0.15});ctl.update();ren.render(esc,cam)}
function tam(){W=cont.clientWidth;H=cont.clientHeight||420;ren.setSize(W,H);cam.aspect=W/H;cam.updateProjectionMatrix()}addEventListener('resize',tam);
const sel=document.getElementById('mod');Object.keys(D).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=NOM[k];sel.appendChild(o)});
document.getElementById('ley').innerHTML='Colores: '+Object.entries(FAM).map(([k,v])=>`<span style="display:inline-block;width:10px;height:10px;background:${v};border-radius:2px"></span> ${k.replace('_',' ')}`).join(' · ');
sel.onchange=()=>{try{localStorage.setItem('fts3d_mod',sel.value)}catch(e){};construir(sel.value)};
let ini='BASE';try{ini=localStorage.getItem('fts3d_mod')||'BASE'}catch(e){};sel.value=ini;construir(ini);tam();loop();
</script></body></html>"""
html = html.replace('__DATA__', json.dumps(mods, ensure_ascii=False)).replace('__NOM__', json.dumps(NOMBRE)).replace('__FAM__', json.dumps(FAM))
open(os.path.join(BASE, 'vista_3d_carrito.html'), 'w', encoding='utf-8').write(html)
print('ok', len(html) // 1024, 'KB', {m: len(v['cajas']) for m, v in mods.items()})
