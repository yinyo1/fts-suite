// Arma el jsCode de 'Code - Verificar token' PROGRAMATICAMENTE, no transcribiendo.
// La cripto sale TAL CUAL del archivo commiteado (9/9 en su propia prueba); lo
// unico escrito a mano es verifyJWT -sin el fallback legacy- y el cuerpo.
const fs=require('fs');
const src=fs.readFileSync('../fase0/jwt-verify.js','utf8');

const CORTE='function verifyJWT(';
if(src.split(CORTE).length-1!==1) throw new Error('el corte no calza exactamente 1 vez');
const cripto=src.slice(0, src.indexOf(CORTE)).trimEnd();

// guardas: las 6 piezas de cripto tienen que estar enteras
for(const f of ['function sha256Bytes(','function strBytes(','function hmacSha256(',
                'function b64urlFromBytes(','function b64urlDecodeToStr(','function safeEq(']){
  if(cripto.split(f).length-1!==1) throw new Error('falta o se repite '+f);
}
if(/module\.exports/.test(cripto)) throw new Error('el recorte arrastro el module.exports');
if(/finanzas:read/.test(cripto))  throw new Error('el recorte arrastro el fallback legacy');

const propio = `
/* verifyJWT escrito A PROPOSITO sin el fallback de scopes del archivo de fase0.
 * Ese fallback concede ['finanzas:read','finanzas:write'] a un token SIN scopes,
 * para no romper tokens viejos de Finanzas. Un panel NUEVO no tiene tokens viejos
 * que respetar, y heredarlo abriria el semaforo a cualquiera con un token de
 * Finanzas. Sin scopes en el token, no hay acceso. Mismo criterio que
 * fin/rentabilidad. La cripto de arriba SI viene intacta del archivo commiteado
 * (docs/n8n-workflows/fase0/jwt-verify.js, 9/9 contra crypto de Node). */
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

/* ── ops/semaforo · verificacion ──────────────────────────────────────────
 * TODO EL CUERPO VA EN try/catch A PROPOSITO. Este nodo cuelga directamente de
 * 'Set - secreto', o sea que su ENTRADA es el secreto. Si lanzara, n8n adjunta el
 * input del nodo que fallo al payload de error — y ahi viaja el secreto en claro,
 * incluso con el filtro de nodeNames puesto (CLAUDE.md 9, regla dura del 8-sep,
 * ejecucion 90281: asi se filtro SUITE_JWT_SECRET y hubo que rotarla).
 * Un nodo que no lanza no produce ese payload. El fallo se devuelve como DATO.
 *
 * SOLO LECTURA sobre Odoo. No escribe nada, nunca. */
try {
  const ENTRADA = $input.first().json;
  const cuerpo  = ENTRADA.body || ENTRADA || {};
  const secreto = $('Set - secreto').item.json.secret;

  if (!secreto || ('' + secreto).length < 32) {
    // Falla RUIDOSA: sin secreto no se contesta con datos, y se dice por que.
    return [{ json: { ok:false, error:'SECRETO_NO_CONFIGURADO', clase:'servidor',
      mensaje:'SUITE_JWT_SECRET no esta definida o es muy corta en el entorno de n8n.' } }];
  }

  const v = verifyJWT(cuerpo.token, '' + secreto, 'semaforo:read');
  if (!v.ok) {
    // \`clase\` la necesita el cliente para no juntar tres cosas distintas en un
    // mensaje solo: sesion (vuelve a entrar) / red (espera) / servidor (avisa).
    // Va en el CUERPO y no se deduce del codigo HTTP, porque el webhook de n8n
    // contesta 200 con cuerpo de error.
    return [{ json: { ok:false, error:v.error, clase:'sesion',
      mensaje: v.error === 'TOKEN_EXPIRADO' ? 'La sesion vencio. Vuelve a entrar.'
             : v.error === 'SCOPE_INSUFICIENTE' ? 'Tu cuenta no carga el permiso semaforo:read.'
             : 'Sesion no valida. Vuelve a entrar.' } }];
  }

  // La FECHA se fija aqui, una vez, en hora de Monterrey (UTC-6, sin DST desde
  // 2022). Si cada nodo rio abajo la calculara por su cuenta, una corrida que
  // cruce la medianoche mediria dos dias distintos en el mismo sobre.
  const hoy = new Date(Date.now() - 6*3600000).toISOString().slice(0,10);

  // Objeto NUEVO: el secreto no sigue rio abajo.
  return [{ json: { ok:true, actor:v.actor, nombre:v.nombre, scopes:v.scopes, hoy:hoy } }];

} catch (e) {
  return [{ json: { ok:false, error:'FALLO_VERIFICACION', clase:'servidor',
    mensaje:'No se pudo verificar la sesion.', detalle:String(e && e.message || e).slice(0,120) } }];
}
`;
const js = cripto + '\n' + propio;
if(/SUITE_JWT_SECRET *= *['"]/.test(js)) throw new Error('literal de secreto en el codigo');
fs.writeFileSync('Code-Verificar-token.js', js);
console.log('verificar.js:', js.length, 'chars ·', js.split('\n').length, 'lineas');
console.log('cripto intacta:', cripto.length, 'chars');
