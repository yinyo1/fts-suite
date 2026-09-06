/* ═══ Machote · el respaldo ═══
 *
 * V1.17 · issue #213. Mientras el almacén sea el navegador, esto es lo único
 * que impide que lo capturado se pierda sin aviso.
 *
 * Tres gestos, y cada uno existe por una razón distinta:
 *   - **Exportar**  baja un archivo. Es el rescate de lo ya capturado y la red
 *     de seguridad permanente: sirve igual cuando exista Postgres.
 *   - **Importar**  vuelve a meter ese archivo. FUSIONA, nunca reemplaza.
 *   - **Subir**     mandaría el archivo solo, sin elegirlo a mano. NO SE
 *     CONSTRUYÓ: la credencial de Microsoft Graph de n8n no tiene permiso de
 *     SharePoint (403 accessDenied, verificado 2026-09-06). Ver #213.
 *
 * ── La regla que gobierna importar ───────────────────────────────────────
 * **Importar no puede destruir.** Ni un machote, ni un renglón, ni un campo.
 * Si un `id` ya existe, el entrante NO lo pisa: entra al lado como copia
 * marcada y alguien decide después. Un importador que reemplaza convierte un
 * respaldo en un arma: basta equivocarse de archivo para perder el trabajo del
 * día, y quien lo aprieta cree que está protegiéndose.
 *
 * En el peor caso quedan dos machotes y sobra uno. Eso se arregla; lo otro no.
 */
(function (G) {
  'use strict';

  var A = G.MachoteAlmacen;

  function dosDig(n) { return (n < 10 ? '0' : '') + n; }

  /** `machotes-montalvo-20260906-1432.json` — persona y momento en el nombre,
   *  para que dos exportaciones del mismo día no se confundan al juntarlas. */
  function nombreArchivo(sesion) {
    var d = new Date();
    var quien = (sesion && sesion.actor) ? String(sesion.actor).replace(/[^a-z0-9._-]/gi, '') : 'sin-usuario';
    return 'machotes-' + quien + '-' +
      d.getFullYear() + dosDig(d.getMonth() + 1) + dosDig(d.getDate()) + '-' +
      dosDig(d.getHours()) + dosDig(d.getMinutes()) + '.json';
  }

  /** Descarga el respaldo. Devuelve `{ok, nombre, machotes, bytes}` o `{ok:false}`.
   *
   *  El `revokeObjectURL` no es cosmético: sin él el blob se queda en memoria
   *  toda la sesión, y aquí puede pesar cientos de KB. */
  function exportar(sesion) {
    if (!A) return { ok: false, error: 'SIN_ALMACEN' };
    var s = A.sobre(sesion);
    var txt = JSON.stringify(s, null, 2);
    var nombre = nombreArchivo(sesion);
    try {
      var blob = new Blob([txt], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
    return { ok: true, nombre: nombre,
             machotes: (s.datos.machotes || []).length,
             bytes: txt.length };
  }

  /** Fusiona `entrantes` sobre `actuales` SIN pisar.
   *
   *  Devuelve `{lista, nuevos, copias}`. `lista` es nueva; no se muta la que
   *  entró, para que quien llama decida si la adopta.
   *
   *  El id de la copia lleva sufijo estable dentro de la misma importación
   *  (`-imp<algo>-1`, `-2`…) en vez de `Date.now()` por renglón: importar
   *  cincuenta en el mismo milisegundo generaría ids repetidos, que es
   *  exactamente el problema que se está evitando. */
  function fusionar(actuales, entrantes, sello) {
    var lista = (actuales || []).slice();
    var vivos = {}, i;
    for (i = 0; i < lista.length; i++) vivos[lista[i].id] = true;

    var marca = sello || ('imp' + Date.now().toString(36).slice(-4));
    var nuevos = 0, copias = 0;

    for (i = 0; i < (entrantes || []).length; i++) {
      var m = entrantes[i];
      if (!m || !m.id) continue;                    // sin id no se puede fusionar
      if (!vivos[m.id]) { lista.push(m); vivos[m.id] = true; nuevos++; continue; }

      // Ya existe: entra AL LADO, marcado, sin tocar al que estaba.
      var c = JSON.parse(JSON.stringify(m));
      copias++;
      c._copia_de = m.id;
      c._importado_at = new Date().toISOString();
      var base = m.id + '-' + marca + '-' + copias, k = 0;
      while (vivos[base]) { k++; base = m.id + '-' + marca + '-' + copias + '.' + k; }
      c.id = base;
      c.nombre = (c.nombre || 'Sin nombre') + ' (importado)';
      lista.push(c); vivos[c.id] = true;
    }
    return { lista: lista, nuevos: nuevos, copias: copias };
  }

  /** Lee el texto de un archivo y lo fusiona. Nunca lanza: devuelve el porqué.
   *
   *  Si el archivo no se entiende, **no se toca nada**. Un importador que
   *  aplica la mitad de un archivo roto deja un estado que nadie pidió. */
  function importarTexto(txt, actuales) {
    var obj;
    try { obj = JSON.parse(txt); }
    catch (e) { return { ok: false, error: 'Ese archivo no es un JSON válido.' }; }

    var entrantes = A ? A.machotesDe(obj) : null;
    if (!entrantes) {
      return { ok: false, error: 'El archivo no trae una lista de machotes. ' +
               '¿Es el .json que bajó "Exportar todo"?' };
    }
    var r = fusionar(actuales, entrantes);
    return { ok: true, lista: r.lista, nuevos: r.nuevos, copias: r.copias,
             total: entrantes.length,
             de: obj.exportado_por_nombre || obj.exportado_por || '' };
  }

  G.MachoteRespaldo = {
    exportar: exportar,
    fusionar: fusionar,
    importarTexto: importarTexto,
    nombreArchivo: nombreArchivo
  };
})(window);
