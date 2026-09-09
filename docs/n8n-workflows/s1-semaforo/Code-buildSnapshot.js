// -- Code - buildSnapshot - S1 (2026-09-09, issue #220) ------------------------
// El snapshot se PUBLICA a un repo PUBLICO (yinyo1/fts-suite sirve Pages), asi que
// aqui es donde se decide que sale. Tres cambios respecto de la version previa:
//
//   1. REDACCION DE `cliente` EN ORIGEN (regla transversal CLAUDE.md sec.20 #7: datos personales
//      nunca a repo publico). El campo viene de partner_id[1] de Odoo y en varios
//      partners trae "<RAZON SOCIAL>, <NOMBRE DE LA PERSONA DE CONTACTO>". Se corta
//      en la PRIMERA coma: queda la razon social, se va el nombre. Es un corte
//      conservador -una razon social del tipo "ACME, S.A. de C.V." pierde el sufijo-
//      y ese es el lado correcto en el que fallar.
//      RIESGO ACEPTADO CONSCIENTEMENTE: los 8 nombres que YA estan en los snapshots
//      historicos del repo NO se limpian. Borrarlos del archivo no los borra del
//      historial de git, asi que esto NO queda resuelto, queda asumido.
//   2. `_diag` SUBE al nivel del snapshot. Code - MAIN lo adjunta a CADA fila (el
//      mismo array repetido 35 veces); aqui se guarda una sola vez.
//   3. Se quitan de cada fila los campos internos del correo (`_diag`,
//      `_flagsNuevas`): son estado de render, no medicion.
//
// Lo que NO cambia: ningun umbral, ningun calculo, ninguna fila. El snapshot sigue
// siendo el registro completo de lo medido -por eso el digest de lunes puede
// reconstruirse desde aqui-.
const hoy = ($('Set - hoy').first().json.hoy||'').slice(0,10);
const raw = $('Code - MAIN').all().map(i=>i.json);
const soloDiag = raw.length===1 && raw[0]._solo_diag;
const diag = (raw[0] && raw[0]._diag) ? raw[0]._diag : [];
const rows = soloDiag ? [] : raw;

function redactCliente(v){
  const s = String(v==null ? '' : v);
  const i = s.indexOf(',');
  return (i > 0 ? s.slice(0, i) : s).trim();
}
const proyectos = rows.map(function(r){
  const o = {};
  for(const k of Object.keys(r)){
    if(k === '_diag' || k === '_flagsNuevas') continue;
    o[k] = r[k];
  }
  o.cliente = redactCliente(r.cliente);
  return o;
});

const snap = {
  fecha: hoy,
  total: proyectos.length,
  por_color: proyectos.reduce(function(a,r){ a[r.color]=(a[r.color]||0)+1; return a; },{}),
  _redaccion: 'campo cliente cortado en la primera coma (repo publico)',
  _diag: diag,
  proyectos: proyectos
};
const content = Buffer.from(JSON.stringify(snap,null,2)).toString('base64');
return [{ json:{ fecha:hoy, message:'chore(semaforo): snapshot '+hoy, content } }];
