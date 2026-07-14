/**
 * @file export.js
 * @description Export utilities to generate PDF and Excel reports.
 */
export function exportToPDF(elementId, filename = 'reporte.pdf') {
  console.log('Exporting element as PDF:', elementId, filename);
}

export function exportToExcel(data, filename = 'reporte.xlsx') {
  console.log('Exporting data as Excel:', data, filename);
}
