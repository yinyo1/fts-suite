// ═══ Nómina · Incidencias — pantalla 0: cuál semana ═══
//
// POR QUÉ EXISTE ESTA PANTALLA. El módulo abría directo en una semana, y esa semana
// era la que contiene HOY. Como la nómina corre VIE→JUE, un viernes eso es una
// semana de un día: el 4-sep-2026 abría en S37 —recién empezada— mientras S36 tenía
// las cinco jornadas de 28 personas y siete capturas a medias esperando. Y no había
// forma de llegar a otra semana ni de ver cuáles ya se habían mandado.
//
// La pantalla NO calcula nada: el calendario, cuál semana toca y qué se envió salen
// del server (nom/semanas). Aquí solo se pinta. Si esta pantalla derivara sus propias
// fechas habría dos calendarios y ganaría el que se leyera primero (CLAUDE.md §20.4).

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
               'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // 'YYYY-MM-DD' -> '28 ago'. Se parte la cadena a mano en vez de usar Date: un
  // 'new Date("2026-08-28")' se lee como medianoche UTC y en Monterrey se pinta como
  // el 27 (hallazgo #1 de CLAUDE.md §11). Aquí no hay hora que convertir — es una
  // fecha de calendario— así que meterla a Date solo agrega una forma de equivocarse.
  function dia(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return String(iso || '—');
    var m = parseInt(p[1], 10) - 1;
    return parseInt(p[2], 10) + ' ' + (MESES[m] || p[1]);
  }
  function rango(w) {
    return dia(w.desde) + ' – ' + dia(w.hasta);
  }

  // Los datetimes SÍ llevan hora y sí vienen en UTC: se convierten a CST al pintar.
  function fechaHoraCst(iso) {
    if (!iso) return '—';
    var ms = Date.parse(iso);
    if (isNaN(ms)) return String(iso);
    var d = new Date(ms - 6 * 3600000);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + ' ' +
           p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' CST';
  }

  function enviada(w) { return w.estado === 'enviada' && Number(w.version) > 0; }

  // La línea de en medio: qué se sabe de esta semana, en una frase.
  function resumen(w) {
    var partes = [];
    if (enviada(w)) {
      partes.push('Enviada el <b>' + esc(fechaHoraCst(w.enviado_en)) + '</b>' +
                  (w.actor ? ' por ' + esc(w.actor) : '') +
                  (Number(w.version) > 1 ? ' · versión ' + Number(w.version) : ''));
      if (w.motivo) partes.push('Última corrección: ' + esc(w.motivo));
    } else if (w.personas_capturadas > 0) {
      partes.push('<span class="cap">' + w.personas_capturadas +
                  (w.personas_capturadas === 1 ? ' persona capturada' : ' personas capturadas') +
                  '</span>, sin enviar');
    } else if (w.en_curso) {
      partes.push('Apenas va empezando. Se cierra el ' + dia(w.hasta) + '.');
    } else {
      partes.push('Sin capturar nada todavía');
    }
    // Un "ya se mandó" con capturas posteriores es el único caso en que hay que
    // volver a entrar sí o sí. Se dice con número: "hubo cambios" no mueve a nadie.
    if (enviada(w) && w.cambios_despues > 0) {
      partes.push('<b>' + w.cambios_despues +
                  (w.cambios_despues === 1 ? ' persona cambió' : ' personas cambiaron') +
                  ' después del envío</b>');
    }
    return partes.join(' · ');
  }

  function etiquetas(w, sugerida) {
    var h = '';
    if (w.id === sugerida) h += '<span class="eti sugeti">LA QUE TOCA</span>';
    if (w.en_curso) h += '<span class="eti cur">EN CURSO</span>';
    if (enviada(w)) h += '<span class="eti env">ENVIADA v' + Number(w.version) + '</span>';
    else h += '<span class="eti bor">SIN ENVIAR</span>';
    if (enviada(w) && w.cambios_despues > 0) h += '<span class="eti ojo">CAMBIÓ DESPUÉS</span>';
    return h;
  }

  // `alElegir` recibe el objeto completo de la semana, no solo el id: quien la abre
  // necesita el rango para comprobar que el server le devolvió las mismas fechas.
  function pintar(datos, alElegir) {
    var semanas = (datos && datos.semanas) || [];
    var sugerida = datos && datos.sugerida;

    $('indice-hoy').textContent = 'Hoy es ' + dia(datos.hoy) + '. ' +
      (sugerida ? 'La que toca cerrar es la ' + sugerida + '.' : '');

    // El aviso explica el default UNA vez, arriba, en vez de repetirlo por renglón:
    // sin él, "por qué no abre en la semana de hoy" es una pregunta que se hace cada
    // viernes y que nadie tiene dónde contestarse.
    $('indice-aviso').innerHTML =
      '<div class="banner"><span class="ico">📅</span><div>' +
      '<h3>La semana de nómina va de viernes a jueves</h3>' +
      '<div style="font-size:13px;line-height:1.6">Por eso la que toca capturar y enviar ' +
      'no es la que empieza hoy, sino la que <b>acaba de cerrar</b>. La semana en curso ' +
      'se puede abrir para ir viendo cómo va, pero todavía le faltan días.</div></div></div>';

    var h = '<div class="sem-lista">';
    for (var i = 0; i < semanas.length; i++) {
      var w = semanas[i];
      var clases = 'sem' + (w.id === sugerida ? ' sug' : '') + (w.en_curso ? ' curso' : '');
      h += '<button class="' + clases + '" data-sem="' + esc(w.id) + '">' +
             '<span class="idm"><b>' + esc(w.id) + '</b>' +
               '<span class="f">' + esc(rango(w)) + '</span></span>' +
             '<span class="med">' + resumen(w) + '</span>' +
             '<span class="etis">' + etiquetas(w, sugerida) + '</span>' +
           '</button>';
    }
    h += '</div>';
    if (!semanas.length) {
      h = '<div class="banner bad"><span class="ico">⛔</span><div>' +
          '<h3>No hay semanas que mostrar</h3><div style="font-size:13px">' +
          'El servidor no devolvió ninguna. Avísale a Esteban.</div></div></div>';
    }
    $('indice-lista').innerHTML = h;

    var bs = $('indice-lista').querySelectorAll('[data-sem]');
    for (var k = 0; k < bs.length; k++) {
      bs[k].addEventListener('click', function (ev) {
        var id = ev.currentTarget.getAttribute('data-sem');
        for (var j = 0; j < semanas.length; j++) {
          if (semanas[j].id === id) { alElegir(semanas[j]); return; }
        }
      });
    }
    return semanas.length;
  }

  // El seguro contra que los dos calendarios se separen. nom/semanas y nom/semana
  // tienen cada uno su copia del ancla (son workflows distintos y n8n no comparte
  // código). Si algún día alguien mueve una y no la otra, esto lo grita en vez de
  // dejar que RH capture cinco días contra las fechas equivocadas.
  function mismasFechas(elegida, cargada) {
    if (!elegida || !cargada) return true;
    return elegida.desde === cargada.desde && elegida.hasta === cargada.hasta;
  }

  window.NomIndice = {
    pintar: pintar,
    mismasFechas: mismasFechas,
    dia: dia,
    rango: rango
  };
})();
