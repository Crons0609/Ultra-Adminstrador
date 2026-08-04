/**
 * @file migration.service.js
 * @description Advanced multi-format Data Migration & Export Engine.
 * Supports importing & exporting data from Excel (.xlsx, .xls, .csv), Word (.docx), PDF (.pdf), JSON (.json), and Text (.txt).
 * Handles smart column mapping, schema validation, batch DB persistence, and downloadable sample templates.
 */

import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';
import { TimeService } from './time.service.js';

export class MigrationService {

  /**
   * Entity Schemas definitions and smart column recognition aliases (Spanish & English)
   */
  static ENTITY_SCHEMAS = {
    products: {
      label: 'Productos / Inventario',
      icon: '📦',
      collection: 'products',
      required: ['name', 'price'],
      fields: [
        { key: 'name', label: 'Nombre del Producto', aliases: ['nombre', 'producto', 'item', 'descripcion', 'description', 'title'] },
        { key: 'price', label: 'Precio ($)', aliases: ['precio', 'price', 'val', 'valor', 'monto', 'costo_venta', 'unit_price'] },
        { key: 'category', label: 'Categoría', aliases: ['categoria', 'category', 'rubro', 'tipo', 'linea', 'grupo'] },
        { key: 'stock', label: 'Stock / Cantidad', aliases: ['stock', 'cantidad', 'qty', 'existencias', 'inventario', 'count'] },
        { key: 'code', label: 'Código / Barcode / SKU', aliases: ['codigo', 'code', 'sku', 'barcode', 'id', 'referencia'] },
        { key: 'description', label: 'Detalles / Notas', aliases: ['detalles', 'notas', 'especificacion', 'observaciones'] }
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
   * Parse uploaded file buffer or string into structured JSON rows
   * @param {File} file 
   * @returns {Promise<{ filename: string, fileType: string, rows: Array<Object>, headers: Array<string> }>}
   */
  static async parseFile(file) {
    const filename = file.name;
    const ext = filename.split('.').pop().toLowerCase();
    let rows = [];
    let headers = [];

    try {
      if (['xlsx', 'xls', 'csv'].includes(ext)) {
        const data = await file.arrayBuffer();
        if (window.XLSX) {
          const workbook = window.XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          rows = window.XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          if (rows.length > 0) {
            headers = Object.keys(rows[0]);
          }
        } else {
          // Fallback to text reading if CSV or SheetJS isn't available
          const text = await file.text();
          const parsed = this.parseCSVText(text);
          rows = parsed.rows;
          headers = parsed.headers;
        }
      } else if (ext === 'json') {
        const text = await file.text();
        const json = JSON.parse(text);
        rows = Array.isArray(json) ? json : [json];
        if (rows.length > 0 && typeof rows[0] === 'object') {
          headers = Object.keys(rows[0]);
        }
      } else if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        if (window.mammoth) {
          const result = await window.mammoth.extractRawText({ arrayBuffer });
          const text = result.value || '';
          const parsed = this.parseCSVText(text);
          rows = parsed.rows;
          headers = parsed.headers;
        } else {
          throw new Error('El lector de Word (Mammoth) no está disponible en este momento.');
        }
      } else if (ext === 'pdf') {
        if (!window.pdfjsLib) {
          throw new Error('El lector de PDF (PDF.js) no está disponible en este momento.');
        }
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => item.str).join(' ');
          fullText += pageText + '\n';
        }
        const parsed = this.parseCSVText(fullText);
        rows = parsed.rows;
        headers = parsed.headers;
      } else {
        // Default text parser (.txt, log, etc.)
        const text = await file.text();
        const parsed = this.parseCSVText(text);
        rows = parsed.rows;
        headers = parsed.headers;
      }

      return { filename, fileType: ext.toUpperCase(), rows, headers };

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

    // Auto detect delimiter from first line
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
        rowObj[header || `col_${index}`] = values[index] !== undefined ? values[index] : '';
      });
      rows.push(rowObj);
    }

    return { headers, rows };
  }

  /**
   * Auto detect target schema field mappings for source headers
   * @param {Array<string>} sourceHeaders 
   * @param {string} entityKey 
   * @returns {Object} Key-value pair mapping target field -> source header
   */
  static autoDetectColumnMapping(sourceHeaders, entityKey) {
    const schema = this.ENTITY_SCHEMAS[entityKey];
    if (!schema) return {};

    const mapping = {};

    schema.fields.forEach(field => {
      const fieldKey = field.key;
      const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Try exact match or alias match
      const matchedHeader = sourceHeaders.find(header => {
        const normHeader = normalize(header);
        if (normHeader === normalize(fieldKey) || normHeader === normalize(field.label)) return true;
        return field.aliases.some(alias => normalize(alias) === normHeader);
      });

      if (matchedHeader) {
        mapping[fieldKey] = matchedHeader;
      } else {
        mapping[fieldKey] = ''; // Unmapped by default
      }
    });

    return mapping;
  }

  /**
   * Validate raw rows against schema and column mapping, converting types and reporting errors
   * @param {Array<Object>} rawRows 
   * @param {Object} mapping - Maps fieldKey -> headerName
   * @param {string} entityKey 
   * @returns {{ validRows: Array<Object>, warnings: Array<string>, totalParsed: number }}
   */
  static validateAndTransform(rawRows, mapping, entityKey) {
    const schema = this.ENTITY_SCHEMAS[entityKey];
    if (!schema) throw new Error('Entidad de destino no válida.');

    const validRows = [];
    const warnings = [];

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const transformed = {};
      let hasRequired = true;

      schema.fields.forEach(field => {
        const sourceHeader = mapping[field.key];
        let val = sourceHeader ? row[sourceHeader] : '';

        if (val === undefined || val === null) val = '';
        val = String(val).trim();

        // Cleaning rules
        if (field.key === 'price' || field.key === 'amount' || field.key === 'creditLimit' || field.key === 'salary') {
          const num = parseFloat(val.replace(/[^0-9.-]+/g, ''));
          transformed[field.key] = isNaN(num) ? 0 : num;
        } else if (field.key === 'stock') {
          const num = parseInt(val.replace(/[^0-9-]+/g, ''), 10);
          transformed[field.key] = isNaN(num) ? 0 : num;
        } else {
          transformed[field.key] = val;
        }
      });

      // Check required fields
      schema.required.forEach(reqKey => {
        if (!transformed[reqKey] && transformed[reqKey] !== 0) {
          hasRequired = false;
          warnings.push(`Fila ${rowNum}: Falta el campo obligatorio "${reqKey}". Omitiendo esta fila.`);
        }
      });

      if (hasRequired) {
        // Set standard fallback properties
        if (entityKey === 'products') {
          transformed.category = transformed.category || 'General';
          transformed.isAvailable = true;
        } else if (entityKey === 'employees') {
          transformed.role = (transformed.role || 'MANAGER').toUpperCase();
          transformed.active = true;
        } else if (entityKey === 'expenses') {
          transformed.category = transformed.category || 'General';
          transformed.paymentMethod = transformed.paymentMethod || 'Efectivo';
          transformed.date = transformed.date || TimeService.timestamp().split('T')[0];
        }
        validRows.push(transformed);
      }
    });

    return { validRows, warnings, totalParsed: rawRows.length };
  }

  /**
   * Execute migration insertion into Firebase RTDB
   * @param {string} entityKey 
   * @param {Array<Object>} records 
   * @param {'append'|'overwrite'} mode 
   * @returns {Promise<{ successCount: number, total: number }>}
   */
  static async executeMigration(entityKey, records, mode = 'append') {
    const schema = this.ENTITY_SCHEMAS[entityKey];
    if (!schema) throw new Error('Entidad inválida.');

    const collectionName = schema.collection;

    if (mode === 'overwrite') {
      console.log(`[Migration] Overwriting collection ${collectionName}...`);
      await FirestoreService.deleteAll(collectionName);
    }

    let successCount = 0;
    for (const record of records) {
      await FirestoreService.create(collectionName, record);
      successCount++;
    }

    // Write audit log entry
    try {
      const { currentUser } = GlobalStore.getState();
      if (currentUser && currentUser.companyId) {
        await FirestoreService.create('audit_logs', {
          action: 'DATA_MIGRATION',
          entity: entityKey,
          mode: mode,
          count: successCount,
          timestamp: TimeService.timestamp(),
          user: currentUser.email || currentUser.displayName || 'Owner'
        });
      }
    } catch (e) {
      console.warn('[Migration] Could not log audit entry:', e.message);
    }

    return { successCount, total: records.length };
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
        { name: 'Hamburguesa Especial', price: 150.00, category: 'Comida', stock: 50, code: 'PROD-001', description: 'Carne 100% de res con queso cheddar' },
        { name: 'Refresco 500ml', price: 35.00, category: 'Bebidas', stock: 100, code: 'PROD-002', description: 'Lata fría' }
      ],
      clients: [
        { name: 'Juan Pérez', phone: '+505 8888 9999', email: 'juan@ejemplo.com', address: 'Managua, Nicaragua', creditLimit: 2000, notes: 'Cliente frecuente' },
        { name: 'Comercial S.A.', phone: '+505 2222 3333', email: 'contacto@comercial.com', address: 'León, Nicaragua', creditLimit: 5000, notes: 'Empresa' }
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
