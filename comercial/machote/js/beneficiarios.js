/* ═══ Machote · los beneficiarios de comisión (V1.44) ═════════════════════
 *
 * Hasta la V1.43 los nombres de la tabla de comisiones eran **texto libre**, y
 * los cuatro que traía la plantilla salían de una hoja de Excel de hace años.
 * Medido contra Odoo la noche que se construyó esto:
 *
 *   · de esos cuatro, **tres ya no están en la empresa** (no aparecen en el
 *     padrón de empleados activos de la compañía 1);
 *   · y **dos personas activas con cuenta de comisión propia no aparecen** en
 *     ninguna plantilla, así que a quien les toca comisión hay que teclearlo
 *     de memoria cada vez.
 *
 * El problema de fondo no es que los nombres estén viejos: es que un NOMBRE no
 * es una llave. Un apodo de tres letras no se puede casar con una cuenta
 * analítica sin que alguien sepa de quién es ese apodo, y ese saber no está en
 * ninguna parte del sistema. Por eso esta versión guarda **ids**:
 *
 *     { nombre: '…',            ← se conserva: es lo que se IMPRIME
 *       pct: 0.25,
 *       beneficiario: {
 *         tipo: 'interno' | 'externo',
 *         empleado_id: 8,       ← hr.employee, sólo internos
 *         cuenta_id: 1156,      ← account.analytic.account del plan 20
 *         estado: 'vigente' | 'pendiente' | 'desconocido',
 *         ref: 'be_…'           ← el renglón de comercial.comision_beneficiario
 *       } }
 *
 * `nombre` NO se quita, y es una decisión: el PDF, el documento de la orden y
 * los 19 machotes que ya existen lo leen. Quitarlo dejaría sin nombre a lo que
 * ya está guardado — y un documento append-only no se puede rellenar hacia
 * atrás. El id es lo nuevo; el nombre es lo que sigue funcionando.
 *
 * ── LO QUE MIDE «VIGENTE» ────────────────────────────────────────────────
 * Para un INTERNO: que `hr.employee` esté activo. No que la cuenta exista —una
 * cuenta de alguien que se fue sigue existiendo a propósito, porque lo que se
 * le debe no se borra (respuesta 9 de Esteban: se ARCHIVA, nunca se borra)—.
 * Para un EXTERNO: que la cuenta del plan 20 esté activa.
 *
 * ⚠️ Medido hoy: **las 32 cuentas del plan 20 están `active = true`**, incluidas
 * las de las tres personas que salieron. La reparación R10 del plan maestro
 * sigue sin hacerse, y hasta que se haga el selector puede ofrecer a alguien
 * que ya no está. Por eso el servidor cruza contra el padrón de empleados y no
 * se conforma con `active` de la cuenta: cuando R10 se haga, el cruce seguirá
 * dando lo mismo, así que no hay trabajo que tirar.
 *
 * ── CREAR UNO NUEVO ──────────────────────────────────────────────────────
 * Decisión de Esteban (respuesta 7): crear un beneficiario **pre-crea el plan
 * de comisión**, queda **PENDIENTE DE AUTORIZAR** y **deja seguir armando el
 * machote**. Sólo bloquea al CONFIRMAR la orden. Aquí eso significa:
 *   · se puede elegir y se guarda con `estado:'pendiente'`;
 *   · la pantalla lo pinta en ámbar y dice qué falta;
 *   · la regla dura `beneficiario-sin-aprobar` bloquea la confirmación.
 * La autorización la da Erick por correo, y eso vive en el flujo aparte
 * (`docs/trazabilidad/APROBACION-BENEFICIARIO.md`).
 *
 * ── DEGRADAR SIN TRABAR ──────────────────────────────────────────────────
 * El endpoint nace INACTIVO, así que hoy este catálogo casi siempre va a
 * fallar. Cuando falla: el nombre **sigue siendo texto libre editable**, se
 * guarda igual, y la pantalla dice que no pudo leer Odoo. Lo único que no se
 * puede hacer sin catálogo es ligar — y eso es la verdad, no una traba.
 */
(function (G) {
  'use strict';

  var BASE = 'https://primary-production-5c3c.up.railway.app/webhook';
  var URL_BEN = BASE + '/comercial/beneficiarios';
  var TIMEOUT_MS = 12000;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  /* Una sola lectura por pestaña, y se comparte la petición EN VUELO: la tabla
   * de comisiones tiene tres grupos y los tres piden el catálogo al pintarse.
   * Sin esto serían tres llamadas idénticas a Odoo por render. */
  var estado = { promesa: null, catalogo: null, error: null, porCuenta: null, porEmpleado: null };

  function indexar(cat) {
    var pc = {}, pe = {}, i, x;
    for (i = 0; i < (cat.internos || []).length; i++) {
      x = cat.internos[i];
      if (x.cuenta_id) pc[x.cuenta_id] = x;
      if (x.empleado_id) pe[x.empleado_id] = x;
    }
    for (i = 0; i < (cat.externos || []).length; i++) {
      x = cat.externos[i];
      if (x.cuenta_id) pc[x.cuenta_id] = x;
    }
    estado.porCuenta = pc;
    estado.porEmpleado = pe;
  }

  function postear(cuerpo) {
    var S = G.SuiteAuth;
    var token = S && S.getToken && S.getToken();
    if (!token) {
      return Promise.resolve({ ok: false, error: 'SIN_SESION',
        mensaje: 'No hay sesión: vuelve a entrar para leer el catálogo de comisiones.' });
    }
    var corta = null;
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var opciones = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: token }, cuerpo))
    };
    if (ctrl) opciones.signal = ctrl.signal;
    var p = fetch(URL_BEN, opciones)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        if (!d || d.ok !== true) throw new Error((d && d.error) || 'RESPUESTA_INVALIDA');
        return d;
      })
      .catch(function (e) {
        return { ok: false, error: 'SIN_CATALOGO', mensaje: String((e && e.message) || e) };
      })
      .then(function (res) { if (corta) clearTimeout(corta); return res; });
    if (ctrl) corta = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    return p;
  }

  /** Lee el catálogo. Resuelve SIEMPRE. */
  function cargar() {
    if (estado.promesa) return estado.promesa;
    estado.promesa = postear({ modo: 'catalogo' })
      .then(function (d) {
        if (!d.ok) {
          estado.error = d.mensaje || d.error;
          /* Se limpia para que el siguiente intento vuelva a probar: cachear un
           * fallo de red condena la pestaña entera. */
          estado.promesa = null;
          return d;
        }
        estado.catalogo = { internos: d.internos || [], externos: d.externos || [] };
        estado.error = null;
        indexar(estado.catalogo);
        return { ok: true, internos: estado.catalogo.internos, externos: estado.catalogo.externos };
      });
    return estado.promesa;
  }

  /** Crea un beneficiario EXTERNO y su cuenta del plan 20, en estado pendiente
   *  de autorizar. Devuelve `{ok, beneficiario}`.
   *
   *  ⚠️ No se crean INTERNOS: un interno es un empleado, y los empleados se dan
   *  de alta en RH, no desde una cotización. Si alguien no aparece en la lista
   *  de internos es porque no está activo en el padrón, y eso se arregla en
   *  Odoo — no inventando una cuenta aquí. */
  function crearExterno(datos) {
    var n = String((datos && datos.nombre) || '').trim();
    if (!n) {
      return Promise.resolve({ ok: false, error: 'SIN_NOMBRE',
        mensaje: 'Ponle nombre al beneficiario antes de crearlo.' });
    }
    return postear({
      modo: 'crear_externo',
      nombre: n,
      cliente_id: (datos && datos.cliente_id) || null,
      empresa_id: (datos && datos.empresa_id) || null,
      nota: (datos && datos.nota) || null
    }).then(function (d) {
      if (d.ok && d.beneficiario) {
        /* Se mete en el catálogo en memoria para que aparezca de inmediato en
         * el selector, sin volver a pedir la lista entera. */
        if (!estado.catalogo) estado.catalogo = { internos: [], externos: [] };
        estado.catalogo.externos.push(d.beneficiario);
        indexar(estado.catalogo);
      }
      return d;
    });
  }

  /* ── Leer un renglón de comisión ──────────────────────────────────────── */

  /** ¿Este renglón está LIGADO a una cuenta del plan 20? El texto no cuenta.
   *  Un renglón sin `pct` tampoco cuenta como ligado ni como pendiente: es una
   *  ranura vacía de la plantilla, y regañar por una ranura vacía es el error
   *  de la regla `pad-sin-pasar` que se retiró en la V1.43. */
  function ligado(it) {
    return !!(it && it.beneficiario && it.beneficiario.cuenta_id);
  }

  /** El estado que se PINTA: 'vacio' | 'suelto' | 'pendiente' | 'vigente' | 'salio'.
   *
   *  Se resuelve contra el catálogo cuando está cargado, porque el documento
   *  guarda lo que era cierto el día que se ligó y la vigencia cambia después:
   *  alguien que estaba activo en julio puede haberse ido en septiembre. Sin
   *  catálogo se devuelve lo que diga el documento y se marca 'desconocido'
   *  — que es distinto de 'vigente' a propósito.
   *
   *  ── DÓNDE ESTÁ LA LÍNEA ENTRE 'vacio' Y 'suelto', y por qué ahí ─────────
   *  Vacío es el renglón que no dice NADA: sin nombre, sin cuenta y **sin
   *  porcentaje**. Suelto es el que ya reparte dinero y no dice a quién.
   *
   *  La segunda mitad —el porcentaje— la puso una prueba, no el diseño: al
   *  escribirla salió que un machote recién creado tiene los cuatro renglones
   *  del equipo de venta a 0.25 **sin nombre**, y la comisión de FTS de la
   *  plantilla NO es cero. O sea que un machote nuevo reparte toda la bolsa
   *  entre cuatro nadies. Se puede leer de dos formas:
   *
   *    · «son ranuras en blanco, no molestes» → se podría confirmar una orden
   *      con el 100 % de la comisión apuntando a nadie, y el presupuesto de
   *      Odoo escribiría renglones de comisión sin dueño. Es exactamente el
   *      defecto que esta versión viene a cerrar;
   *    · «reparten dinero y no dicen a quién» → se advierte, blando, y quien
   *      cotiza lo resuelve cuando sepa a quién le toca.
   *
   *  Se eligió la segunda. Una ranura con porcentaje NO es una ranura vacía:
   *  parece vacía en la pantalla y no lo es en el presupuesto. */
  function estadoDe(it) {
    if (!it) return 'vacio';
    var tiene = Number(it.pct) > 0 || (it.nombre && String(it.nombre).trim());
    if (!tiene) return 'vacio';
    if (!ligado(it)) return 'suelto';
    var b = it.beneficiario;
    var vivo = estado.porCuenta ? estado.porCuenta[b.cuenta_id] : null;
    if (!vivo) return estado.catalogo ? 'salio' : (b.estado || 'desconocido');
    if (vivo.pendiente === true) return 'pendiente';
    if (vivo.vigente === false) return 'salio';
    return 'vigente';
  }

  /** El nombre que se pinta. Gana el catálogo —si en Odoo le cambiaron el
   *  nombre, aquí se ve corregido solo— y si no hay catálogo, lo guardado. */
  function nombreDe(it) {
    if (!it) return '';
    if (ligado(it) && estado.porCuenta) {
      var v = estado.porCuenta[it.beneficiario.cuenta_id];
      if (v && v.nombre) return v.nombre;
    }
    return it.nombre || '';
  }

  /** Lo que se escribe en el renglón al elegir. Única forma del campo. */
  function marcar(it, ben) {
    if (!it || !ben) return it;
    it.nombre = ben.nombre || it.nombre || '';
    it.beneficiario = {
      tipo: ben.tipo || 'externo',
      empleado_id: ben.empleado_id || null,
      cuenta_id: ben.cuenta_id || null,
      estado: ben.pendiente === true ? 'pendiente' : 'vigente',
      ref: ben.ref || null,
      ligado_at: new Date().toISOString()
    };
    return it;
  }

  /** Suelta el renglón: vuelve a ser texto libre. Existe porque a veces se
   *  liga al equivocado, y sin esto la única salida sería borrar el renglón
   *  entero con su porcentaje. */
  function soltar(it) {
    if (it) delete it.beneficiario;
    return it;
  }

  /* ── Las tres preguntas del machote completo ─────────────────────────── */

  /** Todos los renglones de comisión del machote, de los tres grupos, con su
   *  grupo a cuestas. UNA sola definición de «cuáles son los renglones de
   *  comisión»: reglas.js, la pantalla y la confirmación preguntan aquí. */
  function renglones(m) {
    var grupos = [
      { key: 'equipo_venta', etiqueta: 'Equipo de venta', rep: 'venta' },
      { key: 'equipo_operaciones', etiqueta: 'Equipo de operaciones', rep: 'ops' },
      { key: 'equipo_cliente', etiqueta: 'Lado cliente', rep: 'cli' }
    ];
    var out = [];
    for (var g = 0; g < grupos.length; g++) {
      var lista = (m && m[grupos[g].key]) || [];
      for (var i = 0; i < lista.length; i++) {
        out.push({ grupo: grupos[g], indice: i, it: lista[i] });
      }
    }
    return out;
  }

  /** Los que tienen porcentaje y NO están ligados a ninguna cuenta. Son los
   *  que impiden saber a qué cuenta analítica va ese dinero. */
  function sueltos(m) {
    return renglones(m).filter(function (r) { return estadoDe(r.it) === 'suelto'; });
  }

  /** Los que están ligados a un beneficiario PENDIENTE DE AUTORIZAR. */
  function pendientes(m) {
    return renglones(m).filter(function (r) { return estadoDe(r.it) === 'pendiente'; });
  }

  /** Los que apuntan a alguien que ya no está. No bloquean la captura: la
   *  cotización vieja sigue siendo cierta. Sí se avisan. */
  function idos(m) {
    return renglones(m).filter(function (r) { return estadoDe(r.it) === 'salio'; });
  }

  /* ── Lo que se ve ─────────────────────────────────────────────────────── */

  var PUNTO = { vigente: 'ok', pendiente: 'pend', salio: 'mal', suelto: '', vacio: '', desconocido: '' };
  var TITULO = {
    vigente: 'Ligado a su cuenta de comisión del plan 20, y la persona sigue activa.',
    pendiente: 'Ligado, pero su cuenta está PENDIENTE DE AUTORIZAR. No bloquea la captura; ' +
               'bloquea confirmar la orden.',
    salio: 'La cuenta a la que apunta ya no corresponde a nadie activo. La cotización ' +
           'sigue siendo válida; el pago hay que revisarlo.',
    suelto: 'Es texto libre: no está ligado a ninguna cuenta de comisión, así que no se ' +
            'sabe a qué cuenta analítica va este dinero. Da clic para elegirlo.',
    vacio: 'Ranura vacía.',
    desconocido: 'No se pudo leer el catálogo de Odoo, así que no se sabe si sigue vigente.'
  };

  /** La celda del nombre, dentro de la tabla de comisiones del DESGLOSE.
   *  `ruta` es la que ya usa la pantalla para esa celda (`eq:venta:0:nombre`),
   *  y viaja en el `data-ben` para que el manejador sepa qué renglón se tocó. */
  function celda(it, ruta) {
    var st = estadoDe(it);
    var nom = nombreDe(it);
    var punto = PUNTO[st] || '';
    return '<button type="button" class="ben-cel" data-ben="' + esc(ruta) + '" ' +
      'title="' + esc(TITULO[st] || '') + '">' +
      '<span class="ben-punto ' + punto + '"></span>' +
      '<span class="ben-nom' + (nom ? '' : ' ben-vacio') + '">' +
        esc(nom || 'Sin beneficiario') + '</span>' +
      (st === 'pendiente' ? '<span class="tiny n-warn">por autorizar</span>' : '') +
      (st === 'salio' ? '<span class="tiny n-bad">ya no está</span>' : '') +
      (st === 'suelto' ? '<span class="tiny nota">sin ligar</span>' : '') +
      '</button>';
  }

  /** El diálogo de elegir. Internos arriba (son la mayoría de los casos),
   *  externos después, y crear al final como salida. */
  function abrir(opciones) {
    cerrar();
    var alElegir = opciones && opciones.alElegir;
    var it = opciones && opciones.it;
    var clienteId = opciones && opciones.cliente_id;
    var empresaId = opciones && opciones.empresa_id;
    var soloExternos = !!(opciones && opciones.solo_externos);

    var caja = document.createElement('div');
    caja.id = 'benCaja';
    caja.className = 'modal';
    caja.innerHTML =
      '<div class="caja ben-caja" role="dialog" aria-modal="true">' +
        '<h3>¿A quién le toca esta comisión?</h3>' +
        '<p class="tiny nota">Se guarda la <strong>cuenta de comisión</strong> del plan 20 de ' +
        'Odoo, no el nombre. Es lo que permite que el presupuesto del proyecto sepa a ' +
        'qué cuenta analítica va este dinero.</p>' +
        (it && it.nombre
          ? '<div class="aviso warn ben-aviso"><strong>Ahora dice:</strong> «' + esc(it.nombre) + '». ' +
            'Es texto que alguien escribió; elígelo de la lista para ligarlo.</div>'
          : '') +
        (soloExternos
          ? ''
          : '<div class="ben-grupo"><div class="op-sub">De FTS</div>' +
            '<div id="benInternos" class="op-lista"><span class="tiny nota">Leyendo Odoo…</span></div></div>') +
        '<div class="ben-grupo"><div class="op-sub">Del lado del cliente</div>' +
          '<div id="benExternos" class="op-lista"><span class="tiny nota">Leyendo Odoo…</span></div></div>' +
        '<details class="op-crear"><summary>No está: crearlo ahora</summary>' +
          '<p class="tiny nota">Se crea su cuenta de comisión y queda <strong>pendiente de ' +
          'autorizar</strong>. Puedes seguir armando la cotización; lo que no se podrá es ' +
          '<strong>confirmar la orden</strong> hasta que Erick la autorice.</p>' +
          '<label class="op-l">Nombre de quien recibe<br>' +
            '<input id="benNuevo" class="cel" autocomplete="off" placeholder="Nombre y apellido"></label>' +
          '<label class="op-l">Por qué le toca (queda en la solicitud)<br>' +
            '<input id="benNota" class="cel" autocomplete="off" ' +
            'placeholder="Ej.: contacto que trajo el proyecto"></label>' +
          '<button class="btn fantasma" id="benCrear">Crear y ligar</button>' +
        '</details>' +
        '<div id="benAviso" class="tiny n-bad" hidden></div>' +
        '<div class="acciones">' +
          (ligado(it) ? '<button class="btn fantasma" id="benSoltar">Desligar</button>' : '') +
          '<button class="btn fantasma" id="benDespues">Ahora no</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(caja);

    $('#benDespues').onclick = cerrar;
    var bs = $('#benSoltar');
    if (bs) bs.onclick = function () {
      cerrar();
      if (typeof alElegir === 'function') alElegir(null);   // null = desligar
    };
    caja.onclick = function (e) { if (e.target === caja) cerrar(); };
    document.addEventListener('keydown', alaEscape);

    poblar(soloExternos, alElegir);

    var bc = $('#benCrear');
    if (bc) bc.onclick = function () {
      var nom = $('#benNuevo') ? $('#benNuevo').value.trim() : '';
      var nota = $('#benNota') ? $('#benNota').value.trim() : '';
      bc.disabled = true; bc.textContent = 'Creando…';
      crearExterno({ nombre: nom, cliente_id: clienteId, empresa_id: empresaId, nota: nota })
        .then(function (d) {
          if (!document.body.contains(caja)) return;
          bc.disabled = false; bc.textContent = 'Crear y ligar';
          if (!d.ok) return avisar(d.mensaje || d.error);
          cerrar();
          if (typeof alElegir === 'function') alElegir(d.beneficiario);
        });
    };
  }

  function opcionHTML(b) {
    return '<button type="button" class="op-op" data-cuenta="' + b.cuenta_id + '">' +
      '<span class="op-nom">' + esc(b.nombre) + '</span>' +
      (b.cuenta_nombre ? '<span class="op-cli">' + esc(b.cuenta_nombre) + '</span>' : '') +
      '<span class="op-meta tiny nota">cuenta ' + b.cuenta_id +
        (b.pendiente === true ? ' · pendiente de autorizar' : '') +
        (b.vigente === false ? ' · ya no está activo' : '') +
        /* ── V1.44 · AMBIGUO no es «se fue», y por eso se dice aparte ────────
         * El servidor deduce a quién pertenece una cuenta del nombre de la
         * cuenta, porque el catálogo de Odoo no tiene llave. Cuando ese nombre
         * casa con varias personas del padrón, NO elige: lo marca. Salió
         * probando con los datos de verdad — hay dos apellidos repetidos en el
         * padrón, y con la primera versión de la heurística la cuenta del único
         * vendedor de la plantilla vieja que sigue aquí desaparecía del
         * selector. Se ofrece, y se pide confirmarlo. */
        (b.ambiguo === true ? ' · hay varias personas con ese nombre: confírmalo' : '') + '</span>' +
      '</button>';
  }

  function poblar(soloExternos, alElegir) {
    var hi = $('#benInternos'), he = $('#benExternos');
    cargar().then(function (r) {
      if (he && !document.body.contains(he)) return;
      if (!r.ok) {
        if (hi) { hi.className = 'tiny n-bad';
          hi.textContent = 'No se pudo leer el catálogo de Odoo (' + r.error + ').'; }
        if (he) { he.className = 'tiny n-bad';
          he.textContent = 'Sin catálogo no hay cuenta que ligar. El nombre se puede seguir ' +
            'escribiendo a mano en la tabla; ligarlo será posible cuando Odoo conteste.'; }
        return;
      }
      if (hi && !soloExternos) {
        var ints = (r.internos || []).filter(function (x) { return x.vigente !== false; });
        hi.className = 'op-lista';
        hi.innerHTML = ints.length
          ? ints.map(opcionHTML).join('')
          : '<span class="tiny nota">Ningún empleado activo tiene cuenta de comisión. ' +
            'Se crean en Odoo, en el plan 20.</span>';
        enlazar(hi, r, alElegir);
      }
      if (he) {
        he.className = 'op-lista';
        he.innerHTML = (r.externos || []).length
          ? r.externos.map(opcionHTML).join('')
          : '<span class="tiny nota">Todavía no hay beneficiarios externos. Crea uno abajo.</span>';
        enlazar(he, r, alElegir);
      }
    });
  }

  function enlazar(host, r, alElegir) {
    host.onclick = function (e) {
      var b = e.target.closest ? e.target.closest('[data-cuenta]') : null;
      if (!b) return;
      var id = Number(b.dataset.cuenta);
      var todos = (r.internos || []).concat(r.externos || []);
      var ben = null;
      for (var i = 0; i < todos.length; i++) if (todos[i].cuenta_id === id) ben = todos[i];
      if (!ben) return;
      cerrar();
      if (typeof alElegir === 'function') alElegir(ben);
    };
  }

  function avisar(t) {
    var a = $('#benAviso');
    if (!a) return;
    a.hidden = false;
    a.textContent = t || 'No se pudo.';
  }

  function cerrar() {
    var d = $('#benCaja');
    if (d) d.remove();
    document.removeEventListener('keydown', alaEscape);
  }

  function alaEscape(e) { if (e.key === 'Escape') cerrar(); }

  G.Beneficiarios = {
    cargar: cargar,
    crearExterno: crearExterno,
    ligado: ligado,
    estadoDe: estadoDe,
    nombreDe: nombreDe,
    marcar: marcar,
    soltar: soltar,
    renglones: renglones,
    sueltos: sueltos,
    pendientes: pendientes,
    idos: idos,
    celda: celda,
    abrir: abrir,
    cerrar: cerrar,
    error: function () { return estado.error; },
    catalogo: function () { return estado.catalogo; },
    URL: URL_BEN
  };
})(window);
