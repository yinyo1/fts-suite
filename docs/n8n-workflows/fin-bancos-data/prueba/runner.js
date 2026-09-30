/* ── fin/bancos-data-prueba (TMP) · doble verificación del motor (#370) ────────────────────────
 * Firma los JWT AQUÍ con el secreto real (nunca salen del nodo), llama a los endpoints publicados y
 * compara contra el camino directo (`Postgres - Directo`, otra consulta). Devuelve SÓLO resultados.
 * TODO en try/catch: este nodo recibe el secreto como entrada (§9, regla del 8-sep). */
async function correr(ctx) {
  const E = $input.first().json;
  const SEC = '' + E.secret;
  const D = E.d;
  const b64 = s => b64urlFromBytes(strBytes(s));
  const jwt = p => { const h = b64(JSON.stringify({ alg:'HS256', typ:'JWT' })), b = b64(JSON.stringify(p));
                     return h + '.' + b + '.' + b64urlFromBytes(hmacSha256(SEC, h + '.' + b)); };
  const ahora = Math.floor(Date.now() / 1000);
  const TOK = jwt({ sub:'prueba-data-bancos', scopes:['bancos_data:read'], exp: ahora + 600 });
  const SIN = jwt({ sub:'prueba-sin-scope', scopes:['finanzas:read','rentabilidad:read'], exp: ahora + 600 });
  const VEN = jwt({ sub:'prueba-vencido', scopes:['bancos_data:read'], exp: ahora - 60 });
  const H = (typeof $helpers !== 'undefined' && $helpers.httpRequest) ? $helpers.httpRequest.bind($helpers) : ctx.helpers.httpRequest.bind(ctx.helpers);
  const BASE = 'https://primary-production-5c3c.up.railway.app/webhook/';
  async function post(ruta, cuerpo) {
    const t0 = Date.now();
    const r = await H({ method:'POST', url: BASE + ruta, body: cuerpo, json:true, returnFullResponse:true, ignoreHttpStatusErrors:true, timeout:60000 });
    let b = r.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) {} }
    return { status: r.statusCode, body: b, ms: Date.now() - t0 };
  }
  const S2 = { desde:'2026-01-01', hasta:'2026-08-31', cuentas:['bbva-general-3326'], tipo:'cargo', texto:'spei' };
  const suma = arr => arr.reduce((a, x) => a + Math.round(Number(x) * 100), 0) / 100;
  const pm = r => JSON.stringify((r.body && r.body.por_moneda) || null);
  // comparación NUMÉRICA (un "0" y un "0.00" son el mismo cero): moneda, conteo, abonos, cargos y neto
  const igualPM = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) =>
    x.mon === b[i].mon && Number(x.n) === Number(b[i].n) && ['abonos','cargos','neto'].every(k => Number(x[k]) === Number(b[i][k])));
  const out = { cuando: new Date().toISOString(), checks: [] };
  const ck = (n, ok, det) => out.checks.push({ n, ok: !!ok, det: det === undefined ? null : det });

  const t1 = await post('fin/bancos-data', { token:TOK });
  const totD = D.todo.reduce((a, x) => a + Number(x.n), 0) + Number(D.jeeves_n);
  ck('T1 consulta sin filtro: 200', t1.status === 200, t1.status);
  ck('T1 total = directo (BBVA + Jeeves)', t1.body.total === totD, [t1.body.total, totD]);
  ck('T1 sumas por moneda = directo', igualPM(t1.body.por_moneda, D.todo), [pm(t1), JSON.stringify(D.todo)]);
  ck('T1 página de 500', t1.body.filas.length === Math.min(500, totD), t1.body.filas.length);
  ck('T1 fecha desc', t1.body.filas.every((f, i, a) => i === 0 || a[i-1].fecha >= f.fecha));
  ck('T1 catálogo = cuentas con estados', t1.body.catalogo.length === Number(D.cuentas), t1.body.catalogo.map(c => c.cid + ':' + c.n + ':' + c.masc + ':' + c.mon));
  ck('T1 actualizado = directo', String(t1.body.actualizado).slice(0,19) === String(D.ult).slice(0,19), [t1.body.actualizado, D.ult]);
  ck('T1 máscaras a 4 dígitos', t1.body.catalogo.every(c => c.masc === '' || /^…\d{4}$/.test(c.masc)));

  const t2 = await post('fin/bancos-data', Object.assign({ token:TOK }, S2));
  const nS2 = (D.s2 || []).reduce((a, x) => a + Number(x.n), 0);
  ck('T2 filtro conocido: total = directo', t2.body.total === nS2, [t2.body.total, nS2]);
  ck('T2 sumas por moneda = directo', igualPM(t2.body.por_moneda, D.s2 || []), [pm(t2), JSON.stringify(D.s2)]);
  ck('T2 primera fila = directo', t2.body.filas.length > 0 && t2.body.filas[0].fecha === D.s2_primera.fecha && t2.body.filas[0].monto === D.s2_primera.monto);

  const t3 = await post('fin/bancos-data', { token:TOK, sort:'monto', dir:-1 });
  ck('T3 orden por magnitud: primera = máx |monto|', Math.abs(Number(t3.body.filas[0].monto)) === Number(D.max_abs), [t3.body.filas[0].monto, D.max_abs]);
  ck('T3 magnitudes no crecientes', t3.body.filas.every((f, i, a) => i === 0 || Math.abs(Number(a[i-1].monto)) >= Math.abs(Number(f.monto))));

  const t4 = await post('fin/bancos-data', { token:TOK, cuentas:[] });
  ck('T4 cero cuentas = cero filas', t4.status === 200 && t4.body.total === 0 && t4.body.filas.length === 0, t4.body.total);

  const t5 = await post('fin/bancos-data', { token:TOK, offset:500 });
  const claves = f => f.fecha + '|' + f.monto + '|' + f.desc + '|' + f.ref + '|' + f.cid;
  const p1 = new Set(t1.body.filas.map(claves));
  ck('T5 segunda página: mismo total, no repite la primera', t5.body.total === t1.body.total && t5.body.filas.length === Math.min(500, totD - 500)
     && t5.body.filas.filter(f => p1.has(claves(f))).length === 0, [t5.body.filas.length]);

  const t6 = await post('fin/bancos-data-exportar', Object.assign({ token:TOK, formato:'csv', cols:['fecha','monto','mon','desc','banco','cuenta','ref'] }, S2));
  const csv = t6.body.csv || '';
  const lineas = csv.replace(/^\uFEFF/, '').split('\r\n');
  const cab = lineas[0].split(',');
  // parser mínimo de CSV (comillas dobles) para leer Monto y Moneda
  const parse = l => { const o = []; let c = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i];
    if (q) { if (ch === '"' && l[i+1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
  const filas = lineas.slice(1).map(parse);
  const iM = cab.indexOf('Monto'), iMon = cab.indexOf('Moneda');
  const porMon = {}; filas.forEach(f => { (porMon[f[iMon]] = porMon[f[iMon]] || []).push(f[iM]); });
  ck('T6 CSV: 200 y BOM', t6.status === 200 && csv.charCodeAt(0) === 0xFEFF, t6.status);
  ck('T6 CSV: encabezado con acento', cab.join(',') === 'Fecha,Monto,Moneda,Descripción,Banco,Cuenta,Referencia', cab.join(','));
  ck('T6 CSV: filas = directo', filas.length === nS2, [filas.length, nS2]);
  ck('T6 CSV: neto por moneda = directo', (D.s2 || []).every(x => suma(porMon[x.mon] || []) === Number(x.neto)),
     (D.s2 || []).map(x => [x.mon, suma(porMon[x.mon] || []), x.neto]));
  ck('T6 CSV: primera y última = directo', filas.length > 0 && filas[0][0] === D.s2_primera.fecha && filas[0][iM] === D.s2_primera.monto
     && filas[filas.length-1][0] === D.s2_ultima.fecha && filas[filas.length-1][iM] === D.s2_ultima.monto);
  ck('T6 CSV: Monto es número puro', filas.every(f => /^-?\d+(\.\d+)?$/.test(f[iM])));

  const t7 = await post('fin/bancos-data-exportar', Object.assign({ token:TOK, formato:'filas', cols:['fecha','monto','mon'] }, S2));
  ck('T7 filas (XLSX): mismo conteo y sumas', t7.status === 200 && t7.body.filas.length === nS2 && igualPM(t7.body.por_moneda, D.s2 || []));

  const t8 = await post('fin/bancos-data', { token:SIN });
  ck('T8 consulta SIN scope → 403 SCOPE_INSUFICIENTE', t8.status === 403 && t8.body.error === 'SCOPE_INSUFICIENTE', [t8.status, t8.body.error]);
  const t9 = await post('fin/bancos-data-exportar', { token:SIN, formato:'csv' });
  ck('T9 exportar SIN scope → 403, sin csv', t9.status === 403 && t9.body.error === 'SCOPE_INSUFICIENTE' && !t9.body.csv, [t9.status, t9.body.error]);
  const t10 = await post('fin/bancos-data', { token:VEN });
  ck('T10 token vencido → 401 TOKEN_EXPIRADO', t10.status === 401 && t10.body.error === 'TOKEN_EXPIRADO', [t10.status, t10.body.error]);
  const t11 = await post('fin/bancos-data', {});
  ck('T11 sin token → 401', t11.status === 401, t11.status);

  out.resumen = { total: t1.body.total, por_moneda: t1.body.por_moneda, s2_total: t2.body.total, s2_por_moneda: t2.body.por_moneda,
                  catalogo: t1.body.catalogo.map(c => ({ cid:c.cid, masc:c.masc, mon:c.mon, n:c.n, periodos:c.periodos.length })),
                  ms: { consulta: t1.ms, exportar_csv: t6.ms }, csv_bytes: csv.length, s2_fechas: [D.s2_ultima && D.s2_ultima.fecha, D.s2_primera && D.s2_primera.fecha] };
  out.ok = out.checks.every(c => c.ok);
  out.verdes = out.checks.filter(c => c.ok).length + '/' + out.checks.length;
  // los detalles de los checks que pasaron no hacen falta: sólo se quedan los de los que fallaron
  out.checks = out.checks.map(c => c.ok ? { n:c.n, ok:true } : c);
  return out;
}
try {
  return [{ json: await correr(this) }];
} catch (e) {
  return [{ json: { ok:false, error:'RUNNER_FALLO', detalle: String(e && e.message || e).slice(0, 200) } }];
}
