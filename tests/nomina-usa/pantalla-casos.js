// Casos de captura de tests/nomina-usa/pantalla.js. Cada fase agrega los suyos.
module.exports = [
  { rol: 'esteban', tab: 'ficha', espera: { nombre: 'banderas visibles y apagadas', fn: () => /APAGADO/.test(document.body.innerText) && /SOMBRA/.test(document.body.innerText) } },
  { rol: 'magaly', tab: 'ficha', espera: { nombre: 'Magaly ve fichas sin poder guardar', fn: () => !document.querySelector('form.nu-ficha button[type=submit]') && document.querySelectorAll('form.nu-ficha').length === 4 } },
  { rol: 'magaly', tab: 'alertas', espera: { nombre: 'bandeja en sombra con las incidencias de octubre de Ricardo', fn: () => /modo sombra/.test(document.body.innerText) && /Salida sin cerrar/.test(document.body.innerText) && /Día sin checada/.test(document.body.innerText) } },
  { rol: 'magaly', tab: 'alertas', nombre: 'disputa', accion: async () => { window.prompt = () => 'La persona dice que sí checó'; document.querySelector('[data-marca$="|en_disputa"]').click(); await new Promise(r => setTimeout(r, 200)); },
    espera: { nombre: 'marcar en disputa la deja en disputa', fn: () => document.querySelectorAll('.chip.e-vencido').length === 1 } },
  { rol: 'erick', tab: 'alertas', espera: { nombre: 'Erick ve la bandeja sin botones de RH', fn: () => !document.querySelector('[data-marca]') && /Alertas e incidencias/.test(document.body.innerText) } },
  { rol: 'esteban', tab: 'bolsas', espera: { nombre: 'SO11842 con disponible 960 y 2,160; SO11791 marcada sin bolsa', fn: () => /\$960\.00/.test(document.body.innerText) && /\$2,160\.00/.test(document.body.innerText) && /Sin bolsa: SO11791/.test(document.body.innerText) } },
  { rol: 'esteban', tab: 'bolsas', nombre: 'provisional', accion: async () => { const f = document.getElementById('nu-prov'); f.so.value = '11791'; f.folio.value = 'EDC-2026-11-01'; f.supervisor.value = '2000'; f.tecnicos.value = '6000'; f.requestSubmit(); await new Promise(r => setTimeout(r, 250)); },
    espera: { nombre: 'Esteban captura la provisional y SO11791 deja de estar sin bolsa', fn: () => !/Sin bolsa/.test(document.body.innerText) && /provisional · folio EDC-2026-11-01/.test(document.body.innerText) } },
  { rol: 'richard', tab: 'bolsas', espera: { nombre: 'Richard ve bolsas sin poder capturar', fn: () => !document.getElementById('nu-prov') } }
];
