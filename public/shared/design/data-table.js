(function attachDataTable(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteDataTable = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDataTable() {
  function render(target, { columns, rows, limit }) {
    if (!Array.isArray(columns) || !Array.isArray(rows) || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('data_table_contract_invalid');
    const document = target.ownerDocument;
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const header = document.createElement('tr');
    columns.forEach((column) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = column; header.append(th); });
    head.append(header); table.append(head);
    const body = document.createElement('tbody');
    rows.slice(0, limit).forEach((row) => {
      const tr = document.createElement('tr');
      columns.forEach((column) => { const td = document.createElement('td'); td.textContent = String(row[column] ?? ''); tr.append(td); });
      body.append(tr);
    });
    table.append(body); target.replaceChildren(table);
    return Object.freeze({ rowCount: rows.length, shownRows: Math.min(limit, rows.length) });
  }
  return Object.freeze({ render });
});
