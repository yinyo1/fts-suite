const fs=require('fs'), crypto=require('crypto');
const SECRETO='x'.repeat(48);   // secreto DE PRUEBA, no el real
const b64u=b=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function jwt(payload,sec){ const h=b64u(JSON.stringify({alg:'HS256',typ:'JWT'})), p=b64u(JSON.stringify(payload));
  const s=crypto.createHmac('sha256',sec).update(h+'.'+p).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return h+'.'+p+'.'+s; }
const src=fs.readFileSync('Code-Verificar-token.js','utf8');
const ahora=Math.floor(Date.now()/1000);
function correr(cuerpo, secreto){
  global.$input={first:()=>({json:{body:cuerpo}})};
  global.$=(n)=>{ if(n==='Set - secreto') return {item:{json:{secret:secreto}}}; throw new Error('nodo '+n); };
  return new Function('return (function(){'+src+'})()')()[0].json;
}
const casos=[
 ['valido con scope',            {token:jwt({sub:'esteban',nombre:'Esteban',scopes:['semaforo:read'],exp:ahora+600},SECRETO)}, SECRETO, r=>r.ok===true&&r.actor==='esteban'&&/^\d{4}-\d\d-\d\d$/.test(r.hoy)],
 ['scope de OTRO panel',         {token:jwt({sub:'x',scopes:['rentabilidad:read'],exp:ahora+600},SECRETO)},                    SECRETO, r=>r.ok===false&&r.error==='SCOPE_INSUFICIENTE'&&r.clase==='sesion'],
 ['SIN scopes (fallback legacy)',{token:jwt({sub:'x',exp:ahora+600},SECRETO)},                                                SECRETO, r=>r.ok===false&&r.error==='SCOPE_INSUFICIENTE'],
 ['scopes de Finanzas viejo',    {token:jwt({sub:'x',scopes:['finanzas:read','finanzas:write'],exp:ahora+600},SECRETO)},       SECRETO, r=>r.ok===false&&r.error==='SCOPE_INSUFICIENTE'],
 ['expirado',                    {token:jwt({sub:'x',scopes:['semaforo:read'],exp:ahora-1},SECRETO)},                          SECRETO, r=>r.error==='TOKEN_EXPIRADO'],
 ['firmado con otro secreto',    {token:jwt({sub:'x',scopes:['semaforo:read'],exp:ahora+600},'y'.repeat(48))},                 SECRETO, r=>r.error==='FIRMA_INVALIDA'],
 ['payload manipulado',          {token:(()=>{const t=jwt({sub:'x',scopes:[],exp:ahora+600},SECRETO).split('.');
                                   t[1]=b64u(JSON.stringify({sub:'x',scopes:['semaforo:read'],exp:ahora+600})); return t.join('.');})()}, SECRETO, r=>r.error==='FIRMA_INVALIDA'],
 ['malformado',                  {token:'abc'},                                                                               SECRETO, r=>r.error==='TOKEN_MALFORMADO'],
 ['ausente',                     {},                                                                                          SECRETO, r=>r.error==='TOKEN_AUSENTE'],
 ['sin secreto en el entorno',   {token:jwt({sub:'x',scopes:['semaforo:read'],exp:ahora+600},SECRETO)},                        '',      r=>r.error==='SECRETO_NO_CONFIGURADO'&&r.clase==='servidor'],
 ['NUNCA devuelve el secreto',   {token:jwt({sub:'x',scopes:['semaforo:read'],exp:ahora+600},SECRETO)},                        SECRETO, r=>JSON.stringify(r).indexOf(SECRETO)<0],
];
let ok=0;
for(const [n,c,s,f] of casos){ let r; try{ r=correr(c,s); }catch(e){ r={_lanzo:String(e.message)}; }
  const p=(()=>{try{return f(r);}catch(e){return false;}})();
  if(p)ok++; console.log((p?'  OK   ':'  FALLA').padEnd(9), n.padEnd(30), JSON.stringify(r).slice(0,90)); }
console.log('\n*** '+ok+'/'+casos.length+(ok===casos.length?' en verde ***':' — HAY FALLAS ***'));
