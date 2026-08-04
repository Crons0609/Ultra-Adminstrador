import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { Modal } from '../../../components/ui/modal.js';

export class CashRegisterView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = {
      sales: [],
      loading: true
    };

    this.layout = new PageLayout({
      title: 'Control de Caja Chica',
      subtitle: 'Monitorea las ventas del día, flujos de efectivo y realiza cierres de caja.',
      actionHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-go-arqueo" style="display:flex;align-items:center;gap:6px;" onclick="window.location.hash='/cashier/arqueo'">
          📊 Arqueo de Caja
        </button>
        <button class="btn btn-primary btn-sm" id="btn-cash-close">Cierre de Caja 🔒</button>
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
            <div class="kpi-title">Ingresos Totales</div>
            <div class="kpi-amount text-success" id="caja-total-income">$0.00</div>
            <div class="kpi-subtext" id="caja-total-count">0 transacciones registradas</div>
          </div>
          <div class="cash-table-card" style="border-top: 4px solid var(--color-accent);">
            <div class="kpi-title">Cobros en Efectivo</div>
            <div class="kpi-amount" style="color:var(--color-accent);" id="caja-cash-total">$0.00</div>
            <div class="kpi-subtext" id="caja-cash-pct">0% del total cobrado</div>
          </div>
          <div class="cash-table-card" style="border-top: 4px solid var(--color-warning);">
            <div class="kpi-title">Cobros con Tarjeta</div>
            <div class="kpi-amount text-warning" id="caja-card-total">$0.00</div>
            <div class="kpi-subtext" id="caja-card-pct">0% del total cobrado</div>
          </div>
        </div>

        <div class="card p-5 movements-wrapper">
          <h3 class="text-lg font-semibold mb-4">Registro Diario de Ventas</h3>
          <div class="mov-row mov-header">
            <span>Hora</span>
            <span>Vendedor</span>
            <span>Detalles</span>
            <span class="text-right">Monto Cobrado</span>
          </div>
          <div id="caja-movements-list" style="max-height: 400px; overflow-y: auto;">
            <p class="text-center py-10 text-secondary">Esperando transacciones de caja...</p>
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
      countEl.textContent = '0 transacciones hoy';
      cashEl.textContent = '$0.00';
      cashPctEl.textContent = '0% del total';
      cardEl.textContent = '$0.00';
      cardPctEl.textContent = '0% del total';
      list.innerHTML = `<p class="text-center py-10 text-secondary">No hay transacciones registradas el día de hoy.</p>`;
      return;
    }

    const totalIncome = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const cashIncome = todaySales.filter(s => s.paymentMethod === 'EFECTIVO').reduce((sum, s) => sum + Number(s.total || 0), 0);
    const cardIncome = todaySales.filter(s => s.paymentMethod !== 'EFECTIVO').reduce((sum, s) => sum + Number(s.total || 0), 0);

    const cashPct = totalIncome > 0 ? Math.round((cashIncome / totalIncome) * 100) : 0;
    const cardPct = totalIncome > 0 ? Math.round((cardIncome / totalIncome) * 100) : 0;

    totalEl.textContent = `$${totalIncome.toFixed(2)}`;
    countEl.textContent = `${todaySales.length} transacciones hoy`;
    cashEl.textContent = `$${cashIncome.toFixed(2)}`;
    cashPctEl.textContent = `${cashPct}% del total cobrado`;
    cardEl.textContent = `$${cardIncome.toFixed(2)}`;
    cardPctEl.textContent = `${cardPct}% del total cobrado`;

    list.innerHTML = todaySales.map(s => {
      const time = new Date(s.date || s.createdAt).toLocaleTimeString();
      const seller = s.sellerName || 'Cajero';
      const itemsCount = (s.items || []).reduce((sum, i) => sum + i.qty, 0);
      const desc = `${itemsCount} artículos · ${s.paymentMethod}`;
      
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
        <p class="mb-4">Se cerrará la jornada fiscal/operativa de hoy. A continuación se desglosan los fondos registrados en el sistema:</p>
        <div class="card p-3 mb-4" style="background:var(--color-bg-tertiary);">
          <div class="d-flex justify-content-between mb-2">
            <span>Ventas Totales:</span>
            <strong>$${totalIncome.toFixed(2)}</strong>
          </div>
          <div class="d-flex justify-content-between mb-2" style="font-size:0.85rem; color:var(--color-text-secondary);">
            <span>En Efectivo (Fondo en Caja):</span>
            <span>$${cashIncome.toFixed(2)}</span>
          </div>
          <div class="d-flex justify-content-between mb-2" style="font-size:0.85rem; color:var(--color-text-secondary);">
            <span>En Tarjeta (Terminales POS):</span>
            <span>$${cardIncome.toFixed(2)}</span>
          </div>
          <div class="d-flex justify-content-between" style="font-size:0.85rem; color:var(--color-text-secondary);">
            <span>Transacciones totales:</span>
            <span>${todaySales.length}</span>
          </div>
        </div>
        <div class="form-group mb-2">
          <label class="form-label" for="actual-cash">Monto de Efectivo Físico Contado ($) *</label>
          <input type="number" id="actual-cash" class="input input-md" placeholder="Ingresa el efectivo contado en gaveta" required />
        </div>
      </div>
    `;

    const modal = new Modal({
      title: 'Confirmar Cierre de Caja',
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-close-cancel">Cancelar</button>
        <button class="btn btn-danger btn-sm" id="btn-close-confirm">Confirmar Cierre y Guardar</button>
      `
    });

    document.body.appendChild(modal.mount());

    modal.$('#btn-close-cancel').addEventListener('click', () => modal.close());
    modal.$('#btn-close-confirm').addEventListener('click', async () => {
      const input = modal.$('#actual-cash');
      if (!input || !input.value) {
        alert('Debes ingresar el total del efectivo contado.');
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
        NotificationService.success('Cierre de caja registrado exitosamente.');
        modal.close();
      } catch (e) {
        console.error(e);
        NotificationService.error('Error al guardar el cierre de caja.');
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