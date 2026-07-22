/**
 * @file logs.view.js
 * @description Audit Logs View — Realtime Database `/audit_logs` query with live search, filtering, and pagination.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';
import { db } from '../../../config/firebase.config.js';
import { ref, get, onValue, off } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

export class LogsView extends Component {
  constructor(params = {}) {
    super(params);

    this.allLogs = [];
    this.filteredLogs = [];
    this.currentPage = 1;
    this.pageSize = 15;
    this.unsubscribeListener = null;

    this.layout = new PageLayout({
      title: 'Bitácora del Sistema (Audit Logs)',
      subtitle: 'Registro de auditoría en tiempo real directamente desde Firebase para accesos, modificaciones y mantenimiento del SaaS.',
      actionHTML: `
        <button type="button" id="btn-refresh-logs" class="btn btn-secondary btn-sm" style="display:flex; align-items:center; gap:6px;">
          🔄 Actualizar Registros
        </button>
      `,
      contentHTML: `
        <div style="display: flex; flex-direction: column; gap: var(--space-5);">

          <!-- Search & Filter Controls Card -->
          <div class="card p-4" style="display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; justify-content: space-between;">
            
            <!-- Global Search Box -->
            <div style="flex: 1; min-width: 280px; position: relative;">
              <input
                type="text"
                id="search-logs-input"
                class="input input-md"
                placeholder="🔍 Buscar por usuario, email, UID, acción, colección o detalle..."
                style="width: 100%; padding-left: 12px;"
              />
            </div>

            <!-- Filter Controls -->
            <div style="display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center;">
              
              <!-- Action Filter -->
              <select id="filter-action-select" class="input input-md" style="min-width: 160px;">
                <option value="ALL">Todas las Acciones</option>
                <option value="PRODUCTION_RESET">💥 Reinicio de Producción</option>
                <option value="LOGIN">🔑 Inicio de Sesión</option>
                <option value="LOGOUT">🚪 Cierre de Sesión</option>
                <option value="ADMIN_UPDATE_USER">✏️ Edición de Usuario</option>
                <option value="ADMIN_RESET_PASSWORD">🔒 Cambio de Clave</option>
                <option value="ADMIN_DELETE_USER">🔥 Borrado de Usuario</option>
                <option value="GLOBAL_CONFIG">⚙️ Configuración Global</option>
              </select>

              <!-- Status Filter -->
              <select id="filter-status-select" class="input input-md" style="min-width: 140px;">
                <option value="ALL">Todos los Estados</option>
                <option value="SUCCESS">✅ Éxito</option>
                <option value="ERROR">❌ Error</option>
              </select>

              <!-- Date Filter -->
              <input type="date" id="filter-date-input" class="input input-md" style="min-width: 140px;" />
              <button type="button" id="btn-clear-date" class="btn btn-secondary btn-sm" title="Limpiar Fecha">✖</button>

            </div>
          </div>

          <!-- Audit Stats & Count Badge -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div id="logs-count-badge" class="text-xs text-secondary font-semibold" style="font-family: monospace;">
              Consultando auditoría en Firebase RTDB...
            </div>
            <div id="logs-pagination-summary" class="text-xs text-secondary" style="font-family: monospace;">
              Página 1
            </div>
          </div>

          <!-- Logs Table Card -->
          <div class="card p-0" style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.82rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--color-border-primary, rgba(255,255,255,0.08)); background: var(--color-bg-secondary, rgba(255,255,255,0.02)); color: var(--color-text-secondary);">
                  <th style="padding: 12px 14px;">Fecha / Hora</th>
                  <th style="padding: 12px 14px;">Usuario Autor</th>
                  <th style="padding: 12px 14px;">UID</th>
                  <th style="padding: 12px 14px;">Acción Ejecutada</th>
                  <th style="padding: 12px 14px;">Colección / Destino</th>
                  <th style="padding: 12px 14px;">Estado</th>
                  <th style="padding: 12px 14px;">Detalles de la Operación</th>
                </tr>
              </thead>
              <tbody id="logs-table-body">
                <tr>
                  <td colspan="7" style="padding: 32px; text-align: center; color: var(--color-text-tertiary);">
                    ⏳ Cargando registros de auditoría desde Firebase...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination Footer controls -->
          <div class="card p-3" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="text-xs text-secondary">Mostrar por página:</span>
              <select id="select-page-size" class="input input-sm" style="width: 70px;">
                <option value="15" selected>15</option>
                <option value="30">30</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              <button type="button" id="btn-prev-page" class="btn btn-secondary btn-sm" disabled>◀ Anterior</button>
              <span id="page-num-label" class="text-xs font-semibold" style="font-family: monospace;">Página 1</span>
              <button type="button" id="btn-next-page" class="btn btn-secondary btn-sm" disabled>Siguiente ▶</button>
            </div>
          </div>

        </div>
      `
    });
  }

  mount() {
    const el = this.layout.mount();
    this.afterMount(el);
    this.subscribeToAuditLogs(el);
    return el;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // Refresh button
    const refreshBtn = root.querySelector('#btn-refresh-logs');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.fetchAuditLogs(root));
    }

    // Search and Filter controls
    const searchInput = root.querySelector('#search-logs-input');
    const actionSelect = root.querySelector('#filter-action-select');
    const statusSelect = root.querySelector('#filter-status-select');
    const dateInput = root.querySelector('#filter-date-input');
    const clearDateBtn = root.querySelector('#btn-clear-date');
    const pageSizeSelect = root.querySelector('#select-page-size');

    const applyFilters = () => {
      this.currentPage = 1;
      this.filterLogs(root);
    };

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (actionSelect) actionSelect.addEventListener('change', applyFilters);
    if (statusSelect) statusSelect.addEventListener('change', applyFilters);
    if (dateInput) dateInput.addEventListener('change', applyFilters);
    if (clearDateBtn) {
      clearDateBtn.addEventListener('click', () => {
        if (dateInput) dateInput.value = '';
        applyFilters();
      });
    }

    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', () => {
        this.pageSize = parseInt(pageSizeSelect.value, 10) || 15;
        this.currentPage = 1;
        this.renderTablePage(root);
      });
    }

    // Pagination buttons
    const prevBtn = root.querySelector('#btn-prev-page');
    const nextBtn = root.querySelector('#btn-next-page');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.renderTablePage(root);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(this.filteredLogs.length / this.pageSize) || 1;
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.renderTablePage(root);
        }
      });
    }
  }

  /**
   * Listens to real-time updates on /audit_logs in Firebase RTDB
   */
  subscribeToAuditLogs(root) {
    if (!db) {
      this.fetchAuditLogs(root);
      return;
    }

    try {
      const logsRef = ref(db, 'audit_logs');
      this.unsubscribeListener = onValue(logsRef, (snapshot) => {
        this.processSnapshot(snapshot, root);
      }, (err) => {
        console.warn('[LogsView] Realtime listener error:', err.message);
        this.fetchAuditLogs(root);
      });
    } catch (e) {
      console.warn('[LogsView] Listening setup failed:', e.message);
      this.fetchAuditLogs(root);
    }
  }

  async fetchAuditLogs(root) {
    if (!db) return;
    try {
      const countBadge = root.querySelector('#logs-count-badge');
      if (countBadge) countBadge.textContent = '⏳ Consultando auditoría en Firebase...';

      const snapshot = await get(ref(db, 'audit_logs'));
      this.processSnapshot(snapshot, root);
    } catch (err) {
      console.error('[LogsView] Error al consultar auditoría:', err);
      NotificationService.error(`Error al cargar auditoría: ${err.message || err}`);
    }
  }

  processSnapshot(snapshot, root) {
    const rawList = [];
    if (snapshot.exists()) {
      snapshot.forEach(childSnap => {
        const key = childSnap.key;
        const val = childSnap.val() || {};
        rawList.push({
          id: key,
          action: val.action || 'OPERACIÓN',
          programmerEmail: val.programmerEmail || val.user || val.email || 'Sistema',
          programmerUid: val.programmerUid || val.targetUid || val.uid || '—',
          programmerName: val.programmerName || '',
          details: val.details || val.description || val.message || 'Sin detalle especificado.',
          timestamp: val.timestamp || val.createdAt || Date.now(),
          isoDate: val.isoDate || (val.timestamp ? new Date(val.timestamp).toISOString() : ''),
          status: val.status || (val.isError ? 'ERROR' : 'ÉXITO'),
          companyId: val.companyId || val.targetCompany || val.metadata?.companyId || 'global',
          metadata: val.metadata || {}
        });
      });
    }

    // Sort newest first
    rawList.sort((a, b) => b.timestamp - a.timestamp);

    this.allLogs = rawList;
    this.filterLogs(root);
  }

  filterLogs(root) {
    const searchVal = (root.querySelector('#search-logs-input')?.value || '').trim().toLowerCase();
    const actionVal = root.querySelector('#filter-action-select')?.value || 'ALL';
    const statusVal = root.querySelector('#filter-status-select')?.value || 'ALL';
    const dateVal = root.querySelector('#filter-date-input')?.value || '';

    this.filteredLogs = this.allLogs.filter(log => {
      // 1. Search text match
      const textMatch = !searchVal ||
        log.programmerEmail.toLowerCase().includes(searchVal) ||
        log.programmerUid.toLowerCase().includes(searchVal) ||
        log.action.toLowerCase().includes(searchVal) ||
        log.details.toLowerCase().includes(searchVal) ||
        log.companyId.toLowerCase().includes(searchVal);

      // 2. Action filter
      let actionMatch = true;
      if (actionVal !== 'ALL') {
        if (actionVal === 'GLOBAL_CONFIG') {
          actionMatch = log.action.includes('CONFIG') || log.action.includes('SAAS');
        } else {
          actionMatch = log.action === actionVal;
        }
      }

      // 3. Status filter
      let statusMatch = true;
      if (statusVal !== 'ALL') {
        const isErr = (log.status || '').toUpperCase().includes('ERR');
        statusMatch = statusVal === 'ERROR' ? isErr : !isErr;
      }

      // 4. Date filter
      let dateMatch = true;
      if (dateVal) {
        const logDateStr = new Date(log.timestamp).toISOString().split('T')[0];
        dateMatch = logDateStr === dateVal;
      }

      return textMatch && actionMatch && statusMatch && dateMatch;
    });

    this.renderTablePage(root);
  }

  renderTablePage(root) {
    const tbody = root.querySelector('#logs-table-body');
    const countBadge = root.querySelector('#logs-count-badge');
    const paginationSummary = root.querySelector('#logs-pagination-summary');
    const pageNumLabel = root.querySelector('#page-num-label');
    const prevBtn = root.querySelector('#btn-prev-page');
    const nextBtn = root.querySelector('#btn-next-page');

    const totalLogs = this.filteredLogs.length;
    const totalPages = Math.ceil(totalLogs / this.pageSize) || 1;

    if (this.currentPage > totalPages) this.currentPage = totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    if (countBadge) {
      countBadge.textContent = `📋 Total de Registros: ${totalLogs} ${totalLogs !== this.allLogs.length ? `(Filtrado de ${this.allLogs.length})` : ''}`;
    }

    if (paginationSummary) {
      paginationSummary.textContent = `Mostrando página ${this.currentPage} de ${totalPages}`;
    }

    if (pageNumLabel) pageNumLabel.textContent = `Página ${this.currentPage} de ${totalPages}`;
    if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = this.currentPage >= totalPages;

    if (!tbody) return;

    if (totalLogs === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 32px; text-align: center; color: var(--color-text-tertiary);">
            🔍 No se encontraron registros de auditoría con los filtros seleccionados.
          </td>
        </tr>
      `;
      return;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pageLogs = this.filteredLogs.slice(startIndex, startIndex + this.pageSize);

    tbody.innerHTML = pageLogs.map(log => {
      const dateFormatted = log.timestamp ? TimeService.formatDate(log.timestamp, true) : '—';
      const isError = (log.status || '').toUpperCase().includes('ERR');
      const statusBadge = isError
        ? `<span style="padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3);">❌ ERROR</span>`
        : `<span style="padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; background: rgba(16,185,129,0.2); color: #34d399; border: 1px solid rgba(16,185,129,0.3);">✅ ÉXITO</span>`;

      let actionBadge = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3);">${log.action}</span>`;
      if (log.action === 'PRODUCTION_RESET') {
        actionBadge = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; background: rgba(239,68,68,0.25); color: #f87171; border: 1px solid rgba(239,68,68,0.4);">💥 REINICIO PRODUCCIÓN</span>`;
      } else if (log.action === 'LOGIN') {
        actionBadge = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; background: rgba(16,185,129,0.15); color: #34d399;">🔑 LOGIN</span>`;
      }

      return `
        <tr style="border-bottom: 1px solid var(--color-border-primary, rgba(255,255,255,0.05)); hover: background: rgba(255,255,255,0.02);">
          <td style="padding: 10px 14px; white-space: nowrap; font-family: monospace; color: var(--color-text-secondary); font-size: 0.78rem;">
            ${dateFormatted}
          </td>
          <td style="padding: 10px 14px;">
            <strong style="color: var(--color-text-primary); font-size: 0.8rem;">${log.programmerEmail}</strong>
          </td>
          <td style="padding: 10px 14px; font-family: monospace; font-size: 0.72rem; color: #9ca3af;">
            ${log.programmerUid !== '—' ? log.programmerUid.substring(0, 14) + '...' : '—'}
          </td>
          <td style="padding: 10px 14px;">
            ${actionBadge}
          </td>
          <td style="padding: 10px 14px; font-size: 0.78rem; color: #60a5fa;">
            ${log.companyId}
          </td>
          <td style="padding: 10px 14px;">
            ${statusBadge}
          </td>
          <td style="padding: 10px 14px; font-size: 0.78rem; color: var(--color-text-secondary); max-width: 320px; word-wrap: break-word;">
            ${log.details}
          </td>
        </tr>
      `;
    }).join('');
  }

  unmount() {
    if (this.unsubscribeListener && db) {
      try {
        const logsRef = ref(db, 'audit_logs');
        off(logsRef, 'value', this.unsubscribeListener);
      } catch (_) {}
    }
    this.layout.unmount();
    super.unmount();
  }
}