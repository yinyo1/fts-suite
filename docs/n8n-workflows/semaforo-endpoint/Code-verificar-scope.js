// ── SHA-256 + HMAC-SHA256 + verificacion JWT, JS PURO (sandbox n8n: sin require/crypto) ──
function sha256Bytes(bytes) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const ml = bytes.length * 8;
  const withPad = bytes.slice();
  withPad.push(0x80);
  while (withPad.length % 64 !== 56) withPad.push(0);
  for (let i = 7; i >= 0; i--) withPad.push((ml / Math.pow(2, i * 8)) & 0xff);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < withPad.length; i += 64) {
    const w = new Array(64);
    for (let j = 0; j < 16; j++) {
      w[j] = (withPad[i+j*4] << 24) | (withPad[i+j*4+1] << 16) | (withPad[i+j*4+2] << 8) | withPad[i+j*4+3];
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rr(w[j-15],7) ^ rr(w[j-15],18) ^ (w[j-15] >>> 3);
      const s1 = rr(w[j-2],17) ^ rr(w[j-2],19) ^ (w[j-2] >>> 10);
      w[j] = (w[j-16] + s0 + w[j-7] + s1) | 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let j = 0; j < 64; j++) {
      const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[j] + w[j]) | 0;
      const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    H = [(H[0]+a)|0,(H[1]+b)|0,(H[2]+c)|0,(H[3]+d)|0,(H[4]+e)|0,(H[5]+f)|0,(H[6]+g)|0,(H[7]+h)|0];
  }
  const out = [];
  for (const x of H) { out.push((x>>>24)&0xff,(x>>>16)&0xff,(x>>>8)&0xff,x&0xff); }
  return out;
}
function strBytes(s) { const o=[]; for (const ch of unescape(encodeURIComponent(s))) o.push(ch.charCodeAt(0)); return o; }
function hmacSha256(keyStr, msgStr) {
  let key = strBytes(keyStr);
  if (key.length > 64) key = sha256Bytes(key);
  while (key.length < 64) key.push(0);
  const ipad = key.map(b => b ^ 0x36), opad = key.map(b => b ^ 0x5c);
  return sha256Bytes(opad.concat(sha256Bytes(ipad.concat(strBytes(msgStr)))));
}
function b64urlFromBytes(bytes) {
  const A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out='';
  for (let i=0;i<bytes.length;i+=3){
    const b0=bytes[i],b1=bytes[i+1],b2=bytes[i+2];
    out+=A[b0>>2]; out+=A[((b0&3)<<4)|((b1===undefined?0:b1)>>4)];
    if(b1!==undefined){ out+=A[((b1&15)<<2)|((b2===undefined?0:b2)>>6)]; if(b2!==undefined) out+=A[b2&63]; }
  }
  return out;
}
function b64urlDecodeToStr(s) {
  const A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let bits='', out=[];
  for (const ch of s) { const idx=A.indexOf(ch); if(idx<0) continue; bits+=idx.toString(2).padStart(6,'0'); }
  for (let i=0;i+8<=bits.length;i+=8) out.push(parseInt(bits.slice(i,i+8),2));
  return decodeURIComponent(escape(String.fromCharCode.apply(null,out)));
}
// Comparacion en tiempo constante
function safeEq(a,b){ if(a.length!==b.length) return false; let d=0; for(let i=0;i<a.length;i++) d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0; }

/* ── auth/verificar-scope · el UNICO verificador de JWT del Suite ──────────
 * Sub-workflow. No tiene webhook propio: se llama con Execute Sub-workflow y
 * recibe { token, scope }. Devuelve { ok, error, clase, actor, nombre, scopes, hoy }.
 *
 * POR QUE EXISTE, y la razon de peso no es el tamano:
 * la misma cripto vivia CUATRO veces (comercial/clientes, fin/rentabilidad,
 * comercial/machotes-leer y el ops/semaforo que se iba a construir), y con ella
 * SUITE_JWT_SECRET se materializaba en un nodo Set en cada uno. Cada copia es una
 * superficie mas donde el secreto puede acabar en un payload de error -que es
 * exactamente lo que paso el 8-sep-2026 (ejecucion 90281) y costo una rotacion-.
 * Aqui el secreto vive en UN solo sitio.
 *
 * EL SCOPE VIAJA COMO DATO. Si estuviera hardcoded haria falta un sub-workflow
 * por panel, que es el problema otra vez. El llamador dice que exige; este nodo
 * no sabe nada de paneles.
 *
 * SIN el fallback de scopes de fase0, a proposito: ese concede
 * ['finanzas:read','finanzas:write'] a un token SIN scopes para no romper tokens
 * viejos de Finanzas. Heredarlo aqui lo abriria a TODOS los endpoints a la vez.
 * Sin scopes en el token, no hay acceso.
 *
 * TODO EL CUERPO VA EN try/catch. Este nodo cuelga de 'Set - secreto', o sea que
 * su ENTRADA es el secreto: si lanzara, n8n adjunta el input del nodo que fallo al
 * payload de error y ahi viaja en claro, incluso con el filtro de nodeNames puesto
 * (CLAUDE.md 9, regla dura del 8-sep). Un nodo que no lanza no produce ese payload.
 *
 * FALLA CERRADO: cualquier camino que no sea un token bueno con el scope pedido
 * devuelve ok:false. Y si este sub-workflow no responde, el llamador recibe un
 * objeto sin `ok` -> su IF lo lee como false -> deniega. */
function verifyJWT(token, secret, scopeRequerido) {
  if (typeof token !== 'string') return { ok:false, error:'TOKEN_AUSENTE' };
  const p = token.split('.');
  if (p.length !== 3) return { ok:false, error:'TOKEN_MALFORMADO' };
  const esperado = b64urlFromBytes(hmacSha256(secret, p[0] + '.' + p[1]));
  if (!safeEq(esperado, p[2])) return { ok:false, error:'FIRMA_INVALIDA' };
  let payload;
  try { payload = JSON.parse(b64urlDecodeToStr(p[1])); } catch(e){ return { ok:false, error:'PAYLOAD_ILEGIBLE' }; }
  const ahora = Math.floor(Date.now()/1000);
  if (!payload.exp || payload.exp <= ahora) return { ok:false, error:'TOKEN_EXPIRADO' };
  const scopes = Array.isArray(payload.scopes) ? payload.scopes : [];
  if (scopeRequerido && scopes.indexOf(scopeRequerido) < 0) {
    return { ok:false, error:'SCOPE_INSUFICIENTE', requerido:scopeRequerido };
  }
  return { ok:true, actor: payload.sub || payload.username || null,
           nombre: payload.nombre || null, scopes: scopes, exp: payload.exp };
}

try {
  const ENTRADA = $input.first().json;
  const cuerpo  = ENTRADA.body || ENTRADA || {};
  const secreto = $('Set - secreto').item.json.secret;

  if (!secreto || ('' + secreto).length < 32) {
    return [{ json: { ok:false, error:'SECRETO_NO_CONFIGURADO', clase:'servidor',
      mensaje:'SUITE_JWT_SECRET no esta definida o es muy corta en el entorno de n8n.' } }];
  }

  // El scope lo pide el LLAMADOR. Sin scope pedido no se abre nada: un llamador
  // que se olvide de mandarlo no debe colarse con un token cualquiera.
  const scope = (typeof cuerpo.scope === 'string' && cuerpo.scope.trim()) ? cuerpo.scope.trim() : null;
  if (!scope) {
    return [{ json: { ok:false, error:'SCOPE_NO_PEDIDO', clase:'servidor',
      mensaje:'El llamador no dijo que permiso exige. Se deniega por omision.' } }];
  }

  const v = verifyJWT(cuerpo.token, '' + secreto, scope);
  if (!v.ok) {
    // `clase` la necesita el cliente para no juntar tres cosas distintas en un
    // mensaje solo: sesion (vuelve a entrar) / red (espera) / servidor (avisa).
    return [{ json: { ok:false, error:v.error, clase:'sesion',
      mensaje: v.error === 'TOKEN_EXPIRADO' ? 'La sesion vencio. Vuelve a entrar.'
             : v.error === 'SCOPE_INSUFICIENTE' ? ('Tu cuenta no carga el permiso ' + scope + '.')
             : 'Sesion no valida. Vuelve a entrar.' } }];
  }

  // La FECHA se fija aqui, una vez, en hora de Monterrey (UTC-6, sin DST desde
  // 2022), para que una corrida que cruce la medianoche no mida dos dias.
  const hoy = new Date(Date.now() - 6*3600000).toISOString().slice(0,10);

  // Objeto NUEVO: el secreto no sigue rio abajo, ni de vuelta al llamador.
  return [{ json: { ok:true, actor:v.actor, nombre:v.nombre, scopes:v.scopes, hoy:hoy } }];

} catch (e) {
  return [{ json: { ok:false, error:'FALLO_VERIFICACION', clase:'servidor',
    mensaje:'No se pudo verificar la sesion.', detalle:String(e && e.message || e).slice(0,120) } }];
}
