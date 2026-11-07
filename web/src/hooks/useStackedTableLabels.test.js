import { describe, expect, it } from 'vitest';
import { labelTableCells } from './useStackedTableLabels';

// A minimal stand-in for the DOM (the suite runs without one): just the
// calls labelTableCells makes.
function element(attrs = {}, children = []) {
  const attributes = { ...attrs };
  return {
    children,
    textContent: attrs.text ?? '',
    getAttribute: (name) => (name in attributes ? attributes[name] : null),
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
    label: () => attributes['data-label'],
  };
}

function table(headers, rows) {
  const ths = headers.map((text) => element({ text }));
  const trs = rows.map((cells) => element({}, cells.map((cell) => element(cell))));
  return {
    querySelectorAll: (selector) => (selector === 'thead th' ? ths : trs),
    rows: trs,
  };
}

describe('labelTableCells', () => {
  it('gives every admin table cell its column name, following colspans', () => {
    const t = table(['الصيدلية', 'النوع', 'الحالة'], [[{}, {}, {}], [{ colspan: '2' }, {}]]);
    labelTableCells({ querySelectorAll: () => [t] });

    expect(t.rows[0].children.map((cell) => cell.label())).toEqual(['الصيدلية', 'النوع', 'الحالة']);
    expect(t.rows[1].children.map((cell) => cell.label())).toEqual(['الصيدلية', 'الحالة']);
  });

  it('labels warehouse table cells too, so their phone cards retain the heading', () => {
    const names = ['اسم المادة', 'السعر', 'الحالة', 'إجراء'];
    const wh = table(names, [[{}, {}, {}, {}]]);
    const root = {
      querySelectorAll: (selector) =>
        selector === 'table.adm-table, table.wh-table' ? [wh] : [],
    };
    labelTableCells(root);
    expect(wh.rows[0].children.map((cell) => cell.label())).toEqual(names);
  });

  it('leaves a table without a header row alone', () => {
    const t = table([], [[{}]]);
    labelTableCells({ querySelectorAll: () => [t] });
    expect(t.rows[0].children[0].label()).toBeUndefined();
  });
});
