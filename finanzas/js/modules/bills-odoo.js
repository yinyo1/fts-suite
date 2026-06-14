// ═══ FTS Suite · Finanzas — módulo Bills Odoo (B4) ═══
// Recibidas: account.move move_type ∈ {in_invoice, in_refund}. Webhook /fin/bills-odoo.
// Reusa el núcleo FinFacturas; sólo cambia endpoint, etiqueta de partner y mock.

(function () {
  'use strict';
  if (!window.FinRouter || !window.FinFacturas) return;

  window.FinRouter.register('bills-odoo', {
    render: function (container) {
      window.FinFacturas.createView({
        moduleId: 'bills-odoo',
        endpoint: '/fin/bills-odoo',
        title: 'Bills Odoo',
        subtitle: 'Recibidas · in_invoice + in_refund',
        partnerLabel: 'Proveedor',
        mockPath: 'data/mock/bills-odoo.mock.json',
        columns: window.FinFacturas.defaultColumns('Proveedor')
      }).mount(container);
    }
  });
})();
