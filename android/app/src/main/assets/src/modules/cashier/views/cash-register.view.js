import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { Modal } from '../../../components/ui/modal.js';
import { I18nService } from '../../../services/i18n.service.js';

export class CashRegisterView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = {
      sales: [],
      loading: true
    };

    this.layout = new PageLayout({
      title: I18nService.t('cash_title'),
      subtitle: I18nService.t('cash_subtitle'),
      actionHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-go-arqueo" style="display:flex;align-items:center;gap:6px;" onclick="window.location.hash='/cashier/arqueo'">
          📊 ${I18nService.t('arqueo_title')}
        </button>
        <button class="btn btn-primary btn-sm" id="btn-cash-close">${I18nService.t('cash_close_btn')}</button>
      `,
      contentHTML: `
        <style>
          .cash-register-kpis {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: var(--space-4);
            margin-bottom: var(--space-6);
          }
          .cash-table-card {
            background: var(--color-bg-secondary);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: var(--space-4);
          }
          .kpi-title {
            font-size: 0.85rem;
            color: var(--color-text-secondary);
            margin-bottom: var(--space-1);
          }
          .kpi-amount {
            font-size: 1.8rem;
            font-weight: 800;
          }
          .kpi-subtext {
            font-size: 0.75rem;
            color: var(--color-text-secondary);
            margin-top: 4px;
          }
          
          /* Movements table */
          .movements-wrapper {
            margin-top: var(--space-6);
          }
          .mov-row {
            display: grid;
            grid-template-columns: 1.2fr 1fr 1.5fr 1fr;
            padding: 12px;
            border-bottom: 1px solid var(--color-border);
            font-size: 0.85rem;
            align-items: center;
          }
          .mov-row:hover {
            background: var(--color-bg-tertiary);
          }
          .mov-header {
            font-weight: 700;
            background: var(--color-bg-tertiary);
            border-radius: var(--radius-md) var(--radius-md) 0 0;
          }
        </style>

        <div class="cash-register-kpis animate-fade-in">
          <div class="cash-table-card" style="border-top: 4px solid var(--color-success);">
            <div class="kpi-title">${I18nService.t('fin_total_income')}</div>
            <div class="kpi-amount text-success" id="caja-total-income">$0.00</div>
            <div class="kpi-subtext" id="caja-total-count">${I18nService.t('cash_transactions_recorded', { count: 0 })}</div>
          </div>
          <div class="cash-table-card" style="border-top: 4px solid var(--color-accent);">
            <div class="kpi-title">${I18nService.t('cash_income_cash')}</div>
            <div class="kpi-amount" style="color:var(--color-accent);" id="caja-cash-total">$0.00</div>
            <div class="kpi-subtext" id="caja-cash-pct">${I18nService.t('cash_pct_total', { pct: 0 })}</div>
          </div>
          <div class="cash-table-card" style="border-top: 4px solid var(--color-warning);">
            <div class="kpi-title">${I18nService.t('cash_income_card')}</div>
            <div class="kpi-amount text-warning" id="caja-card-total">$0.00</div>
            <div class="kpi-subtext" id="caja-card-pct">${I18nService.t('cash_pct_total', { pct: 0 })}</div>
          </div>
        </div>

        <div class="card p-5 movements-wrapper">
          <h3 class="text-lg font-semibold mb-4">${I18nService.t('cash_daily_sales_log')}</h3>
          <div class="mov-row mov-header">
            <span>${I18nService.t('time')}</span>
            <span>${I18nService.t('pos_cashier')}</span>
            <span>${I18nService.t('details')}</span>
            <span class="text-right">${I18nService.t('cash_amount_collected')}</span>
          </div>
          <div id="caja-movements-list" style="max-height: 400px; overflow-y: auto;">
            <p class="text-center py-10 text-secondary">${I18nService.t('cash_waiting_transactions')}</p>
          </div>
        </div>
      `
    });

    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    this.subscribeToSales(element);
    this.bindEvents(element);
    return element;
  }

  subscribeToSales(element) {
    try {
      const listener = FirestoreService.listenToTenant('ventas', (sales) => {
        this.state.sales = sales || [];
        this.recalculateCaja(element);
      });
      this.listeners.push(listener);
    } catch (e) {
      console.error('[CashRegister] Subscription error:', e);
    }
  }

  bindEvents(element) {
    element.querySelector('#btn-cash-close')?.addEventListener('click', () => {
      this.openCashCloseModal();
    });
  }

  recalculateCaja(element) {
    const totalEl = element.querySelector('#caja-total-income');
    const countEl = element.querySelector('#caja-total-count');
    const cashEl = element.querySelector('#caja-cash-total');
    const cashPctEl = element.querySelector('#caja-cash-pct');
    const cardEl = element.querySelector('#caja-card-total');
    const cardPctEl = element.querySelector('#caja-card-pct');
    const list = element.querySelector('#caja-movements-list');

    if (!totalEl || !list) return;

    // Filter sales of today
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    const todaySales = this.state.sales.filter(s => (s.date || s.createdAt) >= startOfToday.getTime());

    if (todaySales.length === 0) {
      totalEl.textContent = '$0.00';
      countEl.textContent = I18nService.t('cash_transactions_today', { count: 0 });
      cashEl.textContent = '$0.00';
      cashPctEl.textContent = I18nService.t('cash_pct_total', { pct: 0 });
      cardEl.textContent = '$0.00';
      cardPctEl.textContent = I18nService.t('cash_pct_total', { pct: 0 });
      list.innerHTML = `<p class="text-center py-10 text-secondary">${I18nService.t('cash_no_transactions_today')}</p>`;
      return;
    }

    const totalIncome = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const cashIncome = todaySales.filter(s => s.paymentMethod === 'EFECTIVO').reduce((sum, s) => sum + Number(s.total || 0), 0);
    const cardIncome = todaySales.filter(s => s.paymentMethod !== 'EFECTIVO').reduce((sum, s) => sum + Number(s.total || 0), 0);

    const cashPct = totalIncome > 0 ? Math.round((cashIncome / totalIncome) * 100) : 0;
    const cardPct = totalIncome > 0 ? Math.round((cardIncome / totalIncome) * 100) : 0;

    totalEl.textContent = `$${totalIncome.toFixed(2)}`;
    countEl.textContent = I18nService.t('cash_transactions_today', { count: todaySales.length });
    cashEl.textContent = `$${cashIncome.toFixed(2)}`;
    cashPctEl.textContent = I18nService.t('cash_pct_total', { pct: cashPct });
    cardEl.textContent = `$${cardIncome.toFixed(2)}`;
    cardPctEl.textContent = I18nService.t('cash_pct_total', { pct: cardPct });

    list.innerHTML = todaySales.map(s => {
      const time = new Date(s.date || s.createdAt).toLocaleTimeString();
      const seller = s.sellerName || I18nService.t('pos_cashier');
      const itemsCount = (s.items || []).reduce((sum, i) => sum + i.qty, 0);
      const desc = `${itemsCount} ${I18nService.t('ri_items')} · ${s.paymentMethod}`;
      
      return `
        <div class="mov-row animate-slide-up">
          <span class="font-medium">${time}</span>
          <span>👤 ${seller}</span>
          <span class="text-secondary">${desc}</span>
          <strong class="text-right text-success">$${s.total.toFixed(2)}</strong>
        </div>
      `;
    }).join('');
  }

  openCashCloseModal() {
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    const todaySales = this.state.sales.filter(s => (s.date || s.createdAt) >= startOfToday.getTime());

    const totalIncome = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const cashIncome = todaySales.filter(s => s.paymentMethod === 'EFECTIVO').reduce((sum, s) => sum + Number(s.total || 0), 0);
    const cardIncome = todaySales.filter(s => s.paymentMethod !== 'EFECTIVO').reduce((sum, s) => sum + Number(s.total || 0), 0);

    const bodyHTML = `
      <div style="color: var(--color-text-primary); font-family:var(--font-sans);">
        <p class="mb-4">${I18nService.t('cash_close_desc')}</p>
        <div class="card p-3 mb-4" style="background:var(--color-bg-tertiary);">
          <div class="d-flex justify-content-between mb-2">
            <span>${I18nService.t('dash_total_sales')}:</span>
            <strong>$${totalIncome.toFixed(2)}</strong>
          </div>
          <div class="d-flex justify-content-between mb-2" style="font-size:0.85rem; color:var(--color-text-secondary);">
            <span>${I18nService.t('cash_fund_cash')}</span>
            <span>$${cashIncome.toFixed(2)}</span>
          </div>
          <div class="d-flex justify-content-between mb-2" style="font-size:0.85rem; color:var(--color-text-secondary);">
            <span>${I18nService.t('cash_fund_card')}</span>
            <span>$${cardIncome.toFixed(2)}</span>
          </div>
          <div class="d-flex justify-content-between" style="font-size:0.85rem; color:var(--color-text-secondary);">
            <span>${I18nService.t('cash_total_transactions')}</span>
            <span>${todaySales.length}</span>
          </div>
        </div>
        <div class="form-group mb-2">
          <label class="form-label" for="actual-cash">${I18nService.t('cash_physical_counted_label')}</label>
          <input type="number" id="actual-cash" class="input input-md" placeholder="${I18nService.t('cash_physical_counted_placeholder')}" required />
        </div>
      </div>
    `;

    const modal = new Modal({
      title: I18nService.t('cash_close_confirm_title'),
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-close-cancel">${I18nService.t('cancel')}</button>
        <button class="btn btn-danger btn-sm" id="btn-close-confirm">${I18nService.t('cash_close_confirm_btn')}</button>
      `
    });

    document.body.appendChild(modal.mount());

    modal.$('#btn-close-cancel').addEventListener('click', () => modal.close());
    modal.$('#btn-close-confirm').addEventListener('click', async () => {
      const input = modal.$('#actual-cash');
      if (!input || !input.value) {
        alert(I18nService.t('cash_error_no_counted'));
        return;
      }

      const counted = Number(input.value);
      const diff = counted - cashIncome;

      try {
        const closePayload = {
          date: Date.now(),
          salesTotal: totalIncome,
          cashTotal: cashIncome,
          cardTotal: cardIncome,
          countedCash: counted,
          discrepancy: diff,
          transactionsCount: todaySales.length
        };
        await FirestoreService.create('cierres_caja', closePayload);
        NotificationService.success(I18nService.t('cash_close_success'));
        modal.close();
      } catch (e) {
        console.error(e);
        NotificationService.error(I18nService.t('cash_close_error'));
      }
    });
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}