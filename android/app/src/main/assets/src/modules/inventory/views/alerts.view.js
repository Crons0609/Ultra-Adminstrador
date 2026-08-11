import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { I18nService } from '../../../services/i18n.service.js';

export class AlertsView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';

    this.state = {
      products: [],
      ingredients: [],
      alerts: []
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { 
          key: 'name', 
          label: I18nService.t('ale_product'),
          render: (val, row) => `
            <div style="display: flex; flex-direction: column;">
              <span class="font-semibold text-primary">${val}</span>
              <span class="text-xs text-secondary" style="font-size: 0.7rem; margin-top: 2px;">
                ${row.type === 'PRODUCT' ? I18nService.t('ale_type_product') : I18nService.t('ale_type_ingredient')}
              </span>
            </div>
          `
        },
        { 
          key: 'stock', 
          label: I18nService.t('ale_current_stock'),
          render: (val, row) => `<span class="font-medium">${val} ${row.unit || 'uds'}</span>`
        },
        { 
          key: 'minStock', 
          label: I18nService.t('ale_min_stock'),
          render: (val, row) => `<span class="text-secondary">${val} ${row.unit || 'uds'}</span>`
        },
        { 
          key: 'severity', 
          label: I18nService.t('ale_severity'),
          render: (val) => {
            if (val === 'CRITICAL') {
              return `<span class="stock-badge stock-out">${I18nService.t('ale_status_critical')}</span>`;
            } else if (val === 'EXPIRED') {
              return `<span class="stock-badge stock-out" style="background-color: var(--color-danger-light); color: var(--color-danger); border: 1px solid var(--color-danger);">${I18nService.t('ale_status_expired')}</span>`;
            }
            return `<span class="stock-badge stock-low">${I18nService.t('ale_low_stock')}</span>`;
          }
        },
        {
          key: 'id',
          label: I18nService.t('actions'),
          render: () => `
            <a href="#/inventory/purchases" class="btn btn-primary btn-sm py-1 px-3" style="font-size: 0.75rem; text-decoration: none; display: inline-flex; align-items: center; justify-content: center;">
              ${I18nService.t('ale_restock_btn')}
            </a>
          `
        }
      ],
      data: []
    });

    this.layout = new PageLayout({
      title: I18nService.t('ale_title'),
      subtitle: I18nService.t('ale_subtitle'),
      contentHTML: `
        <!-- KPI Cards Row -->
        <div class="grid-stats animate-fade-in">
          <div class="kpi-card hover-lift alert-critical">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('ale_critical_kpi')}</span>
              <div class="kpi-icon kpi-icon-danger">🚨</div>
            </div>
            <h3 class="kpi-value text-danger" id="kpi-alert-crit">0</h3>
            <span class="text-xs text-secondary">${I18nService.t('ale_critical_desc')}</span>
          </div>

          <div class="kpi-card hover-lift alert-warning">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('ale_warning_kpi')}</span>
              <div class="kpi-icon kpi-icon-warning">⚠️</div>
            </div>
            <h3 class="kpi-value text-warning" id="kpi-alert-warn">0</h3>
            <span class="text-xs text-secondary">${I18nService.t('ale_warning_desc')}</span>
          </div>

          <div class="kpi-card hover-lift" style="border-left: 4px solid var(--color-info);">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('ale_expired_kpi')}</span>
              <div class="kpi-icon kpi-icon-info">📅</div>
            </div>
            <h3 class="kpi-value text-info" id="kpi-alert-exp">0</h3>
            <span class="text-xs text-secondary">${I18nService.t('ale_expired_desc')}</span>
          </div>
        </div>

        <!-- Alerts Table Container -->
        <div class="card p-5">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h3 class="text-lg font-semibold">${I18nService.t('ale_list_title')}</h3>
            <span class="text-xs text-secondary">${I18nService.t('ale_auto_update')}</span>
          </div>
          <div id="alerts-table-wrapper"></div>
        </div>
      `
    });

    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();

    // Inject table
    const tableWrapper = element.querySelector('#alerts-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.subscribeToData(element);

    return element;
  }

  subscribeToData(element) {
    try {
      // 1. Listen to products
      const productsListener = FirestoreService.listenToTenant('productos', (products) => {
        this.state.products = products || [];
        this.recalculateAlerts(element);
      });
      this.listeners.push(productsListener);

      // 2. Listen to ingredients
      const ingredientsListener = FirestoreService.listenToTenant('insumos', (ingredients) => {
        this.state.ingredients = ingredients || [];
        this.recalculateAlerts(element);
      });
      this.listeners.push(ingredientsListener);
    } catch (e) {
      console.warn('[AlertsView] Error setting up RTDB listeners:', e.message);
    }
  }

  recalculateAlerts(element) {
    const { products, ingredients } = this.state;
    const alerts = [];
    const today = new Date();

    let critCount = 0;
    let warnCount = 0;
    let expCount = 0;

    // 1. Process products
    products.forEach(p => {
      const stock = Number(p.stock || 0);
      const min = Number(p.minStock || 0);
      
      if (stock === 0) {
        critCount++;
        alerts.push({
          id: p.id,
          name: p.name,
          sku: p.sku || 'N/A',
          unit: p.unit || 'uds',
          stock,
          minStock: min,
          type: 'PRODUCT',
          severity: 'CRITICAL'
        });
      } else if (stock <= min) {
        warnCount++;
        alerts.push({
          id: p.id,
          name: p.name,
          sku: p.sku || 'N/A',
          unit: p.unit || 'uds',
          stock,
          minStock: min,
          type: 'PRODUCT',
          severity: 'WARNING'
        });
      }
    });

    // 2. Process ingredients
    ingredients.forEach(i => {
      const stock = Number(i.stock || 0);
      const min = Number(i.minStock || 0);
      const hasExpiry = !!i.expiryDate;
      const isExpired = hasExpiry && new Date(i.expiryDate) < today;

      if (isExpired) {
        expCount++;
        alerts.push({
          id: i.id,
          name: i.name,
          sku: 'N/A',
          unit: i.unit || 'kg',
          stock,
          minStock: min,
          type: 'INGREDIENT',
          severity: 'EXPIRED'
        });
      } else if (stock === 0) {
        critCount++;
        alerts.push({
          id: i.id,
          name: i.name,
          sku: 'N/A',
          unit: i.unit || 'kg',
          stock,
          minStock: min,
          type: 'INGREDIENT',
          severity: 'CRITICAL'
        });
      } else if (stock <= min) {
        warnCount++;
        alerts.push({
          id: i.id,
          name: i.name,
          sku: 'N/A',
          unit: i.unit || 'kg',
          stock,
          minStock: min,
          type: 'INGREDIENT',
          severity: 'WARNING'
        });
      }
    });

    // Sort alerts by severity (Expired & Critical first)
    const severityWeight = { EXPIRED: 3, CRITICAL: 2, WARNING: 1 };
    alerts.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);

    this.state.alerts = alerts;

    // Update KPIs
    const critEl = element.querySelector('#kpi-alert-crit');
    if (critEl) critEl.textContent = critCount;

    const warnEl = element.querySelector('#kpi-alert-warn');
    if (warnEl) warnEl.textContent = warnCount;

    const expEl = element.querySelector('#kpi-alert-exp');
    if (expEl) expEl.textContent = expCount;

    // Refresh Table
    const tableWrapper = element.querySelector('#alerts-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = alerts;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}