/* ═══════════════════════════════════════════════════════════════════════════
 * ARMAZÓN DE LOS PANELES · el armazón · issue #240, plataforma #237
 *
 * Lo común a todos los paneles que no es CSS: la cabecera (título, quién está
 * dentro, hora del último jalón, botón de refresh), el pie, el aviso de error,
 * la CLASIFICACIÓN de la respuesta en un solo lugar, la llamada al endpoint con
 * el token en el cuerpo, y los formateadores.
 *
 * Salió de `finanzas/rentabilidad/index.html`. Vive aquí para que el SEGUNDO
 * panel cueste poco. Lo que un panel sigue escribiendo: sus KPIs, sus filtros,
 * cómo pinta cada celda, y su vista de detalle.
 *
 * NO HACE EL GATE. El gate va inline en el `<head>` de cada panel, ANTES de
 * pintar: `SuiteAuth.requerir('<scope>', '../../shared/login.html')`. Meterlo
 * aquí obligaría a cargar este archivo antes del gate y a que el gate viniera
 * de un archivo que tarda — media pantalla pintada es media pantalla enseñada.
 *
 * NO GUARDA NADA. Ni localStorage de datos, ni snapshots. Si un panel necesita
 * recordar algo del navegador, lo declara él y se hace cargo (y entonces tiene
 * que declararlo en `INTOCABLES` al montar, ver `caducarSesion`).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (G) {
  'use strict';

  var N8N = 'https://primary-production-5c3c.up.railway.app';

  /* ── formateadores ─────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nfm(v) {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  }
  /* La raya NO es un cero. Un renglón sin línea base tiene que verse distinto
     de uno en ceros, y esta es la pieza que lo sostiene. */
  function dinero(v, mon) {
    if (v === null || v === undefined) return '<span class="raya">—</span>';
    return (mon === 'USD' ? 'US$' : '$') + nfm(v);
  }
  function pct(v, cls) {
    if (v === null || v === undefined) return '<span class="raya">—</span>';
    if (cls === 'info') return '<span class="pct-info">' + v.toFixed(0) + '%</span>';
    var c = v >= 100 ? 'pct-bad' : (v >= 70 ? 'pct-warn' : '');
    return c ? ('<span class="' + c + '">' + v.toFixed(0) + '%</span>') : (v.toFixed(0) + '%');
  }

  /* ── UN SOLO LUGAR clasifica la respuesta ──────────────────────────────
   * `sesion` (vuelve a entrar) · `red` (espera) · `servidor` (avisa) son tres
   * cosas distintas que llevan a tres acciones distintas. Si la aplicación las
   * junta en un mensaje solo, elige el peor de los tres por omisión — y eso ya
   * costó una sesión con la consola abierta (CLAUDE.md §20 #12b).
   *
   * Está en el armazón justamente porque «un solo lugar» no aguanta una copia
   * por panel: el panel nuevo copia el mensaje y se olvida de la clase. */
  var DE_SESION = {
    TOKEN_AUSENTE: 1, TOKEN_MALFORMADO: 1, TOKEN_EXPIRADO: 1, FIRMA_INVALIDA: 1,
    PAYLOAD_ILEGIBLE: 1, SCOPE_INSUFICIENTE: 1, FALLO_VERIFICACION: 1
  };
  function clasificar(r) {
    if (!r) return 'red';
    if (r.ok === true) return 'ok';
    if (r._red) return 'red';
    if (r.clase) return r.clase;              // el servidor ya la dice
    if (DE_SESION[r.error]) return 'sesion';
    return 'servidor';
  }

  /* Ante `sesion` se borra SÓLO la llave de sesión. Ninguna otra.
     Cinturón: si algún día la llave de sesión se renombra y coincide con una de
     datos, esto NO borra nada y lo dice. Mismo patrón que MachoteSesion. */
  function caducarSesion(intocables) {
    var llave = (G.SuiteAuth && G.SuiteAuth.LLAVE_SESION) || 'fts_suite_session';
    var lista = intocables || [];
    if (lista.indexOf(llave) >= 0) {
      try { console.error('[sesion] la llave de sesión está declarada como llave de datos: no se borra nada'); } catch (e) {}
      return;
    }
    try { G.SuiteAuth.logout(); } catch (e) {}
  }

  /* ── el panel montado ──────────────────────────────────────────────────── */
  function montar(op) {
    op = op || {};
    var ruta = op.ruta;                        // p.ej. '/webhook/fin/rentabilidad'
    var intocables = op.intocables || [];      // llaves de datos que NUNCA se borran
    var idAviso = op.aviso || 'aviso';
    var urlLogin = op.login || '../../shared/login.html';

    /* Cabecera. Quién está dentro se saca de la sesión, no de un campo que el
       panel tenga que pasar: es el mismo dato para todos los paneles. */
    var ses = (G.SuiteAuth && G.SuiteAuth.getSession()) || null;
    var quien = ses ? (ses.nombre || ses.actor) : null;
    var hd = document.querySelector('header .hd') || document.querySelector('header');
    if (hd) {
      hd.innerHTML =
        '<div><h1>' + esc(op.titulo || '') + '</h1>' +
        '<div class="sub">' + esc(op.sub || '') + '</div></div>' +
        '<div class="spacer"></div>' +
        (quien ? ('<span class="quien" title="' + esc(ses.actor || '') + '">dentro como <b>' + esc(quien) + '</b></span>') : '') +
        '<span class="jalon" id="p-jalon">sin jalar todavía</span>' +
        '<button class="pri" id="p-refresh">Actualizar</button>' +
        (op.volver ? ('<a class="volver-suite" href="' + esc(op.volver.href) + '">' + esc(op.volver.txt) + '</a>') : '');
    }

    var pie = document.querySelector('footer');
    if (pie && op.pie) pie.innerHTML = op.pie;

    var api = {
      N8N: N8N,
      esc: esc, nfm: nfm, dinero: dinero, pct: pct, clasificar: clasificar,

      /** El botón de refresh. MANUAL, nunca automático: quien mira la pantalla
       *  tiene que saber de cuándo es el número, y un refresco solo le cambia
       *  el piso a media lectura. */
      alRefrescar: function (fn) {
        var b = document.getElementById('p-refresh');
        if (b) b.onclick = fn;
        return api;
      },
      /** Marca la hora del jalón. Se llama al TERMINAR bien, no al empezar. */
      jalado: function (cuando) {
        var t = cuando || new Date();
        var el = document.getElementById('p-jalon');
        if (el) el.textContent = 'último jalón: ' +
          t.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return api;
      },
      ocupado: function (si, texto) {
        var b = document.getElementById('p-refresh');
        if (!b) return api;
        b.disabled = !!si;
        b.textContent = si ? (texto || 'Jalando…') : 'Actualizar';
        return api;
      },

      /** Llama al endpoint del panel. El token viaja en el CUERPO, no en un
       *  header Authorization: un header fuerza preflight CORS que el webhook
       *  de n8n puede no contestar (patrón validado en Finanzas, §15 #5). */
      pedir: async function (cuerpo) {
        var token = G.SuiteAuth && G.SuiteAuth.getToken();
        if (!token) return { ok: false, error: 'TOKEN_AUSENTE', clase: 'sesion' };
        var res, data;
        try {
          res = await fetch(N8N + ruta, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ token: token }, cuerpo || {}))
          });
        } catch (e) {
          return { ok: false, _red: true, error: 'SIN_RED', detalle: String(e && e.message || e) };
        }
        /* 404 con cuerpo de n8n = el webhook NO está registrado, o sea que el
           workflow no está publicado. Es un caso propio y accionable: no es «el
           servidor está mal», es «falta un clic». */
        if (res.status === 404) return { ok: false, error: 'ENDPOINT_NO_PUBLICADO', clase: 'servidor' };
        try { data = await res.json(); } catch (e) {
          return { ok: false, error: 'RESPUESTA_ILEGIBLE', clase: 'servidor', detalle: 'HTTP ' + res.status };
        }
        return data || { ok: false, error: 'RESPUESTA_VACIA', clase: 'servidor' };
      },

      aviso: function (clase, titulo, cuerpo, detalle, conBoton) {
        Array.prototype.forEach.call(document.querySelectorAll('.vista'), function (v) {
          v.classList.remove('on');
        });
        var caja = document.getElementById(idAviso);
        if (!caja) return api;
        caja.innerHTML =
          '<div class="aviso ' + clase + '"><h3>' + esc(titulo) + '</h3><p>' + cuerpo + '</p>' +
          (detalle ? ('<p class="mono">' + esc(detalle) + '</p>') : '') +
          (conBoton ? '<button class="pri" id="p-avBtn">' + esc(conBoton.txt) + '</button>' : '') + '</div>';
        if (conBoton) { var b = document.getElementById('p-avBtn'); if (b) b.onclick = conBoton.fn; }
        return api;
      },
      limpiarAviso: function () {
        var caja = document.getElementById(idAviso);
        if (caja) caja.innerHTML = '';
        return api;
      },

      /** El camino de error completo, para no repetirlo en cada panel. Recibe la
       *  respuesta ya clasificada como NO-ok y la pinta según la clase; `reintentar`
       *  es la función que vuelve a jalar. `scope` y `endpoint` sólo enriquecen el
       *  texto: si no se pasan, el aviso sigue siendo correcto, nomás más genérico. */
      avisarFallo: function (r, reintentar, extra) {
        extra = extra || {};
        var clase = clasificar(r);
        if (clase === 'sesion') {
          caducarSesion(intocables);
          return api.aviso('sesion', 'Tu sesión ya no vale',
            r.error === 'SCOPE_INSUFICIENTE'
              ? ('Entraste bien, pero tu cuenta no carga el permiso <b>' + esc(extra.scope || '') +
                 '</b>, que es el que pide este panel. Pídeselo a Esteban.')
              : 'El servidor contestó que la credencial no vale. Volver a intentar con la misma no sirve: hay que entrar de nuevo.',
            r.error, { txt: 'Volver a entrar', fn: function () { location.href = urlLogin; } });
        }
        if (clase === 'red') {
          return api.aviso('red', 'No hubo respuesta del servidor',
            'No es tu sesión. Puede ser la red o el servidor caído. Espera un momento y vuelve a intentar.',
            r.detalle || r.error, { txt: 'Reintentar', fn: reintentar });
        }
        if (r.error === 'ENDPOINT_NO_PUBLICADO') {
          return api.aviso('servidor', 'El endpoint todavía no está publicado',
            'El panel está completo, pero el workflow <b>' + esc(extra.workflow || ruta) +
            '</b> sigue sin publicar en n8n, así que no hay de dónde traer los datos. ' +
            'Esta pantalla <b>no rellena con ejemplos</b>: prefiere decirlo.',
            'POST ' + ruta + ' → HTTP 404' + (extra.workflowId ? (' · workflow ' + extra.workflowId) : ''),
            { txt: 'Reintentar', fn: reintentar });
        }
        return api.aviso('servidor', 'El servidor contestó con un error suyo',
          'No es tu sesión y no es la red: el problema está del otro lado. Avísale a Esteban con el código de abajo.',
          (r.error || '') + (r.detalle ? (' · ' + r.detalle) : '') + (r.mensaje ? (' · ' + r.mensaje) : ''),
          { txt: 'Reintentar', fn: reintentar });
      },

      /** Cambia de vista entre las `<section class="vista">` del panel. */
      vista: function (id) {
        Array.prototype.forEach.call(document.querySelectorAll('.vista'), function (v) {
          v.classList.toggle('on', v.id === id);
        });
        window.scrollTo(0, 0);
        return api;
      },

      /** Una tarjeta de KPI. `filtro` la vuelve clicable y deja el valor en un
       *  `data-filtro` que el panel lee: el armazón no decide qué filtra. */
      kpi: function (cl, n, l, n2, filtro) {
        return '<div class="kpi ' + cl + (filtro ? ' clic' : '') + '"' +
               (filtro ? (' data-filtro="' + esc(filtro) + '"') : '') +
               '><div class="n">' + esc(n) + '</div><div class="l">' + esc(l) +
               '</div><div class="n2">' + esc(n2 || '') + '</div></div>';
      }
    };
    return api;
  }

  /* Se MEZCLA en vez de asignar: `panel-tabla.js` cuelga de este mismo objeto y
     no se puede depender de qué archivo llega primero. Asignar de golpe borraría
     lo que el otro ya puso, y el síntoma sería una tabla que no pinta. */
  G.Panel = G.Panel || {};
  G.Panel.montar = montar; G.Panel.esc = esc; G.Panel.nfm = nfm;
  G.Panel.dinero = dinero; G.Panel.pct = pct;
  G.Panel.clasificar = clasificar; G.Panel.N8N = N8N;
})(window);
