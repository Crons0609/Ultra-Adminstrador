/**
 * @file migration.view.js
 * @description Vista del apartado de Migración de Datos para el Dueño (Owner Dashboard).
 * Permite importar y exportar datos masivos desde Excel, Word, PDF, JSON, CSV y Texto.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { MigrationService } from '../../../services/migration.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { exportToExcel, exportToPDF, exportToJSON, exportToCSV } from '../../../utils/export.js';

export class MigrationView extends Component {
  constructor(params = {}) {
    super(params);

    this.state = {
      activeTab: 'import', // 'import' | 'export' | 'templates'
      selectedEntity: 'products',
      importMode: 'append', // 'append' | 'overwrite'
      parsedFile: null, // { filename, fileType, rows, headers }
      columnMapping: {}, // maps targetField -> sourceHeader
      validatedResult: null, // { validRows, warnings, totalParsed }
      isProcessing: false,
      progressPercent: 0,
      migrationReport: null // { successCount, total, time }
    };

    this.layout = new PageLayout({
      title: 'Migración y Central de Datos',
      subtitle: 'Importa masivamente o exporta información en Excel, Word, PDF, JSON, CSV y Texto para tu negocio.',
      actionHTML: `
        <div class="d-flex gap-2">
          <button class="btn btn-secondary btn-sm" id="btn-refresh-migration">
            🔄 Sincronizar
          </button>
        </div>
      `,
      contentHTML: `<div id="migration-view-root"></div>`
    });
  }

  render() {
    const { activeTab, selectedEntity, parsedFile, columnMapping, validatedResult, isProcessing, progressPercent, migrationReport, importMode } = this.state;
    const schemas = MigrationService.ENTITY_SCHEMAS;
    const currentSchema = schemas[selectedEntity] || schemas.products;

    return `
      <div class="d-flex flex-column gap-5">
        
        <!-- Navigation Tabs -->
        <div class="d-flex border-b border-border gap-2" style="border-bottom: 2px solid var(--color-border);">
          <button class="btn ${activeTab === 'import' ? 'btn-primary' : 'btn-secondary'} btn-sm migration-tab-btn" data-tab="import" style="padding: 10px 18px; font-weight: 600;">
            📥 Importar y Migrar Documentos
          </button>
          <button class="btn ${activeTab === 'export' ? 'btn-primary' : 'btn-secondary'} btn-sm migration-tab-btn" data-tab="export" style="padding: 10px 18px; font-weight: 600;">
            📤 Exportar Datos del Sistema
          </button>
          <button class="btn ${activeTab === 'templates' ? 'btn-primary' : 'btn-secondary'} btn-sm migration-tab-btn" data-tab="templates" style="padding: 10px 18px; font-weight: 600;">
            📄 Plantillas de Ejemplo
          </button>
        </div>

        ${activeTab === 'import' ? this.renderImportTab(currentSchema) : ''}
        ${activeTab === 'export' ? this.renderExportTab() : ''}
        ${activeTab === 'templates' ? this.renderTemplatesTab() : ''}

      </div>
    `;
  }

  /**
   * Render Import Tab markup
   */
  renderImportTab(currentSchema) {
    const { selectedEntity, parsedFile, columnMapping, validatedResult, isProcessing, progressPercent, migrationReport, importMode } = this.state;
    const schemas = MigrationService.ENTITY_SCHEMAS;

    return `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <!-- Left Panel: Entity selection & Upload -->
        <div class="card p-5 lg:col-span-1 d-flex flex-column gap-4" style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg);">
          
          <div>
            <h3 class="text-md font-bold mb-1" style="color: var(--color-accent);">1. Selecciona la Entidad Destino</h3>
            <p class="text-xs text-secondary">¿Qué datos deseas migrar a tu base de datos?</p>
          </div>

          <div class="form-group mb-0">
            <select id="select-migration-entity" class="input input-md" style="background: var(--color-bg-tertiary); color: var(--color-text-primary); border: 1px solid var(--color-border); font-weight: 600;">
              ${Object.entries(schemas).map(([key, item]) => `
                <option value="${key}" ${selectedEntity === key ? 'selected' : ''}>
                  ${item.icon} ${item.label}
                </option>
              `).join('')}
            </select>
          </div>

          <div style="border-top: 1px dashed var(--color-border); padding-top: var(--space-3);">
            <h3 class="text-md font-bold mb-1" style="color: var(--color-accent);">2. Sube tu Documento o Archivo</h3>
            <p class="text-xs text-secondary mb-3">Soporta Excel (.xlsx, .csv), Word (.docx), PDF (.pdf), JSON (.json) y Texto (.txt)</p>

            <!-- Dropzone -->
            <div id="migration-dropzone" class="p-6 text-center border-2 border-dashed border-border rounded-lg hover-lift" style="background: var(--color-bg-tertiary); cursor: pointer; transition: all 0.2s ease;">
              <div style="font-size: 2.5rem; margin-bottom: 8px;">📂</div>
              <p style="font-weight: 600; font-size: 0.9rem; color: var(--color-text-primary);" id="dropzone-text">
                Arrastra tu archivo aquí o haz clic para examinar
              </p>
              <span class="text-xs text-secondary mt-1 block">Formatos: .xlsx, .xls, .csv, .docx, .pdf, .json, .txt</span>
              <input type="file" id="migration-file-input" accept=".xlsx,.xls,.csv,.docx,.pdf,.json,.txt" style="display: none;" />
            </div>
          </div>

          <!-- Manual Text / JSON Paste Option -->
          <div style="border-top: 1px dashed var(--color-border); padding-top: var(--space-3);">
            <details class="text-xs">
              <summary style="cursor: pointer; font-weight: 600; color: var(--color-text-secondary);" class="mb-2">
                ✍️ O pega texto plano / JSON directamente
              </summary>
              <textarea id="migration-raw-paste" class="input p-3" rows="4" placeholder="Pega aquí los datos separados por comas, tabuladores o formato JSON..." style="font-family: monospace; font-size: 0.78rem; width: 100%; background: var(--color-bg-tertiary); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-md);"></textarea>
              <button class="btn btn-secondary btn-sm mt-2" id="btn-parse-raw-paste" style="width: 100%;">Procesar Texto Pegado</button>
            </details>
          </div>

          <!-- Import Mode Toggle -->
          <div style="border-top: 1px dashed var(--color-border); padding-top: var(--space-3);">
            <label class="form-label mb-2" style="font-weight: 600; font-size: 0.82rem; color: var(--color-text-primary);">Modo de Importación:</label>
            <div class="d-flex flex-column gap-2">
              <label class="d-flex align-items-center gap-2" style="font-size: 0.82rem; cursor: pointer;">
                <input type="radio" name="importMode" value="append" ${importMode === 'append' ? 'checked' : ''} class="import-mode-radio" />
                <span><strong>Agregar (Anexar)</strong> — Conserva los datos anteriores</span>
              </label>
              <label class="d-flex align-items-center gap-2" style="font-size: 0.82rem; cursor: pointer;">
                <input type="radio" name="importMode" value="overwrite" ${importMode === 'overwrite' ? 'checked' : ''} class="import-mode-radio" />
                <span style="color: var(--color-danger);"><strong>Sobrescribir</strong> — Limpia la colección e inserta lo nuevo</span>
              </label>
            </div>
          </div>

        </div>

        <!-- Right Panel: Mapping, Preview & Execution -->
        <div class="card p-5 lg:col-span-2 d-flex flex-column gap-4" style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg);">
          
          ${parsedFile ? `
            <div class="d-flex justify-between align-items-center bg-tertiary p-3 rounded" style="background: var(--color-bg-tertiary); border: 1px solid var(--color-border); border-radius: var(--radius-md);">
              <div class="d-flex align-items-center gap-2">
                <span style="font-size: 1.4rem;">📄</span>
                <div>
                  <div style="font-weight: 700; font-size: 0.9rem;">${parsedFile.filename}</div>
                  <div style="font-size: 0.75rem; color: var(--color-text-secondary);">${parsedFile.rows.length} filas detectadas &bull; Formato: ${parsedFile.fileType}</div>
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-cancel-file">✕ Cambiar archivo</button>
            </div>

            <!-- Smart Column Mapping Section -->
            <div>
              <h3 class="text-md font-bold mb-2" style="color: var(--color-accent);">3. Mapeo de Columnas (Revisión)</h3>
              <p class="text-xs text-secondary mb-3">Verifica que las columnas del archivo coincidan con los campos del sistema.</p>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3" style="max-height: 220px; overflow-y: auto; padding-right: 4px;">
                ${currentSchema.fields.map(field => `
                  <div class="p-2 border rounded" style="background: var(--color-bg-tertiary); border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                    <label class="form-label mb-1" style="font-size: 0.78rem; font-weight: 600; display: flex; justify-content: space-between;">
                      <span>${field.label} ${currentSchema.required.includes(field.key) ? '<span style="color:var(--color-danger)">*</span>' : ''}</span>
                    </label>
                    <select class="input input-sm column-map-select" data-field="${field.key}" style="width: 100%; background: var(--color-bg-secondary); color: var(--color-text-primary); border: 1px solid var(--color-border);">
                      <option value="">-- No incluir / Omitir --</option>
                      ${parsedFile.headers.map(h => `
                        <option value="${h}" ${columnMapping[field.key] === h ? 'selected' : ''}>${h}</option>
                      `).join('')}
                    </select>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Preview Data Table -->
            <div>
              <div class="d-flex justify-between align-items-center mb-2">
                <h3 class="text-md font-bold" style="color: var(--color-accent);">4. Vista Previa de Datos a Importar</h3>
                <span class="badge badge-info" style="font-size: 0.75rem;">${validatedResult ? validatedResult.validRows.length : 0} registros válidos</span>
              </div>

              ${validatedResult && validatedResult.warnings.length > 0 ? `
                <div class="p-3 mb-3 rounded" style="background: rgba(245, 158, 11, 0.1); border: 1px solid var(--color-warning); font-size: 0.78rem; color: var(--color-warning);">
                  <strong>⚠️ Advertencias de validación (${validatedResult.warnings.length}):</strong>
                  <ul class="mt-1 pl-4 mb-0" style="max-height: 80px; overflow-y: auto;">
                    ${validatedResult.warnings.slice(0, 5).map(w => `<li>${w}</li>`).join('')}
                    ${validatedResult.warnings.length > 5 ? `<li>... y ${validatedResult.warnings.length - 5} más</li>` : ''}
                  </ul>
                </div>
              ` : ''}

              <div class="table-responsive" style="max-height: 200px; overflow: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                <table class="emp-table" style="width: 100%; border-collapse: collapse; font-size: 0.78rem;">
                  <thead>
                    <tr style="background: var(--color-bg-tertiary);">
                      ${currentSchema.fields.map(f => `<th style="padding: 6px 10px; border-bottom: 1px solid var(--color-border); text-align: left;">${f.label}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${(validatedResult ? validatedResult.validRows.slice(0, 5) : []).map(row => `
                      <tr style="border-bottom: 1px solid var(--color-border);">
                        ${currentSchema.fields.map(f => `<td style="padding: 6px 10px;">${row[f.key] !== undefined ? row[f.key] : ''}</td>`).join('')}
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Execution Action -->
            <div style="border-top: 1px dashed var(--color-border); padding-top: var(--space-3);" class="d-flex justify-between align-items-center">
              <div>
                <span class="text-xs text-secondary">
                  Destino: <strong>${currentSchema.label}</strong> &bull; Modo: <strong>${importMode === 'overwrite' ? 'Sobrescribir' : 'Agregar'}</strong>
                </span>
              </div>
              <button class="btn btn-primary btn-md" id="btn-start-migration" ${isProcessing ? 'disabled' : ''} style="padding: 10px 24px; font-weight: 700;">
                🚀 ${isProcessing ? 'Migrando datos...' : 'Confirmar e Iniciar Migración'}
              </button>
            </div>

            ${isProcessing ? `
              <div class="mt-3">
                <div class="d-flex justify-between text-xs mb-1">
                  <span>Procesando registros...</span>
                  <span>${progressPercent}%</span>
                </div>
                <div style="width: 100%; height: 8px; background: var(--color-bg-tertiary); border-radius: 4px; overflow: hidden;">
                  <div style="width: ${progressPercent}%; height: 100%; background: var(--color-accent); transition: width 0.2s ease;"></div>
                </div>
              </div>
            ` : ''}

          ` : `
            <div class="p-8 text-center" style="margin: auto 0; color: var(--color-text-tertiary);">
              <div style="font-size: 3rem; margin-bottom: 12px; opacity: 0.6;">📥</div>
              <h4 class="text-lg font-semibold" style="color: var(--color-text-primary);">Asistente de Migración de Datos</h4>
              <p class="text-sm text-secondary mt-1" style="max-width: 420px; margin: 0 auto;">
                Sube tu archivo Excel, Word, PDF, JSON o Texto desde el panel izquierdo. El sistema detectará las columnas y te mostrará la vista previa antes de guardar.
              </p>
            </div>
          `}

          ${migrationReport ? `
            <div class="p-4 mt-3 rounded" style="background: rgba(52, 211, 153, 0.1); border: 1px solid var(--color-success); border-radius: var(--radius-md);">
              <div class="d-flex align-items-center gap-2" style="color: var(--color-success); font-weight: 700; font-size: 1rem;">
                <span>✅</span> Migración Completada Exitosamente
              </div>
              <p class="text-xs text-secondary mt-1">
                Se han importado <strong>${migrationReport.successCount} de ${migrationReport.total}</strong> registros en la entidad <strong>${currentSchema.label}</strong>.
              </p>
            </div>
          ` : ''}

        </div>

      </div>
    `;
  }

  /**
   * Render Export Tab markup
   */
  renderExportTab() {
    const schemas = MigrationService.ENTITY_SCHEMAS;

    return `
      <div class="d-flex flex-column gap-4">
        <div>
          <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">Central de Exportación de Datos</h3>
          <p class="text-sm text-secondary">Descarga tus colecciones en Excel (.xlsx), PDF, JSON o CSV en un solo clic.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${Object.entries(schemas).map(([key, item]) => `
            <div class="card p-5 hover-lift d-flex flex-column justify-between gap-4" style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg);">
              <div>
                <div class="d-flex align-items-center gap-2 mb-2">
                  <span style="font-size: 1.8rem;">${item.icon}</span>
                  <h4 class="font-bold text-md">${item.label}</h4>
                </div>
                <p class="text-xs text-secondary">Exporta toda la información almacenada en el sistema para esta colección.</p>
              </div>

              <div class="d-flex gap-2 flex-wrap" style="border-top: 1px dashed var(--color-border); padding-top: var(--space-3);">
                <button class="btn btn-secondary btn-sm btn-export-action" data-entity="${key}" data-format="excel" style="flex:1;">
                  📊 Excel
                </button>
                <button class="btn btn-secondary btn-sm btn-export-action" data-entity="${key}" data-format="pdf" style="flex:1;">
                  📄 PDF
                </button>
                <button class="btn btn-secondary btn-sm btn-export-action" data-entity="${key}" data-format="json" style="flex:1;">
                  { } JSON
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render Templates Tab markup
   */
  renderTemplatesTab() {
    const schemas = MigrationService.ENTITY_SCHEMAS;

    return `
      <div class="d-flex flex-column gap-4">
        <div>
          <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">Plantillas Modelo de Ejemplo</h3>
          <p class="text-sm text-secondary">Descarga formatos de ejemplo estructurados para preparar tus datos antes de importarlos.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${Object.entries(schemas).map(([key, item]) => `
            <div class="card p-5 hover-lift d-flex flex-column justify-between gap-4" style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg);">
              <div>
                <div class="d-flex align-items-center gap-2 mb-2">
                  <span style="font-size: 1.8rem;">${item.icon}</span>
                  <h4 class="font-bold text-md">${item.label}</h4>
                </div>
                <span class="text-xs text-secondary">Campos principales: ${item.fields.map(f => f.label).slice(0, 3).join(', ')}...</span>
              </div>

              <div class="d-flex gap-2" style="border-top: 1px dashed var(--color-border); padding-top: var(--space-3);">
                <button class="btn btn-primary btn-sm btn-download-template" data-entity="${key}" data-format="csv" style="flex:1;">
                  ⬇️ Plantilla CSV
                </button>
                <button class="btn btn-secondary btn-sm btn-download-template" data-entity="${key}" data-format="json" style="flex:1;">
                  ⬇️ Plantilla JSON
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  mount() {
    const element = this.layout.mount();
    const container = element.querySelector('#migration-view-root');
    if (container) {
      container.appendChild(this.renderDOMNode());
    }
    this.afterMount();
    return element;
  }

  renderDOMNode() {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this.render().trim();
    return tempDiv.firstElementChild || tempDiv;
  }

  updateView() {
    const container = this.layout.$('#migration-view-root');
    if (container) {
      container.innerHTML = '';
      container.appendChild(this.renderDOMNode());
      this.afterMount();
    }
  }

  afterMount() {
    // 1. Tab switches
    this.layout.$$('.migration-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.activeTab = btn.dataset.tab;
        this.updateView();
      });
    });

    // 2. Entity select change
    const entitySelect = this.layout.$('#select-migration-entity');
    if (entitySelect) {
      entitySelect.addEventListener('change', (e) => {
        this.state.selectedEntity = e.target.value;
        if (this.state.parsedFile) {
          this.recomputeMappingAndValidation();
        }
        this.updateView();
      });
    }

    // 3. Dropzone & File Input binding
    const dropzone = this.layout.$('#migration-dropzone');
    const fileInput = this.layout.$('#migration-file-input');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--color-accent)';
        dropzone.style.background = 'rgba(99, 102, 241, 0.1)';
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'var(--color-border)';
        dropzone.style.background = 'var(--color-bg-tertiary)';
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--color-border)';
        dropzone.style.background = 'var(--color-bg-tertiary)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.processFile(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.processFile(e.target.files[0]);
        }
      });
    }

    // 4. Raw paste button
    const parsePasteBtn = this.layout.$('#btn-parse-raw-paste');
    const rawPasteArea = this.layout.$('#migration-raw-paste');
    if (parsePasteBtn && rawPasteArea) {
      parsePasteBtn.addEventListener('click', () => {
        const text = rawPasteArea.value.trim();
        if (!text) {
          NotificationService.warning('Por favor pega el texto o JSON que deseas procesar.');
          return;
        }
        try {
          let rows = [];
          let headers = [];
          if (text.startsWith('[') || text.startsWith('{')) {
            const parsed = JSON.parse(text);
            rows = Array.isArray(parsed) ? parsed : [parsed];
            headers = rows.length > 0 ? Object.keys(rows[0]) : [];
          } else {
            const parsed = MigrationService.parseCSVText(text);
            rows = parsed.rows;
            headers = parsed.headers;
          }
          this.state.parsedFile = { filename: 'Texto_Pegado.txt', fileType: 'TEXT', rows, headers };
          this.recomputeMappingAndValidation();
          this.updateView();
        } catch (e) {
          NotificationService.error('Formato de texto no válido: ' + e.message);
        }
      });
    }

    // 5. Cancel file button
    const cancelFileBtn = this.layout.$('#btn-cancel-file');
    if (cancelFileBtn) {
      cancelFileBtn.addEventListener('click', () => {
        this.state.parsedFile = null;
        this.state.validatedResult = null;
        this.state.migrationReport = null;
        this.updateView();
      });
    }

    // 6. Import Mode radios
    this.layout.$$('.import-mode-radio').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.state.importMode = e.target.value;
      });
    });

    // 7. Column map select changes
    this.layout.$$('.column-map-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const targetField = select.dataset.field;
        this.state.columnMapping[targetField] = e.target.value;
        this.revalidateData();
        this.updateView();
      });
    });

    // 8. Start Migration Execution button
    const startMigrationBtn = this.layout.$('#btn-start-migration');
    if (startMigrationBtn) {
      startMigrationBtn.addEventListener('click', () => this.runMigration());
    }

    // 9. Export Buttons
    this.layout.$$('.btn-export-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const entity = btn.dataset.entity;
        const format = btn.dataset.format;
        this.exportData(entity, format);
      });
    });

    // 10. Download Template Buttons
    this.layout.$$('.btn-download-template').forEach(btn => {
      btn.addEventListener('click', () => {
        const entity = btn.dataset.entity;
        const format = btn.dataset.format;
        MigrationService.downloadTemplate(entity, format);
        NotificationService.success(`Descargando plantilla modelo para ${entity}...`);
      });
    });

    // 11. Refresh button
    const refreshBtn = this.layout.$('#btn-refresh-migration');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        NotificationService.info('Sincronizando estado de datos...');
        this.updateView();
      });
    }
  }

  async processFile(file) {
    try {
      NotificationService.info(`Leyendo archivo "${file.name}"...`);
      const parsed = await MigrationService.parseFile(file);
      this.state.parsedFile = parsed;
      this.recomputeMappingAndValidation();
      NotificationService.success(`Archivo "${file.name}" procesado. ${parsed.rows.length} filas detectadas.`);
      this.updateView();
    } catch (e) {
      NotificationService.error(e.message);
    }
  }

  recomputeMappingAndValidation() {
    if (!this.state.parsedFile) return;
    const { headers, rows } = this.state.parsedFile;
    const entityKey = this.state.selectedEntity;
    this.state.columnMapping = MigrationService.autoDetectColumnMapping(headers, entityKey);
    this.revalidateData();
  }

  revalidateData() {
    if (!this.state.parsedFile) return;
    const { rows } = this.state.parsedFile;
    const entityKey = this.state.selectedEntity;
    const mapping = this.state.columnMapping;
    this.state.validatedResult = MigrationService.validateAndTransform(rows, mapping, entityKey);
  }

  async runMigration() {
    if (!this.state.validatedResult || !this.state.validatedResult.validRows.length) {
      NotificationService.warning('No hay filas válidas para migrar.');
      return;
    }

    const { validRows } = this.state.validatedResult;
    const entityKey = this.state.selectedEntity;
    const mode = this.state.importMode;

    if (mode === 'overwrite') {
      if (!confirm(`⚠️ ATENCIÓN: ¿Seguro que deseas SOBRESCRIBIR la colección "${entityKey}"? Se borrarán todos los datos anteriores de esta sección.`)) {
        return;
      }
    }

    this.state.isProcessing = true;
    this.state.progressPercent = 10;
    this.updateView();

    try {
      // Simulate progress updates
      const interval = setInterval(() => {
        if (this.state.progressPercent < 90) {
          this.state.progressPercent += 20;
          this.updateView();
        }
      }, 300);

      const result = await MigrationService.executeMigration(entityKey, validRows, mode);
      clearInterval(interval);

      this.state.isProcessing = false;
      this.state.progressPercent = 100;
      this.state.migrationReport = {
        successCount: result.successCount,
        total: validRows.length
      };

      NotificationService.success(`¡Migración de ${result.successCount} registros en ${entityKey} completada!`);
      this.updateView();

    } catch (e) {
      this.state.isProcessing = false;
      console.error('Error in migration execution:', e);
      NotificationService.error('Fallo al migrar los datos: ' + e.message);
      this.updateView();
    }
  }

  async exportData(entityKey, format) {
    try {
      const schema = MigrationService.ENTITY_SCHEMAS[entityKey];
      if (!schema) return;

      NotificationService.info(`Obteniendo datos de ${schema.label}...`);
      const data = await FirestoreService.getAll(schema.collection);

      if (!data || !data.length) {
        NotificationService.warning(`No hay registros guardados en ${schema.label} para exportar.`);
        return;
      }

      const filename = `Exportacion_${entityKey}_${new Date().toISOString().split('T')[0]}`;

      if (format === 'excel') {
        exportToExcel(data, `${filename}.xlsx`);
      } else if (format === 'pdf') {
        exportToPDF(data, `${filename}.pdf`);
      } else if (format === 'json') {
        exportToJSON(data, `${filename}.json`);
      } else if (format === 'csv') {
        exportToCSV(data, `${filename}.csv`);
      }

      NotificationService.success(`Archivo de exportación generado en formato ${format.toUpperCase()}.`);

    } catch (e) {
      console.error('[MigrationView] Export failed:', e);
      NotificationService.error('Error al exportar datos: ' + e.message);
    }
  }
}
