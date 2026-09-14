const fs=require('fs');
const REPO='/home/user/fts-suite';
const snap = d => JSON.parse(fs.readFileSync(REPO+'/shared/operaciones/semaforo_snapshots/'+d+'.json','utf8'));
const cfg  = JSON.parse(fs.readFileSync(REPO+'/shared/operaciones/sla_stages.json','utf8'));

const tramo = d => { if(d==null) return '?'; if(d===0) return '0'; if(d<=5) return '1-5'; if(d<=15) return '6-15'; if(d<=30) return '16-30'; return '>30'; };
// El snapshot no guarda estos tres; se reconstruyen igual que en Code - MAIN.
// fuente_a='create_date' en el 100% de las filas es el estado REAL de hoy (msg94 vacio).
const hydrate = r => Object.assign({}, r, {
  color_a_rep: r.color_a, tramo_a: tramo(r.dias_en_stage),
  fuente_a: 'create_date', project_date: null,
  banderas: (r.banderas||[]).filter(f => f.tipo !== 'ap_sin_confirmacion'),
  cliente: String(r.cliente||'').split(',')[0]
});
const firmaDe = r => r.color_a_rep+'|'+r.tramo_a+'|'+(r.sin_avance?'sa':'-');
const enLista = r => r.color_a_rep!=='verde' || r.sin_avance || (r.banderas||[]).length>0;

function correr({ hoyD, prevD, modo_prueba, execMode, wdiagFake }){
  const rows = snap(hoyD).proyectos.map(hydrate);
  const prev = snap(prevD).proyectos.map(hydrate);
  const prevA={}, nombres={}, grupos={};
  for(const r of prev) if(enLista(r)){ prevA[r.id]=firmaDe(r); nombres[r.id]=r.name; grupos[r.id]=r.grupo; }
  // eventos de bandera ya reportados: los del snapshot previo
  const prevEv={};
  for(const r of prev) for(const f of (r.banderas||[])) prevEv[r.id+'|'+(f.ev||f.tipo)] = prevD;

  const sd = { s1_prevA:prevA, s1_prevEv:prevEv, s1_nombres:nombres, s1_grupos:grupos, s1_diagFirma:'', history:[] };
  const C = JSON.parse(JSON.stringify(cfg)); C.config.modo_prueba = !!modo_prueba;

  const NODOS = {
    'Code - MAIN': rows.map(r=>({json:r})),
    'Set - hoy': [{json:{hoy: hoyD+'T14:00:00.000Z'}}],
    'HTTP - load config': [{json:C}],
    'Code - buildLogNotes': rows.filter(r=>(r.banderas||[]).length).map(r=>({json:{res_id:r.id}})),
    'Odoo - CREATE log note': (wdiagFake
        ? [{json:{error:"Record does not exist or has been deleted.\n(Record: res.partner('3',), User: 2)"}}]
        : rows.filter(r=>(r.banderas||[]).length).map((r,i)=>({json:{id:2944935+i}}))),
    'HTTP - PUT snapshot (GitHub)': [{json:{content:{sha:'3427dadb75f56247080dc2b1856e921790b5d312'}}}]
  };
  const $ = n => { if(!NODOS[n]) { const e=new Error('no node '+n); throw e; }
                   return { all:()=>NODOS[n], first:()=>NODOS[n][0], item:{json:NODOS[n][0]&&NODOS[n][0].json} }; };
  const code = fs.readFileSync('nuevo-buildEmail.js','utf8');
  const fn = new Function('$','$getWorkflowStaticData','$execution','Buffer', code);
  return fn($, ()=>sd, {mode:execMode||'production'}, Buffer);
}
module.exports = { correr };
if (require.main === module){
  const casos = [
    ["lunes-delta", {hoyD:"2026-09-07", prevD:"2026-09-04"}],   // 7-sep = LUNES, con movimiento
    ["diario",      {hoyD:"2026-09-08", prevD:"2026-09-07"}],   // 8-sep = martes, delta puro
    ["lunes-quieto",{hoyD:"2026-09-07", prevD:"2026-09-07"}],   // lunes SIN cambios
    ["quieto",      {hoyD:"2026-09-09", prevD:"2026-09-09"}],   // miercoles sin cambios -> no debe salir
    ["escritura",   {hoyD:"2026-09-08", prevD:"2026-09-07", wdiagFake:true}],
    ["manual",      {hoyD:"2026-09-08", prevD:"2026-09-07", execMode:"test"}]
  ];
  for(const [nom,args] of casos){
    let out;
    try { out = correr(args); } catch(e){ console.log(nom.padEnd(11)+' EXCEPCION: '+e.message); continue; }
    console.log(nom.padEnd(11)+' correos:'+out.length+
      out.map(o=>'  | to='+o.json.message.toRecipients.map(t=>t.emailAddress.address).join(',')+
                  '  subj='+o.json.message.subject).join(''));
    out.forEach((o,i)=>fs.writeFileSync('out-'+nom+(i?'-'+i:'')+'.html', o.json.message.body.content));
  }
}
