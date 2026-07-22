import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';

export class AccountsPayableView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'company-test';
    this.currentUser = currentUser;

    this.state = {
      bills: [],
      suppliers: [],
      products: [],
      tempParsedItems: []
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { key: 'supplierName', label: 'Proveedor', render: (val) => `<span class="font-semibold text-primary">🏢 ${val}</span>` },
        { key: 'invoiceRef', label: 'N° Factura', render: (val) => `<code>#${val || 'N/D'}</code>` },
        { 
          key: 'amount', 
          label: 'Monto Total', 
          render: (val) => `<strong style="color:var(--color-danger);">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)}</strong>` 
        },
        { 
          key: 'dueDate', 
          label: 'Vencimiento', 
          render: (val) => val ? new Date(val).toLocaleDateString() : '<span class="text-secondary">N/D</span>' 
        },
        {
          key: 'status',
          label: 'Estado',
          render: (val) => `<span class="badge" style="background-color: ${val === 'PENDIENTE' ? 'rgba(239,68,68,0.15)' : 'var(--color-bg-tertiary)'}; color: ${val === 'PENDIENTE' ? 'var(--color-danger)' : 'var(--color-text-secondary)'}; border: 1px solid var(--color-border); padding: 2px 8px; border-radius: var(--radius-md); font-size: 0.75rem;">${val || 'PENDIENTE'}</span>`
        },
        {
          key: 'id',
          label: 'Acción',
          render: (val, row) => `
            <div class="d-flex gap-2">
              ${row.status === 'PENDIENTE' ? `
                <button class="btn btn-primary btn-xs btn-pay-bill" data-id="${val}" style="padding: 2px 6px; font-size: 0.7rem;">💳 Liquidar Deuda</button>
              ` : ''}
              <button class="btn btn-secondary btn-xs btn-delete-bill" data-id="${val}" style="padding: 2px 6px; font-size: 0.7rem;">🗑️</button>
            </div>
          `
        }
      ],
      data: this.state.bills
    });

    this.layout = new PageLayout({
      title: 'Cuentas por Pagar (Proveedores)',
      subtitle: 'Gestiona facturas a crédito de proveedores e intégralas de forma automatizada al inventario mediante fotos.',
      actionHTML: `
        <div class="d-flex gap-2">
          <a class="btn btn-secondary btn-sm" href="#/owner/supplier-reminders">
            🏢 Avisos de Pago
          </a>
          <button class="btn btn-primary btn-sm" id="btn-scan-invoice">
            📷 Subir Foto Factura
          </button>
        </div>
      `,
      contentHTML: `
        <!-- KPI summary row -->
        <div class="grid-stats mb-5" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-4);">
          <div class="card p-4">
            <span class="text-sm text-secondary">Total Deuda Proveedores</span>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="kpi-total-payable">$0.00</h3>
          </div>
          <div class="card p-4">
            <span class="text-sm text-secondary">Facturas Pendientes</span>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="kpi-pending-bills" style="color: var(--color-danger);">0</h3>
          </div>
          <div class="card p-4">
            <span class="text-sm text-secondary">Facturas Liquidadas</span>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="kpi-paid-bills" style="color: var(--color-success);">0</h3>
          </div>
        </div>

        <div class="card p-5">
          <h3 class="text-lg font-semibold mb-4">Cuentas por Pagar</h3>
          <div id="bills-table-wrapper"></div>
        </div>
      `
    });

    this.modalInstance = null;
    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();

    const tableWrapper = element.querySelector('#bills-table-wrapper');
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

    const scanBtn = root.querySelector('#btn-scan-invoice');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => this.openScanModal());
    }

    const tableWrapper = root.querySelector('#bills-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const id = e.target.closest('button')?.getAttribute('data-id');
        if (!id) return;

        const bill = this.state.bills.find(b => b.id === id);
        if (!bill) return;

        if (e.target.closest('.btn-pay-bill')) {
          this.liquidateBill(bill);
        } else if (e.target.closest('.btn-delete-bill')) {
          if (confirm('¿Estás seguro de que deseas eliminar este registro de cuenta por pagar?')) {
            try {
              await FirestoreService.delete('accounts_payable', id);
              NotificationService.success('Registro eliminado.');
            } catch (err) {
              NotificationService.error('Error al eliminar el registro.');
            }
          }
        }
      });
    }
  }

  subscribeToData(element) {
    try {
      // Listen to bills
      const billsListener = FirestoreService.listenToTenant('accounts_payable', (bills) => {
        this.state.bills = bills || [];
        this.refreshTable(this.state.bills);
        this.updateKPIs();
      });
      this.listeners.push(billsListener);

      // Listen to suppliers
      const suppliersListener = FirestoreService.listenToTenant('proveedores', (suppliers) => {
        this.state.suppliers = suppliers || [];
      });
      this.listeners.push(suppliersListener);

      // Listen to products
      const productsListener = FirestoreService.listenToTenant('productos', (products) => {
        this.state.products = products || [];
      });
      this.listeners.push(productsListener);
    } catch (e) {
      console.warn('[AccountsPayableView] DB error:', e.message);
    }
  }

  refreshTable(data) {
    const tableWrapper = this.layout.$('#bills-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = data;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  updateKPIs() {
    const pending = this.state.bills.filter(b => b.status === 'PENDIENTE');
    const paid = this.state.bills.filter(b => b.status === 'PAGADO');

    const totalPayable = pending.reduce((acc, b) => acc + Number(b.amount || 0), 0);

    const elTotal = this.layout.$('#kpi-total-payable');
    const elPending = this.layout.$('#kpi-pending-bills');
    const elPaid = this.layout.$('#kpi-paid-bills');

    if (elTotal) elTotal.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalPayable);
    if (elPending) elPending.textContent = pending.length;
    if (elPaid) elPaid.textContent = paid.length;
  }

  async liquidateBill(bill) {
    if (confirm(`¿Confirmas liquidar la cuenta por pagar a ${bill.supplierName} por un monto de $${bill.amount}?\nEsto lo registrará automáticamente como un gasto.`)) {
      try {
        // 1. Update bill status
        await FirestoreService.update('accounts_payable', bill.id, {
          status: 'PAGADO',
          paymentDate: Date.now(),
          updatedAt: Date.now()
        });

        // 2. Feed expenses collection automatically
        await FirestoreService.create('expenses', {
          concept: `Pago Factura Proveedor #${bill.invoiceRef} - ${bill.supplierName}`,
          category: 'Materia Prima',
          amount: Number(bill.amount),
          date: new Date().toISOString().split('T')[0],
          registeredBy: this.currentUser.displayName || this.currentUser.email || 'Admin',
          createdAt: Date.now()
        });

        NotificationService.success('Cuenta liquidada y registrada en Gastos.');
      } catch (err) {
        alert('Error al liquidar deuda: ' + err.message);
      }
    }
  }

  openScanModal() {
    const bodyHTML = `
      <div id="scan-modal-content" style="color: var(--color-text-primary);">
        
        <!-- Step 1: Upload invoice photo -->
        <div id="ocr-upload-step" class="text-center py-5 d-flex flex-column align-items-center gap-3" style="border: 2px dashed var(--color-border); border-radius: var(--radius-lg); cursor: pointer; background: var(--color-bg-secondary);">
          <div style="font-size: 3rem;">📸</div>
          <h4 class="font-bold text-md">Sube o toma una foto de la factura del proveedor</h4>
          <p class="text-secondary text-sm" style="max-width: 400px; margin:0;">
            El sistema analizará automáticamente los productos, cantidades, precios y códigos para integrarlos a tu inventario.
          </p>
          <input type="file" id="ocr-file-input" accept="image/*" style="display:none;" />
          <button class="btn btn-secondary btn-sm" id="btn-trigger-file">Seleccionar Archivo</button>
          
          <div style="margin-top:var(--space-2); height: 1px; width:80%; background:var(--color-border);"></div>
          <span class="text-xs text-secondary">O haz una simulación rápida:</span>
          <button class="btn btn-accent btn-xs" id="btn-simulate-ocr">⚡ Simular Lectura de Factura (15 Cocinas)</button>
        </div>

        <!-- Step 2: Scanning screen animation (hidden by default) -->
        <div id="ocr-scanning-step" class="text-center py-6" style="display:none;">
          <div style="position:relative; width: 140px; height: 140px; margin: 0 auto 20px; border: 2px solid var(--color-accent); border-radius:12px; background: rgba(99,102,241,0.05); overflow:hidden;">
            <!-- Laser scanning line animation -->
            <div style="position:absolute; width:100%; height:4px; background:var(--color-accent); left:0; top:0; animation: scanLine 2s infinite ease-in-out; box-shadow: 0 0 10px var(--color-accent);"></div>
            <div style="font-size: 4rem; line-height: 140px;">📄</div>
          </div>
          <h4 class="font-bold text-lg mb-2" id="ocr-status-text">Procesando imagen con IA...</h4>
          <p class="text-secondary text-sm" id="ocr-substatus-text">Leyendo caracteres y analizando estructura de tabla...</p>
        </div>

        <!-- Step 3: Review extracted items & Integration (hidden by default) -->
        <div id="ocr-results-step" style="display:none; max-height:70vh; overflow-y:auto;">
          <h4 class="text-sm font-bold text-secondary mb-3">📋 Datos Extraídos por el Escáner</h4>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3); margin-bottom:var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="res-supplier">Proveedor Factura</label>
              <input type="text" id="res-supplier" class="input input-md" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="res-invoice-ref">N° de Referencia Factura</label>
              <input type="text" id="res-invoice-ref" class="input input-md" required />
            </div>
          </div>

          <h5 class="text-xs font-bold text-secondary mb-2">Artículos Detectados</h5>
          <div id="extracted-items-container" class="d-flex flex-column gap-3 mb-4">
            <!-- Populated dynamically -->
          </div>

          <div style="display:grid; grid-template-columns: 1.2fr 1fr; gap:var(--space-4); border-top:1px solid var(--color-border); padding-top:var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="res-due-date">Fecha Vencimiento del Crédito</label>
              <input type="date" id="res-due-date" class="input input-md" required />
            </div>
            <div class="text-right d-flex flex-column justify-content-center align-items-end">
              <span class="text-xs text-secondary">Monto Total Factura:</span>
              <strong class="text-2xl text-primary" id="res-total-amount">$0.00</strong>
            </div>
          </div>
        </div>

      </div>
    `;

    this.modalInstance = new Modal({
      title: '📷 Integración de Factura por Captura',
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="modal-integrate-btn" style="display:none;">Confirmar e Integrar</button>
      `,
      size: 'lg'
    });

    document.body.appendChild(this.modalInstance.mount());

    // Inject laser animation stylesheet dynamically if not exists
    if (!document.getElementById('laser-animation-css')) {
      const style = document.createElement('style');
      style.id = 'laser-animation-css';
      style.textContent = `
        @keyframes scanLine {
          0% { top: 0%; }
          50% { top: 96%; }
          100% { top: 0%; }
        }
      `;
      document.head.appendChild(style);
    }

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.modalInstance.close());

    const integrateBtn = this.modalInstance.$('#modal-integrate-btn');
    if (integrateBtn) integrateBtn.addEventListener('click', () => this.integrateInvoiceData());

    // File input triggers
    const uploadStep = this.modalInstance.$('#ocr-upload-step');
    const fileInput = this.modalInstance.$('#ocr-file-input');
    const triggerFileBtn = this.modalInstance.$('#btn-trigger-file');
    const simulateBtn = this.modalInstance.$('#btn-simulate-ocr');

    const startScan = (invoiceType = 'simulate') => {
      uploadStep.style.display = 'none';
      const scanStep = this.modalInstance.$('#ocr-scanning-step');
      scanStep.style.display = 'block';

      // Stage status changes
      const statusText = this.modalInstance.$('#ocr-status-text');
      const substatusText = this.modalInstance.$('#ocr-substatus-text');

      setTimeout(() => {
        if (statusText) statusText.textContent = 'Analizando estructura de tabla...';
        if (substatusText) substatusText.textContent = 'Buscando concordancias en inventario (SKU)...';
      }, 1000);

      setTimeout(() => {
        this.processExtractedData(invoiceType);
      }, 2200);
    };

    if (uploadStep && fileInput) {
      uploadStep.addEventListener('click', (e) => {
        if (e.target.closest('#btn-simulate-ocr') || e.target.closest('#btn-trigger-file')) return;
        fileInput.click();
      });
      fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
          startScan('file');
        }
      });
    }

    if (triggerFileBtn && fileInput) {
      triggerFileBtn.addEventListener('click', () => fileInput.click());
    }

    if (simulateBtn) {
      simulateBtn.addEventListener('click', () => startScan('simulate'));
    }
  }

  processExtractedData(type) {
    const scanStep = this.modalInstance.$('#ocr-scanning-step');
    if (scanStep) scanStep.style.display = 'none';

    const resultsStep = this.modalInstance.$('#ocr-results-step');
    if (resultsStep) resultsStep.style.display = 'block';

    const integrateBtn = this.modalInstance.$('#modal-integrate-btn');
    if (integrateBtn) integrateBtn.style.display = 'inline-block';

    // Mock parsed items
    let supplier = 'Distribuidora Mabe S.A.';
    let refNum = 'FAC-99219';
    let items = [];

    if (type === 'simulate') {
      items = [
        {
          name: 'Cocina de Gas Mabe 4 Quemadores',
          sku: 'MABE-4Q-GAS',
          quantity: 15,
          purchasePrice: 2800,
          suggestedPrice: 3990
        },
        {
          name: 'Microondas Whirlpool 20L',
          sku: 'WHIRL-MW-20L',
          quantity: 5,
          purchasePrice: 1200,
          suggestedPrice: 1950
        }
      ];
    } else {
      // Dummy parsed data from uploaded photo
      supplier = 'Ferretería Industrial S.A.';
      refNum = 'F-88716';
      items = [
        {
          name: 'Taladro Percutor 20V Dewalt',
          sku: 'DEW-TP-20V',
          quantity: 10,
          purchasePrice: 1850,
          suggestedPrice: 2600
        },
        {
          name: 'Juego de Herramientas 120pcs Stanley',
          sku: 'STAN-TOOL-120P',
          quantity: 8,
          purchasePrice: 950,
          suggestedPrice: 1490
        }
      ];
    }

    this.modalInstance.$('#res-supplier').value = supplier;
    this.modalInstance.$('#res-invoice-ref').value = refNum;

    // Set default due date to 30 days from now
    const next30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    this.modalInstance.$('#res-due-date').value = next30Days;

    this.state.tempParsedItems = items;
    this.renderExtractedItems();
  }

  renderExtractedItems() {
    const container = this.modalInstance.$('#extracted-items-container');
    if (!container) return;

    let subtotal = 0;

    container.innerHTML = this.state.tempParsedItems.map((item, idx) => {
      // Check if product exists in stock (by SKU or Name)
      const existingProduct = this.state.products.find(p => p.sku === item.sku || p.name.toLowerCase() === item.name.toLowerCase());
      const exists = !!existingProduct;
      
      subtotal += item.purchasePrice * item.quantity;

      return `
        <div class="card p-3" style="background:var(--color-bg-secondary); border: 1px solid ${exists ? 'var(--color-border)' : 'rgba(239,141,68,0.3)'};">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:var(--space-2);">
            <div>
              <strong style="font-size:0.95rem;">${item.name}</strong>
              <div class="text-xs text-secondary mt-1">SKU: <code>${item.sku}</code></div>
            </div>
            <div>
              ${exists 
                ? `<span class="badge" style="background-color:rgba(52,211,153,0.15); color:var(--color-success); font-size:0.7rem; padding: 2px 8px; border:1px solid var(--color-border); border-radius:var(--radius-md);">✔️ Existente</span>`
                : `<span class="badge" style="background-color:rgba(239,141,68,0.15); color:var(--color-warning); font-size:0.7rem; padding: 2px 8px; border:1px solid var(--color-border); border-radius:var(--radius-md);">➕ Producto Nuevo</span>`
              }
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1.2fr 1.2fr 1.2fr; gap:var(--space-3); font-size:0.8rem; margin-top:10px;">
            <div class="form-group">
              <label class="form-label" style="font-size:0.75rem;">Cant</label>
              <input type="number" class="input input-sm ext-qty" data-index="${idx}" value="${item.quantity}" min="1" required style="padding:2px var(--space-2); height: 28px;" />
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size:0.75rem;">P. Compra</label>
              <input type="number" class="input input-sm ext-purchase" data-index="${idx}" value="${item.purchasePrice}" min="1" required style="padding:2px var(--space-2); height: 28px;" />
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size:0.75rem;">P. Venta Sugerido</label>
              <input type="number" class="input input-sm ext-sale" data-index="${idx}" value="${item.suggestedPrice}" min="1" required style="padding:2px var(--space-2); height: 28px;" />
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size:0.75rem;">Categoría</label>
              <select class="input input-sm ext-category" data-index="${idx}" style="background-color: var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-2); color:var(--color-text-primary); height: 28px;">
                <option value="Cocina" ${item.name.toLowerCase().includes('cocina') ? 'selected' : ''}>Cocina / Equipos</option>
                <option value="Línea Blanca" ${item.name.toLowerCase().includes('microondas') ? 'selected' : ''}>Línea Blanca</option>
                <option value="Ferretería" ${item.name.toLowerCase().includes('taladro') || item.name.toLowerCase().includes('herramienta') ? 'selected' : ''}>Ferretería</option>
                <option value="Otros" selected>Otros</option>
              </select>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach recalculation event listeners
    container.querySelectorAll('.ext-qty, .ext-purchase').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-index'));
        const val = Number(e.target.value);
        if (e.target.classList.contains('ext-qty')) {
          this.state.tempParsedItems[idx].quantity = val;
        } else {
          this.state.tempParsedItems[idx].purchasePrice = val;
        }
        this.updateExtractedTotal();
      });
    });

    container.querySelectorAll('.ext-sale, .ext-category').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-index'));
        if (e.target.classList.contains('ext-sale')) {
          this.state.tempParsedItems[idx].suggestedPrice = Number(e.target.value);
        } else {
          this.state.tempParsedItems[idx].category = e.target.value;
        }
      });
    });

    this.updateExtractedTotal();
  }

  updateExtractedTotal() {
    const total = this.state.tempParsedItems.reduce((acc, item) => acc + (item.purchasePrice * item.quantity), 0);
    const elTotal = this.modalInstance.$('#res-total-amount');
    if (elTotal) {
      elTotal.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(total);
    }
  }

  async integrateInvoiceData() {
    const supplierName = this.modalInstance.$('#res-supplier').value.trim();
    const invoiceRef = this.modalInstance.$('#res-invoice-ref').value.trim();
    const dueDate = this.modalInstance.$('#res-due-date').value;

    if (!supplierName || !invoiceRef || !dueDate) {
      alert('Por favor rellena el proveedor, número de factura y fecha de vencimiento.');
      return;
    }

    const totalAmount = this.state.tempParsedItems.reduce((acc, item) => acc + (item.purchasePrice * item.quantity), 0);

    const integrateBtn = this.modalInstance.$('#modal-integrate-btn');
    if (integrateBtn) {
      integrateBtn.disabled = true;
      integrateBtn.textContent = 'Integrando...';
    }

    try {
      // 1. Process items into inventory
      for (const item of this.state.tempParsedItems) {
        const existingProduct = this.state.products.find(p => p.sku === item.sku || p.name.toLowerCase() === item.name.toLowerCase());

        if (existingProduct) {
          // Existing product: increase stock & update purchase price
          const updatedStock = Number(existingProduct.stock || 0) + item.quantity;
          await FirestoreService.update('productos', existingProduct.id, {
            stock: updatedStock,
            purchasePrice: item.purchasePrice,
            price: item.suggestedPrice || existingProduct.price,
            updatedAt: Date.now()
          });
        } else {
          // New product: create
          const newProductPayload = {
            name: item.name,
            sku: item.sku,
            barcode: item.sku,
            stock: item.quantity,
            minStock: 2,
            purchasePrice: item.purchasePrice,
            price: item.suggestedPrice,
            category: item.category || 'Otros',
            unit: 'uds',
            status: 'Disponible',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdAtLocal: TimeService.timestamp(),
            updatedAtLocal: TimeService.timestamp()
          };
          await FirestoreService.create('productos', newProductPayload);
        }
      }

      // 2. Create accounts payable record
      const billPayload = {
        supplierName,
        invoiceRef,
        amount: totalAmount,
        dueDate: new Date(dueDate).getTime(),
        status: 'PENDIENTE',
        date: Date.now()
      };
      await FirestoreService.create('accounts_payable', billPayload);

      NotificationService.success(`Factura #${invoiceRef} integrada. Inventario actualizado.`);
      this.modalInstance.close();
    } catch (e) {
      console.error(e);
      alert('Error al integrar factura: ' + e.message);
      if (integrateBtn) {
        integrateBtn.disabled = false;
        integrateBtn.textContent = 'Confirmar e Integrar';
      }
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
