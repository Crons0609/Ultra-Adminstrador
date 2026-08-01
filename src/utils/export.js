/**
 * @file export.js
 * @description Export utilities to generate PDF, Excel, JSON, and CSV reports.
 */

/**
 * Export data array or DOM element as Excel file (.xlsx)
 * @param {Array<Object>} data 
 * @param {string} filename 
 */
export function exportToExcel(data, filename = 'reporte.xlsx') {
  if (!data || !data.length) {
    alert('No hay datos para exportar.');
    return;
  }

  if (window.XLSX) {
    const worksheet = window.XLSX.utils.json_to_sheet(data);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
    window.XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
  } else {
    // Fallback to CSV if SheetJS isn't available
    exportToCSV(data, filename.replace(/\.xlsx$/, '.csv'));
  }
}

/**
 * Export data array or DOM element as formatted PDF document
 * @param {string|HTMLElement|Array<Object>} target - Element ID or data array
 * @param {string} filename 
 */
export function exportToPDF(target, filename = 'reporte.pdf') {
  const finalFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  if (typeof target === 'string') {
    const el = document.getElementById(target);
    if (!el) {
      alert(`No se encontró el elemento #${target} para exportar.`);
      return;
    }
    if (window.html2canvas && window.jspdf) {
      window.html2canvas(el, { scale: 2 }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
        const imgWidth = 210;
        const pageHeight = 295;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
        pdf.save(finalFilename);
      }).catch(err => {
        console.error('PDF export failed:', err);
        window.print();
      });
    } else {
      window.print();
    }
  } else if (Array.isArray(target)) {
    // Export dataset as formatted table in PDF
    if (window.jspdf) {
      const doc = new window.jspdf.jsPDF();
      doc.setFontSize(16);
      doc.text('Reporte de Datos — Ultra Administrador', 14, 20);
      doc.setFontSize(10);
      doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, 14, 28);

      let startY = 38;
      if (target.length > 0) {
        const headers = Object.keys(target[0]);
        doc.setFontSize(9);
        target.slice(0, 40).forEach((row, i) => {
          const text = headers.map(h => `${h}: ${row[h]}`).join(' | ');
          doc.text(text.substring(0, 100), 14, startY);
          startY += 7;
          if (startY > 280) {
            doc.addPage();
            startY = 20;
          }
        });
      }
      doc.save(finalFilename);
    } else {
      alert('La biblioteca PDF no está disponible.');
    }
  }
}

/**
 * Export data array as formatted JSON file (.json)
 * @param {Array<Object>} data 
 * @param {string} filename 
 */
export function exportToJSON(data, filename = 'reporte.json') {
  if (!data) return;
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`);
}

/**
 * Export data array as CSV file (.csv)
 * @param {Array<Object>} data 
 * @param {string} filename 
 */
export function exportToCSV(data, filename = 'reporte.csv') {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  let csv = headers.join(',') + '\n';
  data.forEach(row => {
    const line = headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',');
    csv += line + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
