/* ═══ Órdenes de venta · la lista de Odoo, con lo que sirve para confirmar ═══
 *
 * El segundo camino a la Confirmación. Hasta hoy sólo se llegaba por
 * «Confirmar órdenes» (`confirmar.js`), que parte del MACHOTE; aquí se parte de
 * la ORDEN, que es como mira quien está revisando lo que hay en Odoo.
 *
 * ── LO QUE ESTA PANTALLA NO HACE, Y ES A PROPÓSITO ──────────────────────────
 * No decide si se puede confirmar. Eso lo contesta `G.PuertaConfirmar`, UNA
 * función que llaman los dos caminos. Tenerlo en dos sitios es exactamente el
 * defecto que ya costó una noche: el trabón del botón de crear la orden se
 * calculaba en el render y en el repintado parcial, al parcial se le olvidaron
 * los candados, y la prueba que debía cazarlo PASABA (CLAUDE.md §20 #18).
 *
 * ── TRES DECISIONES DE PANTALLA, CON SU PORQUÉ ──────────────────────────────
 *
 * 1. EL FILTRO SE ANUNCIA, Y DICE CUÁNTO ESCONDE. Odoo trae «My Quotations»
 *    puesto por omisión y lo pinta como una facetita gris que se confunde con
 *    adorno. El resultado es que la lista parece la lista y no lo es. Aquí el
 *    filtro activo es una banda, con el número de registros que deja fuera: un
 *    filtro que no se anuncia se lee como registros que faltan (§20 #18).
 *
 * 2. LA PAGINACIÓN ES DEL SERVIDOR. Son 1,546 órdenes y van a ser más. Traerlas
 *    todas y paginar en el navegador funciona el primer año y se cae el
 *    segundo — y se cae en la máquina de quien está trabajando, no en la
 *    nuestra. Se piden `limite` y `desde`, y el total viene aparte.
 *
 * 3. LA BASURA DE PRUEBA SE ESCONDE POR **ID**, NUNCA POR NOMBRE. Medido el
 *    29-sep-2026: de los siete contactos de Odoo cuyo nombre contiene
 *    «prueba»/«ZZ»/«test», **dos son clientes REALES** —uno de subestaciones
 *    eléctricas cuya razón social empieza con esa palabra—. Filtrar por texto
 *    habría escondido órdenes de verdad, que es el modo de fallo caro. La lista
 *    de ids vive en la base (migración 011), no aquí.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (G) {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function A() { return G.MachoteAlmacen; }

  var POR_PAGINA = 80;

  /* Los tres estados de Odoo que nos importan, con su etiqueta en español. El
   * `sent` de Odoo es «Quotation Sent»: sigue siendo cotización, así que se
   * pinta igual que `draft` y se distingue por la insignia. */
  var ESTADO = {
    draft:  { txt: 'Cotización', cls: 'q' },
    sent:   { txt: 'Enviada',    cls: 'q' },
    sale:   { txt: 'Orden de venta', cls: 's' },
    done:   { txt: 'Bloqueada',  cls: 's' },
    cancel: { txt: 'Cancelada',  cls: 'c' }
  };

  var _st = {
    filas: [], total: 0, desde: 0,
    verPrueba: false, soloMias: true, sinCancelar: true,
    cargando: false, error: null, demo: false,
    host: null
  };

  /* ── El dinero ─────────────────────────────────────────────────────────────
   * Sin inventar el formato: el mismo que el resto del módulo. Y la moneda va
   * SIEMPRE al lado — una lista que mezcla pesos y dólares sin decirlo produce
   * comparaciones que parecen válidas y no lo son. */
  function money(n, mon) {
    if (n === null || n === undefined || n === '') return '—';
    var v = Number(n);
    if (!isFinite(v)) return '—';
    return v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
           (mon ? '<span class="or-mn">' + esc(mon) + '</span>' : '');
  }

  /* ── EL COTIZADOR, QUE ES UN NOMBRE DE PILA Y NO UNA PERSONA ───────────────
   * Medido el 29-sep-2026 contra el padrón CON archivados: de los seis valores
   * en uso, tres nombran a alguien que ya no está —y se siguen eligiendo—. El
   * campo de Odoo es un `selection` de nombres de pila, no un enlace a
   * `hr.employee`, así que no hay forma de que una máquina sepa a quién apunta.
   *
   * Lo honesto es pintarlo TAL CUAL y decir que no casa. Traducirlo sería
   * inventar una atribución, que es peor que no tenerla. */
  /* ── EL PUENTE DE LOS APODOS, Y POR QUÉ ES UN PUENTE ──────────────────────
   * Decisión de Esteban (30-sep-2026): en todos los sistemas se maneja el
   * NOMBRE COMPLETO, no el apodo. Pero el campo de Odoo es un `selection`
   * escrito a mano y sigue diciendo «Monty» en 83 órdenes, así que traducir
   * aquí es lo único que se puede hacer hoy sin tocar el catálogo — y el
   * catálogo es cambio de Studio, o sea suyo.
   *
   * ESTO ES UN PUENTE CON FECHA DE CADUCIDAD: se borra el día que el catálogo
   * guarde nombres completos. Cómo llegar ahí, en
   * `docs/comercial/COTIZADOR-NOMBRE-COMPLETO.md`.
   *
   * Y no se adivina, se midió contra el padrón: `hr.employee` 8 = Francisco
   * Montalvo Ramirez, activo, departamento Comercial. El apodo viene de su
   * cuenta de correo, que empieza por el apellido.
   *
   * Ojo con el detalle que decide la FORMA del arreglo: hay DOS empleados
   * activos con el apellido Montalvo Ramirez, en áreas distintas, así que el
   * apellido solo TAMPOCO desambigua. Por eso el nombre completo.
   *
   * El valor crudo de Odoo se sigue enseñando al lado, en gris. Quien lee la
   * pantalla tiene que poder ver que esto es una TRADUCCIÓN y no el dato: si
   * el puente se equivoca algún día, ahí está dónde mirar. */
  var APODOS = {
    'Monty': { nombre: 'Francisco Montalvo Ramirez', empleado_id: 8 }
  };

  function cotizador(f) {
    if (!f.cotizador) return '<span class="or-vacio">— sin cotizador —</span>';
    var crudo = String(f.cotizador).trim();
    var puente = APODOS[crudo];
    if (puente) {
      return esc(puente.nombre) +
        ' <span class="chip-mini" title="En Odoo el campo todavía dice «' + esc(crudo) +
        '». Aquí se enseña el nombre completo; corregir el catálogo es un cambio de Studio.">' +
        esc(crudo) + '</span>';
    }
    var t = esc(crudo);
    if (f.cotizador_estado === 'archivado')
      return t + ' <span class="chip-mini bad" title="El empleado con ese nombre ya no está activo">ya no está</span>';
    if (f.cotizador_estado === 'sin_casar')
      return t + ' <span class="chip-mini warn" title="Ese nombre de pila no casa con nadie del padrón">¿quién?</span>';
    return t;
  }

  /* ── LA COLUMNA DEL MACHOTE ───────────────────────────────────────────────
   * Folio Y descripción. Si hay que abrirlo para saber cuál es, la columna no
   * sirve de nada — y ése era el encargo, literal. */
  function machoteCelda(f) {
    if (!f.machote) {
      return '<span class="or-mach"><span class="or-vacio">sin machote</span>' +
        '<button class="or-lig" data-ligar="' + esc(f.id) + '">ligar</button></span>';
    }
    var m = f.machote;
    return '<span class="or-mach">' +
      '<a class="or-fol" href="#/m/' + esc(m.id_local || '') + '">' +
        esc(m.folio_txt || m.folio || '—') + '</a>' +
      '<span class="or-md" title="' + esc(m.nombre) + '">' + esc(m.nombre) + '</span>' +
      (f.machotes_mas ? '<span class="chip-mini warn" title="Esta orden tiene ' +
        (f.machotes_mas + 1) + ' machotes ligados; manda el principal">+' + f.machotes_mas + '</span>' : '') +
      '<button class="or-lig" data-ligar="' + esc(f.id) + '">cambiar</button></span>';
  }

  /* ══ LA LISTA ═════════════════════════════════════════════════════════════ */
  function htmlLista() {
    if (_st.cargando)
      return '<div class="pad"><div class="aviso">Pidiendo las órdenes al servidor…</div></div>';

    if (_st.error) {
      /* Los tres mundos separados, como manda §20 #12b: una credencial muerta,
       * un servidor que no contesta y un servidor que contesta con un error
       * suyo llevan a tres acciones distintas. Aquí sólo se dice cuál es y qué
       * hacer; quien decide el reintento es la persona. */
      return '<div class="pad"><div class="aviso bad">' +
        '<strong>No se pudo traer la lista.</strong> ' + esc(_st.error) + '</div></div>';
    }

    var hasta = Math.min(_st.desde + _st.filas.length, _st.total);
    var desde1 = _st.total ? _st.desde + 1 : 0;

    var facetas = '';
    if (_st.soloMias) facetas += faceta('mias', 'Mías');
    if (_st.sinCancelar) facetas += faceta('cancel', 'Sin canceladas');
    if (!_st.verPrueba) facetas += faceta('prueba', 'Sin las de prueba');
    facetas += '<span class="or-fac fijo" title="La vista está acotada a FTS México y FTS USA">Empresas FTS</span>';

    var cuerpo = _st.filas.length
      ? _st.filas.map(fila).join('')
      : '<tr><td colspan="8" class="or-vacio" style="padding:18px">' +
        'No hay ninguna orden con estos filtros. <b>Quita alguno</b> antes de concluir ' +
        'que no existe: una lista vacía se ve igual cuando el filtro sirve y cuando sobra.' +
        '</td></tr>';

    return '<div class="pad or-wrap">' +
      (_st.demo ? '<div class="aviso warn"><strong>Datos de ejemplo.</strong> ' +
        'El servidor de órdenes todavía no está encendido, así que esto es una muestra ' +
        'inventada para poder recorrer la pantalla. <b>Ninguna de estas órdenes existe.</b>' +
        '</div>' : '') +

      '<div class="or-filtro">' +
        '<div class="or-fq"><b>Estás viendo ' + desde1 + '–' + hasta + ' de ' +
          _st.total.toLocaleString('es-MX') + '.</b> Filtro activo: ' + facetas +
          (_st.ocultas ? ' — se están escondiendo <b>' + _st.ocultas +
            '</b> por esos filtros.' : '') +
        '</div>' +
      '</div>' +

      '<div class="or-caja"><table class="or-tab"><thead><tr>' +
        '<th>Número</th><th>Estado</th><th>Cliente</th><th>Descripción</th>' +
        '<th>PO del cliente</th><th>Cotizador</th><th class="num">Total</th><th>Machote</th>' +
      '</tr></thead><tbody>' + cuerpo + '</tbody></table></div>' +

      '<div class="or-pag">' +
        '<button class="btn" data-pag="-1"' + (_st.desde <= 0 ? ' disabled' : '') + '>‹ Anteriores</button>' +
        '<button class="btn" data-pag="1"' + (hasta >= _st.total ? ' disabled' : '') + '>Siguientes ›</button>' +
        '<span class="tiny"><b>' + desde1 + '–' + hasta + '</b> de <b>' +
          _st.total.toLocaleString('es-MX') + '</b> · ' + POR_PAGINA + ' por página, ' +
          'pedidas al servidor</span>' +
      '</div>' +
    '</div>';
  }

  function faceta(k, txt) {
    return '<span class="or-fac">' + esc(txt) +
      '<button data-quitar="' + k + '" title="Quitar este filtro">×</button></span>';
  }

  function fila(f) {
    var e = ESTADO[f.estado] || { txt: f.estado || '—', cls: 'q' };
    return '<tr data-so="' + esc(f.id) + '">' +
      '<td data-th="Número" class="or-num">' + esc(f.nombre) +
        (f.empresa_id === 6 ? ' <span class="chip-mini info">USA</span>' : '') +
        (f.es_prueba ? ' <span class="chip-mini warn">prueba</span>' : '') + '</td>' +
      /* Sin insignia extra para `sent`: la etiqueta YA dice «Enviada». Dos
       * chips seguidos con la misma palabra es ruido, y el ruido se aprende
       * a ignorar justo donde luego hace falta mirar. */
      '<td data-th="Estado"><span class="or-est ' + e.cls + '">' + esc(e.txt) + '</span></td>' +
      '<td data-th="Cliente" class="or-cli" title="' + esc(f.cliente) + '">' + esc(f.cliente) + '</td>' +
      /* La MISMA función que el detalle. Dos lecturas del mismo dato acaban
       * diciendo cosas distintas, y la lista es la que más se mira. */
      '<td data-th="Descripción" class="or-desc" title="' + esc(descripcion(f).texto) + '">' +
        (descripcion(f).texto ? esc(descripcion(f).texto)
          : '<span class="or-vacio">— sin descripción —</span>') + '</td>' +
      '<td data-th="PO" class="or-po" title="' + esc(f.po) + '">' +
        (f.po ? esc(f.po) : '<span class="or-vacio">—</span>') + '</td>' +
      '<td data-th="Cotizador" class="or-cot">' + cotizador(f) + '</td>' +
      '<td data-th="Total" class="num mono or-tot">' + money(f.total, f.moneda) + '</td>' +
      '<td data-th="Machote">' + machoteCelda(f) + '</td>' +
    '</tr>';
  }

  /* ══ EL DETALLE ═══════════════════════════════════════════════════════════ */
  function htmlDetalle(f) {
    if (!f) return '<div class="pad"><div class="aviso bad">' +
      'Esa orden no está en la página que se trajo. Vuelve a la lista.</div></div>';

    var e = ESTADO[f.estado] || { txt: f.estado, cls: 'q' };
    var pasos = ['draft', 'sent', 'sale'];
    var aqui = pasos.indexOf(f.estado);
    var barra = [['draft', 'Cotización'], ['sent', 'Enviada'], ['sale', 'Orden']]
      .map(function (p, i) {
        return '<div class="' + (i === aqui ? 'on' : '') + '">' + p[1] + '</div>';
      }).join('');

    return '<div class="pad or-wrap">' +
      '<p><a class="btn" href="#/ordenes">‹ Volver a la lista</a></p>' +

      '<div class="caja">' +
        '<div class="or-cab">' +
          '<div><h3 style="margin:0">' + esc(f.nombre) +
            (f.empresa_id === 6 ? ' <span class="chip-mini info">FTS USA</span>' : '') + '</h3>' +
            '<div class="tiny nota">' + esc(f.cliente) + '</div></div>' +
          '<div class="or-sb">' + (aqui >= 0 ? barra :
            '<div class="on">' + esc(e.txt) + '</div>') + '</div>' +
        '</div>' +

        '<div class="or-campos">' +
          htmlDescripcion(f) +
          campo('PO del cliente', f.po, 'Todavía no ha llegado') +
          /* La MISMA función que la lista. Aquí decía `f.cotizador` a secas, y
           * el resultado era que el puente de los apodos se aplicaba en la
           * lista y NO en el detalle: la misma orden decía «Francisco Montalvo
           * Ramirez» en una pantalla y «Monty» en la otra. Es §20 #4 en su
           * forma más tonta —un dato pintado en dos sitios— y no lo cazó
           * ninguna prueba: lo cazó mirar la captura de 760. */
          campo('Cotizador', cotizador(f), 'Sin cotizador', true) +
          campo('Total', (f.total === null || f.total === undefined)
                ? '' : money(f.total, f.moneda), 'Sin importe', true) +
          campo('Fecha de creación', f.fecha, '—') +
          campo('Lista de precios', f.pricelist, '—') +
        '</div>' +

        '<h4>El machote ligado</h4>' +
        htmlMachoteLigado(f) +

        '<div class="btns">' +
          (f.machote ? '<button class="btn" id="orAbrirHoja">Abrir el machote ⌃</button>' : '') +
          '<button class="btn primario" id="orConfirmar">Confirmar la orden</button>' +
        '</div>' +
        '<p class="tiny nota">Este botón abre <b>el mismo</b> cuadro que «Confirmar ' +
          'órdenes». No hay dos: los candados los calcula una sola función.</p>' +
      '</div>' +
    '</div>';
  }

  /* ── LA DESCRIPCIÓN DEL PROYECTO SALE DEL MACHOTE, NO DE ODOO ──────────────
   * Decisión de Esteban (30-sep-2026). Y la razón está medida: el campo de Odoo
   * (`x_studio_proyect_description`) trae «prueba 4 marzo 2026» y «aaa» en
   * órdenes reales. Es un texto libre que nadie vigila, así que como fuente de
   * verdad no sirve — y la Confirmación lo LEE para ponerle nombre al proyecto,
   * a la analítica y al presupuesto. Un «aaa» ahí se convierte en un proyecto
   * llamado «aaa» que vive años.
   *
   * El machote sí tiene dueño, versión e historial, así que manda él. Lo de
   * Odoo se sigue enseñando cuando DIFIERE — no se esconde: el día que alguien
   * lo edite allá, hay que poder verlo. Y cuando allá está vacío se ofrece
   * copiarlo, que es el caso más común y el más fácil de arreglar.
   *
   * ⚠️ Lo que NO hace es copiarlo solo. Escribir a Odoo sin que nadie lo pida
   * convierte esta pantalla en un segundo escritor del campo, y dos escritores
   * es una carrera silenciosa en la que el que pierde no deja rastro (§20 #4).
   * Hay un botón, y lo aprieta una persona. */
  function descripcion(f) {
    var deOdoo = String((f && f.descripcion) || '').trim();
    var delMach = String((f && f.machote && f.machote.nombre) || '').trim();
    return {
      odoo: deOdoo,
      machote: delMach,
      /* Lo que se ENSEÑA: el machote si lo hay, y si no lo de Odoo — que es
       * mejor que nada y viene marcado. */
      texto: delMach || deOdoo,
      fuente: delMach ? 'machote' : (deOdoo ? 'odoo' : null),
      vacia_en_odoo: !deOdoo,
      difiere: !!(delMach && deOdoo && delMach !== deOdoo)
    };
  }

  /** La descripción en el DETALLE, con su procedencia y su botón. */
  function htmlDescripcion(f) {
    var d = descripcion(f);
    if (!d.texto) {
      return '<label class="or-campo"><span>Descripción del proyecto</span>' +
        '<div class="or-val vac">Ni el machote ni Odoo la traen</div></label>';
    }
    var marca = d.fuente === 'machote'
      ? '<span class="chip-mini" title="Sale de la cotización de la suite, que tiene dueño y versión. ' +
        'El campo de Odoo es texto libre que nadie vigila.">del machote</span>'
      : '<span class="chip-mini warn" title="No hay machote ligado, así que esto es el texto libre de Odoo.">de Odoo</span>';

    var extra = '';
    if (d.fuente === 'machote' && d.vacia_en_odoo) {
      extra = '<p class="tiny nota or-desc-acc">En Odoo este campo está <b>vacío</b>. ' +
        '<button class="btn fantasma" data-copiardesc="' + esc(f.id) + '">Copiarlo a Odoo</button></p>';
    } else if (d.difiere) {
      extra = '<p class="tiny nota or-desc-acc">⚠️ En Odoo dice otra cosa: «' + esc(d.odoo) + '». ' +
        'No se toca sola — <button class="btn fantasma" data-copiardesc="' + esc(f.id) +
        '">sobrescribir con la del machote</button>.</p>';
    }
    return '<label class="or-campo"><span>Descripción del proyecto ' + marca + '</span>' +
      '<div class="or-val">' + esc(d.texto) + '</div>' + extra + '</label>';
  }

  function campo(et, val, vacio, crudo) {
    var hay = val !== null && val !== undefined && String(val) !== '';
    return '<label class="or-campo"><span>' + esc(et) + '</span>' +
      '<div class="or-val' + (hay ? '' : ' vac') + '">' +
        (hay ? (crudo ? val : esc(val)) : esc(vacio)) + '</div></label>';
  }

  function htmlMachoteLigado(f) {
    if (!f.machote) {
      return '<div class="or-lig-caja avisa">' +
        '<h4>Sin machote ligado</h4>' +
        '<p>Esta orden no tiene una cotización de la suite detrás. Se puede ligar a una ' +
        'que ya exista. <b>Se puede confirmar sin ella</b>, pero entonces todo lo que el ' +
        'machote trae solo —el contacto, la decisión de IVA, la PO— hay que capturarlo ' +
        'a mano, y eso es exactamente donde se cuela un dato inventado.</p>' +
        '<div class="btns"><button class="btn" data-ligar="' + esc(f.id) + '">Ligar un machote</button></div>' +
        '</div>';
    }
    var m = f.machote;
    return '<div class="or-lig-caja pasa">' +
      '<h4>' + esc(m.folio_txt || m.folio || '—') + ' — ' + esc(m.nombre) + '</h4>' +
      '<p class="tiny">Dueño: ' + esc(m.duenio || '—') +
        ' · versión ' + esc(m.version || '—') +
        (m.principal === false ? ' · <b>no es el principal de esta orden</b>' : '') + '</p>' +
      '<div class="btns">' +
        '<button class="btn" data-ligar="' + esc(f.id) + '">Cambiar de machote</button>' +
        '<button class="btn peli" data-desligar="' + esc(f.id) + '">Desligar</button>' +
      '</div></div>';
  }

  /* ══ LA HOJA DEL MACHOTE, A MEDIA PANTALLA ════════════════════════════════
   * No es un modal que tapa todo: es una hoja que sube desde abajo y deja la
   * orden visible arriba, porque lo que se está haciendo es COMPARAR las dos
   * cosas. Y se minimiza a su propia barra sin perder nada de lo tecleado — el
   * nodo no se destruye, sólo se le baja la altura. */
  function hoja() {
    var h = document.getElementById('orHoja');
    if (h) return h;
    h = document.createElement('div');
    h.id = 'orHoja';
    h.className = 'or-hoja';
    h.innerHTML =
      '<div class="or-hoja-cab" id="orHojaCab">' +
        '<span class="tt" id="orHojaTt"></span>' +
        '<button class="btn" id="orHojaMin" title="Minimizar">—</button>' +
        '<button class="btn" id="orHojaX" title="Cerrar">×</button>' +
      '</div>' +
      '<div class="or-hoja-cuerpo" id="orHojaCuerpo"></div>';
    document.body.appendChild(h);
    h.querySelector('#orHojaCab').addEventListener('click', function (ev) {
      if (ev.target.id === 'orHojaX') return;
      alternarMin();
    });
    h.querySelector('#orHojaX').addEventListener('click', function (ev) {
      ev.stopPropagation(); cerrarHoja();
    });
    return h;
  }
  function alternarMin() {
    var h = hoja();
    h.classList.toggle('min');
    var b = document.getElementById('orHojaMin');
    if (b) b.textContent = h.classList.contains('min') ? '▴' : '—';
  }
  function cerrarHoja() {
    var h = document.getElementById('orHoja');
    if (h) { h.classList.remove('abierta'); h.classList.remove('min'); }
  }
  function abrirHoja(f) {
    var h = hoja();
    h.classList.add('abierta');
    document.getElementById('orHojaTt').textContent =
      (f.machote ? (f.machote.folio_txt || f.machote.folio || '') + ' · ' + f.machote.nombre
                 : 'Sin machote');
    document.getElementById('orHojaCuerpo').innerHTML = cuerpoHoja(f);
  }

  /* Lo que va en la hoja: lo que de verdad se edita ANTES de confirmar. No es
   * el machote entero —para eso está su pantalla, y hay un enlace— sino los
   * campos que la Confirmación va a exigir. «Editar rápido» es eso: no tener
   * que irse a otra pantalla para poner el correo del contacto. */
  function cuerpoHoja(f) {
    var m = f.machote;
    if (!m) return '<p class="tiny">Esta orden no tiene machote ligado.</p>';
    var local = G.MachoteApp && G.MachoteApp.machotePorUuid
      ? G.MachoteApp.machotePorUuid(m.id) : null;

    var dentro = local && G.Confirmacion
      ? G.Confirmacion.html(local, null)
      : '<div class="aviso">Esta cotización no está en este navegador, así que aquí no ' +
        'se puede editar: ábrela en su pantalla. <b>No se inventa un formulario vacío</b> ' +
        '— se vería idéntico a uno sin capturar.</div>';

    return '<p class="tiny">Media pantalla a propósito: la orden sigue visible arriba. ' +
      'El botón <b>—</b> baja esto a su barra y no pierde nada de lo tecleado.</p>' +
      dentro +
      '<p style="margin-top:12px"><a class="btn" href="#/m/' +
        esc((local && local.id) || '') + '">Abrir el machote completo ›</a></p>';
  }

  /* ══ MONTAJE ══════════════════════════════════════════════════════════════ */
  function montar(host, soId) {
    _st.host = host;
    /* ⚠️ El detalle también CARGA si no hay nada que mirar.
     *
     * La primera versión pintaba el detalle directo desde `_st.filas`, que es
     * lo que trajo la lista. Funcionaba entrando por la lista y se rompía en
     * el único caso que la gente usa de verdad: pegar la dirección de una
     * orden, o recargar estando en ella. Salía «esa orden no está en la página
     * que se trajo», que es cierto y completamente inútil. Lo cazó la prueba
     * de desligar, que entra directo a `#/so/:id` — no la lectura del código.
     */
    if (soId) {
      if (!_st.filas.length && !_st.cargando) {
        return cargar(host, true).then(function () { pintarDetalle(host, soId); });
      }
      return pintarDetalle(host, soId);
    }
    if (!_st.filas.length && !_st.cargando && !_st.error) return cargar(host);
    pintarLista(host);
  }

  function pintarLista(host) {
    cerrarHoja();
    host.innerHTML = htmlLista();
    cablearLista(host);
  }

  function pintarDetalle(host, soId) {
    var f = _st.filas.filter(function (x) { return String(x.id) === String(soId); })[0];
    host.innerHTML = htmlDetalle(f);
    if (!f) return;
    cablearDetalle(host, f);
  }

  function cargar(host, noPintarLista) {
    _st.cargando = true; _st.error = null;
    if (host && !noPintarLista) host.innerHTML = htmlLista();
    var a = A();
    if (!a || !a.listarOrdenes) {
      _st.cargando = false;
      _st.error = 'La pieza que habla con el servidor no está cargada en esta pantalla.';
      if (host && !noPintarLista) pintarLista(host);
      return Promise.resolve();
    }
    return a.listarOrdenes({
      limite: POR_PAGINA, desde: _st.desde,
      solo_mias: _st.soloMias, sin_cancelar: _st.sinCancelar, ver_prueba: _st.verPrueba
    }).then(function (r) {
      _st.cargando = false;
      if (r && r.ok) {
        _st.filas = r.ordenes || [];
        _st.total = r.total || 0;
        _st.ocultas = r.ocultas || 0;
        _st.demo = r.demo === true;
      } else {
        _st.error = (r && r.mensaje) || 'El servidor no contestó lo que se esperaba.';
      }
      if (host && !noPintarLista) pintarLista(host);
    });
  }

  function cablearLista(host) {
    host.querySelectorAll('[data-pag]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = Number(b.getAttribute('data-pag'));
        _st.desde = Math.max(0, _st.desde + d * POR_PAGINA);
        cargar(host);
      });
    });
    host.querySelectorAll('[data-quitar]').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var k = b.getAttribute('data-quitar');
        if (k === 'mias') _st.soloMias = false;
        if (k === 'cancel') _st.sinCancelar = false;
        if (k === 'prueba') _st.verPrueba = true;
        _st.desde = 0;
        cargar(host);
      });
    });
    host.querySelectorAll('[data-ligar]').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        abrirLigar(b.getAttribute('data-ligar'));
      });
    });
    host.querySelectorAll('tr[data-so]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        location.hash = '#/so/' + tr.getAttribute('data-so');
      });
    });
  }

  function cablearDetalle(host, f) {
    var b = host.querySelector('#orAbrirHoja');
    if (b) b.addEventListener('click', function () { abrirHoja(f); });

    var c = host.querySelector('#orConfirmar');
    if (c) c.addEventListener('click', function () {
      if (!G.PuertaConfirmar) return;
      G.PuertaConfirmar.abrir({ orden: f, desde: 'orden' });
    });

    host.querySelectorAll('[data-ligar]').forEach(function (x) {
      x.addEventListener('click', function () { abrirLigar(f.id); });
    });
    host.querySelectorAll('[data-desligar]').forEach(function (x) {
      x.addEventListener('click', function () { desligar(f); });
    });
    host.querySelectorAll('[data-copiardesc]').forEach(function (x) {
      x.addEventListener('click', function (ev) {
        ev.preventDefault();
        copiarDescripcion(f);
      });
    });
  }

  /* ── Ligar y desligar ─────────────────────────────────────────────────────
   * Las dos piden confirmación y las dos dicen QUÉ se va a romper. Desligar no
   * borra nada: escribe la fecha y el autor (migración 011). */
  function abrirLigar(soId) {
    if (!G.OrdenLigar) return;
    G.OrdenLigar.abrir(soId, function () { cargar(_st.host); });
  }
  /** Copiar la descripción del machote al campo de Odoo. Lo aprieta una
   *  persona, y la pantalla NO se pinta como si hubiera funcionado: se repinta
   *  desde lo que contestó el servidor. Un ✓ antes del POST es el anti-patrón
   *  más caro que tiene este repo (hallazgo #15). */
  function copiarDescripcion(f) {
    var d = descripcion(f);
    if (!d.machote) return;
    var q = d.vacia_en_odoo
      ? ('Vas a escribir en Odoo la descripción del machote:\n\n«' + d.machote + '»\n\n' +
         'El campo de allá está vacío. ¿Seguir?')
      : ('En Odoo dice:\n\n«' + d.odoo + '»\n\ny se va a SOBRESCRIBIR con la del machote:\n\n«' +
         d.machote + '»\n\nEsto no se puede deshacer desde aquí. ¿Seguir?');
    if (!G.confirm(q)) return;

    var A = G.MachoteAlmacen;
    if (!A || !A.copiarDescripcion) {
      G.alert('No está cargada la pieza que habla con el servidor.');
      return;
    }
    A.copiarDescripcion(f.id, d.machote).then(function (r) {
      if (r && r.ok) {
        /* Se relee la lista: el estado de la pantalla sale del servidor, nunca
         * de haber apretado. */
        cargar(document.getElementById('vista'), true);
      } else {
        G.alert((r && r.mensaje) ||
          'No se pudo escribir la descripción en Odoo. Nada cambió.');
      }
    });
  }

  function desligar(f) {
    var q = 'Vas a desligar ' + (f.machote ? (f.machote.folio_txt || '') : '') +
      ' de ' + f.nombre + '.\n\nNo se borra nada: queda escrito quién lo desligó y cuándo. ' +
      'Pero la Confirmación dejará de traer del machote el contacto, la decisión de IVA y ' +
      'la PO, y habrá que capturarlos a mano.\n\n¿Seguir?';
    if (!G.confirm(q)) return;
    var a = A();
    if (!a || !a.desligarOrden) return;
    a.desligarOrden(f.id).then(function (r) {
      if (r && r.ok) { cargar(_st.host).then(function () { location.hash = '#/ordenes'; }); }
      else G.alert((r && r.mensaje) || 'No se pudo desligar.');
    });
  }

  G.Ordenes = {
    montar: montar,
    /* Para las pruebas: sembrar filas sin servidor, y leer el estado. */
    _sembrar: function (filas, total) {
      _st.filas = filas || []; _st.total = total || (filas || []).length;
      _st.cargando = false; _st.error = null; _st.desde = 0;
    },
    _estado: function () { return _st; },
    _esc: esc, _cotizador: cotizador, _money: money,
    POR_PAGINA: POR_PAGINA
  };
})(window);
