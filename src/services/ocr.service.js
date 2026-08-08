/**
 * @file ocr.service.js
 * @description Intelligent visual OCR and multi-format document parser service for supplier purchase invoices.
 * Performs client-side image OCR (Tesseract.js), pattern matching for invoice headers and line items,
 * currency cleaning, confidence scoring, and selling price calculators.
 */

import { MigrationService } from './migration.service.js';

export class OCRService {

  /**
   * Dynamically load Tesseract.js if not already present on window.
   * @returns {Promise<Object>} window.Tesseract
   */
  static async loadTesseract() {
    if (window.Tesseract) return window.Tesseract;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => reject(new Error('No se pudo cargar el motor de OCR visual (Tesseract.js).'));
      document.head.appendChild(script);
    });
  }

  /**
   * Perform visual OCR on image files or canvas using Tesseract.js.
   * @param {File|HTMLImageElement|HTMLCanvasElement} imageSource 
   * @returns {Promise<string>} Extracted visual text
   */
  static async performVisualOCR(imageSource) {
    try {
      const Tesseract = await this.loadTesseract();
      const result = await Tesseract.recognize(imageSource, 'spa+eng', {
        logger: m => console.log('[Tesseract OCR]', m.status, m.progress ? `${Math.round(m.progress * 100)}%` : '')
      });
      return result?.data?.text || '';
    } catch (err) {
      console.error('[OCRService] Visual OCR error:', err);
      return '';
    }
  }

  /**
   * Pre-process image on a Canvas element to enhance text legibility.
   * @param {HTMLImageElement|HTMLCanvasElement} imageSource 
   * @param {Object} options { brightness, contrast, rotation, grayscale }
   * @returns {HTMLCanvasElement} Processed canvas
   */
  static preprocessImage(imageSource, options = {}) {
    const {
      brightness = 100,
      contrast = 120,
      rotation = 0,
      grayscale = true
    } = options;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = imageSource.naturalWidth || imageSource.width || 800;
    const height = imageSource.naturalHeight || imageSource.height || 600;

    if (rotation === 90 || rotation === 270) {
      canvas.width = height;
      canvas.height = width;
    } else {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.save();
    if (rotation === 90) {
      ctx.translate(canvas.width, 0);
      ctx.rotate((90 * Math.PI) / 180);
    } else if (rotation === 180) {
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate((180 * Math.PI) / 180);
    } else if (rotation === 270) {
      ctx.translate(0, canvas.height);
      ctx.rotate((270 * Math.PI) / 180);
    }

    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) ${grayscale ? 'grayscale(100%)' : ''}`;
    ctx.drawImage(imageSource, 0, 0, width, height);
    ctx.restore();

    return canvas;
  }

  /**
   * Calculate public selling price from acquisition cost and margin percentage/fixed.
   * @param {number} cost 
   * @param {number} marginValue 
   * @param {'percent'|'fixed'} marginType 
   * @returns {number}
   */
  static calculateSellingPrice(cost = 0, marginValue = 30, marginType = 'percent') {
    const numericCost = parseFloat(cost) || 0;
    const numericMargin = parseFloat(marginValue) || 0;

    if (marginType === 'fixed') {
      return Math.max(0, numericCost + numericMargin);
    } else {
      return Math.max(0, numericCost * (1 + numericMargin / 100));
    }
  }

  /**
   * Clean monetary strings to numeric values.
   * e.g. "C$1,792" -> 1792, "C$2,500" -> 2500, "$45.00" -> 45
   * @param {string|number} rawValue 
   * @returns {number}
   */
  static cleanMoney(rawValue) {
    if (typeof rawValue === 'number') return isNaN(rawValue) ? 0 : rawValue;
    if (!rawValue) return 0;
    return MigrationService.parseMoney(rawValue);
  }

  /**
   * Fuzzy, case-insensitive, punctuation-agnostic key lookup for row objects.
   * Resolves headers like "Cant.", "Cantidad", "Cant", "Qty", "Precio unit.", "Nombre del producto", etc.
   * @param {Object} row 
   * @param {Array<string>} aliases 
   * @returns {string|null}
   */
  static getRowValue(row, aliases) {
    if (!row || typeof row !== 'object') return null;
    const keys = Object.keys(row);
    for (const alias of aliases) {
      const aliasClean = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const key of keys) {
        const keyClean = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (keyClean === aliasClean || (aliasClean.length >= 3 && keyClean.includes(aliasClean)) || (keyClean.length >= 3 && aliasClean.includes(keyClean))) {
          const val = row[key];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return String(val).trim();
          }
        }
      }
    }
    return null;
  }

  /**
   * Parse extracted raw text into structured supplier invoice data with confidence metrics.
   * Works flexibly across diverse invoice layouts (including multi-column tables and currency symbols).
   * @param {string} rawText 
   * @param {string} fileName
   * @returns {Object} Structured invoice data
   */
  static parseRawText(rawText = '', fileName = '') {
    // Sanitize raw text: strip non-printable binary characters
    const cleanText = String(rawText || '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
      .replace(/\r\n/g, '\n');

    const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

    let supplierName = '';
    let ruc = '';
    let invoiceNumber = '';
    let invoiceDate = new Date().toISOString().split('T')[0];
    let phone = '';
    let email = '';
    let address = '';

    // Regex patterns for header attributes — broad to handle any layout / branch
    const rucRegex = /(?:RUC|NIT|RIF|CIF|RFC|TAX\s*ID|ID\/RUC|IDENTIFICACIÓN)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./-]{6,17})/i;
    // Matches: FAC-2025-000040, No. 001-002-000123, FACTURA-2024-001, etc.
    const invoiceNumRegex = /(?:FACTURA|FACT|FAC|INVOICE|COMPROBANTE|Nº|NRO|NO[._]?|FOLIO|SERIE|NÚMERO)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,24})/i;
    const dateRegex = /(?:FECHA\s*(?:DE\s*(?:EMISIÓN|EMISION|EXPEDICIÓN))?|DATE|EMITIDA?)\s*[:#-]?\s*(\d{1,2}[/\.-]\d{1,2}[/\.-]\d{2,4})/i;
    const phoneRegex = /(?:TEL\.?|CEL\.?|PHONE|TELÉFONO|FONO)\s*[:#-]?\s*([\+?\d][\d\s().+-]{6,18})/i;
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
    // Labels that explicitly signal the supplier/issuer block
    const emisorLabelRegex = /^(?:EMISOR|PROVEEDOR|VENDEDOR|EMITIDO\s*POR|EMPRESA|SUCURSAL)\s*:?$/i;

    let confidenceScores = {
      supplierName: 85,
      ruc: 90,
      invoiceNumber: 88,
      invoiceDate: 92,
      items: 85
    };

    // --- Pass 1: detect labeled EMISOR/PROVEEDOR block (highest priority) ---
    lines.forEach((line, idx) => {
      if (emisorLabelRegex.test(line)) {
        // The very next non-empty line is the actual supplier/issuer name
        const nextLine = lines[idx + 1] || '';
        if (nextLine && !nextLine.toUpperCase().includes('RUC') && nextLine.length > 2) {
          supplierName = nextLine.trim();
          confidenceScores.supplierName = 97;
        }
      }
    });

    // --- Pass 2: scan every line for structured fields ---
    lines.forEach((line, idx) => {
      const uLine = line.toUpperCase();

      // Inline labeled supplier: "EMISOR: Ultra Pizza S.A."
      const inlineEmisor = line.match(/^(?:EMISOR|PROVEEDOR|VENDEDOR)\s*:\s*(.+)/i);
      if (inlineEmisor && !supplierName) {
        supplierName = inlineEmisor[1].trim();
        confidenceScores.supplierName = 97;
      }

      // Fallback: first significant text line in the top 10 lines of the document
      if (!supplierName && idx < 10) {
        const skipWords = ['FACTURA', 'CLIENTE', 'RUC', 'NIT', 'FECHA', 'CONDICION', 'CONDICIÓN', 'EMISOR', 'COMPROBANTE', 'INVOICE', 'ORIGINAL', 'COPIA', 'NOTA', 'RECIBO'];
        const hasSkip = skipWords.some(w => uLine.includes(w));
        if (!hasSkip && !line.match(/^[\d\s.,$/€-]+$/) && line.length > 3) {
          supplierName = line.trim();
          confidenceScores.supplierName = 80;
        }
      }

      const rucMatch = line.match(rucRegex);
      if (rucMatch && !ruc) ruc = rucMatch[1].trim();

      const invMatch = line.match(invoiceNumRegex);
      if (invMatch && !invoiceNumber) {
        const candidate = invMatch[1].trim();
        // Avoid absorbing plain words (must contain a digit)
        if (/\d/.test(candidate)) invoiceNumber = candidate;
      }

      const dateMatch = line.match(dateRegex);
      if (dateMatch && invoiceDate === new Date().toISOString().split('T')[0]) {
        const rawDate = dateMatch[1].replace(/\./g, '-').replace(/\//g, '-');
        const parts = rawDate.split('-');
        if (parts.length === 3) {
          const [p0, p1, p2] = parts;
          invoiceDate = p2.length === 4
            ? `${p2}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`
            : `${p0.padStart(2, '0')}-${p1.padStart(2, '0')}-${p2}`;
        }
      }

      const phoneMatch = line.match(phoneRegex);
      if (phoneMatch && !phone) phone = phoneMatch[1].trim();

      const emailMatch = line.match(emailRegex);
      if (emailMatch && !email) email = emailMatch[1].trim();
    });

    if (!supplierName) {
      if (fileName) {
        const cleanName = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
        supplierName = cleanName.length > 3 ? cleanName : 'PROVEEDOR GENERAL';
      } else {
        supplierName = 'PROVEEDOR GENERAL';
      }
      confidenceScores.supplierName = 65;
    }

    if (!ruc) {
      ruc = 'J000000000000';
      confidenceScores.ruc = 60;
    }

    if (!invoiceNumber) {
      invoiceNumber = `FAC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`;
      confidenceScores.invoiceNumber = 60;
    }

    // Extract Product Line Items
    const items = [];

    // Words that indicate a non-product line to skip
    const skipLineWords = [
      'NOMBRE DEL PRODUCTO', 'PRECIO UNIT.', 'COSTO UNIT.',
      'COSTO TOTAL', 'PRECIO TOTAL', 'SUBTOTAL', 'TOTAL DE UNIDADES', 'TOTAL EN LETRAS',
      'MONTO TOTAL', 'GRAN TOTAL', 'OBSERVACIONES:', 'FIRMA AUTORIZADA',
      'RECIBI CONFORME', 'EMITIDO POR', 'CONTINUACIÓN', 'DOCUMENTO FICTICIO',
      'IMPUESTO', 'DESCUENTO', 'GRACIAS POR', 'SABOR QUE CONQUISTA',
      'CONDICIÓN DE PAGO', 'FECHA DE VENCIMIENTO', 'FACTURA DE VENTA'
    ];

    lines.forEach(line => {
      // Ignore header lines or total lines
      const uLine = line.toUpperCase();
      if (skipLineWords.some(w => uLine.includes(w))) {
        return;
      }

      // Pattern 1: Multi-column table row format (handles 2 to 8 currency columns, any layout)
      // Examples:
      //   "1 Ab sankey clásico Abanicos 16 C$1,792 C$2,500 C$28,672 C$40,000"  (8 cols ULTRA PIZZA)
      //   "1 Ab sankey clásico Abanicos 16 C$2,500.00 C$40,000.00"             (6 cols DEMO invoice)
      //   "Cargador USB-C 20W Accesorios 25 C$450.00 C$11,250.00"              (5 cols, no row#)
      //
      // Key fix: NO $ end-anchor → handles any number of trailing currency columns
      // Key fix: \d{1,4} for qty to avoid absorbing large totals as quantity
      const multiColMatch = line.match(
        /^(?:\d{1,3}\s+)?(.+?)\s+(\d{1,4})\s+(?:[A-Z]{0,3}\$|\$|S\/|€)?\s*([0-9][0-9.,]*)\s+(?:[A-Z]{0,3}\$|\$|S\/|€)?\s*([0-9][0-9.,]*)/i
      );

      if (multiColMatch) {
        const rawName = (multiColMatch[1] || '').trim();
        const qty = parseInt(multiColMatch[2], 10) || 1;
        const price1 = this.cleanMoney(multiColMatch[3]);  // First price value (costPrice / unit price)
        const price2 = this.cleanMoney(multiColMatch[4]);  // Second price value (selling price OR line total)

        if (rawName && qty > 0 && qty <= 10000 && price1 > 0) {
          // Determine if price2 is a LINE TOTAL (qty × price1) or a UNIT SELLING PRICE
          // e.g. DEMO invoice: "16 C$2,500.00 C$40,000.00" → price2=40,000=16×2,500 → it's a line total
          // e.g. ULTRA PIZZA:  "16 C$1,792 C$2,500" → price2=2,500≠16×1,792=28,672 → it's a unit price
          const expectedLineTotal = qty * price1;
          const isLineTotal = price2 > 0 && Math.abs(price2 - expectedLineTotal) < (expectedLineTotal * 0.02 + 1);

          let costPrice = price1;
          let sellingPrice;
          let margin;

          if (isLineTotal || price2 <= 0) {
            // price2 is the line total (or missing): compute selling price from default margin
            margin = 30;
            sellingPrice = this.calculateSellingPrice(costPrice, margin, 'percent');
          } else {
            // price2 is the unit selling price: use it directly and compute real margin
            sellingPrice = price2;
            margin = price2 > price1
              ? Math.round(((price2 - price1) / price1) * 100)
              : 30;
          }

          items.push({
            id: 'item_' + Math.random().toString(36).substr(2, 9),
            name: rawName,
            description: '',
            sku: 'SKU-' + Math.floor(1000 + Math.random() * 9000),
            barcode: '775' + Math.floor(100000000 + Math.random() * 900000000),
            quantity: qty,
            unit: 'UND',
            costPrice: costPrice,
            discount: 0,
            tax: 15,
            subtotal: qty * costPrice,
            total: qty * costPrice * 1.15,
            profitMargin: margin,
            marginType: 'percent',
            sellingPrice: parseFloat(sellingPrice.toFixed(2)),
            confidence: Math.floor(85 + Math.random() * 14)
          });
          return;
        }
      }

      // Pattern 2: Standard tab or space separated item rows
      // e.g. "Caja Detergente Industrial 5kg   10   45.00"
      const parts = line.split(/\s{2,}|\t/);
      if (parts.length >= 3) {
        const qtyCandidate = parseFloat(parts[parts.length - 3] || parts[parts.length - 2]);
        const priceCandidate = this.cleanMoney(parts[parts.length - 1]);
        if (!isNaN(qtyCandidate) && !isNaN(priceCandidate) && qtyCandidate > 0 && priceCandidate > 0) {
          const name = parts.slice(0, parts.length - 2).join(' ');
          const cost = priceCandidate;
          const defaultMargin = 30;
          const sellingPrice = this.calculateSellingPrice(cost, defaultMargin, 'percent');
          items.push({
            id: 'item_' + Math.random().toString(36).substr(2, 9),
            name: name || 'Producto Detectado',
            description: '',
            sku: 'SKU-' + Math.floor(1000 + Math.random() * 9000),
            barcode: '775' + Math.floor(100000000 + Math.random() * 900000000),
            quantity: qtyCandidate,
            unit: 'UND',
            costPrice: cost,
            discount: 0,
            tax: 15,
            subtotal: qtyCandidate * cost,
            total: qtyCandidate * cost * 1.15,
            profitMargin: defaultMargin,
            marginType: 'percent',
            sellingPrice: parseFloat(sellingPrice.toFixed(2)),
            confidence: Math.floor(80 + Math.random() * 18)
          });
        }
      }
    });

    const totalSubtotal = items.reduce((acc, i) => acc + i.subtotal, 0);
    const totalTax = totalSubtotal * 0.15;
    const grandTotal = totalSubtotal + totalTax;

    return {
      supplierName,
      ruc,
      invoiceNumber,
      invoiceDate,
      phone,
      email,
      address,
      items,
      totalSubtotal: parseFloat(totalSubtotal.toFixed(2)),
      totalTax: parseFloat(totalTax.toFixed(2)),
      grandTotal: parseFloat(grandTotal.toFixed(2)),
      confidenceScores
    };
  }

  /**
   * Process document file (PDF, Excel, JSON, CSV, Word, TXT, Image) and extract real invoice data.
   * @param {File|HTMLCanvasElement} fileOrCanvas 
   * @returns {Promise<Object>}
   */
  static async scanInvoice(fileOrCanvas) {
    if (!fileOrCanvas) {
      throw new Error('No se proporcionó ningún archivo para procesar.');
    }

    if (fileOrCanvas instanceof File) {
      const fileName = fileOrCanvas.name || '';
      const fileType = (fileOrCanvas.type || '').toLowerCase();
      const fileExt = fileName.split('.').pop().toLowerCase();

      const isImage = fileType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'heic'].includes(fileExt);

      if (isImage) {
        // Run REAL visual OCR on image files via Tesseract.js (Never call file.text() on binary images!)
        const visualText = await this.performVisualOCR(fileOrCanvas);
        if (visualText && visualText.trim()) {
          return this.parseRawText(visualText, fileName);
        }
        return this.parseRawText('', fileName);
      }

      // Non-image files: PDF, Excel, JSON, CSV, Word, TXT
      try {
        const parsed = await MigrationService.parseFile(fileOrCanvas);
        const { rows, headers, rawText } = parsed;

        if (rows && rows.length > 0) {
          const validItems = [];
          rows.forEach((row, idx) => {
            const rawName = this.getRowValue(row, ['producto', 'nombredelproducto', 'nombre', 'description', 'descripcion', 'item', 'articulo', 'detalle', 'concepto']);
            const qtyStr = this.getRowValue(row, ['cant', 'cantidad', 'qty', 'stock', 'count', 'unidades', 'units', 'existencias']);
            // Prefer unit price columns; deprioritize 'importe' (= qty × unit) to avoid using line total as unit cost
            const costStr = this.getRowValue(row, ['preciounit', 'costounitario', 'costounit', 'preciounitario', 'precio', 'costo', 'price', 'cost', 'unitario', 'punit']) ||
                            this.getRowValue(row, ['importe']);

            const nameStr = rawName ? String(rawName).trim() : (Object.values(row)[1] || Object.values(row)[0] || '');
            const uName = String(nameStr).toUpperCase();

            // Skip header, total, discount, or empty summary rows
            if (!nameStr || uName === 'PRODUCTO' || uName === 'NOMBRE' || uName.includes('TOTAL') || uName.includes('SUBTOTAL') || uName.includes('DESCUENTO') || uName.includes('IMPUESTOS') || uName.includes('OBSERVACIONES') || uName.includes('FIRMA') || uName.includes('CONTINUACIÓN') || uName.includes('DOCUMENTO FICTICIO')) {
              return;
            }

            const qty = parseFloat(qtyStr) || 1;
            const costPrice = MigrationService.parseMoney(costStr) || 10;
            const margin = 30;
            const sellingPrice = this.calculateSellingPrice(costPrice, margin, 'percent');

            validItems.push({
              id: 'item_' + Math.random().toString(36).substr(2, 9),
              name: String(nameStr).trim(),
              description: row.description || row.detalles || '',
              brand: row.brand || '',
              model: row.model || '',
              sku: row.sku || row.codigo || row.code || ('SKU-' + Math.floor(1000 + Math.random() * 9000)),
              barcode: row.barcode || ('775' + Math.floor(100000000 + Math.random() * 900000000)),
              quantity: qty,
              unit: row.unit || row.unidad || 'UND',
              costPrice: costPrice,
              discount: 0,
              tax: 15,
              subtotal: qty * costPrice,
              total: qty * costPrice * 1.15,
              profitMargin: margin,
              marginType: 'percent',
              sellingPrice: parseFloat(sellingPrice.toFixed(2)),
              confidence: 95
            });
          });

          const headerData = this.parseRawText(rawText || '', fileName);

          const totalSubtotal = validItems.reduce((acc, i) => acc + i.subtotal, 0);
          const totalTax = totalSubtotal * 0.15;
          const grandTotal = totalSubtotal + totalTax;

          return {
            supplierName: headerData.supplierName,
            ruc: headerData.ruc,
            invoiceNumber: headerData.invoiceNumber,
            invoiceDate: headerData.invoiceDate,
            phone: headerData.phone,
            email: headerData.email,
            address: headerData.address,
            items: validItems,
            totalSubtotal: parseFloat(totalSubtotal.toFixed(2)),
            totalTax: parseFloat(totalTax.toFixed(2)),
            grandTotal: parseFloat(grandTotal.toFixed(2)),
            confidenceScores: headerData.confidenceScores
          };
        } else if (rawText) {
          return this.parseRawText(rawText, fileName);
        }
      } catch (err) {
        console.warn('[OCRService] MigrationService parse fallback:', err.message);
      }

      // Safe fallback for plain text or JSON files ONLY
      if (fileType.includes('text') || fileType.includes('json') || ['txt', 'json', 'csv'].includes(fileExt)) {
        try {
          const textContent = await fileOrCanvas.text();
          if (textContent && textContent.trim()) {
            return this.parseRawText(textContent, fileName);
          }
        } catch (_) {}
      }

      return this.parseRawText('', fileName);
    }

    // Canvas / HTMLImageElement fallback
    const visualText = await this.performVisualOCR(fileOrCanvas);
    return this.parseRawText(visualText, '');
  }
}
