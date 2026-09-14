/* ═══════════════════════════════════════════════════════════════════════════
 * PARCHE LISTO PARA APLICAR — nodo `Code - buildSnapshot`
 * workflow: ops/watchdog-semaforo · 29eaGe2wkS98lRMU
 *
 * ⚠️ NO ESTÁ APLICADO. Este archivo es el work product, no el cambio.
 *
 * POR QUÉ NO LO APLIQUÉ: la sesión que lo escribió tenía a
 * `ops/watchdog-semaforo` en su lista explícita de «te detienes y lo anotas,
 * sin hacerlo», y editar su borrador es tocarlo. El borrador de ese workflow
 * ya diverge de lo publicado (`versionId 11eb6c4e` ≠ `activeVersionId
 * a5eb4554`, diferencia medida: un `disabled:false` cosmético en el log note),
 * así que un edit del borrador NO afectaría la corrida de las 8:00 — pero sí
 * viajaría con el siguiente `publish`, y acoplar un cambio sin probar a un
 * publish que se hace por otra razón es justo el modo de falla que se evita.
 *
 * CÓMO SE APLICA (una sola llamada, con el contenido de este archivo):
 *   update_workflow(
 *     workflowId: '29eaGe2wkS98lRMU',
 *     operations: [{ type:'setNodeParameter', nodeName:'Code - buildSnapshot',
 *                    path:'/jsCode', value: <el cuerpo de abajo> }])
 *   …y después: read-back de `active`, y `versionId` vs `activeVersionId`.
 *
 * QUÉ CAMBIA, contra el nodo que corre hoy:
 *
 *   1. COMPUERTA DE MODO. Hoy NO existe: cualquier corrida manual commitea un
 *      snapshot al repo PÚBLICO. Ya produjo el del 13-sep con contactos. La
 *      compuerta devuelve CERO items cuando no es una corrida de producción, y
 *      con cero items el `HTTP - PUT snapshot (GitHub)` de abajo no se ejecuta
 *      — no hace falta tocar ese nodo ni deshabilitarlo a mano nunca más.
 *
 *      La señal es `$execution.mode === 'production'`, Y NADA MÁS. En concreto
 *      NO se usa el `isExecuted` del Schedule, que es lo que hace `buildEmail`:
 *      medido el 2026-09-13, disparar POR el nodo Schedule en una corrida
 *      manual pone ese flag en true, así que como compuerta no sirve. Las
 *      corridas manuales reportan `mode === 'test'`, nunca `'production'`.
 *      Falla CERRADA: si el modo no se puede leer, no se commitea.
 *
 *   2. SE QUITA `redactCliente()`. Era el corte por la primera coma, y desde
 *      el 2026-09-13 el recorte vive en el MOTOR (`ops/semaforo-motor`), sobre
 *      `name` Y `cliente`, usando `res.partner.commercial_company_name` en vez
 *      de adivinar por coma. Mantener los dos es trabajo doble, y el de aquí
 *      es además peor: mutila una razón social del tipo `EMPRESA, S.A. DE C.V.`
 *      que el del motor respeta.
 *
 *   3. A CAMBIO, UN CANARIO que no modifica nada. Si alguna fila llega con un
 *      `cliente` que todavía parece compuesto, se anota en `_diag` y el correo
 *      lo imprime. Quitar una defensa sin dejar forma de enterarse es como se
 *      vuelve invisible la próxima fuga: esto no redacta, avisa.
 * ═══════════════════════════════════════════════════════════════════════════ */

// -- Code - buildSnapshot - compuerta de modo (2026-09-14, issue #240) --------
// El snapshot se PUBLICA a un repo PUBLICO (yinyo1/fts-suite sirve Pages), asi
// que aqui es donde se decide QUE sale y, desde hoy, tambien SI sale.
//
// Lo que NO cambia: ningun umbral, ningun calculo, ninguna fila. El snapshot
// sigue siendo el registro completo de lo medido -por eso el digest de lunes
// puede reconstruirse desde aqui-.
//
// RIESGO ASUMIDO, no resuelto: los nombres que YA estan en los snapshots
// historicos del repo no se limpian. Borrarlos del archivo no los borra del
// historial de git. Decision documentada en docs/watchdogs/SNAPSHOTS-RETIRADOS.md.

// ── 1. COMPUERTA ────────────────────────────────────────────────────────────
// Solo una corrida de PRODUCCION commitea. Medido el 2026-09-13: una corrida
// manual reporta $execution.mode === 'test', nunca 'production'. NO se usa el
// isExecuted del Schedule -que es lo que mira buildEmail- porque disparar POR
// ese nodo en modo manual lo pone en true y la compuerta se abriria sola.
let esProduccion = false;
try { esProduccion = ($execution && $execution.mode) === 'production'; }
catch (e) { esProduccion = false; }          // sin senal, no se commitea

// El modo_prueba de la config tambien cierra: una corrida de cron con la config
// desviada no tiene por que dejar registro publico.
let modoPrueba = false;
try {
  const _r = $('HTTP - load config').first().json;
  const cfg = (_r && _r.config) ? _r : JSON.parse(_r.data || _r.body || JSON.stringify(_r));
  modoPrueba = (cfg.config && cfg.config.modo_prueba === true);
} catch (e) { modoPrueba = false; }

if (!esProduccion || modoPrueba) {
  // CERO items: el HTTP - PUT de abajo no se ejecuta. No hace falta
  // deshabilitar ese nodo a mano para probar, que es lo que se venia haciendo.
  return [];
}

// ── 2. ARMADO (identico a antes, menos la redaccion) ────────────────────────
const hoy = ($('Set - hoy').first().json.hoy || '').slice(0, 10);
const raw = $('Code - MAIN').all().map(i => i.json);
const soloDiag = raw.length === 1 && raw[0]._solo_diag;
const diag = (raw[0] && raw[0]._diag) ? raw[0]._diag.slice() : [];
const rows = soloDiag ? [] : raw;

// `_diag` SUBE al nivel del snapshot: Code - MAIN lo adjunta a CADA fila (el
// mismo array repetido), aqui se guarda una sola vez. Y se quitan de cada fila
// los campos internos del correo: son estado de render, no medicion.
const proyectos = rows.map(function (r) {
  const o = {};
  for (const k of Object.keys(r)) {
    if (k === '_diag' || k === '_flagsNuevas') continue;
    o[k] = r[k];
  }
  return o;
});

// ── 3. CANARIO de redaccion ─────────────────────────────────────────────────
// El recorte vive en el MOTOR y cubre `name` y `cliente`. Esto NO redacta: solo
// comprueba que llego hecho. Heuristica deliberadamente estrecha -coma seguida
// de dos palabras capitalizadas- para no gritar con "EMPRESA, S.A. DE C.V.".
const PERSONA = /,\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/;
const sospechosas = [];
for (const p of proyectos) {
  if (PERSONA.test(String(p.cliente || '')) || PERSONA.test(String(p.name || ''))) {
    sospechosas.push(p.id);
  }
}
if (sospechosas.length) {
  diag.push({
    nodo: 'Code - buildSnapshot',
    problema: 'el recorte del contacto no llego hecho desde el motor: ' +
              sospechosas.length + ' proyecto(s) con nombre compuesto',
    filas: sospechosas.slice(0, 20),
    critico: true
  });
}

const snap = {
  fecha: hoy,
  total: proyectos.length,
  por_color: proyectos.reduce(function (a, r) { a[r.color] = (a[r.color] || 0) + 1; return a; }, {}),
  _redaccion: 'el recorte del contacto (name y cliente) vive en el MOTOR ops/semaforo-motor, ' +
              'via res.partner.commercial_company_name. Aqui solo se verifica que llego hecho.',
  _compuerta: 'solo corridas de produccion commitean este archivo',
  _diag: diag,
  proyectos: proyectos
};
const content = Buffer.from(JSON.stringify(snap, null, 2)).toString('base64');
return [{ json: { fecha: hoy, message: 'chore(semaforo): snapshot ' + hoy, content } }];
