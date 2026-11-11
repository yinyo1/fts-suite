#!/usr/bin/env node
// #486 · Quita el HMAC del cliente de pmo/index.html y manda el token de sesión de la suite.
// NO se guarda como diff porque las líneas que quita traen el secreto: el script lo encuentra por forma.
// Cada reemplazo exige exactamente 1 coincidencia; si algo no calza, aborta sin escribir.
//   node docs/seguridad/pmo-aplicar-frontend.js [pmo/index.html]
'use strict';
const fs = require('fs'), path = require('path');
const p = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'pmo', 'index.html'));
let s = fs.readFileSync(p, 'utf8');
function r(a, b) { const m = typeof a === 'string' ? a : (s.match(a) || [])[0]; if (!m) throw new Error('no calza: ' + a);
  if (s.split(m).length - 1 !== 1) throw new Error('calza más de una vez: ' + String(a).slice(0, 80)); s = s.replace(m, () => b); }
r('<script src="../shared/auth-suite.js"></script>', '<script src="../shared/auth-suite.js"></script>\n<script src="../shared/auth-jwt.js"></script>');
r(/  const SECRET_KEY = .PMO_CHAT_SECRET.;\n/, '');
r(/  \/\/ Gate 2: secret hardcoded[^\n]*\n  const HARDCODED_SECRET = [^\n]*\n  const secret = HARDCODED_SECRET;\n  localStorage\.setItem\(SECRET_KEY, HARDCODED_SECRET\);[^\n]*\n/,
  "  // Gate 2 (#486): el servidor verifica el token de sesión de la suite. Ningún secreto vive aquí.\n  try { localStorage.removeItem('PMO_CHAT_SECRET'); } catch(e){}\n  function suiteToken(){ return (window.SuiteAuth && SuiteAuth.isValid && SuiteAuth.isValid()) ? SuiteAuth.getToken() : null; }\n");
r(/  async function signRequest\(timestamp, payload\)\{[\s\S]*?\n  \}\n\n/, '');
r(/    const timestamp = new Date\(\)\.toISOString\(\);\n    const sigPayload = \{ message: msg, userId \};\n    let signature;\n    try \{ signature = await signRequest\(timestamp, sigPayload\); \}\n    catch\(e\)\{\n[\s\S]*?\n    \}\n/,
  "    const token = suiteToken();\n    if (!token) {\n      setStatus('⚠️ Entra a la suite para usar el chat', 'error');\n      addAssistant('Tu sesión de la suite no está activa. Entra en shared/login.html y vuelve a intentar.');\n      setBusy(false);\n      return;\n    }\n");
r('      message: msg,\n      userId,\n      timestamp,\n      signature,\n', '      message: msg,\n      token,\n');
r(/    const SECRET = .[0-9a-f]{64}.;\n/, '');
r(/    const ts = new Date\(\)\.toISOString\(\);\n    const session = [^\n]*\n    const userId = [^\n]*\n    const dataToSign = [^\n]*\n    const enc = [^\n]*\n    const cryptoKey = [^\n]*\n    const sigBuf = [^\n]*\n    const sigHex = [^\n]*\n/,
  "    // #486: el servidor verifica el token de sesión de la suite; aquí no se firma nada.\n    const token = (window.SuiteAuth && SuiteAuth.isValid && SuiteAuth.isValid()) ? SuiteAuth.getToken() : null;\n");
r('body: JSON.stringify({op: op, userId: userId, timestamp: ts, signature: sigHex})', 'body: JSON.stringify({op: op, token: token})');
if (/[0-9a-f]{64}/.test(s)) throw new Error('quedó una cadena de 64 hex');
fs.writeFileSync(p, s); console.log('aplicado a ' + p);
