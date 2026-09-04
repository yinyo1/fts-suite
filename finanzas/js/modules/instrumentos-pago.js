// ═══ FTS Suite · Finanzas — Instrumentos de pago (Bancos) ═══
// Llena el slot reservado `instrumentos-pago` (B4 · Centro de transacciones) con
// el contenido del mockup v7 (docs/mockup-finanzas-bancos.html): fuentes de pago
// colapsables por país, tabla de 17 columnas, semáforo de conciliación, countdown
// al próximo sync y tabla de últimas corridas (CBRUN).
//
// Reutiliza FinRouter (registro), FinState (modo/companies), FinCompanySelector
// (selector único de empresa en todo Finanzas), FinClient (webhooks JWT-en-body).
// Sin globals: todo el wiring vía addEventListener (CSP-safe).
//
// Modo: SOLO real (endpoints fin/captura-*). Desde v0.5.16 no hay selector: los modos
// 'empty' y 'demo' perdieron su superficie en la UI. Demo sobrevive como escotilla de
// consola para el gate de render (ver currentMode); 'empty' se eliminó por inalcanzable.
// El gate de seguridad IP_REAL_ENABLED se retiró: quedó sin sentido al ser Real el único
// modo (checklist en docs/finanzas/BANCOS_CHECKLIST_SEGURIDAD.md, hardening pendiente
// documentado ahí — el flag ya no lo representaba, estaba en true desde 2026-07-23).

(function () {
  'use strict';
  if (!window.FinRouter) return;

  // ── config ──
  var MODULE_ID = 'instrumentos-pago';
  var MOCK_PATH = 'data/mock/instrumentos-pago.mock.json';
  // Versión visible en pantalla. Esquema V<mayor>.<menor de dos dígitos>, +0.01 por cada merge
  // a main; al pasar de .99 sube el mayor y el menor vuelve a 00. Es el mismo esquema de
  // comercial/machote y DEBE coincidir con finanzas/version.json — el gate lo verifica, porque
  // una pantalla que dice una versión y un archivo que dice otra deja de ser evidencia de nada.
  // Sustituye a la numeración 0.x.y (última: 0.5.36), conservada en version.json.
  var IP_BUILD = 'V1.09';
  var RESIDUAL_UMBRAL_MXN = 10000;        // coherente con fin/captura-status
  var SHEETJS_CDN = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  // Endpoints reales (contrato construido en la sesión de backend; verificar nombres de
  // campo contra la respuesta viva al des-gatear Real — requiere runner JWT).
  var EP_STATUS = '/fin/captura-status', EP_TX = '/fin/captura-transacciones', EP_DATASET = '/fin/captura-dataset';
  // Etapa C — motor de conciliación (contrato real; solo se ejercita al des-gatear Real).
  var EP_SUGERENCIAS = '/fin/captura-sugerencias', EP_CONCILIAR = '/fin/captura-conciliar';
  var EP_BUSCAR = '/fin/captura-buscar-bills';   // Pieza #1: buscador manual de bills (17+285). Degrada si el workflow está inactivo.
  var EP_SYNC_NOW = '/captura-jeeves/run';       // #4a: webhook NATIVO de captura-jeeves (dual-trigger, origen='manual', CBRUN). Cero clon. ⚠️ sin scope-check → hardening backlog (Cloudflare post-canary).
  var EP_CONCILIA_NOW = '/fin/concilia-now';     // #4b: autoconciliar on-demand (lógica de D). Botón gateado hasta mañana.

  // ═══ CATÁLOGO DE FUENTES (V1.09) ══════════════════════════════════════════════════════
  // Hasta V1.08 el panel no sabía NADA de journals: `state.sources` se asignaba entero desde
  // `fin/captura-status` (ingest, L~396) y `journalList()` se derivaba de `por_journal`. Eso es
  // lo correcto para una fuente VIVA — el server es dueño de las cifras — pero deja fuera a las
  // cuentas que existen en Odoo y que el capturador todavía no toca: si el server no las
  // reporta, para el panel no existen.
  //
  // Este catálogo aporta IDENTIDAD, nunca cifras: banco, moneda, empresa, journal, método y el
  // último dato verificado a mano en Odoo (con su fecha de medición, igual que el bloque de
  // pagos manuales del semáforo). Se fusiona con lo que manda el server en `fuentesConCatalogo()`
  // y el SERVER SIEMPRE GANA: en cuanto `captura-status` reporte uno de estos journals en
  // `sources`/`por_journal`, la entrada del catálogo se retira sola y la tarjeta cobra vida sin
  // tocar una línea de front. Por eso el catálogo no lleva contadores: un número escrito aquí
  // se volvería mentira el día que llegue el feed, y hoy sería un número sin fecha.
  //
  // NO se listan aquí las fuentes vivas (Jeeves 61, Chase 122/123): las manda el server y
  // duplicarlas sería dos escritores para el mismo campo (CLAUDE.md §20.4).
  var CATALOGO_FUENTES = [
    { id: 'bbva-general', journal: 8, label: 'BBVA General', co: 1, pais: 'MEX', nm: 'BBVA General MXN', banco: 'BBVA',
      moneda: 'MXN', met: 'Importación de archivo', jt: 'journal 8',
      feed: 'apagado', stlbl: 'SIN FEED',
      last: '2025-12-26',
      note: 'Sin feed conectado. La última línea bancaria registrada en Odoo es del 2025-12-26; ' +
            'el panel no tiene información posterior a esa fecha y no puede tenerla hasta que ' +
            'exista una captura para este journal.',
      medido: '2026-09-04', backlog: '301 líneas históricas, 153 sin conciliar' },
    { id: 'bbva-nomina', journal: 96, label: 'BBVA Nómina', co: 1, pais: 'MEX', nm: 'BBVA Nómina MXN', banco: 'BBVA',
      moneda: 'MXN', met: 'Importación de archivo', jt: 'journal 96',
      feed: 'apagado', stlbl: 'SIN MOVIMIENTOS',
      last: null,
      note: 'La cuenta existe en Odoo pero no tiene ni una sola línea bancaria registrada. ' +
            'No hay nada que conciliar todavía.',
      medido: '2026-09-04', backlog: '0 líneas' },
    // ⚠️ MONEDA: este journal lleva `currency_id = USD` EXPLÍCITO sobre una empresa cuya moneda
    // es MXN (company 1). No es el mismo mecanismo que Chase 122/123, que tienen `currency_id`
    // vacío y heredan el USD de su empresa (company 6). Nada de este módulo puede asumir que
    // company 1 ⇒ MXN, ni reutilizar para el journal 75 la cuenta de suspense de los journals
    // MXN de la empresa 1 — es la misma clase de suposición que produjo el bug P1 de Chase
    // (cuentas 17/184 fijas para las dos empresas). El motor de conciliación NO cubre este
    // journal hoy; cuando se abra, la cuenta de suspense se resuelve por journal, no por empresa.
    { id: 'bbva-usd', journal: 75, label: 'BBVA USD', co: 1, pais: 'MEX', nm: 'BBVA USD', banco: 'BBVA',
      moneda: 'USD', met: 'Importación de archivo', jt: 'journal 75',
      feed: 'apagado', stlbl: 'SIN FEED',
      last: '2025-03-20',
      note: 'Cuenta en DÓLARES dentro de la empresa mexicana. Sin feed conectado: la única ' +
            'línea registrada en Odoo es del 2025-03-20.',
      medido: '2026-09-04', backlog: '1 línea, sin conciliar' }
  ];

  // Número de journal de una fuente del server. El contrato de `captura-status` no trae un campo
  // numérico: la referencia viaja como texto en `jt` ("journal 61"). Se acepta `journal` numérico
  // si algún día llega, y si no se extrae del texto. Si no hay ninguno de los dos, devuelve null
  // y la fuente sencillamente no participa del cruce (no se descarta, no se duplica).
  function journalDe(s) {
    if (!s) return null;
    if (typeof s.journal === 'number') return s.journal;
    var m = /(\d+)/.exec(String(s.jt || ''));
    return m ? +m[1] : null;
  }

  // Fusión catálogo ← server. Aditiva y tolerante (CLAUDE.md §8, mitad tolerante):
  //   · toda fuente del server pasa TAL CUAL, sin tocar un solo campo;
  //   · solo se agregan las del catálogo cuyo journal el server no reporta ni en `sources`
  //     ni en `por_journal` (basta que aparezca en cualquiera de los dos para cederle el turno).
  // El resultado es el único lugar donde se construyen tarjetas de fuente.
  function fuentesConCatalogo(serverSources, porJournal) {
    var vivos = {};
    (serverSources || []).forEach(function (s) { var j = journalDe(s); if (j != null) vivos[j] = true; });
    (porJournal || []).forEach(function (p) { if (p && p.journal != null) vivos[p.journal] = true; });
    var extra = CATALOGO_FUENTES.filter(function (c) { return !vivos[c.journal]; }).map(function (c) {
      return {
        id: c.id, co: c.co, pais: c.pais, nm: c.nm, jt: c.jt, met: c.met,
        banco: c.banco, moneda: c.moneda, journal: c.journal,
        st: 'off', stlbl: c.stlbl, note: c.note, medido: c.medido, backlog: c.backlog,
        last: c.last || 'sin movimientos',
        kpi: '—', kpi_label: 'sin datos en el panel',
        movHoy: '—', movMes: '—', run: '—', _catalogo: true
      };
    });
    return (serverSources || []).concat(extra);
  }
  var EP_PENDINGS = '/fin/captura-pendings-status';   // A: preview honesto de pendings Jeeves (Pieza #4 lite). Degrada a nada si inactivo/no disponible.

  var DEFAULT_CRON = { days: [1, 2, 3, 4, 5], start_hour: 7, regular_end_hour: 16, regular_interval_min: 30, peak_hour: 17, peak_interval_min: 10, close_hour: 18, label: 'L–V 7–18h · 30 min · pico 10 min' };

  // ── cron: normaliza a la forma interna {days,start_hour,...}. El mock/DEMO ya la trae; el
  //    backend real (captura-status) emite {timezone, rules:['min hr dom mon dow', ...]} → se parsea
  //    a la forma interna para que el countdown no reviente (bug v0.5.2: nextSync leía cron.days de
  //    un cron sin esa llave → TypeError → toda la carga Real caía al .catch. Fix v0.5.3).
  function parseCronField(field) {
    field = String(field);
    if (field === '*') return null;                 // comodín (cualquier valor)
    var out = [];
    field.split(',').forEach(function (part) {
      var step = 1, base = part, sl = part.split('/');
      if (sl.length === 2) { base = sl[0]; step = parseInt(sl[1], 10) || 1; }
      if (base === '*') { for (var i = 0; i <= 59; i += step) out.push(i); return; }
      var rg = base.split('-');
      if (rg.length === 2) { for (var j = +rg[0]; j <= +rg[1]; j += step) out.push(j); }
      else out.push(+base);
    });
    return out;
  }
  function cronRulesToModel(rules) {
    var m = { days: [1, 2, 3, 4, 5], start_hour: 7, regular_end_hour: 16, regular_interval_min: 30, peak_hour: 17, peak_interval_min: 10, close_hour: 18, label: '' };
    var daysSet = null;
    (rules || []).forEach(function (r) {
      var f = String(r).trim().split(/\s+/); if (f.length < 5) return;
      var mins = parseCronField(f[0]), hours = parseCronField(f[1]), dow = parseCronField(f[4]);
      if (dow) daysSet = dow;
      var hourIsRange = /-/.test(f[1]);
      var minMultiple = /[,*\/-]/.test(f[0]);
      if (hourIsRange && hours && hours.length) {                        // ventana regular
        m.start_hour = hours[0]; m.regular_end_hour = hours[hours.length - 1];
        m.regular_interval_min = (mins && mins.length >= 2) ? (mins[1] - mins[0]) : 30;
      } else if (hours && hours.length === 1 && minMultiple && mins && mins.length >= 2) {  // pico
        m.peak_hour = hours[0]; m.peak_interval_min = mins[1] - mins[0];
      } else if (hours && hours.length === 1) {                          // cierre
        m.close_hour = hours[0];
      }
    });
    if (daysSet) m.days = daysSet;
    m.label = 'L–V ' + m.start_hour + '–' + m.close_hour + 'h · ' + m.regular_interval_min + ' min · pico ' + m.peak_interval_min + ' min';
    return m;
  }
  function normalizeCron(raw) {
    if (!raw) return DEFAULT_CRON;
    if (Array.isArray(raw.days)) return raw;                            // forma interna (mock/DEFAULT)
    if (Array.isArray(raw.rules)) return cronRulesToModel(raw.rules);   // forma real del backend
    return DEFAULT_CRON;
  }

  // ── helpers ──
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null || isNaN(n)) return '—';
    return (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  var amber = function (s) { return '<span class="amber">' + s + '</span>'; };

  // Pieza #2 (v0.5.8): la columna de Estado necesita rowState/stateCell, que viven DENTRO del closure de la
  // vista (leen `state`). COLS es de módulo → no puede verlas. Estos hooks se pueblan desde createView.
  // Default seguro (no ReferenceError) por si se invocan antes de montar la vista — fue la regresión v0.5.7.
  var IP_rowState  = function (r) { return (r && r.ok) ? 'liquidado' : 'pend'; };
  var IP_stateCell = function (r) { return (r && r.ok) ? '<span class="ip-est liq">✓ Conciliado (Liquidado)</span>' : '<span class="ip-est sinc">○ Sin conciliar</span>'; };

  // "Status banco" = EJE BANCO de la taxonomía 3+2 (liquidado / pendiente). Se llamaba "Status Jeeves",
  // pero ya son tres bancos. Función a nivel MÓDULO (COLS es de módulo, no puede ver funciones del
  // closure — lección regresión v0.5.7). Solo depende de `r`, sin `state`.
  // Hoy TODO lo capturado es settled por diseño → 'Liquidado'. Cuando el motor 1 servidor traiga las
  // pendientes, marcarán r.jeeves_status='transito' (o r.jeeves_pending) y aquí dirá 'Pendiente'.
  function statusJeeves(r) {
    var pend = r && (r.jeeves_status === 'transito' || r.jeeves_pending === true);
    return pend ? '<span class="ip-sj tra">◐ Pendiente</span>' : '<span class="ip-sj liq">✓ Liquidado</span>';
  }

  // Columna Candidato: lo que salió del eje Odoo cuando "con/sin documento" dejó de ser un estado de
  // conciliación. NO promete de más: si el server no manda candidatos, dice '—', no "sin documento"
  // (que afirmaría que se buscó y no había). Módulo, solo depende de `r`.
  function candidatoCell(r) {
    if (!r || r.ok) return '<span class="ip-mut">—</span>';
    var n = (typeof r.cand_n === 'number') ? r.cand_n
          : (r.cand && typeof r.cand.length === 'number') ? r.cand.length : null;
    if (n === null) return '<span class="ip-mut">—</span>';
    if (n === 0) return '<span class="ip-cand no">sin candidato</span>';
    return '<span class="ip-cand si">' + n + (n === 1 ? ' candidato' : ' candidatos') + '</span>';
  }

  // Columna Atribución (v0.5.24) — si el gasto está bien imputado, visible SIN intentar conciliar.
  // Planes: 1/18 = proyecto · 2 = centro de costo indirecto · 20 = rubro.
  // El server manda hechos (`ana_planes`, `ana_comp`); el veredicto se arma aquí, así que cambiar
  // la regla de negocio no obliga a tocar el workflow.
  // ⚠ Solo llega poblado en filas YA conciliadas: el nodo de transitivas únicamente resuelve
  // r.ok===true. En las pendientes no hay dato y se pinta '—' — ausencia, no juicio.
  function atribCell(r) {
    var pl = r && r.ana_planes;
    if (!pl || !pl.length) return '<span class="ip-mut">—</span>';
    var proyecto = pl.indexOf(1) >= 0 || pl.indexOf(18) >= 0;
    var indirecto = pl.indexOf(2) >= 0;
    var rubro = pl.indexOf(20) >= 0;
    var po = !!r.po;
    var falta = [];
    if (!rubro) falta.push('rubro');
    if (!po) falta.push('PO');
    if (!proyecto && !indirecto) falta.push('proyecto');
    if (falta.length) return '<span class="ip-atr inc" title="Le falta: ' + esc(falta.join(', ')) + '">⚠ incompleta</span>';
    if (proyecto) return '<span class="ip-atr ok" title="Proyecto + rubro + PO' + (r.ana_comp ? '' : ' · distribución separada: no la capta el budget de 2 ejes, pero la rentabilidad por proyecto sí') + '">✓ completa</span>';
    return '<span class="ip-atr ind" title="Centro de costo indirecto (plan 2) + rubro + PO. Correcto: no todo gasto es de proyecto — no suma a rentabilidad por proyecto.">◐ indirecta</span>';
  }

  // 17 columnas (contrato exacto del v7). vis = visible por default (8).
  var COLS = [
    { k: 'd',    lbl: 'Fecha',        vis: true,  hdrTitle: 'Fecha de liquidación (settled) en Jeeves. Mañana se agrega "Fecha transacción" (la que casa con PO/Bill).', cls: 'style="font-family:var(--ip-mono);font-size:12.5px"', fmt: function (r) { return esc(r.d); } },
    { k: 'j',    lbl: 'Instrumento',  vis: true,  fmt: function (r) { return '<span class="jtag">' + esc(r.j) + '</span>'; } },
    { k: 'tipo', lbl: 'Tipo',         vis: false, fmt: function (r) { return esc(r.tipo); } },
    { k: 'ref',  lbl: 'Descripción',  vis: true,  fmt: function (r) { return esc(r.ref); } },
    { k: 'tarj', lbl: 'Tarjeta',      vis: false, fmt: function (r) { return esc(r.tarj) || '—'; } },
    { k: 'comp', lbl: 'Comprador',    vis: true,  fmt: function (r) { return esc(r.comp) || '—'; } },
    { k: 'rs',   lbl: 'Razón social', vis: false, fmt: function (r) { return esc(r.rs); } },
    { k: 'art',  lbl: 'Artículo',     vis: false, fmt: function (r) { return esc(r.art) || '—'; } },
    { k: 'ana',  lbl: 'Analítica',    vis: true,  fmt: function (r) { return r.ana ? esc(r.ana) : amber('—'); } },
    { k: 'po',   lbl: 'PO',           vis: true,  fmt: function (r) { return r.po ? esc(r.po) : amber('—'); } },
    { k: 'bill', lbl: 'Bill',         vis: true,  fmt: function (r) { return r.bill ? esc(r.bill) : amber('—'); } },
    { k: 'sb',   lbl: 'Status bill',  vis: false, fmt: function (r) { return r.sb ? esc(r.sb) : amber('—'); } },
    { k: 'ff',   lbl: 'Folio fiscal', vis: false, fmt: function (r) { return r.ff ? '<span style="font-family:var(--ip-mono);font-size:11.5px">' + esc(r.ff) + '</span>' : amber('—'); } },
    { k: 'tk',   lbl: 'Ticket',       vis: false, fmt: function (r) { return esc(r.tk) || '—'; } },
    { k: 'mon',  lbl: 'Moneda',       vis: false, fmt: function (r) { return esc(r.mon); } },
    { k: 'amt',  lbl: 'Monto',        vis: true,  cls: function (r) { return 'class="amt ' + (r.amt < 0 ? 'neg' : 'pos') + '"'; }, fmt: function (r) { return money(r.amt); } },
    { k: 'ok',   lbl: 'Estado con Odoo', vis: true, cls: function (r) { return 'class="st est-' + IP_rowState(r) + '"'; }, fmt: function (r) { return IP_stateCell(r); } },
    // EJE BANCO de la taxonomía 3+2. Es COLUMNA y no filtro a propósito: toda fila de esta tabla
    // es liquidada por construcción (las pendientes viven en "En tránsito"), así que un filtro de
    // un solo valor posible confundiría más de lo que informa.
    { k: 'sj',   lbl: 'Status banco', vis: true,  fmt: function (r) { return statusJeeves(r); } },
    // Sale del eje Odoo: "con/sin documento" no es un estado de conciliación, es si HAY candidato.
    { k: 'cand', lbl: 'Candidato',    vis: false, fmt: function (r) { return candidatoCell(r); } },
    { k: 'atr',  lbl: 'Atribución',   vis: true,  fmt: function (r) { return atribCell(r); } }
  ];
  // data-lbl viaja SIEMPRE, no solo en móvil: en pantalla angosta la tabla se convierte en
  // tarjetas (una fila = un bloque) y cada celda necesita su propia etiqueta, porque el thead
  // desaparece. Sin esto, en el celular se veían 12 columnas comprimidas a ~27 px cada una,
  // con la fecha partida en tres renglones y la columna de estado —la única que dice qué
  // hacer— fuera de pantalla y sin scroll horizontal al que llegar.
  function colAttr(col, r) {
    var a = typeof col.cls === 'function' ? col.cls(r) : (col.cls || '');
    return a + ' data-lbl="' + esc(col.lbl || '') + '"';
  }

  // ═══ vista ═══
  function createView(container) {
    var state = {
      mode: currentMode(),
      allRows: [], sources: [], sourcesServer: [], runs: [], cron: DEFAULT_CRON,
      porJournal: [],          // v0.5.15: universo de journals que reporta el server (captura-status.por_journal).
                               // El filtro y el semáforo se derivan de AQUÍ, nunca de una lista escrita a mano.
      // v0.5.16 — ventana RODANTE (inicio del mes pasado → hoy). Antes estaba clavada en
      // '2026-07-01'→'2026-07-18', la fecha en que se construyó el módulo: a los días empezó a
      // ocultar todo lo nuevo, y con los chips habría sido peor — contarían sobre esa rebanada
      // mientras la tarjeta de fuente (que no filtra por fecha) muestra el universo completo.
      filters: { journal: '', estado: '', tipo: '', edad: '', from: defaultFrom(), to: hoyCst(), search: '' },
      sortK: 'd', sortDir: -1,
      pageSize: 100, page: 1,
      sel: {},                 // rowId -> true
      loading: false, error: null, loadProgress: null, partialLoad: null,
      timer: null,
      // Etapa C — conciliación
      today: null,             // panel "Hoy" (3 cubetas)
      intransit: [],           // movimientos en tránsito (pendings)
      suggByRow: {},           // demo: sugerencias precargadas del mock, por índice de row
      expanded: null,          // _id de la ÚNICA fila expandida (acordeón), o null
      sugg: {},                // _id -> {loading, cand:{nivel,candidatos}, sel:idx, result, error}
      preconc: {},             // line_id -> {bill_aml_id, bill_name, by, ts} → estado 'En tránsito' (Pieza #3; hoy vacío en real)
      colFilters: {},          // colKey -> array de valores permitidos (filtro por columna estilo Excel). Ausente = sin filtro.
      pendings: null           // A: {disponible, pendings_count, pendings_suma, ultimo_settled_date, muestra} del preview de pendings Jeeves
    };

    // v0.5.16 — Real es el ÚNICO modo con superficie en la UI. Demo perdió su selector, su banner
    // y la pantalla "Sin datos"; sobrevive como ESCOTILLA DE CONSOLA:
    //     localStorage.setItem('fts_fin_mode_instrumentos-pago','demo')
    // No es un adorno: el gate obligatorio de render (scripts/local/smoke-front.js) monta el módulo
    // por esa rama. Borrarla obligaría a reescribir el harness — la red que atrapó el ReferenceError
    // de v0.5.7 — y ese riesgo no se paga solo. Cualquier otro valor (incluido 'empty', que ya no
    // existe como estado) cae a real.
    function currentMode() {
      var stored = null;
      try { stored = localStorage.getItem('fts_fin_mode_' + MODULE_ID); } catch (e) { stored = null; }
      return (stored === 'demo') ? 'demo' : 'real';
    }

    var q  = function (s) { return container.querySelector(s); };
    var qa = function (s) { return Array.prototype.slice.call(container.querySelectorAll(s)); };

    // Cablea los hooks de módulo a las funciones de este closure (rowState/stateCell son declaraciones
    // hoisted, disponibles aquí). Sin esto, COLS.ok llama al default seguro y no rompe (v0.5.8 fix).
    IP_rowState = rowState; IP_stateCell = stateCell;

    // ── ciclo de vida ──
    function mount() {
      // El sidebar (js/router.js) pinta un state-dot por módulo con class = FinState.getMode(id).
      // Sin selector, este módulo dejaría de escribir su modo y el puntito diría "empty" — mentira.
      // Se sella aquí, sin tocar state.js ni router.js (los comparten facturas y bills).
      try { if (state.mode === 'real') window.FinState.setMode(MODULE_ID, 'real'); } catch (e) {}
      window.FinState.subscribe(function (evt) {
        if (!document.body.contains(container)) return;      // vista desmontada
        if (evt.type === 'mode' && evt.id === MODULE_ID) { state.mode = currentMode(); state.sel = {}; render(); load(); }
        if (evt.type === 'companies') { if (state.mode === 'real') { load(); } else { renderSources(); paintTable(); } }
      });
      render();
      load();
    }

    // ── carga de datos ──
    // load(opts)
    //   opts.quiet     — no blanquea la pantalla con el estado de carga. La tabla vieja se
    //                    queda visible hasta que llegan los datos nuevos. Para la relectura
    //                    post-conciliación: el usuario acaba de trabajar, y ver desaparecer la
    //                    tabla es el peor momento para cobrarle una pantalla de carga.
    //   opts.keepSugg  — preserva la caché de sugerencias entre cargas.
    //   opts.dropId    — line_id (r.id) cuya sugerencia SÍ se tira (la recién conciliada).
    function load(opts) {
      opts = opts || {};
      // Snapshot de sugerencias ANTES de recargar. Se indexa por r.id (el line_id de Odoo),
      // NUNCA por _id: _id es el índice del array que ingest() reasigna en cada carga, así que
      // restaurar por índice pegaría las sugerencias de una línea en OTRA fila si el server
      // devuelve distinto orden o distinto número de filas. Ese fallo sería silencioso y grave.
      var _suggPrev = null;
      if (opts.keepSugg) {
        _suggPrev = {};
        state.allRows.forEach(function (r) {
          var sg = state.sugg[r._id];
          // Se preserva también la marca `pedido` (sin candidatos): saber que YA se le preguntó
          // al server por esa línea es tan valioso como la respuesta misma — sin eso, la
          // recarga silenciosa post-conciliación la vuelve a pedir, que es justo el gasto que
          // R3 vino a quitar.
          if (sg && (sg.cand || sg.pedido) && r.id != null && r.id !== opts.dropId) _suggPrev[r.id] = sg;
        });
      }
      state.error = null; state.partialLoad = null; state.loadProgress = null;
      if (!opts.quiet) { state.loading = true; render(); }
      // Preservar el scroll también aquí: render() reconstruye el contenedor entero y el fix
      // de v0.5.29 solo cubre paintTable(). Mismo mecanismo, ya probado en este archivo.
      var _scL = null;
      try { _scL = (window.pageYOffset != null) ? window.pageYOffset : (document.scrollingElement || document.documentElement).scrollTop; } catch (e) { }
      var _restaurarL = function () {
        if (_scL == null) return;
        try {
          var el = document.scrollingElement || document.documentElement;
          var ahora = (window.pageYOffset != null) ? window.pageYOffset : el.scrollTop;
          if (Math.abs(ahora - _scL) > 1) { if (window.scrollTo) window.scrollTo(0, _scL); else el.scrollTop = _scL; }
        } catch (e) { }
      };
      // Re-ata las sugerencias al _id NUEVO de cada fila, casando por line_id.
      var _restaurarSugg = function () {
        if (!_suggPrev) return;
        state.allRows.forEach(function (r) {
          if (r.id != null && _suggPrev[r.id]) state.sugg[r._id] = _suggPrev[r.id];
        });
      };
      if (state.mode === 'demo') {
        fetch(MOCK_PATH, { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (data) { ingest(data.rows || [], data.sources || [], data.runs || [], data.cron || DEFAULT_CRON, { today: data.today || null, porJournal: data.por_journal || [], intransit: data.intransit || [], suggByRow: data.suggestions || {} }); state.preconc = data.preconc || {}; state.loading = false; _restaurarSugg(); try { evalSugg(); } catch (e) { if (window.console) console.warn('[ip] evalSugg demo falló (no bloquea):', e); } render(); _restaurarL(); afterData(); })
          .catch(function (e) { state.loading = false; state.error = 'No se pudo cargar el mock: ' + e.message; render(); });
        return;
      }
      // real: status (fuentes/runs/cron) + transacciones PAGINADAS (acumula todas las páginas hasta has_more=false).
      var params = { companies: window.FinState.getCompanies() };
      Promise.all([
        window.FinClient.call(EP_STATUS, params),
        loadTx()
      ]).then(function (res) {
        var st = res[0] || {}, txAll = res[1] || { rows: [] };
        // captura-status.hoy es opcional (B.2 pendiente): si no llega, degrada elegante sin romper.
        var today = st.hoy || { en_transito: { disponible: false }, conciliable_pendiente: null, conciliadas_hoy: null, _degradado: true };
        // metricas/serie vienen del server: el backlog PRE-corte no está en allRows (la ventana
        // por defecto arranca el mes pasado), así que el semáforo A no se puede calcular aquí.
        ingest(txAll.rows || [], st.sources || [], st.runs || [], st.cron || DEFAULT_CRON, { today: today, porJournal: st.por_journal || [], intransit: st.intransit || [], suggByRow: {}, metricas: st.metricas || null, serie: st.serie || [] });
        state.loading = false; state.loadProgress = null;
        _restaurarSugg();   // antes de render() y de evalSugg(): el estado ya se pinta con lo cacheado
        // carga parcial: nunca fingir que está completo → aviso visible; los agregados reflejan solo lo cargado.
        state.partialLoad = txAll.partial ? { loaded: (txAll.rows || []).length, total: (txAll.pagination && txAll.pagination.total_count) || null, reason: txAll.reason || null } : null;
        render(); _restaurarL(); afterData();
        // Un solo universo (v0.5.37). La ventana por defecto arrancaba el día 1 del mes pasado,
        // que hoy cae DESPUÉS del corte: el semáforo medía desde el 24-jul y la tabla desde el
        // 1-ago, así que sus números no se podían comparar aunque los dos fueran ciertos.
        // Al conocer el corte (solo lo sabe el server) se amplía la ventana hasta él, UNA vez y
        // solo si el usuario no tocó las fechas — si ya eligió un rango, manda el usuario.
        if (!state._corteAplicado && state.metricas && state.metricas.fecha_corte &&
            !state._fechasTocadas && state.filters.from > state.metricas.fecha_corte) {
          state._corteAplicado = true;
          state.filters.from = state.metricas.fecha_corte;
          load();
        }
        // Pieza #2: batch de sugerencias en 2o plano. try/catch DURO: pase lo que pase, evalSugg NUNCA tumba load()
        // (la tabla ya está pintada; su fallo solo deja estados neutros).
        try { evalSugg(); } catch (e) { if (window.console) console.warn('[ip] evalSugg falló (no bloquea la tabla):', e); }
        try { loadPendings(); } catch (e) { if (window.console) console.warn('[ip] loadPendings falló (no bloquea):', e); }   // A: nota de pendings en 2o plano
      }).catch(function (err) {
        state.loading = false; state.loadProgress = null;
        state.error = (err && err.msg) || (err && err.code) || 'Error al consultar el servidor.';
        render();
      });
    }
    // v0.5.20 — UNA sola llamada. Antes se pedía page=1..N acumulando hasta has_more=false, pero el
    // server ya traía el universo COMPLETO de Odoo en cada página para devolver una rebanada:
    // paginábamos para volver a juntar, multiplicando por 6 el mismo barrido (~4 s cada uno).
    // El bucle acumulador y el tope de 60 páginas se ELIMINARON, no se dejaron inertes — un bucle
    // muerto que alguien reactive después es peor que el problema que resolvía.
    // `partial` sobrevive con significado nuevo: ahora es el tope DEL SERVER (pagination.truncado),
    // no una página caída. El aviso rojo de carga parcial sigue funcionando sin cambios.
    function loadTx() {
      return new Promise(function (resolve) {
        setLoadProgress(0, null);
        window.FinClient.call(EP_TX, txParams()).then(function (tx) {
          var rows = (tx && tx.rows) || [], pag = (tx && tx.pagination) || null;
          setLoadProgress(rows.length, pag && pag.total_count);
          var trunc = !!(pag && pag.truncado);
          resolve({
            rows: rows, pagination: pag, partial: trunc,
            reason: trunc ? ('el rango pedido tiene ' + pag.total_count + ' líneas y el tope del server es ' + pag.cap + ' — acota las fechas') : null
          });
        }).catch(function (err) {
          // Sin acumulado que preservar: si la única llamada falla, no hay nada cargado y se dice.
          resolve({ rows: [], pagination: null, partial: true, reason: 'no se pudo cargar' + (err && err.code ? ' (' + err.code + ')' : '') });
        });
      });
    }
    function setLoadProgress(loaded, total) {
      state.loadProgress = { loaded: loaded, total: total };
      var el = q('#ip-loader'); if (el) el.textContent = 'Cargando ' + loaded + ' de ' + (total || '?') + ' líneas…';
    }
    function txParams() {
      var f = state.filters;
      return {
        // Solo lo que ACOTA EL UNIVERSO. `estado` y `search` se quitaron a propósito: filtran en
        // cliente sobre lo ya cargado, y mandarlos al server dejaba el universo pre-recortado, que
        // además hacía mentir a los chips (cuentan sobre el universo, no sobre lo filtrado).
        // Solo las FECHAS acotan el universo. `journal` salió (v0.5.20): visibleRows YA lo filtraba
        // en cliente, así que mandarlo al server era pagar una recarga completa por un subconjunto
        // que la tabla ya sabía calcular. Ahora el universo trae los tres journals y cambiar de
        // journal es instantáneo.
        companies: window.FinState.getCompanies(),
        date_from: f.from || null, date_to: f.to || null,
        // V1.02: 500 se quedó corto. La ventana por defecto arranca en el corte y el universo
        // post-corte de los tres journals ya son ~565 líneas, así que la carga salía recortada
        // y el semáforo no podía descomponer el pendiente de ninguna fuente. El tope del server
        // es 6000 y no hace trabajo extra por página —ya trae el universo completo de Odoo para
        // devolver una rebanada—, así que subirlo cuesta payload, no tiempo de Odoo.
        limit: 2000, offset: 0
      };
    }
    function ingest(rows, sources, runs, cron, extra) {
      rows.forEach(function (r, i) { r._id = i; });
      state.allRows = rows; state.runs = runs; state.cron = normalizeCron(cron);
      // V1.09 — las fuentes que el server reporta pasan intactas; el catálogo solo rellena
      // los journals que todavía no reporta nadie. Se resuelve DESPUÉS de porJournal porque
      // la fusión mira las dos listas para decidir a quién le toca el turno.
      state.sourcesServer = sources || [];
      extra = extra || {};
      state.today = extra.today || null;
      state.porJournal = extra.porJournal || [];
      state.sources = fuentesConCatalogo(state.sourcesServer, state.porJournal);
      state.metricas = extra.metricas || null;   // {fecha_corte, cumplimiento{...}, deuda{...}}
      state.serie = extra.serie || [];           // puntos históricos del CBWATCH
      state.intransit = extra.intransit || [];
      state.suggByRow = extra.suggByRow || {};
      state.expanded = null;   // reset acordeón en cada carga
      state.sugg = {};         // limpia caché de sugerencias/resultados
    }
    function afterData() { startCountdown(); }

    // ── #4a: "Sincronizar transacciones" — corrida de captura on-demand (fin/captura-sync-now) ──
    function syncNow() {
      var btn = q('#ip-syncnow'), note = q('#ip-syncnote');
      if (state.mode !== 'real') { if (note) note.textContent = 'El sincronizador solo opera en modo Real.'; return; }
      if (btn) { btn.disabled = true; btn.classList.add('busy'); }
      if (note) { note.textContent = 'Sincronizando captura…'; note.className = 'ip-toolbar-note load'; }
      window.FinClient.call(EP_SYNC_NOW, { origen: 'boton-refresh' })
        .then(function (data) {
          if (!data || (data.ok !== true && data.nuevas == null && data._ran !== true)) {
            // endpoint sin activar → n8n 404 sin shape → degrada elegante
            if (note) { note.textContent = 'Sincronizador no disponible aún (endpoint sin activar).'; note.className = 'ip-toolbar-note na'; }
            return;
          }
          var resumen = (data.nuevas != null) ? (' — ' + data.nuevas + ' nuevas · ' + (data.duplicadas || 0) + ' dup.' + (data.rechazadas ? ' · ' + data.rechazadas + ' rech.' : '')) : '';
          if (note) { note.textContent = 'Captura lista' + resumen + '. Recargando…'; note.className = 'ip-toolbar-note ok'; }
          setTimeout(function () { if (document.body.contains(container)) load(); }, 900);
        })
        .catch(function (err) {
          var code = (err && err.code) || '';
          var na = code === 'NETWORK' || code === 'BAD_RESPONSE' || (err && err.http === 404);
          if (note) { note.textContent = na ? 'Sincronizador no disponible (endpoint inactivo).' : ('Error: ' + ((err && err.msg) || code || 'no se pudo sincronizar.')); note.className = 'ip-toolbar-note ' + (na ? 'na' : 'err'); }
        })
        .then(function () { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } });
    }

    // ── A: preview de pendings Jeeves (nota junto al botón Sincronizar) ──
    function paintPendNote() {
      var el = q('#ip-pendnote'); if (!el) return;
      var p = state.pendings;
      // Un fallo de lectura NO se pinta igual que "no hay nada": vacío y roto se ven idénticos.
      if (p && p._error) { el.innerHTML = '<span class="ip-pend err">◔ No se pudo consultar el banco</span>'; return; }
      if (!p || !p.disponible || !p.pendings_count) { el.innerHTML = ''; return; }
      var tip = (p.muestra || []).map(function (m) { return pfFecha(m) + ' · ' + pfCom(m) + ' · ' + money(pfMonto(m)); }).join('\n');
      el.innerHTML = '<span class="ip-pend" title="' + esc(tip || 'movimientos en tránsito') + '">◔ Últimos liquidados: <b>' + esc(p.ultimo_settled_date || '—') + '</b> · <b>' + p.pendings_count + '</b> en tránsito (~' + money(p.pendings_suma) + ') sin liquidar aún</span>';
    }
    function pintarPendings() { paintPendNote(); try { renderIntransit(); } catch (e) { } }
    function loadPendings() {
      if (state.mode !== 'real') { state.pendings = null; pintarPendings(); return; }
      window.FinClient.call(EP_PENDINGS, {})
        .then(function (data) {
          state.pendings = (data && typeof data === 'object' && ('disponible' in data)) ? data : { disponible: false, _error: true };
          pintarPendings();
        })
        .catch(function () { state.pendings = { disponible: false, _error: true }; pintarPendings(); });   // el banco no contestó — se dice, no se calla
    }

    // ── filtros por columna estilo Excel (categóricas) ──
    var FILTERABLE_COLS = { ok: 'Estado con Odoo', j: 'Journal', comp: 'Comprador', tarj: 'Tarjeta', mon: 'Moneda' };
    function colValueOf(k, t) {
      if (k === 'ok') return rowState(t);                 // Estado = los 5 estados de primer nivel (no t.ok crudo)
      var v = t[k];
      return (v == null || v === '') ? '—' : String(v);
    }
    // Etiquetas del filtro por columna. Seguían siendo las del eje de 5 valores muerto en
    // v0.5.16, mientras colValueOf('ok') ya devolvía los del eje B → ninguna llave matcheaba
    // y el `|| v` dejaba ver las crudas: 'conciliada', 'sindoc', 'pendiente', 'noevaluada'.
    function colValLabel(k, v) {
      if (k === 'ok') {
        var m = {
          conciliada: 'Conciliada', parcial: 'Conciliada parcial', preconciliada: 'Pre-conciliada',
          desconciliada: 'Desconciliada', condoc: 'Con documento', sindoc: 'Sin documento', noevaluada: 'No evaluada',
          devolucion_pend: 'Devolución', fondeo_pend: 'Fondeo', pendiente: 'Sin conciliar'
        };
        return m[v] || v;
      }
      return v;
    }
    function colFiltersPass(t) {
      var cf = state.colFilters || {};
      for (var k in cf) {
        if (!Object.prototype.hasOwnProperty.call(cf, k)) continue;
        var allowed = cf[k];
        if (allowed == null) continue;                    // sin filtro en esta columna
        if (allowed.indexOf(colValueOf(k, t)) < 0) return false;   // array vacío = nada matchea (correcto)
      }
      return true;
    }
    function uniqueColValues(k) {
      var seen = {}, out = [];
      state.allRows.forEach(function (t) { var v = colValueOf(k, t); if (!Object.prototype.hasOwnProperty.call(seen, v)) { seen[v] = true; out.push(v); } });
      if (k === 'ok') { var order = ['conciliada', 'parcial', 'desconciliada', 'preconciliada', 'condoc', 'sindoc', 'pendiente', 'noevaluada', 'devolucion_pend', 'fondeo_pend']; out.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); }); }
      else out.sort(function (a, b) { return String(colValLabel(k, a)).toLowerCase().localeCompare(String(colValLabel(k, b)).toLowerCase()); });
      return out;
    }
    function closeColFilter() { var pop = q('#ip-cfpop'); if (pop) { pop.style.display = 'none'; pop.removeAttribute('data-col'); } }
    function openColFilter(k, anchor) {
      var pop = q('#ip-cfpop'); if (!pop) return;
      if (pop.getAttribute('data-col') === k && pop.style.display === 'block') { closeColFilter(); return; }   // toggle mismo
      var vals = uniqueColValues(k);
      var sel = state.colFilters[k] || null;   // null = todos
      pop.innerHTML =
        '<div class="ip-cfhead">Filtrar · <b>' + esc(FILTERABLE_COLS[k] || k) + '</b></div>' +
        '<input class="ip-cfsearch" id="ip-cfq" placeholder="Buscar valor…" autocomplete="off">' +
        '<div class="ip-cfacts"><a id="ip-cfall">Seleccionar todo</a><a id="ip-cfnone">Nada</a></div>' +
        '<div class="ip-cflist" id="ip-cflist">' + vals.map(function (v) {
          var chk = !sel || sel.indexOf(v) >= 0;
          return '<label class="ip-cfitem" data-lbl="' + esc(String(colValLabel(k, v) + ' ' + v).toLowerCase()) + '"><input type="checkbox" data-cfv="' + esc(v) + '"' + (chk ? ' checked' : '') + '><span>' + esc(colValLabel(k, v)) + '</span></label>';
        }).join('') + '</div>' +
        '<div class="ip-cffoot"><button class="ip-cfapply" id="ip-cfapply">Aplicar</button><button class="ip-cfclear" id="ip-cfclear">Limpiar</button></div>';
      pop.setAttribute('data-col', k);
      pop.style.display = 'block';
      var rc = anchor.getBoundingClientRect(); var W = 250;
      pop.style.left = Math.round(Math.max(8, Math.min((rc.left || 0), (window.innerWidth || 1200) - W - 8))) + 'px';
      pop.style.top = Math.round((rc.bottom || 0) + 4) + 'px';
      var cfq = q('#ip-cfq');
      if (cfq) { try { cfq.focus(); } catch (e) {} cfq.addEventListener('input', function () { var s = cfq.value.toLowerCase(); qa('#ip-cflist .ip-cfitem').forEach(function (it) { it.style.display = it.getAttribute('data-lbl').indexOf(s) >= 0 ? '' : 'none'; }); }); }
      var all = q('#ip-cfall'); if (all) all.addEventListener('click', function () { qa('#ip-cflist .ip-cfitem').forEach(function (it) { if (it.style.display !== 'none') { var x = it.querySelector('input'); if (x) x.checked = true; } }); });
      var none = q('#ip-cfnone'); if (none) none.addEventListener('click', function () { qa('#ip-cflist .ip-cfitem').forEach(function (it) { if (it.style.display !== 'none') { var x = it.querySelector('input'); if (x) x.checked = false; } }); });
      var apply = q('#ip-cfapply'); if (apply) apply.addEventListener('click', function () { applyColFilter(k); });
      var clr = q('#ip-cfclear'); if (clr) clr.addEventListener('click', function () { delete state.colFilters[k]; closeColFilter(); state.page = 1; paintTable(); });
    }
    function applyColFilter(k) {
      var boxes = qa('#ip-cflist input[data-cfv]');
      var chosen = boxes.filter(function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-cfv'); });
      if (chosen.length === boxes.length) delete state.colFilters[k];   // todo = sin filtro
      else state.colFilters[k] = chosen;                                // subconjunto (o [] = nada)
      closeColFilter(); state.page = 1; paintTable();
    }

    // ── filtrado / orden (cliente) ──
    // opts.ignoreEstado: omite el eje de conciliación (estado/edad) para que los chips cuenten
    // sobre el MISMO universo que la tabla dibuja, sin contarse a sí mismos.
    function visibleRows(opts) {
      opts = opts || {};
      var f = state.filters, s = (f.search || '').toLowerCase();
      var fEstado = opts.ignoreEstado ? '' : f.estado;
      var fEdad   = opts.ignoreEstado ? '' : f.edad;
      var cos = window.FinState.getCompanies();
      // Filtro de empresa TOLERANTE (3 niveles). El demo trae company_id (id); el endpoint real trae rs (razón social) sin id.
      // Clave: distinguir "rs RECONOCIDO pero deseleccionado" (chip apagado → ocultar, filtro legítimo) de "rs DESCONOCIDO"
      // (typo/null/razón nueva → MOSTRAR, fail-open + warn). Ocultar dinero en silencio es el peor modo de fallo, pero eso
      // SOLO aplica a lo desconocido — NO a una empresa reconocida que el usuario deseleccionó a propósito.
      var RS_BY_ID = { 1: 'Servicios FTS', 6: 'FTS LLC' };
      var ALL_RS = Object.keys(RS_BY_ID).map(function (k) { return RS_BY_ID[k]; });   // TODAS las razones sociales reconocidas
      var cosRs = cos.map(function (id) { return RS_BY_ID[id]; });                    // solo las SELECCIONADAS
      var rows = state.allRows.filter(function (t) {
        var okCompany;
        if (t.company_id != null) {                                                  // 1: contrato con id (demo)
          okCompany = cos.indexOf(t.company_id) >= 0;
        } else if (t.rs != null && ALL_RS.indexOf(t.rs) >= 0) {                       // 2: rs RECONOCIDO → filtro por selección (chip apagado oculta)
          okCompany = cosRs.indexOf(t.rs) >= 0;
        } else {                                                                     // 3: rs null o NO reconocido → fail-open + warn
          okCompany = true;
          if (window.console && console.warn) console.warn('[instrumentos-pago] fila sin company_id ni rs reconocido — MOSTRADA (fail-open):', t.id, t.rs);
        }
        return okCompany &&
          (!f.journal || t.j === f.journal) &&
          (!fEstado || matchEstado(fEstado, t)) &&
          matchEdad(fEdad, t) &&
          (!f.tipo || rowTipo(t) === f.tipo) &&
          colFiltersPass(t) &&                                        // filtros por columna estilo Excel (se COMBINAN con los demás)
          (!s || Object.keys(t).map(function (k) { return t[k]; }).join(' ').toLowerCase().indexOf(s) >= 0) &&
          (!f.from || t.d >= f.from) && (!f.to || t.d <= f.to);
      });
      var k = state.sortK, dir = state.sortDir;
      rows.sort(function (a, b) {
        var va = a[k], vb = b[k];
        if (typeof va === 'boolean') { va = +va; vb = +vb; }
        if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
        return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
      });
      return rows;
    }

    // ── render principal (shell) ──
    function render() {
      var html = '<div class="page ip-view">';
      // v0.5.17 — header lean. El block-tag y el título duplicaban LITERALMENTE la topbar del
      // shell (bcBlock y bcCurrent), que es position:sticky: la identidad del módulo no sale
      // nunca de la pantalla, así que repetirla debajo era costo puro. El subtítulo describía
      // el módulo a quien ya está dentro. Quedan las tres piezas que sí sirven, en un renglón:
      // selector de empresas (funcional), engrane (acciones) y badge de build (evidencia).
      html += '<div class="ip-head"><div id="ip-companies" style="flex:1"></div>' +
              gearHtml() + '<span class="ip-ver" title="versión desplegada">' + IP_BUILD + '</span></div>';

      // v0.5.16: sin selector de modo, el estado 'empty' dejó de ser alcanzable y su pantalla se
      // eliminó. El banner DEMO solo aparece por la escotilla de consola (ver currentMode).
      if (state.mode === 'demo') html += '<div class="demo-banner"><b>DEMO</b> · datos ficticios de muestra, no provienen de Odoo.</div>';

      if (state.loading) { html += '<div class="loader" id="ip-loader" style="padding:30px;text-align:center;color:var(--steel)">' + (state.loadProgress ? ('Cargando ' + state.loadProgress.loaded + ' de ' + (state.loadProgress.total || '?') + ' líneas…') : 'Cargando…') + '</div></div>'; container.innerHTML = html; wireHead(); return; }
      // Error CON salida: Demo ya no es el escape, así que la pantalla no puede ser un callejón.
      if (state.error)   {
        html += '<div class="empty-state"><div class="icon">⚠</div><div class="title">No se pudo cargar</div>' +
                '<div class="mono">' + esc(state.error) + '</div>' +
                '<div style="margin-top:16px"><button class="ip-btn" id="ip-retry">⟳ Reintentar</button></div>' +
                '<div style="margin-top:10px;font-size:12px;color:var(--steel)">Si insiste, el backend (n8n) puede estar caído. Los datos en Odoo no se ven afectados.</div>' +
                '</div></div>';
        container.innerHTML = html; wireHead(); return;
      }
      if (state.partialLoad) {
        html += '<div class="ip-partial" style="margin:12px 0;padding:10px 14px;border:1px solid #c0392b;border-radius:8px;background:rgba(192,57,43,.10);color:#c0392b;font-size:13px;font-weight:500">⚠ Carga parcial: ' + state.partialLoad.loaded + ' de ' + (state.partialLoad.total || '?') + ' líneas' + (state.partialLoad.reason ? ' — ' + esc(state.partialLoad.reason) : '') + '. Recarga para reintentar. Los agregados y el semáforo reflejan SOLO lo cargado.</div>';
      }

      html += '<h2>Instrumentos sincronizados</h2><div class="srcgrid" id="ip-srcgrid"></div>';

      // v0.5.16: el semáforo sube aquí, pegado a las fuentes que evalúa (antes vivía después de "Hoy").
      html += '<h2>Semáforo de conciliación — Admin</h2><div class="sem"><div id="ip-semrows"></div>' +
              '<div class="semnote"><b>Desde el corte</b> — el color mide <b>lo que falta por conciliar</b>, no el porcentaje: ' +
              'verde cuando no queda nada que hacer (aunque el % no llegue a 100 porque hay fondeos o devoluciones), ' +
              'amarillo a tiro, rojo lejos. ' +
              '<b>Backlog</b> — no tiene color: es deuda que se vacía, no una meta que se cumple. ' +
              'Las fuentes marcadas <b>sin abrir</b> se miden igual que las demás, y su 0% dice ' +
              '<i>no empezado</i>, no <i>fracasado</i>: nadie ha abierto ese journal en el motor todavía.</div></div>';

      html += '<h2>Transacciones</h2>' +
        '<div class="ip-toolbar">' +
          // El botón solo dispara la captura de Jeeves. Con tres fuentes en pantalla, llamarlo
          // "Sincronizar transacciones" prometía que tocaba las tres; Chase la sincroniza Odoo.
          '<button class="ip-refresh" id="ip-syncnow" title="Dispara una corrida extra de captura SOLO para Jeeves (mismo rango/traslape/dedupe que el cron). Chase lo sincroniza Odoo/Plaid por su cuenta.">⟳ Capturar Jeeves ahora</button>' +
          '<button class="ip-refresh gated" id="ip-concilianow" disabled title="Pendiente de habilitar: el workflow fin/concilia-now sigue inactivo y su webhook responde 404. Ver docs/finanzas/BANCOS_UI_FUENTES.md.">⟳ Autoconciliar ahora</button>' +
          '<span class="ip-toolbar-note" id="ip-syncnote"></span>' +
          '<span class="ip-pendnote" id="ip-pendnote"></span>' +
        '</div>' +
        '<div class="ip-chips" id="ip-chips"></div>' +
        '<div class="panel">' + filtersHtml() +
              '<div class="selbanner" id="ip-selbanner"></div>' +
              '<div id="ip-tblwrap"></div>' +
              '<div class="tfoot"><span id="ip-aggs"></span><span class="pager" id="ip-pager"></span></div></div>';

      // v0.5.16: el panel "Hoy" se disolvió en los chips sobre la tabla (su valor era el filtrado
      // rápido, y eso pertenece a la tabla). "En tránsito" y "Últimas corridas" bajan a un acordeón
      // cerrado: no se borran — ambas responden "cómo se está portando el pipeline", que es
      // diagnóstico, no trabajo pendiente. No van tras el engrane porque ese menú es de ACCIONES.
      html += '<details class="ip-diag" id="ip-diag">' +
                '<summary>Diagnóstico de captura <span class="ip-diag-hint">en tránsito · últimas corridas</span></summary>' +
                '<div class="ip-diag-body">' +
                  '<h3>En tránsito <span class="ip-diag-sub">movimientos que el banco aún no liquida — no son filas de la tabla</span></h3>' +
                  '<div class="panel" id="ip-intransit"></div>' +
                  '<h3>Últimas corridas de captura</h3>' +
                  '<div class="panel"><table class="runs">' +
                    '<thead><tr><th>Run</th><th>Origen</th><th>Rango</th><th>Nuevas</th><th>Dup.</th><th>Rech.</th><th>Status</th></tr></thead>' +
                    '<tbody id="ip-runsbody"></tbody></table></div>' +
                '</div></details>';

      html += '<div class="ip-cfpop" id="ip-cfpop" style="display:none"></div>';   // popup flotante del filtro por columna (Excel-style)
      html += '<div class="ip-toast" id="ip-toast"></div>';
      html += '</div>';
      container.innerHTML = html;

      wireHead();
      wireFilters();
      renderSources();
      renderRuns();
      renderIntransit();
      buildColMenu();
      paintTable();
      paintChips();
    }

    // ── head: gear + mode toggle + company selector ──
    function gearHtml() {
      return '<div class="ip-gearwrap"><button class="gear" id="ip-gear" title="Agregar fuente de pago">⚙</button>' +
        '<div class="setmenu" id="ip-setmenu"><div class="mt">Agregar fuente de pago</div>' +
        '<label>Empresa</label><select id="ip-nfEmp"><option>FTS MEX (Servicios FTS)</option><option>FTS USA (FTS LLC)</option></select>' +
        '<label>Nombre de la cuenta</label><input id="ip-nfNom" placeholder="ej. Banorte Empresarial MXN">' +
        '<label>Método de sync</label><select id="ip-nfMet"><option>MCP / API nativa</option><option>CAMT.053 / archivo banco</option><option>Plaid / agregador</option><option>CSV por correo (IMAP)</option><option>Extensión portal</option><option>Manual</option></select>' +
        '<button class="ip-btn" id="ip-addsrc">Agregar (demo)</button></div></div>';
    }
    function wireHead() {
      // cierra el popup de filtro por columna al hacer click fuera de él (una vez por render, con auto-limpieza al desmontar)
      document.addEventListener('click', function cfClose(ev) {
        if (!document.body.contains(container)) { document.removeEventListener('click', cfClose); return; }
        var pop = q('#ip-cfpop'); if (!pop || pop.style.display === 'none') return;
        if (ev.target && ev.target.closest && (ev.target.closest('#ip-cfpop') || ev.target.closest('.ip-colfil'))) return;
        closeColFilter();
      });
      var sn = q('#ip-syncnow'); if (sn) sn.addEventListener('click', syncNow);   // #4a (el botón #4b 'Autoconciliar' nace disabled — gate hasta mañana)
      var rt = q('#ip-retry'); if (rt) rt.addEventListener('click', function () { state.error = null; render(); load(); });
      paintPendNote();   // A: repinta la nota de pendings si ya se cargó (persiste entre renders)
      var el = q('#ip-companies');
      if (el && window.FinCompanySelector) window.FinCompanySelector.mount(el, { onChange: function () {
        if (state.mode === 'real') { load(); } else { renderSources(); paintTable(); }
      } });
      var gear = q('#ip-gear'), setmenu = q('#ip-setmenu');
      if (gear && setmenu) {
        gear.addEventListener('click', function (e) { e.stopPropagation(); setmenu.classList.toggle('open'); });
        document.addEventListener('click', function docClose(ev) {
          if (!document.body.contains(container)) { document.removeEventListener('click', docClose); return; }
          if (!ev.target.closest || !ev.target.closest('.ip-gearwrap')) setmenu.classList.remove('open');
        });
        var add = q('#ip-addsrc');
        if (add) add.addEventListener('click', addSource);
      }
    }

    function addSource() {
      var emp = q('#ip-nfEmp').value, nom = q('#ip-nfNom').value || 'Nueva cuenta', met = q('#ip-nfMet').value;
      state.sources.push({ id: 'n' + state.sources.length, co: emp.indexOf('USA') >= 0 ? 6 : 1, pais: emp.indexOf('USA') >= 0 ? 'USA' : 'MEX', nm: nom, jt: 'sin journal', met: met.split(' ')[0], st: 'ok', last: '—', kpi: '—', movHoy: 0, movMes: 0, run: 'Pendiente de primer sync' });
      renderSources(); q('#ip-setmenu').classList.remove('open');
      toast('Fuente <b>' + esc(nom) + '</b> agregada (demo) — configura credenciales para el primer sync');
    }

    // ── fuentes: rejilla de cuadros compactos (v0.5.16) ──
    // Antes: una franja a todo el ancho por fuente, bajo dos <h2> (MEX / USA). Con 3 fuentes ya
    // era scroll; el roadmap contempla 9 (BBVA ×3, Payana, Monex ×2). Ahora: un solo encabezado y
    // una rejilla auto-fill. El país baja a etiqueta dentro del cuadro.
    // El monto sin conciliar se lee SIN abrir el cuadro — es el número por el que se entra al panel.
    // Ganchos que NO se pueden perder (los usa código de fuera): .ip-countdown y .ip-lastsync
    // (startCountdown), .ip-btnrun/.ip-btntxt/.spin (Sync Now), y los data-src/data-toggle/
    // data-atender/data-demosync que cablea renderSources.
    function srcRow(s) {
      var chip = s.st === 'ok'
        ? '<span class="stchip ok">● SYNC OK · ' + esc(s.last) + '</span>'
        : s.st === 'off'
          // V1.09 — la etiqueta del estado apagado es del dato, no una constante. "SIN CONFIGURAR"
          // es falso para BBVA General: la cuenta está configurada en Odoo y tiene 301 líneas; lo
          // que no hay es feed. Y para Nómina lo cierto es que no hay ni un movimiento. Decir
          // "sin configurar" en los tres casos manda a buscar unas credenciales que no faltan.
          ? '<span class="stchip off">○ ' + esc(s.stlbl || 'SIN CONFIGURAR') + '</span>'
          : '<span class="stchip err">▲ SYNC ERROR · ' + esc(s.last) + '</span><span class="wdbadge">WATCHDOG <button data-atender="' + esc(s.id) + '">Atender</button></span>';
      var jeevesExtra = s.main ? (
        '<div class="synced"><span class="pulse"></span>' +
        '<span>Próximo sync en <b class="ip-countdown" style="font-family:var(--ip-mono)">—</b></span>' +
        '<span class="schChip" title="Horario de captura">' + esc(state.cron && state.cron.label || DEFAULT_CRON.label) + '</span></div>') : '';
      // El botón "Sync Now" solo es REAL para la fuente main (Jeeves → /captura-jeeves/run).
      // Para las demás, en modo Demo se deja el botón simulado; en modo Real NO se pinta ningún
      // botón, porque su handler toastea un resultado inventado ("0 nuevas · 0 duplicadas") y
      // eso sería mentirle al operador sobre una fuente de producción (Chase la sincroniza Odoo/Plaid).
      var btn = s.st === 'off' ? '' : (s.main
        ? '<button class="ip-btn ip-btnrun"><span class="spin"></span><span class="ip-btntxt">Sync Now</span></button>'
        : (state.mode === 'demo'
            ? '<button class="ip-btn" data-demosync="' + esc(s.id) + '">Sync Now</button>'
            : '<div class="meta" style="opacity:.75">Sin sync manual: esta fuente la sincroniza Odoo.</div>'));
      var body = s.st === 'off'
        ? '<div class="sc-chiprow">' + chip + '</div>' +
          '<div class="sc-meta">' + esc(s.note || 'Fuente no configurada — pendiente de credenciales / primer sync.') +
            (s.met ? '<br>Método: <b>' + esc(s.met) + '</b>' : '') +
            (s.moneda ? '<br>Moneda: <b>' + esc(s.moneda) + '</b>' : '') +
            // El backlog va con su FECHA DE MEDICIÓN, igual que el bloque de pagos manuales del
            // semáforo: es una lectura a mano de Odoo, no un contador vivo, y sin fecha se leería
            // como actual. El panel no puede refrescarlo mientras no exista captura para el journal.
            (s.backlog ? '<br><span style="color:var(--steel)">En Odoo: <b>' + esc(s.backlog) + '</b>' +
               (s.medido ? ' · medido el ' + esc(s.medido) : '') + '</span>' : '') +
            '</div>'
        : '<div class="sc-meta">Método: <b>' + esc(s.met) + '</b><br>' +
            'Última captura: <b class="' + (s.main ? 'ip-lastsync' : '') + '">' + esc(s.last) + '</b><br>' +
            'Movimientos hoy: <b>' + esc(s.movHoy) + '</b> · este mes: <b>' + esc(s.movMes) + '</b><br>' +
            'Último run: <b style="color:' + (s.st === 'ok' ? 'var(--ip-ok)' : 'var(--ip-bad)') + '">' + esc(s.run) + '</b>' +
            (s.wd ? '<br><span style="color:var(--ip-bad);font-weight:600">⚠ ' + esc(s.wd) + '</span>' : '') +
            (s.note ? '<br><span style="color:var(--steel)">' + esc(s.note) + '</span>' : '') + '</div>' +
          jeevesExtra +
          (s.st === 'err' ? '<div class="sc-chiprow">' + chip + '</div>' : '') +
          btn;
      var cls = 'sc' + (s.st === 'err' ? ' err' : s.st === 'off' ? ' off' : '');
      return '<div class="' + cls + '" data-src="' + esc(s.id) + '">' +
        '<div class="sc-hit" data-toggle="' + esc(s.id) + '">' +
          '<div class="sc-top"><span class="sc-dot"></span><span class="sc-nm" title="' + esc(s.nm) + '">' + esc(s.nm) + '</span>' +
            '<span class="sc-flag">' + esc(s.pais || '—') + '</span></div>' +
          // v0.5.16 — el protagonista es CONSUMOS POR CONCILIAR, no el neto.
          // El neto sumaba residuales con signo: en Jeeves ~$2.99M de consumos se cancelaban
          // contra ~$2.98M de fondeos y la tarjeta mostraba $4,621 — mil veces menos que el
          // trabajo real. El neto sigue visible, pero abajo y con su nombre.
          '<div class="sc-kpi">' + esc(s.kpi) + '</div>' +
          '<div class="sc-kpil">' + esc(s.kpi_label || 'sin conciliar') + (s.kpi_n != null ? ' · ' + esc(s.kpi_n) + ' líneas' : '') + '</div>' +
          (s.kpi_neto ? '<div class="sc-kpi2">neto con entradas <b>' + esc(s.kpi_neto) + '</b>' +
             (s.kpi_n_entradas ? ' · ' + esc(s.kpi_n_entradas) + ' fondeos/devoluciones ' + esc(s.kpi_entradas) : '') + '</div>' : '') +
          '<div class="sc-foot"><span class="sc-j">' + esc(String(s.jt || '').replace(/^journal\s*/i, 'j·')) + '</span>' +
            // V1.09 — la moneda solo se pinta si la fuente la declara. Las que manda el server no
            // traen el campo, así que su pie queda EXACTAMENTE igual que antes; el journal 75 es en
            // dólares dentro de la empresa mexicana y sin este dato la tarjeta se leería en pesos.
            (s.moneda ? '<span class="sc-cur">' + esc(s.moneda) + '</span>' : '') +
            '<span>' + esc(s.movMes) + ' este mes</span>' +
            '<span class="sc-last">' + esc(s.last) + '</span></div>' +
          '<span class="sc-chev">▶</span>' +
        '</div>' +
        '<div class="sc-body">' + body + '</div></div>';
    }
    function renderSources() {
      var host = q('#ip-srcgrid'); if (!host) return;
      var cos = window.FinState.getCompanies();
      // Una sola rejilla: el país ya no parte la sección en dos, viaja como etiqueta en el cuadro.
      var vis = state.sources.filter(function (s) { return cos.indexOf(s.co) >= 0; });
      host.innerHTML = vis.length
        ? vis.map(srcRow).join('')
        : '<div class="ip-empty" style="padding:14px;grid-column:1/-1">Sin fuentes para la empresa seleccionada.</div>';
      // El clic abre/cierra el cuadro. Va sobre .sc-hit (la zona colapsada), NO sobre .sc entero:
      // si fuera el contenedor, cualquier clic dentro del detalle abierto lo volvería a cerrar.
      qa('[data-toggle]').forEach(function (h) { h.addEventListener('click', function () { var el = q('[data-src="' + h.getAttribute('data-toggle') + '"]'); if (el) el.classList.toggle('open'); }); });
      qa('[data-atender]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); toast('Watchdog <b>' + esc(b.getAttribute('data-atender').toUpperCase()) + '</b>: reintentando sync y notificando responsable…'); }); });
      qa('[data-demosync]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); toast('Simulación (modo Demo) de <b>' + esc(b.getAttribute('data-demosync').toUpperCase()) + '</b> — no se llamó a ninguna captura.'); }); });
      // Sync Now de la tarjeta Jeeves (v0.5.37 — antes MENTÍA en modo Real).
      // El comentario de srcRow ya decía que en Real no se pinta botón simulado "porque su
      // handler toastea un resultado inventado y eso sería mentirle al operador sobre una
      // fuente de producción"… y este handler hacía exactamente eso para Jeeves: un
      // setTimeout de 1.6 s, un toast fijo de "3 nuevas · 2 duplicadas · 0 rechazadas" y una
      // fila inventada en la tabla de corridas, en modo Real igual que en Demo. Es el
      // anti-patrón del Hallazgo #15 (CLAUDE.md §14): UI que declara éxito sin backend.
      // Ahora en Real dispara la captura de verdad (el mismo endpoint del botón de la barra) y
      // reporta lo que conteste el server; la simulación queda solo en Demo y se anuncia.
      var run = q('.ip-btnrun');
      if (run) run.addEventListener('click', function () {
        var tx = q('.ip-btntxt');
        var fin = function (msg) {
          if (!document.body.contains(container)) return;
          run.disabled = false; run.classList.remove('busy'); if (tx) tx.textContent = 'Sync Now';
          toast(msg);
        };
        run.disabled = true; run.classList.add('busy'); if (tx) tx.textContent = 'Sincronizando…';
        if (state.mode !== 'real') {
          setTimeout(function () { fin('Simulación (modo Demo) — no se llamó a la captura.'); }, 900);
          return;
        }
        window.FinClient.call(EP_SYNC_NOW, { origen: 'boton-tarjeta' })
          .then(function (data) {
            if (!data || (data.ok !== true && data.nuevas == null && data._ran !== true)) {
              fin('Sincronizador no disponible (endpoint sin activar) — <b>no se capturó nada</b>.'); return;
            }
            fin('Captura Jeeves terminada — <b>' + (data.nuevas || 0) + ' nuevas</b> · ' +
                (data.duplicadas || 0) + ' duplicadas · ' + (data.rechazadas || 0) + ' rechazadas');
            setTimeout(function () { if (document.body.contains(container)) load(); }, 900);
          })
          .catch(function (err) {
            var code = (err && err.code) || '';
            fin((code === 'NETWORK' || code === 'BAD_RESPONSE' || (err && err.http === 404))
              ? 'Sincronizador no disponible (endpoint inactivo) — <b>no se capturó nada</b>.'
              : 'Error al sincronizar: ' + esc((err && err.msg) || code || 'sin detalle'));
          });
      });
    }

    // v0.5.15 — universo de journals DERIVADO, nunca escrito a mano.
    // Antes había dos listas hardcodeadas (filtro y semáforo) y una apuntaba al journal 73,
    // que tiene cero líneas: la UI prometía un Chase que no existía. Orden de preferencia:
    //   1) por_journal del server (real)  2) labels distintos de las filas cargadas (demo/fallback).
    // Si un journal no está en ninguno de los dos, no se pinta — no se inventa.
    function journalListServer() {
      if (state.porJournal && state.porJournal.length) {
        return state.porJournal.map(function (p) {
          return { label: p.label, id: p.journal, nombre: p.nombre || p.label };
        });
      }
      var vistos = {}, out = [];
      (state.allRows || []).forEach(function (r) {
        if (r && r.j && !vistos[r.j]) { vistos[r.j] = true; out.push({ label: r.j, id: null, nombre: r.j }); }
      });
      return out.sort(function (a, b) { return a.label.localeCompare(b.label); });
    }
    // V1.09 — el universo del FILTRO suma el catálogo. Un journal que existe en Odoo y todavía no
    // tiene captura no puede ser invisible en el selector: al elegirlo la tabla sale vacía, que es
    // exactamente lo que hay, y eso es información. Elegir uno de estos no rompe nada: `journal`
    // es un filtro de la vista (visibleRows compara `t.j === f.journal`), no un parámetro de la
    // consulta al server — desde v0.5.20 el journal salió de `txParams()`.
    // Lo que NO se toca es el semáforo, que sigue leyendo `journalListServer()`: sus cifras salen
    // de `metricas.por_journal` y una fuente sin datos no puede aparecer ahí con un 0 calculado.
    function journalList() {
      var base = journalListServer();
      var vistos = {};
      base.forEach(function (j) { if (j.id != null) vistos[j.id] = true; vistos['l:' + j.label] = true; });
      CATALOGO_FUENTES.forEach(function (c) {
        if (vistos[c.journal] || vistos['l:' + c.label]) return;
        base.push({ label: c.label, id: c.journal, nombre: c.nm, sinDatos: true });
      });
      return base;
    }

    // ── filtros + menú de columnas ──
    function filtersHtml() {
      var f = state.filters;
      var opts = journalList().map(function (j) {
        return '<option value="' + esc(j.label) + '"' + (f.journal === j.label ? ' selected' : '') + '>' +
          esc(j.label) + (j.id ? ' (' + j.id + ')' : '') +
          // V1.09 — el sufijo avisa ANTES de elegir que esa fuente no tiene líneas capturadas, para
          // que una tabla vacía no se lea como un filtro roto.
          (j.sinDatos ? ' — sin datos' : '') + '</option>';
      }).join('');
      return '<div class="filters">' +
        '<select id="ip-fJournal"><option value="">Todos los journals</option>' + opts + '</select>' +
        '<input type="date" id="ip-fFrom" value="' + esc(f.from) + '">' +
        '<input type="date" id="ip-fTo" value="' + esc(f.to) + '">' +
        // EJE B (conciliación) en el dropdown; el EJE A (tipo) va en su propio select al lado.
        // EJE ODOO de la taxonomía 3+2: conciliado / pre-conciliado / sin conciliar. Y nada más.
        // "Conciliada parcial" y "No evaluada" salieron del eje (son matiz de la celda, no estados);
        // "con/sin documento" salió al eje de la columna Candidato.
        '<select id="ip-fEstado"><option value="">Conciliación: todo</option>' +
          '<option value="conciliado"' + (f.estado === 'conciliado' ? ' selected' : '') + '>Conciliado</option>' +
          // gris y sin conteo hasta que el motor 2 lo pueble: existe para que se vea que viene,
          // no para ofrecer un filtro que devolvería cero sin explicar por qué.
          '<option value="preconciliado" disabled>Pre-conciliado — pendiente del motor</option>' +
          '<option value="sinconciliar"' + (f.estado === 'sinconciliar' ? ' selected' : '') + '>Sin conciliar</option></select>' +
        '<select id="ip-fTipo"><option value="">Tipo: todos</option>' +
          ['consumo', 'fondeo', 'devolucion', 'traspaso', 'ajuste', 'abono'].map(function (k) {
            return '<option value="' + k + '"' + (f.tipo === k ? ' selected' : '') + '>' + TIPO_LABEL[k] + '</option>';
          }).join('') + '</select>' +
        '<input class="grow" type="text" id="ip-fSearch" placeholder="Buscar en TODAS las columnas… (comercio, PO, folio, comprador, analítica)" value="' + esc(f.search) + '">' +
        '<button class="xlsbtn" id="ip-btnxls" title="Descarga las filas seleccionadas con las columnas visibles">⬇ Excel <span id="ip-xlscount"></span></button>' +
        '<select id="ip-fPageSize" title="Filas por página">' +
          [10, 25, 50, 100].map(function (n) { return '<option value="' + n + '"' + (state.pageSize === n ? ' selected' : '') + '>' + n + ' filas</option>'; }).join('') + '</select>' +
        '<div class="colbtn"><button id="ip-colbtn" title="Columnas">⋮</button>' +
          '<div class="colmenu" id="ip-colmenu"><div class="mt">Columnas visibles</div>' +
          '<div class="cact"><a id="ip-colall">Seleccionar todas</a><a id="ip-colnone">Ninguna</a></div>' +
          '<div id="ip-colchecks"></div></div></div>' +
        '</div>';
    }
    function wireFilters() {
      // DOS clases de filtro, y la distinción importa: journal y fechas ACOTAN EL UNIVERSO que el
      // server debe entregar, así que cambiarlos obliga a recargar. Estado, tipo y búsqueda son
      // subconjuntos de lo ya cargado — pedirlos al server era barrer hasta 60 páginas para no
      // traer ni una fila nueva.
      var reload = function () {
        state._fechasTocadas = true;   // a partir de aquí manda el usuario, no el corte
        state.filters.from = q('#ip-fFrom').value;
        state.filters.to = q('#ip-fTo').value;
        state.page = 1;
        if (state.mode === 'real') { load(); } else { paintTable(); }
      };
      var refilter = function () {
        state.filters.journal = q('#ip-fJournal').value;
        state.filters.estado = q('#ip-fEstado').value;
        state.filters.tipo = q('#ip-fTipo') ? q('#ip-fTipo').value : '';
        state.page = 1;
        paintTable(); paintChips();
      };
      // Solo las FECHAS recargan. Journal, estado y tipo son subconjuntos de lo ya cargado.
      ['#ip-fFrom', '#ip-fTo'].forEach(function (s) { var el = q(s); if (el) el.addEventListener('change', reload); });
      ['#ip-fJournal', '#ip-fEstado', '#ip-fTipo'].forEach(function (s) { var el = q(s); if (el) el.addEventListener('change', refilter); });
      var srch = q('#ip-fSearch'); if (srch) srch.addEventListener('input', function () { state.filters.search = srch.value; state.page = 1; paintTable(); });
      var ps = q('#ip-fPageSize'); if (ps) ps.addEventListener('change', function () { state.pageSize = +ps.value; state.page = 1; paintTable(); });
      var cb = q('#ip-colbtn'), cm = q('#ip-colmenu');
      if (cb && cm) {
        cb.addEventListener('click', function (e) { e.stopPropagation(); cm.classList.toggle('open'); });
        document.addEventListener('click', function docClose(ev) {
          if (!document.body.contains(container)) { document.removeEventListener('click', docClose); return; }
          if (!ev.target.closest || !ev.target.closest('.colbtn')) cm.classList.remove('open');
        });
        cm.addEventListener('click', function (e) { e.stopPropagation(); });
      }
      var all = q('#ip-colall'), none = q('#ip-colnone');
      if (all) all.addEventListener('click', function () { COLS.forEach(function (c) { c.vis = true; }); buildColMenu(); paintTable(); });
      if (none) none.addEventListener('click', function () { COLS.forEach(function (c) { c.vis = false; }); buildColMenu(); paintTable(); });
      var xls = q('#ip-btnxls'); if (xls) xls.addEventListener('click', exportXls);
    }
    function buildColMenu() {
      var cc = q('#ip-colchecks'); if (!cc) return;
      cc.innerHTML = COLS.map(function (c, i) { return '<label><input type="checkbox" data-col="' + i + '"' + (c.vis ? ' checked' : '') + '> ' + esc(c.lbl) + '</label>'; }).join('');
      qa('#ip-colchecks input[data-col]').forEach(function (inp) { inp.addEventListener('change', function () { COLS[+inp.getAttribute('data-col')].vis = inp.checked; paintTable(); }); });
    }

    // ── tabla (repintado parcial, preserva menús abiertos) ──
    // ── Pieza #2: estado enriquecido por fila ──
    // Fondeo y devolución se deciden SOLO por el marcador del ref — NUNCA por el signo del monto:
    // las devoluciones ([DEVOLUCIÓN ****XXXX]) también son positivas y no deben caer en Fondeo (dinero mal clasificado en silencio).
    function isFondeo(r) { return /FONDEO/i.test(String(r.ref || '')); }
    function isDevolucion(r) { return /DEVOLUCI/i.test(String(r.ref || '')); }

    // ══ TAXONOMÍA v0.5.16 — DOS EJES INDEPENDIENTES ══
    // Antes, un solo "estado" de 5 valores mezclaba dos cosas distintas: Fondeo y Devolución no son
    // estados de conciliación, son TIPOS de movimiento (y con signo opuesto al del consumo).
    // El eje "estado en el banco" NO existe: captura-jeeves solo ingesta settled y Plaid no expone
    // pendings → toda fila de esta tabla es liquidada por construcción. Un eje de un solo valor
    // posible confunde más de lo que informa; los pendings viven en la nota de "En tránsito".

    // ── EJE A · TIPO (qué es el movimiento) ──
    // Debe ser idéntico al tipoMov() de fin/captura-status y al tipoDe() de captura-transacciones.
    // Chase llega sin etiquetas (narrativa cruda de Plaid); solo el traspaso entre cuentas propias
    // es reconocible por texto, y sus dos lados casan al centavo (122 −9,419.20 / 123 +9,419.20).
    // Un positivo sin etiqueta NO se declara devolución: eso sería inferir. Va a 'abono'.
    function rowTipo(r) {
      var ref = String(r.ref || '');
      if (isFondeo(r)) return 'fondeo';
      if (isDevolucion(r)) return 'devolucion';
      if (/^\[AJUSTE/i.test(ref)) return 'ajuste';
      if (/^Payment to Chase card/i.test(ref) || /^Payment Thank You/i.test(ref)) return 'traspaso';
      return (Number(r.amt) || 0) < 0 ? 'consumo' : 'abono';
    }
    var TIPO_LABEL = { consumo: 'Consumo', fondeo: 'Fondeo', devolucion: 'Devolución',
                       traspaso: 'Traspaso interno', ajuste: 'Ajuste', abono: 'Abono' };

    // ── EJE B · CONCILIACIÓN (qué falta hacer) ──
    // 'noevaluada' es un valor REAL, no un hueco: el motor de SUGERENCIAS no cubre los journals
    // de Chase, así que sus líneas nunca se evaluaron. Pintarlas "sin documento" afirmaría que se
    // buscó y no había — no se buscó. Es la diferencia entre "no hay factura" y "no sabemos".
    // OJO (2026-09-03): esto ya NO habla del motor de CONCILIAR, que desde hoy cubre las dos
    // empresas (P1 corregido: cuentas por company_id). Conciliar una línea de Chase funciona;
    // lo que falta es que alguien le PROPONGA el bill. Son dos workflows distintos y el flag
    // en_motor solo describe al de sugerencias.
    function enAlcanceMotor(r) {
      var p = (state.porJournal || []).filter(function (x) { return x.journal === r._jid; })[0];
      return p ? p.en_motor !== false : true;   // sin info del server, no se acusa de no-evaluada
    }
    function rowConc(r) {
      // El residual que delata un descuadre es el del APUNTE de la cuenta 17 (`res_apunte`),
      // no el de la línea (`res`). La receta mueve el suspense a la 17 y reconcilia; Odoo marca
      // is_reconciled en cuanto no queda suspense, aunque ese apunte conserve saldo. Con `res`
      // esta rama nunca se ejecutaba y Ferr —$334.08 abiertos— se veía idéntica a una completa.
      // Si el server no manda el campo (build viejo), se cae al criterio anterior en vez de
      // afirmar que todo está cuadrado.
      if (r.ok) {
        var _ra = (r.res_apunte != null) ? Number(r.res_apunte) : (Number(r.res) || 0);
        if (Math.abs(_ra) < 0.005) return 'conciliada';
        // DESCONCILIADA — el apunte recuperó el importe COMPLETO de la línea, no un resto.
        // Eso solo pasa cuando la conciliación se deshizo entera: se canceló el bill (o se
        // desató a mano) y Odoo liberó la contrapartida. Pero `is_reconciled` NO puede volver
        // a false: la receta vació la cuenta de suspense reescribiendo account_id 184→17, y ese
        // apunte se queda en la 17 para siempre, así que Odoo nunca ve reaparecer una suspense.
        // Es una puerta de un solo sentido POR CONSTRUCCIÓN — por eso el veredicto no puede
        // salir de `r.ok`, tiene que salir del apunte.
        // Caso real: línea 32555 ($54 MercadoPago) ↔ BILL3270, cancelado el 2026-08-20; el
        // apunte 203855 quedó reconciled:false con residual 54.00 y la línea seguía en verde.
        // Se exige res_apunte EXPLÍCITO: sin el campo (server viejo) `_ra` cae a `res`, que en
        // una conciliada es 0 y ya salió por 'conciliada' — nunca se acusa por falta de dato.
        if (r.res_apunte != null && Math.abs(Math.abs(_ra) - Math.abs(Number(r.amt) || 0)) < 0.005) return 'desconciliada';
        return 'parcial';
      }
      // EJE ODOO, valor intermedio: el motor 2 dejó decidida la conciliación pero el asiento no existe.
      // Hoy no lo puebla nadie (state.preconc llega vacío) → el filtro y el chip salen en gris con 0.
      if (state.preconc && (state.preconc[r._id] || state.preconc[r.id])) return 'preconciliada';
      // Fondeo y devolución NO esperan una factura de proveedor, así que no pueden caer en el
      // cubo de "sin conciliar". evalSugg() ya los excluye del motor a propósito (L~927), pero
      // sin estado propio caían al 'pendiente' del final —cuya celda dice "○ Sin conciliar"— y
      // ese texto afirma que les falta un documento que nunca les va a faltar:
      //   · la devolución casa contra una NOTA DE CRÉDITO, o reduce el bill original;
      //   · el fondeo es abono de la línea de crédito y su contrapartida es el lado BBVA, que
      //     todavía no existe en Odoo (decisión de docs/odoo-captura-bancaria.md §215: se
      //     capturan igual, y que queden en suspense es la evidencia de que falta ese lado).
      // Van ANTES de enAlcanceMotor porque el TIPO es un hecho del movimiento; 'noevaluada' es
      // un hecho del motor. Un fondeo en un journal sin motor sigue siendo un fondeo.
      if (isDevolucion(r)) return 'devolucion_pend';
      if (isFondeo(r))     return 'fondeo_pend';
      // El VEREDICTO REAL manda sobre el flag del server (V1.05). Antes 'noevaluada' se
      // decidía antes de mirar state.sugg, así que una línea de Chase con candidato seguía
      // rotulada "no evaluada" — negando una evaluación que sí ocurrió. Ahora el flag solo
      // habla cuando no hay respuesta que mostrar, que es justo lo que significa: "no sabemos".
      // Además esto se auto-corrige: el día que captura-status marque en_motor:true para
      // Chase, aquí no hay que tocar nada.
      var s = state.sugg[r._id];
      if (s && s.cand && s.cand.candidatos && s.cand.candidatos.length) return 'condoc';
      if (s && s.cand) return 'sindoc';
      if (!enAlcanceMotor(r)) return 'noevaluada';
      return 'pendiente';                        // batch en vuelo — transitorio, no es filtro
    }
    // Compat: rowState sigue existiendo para el filtro por columna y el export, mapeado al eje B.
    function rowState(r) { return rowConc(r); }
    // Pista secundaria SOLO para 'sinconciliar' (no cambia el estado ni el color): candidato del cerebro, sin-doc, o nada.
    function suggHint(r) {
      var s = state.sugg[r._id];
      if (s && s.cand && s.cand.candidatos && s.cand.candidatos.length) return { kind: 'cand', cand: s.cand.candidatos[0] };
      if (s && s.cand) return { kind: 'sindoc' };   // evaluado, sin candidatos → link buscar
      return { kind: 'plain' };                       // en vuelo o sin evaluar → 'Sin conciliar' a secas (sin 'evaluando' como estado)
    }
    function stateCell(r) {
      var st = rowConc(r);
      if (st === 'conciliada') return '<span class="ip-est liq" title="Conciliada: tiene contrapartida y residual $0">✓ Conciliada</span>';
      if (st === 'parcial') {
        // "quedan $X sin cerrar", NO "falta comprobante": lo unico que sabemos es que el apunte
        // no cuadro. Afirmar que falta una factura seria inventar la causa — esa la dice Gera.
        var _r = Math.abs(Number(r.res_apunte != null ? r.res_apunte : r.res) || 0);
        return '<span class="ip-est tra" title="Tiene contrapartida pero el apunte de la cuenta 17 conserva saldo">◐ Conciliada parcial</span> <span class="ip-est-bill">quedan ' + money(_r) + ' sin cerrar</span>';
      }
      if (st === 'desconciliada') {
        // Dice lo ÚNICO que sabemos: el apunte volvió a abrirse completo. No dice "el bill se
        // canceló" como hecho — es la causa habitual, no la única (también se desata a mano).
        var _rd = Math.abs(Number(r.res_apunte) || 0);
        // Texto CORTO a propósito: la revisión visual en Chromium mostró que la versión larga
        // ocupaba 4 renglones (110 px) contra los 2-3 de sus vecinas, y "la conciliación se
        // deshizo" repetía lo que el propio nombre del estado ya dice. La explicación completa
        // vive en el title, que es donde no cuesta alto de fila.
        // NO promete que se pueda volver a conciliar desde aquí. En Odoo la línea sigue con
        // is_reconciled=true, así que el guard LINE_YA_CONCILIADA la rechazaría: hoy esto se
        // resuelve en Odoo, no en el panel. Por eso tampoco lleva chevron de acordeón (el
        // chevron sale con !t.ok) — ofrecer un botón que siempre falla sería peor que no darlo.
        return '<span class="ip-est tra" title="El apunte de la cuenta 17 recuperó el importe COMPLETO: la conciliación se deshizo entera (lo habitual es que se haya cancelado el bill, pero también pudo desatarse a mano). La línea sigue marcada conciliada en Odoo porque la receta vació la cuenta de suspense y ese flag ya no puede volver atrás. Ojo: NO se puede volver a conciliar desde este panel — el guard la rechaza por ya-conciliada. Hoy se resuelve en Odoo.">⟲ Desconciliada</span> <span class="ip-est-bill">' + money(_rd) + ' abiertos · resolver en Odoo</span>';
      }
      if (st === 'noevaluada') return '<span class="ip-est nev" title="El motor de sugerencias no evalúa este journal todavía, así que no hay bill propuesto. No es que no haya factura: no se buscó. Conciliar SÍ funciona — abre la fila y usa \'buscar bill\'.">◌ No evaluada</span>';
      // Ninguno de los dos va en rojo: no son un error ni trabajo atorado del equipo.
      if (st === 'devolucion_pend') return '<span class="ip-est dev-ret" title="Una devolución no casa contra un bill de proveedor: casa contra una nota de crédito, o reduce el bill original. El motor de sugerencias no la evalúa a propósito.">↩ Devolución</span> <span class="ip-est-bill">pendiente de nota de crédito</span>';
      if (st === 'fondeo_pend')     return '<span class="ip-est fon" title="Abono de la línea de crédito. Su contrapartida es el movimiento del lado BBVA, que aún no se captura en Odoo — por eso queda en suspense.">⊕ Fondeo</span> <span class="ip-est-bill">pendiente del lado BBVA</span>';
      if (st === 'condoc')     { var c = (suggHint(r).cand) || {}; return '<span class="ip-est doc" title="El motor encontró factura candidata">◆ Con documento</span> <span class="ip-est-bill">' + esc(c.bill_name || '') + ' · ' + Math.round((c.score || 0) * 100) + '</span>'; }
      if (st === 'sindoc')     return '<span class="ip-est sinc" title="El motor evaluó y no encontró factura">○ Sin documento</span> <a class="ip-est-buscar" data-buscar="' + r._id + '">buscar bill</a>';
      return '<span class="ip-est sinc">○ Sin conciliar</span>';   // 'pendiente' — batch en vuelo
    }
    // hoy en CST (UTC−6 fijo, sin DST) — mismo criterio que el server
    // (declaraciones de función: se izan, por eso state.filters puede llamarlas en su init)
    function hoyCst() { return new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10); }
    // Inicio del mes ANTERIOR: ventana que siempre incluye el mes en curso completo y el previo,
    // sin caducar nunca. Acota el volumen (el acumulador de páginas topa en 6,000 filas).
    function defaultFrom() {
      var h = hoyCst(), y = +h.slice(0, 4), m = +h.slice(5, 7) - 1;   // mes anterior, 1-based → -1
      if (m < 1) { m = 12; y -= 1; }
      return y + '-' + (m < 10 ? '0' : '') + m + '-01';
    }
    function diasDesde(ymd) {
      if (!ymd) return 9999;
      return Math.round((new Date(hoyCst() + 'T00:00:00Z').getTime() - new Date(ymd + 'T00:00:00Z').getTime()) / 86400000);
    }
    function matchEstado(f, t) {
      var st = rowConc(t);
      switch (f) {
        // EJE ODOO (taxonomía 3+2). 'conciliado' incluye la parcial: la parcialidad es un matiz de la
        // celda, no un estado aparte — quien filtra "conciliado" no espera que se le escondan las parciales.
        case 'conciliado': return st === 'conciliada' || st === 'parcial';   // la desconciliada NO: su apunte está abierto
        case 'preconciliado': return st === 'preconciliada';   // sin filas hasta que el motor 2 escriba
        // alias de contratos viejos (selects guardados en localStorage) — no se ofrecen ya en la UI
        case 'conciliada': case 'liquidado': case 'ok': return st === 'conciliada';
        case 'parcial':     return st === 'parcial';
        case 'desconciliada': return st === 'desconciliada';
        case 'condoc':      return st === 'condoc';
        case 'sindoc':      return st === 'sindoc';
        case 'noevaluada':  return st === 'noevaluada';
        case 'fondeo':      return st === 'fondeo_pend';
        case 'devolucion':  return st === 'devolucion_pend';
        // familia: lo que sigue pendiente de conciliar CONTRA UN DOCUMENTO, sea cual sea el
        // motivo. Fondeos y devoluciones quedan FUERA: no esperan documento, y meterlos aquí
        // inflaba el cubo con trabajo que nadie va a hacer (los fondeos solos son millones).
        // Tienen su propio chip, así que el universo sigue cuadrando y nada se esconde.
        // La DESCONCILIADA entra aquí aunque traiga ok:true — su apunte está abierto, o sea
        // que vuelve a ser trabajo por conciliar. Es el punto entero del estado.
        case 'sinconciliar': case 'pend': return st === 'desconciliada' || (!t.ok && st !== 'fondeo_pend' && st !== 'devolucion_pend');
        case 'conchoy':     return t.ok === true && t.wd === hoyCst();   // requiere write_date del server
        default: return true;
      }
    }
    function matchEdad(f, t) {
      if (!f) return true;
      // La antigüedad solo califica lo pendiente. La desconciliada trae ok:true pero cuenta
      // como pendiente (su apunte está abierto), así que sí debe entrar a los cubos de edad —
      // si no, al filtrar "Sin conciliar + más de 3 días" saldría siempre, en cualquier cubo.
      if (t.ok && rowConc(t) !== 'desconciliada') return true;
      var d = diasDesde(t.d);
      if (f === 'hoy') return d <= 0;
      if (f === 'd1_3') return d >= 1 && d <= 3;
      if (f === 'd3plus') return d > 3;
      return true;
    }
    // Evalúa sugerencias de las filas cargadas → puebla state.sugg para pintar el estado (real: batch al endpoint; demo: del mock).
    function evalSugg() {
      if (state.mode !== 'real') {
        state.allRows.forEach(function (r) {
          if (state.sugg[r._id] && state.sugg[r._id].cand) return;
          var raw = (state.suggByRow && state.suggByRow[r._id]);
          if (raw) state.sugg[r._id] = { loading: false, cand: { nivel: raw.nivel, candidatos: raw.candidatos || [] }, sel: defaultSel(raw.candidatos || []) };
        });
        return Promise.resolve();
      }
      // A quién SÍ se le pregunta. Queda UNA exclusión: las que ya traen candidatos en caché
      // (tras una recarga que los preservó) — el guard BILL_YA_CONCILIADO revalida en el
      // instante del write, así que una sugerencia cacheada no puede provocar una escritura
      // mala, y cada fila tiene su "Recargar".
      //
      // La exclusión por `en_motor:false` SE FUE (V1.05). Existía porque el motor de
      // sugerencias solo leía el journal 61: preguntarle por Chase no podía devolver nada.
      // Desde el 2026-09-03 lee los tres journals (61, 122, 123) y las dos cuentas por pagar
      // (17 y 285), así que ahora sí puede contestar. El orden importó: primero se abrió el
      // server y solo después se quitó esta exclusión — al revés, el panel habría preguntado
      // a un motor que no sabía responder y las líneas de Chase habrían pasado de un honesto
      // "no evaluada" a un falso "sin documento" (§8, la mitad tolerante va primero).
      //
      // `en_motor` sigue vivo, pero ya solo decide el ROTULO cuando no hubo evaluación —
      // ver rowConc(), donde bajó por debajo de la lectura de state.sugg.
      var yaPreguntada = function (r) {
        var s = state.sugg[r._id];
        return !!s && (!!s.cand || s.pedido === true);
      };
      var targets = state.allRows.filter(function (r) {
        return !r.ok && !isFondeo(r) && !isDevolucion(r) && !yaPreguntada(r);
      });
      if (!targets.length) return Promise.resolve();
      var ids = targets.map(function (r) { return r.id; });
      var byLine = {}; state.allRows.forEach(function (r) { byLine[r.id] = r._id; });
      return new Promise(function (resolve) {
        var offset = 0, LIMIT = 200, guard = 0;
        function step() {
          window.FinClient.call(EP_SUGERENCIAS, { companies: window.FinState.getCompanies(), line_ids: ids, limit: LIMIT, offset: offset })
            .then(function (data) {
              ((data && data.lineas) || []).forEach(function (l) {
                var _id = byLine[l.line_id];
                if (_id != null && !(state.sugg[_id] && state.sugg[_id].cand)) {
                  state.sugg[_id] = { loading: false, cand: { nivel: l.nivel, candidatos: l.candidatos || [] }, sel: defaultSel(l.candidatos || []) };
                }
              });
              if (document.body.contains(container)) paintTable();     // reveal progresivo del estado
              var pag = data && data.pagination;
              if (pag && pag.has_more && ++guard < 40) { offset += LIMIT; step(); }
              else {
                // Marcar las que se PIDIERON y el server no contestó. Sin esto se vuelven a
                // pedir en cada pasada —y hay una pasada tras cada conciliación—, que es el
                // desperdicio que R3 vino a quitar. El server omite una línea cuando no la
                // tiene en su universo (ya conciliada, o fuera de los journals que lee), así
                // que la omisión es una respuesta: "de esa no sé". Se guarda como tal, con
                // cand null, para que el estado siga cayendo en 'no evaluada' y no se invente
                // un "sin documento" que afirmaría que se buscó.
                targets.forEach(function (r) {
                  if (!state.sugg[r._id] || !state.sugg[r._id].cand) {
                    state.sugg[r._id] = { loading: false, cand: null, pedido: true };
                  }
                });
                resolve();
              }
            })
            .catch(function () { resolve(); });   // degrada: el estado queda "● Pendiente" neutral, sin romper la tabla
        }
        step();
      });
    }

    function paintTable() {
      // Preservar el scroll (v0.5.29). paintTable reescribe el innerHTML de la tabla, y el
      // navegador colapsa la altura un instante antes de volver a pintarla: la página salta
      // arriba y hay que bajar otra vez. Se sentía en cada clic de expandir una fila.
      // Se guarda el scroll de la PÁGINA (el contenedor no scrollea; la tabla crece hacia abajo)
      // y se restaura tras el repintado, en el mismo frame para que no se vea el salto.
      var _sc = null;
      try { _sc = (window.pageYOffset != null) ? window.pageYOffset : (document.scrollingElement || document.documentElement).scrollTop; } catch (e) { }
      var _restaurar = function () {
        if (_sc == null) return;
        try {
          var el = document.scrollingElement || document.documentElement;
          // solo si de verdad se movió: restaurar a ciegas pelearía con un scroll del usuario
          var ahora = (window.pageYOffset != null) ? window.pageYOffset : el.scrollTop;
          if (Math.abs(ahora - _sc) > 1) { if (window.scrollTo) window.scrollTo(0, _sc); else el.scrollTop = _sc; }
        } catch (e) { }
      };
      var rows = visibleRows();
      var pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
      if (state.page > pages) state.page = 1;
      var slice = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
      var vis = COLS.filter(function (c) { return c.vis; });
      var allSel = rows.length > 0 && rows.every(function (t) { return state.sel[t._id]; });

      var tbl = rows.length ? '<div class="ip-tblscroll"><table><thead><tr>' +
        '<th class="chk"><input type="checkbox" id="ip-checkall"' + (allSel ? ' checked' : '') + ' title="Seleccionar toda la vista filtrada (' + rows.length + ')"></th>' +
        vis.map(function (c) {
          var isF = Object.prototype.hasOwnProperty.call(FILTERABLE_COLS, c.k);
          var active = isF && state.colFilters[c.k] != null;
          return '<th class="sortable' + (active ? ' filon' : '') + '" data-sort="' + c.k + '"' + (c.hdrTitle ? ' title="' + esc(c.hdrTitle) + '"' : '') + (c.k === 'amt' ? ' style="text-align:right"' : '') + '>' +
            '<span class="thlbl">' + esc(c.lbl) + (state.sortK === c.k ? '<span class="sarr">' + (state.sortDir > 0 ? '▲' : '▼') + '</span>' : '') + '</span>' +
            (isF ? '<span class="ip-colfil' + (active ? ' on' : '') + '" data-colfil="' + c.k + '" title="Filtrar columna">▾</span>' : '') +
          '</th>';
        }).join('') +
        '</tr></thead><tbody>' +
        slice.map(function (t) {
          var chev = t.ok ? '' : '<button class="ip-expbtn' + (state.expanded === t._id ? ' open' : '') + '" data-expand="' + t._id + '" title="Sugerencias de conciliación" aria-label="Ver sugerencias">▶</button>';
          var tr = '<tr class="' + (state.sel[t._id] ? 'selrow' : '') + (state.expanded === t._id ? ' ip-exprow' : '') + '"><td class="chk">' + chev + '<input type="checkbox" data-row="' + t._id + '"' + (state.sel[t._id] ? ' checked' : '') + '></td>' +
            vis.map(function (c) {
              var v = c.fmt(t);
              // data-vacio marca la celda SIN valor (vacía o un guion). En escritorio no cambia
              // nada —la retícula necesita la celda para alinear—, pero en móvil cada fila es
              // una tarjeta y ahí un renglón "PO —" es alto gastado en decir que no hay dato.
              // El dato sigue en el DOM: no se oculta información, se oculta su ausencia.
              var vacio = /^\s*(—|-|)\s*$/.test(String(v).replace(/<[^>]*>/g, ''));
              return '<td ' + colAttr(c, t) + (vacio ? ' data-vacio="1"' : '') + '>' + v + '</td>';
            }).join('') + '</tr>';
          if (state.expanded === t._id) {
            tr += '<tr class="ip-acc-row"><td class="ip-acc-cell" colspan="' + (vis.length + 1) + '">' + accordionHtml(t) + '</td></tr>';
          }
          return tr;
        }).join('') +
        '</tbody></table></div>'
        // V1.09 — si el journal elegido es uno del catálogo (existe en Odoo, sin captura), la tabla
        // vacía no es un filtro mal puesto: es que no hay líneas que traer. Decirlo evita que
        // Eduardo ande moviendo fechas buscando datos que ningún proceso ha escrito.
        : '<div class="ip-empty">' + (function () {
            var c = CATALOGO_FUENTES.filter(function (x) { return x.label === state.filters.journal; })[0];
            if (c) return 'La cuenta <b>' + esc(c.nm) + '</b> (j·' + c.journal + ') todavía no tiene captura: ' +
              'no hay movimientos que mostrar en ningún rango de fechas. ' + esc(c.note);
            return 'Sin movimientos con estos filtros. Ajusta el rango o la búsqueda.';
          })() + '</div>';
      var w = q('#ip-tblwrap'); if (w) w.innerHTML = tbl;

      // Contadores de la barra. Hasta v0.5.30 las llaves eran las del eje de 5 valores
      // que murió en v0.5.16 (liquidado/transito/fondeo/devolucion/sinconciliar), y
      // rowState() —alias de rowConc()— no devuelve NINGUNA de ellas: solo produce
      // conciliada|parcial|preconciliada|noevaluada|condoc|sindoc|pendiente. Resultado:
      // `cnt[rowState(t)]++` escribía en llaves nuevas que nadie leía, las cinco
      // declaradas se quedaban en 0, y `resid` comparaba contra 'sinconciliar' — que
      // tampoco existe — así que la barra decía SIEMPRE, con cualquier dato:
      //     "N líneas · 0 conciliadas · 0 en tránsito · 0 sin conciliar · residual $0.00"
      // mientras los chips de arriba mostraban los conteos correctos. Dos cifras
      // contradictorias en la misma pantalla. paintChips() sí se migró en v0.5.15–17
      // (su comentario documenta este mismo error); la barra se quedó atrás.
      //
      // El criterio se alinea A PROPÓSITO con paintChips(): mismo orden, mismas ramas.
      // Si divergen, vuelven a contradecirse.
      var cnt = { conciliadas: 0, pendientes: 0, preconciliadas: 0, fondeo: 0, devolucion: 0 };
      rows.forEach(function (t) {
        var st = rowConc(t);
        if (st === 'preconciliada') cnt.preconciliadas++;
        else if (st === 'fondeo_pend') cnt.fondeo++;
        else if (st === 'devolucion_pend') cnt.devolucion++;
        else if (st === 'desconciliada') cnt.pendientes++;   // ok:true, pero el apunte está abierto
        else if (t.ok) cnt.conciliadas++;
        else cnt.pendientes++;
      });
      // Residual pendiente: solo lo NO conciliado. En una conciliada, `res` es 0 en
      // cuanto la línea sale de suspense (por eso el residual real de una parcial vive
      // en `res_apunte`, no aquí — ver rowConc).
      // ⚠ Suma sin separar moneda, igual que el semáforo: en una vista con journals de
      // más de una divisa el número mezcla MXN y USD. Se hereda, no se introduce aquí.
      // En una parcial o una desconciliada, `res` es 0 —la línea ya salió de suspense— pero el
      // APUNTE conserva saldo: ese dinero sigue abierto y tiene que sumar, o el residual miente
      // por omisión justo en los dos casos que más cuesta ver.
      var resid = rows.reduce(function (a, t) {
        var st = rowConc(t);
        if (st === 'parcial' || st === 'desconciliada') return a + Math.abs(Number(t.res_apunte) || 0);
        return t.ok ? a : a + (t.res || 0);
      }, 0);
      var nSel = rows.filter(function (t) { return state.sel[t._id]; }).length;
      var ag = q('#ip-aggs'); if (ag) ag.textContent = rows.length + ' líneas · ' + cnt.conciliadas + ' conciliadas · ' + cnt.pendientes + ' sin conciliar' + (cnt.preconciliadas ? ' · ' + cnt.preconciliadas + ' pre-conciliadas' : '') + (cnt.fondeo ? ' · ' + cnt.fondeo + (cnt.fondeo === 1 ? ' fondeo' : ' fondeos') : '') + (cnt.devolucion ? ' · ' + cnt.devolucion + (cnt.devolucion === 1 ? ' devolución' : ' devoluciones') : '') + ' · residual ' + money(resid) + (nSel ? ' · ' + nSel + ' seleccionadas' : '');

      var bn = q('#ip-selbanner');
      if (bn) {
        if (nSel > 0) {
          bn.classList.add('show');
          bn.innerHTML = '<span>Seleccionadas <b>' + nSel + '</b> de <b>' + rows.length + '</b> transacciones de la vista (todas las páginas · ' + pages + ' pág.)</span>' +
            (nSel < rows.length ? '<a id="ip-selall">Seleccionar las ' + rows.length + '</a>' : '') + '<a id="ip-selnone">Quitar selección</a>';
          var sa = q('#ip-selall'), sn = q('#ip-selnone');
          if (sa) sa.addEventListener('click', function () { rows.forEach(function (t) { state.sel[t._id] = true; }); paintTable(); });
          if (sn) sn.addEventListener('click', function () { rows.forEach(function (t) { delete state.sel[t._id]; }); paintTable(); });
        } else { bn.classList.remove('show'); bn.innerHTML = ''; }
      }

      var xls = q('#ip-btnxls'); if (xls) xls.classList.toggle('show', nSel > 0);
      var xc = q('#ip-xlscount'); if (xc) xc.textContent = nSel ? '(' + nSel + ')' : '';

      var pg = q('#ip-pager');
      if (pg) {
        pg.innerHTML = Array.from({ length: pages }, function (_, i) { return '<button class="' + (i + 1 === state.page ? 'on' : '') + '" data-page="' + (i + 1) + '">' + (i + 1) + '</button>'; }).join('');
        qa('#ip-pager button').forEach(function (b) { b.addEventListener('click', function () { state.page = +b.getAttribute('data-page'); paintTable(); }); });
      }

      // wiring de la tabla repintada
      var ca = q('#ip-checkall');
      if (ca) ca.addEventListener('change', function () { rows.forEach(function (t) { if (ca.checked) state.sel[t._id] = true; else delete state.sel[t._id]; }); paintTable(); });
      qa('input[data-row]').forEach(function (rc) { rc.addEventListener('change', function () { var id = +rc.getAttribute('data-row'); if (rc.checked) state.sel[id] = true; else delete state.sel[id]; paintTable(); }); });
      qa('th[data-sort]').forEach(function (th) { th.addEventListener('click', function () { var k = th.getAttribute('data-sort'); if (state.sortK === k) state.sortDir *= -1; else { state.sortK = k; state.sortDir = 1; } paintTable(); }); });
      qa('.ip-colfil').forEach(function (el) { el.addEventListener('click', function (e) { e.stopPropagation(); openColFilter(el.getAttribute('data-colfil'), el); }); });   // Excel-filter: icono ▾ (stopPropagation → no dispara el sort del th)
      var scr = q('.ip-tblscroll'); if (scr) scr.addEventListener('scroll', closeColFilter);   // el popup es fixed → cierra al hacer scroll para no desalinearse

      // Restaurar el scroll tras repintar. Va aqui, con el DOM ya montado y el wiring hecho,
      // no antes: si se restaura con la tabla a medio pintar, la altura aun no existe y el
      // navegador recorta el destino al maximo disponible en ese instante.
      _restaurar();

      // wiring del acordeón de sugerencias (Etapa C) — solo existe en filas expandidas
      qa('button[data-expand]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); toggleExpand(+b.getAttribute('data-expand')); }); });
      qa('input[data-cand]').forEach(function (rc) { rc.addEventListener('change', function () { var id = +rc.getAttribute('data-cand'), idx = +rc.getAttribute('data-idx'); var s = state.sugg[id]; if (s) { s.sel = idx; if (state.expanded === id) paintTable(); } }); });
      qa('button[data-conc]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); doConciliar(+b.getAttribute('data-conc'), b); }); });
      qa('button[data-reload]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); var id = +b.getAttribute('data-reload'); delete state.sugg[id]; loadSugg(state.allRows[id]); paintTable(); }); });
      // A4 — el botón de forzar no se habilita hasta que el motivo llegue a 10 caracteres.
      // El mínimo lo valida TAMBIÉN el server: esto es comodidad, no la garantía.
      qa('textarea[data-ovmot]').forEach(function (ta) {
        ta.addEventListener('click', function (e) { e.stopPropagation(); });
        ta.addEventListener('input', function () {
          var id = ta.getAttribute('data-ovmot');
          var n = ta.value.trim().length;
          var btn = q('button[data-ovgo="' + id + '"]'), hint = q('[data-ovhint="' + id + '"]');
          if (btn) btn.disabled = n < 10;
          if (hint) hint.textContent = n < 10 ? ('Faltan ' + (10 - n) + ' caracteres') : 'Se registrará en el historial del bill';
        });
      });
      qa('button[data-resgo]').forEach(function (b) {
        b.addEventListener('click', function (e) { e.stopPropagation();
          var id = +b.getAttribute('data-resgo');
          delete state.sugg[id].result;   // limpia el aviso para que el acordeon vuelva a candidatos
          doConciliar(id, b, { residual_ok: true });
        });
      });
      qa('button[data-ovgo]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = +b.getAttribute('data-ovgo');
          var ta = q('textarea[data-ovmot="' + id + '"]');
          var motivo = ta ? ta.value.trim() : '';
          if (motivo.length < 10) return;
          doConciliar(id, b, { motivo: motivo });
        });
      });
      qa('[data-buscar]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); toggleExpand(+b.getAttribute('data-buscar')); }); });   // "buscar bill" (link del estado sin-doc → abre acordeón)
      qa('[data-billsearch]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); buscarBills(+b.getAttribute('data-billsearch')); }); });   // Pieza #1: botón Buscar del acordeón
      qa('.ip-busca-in').forEach(function (inp) { inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); buscarBills(+inp.getAttribute('data-bs-folio') || +inp.getAttribute('data-bs-prov') || +inp.getAttribute('data-bs-monto') || +inp.getAttribute('data-bs-tol')); } }); });

      paintSem();
    }

    // ── acordeón de sugerencias + conciliación (Etapa C) ──
    function defaultSel(list) {
      if (!list || !list.length) return null;
      for (var i = 0; i < list.length; i++) { if (list[i].pre_marcado) return i; }
      return 0;
    }
    function toggleExpand(id) {
      if (state.expanded === id) { state.expanded = null; paintTable(); return; }
      state.expanded = id;
      loadSugg(state.allRows[id]);   // lazy: dispara fetch si no está cacheada
      paintTable();
    }
    function loadSugg(row) {
      if (!row) return;
      var id = row._id;
      if (state.sugg[id]) return;                 // cacheada (o cargando / con resultado) → no refetch
      state.sugg[id] = { loading: true };
      if (state.mode !== 'real') {
        // demo: lee del mock (state.suggByRow por índice), simula el "cargando" lazy
        setTimeout(function () {
          if (!document.body.contains(container)) return;
          if (!state.sugg[id] || !state.sugg[id].loading) return;   // colapsada o reemplazada
          var raw = (state.suggByRow && state.suggByRow[id]) || { nivel: 'sin-documento', candidatos: [] };
          var cand = { nivel: raw.nivel, candidatos: raw.candidatos || [] };
          state.sugg[id] = { loading: false, cand: cand, sel: defaultSel(cand.candidatos) };
          if (state.expanded === id) paintTable();
        }, 400);
        return;
      }
      // real: contrato fin/captura-sugerencias → tomamos lineas[0]
      window.FinClient.call(EP_SUGERENCIAS, { companies: window.FinState.getCompanies(), line_ids: [row.id] })
        .then(function (data) {
          var l0 = (data && data.lineas && data.lineas[0]) || { nivel: 'sin-documento', candidatos: [] };
          var cand = { nivel: l0.nivel, candidatos: l0.candidatos || [] };
          state.sugg[id] = { loading: false, cand: cand, sel: defaultSel(cand.candidatos) };
          if (state.expanded === id) paintTable();
        })
        .catch(function (err) {
          state.sugg[id] = { loading: false, error: (err && err.msg) || (err && err.code) || 'error' };
          if (state.expanded === id) paintTable();
        });
    }
    function nivelBadge(nivel) {
      var map = { 'auto-elegible': ['ok', '● Auto-elegible'], 'sugerida': ['warn', '◐ Sugerida'], 'sin-documento': ['gray', '○ Sin documento'] };
      var m = map[nivel] || map['sin-documento'];
      return '<span class="ip-nivel ' + m[0] + '">' + m[1] + '</span>';
    }
    function scoreBar(sc) {
      // El score del motor viaja en escala 0-1 y esto lo trataba como 0-100. Consecuencia:
      // un 0.56 pintaba una barra del 0.56% de ancho — vacía a la vista — y caía SIEMPRE en
      // rojo, porque ningún score llega jamás a 60 en esa escala. Un 0.91 se veía igual de mal.
      // Tolerante en los dos sentidos: si algún día el server manda 0-100, se respeta.
      var n = +sc || 0;
      var v = Math.max(0, Math.min(100, n <= 1 ? Math.round(n * 100) : Math.round(n)));
      // Umbrales alineados con las BANDAS DEL MOTOR (pleno > 70, sugerida >= 30), no con unos
      // propios: con 85/60 la barra salía roja junto a una etiqueta que decía «Sugerida», o sea
      // que el color contradecía al texto que tenía al lado.
      var cls = v > 70 ? 'g' : v >= 30 ? 'y' : 'r';
      return '<span class="ip-score"><span class="ip-scorebar ' + cls + '"><i style="width:' + v + '%"></i></span><span class="ip-scorenum">' + v + '</span></span>';
    }
    function candHtml(t, c, i) {
      var checked = state.sugg[t._id] && state.sugg[t._id].sel === i;
      var dd = c.days_diff === 0 ? 'mismo día' : (Math.abs(c.days_diff || 0) + 'd');
      return '<label class="ip-cand' + (checked ? ' on' : '') + '">' +
        '<input type="radio" name="ip-cand-' + t._id + '" data-cand="' + t._id + '" data-idx="' + i + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="ip-cand-main">' +
          '<span class="ip-cand-top"><span class="ip-cand-bill">' + esc(c.bill_name) + '</span>' +
            '<span class="ip-cand-partner">' + esc(c.partner) + '</span>' +
            // Dice lo que afirma. El server marca este candidato por PROXIMIDAD DE FECHA
            // (menor days_diff, empate por bill_aml_id más bajo) — NO por score, aunque la
            // lista se ordena por score. "pre-marcado" se leía como recomendación del motor
            // y no lo es. Renombrado, no realineado: el criterio de fecha tiene uso propio.
            (c.pre_marcado ? '<span class="ip-chip pre" title="El server marca el candidato con la fecha más cercana al cargo (menor diferencia de días). NO es la mejor puntuación: la lista está ordenada por score, que combina similitud de comercio (60%) y proximidad de fecha (40%). También es el que viene preseleccionado.">fecha más cercana</span>' : '') +
            (c._fromSearch ? '<span class="ip-chip busca">🔎 buscado</span>' : '') +
            (c.empresa ? '<span class="ip-chip emp">' + esc(c.empresa) + '</span>' : '') +
            (c.conflicto ? '<span class="ip-chip conf">⚠ revisar</span>' : '') + '</span>' +
          '<span class="ip-cand-sub"><span class="ip-cand-monto">' + money(c.monto_bill) + '</span>' +
            '<span class="ip-cand-date">' + esc(c.date_bill) + ' · ' + esc(dd) + '</span>' +
            '<span class="ip-band ' + esc(c.banda) + '">' + esc(c.banda) + '</span>' +
            (c.score == null ? (c.cuenta ? '<span class="ip-cand-cta">cta ' + esc(c.cuenta) + '</span>' : '') : scoreBar(c.score)) + '</span>' +
          (c.analitica ? '<span class="ip-cand-ana" title="Analítica del bill (proyecto/rubro)">📊 ' + esc(c.analitica) + '</span>' : '') +
        '</span></label>';
    }
    function resultHtml(t, r) {
      if (r.ok && !r.parcial) {
        return '<div class="ip-acc"><div class="ip-res ok">✓ Conciliada' + (r.bill_name ? ' · <b>' + esc(r.bill_name) + '</b>' : '') + ' — <span class="ip-mono2">' + esc(r.full_reconcile_id || '') + '</span></div></div>';
      }
      if (r.ok && r.parcial) {
        return '<div class="ip-acc"><div class="ip-res partial">✓ Conciliada PARCIALMENTE — quedan línea <b>' + money(r.residual_linea) + '</b> / bill <b>' + money(r.residual_bill) + '</b></div></div>';
      }
      // Guard humanizado (ej. BILL_NO_201 = cross-company) + código técnico en el detalle.
      var human = humanConcMsg(r, t);
      // A4 — override del corte. Aparece SOLO cuando el server bloqueó por pre-corte, así que
      // no hay forma de que salga en una línea que no lo necesita: lo gobierna la respuesta,
      // no una condición del cliente que pudiera desincronizarse del guard real.
      // Aviso de residual: confirmación explícita, sin motivo escrito (a diferencia del override
      // del corte). Aquí no hay riesgo de duplicar gasto — hay riesgo de dejar un descuadre
      // invisible, y basta con que quede constancia de que alguien lo vio y siguió.
      if (r.code === 'DEJARA_RESIDUAL') {
        return '<div class="ip-acc"><div class="ip-res bad">' + esc(r.msg) + '</div>' +
          '<div class="ip-ovbox"><div class="ip-ovlbl">Puede ser correcto —el comercio cobró más que la factura— pero queda registrado que lo confirmaste.</div>' +
          '<div class="ip-ovrow"><button class="ip-ovbtn" data-resgo="' + t._id + '">Conciliar dejando ' + money(r.residual) + ' sin cerrar</button>' +
          '<span class="ip-ovhint">Se enviará con tu confirmación</span></div></div>' +
          '<div class="ip-acc-actions"><button class="ip-acc-reload" data-reload="' + t._id + '">↻ Recargar sugerencias</button></div></div>';
      }
      if (r.code === 'PRE_CORTE_BLOQUEADA') {
        return '<div class="ip-acc"><div class="ip-res bad">' + esc(r.msg || human) + ' <span class="ip-mono2">(' + esc(r.code) + ')</span></div>' +
          '<div class="ip-ovbox">' +
            '<div class="ip-ovlbl">Si aun así vas a forzarla, escribe por qué. Queda en el historial del bill, con tu nombre y la fecha.</div>' +
            '<textarea class="ip-ovmot" data-ovmot="' + t._id + '" rows="2" placeholder="Motivo (mínimo 10 caracteres)"></textarea>' +
            '<div class="ip-ovrow">' +
              '<button class="ip-ovbtn" data-ovgo="' + t._id + '" disabled>Forzar conciliación</button>' +
              '<span class="ip-ovhint" data-ovhint="' + t._id + '">Faltan 10 caracteres</span>' +
            '</div>' +
          '</div>' +
          '<div class="ip-acc-actions"><button class="ip-acc-reload" data-reload="' + t._id + '">↻ Recargar sugerencias</button></div></div>';
      }
      return '<div class="ip-acc"><div class="ip-res bad">' + esc(human) + ' <span class="ip-mono2">(' + esc(r.code || 'ERROR') + ')</span></div>' +
        '<div class="ip-acc-actions"><button class="ip-acc-reload" data-reload="' + t._id + '">↻ Recargar sugerencias</button></div></div>';
    }
    // FTS-USA = company 6. Se acepta el id o la razón social, igual que visibleRows: el endpoint
    // real manda `rs` sin `company_id`, y el demo al revés.
    function esUSA(t) { return !!t && (t.company_id === 6 || t.rs === 'FTS LLC'); }

    // Traduce códigos de guard del conciliar a lenguaje humano (el código técnico queda en el detalle).
    // Recibe la RESPUESTA COMPLETA, no solo el código: desde el fix de P1 el server manda campos
    // estructurados (cuenta_suspense, company_id, encontradas) que dicen más que cualquier texto
    // que el panel pueda inventar.
    function humanConcMsg(r, t) {
      var code = r && r.code, msg = r && r.msg;
      // NO_SUSPENSE_UNICA — el mensaje bueno depende de QUÉ VERSIÓN DEL MOTOR contestó.
      //
      // Hasta el 2026-09-03 el motor contaba las patas de suspense filtrando por la cuenta 184
      // (FTS-MX). En una línea de FTS-USA encontraba cero y culpaba a la línea de estar «ya
      // parcialmente desenredada», que era falso: la pata existía, intacta, en la 309.
      // Comprobado sobre las líneas 33235 y 33121, las dos limpias.
      //
      // Ese motor ya se corrigió: elige el par de cuentas por empresa (1 → 184/17, 6 → 309/285)
      // y su mensaje ahora dice en qué cuenta buscó y cuántas encontró. Cuando llega ese
      // mensaje —se reconoce porque trae `cuenta_suspense`— se pasa tal cual: es más preciso
      // que cualquier explicación de aquí, y repetir la vieja acusaría a una causa ya arreglada.
      //
      // El texto anterior se queda SOLO como respaldo para el motor viejo. Es la mitad tolerante
      // (CLAUDE.md §8, regla anti-trabón): el panel entiende las dos respuestas, así que ni un
      // rollback del workflow ni un caché viejo dejan al operador sin explicación.
      if (code === 'NO_SUSPENSE_UNICA') {
        if (r.cuenta_suspense != null) return msg || 'No se encontró exactamente una pata de suspense.';
        if (esUSA(t)) {
          return 'Esta línea es de FTS-USA y su contrapartida está en la cuenta de suspense 309. ' +
                 'El motor que contestó todavía busca en la 184, que es la de FTS-MX, así que no la ' +
                 'encuentra. Es una respuesta de la versión anterior del workflow. El bill no se tocó.';
        }
        return 'La línea no tiene exactamente una pata de suspense: ya está a medio desenredar. Se resuelve en Odoo, no desde aquí.';
      }
      var map = {
        'BILL_NO_201': 'Este bill está cargado a otra empresa/cuenta — caso cross-company, no conciliable desde aquí por ahora.',
        'BILL_OTRA_EMPRESA': 'El bill y la línea son de empresas distintas. No se concilia cruzado entre compañías.',
        'EMPRESA_SIN_MAPEO': 'La empresa de esta línea no tiene cuentas de conciliación configuradas en el motor. No se tocó nada.',
        'LINE_YA_CONCILIADA': 'Esta línea ya fue conciliada (el mundo cambió). Recarga las sugerencias.',
        'BILL_YA_CONCILIADO': 'El bill ya fue conciliado por otra línea. Recarga las sugerencias.'
      };
      return map[code] || msg || 'No se pudo conciliar.';
    }
    // ── Pieza #1: buscador manual de bills (17+285) dentro del acordeón ──
    // Enriquece la MISMA lista de candidatos (append + dedupe) → el botón Conciliar existente hace el write, cero lógica nueva.
    function readVal(sel) { var el = q(sel); return el ? String(el.value || '').trim() : ''; }
    function buscaHtml(t) {
      var b = (state.sugg[t._id] && state.sugg[t._id].busca) || null;
      var st = '';
      if (b) {
        if (b.status === 'loading') st = '<span class="ip-busca-st load"><span class="ip-accspin"></span> buscando…</span>';
        else if (b.status === 'unavailable') st = '<span class="ip-busca-st na">' + esc(b.msg || 'Buscador no disponible.') + '</span>';
        else if (b.status === 'error') st = '<span class="ip-busca-st err">' + esc(b.msg || 'Error al buscar.') + '</span>';
        else if (b.status === 'done') st = '<span class="ip-busca-st ok">' + b.count + ' encontrado' + (b.count === 1 ? '' : 's') +
          (b.count > 0 && b.added === 0 ? ' (ya estaban en la lista)' : (b.added ? ' · ' + b.added + ' agregado' + (b.added === 1 ? '' : 's') : '')) +
          (b.truncated ? ' · hay más, afina la búsqueda' : '') + '</span>';
      }
      return '<div class="ip-busca"><div class="ip-busca-tit">¿No está el bill correcto? <b>Búscalo</b> <span class="ip-busca-sub">· cuentas 17 y 285, bills abiertos</span></div>' +
        '<div class="ip-busca-form">' +
          '<input class="ip-busca-in" data-bs-folio="' + t._id + '" placeholder="Folio (BILL…)" autocomplete="off">' +
          '<input class="ip-busca-in" data-bs-prov="' + t._id + '" placeholder="Proveedor" autocomplete="off">' +
          '<input class="ip-busca-in mon" type="number" step="0.01" data-bs-monto="' + t._id + '" placeholder="Monto">' +
          '<input class="ip-busca-in tol" type="number" step="0.01" data-bs-tol="' + t._id + '" placeholder="± tol" value="0.50">' +
          '<button class="ip-busca-btn" data-billsearch="' + t._id + '">🔎 Buscar</button>' +
        '</div>' + (st ? '<div class="ip-busca-status">' + st + '</div>' : '') + '</div>';
    }
    function buscarBills(id) {
      var row = state.allRows[id]; if (!row) return;
      var s = state.sugg[id]; if (!s) { s = state.sugg[id] = { loading: false, cand: { nivel: 'sin-documento', candidatos: [] }, sel: null }; }
      if (!s.cand) s.cand = { nivel: 'sin-documento', candidatos: [] };
      var folio = readVal('[data-bs-folio="' + id + '"]'), prov = readVal('[data-bs-prov="' + id + '"]');
      var monto = readVal('[data-bs-monto="' + id + '"]'), tol = readVal('[data-bs-tol="' + id + '"]');
      if (!folio && !prov && !monto) { s.busca = { status: 'error', msg: 'Escribe folio, proveedor o monto.' }; paintTable(); return; }
      s.busca = { status: 'loading' }; paintTable();
      if (state.mode !== 'real') {
        setTimeout(function () { if (!document.body.contains(container)) return; s.busca = { status: 'unavailable', msg: 'El buscador solo opera en modo Real.' }; paintTable(); }, 300);
        return;
      }
      var params = { line_id: row.id, line_date: row.d, limit: 20, companies: window.FinState.getCompanies() };
      if (folio) params.folio = folio;
      if (prov) params.proveedor = prov;
      if (monto) { params.monto = Number(monto); params.monto_tol = tol ? Number(tol) : 0.5; }
      window.FinClient.call(EP_BUSCAR, params)
        .then(function (data) {
          // endpoint inactivo → n8n responde 404 sin `resultados` (FinClient no lo rechaza) → degrada elegante
          if (!data || !Array.isArray(data.resultados)) { s.busca = { status: 'unavailable', msg: 'Buscador no disponible aún (endpoint sin activar).' }; paintTable(); return; }
          var existing = {}; (s.cand.candidatos || []).forEach(function (c) { existing[c.bill_aml_id] = true; });
          var added = 0;
          data.resultados.forEach(function (c) { if (!existing[c.bill_aml_id]) { c._fromSearch = true; s.cand.candidatos.push(c); existing[c.bill_aml_id] = true; added++; } });
          if ((s.cand.nivel === 'sin-documento') && s.cand.candidatos.length) s.cand.nivel = 'sugerida';
          if (s.sel == null && s.cand.candidatos.length) s.sel = 0;   // preselecciona el primero para habilitar Conciliar
          s.busca = { status: 'done', count: data.resultados.length, added: added, truncated: !!data.truncated };
          paintTable();
        })
        .catch(function (err) {
          var code = (err && err.code) || '';
          var unavailable = code === 'NETWORK' || code === 'BAD_RESPONSE' || (err && err.http === 404);
          s.busca = unavailable ? { status: 'unavailable', msg: 'Buscador no disponible (sin conexión / endpoint inactivo).' } : { status: 'error', msg: (err && err.msg) || code || 'Error al buscar.' };
          paintTable();
        });
    }
    function accordionHtml(t) {
      var s = state.sugg[t._id];
      if (!s || s.loading) return '<div class="ip-acc"><div class="ip-acc-loading"><span class="ip-accspin"></span> Cargando sugerencias…</div></div>';
      if (s.result) return resultHtml(t, s.result);
      if (s.error) return '<div class="ip-acc"><div class="ip-res bad">No se pudieron cargar las sugerencias: ' + esc(s.error) + '</div><div class="ip-acc-actions"><button class="ip-acc-reload" data-reload="' + t._id + '">↻ Reintentar</button></div></div>';
      var cand = s.cand || { nivel: 'sin-documento', candidatos: [] };
      var nivel = cand.nivel || 'sin-documento';
      var list = cand.candidatos || [];
      if (nivel === 'sin-documento' || !list.length) {
        return '<div class="ip-acc">' + nivelBadge(nivel) +
          '<div class="ip-acc-nodoc">Sin bill que conciliar automáticamente — <b>búscalo abajo</b>, o esta línea va al <b>censo</b> para captura / registro manual.</div>' +
          buscaHtml(t) + '</div>';
      }
      var chosen = (s.sel != null && list[s.sel]);
      return '<div class="ip-acc">' + nivelBadge(nivel) +
        '<div class="ip-acc-list">' + list.map(function (c, i) { return candHtml(t, c, i); }).join('') + '</div>' +
        '<div class="ip-acc-actions"><button class="ip-acc-conc" data-conc="' + t._id + '"' + (chosen ? '' : ' disabled') + '>Conciliar</button>' +
          '<span class="ip-acc-hint">Elige el documento y confirma. La conciliación escribe en Odoo (modo real).</span></div>' +
        buscaHtml(t) + '</div>';
    }
    function demoOutcome(cand) {
      var o = cand.demo_outcome || 'full';
      if (o === 'parcial') {
        var rd = cand.residual_demo || { linea: 0, bill: 0 };
        return { ok: true, parcial: true, residual_linea: rd.linea, residual_bill: rd.bill, bill_name: cand.bill_name, monto: cand.monto_bill, msg: 'Conciliación parcial (demo).' };
      }
      if (o === 'rechazo') {
        return { ok: false, code: 'BILL_YA_CONCILIADO', msg: 'El bill ya fue conciliado por otra línea (el mundo cambió). Recarga las sugerencias.' };
      }
      return { ok: true, parcial: false, full_reconcile_id: 'REC-DEMO-' + cand.bill_aml_id, bill_name: cand.bill_name, monto: cand.monto_bill, msg: 'Conciliada (demo).' };
    }
    function doConciliar(id, btn, ov) {
      var s = state.sugg[id]; if (!s || !s.cand || s.sel == null) return;
      var cand = s.cand.candidatos[s.sel]; if (!cand) return;
      if (btn) { btn.disabled = true; btn.classList.add('busy'); btn.textContent = 'Conciliando…'; }
      var row = state.allRows[id];
      if (state.mode !== 'real') {
        setTimeout(function () { if (!document.body.contains(container)) return; applyConcResult(id, demoOutcome(cand)); }, 700);
        return;
      }
      // AVISO DE RESIDUAL. Si el cargo es mayor que el bill, la conciliación deja saldo abierto
      // en el apunte de la cuenta 17 — y hoy eso es INVISIBLE: la línea sale "conciliada" porque
      // Odoo solo mira si queda suspense. Es lo que pasó con Ferr ($334.08 abiertos, nadie lo vio).
      // Fricción, no bloqueo: conciliar así puede ser correcto; lo que no puede es hacerlo a ciegas.
      var _falt = Math.round((Math.abs(Number(row.amt) || 0) - Math.abs(Number(cand.monto_bill) || 0)) * 100) / 100;
      if (_falt > 0.005 && !(ov && ov.residual_ok)) {
        if (btn) { btn.disabled = false; btn.classList.remove('busy'); btn.textContent = 'Conciliar'; }
        applyConcResult(id, { ok: false, code: 'DEJARA_RESIDUAL', http: 0, residual: _falt,
          msg: 'Esto va a dejar ' + money(_falt) + ' sin cerrar en la cuenta 17. El cargo (' + money(Math.abs(row.amt)) +
               ') es mayor que el bill (' + money(Math.abs(cand.monto_bill)) + '), así que el apunte conserva saldo ' +
               'aunque la línea aparezca conciliada.' });
        return;
      }
      // El override viaja SOLO si el humano lo pidió tras ver el bloqueo (ver resultHtml).
      // Nunca se manda por default: el server lo exige explícito y con motivo.
      var payload = { line_id: row.id, bill_aml_id: cand.bill_aml_id };
      if (ov && ov.residual_ok) { payload.residual_confirmado = _falt; payload.residual_confirmado_por = (window.FinAuth && window.FinAuth.getUser && window.FinAuth.getUser()) || 'ui'; }
      if (ov && ov.motivo) { payload.override_pre_corte = true; payload.override_motivo = ov.motivo; }
      window.FinClient.call(EP_CONCILIAR, payload)
        .then(function (r) { applyConcResult(id, r || {}); })
        .catch(function (err) { applyConcResult(id, { ok: false, code: (err && err.code) || 'ERROR', msg: (err && err.msg) || 'Error al conciliar.' }); });
    }
    function applyConcResult(id, r) {
      var s = state.sugg[id]; if (!s) return;
      s.result = r;
      var row = state.allRows[id];
      if (r.ok && !r.parcial) {
        // La marca local pinta el estado al instante, pero NO trae las transitivas (PO, Bill,
        // Status bill, Analítica, Folio fiscal): esas solo las resuelve el server siguiendo el
        // full_reconcile_id, que acaba de nacer. Marcarla sin releer dejaba la fila diciendo
        // "✓ Conciliada" con "—" en las cinco columnas, que es afirmar que no hay documento
        // cuando sí lo hay. Se marca como pendiente de releer y se relee de verdad.
        if (row) { row.ok = true; row.res = 0; row._stale = true; }
        // baja el panel Hoy: −1 pendiente, +1 conciliada manual (botón)
        if (state.today) {
          if (state.today.conciliable_pendiente) state.today.conciliable_pendiente.total = Math.max(0, (state.today.conciliable_pendiente.total || 0) - 1);
          if (state.today.conciliadas_hoy) {
            var _ch = state.today.conciliadas_hoy;
            _ch.boton = (_ch.boton || 0) + 1;
            if (_ch.manual != null) _ch.manual = _ch.manual + 1;   // v0.5.15: la vista pinta `manual`
            _ch.total = (_ch.total || 0) + 1;
          }
          paintChips();
        }
        paintTable();
        toast('Conciliada' + (r.bill_name ? ' · <b>' + esc(r.bill_name) + '</b>' : ''));
        setTimeout(function () {
          if (!document.body.contains(container)) return;
          if (state.expanded === id) state.expanded = null;
          delete state.sugg[id];
          // Releer del server: el 200 no es prueba de que el estado quedó, y las transitivas
          // solo existen del lado de Odoo. Eso NO se toca (CLAUDE.md §8).
          // Lo que sí cambia es el PRECIO de la relectura. Antes era un load() completo:
          // blanqueaba la tabla con la pantalla de carga, tiraba state.sugg ENTERO y volvía a
          // pedir sugerencias para TODAS las pendientes — en producción ~1,800 líneas en lotes
          // de 200, o sea ~9 llamadas extra por cada línea conciliada. Quien concilia veinte
          // seguidas pagaba ese ciclo veinte veces.
          // Ahora: silenciosa (la tabla vieja sigue en pantalla), conserva las sugerencias ya
          // evaluadas y tira solo la de la línea recién conciliada. Mismos datos y mismo
          // criterio de verdad, sin el impuesto.
          if (state.mode === 'real') { load({ quiet: true, keepSugg: true, dropId: row && row.id }); } else { paintTable(); }
        }, 1500);
        return;
      }
      if (r.ok && r.parcial) {
        if (row) { row.res = (r.residual_linea != null ? r.residual_linea : row.res); row.ok = false; }
        paintTable();
        toast('Conciliada parcialmente — residual línea <b>' + money(r.residual_linea) + '</b>');
        return;
      }
      // rechazo: no marca conciliada; el acordeón muestra el error + "Recargar sugerencias"
      paintTable();
      toast('<b>' + esc(r.code || 'ERROR') + '</b> — no se concilió');
    }

    // ── semáforo ──
    function semColor(pct, res) {
      if (pct === null) return 'off';
      if (res > RESIDUAL_UMBRAL_MXN) return 'r';
      if (pct === 100 && res === 0) return 'g';
      if (pct >= 90) return 'y';
      return 'r';
    }
    function barc(c) { return c === 'g' ? 'var(--ip-ok)' : c === 'y' ? 'var(--ip-warn)' : 'var(--ip-bad)'; }
    // Los colores de BARRA no sirven para TEXTO. Medido en Chromium sobre blanco: --ip-warn
    // (#e8a500) da 2.14:1 y --ip-ok (#12a150) da 3.03:1, cuando WCAG AA pide 4.5:1 a este
    // tamaño. Salió al poner los conteos reales de Odoo en el harness: con datos inventados
    // Jeeves caía en rojo (que sí pasa) y el amarillo nunca se pintaba. Una barra de 6 px es
    // un gráfico y puede ir brillante; un porcentaje es texto y tiene que leerse.
    function barcTxt(c) { return c === 'g' ? '#0d7a3f' : c === 'y' ? '#8a6000' : '#c93b2f'; }
    function paintSem() {
      var host = q('#ip-semrows'); if (!host) return;
      var journals = journalListServer();   // v0.5.15: derivado del server, ya no una lista escrita a mano.
      // V1.09: explícitamente la del SERVER — el catálogo entra al filtro, no al semáforo.
      var base = state.allRows;   // el semáforo admin evalúa todo el universo cargado, no la vista filtrada
      if (!journals.length) { host.innerHTML = '<div class="ip-empty" style="padding:14px">Sin journals que evaluar.</div>'; return; }
      var data = journals.map(function (x) {
        var r = base.filter(function (t) { return t.j === x.label; });
        var tot = r.length, conc = r.filter(function (t) { return t.ok; }).length, res = r.reduce(function (a, t) { return a + (t.res || 0); }, 0);
        return { n: x.label, tot: tot, conc: conc, res: res, pct: tot ? Math.round(conc / tot * 100) : null };
      });
      var all = { tot: base.length, conc: base.filter(function (t) { return t.ok; }).length, res: base.reduce(function (a, t) { return a + (t.res || 0); }, 0) };
      all.pct = all.tot ? Math.round(all.conc / all.tot * 100) : null;

      // v0.5.16: celdas compactas en rejilla. Mismos datos y mismos umbrales que antes —
      // solo cambia la forma: nombre+% arriba, barra fina, conteo+residual abajo.
      function cell(d, isTotal) {
        var c = semColor(d.pct, d.res);
        return '<div class="semcell' + (isTotal ? ' total' : '') + '">' +
          '<div class="top"><span class="jn">' + (isTotal ? '<span class="light ' + c + '"></span> TODOS' : esc(d.n)) + '</span>' +
            '<span class="pct" style="color:' + barc(c) + '">' + (d.pct === null ? '—' : d.pct + '%') + '</span></div>' +
          '<div class="bar"><i style="width:' + (d.pct || 0) + '%;background:' + barc(c) + '"></i></div>' +
          '<div class="foot"><span>' + (d.pct === null ? '—' : d.conc + '/' + d.tot) + '</span>' +
            '<span class="res">' + (d.pct === null ? '' : money(d.res)) + '</span></div></div>';
      }
      // v0.5.25 — DOS semáforos que NUNCA se suman ni comparten contador. Son universos
      // distintos con direcciones deseadas opuestas: B debe mantenerse ALTO, A debe SUBIR
      // hasta vaciarse. Sumarlos escondería el cumplimiento nuevo bajo la deuda vieja.
      var m = state.metricas || null;
      var corte = (m && m.fecha_corte) || '2026-07-24';
      var html = '';

      // ── B · POST-CORTE. Protagonista, expandido, arriba. ──
      // El desglose POR JOURNAL va primero y el global después, a propósito: el agregado
      // ATRIBUYE MAL. 122 y 123 están casi al 0% porque nadie les propone bills todavía, no
      // porque el equipo no trabaje. Un porcentaje global en grande se lee como "la operación
      // va mal" cuando lo que dice es "hay dos fuentes sin sugerencias".
      if (m && m.cumplimiento) {
        var pj = (m.por_journal || []).filter(function (x) { return (x.post_total || 0) > 0; });
        // El foco de la cabecera se calcula SOLO sobre las fuentes con motor (v0.5.37). Antes
        // usaba el total global —159 de 561 = 28% → ROJO— mientras el texto de abajo dice
        // "No hay total: un porcentaje global nunca llegaría al 100% mientras haya fuentes sin
        // abrir". Un foco rojo es un porcentaje global disfrazado: decía justo lo que el panel
        // se niega a decir, y acusaba a la operación por dos journals que nadie ha abierto.
        // Sin fuentes con motor no hay nada que calificar → 'off', no rojo.
        var conMotor = pj.filter(function (x) { return x.en_motor; });
        var bt = conMotor.reduce(function (a2, x) { return a2 + (x.post_total || 0); }, 0);
        var bc = conMotor.reduce(function (a2, x) { return a2 + (x.post_conc || 0); }, 0);
        var bp = bt ? Math.round(bc / bt * 1000) / 10 : null;
        var bcol = bp === null ? 'off' : (bp >= 100 ? 'g' : bp >= 85 ? 'y' : 'r');
        pj.sort(function (a, b) { return (b.en_motor ? 1 : 0) - (a.en_motor ? 1 : 0) || (b.post_total - a.post_total); });
        // MISMO FORMATO PARA LAS TRES FUENTES (V1.02). Antes las fuentes sin motor se pintaban
        // sin barra, sin porcentaje y sin foco, con el argumento de que "un 0% en rojo dice
        // fracaso donde lo que hay es no empezado". Esteban pidió lo contrario: las tres con su
        // barra de color y su pendiente contado desde el corte, porque lo que necesita ver de un
        // golpe es CUÁNTO falta en cada fuente, no una taxonomía de por qué falta. El motivo no
        // se pierde — sigue en la etiqueta "sin abrir" y en la nota de abajo —, pero deja de
        // costar el número.
        var filas = pj.map(function (x) {
          var conc = Number(x.post_conc) || 0;
          var faltan = x.post_total - conc;
          var p = x.post_total ? Math.round(conc / x.post_total * 1000) / 10 : null;
          var comp = composicionFaltan(x.label, corte, faltan);
          // EL COLOR SIGUE AL PENDIENTE ACCIONABLE, no al porcentaje de Odoo (V1.07).
          // Antes salía del porcentaje: con 168 de 172 daba 97.7% y pintaba AMARILLO aunque no
          // quedara una sola línea por conciliar — las 4 que faltaban eran 2 fondeos y 2
          // devoluciones, que el motor no cierra y que no son trabajo de nadie. El titular ya
          // media lo accionable desde V1.02, así que el foco lo contradecía: decía "0 por
          // conciliar" en grande y encendía la luz de "vas a medias".
          // El porcentaje NO se toca: sigue siendo el de Odoo y se lee en el renglón de abajo,
          // junto al total sin conciliar. Lo que cambia es qué pregunta responde el color:
          // "¿queda algo por hacer?" en vez de "¿cuánto le falta al 100%?".
          var pendienteReal = (comp.ok && comp.fon + comp.dev > 0) ? comp.conc : faltan;
          var c2;
          if (p === null) c2 = 'off';
          else if (pendienteReal === 0) c2 = 'g';       // nada que conciliar = verde, aunque el % no llegue a 100
          else c2 = (p >= 85 ? 'y' : 'r');              // amarillo a tiro, rojo lejos

          // EL TITULAR ES EL NÚMERO ACCIONABLE, no el total sin conciliar. Con 6 gastos + 2
          // fondeos + 2 devoluciones, un "Faltan 10" se lee como diez pendientes de conciliar y
          // solo seis lo son; los otros cuatro esperan una nota de crédito o el lado BBVA, y no
          // hay nada que Eduardo pueda hacer con ellos. El 10 no desaparece: baja al renglón de
          // abajo, junto al porcentaje, que es donde vive la métrica de Odoo.
          var titular;
          if (faltan === 0) titular = '<b>Al 100%</b>';
          else if (comp.ok && comp.fon + comp.dev > 0) titular = '<b>' + comp.conc + '</b> por conciliar';
          else titular = 'Faltan <b>' + faltan + '</b> para el 100%';

          var detalle = conc + ' de ' + x.post_total + ' · ' +
            '<span style="color:' + barcTxt(c2) + ';font-weight:700">' + (p === null ? '—' : p + '%') + '</span>';
          // "abiertas en Odoo", no "sin conciliar": el titular de arriba ya usa el verbo
          // conciliar para el TRABAJO pendiente, y repetirlo aquí para el flag is_reconciled
          // ponía dos cifras del mismo verbo una debajo de otra —"0 por conciliar" y "4 sin
          // conciliar"— que se leen como una contradicción. Son dos cosas distintas y ahora
          // se llaman distinto.
          if (comp.ok && comp.fon + comp.dev > 0) detalle += ' · ' + faltan + ' abiertas en Odoo';

          return '<div class="s2card meta' + (x.en_motor ? '' : ' sinmotor') + '">' +
            '<div class="s2ct"><span class="light ' + c2 + '"></span>' + esc(x.label) +
              (x.en_motor ? '' : '<span class="s2tag">sin abrir</span>') + '</div>' +
            '<div class="s2goal">' + titular + '</div>' +
            '<div class="bar"><i style="width:' + (p || 0) + '%;background:' + barc(c2) + '"></i></div>' +
            '<div class="s2cn">' + detalle + '</div>' +
            comp.html +
            (x.en_motor ? '' : '<div class="s2cw">Este journal ya está abierto de los dos lados: ' +
              'el motor <b>propone bills</b> al desplegar la fila y <b>conciliar funciona</b> ' +
              '(primera línea cerrada el 2026-09-03). La etiqueta viene de un dato del server ' +
              'que todavía no se actualiza; no significa que falte nada aquí.</div>') +
            '</div>';
        }).join('');
        html += '<div class="ip-sem2 b">' +
          '<div class="s2head"><span class="s2ts">Datos al ' + esc(hoyCst()) + ' ' + esc(horaCst()) + ' CST</span></div>' +
          '<div class="s2title"><span class="light ' + bcol + '"></span> <span class="s2lbl">Desde el corte</span> <b>' + esc(corte) + '</b>' +
            '<span class="s2dir" title="Debe mantenerse alto">↑ mantener</span></div>' +
          '<div class="s2rows">' + (filas || '<div class="ip-empty">Sin líneas posteriores al corte.</div>') + '</div>' +
          '<div class="s2why">Cada fuente se mide sola. <b>No hay total</b>: un porcentaje global ' +
            'nunca llegaría al 100% mientras haya fuentes sin abrir, y ese número no sirve para exigir.</div>' +
          '<div class="s2trend">' + trendHtml('B') + '</div></div>';
      }

      // ── SIN FEED (V1.09). Cuentas que existen en Odoo y que ningún capturador toca todavía. ──
      // No entran a las tarjetas de arriba porque no tienen post_total y un 0% calculado sobre
      // cero líneas se lee como "va mal" cuando lo que hay es "no hay datos". Pero tampoco pueden
      // faltar: BBVA General lleva 301 líneas en Odoo y su última información es de diciembre de
      // 2025 — no aparecer en ningún lado se lee como "al día". Un renglón por cuenta, con la
      // fecha del último dato y su medición, sin porcentaje ni foco que no se puedan sostener.
      var vivosSem = {};
      ((m && m.por_journal) || []).forEach(function (x) { if (x && x.journal != null) vivosSem[x.journal] = true; });
      (state.sourcesServer || []).forEach(function (x) { var j = journalDe(x); if (j != null) vivosSem[j] = true; });
      var sinFeed = CATALOGO_FUENTES.filter(function (c) { return !vivosSem[c.journal]; });
      if (sinFeed.length) {
        html += '<details class="ip-sem2 sinfeed"><summary>' +
          '<span class="s2title"><span class="light off"></span><span class="s2lbl">Sin feed conectado</span>' +
            '<span class="s2tag">no medibles</span></span>' +
          '<span class="s2sum"><b>' + sinFeed.length + '</b> cuenta' + (sinFeed.length === 1 ? '' : 's') +
            ' sin captura</span></summary>' +
          '<div class="s2body"><div class="s2note" style="margin-top:12px">' +
            'Estas cuentas existen en Odoo pero <b>ningún proceso captura sus movimientos</b>, así que el ' +
            'panel no puede calcularles ni porcentaje ni pendiente. No están al día: están <b>sin medir</b>.' +
          '</div><ul class="s2list">' +
          sinFeed.map(function (c) {
            return '<li><b>' + esc(c.nm) + '</b> <span class="s2tag">j·' + c.journal + '</span> ' +
              '<span class="s2tag">' + esc(c.moneda) + '</span><br>' +
              (c.last
                 ? 'Última información: <b>' + esc(c.last) + '</b>. '
                 : 'Sin ningún movimiento registrado. ') +
              esc(c.backlog) + ' · medido el ' + esc(c.medido) + '.</li>';
          }).join('') +
          '</ul></div></details>';
      }

      // ── A · BACKLOG. Deuda, no operación diaria: colapsado, y el detalle por journal dentro. ──
      var at = '', ap = '';
      if (m && m.deuda) {
        // Se leen los DOS nombres a propósito (v0.5.37). El detalle de abajo usa `pre_pend`
        // por journal y el resumen usaba solo `pre_corte_pendientes`: si el server manda el
        // primero, la tarjeta decía "0 pendientes · $0.00" con el desglose lleno debajo —
        // dos cifras contradictorias en la misma tarjeta. Tolerar ambas es la mitad segura
        // (CLAUDE.md §8, regla anti-trabón): sea cual sea el nombre real, la cifra sale.
        var _dp = m.deuda.pre_corte_pendientes != null ? m.deuda.pre_corte_pendientes : m.deuda.pre_pend;
        var _dm = m.deuda.pre_corte_monto != null ? m.deuda.pre_corte_monto : m.deuda.pre_monto;
        // Último recurso: si la deuda no trae ninguno de los dos, se suma el desglose por
        // journal, que es la misma cifra vista por fuente. Nunca un 0 inventado.
        if (_dp == null) { _dp = (m.por_journal || []).reduce(function (a2, x) { return a2 + (x.pre_pend || 0); }, 0) || null; }
        if (_dm == null) { _dm = (m.por_journal || []).reduce(function (a2, x) { return a2 + (x.pre_monto || 0); }, 0) || null; }
        ap = _dp == null ? 'sin datos del server'
           : '<b>' + _dp + '</b> pendientes' + (_dm == null ? '' : ' · ' + money(_dm));
        at = '';   // la tendencia vive solo en B: repetirla en A decia dos veces lo mismo
      } else { ap = 'sin datos del server'; }
      html += '<details class="ip-sem2 a"><summary>' +
        '<span class="s2title"><span class="s2lbl">Backlog — anterior a</span> <b>' + esc(corte) + '</b>' +
          '<span class="s2dir down" title="Debe bajar hasta cero">↓ reducir</span></span>' +
        '<span class="s2sum">' + ap + (at ? ' · ' + at : '') + '</span></summary>' +
        '<div class="s2body">' + backlogDetalle(m) + '</div></details>';

      // ── Pasivo del PAID manual. NO es trabajo pendiente de nadie: es una decisión contable. ──
      // Cifra ESTÁTICA con su fecha de medición, no un contador vivo: el panel no tiene acceso a
      // account.move y un número sin fecha se leería como actual. La vigilancia de que no crezca
      // vive en el watchdog; esto solo hace visible lo acumulado.
      html += '<details class="ip-sem2 pasivo"><summary>' +
        '<span class="s2title"><span class="s2lbl">Pagos manuales acumulados</span> <span class="s2tag">no conciliables</span></span>' +
        '<span class="s2sum"><b>655</b> asientos · <b>$4.93M</b> en la cuenta 223</span></summary>' +
        '<div class="s2body"><div class="s2note" style="margin-top:12px">' +
          'Medido el <b>2026-08-17</b>. Son bills que se cerraron marcando <b>PAID a mano</b> en el journal 61 ' +
          'en vez de conciliar la línea bancaria, así que el gasto quedó registrado <b>dos veces</b>: en el bill y en la línea.' +
        '</div><ul class="s2list">' +
          '<li><b>Todos son del 23-jul o anteriores.</b> Re-verificado en Odoo el <b>2026-09-03</b>: ' +
            'cero asientos de pago manual en el journal 61 con fecha del corte en adelante.</li>' +
          // El texto anterior afirmaba que la regla `ir.rule 814` impide que crezcan. Es FALSO
          // desde el 18-ago: la 814 se desactivó porque rompía la captura (4 días de 6 líneas
          // rechazadas por corrida) y se sustituyó por la 815, que el propio registro del
          // proyecto marca "a prueba, NO confirmada". El panel no puede leer ir.rule, así que
          // no puede verificar cuál está viva: dice lo que sí sabe —el conteo re-medido de
          // arriba— y manda a Odoo para el estado del candado, en vez de dar por buena una
          // garantía que ya se cayó una vez.
          '<li><b>Hay un candado</b> en Odoo (<code>ir.rule</code>) que rechaza crear asientos en el ' +
            'journal 61 sin línea bancaria, con un error que explica qué hacer. Se ajustó tras romper ' +
            'la captura en agosto (814 → 815): <b>su estado se confirma en Odoo</b>, no desde aquí.</li>' +
          '<li><b>No se resuelven conciliando</b> — esas líneas ya no tienen bill abierto contra el cual casar. ' +
            'Es deuda de <b>desenredo contable</b>, no de conciliación.</li>' +
          '<li><b>No es trabajo pendiente de la operación.</b> Necesita una decisión sobre cómo revertir la ' +
            'duplicación, no más horas de conciliar.</li>' +
        '</ul></div></details>';

      host.innerHTML = html;
      qa('#ip-semrows [data-vercorte]').forEach(function (el) {
        el.addEventListener('click', function () { verDesdeCorte(el.getAttribute('data-vercorte')); });
      });
    }
    // ── De qué está hecho el "Faltan N" (V1.02: devuelve datos, no solo HTML) ─────────────
    // Origen: Esteban veía 5 sin conciliar en la tabla y 9 en el semáforo, y los dos números
    // eran CIERTOS. El semáforo cuenta toda línea que Odoo tiene sin conciliar; la tabla saca
    // fondeos y devoluciones del cubo "sin conciliar" (v0.5.16) porque no esperan una factura.
    // Comprobado en Odoo el 2026-09-03 sobre journal 61 desde el corte: 9 sin conciliar = 5
    // gastos + 2 FONDEO + 2 DEVOLUCIÓN. Dos taxonomías distintas bajo la misma palabra.
    // Esto NO cambia el número del server: lo descompone, deja reproducirlo en la tabla, y le
    // da a la tarjeta el número accionable para su titular.
    // Regla de honestidad: solo se descompone si la ventana cargada cubre el corte Y el total
    // cuadra con el `faltan` del server. Si no cuadra, se dice — nunca se pinta un desglose que
    // contradiga en silencio al número de arriba, ni se pone en el titular un número derivado
    // de datos incompletos.
    function composicionFaltan(label, corte, faltan) {
      var no = function (html) { return { ok: false, conc: 0, fon: 0, dev: 0, html: html }; };
      if (!faltan) return no('');
      var f = state.filters;
      if (!f.from || f.from > corte) {
        return no('<div class="s2cw">La tabla está cargada desde <b>' + esc(f.from || '—') + '</b>, no alcanza el corte. ' +
          '<a class="s2ver" data-vercorte="' + esc(label) + '">cargar desde el corte</a></div>');
      }
      var dev = 0, fon = 0, conc = 0;
      (state.allRows || []).forEach(function (r) {
        if (r.j !== label || !r.d || r.d < corte || r.ok) return;
        if (isDevolucion(r)) dev++; else if (isFondeo(r)) fon++; else conc++;
      });
      var local = dev + fon + conc;
      if (local !== faltan) {
        // Se distinguen los dos casos, porque no significan lo mismo y uno de los dos no es
        // noticia. Ver MENOS de lo que dice el server es lo normal cuando la carga viene
        // recortada por el tope de líneas: no hay contradicción, simplemente no alcanza para
        // descomponer, y gritarlo en cada tarjeta es ruido permanente. Ver MÁS sí es una
        // contradicción real —el server dice que faltan menos de las que la tabla tiene sin
        // conciliar— y ahí conviene el aviso fuerte.
        var link = '<a class="s2ver" data-vercorte="' + esc(label) + '">ver en la tabla</a>';
        if (local < faltan) return no('<div class="s2cw">' + link + '</div>');
        return no('<div class="s2cw">El desglose no cuadra con el server (' + local + ' vs ' + faltan +
          '): la tabla ve más pendientes de las que reporta el semáforo. ' + link + '</div>');
      }
      // El desglose ya no repite el titular. Antes decía "5 por conciliar · 2 fondeos · 2
      // devoluciones" con "5 por conciliar" también arriba en grande; y en el caso de cero
      // dejaba al lector sumando para entender por qué el total no cuadraba con el titular.
      // Ahora responde la pregunta que el número de arriba deja abierta: si no hay nada por
      // conciliar, ¿qué son las que Odoo tiene abiertas?
      var extra = fon + dev;
      var txt = '';
      if (extra) {
        var comoSon = [];
        if (fon) comoSon.push('<b>' + fon + '</b> ' + (fon === 1 ? 'fondeo' : 'fondeos'));
        if (dev) comoSon.push('<b>' + dev + '</b> ' + (dev === 1 ? 'devolución' : 'devoluciones'));
        var cuantas = extra === 1
          ? (conc ? 'La otra abierta' : 'La única abierta')
          : ((conc ? 'Las otras ' : 'Las ') + extra + ' abiertas');
        // El motivo se dice por categoría, no por instancia: así no hay que concordar el
        // número y además cada una explica SU razón, que no es la misma.
        var porque = (fon && dev)
          ? 'Ninguna casa contra una factura de proveedor: la devolución va contra una nota de crédito y el fondeo contra el lado BBVA.'
          : (fon ? 'Un fondeo no casa contra una factura: su contrapartida es el lado BBVA, que todavía no se captura en Odoo.'
                 : 'Una devolución no casa contra una factura: casa contra una nota de crédito, o reduce el bill original.');
        txt = cuantas + ' no son trabajo pendiente — ' + comoSon.join(' y ') + '. ' + porque + ' ';
      }
      return { ok: true, conc: conc, fon: fon, dev: dev,
        html: '<div class="s2cw">' + txt +
          '<a class="s2ver" data-vercorte="' + esc(label) + '">ver en la tabla</a></div>' };
    }
    // Lleva la tabla al MISMO universo que mide el semáforo, para que los dos números se puedan
    // comparar de verdad en vez de creerle a uno de los dos.
    function verDesdeCorte(label) {
      var corte = (state.metricas && state.metricas.fecha_corte) || '2026-07-24';
      state.filters.from = corte; state.filters.to = hoyCst();
      state.filters.journal = label; state.filters.estado = ''; state.filters.tipo = '';
      state.page = 1;
      if (state.mode === 'real') { load(); } else { render(); }
      var t = q('#ip-tblwrap'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'start' });
    }
    function horaCst() { var d = new Date(Date.now() - 6 * 3600 * 1000); return d.toISOString().slice(11, 16); }
    // El detalle del backlog viene del SERVER, no de state.allRows. allRows es la ventana rodante
    // de la tabla (arranca el mes pasado) y mostraba 260 pendientes de Jeeves donde hay 1,846:
    // dos universos distintos bajo el mismo título. El resumen ya venía del server; el detalle no.
    function backlogDetalle(m) {
      var pj = (m && m.por_journal || []).filter(function (x) { return (x.pre_pend || 0) > 0; });
      if (!pj.length) return '<div class="s2note">Sin pendientes anteriores al corte.</div>';
      pj.sort(function (a, b) { return b.pre_pend - a.pre_pend; });
      return '<div class="s2note">Pendientes anteriores al corte, por fuente — universo completo:</div>' +
        pj.map(function (x) {
          return '<div class="s2row"><span class="s2j">' + esc(x.label) + '</span>' +
            '<span class="s2n"><b>' + x.pre_pend + '</b> pendientes</span>' +
            '<span class="s2p">' + money(x.pre_monto || 0) + '</span></div>';
        }).join('');
    }
    // Tendencia desde la serie del CBWATCH. HOY no hay puntos A/B almacenados — el CBWATCH
    // guarda los conteos del watchdog, no las métricas del corte. Se dice, no se inventa:
    // un "sin cambio" falso sería peor que declarar que aún no hay serie.
    function trendHtml(cual) {
      var s = state.serie || [];
      if (!s.length) return '<span class="s2tr none">Sin serie todavía — la tendencia aparece cuando el watchdog acumule puntos del corte</span>';
      return '<span class="s2tr none">' + s.length + ' puntos en la serie, sin métricas del corte aún</span>';
    }

    // ── corridas ──
    function renderRuns() {
      var rb = q('#ip-runsbody'); if (!rb) return;
      rb.innerHTML = state.runs.map(function (r) {
        var st = r.status === 'ok' ? 'ok' : 'pend';
        var cell = function (v) { return (v == null ? '—' : v); };
        return '<tr><td>' + esc(r.run) + '</td><td>' + esc(r.origen) + '</td><td>' + esc(r.rango) + '</td>' +
          '<td>' + cell(r.nuevas) + '</td><td>' + cell(r.dup) + '</td><td>' + cell(r.rech) + '</td>' +
          '<td class="st ' + st + '">' + esc(r.status_label || (r.status === 'ok' ? 'OK' : r.status)) + '</td></tr>';
      }).join('');
    }

    // ── chips de filtrado rápido (v0.5.16) — absorben el panel "Hoy" ──
    // El panel tenía 3 cubetas; su valor real era filtrar la tabla con un clic, y eso pertenece a
    // la tabla. Los conteos se calculan sobre las MISMAS filas que la tabla va a dibujar (mismo
    // filtro de empresa/journal/fechas/búsqueda, omitiendo solo el eje que el chip representa),
    // para que el número del chip y el de la tabla no puedan discrepar.
    // La cubeta azul (En tránsito) NO se vuelve chip: los pendings no son filas de esta tabla —
    // su nota vive junto al botón de captura y su detalle en el acordeón de diagnóstico.
    function syncEstadoSelect() {
      var e = q('#ip-fEstado'); if (e) e.value = state.filters.estado || '';
      var t = q('#ip-fTipo');   if (t) t.value = state.filters.tipo || '';
    }
    function setChip(k) {
      state.filters.estado = (state.filters.estado === k) ? '' : k;   // toggle
      if (state.filters.estado !== 'sinconciliar' && !CHIP_PEND[state.filters.estado]) state.filters.edad = '';
      state.page = 1; syncEstadoSelect(); paintTable(); paintChips();
    }
    var CHIP_PEND = { sinconciliar: 1, condoc: 1, sindoc: 1, noevaluada: 1 };
    function paintChips() {
      var host = q('#ip-chips'); if (!host) return;
      var uni = visibleRows({ ignoreEstado: true });        // universo sin el eje de conciliación
      // Conteo sobre el EJE ODOO. Los chips viejos (con/sin documento, no evaluada) contaban estados
      // que dependen de state.sugg, y en modo real suggByRow se ingesta vacío -> los tres salían 0
      // permanentemente aunque hubiera filas en pantalla. No era un desajuste del universo: era contar
      // algo que nadie poblaba.
      var n = { todo: uni.length, conciliado: 0, preconciliado: 0, sinconciliar: 0, conchoy: 0, fondeo: 0, devolucion: 0 };
      var hoy = hoyCst();
      uni.forEach(function (t) {
        var st = rowConc(t);
        if (st === 'preconciliada') { n.preconciliado++; return; }
        // Cubos propios: no esperan documento, así que no son "sin conciliar". Se cuentan
        // aparte en vez de esconderse — los cinco cubos deben sumar `todo`.
        if (st === 'fondeo_pend')     { n.fondeo++; return; }
        if (st === 'devolucion_pend') { n.devolucion++; return; }
        // La desconciliada trae ok:true pero su apunte está abierto → es trabajo pendiente.
        if (st === 'desconciliada' || !t.ok) { n.sinconciliar++; return; }
        n.conciliado++;
        if (t.wd === hoy) n.conchoy++;
      });
      var act = state.filters.estado || '';
      function chip(k, lbl, cls) {
        return '<button class="ip-chip ' + (cls || '') + (act === k ? ' on' : '') + '" data-chip="' + k + '">' +
               esc(lbl) + ' <span class="ip-chipn">' + (k === '' ? n.todo : (n[k] || 0)) + '</span></button>';
      }
      // Fondeos y devoluciones salieron del cubo rojo (no esperan documento) y entran con
      // chip propio en GRIS: visibles y filtrables, sin gritar que hay trabajo atorado.
      // Solo aparecen si hay filas — un "0 devoluciones" permanente sería ruido.
      var html = chip('', 'Todo') +
                 chip('sinconciliar', 'Sin conciliar', 'red') +
                 chip('conciliado', 'Conciliado', 'green') +
                 chip('preconciliado', 'Pre-conciliado', 'gray') +
                 (n.fondeo ? chip('fondeo', 'Fondeos', 'gray') : '') +
                 (n.devolucion ? chip('devolucion', 'Devoluciones', 'gray') : '') +
                 chip('conchoy', 'Conciliadas hoy', 'green');
      // sub-chips de antigüedad: solo tienen sentido sobre lo pendiente, y solo se muestran
      // cuando hay un chip de esa familia activo (si no, son ruido permanente).
      if (CHIP_PEND[act]) {
        var e = state.filters.edad || '';
        var cnt = { hoy: 0, d1_3: 0, d3plus: 0 };
        uni.forEach(function (t) {
          if (t.ok || !matchEstado(act, t)) return;
          var d = diasDesde(t.d);
          if (d <= 0) cnt.hoy++; else if (d <= 3) cnt.d1_3++; else cnt.d3plus++;
        });
        html += '<span class="ip-chipsep">antigüedad</span>' +
          ['hoy:hoy', 'd1_3:1–3 días', 'd3plus:+3 días'].map(function (p) {
            var k = p.split(':')[0], lbl = p.split(':')[1];
            return '<button class="ip-chip sm' + (e === k ? ' on' : '') + '" data-edad="' + k + '">' +
                   lbl + ' <span class="ip-chipn">' + cnt[k] + '</span></button>';
          }).join('');
      }
      host.innerHTML = html;
      qa('#ip-chips [data-chip]').forEach(function (b) {
        b.addEventListener('click', function () { setChip(b.getAttribute('data-chip')); });
      });
      qa('#ip-chips [data-edad]').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-edad');
          state.filters.edad = (state.filters.edad === k) ? '' : k;
          state.page = 1; paintTable(); paintChips();
        });
      });
    }

    // ── sección "En tránsito" — MOTOR 1: pendings de Jeeves ──
    // Eje aparte: estas filas NO son líneas de Odoo. No entran a state.rows, no se filtran,
    // no se seleccionan, no se exportan y no tocan ningún contador (chips, semáforo, agregados).
    // Toleran la forma vieja (d/ref/tarj/comp/amt) y la nueva del server (fecha/comercio/...).
    function pfFecha(x) { return String(x.fecha || x.d || '—'); }
    function pfCom(x) { return String(x.comercio || x.ref || '—'); }
    function pfMonto(x) { return Number(x.monto != null ? x.monto : x.amt) || 0; }
    function pfTarj(x) { return String(x.tarjeta || x.tarj || '—'); }
    function pfComp(x) { return String(x.comprador || x.comp || '—'); }

    function renderIntransit() {
      var host = q('#ip-intransit'); if (!host) return;
      var p = state.pendings;
      var CAB = '<div class="ip-itnote"><b>No están en Odoo.</b> Son autorizaciones que el banco todavía no liquida: ' +
        'no se pueden conciliar y no cuentan en ningún total de esta pantalla. ' +
        'Aparecerán como transacciones cuando el banco las liquide, normalmente en 1–2 días.</div>';

      if (state.mode !== 'real') { host.innerHTML = '<div class="ip-empty">Los movimientos en tránsito solo se consultan en modo real.</div>'; return; }
      // Falla de lectura ≠ "no hay nada". Se dice cuál de las dos es.
      if (p && p._error) {
        host.innerHTML = '<div class="ip-iterr">No se pudo consultar el banco — <b>no sabemos si hay movimientos en tránsito</b>. ' +
          'Esto no afecta lo ya capturado en Odoo. <button type="button" class="ip-btn sm" id="ip-pendretry">Reintentar</button></div>';
        var rb = q('#ip-pendretry'); if (rb) rb.addEventListener('click', function () { state.pendings = null; renderIntransit(); loadPendings(); });
        return;
      }
      if (!p) { host.innerHTML = '<div class="ip-empty">Consultando movimientos en tránsito…</div>'; return; }
      if (!p.disponible) { host.innerHTML = '<div class="ip-empty">Consulta de movimientos en tránsito no disponible.</div>'; return; }

      var list = (p.muestra || []).map(function (m) { m._pending = true; return m; });
      if (!list.length) { host.innerHTML = CAB + '<div class="ip-empty">Sin movimientos en tránsito.</div>'; return; }

      host.innerHTML = CAB +
        '<div style="overflow-x:auto"><table class="ip-ittbl"><thead><tr><th>Fecha</th><th>Descripción</th><th>Tarjeta</th><th>Comprador</th><th style="text-align:right">Monto</th><th>Estado</th></tr></thead><tbody>' +
        list.map(function (x) {
          return '<tr class="ip-itrow"><td style="font-family:var(--ip-mono);font-size:12.5px">' + esc(pfFecha(x)) + '</td><td>' + esc(pfCom(x)) + '</td><td>' + esc(pfTarj(x)) + '</td><td>' + esc(pfComp(x)) + '</td>' +
            '<td class="amt ' + (pfMonto(x) < 0 ? 'neg' : 'pos') + '">' + money(pfMonto(x)) + '</td>' +
            '<td><span class="ip-itbadge">PENDIENTE · no está en Odoo</span></td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="ip-itfoot">' + list.length + ' en tránsito' + (p.pendings_suma != null ? ' · ~' + money(p.pendings_suma) : '') + ' — fuera de todo contador.</div></div>';
    }

    // ── export XLSX (columnas visibles × filas seleccionadas) ──
    function exportXls() {
      var vis = COLS.filter(function (c) { return c.vis; });
      var selIds = Object.keys(state.sel).filter(function (k) { return state.sel[k]; });
      if (!selIds.length) return;
      if (state.mode === 'real') {
        // dataset completo desde el server (columnas visibles × selección)
        window.FinClient.call(EP_DATASET, { companies: window.FinState.getCompanies(), ids: selIds.map(Number), columns: vis.map(function (c) { return c.k; }), filters: txParams() })
          .then(function (data) { writeXls(data.rows || [], vis); })
          .catch(function (err) { toast('No se pudo exportar: ' + esc((err && err.msg) || (err && err.code) || 'error')); });
        return;
      }
      var data = visibleRows().filter(function (t) { return state.sel[t._id]; });
      writeXls(data, vis);
    }
    function writeXls(rows, vis) {
      if (!rows.length) { toast('Nada que exportar'); return; }
      ensureSheetJS(function (XLSX) {
        if (!XLSX) { toast('SheetJS no cargó; intenta de nuevo'); return; }
        var plain = rows.map(function (t) {
          var o = {};
          vis.forEach(function (c) { o[c.lbl] = c.k === 'ok' ? (t.ok ? 'CONCILIADA' : 'PENDIENTE') : (t[c.k] == null ? '' : t[c.k]); });
          return o;
        });
        var ws = XLSX.utils.json_to_sheet(plain);
        ws['!cols'] = vis.map(function (c) { return { wch: c.k === 'ref' ? 45 : c.k === 'ana' ? 24 : 14 }; });
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transacciones');
        XLSX.writeFile(wb, 'FTS_transacciones_' + new Date().toISOString().slice(0, 10) + '.xlsx');
      });
    }
    function ensureSheetJS(cb) {
      if (window.XLSX) return cb(window.XLSX);
      var s = document.createElement('script'); s.src = SHEETJS_CDN;
      s.onload = function () { cb(window.XLSX); };
      s.onerror = function () { cb(null); };
      document.head.appendChild(s);
    }

    // ── countdown al próximo sync ──
    function nextSync(now, cron) {
      if (!cron || !Array.isArray(cron.days)) cron = DEFAULT_CRON;   // guarda dura: nunca lanzar
      var c = new Date(now.getTime());
      for (var i = 0; i < 10080; i++) {
        c.setSeconds(0, 0);
        var dow = c.getDay(), h = c.getHours(), m = c.getMinutes();
        var habil = cron.days.indexOf(dow) >= 0;
        var reg = h >= cron.start_hour && h <= cron.regular_end_hour && (m % cron.regular_interval_min === 0);
        var peak = h === cron.peak_hour && (m % cron.peak_interval_min === 0);
        var close = h === cron.close_hour && m === 0;
        if (habil && (reg || peak || close) && c > now) return c;
        c.setMinutes(c.getMinutes() + 1);
      }
      return null;
    }
    function fmtDelta(ms) {
      var s = Math.floor(ms / 1000);
      if (s >= 3600) { var h = Math.floor(s / 3600); return h + 'h ' + Math.floor(s % 3600 / 60) + 'm'; }
      return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }
    function startCountdown() {
      if (state.timer) { clearInterval(state.timer); state.timer = null; }
      var cron = state.cron || DEFAULT_CRON;
      var target = nextSync(new Date(), cron);
      state.timer = setInterval(function () {
        if (!document.body.contains(container)) { clearInterval(state.timer); state.timer = null; return; }
        var el = q('.ip-countdown'); if (!el) return;
        var now = new Date();
        if (!target || target <= now) {
          var ls = q('.ip-lastsync'); if (ls) ls.textContent = 'hoy ' + now.toTimeString().slice(0, 5);
          target = nextSync(now, cron);
        }
        el.textContent = target ? fmtDelta(target - now) : 'fuera de horario';
      }, 1000);
    }

    // ── toast ──
    function toast(html) {
      var t = q('#ip-toast'); if (!t) return;
      t.innerHTML = html; t.style.display = 'block';
      clearTimeout(t._to); t._to = setTimeout(function () { t.style.display = 'none'; }, 3800);
    }

    return { mount: mount };
  }

  window.FinRouter.register(MODULE_ID, {
    render: function (container) { createView(container).mount(); }
  });
})();
