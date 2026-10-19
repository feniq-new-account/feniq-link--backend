import { useEffect } from 'react';

// On a phone the admin tables (.adm-table) are drawn as one card per row
// (index.css, "stacked tables"): the header row is hidden and every cell
// shows its column name in front of it. That name comes from the matching
// <th>, copied here into the cell's data-label, so the eleven admin tables
// need no per-page markup. Tables render and re-render on their own (paging,
// filters, live updates), so the labels are refreshed on every DOM change
// inside `root`.
export function labelTableCells(root) {
  for (const table of root.querySelectorAll('table.adm-table')) {
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (headers.length === 0) continue;
    for (const row of table.querySelectorAll('tbody tr')) {
      let column = 0;
      for (const cell of [...row.children]) {
        const label = headers[column] || '';
        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
        column += Number(cell.getAttribute('colspan')) || 1;
      }
    }
  }
}

export function useStackedTableLabels(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof MutationObserver === 'undefined') return undefined;
    labelTableCells(root);
    let pending = false;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        labelTableCells(root);
      });
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [rootRef]);
}
