import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { LedgerMovementReference } from './LedgerMovementReference';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key, values = {}) => `${key}${values.number == null ? '' : ` ${values.number}`}` }) }));
const render = (row) => renderToStaticMarkup(<MemoryRouter><LedgerMovementReference row={row} /></MemoryRouter>);
it('links invoice/order and return references without inventing a payment-detail endpoint', () => {
  const html = render({ entryNumber: 17, reference: { invoiceNumber: 23, orderId: 'order1', returnId: 'return1', paymentNumber: 42 } });
  expect(html).toContain('LE-17'); expect(html).toContain('href="/warehouse/orders/order1"');
  expect(html).toContain('href="/warehouse/returns/return1"'); expect(html).toContain('debts.paymentNumber 42');
  expect(html).not.toContain('/warehouse/payments/');
});
it('keeps the original ledger identity visible on reversals and handles missing legacy references', () => {
  const html = render({ entryNumber: 18, reversalOf: 'original-entry', reference: { orderId: 'order1' } });
  expect(html).toContain('original-entry'); expect(html).toContain('dir="ltr"'); expect(html).toContain('accounting.openOrder');
  expect(render({ reference: {} })).toContain('—');
});
it('escapes source strings and encodes navigation ids instead of treating metadata as HTML', () => {
  const html = render({ entryNumber: 1, reference: { orderId: 'x?other=1', invoiceNumber: '<script>bad</script>' } });
  expect(html).toContain('x%3Fother%3D1'); expect(html).not.toContain('<script>');
});

it('preserves the order number alongside an invoice and avoids a false empty legacy reference', () => {
  const both = render({ reference: { invoiceNumber: 20, orderNumber: 30 } });
  expect(both).toContain('settlement.invoiceNumber 20'); expect(both).toContain('orders.orderNumber 30');
  const legacy = render({ reference: { orderNumber: 30 } });
  expect(legacy).toContain('orders.orderNumber 30'); expect(legacy).not.toContain('—');
});
