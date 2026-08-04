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
import { Modal } from '../../../components/ui/modal.js';

export class BillingView extends Component {
  constructor(params = {}) {
    super(params);

    this.metrics = {
      totalRevenue: 0,
      dailyRevenue: 0,
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
      expiredSubscriptions: 0,
      cancelledSubscriptions: 0,
      suspendedSubscriptions: 0,
      renewalsCount: 0,
      avgRevenuePerBusiness: 0,
      growthRate: 0,
      projectedRevenue: 0
    };

    this.planTotals = {};
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
              <span id="stat-growth-rate" class="text-xs text-success font-semibold">↑ 0% Suscripciones Activas</span>
            </div>

            <div class="card p-4">
              <span class="text-xs text-secondary font-semibold">📅 Ingresos del Mes (MRR)</span>
              <h3 id="stat-monthly-revenue" class="text-2xl font-bold mt-1" style="color: #60a5fa;">$0.00</h3>
              <span id="stat-daily-revenue" class="text-xs text-secondary">Hoy: $0.00</span>
            </div>

            <div class="card p-4">
              <span class="text-xs text-secondary font-semibold">🏢 Negocios / Suscripciones Activas</span>
              <h3 id="stat-active-subs" class="text-2xl font-bold mt-1" style="color: #a78bfa;">0 / 0</h3>
              <span id="stat-avg-revenue" class="text-xs text-secondary">Promedio/Negocio: $0.00</span>
            </div>

            <div class="card p-4">
              <span class="text-xs text-secondary font-semibold">🔮 Ingresos Anuales Proyectados (ARR)</span>
              <h3 id="stat-projected-revenue" class="text-2xl font-bold mt-1" style="color: #10b981;">$0.00</h3>
              <span id="stat-annual-revenue" class="text-xs text-secondary">Recurrente Anual: $0.00</span>
            </div>

          </div>

          <!-- Secondary Detailed Operational Indicators -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-3);">
            
            <div class="card p-3" style="text-align: center; border-left: 3px solid #10b981;">
              <span class="text-xs text-secondary" style="font-size:0.7rem;">🟢 Activas</span>
              <h4 id="stat-active-count" class="text-md font-bold mt-1 text-success">0</h4>
            </div>

            <div class="card p-3" style="text-align: center; border-left: 3px solid #f59e0b;">
              <span class="text-xs text-secondary" style="font-size:0.7rem;">⏳ Vencidas</span>
              <h4 id="stat-expired-count" class="text-md font-bold mt-1 text-warning">0</h4>
            </div>

            <div class="card p-3" style="text-align: center; border-left: 3px solid #ef4444;">
              <span class="text-xs text-secondary" style="font-size:0.7rem;">❌ Canceladas / Inactivas</span>
              <h4 id="stat-cancelled-count" class="text-md font-bold mt-1 text-danger">0</h4>
            </div>

            <div class="card p-3" style="text-align: center; border-left: 3px solid #3b82f6;">
              <span class="text-xs text-secondary" style="font-size:0.7rem;">🔄 Renovaciones</span>
              <h4 id="stat-renewals-count" class="text-md font-bold mt-1" style="color: #60a5fa;">0</h4>
            </div>

            <div class="card p-3" style="text-align: center;">
              <span class="text-xs text-secondary" style="font-size:0.7rem;">👥 Total Usuarios</span>
              <h4 id="stat-total-users" class="text-md font-bold mt-1">0</h4>
            </div>

            <div class="card p-3" style="text-align: center;">
              <span class="text-xs text-secondary" style="font-size:0.7rem;">📦 Productos Catálogo</span>
              <h4 id="stat-total-products" class="text-md font-bold mt-1">0</h4>
            </div>

          </div>

          <!-- SaaS Plans Income Distribution Panel -->
          <div class="card p-5 animate-fade-in" style="background: rgba(255, 255, 255, 0.01); border: 1px solid var(--color-border);">
            <h3 class="text-xs font-bold uppercase tracking-wider mb-4" style="color: var(--color-accent);">📊 Distribución de Ingresos y Suscripciones por Plan</h3>
            <div id="plans-distribution-container" style="display: flex; flex-direction: column; gap: var(--space-3);">
              <p class="text-secondary text-xs">Cargando distribución de planes...</p>
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
                    <th style="padding: 10px 14px; text-align: right;">Acción</th>
                  </tr>
                </thead>
                <tbody id="billing-table-body">
                  <tr>
                    <td colspan="7" style="padding: 24px; text-align: center; color: var(--color-text-tertiary);">
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

    // Row detail click trigger
    const tableBody = root.querySelector('#billing-table-body');
    tableBody?.addEventListener('click', (e) => {
      const detailBtn = e.target.closest('.btn-view-invoice');
      if (detailBtn) {
        const txId = detailBtn.getAttribute('data-tx-id');
        this.openInvoiceDetailModal(txId);
      }
    });
  }

  async loadBillingData(root) {
    if (!db) return;

    try {
      console.log('[BillingView] Calculando métricas globales financieras...');

      const [usersSnap, compSnap, plansSnap] = await Promise.all([
        get(ref(db, 'users')),
        get(ref(db, 'companies')),
        get(ref(db, 'saas_plans')) // Directly querying official saas_plans!
      ]);

      const users = usersSnap.exists() ? usersSnap.val() : {};
      const companies = compSnap.exists() ? compSnap.val() : {};
      const plans = plansSnap.exists() ? plansSnap.val() : {};

      // Fallback defaults if saas_plans database node is empty
      const defaultPlans = {
        BASIC: { id: 'BASIC', name: 'Plan Basic', price: 499, currency: 'NIO', duration: 'Mensual' },
        PREMIUM: { id: 'PREMIUM', name: 'Plan Premium', price: 999, currency: 'NIO', duration: 'Mensual' },
        ENTERPRISE: { id: 'ENTERPRISE', name: 'Plan Enterprise', price: 1999, currency: 'NIO', duration: 'Mensual' }
      };

      const finalPlans = { ...defaultPlans };
      Object.entries(plans).forEach(([id, p]) => {
        finalPlans[id] = {
          id,
          name: p.name || `Plan ${id}`,
          price: Number(p.price || p.monto || 0),
          currency: p.currency || 'NIO',
          duration: p.duration || 'Mensual'
        };
      });

      // Prepare plan-specific distribution totals
      const planTotals = {};
      Object.keys(finalPlans).forEach(k => {
        planTotals[k] = {
          count: 0,
          revenue: 0,
          name: finalPlans[k].name,
          price: finalPlans[k].price,
          currency: finalPlans[k].currency,
          duration: finalPlans[k].duration
        };
      });

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
      let expiredSubsCount = 0;
      let cancelledSubsCount = 0;
      let suspendedSubsCount = 0;
      let renewalsCount = 0;
      
      let totalRev = 0;
      let dailyRev = 0;
      let monthlyRev = 0;
      let annualRev = 0;
      let totalOrdersCount = 0;
      let completedOrdersCount = 0;
      let canceledOrdersCount = 0;
      let totalProductsCount = 0;

      const now = Date.now();
      const startOfDay = new Date().setHours(0,0,0,0);
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

      const txList = [];

      Object.entries(companies).forEach(([companyId, cData]) => {
        if (companyId === 'global') return;
        totalCompaniesCount++;

        const planId = cData.plan || cData.informacion_local?.plan || 'BASIC';
        const plan = finalPlans[planId] || finalPlans['BASIC'];
        const planPrice = Number(plan.price || 0);
        const companyName = cData.informacion_local?.nombre || cData.name || companyId;
        const createdAt = cData.createdAt || cData.createdAtLocal?.epochMs || Date.now();

        // Calculate licenses applying discounts & taxes dynamically from company node if they exist
        const discount = Number(cData.discount || 0);
        const taxes = Number(cData.taxes || 0);
        const totalFacturado = Math.max(0, (planPrice - discount) + taxes);

        // Detect subscription state based on status and expirations
        const status = (cData.status || 'ACTIVO').toUpperCase();
        let subStatus = 'Activa';

        if (status === 'INACTIVO' || status === 'ELIMINADO') {
          subStatus = 'Cancelada';
          cancelledSubsCount++;
        } else if (status === 'SUSPENDIDO') {
          subStatus = 'Suspendida';
          suspendedSubsCount++;
        } else if (status === 'FALTA_PAGO') {
          subStatus = 'Vencida';
          expiredSubsCount++;
        } else {
          // Check date limits if specified
          if (cData.subscriptionExpiresAt) {
            const expTime = new Date(cData.subscriptionExpiresAt).getTime();
            if (!isNaN(expTime) && expTime < now) {
              subStatus = 'Vencida';
              expiredSubsCount++;
            } else {
              activeSubsCount++;
            }
          } else {
            activeSubsCount++;
          }
        }

        // Adjust MRR and ARR depending on yearly vs monthly subscriptions
        const duration = (plan.duration || 'Mensual').toLowerCase();
        let companyMonthly = 0;
        let companyAnnual = 0;

        if (duration === 'anual' || duration === 'yearly' || duration === '12 meses') {
          companyMonthly = totalFacturado / 12;
          companyAnnual = totalFacturado;
        } else {
          companyMonthly = totalFacturado;
          companyAnnual = totalFacturado * 12;
        }

        // Accumulate revenues for Active contracts
        if (subStatus === 'Activa') {
          totalRev += totalFacturado;
          monthlyRev += companyMonthly;
          annualRev += companyAnnual;

          if (createdAt >= startOfDay) dailyRev += totalFacturado;

          // Renewals: Active subscriptions registered older than 30 days
          if (now - createdAt > 30 * 24 * 60 * 60 * 1000) {
            renewalsCount++;
          }

          // Accumulate to plan stats
          if (planTotals[plan.id]) {
            planTotals[plan.id].count++;
            planTotals[plan.id].revenue += totalFacturado;
          }
        }

        // Count products
        const prods = cData.productos || cData.products || {};
        totalProductsCount += Object.keys(prods).length;

        // Count orders
        const orders = cData.pedidos || cData.ordenes || cData.orders || {};
        Object.values(orders).forEach(ord => {
          totalOrdersCount++;
          const oStatus = (ord.status || ord.estado || '').toUpperCase();
          if (oStatus === 'COMPLETADO' || oStatus === 'DELIVERED' || oStatus === 'FINALIZADO') {
            completedOrdersCount++;
          } else if (oStatus === 'CANCELADO' || oStatus === 'REJECTED') {
            canceledOrdersCount++;
          }
        });

        txList.push({
          id: `SUB-${companyId.substring(0, 8).toUpperCase()}`,
          companyId,
          companyName,
          planId,
          planName: plan.name,
          planPrice,
          discount,
          taxes,
          totalFacturado,
          createdAt,
          expiration: cData.subscriptionExpiresAt || 'Sin Vencer',
          billingPeriod: plan.duration || 'Mensual',
          subStatus,
          status: subStatus === 'Activa' ? 'PAGADO' : 'PENDIENTE'
        });
      });

      const avgRevenue = activeSubsCount > 0 ? (totalRev / activeSubsCount) : 0;
      const growthRate = totalCompaniesCount > 0 ? Math.min(100, Math.round((activeSubsCount / totalCompaniesCount) * 100)) : 0;

      this.metrics = {
        totalRevenue: totalRev,
        dailyRevenue: dailyRev,
        monthlyRevenue: monthlyRev,
        annualRevenue: annualRev,
        totalCompanies: totalCompaniesCount,
        totalUsers: totalUsersCount,
        totalOrders: totalOrdersCount,
        completedOrders: completedOrdersCount,
        canceledOrders: canceledOrdersCount,
        totalProducts: totalProductsCount,
        totalCustomers: totalCustomersCount,
        activeSubscriptions: activeSubsCount,
        expiredSubscriptions: expiredSubsCount,
        cancelledSubscriptions: cancelledSubsCount,
        suspendedSubscriptions: suspendedSubsCount,
        renewalsCount,
        avgRevenuePerBusiness: avgRevenue,
        growthRate,
        projectedRevenue: monthlyRev * 12
      };

      this.planTotals = planTotals;
      this.transactions = txList;
      
      this.renderMetrics(root);
      this.renderPlansDistribution(root);

      console.log('[BillingView] ✅ Métricas globales y pasarela de cobros actualizadas.');
    } catch (err) {
      console.error('[BillingView] Error calculating metrics:', err);
      NotificationService.error(`Error al cargar la facturación: ${err.message || err}`);
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
    const elTotalProducts = root.querySelector('#stat-total-products');
    
    // Advanced fields
    const elProjectedRevenue = root.querySelector('#stat-projected-revenue');
    const elAnnualRevenue = root.querySelector('#stat-annual-revenue');
    
    const elActiveCount = root.querySelector('#stat-active-count');
    const elExpiredCount = root.querySelector('#stat-expired-count');
    const elCancelledCount = root.querySelector('#stat-cancelled-count');
    const elRenewalsCount = root.querySelector('#stat-renewals-count');

    if (elTotRev) elTotRev.textContent = fmt(this.metrics.totalRevenue);
    if (elMonthlyRev) elMonthlyRev.textContent = fmt(this.metrics.monthlyRevenue);
    if (elDailyRev) elDailyRev.textContent = `Hoy: ${fmt(this.metrics.dailyRevenue)}`;
    if (elGrowthRate) elGrowthRate.textContent = `↑ ${this.metrics.growthRate}% Suscripciones Activas`;
    if (elActiveSubs) elActiveSubs.textContent = `${this.metrics.activeSubscriptions} / ${this.metrics.totalCompanies}`;
    if (elAvgRev) elAvgRev.textContent = `Promedio/Negocio: ${fmt(this.metrics.avgRevenuePerBusiness)}`;
    if (elTotalOrders) elTotalOrders.textContent = this.metrics.totalOrders.toLocaleString();
    if (elOrdersBreakdown) elOrdersBreakdown.textContent = `Completados: ${this.metrics.completedOrders} | Cancelados: ${this.metrics.canceledOrders}`;

    if (elTotalUsers) elTotalUsers.textContent = this.metrics.totalUsers.toLocaleString();
    if (elTotalProducts) elTotalProducts.textContent = this.metrics.totalProducts.toLocaleString();
    
    if (elProjectedRevenue) elProjectedRevenue.textContent = fmt(this.metrics.projectedRevenue);
    if (elAnnualRevenue) elAnnualRevenue.textContent = `Recurrente Anual: ${fmt(this.metrics.annualRevenue)}`;
    
    if (elActiveCount) elActiveCount.textContent = this.metrics.activeSubscriptions;
    if (elExpiredCount) elExpiredCount.textContent = this.metrics.expiredSubscriptions;
    if (elCancelledCount) elCancelledCount.textContent = this.metrics.cancelledSubscriptions + this.metrics.suspendedSubscriptions;
    if (elRenewalsCount) elRenewalsCount.textContent = this.metrics.renewalsCount;

    // Table render
    const tbody = root.querySelector('#billing-table-body');
    const countLabel = root.querySelector('#billing-table-count');

    if (countLabel) countLabel.textContent = `Total Transacciones: ${this.transactions.length}`;

    if (!tbody) return;

    if (this.transactions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 24px; text-align: center; color: var(--color-text-tertiary);">
            ℹ️ No hay transacciones de negocios registradas en Firebase.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.transactions.map(tx => {
      const dateStr = TimeService.formatDate(tx.createdAt, true);
      
      const badge = {
        Activa: `<span style="padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; background: rgba(16,185,129,0.2); color: #34d399; border: 1px solid rgba(16,185,129,0.3);">PAGADO</span>`,
        Vencida: `<span style="padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; background: rgba(245,158,11,0.2); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3);">VENCIDO</span>`,
        Suspendida: `<span style="padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);">SUSPENDIDO</span>`,
        Cancelada: `<span style="padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; background: rgba(156,163,175,0.15); color: #9ca3af; border: 1px solid rgba(156,163,175,0.3);">CANCELADO</span>`
      }[tx.subStatus] || `<span class="badge">${tx.subStatus}</span>`;

      return `
        <tr style="border-bottom: 1px solid var(--color-border-primary, rgba(255,255,255,0.05));">
          <td style="padding: 10px 14px; font-family: monospace; font-size: 0.78rem; color: #60a5fa;">${tx.id}</td>
          <td style="padding: 10px 14px; font-weight: 600; color: var(--color-text-primary);">${tx.companyName}</td>
          <td style="padding: 10px 14px; font-size: 0.8rem; color: #a78bfa;">${tx.planName}</td>
          <td style="padding: 10px 14px; font-family: monospace; font-weight: 600; color: #34d399;">${fmt(tx.totalFacturado)}</td>
          <td style="padding: 10px 14px; font-size: 0.78rem; color: var(--color-text-secondary);">${dateStr}</td>
          <td style="padding: 10px 14px;">${badge}</td>
          <td style="padding: 10px 14px; text-align: right;">
            <button class="btn btn-secondary btn-xs btn-view-invoice" data-tx-id="${tx.id}" style="padding: 2px 6px;">📂 Detalle</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderPlansDistribution(root) {
    const container = root.querySelector('#plans-distribution-container');
    if (!container) return;

    const fmt = (val) => `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const totalRev = this.metrics.totalRevenue || 1; // Avoid divide by zero

    const distributionHTML = Object.entries(this.planTotals).map(([id, data]) => {
      const percentage = Math.round((data.revenue / totalRev) * 100);
      const accentColor = {
        BASIC: '#64748b',
        PREMIUM: '#7c75ff',
        ENTERPRISE: '#10b981'
      }[id] || 'var(--color-accent)';

      return `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; margin-bottom:6px;">
            <div>
              <strong style="color:var(--color-text-primary); font-size:0.85rem;">${data.name}</strong>
              <span class="text-secondary" style="font-size:0.72rem; margin-left:4px;">(Monto oficial: ${data.currency} ${fmt(data.price)} / ${data.duration})</span>
            </div>
            <div style="text-align:right;">
              <span class="badge" style="background:rgba(255,255,255,0.05); color:var(--color-text-primary); font-weight:700;">${data.count} suscripción(es)</span>
              <strong style="color:#34d399; margin-left:8px;">${fmt(data.revenue)}</strong>
            </div>
          </div>
          <!-- Progress bar -->
          <div style="width:100%; height:8px; background:rgba(0,0,0,0.2); border-radius:4px; overflow:hidden;">
            <div style="width:${percentage}%; height:100%; background:${accentColor}; border-radius:4px; transition: width 0.5s ease-out;"></div>
          </div>
          <div style="font-size:0.68rem; color:var(--color-text-secondary); text-align:right; margin-top:2px;">${percentage}% del total facturado</div>
        </div>
      `;
    }).join('');

    container.innerHTML = distributionHTML || '<p class="text-secondary text-xs">No hay planes activos registrados para calcular la distribución.</p>';
  }

  openInvoiceDetailModal(txId) {
    const tx = this.transactions.find(t => t.id === txId);
    if (!tx) return;

    const fmt = (val) => `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    let modalOverlay = document.getElementById('view-invoice-modal-container');
    if (modalOverlay) modalOverlay.remove();

    const badgeHTML = {
      Activa: `<span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; font-weight:700;">Activa / Al Día</span>`,
      Vencida: `<span class="badge" style="background:rgba(245,158,11,0.15); color:#fbbf24; font-weight:700;">Vencida por Falta de Pago</span>`,
      Suspendida: `<span class="badge" style="background:rgba(239,68,68,0.15); color:#f87171; font-weight:700;">Suspendida</span>`,
      Cancelada: `<span class="badge" style="background:rgba(156,163,175,0.15); color:#9ca3af; font-weight:700;">Cancelada</span>`
    }[tx.subStatus] || `<span class="badge">${tx.subStatus}</span>`;

    const bodyHTML = `
      <div style="color:var(--color-text-primary); display:flex; flex-direction:column; gap:12px; font-size:0.85rem;">
        
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
          <div>
            <span style="font-size:0.75rem; color:var(--color-text-secondary); display:block;">Código Folio:</span>
            <strong style="font-family:monospace; color:#60a5fa; font-size:0.95rem;">${tx.id}</strong>
          </div>
          <div>
            ${badgeHTML}
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.03); padding:10px; border-radius:6px;">
          <div>
            <span class="text-secondary" style="font-size:0.72rem; display:block;">Negocio Contratante:</span>
            <strong>${tx.companyName}</strong>
          </div>
          <div>
            <span class="text-secondary" style="font-size:0.72rem; display:block;">Plan Contratado:</span>
            <strong style="color:#a78bfa;">${tx.planName}</strong>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <span class="text-secondary" style="font-size:0.72rem; display:block;">Fecha de Registro:</span>
            <strong>${TimeService.formatDate(tx.createdAt, true)}</strong>
          </div>
          <div>
            <span class="text-secondary" style="font-size:0.72rem; display:block;">Próximo Vencimiento:</span>
            <strong>${tx.expiration === 'Sin Vencer' ? 'Sin Expiración Fija' : TimeService.formatDate(new Date(tx.expiration).getTime())}</strong>
          </div>
        </div>

        <div style="border-top:1px dashed rgba(255,255,255,0.08); margin-top:6px; padding-top:8px;">
          <h4 class="font-bold text-xs uppercase tracking-wider mb-2" style="color:var(--color-accent);">Desglose del Monto de Licencia</h4>
          <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.02);">
            <span class="text-secondary">Precio Base del Plan (${tx.billingPeriod}):</span>
            <span style="font-family:monospace;">${fmt(tx.planPrice)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.02); color:#f87171;">
            <span>(-) Descuentos Aplicados:</span>
            <span style="font-family:monospace;">-${fmt(tx.discount)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05); color:#60a5fa;">
            <span>(+) Impuestos / Cargos Adicionales:</span>
            <span style="font-family:monospace;">+${fmt(tx.taxes)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:1rem; font-weight:700; color:#34d399;">
            <span>Total Neto Facturado:</span>
            <span style="font-family:monospace;">${fmt(tx.totalFacturado)}</span>
          </div>
        </div>

      </div>
    `;

    const invoiceModal = new Modal({
      title: '🧾 Desglose de Facturación y Suscripción',
      bodyHTML,
      footerHTML: `<button class="btn btn-secondary btn-sm" id="btn-close-invoice-modal">Cerrar</button>`,
      size: 'md'
    });

    const el = invoiceModal.mount();
    el.setAttribute('id', 'view-invoice-modal-container');
    document.body.appendChild(el);

    el.querySelector('#btn-close-invoice-modal')?.addEventListener('click', () => invoiceModal.close());
  }

  unmount() {
    this.layout.unmount();
    super.unmount();
  }
}