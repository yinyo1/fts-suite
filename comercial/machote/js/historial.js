/* ═══ Machote · el historial de versiones ═══
 *
 * Lo que pidió Esteban (#140, 6-sep): que funcione como el historial de
 * versiones de SharePoint —abrir cualquier versión anterior y verla completa
 * tal como estaba—, con dos diferencias:
 *
 *   · VER NO ES RESTAURAR. No se vuelve a una versión anterior: la orden se
 *     confirma con la última y ésa queda como definitiva para crear las
 *     analíticas. Por eso aquí **no hay botón de restaurar**. No está
 *     deshabilitado ni escondido: no existe. Un botón que no debe apretarse,
 *     puesto en gris, sigue invitando a preguntar por qué no se puede — y
 *     tarde o temprano alguien lo habilita.
 *   · EL MOTIVO ES OBLIGATORIO cuando cambian comisiones o margen. Eso no lo
 *     vigila esta pantalla: lo rechaza la base (`mv_exige_motivo` en
 *     `003_machote.sql`). Aquí sólo se muestra.
 *
 * El caso real que lo motivó: se modificaba el machote al final para cambiar
 * el reparto de comisiones y no quedaba rastro de qué había cambiado.
 *
 * Prototipo validado antes de construir: `docs/comercial/prototipos/
 * historial-versiones.html` (16/16 pruebas, 1280 px y 380 px).
 */
(function (G) {
  'use strict';

  var esc = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  var mx = function (n) {
    return (n === null || n === undefined) ? '—'
      : '$' + Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  };

  var pc = function (n) {
    return (n === null || n === undefined) ? '—'
      : (Number(n) * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  };

  var fecha = function (s) {
    if (!s) return '—';
    var d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' ' +
           d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  function cerrar() { var d = document.getElementById('modalHist'); if (d) d.remove(); }

  function cascaron(cuerpo) {
    var viejo = document.getElementById('modalHist'); if (viejo) viejo.remove();
    document.body.insertAdjacentHTML('beforeend',
      '<div class="modal" id="modalHist"><div class="caja hist">' + cuerpo + '</div></div>');
    var d = document.getElementById('modalHist');
    d.addEventListener('click', function (e) { if (e.target === d) cerrar(); });
    var x = document.getElementById('hs-x');
    if (x) x.onclick = cerrar;
  }

  /** Pinta la versión seleccionada: qué cambió respecto de la anterior, y el
   *  documento congelado tal como quedó. */
  function pintarDetalle(vs, i) {
    var v = vs[i];
    var ant = vs[i + 1] || null;          // vs viene de la más nueva a la más vieja
    var ultima = (i === 0);

    /* Devuelve la CLASE, no el atributo entero. Pegar un segundo class="dif"
     * junto al class="num" que ya trae la celda hace que el navegador se
     * quede con el primero y tire el segundo en silencio — la fila cambiada
     * se pintaba igual que las demás. Salió corriendo el prototipo; leyendo
     * el HTML se ve bien. */
    var dif = function (campo) {
      return (ant && ant[campo] !== v[campo]) ? ' dif' : '';
    };

    var tit = document.getElementById('hs-tit');
    if (tit) tit.textContent = 'Versión ' + v.version + (ultima ? ' · la última' : '');

    var av = document.getElementById('hs-aviso');
    if (av) {
      av.innerHTML = ultima ? '' :
        '<div class="lectura"><strong>Estás viendo una versión anterior, en modo lectura.</strong> ' +
        'No se puede volver a ella: la orden se confirma con la última. Esto es para entender ' +
        'qué cambió y por qué.</div>';
    }

    var cuerpo = document.getElementById('hs-cuerpo');
    if (!cuerpo) return;
    cuerpo.innerHTML =
      '<table>' +
      '<tr><th>Concepto</th><th>Esta versión</th><th>' +
        (ant ? 'Versión ' + ant.version : '—') + '</th></tr>' +
      '<tr><td>Total</td><td class="num' + dif('total') + '">' + mx(v.total) +
        '</td><td class="num tiny">' + (ant ? mx(ant.total) : '—') + '</td></tr>' +
      '<tr><td>Margen</td><td class="num' + dif('margen') + '">' + pc(v.margen) +
        '</td><td class="num tiny">' + (ant ? pc(ant.margen) : '—') + '</td></tr>' +
      '<tr><td>Comisión FTS</td><td class="num' + dif('comision_fts') + '">' + pc(v.comision_fts) +
        '</td><td class="num tiny">' + (ant ? pc(ant.comision_fts) : '—') + '</td></tr>' +
      '<tr><td>Comisión cliente</td><td class="num' + dif('comision_cliente') + '">' + pc(v.comision_cliente) +
        '</td><td class="num tiny">' + (ant ? pc(ant.comision_cliente) : '—') + '</td></tr>' +
      '<tr><td>Moneda</td><td class="num">' + esc(v.moneda || '—') +
        '</td><td class="num tiny">' + esc(ant ? (ant.moneda || '—') : '—') + '</td></tr>' +
      '<tr><td>Tipo de cambio' + (v.tc_fuente ? ' <span class="tiny">(' + esc(v.tc_fuente) + ')</span>' : '') +
        '</td><td class="num' + dif('tc') + '">' + (v.tc === null ? '—' : esc(v.tc)) +
        '</td><td class="num tiny">' + (ant && ant.tc !== null ? esc(ant.tc) : '—') + '</td></tr>' +
      '<tr><td>Estado</td><td class="num">' + esc(v.estado) +
        '</td><td class="num tiny">' + esc(ant ? ant.estado : '—') + '</td></tr>' +
      '</table>' +
      '<p class="tiny nota" style="margin-top:10px">Lo resaltado cambió respecto de la versión ' +
      'anterior. El tipo de cambio y los precios quedaron <strong>congelados</strong> tal como estaban.</p>' +
      '<h4 style="margin:14px 0 6px;font-size:13px">El documento congelado</h4>' +
      '<pre class="hist-doc">' + esc(JSON.stringify(v.documento, null, 2)) + '</pre>';

    var lista = document.getElementById('hs-lista');
    if (lista) {
      var items = lista.querySelectorAll('.v');
      for (var k = 0; k < items.length; k++) {
        items[k].className = 'v' + (Number(items[k].getAttribute('data-i')) === i ? ' on' : '');
      }
    }
  }

  function pintarLista(vs, sel) {
    return vs.map(function (v, i) {
      return '<div class="v' + (i === sel ? ' on' : '') + '" data-i="' + i + '" tabindex="0">' +
        '<div><span class="n">Versión ' + v.version + '</span> ' +
        (i === 0 ? '<span class="chip ult">la última</span>'
                 : '<span class="chip">' + esc(v.estado) + '</span>') + '</div>' +
        '<div class="meta">' + esc(v.autor_nombre || v.autor || 'sin autor') +
        ' · ' + esc(fecha(v.guardada_at)) + '</div>' +
        (v.motivo ? '<div class="motivo">' + esc(v.motivo) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  /** Abre el historial de un machote. `m` es el machote local (para el
   *  título); las versiones se piden al servidor, porque el navegador sólo
   *  guarda la última. */
  function abrir(m) {
    var A = G.MachoteAlmacen;
    cascaron(
      '<div class="hist-cab"><h3>Historial · ' + esc(m.nombre || 'Sin nombre') + '</h3>' +
      '<button class="btn fantasma" id="hs-x">Cerrar</button></div>' +
      '<p class="tiny nota">Se abre cualquier versión y se ve completa tal como estaba. ' +
      '<strong>Ver no es restaurar</strong>: la orden se confirma con la última, y ésa queda ' +
      'como definitiva contra la que se crean las analíticas.</p>' +
      '<div id="hs-carga" class="tiny nota">Pidiendo el historial al servidor…</div>');

    if (!A || !A.historial) {
      var c0 = document.getElementById('hs-carga');
      if (c0) c0.innerHTML = '<div class="aviso bad">El almacén no sabe pedir historial.</div>';
      return;
    }

    A.historial(m.id).then(function (r) {
      var carga = document.getElementById('hs-carga');
      if (!carga) return;                       // lo cerraron mientras cargaba

      if (!r || r.ok !== true) {
        /* Que no haya historial NO es un error de la pantalla y se dice sin
         * alarmar: lo normal es que un machote recién capturado, o capturado
         * sin red, todavía no haya llegado al servidor.
         *
         * Los casos se dicen SEPARADOS porque llevan a acciones distintas:
         * «no ha subido» se arregla subiéndolo, «no se pudo traer» se arregla
         * reintentando, y la sesión se arregla volviendo a entrar. Antes los
         * tres decían lo mismo y el mensaje mandaba a subir algo que ya
         * estaba subido (#140, V1.24). */
        var err = (r && r.error) || '';
        var suave = err === 'NUNCA_SUBIDO' || err === 'NO_CONSULTABLE' ||
                    err === 'SIN_RED' || err === 'SIN_SESION';
        var cola = '';
        if (err === 'NUNCA_SUBIDO') {
          cola = ' <span class="tiny">En cuanto suba, cada guardado deja aquí su versión.</span>';
        } else if (err === 'NO_CONSULTABLE') {
          cola = ' <span class="tiny">Sus versiones no se han perdido: siguen en el servidor.</span>';
        } else if (err === 'SIN_RED') {
          cola = ' <span class="tiny">Lo capturado sigue a salvo en este navegador.</span>';
        }
        carga.innerHTML = '<div class="aviso ' + (suave ? '' : 'bad') + '">' +
          esc((r && r.mensaje) || 'No se pudo leer el historial.') + cola + '</div>';
        return;
      }

      var vs = Array.isArray(r.versiones) ? r.versiones : [];
      if (!vs.length) {
        carga.innerHTML = '<div class="aviso">Este machote todavía no tiene versiones guardadas en el servidor.</div>';
        return;
      }

      carga.outerHTML =
        '<div class="hist-cols">' +
          '<div><div id="hs-lista">' + pintarLista(vs, 0) + '</div>' +
          '<p class="tiny nota">' + vs.length + ' versión(es). La orden se confirma con la ' +
          '<strong>última</strong>.</p></div>' +
          '<div><h4 id="hs-tit" style="margin:0 0 8px;font-size:14px">Versión</h4>' +
          '<div id="hs-aviso"></div><div id="hs-cuerpo"></div></div>' +
        '</div>';

      var lista = document.getElementById('hs-lista');
      lista.addEventListener('click', function (e) {
        var fila = e.target.closest ? e.target.closest('.v') : null;
        if (fila) pintarDetalle(vs, Number(fila.getAttribute('data-i')));
      });
      lista.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var fila = e.target.closest ? e.target.closest('.v') : null;
        if (fila) { e.preventDefault(); pintarDetalle(vs, Number(fila.getAttribute('data-i'))); }
      });

      pintarDetalle(vs, 0);
    });
  }

  G.MachoteHistorial = { abrir: abrir, cerrar: cerrar };
})(window);
