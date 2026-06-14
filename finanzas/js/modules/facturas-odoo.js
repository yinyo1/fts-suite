// ═══ FTS Suite · Finanzas — módulo Facturas Odoo (B4) ═══
// Emitidas: account.move move_type ∈ {out_invoice, out_refund}. Webhook /fin/facturas-odoo.
// Config delgada sobre FinFacturas (núcleo compartido). Se auto-registra en FinRouter.

(function () {
  'use strict';
  if (!window.FinRouter || !window.FinFacturas) return;

  window.FinRouter.register('facturas-odoo', {
    render: function (container) {
      window.FinFacturas.createView({
        moduleId: 'facturas-odoo',
        endpoint: '/fin/facturas-odoo',
        title: 'Facturas Odoo',
        subtitle: 'Emitidas · out_invoice + out_refund',
        partnerLabel: 'Cliente',
        mockPath: 'data/mock/facturas-odoo.mock.json',
        columns: window.FinFacturas.defaultColumns('Cliente')
      }).mount(container);
    }
  });
})();
