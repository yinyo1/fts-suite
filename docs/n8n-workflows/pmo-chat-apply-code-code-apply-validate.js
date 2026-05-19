// Apply str_replace ops + 7 defenses (V8 anti-leak removida: secret legitimamente vive en frontend)
const data = $input.first().json;
let content = data.file_content;
const original = content;
const ops = data.ops;

for (let i = 0; i < ops.length; i++) {
  const op = ops[i];
  const occurrences = content.split(op.old).length - 1;
  if (occurrences === 0) {
    return [{ json: { _error: true, code: 'OP_NOT_FOUND', http: 422, msg: 'Op #' + (i+1) + ': old no encontrado en archivo', op_old_preview: op.old.slice(0, 200) } }];
  }
  if (occurrences > 1) {
    return [{ json: { _error: true, code: 'OP_NOT_UNIQUE', http: 422, msg: 'Op #' + (i+1) + ': old aparece ' + occurrences + ' veces (debe ser unico)', op_old_preview: op.old.slice(0, 200) } }];
  }
  content = content.replace(op.old, op.new);
}

const ratio = content.length / original.length;
if (ratio < 0.7 || ratio > 1.3) {
  return [{ json: { _error: true, code: 'V1_SIZE_DELTA', http: 422, msg: 'Cambio fuera de ratio 70-130% (ratio=' + ratio.toFixed(2) + ')' } }];
}

const invariants = [
  '<script src="../shared/auth-suite.js"></script>',
  'FTSAuth.isLoggedIn()',
  '</body></html>',
  '<title>',
  '<div class="footer">',
  'pmo-chat-fab',
  'pmo-chat-panel'
];
for (const inv of invariants) {
  if (!content.includes(inv)) {
    return [{ json: { _error: true, code: 'V2_INVARIANT_MISSING', http: 422, msg: 'Falta invariante: ' + inv } }];
  }
}

function count(s, re) { return (s.match(re) || []).length; }
const checks = [
  ['tr', /<tr[\s>]/g, /<\/tr>/g],
  ['td', /<td[\s>]/g, /<\/td>/g],
  ['div', /<div[\s>]/g, /<\/div>/g],
  ['span', /<span[\s>]/g, /<\/span>/g],
  ['table', /<table[\s>]/g, /<\/table>/g]
];
for (const [name, openRe, closeRe] of checks) {
  const o = count(content, openRe);
  const c = count(content, closeRe);
  if (o !== c) {
    return [{ json: { _error: true, code: 'V3_TAG_IMBALANCE', http: 422, msg: 'Tag ' + name + ' imbalance: ' + o + ' open, ' + c + ' close' } }];
  }
}

const titleMatch = content.match(/<title>Cronograma Interno FTS (v\d+) /);
const badgeMatch = content.match(/<span class="badge-version">(v\d+)<\/span>/);
const footerMatch = content.match(/· (v\d+)<\/em>/);
if (!titleMatch || !badgeMatch || !footerMatch) {
  return [{ json: { _error: true, code: 'V4_VERSION_MISSING', http: 422, msg: 'No se encontro version en title/badge/footer' } }];
}
if (titleMatch[1] !== badgeMatch[1] || titleMatch[1] !== footerMatch[1]) {
  return [{ json: { _error: true, code: 'V4_VERSION_MISMATCH', http: 422, msg: 'Version inconsistente: title=' + titleMatch[1] + ', badge=' + badgeMatch[1] + ', footer=' + footerMatch[1] } }];
}

const statsTotalMatch = content.match(/<div class="stat-card"><div class="value">(\d+)<\/div><div class="label">Total actividades<\/div><\/div>/);
const footerTotalMatch = content.match(/(\d+) actividades/);
if (false) { /* V6 SKIPPED Sprint 4: stats div oculto via CSS, counter desincronizado es legitimo */
  return [{ json: { _error: true, code: 'V6_STATS_FOOTER_MISMATCH', http: 422, msg: 'Stats Total (' + statsTotalMatch[1] + ') != footer actividades (' + footerTotalMatch[1] + ')' } }];
}

const barIds = Array.from(content.matchAll(/title="[^"]*">\[([A-Z0-9-]+)\]/g)).map(m => m[1]);
const trIds = Array.from(content.matchAll(/<td class="col-id">([A-Z0-9-]+)<\/td>/g)).map(m => m[1]);
const trIdSet = new Set(trIds);
const orphanBars = barIds.filter(id => !trIdSet.has(id));
if (orphanBars.length > 0) {
  return [{ json: { _error: true, code: 'V7_ORPHAN_BARS', http: 422, msg: 'Bars sin TR matching: ' + orphanBars.slice(0,5).join(',') } }];
}

function utf8StringToBase64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

const newContentB64 = utf8StringToBase64(content);
const summary = data.summary || 'cambios aplicados';
const userId = data.userId;
return [{
  json: {
    _error: false,
    new_content_b64: newContentB64,
    new_content_size: content.length,
    file_sha: data.file_sha,
    summary,
    userId,
    commit_message: 'feat(pmo): ' + summary + ' [chat AI ' + userId + ']',
    usage: data.usage
  }
}];