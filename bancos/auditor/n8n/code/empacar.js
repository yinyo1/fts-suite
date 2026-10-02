/* Devuelve cada archivo en base64; el sha256 y la relectura los hace el auditor. */
const pedidos = $('Code - Items a bajar').all().map(i => i.json);
return $input.all().map((it, k) => ({ json: { item_id: (pedidos[k] || {}).item_id, drive_id: (pedidos[k] || {}).drive_id,
  ok: !!it.json.b64, b64: it.json.b64 || null, error: it.json.error ? String(it.json.error.message || it.json.error).slice(0, 200) : null } }));
