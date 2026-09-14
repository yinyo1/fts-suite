// -- Code - prep ---------------------------------------------------------------
// Colapsa las N filas del motor a UN item con lo que necesita la consulta de
// notas. Sin esto el nodo Odoo de abajo correria una vez por proyecto (leccion
// de la ejecucion 97932: un nodo sin `executeOnce` detras de N filas corre N
// veces, y ahi se fue una ejecucion de 9 minutos).
const hoy = String($('Set - hoy').first().json.hoy || '').slice(0, 10);

const ids = [];
for (const it of $input.all()) {
  const j = it.json;
  if (j && j.id !== undefined) ids.push(j.id);
}

// LA VENTANA, Y POR QUE 90 Y NO 30.
// El motor usa 30 dias para las banderas de integridad, y copiar ese numero aqui
// seria el error. La nota solo se escribe cuando el estado CAMBIA, asi que un
// proyecto tranquilo puede pasar semanas sin ninguna. Medido sobre 61 dias
// habiles reales y 72 proyectos, el hueco entre notas consecutivas del MISMO
// proyecto fue: mediana 1 · p90 5 · p99 26 · MAXIMO 48 dias habiles -unas 10
// semanas-. Con una ventana corta, el proyecto tranquilo aparece como «nuevo»
// cada vez que la rebasa: ruido periodico, sin causa aparente y que ademas se ve
// exactamente igual que un cambio real. 90 dias NATURALES cubren esos 48 habiles
// con holgura.
const DIAS_VENTANA = 90;
const corte = new Date(new Date(hoy + 'T00:00:00Z').getTime() - DIAS_VENTANA * 86400000)
  .toISOString().slice(0, 19).replace('T', ' ');

return [{ json: {
  hoy: hoy,
  corte: corte,
  dias_ventana: DIAS_VENTANA,
  projIds: ids.length ? ids : [0],   // [0] y no [] : un `in []` en Odoo trae TODO
  total_filas: ids.length
} }];
