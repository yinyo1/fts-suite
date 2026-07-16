// Verifica que las DOS implementaciones de HMAC-SHA256 que se tienen que poner de acuerdo
// produzcan el mismo byte:
//   A) la del navegador  -> Web Crypto (crypto.subtle), en comercial/js/comercial-client.js
//   B) la de n8n         -> JS puro, en el nodo "Validar JWT + HMAC" de comercial/captura
//      (el sandbox del Code node no expone require/node:crypto -- CLAUDE.md §15 #1)
//
// Si estas dos divergen, la captura falla SIEMPRE con BAD_SIGNATURE y el sintoma no dice
// por que. Aqui se usa el crypto de node como proxy fiel de Web Crypto: ambos son
// HMAC-SHA256 sobre los mismos bytes UTF-8, asi que si el JS puro casa con node, casa con
// el navegador.
const nodeCrypto = require('crypto');

// ─── B) Implementacion JS puro, copiada VERBATIM del nodo "Validar JWT + HMAC" ───
const _K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function _rotr(x,n){return((x>>>n)|(x<<(32-n)))>>>0;}
function _sha256(bytes){const len=bytes.length;const bitLen=len*8;const padLen=((len+9+63)>>>6)<<6;const p=new Uint8Array(padLen);p.set(bytes);p[len]=0x80;p[padLen-4]=(bitLen>>>24)&0xff;p[padLen-3]=(bitLen>>>16)&0xff;p[padLen-2]=(bitLen>>>8)&0xff;p[padLen-1]=bitLen&0xff;const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];const W=new Array(64);for(let off=0;off<padLen;off+=64){for(let i=0;i<16;i++)W[i]=((p[off+i*4]<<24)|(p[off+i*4+1]<<16)|(p[off+i*4+2]<<8)|p[off+i*4+3])>>>0;for(let i=16;i<64;i++){const s0=_rotr(W[i-15],7)^_rotr(W[i-15],18)^(W[i-15]>>>3);const s1=_rotr(W[i-2],17)^_rotr(W[i-2],19)^(W[i-2]>>>10);W[i]=(W[i-16]+s0+W[i-7]+s1)>>>0;}let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];for(let i=0;i<64;i++){const S1=_rotr(e,6)^_rotr(e,11)^_rotr(e,25);const ch=(e&f)^((~e)&g);const t1=(h+S1+ch+_K[i]+W[i])>>>0;const S0=_rotr(a,2)^_rotr(a,13)^_rotr(a,22);const mj=(a&b)^(a&c)^(b&c);const t2=(S0+mj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;}const out=new Uint8Array(32);for(let i=0;i<8;i++){out[i*4]=(H[i]>>>24)&0xff;out[i*4+1]=(H[i]>>>16)&0xff;out[i*4+2]=(H[i]>>>8)&0xff;out[i*4+3]=H[i]&0xff;}return out;}
function _hmac(keyBytes,msgBytes){const bs=64;let key=keyBytes;if(key.length>bs)key=_sha256(key);if(key.length<bs){const pk=new Uint8Array(bs);pk.set(key);key=pk;}const ipad=new Uint8Array(bs),opad=new Uint8Array(bs);for(let i=0;i<bs;i++){ipad[i]=key[i]^0x36;opad[i]=key[i]^0x5c;}const inner=new Uint8Array(bs+msgBytes.length);inner.set(ipad);inner.set(msgBytes,bs);const ih=_sha256(inner);const outer=new Uint8Array(bs+32);outer.set(opad);outer.set(ih,bs);return _sha256(outer);}
function _bytesToHex(b){let s='';for(let i=0;i<b.length;i++){const h=b[i].toString(16);s+=(h.length===1?'0':'')+h;}return s;}
const enc = new TextEncoder();
const hmacPuro = (secret, msg) => _bytesToHex(_hmac(enc.encode(secret), enc.encode(msg)));

// ─── A) Proxy de Web Crypto ───
const hmacNode = (secret, msg) => nodeCrypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(Buffer.from(msg, 'utf8')).digest('hex');

// ─── Cadena canonica: DEBE ser identica en cliente y workflow ───
const canonical = p => ['v1', p.cliente || '', p.descripcion || '', p.rango || '', p.origen || '', p.ts || ''].join('|');

let ok = 0, fail = 0;
const t = (n, cond, det) => { if (cond) { ok++; console.log("  PASS  " + n); } else { fail++; console.log("  FAIL  " + n + (det ? "  -> " + det : "")); } };

console.log("\n=== TEST interop HMAC: navegador (Web Crypto) vs n8n (JS puro) ===\n");

// Vector RFC 4231 / el mismo self-test que corre dentro del workflow.
t("Self-test del workflow: vector conocido 'The quick brown fox...'",
  hmacPuro('key', 'The quick brown fox jumps over the lazy dog') === 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');

const SECRET = 'un-secreto-de-prueba-no-real-1234567890';

const casos = [
  { nombre: "payload tipico",
    p: { cliente: 'Nalco de Mexico', descripcion: 'Fabricacion de jaula para tanque', rango: '1M-3M', origen: 'cliente_existente', ts: '2026-07-16T22:00:00.000Z' } },
  { nombre: "acentos y enie (UTF-8 multibyte)",
    p: { cliente: 'Bridgestone México', descripcion: 'Instalación eléctrica del chiller, año 2026 — señalización', rango: '200K-1M', origen: 'referido', ts: '2026-07-16T22:00:00.000Z' } },
  { nombre: "rango con < y > (los que van en el <select>)",
    p: { cliente: 'ACME', descripcion: 'proyecto chico', rango: '<200K', origen: 'otro', ts: '2026-07-16T22:00:00.000Z' } },
  { nombre: "rango >5M",
    p: { cliente: 'ACME', descripcion: 'proyecto grande', rango: '>5M', origen: 'marketing', ts: '2026-07-16T22:00:00.000Z' } },
  { nombre: "comillas, backslash y pipe en el texto libre",
    p: { cliente: 'Cliente "raro" \\ S.A.', descripcion: 'falla en linea | urgente "ya"', rango: '3M-5M', origen: 'portal', ts: '2026-07-16T22:00:00.000Z' } },
  { nombre: "salto de linea en descripcion (textarea multilinea)",
    p: { cliente: 'ACME', descripcion: 'linea uno\nlinea dos\nlinea tres', rango: '<200K', origen: 'otro', ts: '2026-07-16T22:00:00.000Z' } },
  { nombre: "emoji (4 bytes UTF-8)",
    p: { cliente: 'ACME 🔧', descripcion: 'mantenimiento 🚀', rango: '<200K', origen: 'otro', ts: '2026-07-16T22:00:00.000Z' } },
  { nombre: "descripcion larga (>64 bytes: fuerza el camino de multi-bloque de SHA-256)",
    p: { cliente: 'ACME', descripcion: 'x'.repeat(500), rango: '1M-3M', origen: 'otro', ts: '2026-07-16T22:00:00.000Z' } }
];

for (const c of casos) {
  const msg = canonical(c.p);
  const a = hmacNode(SECRET, msg);
  const b = hmacPuro(SECRET, msg);
  t("Coinciden: " + c.nombre, a === b, "webcrypto=" + a.slice(0, 16) + "... puro=" + b.slice(0, 16) + "...");
}

// Un secreto mas largo que el block size (64B) fuerza la rama key=_sha256(key) del HMAC.
const SECRET_LARGO = 'z'.repeat(100);
t("Coinciden con secreto >64 bytes (rama de key hasheada)",
  hmacNode(SECRET_LARGO, canonical(casos[0].p)) === hmacPuro(SECRET_LARGO, canonical(casos[0].p)));

// Sanidad: la firma DEBE cambiar si cambia cualquier campo. Si no, el HMAC no ata nada.
const base = canonical(casos[0].p);
const alterado = canonical(Object.assign({}, casos[0].p, { rango: '>5M' }));
t("Cambiar un campo cambia la firma (el HMAC ata el payload)", hmacPuro(SECRET, base) !== hmacPuro(SECRET, alterado));
t("Cambiar el secreto cambia la firma", hmacPuro(SECRET, base) !== hmacPuro('otro-secreto', base));

console.log("\n" + ok + " pass / " + fail + " fail");
process.exit(fail ? 1 : 0);
