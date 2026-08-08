/**
 * @file migration.service.js
 * @description Intelligent Data Migration & Export Engine.
 * Supports importing & exporting data from PDF, Excel, Word, JSON, CSV, and Text.
 * Features positional PDF table extraction, auto-type detection, money/date normalization,
 * duplicate checking, batch Firestore persistence with progress callback, and audit history.
 */

import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';
import { TimeService } from './time.service.js';

export class MigrationService {

  /**
   * Entity Schemas definitions aligned with real Ultra Administrador data structures.
   */
  static ENTITY_SCHEMAS = {
    products: {
      label: 'Productos / Inventario',
      icon: '📦',
      collection: 'productos', // Collection used by ProductsView & FirestoreService tenant ops
      required: ['name'],
      fields: [
        { key: 'name', label: 'Nombre del Producto', aliases: ['nombre', 'producto', 'item', 'descripcion', 'description', 'title', 'name', 'articulo'] },
        { key: 'purchasePrice', label: 'Costo Unitario ($)', aliases: ['costo', 'costo unitario', 'purchase price', 'costo_unitario', 'costo unit', 'p. compra', 'compra', 'purchaseprice'] },
        { key: 'price', label: 'Precio de Venta ($)', aliases: ['precio', 'precio unitario', 'price', 'precio_unitario', 'precio unit', 'p. venta', 'venta', 'unit price'] },
        { key: 'stock', label: 'Cantidad / Stock', aliases: ['stock', 'cant.', 'cantidad', 'qty', 'existencias', 'inventario', 'count', 'cant'] },
        { key: 'category', label: 'Categoría', aliases: ['categoria', 'category', 'rubro', 'tipo', 'linea', 'grupo', 'seccion'] },
        { key: 'sku', label: 'SKU / Barcode / Código', aliases: ['codigo', 'code', 'sku', 'barcode', 'id', 'referencia', 'cod'] },
        { key: 'unit', label: 'Unidad de Medida', aliases: ['unidad', 'unit', 'medida', 'presentacion', 'um'] },
        { key: 'minStock', label: 'Stock Mínimo', aliases: ['min stock', 'minimo', 'min_stock', 'stock minimo'] },
        { key: 'description', label: 'Detalles / Notas', aliases: ['detalles', 'notas', 'especificacion', 'observaciones', 'nota'] },
        { key: 'createdAtLocal', label: 'Fecha de Registro', aliases: ['creado', 'fecha', 'date', 'created_at', 'fechacreacion'] }
      ]
    },
    clients: {
      label: 'Clientes & Contactos',
      icon: '👥',
      collection: 'recurring_clients',
      required: ['name'],
      fields: [
        { key: 'name', label: 'Nombre Completo / Empresa', aliases: ['nombre', 'cliente', 'name', 'contacto', 'razon_social'] },
        { key: 'phone', label: 'Teléfono / WhatsApp', aliases: ['telefono', 'phone', 'celular', 'whatsapp', 'tel', 'mobile'] },
        { key: 'email', label: 'Correo Electrónico', aliases: ['email', 'correo', 'mail', 'e-mail'] },
        { key: 'address', label: 'Dirección', aliases: ['direccion', 'address', 'ubicacion', 'domicilio'] },
        { key: 'creditLimit', label: 'Límite de Crédito ($)', aliases: ['credito', 'limite_credito', 'credit_limit', 'cupo'] },
        { key: 'notes', label: 'Notas', aliases: ['notas', 'notes', 'comentarios'] }
      ]
    },
    suppliers: {
      label: 'Proveedores',
      icon: '🏭',
      collection: 'suppliers',
      required: ['name'],
      fields: [
        { key: 'name', label: 'Nombre del Proveedor', aliases: ['nombre', 'proveedor', 'supplier', 'empresa', 'razon_social'] },
        { key: 'phone', label: 'Teléfono', aliases: ['telefono', 'phone', 'celular', 'tel'] },
        { key: 'email', label: 'Correo Electrónico', aliases: ['email', 'correo', 'mail'] },
        { key: 'category', label: 'Insumos / Categoría', aliases: ['categoria', 'rubro', 'tipo_insumo', 'category'] },
        { key: 'address', label: 'Dirección', aliases: ['direccion', 'address', 'ubicacion'] },
        { key: 'taxId', label: 'RUC / NIF / Tax ID', aliases: ['ruc', 'nif', 'rfc', 'tax_id', 'nit'] }
      ]
    },
    expenses: {
      label: 'Gastos & Egresos',
      icon: '💸',
      collection: 'expenses',
      required: ['title', 'amount'],
      fields: [
        { key: 'title', label: 'Concepto / Descripción del Gasto', aliases: ['concepto', 'descripcion', 'gasto', 'title', 'motivo', 'item'] },
        { key: 'amount', label: 'Monto ($)', aliases: ['monto', 'amount', 'precio', 'total', 'costo', 'valor'] },
        { key: 'category', label: 'Categoría', aliases: ['categoria', 'category', 'tipo', 'rubro'] },
        { key: 'date', label: 'Fecha (YYYY-MM-DD)', aliases: ['fecha', 'date', 'hora', 'fechagasto'] },
        { key: 'paymentMethod', label: 'Método de Pago', aliases: ['metodo', 'forma_pago', 'payment_method', 'medio'] }
      ]
    },
    accounts_receivable: {
      label: 'Cuentas por Cobrar',
      icon: '📈',
      collection: 'accounts_receivable',
      required: ['clientName', 'amount'],
      fields: [
        { key: 'clientName', label: 'Cliente / Deudor', aliases: ['cliente', 'deudor', 'clientName', 'nombre'] },
        { key: 'amount', label: 'Monto a Cobrar ($)', aliases: ['monto', 'saldo', 'deuda', 'amount', 'total'] },
        { key: 'concept', label: 'Concepto', aliases: ['concepto', 'nota', 'motivo', 'descripcion'] },
        { key: 'dueDate', label: 'Fecha Vencimiento', aliases: ['vencimiento', 'fecha_limite', 'dueDate', 'fecha'] },
        { key: 'status', label: 'Estado', aliases: ['estado', 'status'] }
      ]
    },
    accounts_payable: {
      label: 'Cuentas por Pagar',
      icon: '📉',
      collection: 'accounts_payable',
      required: ['supplierName', 'amount'],
      fields: [
        { key: 'supplierName', label: 'Proveedor / Acreedor', aliases: ['proveedor', 'acreedor', 'supplierName', 'nombre'] },
        { key: 'amount', label: 'Monto a Pagar ($)', aliases: ['monto', 'saldo', 'deuda', 'amount', 'total'] },
        { key: 'concept', label: 'Concepto / N° Factura', aliases: ['concepto', 'factura', 'nota', 'motivo'] },
        { key: 'dueDate', label: 'Fecha Vencimiento', aliases: ['vencimiento', 'fecha_limite', 'dueDate', 'fecha'] },
        { key: 'status', label: 'Estado', aliases: ['estado', 'status'] }
      ]
    },
    employees: {
      label: 'Empleados / Personal',
      icon: '👔',
      collection: 'employees',
      required: ['displayName'],
      fields: [
        { key: 'displayName', label: 'Nombre del Empleado', aliases: ['nombre', 'empleado', 'displayName', 'name', 'personal'] },
        { key: 'role', label: 'Rol (MANAGER/CASHIER/WAITER/KITCHEN)', aliases: ['rol', 'role', 'puesto', 'cargo'] },
        { key: 'email', label: 'Correo Electrónico', aliases: ['email', 'correo', 'mail'] },
        { key: 'phone', label: 'Teléfono', aliases: ['telefono', 'phone', 'celular'] }
      ]
    }
  };

  /**
   * Clean monetary strings to numeric values.
   * e.g., "C$1,792" -> 1792, "$2,500.50" -> 2500.50, "C$ 40,000" -> 40000
   * @param {string|number} rawValue
   * @returns {number}
   */
  static parseMoney(rawValue) {
    if (typeof rawValue === 'number') return isNaN(rawValue) ? 0 : rawValue;
    if (!rawValue) return 0;
    const str = String(rawValue).trim();
    // Strip all currency symbols, spaces, and letters (C$, $, USD, S/, €, etc.)
    const cleanStr = str.replace(/[^0-9.,-]/g, '').trim();
    if (!cleanStr) return 0;

    let formatted = cleanStr;

    if (formatted.includes(',') && formatted.includes('.')) {
      // Both separators present → determine which is decimal by position
      if (formatted.lastIndexOf('.') > formatted.lastIndexOf(',')) {
        // e.g. "1,792.50" → period is decimal, commas are thousands
        formatted = formatted.replace(/,/g, '');
      } else {
        // e.g. "1.792,50" → comma is decimal, periods are thousands
        formatted = formatted.replace(/\./g, '').replace(',', '.');
      }
    } else if (formatted.includes(',')) {
      const parts = formatted.split(',');
      const lastPart = parts[parts.length - 1];
      if (lastPart.length === 2 && parts.length === 2) {
        // Exactly 2 digits after a single comma → treat as decimal separator
        // e.g. "1,50" → 1.50
        formatted = formatted.replace(',', '.');
      } else {
        // 3+ digits after comma → thousands separator
        // e.g. "1,792" → 1792, "40,000" → 40000, "1,792,000" → 1792000
        formatted = formatted.replace(/,/g, '');
      }
    }

    const num = parseFloat(formatted);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Clean date strings into standard DD/MM/YYYY or YYYY-MM-DD string
   * @param {string} rawValue
   * @returns {string}
   */
  static parseDate(rawValue) {
    if (!rawValue) return TimeService ? TimeService.timestamp().split('T')[0] : new Date().toISOString().split('T')[0];
    const str = String(rawValue).trim();

    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      let year = dmyMatch[3];
      if (year.length === 2) year = '20' + year;
      return `${day}/${month}/${year}`;
    }

    const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return `${day}/${month}/${year}`;
    }

    return str;
  }

  /**
   * Positional PDF table & text extraction engine using pdfjsLib.
   * Reconstructs physical table rows by clustering items with similar Y coordinates.
   * @param {File} file 
   * @returns {Promise<{ filename: string, fileType: string, rows: Array<Object>, headers: Array<string>, rawText: string, extractionMode: string }>}
   */
  static async parsePDFWithTableDetection(file) {
    if (!window.pdfjsLib) {
      throw new Error('El lector de PDF (PDF.js) no está disponible en la aplicación.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    const allPageRows = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items || [];

      if (items.length === 0) continue;

      const lineGroups = [];
      items.forEach(item => {
        const textStr = (item.str || '').trim();
        if (!textStr) return;
        const transform = item.transform;
        const x = transform ? transform[4] : 0;
        const y = transform ? Math.round(transform[5]) : 0;

        let group = lineGroups.find(g => Math.abs(g.y - y) <= 4);
        if (!group) {
          group = { y, items: [] };
          lineGroups.push(group);
        }
        group.items.push({ x, str: textStr });
      });

      lineGroups.sort((a, b) => b.y - a.y);

      lineGroups.forEach(group => {
        group.items.sort((a, b) => a.x - b.x);
        const lineText = group.items.map(it => it.str).join('   ');
        fullText += lineText + '\n';
        allPageRows.push(group.items.map(it => it.str));
      });
    }

    let headers = [];
    let rows = [];
    let extractionMode = 'table';

    if (allPageRows.length > 0) {
      let headerIdx = -1;
      for (let i = 0; i < Math.min(allPageRows.length, 10); i++) {
        const line = allPageRows[i];
        if (line.length >= 2) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx !== -1) {
        headers = allPageRows[headerIdx].map(h => h.trim());
        for (let i = headerIdx + 1; i < allPageRows.length; i++) {
          const line = allPageRows[i];
          if (line.length === 0) continue;

          const rowObj = {};
          if (line.length === headers.length) {
            headers.forEach((h, idx) => {
              rowObj[h || `Col_${idx + 1}`] = line[idx];
            });
          } else {
            headers.forEach((h, idx) => {
              rowObj[h || `Col_${idx + 1}`] = line[idx] !== undefined ? line[idx] : '';
            });
            if (line.length > headers.length) {
              rowObj['extra'] = line.slice(headers.length).join(' ');
            }
          }
          rows.push(rowObj);
        }
      }
    }

    if (rows.length === 0 && fullText.trim()) {
      extractionMode = 'text_fallback';
      const textParsed = this.parseCSVText(fullText);
      headers = textParsed.headers;
      rows = textParsed.rows;
    }

    return {
      filename: file.name,
      fileType: 'PDF',
      rows,
      headers,
      rawText: fullText,
      extractionMode
    };
  }

  /**
   * Smart Document Type Detector.
   * Analyzes text title, column headers, and content to identify target schema entity.
   * @param {string} rawText 
   * @param {Array<string>} headers 
   * @returns {{ entity: string, confidence: number, label: string, reason: string }}
   */
  static detectDocumentType(rawText = '', headers = []) {
    const textSample = (rawText + ' ' + headers.join(' ')).toLowerCase();

    const scores = {
      products: 0,
      clients: 0,
      suppliers: 0,
      expenses: 0,
      accounts_receivable: 0,
      accounts_payable: 0,
      employees: 0
    };

    if (/inventario|producto|productos|stock|costo unitario|precio unitario|cant|abanicos|item|sku|articulo/i.test(textSample)) scores.products += 40;
    if (/resumen de inventario|lista de productos|catalogo de productos/i.test(textSample)) scores.products += 40;

    if (/cliente|clientes|deudor|cupo|limite de credito|contacto/i.test(textSample)) scores.clients += 40;
    if (/proveedor|proveedores|insumos|ruc|nif|acreedor/i.test(textSample)) scores.suppliers += 40;
    if (/gasto|gastos|egreso|egresos|factura servicio|comprobante/i.test(textSample)) scores.expenses += 40;
    if (/cuenta por cobrar|cuentas por cobrar|deuda cliente|saldo a favor/i.test(textSample)) scores.accounts_receivable += 45;
    if (/cuenta por pagar|cuentas por pagar|deuda proveedor/i.test(textSample)) scores.accounts_payable += 45;
    if (/empleado|empleados|personal|nomina|salario|puesto/i.test(textSample)) scores.employees += 40;

    headers.forEach(h => {
      const normH = h.toLowerCase();
      if (['nombre', 'categoría', 'categoria', 'cant.', 'cantidad', 'costo unitario', 'precio unitario', 'stock', 'costo inventario'].includes(normH)) {
        scores.products += 15;
      }
    });

    let bestEntity = 'products';
    let maxScore = 0;

    Object.entries(scores).forEach(([entity, score]) => {
      if (score > maxScore) {
        maxScore = score;
        bestEntity = entity;
      }
    });

    const confidence = Math.min(99, Math.max(60, maxScore));
    const schema = this.ENTITY_SCHEMAS[bestEntity];

    return {
      entity: bestEntity,
      confidence: maxScore > 0 ? confidence : 75,
      label: schema ? schema.label : 'Productos / Inventario',
      reason: maxScore > 0 
        ? `Coincidencia detectada por palabras clave y encabezados (${maxScore}% confianza)`
        : 'Selección predeterminada para Inventario'
    };
  }

  /**
   * Parse uploaded file buffer or string into structured JSON rows
   * @param {File} file 
   * @returns {Promise<{ filename: string, fileType: string, rows: Array<Object>, headers: Array<string>, rawText?: string }>}
   */
  static async parseFile(file) {
    const filename = file.name;
    const ext = filename.split('.').pop().toLowerCase();

    try {
      if (ext === 'pdf') {
        return await this.parsePDFWithTableDetection(file);
      } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
        const data = await file.arrayBuffer();
        let rows = [];
        let headers = [];
        if (window.XLSX) {
          const workbook = window.XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          rows = window.XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          if (rows.length > 0) {
            headers = Object.keys(rows[0]);
          }
        } else {
          const text = await file.text();
          const parsed = this.parseCSVText(text);
          rows = parsed.rows;
          headers = parsed.headers;
        }
        return { filename, fileType: ext.toUpperCase(), rows, headers };
      } else if (ext === 'json') {
        const text = await file.text();
        const json = JSON.parse(text);
        const rows = Array.isArray(json) ? json : [json];
        const headers = rows.length > 0 && typeof rows[0] === 'object' ? Object.keys(rows[0]) : [];
        return { filename, fileType: 'JSON', rows, headers };
      } else if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        if (window.mammoth) {
          const result = await window.mammoth.extractRawText({ arrayBuffer });
          const text = result.value || '';
          const parsed = this.parseCSVText(text);
          return { filename, fileType: 'DOCX', rows: parsed.rows, headers: parsed.headers };
        } else {
          throw new Error('El lector de Word (Mammoth) no está disponible en este momento.');
        }
      } else {
        const text = await file.text();
        const parsed = this.parseCSVText(text);
        return { filename, fileType: ext.toUpperCase(), rows: parsed.rows, headers: parsed.headers };
      }
    } catch (e) {
      console.error('[MigrationService] File parse error:', e);
      throw new Error(`Error al procesar el archivo "${filename}": ${e.message}`);
    }
  }

  /**
   * Helper CSV and Tabular Text Parser supporting comma, semicolon, tab, pipe delimiters
   * @param {string} text 
   * @returns {{ headers: Array<string>, rows: Array<Object> }}
   */
  static parseCSVText(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return { headers: [], rows: [] };

    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';')) delimiter = ';';
    else if (firstLine.includes('|')) delimiter = '|';

    const parseLine = (line) => line.split(delimiter).map(cell => cell.replace(/^["']|["']$/g, '').trim());

    const headers = parseLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.length === 0 || (values.length === 1 && !values[0])) continue;
      const rowObj = {};
      headers.forEach((header, index) => {
        rowObj[header || `Col_${index + 1}`] = values[index] !== undefined ? values[index] : '';
      });
      rows.push(rowObj);
    }

    return { headers, rows };
  }

  /**
   * Auto detect target schema field mappings for source headers with confidence scoring
   * @param {Array<string>} sourceHeaders 
   * @param {string} entityKey 
   * @returns {Object} { mapping: Object, confidenceScores: Object }
   */
  static autoDetectColumnMapping(sourceHeaders, entityKey) {
    const schema = this.ENTITY_SCHEMAS[entityKey];
    if (!schema) return { mapping: {}, confidenceScores: {} };

    const mapping = {};
    const confidenceScores = {};

    schema.fields.forEach(field => {
      const fieldKey = field.key;
      const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');

      let matchedHeader = '';
      let score = 0;

      sourceHeaders.forEach(header => {
        const normHeader = normalize(header);
        if (normHeader === normalize(fieldKey) || normHeader === normalize(field.label)) {
          matchedHeader = header;
          score = 98;
        } else if (field.aliases.some(alias => normalize(alias) === normHeader)) {
          if (score < 95) {
            matchedHeader = header;
            score = 94;
          }
        } else if (normHeader.includes(normalize(fieldKey)) || field.aliases.some(alias => normHeader.includes(normalize(alias)))) {
          if (score < 80) {
            matchedHeader = header;
            score = 75;
          }
        }
      });

      mapping[fieldKey] = matchedHeader;
      confidenceScores[fieldKey] = score > 0 ? score : 0;
    });

    return { mapping, confidenceScores };
  }

  /**
   * Validate raw rows against schema and column mapping, converting types and reporting errors/warnings
   * @param {Array<Object>} rawRows 
   * @param {Object} mapping - Maps fieldKey -> headerName
   * @param {string} entityKey 
   * @returns {{ validRows: Array<Object>, invalidRows: Array<Object>, warnings: Array<string>, totalParsed: number }}
   */
  static validateAndTransform(rawRows, mapping, entityKey) {
    const schema = this.ENTITY_SCHEMAS[entityKey];
    if (!schema) throw new Error('Entidad de destino no válida.');

    const validRows = [];
    const invalidRows = [];
    const warnings = [];

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const transformed = { _rawIndex: idx, _rowNum: rowNum };
      let hasRequired = true;
      const rowErrors = [];

      schema.fields.forEach(field => {
        const sourceHeader = mapping[field.key];
        let val = sourceHeader ? row[sourceHeader] : '';

        if (val === undefined || val === null) val = '';
        val = String(val).trim();

        if (field.key === 'purchasePrice' || field.key === 'price' || field.key === 'amount' || field.key === 'creditLimit') {
          transformed[field.key] = this.parseMoney(val);
        } else if (field.key === 'stock' || field.key === 'minStock') {
          const num = parseInt(val.replace(/[^0-9-]/g, ''), 10);
          transformed[field.key] = isNaN(num) ? 0 : num;
        } else if (field.key === 'createdAtLocal' || field.key === 'date' || field.key === 'dueDate') {
          transformed[field.key] = this.parseDate(val);
        } else {
          transformed[field.key] = val;
        }
      });

      schema.required.forEach(reqKey => {
        if (!transformed[reqKey] && transformed[reqKey] !== 0) {
          hasRequired = false;
          rowErrors.push(`Falta el campo obligatorio "${reqKey}"`);
          warnings.push(`Fila ${rowNum}: Falta el campo obligatorio "${reqKey}". Omitiendo esta fila.`);
        }
      });

      if (hasRequired) {
        if (entityKey === 'products') {
          transformed.category = transformed.category || 'General';
          transformed.unit = transformed.unit || 'uds';
          transformed.sku = transformed.sku || '';
          transformed.barcode = transformed.sku || '';
          transformed.isAvailable = true;
          transformed._duplicateKey = (transformed.name || '').toLowerCase().trim();
        } else if (entityKey === 'employees') {
          transformed.role = (transformed.role || 'MANAGER').toUpperCase();
          transformed.active = true;
        } else if (entityKey === 'expenses') {
          transformed.category = transformed.category || 'General';
          transformed.paymentMethod = transformed.paymentMethod || 'Efectivo';
        }
        validRows.push(transformed);
      } else {
        transformed._errors = rowErrors;
        invalidRows.push(transformed);
      }
    });

    return { validRows, invalidRows, warnings, totalParsed: rawRows.length };
  }

  /**
   * Check valid rows against existing DB products to flag potential duplicates.
   * @param {Array<Object>} validRows 
   * @param {Array<Object>} existingItems 
   * @returns {{ rowsWithDuplicateStatus: Array<Object>, duplicateCount: number }}
   */
  static checkDuplicates(validRows = [], existingItems = []) {
    const existingMap = new Map();
    existingItems.forEach(item => {
      if (item.name) {
        existingMap.set(item.name.toLowerCase().trim(), item);
      }
      if (item.sku) {
        existingMap.set(item.sku.toLowerCase().trim(), item);
      }
    });

    let duplicateCount = 0;
    const rowsWithDuplicateStatus = validRows.map(row => {
      const match = existingMap.get(row._duplicateKey) || (row.sku ? existingMap.get(row.sku.toLowerCase().trim()) : null);
      if (match) {
        duplicateCount++;
        return { ...row, _isDuplicate: true, _existingItem: match, _userDecision: 'update' };
      }
      return { ...row, _isDuplicate: false, _userDecision: 'create' };
    });

    return { rowsWithDuplicateStatus, duplicateCount };
  }

  /**
   * Execute migration batch insertion into Firestore RTDB.
   * Processes records in batches with async progress reporting.
   * @param {string} entityKey 
   * @param {Array<Object>} records 
   * @param {'append'|'overwrite'} mode 
   * @param {Function} [onProgress] Callback (current, total, statusText)
   * @returns {Promise<{ successCount: number, updatedCount: number, skippedCount: number, total: number }>}
   */
  static async executeMigrationBatch(entityKey, records, mode = 'append', onProgress = null) {
    const schema = this.ENTITY_SCHEMAS[entityKey];
    if (!schema) throw new Error('Entidad inválida.');

    const collectionName = schema.collection;

    if (mode === 'overwrite') {
      if (onProgress) onProgress(0, records.length, 'Limpiando colección existente...');
      await FirestoreService.deleteAll(collectionName);
    }

    let successCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const total = records.length;
    const BATCH_SIZE = 10;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      for (const record of batch) {
        const decision = record._userDecision || 'create';

        if (decision === 'skip') {
          skippedCount++;
          continue;
        }

        const payload = { ...record };
        delete payload._rawIndex;
        delete payload._rowNum;
        delete payload._duplicateKey;
        delete payload._isDuplicate;
        delete payload._existingItem;
        delete payload._userDecision;

        payload.createdAt = payload.createdAt || Date.now();
        payload.createdAtLocal = payload.createdAtLocal || TimeService.timestamp();
        payload.updatedAt = Date.now();
        payload.updatedAtLocal = TimeService.timestamp();

        if (record._isDuplicate && decision === 'update' && record._existingItem && record._existingItem.id) {
          await FirestoreService.update(collectionName, record._existingItem.id, payload);
          updatedCount++;
        } else {
          await FirestoreService.create(collectionName, payload);
          successCount++;
        }
      }

      const currentDone = Math.min(i + BATCH_SIZE, total);
      if (onProgress) {
        onProgress(currentDone, total, `Guardando registros ${currentDone} de ${total}...`);
      }

      await new Promise(r => setTimeout(r, 40));
    }

    try {
      const { currentUser } = GlobalStore.getState();
      const userEmail = currentUser ? (currentUser.email || currentUser.displayName || 'Owner') : 'Owner';
      const companyId = currentUser ? currentUser.companyId : '';

      await FirestoreService.create('migration_history', {
        entityKey,
        entityLabel: schema.label,
        mode,
        totalRecords: total,
        successCount,
        updatedCount,
        skippedCount,
        userEmail,
        companyId,
        timestamp: Date.now(),
        timestampLocal: TimeService.timestamp()
      });

      await FirestoreService.create('audit_logs', {
        action: 'DATA_MIGRATION',
        entity: entityKey,
        mode,
        count: successCount + updatedCount,
        timestamp: TimeService.timestamp(),
        user: userEmail
      });
    } catch (e) {
      console.warn('[MigrationService] Audit log write warning:', e.message);
    }

    return { successCount, updatedCount, skippedCount, total };
  }

  /**
   * Legacy wrapper method for backward compatibility
   */
  static async executeMigration(entityKey, records, mode = 'append') {
    return await this.executeMigrationBatch(entityKey, records, mode);
  }

  /**
   * Retrieve migration history entries for the current company tenant.
   * @returns {Promise<Array<Object>>}
   */
  static async getMigrationHistory() {
    try {
      const records = await FirestoreService.query('migration_history', [], { field: 'timestamp', direction: 'desc' }, 30);
      return records || [];
    } catch (e) {
      console.warn('[MigrationService] History query error:', e.message);
      return [];
    }
  }

  /**
   * Download sample templates for an entity type in CSV or JSON
   * @param {string} entityKey 
   * @param {'csv'|'json'} format 
   */
  static downloadTemplate(entityKey, format = 'csv') {
    const schema = this.ENTITY_SCHEMAS[entityKey];
    if (!schema) return;

    const sampleRows = {
      products: [
        { name: 'Ab sankey clásico', purchasePrice: 1792.00, price: 2500.00, stock: 16, category: 'Abanicos', sku: 'PROD-001', unit: 'uds', createdAtLocal: '30/03/2025' },
        { name: 'Hamburguesa Especial', purchasePrice: 90.00, price: 150.00, stock: 50, category: 'Comida', sku: 'PROD-002', unit: 'uds', createdAtLocal: '30/03/2025' },
        { name: 'Refresco 500ml', purchasePrice: 20.00, price: 35.00, stock: 100, category: 'Bebidas', sku: 'PROD-003', unit: 'uds', createdAtLocal: '30/03/2025' }
      ],
      clients: [
        { name: 'Juan Pérez', phone: '+505 8888 9999', email: 'juan@ejemplo.com', address: 'Managua, Nicaragua', creditLimit: 2000, notes: 'Cliente frecuente' }
      ],
      suppliers: [
        { name: 'Distribuidora Central', phone: '+505 2277 8888', email: 'ventas@distribuidora.com', category: 'Insumos', address: 'Managua', taxId: 'J031000000001' }
      ],
      expenses: [
        { title: 'Pago Servicio Eléctrico', amount: 1250.50, category: 'Servicios Básicos', date: '2026-07-31', paymentMethod: 'Transferencia' }
      ],
      accounts_receivable: [
        { clientName: 'Juan Pérez', amount: 450.00, concept: 'Consumo Factura #102', dueDate: '2026-08-15', status: 'Pendiente' }
      ],
      accounts_payable: [
        { supplierName: 'Distribuidora Central', amount: 1200.00, concept: 'Factura Insumos #882', dueDate: '2026-08-20', status: 'Pendiente' }
      ],
      employees: [
        { displayName: 'Carlos López', role: 'CASHIER', email: 'carlos@empresa.com', phone: '+505 8765 4321' }
      ]
    };

    const data = sampleRows[entityKey] || [];
    const filename = `Plantilla_Migracion_${entityKey}.${format}`;

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      this._triggerDownload(blob, filename);
    } else {
      if (data.length === 0) return;
      const headers = Object.keys(data[0]);
      let csvContent = headers.join(',') + '\n';
      data.forEach(row => {
        const line = headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',');
        csvContent += line + '\n';
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      this._triggerDownload(blob, filename);
    }
  }

  /**
   * Helper to download generated blobs
   * @private
   */
  static _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
