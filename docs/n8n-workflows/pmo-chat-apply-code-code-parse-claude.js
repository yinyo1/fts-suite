// === Parser tolerante Sprint 4.5 ===
const resp = $input.first().json;

if (resp.stop_reason === 'max_tokens') {
  return [{ json: { _error: true, code: 'CLAUDE_TRUNCATED', http: 502, msg: 'Respuesta de Claude truncada (max_tokens). Pide un cambio mas simple.' } }];
}

const blocks = resp.content || [];
const textBlock = blocks.find(b => b.type === 'text');
if (!textBlock || !textBlock.text) {
  return [{ json: { _error: true, code: 'CLAUDE_NO_TEXT', http: 502, msg: 'Claude no devolvio texto' } }];
}

const claudeText = String(textBlock.text).trim();

function tryParseJson(text) {
  // 1. Parse directo
  try { return JSON.parse(text); } catch (e) {}

  // 2. Bloque ```json ... ```
  const codeBlock = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1]); } catch (e) {}
  }

  // 3. Bloque ``` genérico
  const genericBlock = text.match(/```\s*\n?([\s\S]*?)\n?```/);
  if (genericBlock) {
    try { return JSON.parse(genericBlock[1]); } catch (e) {}
  }

  // 4. Primer {...} balanceado (string-aware)
  const start = text.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    let end = -1;
    let inStr = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end > start) {
      try { return JSON.parse(text.substring(start, end + 1)); } catch (e) {}
    }
  }

  return null;
}

const parsed = tryParseJson(claudeText);
const prev = $('Code - Decode + Build Claude Request').item.json;
const usage = resp.usage || {};

// No parseable -> tratar como info conversacional
if (parsed === null) {
  return [{ json: { info: true, text: claudeText, suggestions: [], no_changes: true, usage } }];
}

// Detectar shape
if (parsed.error) {
  return [{ json: { _error: true, code: String(parsed.error), http: 400, msg: String(parsed.message || '') } }];
}
if (parsed.refuse) {
  // refuse legacy -> tratar como info
  return [{ json: { info: true, text: String(parsed.refuse), suggestions: [], no_changes: true, usage } }];
}
if (parsed.info) {
  return [{ json: { info: true, text: String(parsed.info), suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 8) : [], no_changes: true, usage } }];
}
if (parsed.clarify) {
  return [{ json: { clarify: true, text: String(parsed.clarify), context_detected: Array.isArray(parsed.context_detected) ? parsed.context_detected : [], proposed_action: String(parsed.proposed_action || ''), no_changes: true, usage } }];
}
if (Array.isArray(parsed.ops) && parsed.ops.length > 0) {
  const ops = [];
  for (const op of parsed.ops) {
    if (typeof op !== 'object' || op === null) continue;
    if (typeof op.old !== 'string' || typeof op.new !== 'string') continue;
    if (op.old.length === 0 || op.old.length > 8000) continue;
    if (op.new.length > 8000) continue;
    ops.push({ old: op.old, new: op.new });
  }
  if (ops.length === 0) {
    return [{ json: { _error: true, code: 'CLAUDE_OPS_EMPTY', http: 502, msg: 'Ops vacias o invalidas tras sanitizacion' } }];
  }
  return [{
    json: {
      _error: false,
      _branch: 'apply',
      ops,
      summary: String(parsed.summary || 'cambios aplicados').slice(0, 280),
      version_bump: parsed.version_bump || null,
      file_content: prev.file_content,
      file_sha: prev.file_sha,
      userId: prev.userId,
      usage
    }
  }];
}

// Sin shape claro -> info con texto crudo
return [{ json: { info: true, text: claudeText, suggestions: [], no_changes: true, usage } }];
