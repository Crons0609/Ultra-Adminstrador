/**
 * @file credit-system.view.js
 * @description Módulo "Sistema de Crédito" — Gestión completa de ventas a crédito.
 * 5 pestañas: Nuevo Crédito, Cartera Activa y Abonos, Calendario de Cuotas,
 * Reportes de Cartera, e Historial de Movimientos.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { CreditService } from '../../../services/credit.service.js';
import { TimeService } from '../../../services/time.service.js';

export class CreditSystemView extends Component {
  constructor(params = {}) {
    super(params);
    const currentUser = GlobalStore.getState().currentUser || {};
    const currentCompany = GlobalStore.getState().currentCompany || {};
    this.companyId = currentUser.companyId || 'company-test';
    this.companyName = currentCompany.name || 'Mi Negocio';
    this.currentUser = currentUser;

    this.state = {
      activeTab: 'new-credit',
      credits: [],
      clients: [],
      products: [],
      payments: [],
      moraLogs: [],
      selectedProducts: [],
      selectedCreditId: null,
    };

    this.listeners = [];
    this.modalInstance = null;

    this.layout = new PageLayout({
      title: '💳 Sistema de Crédito',
      subtitle: 'Administra créditos a clientes, calendarios de cuotas, mora automática y documentos de cobro.',
      actionHTML: `
        <div class="d-flex gap-2">
          <a class="btn btn-secondary btn-sm" href="#/owner/accounts-receivable">📋 Cuentas por Cobrar</a>
          <a class="btn btn-secondary btn-sm" href="#/owner/payment-reminders">🔔 Recordatorios</a>
        </div>
      `,
      contentHTML: `
        <!-- ── Tabs ─────────────────────────────────────────── -->
        <div class="credit-tabs-bar" style="display:flex; gap:4px; border-bottom:2px solid var(--color-border); margin-bottom:var(--space-5); overflow-x:auto; padding-bottom:0;">
          ${this._tabBtn('new-credit',    '📝 Nuevo Crédito',     true)}
          ${this._tabBtn('portfolio',     '💳 Cartera Activa')}
          ${this._tabBtn('calendar',      '📅 Calendario')}
          ${this._tabBtn('reports',       '📊 Reportes')}
          ${this._tabBtn('history',       '📜 Historial')}
        </div>

        <!-- ── Tab Panels ─────────────────────────────────────── -->
        <div id="tab-new-credit"  class="credit-tab-panel"></div>
        <div id="tab-portfolio"   class="credit-tab-panel" style="display:none;"></div>
        <div id="tab-calendar"    class="credit-tab-panel" style="display:none;"></div>
        <div id="tab-reports"     class="credit-tab-panel" style="display:none;"></div>
        <div id="tab-history"     class="credit-tab-panel" style="display:none;"></div>
      `
    });
  }

  // ─── Helper: tab button ───────────────────────────────────────────────────────
  _tabBtn(id, label, active = false) {
    return `<button class="credit-tab-btn${active ? ' active' : ''}" data-tab="${id}"
      style="padding: var(--space-2) var(--space-4); font-size:0.875rem; font-weight:600; background:transparent;
             border:none; border-bottom: 3px solid ${active ? 'var(--color-accent)' : 'transparent'};
             color:${active ? 'var(--color-accent)' : 'var(--color-text-secondary)'}; cursor:pointer;
             white-space:nowrap; transition:all 0.2s;">${label}</button>`;
  }

  // ─── Format helpers ───────────────────────────────────────────────────────────
  _fmt(v) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0); }
  _fmtDate(ts) { return ts ? new Date(ts).toLocaleDateString('es-MX', { year:'numeric', month:'short', day:'numeric' }) : '—'; }
  _statusBadge(status) {
    const map = {
      VIGENTE:      { bg: 'rgba(52,211,153,0.15)',  color: 'var(--color-success)' },
      VENCIDO:      { bg: 'rgba(239,68,68,0.15)',   color: 'var(--color-danger)' },
      PAGADO:       { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' },
      REESTRUCTURADO:{ bg: 'rgba(245,158,11,0.15)', color: 'var(--color-warning)' },
    };
    const s = map[status] || map.VIGENTE;
    return `<span style="background:${s.bg}; color:${s.color}; border:1px solid var(--color-border); padding:2px 8px; border-radius:var(--radius-md); font-size:0.72rem; font-weight:600;">${status}</span>`;
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────
  mount() {
    const el = this.layout.mount();
    this._attachTabListeners(el);
    this._loadData(el);
    this._renderNewCreditTab(el);
    return el;
  }

  // ─── Data subscriptions ───────────────────────────────────────────────────────
  _loadData(el) {
    try {
      const cl = FirestoreService.listenToTenant('credits', (data) => {
        this.state.credits = data || [];
        const t = this.state.activeTab;
        if (t === 'portfolio') this._renderPortfolioTab(el);
        if (t === 'calendar')  this._renderCalendarTab(el);
        if (t === 'reports')   this._renderReportsTab(el);
        this._refreshKPIBanner(el);
      });
      this.listeners.push(cl);

      const cl2 = FirestoreService.listenToTenant('recurring_clients', (data) => { this.state.clients = data || []; });
      this.listeners.push(cl2);

      const cl3 = FirestoreService.listenToTenant('productos', (data) => { this.state.products = data || []; });
      this.listeners.push(cl3);

      const cl4 = FirestoreService.listenToTenant('credit_payments', (data) => {
        this.state.payments = data || [];
        if (this.state.activeTab === 'history') this._renderHistoryTab(el);
      });
      this.listeners.push(cl4);

      const cl5 = FirestoreService.listenToTenant('credit_mora_log', (data) => {
        this.state.moraLogs = data || [];
      });
      this.listeners.push(cl5);
    } catch (e) {
      console.warn('[CreditSystemView] Firestore error:', e.message);
    }

    // Auto-apply late fees on load
    setTimeout(() => {
      CreditService.checkAndAutoApplyLateFees(this.companyId).then(n => {
        if (n > 0) NotificationService.warning(`⚠️ Se aplicó mora automática del 5% a ${n} crédito(s) vencido(s).`);
      }).catch(() => {});
    }, 1500);
  }

  // ─── Tab switching ────────────────────────────────────────────────────────────
  _attachTabListeners(el) {
    const tabsBar = el.querySelector('.credit-tabs-bar');
    if (!tabsBar) return;
    tabsBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.credit-tab-btn');
      if (!btn) return;
      const tab = btn.getAttribute('data-tab');

      // Update button styles
      tabsBar.querySelectorAll('.credit-tab-btn').forEach(b => {
        const isActive = b === btn;
        b.style.borderBottomColor = isActive ? 'var(--color-accent)' : 'transparent';
        b.style.color = isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)';
      });

      // Show/hide panels
      el.querySelectorAll('.credit-tab-panel').forEach(p => p.style.display = 'none');
      const panel = el.querySelector(`#tab-${tab}`);
      if (panel) panel.style.display = 'block';

      this.state.activeTab = tab;

      // Render on first access
      if (tab === 'portfolio') this._renderPortfolioTab(el);
      if (tab === 'calendar')  this._renderCalendarTab(el);
      if (tab === 'reports')   this._renderReportsTab(el);
      if (tab === 'history')   this._renderHistoryTab(el);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // TAB 1 — NUEVO CRÉDITO
  // ══════════════════════════════════════════════════════════════════════════════
  _renderNewCreditTab(el) {
    const panel = el.querySelector('#tab-new-credit');
    if (!panel) return;

    panel.innerHTML = `
      <div style="display:grid; grid-template-columns:1.3fr 1fr; gap:var(--space-5);">

        <!-- LEFT: Client + Credit Config -->
        <div class="d-flex flex-column gap-4">

          <!-- Client Section -->
          <div class="card p-4">
            <h4 class="text-sm font-bold mb-3" style="color:var(--color-accent);">👤 Datos del Cliente</h4>
            <div class="form-group mb-2">
              <label class="form-label" for="cs-client">Cliente Registrado</label>
              <div class="d-flex gap-2">
                <select id="cs-client" class="input input-md" style="flex:1; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-3); color:var(--color-text-primary);">
                  <option value="">— Seleccionar cliente —</option>
                </select>
                <button id="btn-cs-new-client" class="btn btn-secondary btn-sm" style="padding:0 var(--space-3);">👤 +Nuevo</button>
              </div>
            </div>
            <!-- Client preview -->
            <div id="cs-client-preview" style="display:none;" class="card p-3 mt-2" style="background:var(--color-bg-tertiary);"></div>
            <!-- New Client expanded form -->
            <div id="cs-new-client-form" style="display:none;" class="card p-3 mt-2" style="background:var(--color-bg-tertiary); border:1px dashed var(--color-border);">
              <h5 class="text-xs font-bold mb-2">Registrar Nuevo Cliente</h5>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <div class="form-group"><label class="form-label" for="cs-nc-name">Nombre Completo *</label><input type="text" id="cs-nc-name" class="input input-sm" placeholder="Ej. Juan García" /></div>
                <div class="form-group"><label class="form-label" for="cs-nc-phone">Teléfono *</label><input type="tel" id="cs-nc-phone" class="input input-sm" placeholder="55 1234 5678" /></div>
                <div class="form-group"><label class="form-label" for="cs-nc-email">Correo Electrónico</label><input type="email" id="cs-nc-email" class="input input-sm" placeholder="correo@ejemplo.com" /></div>
                <div class="form-group"><label class="form-label" for="cs-nc-id">N° Identificación</label><input type="text" id="cs-nc-id" class="input input-sm" placeholder="CURP / INE / Pasaporte" /></div>
                <div class="form-group" style="grid-column:1/-1;"><label class="form-label" for="cs-nc-address">Dirección</label><input type="text" id="cs-nc-address" class="input input-sm" placeholder="Calle, número, colonia" /></div>
                <div class="form-group" style="grid-column:1/-1;"><label class="form-label" for="cs-nc-refs">Referencias Personales / Comerciales</label><textarea id="cs-nc-refs" class="input input-sm" rows="2" placeholder="Nombre y teléfono de referencias..."></textarea></div>
                <div class="form-group"><label class="form-label" for="cs-nc-limit">Límite de Crédito ($)</label><input type="number" id="cs-nc-limit" class="input input-sm" value="5000" min="0" /></div>
              </div>
              <div class="d-flex gap-2 justify-content-end mt-2">
                <button id="cs-nc-cancel" class="btn btn-secondary btn-xs">Cancelar</button>
                <button id="cs-nc-save" class="btn btn-primary btn-xs">✅ Guardar Cliente</button>
              </div>
            </div>
          </div>

          <!-- Credit Config -->
          <div class="card p-4">
            <h4 class="text-sm font-bold mb-3" style="color:var(--color-accent);">⚙️ Configuración del Crédito</h4>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="cs-amort">Tipo de Amortización</label>
                <select id="cs-amort" class="input input-md" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-3); color:var(--color-text-primary);">
                  <option value="CON_AMORTIZACION">Con Amortización (saldo reducible)</option>
                  <option value="SIN_AMORTIZACION">Sin Amortización (interés fijo)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="cs-freq">Frecuencia de Pago</label>
                <select id="cs-freq" class="input input-md" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-3); color:var(--color-text-primary);">
                  <option value="MENSUAL">Mensual</option>
                  <option value="QUINCENAL">Quincenal</option>
                  <option value="SEMANAL">Semanal</option>
                  <option value="PERSONALIZADO">Personalizado</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="cs-interest">Interés por Período (%)</label>
                <input type="number" id="cs-interest" class="input input-md" value="10" min="0" step="0.5" />
              </div>
              <div class="form-group">
                <label class="form-label" for="cs-terms">N° de Cuotas</label>
                <input type="number" id="cs-terms" class="input input-md" value="6" min="1" />
              </div>
              <div class="form-group" id="cs-dueday-wrap">
                <label class="form-label" for="cs-dueday">Día de Cobro (del mes)</label>
                <input type="number" id="cs-dueday" class="input input-md" value="15" min="1" max="28" />
              </div>
              <div class="form-group" id="cs-customdays-wrap" style="display:none;">
                <label class="form-label" for="cs-customdays">Cada cuántos días</label>
                <input type="number" id="cs-customdays" class="input input-md" value="30" min="1" />
              </div>
              <div class="form-group">
                <label class="form-label" for="cs-startdate">Fecha de Inicio</label>
                <input type="date" id="cs-startdate" class="input input-md" />
              </div>
              <div class="form-group">
                <label class="form-label" for="cs-paymethod">Método de Pago</label>
                <select id="cs-paymethod" class="input input-md" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-3); color:var(--color-text-primary);">
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                  <option value="TARJETA">Tarjeta</option>
                  <option value="SIN_DEFINIR">Sin definir</option>
                </select>
              </div>
            </div>
            <div class="form-group mt-2">
              <label class="d-flex align-items-center gap-2 font-medium" style="cursor:pointer; font-size:0.85rem;">
                <input type="checkbox" id="cs-send-email" checked style="accent-color:var(--color-accent);"/>
                Enviar contrato / factura por correo electrónico al cliente
              </label>
            </div>
          </div>

          <!-- Financial Summary -->
          <div class="card p-4" style="background:var(--color-bg-secondary);">
            <h4 class="text-sm font-bold mb-3">📊 Resumen Financiero</h4>
            <div class="d-flex flex-column gap-2" style="font-size:0.875rem;">
              <div class="d-flex justify-content-between"><span>Subtotal Artículos:</span><strong id="cs-lbl-sub">$0.00</strong></div>
              <div class="d-flex justify-content-between"><span>Interés Total:</span><strong id="cs-lbl-int">$0.00</strong></div>
              <div class="d-flex justify-content-between" style="border-top:1px solid var(--color-border); padding-top:8px; font-size:1rem;">
                <span>Deuda Total:</span><strong id="cs-lbl-total" style="color:var(--color-accent);">$0.00</strong>
              </div>
              <div class="d-flex justify-content-between" style="font-size:0.8rem; color:var(--color-text-secondary);">
                <span>Cuota por Período:</span><strong id="cs-lbl-installment">$0.00</strong>
              </div>
            </div>
            <button id="cs-preview-schedule-btn" class="btn btn-secondary btn-sm mt-3 w-100">👁️ Previsualizar Calendario de Cuotas</button>
            <div id="cs-schedule-preview" class="mt-3" style="display:none;"></div>
          </div>

          <!-- Actions -->
          <div class="d-flex gap-3">
            <button id="cs-submit-btn" class="btn btn-primary btn-md" style="flex:1; font-size:1rem; padding:var(--space-3);">✅ Generar Crédito y Documento</button>
          </div>
        </div>

        <!-- RIGHT: Products -->
        <div class="d-flex flex-column gap-4">
          <div class="card p-4">
            <h4 class="text-sm font-bold mb-3" style="color:var(--color-accent);">🛒 Artículos a Financiar</h4>

            <div class="form-group">
              <label class="form-label" for="cs-product">Agregar desde Inventario</label>
              <div class="d-flex gap-2">
                <select id="cs-product" class="input input-md" style="flex:1; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-3); color:var(--color-text-primary);">
                  <option value="">— Seleccionar Producto —</option>
                </select>
                <button id="cs-add-stock-btn" class="btn btn-secondary btn-sm">+ Añadir</button>
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:8px; margin:12px 0;">
              <div style="flex:1; height:1px; background:var(--color-border);"></div>
              <span class="text-xs text-secondary">O bien</span>
              <div style="flex:1; height:1px; background:var(--color-border);"></div>
            </div>

            <!-- Special order -->
            <div class="card p-3" style="background:var(--color-bg-tertiary); border:1px dashed var(--color-border);">
              <h5 class="text-xs font-bold mb-2">🎁 Pedido Especial / Servicio</h5>
              <div class="d-flex flex-column gap-2">
                <input type="text" id="cs-so-name" class="input input-sm" placeholder="Descripción" />
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                  <input type="number" id="cs-so-price" class="input input-sm" placeholder="Precio ($)" min="0" />
                  <input type="number" id="cs-so-qty" class="input input-sm" placeholder="Cant." min="1" value="1" />
                </div>
                <button id="cs-add-so-btn" class="btn btn-secondary btn-xs align-self-end">+ Añadir Especial</button>
              </div>
            </div>

            <!-- Items list -->
            <div class="mt-3">
              <h5 class="text-xs font-bold mb-2">Lista de Artículos</h5>
              <div id="cs-items-list" style="max-height:340px; overflow-y:auto;">
                <div class="text-center text-secondary py-4" style="font-size:0.8rem; border:1px dashed var(--color-border); border-radius:var(--radius-md);">
                  Ningún artículo agregado
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Set default start date to today
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const startDateInput = panel.querySelector('#cs-startdate');
    if (startDateInput) startDateInput.value = todayStr;

    // Populate clients + products
    this._populateClientsSelect(panel);
    this._populateProductsSelect(panel);

    // Wire up events
    this._attachNewCreditEvents(panel);
  }

  _populateClientsSelect(panel) {
    const sel = panel.querySelector('#cs-client');
    if (!sel) return;
    const opts = (this.state.clients).filter(c => c.status !== 'INACTIVO').map(c =>
      `<option value="${c.id}" data-phone="${c.phone || ''}" data-email="${c.email || ''}" data-limit="${c.creditLimit || 5000}" data-debt="${c.currentDebt || 0}">${c.name} — Límite: ${this._fmt(c.creditLimit || 5000)}</option>`
    ).join('');
    sel.innerHTML = `<option value="">— Seleccionar cliente —</option>${opts}`;
  }

  _populateProductsSelect(panel) {
    const sel = panel.querySelector('#cs-product');
    if (!sel) return;
    const opts = (this.state.products).filter(p => Number(p.stock || 0) > 0).map(p =>
      `<option value="${p.id}" data-price="${p.price}" data-stock="${p.stock}">${p.name} — ${this._fmt(p.price)} (Stock: ${p.stock})</option>`
    ).join('');
    sel.innerHTML = `<option value="">— Seleccionar Producto —</option>${opts}`;
  }

  _attachNewCreditEvents(panel) {
    // Client select → show preview
    const clientSel = panel.querySelector('#cs-client');
    if (clientSel) {
      clientSel.addEventListener('change', () => {
        const opt = clientSel.options[clientSel.selectedIndex];
        const preview = panel.querySelector('#cs-client-preview');
        if (preview && clientSel.value) {
          const phone = opt.getAttribute('data-phone');
          const email = opt.getAttribute('data-email');
          const limit = opt.getAttribute('data-limit');
          const debt = opt.getAttribute('data-debt');
          const avail = (Number(limit) - Number(debt)).toFixed(2);
          preview.style.display = 'block';
          preview.innerHTML = `
            <div style="font-size:0.8rem; display:grid; grid-template-columns:1fr 1fr; gap:4px 12px;">
              <span>📞 ${phone || '—'}</span><span>📧 ${email || '—'}</span>
              <span>Límite: <strong>${this._fmt(limit)}</strong></span>
              <span>Disponible: <strong style="color:var(--color-success);">${this._fmt(avail)}</strong></span>
            </div>`;
        } else if (preview) {
          preview.style.display = 'none';
        }
      });
    }

    // Toggle new client form
    panel.querySelector('#btn-cs-new-client')?.addEventListener('click', () => {
      const f = panel.querySelector('#cs-new-client-form');
      if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
    });
    panel.querySelector('#cs-nc-cancel')?.addEventListener('click', () => {
      const f = panel.querySelector('#cs-new-client-form');
      if (f) f.style.display = 'none';
    });
    panel.querySelector('#cs-nc-save')?.addEventListener('click', () => this._saveNewClient(panel));

    // Frequency toggle
    const freqSel = panel.querySelector('#cs-freq');
    if (freqSel) {
      const toggle = () => {
        const isMonthly = freqSel.value === 'MENSUAL';
        const isCustom  = freqSel.value === 'PERSONALIZADO';
        panel.querySelector('#cs-dueday-wrap').style.display   = isMonthly ? '' : 'none';
        panel.querySelector('#cs-customdays-wrap').style.display = isCustom ? '' : 'none';
      };
      freqSel.addEventListener('change', () => { toggle(); this._recalculateSummary(panel); });
      toggle();
    }

    // Auto-recalculate on config change
    ['#cs-amort','#cs-interest','#cs-terms','#cs-freq','#cs-dueday','#cs-customdays','#cs-startdate'].forEach(sel => {
      panel.querySelector(sel)?.addEventListener('input', () => this._recalculateSummary(panel));
      panel.querySelector(sel)?.addEventListener('change', () => this._recalculateSummary(panel));
    });

    // Add stock item
    panel.querySelector('#cs-add-stock-btn')?.addEventListener('click', () => {
      const sel = panel.querySelector('#cs-product');
      if (!sel?.value) return;
      const p = this.state.products.find(x => x.id === sel.value);
      if (!p) return;
      if (this.state.selectedProducts.find(x => x.id === p.id)) { NotificationService.warning('El artículo ya fue añadido.'); return; }
      this.state.selectedProducts.push({ id: p.id, name: p.name, price: Number(p.price), quantity: 1, maxStock: Number(p.stock), isSpecial: false });
      this._renderItemsList(panel);
      sel.value = '';
    });

    // Add special order
    panel.querySelector('#cs-add-so-btn')?.addEventListener('click', () => {
      const nameEl  = panel.querySelector('#cs-so-name');
      const priceEl = panel.querySelector('#cs-so-price');
      const qtyEl   = panel.querySelector('#cs-so-qty');
      const name = nameEl?.value.trim();
      const price = Number(priceEl?.value);
      const qty   = Number(qtyEl?.value || 1);
      if (!name || price <= 0) { NotificationService.warning('Introduce nombre y precio válidos.'); return; }
      this.state.selectedProducts.push({ id: 'so-' + Date.now(), name: `[Especial] ${name}`, price, quantity: qty, maxStock: 9999, isSpecial: true });
      this._renderItemsList(panel);
      if (nameEl) nameEl.value = '';
      if (priceEl) priceEl.value = '';
      if (qtyEl)  qtyEl.value = '1';
    });

    // Preview schedule
    panel.querySelector('#cs-preview-schedule-btn')?.addEventListener('click', () => this._toggleSchedulePreview(panel));

    // Submit
    panel.querySelector('#cs-submit-btn')?.addEventListener('click', () => this._submitCredit(panel));
  }

  _saveNewClient(panel) {
    const name  = panel.querySelector('#cs-nc-name')?.value.trim();
    const phone = panel.querySelector('#cs-nc-phone')?.value.trim();
    const email = panel.querySelector('#cs-nc-email')?.value.trim();
    const idNum = panel.querySelector('#cs-nc-id')?.value.trim();
    const addr  = panel.querySelector('#cs-nc-address')?.value.trim();
    const refs  = panel.querySelector('#cs-nc-refs')?.value.trim();
    const limit = Number(panel.querySelector('#cs-nc-limit')?.value || 5000);
    if (!name || !phone) { NotificationService.warning('Nombre y teléfono son obligatorios.'); return; }
    FirestoreService.create('recurring_clients', { name, phone, email, clientIdNumber: idNum, address: addr, references: refs, creditLimit: limit, currentDebt: 0, status: 'ACTIVO', createdAt: Date.now() }).then(newId => {
      NotificationService.success('Cliente registrado.');
      const sel = panel.querySelector('#cs-client');
      if (sel) {
        const opt = document.createElement('option');
        opt.value = newId;
        opt.textContent = `${name} — Límite: ${this._fmt(limit)}`;
        opt.setAttribute('data-phone', phone);
        opt.setAttribute('data-email', email || '');
        opt.setAttribute('data-limit', limit);
        opt.setAttribute('data-debt', 0);
        opt.selected = true;
        sel.appendChild(opt);
        sel.dispatchEvent(new Event('change'));
      }
      panel.querySelector('#cs-new-client-form').style.display = 'none';
    }).catch(e => NotificationService.error('Error: ' + e.message));
  }

  _renderItemsList(panel) {
    const list = panel.querySelector('#cs-items-list');
    if (!list) return;
    if (!this.state.selectedProducts.length) {
      list.innerHTML = `<div class="text-center text-secondary py-4" style="font-size:0.8rem; border:1px dashed var(--color-border); border-radius:var(--radius-md);">Ningún artículo agregado</div>`;
      this._recalculateSummary(panel);
      return;
    }
    list.innerHTML = this.state.selectedProducts.map((p, i) => `
      <div class="card d-flex flex-row align-items-center gap-2 p-2 mb-2" style="background:var(--color-bg-secondary); font-size:0.8rem;">
        <div style="flex:1;">
          <strong>${p.name}</strong>
          <div class="text-secondary" style="font-size:0.7rem;">${this._fmt(p.price)} c/u</div>
        </div>
        <input type="number" class="input input-sm cs-qty" data-index="${i}" value="${p.quantity}" min="1" max="${p.maxStock}" style="width:55px; height:28px; padding:2px 6px;" />
        <span style="min-width:60px; text-align:right; font-weight:600;">${this._fmt(p.price * p.quantity)}</span>
        <button class="btn btn-danger btn-xs cs-remove-item" data-index="${i}" style="padding:4px 8px; height:28px;">🗑️</button>
      </div>
    `).join('');

    list.querySelectorAll('.cs-qty').forEach(inp => {
      inp.addEventListener('change', e => {
        const i = Number(e.target.getAttribute('data-index'));
        const v = Number(e.target.value);
        const max = this.state.selectedProducts[i].maxStock;
        if (v > max) { NotificationService.warning(`Stock máx: ${max}`); e.target.value = max; this.state.selectedProducts[i].quantity = max; }
        else this.state.selectedProducts[i].quantity = v;
        this._renderItemsList(panel);
      });
    });
    list.querySelectorAll('.cs-remove-item').forEach(btn => {
      btn.addEventListener('click', e => {
        this.state.selectedProducts.splice(Number(e.target.getAttribute('data-index')), 1);
        this._renderItemsList(panel);
      });
    });
    this._recalculateSummary(panel);
  }

  _recalculateSummary(panel) {
    const principal = this.state.selectedProducts.reduce((a, p) => a + p.price * p.quantity, 0);
    const rate    = Number(panel.querySelector('#cs-interest')?.value || 10);
    const terms   = Number(panel.querySelector('#cs-terms')?.value || 6);
    const amort   = panel.querySelector('#cs-amort')?.value || 'CON_AMORTIZACION';
    const { installment, totalWithInterest, totalInterest } = CreditService.calculateCreditTotals(principal, rate, terms, amort);
    if (panel.querySelector('#cs-lbl-sub'))    panel.querySelector('#cs-lbl-sub').textContent    = this._fmt(principal);
    if (panel.querySelector('#cs-lbl-int'))    panel.querySelector('#cs-lbl-int').textContent    = this._fmt(totalInterest);
    if (panel.querySelector('#cs-lbl-total'))  panel.querySelector('#cs-lbl-total').textContent  = this._fmt(totalWithInterest);
    if (panel.querySelector('#cs-lbl-installment')) panel.querySelector('#cs-lbl-installment').textContent = this._fmt(installment);
  }

  _toggleSchedulePreview(panel) {
    const preview = panel.querySelector('#cs-schedule-preview');
    if (!preview) return;
    if (preview.style.display !== 'none') { preview.style.display = 'none'; return; }

    const principal = this.state.selectedProducts.reduce((a, p) => a + p.price * p.quantity, 0);
    if (principal <= 0) { NotificationService.warning('Agrega artículos primero.'); return; }

    const startDateVal = panel.querySelector('#cs-startdate')?.value;
    const startDate = startDateVal ? new Date(startDateVal + 'T12:00:00').getTime() : Date.now();
    const schedule = CreditService.generateInstallmentSchedule({
      principal,
      interestRate: Number(panel.querySelector('#cs-interest')?.value || 10),
      terms:        Number(panel.querySelector('#cs-terms')?.value || 6),
      frequency:    panel.querySelector('#cs-freq')?.value || 'MENSUAL',
      startDate,
      amortizationType: panel.querySelector('#cs-amort')?.value || 'CON_AMORTIZACION',
      dueDay:     Number(panel.querySelector('#cs-dueday')?.value || 15),
      customDays: Number(panel.querySelector('#cs-customdays')?.value || 30),
    });

    preview.style.display = 'block';
    preview.innerHTML = `
      <h5 class="text-xs font-bold mb-2">Calendario de Cuotas</h5>
      <div style="overflow-x:auto;">
        <table class="table-credit" style="width:100%; font-size:0.72rem; border-collapse:collapse;">
          <thead><tr style="background:var(--color-bg-tertiary);">
            <th class="tc">#</th><th>Fecha Vencimiento</th><th class="tr">Capital</th><th class="tr">Interés</th><th class="tr">Cuota</th><th class="tr">Saldo</th>
          </tr></thead>
          <tbody>
            ${schedule.map(s => `<tr style="border-bottom:1px solid var(--color-border);">
              <td class="tc" style="padding:5px;">${s.period}</td>
              <td style="padding:5px;">${s.dueDateLabel}</td>
              <td class="tr" style="padding:5px;">${this._fmt(s.principalPortion)}</td>
              <td class="tr" style="padding:5px;">${this._fmt(s.interestPortion)}</td>
              <td class="tr" style="padding:5px;"><strong>${this._fmt(s.amount)}</strong></td>
              <td class="tr" style="padding:5px;">${this._fmt(s.balanceAfter)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async _submitCredit(panel) {
    const clientId = panel.querySelector('#cs-client')?.value;
    if (!clientId) { NotificationService.warning('Selecciona un cliente.'); return; }
    if (!this.state.selectedProducts.length) { NotificationService.warning('Agrega al menos un artículo.'); return; }

    const client = this.state.clients.find(c => c.id === clientId);
    const principal = this.state.selectedProducts.reduce((a, p) => a + p.price * p.quantity, 0);
    const limit = Number(client?.creditLimit || 5000);
    const debt  = Number(client?.currentDebt || 0);
    if (debt + principal > limit) {
      if (!confirm(`⚠️ El monto ($${principal.toFixed(2)}) + deuda actual ($${debt.toFixed(2)}) supera el límite ($${limit}).\n¿Autorizar de todos modos?`)) return;
    }

    const startDateVal = panel.querySelector('#cs-startdate')?.value;
    const startDate = startDateVal ? new Date(startDateVal + 'T12:00:00').getTime() : Date.now();

    const btn = panel.querySelector('#cs-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Procesando...'; }

    try {
      const { creditId, payload } = await CreditService.createCredit(this.companyId, {
        clientId,
        clientName:       client?.name || '',
        clientPhone:      client?.phone || '',
        clientEmail:      client?.email || '',
        clientAddress:    client?.address || '',
        clientIdNumber:   client?.clientIdNumber || '',
        clientReferences: client?.references || '',
        items:    this.state.selectedProducts,
        principal,
        interestRate: Number(panel.querySelector('#cs-interest')?.value || 10),
        terms:        Number(panel.querySelector('#cs-terms')?.value || 6),
        frequency:    panel.querySelector('#cs-freq')?.value || 'MENSUAL',
        startDate,
        amortizationType: panel.querySelector('#cs-amort')?.value || 'CON_AMORTIZACION',
        dueDay:     Number(panel.querySelector('#cs-dueday')?.value || 15),
        customDays: Number(panel.querySelector('#cs-customdays')?.value || 30),
        paymentMethod:  panel.querySelector('#cs-paymethod')?.value || 'EFECTIVO',
        sendEmail:      panel.querySelector('#cs-send-email')?.checked || false,
      });

      // Deduct inventory
      for (const p of this.state.selectedProducts) {
        if (!p.isSpecial) {
          const prod = this.state.products.find(x => x.id === p.id);
          if (prod) await FirestoreService.update('productos', p.id, { stock: Math.max(0, Number(prod.stock) - p.quantity) });
        }
      }

      // Update client debt
      await FirestoreService.update('recurring_clients', clientId, { currentDebt: debt + principal });

      // Email simulation
      if (panel.querySelector('#cs-send-email')?.checked && client?.email) {
        setTimeout(() => NotificationService.info(`📧 Contrato de crédito enviado a ${client.email}`), 1500);
      }

      NotificationService.success('✅ Crédito generado correctamente.');

      // Print document
      const fullCredit = { ...payload, id: creditId };
      setTimeout(() => {
        if (confirm('¿Deseas imprimir o guardar el documento de crédito como PDF ahora?')) {
          CreditService.printCreditDocument(fullCredit, this.companyName);
        }
      }, 800);

      // Reset form
      this.state.selectedProducts = [];
      this._renderItemsList(panel);
      if (panel.querySelector('#cs-client')) panel.querySelector('#cs-client').value = '';
      if (panel.querySelector('#cs-client-preview')) panel.querySelector('#cs-client-preview').style.display = 'none';
      this._recalculateSummary(panel);

    } catch(e) {
      console.error('[CreditSystemView] Submit error:', e);
      NotificationService.error('Error al generar el crédito: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Generar Crédito y Documento'; }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // TAB 2 — CARTERA ACTIVA Y ABONOS
  // ══════════════════════════════════════════════════════════════════════════════
  _renderPortfolioTab(el) {
    const panel = el.querySelector('#tab-portfolio');
    if (!panel) return;

    const active   = this.state.credits.filter(c => c.status !== 'PAGADO');
    const overdue  = active.filter(c => c.status === 'VENCIDO');
    const portfolio = active.reduce((a, c) => a + Number(c.remainingAmount || 0), 0);
    const thisMonth = (() => {
      const now = new Date(); const m = now.getMonth(); const y = now.getFullYear();
      return (this.state.payments || []).filter(p => {
        const d = new Date(p.createdAt || 0); return d.getMonth() === m && d.getFullYear() === y;
      }).reduce((a, p) => a + Number(p.amount || 0), 0);
    })();

    // Overdue alert
    const overdueAlert = overdue.length ? `
      <div class="card p-3 mb-4" style="border-left:4px solid var(--color-danger); background:rgba(239,68,68,0.05);">
        <strong style="color:var(--color-danger);">⚠️ ${overdue.length} crédito(s) vencido(s)</strong> — Se ha aplicado mora automática del 5%.
        <button id="btn-apply-mora-batch" class="btn btn-danger btn-xs ml-3" style="margin-left:12px;">Aplicar mora en lote ahora</button>
      </div>` : '';

    panel.innerHTML = `
      <!-- KPIs -->
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:var(--space-3); margin-bottom:var(--space-4);">
        ${[
          ['Cartera Activa', this._fmt(portfolio), 'var(--color-accent)'],
          ['Créditos Vigentes', active.length, 'var(--color-success)'],
          ['Créditos Vencidos', overdue.length, 'var(--color-danger)'],
          ['Cobrado este Mes', this._fmt(thisMonth), 'var(--color-warning)'],
        ].map(([label, val, col]) => `
          <div class="card p-4">
            <span class="text-xs text-secondary">${label}</span>
            <h3 class="text-xl font-bold mt-1" style="color:${col};">${val}</h3>
          </div>`).join('')}
      </div>

      ${overdueAlert}

      <!-- Filter + Table -->
      <div class="card p-4">
        <div class="d-flex align-items-center gap-3 mb-3">
          <h4 class="font-semibold text-primary" style="flex:1;">Créditos</h4>
          <select id="cs-filter" class="input input-sm" style="width:160px; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-2); color:var(--color-text-primary);">
            <option value="ALL">Todos</option>
            <option value="VIGENTE">Vigentes</option>
            <option value="VENCIDO">Vencidos</option>
            <option value="PAGADO">Pagados</option>
          </select>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
            <thead><tr style="background:var(--color-bg-tertiary); text-align:left;">
              <th class="th">Cliente</th><th class="th">Tipo</th><th class="th">Monto</th><th class="th">Saldo</th><th class="th">Próxima Cuota</th><th class="th">Estado</th><th class="th">Acciones</th>
            </tr></thead>
            <tbody id="cs-portfolio-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    this._renderPortfolioRows(panel, 'ALL');

    panel.querySelector('#cs-filter')?.addEventListener('change', e => this._renderPortfolioRows(panel, e.target.value));
    panel.querySelector('#btn-apply-mora-batch')?.addEventListener('click', () => {
      CreditService.checkAndAutoApplyLateFees(this.companyId).then(n => NotificationService.success(`Mora aplicada a ${n} crédito(s).`));
    });

    panel.addEventListener('click', async e => {
      const id = e.target.closest('[data-cid]')?.getAttribute('data-cid');
      if (!id) return;
      const credit = this.state.credits.find(c => c.id === id);
      if (!credit) return;

      if (e.target.closest('.cs-btn-abono'))        this._openAbonoModal(credit);
      if (e.target.closest('.cs-btn-mora'))          this._applyMora(credit);
      if (e.target.closest('.cs-btn-schedule'))      this._openScheduleModal(credit);
      if (e.target.closest('.cs-btn-restructure'))   this._openRestructureModal(credit);
      if (e.target.closest('.cs-btn-pdf'))           CreditService.printCreditDocument(credit, this.companyName);
    });
  }

  _renderPortfolioRows(panel, filter) {
    const tbody = panel.querySelector('#cs-portfolio-tbody');
    if (!tbody) return;
    const credits = filter === 'ALL' ? this.state.credits : this.state.credits.filter(c => c.status === filter);
    if (!credits.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-secondary" style="padding:20px;">Sin créditos en esta categoría.</td></tr>`;
      return;
    }
    tbody.innerHTML = credits.map(c => {
      const nextInst = (c.schedule || []).find(s => s.status === 'PENDIENTE' || s.status === 'VENCIDA');
      return `<tr style="border-bottom:1px solid var(--color-border);" data-cid="${c.id}">
        <td style="padding:10px 8px;"><strong>${c.clientName}</strong><div class="text-secondary" style="font-size:0.7rem;">${c.clientPhone || ''}</div></td>
        <td style="padding:10px 8px;">${c.amortizationType === 'CON_AMORTIZACION' ? '📉 Amortizable' : '🔒 Interés Fijo'}</td>
        <td style="padding:10px 8px;">${this._fmt(c.initialAmount)}</td>
        <td style="padding:10px 8px;"><strong style="color:${Number(c.remainingAmount) > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${this._fmt(c.remainingAmount)}</strong></td>
        <td style="padding:10px 8px;">${nextInst ? `${this._fmt(nextInst.amount)}<div class="text-secondary" style="font-size:0.7rem;">${this._fmtDate(nextInst.dueDate)}</div>` : '—'}</td>
        <td style="padding:10px 8px;">${this._statusBadge(c.status)}</td>
        <td style="padding:10px 8px;">
          <div class="d-flex gap-1 flex-wrap">
            ${c.status !== 'PAGADO' ? `
              <button class="btn btn-primary btn-xs cs-btn-abono" data-cid="${c.id}" style="padding:2px 6px; font-size:0.7rem;" title="Registrar abono">💵 Abonar</button>
              <button class="btn btn-warning btn-xs cs-btn-mora" data-cid="${c.id}" style="padding:2px 6px; font-size:0.7rem;" title="Aplicar mora 5%">⚠️ Mora</button>
              <button class="btn btn-secondary btn-xs cs-btn-restructure" data-cid="${c.id}" style="padding:2px 6px; font-size:0.7rem;" title="Reestructurar">🔄 Reest.</button>
            ` : ''}
            <button class="btn btn-secondary btn-xs cs-btn-schedule" data-cid="${c.id}" style="padding:2px 6px; font-size:0.7rem;" title="Ver calendario">📅 Cal.</button>
            <button class="btn btn-secondary btn-xs cs-btn-pdf" data-cid="${c.id}" style="padding:2px 6px; font-size:0.7rem;" title="Imprimir PDF">📄 PDF</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  _openAbonoModal(credit) {
    const remaining = Number(credit.remainingAmount || 0);
    const nextInst  = (credit.schedule || []).find(s => s.status === 'PENDIENTE' || s.status === 'VENCIDA' || s.status === 'PARCIAL');

    const body = `
      <div class="d-flex flex-column gap-3" style="color:var(--color-text-primary);">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
          <div><label class="form-label">Cliente</label><input class="input input-md" value="${credit.clientName}" readonly style="opacity:.75;" /></div>
          <div><label class="form-label">Saldo Pendiente</label><input class="input input-md" value="${this._fmt(remaining)}" readonly style="opacity:.75; font-weight:bold; color:var(--color-danger);" /></div>
          <div><label class="form-label">Cuota Sugerida</label><input class="input input-md" value="${this._fmt(credit.installmentAmount)}" readonly style="opacity:.75;" /></div>
          <div><label class="form-label">Próxima Fecha</label><input class="input input-md" value="${nextInst ? this._fmtDate(nextInst.dueDate) : '—'}" readonly style="opacity:.75;" /></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
          <div class="form-group"><label class="form-label" for="ab-amount">Monto del Abono ($)</label>
            <input type="number" id="ab-amount" class="input input-md" min="1" max="${remaining}" value="${Math.min(remaining, credit.installmentAmount || remaining)}" />
          </div>
          <div class="form-group"><label class="form-label" for="ab-method">Método de Pago</label>
            <select id="ab-method" class="input input-md" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-3); color:var(--color-text-primary);">
              <option>EFECTIVO</option><option>TRANSFERENCIA</option><option>TARJETA</option>
            </select>
          </div>
        </div>
      </div>`;

    this.modalInstance = new Modal({ title: '💵 Registrar Abono', bodyHTML: body,
      footerHTML: `<button class="btn btn-secondary btn-sm" id="m-cancel">Cancelar</button><button class="btn btn-primary btn-sm" id="m-confirm">✅ Registrar</button>`, size: 'md' });
    document.body.appendChild(this.modalInstance.mount());

    this.modalInstance.$('#m-cancel')?.addEventListener('click', () => this.modalInstance.close());
    this.modalInstance.$('#m-confirm')?.addEventListener('click', async () => {
      const amount = Number(this.modalInstance.$('#ab-amount')?.value);
      const method = this.modalInstance.$('#ab-method')?.value;
      if (!amount || amount <= 0 || amount > remaining) { NotificationService.warning('Monto inválido.'); return; }
      try {
        const { isPaidOff } = await CreditService.recordPayment(this.companyId, credit.id, credit, amount, method);
        if (isPaidOff) NotificationService.success('🎉 Crédito liquidado completamente.');
        else NotificationService.success(`Abono de ${this._fmt(amount)} registrado.`);
        this.modalInstance.close();
      } catch(e) { NotificationService.error('Error: ' + e.message); }
    });
  }

  async _applyMora(credit) {
    if (!confirm(`¿Aplicar mora del 5% a ${credit.clientName}?\nSaldo actual: ${this._fmt(credit.remainingAmount)}\nSe añadirá: ${this._fmt(Number(credit.remainingAmount) * 0.05)}`)) return;
    try {
      const result = await CreditService.applyLateFee(this.companyId, credit.id, credit);
      NotificationService.warning(`Mora de ${this._fmt(result.moraAmount)} aplicada. Nuevo saldo: ${this._fmt(result.newRemaining)}`);
    } catch(e) { NotificationService.error('Error: ' + e.message); }
  }

  _openScheduleModal(credit) {
    const rows = (credit.schedule || []).map(s => {
      const statusColors = { PAGADA:'var(--color-success)', VENCIDA:'var(--color-danger)', PARCIAL:'var(--color-warning)', PENDIENTE:'var(--color-text-secondary)' };
      const icons = { PAGADA:'✅', VENCIDA:'🔴', PARCIAL:'🟡', PENDIENTE:'⚪' };
      const col = statusColors[s.status] || 'var(--color-text-secondary)';
      return `<tr style="border-bottom:1px solid var(--color-border);">
        <td style="padding:6px 8px; text-align:center;">${s.period}</td>
        <td style="padding:6px 8px;">${s.dueDateLabel || this._fmtDate(s.dueDate)}</td>
        <td style="padding:6px 8px; text-align:right;">${this._fmt(s.principalPortion)}</td>
        <td style="padding:6px 8px; text-align:right;">${this._fmt(s.interestPortion)}</td>
        <td style="padding:6px 8px; text-align:right;"><strong>${this._fmt(s.amount)}</strong></td>
        <td style="padding:6px 8px; text-align:center; color:${col};">${icons[s.status] || '⚪'} ${s.status}</td>
        <td style="padding:6px 8px; text-align:right;">${s.paidAmount > 0 ? this._fmt(s.paidAmount) : '—'}</td>
      </tr>`;
    }).join('');

    const body = `
      <div style="max-height:70vh; overflow-y:auto;">
        <div class="d-flex gap-3 mb-3 flex-wrap" style="font-size:0.8rem;">
          <div class="card p-3" style="flex:1;"><span class="text-secondary">Saldo Restante</span><br/><strong style="color:var(--color-danger);">${this._fmt(credit.remainingAmount)}</strong></div>
          <div class="card p-3" style="flex:1;"><span class="text-secondary">Cuota por Período</span><br/><strong>${this._fmt(credit.installmentAmount)}</strong></div>
          <div class="card p-3" style="flex:1;"><span class="text-secondary">Estado</span><br/>${this._statusBadge(credit.status)}</div>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
          <thead><tr style="background:var(--color-bg-tertiary);">
            <th style="padding:8px; text-align:center;">#</th>
            <th style="padding:8px;">Fecha</th>
            <th style="padding:8px; text-align:right;">Capital</th>
            <th style="padding:8px; text-align:right;">Interés</th>
            <th style="padding:8px; text-align:right;">Cuota</th>
            <th style="padding:8px; text-align:center;">Estado</th>
            <th style="padding:8px; text-align:right;">Pagado</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    this.modalInstance = new Modal({ title: `📅 Calendario — ${credit.clientName}`, bodyHTML: body,
      footerHTML: `<button class="btn btn-secondary btn-sm" id="m-close">Cerrar</button><button class="btn btn-primary btn-sm" id="m-pdf">📄 PDF</button>`, size: 'xl' });
    document.body.appendChild(this.modalInstance.mount());
    this.modalInstance.$('#m-close')?.addEventListener('click', () => this.modalInstance.close());
    this.modalInstance.$('#m-pdf')?.addEventListener('click', () => CreditService.printCreditDocument(credit, this.companyName));
  }

  _openRestructureModal(credit) {
    const body = `
      <div class="d-flex flex-column gap-3" style="color:var(--color-text-primary);">
        <p style="font-size:0.875rem; color:var(--color-text-secondary);">Saldo actual a reestructurar: <strong style="color:var(--color-danger);">${this._fmt(credit.remainingAmount)}</strong></p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
          <div class="form-group"><label class="form-label" for="rs-rate">Nuevo Interés (%)</label><input type="number" id="rs-rate" class="input input-md" value="${credit.interestRate || 10}" min="0" step="0.5" /></div>
          <div class="form-group"><label class="form-label" for="rs-periods">Nuevas Cuotas</label><input type="number" id="rs-periods" class="input input-md" value="${credit.termPeriods || 6}" min="1" /></div>
          <div class="form-group"><label class="form-label" for="rs-freq">Frecuencia</label>
            <select id="rs-freq" class="input input-md" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-3); color:var(--color-text-primary);">
              <option value="MENSUAL" ${credit.paymentFrequency === 'MENSUAL' ? 'selected' : ''}>Mensual</option>
              <option value="QUINCENAL" ${credit.paymentFrequency === 'QUINCENAL' ? 'selected' : ''}>Quincenal</option>
              <option value="SEMANAL" ${credit.paymentFrequency === 'SEMANAL' ? 'selected' : ''}>Semanal</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label" for="rs-dueday">Día de Cobro</label><input type="number" id="rs-dueday" class="input input-md" value="${credit.dueDay || 15}" min="1" max="28" /></div>
        </div>
        <div class="form-group"><label class="form-label" for="rs-reason">Motivo de Reestructuración</label><textarea id="rs-reason" class="input input-sm" rows="2" placeholder="Ej: Dificultad económica del cliente, acuerdo de pago..."></textarea></div>
      </div>`;

    this.modalInstance = new Modal({ title: `🔄 Reestructurar Crédito — ${credit.clientName}`, bodyHTML: body,
      footerHTML: `<button class="btn btn-secondary btn-sm" id="m-cancel">Cancelar</button><button class="btn btn-warning btn-sm" id="m-confirm">🔄 Aplicar Reestructura</button>`, size: 'md' });
    document.body.appendChild(this.modalInstance.mount());
    this.modalInstance.$('#m-cancel')?.addEventListener('click', () => this.modalInstance.close());
    this.modalInstance.$('#m-confirm')?.addEventListener('click', async () => {
      try {
        await CreditService.restructureCredit(this.companyId, credit.id, credit, {
          newRate:    Number(this.modalInstance.$('#rs-rate')?.value || 10),
          newPeriods: Number(this.modalInstance.$('#rs-periods')?.value || 6),
          newFrequency: this.modalInstance.$('#rs-freq')?.value,
          newDueDay:  Number(this.modalInstance.$('#rs-dueday')?.value || 15),
          reason:     this.modalInstance.$('#rs-reason')?.value || '',
        });
        NotificationService.success('Crédito reestructurado exitosamente.');
        this.modalInstance.close();
      } catch(e) { NotificationService.error('Error: ' + e.message); }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // TAB 3 — CALENDARIO
  // ══════════════════════════════════════════════════════════════════════════════
  _renderCalendarTab(el) {
    const panel = el.querySelector('#tab-calendar');
    if (!panel) return;
    const activeCredits = this.state.credits.filter(c => c.status !== 'PAGADO');

    panel.innerHTML = `
      <div class="card p-4">
        <div class="d-flex align-items-center gap-3 mb-4">
          <h4 class="font-semibold text-primary" style="flex:1;">📅 Calendario de Cuotas por Crédito</h4>
          <select id="cs-cal-select" class="input input-sm" style="width:260px; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-2); color:var(--color-text-primary);">
            <option value="">— Seleccionar crédito —</option>
            ${activeCredits.map(c => `<option value="${c.id}">${c.clientName} — Saldo: ${this._fmt(c.remainingAmount)}</option>`).join('')}
          </select>
          <button id="cs-cal-pdf-btn" class="btn btn-secondary btn-sm">📄 PDF</button>
        </div>
        <div id="cs-calendar-detail" class="text-center text-secondary py-8" style="padding:40px; font-size:0.875rem;">Selecciona un crédito para ver su calendario.</div>
      </div>
      <div class="card p-4 mt-4">
        <h4 class="font-semibold text-primary mb-3">📋 Próximos Cobros (todos los créditos)</h4>
        ${this._renderUpcomingPayments()}
      </div>`;

    panel.querySelector('#cs-cal-select')?.addEventListener('change', e => {
      const credit = this.state.credits.find(c => c.id === e.target.value);
      const detail = panel.querySelector('#cs-calendar-detail');
      if (!detail) return;
      if (!credit) { detail.innerHTML = `<p class="text-secondary">Selecciona un crédito para ver su calendario.</p>`; return; }
      detail.innerHTML = this._renderScheduleTable(credit);
    });

    panel.querySelector('#cs-cal-pdf-btn')?.addEventListener('click', () => {
      const sel = panel.querySelector('#cs-cal-select');
      const credit = this.state.credits.find(c => c.id === sel?.value);
      if (!credit) { NotificationService.warning('Selecciona un crédito.'); return; }
      CreditService.printCreditDocument(credit, this.companyName);
    });
  }

  _renderScheduleTable(credit) {
    const now = Date.now();
    const statusIcons = { PAGADA:'✅', VENCIDA:'🔴', PARCIAL:'🟡', PENDIENTE:'⚪' };
    const statusColors = { PAGADA:'rgba(52,211,153,0.1)', VENCIDA:'rgba(239,68,68,0.1)', PARCIAL:'rgba(245,158,11,0.1)', PENDIENTE:'transparent' };

    const rows = (credit.schedule || []).map(s => {
      const isDue = s.status === 'PENDIENTE' && s.dueDate - now <= 86400000 * 3 && s.dueDate >= now;
      return `<tr style="border-bottom:1px solid var(--color-border); background:${statusColors[s.status] || 'transparent'};">
        <td style="padding:8px; text-align:center;">${s.period}</td>
        <td style="padding:8px;">${s.dueDateLabel || this._fmtDate(s.dueDate)}${isDue ? ' <span style="color:var(--color-warning); font-size:0.7rem;">⏰ PRÓXIMO</span>' : ''}</td>
        <td style="padding:8px; text-align:right;">${this._fmt(s.principalPortion)}</td>
        <td style="padding:8px; text-align:right;">${this._fmt(s.interestPortion)}</td>
        <td style="padding:8px; text-align:right;"><strong>${this._fmt(s.amount)}</strong></td>
        <td style="padding:8px; text-align:right;">${this._fmt(s.balanceAfter)}</td>
        <td style="padding:8px; text-align:center;">${statusIcons[s.status] || '⚪'} ${s.status}</td>
        <td style="padding:8px; text-align:right;">${s.paidAmount > 0 ? `<strong style="color:var(--color-success);">${this._fmt(s.paidAmount)}</strong>` : '—'}</td>
      </tr>`;
    }).join('');

    return `
      <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
        <thead><tr style="background:var(--color-bg-tertiary);">
          <th style="padding:8px; text-align:center;">#</th>
          <th style="padding:8px;">Fecha</th>
          <th style="padding:8px; text-align:right;">Capital</th>
          <th style="padding:8px; text-align:right;">Interés</th>
          <th style="padding:8px; text-align:right;">Cuota</th>
          <th style="padding:8px; text-align:right;">Saldo</th>
          <th style="padding:8px; text-align:center;">Estado</th>
          <th style="padding:8px; text-align:right;">Pagado</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  _renderUpcomingPayments() {
    const now = Date.now();
    const upcoming = [];
    this.state.credits.filter(c => c.status !== 'PAGADO').forEach(c => {
      (c.schedule || []).forEach(s => {
        if ((s.status === 'PENDIENTE' || s.status === 'PARCIAL') && s.dueDate > now - 86400000) {
          upcoming.push({ clientName: c.clientName, ...s, creditId: c.id });
        }
      });
    });
    upcoming.sort((a, b) => a.dueDate - b.dueDate);
    const rows = upcoming.slice(0, 20).map(s => {
      const daysLeft = Math.ceil((s.dueDate - now) / 86400000);
      const urgency = daysLeft < 0 ? 'var(--color-danger)' : daysLeft <= 3 ? 'var(--color-warning)' : 'var(--color-text-secondary)';
      return `<tr style="border-bottom:1px solid var(--color-border);">
        <td style="padding:8px;">${s.clientName}</td>
        <td style="padding:8px;">${this._fmtDate(s.dueDate)}</td>
        <td style="padding:8px; text-align:right;"><strong>${this._fmt(s.amount)}</strong></td>
        <td style="padding:8px; text-align:center; color:${urgency}; font-weight:600;">${daysLeft < 0 ? `${Math.abs(daysLeft)}d vencida` : daysLeft === 0 ? 'Hoy' : `${daysLeft} días`}</td>
      </tr>`;
    }).join('');
    if (!rows) return `<p class="text-secondary text-center py-4">Sin próximos cobros.</p>`;
    return `<table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
      <thead><tr style="background:var(--color-bg-tertiary);">
        <th style="padding:8px;">Cliente</th><th style="padding:8px;">Fecha</th><th style="padding:8px; text-align:right;">Cuota</th><th style="padding:8px; text-align:center;">Estado</th>
      </tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // TAB 4 — REPORTES
  // ══════════════════════════════════════════════════════════════════════════════
  _renderReportsTab(el) {
    const panel = el.querySelector('#tab-reports');
    if (!panel) return;
    const all     = this.state.credits;
    const active  = all.filter(c => c.status !== 'PAGADO');
    const overdue = all.filter(c => c.status === 'VENCIDO');
    const paid    = all.filter(c => c.status === 'PAGADO');
    const portfolio    = active.reduce((a, c) => a + Number(c.remainingAmount || 0), 0);
    const overdueTotal = overdue.reduce((a, c) => a + Number(c.remainingAmount || 0), 0);
    const paidTotal    = paid.reduce((a, c) => a + Number(c.totalWithInterest || c.initialAmount || 0), 0);
    const recovery  = portfolio + paidTotal > 0 ? ((paidTotal / (portfolio + paidTotal)) * 100).toFixed(1) : '0.0';
    const morosidad = portfolio > 0 ? ((overdueTotal / portfolio) * 100).toFixed(1) : '0.0';

    panel.innerHTML = `
      <!-- Metrics -->
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:var(--space-3); margin-bottom:var(--space-4);">
        ${[
          ['Tasa de Recuperación', `${recovery}%`, 'var(--color-success)'],
          ['Índice de Morosidad',  `${morosidad}%`, 'var(--color-danger)'],
          ['Total Créditos Liquidados', paid.length, 'var(--color-accent)'],
        ].map(([l,v,c]) => `<div class="card p-4"><span class="text-xs text-secondary">${l}</span><h3 class="text-xl font-bold mt-1" style="color:${c};">${v}</h3></div>`).join('')}
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
        <!-- Clients at risk -->
        <div class="card p-4">
          <h4 class="font-semibold mb-3">🔴 Clientes Morosos / Vencidos</h4>
          ${overdue.length ? `<table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
            <thead><tr style="background:var(--color-bg-tertiary);">
              <th style="padding:6px;">Cliente</th><th style="padding:6px; text-align:right;">Saldo Vencido</th>
            </tr></thead>
            <tbody>
              ${overdue.map(c => `<tr style="border-bottom:1px solid var(--color-border);">
                <td style="padding:6px;">${c.clientName}</td>
                <td style="padding:6px; text-align:right; color:var(--color-danger); font-weight:bold;">${this._fmt(c.remainingAmount)}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : `<p class="text-secondary text-center py-4">✅ Sin clientes morosos.</p>`}
        </div>
        <!-- Current clients -->
        <div class="card p-4">
          <h4 class="font-semibold mb-3">✅ Clientes al Día (Vigentes)</h4>
          ${active.filter(c => c.status === 'VIGENTE').length ? `<table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
            <thead><tr style="background:var(--color-bg-tertiary);">
              <th style="padding:6px;">Cliente</th><th style="padding:6px; text-align:right;">Saldo</th>
            </tr></thead>
            <tbody>
              ${active.filter(c => c.status === 'VIGENTE').map(c => `<tr style="border-bottom:1px solid var(--color-border);">
                <td style="padding:6px;">${c.clientName}</td>
                <td style="padding:6px; text-align:right; font-weight:bold;">${this._fmt(c.remainingAmount)}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : `<p class="text-secondary text-center py-4">Sin créditos vigentes.</p>`}
        </div>
      </div>

      <!-- Full list -->
      <div class="card p-4 mt-4">
        <div class="d-flex align-items-center mb-3">
          <h4 class="font-semibold text-primary" style="flex:1;">📋 Cartera Completa</h4>
          <button id="cs-export-csv-btn" class="btn btn-secondary btn-sm">📥 Exportar CSV</button>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
          <thead><tr style="background:var(--color-bg-tertiary);">
            <th style="padding:8px;">Cliente</th><th style="padding:8px;">Tipo</th><th style="padding:8px; text-align:right;">Inicial</th>
            <th style="padding:8px; text-align:right;">Restante</th><th style="padding:8px; text-align:center;">Estado</th>
          </tr></thead>
          <tbody>
            ${all.map(c => `<tr style="border-bottom:1px solid var(--color-border);">
              <td style="padding:8px;">${c.clientName}</td>
              <td style="padding:8px; font-size:0.7rem;">${c.amortizationType === 'CON_AMORTIZACION' ? 'Amortizable' : 'Interés Fijo'}</td>
              <td style="padding:8px; text-align:right;">${this._fmt(c.initialAmount)}</td>
              <td style="padding:8px; text-align:right; font-weight:bold; color:${Number(c.remainingAmount) > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${this._fmt(c.remainingAmount)}</td>
              <td style="padding:8px; text-align:center;">${this._statusBadge(c.status)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    panel.querySelector('#cs-export-csv-btn')?.addEventListener('click', () => this._exportCSV());
  }

  _exportCSV() {
    const headers = ['Cliente','Teléfono','Tipo','Monto Inicial','Saldo Restante','Cuota','Frecuencia','Estado'];
    const rows = this.state.credits.map(c => [
      c.clientName, c.clientPhone || '',
      c.amortizationType === 'CON_AMORTIZACION' ? 'Amortizable' : 'Interés Fijo',
      c.initialAmount, c.remainingAmount, c.installmentAmount, c.paymentFrequency, c.status
    ]);
    const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `cartera-creditos-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // TAB 5 — HISTORIAL
  // ══════════════════════════════════════════════════════════════════════════════
  _renderHistoryTab(el) {
    const panel = el.querySelector('#tab-history');
    if (!panel) return;

    const payments = [...(this.state.payments || [])].sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    const moras    = [...(this.state.moraLogs || [])].sort((a,b) => (b.appliedAt||0) - (a.appliedAt||0));

    const payRows = payments.slice(0, 50).map(p => `
      <tr style="border-bottom:1px solid var(--color-border);">
        <td style="padding:8px; color:var(--color-success);">💵 Abono</td>
        <td style="padding:8px;">${p.clientName}</td>
        <td style="padding:8px; text-align:right; font-weight:bold; color:var(--color-success);">+${this._fmt(p.amount)}</td>
        <td style="padding:8px; font-size:0.7rem;">${p.paymentMethod || '—'}</td>
        <td style="padding:8px;">${this._fmtDate(p.createdAt)}</td>
      </tr>`).join('');

    const moraRows = moras.slice(0, 30).map(m => `
      <tr style="border-bottom:1px solid var(--color-border);">
        <td style="padding:8px; color:var(--color-danger);">⚠️ Mora</td>
        <td style="padding:8px;">${m.clientName}</td>
        <td style="padding:8px; text-align:right; font-weight:bold; color:var(--color-danger);">+${this._fmt(m.moraAmount)}</td>
        <td style="padding:8px; font-size:0.7rem;">5% sobre ${this._fmt(m.remainingBefore)}</td>
        <td style="padding:8px;">${this._fmtDate(m.appliedAt)}</td>
      </tr>`).join('');

    const allRows = [...(payments.slice(0,50).map(p => ({ ...p, _type:'ABONO', _ts: p.createdAt }))),
                     ...(moras.slice(0,30).map(m => ({ ...m, _type:'MORA', _ts: m.appliedAt })))]
      .sort((a,b) => (b._ts||0) - (a._ts||0));

    panel.innerHTML = `
      <div class="card p-4">
        <h4 class="font-semibold text-primary mb-3">📜 Bitácora de Movimientos</h4>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
            <thead><tr style="background:var(--color-bg-tertiary);">
              <th style="padding:8px;">Tipo</th><th style="padding:8px;">Cliente</th>
              <th style="padding:8px; text-align:right;">Monto</th>
              <th style="padding:8px;">Detalle</th><th style="padding:8px;">Fecha</th>
            </tr></thead>
            <tbody>
              ${allRows.map(r => {
                if (r._type === 'ABONO') return `<tr style="border-bottom:1px solid var(--color-border);">
                  <td style="padding:8px;"><span style="color:var(--color-success);">💵 Abono</span></td>
                  <td style="padding:8px;">${r.clientName}</td>
                  <td style="padding:8px; text-align:right; color:var(--color-success); font-weight:bold;">+${this._fmt(r.amount)}</td>
                  <td style="padding:8px; font-size:0.7rem;">${r.paymentMethod || '—'} · Cuota ${r.period}</td>
                  <td style="padding:8px;">${this._fmtDate(r.createdAt)}</td></tr>`;
                return `<tr style="border-bottom:1px solid var(--color-border);">
                  <td style="padding:8px;"><span style="color:var(--color-danger);">⚠️ Mora</span></td>
                  <td style="padding:8px;">${r.clientName}</td>
                  <td style="padding:8px; text-align:right; color:var(--color-danger); font-weight:bold;">+${this._fmt(r.moraAmount)}</td>
                  <td style="padding:8px; font-size:0.7rem;">5% sobre ${this._fmt(r.remainingBefore)}</td>
                  <td style="padding:8px;">${this._fmtDate(r.appliedAt)}</td></tr>`;
              }).join('') || `<tr><td colspan="5" class="text-center py-4 text-secondary" style="padding:20px;">Sin movimientos registrados.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── KPI banner refresh ────────────────────────────────────────────────────────
  _refreshKPIBanner(el) {
    // Re-render portfolio tab if it's visible
    if (this.state.activeTab === 'portfolio') this._renderPortfolioTab(el);
    if (this.state.activeTab === 'reports')   this._renderReportsTab(el);
    if (this.state.activeTab === 'history')   this._renderHistoryTab(el);
  }

  // ─── Unmount ──────────────────────────────────────────────────────────────────
  unmount() {
    this.listeners.forEach(unsub => typeof unsub === 'function' && unsub());
    this.listeners = [];
    if (this.modalInstance) { try { this.modalInstance.close(); } catch(e) {} }
  }
}
