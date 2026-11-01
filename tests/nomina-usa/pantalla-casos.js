// Casos de captura de tests/nomina-usa/pantalla.js. Cada fase agrega los suyos.
module.exports = [
  { rol: 'esteban', tab: 'ficha', espera: { nombre: 'banderas visibles y apagadas', fn: () => /APAGADO/.test(document.body.innerText) && /SOMBRA/.test(document.body.innerText) } },
  { rol: 'magaly', tab: 'ficha', espera: { nombre: 'Magaly ve fichas sin poder guardar', fn: () => !document.querySelector('form.nu-ficha button[type=submit]') && document.querySelectorAll('form.nu-ficha').length === 4 } }
];
