/* ── adaptador n8n: fts_bancos_solicitud_v2 · Code - Armar ──
 * Cada item viene de "Postgres - f_solicitud" (columna d = bancos.f_solicitud(...)).
 * accion: enviar (real) | registrar (ensayo, no se envía nada) | aviso (sólo a Esteban) | nada. */
const meta = $('HTTP - Buzon (liga)').first().json || {};
const url = (meta.body && meta.body.webUrl) || '';
const st = $getWorkflowStaticData('global');
return $('Postgres - f_solicitud').all().map(it => {
  const d = typeof it.json.d === 'string' ? JSON.parse(it.json.d) : it.json.d;
  const base = { hoy: d.hoy, modo: d.modo, razon: d.razon, tipo_calculado: d.tipo, total: d.total, frecuencia: d.frecuencia };
  if (d.tipo === 'solicitud' || d.tipo === 'final') {
    const c = armar('solicitud', d, url);
    return { json: { ...base, accion: d.modo === 'real' ? 'enviar' : 'registrar', ...c } };
  }
  if (d.tipo === 'aviso_esteban' && d.modo === 'real') {
    if (st.aviso === d.hoy) return { json: { ...base, accion: 'nada' } };
    st.aviso = d.hoy;
    const txt = 'No se envió la solicitud de estados de cuenta a Gerardo: en las últimas 26 horas no hubo una lectura completa del buzón de OneDrive ' +
      '(la app de Graph no tiene permiso de archivos, o el procesador no respondió). Sin esa lectura la lista de faltantes no es confiable. ' +
      'Sale sola el siguiente día hábil en que el buzón se haya leído. Issue #331.';
    return { json: { ...base, accion: 'aviso', mail: { message: { subject: 'Bancos: la solicitud de estados de cuenta no se envió',
      body: { contentType: 'Text', content: limpiar(txt) }, toRecipients: lista(d.cc).filter(x => /^estebandelacruz@/.test(x)).map(a => ({ emailAddress: { address: a } })) },
      saveToSentItems: true } } };
  }
  return { json: { ...base, accion: 'nada' } };
});
