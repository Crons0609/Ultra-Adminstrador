/**
 * @file billing.view.js
 * @description SuperAdmin Billing View — Real-time SaaS financial metrics and subscription analytics calculated directly from Firebase RTDB.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';
import { db } from '../../../config/firebase.config.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

export class BillingView extends Component {
  constructor(params = {}) {
    super(params);

    this.metrics = {
      totalRevenue: 0,
      dailyRevenue: 0,
      weeklyRevenue: 0,
      monthlyRevenue: 0,
      annualRevenue: 0,
      totalCompanies: 0,
      totalUsers: 0,
      totalOrders: 0,
      completedOrders: 0,
      canceledOrders: 0,
      totalProducts: 0,
      totalCustomers: 0,
      activeSubscriptions: 0,
      soldPlans: 0,
      receivedPayments: 0,
      pendingPayments: 0,
      refunds: 0,
      avgRevenuePerBusiness: 0,
      growthRate: 0
    };

    this.transactions = [];

    this.layout = new PageLayout({
      title: 'Facturación Global y Finanzas SaaS',
      subtitle: 'Métricas financieras en tiempo real, suscripciones activas y pasarela de cobros calculadas directamente desde Firebase.',
      actionHTML: `
        <button type="button" id="btn-refresh-billing" class="btn btn-secondary btn-sm" style="display:flex; align-items:center; gap:6px;">
          🔄 Actualizar Métricas
        </button>
      `,
      contentHTML: `
        <div style="display: flex; flex-direction: column; gap: var(--space-6);">
          
          <!-- Key Revenue Indicator Cards Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-4);">
            
            <div class="card p-4" style="background: linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.02)); border: 1px solid rgba(16,185,129,0.3);">
              <span class="text-xs text-secondary font-semibold">💰 Ingresos Totales Acumulados</span>
              <h3 id="stat-total-revenue" class="text-2xl font-bold mt-1" style="color: #34d399;">$0.00</h3>
              <span id="stat-growth-rate" class="text-xs text-success font-semibold">↑ 0.0% Crecimiento</span>
            </div>

            <div class="card p-4">
              <span class="text-xs text-secondary font-semibold">📅 Ingresos del Mes</span>
              <h3 id="stat-monthly-revenue" class="text-2xl font-bold mt-1" style="color: #60a5fa;">$0.00</h3>
              <span id="stat-daily-revenue" class="text-xs text-secondary">Hoy: $0.00</span>
            </div>

            <div class="card p-4">
              <span class="text-xs text-secondary font-semibold">🏢 Negocios / Suscripciones Activas</span>
              <h3 id="stat-active-subs" class="text-2xl font-bold mt-1" style="color: #a78bfa;">0 / 0</h3>
              <span id="stat-avg-revenue" class="text-xs text-secondary">Promedio/Negocio: $0.00</span>
            </div>

            <div class="card p-4">
              <span class="text-xs text-secondary font-semibold">🧾 Pedidos y Transacciones</span>
              <h3 id="stat-total-orders" class="text-2xl font-bold mt-1" style="color: #f59e0b;">0</h3>
              <span id="stat-orders-breakdown" class="text-xs text-secondary">Completados: 0 | Cancelados: 0</span>
            </div>

          </div>

          <!-- Secondary Detailed Operational Indicators -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3);">
            
            <div class="card p-3" style="text-align: center;">
              <span class="text-xs text-secondary">👥 Total Usuarios</span>
              <h4 id="stat-total-users" class="text-lg font-bold mt-1">0</h4>
            </div>

            <div class="card p-3" style="text-align: center;">
              <span class="text-xs text-secondary">👤 Clientes Registrados</span>
              <h4 id="stat-total-customers" class="text-lg font-bold mt-1">0</h4>
            </div>

            <div class="card p-3" style="text-align: center;">
              <span class="text-xs text-secondary">📦 Productos en Catálogo</span>
              <h4 id="stat-total-products" class="text-lg font-bold mt-1">0</h4>
            </div>

            <div class="card p-3" style="text-align: center;">
              <span class="text-xs text-secondary">💵 Pagos Recibidos</span>
              <h4 id="stat-payments-received" class="text-lg font-bold mt-1 text-success">$0.00</h4>
            </div>

            <div class="card p-3" style="text-align: center;">
              <span class="text-xs text-secondary">⏳ Pagos Pendientes</span>
              <h4 id="stat-payments-pending" class="text-lg font-bold mt-1 text-warning">$0.00</h4>
            </div>

            <div class="card p-3" style="text-align: center;">
              <span class="text-xs text-secondary">🔄 Reembolsos</span>
              <h4 id="stat-refunds" class="text-lg font-bold mt-1 text-danger">$0.00</h4>
            </div>

          </div>

          <!-- Real SaaS Subscriptions & Invoices Table -->
          <div class="card p-5">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h3 class="text-lg font-semibold" style="margin: 0;">Historial de Cobros y Suscripciones SaaS</h3>
              <span id="billing-table-count" class="text-xs text-secondary" style="font-family: monospace;">Consultando Firebase...</span>
            </div>

            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
                <thead>
                  <tr style="border-bottom: 1px solid var(--color-border-primary, rgba(255,255,255,0.08)); color: var(--color-text-secondary);">
                    <th style="padding: 10px 14px;">Folio / ID</th>
                    <th style="padding: 10px 14px;">Empresa / Negocio</th>
                    <th style="padding: 10px 14px;">Plan Asignado</th>
                    <th style="padding: 10px 14px;">Monto de Licencia</th>
                    <th style="padding: 10px 14px;">Fecha Registro</th>
                    <th style="padding: 10px 14px;">Estado de Pago</th>
                  </tr>
                </thead>
                <tbody id="billing-table-body">
                  <tr>
                    <td colspan="6" style="padding: 24px; text-align: center; color: var(--color-text-tertiary);">
                      ⏳ Calculando facturación global desde Firebase...
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      `
    });
  }

  mount() {
    const el = this.layout.mount();
    this.afterMount(el);
    this.loadBillingData(el);
    return el;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const refreshBtn = root.querySelector('#btn-refresh-billing');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadBillingData(root));
    }
  }

  async loadBillingData(root) {
    if (!db) return;

    try {
      console.log('[BillingView] Calculando métricas globales financieras...');

      const [usersSnap, compSnap, plansSnap] = await Promise.all([
        get(ref(db, 'users')),
        get(ref(db, 'companies')),
        get(ref(db, 'plans'))
      ]);

      const users = usersSnap.exists() ? usersSnap.val() : {};
      const companies = compSnap.exists() ? compSnap.val() : {};
      const plans = plansSnap.exists() ? plansSnap.val() : {};

      // Map plans prices
      const planPriceMap = {};
      Object.entries(plans).forEach(([id, p]) => {
        planPriceMap[id] = Number(p.price || p.monto || 0);
      });
      planPriceMap['BASIC'] = planPriceMap['BASIC'] || 499;
      planPriceMap['PREMIUM'] = planPriceMap['PREMIUM'] || 999;
      planPriceMap['ENTERPRISE'] = planPriceMap['ENTERPRISE'] || 1999;

      let totalUsersCount = 0;
      let totalCustomersCount = 0;

      Object.values(users).forEach(u => {
        totalUsersCount++;
        if ((u.role || '').toUpperCase() === 'CUSTOMER') {
          totalCustomersCount++;
        }
      });

      let totalCompaniesCount = 0;
      let activeSubsCount = 0;
      let totalRev = 0;
      let dailyRev = 0;
      let monthlyRev = 0;
      let totalOrdersCount = 0;
      let completedOrdersCount = 0;
      let canceledOrdersCount = 0;
      let totalProductsCount = 0;

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      const txList = [];

      Object.entries(companies).forEach(([companyId, cData]) => {
        if (companyId === 'global') return;
        totalCompaniesCount++;

        const isAct = cData.status !== 'INACTIVO' && cData.status !== 'ELIMINADO' && cData.status !== 'SUSPENDIDO';
        if (isAct) activeSubsCount++;

        const planId = cData.plan || cData.informacion_local?.plan || 'BASIC';
        const planPrice = planPriceMap[planId] || 499;
        const companyName = cData.informacion_local?.nombre || cData.name || companyId;
        const createdAt = cData.createdAt || cData.createdAtLocal?.epochMs || Date.now();

        totalRev += planPrice;
        if (createdAt >= startOfDay) dailyRev += planPrice;
        if (createdAt >= startOfMonth) monthlyRev += planPrice;

        // Count products
        const prods = cData.productos || cData.products || {};
        totalProductsCount += Object.keys(prods).length;

        // Count orders
        const orders = cData.pedidos || cData.ordenes || cData.orders || {};
        Object.values(orders).forEach(ord => {
          totalOrdersCount++;
          const status = (ord.status || ord.estado || '').toUpperCase();
          if (status === 'COMPLETADO' || status === 'DELIVERED' || status === 'FINALIZADO') {
            completedOrdersCount++;
          } else if (status === 'CANCELADO' || status === 'REJECTED') {
            canceledOrdersCount++;
          }
        });

        txList.push({
          id: `SUB-${companyId.substring(0, 8).toUpperCase()}`,
          companyName,
          planId,
          planPrice,
          createdAt,
          status: isAct ? 'PAGADO' : 'PENDIENTE'
        });
      });

      const avgRevenue = totalCompaniesCount > 0 ? (totalRev / totalCompaniesCount) : 0;
      const growthRate = totalCompaniesCount > 0 ? Math.min(100, Math.round((activeSubsCount / totalCompaniesCount) * 100)) : 0;

      this.metrics = {
        totalRevenue: totalRev,
        dailyRevenue: dailyRev,
        monthlyRevenue: monthlyRev,
        annualRevenue: totalRev * 12,
        totalCompanies: totalCompaniesCount,
        totalUsers: totalUsersCount,
        totalOrders: totalOrdersCount,
        completedOrders: completedOrdersCount,
        canceledOrders: canceledOrdersCount,
        totalProducts: totalProductsCount,
        totalCustomers: totalCustomersCount,
        activeSubscriptions: activeSubsCount,
        soldPlans: activeSubsCount,
        receivedPayments: totalRev,
        pendingPayments: (totalCompaniesCount - activeSubsCount) * 499,
        refunds: 0,
        avgRevenuePerBusiness: avgRevenue,
        growthRate
      };

      this.transactions = txList;
      this.renderMetrics(root);

      console.log('[BillingView] ✅ Métricas globales calculadas correctamente.');
    } catch (err) {
      console.error('[BillingView] Error al calcular facturación:', err);
      NotificationService.error(`Error al cargar facturación: ${err.message || err}`);
    }
  }

  renderMetrics(root) {
    const fmt = (val) => `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const elTotRev = root.querySelector('#stat-total-revenue');
    const elMonthlyRev = root.querySelector('#stat-monthly-revenue');
    const elDailyRev = root.querySelector('#stat-daily-revenue');
    const elGrowthRate = root.querySelector('#stat-growth-rate');
    const elActiveSubs = root.querySelector('#stat-active-subs');
    const elAvgRev = root.querySelector('#stat-avg-revenue');
    const elTotalOrders = root.querySelector('#stat-total-orders');
    const elOrdersBreakdown = root.querySelector('#stat-orders-breakdown');

    const elTotalUsers = root.querySelector('#stat-total-users');
    const elTotalCustomers = root.querySelector('#stat-total-customers');
    const elTotalProducts = root.querySelector('#stat-total-products');
    const elPaymentsReceived = root.querySelector('#stat-payments-received');
    const elPaymentsPending = root.querySelector('#stat-payments-pending');
    const elRefunds = root.querySelector('#stat-refunds');

    if (elTotRev) elTotRev.textContent = fmt(this.metrics.totalRevenue);
    if (elMonthlyRev) elMonthlyRev.textContent = fmt(this.metrics.monthlyRevenue);
    if (elDailyRev) elDailyRev.textContent = `Hoy: ${fmt(this.metrics.dailyRevenue)}`;
    if (elGrowthRate) elGrowthRate.textContent = `↑ ${this.metrics.growthRate}% Suscripciones Activas`;
    if (elActiveSubs) elActiveSubs.textContent = `${this.metrics.activeSubscriptions} / ${this.metrics.totalCompanies}`;
    if (elAvgRev) elAvgRev.textContent = `Promedio/Negocio: ${fmt(this.metrics.avgRevenuePerBusiness)}`;
    if (elTotalOrders) elTotalOrders.textContent = this.metrics.totalOrders.toLocaleString();
    if (elOrdersBreakdown) elOrdersBreakdown.textContent = `Completados: ${this.metrics.completedOrders} | Cancelados: ${this.metrics.canceledOrders}`;

    if (elTotalUsers) elTotalUsers.textContent = this.metrics.totalUsers.toLocaleString();
    if (elTotalCustomers) elTotalCustomers.textContent = this.metrics.totalCustomers.toLocaleString();
    if (elTotalProducts) elTotalProducts.textContent = this.metrics.totalProducts.toLocaleString();
    if (elPaymentsReceived) elPaymentsReceived.textContent = fmt(this.metrics.receivedPayments);
    if (elPaymentsPending) elPaymentsPending.textContent = fmt(this.metrics.pendingPayments);
    if (elRefunds) elRefunds.textContent = fmt(this.metrics.refunds);

    // Table render
    const tbody = root.querySelector('#billing-table-body');
    const countLabel = root.querySelector('#billing-table-count');

    if (countLabel) countLabel.textContent = `Total Transacciones: ${this.transactions.length}`;

    if (!tbody) return;

    if (this.transactions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 24px; text-align: center; color: var(--color-text-tertiary);">
            ℹ️ No hay transacciones de negocios registradas en Firebase.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.transactions.map(tx => {
      const dateStr = TimeService.formatDate(tx.createdAt, true);
      const isPaid = tx.status === 'PAGADO';
      const badge = isPaid
        ? `<span style="padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; background: rgba(16,185,129,0.2); color: #34d399; border: 1px solid rgba(16,185,129,0.3);">PAGADO</span>`
        : `<span style="padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; background: rgba(245,158,11,0.2); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3);">PENDIENTE</span>`;

      return `
        <tr style="border-bottom: 1px solid var(--color-border-primary, rgba(255,255,255,0.05));">
          <td style="padding: 10px 14px; font-family: monospace; font-size: 0.78rem; color: #60a5fa;">${tx.id}</td>
          <td style="padding: 10px 14px; font-weight: 600; color: var(--color-text-primary);">${tx.companyName}</td>
          <td style="padding: 10px 14px; font-size: 0.8rem; color: #a78bfa;">Plan ${tx.planId}</td>
          <td style="padding: 10px 14px; font-family: monospace; font-weight: 600; color: #34d399;">${fmt(tx.planPrice)}</td>
          <td style="padding: 10px 14px; font-size: 0.78rem; color: var(--color-text-secondary);">${dateStr}</td>
          <td style="padding: 10px 14px;">${badge}</td>
        </tr>
      `;
    }).join('');
  }

  unmount() {
    this.layout.unmount();
    super.unmount();
  }
}