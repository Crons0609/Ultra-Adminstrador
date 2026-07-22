/**
 * @file payment-reminders.view.js
 * @description View module for managing automated payment & debt reminders via WhatsApp and Telegram.
 * Provides a 4-tab panel: Debts Monitor & Manual Reminders, Automation Rules, Message Template Editor,
 * and Audit Dispatch History.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { PaymentRemindersService } from '../../../services/payment-reminders.service.js';
import { TimeService } from '../../../services/time.service.js';

export class PaymentRemindersView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';
    this.currentUser = currentUser;

    this.state = {
      activeTab: 'monitor', // monitor | rules | templates | history
      credits: [],
      clients: [],
      logs: [],
      config: null,
      filterStatus: 'ALL', // ALL | UPCOMING | OVERDUE | PAID
      evaluating: false
    };

    this.layout = new PageLayout({
      title: '🔔 Recordatorios Automáticos de Pagos',
      subtitle: 'Automatiza y gestiona el envío de recordatorios de cobro a tus clientes vía WhatsApp y Telegram antes y después del vencimiento.',
      actionHTML: `
        <div class="d-flex gap-2 align-items-center">
          <button class="btn btn-secondary btn-sm" id="btn-eval-reminders-now">
            🔄 Ejecutar Evaluación de Cobros
          </button>
        </div>
      `,
      contentHTML: `
        <style>
          .pr-tab-btn {
            padding: 8px 18px; border-radius: var(--radius-xl); border: 1px solid var(--color-border);
            background: transparent; color: var(--color-text-secondary); cursor: pointer;
            font-size: 0.85rem; font-weight: 500; transition: all 0.2s ease; white-space: nowrap;
          }
          .pr-tab-btn.active { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
          .pr-tab-btn:hover:not(.active) { background: var(--color-bg-tertiary); color: var(--color-text-primary); }

          .pr-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
          .pr-switch input { opacity: 0; width: 0; height: 0; }
          .pr-slider { position: absolute; cursor: pointer; top:0; left:0; right:0; bottom:0; background: var(--color-border); border-radius: 24px; transition: 0.3s; }
          .pr-slider:before { position: absolute; content:""; height:18px; width:18px; left:3px; bottom:3px; background:#fff; border-radius:50%; transition:0.3s; }
          input:checked + .pr-slider { background: var(--color-accent); }
          input:checked + .pr-slider:before { transform: translateX(20px); }

          .pr-table { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
          .pr-table th { padding: 10px 12px; border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); text-align: left; font-weight: 600; }
          .pr-table td { padding: 12px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
          .pr-table tr:hover { background: var(--color-bg-tertiary); }
        </style>

        <!-- Tab Bar -->
        <div style="display:flex; gap:var(--space-2); flex-wrap:wrap; margin-bottom:var(--space-5); overflow-x:auto; padding-bottom:4px;">
          <button class="pr-tab-btn active" data-tab="monitor">📋 Monitor de Deudas</button>
          <button class="pr-tab-btn" data-tab="rules">⚡ Reglas de Automatización</button>
          <button class="pr-tab-btn" data-tab="templates">📝 Plantillas de Mensajes</button>
          <button class="pr-tab-btn" data-tab="history">📜 Historial de Envíos</button>
        </div>

        <div id="pr-tab-content"></div>
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

    element.querySelectorAll('.pr-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        element.querySelectorAll('.pr-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.activeTab = btn.getAttribute('data-tab');
        this.renderTabContent(element);
      });
    });

    element.querySelector('#btn-eval-reminders-now')?.addEventListener('click', async () => {
      if (this.state.evaluating) return;
      const btn = element.querySelector('#btn-eval-reminders-now');
      btn.disabled = true;
      btn.textContent = '⏳ Evaluando cobros...';

      try {
        const res = await PaymentRemindersService.evaluateAndDispatchReminders(this.companyId);
        NotificationService.success(`✅ Evaluación completada: ${res.dispatchedCount} recordatorios enviados, ${res.skippedCount} omitidos.`);
      } catch (e) {
        NotificationService.error('Error al evaluar: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Ejecutar Evaluación de Cobros';
      }
    });
  }

  subscribeToData(element) {
    if (!this.companyId) return;
    try {
      const creditsListener = FirestoreService.listenToTenant('credits', (data) => {
        this.state.credits = data || [];
        if (this.state.activeTab === 'monitor') this.renderTabContent(element || this.layout.element);
      });
      this.listeners.push(creditsListener);

      const clientsListener = FirestoreService.listenToTenant('recurring_clients', (data) => {
        this.state.clients = data || [];
      });
      this.listeners.push(clientsListener);

      const logsListener = FirestoreService.listenToTenant('payment_reminder_logs', (data) => {
        this.state.logs = data || [];
        if (this.state.activeTab === 'history' || this.state.activeTab === 'monitor') {
          this.renderTabContent(element || this.layout.element);
        }
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
      console.warn('[PaymentRemindersView] DB listener warning:', e.message);
    }
  }

  renderTabContent(element) {
    const root = element || this.layout.element;
    const container = root?.querySelector('#pr-tab-content');
    if (!container) return;

    const map = {
      monitor: () => this.renderMonitor(container),
      rules: () => this.renderRules(container),
      templates: () => this.renderTemplates(container),
      history: () => this.renderHistory(container)
    };
    (map[this.state.activeTab] || map.monitor)();
  }

  // ─── TAB 1: MONITOR DE DEUDAS ───────────────────────────────────────────────
  renderMonitor(container) {
    const now = Date.now();
    const credits = this.state.credits || [];
    const logs = this.state.logs || [];
    const clients = this.state.clients || [];

    // Filter & calculate KPIs
    const activeDebts = credits.filter(c => {
      const rem = Number(c.remainingAmount ?? c.currentDebt ?? c.initialAmount ?? 0);
      return c.status !== 'PAGADO' && c.status !== 'CANCELADO' && rem > 0;
    });

    const totalDebtAmount = activeDebts.reduce((sum, c) => sum + Number(c.remainingAmount ?? c.initialAmount ?? 0), 0);

    const preDueDays = Number(this.state.config?.paymentRemindersConfig?.preDueDays ?? 2);

    const upcomingDebts = activeDebts.filter(c => {
      const ts = PaymentRemindersService.calculateDueDateTimestamp(c);
      const days = Math.ceil((ts - now) / 86400000);
      return days >= 0 && days <= preDueDays;
    });

    const overdueDebts = activeDebts.filter(c => {
      const ts = PaymentRemindersService.calculateDueDateTimestamp(c);
      return (ts - now) < 0;
    });

    const todayStr = new Date(now).toISOString().split('T')[0];
    const sentToday = logs.filter(l => l.timestampLocal && l.timestampLocal.startsWith(todayStr) && l.status === 'DELIVERED').length;

    // Filter list by selected tab filter
    let filteredList = credits;
    if (this.state.filterStatus === 'UPCOMING') {
      filteredList = upcomingDebts;
    } else if (this.state.filterStatus === 'OVERDUE') {
      filteredList = overdueDebts;
    } else if (this.state.filterStatus === 'PAID') {
      filteredList = credits.filter(c => c.status === 'PAGADO' || Number(c.remainingAmount ?? 0) <= 0);
    }

    const rowsHTML = filteredList.length === 0
      ? `<tr><td colspan="7" class="text-center text-secondary py-6">No hay deudas o créditos registrados en esta categoría.</td></tr>`
      : filteredList.map(credit => {
          const rem = Number(credit.remainingAmount ?? credit.currentDebt ?? credit.initialAmount ?? 0);
          const isPaid = credit.status === 'PAGADO' || rem <= 0;
          const dueTs = PaymentRemindersService.calculateDueDateTimestamp(credit);
          const daysDiff = Math.ceil((dueTs - now) / 86400000);

          let statusBadge = '';
          if (isPaid) {
            statusBadge = `<span style="font-size:0.7rem;padding:2px 8px;border-radius:var(--radius-xl);background:rgba(52,211,153,0.15);color:var(--color-success);font-weight:600;">✅ Pagado</span>`;
          } else if (daysDiff < 0) {
            statusBadge = `<span style="font-size:0.7rem;padding:2px 8px;border-radius:var(--radius-xl);background:rgba(239,68,68,0.15);color:var(--color-danger);font-weight:600;">⚠️ Vencido (${Math.abs(daysDiff)}d atraso)</span>`;
          } else if (daysDiff <= preDueDays) {
            statusBadge = `<span style="font-size:0.7rem;padding:2px 8px;border-radius:var(--radius-xl);background:rgba(245,158,11,0.15);color:#f59e0b;font-weight:600;">⏰ Vence en ${daysDiff}d</span>`;
          } else {
            statusBadge = `<span style="font-size:0.7rem;padding:2px 8px;border-radius:var(--radius-xl);background:rgba(100,116,139,0.15);color:var(--color-text-secondary);"> En tiempo (${daysDiff}d)</span>`;
          }

          // Last reminder log for this credit
          const lastLog = logs.filter(l => l.creditId === credit.id).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
          const lastLogHTML = lastLog
            ? `<span style="font-size:0.68rem;color:${lastLog.status === 'DELIVERED' ? 'var(--color-success)' : 'var(--color-danger)'};">
                ${lastLog.channel === 'WHATSAPP' ? '💬' : '✈️'} ${new Date(lastLog.timestamp).toLocaleDateString([], {month:'short',day:'numeric'})}
               </span>`
            : `<span class="text-secondary text-xs">—</span>`;

          const client = clients.find(c => c.id === credit.clientId || c.name === credit.clientName) || {};

          return `
            <tr>
              <td>
                <div class="font-semibold text-primary">${credit.clientName || client.name || 'Cliente'}</div>
                <div class="text-secondary" style="font-size:0.7rem;">${credit.clientPhone || client.phone || 'Sin teléfono'}</div>
              </td>
              <td>${credit.concept || credit.description || 'Crédito general'}</td>
              <td>
                <strong style="color:${rem > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
                  ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(rem)}
                </strong>
              </td>
              <td>${new Date(dueTs).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
              <td>${statusBadge}</td>
              <td>${lastLogHTML}</td>
              <td>
                <div class="d-flex gap-1 align-items-center">
                  ${!isPaid ? `
                    <button class="btn btn-secondary btn-xs btn-mark-paid" data-credit-id="${credit.id}" title="Marcar deudas como pagada" style="font-size:0.7rem;padding:3px 7px;">🟢 Pagado</button>
                    <button class="btn btn-secondary btn-xs btn-send-wa" data-credit-id="${credit.id}" title="Enviar recordatorio por WhatsApp" style="font-size:0.7rem;padding:3px 7px;">💬 WA</button>
                    <button class="btn btn-secondary btn-xs btn-send-tg" data-credit-id="${credit.id}" title="Enviar recordatorio por Telegram" style="font-size:0.7rem;padding:3px 7px;">✈️ TG</button>
                  ` : `<span class="text-secondary text-xs">Sin acciones</span>`}
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
            <div style="font-size:1.5rem;margin-bottom:4px;">💳</div>
            <div class="text-secondary text-xs">Total Cartera Pendiente</div>
            <div class="font-bold text-xl" style="color:var(--color-danger);">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalDebtAmount)}</div>
          </div>
          <div class="card p-4 hover-lift" style="border-left:4px solid #f59e0b;">
            <div style="font-size:1.5rem;margin-bottom:4px;">⏰</div>
            <div class="text-secondary text-xs">Vencen en ≤ ${preDueDays} Días</div>
            <div class="font-bold text-xl" style="color:#f59e0b;">${upcomingDebts.length} clientes</div>
          </div>
          <div class="card p-4 hover-lift" style="border-left:4px solid var(--color-danger);">
            <div style="font-size:1.5rem;margin-bottom:4px;">⚠️</div>
            <div class="text-secondary text-xs">Deudas Vencidas (Mora)</div>
            <div class="font-bold text-xl" style="color:var(--color-danger);">${overdueDebts.length} clientes</div>
          </div>
          <div class="card p-4 hover-lift" style="border-left:4px solid var(--color-success);">
            <div style="font-size:1.5rem;margin-bottom:4px;">📤</div>
            <div class="text-secondary text-xs">Recordatorios Enviados Hoy</div>
            <div class="font-bold text-xl" style="color:var(--color-success);">${sentToday} enviados</div>
          </div>
        </div>

        <!-- Filter Bar + Table -->
        <div class="card p-5">
          <div class="d-flex justify-content-between align-items-center mb-4" style="flex-wrap:wrap;gap:var(--space-3);">
            <h3 class="font-semibold" style="font-size:0.95rem;">Monitor de Deudas y Cobranza</h3>
            <div class="d-flex gap-2">
              <button class="btn btn-xs ${this.state.filterStatus === 'ALL' ? 'btn-primary' : 'btn-secondary'}" data-filter="ALL">Todos (${credits.length})</button>
              <button class="btn btn-xs ${this.state.filterStatus === 'UPCOMING' ? 'btn-primary' : 'btn-secondary'}" data-filter="UPCOMING">⏰ Vencen Pronto (${upcomingDebts.length})</button>
              <button class="btn btn-xs ${this.state.filterStatus === 'OVERDUE' ? 'btn-primary' : 'btn-secondary'}" data-filter="OVERDUE">⚠️ Vencidos (${overdueDebts.length})</button>
              <button class="btn btn-xs ${this.state.filterStatus === 'PAID' ? 'btn-primary' : 'btn-secondary'}" data-filter="PAID">✅ Pagados</button>
            </div>
          </div>

          <div style="overflow-x:auto;">
            <table class="pr-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Concepto</th>
                  <th>Monto Restante</th>
                  <th>Fecha Vencimiento</th>
                  <th>Estado Vencimiento</th>
                  <th>Último Recordatorio</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>${rowsHTML}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Bind filters
    container.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.filterStatus = btn.getAttribute('data-filter');
        this.renderMonitor(container);
      });
    });

    // Mark paid
    container.querySelectorAll('.btn-mark-paid').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-credit-id');
        if (id && confirm('¿Confirmas marcar este crédito como PAGADO? Se detendrán los recordatorios automáticos.')) {
          await PaymentRemindersService.markDebtAsPaid(this.companyId, id);
          NotificationService.success('Crédito marcado como PAGADO.');
        }
      });
    });

    // Manual WA
    container.querySelectorAll('.btn-send-wa').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-credit-id');
        const credit = credits.find(c => c.id === id);
        if (!credit) return;
        btn.disabled = true;
        try {
          await PaymentRemindersService.sendReminderNow(this.companyId, credit, 'WHATSAPP');
          NotificationService.success(`💬 Recordatorio por WhatsApp enviado a ${credit.clientName}.`);
        } catch (e) {
          NotificationService.error('Error al enviar WhatsApp: ' + e.message);
        } finally { btn.disabled = false; }
      });
    });

    // Manual TG
    container.querySelectorAll('.btn-send-tg').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-credit-id');
        const credit = credits.find(c => c.id === id);
        if (!credit) return;
        btn.disabled = true;
        try {
          await PaymentRemindersService.sendReminderNow(this.companyId, credit, 'TELEGRAM');
          NotificationService.success(`✈️ Recordatorio por Telegram enviado a ${credit.clientName}.`);
        } catch (e) {
          NotificationService.error('Error al enviar Telegram: ' + e.message);
        } finally { btn.disabled = false; }
      });
    });
  }

  // ─── TAB 2: REGLAS DE AUTOMATIZACIÓN ────────────────────────────────────────
  renderRules(container) {
    const cfg = this.state.config?.paymentRemindersConfig || PaymentRemindersService.getDefaultConfig();

    container.innerHTML = `
      <div style="max-width:760px;margin:0 auto;color:var(--color-text-primary);" class="animate-fade-in d-flex flex-column gap-4">
        <div class="card p-6 d-flex flex-column gap-4">
          <h3 class="font-semibold text-primary" style="font-size:1rem;">⚡ Parámetros de Automatización de Cobro</h3>

          <div class="d-flex justify-content-between align-items-center">
            <div>
              <div class="font-medium" style="font-size:0.9rem;">Habilitar Módulo de Recordatorios</div>
              <div class="text-secondary text-xs">Activa o desactiva las funciones de cobranza para tu negocio</div>
            </div>
            <label class="pr-switch">
              <input type="checkbox" id="pr-toggle-enabled" ${cfg.enabled !== false ? 'checked' : ''} />
              <span class="pr-slider"></span>
            </label>
          </div>

          <hr style="border:0;border-top:1px solid var(--color-border);" />

          <div class="d-flex justify-content-between align-items-center">
            <div>
              <div class="font-medium" style="font-size:0.9rem;">Envío Automático Programado</div>
              <div class="text-secondary text-xs">El sistema evaluará diariamente las deudas y enviará los mensajes automáticamente</div>
            </div>
            <label class="pr-switch">
              <input type="checkbox" id="pr-toggle-autodispatch" ${cfg.autoDispatch !== false ? 'checked' : ''} />
              <span class="pr-slider"></span>
            </label>
          </div>

          <hr style="border:0;border-top:1px solid var(--color-border);" />

          <div class="form-group">
            <label class="form-label" for="pr-pre-days">⏰ Días de anticipación para el primer recordatorio</label>
            <div class="d-flex align-items-center gap-2">
              <input type="number" id="pr-pre-days" class="input input-md" style="width:100px;" min="1" max="10" value="${cfg.preDueDays ?? 2}" />
              <span class="text-secondary text-xs">días antes de la fecha límite de pago (Requerido: <strong>2 días antes</strong>)</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">📡 Canal Preferido de Envíos</label>
            <select id="pr-channel" class="input input-md" style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-md);color:var(--color-text-primary);">
              <option value="BOTH" ${(cfg.preferredChannel === 'BOTH' || !cfg.preferredChannel) ? 'selected' : ''}>💬✈️ Ambos (WhatsApp y Telegram)</option>
              <option value="WHATSAPP" ${cfg.preferredChannel === 'WHATSAPP' ? 'selected' : ''}>💬 Solo WhatsApp API</option>
              <option value="TELEGRAM" ${cfg.preferredChannel === 'TELEGRAM' ? 'selected' : ''}>✈️ Solo Telegram Bot</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">⚠️ Recordatorios de Mora Posterior (Días de Atraso)</label>
            <div class="d-flex gap-3 align-items-center" style="font-size:0.85rem;">
              <label><input type="checkbox" class="post-due-cb" value="1" ${(cfg.postDueDays || []).includes(1) ? 'checked' : ''} /> 1 día después</label>
              <label><input type="checkbox" class="post-due-cb" value="3" ${(cfg.postDueDays || []).includes(3) ? 'checked' : ''} /> 3 días después</label>
              <label><input type="checkbox" class="post-due-cb" value="7" ${(cfg.postDueDays || []).includes(7) ? 'checked' : ''} /> 7 días después (Mora grave)</label>
            </div>
          </div>

          <div class="d-flex justify-content-end mt-2">
            <button class="btn btn-primary btn-md" id="btn-save-pr-rules">💾 Guardar Reglas de Automatización</button>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#btn-save-pr-rules')?.addEventListener('click', async () => {
      const postDueDays = [];
      container.querySelectorAll('.post-due-cb:checked').forEach(cb => postDueDays.push(Number(cb.value)));

      const paymentRemindersConfig = {
        ...(cfg || {}),
        enabled: container.querySelector('#pr-toggle-enabled').checked,
        autoDispatch: container.querySelector('#pr-toggle-autodispatch').checked,
        preDueDays: Number(container.querySelector('#pr-pre-days').value || 2),
        preferredChannel: container.querySelector('#pr-channel').value,
        postDueDays
      };

      const updated = {
        ...this.state.config,
        paymentRemindersConfig,
        updatedAt: Date.now(),
        updatedAtLocal: TimeService.timestamp()
      };

      try {
        await FirestoreService.setGlobal(this.companyId, 'configuracion_catalogo', updated);
        NotificationService.success('Reglas de automatización guardadas.');
      } catch (e) { NotificationService.error('Error al guardar: ' + e.message); }
    });
  }

  // ─── TAB 3: EDITOR DE PLANTILLAS ───────────────────────────────────────────
  renderTemplates(container) {
    const cfg = this.state.config?.paymentRemindersConfig || PaymentRemindersService.getDefaultConfig();
    const tmpls = cfg.templates || PaymentRemindersService.getDefaultTemplates();

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:var(--space-5);color:var(--color-text-primary);" class="animate-fade-in">
        <!-- Left: Form -->
        <div class="card p-5 d-flex flex-column gap-4">
          <h3 class="font-semibold text-primary" style="font-size:0.95rem;">📝 Mensajes Personalizados por Tipo de Cobro</h3>
          <p class="text-secondary text-xs">Variables disponibles: <code>{{cliente}}</code>, <code>{{monto}}</code>, <code>{{concepto}}</code>, <code>{{vencimiento}}</code>, <code>{{negocio}}</code></p>

          <div class="form-group">
            <label class="form-label">⏰ Recordatorio Preventivo (2 Días Antes del Vencimiento)</label>
            <textarea id="tmpl-pre-due" class="input input-md" style="height:90px;padding:var(--space-2);font-size:0.8rem;resize:vertical;">${tmpls.PRE_DUE || ''}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">📅 Recordatorio del Día del Cobro (Vence HOY)</label>
            <textarea id="tmpl-due-day" class="input input-md" style="height:75px;padding:var(--space-2);font-size:0.8rem;resize:vertical;">${tmpls.DUE_DAY || ''}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">⚠️ Mora Temprana (1 - 3 Días de Retraso)</label>
            <textarea id="tmpl-overdue-light" class="input input-md" style="height:75px;padding:var(--space-2);font-size:0.8rem;resize:vertical;">${tmpls.OVERDUE_LIGHT || ''}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">🚨 Mora Grave (7+ Días de Retraso)</label>
            <textarea id="tmpl-overdue-heavy" class="input input-md" style="height:75px;padding:var(--space-2);font-size:0.8rem;resize:vertical;">${tmpls.OVERDUE_HEAVY || ''}</textarea>
          </div>

          <div class="d-flex justify-content-end">
            <button class="btn btn-primary btn-md" id="btn-save-pr-tmpls">💾 Guardar Plantillas</button>
          </div>
        </div>

        <!-- Right: Realtime Preview -->
        <div class="card p-5 d-flex flex-column gap-3">
          <h3 class="font-semibold text-primary" style="font-size:0.95rem;">👁️ Vista Previa del Mensaje</h3>
          <p class="text-secondary text-xs">Así se verá el mensaje enviado al celular del cliente:</p>

          <div style="background:#0b141a;border-radius:12px;padding:16px;font-family:sans-serif;">
            <div style="background:#005c4b;color:#e9edef;border-radius:8px;padding:10px 12px;font-size:0.82rem;line-height:1.45;white-space:pre-wrap;" id="tmpl-preview-bubble">
            </div>
          </div>
        </div>
      </div>
    `;

    const updatePreview = () => {
      const activeText = container.querySelector('#tmpl-pre-due')?.value || '';
      const dummyData = {
        cliente: 'Carlos Rodríguez',
        monto: '$1,500.00 MXN',
        concepto: 'Mensualidad de Equipo',
        vencimiento: '15 de Agosto de 2026',
        negocio: GlobalStore.getState().currentCompany?.name || 'Ultra-Administrador'
      };
      container.querySelector('#tmpl-preview-bubble').textContent = PaymentRemindersService.interpolateTemplate(activeText, dummyData);
    };

    updatePreview();
    container.querySelector('#tmpl-pre-due')?.addEventListener('input', updatePreview);

    container.querySelector('#btn-save-pr-tmpls')?.addEventListener('click', async () => {
      const templates = {
        PRE_DUE: container.querySelector('#tmpl-pre-due').value.trim(),
        DUE_DAY: container.querySelector('#tmpl-due-day').value.trim(),
        OVERDUE_LIGHT: container.querySelector('#tmpl-overdue-light').value.trim(),
        OVERDUE_HEAVY: container.querySelector('#tmpl-overdue-heavy').value.trim()
      };

      const updated = {
        ...this.state.config,
        paymentRemindersConfig: {
          ...(cfg || {}),
          templates
        },
        updatedAt: Date.now(),
        updatedAtLocal: TimeService.timestamp()
      };

      try {
        await FirestoreService.setGlobal(this.companyId, 'configuracion_catalogo', updated);
        NotificationService.success('Plantillas de mensajes guardadas.');
      } catch (e) { NotificationService.error('Error al guardar: ' + e.message); }
    });
  }

  // ─── TAB 4: HISTORIAL DE ENVÍOS ─────────────────────────────────────────────
  renderHistory(container) {
    const logs = [...(this.state.logs || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const rowsHTML = logs.length === 0
      ? `<tr><td colspan="6" class="text-center text-secondary py-6">No hay registros de recordatorios enviados aún.</td></tr>`
      : logs.slice(0, 30).map(log => `
        <tr>
          <td>${new Date(log.timestamp).toLocaleString('es-MX')}</td>
          <td>
            <div class="font-semibold text-primary">${log.clientName || 'Cliente'}</div>
            <div class="text-secondary" style="font-size:0.7rem;">${log.phone || log.telegramChatId || ''}</div>
          </td>
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
          <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${log.messageContent}">
            ${log.messageContent}
          </td>
        </tr>
      `).join('');

    container.innerHTML = `
      <div class="card p-5 animate-fade-in" style="color:var(--color-text-primary);">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h3 class="font-semibold" style="font-size:0.95rem;">📜 Historial y Bitácora de Envíos (${logs.length})</h3>
        </div>
        <div style="overflow-x:auto;">
          <table class="pr-table">
            <thead>
              <tr>
                <th>Fecha y Hora</th>
                <th>Cliente</th>
                <th>Canal</th>
                <th>Disparador</th>
                <th>Estado</th>
                <th>Contenido del Mensaje</th>
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
