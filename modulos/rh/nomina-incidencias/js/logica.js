// ═══ Nómina · Incidencias — lógica de la semana ═══
//
// Funciones PURAS sobre el estado de la semana: el candado aritmético, los bloqueos
// que apagan el botón de enviar, y las derivaciones (rubro ← puesto, empresa/moneda
// ← fuente). Sin DOM, sin red, sin `window`.
//
// POR QUÉ SEPARADO DE LA PANTALLA. Es la parte que decide si una semana se puede
// mandar o no, o sea la que mueve dinero. Si vive dentro del render, la única forma
// de probarla es montar un navegador; aquí se prueba con `node tests/gate-nomina.js`
// en milisegundos, y el gate puede ser exhaustivo sin volverse lento.

(function (root, factory) {
  var Cat = (typeof module === 'object' && module.exports)
    ? require('./catalogo.js')
    : root.NomCatalogo;
  var api = factory(Cat);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NomLogica = api;
})(typeof window !== 'undefined' ? window : null, function (Cat) {
  'use strict';

  // ─── Candado aritmético ───
  // Los días de la semana tienen que repartirse completos: lo trabajado en México
  // más lo de USA más vacaciones más ausencias. Ni uno de más ni uno de menos.
  //
  // El pago se calcula sobre este reparto, así que un día que no cuadra es un día
  // que alguien va a cobrar mal o no va a cobrar. Por eso es candado y no aviso.
  function contarDias(persona, semana) {
    var r = { mexico: Number(persona.dias_mexico) || 0, usa: 0, vac: 0, falta: 0 };
    var L = persona.declaraciones || [];
    for (var i = 0; i < L.length; i++) {
      var mm = Cat.meta(L[i].tipo);
      if (!mm || !mm.def.cuenta) continue;
      r[mm.def.cuenta === 'usa' ? 'usa' : mm.def.cuenta] += Number(L[i].valores.dias) || 0;
    }
    r.total = r.mexico + r.usa + r.vac + r.falta;
    r.esperado = semana.dias;
    r.cuadra = (r.total === semana.dias);
    return r;
  }

  // ─── Qué impide enviar ───
  // Cada bloqueo dice QUÉ falta y DE QUIÉN. Un banner que solo dijera "hay pendientes"
  // obligaría a abrir 30 fichas para encontrarlos; el motivo exacto es el producto.
  //
  // Regla de las personas inactivas: si no se les declaró nada, no bloquean — están
  // fuera de la nómina de la semana. Pero si tienen algo declarado (un finiquito, un
  // saldo que se compensa), se les exige lo mismo que a cualquiera SALVO el candado
  // de días, porque no trabajaron la semana.
  function bloqueos(persona, semana, disputas) {
    var p = [];
    var L = persona.declaraciones || [];
    var inactivo = !!persona.inactivo;

    if (inactivo && !L.length) return p;

    if (!inactivo) {
      var c = contarDias(persona, semana);
      if (!c.cuadra) {
        p.push({
          clase: 'dias',
          texto: 'Los días no suman ' + semana.dias + ': van ' + c.total
        });
      }
    }

    for (var i = 0; i < L.length; i++) {
      var d = L[i], mm = Cat.meta(d.tipo);
      if (!mm) { p.push({ clase: 'tipo', texto: 'Tipo desconocido: ' + d.tipo }); continue; }

      if (mm.def.multi) {
        var R = (d.valores && d.valores.renglones) || [];
        if (!R.length) p.push({ clase: 'bono', texto: mm.def.label + ' sin ningún renglón' });
        for (var k = 0; k < R.length; k++) {
          if (!(Number(R[k].monto) > 0)) p.push({ clase: 'bono', texto: 'Renglón de ' + mm.def.label.toLowerCase() + ' sin monto' });
          if (!R[k].so) p.push({ clase: 'bono', texto: mm.def.label + ' de $' + moneda(R[k].monto) + ' sin proyecto asignado' });
        }
      } else {
        var faltantes = camposFaltantes(mm.def, d.valores);
        for (var q = 0; q < faltantes.length; q++) {
          p.push({ clase: 'campo', texto: mm.def.label + ' sin ' + faltantes[q].toLowerCase() });
        }
      }

      if (mm.def.fuente && !d.fuente) {
        p.push({ clase: 'fuente', texto: mm.def.label + ' sin fuente de pago' });
      }
    }

    var D = disputas || [];
    for (var j = 0; j < D.length; j++) {
      if (D[j].empleado_id === persona.id && D[j].abierta) {
        p.push({ clase: 'disputa', texto: 'Checada en disputa del ' + D[j].fecha, disputa_id: D[j].id });
      }
    }
    return p;
  }

  // Campos obligatorios vacíos. Los booleanos NO se exigen: "no" es una respuesta.
  function camposFaltantes(def, valores) {
    var out = [], v = valores || {};
    var C = def.campos || [];
    for (var i = 0; i < C.length; i++) {
      var nombre = C[i][0], etiqueta = C[i][1], tipo = C[i][2];
      if (tipo === 'bool') continue;
      var val = v[nombre];
      if (tipo === 'num') { if (!(Number(val) > 0)) out.push(etiqueta); }
      else if (val === undefined || val === null || String(val).trim() === '') out.push(etiqueta);
    }
    return out;
  }

  // ─── Derivación de la fuente de pago ───
  function derivarFuente(clave) {
    var j = Cat.JOURNALS[clave];
    if (!j) return null;
    return { clave: clave, nombre: j.nombre, empresa: j.empresa, moneda: j.moneda };
  }

  // ─── Resumen de toda la semana ───
  function resumenSemana(personas, semana, disputas) {
    var r = {
      personas: personas.length,
      con_bloqueo: 0,
      bloqueos_totales: 0,
      con_declaracion: 0,
      disputas_abiertas: 0,
      detalle: [],
      lista_para_enviar: false
    };
    for (var i = 0; i < personas.length; i++) {
      var per = personas[i];
      var b = bloqueos(per, semana, disputas);
      var decls = (per.declaraciones || []).length;
      if (decls) r.con_declaracion++;
      if (b.length) { r.con_bloqueo++; r.bloqueos_totales += b.length; r.detalle.push({ persona: per, bloqueos: b }); }
    }
    var D = disputas || [];
    for (var j = 0; j < D.length; j++) if (D[j].abierta) r.disputas_abiertas++;
    r.lista_para_enviar = (r.bloqueos_totales === 0);
    return r;
  }

  // ─── Totales de dinero, partidos por lo que el despacho necesita separado ───
  // Los tres cubos NO son cosmética: días y bonos se pagan por vías distintas, y el
  // anticipo no es costo (es un préstamo, #134). Sumarlos daría un número que nadie
  // puede usar para nada.
  function totalesDinero(personas) {
    var t = { percepciones: 0, descuentos: 0, no_costo: 0, por_moneda: {}, por_fuente: {} };
    for (var i = 0; i < personas.length; i++) {
      var L = personas[i].declaraciones || [];
      for (var k = 0; k < L.length; k++) {
        var d = L[k], mm = Cat.meta(d.tipo);
        if (!mm) continue;
        var monto = 0;
        if (mm.def.multi) {
          var R = (d.valores && d.valores.renglones) || [];
          for (var q = 0; q < R.length; q++) monto += Number(R[q].monto) || 0;
        } else {
          monto = Number(d.valores && d.valores.monto) || 0;
        }
        if (!monto) continue;

        if (mm.def.no_costo) t.no_costo += monto;
        else if (mm.grupo === 'desc') t.descuentos += monto;
        else if (mm.grupo === 'dinero') t.percepciones += monto;

        var f = derivarFuente(d.fuente);
        var mon = f ? f.moneda : 'sin fuente';
        t.por_moneda[mon] = (t.por_moneda[mon] || 0) + monto;
        var cf = d.fuente || 'sin fuente';
        t.por_fuente[cf] = (t.por_fuente[cf] || 0) + monto;
      }
    }
    return t;
  }

  // ─── Estados vigentes en una fecha ───
  // Un estado sin `hasta` sigue vigente. Es lo que hace que un standby de hace cinco
  // semanas siga apareciendo sin que nadie lo vuelva a capturar.
  function estadosVigentes(persona, fechaISO) {
    var out = [], E = persona.estados || [];
    for (var i = 0; i < E.length; i++) {
      var e = E[i], desde = e.valores && e.valores.desde, hasta = e.valores && e.valores.hasta;
      if (desde && desde > fechaISO) continue;
      if (hasta && hasta < fechaISO) continue;
      out.push(e);
    }
    return out;
  }

  function moneda(n) {
    n = Number(n) || 0;
    return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return {
    contarDias: contarDias,
    bloqueos: bloqueos,
    camposFaltantes: camposFaltantes,
    derivarFuente: derivarFuente,
    resumenSemana: resumenSemana,
    totalesDinero: totalesDinero,
    estadosVigentes: estadosVigentes,
    moneda: moneda
  };
});
