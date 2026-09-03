// ═══ Fuente del workflow n8n `auth/comercial-login` ═══
//
// Emisor de identidad POR PERSONA del módulo comercial (issue #140 alcance A).
//
// REUTILIZA el criptostack de `auth/finanzas-login` (ykNzGCvdjzjdXYhc), leído
// de la instancia, no reconstruido: SHA-256 FIPS 180-4 + HMAC + PBKDF2-100k +
// comparación en tiempo constante + base64url, todo en JS puro porque el
// sandbox de Code no expone require/crypto/process/$env (CLAUDE.md §15 #1).
// Los secretos llegan por un nodo Set que sí resuelve `$env`.
//
// QUÉ CAMBIA respecto de Finanzas:
//   1. Multi-usuario. Finanzas tiene `user==='finanzas'` fijo; aquí la lista
//      viene de una env var, así que agregar a alguien NO edita el workflow.
//   2. El token nace con su forma FINAL (ROADMAP §5.2): sub = persona,
//      roles = lista por módulo, dndole = valor exacto del selection de Odoo.
//      Mata el `sub:'finanzas'` que mandaba el 100% de los leads al fallback.
//   3. Lockout POR USUARIO. El de Finanzas es global: cinco intentos fallidos
//      de cualquiera dejaban fuera a todos. Con 5 personas eso es una negación
//      de servicio trivial de provocar.
//
// Variables de entorno de Railway (NUNCA en el repo):
//   COMERCIAL_JWT_SECRET  — secreto de firma, propio, NO el de Finanzas
//   COMERCIAL_USERS       — JSON array:
//     [{"u":"aldo","salt":"<hex>","hash":"<hex>",
//       "roles":["comercial:vendedor"],"dndole":"Aldo Mendez"}, ...]
//   El salt/hash se generan con comercial/scripts/generar-hash.js en la
//   laptop; el password en claro nunca toca chat, repo ni logs.

'use strict';

const TTL_SEGUNDOS = 28800; // 8 h — ver nota de contrato en el reporte de #140

const jsLogin = `
// ── Criptografía: copiada VERBATIM de auth/finanzas-login (ykNzGCvdjzjdXYhc) ──
const _K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function _rotr(x,n){return((x>>>n)|(x<<(32-n)))>>>0;}
function _sha256(bytes){const len=bytes.length;const bitLen=len*8;const padLen=((len+9+63)>>>6)<<6;const p=new Uint8Array(padLen);p.set(bytes);p[len]=0x80;p[padLen-4]=(bitLen>>>24)&0xff;p[padLen-3]=(bitLen>>>16)&0xff;p[padLen-2]=(bitLen>>>8)&0xff;p[padLen-1]=bitLen&0xff;const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];const W=new Array(64);for(let off=0;off<padLen;off+=64){for(let i=0;i<16;i++)W[i]=((p[off+i*4]<<24)|(p[off+i*4+1]<<16)|(p[off+i*4+2]<<8)|p[off+i*4+3])>>>0;for(let i=16;i<64;i++){const s0=_rotr(W[i-15],7)^_rotr(W[i-15],18)^(W[i-15]>>>3);const s1=_rotr(W[i-2],17)^_rotr(W[i-2],19)^(W[i-2]>>>10);W[i]=(W[i-16]+s0+W[i-7]+s1)>>>0;}let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];for(let i=0;i<64;i++){const S1=_rotr(e,6)^_rotr(e,11)^_rotr(e,25);const ch=(e&f)^((~e)&g);const t1=(h+S1+ch+_K[i]+W[i])>>>0;const S0=_rotr(a,2)^_rotr(a,13)^_rotr(a,22);const mj=(a&b)^(a&c)^(b&c);const t2=(S0+mj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;}const out=new Uint8Array(32);for(let i=0;i<8;i++){out[i*4]=(H[i]>>>24)&0xff;out[i*4+1]=(H[i]>>>16)&0xff;out[i*4+2]=(H[i]>>>8)&0xff;out[i*4+3]=H[i]&0xff;}return out;}
function _hmac(keyBytes,msgBytes){const bs=64;let key=keyBytes;if(key.length>bs)key=_sha256(key);if(key.length<bs){const pk=new Uint8Array(bs);pk.set(key);key=pk;}const ipad=new Uint8Array(bs),opad=new Uint8Array(bs);for(let i=0;i<bs;i++){ipad[i]=key[i]^0x36;opad[i]=key[i]^0x5c;}const inner=new Uint8Array(bs+msgBytes.length);inner.set(ipad);inner.set(msgBytes,bs);const ih=_sha256(inner);const outer=new Uint8Array(bs+32);outer.set(opad);outer.set(ih,bs);return _sha256(outer);}
function _pbkdf2(passBytes,saltBytes,iter){const blk=new Uint8Array(saltBytes.length+4);blk.set(saltBytes);blk[saltBytes.length+3]=1;let u=_hmac(passBytes,blk);const t=new Uint8Array(u);for(let i=1;i<iter;i++){u=_hmac(passBytes,u);for(let j=0;j<32;j++)t[j]^=u[j];}return t;}
function _hexToBytes(hex){if(typeof hex!=='string'||hex.length%2!==0)return null;const o=new Uint8Array(hex.length/2);for(let i=0;i<hex.length;i+=2){const b=parseInt(hex.substr(i,2),16);if(isNaN(b))return null;o[i/2]=b;}return o;}
function _bytesToHex(b){let s='';for(let i=0;i<b.length;i++){const h=b[i].toString(16);s+=(h.length===1?'0':'')+h;}return s;}
function _ctEq(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0;}
const _B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function _b64url(bytes){let o='';for(let i=0;i<bytes.length;i+=3){const b0=bytes[i],b1=i+1<bytes.length?bytes[i+1]:0,b2=i+2<bytes.length?bytes[i+2]:0;o+=_B64[b0>>2];o+=_B64[((b0&3)<<4)|(b1>>4)];if(i+1<bytes.length)o+=_B64[((b1&15)<<2)|(b2>>6)];if(i+2<bytes.length)o+=_B64[b2&63];}return o;}
const enc=new TextEncoder();

// Self-test contra el vector RFC. Si la implementación se corrompió, no se
// firma nada: mejor caer que emitir tokens con una firma equivocada.
const _t=_bytesToHex(_hmac(enc.encode('key'),enc.encode('The quick brown fox jumps over the lazy dog')));
if(_t!=='f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8'){
  return [{json:{_error:true,code:'INTERNAL_HASH_BROKEN',http:500,msg:'self-test fallo'}}];
}

// ── Secretos (del nodo Set, que sí resuelve $env) ──
const sec=$input.first().json;
const JWT_SECRET=String(sec.secret||'');
let USERS=[];
try{ USERS=JSON.parse(String(sec.users||'[]')); }catch(e){ USERS=null; }
if(!JWT_SECRET||!Array.isArray(USERS)||USERS.length===0){
  return [{json:{_error:true,code:'SERVER_MISCONFIG',http:500,msg:'Secretos no configurados'}}];
}

const wh=$('Webhook').first().json;
const body=(wh&&wh.body)||wh||{};
const user=String(body.user||'').trim().toLowerCase();
const password=String(body.password||'');

// ── Lockout POR USUARIO ──
// El de Finanzas es global; con 5 personas, cinco intentos fallidos de
// cualquiera dejarían fuera a todo el equipo.
let sd=null; try{ sd=$getWorkflowStaticData('global'); }catch(e){ sd=null; }
const nowMs=Date.now();
const LOCK_MAX=5, LOCK_MS=15*60*1000;
const clave=user||'(vacio)';
if(sd){
  sd.auth=sd.auth||{};
  const st=sd.auth[clave];
  if(st&&st.lockedUntil&&st.lockedUntil>nowMs){
    return [{json:{_error:true,code:'LOCKED',http:429,
      msg:'Demasiados intentos fallidos. Intenta mas tarde.',
      retry_after_s:Math.ceil((st.lockedUntil-nowMs)/1000)}}];
  }
}
function _fail(){
  if(sd){
    const st=sd.auth[clave]||{fails:0,lockedUntil:0};
    st.fails=(st.fails||0)+1;
    if(st.fails>=LOCK_MAX){ st.lockedUntil=nowMs+LOCK_MS; st.fails=0; }
    sd.auth[clave]=st;
  }
  // Mismo error para usuario inexistente y password incorrecto: no se filtra
  // quién existe.
  return [{json:{_error:true,code:'AUTH_FAILED',http:401,msg:'Usuario o contrasena incorrectos'}}];
}
if(!user||!password) return _fail();

const perfil=USERS.find(u=>String(u&&u.u||'').trim().toLowerCase()===user);

// Verificar SIEMPRE, exista o no el usuario, contra un salt/hash señuelo del
// mismo tamaño: si solo se hiciera PBKDF2 cuando el usuario existe, el tiempo
// de respuesta diría quién está dado de alta.
const saltHex = perfil ? String(perfil.salt||'') : '00'.repeat(16);
const hashHex = perfil ? String(perfil.hash||'') : '00'.repeat(32);
const saltBytes=_hexToBytes(saltHex);
const storedHash=_hexToBytes(hashHex);
if(!saltBytes||!storedHash){
  return [{json:{_error:true,code:'SERVER_MISCONFIG',http:500,msg:'Salt/hash invalidos'}}];
}
const dk=_pbkdf2(enc.encode(password),saltBytes,100000);
if(!perfil||!_ctEq(dk,storedHash)) return _fail();

if(sd&&sd.auth) delete sd.auth[clave];

// ── Token con su forma FINAL (ROADMAP §5.2) ──
const nowS=Math.floor(nowMs/1000);
const exp=nowS+${TTL_SEGUNDOS};
const roles=Array.isArray(perfil.roles)?perfil.roles:[];
const dndole=(perfil.dndole===undefined||perfil.dndole===null)?null:String(perfil.dndole);
const header=_b64url(enc.encode(JSON.stringify({alg:'HS256',typ:'JWT'})));
const payload=_b64url(enc.encode(JSON.stringify({
  sub: perfil.u,        // la PERSONA, nunca un usuario genérico
  roles: roles,         // "<modulo>:<rol>", lista
  dndole: dndole,       // valor EXACTO del selection de Odoo, o null
  app: 'comercial',
  ver: 1,
  iat: nowS,
  exp: exp
})));
const signingInput=header+'.'+payload;
const sig=_b64url(_hmac(enc.encode(JWT_SECRET),enc.encode(signingInput)));
return [{json:{
  token: signingInput+'.'+sig,
  expires_at: new Date(exp*1000).toISOString(),
  token_type: 'Bearer',
  expires_in: ${TTL_SEGUNDOS},
  sub: perfil.u, roles: roles, dndole: dndole
}}];
`;

module.exports = { TTL_SEGUNDOS, jsLogin };
