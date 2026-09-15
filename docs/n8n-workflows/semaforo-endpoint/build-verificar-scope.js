// Arma el jsCode del sub-workflow COMPARTIDO auth/verificar-scope.
// La cripto sale TAL CUAL de ../fase0/jwt-verify.js con guardas de conteo.
// Diferencia con el verificador de un endpoint: el SCOPE llega como DATO del
// llamador, no hardcoded -- por eso puede servir a todos los endpoints.
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/../fase0/jwt-verify.js','utf8');

const CORTE='function verifyJWT(';
if(src.split(CORTE).length-1!==1) throw new Error('el corte no calza exactamente 1 vez');
const cripto=src.slice(0, src.indexOf(CORTE)).trimEnd();
for(const f of ['function sha256Bytes(','function strBytes(','function hmacSha256(',
                'function b64urlFromBytes(','function b64urlDecodeToStr(','function safeEq(']){
  if(cripto.split(f).length-1!==1) throw new Error('falta o se repite '+f);
}
if(/module\.exports/.test(cripto)) throw new Error('el recorte arrastro el module.exports');
if(/finanzas:read/.test(cripto))  throw new Error('el recorte arrastro el fallback legacy');

const propio = `
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
 * objeto sin \`ok\` -> su IF lo lee como false -> deniega. */
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
    // \`clase\` la necesita el cliente para no juntar tres cosas distintas en un
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
`;
const js = cripto + '\n' + propio;
if(/SUITE_JWT_SECRET *= *['"]/.test(js)) throw new Error('literal de secreto en el codigo');
fs.writeFileSync(__dirname+'/Code-verificar-scope.js', js);
console.log('Code-verificar-scope.js:', js.length, 'chars ·', js.split('\n').length, 'lineas');
