/**
 * @file telegram-hub.view.js
 * @description Telegram Automation Hub — a full multi-tenant panel with 6 tabs:
 * Inbox (real-time), Chatbot config, Customizable Cards (exclusive to Telegram),
 * Broadcast Campaigns, Statistics and Bot API Settings.
 *
 * Each business operates its own isolated bot, conversations and configuration via companyId.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TelegramService } from '../../../services/telegram.service.js';
import { TimeService } from '../../../services/time.service.js';

export class TelegramHubView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    const { currentCompany } = GlobalStore.getState();
    this.companyId = currentUser.companyId || '';
    this.currentUser = currentUser;
    this.isTelegramEnabled = currentCompany?.config?.enableTelegram !== false;

    this.state = {
      activeTab: 'inbox',
      conversations: [],
      selectedConvId: null,
      subscribers: [],
      clients: [],
      logs: [],
      config: null
    };

    // Drag-and-drop card reordering state
    this._dragIdx = null;

    this.layout = new PageLayout({
      title: '✈️ Telegram Automation Hub',
      subtitle: 'Gestiona mensajes en tiempo real, automatiza respuestas, configura tarjetas del bot y lanza campañas de marketing, todo aislado por negocio.',
      actionHTML: `
        <div class="d-flex gap-2 align-items-center">
          <div id="tg-connection-status" style="display:flex; align-items:center; gap:8px; padding:4px 12px; border-radius:var(--radius-xl); background:rgba(52,211,153,0.12); border:1px solid rgba(52,211,153,0.3); font-size:0.8rem; color:var(--color-success);">
            <span style="width:8px; height:8px; border-radius:50%; background:var(--color-success); display:inline-block; animation: tg-pulse 2s infinite;"></span>
            <span id="tg-bot-label">Bot Conectado</span>
          </div>
        </div>
      `,
      contentHTML: `
        <style>
          @keyframes tg-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
          .tg-tab-btn {
            padding: 8px 18px; border-radius: var(--radius-xl); border: 1px solid var(--color-border);
            background: transparent; color: var(--color-text-secondary); cursor: pointer;
            font-size: 0.85rem; font-weight: 500; transition: all 0.2s ease; white-space: nowrap;
          }
          .tg-tab-btn.active { background: #229ED9; color: #fff; border-color: #229ED9; }
          .tg-tab-btn:hover:not(.active) { background: var(--color-bg-tertiary); color: var(--color-text-primary); }

          .tg-conv-item {
            padding: 10px 12px; cursor: pointer; transition: background 0.15s ease;
            border-bottom: 1px solid var(--color-border);
          }
          .tg-conv-item:hover { background: var(--color-bg-tertiary); }
          .tg-conv-item.selected { background: rgba(34,158,217,0.12); border-left: 3px solid #229ED9; }

          .tg-bubble { max-width: 80%; border-radius: 12px; padding: 8px 12px; font-size: 0.85rem; line-height: 1.5; }
          .tg-bubble.client { background: var(--color-bg-secondary); color: var(--color-text-primary); border-bottom-left-radius: 2px; }
          .tg-bubble.employee { background: #229ED9; color: #fff; border-bottom-right-radius: 2px; }
          .tg-bubble.bot { background: #1a7fab; color: #e0f4ff; border-bottom-right-radius: 2px; font-size: 0.82rem; }
          .tg-bubble.system { background: transparent; color: var(--color-text-secondary); font-size: 0.7rem; font-style: italic; text-align: center; max-width: 100%; }

          .tg-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
          .tg-switch input { opacity: 0; width: 0; height: 0; }
          .tg-slider { position: absolute; cursor: pointer; top:0; left:0; right:0; bottom:0; background: var(--color-border); border-radius: 24px; transition: 0.3s; }
          .tg-slider:before { position: absolute; content:""; height:18px; width:18px; left:3px; bottom:3px; background:#fff; border-radius:50%; transition:0.3s; }
          input:checked + .tg-slider { background: #229ED9; }
          input:checked + .tg-slider:before { transform: translateX(20px); }

          .tg-card {
            background: var(--color-bg-secondary); border: 1px solid var(--color-border);
            border-radius: var(--radius-lg); padding: 16px; cursor: grab;
            transition: box-shadow 0.2s, transform 0.15s; position: relative;
            user-select: none;
          }
          .tg-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
          .tg-card.dragging { opacity: 0.5; transform: scale(0.97); box-shadow: 0 8px 32px rgba(34,158,217,0.3); }
          .tg-card.drag-over { border: 2px dashed #229ED9; }
          .tg-card-disabled { opacity: 0.45; }
        </style>

        <!-- Tab Bar -->
        <div style="display:flex; gap:var(--space-2); flex-wrap:wrap; margin-bottom:var(--space-5); overflow-x:auto; padding-bottom:4px;">
          <button class="tg-tab-btn active" data-tab="inbox">📥 Inbox</button>
          <button class="tg-tab-btn" data-tab="autobot">🤖 Chatbot</button>
          <button class="tg-tab-btn" data-tab="cards">🃏 Tarjetas del Bot</button>
          <button class="tg-tab-btn" data-tab="campaigns">📢 Campañas</button>
          <button class="tg-tab-btn" data-tab="stats">📊 Estadísticas</button>
          <button class="tg-tab-btn" data-tab="settings">⚙️ Configuración</button>
        </div>

        <div id="tg-tab-content"></div>
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

    // Tab switching
    element.querySelectorAll('.tg-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        element.querySelectorAll('.tg-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.activeTab = btn.getAttribute('data-tab');
        this.renderTabContent(element);
      });
    });

    // Update connection status badge
    const statusEl = element.querySelector('#tg-connection-status');
    const labelEl = element.querySelector('#tg-bot-label');
    if (statusEl && !this.isTelegramEnabled) {
      statusEl.style.background = 'rgba(239,68,68,0.12)';
      statusEl.style.borderColor = 'rgba(239,68,68,0.3)';
      statusEl.style.color = 'var(--color-danger)';
      statusEl.querySelector('span:first-child').style.background = 'var(--color-danger)';
      if (labelEl) labelEl.textContent = 'Bot Desconectado';
    }
  }

  subscribeToData(element) {
    if (!this.companyId) return;
    try {
      const convListener = FirestoreService.listenToTenant('telegram_conversations', (data) => {
        this.state.conversations = data || [];
        if (this.state.activeTab === 'inbox') this.renderTabContent(element || this.layout.element);
      });
      this.listeners.push(convListener);

      const subListener = FirestoreService.listenToTenant('telegram_subscribers', (data) => {
        this.state.subscribers = data || [];
      });
      this.listeners.push(subListener);

      const clientListener = FirestoreService.listenToTenant('recurring_clients', (data) => {
        this.state.clients = data || [];
      });
      this.listeners.push(clientListener);

      const logsListener = FirestoreService.listenToTenant('telegram_logs', (data) => {
        this.state.logs = data || [];
        if (this.state.activeTab === 'stats') this.renderTabContent(element || this.layout.element);
      });
      this.listeners.push(logsListener);

      const configListener = FirestoreService.listenToPathRaw(`configuracion_catalogo/${this.companyId}`, (data) => {
        this.state.config = data || {};
        const tab = this.state.activeTab;
        if (tab === 'autobot' || tab === 'settings' || tab === 'cards') {
          this.renderTabContent(element || this.layout.element);
        }
      });
      this.listeners.push(configListener);
    } catch (e) {
      console.warn('[TelegramHubView] Listener error:', e.message);
    }
  }

  renderTabContent(element) {
    const root = element || this.layout.element;
    const container = root?.querySelector('#tg-tab-content');
    if (!container) return;

    if (!this.isTelegramEnabled) {
      container.innerHTML = this.renderUpgradeLock();
      container.querySelector('#btn-upgrade-tg')?.addEventListener('click', () => {
        alert('Contacta a soporte en soporte@ultraadmin.com para activar el módulo de Telegram Bot en tu negocio.');
      });
      return;
    }

    const tabMap = {
      inbox: () => this.renderInbox(container, root),
      autobot: () => this.renderAutobotConfig(container),
      cards: () => this.renderCards(container),
      campaigns: () => this.renderCampaigns(container),
      stats: () => this.renderStats(container),
      settings: () => this.renderSettings(container)
    };
    (tabMap[this.state.activeTab] || tabMap.inbox)();
  }

  // ─── UPGRADE LOCK ──────────────────────────────────────────────────────────
  renderUpgradeLock() {
    return `
      <div class="card p-6 text-center animate-fade-in" style="display:flex;flex-direction:column;align-items:center;gap:var(--space-4);max-width:640px;margin:2rem auto;color:var(--color-text-primary);">
        <div style="font-size:4rem;">🔒</div>
        <h3 class="text-xl font-bold">Telegram Bot Premium Requerido</h3>
        <p class="text-secondary" style="line-height:1.7;font-size:0.9rem;max-width:500px;">
          El Hub de Telegram está disponible como módulo Premium. Requiere activación por el Administrador de la plataforma.
          <br/><br/>
          <strong>💡 Dato importante:</strong> La API de Telegram Bot es <em>completamente gratuita</em> — la licencia controla el acceso al panel, no el uso de la API.
        </p>
        <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);padding:16px 20px;border-radius:var(--radius-md);font-size:0.82rem;color:var(--color-text-secondary);text-align:left;width:100%;">
          ✈️ <strong>Funciones incluidas con Telegram Premium:</strong>
          <ul style="margin:10px 0 0;padding-left:20px;line-height:1.9;">
            <li>Inbox en tiempo real — responde desde la web sin abrir Telegram</li>
            <li>Chatbot con consulta de inventario, pedidos y citas</li>
            <li>🃏 Tarjetas personalizables con drag-and-drop</li>
            <li>Campañas de difusión a suscriptores del bot</li>
            <li>Comandos /start, /menu, /pedido y teclados inline</li>
            <li>Estadísticas y logs de mensajería por negocio</li>
          </ul>
        </div>
        <button class="btn btn-primary btn-md mt-2" id="btn-upgrade-tg">Solicitar Activación del Telegram Hub</button>
      </div>
    `;
  }

  // ─── INBOX TAB ─────────────────────────────────────────────────────────────
  renderInbox(container, root) {
    const convList = [...this.state.conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const selectedConv = convList.find(c => c.id === this.state.selectedConvId) || convList[0] || null;
    if (selectedConv && !this.state.selectedConvId) this.state.selectedConvId = selectedConv?.id;

    const selectedSub = selectedConv
      ? this.state.subscribers.find(s => String(s.chatId) === String(selectedConv.chatId))
      : null;

    const convListHTML = convList.length === 0
      ? `<div class="text-center text-secondary py-6 text-xs">Aún no hay conversaciones.<br/>Los mensajes de tus clientes vía Telegram aparecerán aquí.</div>`
      : convList.map(c => `
        <div class="tg-conv-item ${c.id === this.state.selectedConvId ? 'selected' : ''}" data-conv-id="${c.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:36px;height:36px;border-radius:50%;background:rgba(34,158,217,0.2);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">${c.clientName?.charAt(0)?.toUpperCase() || '👤'}</div>
              <div>
                <div class="font-semibold text-primary" style="font-size:0.875rem;">${c.clientName} ${c.clientUsername ? `<span style="color:var(--color-text-secondary);font-size:0.7rem;">@${c.clientUsername}</span>` : ''}</div>
                <div class="text-secondary" style="font-size:0.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">${c.lastMessage || 'Sin mensajes'}</div>
              </div>
            </div>
            <div class="d-flex flex-column align-items-end gap-1" style="flex-shrink:0;">
              <span style="font-size:0.6rem;padding:2px 6px;border-radius:var(--radius-md);background:${c.status === 'OPEN' ? 'rgba(34,158,217,0.15)' : 'rgba(100,116,139,0.15)'};color:${c.status === 'OPEN' ? '#229ED9' : 'var(--color-text-secondary)'};">${c.status}</span>
              <span class="text-secondary" style="font-size:0.6rem;">${c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}</span>
            </div>
          </div>
        </div>
      `).join('');

    const messagesHTML = selectedConv?.messages
      ? Object.values(selectedConv.messages).sort((a, b) => a.timestamp - b.timestamp).map(m => {
          const isClient = m.sender === 'CLIENT';
          const isSystem = m.sender === 'SYSTEM';
          const isBot = m.sender === 'BOT';
          const align = isClient ? 'flex-start' : 'flex-end';
          const cls = isSystem ? 'system' : (isClient ? 'client' : (isBot ? 'bot' : 'employee'));
          return `
            <div style="display:flex;justify-content:${align};margin-bottom:8px;">
              <div class="tg-bubble ${cls}">
                ${!isClient && !isSystem ? `<div style="font-size:0.65rem;opacity:0.75;margin-bottom:3px;">${m.senderName || 'Agente'}</div>` : ''}
                ${m.text}
                <div style="font-size:0.65rem;opacity:0.6;margin-top:4px;text-align:right;">${new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
              </div>
            </div>
          `;
        }).join('')
      : `<div class="text-center text-secondary py-8 text-xs">Selecciona una conversación para ver los mensajes.</div>`;

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:260px 1fr 220px;gap:var(--space-4);height:calc(100vh - 300px);min-height:480px;">

        <!-- Left: Conversation List -->
        <div class="card" style="overflow:hidden;display:flex;flex-direction:column;">
          <div style="padding:12px;border-bottom:1px solid var(--color-border);display:flex;justify-content:space-between;align-items:center;">
            <span class="font-semibold text-primary" style="font-size:0.875rem;">Conversaciones</span>
            <span style="background:rgba(34,158,217,0.2);color:#229ED9;padding:2px 8px;border-radius:var(--radius-xl);font-size:0.7rem;">${convList.length}</span>
          </div>
          <div style="padding:8px 12px;border-bottom:1px solid var(--color-border);">
            <button class="btn btn-secondary btn-sm" id="btn-tg-simulate" style="width:100%;font-size:0.75rem;">📨 Simular Mensaje Entrante</button>
          </div>
          <div id="tg-conv-list" style="overflow-y:auto;flex:1;">${convListHTML}</div>
        </div>

        <!-- Center: Chat Thread -->
        <div class="card" style="overflow:hidden;display:flex;flex-direction:column;">
          ${selectedConv ? `
            <div style="padding:12px 16px;border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:10px;">
              <div style="width:38px;height:38px;border-radius:50%;background:rgba(34,158,217,0.2);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">${selectedConv.clientName?.charAt(0)?.toUpperCase() || '👤'}</div>
              <div>
                <div class="font-semibold text-primary">${selectedConv.clientName}</div>
                <div class="text-xs text-secondary">${selectedConv.clientUsername ? '@' + selectedConv.clientUsername : ''} · chat_id: ${selectedConv.chatId}</div>
              </div>
              <div class="d-flex gap-2 align-items-center ml-auto">
                <button class="btn btn-secondary btn-xs btn-resolve-conv" data-conv-id="${selectedConv.id}" style="font-size:0.7rem;padding:3px 8px;">✔️ Resolver</button>
              </div>
            </div>
            <div id="tg-messages-list" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;">${messagesHTML}</div>
            <div style="padding:12px 16px;border-top:1px solid var(--color-border);">
              <div class="d-flex gap-2 mb-2" style="flex-wrap:wrap;">
                <button class="btn-quick-reply btn btn-secondary" style="font-size:0.7rem;padding:2px 8px;" data-text="En un momento te atendemos 🙏">✋ Espera</button>
                <button class="btn-quick-reply btn btn-secondary" style="font-size:0.7rem;padding:2px 8px;" data-text="Gracias por comunicarte. ¿Hay algo más en que podamos ayudarte?">✅ Gracias</button>
                <button class="btn-quick-reply btn btn-secondary" style="font-size:0.7rem;padding:2px 8px;" data-text="Te contactaremos a la brevedad 📞">📞 Contacto</button>
              </div>
              <div class="d-flex gap-2">
                <input type="text" id="tg-reply-input" class="input input-md" placeholder="Escribe un mensaje (Markdown soportado)..." style="flex:1;" />
                <button class="btn btn-primary btn-sm" id="btn-tg-send" style="flex-shrink:0;background:#229ED9;border-color:#229ED9;">▶️ Enviar</button>
              </div>
            </div>
          ` : `
            <div class="d-flex flex-column align-items-center justify-content-center" style="flex:1;color:var(--color-text-secondary);">
              <div style="font-size:3rem;margin-bottom:12px;">✈️</div>
              <p style="font-size:0.875rem;">Selecciona una conversación para comenzar</p>
            </div>
          `}
        </div>

        <!-- Right: Subscriber Info -->
        <div class="card p-4 d-flex flex-column gap-3" style="overflow-y:auto;">
          <h4 class="font-semibold text-primary" style="font-size:0.875rem;">Ficha del Suscriptor</h4>
          ${selectedSub ? `
            <div class="d-flex flex-column gap-2" style="font-size:0.8rem;">
              <div><span class="text-secondary">Nombre:</span> <strong>${selectedSub.firstName || 'N/D'}</strong></div>
              <div><span class="text-secondary">Username:</span> ${selectedSub.username ? '@' + selectedSub.username : 'Sin username'}</div>
              <div><span class="text-secondary">chat_id:</span> <code style="font-size:0.7rem;">${selectedSub.chatId}</code></div>
              <div><span class="text-secondary">Suscrito:</span> ${selectedSub.subscribedAt ? new Date(selectedSub.subscribedAt).toLocaleDateString() : 'N/D'}</div>
              <div style="border-top:1px solid var(--color-border);padding-top:8px;margin-top:4px;">
                <div class="text-secondary">Etiquetas:</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
                  ${(selectedSub.tags || []).map(t => `<span style="font-size:0.65rem;padding:2px 6px;border-radius:var(--radius-xl);background:rgba(34,158,217,0.15);color:#229ED9;">${t}</span>`).join('') || '<span class="text-secondary text-xs">Sin etiquetas</span>'}
                </div>
              </div>
              <button class="btn btn-secondary btn-xs mt-2" id="btn-tg-ticket" style="font-size:0.72rem;">🎫 Crear Ticket de Soporte</button>
            </div>
          ` : `<div class="text-secondary text-xs text-center py-4">Sin suscriptor asociado a esta conversación.</div>`}

          ${selectedConv ? `
            <div style="border-top:1px solid var(--color-border);padding-top:12px;">
              <h4 class="font-semibold text-primary mb-2" style="font-size:0.8rem;">Estado</h4>
              <select id="tg-conv-status" class="input input-md" style="font-size:0.8rem;width:100%;background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-md);">
                <option value="OPEN" ${selectedConv.status === 'OPEN' ? 'selected' : ''}>🟢 Abierta</option>
                <option value="IN_PROGRESS" ${selectedConv.status === 'IN_PROGRESS' ? 'selected' : ''}>🔵 En Proceso</option>
                <option value="PENDING" ${selectedConv.status === 'PENDING' ? 'selected' : ''}>🟡 Pendiente</option>
                <option value="RESOLVED" ${selectedConv.status === 'RESOLVED' ? 'selected' : ''}>⚫ Resuelta</option>
              </select>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    // Bind conversation list clicks
    container.querySelectorAll('.tg-conv-item').forEach(item => {
      item.addEventListener('click', () => {
        this.state.selectedConvId = item.getAttribute('data-conv-id');
        this.renderTabContent(root);
      });
    });

    // Auto-scroll messages
    const msgList = container.querySelector('#tg-messages-list');
    if (msgList) msgList.scrollTop = msgList.scrollHeight;

    // Quick reply buttons
    container.querySelectorAll('.btn-quick-reply').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = container.querySelector('#tg-reply-input');
        if (input) input.value = btn.getAttribute('data-text');
        input?.focus();
      });
    });

    // Send message
    const sendBtn = container.querySelector('#btn-tg-send');
    const replyInput = container.querySelector('#tg-reply-input');
    if (sendBtn && replyInput && selectedConv) {
      const doSend = async () => {
        const text = replyInput.value.trim();
        if (!text) return;
        replyInput.value = '';
        sendBtn.disabled = true;

        const messages = selectedConv.messages ? Object.values(selectedConv.messages) : [];
        messages.push({
          id: 'msg_' + Date.now() + '_e',
          sender: 'EMPLOYEE',
          senderName: this.currentUser.displayName || this.currentUser.email || 'Agente',
          text,
          timestamp: Date.now()
        });
        try {
          await FirestoreService.setGlobal(this.companyId, `telegram_conversations/${selectedConv.id}`, {
            ...selectedConv, messages, lastMessage: text, updatedAt: Date.now()
          });
        } catch (e) { NotificationService.error('Error al enviar: ' + e.message); }
        sendBtn.disabled = false;
      };
      sendBtn.addEventListener('click', doSend);
      replyInput.addEventListener('keypress', e => { if (e.key === 'Enter') doSend(); });
    }

    // Resolve conversation
    container.querySelector('.btn-resolve-conv')?.addEventListener('click', async e => {
      const id = e.target.getAttribute('data-conv-id');
      const conv = this.state.conversations.find(c => c.id === id);
      if (conv && confirm('¿Marcar esta conversación como resuelta?')) {
        await FirestoreService.setGlobal(this.companyId, `telegram_conversations/${id}`, { ...conv, status: 'RESOLVED', updatedAt: Date.now() });
        NotificationService.success('Conversación resuelta.');
      }
    });

    // Status change
    container.querySelector('#tg-conv-status')?.addEventListener('change', async e => {
      if (selectedConv) {
        await FirestoreService.setGlobal(this.companyId, `telegram_conversations/${selectedConv.id}`, {
          ...selectedConv, status: e.target.value, updatedAt: Date.now()
        });
      }
    });

    // Simulate incoming message
    container.querySelector('#btn-tg-simulate')?.addEventListener('click', async () => {
      const chatId = prompt('chat_id del usuario (simulado):', '123456789');
      if (!chatId) return;
      const username = prompt('Username de Telegram (sin @):', 'cliente_demo');
      const text = prompt('Mensaje del cliente:', '¿Tienen Coca Cola en stock?');
      if (!text) return;
      try {
        await TelegramService.receiveIncomingMessage(this.companyId, chatId, username, text);
        NotificationService.success('Mensaje simulado — chatbot procesó la respuesta.');
      } catch (e) {
        NotificationService.error('Error: ' + e.message);
      }
    });

    // Create ticket
    container.querySelector('#btn-tg-ticket')?.addEventListener('click', () => {
      NotificationService.success(`🎫 Ticket creado para ${selectedSub?.firstName || selectedConv?.clientName || 'cliente'}.`);
    });
  }

  // ─── AUTOBOT TAB ───────────────────────────────────────────────────────────
  renderAutobotConfig(container) {
    const bot = this.state.config?.telegramBot || {};
    const auto = bot.autoResponder || {};
    const chatbotCfg = bot.chatbot || {};
    const commands = bot.commands || [
      { cmd: '/start', desc: 'Mensaje de bienvenida y menú principal' },
      { cmd: '/menu', desc: 'Mostrar opciones del negocio' },
      { cmd: '/pedido', desc: 'Consultar estado del último pedido' },
      { cmd: '/cita', desc: 'Ver próxima cita agendada' },
      { cmd: '/catalogo', desc: 'Ver link al catálogo en línea' }
    ];
    const faqs = auto.faqs || [];

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-5);color:var(--color-text-primary);" class="animate-fade-in">
        <!-- Left -->
        <div class="d-flex flex-column gap-4">

          <div class="card p-5 d-flex flex-column gap-3">
            <div class="d-flex justify-content-between align-items-center">
              <h3 class="font-semibold" style="font-size:0.9rem;">👋 Mensaje de Bienvenida (/start)</h3>
              <label class="tg-switch"><input type="checkbox" id="tg-toggle-welcome" ${auto.welcomeEnabled !== false ? 'checked' : ''} /><span class="tg-slider"></span></label>
            </div>
            <textarea id="tg-welcome-text" class="input input-md" style="height:80px;padding:var(--space-2);resize:vertical;font-size:0.85rem;">${auto.welcomeText || '👋 ¡Bienvenido(a) a nuestro bot de Telegram! Escríbenos lo que necesitas o usa el menú de opciones. 😊'}</textarea>
          </div>

          <div class="card p-5 d-flex flex-column gap-3">
            <div class="d-flex justify-content-between align-items-center">
              <h3 class="font-semibold" style="font-size:0.9rem;">🌙 Fuera de Horario</h3>
              <label class="tg-switch"><input type="checkbox" id="tg-toggle-ooo" ${auto.outOfOfficeEnabled ? 'checked' : ''} /><span class="tg-slider"></span></label>
            </div>
            <textarea id="tg-ooo-text" class="input input-md" style="height:70px;padding:var(--space-2);resize:vertical;font-size:0.85rem;">${auto.outOfOfficeText || 'En este momento estamos fuera de horario (8 AM – 8 PM). Tu mensaje fue registrado y te responderemos pronto. 🌙'}</textarea>
          </div>

          <div class="card p-5 d-flex flex-column gap-3">
            <div class="d-flex justify-content-between align-items-center">
              <h3 class="font-semibold" style="font-size:0.9rem;">❓ FAQs Automáticas</h3>
              <label class="tg-switch"><input type="checkbox" id="tg-toggle-faq" ${auto.faqEnabled ? 'checked' : ''} /><span class="tg-slider"></span></label>
            </div>
            <p class="text-secondary text-xs">Cuando el cliente escriba la palabra clave, el bot responde automáticamente.</p>
            <div id="tg-faq-list">
              ${faqs.length === 0 ? '<div class="text-xs text-secondary text-center py-3">Sin FAQs configuradas.</div>' : faqs.map((faq, idx) => `
                <div class="d-flex gap-2 align-items-center" style="padding:6px 0;border-bottom:1px solid var(--color-border);" data-faq-idx="${idx}">
                  <input type="text" class="input input-md faq-keyword" placeholder="Palabra clave" value="${faq.keyword || ''}" style="flex:1;" />
                  <input type="text" class="input input-md faq-response" placeholder="Respuesta" value="${faq.response || ''}" style="flex:2;" />
                  <button class="btn btn-danger btn-xs btn-del-faq" style="flex-shrink:0;padding:4px 8px;">🗑️</button>
                </div>
              `).join('')}
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-tg-add-faq">+ Agregar FAQ</button>
          </div>

          <!-- Bot Commands -->
          <div class="card p-5 d-flex flex-column gap-3">
            <h3 class="font-semibold" style="font-size:0.9rem;">⚡ Comandos del Bot</h3>
            <p class="text-secondary text-xs">Define los comandos que aparecen en el menú de Telegram de tu bot.</p>
            <div id="tg-commands-list">
              ${commands.map((c, idx) => `
                <div class="d-flex gap-2 align-items-center" style="padding:5px 0;border-bottom:1px solid var(--color-border);" data-cmd-idx="${idx}">
                  <input type="text" class="input input-md cmd-name" placeholder="/comando" value="${c.cmd}" style="flex:1;" />
                  <input type="text" class="input input-md cmd-desc" placeholder="Descripción" value="${c.desc}" style="flex:2;" />
                  <button class="btn btn-danger btn-xs btn-del-cmd" style="flex-shrink:0;padding:4px 8px;">🗑️</button>
                </div>
              `).join('')}
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-tg-add-cmd">+ Agregar Comando</button>
          </div>
        </div>

        <!-- Right -->
        <div class="d-flex flex-column gap-4">
          <div class="card p-5 d-flex flex-column gap-4">
            <h3 class="font-semibold" style="font-size:0.9rem;">🤖 Chatbot Inteligente</h3>

            ${[
              { id: 'tg-toggle-chatbot', label: 'Activar Chatbot', desc: 'Procesa y responde mensajes automáticamente', key: 'enabled' },
              { id: 'tg-toggle-stock', label: '🔍 Consulta de Inventario', desc: 'Responde consultas de disponibilidad de productos', key: 'queryStock' },
              { id: 'tg-toggle-orders', label: '📦 Consulta de Pedidos', desc: 'Informa el estado del último pedido del cliente', key: 'queryOrders' },
              { id: 'tg-toggle-appts', label: '📅 Consulta de Citas', desc: 'Informa próximas citas agendadas del cliente', key: 'queryAppointments' },
              { id: 'tg-toggle-assign', label: '🧑‍💼 Auto-Asignación', desc: 'Detecta "hablar con agente" y asigna la conversación', key: 'autoAssign' }
            ].map((item, i) => `
              <div class="d-flex justify-content-between align-items-center${i > 0 ? ' mt-1' : ''}">
                <div>
                  <div class="font-medium" style="font-size:0.875rem;">${item.label}</div>
                  <div class="text-secondary text-xs">${item.desc}</div>
                </div>
                <label class="tg-switch"><input type="checkbox" id="${item.id}" ${chatbotCfg[item.key] ? 'checked' : ''} /><span class="tg-slider"></span></label>
              </div>
              ${i < 4 ? '<hr style="border:0;border-top:1px solid var(--color-border);" />' : ''}
            `).join('')}
          </div>

          <!-- Chatbot Tester -->
          <div class="card p-5 d-flex flex-column gap-3">
            <h3 class="font-semibold" style="font-size:0.9rem;">🧪 Probar Chatbot en Vivo</h3>
            <p class="text-secondary text-xs">Envía un mensaje de prueba para ver la respuesta del chatbot en tiempo real.</p>
            <div class="d-flex gap-2">
              <input type="text" id="tg-bot-test-input" class="input input-md" placeholder="Ej: ¿Tienen Coca Cola?" style="flex:1;" />
              <button class="btn btn-primary btn-sm" id="btn-tg-test-bot" style="background:#229ED9;border-color:#229ED9;">Simular</button>
            </div>
            <div id="tg-test-result" style="display:none;background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:12px;font-size:0.8rem;white-space:pre-wrap;line-height:1.5;color:var(--color-text-primary);"></div>
          </div>

          <div class="d-flex justify-content-end">
            <button class="btn btn-primary btn-md" id="btn-tg-save-autobot" style="background:#229ED9;border-color:#229ED9;">💾 Guardar Configuración</button>
          </div>
        </div>
      </div>
    `;

    // Save
    container.querySelector('#btn-tg-save-autobot')?.addEventListener('click', async () => {
      const faqs = [];
      container.querySelectorAll('#tg-faq-list [data-faq-idx]').forEach(row => {
        const k = row.querySelector('.faq-keyword')?.value.trim();
        const r = row.querySelector('.faq-response')?.value.trim();
        if (k) faqs.push({ keyword: k, response: r });
      });

      const commands = [];
      container.querySelectorAll('#tg-commands-list [data-cmd-idx]').forEach(row => {
        const cmd = row.querySelector('.cmd-name')?.value.trim();
        const desc = row.querySelector('.cmd-desc')?.value.trim();
        if (cmd) commands.push({ cmd, desc });
      });

      const updated = {
        ...this.state.config,
        telegramBot: {
          ...(this.state.config?.telegramBot || {}),
          commands,
          autoResponder: {
            welcomeEnabled: container.querySelector('#tg-toggle-welcome').checked,
            welcomeText: container.querySelector('#tg-welcome-text').value.trim(),
            outOfOfficeEnabled: container.querySelector('#tg-toggle-ooo').checked,
            outOfOfficeText: container.querySelector('#tg-ooo-text').value.trim(),
            faqEnabled: container.querySelector('#tg-toggle-faq').checked,
            faqs
          },
          chatbot: {
            enabled: container.querySelector('#tg-toggle-chatbot').checked,
            queryStock: container.querySelector('#tg-toggle-stock').checked,
            queryOrders: container.querySelector('#tg-toggle-orders').checked,
            queryAppointments: container.querySelector('#tg-toggle-appts').checked,
            autoAssign: container.querySelector('#tg-toggle-assign').checked
          }
        },
        updatedAt: Date.now(), updatedAtLocal: TimeService.timestamp()
      };

      try {
        await FirestoreService.setGlobal(this.companyId, 'configuracion_catalogo', updated);
        NotificationService.success('Configuración del chatbot guardada.');
      } catch (e) { NotificationService.error(e.message); }
    });

    // Add FAQ
    container.querySelector('#btn-tg-add-faq')?.addEventListener('click', () => {
      const list = container.querySelector('#tg-faq-list');
      const idx = list.querySelectorAll('[data-faq-idx]').length;
      const div = document.createElement('div');
      div.className = 'd-flex gap-2 align-items-center';
      div.style = 'padding:6px 0;border-bottom:1px solid var(--color-border);';
      div.setAttribute('data-faq-idx', idx);
      div.innerHTML = `<input type="text" class="input input-md faq-keyword" placeholder="Palabra clave" style="flex:1;" /><input type="text" class="input input-md faq-response" placeholder="Respuesta" style="flex:2;" /><button class="btn btn-danger btn-xs btn-del-faq" style="flex-shrink:0;padding:4px 8px;">🗑️</button>`;
      list.appendChild(div);
    });

    container.addEventListener('click', e => {
      if (e.target.closest('.btn-del-faq')) e.target.closest('[data-faq-idx]')?.remove();
      if (e.target.closest('.btn-del-cmd')) e.target.closest('[data-cmd-idx]')?.remove();
    });

    // Add command
    container.querySelector('#btn-tg-add-cmd')?.addEventListener('click', () => {
      const list = container.querySelector('#tg-commands-list');
      const idx = list.querySelectorAll('[data-cmd-idx]').length;
      const div = document.createElement('div');
      div.className = 'd-flex gap-2 align-items-center';
      div.style = 'padding:5px 0;border-bottom:1px solid var(--color-border);';
      div.setAttribute('data-cmd-idx', idx);
      div.innerHTML = `<input type="text" class="input input-md cmd-name" placeholder="/comando" style="flex:1;" /><input type="text" class="input input-md cmd-desc" placeholder="Descripción" style="flex:2;" /><button class="btn btn-danger btn-xs btn-del-cmd" style="flex-shrink:0;padding:4px 8px;">🗑️</button>`;
      list.appendChild(div);
    });

    // Test chatbot
    container.querySelector('#btn-tg-test-bot')?.addEventListener('click', async () => {
      const text = container.querySelector('#tg-bot-test-input')?.value.trim();
      if (!text) return;
      const result = container.querySelector('#tg-test-result');
      result.style.display = 'block';
      result.textContent = '⏳ Procesando con el chatbot de Telegram...';
      try {
        const { botReply } = await TelegramService.receiveIncomingMessage(this.companyId, 'TEST_CHATID', 'test_user', text);
        result.textContent = `✅ Respuesta del Bot:\n\n${botReply}`;
      } catch (e) {
        result.textContent = '❌ Error: ' + e.message;
      }
    });
  }

  // ─── CARDS TAB ─────────────────────────────────────────────────────────────
  renderCards(container) {
    const botCfg = this.state.config?.telegramBot || {};
    const DEFAULT_CARDS = [
      { id: 'card_pedidos', title: 'Pedidos', description: 'Confirmaciones y estado de pedidos', icon: '📦', color: '#3b82f6', enabled: true, type: 'PEDIDOS', order: 0 },
      { id: 'card_citas', title: 'Citas', description: 'Confirmar, recordar y cancelar citas', icon: '📅', color: '#10b981', enabled: true, type: 'CITAS', order: 1 },
      { id: 'card_inventario', title: 'Inventario', description: 'Alertas de stock bajo y agotamiento', icon: '📊', color: '#f59e0b', enabled: true, type: 'INVENTARIO', order: 2 },
      { id: 'card_promociones', title: 'Promociones', description: 'Envío de ofertas y campañas del día', icon: '🎉', color: '#8b5cf6', enabled: false, type: 'PROMOCIONES', order: 3 },
      { id: 'card_soporte', title: 'Soporte', description: 'Derivar a empleado o crear ticket', icon: '🎧', color: '#ef4444', enabled: true, type: 'SOPORTE', order: 4 },
      { id: 'card_pagos', title: 'Pagos', description: 'Recordatorios y comprobantes de pago', icon: '💳', color: '#06b6d4', enabled: false, type: 'PAGOS', order: 5 }
    ];

    let cards = (botCfg.cards && botCfg.cards.length > 0) ? [...botCfg.cards] : [...DEFAULT_CARDS];
    cards.sort((a, b) => (a.order || 0) - (b.order || 0));

    container.innerHTML = `
      <div class="animate-fade-in d-flex flex-column gap-4" style="color:var(--color-text-primary);">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h3 class="font-semibold">🃏 Tarjetas Personalizables del Bot</h3>
            <p class="text-secondary text-xs mt-1">Arrastra para reordenar. Haz clic en una tarjeta para configurar su conexión. Activa o desactiva según las necesidades de tu negocio.</p>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-secondary btn-sm" id="btn-preview-bot-menu">👁️ Previsualizar Menú</button>
            <button class="btn btn-primary btn-sm" id="btn-add-card" style="background:#229ED9;border-color:#229ED9;">+ Nueva Tarjeta</button>
          </div>
        </div>

        <div id="tg-cards-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-4);">
          ${cards.map((card, idx) => `
            <div class="tg-card ${!card.enabled ? 'tg-card-disabled' : ''}" data-card-id="${card.id}" data-card-idx="${idx}" draggable="true">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                <div style="width:44px;height:44px;border-radius:var(--radius-md);background:${card.color}22;display:flex;align-items:center;justify-content:center;font-size:1.4rem;border:1px solid ${card.color}44;">${card.icon}</div>
                <label class="tg-switch" title="${card.enabled ? 'Desactivar' : 'Activar'}" onclick="event.stopPropagation()">
                  <input type="checkbox" class="card-toggle" data-card-id="${card.id}" ${card.enabled ? 'checked' : ''} />
                  <span class="tg-slider"></span>
                </label>
              </div>
              <div class="font-semibold" style="font-size:0.9rem;margin-bottom:4px;color:var(--color-text-primary);">${card.title}</div>
              <div class="text-secondary" style="font-size:0.75rem;line-height:1.4;">${card.description}</div>
              <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:0.65rem;padding:2px 6px;border-radius:var(--radius-xl);background:${card.color}22;color:${card.color};font-weight:600;">${card.type}</span>
                <button class="btn btn-secondary btn-edit-card" data-card-id="${card.id}" style="font-size:0.7rem;padding:2px 8px;">✏️ Editar</button>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Preview Modal -->
        <div id="tg-preview-panel" style="display:none;" class="card p-5">
          <h4 class="font-semibold mb-3">👁️ Previsualización del Menú en Telegram</h4>
          <p class="text-secondary text-xs mb-4">Así verá el cliente los botones de tu bot en Telegram:</p>
          <div style="background:#1a1a2e;border-radius:12px;padding:16px;max-width:360px;">
            <div style="background:#2a2a4a;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:0.875rem;color:#e2e8f0;">
              👋 ¡Hola! Soy tu asistente de ${this.state.config?.businessName || 'tu negocio'}.<br/>¿En qué puedo ayudarte?
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              ${cards.filter(c => c.enabled).map(c => `
                <button style="background:#229ED9;color:#fff;border:none;border-radius:8px;padding:8px 10px;font-size:0.78rem;cursor:default;display:flex;align-items:center;gap:6px;justify-content:center;">
                  ${c.icon} ${c.title}
                </button>
              `).join('')}
            </div>
          </div>
          <button class="btn btn-secondary btn-sm mt-3" id="btn-close-preview">Cerrar</button>
        </div>
      </div>

      <!-- Edit Card Modal (inline) -->
      <div id="tg-card-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:none;align-items:center;justify-content:center;">
        <div class="card p-6 d-flex flex-column gap-4" style="width:420px;max-width:95vw;background:var(--color-bg-primary);">
          <h3 class="font-semibold">✏️ Configurar Tarjeta</h3>
          <input type="hidden" id="modal-card-id" />
          <div class="form-group"><label class="form-label">Ícono (emoji)</label><input type="text" id="modal-card-icon" class="input input-md" placeholder="📦" /></div>
          <div class="form-group"><label class="form-label">Título</label><input type="text" id="modal-card-title" class="input input-md" /></div>
          <div class="form-group"><label class="form-label">Descripción</label><input type="text" id="modal-card-desc" class="input input-md" /></div>
          <div class="form-group"><label class="form-label">Color</label><input type="color" id="modal-card-color" style="width:60px;height:36px;border:none;background:none;cursor:pointer;" /></div>
          <div class="form-group">
            <label class="form-label">Tipo de Conexión</label>
            <select id="modal-card-type" class="input input-md" style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-md);color:var(--color-text-primary);">
              <option value="PEDIDOS">📦 Pedidos</option>
              <option value="CITAS">📅 Citas</option>
              <option value="INVENTARIO">📊 Inventario</option>
              <option value="PROMOCIONES">🎉 Promociones</option>
              <option value="SOPORTE">🎧 Soporte</option>
              <option value="PAGOS">💳 Pagos</option>
              <option value="PERSONALIZADO">✏️ Personalizado</option>
            </select>
          </div>
          <div class="d-flex gap-2 justify-content-end">
            <button class="btn btn-secondary btn-sm" id="btn-modal-cancel">Cancelar</button>
            <button class="btn btn-primary btn-sm" id="btn-modal-save" style="background:#229ED9;border-color:#229ED9;">Guardar Cambios</button>
          </div>
        </div>
      </div>
    `;

    // Remove the inline display:none that conflicts with flex
    const modal = container.querySelector('#tg-card-modal');
    modal.style.display = 'none';

    // Toggle card enabled state
    container.querySelectorAll('.card-toggle').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        const cardId = toggle.getAttribute('data-card-id');
        const updatedCards = cards.map(c => c.id === cardId ? { ...c, enabled: toggle.checked } : c);
        await this._saveCards(updatedCards);
      });
    });

    // Edit card
    container.querySelectorAll('.btn-edit-card').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const cardId = btn.getAttribute('data-card-id');
        const card = cards.find(c => c.id === cardId);
        if (!card) return;
        container.querySelector('#modal-card-id').value = card.id;
        container.querySelector('#modal-card-icon').value = card.icon;
        container.querySelector('#modal-card-title').value = card.title;
        container.querySelector('#modal-card-desc').value = card.description;
        container.querySelector('#modal-card-color').value = card.color || '#229ED9';
        container.querySelector('#modal-card-type').value = card.type || 'PERSONALIZADO';
        modal.style.display = 'flex';
      });
    });

    // Save modal
    container.querySelector('#btn-modal-save')?.addEventListener('click', async () => {
      const id = container.querySelector('#modal-card-id').value;
      const updatedCards = cards.map(c => c.id === id ? {
        ...c,
        icon: container.querySelector('#modal-card-icon').value,
        title: container.querySelector('#modal-card-title').value,
        description: container.querySelector('#modal-card-desc').value,
        color: container.querySelector('#modal-card-color').value,
        type: container.querySelector('#modal-card-type').value
      } : c);
      await this._saveCards(updatedCards);
      modal.style.display = 'none';
    });

    container.querySelector('#btn-modal-cancel')?.addEventListener('click', () => { modal.style.display = 'none'; });

    // Add new card
    container.querySelector('#btn-add-card')?.addEventListener('click', () => {
      const newCard = {
        id: 'card_' + Date.now(),
        title: 'Nueva Tarjeta',
        description: 'Descripción de la tarjeta',
        icon: '⭐',
        color: '#229ED9',
        enabled: false,
        type: 'PERSONALIZADO',
        order: cards.length
      };
      container.querySelector('#modal-card-id').value = newCard.id;
      container.querySelector('#modal-card-icon').value = newCard.icon;
      container.querySelector('#modal-card-title').value = newCard.title;
      container.querySelector('#modal-card-desc').value = newCard.description;
      container.querySelector('#modal-card-color').value = newCard.color;
      container.querySelector('#modal-card-type').value = newCard.type;
      cards.push(newCard);
      modal.style.display = 'flex';
    });

    // Preview
    container.querySelector('#btn-preview-bot-menu')?.addEventListener('click', () => {
      const panel = container.querySelector('#tg-preview-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    container.querySelector('#btn-close-preview')?.addEventListener('click', () => {
      container.querySelector('#tg-preview-panel').style.display = 'none';
    });

    // Drag-and-drop card reordering
    const grid = container.querySelector('#tg-cards-grid');
    let dragSrc = null;

    grid.querySelectorAll('.tg-card').forEach(card => {
      card.addEventListener('dragstart', () => {
        dragSrc = card;
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', async e => {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (dragSrc && dragSrc !== card) {
          const srcIdx = Number(dragSrc.getAttribute('data-card-idx'));
          const dstIdx = Number(card.getAttribute('data-card-idx'));
          const reordered = [...cards];
          const [moved] = reordered.splice(srcIdx, 1);
          reordered.splice(dstIdx, 0, moved);
          const updated = reordered.map((c, i) => ({ ...c, order: i }));
          await this._saveCards(updated);
        }
      });
    });
  }

  async _saveCards(cards) {
    try {
      const updated = {
        ...this.state.config,
        telegramBot: { ...(this.state.config?.telegramBot || {}), cards },
        updatedAt: Date.now(), updatedAtLocal: TimeService.timestamp()
      };
      await FirestoreService.setGlobal(this.companyId, 'configuracion_catalogo', updated);
      NotificationService.success('Tarjetas del bot guardadas.');
    } catch (e) {
      NotificationService.error('Error: ' + e.message);
    }
  }

  // ─── CAMPAIGNS TAB ─────────────────────────────────────────────────────────
  renderCampaigns(container) {
    const subs = this.state.subscribers || [];
    const activeSubs = subs.filter(s => s.active !== false);

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:var(--space-5);color:var(--color-text-primary);" class="animate-fade-in">
        <div class="card p-5 d-flex flex-column gap-4">
          <h3 class="font-semibold text-primary">📢 Nueva Campaña de Difusión</h3>

          <div class="form-group">
            <label class="form-label" for="tg-camp-name">Nombre de la Campaña</label>
            <input type="text" id="tg-camp-name" class="input input-md" placeholder="Ej: Oferta de Fin de Semana" />
          </div>

          <div class="form-group">
            <label class="form-label" for="tg-camp-segment">Segmento</label>
            <select id="tg-camp-segment" class="input input-md" style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-md);color:var(--color-text-primary);">
              <option value="ALL">🌍 Todos los Suscriptores (${subs.length})</option>
              <option value="ACTIVE">✅ Suscriptores Activos (${activeSubs.length})</option>
              <option value="DEBTORS">💳 Clientes con Deuda (${this.state.clients.filter(c => Number(c.currentDebt || 0) > 0).length})</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="tg-camp-message">Mensaje (Markdown de Telegram soportado)</label>
            <textarea id="tg-camp-message" class="input input-md" style="height:120px;padding:var(--space-2);resize:vertical;" placeholder="🎉 *¡Hola {{cliente}}!* Tenemos una oferta especial para ti hoy.&#10;&#10;Visítanos o escríbenos para más detalles.">🎉 *¡Hola {{cliente}}!* Tenemos una oferta especial para ti hoy.

Visítanos o escríbenos para más detalles. 😊</textarea>
            <p class="text-secondary text-xs mt-1">Variables: <code>{{cliente}}</code>, <code>{{username}}</code> · Markdown: *negrita*, _itálica_, \`código\`</p>
          </div>

          <div id="tg-camp-progress-wrap" style="display:none;" class="d-flex flex-column gap-2">
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;">
              <span>Enviando mensajes...</span>
              <span id="tg-camp-progress-label" class="font-semibold" style="color:#229ED9;">0%</span>
            </div>
            <div style="height:8px;background:var(--color-bg-secondary);border-radius:var(--radius-xl);overflow:hidden;">
              <div id="tg-camp-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#229ED9,#0c3b5e);border-radius:var(--radius-xl);transition:width 0.3s ease;"></div>
            </div>
          </div>

          <button class="btn btn-primary btn-md" id="btn-tg-launch" style="background:#229ED9;border-color:#229ED9;">🚀 Lanzar Campaña de Telegram</button>
        </div>

        <div class="card p-5 d-flex flex-column gap-3">
          <div class="d-flex justify-content-between align-items-center">
            <h3 class="font-semibold text-primary">📋 Historial de Envíos</h3>
            <span class="text-secondary text-xs">${this.state.logs.length} registros</span>
          </div>
          <div style="overflow-y:auto;max-height:420px;">
            ${this.state.logs.length === 0
              ? '<div class="text-center text-secondary text-xs py-6">No hay campañas enviadas aún.</div>'
              : [...this.state.logs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 25).map(log => `
                <div style="padding:10px 0;border-bottom:1px solid var(--color-border);font-size:0.78rem;">
                  <div style="display:flex;justify-content:space-between;">
                    <span class="font-semibold text-primary">chat_id: ${log.to}</span>
                    <span style="color:var(--color-success);font-size:0.7rem;font-weight:bold;">${log.status}</span>
                  </div>
                  <div class="text-secondary" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90%;">${log.messageContent}</div>
                  <div class="text-secondary text-right" style="font-size:0.65rem;">${new Date(log.timestamp).toLocaleString()} · ${log.gateway}</div>
                </div>
              `).join('')
            }
          </div>
        </div>
      </div>
    `;

    container.querySelector('#btn-tg-launch')?.addEventListener('click', async () => {
      const name = container.querySelector('#tg-camp-name').value.trim() || 'Campaña Telegram';
      const segment = container.querySelector('#tg-camp-segment').value;
      const message = container.querySelector('#tg-camp-message').value.trim();

      if (!message) { alert('Ingresa el mensaje de la campaña.'); return; }

      const total = segment === 'ACTIVE' ? activeSubs.length : segment === 'DEBTORS'
        ? this.state.clients.filter(c => Number(c.currentDebt || 0) > 0).length
        : subs.length;

      if (total === 0) { alert('No hay suscriptores en el segmento seleccionado.'); return; }
      if (!confirm(`¿Enviar "${name}" a ${total} suscriptores?`)) return;

      const btn = container.querySelector('#btn-tg-launch');
      btn.disabled = true;
      const wrap = container.querySelector('#tg-camp-progress-wrap');
      const bar = container.querySelector('#tg-camp-progress-bar');
      const lbl = container.querySelector('#tg-camp-progress-label');
      wrap.style.display = 'block';

      let fakeP = 0;
      const iv = setInterval(() => {
        fakeP = Math.min(fakeP + 100 / total / 2, 95);
        bar.style.width = fakeP + '%';
        lbl.textContent = Math.round(fakeP) + '%';
      }, 120);

      try {
        const sent = await TelegramService.sendBroadcast(this.companyId, segment, message);
        clearInterval(iv);
        bar.style.width = '100%';
        lbl.textContent = '100%';
        NotificationService.success(`✅ Campaña "${name}" enviada a ${sent} suscriptores de Telegram.`);
      } catch (e) {
        clearInterval(iv);
        NotificationService.error('Error: ' + e.message);
      } finally {
        setTimeout(() => { wrap.style.display = 'none'; bar.style.width = '0%'; btn.disabled = false; btn.textContent = '🚀 Lanzar Campaña de Telegram'; }, 2000);
      }
    });
  }

  // ─── STATS TAB ─────────────────────────────────────────────────────────────
  renderStats(container) {
    const logs = this.state.logs || [];
    const convs = this.state.conversations || [];
    const subs = this.state.subscribers || [];

    const totalSent = logs.filter(l => l.status === 'DELIVERED').length;
    const autoReplies = logs.filter(l => l.templateName === 'AUTO_REPLY').length;
    const broadcasts = logs.filter(l => l.templateName === 'BROADCAST').length;
    const openConvs = convs.filter(c => c.status === 'OPEN').length;
    const resolvedConvs = convs.filter(c => c.status === 'RESOLVED').length;
    const activeSubs = subs.filter(s => s.active !== false).length;

    const now = Date.now();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - i * 86_400_000);
      return d.toLocaleDateString('es-MX', { weekday: 'short' });
    }).reverse();

    const maxCount = Math.max(1, ...days.map(dl => logs.filter(l => new Date(l.timestamp).toLocaleDateString('es-MX', { weekday: 'short' }) === dl).length));

    container.innerHTML = `
      <div class="animate-fade-in d-flex flex-column gap-5" style="color:var(--color-text-primary);">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--space-4);">
          ${[
            { label: 'Mensajes Enviados', val: totalSent, icon: '📤', color: '#229ED9' },
            { label: 'Auto-Respuestas', val: autoReplies, icon: '🤖', color: 'var(--color-success)' },
            { label: 'Campañas Enviadas', val: broadcasts, icon: '📢', color: '#f59e0b' },
            { label: 'Conversaciones Abiertas', val: openConvs, icon: '💬', color: 'var(--color-danger)' },
            { label: 'Conversaciones Resueltas', val: resolvedConvs, icon: '✅', color: 'var(--color-success)' },
            { label: 'Suscriptores del Bot', val: activeSubs, icon: '👥', color: '#229ED9' }
          ].map(kpi => `
            <div class="card p-4 hover-lift" style="border-left:4px solid ${kpi.color};">
              <div style="font-size:1.5rem;margin-bottom:6px;">${kpi.icon}</div>
              <div class="text-secondary text-xs">${kpi.label}</div>
              <div class="font-bold" style="font-size:1.6rem;color:${kpi.color};">${kpi.val}</div>
            </div>
          `).join('')}
        </div>

        <div class="card p-5">
          <h3 class="font-semibold mb-4">Actividad de Mensajería — Últimos 7 días</h3>
          <div style="display:flex;align-items:flex-end;gap:16px;height:110px;padding:0 16px;">
            ${days.map(dl => {
              const count = logs.filter(l => new Date(l.timestamp).toLocaleDateString('es-MX', { weekday: 'short' }) === dl).length;
              const h = Math.max(4, Math.round((count / maxCount) * 80));
              return `<div class="d-flex flex-column align-items-center gap-1" style="flex:1;">
                <span class="text-xs text-secondary">${count}</span>
                <div style="width:100%;height:${h}px;background:linear-gradient(180deg,#229ED9,#0c3b5e);border-radius:4px 4px 0 0;min-height:4px;transition:height 0.5s ease;"></div>
                <span class="text-xs text-secondary">${dl}</span>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="card p-5">
          <h3 class="font-semibold mb-4">Registro Reciente (${Math.min(logs.length, 10)} de ${logs.length})</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
              <thead><tr style="border-bottom:1px solid var(--color-border);text-align:left;">
                <th style="padding:8px;color:var(--color-text-secondary);">chat_id</th>
                <th style="padding:8px;color:var(--color-text-secondary);">Plantilla</th>
                <th style="padding:8px;color:var(--color-text-secondary);">Gateway</th>
                <th style="padding:8px;color:var(--color-text-secondary);">Estado</th>
                <th style="padding:8px;color:var(--color-text-secondary);">Hora</th>
              </tr></thead>
              <tbody>
                ${[...logs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 10).map(log => `
                  <tr style="border-bottom:1px solid var(--color-border);">
                    <td style="padding:8px;">${log.to}</td>
                    <td style="padding:8px;color:#229ED9;">${log.templateName}</td>
                    <td style="padding:8px;">${log.gateway}</td>
                    <td style="padding:8px;color:var(--color-success);font-weight:bold;">${log.status}</td>
                    <td style="padding:8px;color:var(--color-text-secondary);">${new Date(log.timestamp).toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ─── SETTINGS TAB ──────────────────────────────────────────────────────────
  renderSettings(container) {
    const bot = this.state.config?.telegramBot || {};
    const templates = bot.templates || {};
    const webhookUrl = `${window.location.origin}/webhook/telegram/${this.companyId}`;

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:var(--space-5);color:var(--color-text-primary);" class="animate-fade-in">
        <div class="d-flex flex-column gap-4">
          <div class="card p-5 d-flex flex-column gap-3">
            <h3 class="font-semibold text-primary">🔑 Credenciales del Bot</h3>
            <div style="background:rgba(34,158,217,0.08);border:1px solid rgba(34,158,217,0.2);border-radius:var(--radius-md);padding:10px 14px;font-size:0.8rem;color:var(--color-text-secondary);">
              💡 Para crear un bot: abre Telegram, escribe a <strong>@BotFather</strong>, y usa el comando <code>/newbot</code>. Te dará el token en segundos. La API es <strong>100% gratuita</strong>.
            </div>

            <div class="form-group">
              <label class="form-label" for="tg-bot-token">Bot Token (de @BotFather)</label>
              <div style="position:relative;display:flex;align-items:center;">
                <input type="password" id="tg-bot-token" class="input input-md" style="padding-right:44px;" placeholder="1234567890:AAAA..." value="${bot.botToken || ''}" />
                <button type="button" id="btn-tg-toggle-token" style="position:absolute;right:10px;border:none;background:none;cursor:pointer;font-size:1.1rem;color:var(--color-text-secondary);">👁️</button>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="tg-bot-username">Bot Username</label>
                <input type="text" id="tg-bot-username" class="input input-md" placeholder="@MiNegocioBot" value="${bot.botUsername || ''}" />
              </div>
              <div class="form-group">
                <label class="form-label" for="tg-owner-chatid">Tu chat_id (para alertas)</label>
                <input type="text" id="tg-owner-chatid" class="input input-md" placeholder="123456789" value="${bot.ownerChatId || ''}" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Webhook URL de Entrada</label>
              <input type="text" class="input input-md" value="${webhookUrl}" readonly style="opacity:0.6;font-family:monospace;font-size:0.75rem;" />
            </div>

            <button type="button" class="btn btn-primary btn-sm align-self-end" id="btn-tg-save-settings" style="background:#229ED9;border-color:#229ED9;">💾 Guardar Credenciales</button>
          </div>

          <div class="card p-5 d-flex flex-column gap-3">
            <h3 class="font-semibold text-primary">📋 Plantillas de Mensajes</h3>
            <p class="text-secondary text-xs">Soportan formato Markdown de Telegram: *negrita*, _itálica_, \`código\`</p>
            ${[
              { key: 'ORDER_CONFIRMATION', label: 'Confirmación de Pedido', placeholder: '🛍️ *¡Pedido Confirmado!* ...' },
              { key: 'STOCK_ALERT', label: 'Alerta de Inventario', placeholder: '⚠️ *Alerta:* Stock bajo...' },
              { key: 'APPOINTMENT_REMINDER', label: 'Recordatorio de Cita', placeholder: '📅 *Recordatorio:* Tienes una cita...' },
              { key: 'PROMOTION', label: 'Promoción / Difusión', placeholder: '🎉 *¡Oferta especial!* ...' },
              { key: 'PAYMENT_REMINDER', label: 'Recordatorio de Pago', placeholder: '💳 *Pago pendiente* ...' }
            ].map(t => `
              <div class="form-group">
                <label class="form-label">${t.label}</label>
                <textarea id="tg-tmpl-${t.key.toLowerCase()}" class="input input-md" style="height:65px;padding:var(--space-2);font-size:0.78rem;resize:vertical;" placeholder="${t.placeholder}">${templates[t.key] || TelegramService.getDefaultTemplate(t.key)}</textarea>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="d-flex flex-column gap-4">
          <div class="card p-5 d-flex flex-column gap-3">
            <h3 class="font-semibold text-primary">🔌 Consola de Prueba</h3>
            <p class="text-secondary text-xs">Introduce un chat_id y valida que el token funciona correctamente.</p>
            <div class="form-group">
              <label class="form-label">Tu chat_id de Telegram</label>
              <div class="d-flex gap-2">
                <input type="text" id="tg-test-chatid" class="input input-md" placeholder="123456789" style="flex:1;" />
                <button class="btn btn-secondary btn-sm" id="btn-tg-run-test" style="flex-shrink:0;">Probar</button>
              </div>
              <p class="text-secondary text-xs mt-1">💡 Envía /start a @userinfobot en Telegram para obtener tu chat_id.</p>
            </div>
            <div id="tg-terminal" style="display:none;background:#0f172a;border:1px solid var(--color-border);border-radius:var(--radius-md);font-family:monospace;font-size:0.72rem;white-space:pre-wrap;max-height:300px;overflow-y:auto;color:#a7f3d0;line-height:1.5;padding:12px;"></div>
          </div>

          <div class="card p-4">
            <h3 class="font-semibold text-primary mb-3" style="font-size:0.9rem;">📖 Cómo Conectar tu Bot</h3>
            <ol style="font-size:0.8rem;color:var(--color-text-secondary);line-height:1.9;padding-left:20px;">
              <li>Abre Telegram y busca <strong>@BotFather</strong></li>
              <li>Escribe <code>/newbot</code> y sigue las instrucciones</li>
              <li>Copia el <strong>token</strong> que te da BotFather</li>
              <li>Pégalo en el campo "Bot Token" de arriba</li>
              <li>Haz clic en <strong>Guardar Credenciales</strong></li>
              <li>Prueba la conexión con tu chat_id personal</li>
              <li>¡Listo! Tu bot ya puede recibir mensajes 🎉</li>
            </ol>
          </div>
        </div>
      </div>
    `;

    // Toggle token
    container.querySelector('#btn-tg-toggle-token')?.addEventListener('click', () => {
      const inp = container.querySelector('#tg-bot-token');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });

    // Save settings
    container.querySelector('#btn-tg-save-settings')?.addEventListener('click', async () => {
      const botToken = container.querySelector('#tg-bot-token').value.trim();
      const botUsername = container.querySelector('#tg-bot-username').value.trim();
      const ownerChatId = container.querySelector('#tg-owner-chatid').value.trim();

      const tplKeys = ['ORDER_CONFIRMATION', 'STOCK_ALERT', 'APPOINTMENT_REMINDER', 'PROMOTION', 'PAYMENT_REMINDER'];
      const templates = {};
      tplKeys.forEach(k => {
        templates[k] = container.querySelector(`#tg-tmpl-${k.toLowerCase()}`)?.value.trim() || '';
      });

      const updated = {
        ...this.state.config,
        telegramBot: {
          ...(this.state.config?.telegramBot || {}),
          botToken, botUsername, ownerChatId, templates
        },
        updatedAt: Date.now(), updatedAtLocal: TimeService.timestamp()
      };

      try {
        await FirestoreService.setGlobal(this.companyId, 'configuracion_catalogo', updated);
        NotificationService.success('Credenciales del bot guardadas.');
      } catch (e) { NotificationService.error(e.message); }
    });

    // Test connection
    container.querySelector('#btn-tg-run-test')?.addEventListener('click', () => {
      const chatId = container.querySelector('#tg-test-chatid').value.trim();
      if (!chatId) return;
      const token = container.querySelector('#tg-bot-token').value.trim();
      const terminal = container.querySelector('#tg-terminal');
      terminal.style.display = 'block';
      terminal.textContent = '> Iniciando prueba de conexión con Telegram Bot API...\n> Paso 1: getMe — validando token del bot...\n';

      setTimeout(() => {
        const result = TelegramService.testConnection(token, chatId);
        terminal.textContent += `> Latencia: ${result.response.simulationMeta.latencyMs}ms ✅\n\n`;
        terminal.textContent += `[getMe Response]:\n${JSON.stringify(result.response.getMe, null, 2)}\n\n`;
        terminal.textContent += `[sendMessage Response]:\n${JSON.stringify(result.response.sendMessage, null, 2)}`;
        terminal.scrollTop = terminal.scrollHeight;
        NotificationService.success('✅ Bot conectado correctamente (Simulado).');
      }, 1200);
    });
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}
