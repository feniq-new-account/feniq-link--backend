// CSV quoting alone does not prevent Excel formulas in a pharmacy name.
// Prefix textual formula/phone cells; leave monetary numbers numeric.
export function reportCsv(rows) {
  const cell = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    let text = String(value ?? '');
    if (/^\s*[=+\-@]|^[\t\r\n]/.test(text) || /^0\d+$/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
export function downloadReportCsv(name, rows) {
  const url = URL.createObjectURL(new Blob([reportCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
