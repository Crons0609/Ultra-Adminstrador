import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';
import { WhatsAppService } from '../../../services/whatsapp.service.js';

export class AccountsReceivableView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'company-test';
    this.currentUser = currentUser;

    this.state = {
      credits: [],
      clients: [],
      products: [],
      selectedProducts: []
    };

    // Initialize DataTable for credits
    this.table = new DataTable({
      columns: [
        { 
          key: 'clientName', 
          label: 'Cliente', 
          render: (val, row) => `
            <div>
              <span class="font-semibold text-primary">👤 ${val}</span>
              <div class="text-xs text-secondary" style="font-size: 0.7rem; margin-top:2px;">📅 Cobro: Día ${row.dueDay || 15} de cada mes</div>
            </div>
          ` 
        },
        { 
          key: 'amortizationType', 
          label: 'Tipo Crédito', 
          render: (val) => val === 'CON_AMORTIZACION' 
            ? `<span class="badge" style="background-color:rgba(52,211,153,0.15); color:var(--color-success); border:1px solid var(--color-border); padding:2px 8px; border-radius:var(--radius-md); font-size:0.75rem;">📉 Amortizable</span>`
            : `<span class="badge" style="background-color:rgba(99,102,241,0.15); color:var(--color-accent); border:1px solid var(--color-border); padding:2px 8px; border-radius:var(--radius-md); font-size:0.75rem;">🔒 Interés Fijo</span>`
        },
        {
          key: 'initialAmount',
          label: 'Monto Inicial',
          render: (val) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)
        },
        {
          key: 'remainingAmount',
          label: 'Monto Restante',
          render: (val) => `<strong style="color: ${Number(val) > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)}</strong>`
        },
        {
          key: 'status',
          label: 'Estado',
          render: (val) => {
            let bg = 'rgba(52,211,153,0.15)', color = 'var(--color-success)';
            if (val === 'VENCIDO') {
              bg = 'rgba(239,68,68,0.15)';
              color = 'var(--color-danger)';
            } else if (val === 'PAGADO') {
              bg = 'var(--color-bg-tertiary)';
              color = 'var(--color-text-secondary)';
            }
            return `<span class="badge" style="background-color:${bg}; color:${color}; border: 1px solid var(--color-border); padding:2px 8px; border-radius:var(--radius-md); font-size:0.75rem;">${val}</span>`;
          }
        },
        {
          key: 'id',
          label: 'Acciones',
          render: (val, row) => `
            <div class="d-flex gap-2">
              ${row.status !== 'PAGADO' ? `
                <button class="btn btn-primary btn-xs btn-abono" data-id="${val}" style="padding: 2px 6px; font-size: 0.7rem;">💵 Cobrar/Abonar</button>
                <button class="btn btn-warning btn-xs btn-sim-late" data-id="${val}" style="padding: 2px 6px; font-size: 0.7rem;" title="Simular atraso de fecha y aplicar recargo de mora del 5% compuesto">⚠️ Simular Mora</button>
              ` : ''}
              <button class="btn btn-secondary btn-xs btn-receipt" data-id="${val}" style="padding: 2px 6px; font-size: 0.7rem;">📄 Recibo</button>
            </div>
          `
        }
      ],
      data: this.state.credits
    });

    this.layout = new PageLayout({
      title: 'Sistema de Créditos (Cuentas por Cobrar)',
      subtitle: 'Administra tus cobros periódicos, amortizaciones y aplica cargos de mora automáticos por atrasos.',
      actionHTML: `
        <div class="d-flex gap-2">
          <a class="btn btn-primary btn-sm" href="#/owner/credit-system">
            💳 Ir al Sistema de Crédito Completo →
          </a>
          <a class="btn btn-secondary btn-sm" href="#/owner/payment-reminders">
            🔔 Recordatorios de Pago
          </a>
          <button class="btn btn-secondary btn-sm" id="btn-new-credit">
            + Rápido Crédito
          </button>
        </div>
      `,
      contentHTML: `
        <!-- KPI summary row -->
        <div class="grid-stats mb-5" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-4);">
          <div class="card p-4">
            <span class="text-sm text-secondary">Total Cartera Activa</span>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="kpi-portfolio">$0.00</h3>
          </div>
          <div class="card p-4">
            <span class="text-sm text-secondary">Cuentas por Cobrar Pendientes</span>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="kpi-pending-count" style="color: var(--color-warning);">0</h3>
          </div>
          <div class="card p-4">
            <span class="text-sm text-secondary">Cuentas en Mora / Vencidas</span>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="kpi-overdue-count" style="color: var(--color-danger);">0</h3>
          </div>
        </div>

        <div class="card p-5">
          <h3 class="text-lg font-semibold mb-4">Créditos de Clientes</h3>
          <div id="credits-table-wrapper"></div>
        </div>
      `
    });

    this.modalInstance = null;
    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();

    const tableWrapper = element.querySelector('#credits-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeToData(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const newCreditBtn = root.querySelector('#btn-new-credit');
    if (newCreditBtn) {
      newCreditBtn.addEventListener('click', () => this.openNewCreditModal());
    }

    const tableWrapper = root.querySelector('#credits-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const id = e.target.closest('button')?.getAttribute('data-id');
        if (!id) return;

        const credit = this.state.credits.find(c => c.id === id);
        if (!credit) return;

        if (e.target.closest('.btn-abono')) {
          this.openAbonoModal(credit);
        } else if (e.target.closest('.btn-sim-late')) {
          this.simulateLateFee(credit);
        } else if (e.target.closest('.btn-receipt')) {
          this.showCreditReceipt(credit);
        }
      });
    }
  }

  subscribeToData(element) {
    try {
      // Listen to credits
      const creditsListener = FirestoreService.listenToTenant('accounts_receivable', (credits) => {
        this.state.credits = credits || [];
        this.refreshTable(this.state.credits);
        this.updateKPIs();
      });
      this.listeners.push(creditsListener);

      // Listen to clients
      const clientsListener = FirestoreService.listenToTenant('recurring_clients', (clients) => {
        this.state.clients = clients || [];
      });
      this.listeners.push(clientsListener);

      // Listen to products
      const productsListener = FirestoreService.listenToTenant('productos', (products) => {
        this.state.products = products || [];
      });
      this.listeners.push(productsListener);
    } catch (e) {
      console.warn('[AccountsReceivableView] Database error:', e.message);
    }
  }

  refreshTable(data) {
    const tableWrapper = this.layout.$('#credits-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = data;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  updateKPIs() {
    const active = this.state.credits.filter(c => c.status !== 'PAGADO');
    const portfolio = active.reduce((acc, c) => acc + Number(c.remainingAmount || 0), 0);
    const pendingCount = active.length;
    const overdueCount = active.filter(c => c.status === 'VENCIDO').length;

    const elPortfolio = this.layout.$('#kpi-portfolio');
    const elPending = this.layout.$('#kpi-pending-count');
    const elOverdue = this.layout.$('#kpi-overdue-count');

    if (elPortfolio) elPortfolio.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(portfolio);
    if (elPending) elPending.textContent = pendingCount;
    if (elOverdue) elOverdue.textContent = overdueCount;
  }

  // --- MORA/LATE FEE compound 5% calculation ---
  async simulateLateFee(credit) {
    const remaining = Number(credit.remainingAmount || 0);
    const lateFee = Math.round(remaining * 0.05 * 100) / 100;
    const newRemaining = remaining + lateFee;

    if (confirm(`¿Simular atraso de pago para ${credit.clientName}?\nSe aplicará una mora acumulativa del 5% sobre el saldo restante:\nDeuda anterior: $${remaining.toFixed(2)}\nMora (5%): $${lateFee.toFixed(2)}\nNueva Deuda: $${newRemaining.toFixed(2)}`)) {
      try {
        await FirestoreService.update('accounts_receivable', credit.id, {
          remainingAmount: newRemaining,
          status: 'VENCIDO',
          updatedAt: Date.now()
        });

        // Add history log of late fee
        const lateFeeLog = {
          creditId: credit.id,
          clientName: credit.clientName,
          type: 'MORA',
          amount: lateFee,
          previousDebt: remaining,
          newDebt: newRemaining,
          date: Date.now()
        };
        await FirestoreService.create('accounts_receivable_history', lateFeeLog);

        NotificationService.warning(`Mora del 5% ($${lateFee}) aplicada con éxito.`);
      } catch (err) {
        console.error('[AccountsReceivableView] Error applying late fee:', err);
        NotificationService.error('Error al aplicar la mora.');
      }
    }
  }

  openNewCreditModal() {
    this.state.selectedProducts = [];

    const clientsOptions = this.state.clients
      .filter(c => c.status === 'ACTIVO')
      .map(c => `<option value="${c.id}">${c.name} (${c.phone}) - Limite: $${c.creditLimit}</option>`)
      .join('');

    const productsOptions = this.state.products
      .filter(p => Number(p.stock || 0) > 0)
      .map(p => `<option value="${p.id}" data-price="${p.price}" data-stock="${p.stock}">${p.name} - $${p.price} (Stock: ${p.stock})</option>`)
      .join('');

    const formHTML = `
      <div id="new-credit-form" style="color: var(--color-text-primary); display:grid; grid-template-columns: 1.2fr 1fr; gap:var(--space-4); max-height: 70vh; overflow-y: auto;">
        
        <!-- Left column: Credit detail & configuration -->
        <div class="d-flex flex-column gap-3">
          <h4 class="text-sm font-bold text-secondary mb-1">⚙️ Configuración del Crédito</h4>

          <div class="form-group">
            <label class="form-label" for="c-client">Seleccionar Cliente Recurrente</label>
            <div class="d-flex gap-2">
              <select id="c-client" class="input input-md" style="flex:1; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                <option value="">-- Seleccionar Cliente --</option>
                ${clientsOptions}
              </select>
              <button class="btn btn-secondary btn-sm" id="btn-quick-new-client" type="button" style="padding:0 var(--space-3);">👤 +</button>
            </div>
            <!-- Quick New Client Mini Form (hidden by default) -->
            <div id="quick-client-form" class="card p-3 mt-2" style="display:none; background: var(--color-bg-tertiary); border:1px dashed var(--color-border);">
              <h5 class="text-xs font-bold mb-2">Registrar Cliente Rápido</h5>
              <div class="d-flex flex-column gap-2">
                <input type="text" id="qc-name" class="input input-sm" placeholder="Nombre completo" />
                <input type="tel" id="qc-phone" class="input input-sm" placeholder="Teléfono" />
                <input type="email" id="qc-email" class="input input-sm" placeholder="Correo electrónico" />
                <input type="number" id="qc-limit" class="input input-sm" placeholder="Límite crédito (5000)" value="5000" />
                <div class="d-flex gap-2 justify-content-end">
                  <button class="btn btn-secondary btn-xs" id="qc-cancel" type="button">Cancelar</button>
                  <button class="btn btn-primary btn-xs" id="qc-save" type="button">Guardar</button>
                </div>
              </div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="c-amortization">Amortización</label>
              <select id="c-amortization" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                <option value="CON_AMORTIZACION">Con Amortización (Mora reduce saldo)</option>
                <option value="SIN_AMORTIZACION">Sin Amortización (Interés inicial fijo)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="c-paymethod">Método de Pago Preferido</label>
              <select id="c-paymethod" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                <option value="TARJETA">Tarjeta de Crédito / Débito</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="SIN_DEFINIR">Sin definir</option>
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="c-interest">Interés Mensual (%)</label>
              <input type="number" id="c-interest" class="input input-md" value="10" min="0" step="0.5" />
            </div>
            <div class="form-group">
              <label class="form-label" for="c-term">Plazo (Meses)</label>
              <input type="number" id="c-term" class="input input-md" value="3" min="1" />
            </div>
            <div class="form-group">
              <label class="form-label" for="c-due-day">Día Pago Mensual</label>
              <input type="number" id="c-due-day" class="input input-md" value="15" min="1" max="28" />
            </div>
          </div>

          <div class="form-group mt-2">
            <label class="d-flex align-items-center gap-2 font-medium" style="cursor:pointer;">
              <input type="checkbox" id="c-send-email" checked style="accent-color: var(--color-accent);" />
              <span>Enviar factura de cobro por correo electrónico al cliente</span>
            </label>
          </div>

          <div class="card p-3" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius: var(--radius-md);">
            <h5 class="text-sm font-bold mb-2">📊 Resumen de Crédito</h5>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span>Subtotal Productos:</span>
              <strong id="lbl-subtotal">$0.00</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span>Interés Total Calculado:</span>
              <strong id="lbl-interest-total">$0.00</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:1.1rem; border-top:1px solid var(--color-border); padding-top:6px; margin-top:6px;">
              <span>Deuda Total:</span>
              <strong id="lbl-total" class="text-primary">$0.00</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:0.8rem; color:var(--color-text-secondary);">
              <span>Cuota Mensual Aprox:</span>
              <strong id="lbl-monthly-payment">$0.00</strong>
            </div>
          </div>
        </div>

        <!-- Right column: Products and stock selection -->
        <div class="d-flex flex-column gap-3" style="border-left:1px solid var(--color-border); padding-left:var(--space-4);">
          <h4 class="text-sm font-bold text-secondary mb-1">🛒 Artículos a Financiar</h4>

          <div class="form-group">
            <label class="form-label" for="c-product">Agregar de Stock</label>
            <div class="d-flex gap-2">
              <select id="c-product" class="input input-md" style="flex:1; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                <option value="">-- Seleccionar de Inventario --</option>
                ${productsOptions}
              </select>
              <button class="btn btn-secondary btn-sm" id="btn-add-stock-item" type="button" style="padding:0 var(--space-3);">+ Añadir</button>
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:8px;">
            <div style="flex:1; height:1px; background:var(--color-border);"></div>
            <span class="text-xs text-secondary">O bien</span>
            <div style="flex:1; height:1px; background:var(--color-border);"></div>
          </div>

          <!-- Special Order Panel -->
          <div class="card p-3" style="background:var(--color-bg-tertiary); border:1px dashed var(--color-border);">
            <h5 class="text-xs font-bold mb-2">🎁 Pedido Especial / Personalizado</h5>
            <div class="d-flex flex-column gap-2">
              <input type="text" id="so-name" class="input input-sm" placeholder="Descripción del artículo especial" />
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <input type="number" id="so-price" class="input input-sm" placeholder="Precio ($)" />
                <input type="number" id="so-qty" class="input input-sm" placeholder="Cant" min="1" value="1" />
              </div>
              <button class="btn btn-secondary btn-xs align-self-end" id="btn-add-so-item" type="button">+ Añadir Especial</button>
            </div>
          </div>

          <!-- Added Items List -->
          <div class="mt-2">
            <h5 class="text-xs font-bold mb-2">Lista de Ítems</h5>
            <div id="added-items-list" class="d-flex flex-column gap-2" style="max-height:220px; overflow-y:auto; padding: 2px;">
              <div class="text-center text-secondary py-4" style="font-size:0.8rem; border:1px dashed var(--color-border); border-radius:var(--radius-md);">
                Ningún artículo agregado.
              </div>
            </div>
          </div>
        </div>

      </div>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">Generar Crédito</button>
    `;

    this.modalInstance = new Modal({
      title: '💳 Generación de Cobro al Crédito',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'lg'
    });

    document.body.appendChild(this.modalInstance.mount());

    // --- Modal interactions ---
    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.modalInstance.close());

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', () => this.submitNewCredit());

    // Quick client panel toggle
    const toggleQcBtn = this.modalInstance.$('#btn-quick-new-client');
    const qcForm = this.modalInstance.$('#quick-client-form');
    if (toggleQcBtn && qcForm) {
      toggleQcBtn.addEventListener('click', () => {
        qcForm.style.display = qcForm.style.display === 'none' ? 'block' : 'none';
      });
    }

    // Quick client save
    const qcSaveBtn = this.modalInstance.$('#qc-save');
    const qcCancelBtn = this.modalInstance.$('#qc-cancel');
    if (qcSaveBtn) {
      qcSaveBtn.addEventListener('click', async () => {
        const name = this.modalInstance.$('#qc-name').value.trim();
        const phone = this.modalInstance.$('#qc-phone').value.trim();
        const email = this.modalInstance.$('#qc-email').value.trim();
        const creditLimit = Number(this.modalInstance.$('#qc-limit').value || 5000);

        if (!name || !phone) {
          alert('Por favor introduce al menos el nombre y el teléfono.');
          return;
        }

        try {
          const newClientId = await FirestoreService.create('recurring_clients', {
            name, phone, email, creditLimit, status: 'ACTIVO', currentDebt: 0, updatedAt: Date.now()
          });
          NotificationService.success('Cliente registrado correctamente.');
          
          // Re-populate and select the new client
          const selectElement = this.modalInstance.$('#c-client');
          const option = document.createElement('option');
          option.value = newClientId;
          option.textContent = `${name} (${phone}) - Limite: $${creditLimit}`;
          option.selected = true;
          selectElement.appendChild(option);

          // Clear mini form
          this.modalInstance.$('#qc-name').value = '';
          this.modalInstance.$('#qc-phone').value = '';
          this.modalInstance.$('#qc-email').value = '';
          qcForm.style.display = 'none';
        } catch (e) {
          alert('Error al registrar cliente: ' + e.message);
        }
      });
    }
    if (qcCancelBtn) {
      qcCancelBtn.addEventListener('click', () => {
        qcForm.style.display = 'none';
      });
    }

    // Add stock item button
    const addStockBtn = this.modalInstance.$('#btn-add-stock-item');
    if (addStockBtn) {
      addStockBtn.addEventListener('click', () => {
        const select = this.modalInstance.$('#c-product');
        const selectedId = select.value;
        if (!selectedId) return;

        const p = this.state.products.find(item => item.id === selectedId);
        if (!p) return;

        // Check if already added
        const exists = this.state.selectedProducts.find(item => item.id === selectedId);
        if (exists) {
          alert('El artículo ya ha sido agregado.');
          return;
        }

        this.state.selectedProducts.push({
          id: p.id,
          name: p.name,
          sku: p.sku || '',
          price: Number(p.price || 0),
          quantity: 1,
          maxStock: Number(p.stock || 0),
          isSpecial: false
        });

        this.renderAddedItemsList();
        select.value = '';
      });
    }

    // Add special order button
    const addSoBtn = this.modalInstance.$('#btn-add-so-item');
    if (addSoBtn) {
      addSoBtn.addEventListener('click', () => {
        const nameInput = this.modalInstance.$('#so-name');
        const priceInput = this.modalInstance.$('#so-price');
        const qtyInput = this.modalInstance.$('#so-qty');

        const name = nameInput.value.trim();
        const price = Number(priceInput.value);
        const qty = Number(qtyInput.value || 1);

        if (!name || price <= 0 || qty <= 0) {
          alert('Por favor introduce el nombre y precio válido para el pedido especial.');
          return;
        }

        this.state.selectedProducts.push({
          id: 'special-' + Date.now(),
          name: `[Especial] ${name}`,
          sku: 'ESPECIAL',
          price,
          quantity: qty,
          maxStock: 99999,
          isSpecial: true
        });

        this.renderAddedItemsList();

        // Clear special order inputs
        nameInput.value = '';
        priceInput.value = '';
        qtyInput.value = '1';
      });
    }

    // Watch config inputs to update credit summary
    const inputsToWatch = ['#c-amortization', '#c-interest', '#c-term'];
    inputsToWatch.forEach(sel => {
      this.modalInstance.$(sel)?.addEventListener('change', () => this.recalculateCreditSummary());
      this.modalInstance.$(sel)?.addEventListener('input', () => this.recalculateCreditSummary());
    });
  }

  renderAddedItemsList() {
    const listContainer = this.modalInstance.$('#added-items-list');
    if (!listContainer) return;

    if (this.state.selectedProducts.length === 0) {
      listContainer.innerHTML = `
        <div class="text-center text-secondary py-4" style="font-size:0.8rem; border:1px dashed var(--color-border); border-radius:var(--radius-md);">
          Ningún artículo agregado.
        </div>
      `;
      this.recalculateCreditSummary();
      return;
    }

    listContainer.innerHTML = this.state.selectedProducts.map((p, idx) => `
      <div class="card p-2 d-flex justify-content-between align-items-center flex-row gap-2" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); font-size: 0.8rem;">
        <div style="display:flex; flex-direction:column; flex:1;">
          <strong class="text-primary" style="font-size:0.85rem;">${p.name}</strong>
          <span class="text-secondary" style="font-size:0.7rem;">Precio: $${p.price.toFixed(2)}</span>
        </div>
        <div class="d-flex align-items-center gap-2">
          <input type="number" class="input input-sm item-qty-input" data-index="${idx}" value="${p.quantity}" min="1" max="${p.maxStock}" style="width:60px; padding:2px var(--space-2); height: 28px;" />
          <button class="btn btn-danger btn-xs btn-remove-item" data-index="${idx}" style="padding:4px 8px; font-size:0.75rem; height: 28px;">🗑️</button>
        </div>
      </div>
    `).join('');

    // Attach listeners
    listContainer.querySelectorAll('.item-qty-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-index'));
        const val = Number(e.target.value);
        const max = Number(this.state.selectedProducts[idx].maxStock);
        
        if (val > max) {
          alert(`Stock insuficiente. Máximo disponible: ${max}`);
          e.target.value = max;
          this.state.selectedProducts[idx].quantity = max;
        } else {
          this.state.selectedProducts[idx].quantity = val;
        }
        this.recalculateCreditSummary();
      });
    });

    listContainer.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.target.getAttribute('data-index'));
        this.state.selectedProducts.splice(idx, 1);
        this.renderAddedItemsList();
      });
    });

    this.recalculateCreditSummary();
  }

  recalculateCreditSummary() {
    const amortization = this.modalInstance.$('#c-amortization')?.value || 'CON_AMORTIZACION';
    const interestRate = Number(this.modalInstance.$('#c-interest')?.value || 10) / 100;
    const term = Number(this.modalInstance.$('#c-term')?.value || 3);

    const subtotal = this.state.selectedProducts.reduce((acc, p) => acc + (p.price * p.quantity), 0);

    let interestTotal = 0;
    let total = 0;
    let monthly = 0;

    if (amortization === 'SIN_AMORTIZACION') {
      // Fixed interest over principal
      interestTotal = subtotal * interestRate * term;
      total = subtotal + interestTotal;
      monthly = total / term;
    } else {
      // Con amortización (approximated reducing interest: monthly payment decreases or standard formula)
      // Standard amortization monthly payment: PMT = P * r * (1+r)^n / ((1+r)^n - 1)
      if (interestRate > 0) {
        monthly = (subtotal * interestRate * Math.pow(1 + interestRate, term)) / (Math.pow(1 + interestRate, term) - 1);
        total = monthly * term;
        interestTotal = total - subtotal;
      } else {
        total = subtotal;
        monthly = subtotal / term;
        interestTotal = 0;
      }
    }

    // Round values
    interestTotal = Math.round(interestTotal * 100) / 100;
    total = Math.round(total * 100) / 100;
    monthly = Math.round(monthly * 100) / 100;

    const elSub = this.modalInstance.$('#lbl-subtotal');
    const elInt = this.modalInstance.$('#lbl-interest-total');
    const elTotal = this.modalInstance.$('#lbl-total');
    const elMonthly = this.modalInstance.$('#lbl-monthly-payment');

    if (elSub) elSub.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(subtotal);
    if (elInt) elInt.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(interestTotal);
    if (elTotal) elTotal.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(total);
    if (elMonthly) elMonthly.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monthly);
  }

  async submitNewCredit() {
    const clientId = this.modalInstance.$('#c-client').value;
    if (!clientId) {
      alert('Por favor selecciona un cliente para otorgar el crédito.');
      return;
    }

    const client = this.state.clients.find(c => c.id === clientId);
    if (!client) return;

    if (this.state.selectedProducts.length === 0) {
      alert('Por favor añade al menos un producto a la lista de financiamiento.');
      return;
    }

    const amortizationType = this.modalInstance.$('#c-amortization').value;
    const paymentMethod = this.modalInstance.$('#c-paymethod').value;
    const interestRate = Number(this.modalInstance.$('#c-interest').value);
    const termMonths = Number(this.modalInstance.$('#c-term').value);
    const dueDay = Number(this.modalInstance.$('#c-due-day').value);
    const sendEmail = this.modalInstance.$('#c-send-email').checked;

    const subtotal = this.state.selectedProducts.reduce((acc, p) => acc + (p.price * p.quantity), 0);
    
    // Check credit limit
    const limit = Number(client.creditLimit || 5000);
    const currentDebt = Number(client.currentDebt || 0);
    if (currentDebt + subtotal > limit) {
      if (!confirm(`⚠️ Alerta: El monto a financiar ($${subtotal}) sumado a la deuda actual del cliente ($${currentDebt}) supera su límite de crédito de $${limit}.\n¿Deseas autorizar esta venta de todos modos?`)) {
        return;
      }
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Procesando...';
    }

    // Calculations
    const rateDecimal = interestRate / 100;
    let totalDebt = 0;
    let monthlyInstallment = 0;
    if (amortizationType === 'SIN_AMORTIZACION') {
      totalDebt = subtotal + (subtotal * rateDecimal * termMonths);
      monthlyInstallment = totalDebt / termMonths;
    } else {
      if (rateDecimal > 0) {
        monthlyInstallment = (subtotal * rateDecimal * Math.pow(1 + rateDecimal, termMonths)) / (Math.pow(1 + rateDecimal, termMonths) - 1);
        totalDebt = monthlyInstallment * termMonths;
      } else {
        totalDebt = subtotal;
        monthlyInstallment = subtotal / termMonths;
      }
    }

    totalDebt = Math.round(totalDebt * 100) / 100;
    monthlyInstallment = Math.round(monthlyInstallment * 100) / 100;

    const payload = {
      clientId,
      clientName: client.name,
      clientEmail: client.email || '',
      amortizationType,
      paymentMethod,
      interestRate,
      termMonths,
      dueDay,
      initialAmount: totalDebt,
      remainingAmount: totalDebt,
      monthlyInstallment,
      items: this.state.selectedProducts,
      status: 'VIGENTE',
      date: Date.now(),
      updatedAt: Date.now()
    };

    try {
      // 1. Create credit record
      await FirestoreService.create('accounts_receivable', payload);

      // 2. Deduct inventory stocks (exclude custom special orders)
      for (const p of this.state.selectedProducts) {
        if (!p.isSpecial) {
          const productRef = this.state.products.find(item => item.id === p.id);
          if (productRef) {
            const newStock = Math.max(0, Number(productRef.stock || 0) - p.quantity);
            await FirestoreService.update('productos', p.id, { stock: newStock });
          }
        }
      }

      // 3. Update client currentDebt
      const newClientDebt = currentDebt + subtotal;
      await FirestoreService.update('recurring_clients', clientId, { currentDebt: newClientDebt });

      // 4. Simulate email dispatch
      if (sendEmail && client.email) {
        setTimeout(() => {
          NotificationService.info(`📧 Factura de cobro enviada por correo electrónico a ${client.email}`);
        }, 1500);
      }

      NotificationService.success('Crédito generado correctamente.');
      this.modalInstance.close();
    } catch (e) {
      console.error(e);
      alert('Error al generar el crédito: ' + e.message);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Generar Crédito';
      }
    }
  }

  openAbonoModal(credit) {
    const remaining = Number(credit.remainingAmount || 0);

    const formHTML = `
      <form id="abono-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label">Cliente</label>
          <input type="text" class="input input-md" value="${credit.clientName}" readonly style="opacity:0.75;" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Saldo Pendiente</label>
            <input type="text" class="input input-md" value="${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(remaining)}" readonly style="opacity:0.75; font-weight:bold; color:var(--color-danger);" />
          </div>
          <div class="form-group">
            <label class="form-label">Monto Sugerido (Cuota)</label>
            <input type="text" class="input input-md" value="${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(credit.monthlyInstallment)}" readonly style="opacity:0.75;" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="ab-amount">Monto del Abono ($ MXN)</label>
            <input type="number" id="ab-amount" class="input input-md" min="1" max="${remaining}" value="${Math.min(remaining, credit.monthlyInstallment)}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="ab-paymethod">Método de Pago</label>
            <select id="ab-paymethod" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="TRANSFERENCIA">Transferencia Bancaria</option>
            </select>
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">Registrar Abono</button>
    `;

    this.modalInstance = new Modal({
      title: '💵 Registrar Abono / Recibo de Pago',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    document.body.appendChild(this.modalInstance.mount());

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.modalInstance.close());

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const form = this.modalInstance.$('#abono-form');
        if (!form || !form.reportValidity()) return;

        const payAmount = Number(this.modalInstance.$('#ab-amount').value);
        const payMethod = this.modalInstance.$('#ab-paymethod').value;

        if (payAmount <= 0 || payAmount > remaining) {
          alert('Por favor ingresa un monto válido.');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Procesando...';

        const nextRemaining = Math.max(0, remaining - payAmount);
        const status = nextRemaining === 0 ? 'PAGADO' : credit.status;

        try {
          // 1. Update credit debt
          await FirestoreService.update('accounts_receivable', credit.id, {
            remainingAmount: nextRemaining,
            status,
            updatedAt: Date.now()
          });

          // 2. Add history log of payment
          await FirestoreService.create('accounts_receivable_history', {
            creditId: credit.id,
            clientName: credit.clientName,
            type: 'ABONO',
            amount: payAmount,
            paymentMethod: payMethod,
            previousDebt: remaining,
            newDebt: nextRemaining,
            date: Date.now()
          });

          // 3. Subtract from client's general currentDebt
          const clientRef = this.state.clients.find(c => c.id === credit.clientId);
          if (clientRef) {
            const nextClientDebt = Math.max(0, Number(clientRef.currentDebt || 0) - payAmount);
            await FirestoreService.update('recurring_clients', credit.clientId, { currentDebt: nextClientDebt });
          }

          // 4. Inject as global business income (ventas) for accounting balance transparency
          await FirestoreService.create('ventas', {
            clientName: credit.clientName,
            concept: `Abono de Crédito - ${credit.clientName}`,
            total: payAmount,
            paymentMethod: payMethod,
            items: [{ name: 'Abono Crédito', price: payAmount, quantity: 1 }],
            date: Date.now()
          });

          NotificationService.success('Abono registrado correctamente.');
          this.modalInstance.close();
        } catch (e) {
          alert('Error al registrar abono: ' + e.message);
          submitBtn.disabled = false;
          submitBtn.textContent = 'Registrar Abono';
        }
      });
    }
  }

  showCreditReceipt(credit) {
    const itemsHTML = credit.items.map(p => `
      <tr>
        <td style="padding:8px 0; border-bottom:1px solid var(--color-border);">${p.name}</td>
        <td style="padding:8px 0; border-bottom:1px solid var(--color-border); text-align:center;">${p.quantity}</td>
        <td style="padding:8px 0; border-bottom:1px solid var(--color-border); text-align:right;">$${p.price.toFixed(2)}</td>
      </tr>
    `).join('');

    const templateHTML = `
      <div style="color: var(--color-text-primary); font-family: monospace; font-size:0.85rem; padding: var(--space-4); max-height:60vh; overflow-y:auto;">
        <div style="text-align:center; margin-bottom: var(--space-4);">
          <h3 class="font-bold text-lg">DOCUMENTO DE CRÉDITO Y COBRO</h3>
          <p class="text-secondary" style="font-size:0.75rem; margin-top:2px;">Ultra-Administrador Financial System</p>
        </div>

        <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:var(--space-4); border-bottom:1px dashed var(--color-border); padding-bottom:var(--space-3);">
          <div><strong>Cliente:</strong> ${credit.clientName}</div>
          <div><strong>Correo:</strong> ${credit.clientEmail || 'N/D'}</div>
          <div><strong>Fecha Emisión:</strong> ${new Date(credit.date).toLocaleDateString()}</div>
          <div><strong>Día de Cobro Pactado:</strong> Día ${credit.dueDay} de cada mes</div>
          <div><strong>Método Pago:</strong> ${credit.paymentMethod}</div>
          <div><strong>Amortización:</strong> ${credit.amortizationType === 'CON_AMORTIZACION' ? 'CON AMORTIZACIÓN' : 'SIN AMORTIZACIÓN'}</div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:var(--space-4);">
          <thead>
            <tr style="border-bottom:1px solid var(--color-border);">
              <th style="text-align:left; padding:8px 0;">Articulo</th>
              <th style="text-align:center; padding:8px 0;">Cant</th>
              <th style="text-align:right; padding:8px 0;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end; border-top:1px solid var(--color-border); padding-top:var(--space-3);">
          <div>Monto Financiamiento Inicial: <strong>$${credit.initialAmount.toFixed(2)}</strong></div>
          <div style="color:var(--color-danger); font-size:1.1rem; font-weight:bold;">Saldo Deuda Restante: $${credit.remainingAmount.toFixed(2)}</div>
          <div>Cuota Mensual Estipulada: <strong>$${credit.monthlyInstallment.toFixed(2)}</strong></div>
        </div>

        <div class="text-center text-secondary mt-5" style="font-size:0.7rem; border:1px solid var(--color-border); padding:10px; border-radius: var(--radius-md);">
          ⚠️ NOTA: De no realizarse el abono correspondiente el día estipulado, se aplicará un cargo automático de mora del 5% compuesto acumulativo sobre la deuda restante.
        </div>
      </div>
    `;

    const modal = new Modal({
      title: '📄 Comprobante de Cobro y Crédito',
      bodyHTML: templateHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-close-rec">Cerrar</button>
        <button class="btn btn-primary btn-sm" id="btn-print-rec">🖨️ Imprimir</button>
        <button class="btn btn-primary btn-sm" id="btn-send-email-rec">📧 Re-enviar por Email</button>
        <button class="btn btn-primary btn-sm" id="btn-send-wa-rec">💬 Enviar por WhatsApp</button>
      `,
      size: 'md'
    });

    const el = modal.mount();
    document.body.appendChild(el);

    el.querySelector('#btn-close-rec')?.addEventListener('click', () => modal.close());
    el.querySelector('#btn-print-rec')?.addEventListener('click', () => {
      window.print();
    });
    el.querySelector('#btn-send-email-rec')?.addEventListener('click', () => {
      NotificationService.success(`📧 Factura enviada por email a: ${credit.clientEmail || 'cliente@correo.com'}`);
      modal.close();
    });
    el.querySelector('#btn-send-wa-rec')?.addEventListener('click', async () => {
      try {
        const clientRef = this.state.clients.find(c => c.id === credit.clientId);
        const phone = clientRef ? clientRef.phone : '5215512345678';
        
        await WhatsAppService.sendMessage(this.companyId, phone, 'CREDIT_RECEIPT', {
          cliente: credit.clientName,
          monto: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(credit.initialAmount),
          interes: credit.interestRate.toString(),
          cuota: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(credit.monthlyInstallment),
          vencimiento: `Día ${credit.dueDay} de cada mes`
        });

        NotificationService.success('Comprobante enviado por WhatsApp.');
        modal.close();
      } catch (err) {
        alert('Error al enviar WhatsApp: ' + err.message);
      }
    });
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}
