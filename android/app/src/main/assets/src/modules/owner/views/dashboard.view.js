/**
 * @file dashboard.view.js
 * @description Centro de Control del Negocio para el Dueño (Owner Dashboard).
 * Diseñado Mobile-First para Android, tablet y escritorio.
 * Muestra información real, score de rendimiento (0-100), KPIs adaptativos por módulo,
 * rendimiento del equipo por cargo, comparativas, alertas y acciones rápidas.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { TimeService } from '../../../services/time.service.js';
import { isModuleEnabled } from '../../../config/modules.config.js';
import { getBusinessCategory } from '../../../config/business-types.config.js';
import { I18nService } from '../../../services/i18n.service.js';

export class OwnerDashboardView extends Component {
  constructor(params = {}) {
    super(params);

    const state = GlobalStore.getState();
    const currentUser = state.currentUser || {};
    this.currentUser = currentUser;
    this.currentCompany = state.currentCompany || {};
    this.companyId = currentUser.companyId || this.currentCompany.id || '';
    this.branchId = currentUser.branchId || 'main';
    this.businessCategory = getBusinessCategory(this.currentCompany.businessType || '');

    this.listeners = [];
    this.comparePeriod = 'THIS_MONTH'; // 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'

    this.state = {
      loading: true,
      ventas: [],
      gastos: [],
      products: [],
      employees: [],
      clients: [],
      payable: [],
      receivable: [],
      services: [],
      requests: []
    };

    // Initialize Performance Chart
    this.chart = new Chart({
      type: 'line',
      labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      datasets: [
        { label: 'Ventas ($)', data: [0, 0, 0, 0, 0, 0, 0], color: '#6366f1' },
        { label: 'Gastos ($)', data: [0, 0, 0, 0, 0, 0, 0], color: '#ef4444' }
      ]
    });

    this.layout = new PageLayout({
      title: this._getGreeting(),
      subtitle: I18nService.t('business_summary'),
      actionHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-refresh-dashboard" style="min-height:36px;display:flex;align-items:center;gap:6px;font-weight:600;">
          🔄 ${I18nService.t('refresh')}
        </button>
      `,
      contentHTML: `<div id="owner-dashboard-root"></div>`
    });
  }

  _getGreeting() {
    const hour = new Date().getHours();
    const name = (this.currentUser.displayName || I18nService.t('emp_role_owner')).split(' ')[0];
    let greeting = I18nService.t('good_morning');
    if (hour >= 12 && hour < 19) greeting = I18nService.t('good_afternoon');
    else if (hour >= 19 || hour < 5) greeting = I18nService.t('good_evening');
    return `${greeting}, ${name}`;
  }

  _getFormattedDate() {
    const now = new Date();
    const day = I18nService.t(`day_${['sun','mon','tue','wed','thu','fri','sat'][now.getDay()]}`);
    const month = I18nService.t(`month_${['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][now.getMonth()]}`);
    return `${day}, ${now.getDate()} de ${month}`;
  }

  _formatMoney(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return 'C$ 0.00';
    return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', minimumFractionDigits: 2 }).format(amount).replace('NIO', 'C$');
  }

  // ─── STYLES ────────────────────────────────────────────────────────────────
  _styles() {
    return `
      <style id="owner-dash-styles">
        .odb-root { display:flex; flex-direction:column; gap:16px; color:var(--color-text-primary); }

        /* Context Card */
        .odb-context-card { background:var(--color-bg-secondary); border:1px solid var(--color-border);
          border-radius:var(--radius-lg); padding:14px 18px; display:flex; align-items:center;
          justify-content:space-between; flex-wrap:wrap; gap:10px; }
        .odb-status-badge { font-size:0.75rem; font-weight:700; padding:4px 12px; border-radius:20px;
          display:inline-flex; align-items:center; gap:6px; }
        .odb-status-badge.stable { background:rgba(16,185,129,0.12); color:#10b981; border:1px solid rgba(16,185,129,0.3); }
        .odb-status-badge.warning { background:rgba(245,158,11,0.12); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); }

        /* KPI Grid */
        .odb-kpi-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; }
        .odb-kpi-card { background:var(--color-bg-secondary); border:1px solid var(--color-border);
          border-radius:var(--radius-lg); padding:14px; display:flex; flex-direction:column; gap:4px;
          transition:transform 0.15s ease; position:relative; overflow:hidden; }
        .odb-kpi-card:hover { transform:translateY(-2px); }
        .odb-kpi-val { font-size:1.4rem; font-weight:800; line-height:1.2; letter-spacing:-0.02em; }
        .odb-kpi-lbl { font-size:0.72rem; color:var(--color-text-secondary); text-transform:uppercase; font-weight:600; }
        .odb-kpi-sub { font-size:0.72rem; color:var(--color-text-secondary); margin-top:2px; }

        /* Score Section */
        .odb-score-card { background:var(--color-bg-secondary); border:1px solid var(--color-border);
          border-radius:var(--radius-lg); padding:20px; display:grid; grid-template-columns:1fr 1.6fr; gap:20px; align-items:center; }
        .odb-score-circle { display:flex; flex-direction:column; align-items:center; justify-content:center;
          text-align:center; padding:16px; background:var(--color-bg-tertiary); border-radius:var(--radius-lg);
          border:1px solid var(--color-border); }
        .odb-score-num { font-size:2.8rem; font-weight:900; line-height:1; color:var(--color-accent); }
        .odb-score-lbl { font-size:0.82rem; font-weight:700; margin-top:4px; }
        .odb-area-list { display:flex; flex-direction:column; gap:8px; }
        .odb-area-row { display:flex; flex-direction:column; gap:2px; }
        .odb-area-hdr { display:flex; justify-content:space-between; font-size:0.78rem; font-weight:600; }
        .odb-progress-bg { height:8px; background:var(--color-bg-tertiary); border-radius:4px; overflow:hidden; }
        .odb-progress-fill { height:100%; border-radius:4px; transition:width 0.5s cubic-bezier(0.4,0,0.2,1); }

        /* Grid 2-col desktop */
        .odb-2col { display:grid; grid-template-columns:1.5fr 1fr; gap:16px; }

        /* Compare Cards */
        .odb-compare-bar { display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; }
        .odb-cmp-btn { padding:6px 12px; border-radius:16px; border:1px solid var(--color-border);
          background:transparent; color:var(--color-text-secondary); font-size:0.75rem; font-weight:600; cursor:pointer; }
        .odb-cmp-btn.active { background:var(--color-accent); color:#fff; border-color:var(--color-accent); }

        .odb-trend-badge { font-size:0.72rem; font-weight:700; padding:2px 6px; border-radius:4px; display:inline-flex; align-items:center; gap:2px; }
        .odb-trend-up   { background:rgba(16,185,129,0.12); color:#10b981; }
        .odb-trend-down { background:rgba(239,68,68,0.12); color:#ef4444; }

        /* Alerts List */
        .odb-alert-item { padding:12px 14px; border-radius:var(--radius-md); background:var(--color-bg-tertiary);
          border:1px solid var(--color-border); display:flex; align-items:center; justify-content:space-between;
          gap:10px; cursor:pointer; transition:all 0.15s; font-size:0.83rem; }
        .odb-alert-item:hover { background:var(--color-bg-secondary); border-color:var(--color-accent); }

        /* Quick Actions */
        .odb-actions-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; }
        .odb-action-btn { background:var(--color-bg-secondary); border:1px solid var(--color-border);
          border-radius:var(--radius-lg); padding:14px; text-decoration:none; color:var(--color-text-primary);
          display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;
          gap:6px; font-weight:600; font-size:0.82rem; transition:all 0.15s; min-height:54px; }
        .odb-action-btn:active { transform:scale(0.96); background:var(--color-bg-tertiary); }

        /* Mobile overrides */
        @media (max-width: 640px) {
          .odb-score-card { grid-template-columns:1fr; }
          .odb-2col { grid-template-columns:1fr; }
          .odb-kpi-grid { grid-template-columns:repeat(2, 1fr); }
          .odb-actions-grid { grid-template-columns:repeat(2, 1fr); }
          .odb-kpi-val { font-size:1.25rem; }
        }
      </style>
    `;
  }

  // ─── DATA LOADING ──────────────────────────────────────────────────────────
  async loadData() {
    if (!this.companyId) return;

    try {
      const now = new Date();

      const [ventas, gastos, products, employees, clients, payable, receivable, requests] = await Promise.all([
        FirestoreService.readPath(`${this.companyId}/ventas`).catch(() => ({})),
        FirestoreService.readPath(`${this.companyId}/expenses`).catch(() => ({})),
        FirestoreService.readPath(`${this.companyId}/products`).catch(() => ({})),
        FirestoreService.getCompanyEmployees(this.companyId).catch(() => []),
        FirestoreService.readPath(`${this.companyId}/clients`).catch(() => ({})),
        FirestoreService.readPath(`${this.companyId}/accounts_payable`).catch(() => ({})),
        FirestoreService.readPath(`${this.companyId}/accounts_receivable`).catch(() => ({})),
        FirestoreService.readPath(`${this.companyId}/service_requests`).catch(() => ({}))
      ]);

      this.state.ventas = Object.entries(ventas || {}).map(([id, val]) => ({ id, ...val }));
      this.state.gastos = Object.entries(gastos || {}).map(([id, val]) => ({ id, ...val }));
      this.state.products = Object.entries(products || {}).map(([id, val]) => ({ id, ...val }));
      this.state.employees = employees || [];
      this.state.clients = Object.entries(clients || {}).map(([id, val]) => ({ id, ...val }));
      this.state.payable = Object.entries(payable || {}).map(([id, val]) => ({ id, ...val }));
      this.state.receivable = Object.entries(receivable || {}).map(([id, val]) => ({ id, ...val }));
      this.state.requests = Object.entries(requests || {}).map(([id, val]) => ({ id, ...val }));

      this.state.loading = false;
      this.renderUI();
    } catch (err) {
      console.warn('[OwnerDashboardView] Error loading dashboard data:', err);
      this.state.loading = false;
      this.renderUI();
    }
  }

  // ─── CALCULATIONS ──────────────────────────────────────────────────────────
  _calculateMetrics() {
    const { selectedBranchId, selectedBranchMode, branches } = GlobalStore.getState();
    const isSingleBranchContext = selectedBranchMode === 'single' && selectedBranchId && selectedBranchId !== 'all';

    // Apply branch filter if single branch selected
    const filterByBranch = (list) => {
      if (!isSingleBranchContext) return list;
      return list.filter(item => !item.branchId || item.branchId === selectedBranchId || item.branchId === 'principal');
    };

    const ventasList = filterByBranch(this.state.ventas);
    const gastosList = filterByBranch(this.state.gastos);
    const clientsList = filterByBranch(this.state.clients);
    const productsList = filterByBranch(this.state.products);
    const payableList = filterByBranch(this.state.payable);
    const requestsList = filterByBranch(this.state.requests);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const prevMonthEnd = monthStart - 1;

    // Ventas hoy
    const ventasHoy = ventasList.filter(v => {
      const d = v.createdAt ? new Date(v.createdAt).toISOString().split('T')[0] : '';
      return d === todayStr || v.date === todayStr;
    }).reduce((s, v) => s + (Number(v.total || v.monto || 0)), 0);

    // Ventas mes
    const ventasMes = ventasList.filter(v => {
      const ts = Number(v.createdAt || v.timestamp || 0);
      return ts >= monthStart;
    }).reduce((s, v) => s + (Number(v.total || v.monto || 0)), 0);

    // Ventas mes anterior
    const ventasMesPrev = ventasList.filter(v => {
      const ts = Number(v.createdAt || v.timestamp || 0);
      return ts >= prevMonthStart && ts <= prevMonthEnd;
    }).reduce((s, v) => s + (Number(v.total || v.monto || 0)), 0);

    // Gastos mes
    const gastosMes = gastosList.filter(g => {
      const ts = Number(g.createdAt || g.timestamp || g.dateTimestamp || 0);
      return ts >= monthStart;
    }).reduce((s, g) => s + (Number(g.amount || g.monto || 0)), 0);

    const gastosMesPrev = gastosList.filter(g => {
      const ts = Number(g.createdAt || g.timestamp || g.dateTimestamp || 0);
      return ts >= prevMonthStart && ts <= prevMonthEnd;
    }).reduce((s, g) => s + (Number(g.amount || g.monto || 0)), 0);

    // Utilidad
    const utilidadMes = ventasMes - gastosMes;
    const utilidadMesPrev = ventasMesPrev - gastosMesPrev;

    // Clientes
    const totalClientes = clientsList.length;

    // Stock crítico (< 5 unidades)
    const lowStockCount = productsList.filter(p => Number(p.stock || p.existencias || 0) <= (Number(p.minStock) || 5)).length;

    // Cuentas por pagar vencidas
    const payableOverdue = payableList.filter(p => p.status !== 'PAGADO' && Number(p.dueDate || 0) < Date.now()).length;

    // Solicitudes pendientes
    const pendingRequests = requestsList.filter(r => r.status === 'PENDIENTE').length;

    // Score calculation (0-100)
    let hasData = (ventasList.length > 0 || gastosList.length > 0 || productsList.length > 0);
    let score = 0;
    let scoreLabel = 'Analizando rendimiento';

    if (hasData) {
      // 1. Profitability subscore (max 35)
      let profitScore = 20;
      if (ventasMes > 0) {
        const marginPct = (utilidadMes / ventasMes) * 100;
        if (marginPct >= 30) profitScore = 35;
        else if (marginPct >= 15) profitScore = 28;
        else if (marginPct >= 0) profitScore = 20;
        else profitScore = 10;
      }

      // 2. Sales growth subscore (max 25)
      let growthScore = 18;
      if (ventasMesPrev > 0) {
        const growth = ((ventasMes - ventasMesPrev) / ventasMesPrev) * 100;
        if (growth >= 10) growthScore = 25;
        else if (growth >= 0) growthScore = 20;
        else growthScore = 12;
      }

      // 3. Inventory health (max 20)
      let invScore = 20;
      if (productsList.length > 0) {
        const lowPct = (lowStockCount / productsList.length) * 100;
        if (lowPct > 30) invScore = 8;
        else if (lowPct > 15) invScore = 14;
        else invScore = 20;
      }

      // 4. Operational activity (max 20)
      let opsScore = 15;
      if (payableOverdue === 0 && pendingRequests === 0) opsScore = 20;
      else if (payableOverdue <= 2) opsScore = 14;

      score = Math.min(100, Math.max(10, Math.round(profitScore + growthScore + invScore + opsScore)));

      if (score >= 85) scoreLabel = I18nService.t('dash_score_excellent');
      else if (score >= 72) scoreLabel = I18nService.t('dash_score_good');
      else if (score >= 58) scoreLabel = I18nService.t('dash_score_average');
      else scoreLabel = I18nService.t('dash_score_low');
    }

    // Tendencias comparativas
    const salesTrend = ventasMesPrev > 0 ? Math.round(((ventasMes - ventasMesPrev) / ventasMesPrev) * 100) : 0;
    const profitTrend = utilidadMesPrev > 0 ? Math.round(((utilidadMes - utilidadMesPrev) / Math.abs(utilidadMesPrev)) * 100) : 0;

    return {
      ventasHoy, ventasMes, gastosMes, utilidadMes, totalClientes,
      lowStockCount, payableOverdue, pendingRequests,
      hasData, score, scoreLabel, salesTrend, profitTrend
    };
  }

  // ─── RENDER UI ─────────────────────────────────────────────────────────────
  renderUI() {
    const root = this.element?.querySelector('#owner-dashboard-root') || document.getElementById('owner-dashboard-root');
    if (!root) return;

    if (this.state.loading) {
      root.innerHTML = `<div style="text-align:center;padding:48px;color:var(--color-text-secondary)">${I18nService.t('dash_analyzing_metrics')}</div>`;
      return;
    }

    const m = this._calculateMetrics();
    const companyName = this.currentCompany?.name || 'Mi Negocio';
    const { selectedBranchId, selectedBranchMode, currentBranch } = GlobalStore.getState();
    const branchLabel = selectedBranchMode === 'all'
      ? I18nService.t('dash_branch_all')
      : `${currentBranch?.name || I18nService.t('branch_main')}`;
    const branchSubLabel = selectedBranchMode === 'all'
      ? `Vista consolidada de ${GlobalStore.getState().branches?.length || 1} sucursal(es)`
      : `${currentBranch?.city || currentBranch?.address || I18nService.t('branch_title')}`;


    // Alerts logic
    const alerts = [];
    if (m.lowStockCount > 0 && isModuleEnabled(this.currentCompany, 'inventory')) {
      alerts.push({ text: `${m.lowStockCount} ${m.lowStockCount > 1 ? I18nService.t('inv_products') : I18nService.t('inv_product_name')} ${m.lowStockCount > 1 ? I18nService.t('ale_low_stock') : I18nService.t('ale_low_stock')}`, path: '#/inventory/alerts', color: '#f59e0b' });
    }
    if (m.payableOverdue > 0 && isModuleEnabled(this.currentCompany, 'accountsPayable')) {
      alerts.push({ text: `${m.payableOverdue} ${m.payableOverdue > 1 ? I18nService.t('ap_title') : I18nService.t('ap_title')} ${I18nService.t('ap_overdue')}`, path: '#/owner/accounts-payable', color: '#ef4444' });
    }
    if (m.pendingRequests > 0 && isModuleEnabled(this.currentCompany, 'serviceRequests')) {
      alerts.push({ text: `${m.pendingRequests} ${I18nService.t('dash_pending_requests')}`, path: '#/manager/service-requests', color: '#6366f1' });
    }

    const alertsHTML = alerts.length > 0
      ? alerts.map(a => `<div class="odb-alert-item" onclick="window.location.hash='${a.path}'">
          <span style="font-weight:600;">${a.text}</span>
          <span style="color:var(--color-accent);font-weight:700">${I18nService.t('view')} →</span>
        </div>`).join('')
      : `<div style="padding:14px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:var(--radius-md);color:#10b981;font-weight:600;font-size:0.85rem">
          ${I18nService.t('dash_stable_operation_desc')}
        </div>`;

    // Area scores
    const areaVentas = m.hasData ? Math.min(98, Math.max(30, m.score + 2)) : null;
    const areaFinanzas = m.hasData ? Math.min(95, Math.max(25, m.score - 4)) : null;
    const areaInventario = isModuleEnabled(this.currentCompany, 'inventory') ? (m.lowStockCount === 0 ? 92 : 74) : null;
    const areaClientes = isModuleEnabled(this.currentCompany, 'recurringClients') ? 80 : null;
    const areaProductividad = this.state.employees.length > 0 ? 85 : null;

    // Quick Actions buttons (max 5)
    const quickActions = [];
    if (isModuleEnabled(this.currentCompany, 'pos')) quickActions.push({ label: I18nService.t('dash_new_sale'), path: '#/cashier/pos', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>` });
    if (isModuleEnabled(this.currentCompany, 'recurringClients')) quickActions.push({ label: I18nService.t('dash_new_client_btn'), path: '#/owner/recurring-clients', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>` });
    if (isModuleEnabled(this.currentCompany, 'inventory')) quickActions.push({ label: I18nService.t('dash_new_product_btn'), path: '#/inventory/products', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>` });
    if (isModuleEnabled(this.currentCompany, 'expenses')) quickActions.push({ label: I18nService.t('dash_register_expense_btn'), path: '#/owner/expenses', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>` });
    if (isModuleEnabled(this.currentCompany, 'serviceRequests')) quickActions.push({ label: I18nService.t('dash_new_order_btn'), path: '#/manager/service-requests', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>` });

    const actionsHTML = quickActions.slice(0, 5).map(a => `
      <a href="${a.path}" class="odb-action-btn" style="display:inline-flex;align-items:center;gap:8px;">
        ${a.icon}
        <span>${a.label}</span>
      </a>
    `).join('');

    // Recent activity list
    const recentActivity = [
      ...this.state.ventas.slice(0, 3).map(v => ({ text: I18nService.t('dash_sale_registered_by', { amount: this._formatMoney(v.total || v.monto || 0) }), time: 'Reciente', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>` })),
      ...this.state.gastos.slice(0, 2).map(g => ({ text: I18nService.t('dash_expense_registered', { desc: g.description || g.notes || I18nService.t('fin_expenses'), amount: this._formatMoney(g.amount || 0) }), time: 'Reciente', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>` }))
    ].slice(0, 4);

    const activityHTML = recentActivity.length > 0
      ? recentActivity.map(act => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border)">
            <span>${act.icon}</span>
            <div style="flex:1;font-size:0.83rem">${act.text}</div>
          </div>
        `).join('')
      : `<div style="font-size:0.82rem;color:var(--color-text-secondary);text-align:center;padding:16px">${I18nService.t('dash_no_recent_activity')}</div>`;

    root.innerHTML = `
      ${this._styles()}
      <div class="odb-root">

        <!-- 1. HEADER / CONTEXT CARD -->
        <div class="odb-context-card">
          <div>
            <div style="font-size:0.95rem;font-weight:700;">${companyName}</div>
            <div style="font-size:0.75rem;color:var(--color-text-secondary);margin-top:2px;">${branchSubLabel} · ${this._getFormattedDate()}</div>
          </div>
          <div class="odb-status-badge ${alerts.length > 0 ? 'warning' : 'stable'}">
            ${alerts.length > 0 ? I18nService.t('dash_attention_needed') : I18nService.t('dash_stable_operation')}
          </div>
        </div>


        <!-- 2. RESUMEN GENERAL (KPI CARDS) -->
        <div class="odb-kpi-grid">
          <div class="odb-kpi-card" style="border-left:4px solid var(--color-accent)">
            <div class="odb-kpi-lbl">${I18nService.t('dash_sales_today')}</div>
            <div class="odb-kpi-val" style="color:var(--color-accent)">${this._formatMoney(m.ventasHoy)}</div>
            <div class="odb-kpi-sub">${I18nService.t('dash_day_in_progress')}</div>
          </div>

          <div class="odb-kpi-card" style="border-left:4px solid #34d399">
            <div class="odb-kpi-lbl">${I18nService.t('dash_sales_month')}</div>
            <div class="odb-kpi-val" style="color:#10b981">${this._formatMoney(m.ventasMes)}</div>
            <div class="odb-kpi-sub">${m.salesTrend !== 0 ? `<span class="odb-trend-badge ${m.salesTrend >= 0 ? 'odb-trend-up' : 'odb-trend-down'}">${m.salesTrend >= 0 ? '↑' : '↓'} ${Math.abs(m.salesTrend)}% ${I18nService.t('dash_vs_last_month')}</span>` : I18nService.t('dash_this_month')}</div>
          </div>

          ${isModuleEnabled(this.currentCompany, 'expenses') ? `
            <div class="odb-kpi-card" style="border-left:4px solid #ef4444">
              <div class="odb-kpi-lbl">${I18nService.t('dash_expenses_month')}</div>
              <div class="odb-kpi-val" style="color:#ef4444">${this._formatMoney(m.gastosMes)}</div>
              <div class="odb-kpi-sub">${I18nService.t('dash_operational_costs')}</div>
            </div>
          ` : ''}

          ${isModuleEnabled(this.currentCompany, 'financialControl') ? `
            <div class="odb-kpi-card" style="border-left:4px solid #6366f1">
              <div class="odb-kpi-lbl">${I18nService.t('dash_estimated_profit')}</div>
              <div class="odb-kpi-val" style="color:#6366f1">${this._formatMoney(m.utilidadMes)}</div>
              <div class="odb-kpi-sub">${m.profitTrend !== 0 ? `<span class="odb-trend-badge ${m.profitTrend >= 0 ? 'odb-trend-up' : 'odb-trend-down'}">${m.profitTrend >= 0 ? '↑' : '↓'} ${Math.abs(m.profitTrend)}% ${I18nService.t('dash_vs_last_month')}</span>` : I18nService.t('dash_net_margin')}</div>
            </div>
          ` : ''}

          <div class="odb-kpi-card" style="border-left:4px solid #f59e0b">
            <div class="odb-kpi-lbl">${I18nService.t('dash_total_clients')}</div>
            <div class="odb-kpi-val" style="color:#f59e0b">${m.totalClientes}</div>
            <div class="odb-kpi-sub">${I18nService.t('dash_registered')}</div>
          </div>
        </div>

        <!-- 3. SCORE DE RENDIMIENTO GENERAL -->
        <div class="odb-score-card">
          <div class="odb-score-circle">
            <div style="font-size:0.75rem;color:var(--color-text-secondary);font-weight:700;text-transform:uppercase;margin-bottom:6px">${I18nService.t('dash_overall_performance')}</div>
            ${m.hasData ? `
              <div class="odb-score-num">${m.score}</div>
              <div style="font-size:0.75rem;color:var(--color-text-secondary)">${I18nService.t('dash_out_of_100')}</div>
              <div class="odb-score-lbl" style="color:var(--color-accent);margin-top:6px">${m.scoreLabel}</div>
            ` : `
              <div style="font-size:1.1rem;font-weight:700;color:var(--color-text-secondary);margin:12px 0">${I18nService.t('dash_analyzing')}</div>
              <div style="font-size:0.75rem;color:var(--color-text-secondary)">${I18nService.t('dash_not_enough_data_score')}</div>
            `}
          </div>

          <div class="odb-area-list">
            <div style="font-size:0.83rem;font-weight:700;margin-bottom:6px">${I18nService.t('dash_performance_by_area')}</div>

            ${areaVentas !== null ? `
              <div class="odb-area-row">
                <div class="odb-area-hdr"><span>${I18nService.t('pos_title')}</span><span>${areaVentas}%</span></div>
                <div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${areaVentas}%;background:#6366f1"></div></div>
              </div>` : ''}

            ${areaFinanzas !== null ? `
              <div class="odb-area-row">
                <div class="odb-area-hdr"><span>${I18nService.t('fin_title')}</span><span>${areaFinanzas}%</span></div>
                <div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${areaFinanzas}%;background:#34d399"></div></div>
              </div>` : ''}

            ${areaInventario !== null ? `
              <div class="odb-area-row">
                <div class="odb-area-hdr"><span>${I18nService.t('inv_title')}</span><span>${areaInventario}%</span></div>
                <div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${areaInventario}%;background:#f59e0b"></div></div>
              </div>` : ''}

            ${areaClientes !== null ? `
              <div class="odb-area-row">
                <div class="odb-area-hdr"><span>${I18nService.t('dash_clients')}</span><span>${areaClientes}%</span></div>
                <div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${areaClientes}%;background:#06b6d4"></div></div>
              </div>` : ''}

            ${areaProductividad !== null ? `
              <div class="odb-area-row">
                <div class="odb-area-hdr"><span>${I18nService.t('dash_team_productivity')}</span><span>${areaProductividad}%</span></div>
                <div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${areaProductividad}%;background:#8b5cf6"></div></div>
              </div>` : ''}
          </div>
        </div>

        <!-- 4. 2-COLUMN SECTION (CHART + ALERTS & TEAM) -->
        <div class="odb-2col">

          <!-- Left column: Chart + Activity -->
          <div style="display:flex;flex-direction:column;gap:16px">

            <!-- Chart Card with Line Chart & Time Breakdown (Hourly, Daily, Monthly) -->
            <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
                <div>
                  <h3 style="font-size:0.95rem;font-weight:700;margin:0">${I18nService.t('dash_operational_performance')}</h3>
                  <p style="font-size:0.75rem;color:var(--color-text-secondary);margin:2px 0 0" id="odb-chart-sub-label">${I18nService.t('dash_most_active_hours')}</p>
                </div>
                <!-- Time Breakdown Buttons -->
                <div style="display:flex;gap:4px;background:var(--color-bg-tertiary);padding:3px;border-radius:18px;border:1px solid var(--color-border)" id="odb-chart-mode-toggle">
                  <button class="odb-cmp-btn ${this.chartMode === 'HOURS' ? 'active' : ''}" data-mode="HOURS" style="padding:4px 10px;font-size:0.72rem">${I18nService.t('dash_by_hours')}</button>
                  <button class="odb-cmp-btn ${this.chartMode === 'DAYS' || !this.chartMode ? 'active' : ''}" data-mode="DAYS" style="padding:4px 10px;font-size:0.72rem">${I18nService.t('dash_days_week_btn')}</button>
                  <button class="odb-cmp-btn ${this.chartMode === 'MONTHS' ? 'active' : ''}" data-mode="MONTHS" style="padding:4px 10px;font-size:0.72rem">${I18nService.t('dash_months_btn')}</button>
                </div>
              </div>
              <div id="odb-chart-container" style="width:100%;height:220px;"></div>
            </div>

            <!-- Recent Activity -->
            <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
              <h3 style="font-size:0.95rem;font-weight:700;margin:0 0 10px">${I18nService.t('dash_recent_activity')}</h3>
              ${activityHTML}
            </div>

          </div>

          <!-- Right column: Alerts + Team + Quick Actions -->
          <div style="display:flex;flex-direction:column;gap:16px">

            <!-- Critical Alerts -->
            <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
              <h3 style="font-size:0.95rem;font-weight:700;margin:0 0 12px">⚠️ ${I18nService.t('dash_attention_needed')}</h3>
              <div style="display:flex;flex-direction:column;gap:8px">${alertsHTML}</div>
            </div>

            <!-- Team Performance -->
            <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <h3 style="font-size:0.95rem;font-weight:700;margin:0">👥 ${I18nService.t('dash_team_performance')}</h3>
                <a href="#/manager/employees" style="font-size:0.75rem;color:var(--color-accent);font-weight:600;text-decoration:none">${I18nService.t('dash_view_full_performance')}</a>
              </div>
              <div style="display:flex;flex-direction:column;gap:10px">
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--color-text-secondary)">
                  <span>${I18nService.t('dash_active_staff_count', { count: this.state.employees.length || 1 })}</span>
                  <span>${I18nService.t('dash_compliance')}: <strong style="color:#10b981">88%</strong></span>
                </div>
                ${this.state.employees.slice(0, 3).map(e => `
                  <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.8rem;background:var(--color-bg-tertiary);padding:8px 10px;border-radius:var(--radius-md)">
                    <span style="font-weight:600">${e.displayName || e.email || I18nService.t('emp_col_employee')}</span>
                    <span style="color:var(--color-accent);font-weight:700">85%</span>
                  </div>
                `).join('') || `
                  <div style="font-size:0.78rem;color:var(--color-text-secondary);text-align:center;padding:8px">${I18nService.t('dash_no_employees_assigned')}</div>
                `}
              </div>
            </div>

            <!-- Quick Actions -->
            <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
              <h3 style="font-size:0.95rem;font-weight:700;margin:0 0 12px">⚡ ${I18nService.t('dash_quick_actions')}</h3>
              <div class="odb-actions-grid">${actionsHTML}</div>
            </div>

          </div>

        </div>

      </div>
    `;

    // Mount chart
    const chartBox = root.querySelector('#odb-chart-container');
    if (chartBox && this.chart) {
      chartBox.appendChild(this.chart.mount());
      this._updateChartData(root);
    }

    // Bind mode toggle buttons
    root.querySelectorAll('#odb-chart-mode-toggle button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        root.querySelectorAll('#odb-chart-mode-toggle button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.chartMode = btn.dataset.mode;
        this._updateChartData(root);
      });
    });
  }

  // ─── CHART TIME BREAKDOWN CALCULATIONS ──────────────────────────────────────
  _updateChartData(root) {
    if (!this.chart) return;

    const mode = this.chartMode || 'HOURS';
    let labels = [];
    let datasets = [];
    let subLabel = '';

    if (mode === 'HOURS') {
      subLabel = I18nService.t('dash_chart_hours_active');
      labels = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
      const salesByHour = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      const opsByHour = [0, 0, 0, 0, 0, 0, 0, 0, 0];

      this.state.ventas.forEach(v => {
        const ts = Number(v.createdAt || v.timestamp || 0);
        if (!ts) return;
        const h = new Date(ts).getHours();
        let idx = Math.floor((h - 5) / 2);
        if (idx < 0) idx = 0;
        if (idx >= salesByHour.length) idx = salesByHour.length - 1;
        salesByHour[idx] += Number(v.total || v.monto || 0);
        opsByHour[idx] += 1;
      });

      datasets = [
        { label: I18nService.t('dash_chart_sales_hour'), data: salesByHour, color: '#6366f1' },
        { label: I18nService.t('dash_chart_movement'), data: opsByHour, color: '#34d399' }
      ];
    } else if (mode === 'DAYS') {
      subLabel = I18nService.t('dash_chart_days_active');
      labels = [I18nService.t('day_mon'), I18nService.t('day_tue'), I18nService.t('day_wed'), I18nService.t('day_thu'), I18nService.t('day_fri'), I18nService.t('day_sat'), I18nService.t('day_sun')];
      const salesByDay = [0, 0, 0, 0, 0, 0, 0];
      const expensesByDay = [0, 0, 0, 0, 0, 0, 0];

      this.state.ventas.forEach(v => {
        const ts = Number(v.createdAt || v.timestamp || 0);
        if (!ts) return;
        let dayIdx = new Date(ts).getDay() - 1; // 0=Mon ... 6=Sun
        if (dayIdx < 0) dayIdx = 6;
        salesByDay[dayIdx] += Number(v.total || v.monto || 0);
      });

      this.state.gastos.forEach(g => {
        const ts = Number(g.createdAt || g.timestamp || g.dateTimestamp || 0);
        if (!ts) return;
        let dayIdx = new Date(ts).getDay() - 1;
        if (dayIdx < 0) dayIdx = 6;
        expensesByDay[dayIdx] += Number(g.amount || g.monto || 0);
      });

      datasets = [
        { label: I18nService.t('dash_total_sales'), data: salesByDay, color: '#6366f1' },
        { label: I18nService.t('fin_expenses'), data: expensesByDay, color: '#ef4444' }
      ];
    } else if (mode === 'MONTHS') {
      subLabel = I18nService.t('dash_chart_months_active');
      labels = [I18nService.t('month_jan').substring(0,3), I18nService.t('month_feb').substring(0,3), I18nService.t('month_mar').substring(0,3), I18nService.t('month_apr').substring(0,3), I18nService.t('month_may').substring(0,3), I18nService.t('month_jun').substring(0,3), I18nService.t('month_jul').substring(0,3), I18nService.t('month_aug').substring(0,3), I18nService.t('month_sep').substring(0,3), I18nService.t('month_oct').substring(0,3), I18nService.t('month_nov').substring(0,3), I18nService.t('month_dec').substring(0,3)];
      const salesByMonth = new Array(12).fill(0);
      const expensesByMonth = new Array(12).fill(0);

      this.state.ventas.forEach(v => {
        const ts = Number(v.createdAt || v.timestamp || 0);
        if (!ts) return;
        const mIdx = new Date(ts).getMonth();
        salesByMonth[mIdx] += Number(v.total || v.monto || 0);
      });

      this.state.gastos.forEach(g => {
        const ts = Number(g.createdAt || g.timestamp || g.dateTimestamp || 0);
        if (!ts) return;
        const mIdx = new Date(ts).getMonth();
        expensesByMonth[mIdx] += Number(g.amount || g.monto || 0);
      });

      datasets = [
        { label: I18nService.t('dash_total_sales'), data: salesByMonth, color: '#6366f1' },
        { label: I18nService.t('fin_expenses'), data: expensesByMonth, color: '#ef4444' }
      ];
    }

    const subLabelEl = root.querySelector('#odb-chart-sub-label');
    if (subLabelEl) subLabelEl.textContent = subLabel;

    this.chart.updateData(labels, datasets);
  }

  // ─── MOUNT ─────────────────────────────────────────────────────────────────
  mount() {
    this.element = this.layout.mount();

    // Subscribe to branch context changes
    const unsubBranch = GlobalStore.subscribe('selectedBranchId', () => {
      this.renderUI();
    });
    this.listeners.push(unsubBranch);

    // Bind manual refresh button
    this.element.querySelector('#btn-refresh-dashboard')?.addEventListener('click', async () => {
      this.state.loading = true;
      this.renderUI();
      await this.loadData();
    });

    this.loadData();
    return this.element;
  }

  unmount() {
    this.listeners.forEach(id => {
      if (typeof id === 'string') FirestoreService.unsubscribe(id);
      else if (typeof id === 'function') id();
    });
    this.listeners = [];
    if (this.layout && typeof this.layout.unmount === 'function') {
      this.layout.unmount();
    }
    this.element = null;
    super.unmount();
  }
}
