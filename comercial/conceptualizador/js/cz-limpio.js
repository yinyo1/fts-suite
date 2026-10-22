/* ═══ Conceptualizador · chat limpio, errores con salida y rayito por estado (V1.60, fts-conceptualizador#12) ═══
 *
 * Detrás del interruptor `chat_limpio_v160` (apagado: nadie llama a este módulo y la pantalla es la de la V1.59).
 * Auditoría y decisiones: #12 comentarios 6331184457 (paja medida en los 19 casos), 6331947656 (tabla del rayito) y
 * 6331933927 (decisiones de Esteban: todo error dice la acción concreta con el nombre del botón, y esa acción está en el rayito).
 *
 *  · PAJA: qué mensaje o tarjeta no se pinta (sigue en la base y en hilo.md; «N ocultos · mostrar todo» lo devuelve):
 *      acuse ya contestado («Recibí 1 nota de voz», «Anotado…», «Ya con todo…») · respuesta con estado superado (queda en una
 *      línea) · tarjeta descartada o ya hecha por otra · el bloque «Cotizar con referencias» fuera del borrador propuesto ·
 *      el mismo texto del motor dos veces seguidas. NUNCA se oculta el último mensaje del motor ni una tarjeta con botón vivo.
 *  · ERRORES: el catálogo código → qué hacer (para una persona, con el nombre exacto del botón) y la acción que lo resuelve.
 *      Una falla está RESUELTA cuando después de ella se hizo la acción, llegó una tarjeta más nueva para lo mismo, se guardó
 *      el machote (si la causa era del machote) o hubo otra falla más nueva de lo mismo. Nunca dos errores viejos vivos.
 *      La V1.61 (barra de estado única) usa este mismo catálogo: el texto vive aquí, una vez.
 *  · RAYITO: solo lo posible en el estado real del caso (sin orden no hay «Ya la mandé» ni «Ver cotización»; con la orden ya
 *      enviada, tampoco «Ya la mandé») y la salida del error vigente primero.
 *
 * API: CzLimpio.on() · acuseContestado(m, i, mensajes) · enviada(H) · reglaClics(L, H) · fallaVigente(H) · resuelta(f, H)
 *      · accion(codigo, H) → { texto, boton, hacer:{acc,texto?,id?}|null, quien } · letrero(H, analisisListo) · ACUSE
 */
(function (G) {
  'use strict';
  function on() { try { return typeof G.CzInterruptor === 'function' && G.CzInterruptor('chat_limpio_v160') === true; } catch (e) { return false; } }

  /* ── paja ── */
  // Los acuses de recibo del motor que no traen dato (el catálogo medido en los 19 casos: 156 de 159 ya contestados).
  // Los que sí traen dato («Llegaste al tope de hoy…», «Proyecto en <ciudad>…», «Cambié la empresa…») se quedan.
  var ACUSE = /^(Recib[ií] \d+ (nota|notas|foto|fotos|archivo|archivos|PDF|PDFs)\b[^\n]*|Anotado\.[^\n]*|Ya con todo, lo reviso completo[^\n]*)$/;
  function acuseSinDato(m) { return !!m && m.rol === 'motor' && m.autor === 'acuse' && ACUSE.test(String(m.texto || '').trim()); }
  /** ¿Es un acuse sin dato que YA tiene una respuesta del motor después? */
  function acuseContestado(m, i, M) {
    if (!acuseSinDato(m)) return false;
    for (var k = i + 1; k < M.length; k++) if (M[k].rol === 'motor' && M[k].autor !== 'acuse') return true;
    return false;
  }

  /* ── estado real ── */
  function enviada(H) {
    var c = (H && H.caso) || {};
    if (c.estado === 'enviada') return true;
    return ((H && H.acciones) || []).some(function (a) { return a.estado === 'hecha' && (a.tipo === 'enviada' || (a.tipo === 'crear_borrador' && (a.resultado || {}).estado === 'sent')); });
  }
  /** Las reglas del rayito sobre la lista de clics de CzAvance.clics(): quita lo imposible en el estado real. */
  function reglaClics(L, H) {
    var c = (H && H.caso) || {}, env = enviada(H);
    return (L || []).filter(function (x) {
      if (/^Ya la mandé/.test(x.txt || '')) return !!c.orden_id && !env;
      if (x.acc === 'ver_cot') return !!c.orden_id;
      return true;
    });
  }

  /* ── errores ── */
  var MACHOTE = ['CONFLICTO_DE_VERSION', 'SIN_CLIENTE', 'ODOO_SIN_CLIENTE', 'CLIENTE_NO_ENCONTRADO', 'CLIENTE_CAMBIO', 'PARTNER_SIN_RAZON_SOCIAL',
    'PENDIENTES_PROVEEDOR', 'MARGEN_BAJO_PISO', 'SIN_EMPRESA', 'MONEDA_INVALIDA', 'MONEDA_DISTINTA_AL_CASO', 'MACHOTE_SIN_TOTAL', 'LINEA_SIN_PRECIO', 'SIN_LINEAS_CON_PRECIO'];
  var REARMAR = 'Vuelve a armar la cotización para Odoo con la versión vigente del machote y propón el borrador otra vez.';
  /** El catálogo. `c` es el caso (para el cliente y la orden). Cada entrada: texto para la persona, nombre del botón y su efecto. */
  function accion(codigo, H) {
    var c = (H && H.caso) || {}, cli = c.cliente || 'el cliente del caso', so = c.orden_nombre || 'la orden';
    var rearmar = { texto: 'Toca «Volver a armar la cotización»: la armo con la versión vigente del machote y te dejo el botón de Odoo otra vez.', boton: 'Volver a armar la cotización', hacer: { acc: 'mandar', texto: REARMAR } };
    var reintentar = { texto: 'Toca «Reintentar». Si vuelve a fallar, avísale a Esteban con el código.', boton: 'Reintentar', hacer: { acc: 'reintentar' } };
    var X = {
      CONFLICTO_DE_VERSION: rearmar, CLIENTE_CAMBIO: rearmar, SUMA_DISCREPA: rearmar, NO_CUADRA: rearmar, SIN_COTIZACION: rearmar, SIN_HITOS: rearmar,
      HITOS_NO_SUMAN: rearmar, ANTICIPO_FALTA: rearmar, ANTICIPO_NO_CUBRE: rearmar, ANTICIPO_SIN_NOTA: rearmar, TERMINOS_INCOMPLETOS: rearmar,
      BLOQUE_SIN_TEXTO: rearmar, PRECIO_CON_CENTAVOS: rearmar, PRECIO_A_LA_BAJA: rearmar, NO_ES_POR_LOTE: rearmar, OPCIONAL_INVALIDO: rearmar,
      DISPLAY_TYPE_DESCONOCIDO: rearmar, PRODUCTOS_INCOMPLETOS: rearmar, REGLA15_CALCULOS: rearmar,
      SIN_CLIENTE: c.cliente_odoo_id ? { texto: 'Toca «Poner el cliente en el machote»: le pongo ' + cli + ' y te dejo «Actualizar el machote».', boton: 'Poner el cliente en el machote',
        hacer: { acc: 'mandar', texto: 'Ponle al machote el cliente ' + cli + ' (el del caso en Odoo) y propón actualizarlo.' } } :
        { texto: 'Abre el machote en Comercial → Machote, toca «Elegir cliente» y escoge la razón social con RFC.', boton: null, hacer: null, quien: 'Quien cotiza, en Comercial → Machote' },
      ODOO_SIN_CLIENTE: null, CLIENTE_NO_ENCONTRADO: null, PARTNER_SIN_RAZON_SOCIAL: null,
      SIN_RFC: { texto: 'A ' + cli + ' le falta el RFC en Odoo. Lo captura Contabilidad en Odoo: Contactos → ' + cli + ' → RFC. Después toca «Reintentar».', boton: 'Reintentar', hacer: { acc: 'reintentar' }, quien: 'Contabilidad, en Odoo (Contactos)' },
      REFERENCIAS_SIN_ACEPTAR: { texto: 'Revisa las referencias de la tarjeta y toca «Cotizar con referencias».', boton: 'Cotizar con referencias', hacer: { acc: 'refok' } },
      PENDIENTES_PROVEEDOR: { texto: 'Faltan precios de proveedor. Toca «Ver lo que falta» y, cuando lleguen, «Actualizar el machote».', boton: 'Ver lo que falta', hacer: { acc: 'ir', a: 'pendientes' } },
      LINEA_SIN_PRECIO: null, SIN_LINEAS_CON_PRECIO: null,
      MARGEN_BAJO_PISO: { texto: 'El margen va abajo del piso de 8 %. Solo Esteban lo autoriza, escribiéndolo en este chat; o sube el margen en el machote.', boton: null, hacer: null, quien: 'Esteban, en este chat' },
      MONEDA_DISTINTA_AL_CASO: { texto: 'El machote está en otra moneda que el caso. Toca «Actualizar el machote» para pasarlo a la moneda del caso.', boton: 'Actualizar el machote', hacer: { acc: 'mandar', texto: 'Actualiza el machote a la moneda del caso y propón guardarlo.' } },
      MONEDA_INVALIDA: null, SIN_EMPRESA: null, MACHOTE_SIN_TOTAL: null,
      YA_TIENE_ORDEN: { texto: 'Ya existe ' + so + ' para este machote. Toca «Volver a armar la cotización» y te dejo «Actualizar ' + so + ' en Odoo».', boton: 'Volver a armar la cotización', hacer: { acc: 'mandar', texto: REARMAR } },
      ORDEN_EN_CURSO: { texto: 'Alguien está creando esta cotización en este momento. Espera un minuto y toca «Reintentar».', boton: 'Reintentar', hacer: { acc: 'reintentar' } },
      ESTADO_NO_EDITABLE: { texto: so + ' ya está confirmada en Odoo: se cambia desde Odoo (Ventas → ' + so + '), no desde aquí.', boton: null, hacer: null, quien: 'Quien cotiza, en Odoo (Ventas)' },
      ORDEN_NO_ENCONTRADA: { texto: so + ' ya no está en Odoo (la borraron o la cancelaron). Toca «Volver a armar la cotización» para crear otra.', boton: 'Volver a armar la cotización', hacer: { acc: 'mandar', texto: REARMAR } },
      SIN_ORDEN: { texto: 'Todavía no hay cotización en Odoo. Toca «Volver a armar la cotización» y te dejo el botón para crearla.', boton: 'Volver a armar la cotización', hacer: { acc: 'mandar', texto: REARMAR } },
      MACHOTE_ARCHIVADO: { texto: 'El machote está archivado. Desarchívalo en Comercial → Machote (⋮ → Desarchivar) y después toca «Reintentar».', boton: 'Reintentar', hacer: { acc: 'reintentar' }, quien: 'Quien cotiza, en Comercial → Machote' },
      MACHOTE_NO_ENCONTRADO: { texto: 'No encontré el machote de este caso. Toca «Armar el machote» y te dejo el botón para crearlo otra vez.', boton: 'Armar el machote', hacer: { acc: 'mandar', texto: 'Arma el machote' } },
      SIN_MACHOTE: null,
      SIN_IMPUESTO: { texto: 'Falta el impuesto de ese lugar en Odoo. Lo da de alta Contabilidad en Odoo (Contabilidad → Configuración → Impuestos); después toca «Reintentar».', boton: 'Reintentar', hacer: { acc: 'reintentar' }, quien: 'Contabilidad, en Odoo (Impuestos)' },
      IMPUESTO_NO_EXISTE: null,
      SIN_LISTA_DE_PRECIOS: { texto: 'Falta la lista de precios de esa moneda en Odoo. La configura Esteban en Odoo (Ventas → Configuración → Listas de precios); después toca «Reintentar».', boton: 'Reintentar', hacer: { acc: 'reintentar' }, quien: 'Esteban, en Odoo (Listas de precios)' },
      PLAZO_NO_EXISTE: { texto: 'El plazo de pago no existe en Odoo. Lo da de alta Contabilidad en Odoo (Contabilidad → Configuración → Términos de pago); después toca «Reintentar».', boton: 'Reintentar', hacer: { acc: 'reintentar' }, quien: 'Contabilidad, en Odoo (Términos de pago)' },
      SECRETO_NO_CONFIGURADO: { texto: 'Es una falla de configuración del servidor, no de la cotización. Avísale a Esteban con el código; no se escribió nada en Odoo.', boton: null, hacer: null, quien: 'Esteban, en n8n' },
      MODO_INVALIDO: null, FALLO_VERIFICAR: null,
      EMISION_NO_HABILITADA: { texto: 'Tu usuario todavía no crea cotizaciones en Odoo. Esteban lo habilita en el panel (Delegación y vendedor).', boton: null, hacer: null, quien: 'Esteban, en el panel' },
      NO_ES_TUYO: { texto: 'El machote es de otra persona y tu usuario no lo puede mover. Esteban lo configura en el panel (Delegación y vendedor).', boton: null, hacer: null, quien: 'Esteban, en el panel' },
      SIN_OPORTUNIDAD: { texto: 'Falta decir de qué oportunidad es. Toca «Reintentar» y elige una del cliente o «Crear una nueva».', boton: 'Reintentar', hacer: { acc: 'reintentar' } },
      OPORTUNIDAD_NO_ES_DEL_CLIENTE: { texto: 'La oportunidad ligada es de otro cliente. Toca «Reintentar» y elige una de ' + cli + ' o «Crear una nueva».', boton: 'Reintentar', hacer: { acc: 'reintentar' } },
      SIN_VENDEDOR: { texto: 'Falta el vendedor de Odoo de quien cotiza. Esteban lo pone en el panel (Delegación y vendedor) y después tocas «Reintentar».', boton: 'Reintentar', hacer: { acc: 'reintentar' }, quien: 'Esteban, en el panel' },
      SIN_RED: { texto: 'No hubo señal con el servidor. Revisa tu conexión y toca «Reintentar».', boton: 'Reintentar', hacer: { acc: 'reintentar' } }
    };
    // Los que comparten salida con otro.
    X.ODOO_SIN_CLIENTE = X.CLIENTE_NO_ENCONTRADO = X.PARTNER_SIN_RAZON_SOCIAL = X.SIN_CLIENTE;
    X.LINEA_SIN_PRECIO = X.SIN_LINEAS_CON_PRECIO = X.PENDIENTES_PROVEEDOR;
    X.MONEDA_INVALIDA = X.SIN_EMPRESA = X.MACHOTE_SIN_TOTAL = rearmar;
    X.SIN_MACHOTE = X.MACHOTE_NO_ENCONTRADO; X.IMPUESTO_NO_EXISTE = X.SIN_IMPUESTO; X.MODO_INVALIDO = X.FALLO_VERIFICAR = X.SECRETO_NO_CONFIGURADO;
    var r = X[codigo] || reintentar;
    return { texto: r.texto, boton: r.boton || null, hacer: r.hacer || null, quien: r.quien || null, codigo: codigo };
  }
  function t(x) { return Date.parse(x || '') || 0; }
  /** ¿La falla ya quedó atrás? */
  function resuelta(f, H) {
    var A = (H && H.acciones) || [], at = t(f.at), que = f.que || 'crear_borrador';
    if (A.some(function (a) { return a.estado === 'hecha' && (a.tipo === que || (que === 'crear_borrador' && a.tipo === 'enviada')) && t(a.hecha_at) > at; })) return 'hecha';
    if (A.some(function (a) { return a.tipo === que && Number(a.id) > Number(f.accion_id || 0) && t(a.created_at) > at; })) return 'tarjeta_nueva';
    if (MACHOTE.indexOf(f.codigo) >= 0 && A.some(function (a) { return a.tipo === 'crear_machote' && a.estado === 'hecha' && t(a.hecha_at) > at; })) return 'machote';
    if (((H && H.fallas_odoo) || []).some(function (g) { return Number(g.id) > Number(f.id) && (g.que || 'crear_borrador') === que; })) return 'otra_falla';
    return null;
  }
  /** La única falla viva del caso (la más nueva sin resolver), o null. */
  function fallaVigente(H) {
    var F = ((H && H.fallas_odoo) || []).slice().sort(function (a, b) { return Number(b.id) - Number(a.id); });
    for (var i = 0; i < F.length; i++) if (!resuelta(F[i], H)) return F[i];
    return null;
  }
  /** El letrero de arriba cuando el análisis está listo: depende de la orden, no solo del análisis. */
  function letrero(H) {
    var c = (H && H.caso) || {};
    if (enviada(H)) return 'Listo para cerrar';
    if (c.orden_id || c.orden_nombre) return 'Listo para enviar al cliente';
    return 'Listo para cotizar en Odoo';
  }

  G.CzLimpio = { on: on, ACUSE: ACUSE, acuseSinDato: acuseSinDato, acuseContestado: acuseContestado, enviada: enviada, reglaClics: reglaClics,
    accion: accion, resuelta: resuelta, fallaVigente: fallaVigente, letrero: letrero, REARMAR: REARMAR };
})(window);
