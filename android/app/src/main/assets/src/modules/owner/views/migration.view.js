/**
 * @file migration.view.js
 * @description Vista del apartado de Migración de Datos para el Dueño (Owner Dashboard).
 * Implementa el flujo guiado por etapas (Wizard de 8 pasos):
 * 1. Selección de archivo (PDF, Excel, Word, JSON, CSV, TXT)
 * 2. Extracción y Análisis del documento (Posicional PDF)
 * 3. Detección Inteligente del tipo de datos
 * 4. Mapeo de columnas con indicadores de confianza
 * 5. Vista previa y Validación determinista
 * 6. Gestión de duplicados y resolución de conflictos
 * 7. Confirmación e Verificación de Tenant (Empresa/Sucursal)
 * 8. Ejecución por lotes y Reporte final con historial auditado.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { MigrationService } from '../../../services/migration.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { exportToExcel, exportToPDF, exportToJSON, exportToCSV } from '../../../utils/export.js';
import { I18nService } from '../../../services/i18n.service.js';

export class MigrationView extends Component {
  constructor(params = {}) {
    super(params);

    this.state = {
      activeTab: 'import', // 'import' | 'export' | 'templates' | 'history'
      
      // Wizard State (Steps 1 to 8)
      wizardStep: 1,
      selectedFile: null,
      fileParseResult: null, // { filename, fileType, rows, headers, rawText, extractionMode }
      detectionResult: null, // { entity, confidence, label, reason }
      selectedEntity: 'products',
      columnMapping: {}, // maps targetField -> sourceHeader
      confidenceScores: {},
      validatedResult: null, // { validRows, invalidRows, warnings, totalParsed }
      duplicateResult: null, // { rowsWithDuplicateStatus, duplicateCount }
      importMode: 'append', // 'append' | 'overwrite'
      
      // Execution State
      isProcessing: false,
      progressPercent: 0,
      progressText: '',
      migrationReport: null, // { successCount, updatedCount, skippedCount, total }
      
      // History State
      migrationHistory: []
    };

    this.layout = new PageLayout({
      title: I18nService.t('nav_migration') || 'Migración y Central de Datos',
      subtitle: I18nService.t('mig_subtitle') || 'Importa masivamente documentos (PDF, Excel, Word), gestiona mapeos y transfiere datos hacia tu negocio.',
      actionHTML: `
        <div class="d-flex gap-2">
          <button class="btn btn-secondary btn-sm" id="btn-refresh-migration">
            🔄 ${I18nService.t('mig_sync') || 'Sincronizar'}
          </button>
        </div>
      `,
      contentHTML: `<div id="migration-view-root"></div>`
    });
  }

  render() {
    const { activeTab } = this.state;

    return `
      <div class="d-flex flex-column gap-5">
        
        <!-- Navigation Tabs -->
        <div class="d-flex border-b border-border gap-2 flex-wrap" style="border-bottom: 2px solid var(--color-border); padding-bottom: 4px;">
          <button class="btn ${activeTab === 'import' ? 'btn-primary' : 'btn-secondary'} btn-sm migration-tab-btn" data-tab="import" style="padding: 10px 18px; font-weight: 600;">
            📥 ${I18nService.t('mig_tab_import') || 'Importar y Migrar Documentos'}
          </button>
          <button class="btn ${activeTab === 'export' ? 'btn-primary' : 'btn-secondary'} btn-sm migration-tab-btn" data-tab="export" style="padding: 10px 18px; font-weight: 600;">
            📤 ${I18nService.t('mig_tab_export') || 'Exportar Datos del Sistema'}
          </button>
          <button class="btn ${activeTab === 'templates' ? 'btn-primary' : 'btn-secondary'} btn-sm migration-tab-btn" data-tab="templates" style="padding: 10px 18px; font-weight: 600;">
            📄 ${I18nService.t('mig_tab_templates') || 'Plantillas de Ejemplo'}
          </button>
          <button class="btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'} btn-sm migration-tab-btn" data-tab="history" style="padding: 10px 18px; font-weight: 600;">
            📜 ${I18nService.t('mig_tab_history') || 'Historial y Auditoría'}
          </button>
        </div>

        ${activeTab === 'import' ? this.renderImportWizard() : ''}
        ${activeTab === 'export' ? this.renderExportTab() : ''}
        ${activeTab === 'templates' ? this.renderTemplatesTab() : ''}
        ${activeTab === 'history' ? this.renderHistoryTab() : ''}

      </div>
    `;
  }

  /**
   * Render 8-Step Import Wizard Markup
   */
  renderImportWizard() {
    const { wizardStep } = this.state;

    const stepTitles = [
      '1. Seleccionar Archivo',
      '2. Analizar Documento',
      '3. Detectar Información',
      '4. Asignar Datos (Mapeo)',
      '5. Vista Previa y Validación',
      '6. Control de Duplicados',
      '7. Confirmar Importación',
      '8. Resultado'
    ];

    return `
      <div class="d-flex flex-column gap-4">
        
        <!-- Step Progress Tracker Bar -->
        <div class="card p-4" style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg);">
          <div class="d-flex justify-between align-items-center mb-3">
            <h3 class="text-md font-bold" style="color: var(--color-accent);">Asistente Inteligente de Migración</h3>
            <span class="badge badge-info" style="font-weight: 700; font-size: 0.8rem;">Paso ${wizardStep} de 8</span>
          </div>

          <!-- Wizard Breadcrumbs -->
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            ${stepTitles.map((title, idx) => {
              const stepNum = idx + 1;
              const isActive = wizardStep === stepNum;
              const isCompleted = wizardStep > stepNum;
              return `
                <div class="p-2 rounded text-center" style="
                  background: ${isActive ? 'var(--color-accent)' : isCompleted ? 'rgba(52, 211, 153, 0.15)' : 'var(--color-bg-tertiary)'};
                  color: ${isActive ? '#ffffff' : isCompleted ? 'var(--color-success)' : 'var(--color-text-secondary)'};
                  border: 1px solid ${isActive ? 'var(--color-accent)' : isCompleted ? 'var(--color-success)' : 'var(--color-border)'};
                  font-size: 0.72rem;
                  font-weight: ${isActive ? '700' : '500'};
                  transition: all 0.2s ease;
                ">
                  <div>${isCompleted ? '✓' : stepNum}</div>
                  <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title.split('. ')[1]}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Wizard Step Content Container -->
        <div class="card p-6" style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); min-height: 380px;">
          ${this.renderWizardStepContent()}
        </div>

      </div>
    `;
  }

  renderWizardStepContent() {
    const {
      wizardStep,
      selectedFile,
      fileParseResult,
      detectionResult,
      selectedEntity,
      columnMapping,
      confidenceScores,
      validatedResult,
      duplicateResult,
      importMode,
      isProcessing,
      progressPercent,
      progressText,
      migrationReport
    } = this.state;

    const schemas = MigrationService.ENTITY_SCHEMAS;
    const currentSchema = schemas[selectedEntity] || schemas.products;
    const currentUser = GlobalStore.getState().currentUser || {};

    switch (wizardStep) {

      // ─── PASO 1: SELECCIONAR ARCHIVO ───────────────────────────────────────
      case 1:
        return `
          <div class="d-flex flex-column gap-4 style="max-width: 680px; margin: 0 auto;">
            <div class="text-center">
              <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">Paso 1: Selecciona o Arrastra tu Documento</h3>
              <p class="text-sm text-secondary mt-1">Soporta documentos PDF (.pdf), hojas Excel (.xlsx, .csv), Word (.docx), JSON y Texto plano.</p>
            </div>

            <!-- Dropzone -->
            <div id="migration-dropzone" class="p-8 text-center border-2 border-dashed border-border rounded-lg hover-lift" style="background: var(--color-bg-tertiary); cursor: pointer; border-radius: var(--radius-lg);">
              <div style="font-size: 3.2rem; margin-bottom: 12px;">📑</div>
              <p style="font-weight: 700; font-size: 1rem; color: var(--color-text-primary);" id="dropzone-text">
                ${selectedFile ? `Archivo seleccionado: <strong>${selectedFile.name}</strong>` : 'Haz clic para explorar o arrastra tu archivo PDF aquí'}
              </p>
              <span class="text-xs text-secondary mt-2 block">Formatos permitidos: .pdf, .xlsx, .xls, .csv, .docx, .json, .txt</span>
              <input type="file" id="migration-file-input" accept=".pdf,.xlsx,.xls,.csv,.docx,.json,.txt" style="display: none;" />
            </div>

            <!-- Manual Text / JSON Paste Option -->
            <div class="p-4 border rounded" style="background: var(--color-bg-tertiary); border: 1px solid var(--color-border); border-radius: var(--radius-md);">
              <details class="text-xs">
                <summary style="cursor: pointer; font-weight: 600; color: var(--color-text-primary);" class="mb-2">
                  ✍️ O pega el texto del documento directamente (Tabuladores, CSV o JSON)
                </summary>
                <textarea id="migration-raw-paste" class="input p-3 mt-2" rows="4" placeholder="Pega los datos aquí..." style="font-family: monospace; font-size: 0.8rem; width: 100%; background: var(--color-bg-secondary); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-md);"></textarea>
                <button class="btn btn-secondary btn-sm mt-2" id="btn-parse-raw-paste" style="width: 100%;">Procesar Texto Pegado</button>
              </details>
            </div>

            <div class="d-flex justify-end mt-2">
              <button class="btn btn-primary btn-md" id="btn-step1-next" ${!selectedFile && !fileParseResult ? 'disabled' : ''} style="padding: 10px 24px; font-weight: 700;">
                Siguiente: Analizar Documento ➔
              </button>
            </div>
          </div>
        `;

      // ─── PASO 2: ANALIZAR DOCUMENTO ─────────────────────────────────────────
      case 2:
        return `
          <div class="d-flex flex-column align-items-center justify-center p-8 text-center" style="min-height: 280px;">
            <div class="spinner-border text-accent mb-4" role="status" style="width: 3rem; height: 3rem; border-width: 4px; border-color: var(--color-accent) transparent transparent transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">Analizando e Interpretando el Documento...</h3>
            <p class="text-sm text-secondary mt-2" style="max-width: 480px;">
              Extrayendo coordenadas posicionales de texto y tablas posicionales. Identificando columnas de precios, montos, fechas y descripciones...
            </p>
          </div>
        `;

      // ─── PASO 3: DETECTAR INFORMACIÓN ───────────────────────────────────────
      case 3:
        return `
          <div class="d-flex flex-column gap-4" style="max-width: 680px; margin: 0 auto;">
            <div class="text-center">
              <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">Paso 3: Detección Automática de Información</h3>
              <p class="text-sm text-secondary mt-1">El sistema ha analizado la estructura y contenido de tu documento.</p>
            </div>

            <div class="p-5 border rounded-lg" style="background: rgba(99, 102, 241, 0.08); border: 1px solid var(--color-accent); border-radius: var(--radius-lg);">
              <div class="d-flex align-items-center justify-between mb-3">
                <div class="d-flex align-items-center gap-2">
                  <span style="font-size: 2rem;">${currentSchema.icon || '📦'}</span>
                  <div>
                    <h4 class="font-bold text-md" style="color: var(--color-text-primary);">${detectionResult ? detectionResult.label : currentSchema.label}</h4>
                    <span class="text-xs text-secondary">${detectionResult ? detectionResult.reason : 'Tipo de datos sugerido'}</span>
                  </div>
                </div>
                <div class="badge badge-success" style="font-size: 0.85rem; font-weight: 700; padding: 6px 12px;">
                  ✓ Confianza: ${detectionResult ? detectionResult.confidence : 90}%
                </div>
              </div>
              <p class="text-xs text-secondary">Se han detectado <strong>${fileParseResult ? fileParseResult.rows.length : 0} registros</strong> en el documento "${fileParseResult ? fileParseResult.filename : ''}".</p>
            </div>

            <div class="form-group">
              <label class="form-label font-bold text-sm mb-2" style="color: var(--color-text-primary);">Si la detección no es correcta, selecciona el módulo destino manualmente:</label>
              <select id="select-migration-entity" class="input input-md" style="background: var(--color-bg-tertiary); color: var(--color-text-primary); border: 1px solid var(--color-border); font-weight: 600; width: 100%;">
                ${Object.entries(schemas).map(([key, item]) => `
                  <option value="${key}" ${selectedEntity === key ? 'selected' : ''}>
                    ${item.icon} ${item.label} (${item.collection})
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="d-flex justify-between mt-4">
              <button class="btn btn-secondary btn-md" id="btn-wizard-prev">⬅️ Volver</button>
              <button class="btn btn-primary btn-md" id="btn-step3-next" style="padding: 10px 24px; font-weight: 700;">
                Siguiente: Mapear Columnas ➔
              </button>
            </div>
          </div>
        `;

      // ─── PASO 4: ASIGNAR DATOS (MAPEO) ──────────────────────────────────────
      case 4:
        return `
          <div class="d-flex flex-column gap-4">
            <div>
              <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">Paso 4: Mapeo de Columnas (Revisión)</h3>
              <p class="text-sm text-secondary">Verifica que las columnas extraídas del PDF coincidan con los campos de Ultra Administrador para <strong>${currentSchema.label}</strong>.</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3" style="max-height: 320px; overflow-y: auto; padding-right: 4px;">
              ${currentSchema.fields.map(field => {
                const score = confidenceScores[field.key] || 0;
                const scoreColor = score >= 90 ? 'var(--color-success)' : score >= 70 ? 'var(--color-warning)' : 'var(--color-text-secondary)';
                return `
                  <div class="p-3 border rounded" style="background: var(--color-bg-tertiary); border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                    <div class="d-flex justify-between align-items-center mb-1">
                      <label class="form-label mb-0 font-bold" style="font-size: 0.82rem; color: var(--color-text-primary);">
                        ${field.label} ${currentSchema.required.includes(field.key) ? '<span style="color:var(--color-danger)">*</span>' : ''}
                      </label>
                      ${score > 0 ? `<span style="font-size: 0.7rem; color: ${scoreColor}; font-weight: 700;">✓ Coincidencia: ${score}%</span>` : ''}
                    </div>
                    <select class="input input-sm column-map-select mt-1" data-field="${field.key}" style="width: 100%; background: var(--color-bg-secondary); color: var(--color-text-primary); border: 1px solid var(--color-border);">
                      <option value="">-- Omitir campo --</option>
                      ${fileParseResult.headers.map(h => `
                        <option value="${h}" ${columnMapping[field.key] === h ? 'selected' : ''}>${h}</option>
                      `).join('')}
                    </select>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="d-flex justify-between mt-3">
              <button class="btn btn-secondary btn-md" id="btn-wizard-prev">⬅️ Volver</button>
              <button class="btn btn-primary btn-md" id="btn-step4-next" style="padding: 10px 24px; font-weight: 700;">
                Siguiente: Validar Registros ➔
              </button>
            </div>
          </div>
        `;

      // ─── PASO 5: VISTA PREVIA Y VALIDACIÓN ─────────────────────────────────
      case 5:
        const validRows = validatedResult ? validatedResult.validRows : [];
        const invalidRows = validatedResult ? validatedResult.invalidRows : [];

        return `
          <div class="d-flex flex-column gap-4">
            <div class="d-flex justify-between align-items-center flex-wrap gap-2">
              <div>
                <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">Paso 5: Vista Previa y Validación Determinista</h3>
                <p class="text-sm text-secondary">Revisa los datos limpios y formateados antes de guardarlos en el sistema.</p>
              </div>
              <div class="d-flex gap-2">
                <span class="badge badge-success" style="font-size: 0.8rem; font-weight: 700;">✅ ${validRows.length} Válidos</span>
                ${invalidRows.length > 0 ? `<span class="badge badge-danger" style="font-size: 0.8rem; font-weight: 700;">❌ ${invalidRows.length} Con Errores</span>` : ''}
              </div>
            </div>

            ${validatedResult && validatedResult.warnings.length > 0 ? `
              <div class="p-3 rounded" style="background: rgba(245, 158, 11, 0.1); border: 1px solid var(--color-warning); font-size: 0.78rem; color: var(--color-warning);">
                <strong>⚠️ Advertencias de validación (${validatedResult.warnings.length}):</strong>
                <ul class="mt-1 pl-4 mb-0" style="max-height: 75px; overflow-y: auto;">
                  ${validatedResult.warnings.slice(0, 4).map(w => `<li>${w}</li>`).join('')}
                  ${validatedResult.warnings.length > 4 ? `<li>... y ${validatedResult.warnings.length - 4} advertencias más</li>` : ''}
                </ul>
              </div>
            ` : ''}

            <!-- Data Preview Table -->
            <div class="table-responsive" style="max-height: 250px; overflow: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md);">
              <table class="emp-table" style="width: 100%; border-collapse: collapse; font-size: 0.78rem;">
                <thead>
                  <tr style="background: var(--color-bg-tertiary); position: sticky; top: 0; z-index: 2;">
                    <th style="padding: 8px; border-bottom: 1px solid var(--color-border);">#</th>
                    ${currentSchema.fields.map(f => `<th style="padding: 8px 12px; border-bottom: 1px solid var(--color-border); text-align: left;">${f.label}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${validRows.slice(0, 10).map((row, i) => `
                    <tr style="border-bottom: 1px solid var(--color-border);">
                      <td style="padding: 8px; text-align: center; color: var(--color-text-secondary);">${i + 1}</td>
                      ${currentSchema.fields.map(f => `
                        <td style="padding: 8px 12px;">
                          ${f.key === 'purchasePrice' || f.key === 'price' || f.key === 'amount'
                            ? `<strong>C$ ${(row[f.key] || 0).toLocaleString()}</strong>`
                            : (row[f.key] !== undefined ? row[f.key] : '')}
                        </td>
                      `).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="d-flex justify-between mt-3">
              <button class="btn btn-secondary btn-md" id="btn-wizard-prev">⬅️ Volver</button>
              <button class="btn btn-primary btn-md" id="btn-step5-next" style="padding: 10px 24px; font-weight: 700;">
                Siguiente: Revisar Duplicados ➔
              </button>
            </div>
          </div>
        `;

      // ─── PASO 6: CONTROL DE DUPLICADOS ──────────────────────────────────────
      case 6:
        const dupRows = duplicateResult ? duplicateResult.rowsWithDuplicateStatus : [];
        const dupCount = duplicateResult ? duplicateResult.duplicateCount : 0;

        return `
          <div class="d-flex flex-column gap-4">
            <div>
              <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">Paso 6: Detección y Resolución de Duplicados</h3>
              <p class="text-sm text-secondary">El sistema ha comparado los datos del PDF con tu inventario actual en Ultra Administrador.</p>
            </div>

            <div class="p-4 rounded-lg d-flex align-items-center justify-between" style="background: ${dupCount > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(52, 211, 153, 0.1)'}; border: 1px solid ${dupCount > 0 ? 'var(--color-warning)' : 'var(--color-success)'};">
              <div class="d-flex align-items-center gap-3">
                <span style="font-size: 1.8rem;">${dupCount > 0 ? '⚠️' : '✅'}</span>
                <div>
                  <h4 class="font-bold text-sm" style="color: var(--color-text-primary);">${dupCount > 0 ? `Se encontraron ${dupCount} registros posiblemente duplicados` : '¡No se detectaron duplicados en tu base de datos!'}</h4>
                  <span class="text-xs text-secondary">${dupCount > 0 ? 'Elige qué acción tomar con cada registro duplicado' : 'Todos los registros son nuevos y seguros para importar.'}</span>
                </div>
              </div>
            </div>

            ${dupCount > 0 ? `
              <div class="table-responsive" style="max-height: 240px; overflow: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                <table class="emp-table" style="width: 100%; border-collapse: collapse; font-size: 0.78rem;">
                  <thead>
                    <tr style="background: var(--color-bg-tertiary);">
                      <th style="padding: 8px 12px; border-bottom: 1px solid var(--color-border);">Registro PDF</th>
                      <th style="padding: 8px 12px; border-bottom: 1px solid var(--color-border);">Estado</th>
                      <th style="padding: 8px 12px; border-bottom: 1px solid var(--color-border);">Acción A Tomar</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${dupRows.filter(r => r._isDuplicate).map((row, idx) => `
                      <tr style="border-bottom: 1px solid var(--color-border);">
                        <td style="padding: 8px 12px;">
                          <strong>${row.name || row.displayName || row.title}</strong>
                          ${row.sku ? `<span class="text-xs text-secondary block">SKU: ${row.sku}</span>` : ''}
                        </td>
                        <td style="padding: 8px 12px;">
                          <span class="badge badge-warning" style="font-size: 0.7rem;">⚠️ Coincide con ID: ${row._existingItem.id}</span>
                        </td>
                        <td style="padding: 8px 12px;">
                          <select class="input input-sm dup-decision-select" data-index="${idx}" style="background: var(--color-bg-secondary); color: var(--color-text-primary); border: 1px solid var(--color-border);">
                            <option value="update" ${row._userDecision === 'update' ? 'selected' : ''}>🔄 Actualizar existente</option>
                            <option value="create" ${row._userDecision === 'create' ? 'selected' : ''}>➕ Crear como nuevo</option>
                            <option value="skip" ${row._userDecision === 'skip' ? 'selected' : ''}>🚫 Omitir (No importar)</option>
                          </select>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}

            <div class="d-flex justify-between mt-3">
              <button class="btn btn-secondary btn-md" id="btn-wizard-prev">⬅️ Volver</button>
              <button class="btn btn-primary btn-md" id="btn-step6-next" style="padding: 10px 24px; font-weight: 700;">
                Siguiente: Resumen Final ➔
              </button>
            </div>
          </div>
        `;

      // ─── PASO 7: CONFIRMAR IMPORTACIÓN ──────────────────────────────────────
      case 7:
        const validTotal = validatedResult ? validatedResult.validRows.length : 0;

        return `
          <div class="d-flex flex-column gap-4" style="max-width: 640px; margin: 0 auto;">
            <div class="text-center">
              <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">Paso 7: Confirmar e Iniciar Migración</h3>
              <p class="text-sm text-secondary mt-1">Verifica los datos del negocio destino antes de realizar la inserción.</p>
            </div>

            <div class="p-5 border rounded-lg" style="background: var(--color-bg-tertiary); border: 1px solid var(--color-border); border-radius: var(--radius-lg);">
              <h4 class="font-bold text-sm mb-3" style="color: var(--color-accent);">Detalles de Aislamiento Tenant (Multi-empresa):</h4>
              <div class="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span class="text-secondary block">Usuario Responsable:</span>
                  <strong style="color: var(--color-text-primary);">${currentUser.email || currentUser.displayName || 'Propietario'}</strong>
                </div>
                <div>
                  <span class="text-secondary block">Empresa Destino ID:</span>
                  <strong style="color: var(--color-text-primary);">${currentUser.companyId || 'company_main'}</strong>
                </div>
                <div>
                  <span class="text-secondary block">Módulo Destino:</span>
                  <strong style="color: var(--color-text-primary);">${currentSchema.label} (${currentSchema.collection})</strong>
                </div>
                <div>
                  <span class="text-secondary block">Registros a Procesar:</span>
                  <strong style="color: var(--color-success);">${validTotal} registros</strong>
                </div>
              </div>
            </div>

            <!-- Import Mode Options -->
            <div class="p-4 border rounded" style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md);">
              <label class="form-label font-bold text-xs mb-2" style="color: var(--color-text-primary);">Modo de Inserción:</label>
              <div class="d-flex flex-column gap-2">
                <label class="d-flex align-items-center gap-2" style="font-size: 0.82rem; cursor: pointer;">
                  <input type="radio" name="importMode" value="append" ${importMode === 'append' ? 'checked' : ''} class="import-mode-radio" />
                  <span><strong>Agregar (Anexar)</strong> — Conserva los registros anteriores de la empresa</span>
                </label>
                <label class="d-flex align-items-center gap-2" style="font-size: 0.82rem; cursor: pointer;">
                  <input type="radio" name="importMode" value="overwrite" ${importMode === 'overwrite' ? 'checked' : ''} class="import-mode-radio" />
                  <span style="color: var(--color-danger);"><strong>Sobrescribir</strong> — Limpia la colección de la empresa e inserta lo nuevo</span>
                </label>
              </div>
            </div>

            <div class="d-flex justify-between mt-4">
              <button class="btn btn-secondary btn-md" id="btn-wizard-prev">⬅️ Volver</button>
              <button class="btn btn-primary btn-md" id="btn-start-migration-exec" style="padding: 12px 30px; font-size: 0.95rem; font-weight: 800;">
                🚀 Confirmar e Iniciar Migración
              </button>
            </div>
          </div>
        `;

      // ─── PASO 8: RESULTADO Y REPORTE ────────────────────────────────────────
      case 8:
        return `
          <div class="d-flex flex-column gap-4" style="max-width: 640px; margin: 0 auto;">
            ${isProcessing ? `
              <div class="p-8 text-center">
                <div class="spinner-border text-accent mb-4" role="status" style="width: 3.5rem; height: 3.5rem; border-width: 4px; border-color: var(--color-accent) transparent transparent transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">Escribiendo datos en Firestore...</h3>
                <p class="text-sm text-secondary mt-2 mb-4">${progressText || 'Guardando registros...'}</p>
                
                <div style="width: 100%; height: 10px; background: var(--color-bg-tertiary); border-radius: 5px; overflow: hidden;">
                  <div style="width: ${progressPercent}%; height: 100%; background: var(--color-accent); transition: width 0.2s ease;"></div>
                </div>
                <span class="text-xs text-secondary mt-2 block">${progressPercent}% completado</span>
              </div>
            ` : `
              <div class="p-6 text-center rounded-lg" style="background: rgba(52, 211, 153, 0.1); border: 1px solid var(--color-success); border-radius: var(--radius-lg);">
                <div style="font-size: 3.5rem; margin-bottom: 8px;">🎉</div>
                <h3 class="text-xl font-bold" style="color: var(--color-success);">¡Migración Completada Exitosamente!</h3>
                <p class="text-xs text-secondary mt-1">Los datos extraídos han sido validados e integrados al sistema.</p>
              </div>

              <div class="grid grid-cols-3 gap-3 text-center">
                <div class="p-4 border rounded" style="background: var(--color-bg-tertiary); border-radius: var(--radius-md);">
                  <span class="text-xs text-secondary block">Creados Novedosos</span>
                  <strong class="text-lg font-bold" style="color: var(--color-success);">${migrationReport ? migrationReport.successCount : 0}</strong>
                </div>
                <div class="p-4 border rounded" style="background: var(--color-bg-tertiary); border-radius: var(--radius-md);">
                  <span class="text-xs text-secondary block">Actualizados</span>
                  <strong class="text-lg font-bold" style="color: var(--color-warning);">${migrationReport ? migrationReport.updatedCount : 0}</strong>
                </div>
                <div class="p-4 border rounded" style="background: var(--color-bg-tertiary); border-radius: var(--radius-md);">
                  <span class="text-xs text-secondary block">Omitidos</span>
                  <strong class="text-lg font-bold" style="color: var(--color-text-secondary);">${migrationReport ? migrationReport.skippedCount : 0}</strong>
                </div>
              </div>

              <div class="d-flex gap-3 justify-center mt-4">
                <button class="btn btn-secondary btn-md" id="btn-restart-wizard">🔄 Realizar Otra Migración</button>
                <a href="#/inventory/products" class="btn btn-primary btn-md" style="padding: 10px 24px; font-weight: 700; text-decoration: none;">
                  📦 Ver Productos en Inventario
                </a>
              </div>
            `}
          </div>
        `;

      default:
        return '';
    }
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

  /**
   * Render History Tab markup
   */
  renderHistoryTab() {
    const { migrationHistory } = this.state;

    return `
      <div class="d-flex flex-column gap-4">
        <div>
          <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">Historial y Auditoría de Migraciones</h3>
          <p class="text-sm text-secondary">Registro completo de operaciones de importación realizadas por los usuarios en tu negocio.</p>
        </div>

        <div class="table-responsive" style="border: 1px solid var(--color-border); border-radius: var(--radius-lg);">
          <table class="emp-table" style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
            <thead>
              <tr style="background: var(--color-bg-tertiary);">
                <th style="padding: 10px 14px; text-align: left;">Fecha / Hora</th>
                <th style="padding: 10px 14px; text-align: left;">Usuario</th>
                <th style="padding: 10px 14px; text-align: left;">Módulo</th>
                <th style="padding: 10px 14px; text-align: left;">Modo</th>
                <th style="padding: 10px 14px; text-align: center;">Registros</th>
                <th style="padding: 10px 14px; text-align: center;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${migrationHistory.length > 0 ? migrationHistory.map(entry => `
                <tr style="border-bottom: 1px solid var(--color-border);">
                  <td style="padding: 10px 14px;">${entry.timestampLocal || new Date(entry.timestamp).toLocaleString()}</td>
                  <td style="padding: 10px 14px;"><strong>${entry.userEmail || 'Dueño'}</strong></td>
                  <td style="padding: 10px 14px;">${entry.entityLabel || entry.entityKey}</td>
                  <td style="padding: 10px 14px;">${entry.mode === 'overwrite' ? '<span style="color:var(--color-danger)">Sobrescribir</span>' : 'Anexar'}</td>
                  <td style="padding: 10px 14px; text-align: center;">
                    <strong>${entry.successCount || 0} creados</strong> ${entry.updatedCount ? ` / ${entry.updatedCount} act.` : ''}
                  </td>
                  <td style="padding: 10px 14px; text-align: center;">
                    <span class="badge badge-success">✓ Exitoso</span>
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="6" style="padding: 24px; text-center; color: var(--color-text-secondary);">
                    No hay registros de migraciones previas guardados.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
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
    // 1. Navigation Tab switches
    this.layout.$$('.migration-tab-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetTab = btn.dataset.tab;
        this.state.activeTab = targetTab;
        if (targetTab === 'history') {
          this.state.migrationHistory = await MigrationService.getMigrationHistory();
        }
        this.updateView();
      });
    });

    // 2. Wizard Step Navigation Event Listeners
    const prevBtn = this.layout.$('#btn-wizard-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.state.wizardStep > 1) {
          this.state.wizardStep--;
          this.updateView();
        }
      });
    }

    // Step 1: Dropzone & File binding
    const dropzone = this.layout.$('#migration-dropzone');
    const fileInput = this.layout.$('#migration-file-input');
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });

      const handleFileSelection = (file) => {
        if (!file) return;
        if (file.size === 0) {
          NotificationService.warning('El archivo seleccionado está vacío (0 bytes). Por favor selecciona un documento válido.');
          return;
        }
        this.state.selectedFile = file;
        this.updateView();
      };

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          handleFileSelection(e.target.files[0]);
        }
      });

      // Drag & Drop support
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = 'var(--color-accent)';
        dropzone.style.background = 'rgba(124, 58, 237, 0.1)';
      });

      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = 'var(--color-border)';
        dropzone.style.background = 'var(--color-bg-tertiary)';
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = 'var(--color-border)';
        dropzone.style.background = 'var(--color-bg-tertiary)';
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files[0]) {
          handleFileSelection(files[0]);
        }
      });
    }

    const step1Next = this.layout.$('#btn-step1-next');
    if (step1Next) {
      step1Next.addEventListener('click', async () => {
        if (this.state.selectedFile) {
          this.state.wizardStep = 2;
          this.updateView();
          await this.processSelectedFile();
        }
      });
    }

    // Step 3: Entity selection change
    const entitySelect = this.layout.$('#select-migration-entity');
    if (entitySelect) {
      entitySelect.addEventListener('change', (e) => {
        this.state.selectedEntity = e.target.value;
      });
    }

    const step3Next = this.layout.$('#btn-step3-next');
    if (step3Next) {
      step3Next.addEventListener('click', () => {
        this.recomputeMapping();
        this.state.wizardStep = 4;
        this.updateView();
      });
    }

    // Step 4: Column Mapping selects
    this.layout.$$('.column-map-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const targetField = select.dataset.field;
        this.state.columnMapping[targetField] = e.target.value;
      });
    });

    const step4Next = this.layout.$('#btn-step4-next');
    if (step4Next) {
      step4Next.addEventListener('click', () => {
        this.revalidateData();
        this.state.wizardStep = 5;
        this.updateView();
      });
    }

    // Step 5: Validation next
    const step5Next = this.layout.$('#btn-step5-next');
    if (step5Next) {
      step5Next.addEventListener('click', async () => {
        await this.checkDuplicatesAndAdvance();
      });
    }

    // Step 6: Duplicate decision dropdowns
    this.layout.$$('.dup-decision-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const idx = parseInt(select.dataset.index, 10);
        if (this.state.duplicateResult && this.state.duplicateResult.rowsWithDuplicateStatus[idx]) {
          this.state.duplicateResult.rowsWithDuplicateStatus[idx]._userDecision = e.target.value;
        }
      });
    });

    const step6Next = this.layout.$('#btn-step6-next');
    if (step6Next) {
      step6Next.addEventListener('click', () => {
        this.state.wizardStep = 7;
        this.updateView();
      });
    }

    // Step 7: Execution Trigger
    const startExecBtn = this.layout.$('#btn-start-migration-exec');
    if (startExecBtn) {
      startExecBtn.addEventListener('click', async () => {
        await this.runMigrationExecution();
      });
    }

    // Step 8: Restart Wizard
    const restartBtn = this.layout.$('#btn-restart-wizard');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        this.state.wizardStep = 1;
        this.state.selectedFile = null;
        this.state.fileParseResult = null;
        this.state.validatedResult = null;
        this.state.migrationReport = null;
        this.updateView();
      });
    }

    // Export Buttons
    this.layout.$$('.btn-export-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const entity = btn.dataset.entity;
        const format = btn.dataset.format;
        this.exportData(entity, format);
      });
    });

    // Download Template Buttons
    this.layout.$$('.btn-download-template').forEach(btn => {
      btn.addEventListener('click', () => {
        const entity = btn.dataset.entity;
        const format = btn.dataset.format;
        MigrationService.downloadTemplate(entity, format);
        NotificationService.success(`Descargando plantilla modelo para ${entity}...`);
      });
    });

    // Refresh button
    const refreshBtn = this.layout.$('#btn-refresh-migration');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        NotificationService.info('Sincronizando estado de datos...');
        this.updateView();
      });
    }
  }

  async processSelectedFile() {
    try {
      const parsed = await MigrationService.parseFile(this.state.selectedFile);
      this.state.fileParseResult = parsed;

      // Detect Document Type
      const detection = MigrationService.detectDocumentType(parsed.rawText || '', parsed.headers);
      this.state.detectionResult = detection;
      this.state.selectedEntity = detection.entity;

      this.recomputeMapping();
      this.state.wizardStep = 3;
      this.updateView();
      NotificationService.success(`Documento "${parsed.filename}" procesado. ${parsed.rows.length} filas detectadas.`);
    } catch (e) {
      console.error('[MigrationView] File process error:', e);
      NotificationService.error(e.message);
      this.state.wizardStep = 1;
      this.updateView();
    }
  }

  recomputeMapping() {
    if (!this.state.fileParseResult) return;
    const { headers } = this.state.fileParseResult;
    const entityKey = this.state.selectedEntity;

    const { mapping, confidenceScores } = MigrationService.autoDetectColumnMapping(headers, entityKey);
    this.state.columnMapping = mapping;
    this.state.confidenceScores = confidenceScores;
  }

  revalidateData() {
    if (!this.state.fileParseResult) return;
    const { rows } = this.state.fileParseResult;
    const entityKey = this.state.selectedEntity;
    const mapping = this.state.columnMapping;

    this.state.validatedResult = MigrationService.validateAndTransform(rows, mapping, entityKey);
  }

  async checkDuplicatesAndAdvance() {
    if (!this.state.validatedResult || !this.state.validatedResult.validRows.length) {
      NotificationService.warning('No hay filas válidas para continuar.');
      return;
    }

    try {
      const schema = MigrationService.ENTITY_SCHEMAS[this.state.selectedEntity];
      const collectionName = schema ? schema.collection : 'productos';

      // Query existing items for duplicate check
      const existingItems = await FirestoreService.query(collectionName, [], null, 500);

      const checkRes = MigrationService.checkDuplicates(this.state.validatedResult.validRows, existingItems || []);
      this.state.duplicateResult = checkRes;

      this.state.wizardStep = 6;
      this.updateView();
    } catch (e) {
      console.warn('[MigrationView] Duplicate check warning:', e.message);
      this.state.duplicateResult = {
        rowsWithDuplicateStatus: this.state.validatedResult.validRows.map(r => ({ ...r, _isDuplicate: false, _userDecision: 'create' })),
        duplicateCount: 0
      };
      this.state.wizardStep = 6;
      this.updateView();
    }
  }

  async runMigrationExecution() {
    const validRows = this.state.duplicateResult
      ? this.state.duplicateResult.rowsWithDuplicateStatus
      : (this.state.validatedResult ? this.state.validatedResult.validRows : []);

    if (!validRows.length) {
      NotificationService.warning('No hay filas para migrar.');
      return;
    }

    this.state.isProcessing = true;
    this.state.wizardStep = 8;
    this.state.progressPercent = 10;
    this.state.progressText = 'Iniciando escritura por lotes en Firestore...';
    this.updateView();

    try {
      const result = await MigrationService.executeMigrationBatch(
        this.state.selectedEntity,
        validRows,
        this.state.importMode,
        (done, total, statusText) => {
          this.state.progressPercent = Math.round((done / total) * 100);
          this.state.progressText = statusText;
          this.updateView();
        }
      );

      this.state.isProcessing = false;
      this.state.progressPercent = 100;
      this.state.migrationReport = result;
      NotificationService.success(`¡Migración completada! ${result.successCount} creados, ${result.updatedCount} actualizados.`);
      this.updateView();
    } catch (e) {
      this.state.isProcessing = false;
      console.error('[MigrationView] Migration execution error:', e);
      NotificationService.error('Error durante la migración: ' + e.message);
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
