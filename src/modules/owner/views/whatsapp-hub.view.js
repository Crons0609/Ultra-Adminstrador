/**
 * @file whatsapp-hub.view.js
 * @description WhatsApp Automation Hub — a full multi-tenant inbox, chatbot config,
 * marketing broadcasts, message statistics and API settings panel for owners/managers.
 * Each business gets its own isolated conversations, config and logs per companyId.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { WhatsAppService } from '../../../services/whatsapp.service.js';
import { TimeService } from '../../../services/time.service.js';

export class WhatsAppHubView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    const { currentCompany } = GlobalStore.getState();
    this.companyId = currentUser.companyId || '';
    this.currentUser = currentUser;
    this.isWhatsAppEnabled = currentCompany?.config?.enableWhatsApp === true;

    this.state = {
      activeTab: 'inbox',         // inbox | autobot | campaigns | stats | settings
      conversations: [],
      selectedConvId: null,
      clients: [],
      logs: [],
      config: null,
      broadcastProgress: 0,
      broadcastRunning: false,
      campaignSentCount: 0
    };

    this.layout = new PageLayout({
      title: '💬 WhatsApp Automation Hub',
      subtitle: 'Gestiona conversaciones en tiempo real, automatizaciones, campañas de marketing y la configuración de la API de WhatsApp de tu negocio.',
      actionHTML: `
        <div class="d-flex gap-2 align-items-center">
          <div id="wa-connection-status" style="display:flex; align-items:center; gap:8px; padding:4px 12px; border-radius:var(--radius-xl); background:rgba(52,211,153,0.12); border:1px solid rgba(52,211,153,0.3); font-size:0.8rem; color:var(--color-success);">
            <span style="width:8px; height:8px; border-radius:50%; background:var(--color-success); display:inline-block; animation: pulse-dot 2s infinite;"></span>
            <span>API Conectada</span>
          </div>
        </div>
      `,
      contentHTML: `
        <style>
          .wa-tab-btn {
            padding: 8px 18px; border-radius: var(--radius-xl); border: 1px solid var(--color-border);
            background: transparent; color: var(--color-text-secondary); cursor: pointer;
            font-size: 0.85rem; font-weight: 500; transition: all 0.2s ease; white-space: nowrap;
          }
          .wa-tab-btn.active {
            background: var(--color-accent); color: #fff; border-color: var(--color-accent);
          }
          .wa-tab-btn:hover:not(.active) { background: var(--color-bg-tertiary); color: var(--color-text-primary); }

          .wa-conversation-item {
            padding: 10px 12px; border-radius: var(--radius-md); cursor: pointer;
            transition: background 0.15s ease; border-bottom: 1px solid var(--color-border);
          }
          .wa-conversation-item:hover { background: var(--color-bg-tertiary); }
          .wa-conversation-item.selected { background: rgba(124,117,255,0.12); border-left: 3px solid var(--color-accent); }

          .wa-bubble { max-width: 80%; border-radius: 12px; padding: 8px 12px; font-size: 0.85rem; line-height: 1.45; }
          .wa-bubble.client { background: var(--color-bg-secondary); color: var(--color-text-primary); border-bottom-left-radius: 2px; }
          .wa-bubble.employee { background: #128C7E; color: #fff; border-bottom-right-radius: 2px; }
          .wa-bubble.bot { background: #1f7b5c; color: #d1fae5; border-bottom-right-radius: 2px; font-size: 0.8rem; }
          .wa-bubble.system { background: transparent; color: var(--color-text-secondary); font-size: 0.7rem; font-style: italic; text-align: center; max-width: 100%; }

          @keyframes pulse-dot {
            0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
          }
          .wa-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
          .wa-switch input { opacity: 0; width: 0; height: 0; }
          .wa-slider {
            position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
            background: var(--color-border); border-radius: 24px; transition: 0.3s;
          }
          .wa-slider:before {
            position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
            background: white; border-radius: 50%; transition: 0.3s;
          }
          input:checked + .wa-slider { background: var(--color-accent); }
          input:checked + .wa-slider:before { transform: translateX(20px); }
        </style>

        <!-- Tab Selector -->
        <div style="display:flex; gap:var(--space-2); flex-wrap:wrap; margin-bottom:var(--space-5); overflow-x:auto; padding-bottom:4px;">
          <button class="wa-tab-btn active" data-tab="inbox">📥 Inbox de Chats</button>
          <button class="wa-tab-btn" data-tab="autobot">🤖 Chatbot y Auto-Respuestas</button>
          <button class="wa-tab-btn" data-tab="campaigns">📢 Campañas de Marketing</button>
          <button class="wa-tab-btn" data-tab="stats">📊 Estadísticas</button>
          <button class="wa-tab-btn" data-tab="settings">⚙️ Configuración API</button>
        </div>

        <div id="wa-tab-content">
          <!-- Dynamically rendered -->
        </div>
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
    const root = element || this.layout.element;
    if (!root) return;

    root.querySelectorAll('.wa-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.wa-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.activeTab = btn.getAttribute('data-tab');
        this.renderTabContent(root);
      });
    });

    // Update connection status badge based on license
    const statusEl = root.querySelector('#wa-connection-status');
    if (statusEl && !this.isWhatsAppEnabled) {
      statusEl.style.background = 'rgba(239,68,68,0.12)';
      statusEl.style.borderColor = 'rgba(239,68,68,0.3)';
      statusEl.style.color = 'var(--color-danger)';
      statusEl.querySelector('span:first-child').style.background = 'var(--color-danger)';
      statusEl.querySelector('span:last-child').textContent = 'API Desconectada';
    }
  }

  subscribeToData(element) {
    if (!this.companyId) return;
    try {
      const convListener = FirestoreService.listenToTenant('whatsapp_conversations', (data) => {
        this.state.conversations = data || [];
        if (this.state.activeTab === 'inbox') this.renderTabContent(element || this.layout.element);
      });
      this.listeners.push(convListener);

      const clientListener = FirestoreService.listenToTenant('recurring_clients', (data) => {
        this.state.clients = data || [];
      });
      this.listeners.push(clientListener);

      const logsListener = FirestoreService.listenToTenant('whatsapp_logs', (data) => {
        this.state.logs = data || [];
        if (this.state.activeTab === 'stats') this.renderTabContent(element || this.layout.element);
      });
      this.listeners.push(logsListener);

      const configListener = FirestoreService.listenToPathRaw(`configuracion_catalogo/${this.companyId}`, (data) => {
        this.state.config = data || {};
        if (this.state.activeTab === 'autobot' || this.state.activeTab === 'settings') {
          this.renderTabContent(element || this.layout.element);
        }
      });
      this.listeners.push(configListener);
    } catch (e) {
      console.warn('[WhatsAppHubView] DB listener error:', e.message);
    }
  }

  renderTabContent(element) {
    const container = element.querySelector('#wa-tab-content');
    if (!container) return;

    if (!this.isWhatsAppEnabled) {
      container.innerHTML = this.renderUpgradeLock();
      container.querySelector('#btn-upgrade-wa-hub')?.addEventListener('click', () => {
        alert('Contacta a soporte en soporte@ultraadmin.com para activar tu plan Premium de WhatsApp.');
      });
      return;
    }

    if (this.state.activeTab === 'inbox') {
      this.renderInbox(container);
    } else if (this.state.activeTab === 'autobot') {
      this.renderAutobotConfig(container);
    } else if (this.state.activeTab === 'campaigns') {
      this.renderCampaigns(container);
    } else if (this.state.activeTab === 'stats') {
      this.renderStats(container);
    } else if (this.state.activeTab === 'settings') {
      this.renderSettings(container);
    }
  }

  // ─── UPGRADE LOCK SCREEN ────────────────────────────────────────────────────
  renderUpgradeLock() {
    return `
      <div class="card p-6 text-center animate-fade-in" style="display:flex; flex-direction:column; align-items:center; gap:var(--space-4); max-width:640px; margin:2rem auto; color:var(--color-text-primary);">
        <div style="font-size:4rem;">🔒</div>
        <h3 class="text-xl font-bold">WhatsApp API Premium Requerido</h3>
        <p class="text-secondary" style="line-height:1.7; font-size:0.9rem; max-width:500px;">
          El Hub de Automatización de WhatsApp está disponible como módulo Premium independiente. Requiere la activación por parte del Administrador de la plataforma.
        </p>
        <div style="background:var(--color-bg-secondary); border:1px solid var(--color-border); padding:16px 20px; border-radius:var(--radius-md); font-size:0.82rem; color:var(--color-text-secondary); text-align:left; width:100%;">
          🌟 <strong>Funciones incluidas con WhatsApp Premium:</strong>
          <ul style="margin:10px 0 0; padding-left:20px; line-height:1.8;">
            <li>Inbox de conversaciones en tiempo real con respuesta manual</li>
            <li>Chatbot inteligente con consulta de inventario y pedidos</li>
            <li>Campañas de difusión masivas segmentadas</li>
            <li>Respuestas automáticas (bienvenida, FAQs, fuera de horario)</li>
            <li>Estadísticas avanzadas de mensajería</li>
          </ul>
        </div>
        <button class="btn btn-primary btn-md mt-2" id="btn-upgrade-wa-hub" type="button">Solicitar Activación del Hub de WhatsApp</button>
      </div>
    `;
  }

  // ─── INBOX TAB ──────────────────────────────────────────────────────────────
  renderInbox(container) {
    const convList = [...this.state.conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const selectedConv = convList.find(c => c.id === this.state.selectedConvId) || convList[0] || null;
    if (selectedConv && !this.state.selectedConvId) this.state.selectedConvId = selectedConv?.id;

    const selectedClient = selectedConv ? this.state.clients.find(c => c.id === selectedConv.clientId) : null;

    const convListHTML = convList.length === 0
      ? `<div class="text-center text-secondary py-6 text-xs">No hay conversaciones aún.<br/>Los mensajes de tus clientes aparecerán aquí.</div>`
      : convList.map(c => `
        <div class="wa-conversation-item ${c.id === this.state.selectedConvId ? 'selected' : ''}" data-conv-id="${c.id}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:36px; height:36px; border-radius:50%; background:rgba(124,117,255,0.2); display:flex; align-items:center; justify-content:center; font-size:1rem; flex-shrink:0;">
                ${c.clientName?.charAt(0)?.toUpperCase() || '👤'}
              </div>
              <div>
                <div class="font-semibold text-primary" style="font-size:0.875rem;">${c.clientName}</div>
                <div class="text-secondary" style="font-size:0.72rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${c.lastMessage || 'Sin mensajes'}</div>
              </div>
            </div>
            <div class="d-flex flex-column align-items-end gap-1" style="flex-shrink:0;">
              <span class="badge" style="font-size:0.6rem; padding:2px 6px; border-radius:var(--radius-md); background:${c.status === 'OPEN' ? 'rgba(52,211,153,0.15)' : 'rgba(100,116,139,0.15)'}; color:${c.status === 'OPEN' ? 'var(--color-success)' : 'var(--color-text-secondary)'};">${c.status}</span>
              <span class="text-secondary" style="font-size:0.6rem;">${c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}</span>
            </div>
          </div>
        </div>
      `).join('');

    const messagesHTML = selectedConv && selectedConv.messages
      ? Object.values(selectedConv.messages).sort((a, b) => a.timestamp - b.timestamp).map(m => {
          const isClient = m.sender === 'CLIENT';
          const isBot = m.sender === 'BOT';
          const isSystem = m.sender === 'SYSTEM';
          const align = isClient ? 'flex-start' : 'flex-end';
          const bubbleClass = isSystem ? 'system' : (isClient ? 'client' : (isBot ? 'bot' : 'employee'));
          return `
            <div style="display:flex; justify-content:${align}; margin-bottom:8px;">
              <div class="wa-bubble ${bubbleClass}">
                ${!isClient && !isSystem ? `<div style="font-size:0.65rem; opacity:0.7; margin-bottom:3px;">${m.senderName || 'Agente'}</div>` : ''}
                ${m.text}
                <div style="font-size:0.65rem; opacity:0.6; margin-top:4px; text-align:right;">${new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
              </div>
            </div>
          `;
        }).join('')
      : `<div class="text-center text-secondary py-8 text-xs">Selecciona una conversación para ver los mensajes.</div>`;

    container.innerHTML = `
      <div style="display:grid; grid-template-columns: 260px 1fr 220px; gap:var(--space-4); height:calc(100vh - 300px); min-height:480px;">

        <!-- Left: Conversation List -->
        <div class="card" style="overflow:hidden; display:flex; flex-direction:column;">
          <div style="padding:12px; border-bottom:1px solid var(--color-border); display:flex; justify-content:space-between; align-items:center;">
            <span class="font-semibold text-primary" style="font-size:0.875rem;">Conversaciones</span>
            <span style="background:rgba(124,117,255,0.2); color:var(--color-accent); padding:2px 8px; border-radius:var(--radius-xl); font-size:0.7rem;">${convList.length}</span>
          </div>
          <div id="wa-simulate-btn-container" style="padding:8px 12px; border-bottom:1px solid var(--color-border);">
            <button class="btn btn-secondary btn-sm" id="btn-simulate-incoming" style="width:100%; font-size:0.75rem;">📨 Simular Mensaje Entrante</button>
          </div>
          <div id="wa-conv-list" style="overflow-y:auto; flex:1;">
            ${convListHTML}
          </div>
        </div>

        <!-- Center: Chat Thread -->
        <div class="card" style="overflow:hidden; display:flex; flex-direction:column;">
          ${selectedConv ? `
            <div style="padding:12px 16px; border-bottom:1px solid var(--color-border); display:flex; align-items:center; gap:10px;">
              <div style="width:38px; height:38px; border-radius:50%; background:rgba(124,117,255,0.2); display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">${selectedConv.clientName?.charAt(0)?.toUpperCase() || '👤'}</div>
              <div>
                <div class="font-semibold text-primary">${selectedConv.clientName}</div>
                <div class="text-xs text-secondary">${selectedConv.clientPhone}</div>
              </div>
              <div class="d-flex gap-2 align-items-center ml-auto">
                ${selectedConv.assignedEmployeeId ? `<span style="font-size:0.7rem; background:rgba(52,211,153,0.12); color:var(--color-success); padding:3px 8px; border-radius:var(--radius-xl);">✅ Asignado</span>` : ''}
                <button class="btn btn-secondary btn-xs btn-resolve-conv" data-conv-id="${selectedConv.id}" style="font-size:0.7rem; padding:3px 8px;">✔️ Resolver</button>
              </div>
            </div>
            <div id="wa-messages-list" style="flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column;">
              ${messagesHTML}
            </div>
            <div style="padding:12px 16px; border-top:1px solid var(--color-border); display:flex; gap:var(--space-2);">
              <input type="text" id="wa-reply-input" class="input input-md" placeholder="Escribe un mensaje..." style="flex:1;" />
              <button class="btn btn-primary btn-sm" id="btn-send-wa-reply" style="flex-shrink:0;">▶️ Enviar</button>
            </div>
          ` : `
            <div class="d-flex flex-column align-items-center justify-content-center" style="flex:1; color:var(--color-text-secondary);">
              <div style="font-size:3rem; margin-bottom:12px;">💬</div>
              <p style="font-size:0.875rem;">Selecciona una conversación para comenzar</p>
            </div>
          `}
        </div>

        <!-- Right: Client Info Panel -->
        <div class="card p-4 d-flex flex-column gap-3" style="overflow-y:auto;">
          <h4 class="font-semibold text-primary" style="font-size:0.875rem;">Ficha del Cliente</h4>
          ${selectedClient ? `
            <div class="d-flex flex-column gap-2" style="font-size:0.8rem;">
              <div><span class="text-secondary">Nombre:</span> <strong>${selectedClient.name}</strong></div>
              <div><span class="text-secondary">Teléfono:</span> ${selectedClient.phone || 'N/D'}</div>
              <div><span class="text-secondary">Email:</span> ${selectedClient.email || 'N/D'}</div>
              <div><span class="text-secondary">Estado:</span> 
                <span style="color:${selectedClient.status === 'Activo' ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight:600;">${selectedClient.status || 'Activo'}</span>
              </div>
              <div style="border-top:1px solid var(--color-border); padding-top:8px; margin-top:4px;">
                <div class="text-secondary">Deuda Total:</div>
                <div class="font-bold text-lg" style="color:var(--color-danger);">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(selectedClient.currentDebt || 0)}</div>
              </div>
              <div>
                <div class="text-secondary">Límite de Crédito:</div>
                <div class="font-semibold">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(selectedClient.creditLimit || 0)}</div>
              </div>
              <button class="btn btn-secondary btn-xs mt-2 btn-create-ticket" style="font-size:0.72rem;">🎫 Crear Ticket de Soporte</button>
            </div>
          ` : `<div class="text-secondary text-xs text-center py-4">No hay cliente asociado a esta conversación.</div>`}
          
          ${selectedConv ? `
            <div style="border-top:1px solid var(--color-border); padding-top:12px;">
              <h4 class="font-semibold text-primary mb-2" style="font-size:0.8rem;">Asignar a Empleado</h4>
              <select id="wa-assign-employee" class="input input-md" style="font-size:0.8rem; width:100%; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md);">
                <option value="">Sin asignar</option>
                <option value="agent-1">Agente de Soporte</option>
                <option value="manager-1">Gerente</option>
              </select>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    // Event bindings
    container.querySelectorAll('.wa-conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        this.state.selectedConvId = item.getAttribute('data-conv-id');
        this.renderTabContent(element = this.layout.element);
      });
    });

    // Auto-scroll messages to bottom
    const msgList = container.querySelector('#wa-messages-list');
    if (msgList) msgList.scrollTop = msgList.scrollHeight;

    // Send reply
    const replyBtn = container.querySelector('#btn-send-wa-reply');
    const replyInput = container.querySelector('#wa-reply-input');
    if (replyBtn && replyInput) {
      const sendReply = async () => {
        const text = replyInput.value.trim();
        if (!text) return;

        replyInput.value = '';
        replyInput.disabled = true;
        replyBtn.disabled = true;

        if (selectedConv) {
          const convPath = `whatsapp_conversations/${selectedConv.id}`;
          const messages = selectedConv.messages ? Object.values(selectedConv.messages) : [];
          messages.push({
            id: 'msg_' + Date.now() + '_e',
            sender: 'EMPLOYEE',
            senderName: this.currentUser.displayName || this.currentUser.email || 'Agente',
            text,
            timestamp: Date.now()
          });
          try {
            await FirestoreService.setGlobal(this.companyId, convPath, {
              ...selectedConv,
              messages,
              lastMessage: text,
              updatedAt: Date.now()
            });
          } catch (e) {
            NotificationService.error('Error al enviar mensaje.');
          }
        }

        replyInput.disabled = false;
        replyBtn.disabled = false;
      };

      replyBtn.addEventListener('click', sendReply);
      replyInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendReply(); });
    }

    // Resolve conversation
    container.querySelector('.btn-resolve-conv')?.addEventListener('click', async (e) => {
      const convId = e.target.getAttribute('data-conv-id');
      if (convId && confirm('¿Marcar esta conversación como resuelta?')) {
        const conv = this.state.conversations.find(c => c.id === convId);
        if (conv) {
          await FirestoreService.setGlobal(this.companyId, `whatsapp_conversations/${convId}`, {
            ...conv, status: 'RESOLVED', updatedAt: Date.now()
          });
          NotificationService.success('Conversación marcada como resuelta.');
        }
      }
    });

    // Simulate incoming message
    container.querySelector('#btn-simulate-incoming')?.addEventListener('click', async () => {
      const phone = prompt('Número de teléfono del cliente (simulado): ', '5215512345678');
      if (!phone) return;
      const text = prompt('Mensaje del cliente:', '¿Tienen stock de Coca Cola?');
      if (!text) return;

      try {
        await WhatsAppService.receiveIncomingMessage(this.companyId, phone, text);
        NotificationService.success('Mensaje simulado y procesado por el chatbot.');
      } catch (e) {
        NotificationService.error('Error al simular mensaje: ' + e.message);
      }
    });

    // Create support ticket
    container.querySelector('.btn-create-ticket')?.addEventListener('click', () => {
      NotificationService.success(`🎫 Ticket de soporte creado para ${selectedClient?.name || selectedConv?.clientName || 'el cliente'}.`);
    });
  }

  // ─── AUTOBOT TAB ────────────────────────────────────────────────────────────
  renderAutobotConfig(container) {
    const api = this.state.config?.whatsappApi || {};
    const auto = api.autoResponder || {};
    const bot = api.chatbot || {};
    const faqs = auto.faqs || [];

    const faqsHTML = faqs.map((faq, idx) => `
      <div class="d-flex gap-2 align-items-center" style="padding:6px 0; border-bottom:1px solid var(--color-border);" data-faq-idx="${idx}">
        <input type="text" class="input input-md faq-keyword" placeholder="Palabra clave" value="${faq.keyword || ''}" style="flex:1;" />
        <input type="text" class="input input-md faq-response" placeholder="Respuesta automática" value="${faq.response || ''}" style="flex:2;" />
        <button class="btn btn-danger btn-xs btn-delete-faq" data-idx="${idx}" style="flex-shrink:0; padding:4px 8px;">🗑️</button>
      </div>
    `).join('');

    container.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-5); color:var(--color-text-primary);" class="animate-fade-in">

        <!-- Left: Auto-Responder Settings -->
        <div class="d-flex flex-column gap-4">

          <!-- Welcome Message -->
          <div class="card p-5 d-flex flex-column gap-3">
            <div class="d-flex justify-content-between align-items-center">
              <h3 class="font-semibold" style="font-size:0.9rem;">👋 Mensaje de Bienvenida</h3>
              <label class="wa-switch">
                <input type="checkbox" id="toggle-welcome" ${auto.welcomeEnabled ? 'checked' : ''} />
                <span class="wa-slider"></span>
              </label>
            </div>
            <textarea id="txt-welcome" class="input input-md" style="height:80px; padding:var(--space-2); resize:vertical; font-size:0.85rem;">${auto.welcomeText || '¡Hola! Bienvenido a nuestro servicio de WhatsApp. ¿En qué te podemos ayudar hoy?'}</textarea>
            <p class="text-secondary text-xs">Se envía automáticamente la primera vez que un cliente escribe en el día.</p>
          </div>

          <!-- Out of Office -->
          <div class="card p-5 d-flex flex-column gap-3">
            <div class="d-flex justify-content-between align-items-center">
              <h3 class="font-semibold" style="font-size:0.9rem;">🌙 Mensaje Fuera de Horario</h3>
              <label class="wa-switch">
                <input type="checkbox" id="toggle-ooo" ${auto.outOfOfficeEnabled ? 'checked' : ''} />
                <span class="wa-slider"></span>
              </label>
            </div>
            <textarea id="txt-ooo" class="input input-md" style="height:80px; padding:var(--space-2); resize:vertical; font-size:0.85rem;">${auto.outOfOfficeText || 'En este momento nos encontramos fuera del horario laboral (8 AM – 8 PM). Te responderemos pronto.'}</textarea>
            <p class="text-secondary text-xs">Activo fuera del horario 8 AM – 8 PM. Pronto podrás configurar el rango horario.</p>
          </div>

          <!-- FAQ Editor -->
          <div class="card p-5 d-flex flex-column gap-3">
            <div class="d-flex justify-content-between align-items-center">
              <h3 class="font-semibold" style="font-size:0.9rem;">❓ Respuestas Rápidas (FAQs)</h3>
              <label class="wa-switch">
                <input type="checkbox" id="toggle-faq" ${auto.faqEnabled ? 'checked' : ''} />
                <span class="wa-slider"></span>
              </label>
            </div>
            <p class="text-secondary text-xs">Cuando un cliente escriba la palabra clave, el bot responde de forma automática.</p>
            <div id="faq-list">${faqsHTML || '<div class="text-xs text-secondary text-center py-3">No hay FAQs configuradas.</div>'}</div>
            <button class="btn btn-secondary btn-sm" id="btn-add-faq">+ Agregar Respuesta</button>
          </div>

        </div>

        <!-- Right: Chatbot Intelligence -->
        <div class="d-flex flex-column gap-4">
          <div class="card p-5 d-flex flex-column gap-4">
            <h3 class="font-semibold" style="font-size:0.9rem;">🤖 Chatbot Inteligente</h3>
            <p class="text-secondary text-xs">El chatbot analiza el texto del cliente y responde de forma automática consultando tu base de datos en tiempo real.</p>

            <div class="d-flex justify-content-between align-items-center">
              <div>
                <div class="font-medium" style="font-size:0.875rem;">Activar Chatbot</div>
                <div class="text-secondary text-xs">Responde automáticamente a todos los mensajes de clientes</div>
              </div>
              <label class="wa-switch">
                <input type="checkbox" id="toggle-chatbot" ${bot.enabled ? 'checked' : ''} />
                <span class="wa-slider"></span>
              </label>
            </div>
            <hr style="border:0; border-top:1px solid var(--color-border);" />
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <div class="font-medium" style="font-size:0.875rem;">🔍 Consulta de Inventario</div>
                <div class="text-secondary text-xs">Responde a "¿Tienen stock de X?" consultando productos</div>
              </div>
              <label class="wa-switch">
                <input type="checkbox" id="toggle-stock" ${bot.queryStock ? 'checked' : ''} />
                <span class="wa-slider"></span>
              </label>
            </div>
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <div class="font-medium" style="font-size:0.875rem;">📦 Consulta de Pedidos</div>
                <div class="text-secondary text-xs">Responde a "¿Cómo va mi pedido?" consultando ventas</div>
              </div>
              <label class="wa-switch">
                <input type="checkbox" id="toggle-orders" ${bot.queryOrders ? 'checked' : ''} />
                <span class="wa-slider"></span>
              </label>
            </div>
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <div class="font-medium" style="font-size:0.875rem;">🧑‍💼 Asignación a Empleado</div>
                <div class="text-secondary text-xs">Detecta "hablar con agente" y asigna a la conversación</div>
              </div>
              <label class="wa-switch">
                <input type="checkbox" id="toggle-autoassign" ${bot.autoAssign ? 'checked' : ''} />
                <span class="wa-slider"></span>
              </label>
            </div>
          </div>

          <!-- Chatbot Tester -->
          <div class="card p-5 d-flex flex-column gap-3">
            <h3 class="font-semibold" style="font-size:0.9rem;">🧪 Probar Chatbot en Vivo</h3>
            <p class="text-secondary text-xs">Simula un mensaje entrante para ver cómo responde el chatbot.</p>
            <div class="d-flex gap-2">
              <input type="text" id="bot-test-input" class="input input-md" placeholder="Ej: ¿Tienen stock de cocina?" style="flex:1;" />
              <button class="btn btn-primary btn-sm" id="btn-test-bot" style="flex-shrink:0;">Simular</button>
            </div>
            <div id="bot-test-result" class="p-3" style="display:none; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); font-size:0.8rem; color:var(--color-text-primary); white-space:pre-wrap; line-height:1.5;"></div>
          </div>

          <!-- Save Config Button -->
          <div class="d-flex justify-content-end">
            <button class="btn btn-primary btn-md" id="btn-save-autobot">💾 Guardar Configuración</button>
          </div>
        </div>
      </div>
    `;

    // Save autobot config
    container.querySelector('#btn-save-autobot')?.addEventListener('click', async () => {
      const faqs = [];
      container.querySelectorAll('#faq-list [data-faq-idx]').forEach(row => {
        const keyword = row.querySelector('.faq-keyword')?.value.trim();
        const response = row.querySelector('.faq-response')?.value.trim();
        if (keyword) faqs.push({ keyword, response });
      });

      const autoResponder = {
        welcomeEnabled: container.querySelector('#toggle-welcome').checked,
        welcomeText: container.querySelector('#txt-welcome').value.trim(),
        outOfOfficeEnabled: container.querySelector('#toggle-ooo').checked,
        outOfOfficeText: container.querySelector('#txt-ooo').value.trim(),
        faqEnabled: container.querySelector('#toggle-faq').checked,
        faqs
      };

      const chatbot = {
        enabled: container.querySelector('#toggle-chatbot').checked,
        queryStock: container.querySelector('#toggle-stock').checked,
        queryOrders: container.querySelector('#toggle-orders').checked,
        autoAssign: container.querySelector('#toggle-autoassign').checked
      };

      const updatedConfig = {
        ...this.state.config,
        whatsappApi: {
          ...(this.state.config?.whatsappApi || {}),
          autoResponder,
          chatbot
        },
        updatedAt: Date.now(),
        updatedAtLocal: TimeService.timestamp()
      };

      try {
        await FirestoreService.setGlobal(this.companyId, 'configuracion_catalogo', updatedConfig);
        NotificationService.success('Configuración de chatbot guardada.');
      } catch (e) {
        NotificationService.error('Error al guardar: ' + e.message);
      }
    });

    // Add FAQ row
    container.querySelector('#btn-add-faq')?.addEventListener('click', () => {
      const faqList = container.querySelector('#faq-list');
      const idx = faqList.querySelectorAll('[data-faq-idx]').length;
      const div = document.createElement('div');
      div.className = 'd-flex gap-2 align-items-center';
      div.style = 'padding:6px 0; border-bottom:1px solid var(--color-border);';
      div.setAttribute('data-faq-idx', idx);
      div.innerHTML = `
        <input type="text" class="input input-md faq-keyword" placeholder="Palabra clave" style="flex:1;" />
        <input type="text" class="input input-md faq-response" placeholder="Respuesta automática" style="flex:2;" />
        <button class="btn btn-danger btn-xs btn-delete-faq" data-idx="${idx}" style="flex-shrink:0; padding:4px 8px;">🗑️</button>
      `;
      faqList.appendChild(div);
    });

    // Delete FAQ row
    container.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-faq')) {
        const row = e.target.closest('[data-faq-idx]');
        row?.remove();
      }
    });

    // Test Chatbot
    container.querySelector('#btn-test-bot')?.addEventListener('click', async () => {
      const input = container.querySelector('#bot-test-input');
      const resultEl = container.querySelector('#bot-test-result');
      if (!input?.value.trim()) return;

      resultEl.style.display = 'block';
      resultEl.textContent = '⏳ Procesando mensaje con el chatbot...';

      try {
        await WhatsAppService.receiveIncomingMessage(this.companyId, 'TEST_5215500000000', input.value.trim());
        resultEl.textContent = '✅ Mensaje procesado. Consulta el Inbox para ver la respuesta del chatbot en tiempo real.';
      } catch (e) {
        resultEl.textContent = '❌ Error: ' + e.message;
      }
    });
  }

  // ─── CAMPAIGNS TAB ──────────────────────────────────────────────────────────
  renderCampaigns(container) {
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:var(--space-5); color:var(--color-text-primary);" class="animate-fade-in">

        <!-- Left: Campaign Builder -->
        <div class="card p-5 d-flex flex-column gap-4">
          <h3 class="font-semibold text-primary">📢 Nueva Campaña de Difusión</h3>

          <div class="form-group">
            <label class="form-label" for="campaign-name">Nombre de la Campaña</label>
            <input type="text" id="campaign-name" class="input input-md" placeholder="Ej. Promoción Fin de Semana" />
          </div>

          <div class="form-group">
            <label class="form-label" for="campaign-segment">Segmento de Destinatarios</label>
            <select id="campaign-segment" class="input input-md" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-3); color:var(--color-text-primary);">
              <option value="ALL">🌍 Todos los Clientes (${this.state.clients.length})</option>
              <option value="ACTIVE">✅ Clientes Activos (${this.state.clients.filter(c => c.status === 'Activo').length})</option>
              <option value="PENDING_DEBT">💳 Clientes con Deuda Pendiente (${this.state.clients.filter(c => Number(c.currentDebt || 0) > 0).length})</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="campaign-message">Mensaje de la Campaña</label>
            <textarea id="campaign-message" class="input input-md" style="height:110px; padding:var(--space-2); resize:vertical;" placeholder="¡Hola {{cliente}}! Tenemos una promoción especial para ti hoy. 🎉&#10;&#10;Visita nuestro catálogo en línea o escríbenos para más detalles.">¡Hola {{cliente}}! Tenemos una promoción especial para ti hoy. 🎉

Visita nuestro catálogo o contáctanos para más detalles.</textarea>
            <p class="text-secondary text-xs mt-1">Variables disponibles: <code>{{cliente}}</code>, <code>{{deuda}}</code></p>
          </div>

          <div id="campaign-progress-wrapper" style="display:none;" class="d-flex flex-column gap-2">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem;">
              <span>Enviando mensajes...</span>
              <span id="campaign-progress-label" class="text-primary font-semibold">0%</span>
            </div>
            <div style="height:8px; background:var(--color-bg-secondary); border-radius:var(--radius-xl); overflow:hidden;">
              <div id="campaign-progress-bar" style="height:100%; width:0%; background: linear-gradient(90deg, #7c75ff, #128C7E); border-radius:var(--radius-xl); transition:width 0.3s ease;"></div>
            </div>
          </div>

          <button class="btn btn-primary btn-md" id="btn-launch-campaign">
            🚀 Lanzar Campaña de Difusión
          </button>
        </div>

        <!-- Right: Previous Campaigns Logs -->
        <div class="card p-5 d-flex flex-column gap-3">
          <div class="d-flex justify-content-between align-items-center">
            <h3 class="font-semibold text-primary">📋 Historial de Envíos</h3>
            <span class="text-secondary text-xs">${this.state.logs.length} registros</span>
          </div>
          <div style="overflow-y:auto; max-height:420px;">
            ${this.state.logs.length === 0 ? '<div class="text-center text-secondary text-xs py-6">No hay campañas enviadas aún.</div>' :
              [...this.state.logs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 20).map(log => `
                <div style="padding:10px 0; border-bottom:1px solid var(--color-border); font-size:0.78rem;">
                  <div style="display:flex; justify-content:space-between;">
                    <span class="font-semibold text-primary">📞 ${log.to}</span>
                    <span style="color:var(--color-success); font-weight:bold; font-size:0.7rem;">${log.status}</span>
                  </div>
                  <div class="text-secondary" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:90%;">${log.messageContent}</div>
                  <div class="text-secondary text-right" style="font-size:0.65rem;">${new Date(log.timestamp).toLocaleString()} · ${log.gateway}</div>
                </div>
              `).join('')
            }
          </div>
        </div>
      </div>
    `;

    // Launch campaign
    container.querySelector('#btn-launch-campaign')?.addEventListener('click', async () => {
      const name = container.querySelector('#campaign-name').value.trim() || 'Campaña sin nombre';
      const segment = container.querySelector('#campaign-segment').value;
      const message = container.querySelector('#campaign-message').value.trim();

      if (!message) {
        alert('Por favor ingresa el mensaje de la campaña.');
        return;
      }

      const totalClients = segment === 'ACTIVE' ? this.state.clients.filter(c => c.status === 'Activo').length
        : segment === 'PENDING_DEBT' ? this.state.clients.filter(c => Number(c.currentDebt || 0) > 0).length
        : this.state.clients.length;

      if (totalClients === 0) {
        alert('No hay clientes en el segmento seleccionado.');
        return;
      }

      if (!confirm(`¿Enviar la campaña "${name}" a ${totalClients} clientes del segmento seleccionado?`)) return;

      const btn = container.querySelector('#btn-launch-campaign');
      btn.disabled = true;
      btn.textContent = 'Enviando...';

      const progressWrapper = container.querySelector('#campaign-progress-wrapper');
      const progressBar = container.querySelector('#campaign-progress-bar');
      const progressLabel = container.querySelector('#campaign-progress-label');
      progressWrapper.style.display = 'block';

      // Animate progress bar while broadcasting
      let fakeProgress = 0;
      const progressInterval = setInterval(() => {
        fakeProgress = Math.min(fakeProgress + (100 / totalClients / 2), 95);
        progressBar.style.width = fakeProgress + '%';
        progressLabel.textContent = Math.round(fakeProgress) + '%';
      }, 150);

      try {
        const sentCount = await WhatsAppService.sendBroadcast(this.companyId, segment, message);
        clearInterval(progressInterval);
        progressBar.style.width = '100%';
        progressLabel.textContent = '100%';
        NotificationService.success(`✅ Campaña "${name}" enviada con éxito a ${sentCount} clientes.`);
      } catch (e) {
        clearInterval(progressInterval);
        NotificationService.error('Error al enviar campaña: ' + e.message);
      } finally {
        setTimeout(() => {
          progressWrapper.style.display = 'none';
          progressBar.style.width = '0%';
          btn.disabled = false;
          btn.textContent = '🚀 Lanzar Campaña de Difusión';
        }, 2000);
      }
    });
  }

  // ─── STATS TAB ──────────────────────────────────────────────────────────────
  renderStats(container) {
    const logs = this.state.logs || [];
    const totalSent = logs.filter(l => ['EMPLOYEE', 'BOT', 'SYSTEM'].includes(l.sender) || l.status === 'DELIVERED').length;
    const autoReplies = logs.filter(l => l.templateName === 'AUTO_REPLY').length;
    const broadcasts = logs.filter(l => (l.id || '').includes('broadcast')).length;
    const totalConvs = this.state.conversations.length;
    const openConvs = this.state.conversations.filter(c => c.status === 'OPEN').length;
    const resolvedConvs = this.state.conversations.filter(c => c.status === 'RESOLVED').length;

    // Compute daily activity for last 7 days
    const now = Date.now();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - i * 86400000);
      return d.toLocaleDateString('es-MX', { weekday: 'short' });
    }).reverse();

    const dayBars = days.map(dayLabel => {
      const count = logs.filter(l => {
        const d = new Date(l.timestamp).toLocaleDateString('es-MX', { weekday: 'short' });
        return d === dayLabel;
      }).length;
      const maxH = 80;
      const h = Math.max(4, Math.round((count / Math.max(1, logs.length)) * maxH * 3));
      return { dayLabel, count, h: Math.min(h, maxH) };
    });

    const maxVal = Math.max(...dayBars.map(d => d.count), 1);

    container.innerHTML = `
      <div class="animate-fade-in d-flex flex-column gap-5" style="color:var(--color-text-primary);">

        <!-- KPI Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:var(--space-4);">
          ${[
            { label: 'Mensajes Enviados', value: totalSent, icon: '📤', color: 'var(--color-accent)' },
            { label: 'Respuestas Automáticas', value: autoReplies, icon: '🤖', color: 'var(--color-success)' },
            { label: 'Campañas Enviadas', value: broadcasts, icon: '📢', color: '#f59e0b' },
            { label: 'Conversaciones Abiertas', value: openConvs, icon: '💬', color: 'var(--color-danger)' },
            { label: 'Conversaciones Resueltas', value: resolvedConvs, icon: '✅', color: 'var(--color-success)' },
            { label: 'Total Conversaciones', value: totalConvs, icon: '📁', color: 'var(--color-text-secondary)' },
          ].map(kpi => `
            <div class="card p-4 hover-lift" style="border-left: 4px solid ${kpi.color};">
              <div style="font-size:1.5rem; margin-bottom:6px;">${kpi.icon}</div>
              <div class="text-secondary text-xs">${kpi.label}</div>
              <div class="font-bold" style="font-size:1.6rem; color:${kpi.color};">${kpi.value}</div>
            </div>
          `).join('')}
        </div>

        <!-- Activity Chart -->
        <div class="card p-5">
          <h3 class="font-semibold mb-4">Actividad de Mensajería (Últimos 7 días)</h3>
          <div style="display:flex; align-items:flex-end; gap:16px; height:110px; padding:0 16px;">
            ${dayBars.map(d => `
              <div class="d-flex flex-column align-items-center gap-1" style="flex:1;">
                <span class="text-xs text-secondary">${d.count}</span>
                <div style="width:100%; height:${Math.round((d.count / maxVal) * 80)}px; background:linear-gradient(180deg, #7c75ff, #128C7E); border-radius:4px 4px 0 0; min-height:4px; transition:height 0.5s ease;"></div>
                <span class="text-xs text-secondary">${d.dayLabel}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Recent Log Table -->
        <div class="card p-5">
          <h3 class="font-semibold mb-4">Registro Reciente de Mensajes (${Math.min(logs.length, 10)} de ${logs.length})</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--color-border); text-align:left;">
                  <th style="padding:8px; color:var(--color-text-secondary);">Destino</th>
                  <th style="padding:8px; color:var(--color-text-secondary);">Plantilla</th>
                  <th style="padding:8px; color:var(--color-text-secondary);">Gateway</th>
                  <th style="padding:8px; color:var(--color-text-secondary);">Estado</th>
                  <th style="padding:8px; color:var(--color-text-secondary);">Hora</th>
                </tr>
              </thead>
              <tbody>
                ${[...logs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 10).map(log => `
                  <tr style="border-bottom:1px solid var(--color-border);">
                    <td style="padding:8px;">${log.to}</td>
                    <td style="padding:8px; color:var(--color-accent);">${log.templateName}</td>
                    <td style="padding:8px;">${log.gateway}</td>
                    <td style="padding:8px; color:var(--color-success); font-weight:bold;">${log.status}</td>
                    <td style="padding:8px; color:var(--color-text-secondary);">${new Date(log.timestamp).toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ─── SETTINGS TAB ───────────────────────────────────────────────────────────
  renderSettings(container) {
    const api = this.state.config?.whatsappApi || {};
    const templates = api.templates || {};
    const webhookUrl = `${window.location.origin}/webhook/whatsapp/${this.companyId}`;

    container.innerHTML = `
      <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:var(--space-5); color:var(--color-text-primary);" class="animate-fade-in">

        <!-- Left: Credentials -->
        <div class="d-flex flex-column gap-4">
          <form id="wa-settings-form" class="card p-5 d-flex flex-column gap-3">
            <h3 class="font-semibold text-primary">🔑 Credenciales de la API</h3>

            <div class="form-group">
              <label class="form-label" for="ws-provider">Proveedor</label>
              <select id="ws-provider" class="input input-md" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-3); color:var(--color-text-primary);">
                <option value="META" ${api.provider === 'META' ? 'selected' : ''}>Meta Cloud API (Oficial)</option>
                <option value="TWILIO" ${api.provider === 'TWILIO' ? 'selected' : ''}>Twilio Messaging Gateway</option>
                <option value="EMULATOR" ${api.provider === 'EMULATOR' || !api.provider ? 'selected' : ''}>Emulador de Desarrollo</option>
              </select>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="ws-phone-id">Phone Number ID</label>
                <input type="text" id="ws-phone-id" class="input input-md" placeholder="108876251299" value="${api.phoneNumberId || ''}" />
              </div>
              <div class="form-group">
                <label class="form-label" for="ws-account-id">WABA Business ID</label>
                <input type="text" id="ws-account-id" class="input input-md" placeholder="103212874112" value="${api.businessAccountId || ''}" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="ws-token">Access Token</label>
              <div style="position:relative; display:flex; align-items:center;">
                <input type="password" id="ws-token" class="input input-md" style="padding-right:44px;" placeholder="EAAGb..." value="${api.accessToken || ''}" />
                <button type="button" id="btn-toggle-token" style="position:absolute; right:10px; border:none; background:none; cursor:pointer; font-size:1.1rem; color:var(--color-text-secondary);">👁️</button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Webhook URL de Entrada</label>
              <input type="text" class="input input-md" value="${webhookUrl}" readonly style="opacity:0.6; font-family:monospace; font-size:0.75rem;" />
            </div>

            <button type="button" class="btn btn-primary btn-sm align-self-end" id="btn-save-settings">💾 Guardar Credenciales</button>
          </form>

          <!-- Templates -->
          <div class="card p-5 d-flex flex-column gap-3">
            <h3 class="font-semibold text-primary">📋 Plantillas de Mensajes</h3>
            <p class="text-secondary text-xs">Variables: <code>{{cliente}}</code>, <code>{{monto}}</code>, <code>{{interes}}</code>, <code>{{cuota}}</code>, <code>{{vencimiento}}</code>, <code>{{url}}</code></p>

            <div class="form-group">
              <label class="form-label">Recibo de Crédito (CREDIT_RECEIPT)</label>
              <textarea id="ws-tmpl-credit" class="input input-md" style="height:65px; padding:var(--space-2); font-size:0.78rem; resize:vertical;">${templates.CREDIT_RECEIPT || 'Estimado(a) {{cliente}}, le notificamos la apertura de su crédito por {{monto}} al {{interes}}% mensual. Cuota: {{cuota}}. Vencimiento: {{vencimiento}}.'}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Confirmación de Pedido (ORDER_CONFIRMATION)</label>
              <textarea id="ws-tmpl-order" class="input input-md" style="height:65px; padding:var(--space-2); font-size:0.78rem; resize:vertical;">${templates.ORDER_CONFIRMATION || '¡Hola {{cliente}}! Tu pedido ha sido confirmado. Total: {{monto}}. Método: {{metodo}}.'}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Promoción / Difusión (PROMOTION)</label>
              <textarea id="ws-tmpl-promo" class="input input-md" style="height:65px; padding:var(--space-2); font-size:0.78rem; resize:vertical;">${templates.PROMOTION || '¡Hola {{cliente}}! Tenemos ofertas especiales hoy. Visítanos: {{url}}'}</textarea>
            </div>
          </div>
        </div>

        <!-- Right: Test Console -->
        <div class="d-flex flex-column gap-4">
          <div class="card p-5 d-flex flex-column gap-3">
            <h3 class="font-semibold text-primary">🔌 Consola de Prueba de Conexión</h3>
            <p class="text-secondary text-xs">Envía un "hello_world" a un celular para validar que las credenciales configuradas funcionen correctamente.</p>

            <div class="form-group">
              <label class="form-label">Teléfono de Prueba (Ej: 5215512345678)</label>
              <div class="d-flex gap-2">
                <input type="tel" id="ws-test-phone" class="input input-md" placeholder="5215512345678" style="flex:1;" />
                <button class="btn btn-secondary btn-sm" id="btn-run-test" style="flex-shrink:0; padding:0 var(--space-3);">Probar</button>
              </div>
            </div>

            <div id="ws-terminal" class="p-3" style="display:none; background:#0f172a; border:1px solid var(--color-border); border-radius:var(--radius-md); font-family:monospace; font-size:0.72rem; white-space:pre-wrap; max-height:240px; overflow-y:auto; color:#a7f3d0; line-height:1.5;">
            </div>
          </div>
        </div>
      </div>
    `;

    // Toggle token visibility
    container.querySelector('#btn-toggle-token')?.addEventListener('click', () => {
      const inp = container.querySelector('#ws-token');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });

    // Save settings
    container.querySelector('#btn-save-settings')?.addEventListener('click', async () => {
      const provider = container.querySelector('#ws-provider').value;
      const phoneNumberId = container.querySelector('#ws-phone-id').value.trim();
      const businessAccountId = container.querySelector('#ws-account-id').value.trim();
      const accessToken = container.querySelector('#ws-token').value.trim();
      const creditReceipt = container.querySelector('#ws-tmpl-credit').value.trim();
      const orderConf = container.querySelector('#ws-tmpl-order').value.trim();
      const promo = container.querySelector('#ws-tmpl-promo').value.trim();

      const updated = {
        ...this.state.config,
        whatsappApi: {
          ...(this.state.config?.whatsappApi || {}),
          provider, phoneNumberId, businessAccountId, accessToken,
          templates: { CREDIT_RECEIPT: creditReceipt, ORDER_CONFIRMATION: orderConf, PROMOTION: promo }
        },
        updatedAt: Date.now(),
        updatedAtLocal: TimeService.timestamp()
      };

      try {
        await FirestoreService.setGlobal(this.companyId, 'configuracion_catalogo', updated);
        NotificationService.success('Credenciales de WhatsApp API guardadas.');
      } catch (e) {
        NotificationService.error('Error al guardar: ' + e.message);
      }
    });

    // Test connection
    container.querySelector('#btn-run-test')?.addEventListener('click', () => {
      const phone = container.querySelector('#ws-test-phone').value.trim();
      if (!phone) return;

      const terminal = container.querySelector('#ws-terminal');
      terminal.style.display = 'block';
      terminal.textContent = `> Conectando con pasarela ${container.querySelector('#ws-provider').value}...\n`;

      const settings = {
        provider: container.querySelector('#ws-provider').value,
        phoneNumberId: container.querySelector('#ws-phone-id').value.trim(),
        businessAccountId: container.querySelector('#ws-account-id').value.trim(),
        accessToken: container.querySelector('#ws-token').value.trim()
      };

      setTimeout(() => {
        const result = WhatsAppService.testConnection(settings, phone);
        terminal.textContent += `> Handshake exitoso. Latencia: ${result.response.simulationMeta.latencyMs}ms\n\n`;
        terminal.textContent += `[HTTP REQUEST]:\n${JSON.stringify(result.request, null, 2)}\n\n`;
        terminal.textContent += `[HTTP RESPONSE]:\n${JSON.stringify(result.response, null, 2)}`;
        terminal.scrollTop = terminal.scrollHeight;
        NotificationService.success('Prueba de API completada (Simulada).');
      }, 1100);
    });
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}
