const fs=require('fs'), crypto=require('crypto');
const SECRETO='x'.repeat(48);   // secreto DE PRUEBA, jamas el real
const b64u=b=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function jwt(p,sec){const h=b64u(JSON.stringify({alg:'HS256',typ:'JWT'})),pl=b64u(JSON.stringify(p));
 const s=crypto.createHmac('sha256',sec).update(h+'.'+pl).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 return h+'.'+pl+'.'+s;}
const src=fs.readFileSync(__dirname+'/Code-verificar-scope.js','utf8');
const t=Math.floor(Date.now()/1000);
function correr(cuerpo,secreto){
 global.$input={first:()=>({json:cuerpo})};
 global.$=(n)=>{ if(n==='Set - secreto') return {item:{json:{secret:secreto}}}; throw new Error('nodo '+n); };
 return new Function('return (function(){'+src+'})()')()[0].json;
}
const ok=(scopes,scope)=>({token:jwt({sub:'esteban',nombre:'Esteban',scopes,exp:t+600},SECRETO),scope});
const casos=[
 ['token bueno, scope pedido OK', ok(['semaforo:read'],'semaforo:read'),            SECRETO, r=>r.ok===true&&r.actor==='esteban'],
 ['MISMO sub-workflow, otro panel', ok(['rentabilidad:read'],'rentabilidad:read'),  SECRETO, r=>r.ok===true],
 ['tiene un scope, pide OTRO',     ok(['rentabilidad:read'],'semaforo:read'),       SECRETO, r=>r.error==='SCOPE_INSUFICIENTE'&&r.clase==='sesion'],
 ['el llamador NO pide scope',     {token:jwt({sub:'x',scopes:['semaforo:read'],exp:t+600},SECRETO)}, SECRETO, r=>r.error==='SCOPE_NO_PEDIDO'],
 ['scope vacio',                   ok(['semaforo:read'],'   '),                     SECRETO, r=>r.error==='SCOPE_NO_PEDIDO'],
 ['token SIN scopes (legacy)',     {token:jwt({sub:'x',exp:t+600},SECRETO),scope:'semaforo:read'}, SECRETO, r=>r.error==='SCOPE_INSUFICIENTE'],
 ['token de Finanzas viejo',       ok(['finanzas:read','finanzas:write'],'semaforo:read'), SECRETO, r=>r.error==='SCOPE_INSUFICIENTE'],
 ['FORJADO: firma de otro secreto',{token:jwt({sub:'x',scopes:['semaforo:read'],exp:t+600},'y'.repeat(48)),scope:'semaforo:read'}, SECRETO, r=>r.error==='FIRMA_INVALIDA'],
 ['FORJADO: payload manipulado',   {token:(()=>{const p=jwt({sub:'x',scopes:[],exp:t+600},SECRETO).split('.');
                                     p[1]=b64u(JSON.stringify({sub:'x',scopes:['semaforo:read'],exp:t+600}));return p.join('.');})(),scope:'semaforo:read'}, SECRETO, r=>r.error==='FIRMA_INVALIDA'],
 ['FORJADO: alg none',             {token:(()=>{const h=b64u(JSON.stringify({alg:'none',typ:'JWT'}));
                                     return h+'.'+b64u(JSON.stringify({sub:'x',scopes:['semaforo:read'],exp:t+600}))+'.';})(),scope:'semaforo:read'}, SECRETO, r=>r.ok===false],
 ['expirado',                      ok(['semaforo:read'],'semaforo:read'),           SECRETO, null],  // se sustituye abajo
 ['malformado',                    {token:'abc',scope:'semaforo:read'},             SECRETO, r=>r.error==='TOKEN_MALFORMADO'],
 ['ausente',                       {scope:'semaforo:read'},                         SECRETO, r=>r.error==='TOKEN_AUSENTE'],
 ['sin secreto en el entorno',     ok(['semaforo:read'],'semaforo:read'),           '',      r=>r.error==='SECRETO_NO_CONFIGURADO'&&r.clase==='servidor'],
 ['NUNCA devuelve el secreto',     ok(['semaforo:read'],'semaforo:read'),           SECRETO, r=>JSON.stringify(r).indexOf(SECRETO)<0],
];
casos[10]=['expirado',{token:jwt({sub:'x',scopes:['semaforo:read'],exp:t-1},SECRETO),scope:'semaforo:read'},SECRETO,r=>r.error==='TOKEN_EXPIRADO'];
let n=0;
for(const [nom,c,s,f] of casos){ let r; try{r=correr(c,s);}catch(e){r={_lanzo:String(e.message)};}
 const p=(()=>{try{return f(r);}catch(e){return false;}})();
 if(p)n++; console.log((p?'  OK   ':'  FALLA').padEnd(9), nom.padEnd(32), JSON.stringify(r).slice(0,80)); }
console.log('\n*** '+n+'/'+casos.length+(n===casos.length?' en verde ***':' — HAY FALLAS ***'));
