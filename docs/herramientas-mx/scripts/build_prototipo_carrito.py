"""Fase 4 · prototipo_carrito.html autocontenido: navegar el carrito cajon por cajon (datos + SVG embebidos)."""
import json, os
BASE = os.path.join(os.path.dirname(__file__), '..')
d = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
svgs = {}
for f in os.listdir(os.path.join(BASE, 'svg')):
    svgs[f[:-4]] = open(os.path.join(BASE, 'svg', f), encoding='utf-8').read()
NOMBRES = {'BASE': 'Carrito base', 'ELE': 'Módulo eléctrico', 'SOL': 'Módulo soldadura y metalmecánica',
           'TUB': 'Módulo tubería', 'CIV': 'Módulo obra civil y perforación', 'MED': 'Módulo medición e izaje'}
html = r'''<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Carrito FTS</title>
<style>
:root{--bg:#f6f6f4;--card:#fff;--ink:#1d1d1d;--mut:#666;--acc:#b71c1c;--line:#ddd;--box:#c62828;--box2:#8e1b1b}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--card:#1f1f1f;--ink:#eee;--mut:#aaa;--line:#333}}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,Segoe UI,Arial,sans-serif;background:var(--bg);color:var(--ink)}
header{padding:14px 16px;border-bottom:1px solid var(--line);background:var(--card)}h1{font-size:18px;margin:0}
.sub{color:var(--mut);font-size:13px;margin-top:4px}
.warn{background:#fff3cd;color:#664d03;padding:8px 12px;font-size:13px;border-radius:6px;margin:10px 16px}
.wrap{display:grid;grid-template-columns:260px 1fr;gap:16px;padding:0 16px 24px}
@media (max-width:760px){.wrap{grid-template-columns:minmax(0,1fr)}}
.wrap>div,.panel,.pila{min-width:0}html,body{overflow-x:hidden}
.tabs{display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px}
.tab{border:1px solid var(--line);background:var(--card);color:var(--ink);padding:7px 10px;border-radius:18px;cursor:pointer;font-size:13px}
.tab.on{background:var(--acc);color:#fff;border-color:var(--acc)}
.pila{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}
.caja{border:2px solid var(--box2);border-radius:6px;margin:6px 0;background:#2a2a2a;padding:4px}
.caja .lbl{color:#fff;font-size:11px;padding:2px 4px}
.cajon{display:block;width:100%;text-align:left;border:0;margin:3px 0;padding:6px 8px;background:var(--box);color:#fff;border-radius:4px;cursor:pointer;font-size:12px}
.cajon.vacio{background:#555}.cajon.on{outline:3px solid #ffd54f}
.ruedas{display:flex;justify-content:space-between;padding:0 16px}.ruedas span{width:26px;height:26px;border-radius:50%;background:#333;border:3px solid #777}
.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;overflow:auto}
.panel svg{width:100%;max-width:760px;height:auto;background:#fff;border-radius:6px}
table{border-collapse:collapse;width:100%;font-size:12.5px;margin-top:10px}td,th{border-bottom:1px solid var(--line);padding:5px;text-align:left;vertical-align:top}
.k{display:flex;gap:10px 14px;flex-wrap:wrap;font-size:13px;margin:6px 0}.k b{font-size:16px}
.tag{font-size:11px;padding:1px 6px;border-radius:8px;background:#eee;color:#333}
</style></head><body>
<header><h1>Carrito FTS · prototipo de acomodo</h1>
<div class="sub">Proyecto Herramientas MX · issue #325 · estrategia ganadora: <b id="est"></b> · 1 unidad del dibujo = 1 mm</div></header>
<div class="warn">⚠️ Medidas no validadas: salen de fragmentos de buscador o de estimación. Nada se imprime ni se compra hasta medir con vernier (Fase 7).</div>
<div class="tabs" id="tabs"></div>
<div class="wrap"><div><div class="pila" id="pila"></div></div><div class="panel" id="panel"></div></div>
<script>
const D = __DATA__, S = __SVGS__, N = __NOMBRES__, CODE={BASE:'BAS',ELE:'ELE',SOL:'SOL',TUB:'TUB',CIV:'CIV',MED:'MED'};
document.getElementById('est').textContent = D.ganadora;
let mod = 'BASE', cj = (location.hash.match(/C(\d+)/)||[])[1]*1||null;
function tabs(){const t=document.getElementById('tabs');t.innerHTML='';for(const m of Object.keys(D.modulos)){const b=document.createElement('button');b.className='tab'+(m===mod?' on':'');b.textContent=N[m]||m;b.onclick=()=>{mod=m;cj=null;render()};t.appendChild(b)}}
function render(){tabs();const M=D.modulos[mod],p=document.getElementById('pila');const mt=M.metricas;
p.innerHTML=`<div class="k"><span>Cajas de cajones<br><b>${mt.cajas}</b></span><span>Alto de la pila<br><b>${mt.alto_mm} mm</b></span><span>Peso<br><b>${mt.peso_kg} kg</b></span><span>Ocupación media<br><b>${mt.ocupacion_media}%</b></span></div>`;
for(const c of M.cajas){const d=document.createElement('div');d.className='caja';d.innerHTML=`<div class="lbl">${c.modelo}</div>`;
 for(const k of c.cajones){const b=document.createElement('button');b.className='cajon'+(k.piezas.length?'':' vacio')+(cj===k.n?' on':'');
  b.textContent=`C${k.n} · alto ${k.alto} mm · ${k.piezas.length} piezas · ${k.ocupacion}%`;b.onclick=()=>{cj=k.n;render()};d.appendChild(b)}
 p.appendChild(d)}
if(M.cajas.some(c=>c.modelo==='48-22-8420')){const r=document.createElement('div');r.className='ruedas';r.innerHTML='<span></span><span></span>';p.appendChild(r)}
const pn=document.getElementById('panel');
if(cj===null){pn.innerHTML=`<h2 style="margin-top:0">${N[mod]}</h2><p>Toca un cajón de la pila para ver su vista superior y el número de activo de cada pieza.</p>
 <p class="sub">Pila de abajo hacia arriba: ${mt.modelos.join(' → ')}. Centro de gravedad a ${mt.centro_gravedad_mm} mm del piso.</p>`+(mod==='BASE'?sueltos():'');return}
let K=null;for(const c of M.cajas)for(const k of c.cajones)if(k.n===cj)K=k;
const key=CODE[mod]+'-C'+cj;
pn.innerHTML=`<h2 style="margin-top:0">${N[mod]} · cajón C${cj}</h2><div class="k"><span>Alto útil<br><b>${K.alto_util} mm</b></span><span>Ocupación<br><b>${K.ocupacion}%</b></span><span>Peso<br><b>${K.peso_kg} / ${K.cap_kg} kg</b></span></div>`+
 (S[key]||'<p>Cajón vacío: reserva para crecer.</p>')+
 `<div style="overflow-x:auto"><table><tr><th>Activo</th><th>Pieza</th><th>L×A×H mm</th><th>kg</th><th>Uso</th><th>Fuente</th></tr>`+
 K.piezas.map(q=>`<tr><td><b>${q.activo}</b></td><td>${q.corto}<br><span class="tag">${q.ref}</span></td><td>${q.L}×${q.A}×${q.H}${q.rot?' (rotada)':''}</td><td>${q.peso_kg}</td><td>${q.frec}</td><td>${q.fuente_dim}</td></tr>`).join('')+'</table></div>'}
function sueltos(){return '<h3>Piezas que no van en cajón</h3><table><tr><th>Pieza</th><th>Dónde</th></tr>'+D.sueltos.map(s=>`<tr><td>${s.desc}</td><td>${s.suelto}</td></tr>`).join('')+'</table>'}
render();
</script></body></html>'''
html = html.replace('__DATA__', json.dumps(d, ensure_ascii=False)).replace('__SVGS__', json.dumps(svgs, ensure_ascii=False)).replace('__NOMBRES__', json.dumps(NOMBRES, ensure_ascii=False))
open(os.path.join(BASE, 'prototipo_carrito.html'), 'w', encoding='utf-8').write(html)
print(len(html))
