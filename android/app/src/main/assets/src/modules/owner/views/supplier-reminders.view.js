/**
 * @file supplier-reminders.view.js
 * @description View module for managing outgoing payment reminders to suppliers, rent, taxes and basic services.
 * Features 4 tabs: Obligations Monitor & Quick Registration, Frequency & Recipient Settings, Message Template Editor,
 * and Audit Dispatch Logs.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { SupplierRemindersService } from '../../../services/supplier-reminders.service.js';
import { TimeService } from '../../../services/time.service.js';

export class SupplierRemindersView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';
    this.currentUser = currentUser;

    this.state = {
      activeTab: 'monitor', // monitor | rules | templates | history
      payments: [],
      logs: [],
      config: null,
      filterStatus: 'ALL', // ALL | UPCOMING | OVERDUE | PAID
      evaluating: false
    };

    this.categoryIcons = {
      'Energía Eléctrica': '⚡',
      'Agua Potable': '💧',
      'Internet / Cable': '🌐',
      'PROVEEDOR': '🏢',
      'ALQUILER': '🏠',
      'IMPUESTOS': '🧾',
      'OTROS': '🛠️'
    };

    this.layout = new PageLayout({
      title: '🏢 Recordatorios de Pagos a Proveedores y Servicios',
      subtitle: 'Registra obligaciones financieras salientes y recibe alertas por WhatsApp o Telegram antes de cada fecha de vencimiento.',
      actionHTML: `
        <div class="d-flex gap-2 align-items-center">
          <button class="btn btn-secondary btn-sm" id="btn-eval-supplier-now">
            🔄 Evaluar Pagos Próximos
          </button>
        </div>
      `,
      contentHTML: `
        <style>
          .sr-tab-btn {
            padding: 8px 18px; border-radius: var(--radius-xl); border: 1px solid var(--color-border);
            background: transparent; color: var(--color-text-secondary); cursor: pointer;
            font-size: 0.85rem; font-weight: 500; transition: all 0.2s ease; white-space: nowrap;
          }
          .sr-tab-btn.active { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
          .sr-tab-btn:hover:not(.active) { background: var(--color-bg-tertiary); color: var(--color-text-primary); }

          .sr-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
          .sr-switch input { opacity: 0; width: 0; height: 0; }
          .sr-slider { position: absolute; cursor: pointer; top:0; left:0; right:0; bottom:0; background: var(--color-border); border-radius: 24px; transition: 0.3s; }
          .sr-slider:before { position: absolute; content:""; height:18px; width:18px; left:3px; bottom:3px; background:#fff; border-radius:50%; transition:0.3s; }
          input:checked + .sr-slider { background: var(--color-accent); }
          input:checked + .sr-slider:before { transform: translateX(20px); }

          .sr-table { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
          .sr-table th { padding: 10px 12px; border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); text-align: left; font-weight: 600; }
          .sr-table td { padding: 12px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
          .sr-table tr:hover { background: var(--color-bg-tertiary); }
        </style>

        <!-- Tab Bar -->
        <div style="display:flex; gap:var(--space-2); flex-wrap:wrap; margin-bottom:var(--space-5); overflow-x:auto; padding-bottom:4px;">
          <button class="sr-tab-btn active" data-tab="monitor">📋 Monitor de Obligaciones</button>
          <button class="sr-tab-btn" data-tab="rules">⚡ Destinatarios y Frecuencias</button>
          <button class="sr-tab-btn" data-tab="templates">📝 Editor de Mensajes</button>
          <button class="sr-tab-btn" data-tab="history">📜 Bitácora de Avisos</button>
        </div>

        <div id="sr-tab-content"></div>
      `
    });

    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    this.afterMount(element);
    this.subscribeToData(element);
    this.renderTabContent(element);
    return element;
  }

  afterMount(element) {
    if (!element) return;

    element.querySelectorAll('.sr-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        element.querySelectorAll('.sr-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.activeTab = btn.getAttribute('data-tab');
        this.renderTabContent(element);
      });
    });

    element.querySelector('#btn-eval-supplier-now')?.addEventListener('click', async () => {
      if (this.state.evaluating) return;
      const btn = element.querySelector('#btn-eval-supplier-now');
      btn.disabled = true;
      btn.textContent = '⏳ Evaluando pagos...';

      try {
        const res = await SupplierRemindersService.evaluateAndDispatchReminders(this.companyId);
        NotificationService.success(`✅ Evaluación completada: ${res.dispatchedCount} avisos enviados al administrador.`);
      } catch (e) {
        NotificationService.error('Error: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Evaluar Pagos Próximos';
      }
    });
  }

  subscribeToData(element) {
    if (!this.companyId) return;
    try {
      const customPayListener = FirestoreService.listenToTenant('supplier_payments', (data) => {
        this.updateConsolidatedPayments(element);
      });
      this.listeners.push(customPayListener);

      const accountsPayListener = FirestoreService.listenToTenant('accounts_payable', (data) => {
        this.updateConsolidatedPayments(element);
      });
      this.listeners.push(accountsPayListener);

      const basicServicesListener = FirestoreService.listenToTenant('basic_services', (data) => {
        this.updateConsolidatedPayments(element);
      });
      this.listeners.push(basicServicesListener);

      const logsListener = FirestoreService.listenToTenant('supplier_reminder_logs', (data) => {
        this.state.logs = data || [];
        if (this.state.activeTab === 'history') this.renderTabContent(element || this.layout.element);
      });
      this.listeners.push(logsListener);

      const configListener = FirestoreService.listenToPathRaw(`configuracion_catalogo/${this.companyId}`, (data) => {
        this.state.config = data || {};
        if (this.state.activeTab === 'rules' || this.state.activeTab === 'templates') {
          this.renderTabContent(element || this.layout.element);
        }
      });
      this.listeners.push(configListener);
    } catch (e) {
      console.warn('[SupplierRemindersView] DB listener warning:', e.message);
    }
  }

  async updateConsolidatedPayments(element) {
    const customRaw = await FirestoreService.readPath(`${this.companyId}/supplier_payments`) || {};
    const payableRaw = await FirestoreService.readPath(`${this.companyId}/accounts_payable`) || {};
    const servicesRaw = await FirestoreService.readPath(`${this.companyId}/basic_services`) || {};

    const consolidated = [
      ...Object.entries(customRaw).map(([id, val]) => ({ id, collection: 'supplier_payments', ...val })),
      ...Object.entries(payableRaw).map(([id, val]) => ({
        id, collection: 'accounts_payable', providerName: val.supplierName || 'Proveedor', category: 'PROVEEDOR', ...val
      })),
      ...Object.entries(servicesRaw).map(([id, val]) => ({
        id, collection: 'basic_services', providerName: `${val.serviceType || 'Servicio'} (${val.providerName || 'N/D'})`, category: val.serviceType || 'SERVICIO', ...val
      }))
    ];

    this.state.payments = consolidated;
    if (this.state.activeTab === 'monitor') this.renderTabContent(element || this.layout.element);
  }

  renderTabContent(element) {
    const root = element || this.layout.element;
    const container = root?.querySelector('#tg-tab-content') || root?.querySelector('#sr-tab-content');
    if (!container) return;

    const map = {
      monitor: () => this.renderMonitor(container),
      rules: () => this.renderRules(container),
      templates: () => this.renderTemplates(container),
      history: () => this.renderHistory(container)
    };
    (map[this.state.activeTab] || map.monitor)();
  }

  // ─── TAB 1: MONITOR DE OBLIGACIONES ─────────────────────────────────────────
  renderMonitor(container) {
    const now = Date.now();
    const payments = this.state.payments || [];

    const activePayments = payments.filter(p => p.status !== 'PAGADO' && p.status !== 'LIQUIDADO');
    const totalPending = activePayments.reduce((s, p) => s + Number(p.amount || 0), 0);

    const upcomingPayments = activePayments.filter(p => {
      const ts = Number(p.dueDate || now);
      const days = Math.ceil((ts - now) / 86400000);
      return days >= 0 && days <= 2;
    });

    const overduePayments = activePayments.filter(p => (Number(p.dueDate || now) - now) < 0);

    const paidThisMonth = payments.filter(p => p.status === 'PAGADO' || p.status === 'LIQUIDADO');

    let filtered = payments;
    if (this.state.filterStatus === 'UPCOMING') filtered = upcomingPayments;
    else if (this.state.filterStatus === 'OVERDUE') filtered = overduePayments;
    else if (this.state.filterStatus === 'PAID') filtered = paidThisMonth;

    const rowsHTML = filtered.length === 0
      ? `<tr><td colspan="6" class="text-center text-secondary py-6">No hay obligaciones salientes registradas en esta categoría.</td></tr>`
      : filtered.map(p => {
          const isPaid = p.status === 'PAGADO' || p.status === 'LIQUIDADO';
          const dueTs = Number(p.dueDate || now);
          const daysDiff = Math.ceil((dueTs - now) / 86400000);
          const icon = this.categoryIcons[p.category] || '🏢';

          let badge = '';
          if (isPaid) {
            badge = `<span style="font-size:0.7rem;padding:2px 8px;border-radius:var(--radius-xl);background:rgba(52,211,153,0.15);color:var(--color-success);font-weight:600;">✅ Pagado</span>`;
          } else if (daysDiff < 0) {
            badge = `<span style="font-size:0.7rem;padding:2px 8px;border-radius:var(--radius-xl);background:rgba(239,68,68,0.15);color:var(--color-danger);font-weight:600;">⚠️ Vencido (${Math.abs(daysDiff)}d atraso)</span>`;
          } else if (daysDiff <= 2) {
            badge = `<span style="font-size:0.7rem;padding:2px 8px;border-radius:var(--radius-xl);background:rgba(245,158,11,0.15);color:#f59e0b;font-weight:600;">⏰ Vence en ${daysDiff}d</span>`;
          } else {
            badge = `<span style="font-size:0.7rem;padding:2px 8px;border-radius:var(--radius-xl);background:rgba(100,116,139,0.15);color:var(--color-text-secondary);">En tiempo (${daysDiff}d)</span>`;
          }

          return `
            <tr>
              <td>
                <div class="font-semibold text-primary">${icon} ${p.providerName}</div>
                <div class="text-secondary" style="font-size:0.7rem;">${p.notes || p.category || 'Compromiso saliente'}</div>
              </td>
              <td><span style="font-size:0.72rem;padding:2px 6px;border-radius:var(--radius-md);background:var(--color-bg-tertiary);">${p.category || 'GENERAL'}</span></td>
              <td><strong style="color:${isPaid ? 'var(--color-success)' : 'var(--color-danger)'};">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.amount || 0)}</strong></td>
              <td>${new Date(dueTs).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
              <td>${badge}</td>
              <td>
                <div class="d-flex gap-1 align-items-center">
                  ${!isPaid ? `
                    <button class="btn btn-secondary btn-xs btn-mark-sup-paid" data-id="${p.id}" data-col="${p.collection || 'supplier_payments'}" title="Marcar como pagado" style="font-size:0.7rem;padding:3px 7px;">🟢 Pagado</button>
                    <button class="btn btn-secondary btn-xs btn-remind-sup-wa" data-id="${p.id}" title="Aviso WhatsApp al dueño" style="font-size:0.7rem;padding:3px 7px;">💬 WA</button>
                    <button class="btn btn-secondary btn-xs btn-remind-sup-tg" data-id="${p.id}" title="Aviso Telegram al dueño" style="font-size:0.7rem;padding:3px 7px;">✈️ TG</button>
                  ` : `<span class="text-secondary text-xs">Liquidado</span>`}
                </div>
              </td>
            </tr>
          `;
        }).join('');

    container.innerHTML = `
      <div class="animate-fade-in d-flex flex-column gap-5" style="color:var(--color-text-primary);">

        <!-- KPI Cards -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--space-4);">
          <div class="card p-4 hover-lift" style="border-left:4px solid var(--color-danger);">
            <div style="font-size:1.5rem;margin-bottom:4px;">💸</div>
            <div class="text-secondary text-xs">Total Pagos Pendientes</div>
            <div class="font-bold text-xl" style="color:var(--color-danger);">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalPending)}</div>
          </div>
          <div class="card p-4 hover-lift" style="border-left:4px solid #f59e0b;">
            <div style="font-size:1.5rem;margin-bottom:4px;">⏰</div>
            <div class="text-secondary text-xs">Vencen en ≤ 2 Días</div>
            <div class="font-bold text-xl" style="color:#f59e0b;">${upcomingPayments.length} compromisos</div>
          </div>
          <div class="card p-4 hover-lift" style="border-left:4px solid var(--color-danger);">
            <div style="font-size:1.5rem;margin-bottom:4px;">⚠️</div>
            <div class="text-secondary text-xs">Pagos Vencidos (Mora)</div>
            <div class="font-bold text-xl" style="color:var(--color-danger);">${overduePayments.length} compromisos</div>
          </div>
          <div class="card p-4 hover-lift" style="border-left:4px solid var(--color-success);">
            <div style="font-size:1.5rem;margin-bottom:4px;">✅</div>
            <div class="text-secondary text-xs">Pagos Realizados</div>
            <div class="font-bold text-xl" style="color:var(--color-success);">${paidThisMonth.length} liquidados</div>
          </div>
        </div>

        <!-- Quick Add Form -->
        <div class="card p-5">
          <h3 class="font-semibold mb-3" style="font-size:0.95rem;">➕ Registrar Pago Pendiente a Proveedor o Servicio</h3>
          <form id="sr-quick-add-form" class="d-flex flex-column gap-3">
            <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:var(--space-3);">
              <div class="form-group">
                <label class="form-label">Nombre Proveedor / Servicio</label>
                <input type="text" id="sr-add-name" class="input input-md" placeholder="Ej. Proveedor X, ENEL, Agua, Alquiler" required />
              </div>
              <div class="form-group">
                <label class="form-label">Categoría</label>
                <select id="sr-add-cat" class="input input-md" style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-md);color:var(--color-text-primary);">
                  <option value="PROVEEDOR">🏢 Proveedor</option>
                  <option value="Energía Eléctrica">⚡ Energía Eléctrica</option>
                  <option value="Agua Potable">💧 Agua Potable</option>
                  <option value="Internet / Cable">🌐 Internet / Cable</option>
                  <option value="ALQUILER">🏠 Alquiler Local</option>
                  <option value="IMPUESTOS">🧾 Impuestos</option>
                  <option value="OTROS">🛠️ Otros</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Monto ($)</label>
                <input type="number" id="sr-add-amount" class="input input-md" step="0.01" placeholder="5000.00" required />
              </div>
              <div class="form-group">
                <label class="form-label">Fecha Vencimiento</label>
                <input type="date" id="sr-add-duedate" class="input input-md" required />
              </div>
            </div>
            <div class="d-flex justify-content-end">
              <button type="submit" class="btn btn-primary btn-sm">+ Registrar Pago Pendiente</button>
            </div>
          </form>
        </div>

        <!-- Table + Filters -->
        <div class="card p-5">
          <div class="d-flex justify-content-between align-items-center mb-4" style="flex-wrap:wrap;gap:var(--space-3);">
            <h3 class="font-semibold" style="font-size:0.95rem;">Listado de Compromisos Salientes</h3>
            <div class="d-flex gap-2">
              <button class="btn btn-xs ${this.state.filterStatus === 'ALL' ? 'btn-primary' : 'btn-secondary'}" data-filter="ALL">Todos (${payments.length})</button>
              <button class="btn btn-xs ${this.state.filterStatus === 'UPCOMING' ? 'btn-primary' : 'btn-secondary'}" data-filter="UPCOMING">⏰ Vencen Pronto (${upcomingPayments.length})</button>
              <button class="btn btn-xs ${this.state.filterStatus === 'OVERDUE' ? 'btn-primary' : 'btn-secondary'}" data-filter="OVERDUE">⚠️ Vencidos (${overduePayments.length})</button>
              <button class="btn btn-xs ${this.state.filterStatus === 'PAID' ? 'btn-primary' : 'btn-secondary'}" data-filter="PAID">✅ Pagados (${paidThisMonth.length})</button>
            </div>
          </div>

          <div style="overflow-x:auto;">
            <table class="sr-table">
              <thead>
                <tr>
                  <th>Proveedor / Servicio</th>
                  <th>Categoría</th>
                  <th>Monto</th>
                  <th>Fecha Vencimiento</th>
                  <th>Estado Vencimiento</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>${rowsHTML}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Filter clicks
    container.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.filterStatus = btn.getAttribute('data-filter');
        this.renderMonitor(container);
      });
    });

    // Quick add submit
    container.querySelector('#sr-quick-add-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const providerName = container.querySelector('#sr-add-name').value.trim();
      const category = container.querySelector('#sr-add-cat').value;
      const amount = Number(container.querySelector('#sr-add-amount').value || 0);
      const dateVal = container.querySelector('#sr-add-duedate').value;
      const dueDate = new Date(dateVal + 'T12:00:00').getTime();

      const payload = {
        providerName, category, amount, dueDate,
        status: 'PENDIENTE', createdAt: Date.now(), createdAtLocal: TimeService.timestamp()
      };

      try {
        await FirestoreService.create('supplier_payments', payload);
        NotificationService.success(`✅ Pago a ${providerName} por $${amount} registrado.`);
        container.querySelector('#sr-quick-add-form').reset();
      } catch (err) { NotificationService.error('Error al registrar: ' + err.message); }
    });

    // Mark paid
    container.querySelectorAll('.btn-mark-sup-paid').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const col = btn.getAttribute('data-col');
        if (id && confirm('¿Confirmas marcar este pago como REALIZADO? Se detendrán los avisos.')) {
          await SupplierRemindersService.markPaymentAsPaid(this.companyId, id, col);
          NotificationService.success('Pago marcado como REALIZADO.');
        }
      });
    });

    // Manual WA
    container.querySelectorAll('.btn-remind-sup-wa').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const item = payments.find(p => p.id === id);
        if (!item) return;
        btn.disabled = true;
        try {
          await SupplierRemindersService.sendReminderNow(this.companyId, item, 'WHATSAPP');
          NotificationService.success(`💬 Aviso de pago por WhatsApp enviado al administrador.`);
        } catch (e) { NotificationService.error('Error: ' + e.message); }
        finally { btn.disabled = false; }
      });
    });

    // Manual TG
    container.querySelectorAll('.btn-remind-sup-tg').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const item = payments.find(p => p.id === id);
        if (!item) return;
        btn.disabled = true;
        try {
          await SupplierRemindersService.sendReminderNow(this.companyId, item, 'TELEGRAM');
          NotificationService.success(`✈️ Aviso de pago por Telegram enviado al administrador.`);
        } catch (e) { NotificationService.error('Error: ' + e.message); }
        finally { btn.disabled = false; }
      });
    });
  }

  // ─── TAB 2: DESTINATARIOS Y FRECUENCIAS ──────────────────────────────────────
  renderRules(container) {
    const cfg = this.state.config?.supplierRemindersConfig || SupplierRemindersService.getDefaultConfig();
    const freq = cfg.frequencies || { twoDaysBefore: true, oneDayBefore: true, sameDay: true, overdue: true };

    container.innerHTML = `
      <div style="max-width:760px;margin:0 auto;color:var(--color-text-primary);" class="animate-fade-in d-flex flex-column gap-4">
        <div class="card p-6 d-flex flex-column gap-4">
          <h3 class="font-semibold text-primary" style="font-size:1rem;">⚡ Destinatario y Frecuencia de Avisos a Proveedores</h3>

          <div class="d-flex justify-content-between align-items-center">
            <div>
              <div class="font-medium" style="font-size:0.9rem;">Habilitar Avisos Salientes</div>
              <div class="text-secondary text-xs">Notifica al dueño/gerente antes del vencimiento de facturas y servicios</div>
            </div>
            <label class="sr-switch">
              <input type="checkbox" id="sr-toggle-enabled" ${cfg.enabled !== false ? 'checked' : ''} />
              <span class="sr-slider"></span>
            </label>
          </div>

          <hr style="border:0;border-top:1px solid var(--color-border);" />

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="sr-recipient-phone">WhatsApp del Administrador</label>
              <input type="tel" id="sr-recipient-phone" class="input input-md" placeholder="5215512345678" value="${cfg.recipientPhone || ''}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="sr-recipient-chatid">Telegram chat_id del Administrador</label>
              <input type="text" id="sr-recipient-chatid" class="input input-md" placeholder="123456789" value="${cfg.recipientTelegramChatId || ''}" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">📡 Canal Preferido para Avisos</label>
            <select id="sr-channel" class="input input-md" style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-md);color:var(--color-text-primary);">
              <option value="BOTH" ${(cfg.preferredChannel === 'BOTH' || !cfg.preferredChannel) ? 'selected' : ''}>💬✈️ Ambos (WhatsApp y Telegram)</option>
              <option value="WHATSAPP" ${cfg.preferredChannel === 'WHATSAPP' ? 'selected' : ''}>💬 Solo WhatsApp API</option>
              <option value="TELEGRAM" ${cfg.preferredChannel === 'TELEGRAM' ? 'selected' : ''}>✈️ Solo Telegram Bot</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">⏰ Frecuencia de Recordatorios Automáticos</label>
            <div class="d-flex flex-column gap-2" style="font-size:0.85rem;">
              <label><input type="checkbox" id="freq-2d" ${freq.twoDaysBefore !== false ? 'checked' : ''} /> <strong>2 días antes del vencimiento</strong> (ej. aviso el día 13 si vence el 15)</label>
              <label><input type="checkbox" id="freq-1d" ${freq.oneDayBefore !== false ? 'checked' : ''} /> <strong>1 día antes del vencimiento</strong> (ej. aviso el día 14)</label>
              <label><input type="checkbox" id="freq-0d" ${freq.sameDay !== false ? 'checked' : ''} /> <strong>El mismo día del vencimiento</strong> (ej. aviso el día 15)</label>
              <label><input type="checkbox" id="freq-overdue" ${freq.overdue !== false ? 'checked' : ''} /> <strong>Alertas de mora</strong> (si el pago continúa pendiente después de vencer)</label>
            </div>
          </div>

          <div class="d-flex justify-content-end mt-2">
            <button class="btn btn-primary btn-md" id="btn-save-sr-rules">💾 Guardar Configuración de Avisos</button>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#btn-save-sr-rules')?.addEventListener('click', async () => {
      const supplierRemindersConfig = {
        ...(cfg || {}),
        enabled: container.querySelector('#sr-toggle-enabled').checked,
        recipientPhone: container.querySelector('#sr-recipient-phone').value.trim(),
        recipientTelegramChatId: container.querySelector('#sr-recipient-chatid').value.trim(),
        preferredChannel: container.querySelector('#sr-channel').value,
        frequencies: {
          twoDaysBefore: container.querySelector('#freq-2d').checked,
          oneDayBefore: container.querySelector('#freq-1d').checked,
          sameDay: container.querySelector('#freq-0d').checked,
          overdue: container.querySelector('#freq-overdue').checked
        }
      };

      const updated = {
        ...this.state.config,
        supplierRemindersConfig,
        updatedAt: Date.now(), updatedAtLocal: TimeService.timestamp()
      };

      try {
        await FirestoreService.setGlobal(this.companyId, 'configuracion_catalogo', updated);
        NotificationService.success('Configuración de aviso a proveedores guardada.');
      } catch (e) { NotificationService.error('Error: ' + e.message); }
    });
  }

  // ─── TAB 3: EDITOR DE PLANTILLAS ───────────────────────────────────────────
  renderTemplates(container) {
    const cfg = this.state.config?.supplierRemindersConfig || SupplierRemindersService.getDefaultConfig();
    const tmpls = cfg.templates || SupplierRemindersService.getDefaultTemplates();

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:var(--space-5);color:var(--color-text-primary);" class="animate-fade-in">
        <div class="card p-5 d-flex flex-column gap-4">
          <h3 class="font-semibold text-primary" style="font-size:0.95rem;">📝 Mensajes de Notificación al Administrador</h3>
          <p class="text-secondary text-xs">Variables: <code>{{proveedor}}</code>, <code>{{monto}}</code>, <code>{{vencimiento}}</code>, <code>{{categoria}}</code>, <code>{{negocio}}</code></p>

          <div class="form-group">
            <label class="form-label">⏰ Aviso Preventivo (2 Días / 1 Día Antes)</label>
            <textarea id="sr-tmpl-preventive" class="input input-md" style="height:90px;padding:var(--space-2);font-size:0.8rem;resize:vertical;">${tmpls.PREVENTIVE || ''}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">🚨 Aviso del Mismo Día del Vencimiento</label>
            <textarea id="sr-tmpl-sameday" class="input input-md" style="height:80px;padding:var(--space-2);font-size:0.8rem;resize:vertical;">${tmpls.SAME_DAY || ''}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">⚠️ Alerta de Pago Vencido (Mora)</label>
            <textarea id="sr-tmpl-overdue" class="input input-md" style="height:80px;padding:var(--space-2);font-size:0.8rem;resize:vertical;">${tmpls.OVERDUE || ''}</textarea>
          </div>

          <div class="d-flex justify-content-end">
            <button class="btn btn-primary btn-md" id="btn-save-sr-tmpls">💾 Guardar Plantillas</button>
          </div>
        </div>

        <div class="card p-5 d-flex flex-column gap-3">
          <h3 class="font-semibold text-primary" style="font-size:0.95rem;">👁️ Vista Previa del Aviso</h3>
          <p class="text-secondary text-xs">Así recibirá la notificación el dueño/gerente en su celular:</p>
          <div style="background:#0b141a;border-radius:12px;padding:16px;font-family:sans-serif;">
            <div style="background:#005c4b;color:#e9edef;border-radius:8px;padding:10px 12px;font-size:0.82rem;line-height:1.45;white-space:pre-wrap;" id="sr-preview-bubble"></div>
          </div>
        </div>
      </div>
    `;

    const updatePreview = () => {
      const activeText = container.querySelector('#sr-tmpl-preventive')?.value || '';
      const dummyData = {
        proveedor: 'Proveedor X (ENEL)',
        categoria: 'Energía Eléctrica',
        monto: '$5,000.00 MXN',
        vencimiento: '15 de Agosto de 2026',
        negocio: GlobalStore.getState().currentCompany?.name || 'Ultra-Administrador'
      };
      container.querySelector('#sr-preview-bubble').textContent = SupplierRemindersService.interpolateTemplate(activeText, dummyData);
    };

    updatePreview();
    container.querySelector('#sr-tmpl-preventive')?.addEventListener('input', updatePreview);

    container.querySelector('#btn-save-sr-tmpls')?.addEventListener('click', async () => {
      const templates = {
        PREVENTIVE: container.querySelector('#sr-tmpl-preventive').value.trim(),
        SAME_DAY: container.querySelector('#sr-tmpl-sameday').value.trim(),
        OVERDUE: container.querySelector('#sr-tmpl-overdue').value.trim()
      };

      const updated = {
        ...this.state.config,
        supplierRemindersConfig: { ...(cfg || {}), templates },
        updatedAt: Date.now(), updatedAtLocal: TimeService.timestamp()
      };

      try {
        await FirestoreService.setGlobal(this.companyId, 'configuracion_catalogo', updated);
        NotificationService.success('Plantillas guardadas.');
      } catch (e) { NotificationService.error('Error: ' + e.message); }
    });
  }

  // ─── TAB 4: BITÁCORA DE AVISOS ──────────────────────────────────────────────
  renderHistory(container) {
    const logs = [...(this.state.logs || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const rowsHTML = logs.length === 0
      ? `<tr><td colspan="6" class="text-center text-secondary py-6">No hay registros de avisos salientes a proveedores aún.</td></tr>`
      : logs.slice(0, 30).map(log => `
        <tr>
          <td>${new Date(log.timestamp).toLocaleString('es-MX')}</td>
          <td>
            <div class="font-semibold text-primary">${log.providerName || 'Proveedor'}</div>
            <div class="text-secondary" style="font-size:0.7rem;">${log.category || 'Servicio'}</div>
          </td>
          <td><strong>${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(log.amount || 0)}</strong></td>
          <td>${log.channel === 'WHATSAPP' ? '💬 WhatsApp' : '✈️ Telegram'}</td>
          <td>
            <span style="font-size:0.68rem;padding:2px 6px;border-radius:var(--radius-xl);background:rgba(124,117,255,0.15);color:var(--color-accent);">
              ${log.triggerType || 'AUTO'}
            </span>
          </td>
          <td>
            <span style="font-size:0.7rem;font-weight:bold;color:${log.status === 'DELIVERED' ? 'var(--color-success)' : 'var(--color-danger)'};">
              ${log.status}
            </span>
          </td>
        </tr>
      `).join('');

    container.innerHTML = `
      <div class="card p-5 animate-fade-in" style="color:var(--color-text-primary);">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h3 class="font-semibold" style="font-size:0.95rem;">📜 Bitácora de Avisos Enviados al Administrador (${logs.length})</h3>
        </div>
        <div style="overflow-x:auto;">
          <table class="sr-table">
            <thead>
              <tr>
                <th>Fecha y Hora</th>
                <th>Proveedor / Servicio</th>
                <th>Monto</th>
                <th>Canal</th>
                <th>Frecuencia Disparada</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}
