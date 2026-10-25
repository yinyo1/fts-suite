/* ── Code - Renglon (una vez por item): arma el renglón de bancos.correos en base64 (un solo parámetro SQL).
 * Si vino de "HTTP - Enviar MIME", sólo se registra con 202; otro status truena la ejecución (queda visible). */
// Lo que se registra es lo que SALIÓ: en la solicitud, la salida de "Code - Hilo" (con In-Reply-To y el
// Thread-Index encadenado); en el acuse, que no tiene ese nodo, la de "Code - Armar".
const origen = () => { try { return $('Code - Hilo').item.json; } catch (e) { return $('Code - Armar').item.json; } };
const armado = $json.message_id ? $json : origen();
const status = $json.message_id ? null : $json.statusCode;
if (armado.modo === 'real' && status !== 202) throw new Error('Graph sendMail no devolvió 202 (status ' + status + '): no se registra el envío');
const r = { tipo: armado.tipo, modo: armado.modo, hoy: armado.hoy, message_id: armado.message_id, in_reply_to: armado.in_reply_to || '',
  thread_index: armado.thread_index, asunto: armado.asunto, para: armado.para, cc: armado.cc, total_abiertos: armado.total_abiertos,
  corrida_id: armado.corrida_id || '', graph_status: status == null ? '' : status,
  detalle: { razon: armado.razon || null, frecuencia: armado.frecuencia || null, validados: armado.validados, duplicados: armado.duplicados, rechazados: armado.rechazados } };
const bytes = new TextEncoder().encode(JSON.stringify(r));
const A = [[65, 26], [97, 26], [48, 10]].map(([a, n]) => Array.from({ length: n }, (_, i) => String.fromCharCode(a + i)).join('')).join('') + '+/';
let o = '';
for (let i = 0; i < bytes.length; i += 3) {
  const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
  o += A[a >> 2] + A[((a & 3) << 4) | ((b || 0) >> 4)] + (b === undefined ? '=' : A[((b & 15) << 2) | ((c || 0) >> 6)]) + (c === undefined ? '=' : A[c & 63]);
}
return { json: { registro_b64: o, message_id: r.message_id, tipo: r.tipo, modo: r.modo, hoy: r.hoy, graph_status: status } };
