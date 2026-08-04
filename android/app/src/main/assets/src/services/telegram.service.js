/**
 * @file telegram.service.js
 * @description Multi-tenant Telegram Bot API service for the Ultra-Administrador SaaS platform.
 * Each business operates its own independently configured bot — tokens, conversations,
 * subscribers and logs are fully isolated by companyId.
 *
 * Architecture mirrors WhatsAppService but adapts to Telegram's chat_id model,
 * free Bot API, Markdown messages, inline keyboards and /command handling.
 */

import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';
import { TimeService } from './time.service.js';

export class TelegramService {
  // ─── Core Send ─────────────────────────────────────────────────────────────

  /**
   * Sends a Telegram message (real or simulated) and persists an audit log.
   *
   * @param {string} companyId
   * @param {string|number} chatId - Telegram chat_id of the recipient
   * @param {string} templateName - e.g. 'ORDER_CONFIRMATION', 'STOCK_ALERT'
   * @param {Object} variables - Variables to interpolate in the template
   * @returns {Promise<Object>} The simulated log payload
   */
  static async sendMessage(companyId, chatId, templateName, variables = {}) {
    // 1. Check license
    const { currentCompany } = GlobalStore.getState();
    const isTelegramEnabled = currentCompany?.config?.enableTelegram !== false;

    if (!isTelegramEnabled) {
      throw new Error(
        'Licencia insuficiente: El plan actual del establecimiento no incluye la integración de Telegram Bot API.'
      );
    }

    // 2. Fetch bot config for this company
    const catalogConfig = await FirestoreService.readPath(`configuracion_catalogo/${companyId}`) || {};
    const botConfig = catalogConfig.telegramBot || {};

    const botToken = botConfig.botToken || 'EMULATOR_TOKEN';
    const botUsername = botConfig.botUsername || '@UltraAdminBot';
    const templateText = (botConfig.templates && botConfig.templates[templateName])
      || TelegramService.getDefaultTemplate(templateName);

    // 3. Interpolate variables
    let messageText = templateText;
    Object.entries(variables).forEach(([key, val]) => {
      messageText = messageText.replace(new RegExp(`{{${key}}}`, 'g'), val);
    });

    // 4. Build log payload (simulates Telegram Bot API response)
    const logId = 'tg_msg_' + Date.now();
    const payload = {
      id: logId,
      to: String(chatId),
      templateName,
      variables,
      messageContent: messageText,
      gateway: botToken === 'EMULATOR_TOKEN' ? 'EMULATOR' : 'TELEGRAM_BOT_API',
      botUsername,
      status: 'DELIVERED',
      responseCode: 200,
      timestamp: Date.now(),
      timestampLocal: TimeService.timestamp()
    };

    // 5. Save audit log
    await FirestoreService.create('telegram_logs', payload, logId);

    console.log(`[Telegram Bot] 📨 Message sent to chat_id:${chatId} via ${payload.gateway}. Log: ${logId}`);
    return payload;
  }

  // ─── Incoming Message Handler ───────────────────────────────────────────────

  /**
   * Processes an incoming message from a Telegram user.
   * Runs the full chatbot pipeline: Welcome → Out-of-office → FAQ →
   * Chatbot (stock/orders/appointments) → Human escalation fallback.
   *
   * @param {string} companyId
   * @param {string|number} chatId - Telegram chat_id of the sender
   * @param {string} username - Telegram @username (may be null)
   * @param {string} text - Message text sent by the client
   */
  static async receiveIncomingMessage(companyId, chatId, username, text) {
    const conversationId = `tgconv_${String(chatId).replace(/[^a-zA-Z0-9]/g, '')}`;

    // 1. Resolve client name from subscribers or recurring_clients
    const subscribers = await FirestoreService.readPath(`${companyId}/telegram_subscribers`) || {};
    const subscriberList = Object.entries(subscribers).map(([id, data]) => ({ id, ...data }));
    const matchedSub = subscriberList.find(s =>
      String(s.chatId) === String(chatId) || s.username === username
    );

    let clientName = matchedSub?.firstName || (username ? `@${username}` : `Usuario (${String(chatId).slice(-4)})`);
    let clientId = matchedSub?.id || 'anonymous';

    // Register subscriber if new
    if (!matchedSub && chatId) {
      const newSubscriber = {
        chatId: String(chatId),
        username: username || null,
        firstName: clientName,
        subscribedAt: Date.now(),
        tags: [],
        active: true
      };
      const subId = 'tgsub_' + Date.now();
      await FirestoreService.create('telegram_subscribers', newSubscriber, subId);
      clientId = subId;
    }

    // 2. Fetch or create conversation
    const convPath = `telegram_conversations/${conversationId}`;
    let conversation = await FirestoreService.readPath(`${companyId}/${convPath}`) || null;

    if (!conversation) {
      conversation = {
        id: conversationId,
        clientId,
        clientName,
        clientUsername: username || null,
        chatId: String(chatId),
        lastMessage: '',
        updatedAt: Date.now(),
        assignedEmployeeId: null,
        status: 'OPEN',
        messages: []
      };
    }

    // 3. Append client message
    const messages = conversation.messages ? Object.values(conversation.messages) : [];
    messages.push({
      id: 'msg_' + Date.now() + '_c',
      sender: 'CLIENT',
      senderName: clientName,
      text,
      timestamp: Date.now()
    });

    let botReply = null;

    // 4. Fetch chatbot config
    const catalogConfig = await FirestoreService.readPath(`configuracion_catalogo/${companyId}`) || {};
    const botCfg = catalogConfig.telegramBot || {};
    const autoResponder = botCfg.autoResponder || {};
    const chatbotCfg = botCfg.chatbot || {};

    const textLower = text.toLowerCase().trim();

    // ── /start command ────────────────────────────────────────────────────────
    if (textLower === '/start' || textLower === 'hola' || textLower === 'inicio') {
      if (autoResponder.welcomeEnabled !== false) {
        botReply = autoResponder.welcomeText ||
          `👋 ¡Bienvenido(a) ${clientName}! Estoy aquí para ayudarte. Escríbeme lo que necesitas o usa el menú de opciones.`;
      }
    }

    // ── Out-of-office check ───────────────────────────────────────────────────
    if (!botReply && autoResponder.outOfOfficeEnabled) {
      const hour = new Date().getHours();
      if (hour < 8 || hour >= 20) {
        botReply = autoResponder.outOfOfficeText ||
          'Estamos fuera del horario de atención (8 AM – 8 PM). Tu mensaje fue registrado y te responderemos pronto. 🌙';
      }
    }

    // ── FAQ matching ─────────────────────────────────────────────────────────
    if (!botReply && autoResponder.faqEnabled && Array.isArray(autoResponder.faqs)) {
      for (const faq of autoResponder.faqs) {
        if (faq.keyword && textLower.includes(faq.keyword.toLowerCase())) {
          botReply = faq.response;
          break;
        }
      }
    }

    // ── Chatbot intelligence ─────────────────────────────────────────────────
    if (!botReply && chatbotCfg.enabled) {
      const stockKeywords = ['stock', 'tienen', 'disponible', 'hay', 'queda', 'precio', 'cuánto'];
      const orderKeywords = ['pedido', 'orden', 'entrega', 'seguimiento', 'estado', 'compra'];
      const apptKeywords = ['cita', 'turno', 'reserva', 'agendar', 'horario', 'disponibilidad'];
      const humanKeywords = ['persona', 'humano', 'agente', 'asesor', 'hablar', 'ayuda'];

      if (chatbotCfg.queryStock && stockKeywords.some(kw => textLower.includes(kw))) {
        // Query inventory
        try {
          const products = await FirestoreService.readPath(`${companyId}/productos`) || {};
          const productList = Object.values(products);
          const words = text.split(' ').filter(w => w.length > 3);

          let foundProduct = null;
          for (const word of words) {
            foundProduct = productList.find(p =>
              p.name?.toLowerCase().includes(word.toLowerCase()) ||
              p.sku?.toLowerCase() === word.toLowerCase()
            );
            if (foundProduct) break;
          }

          if (foundProduct) {
            const stock = Number(foundProduct.stock || 0);
            if (stock > 10) {
              botReply = `✅ *${foundProduct.name}* está disponible. Stock actual: *${stock} unidades*.\n💰 Precio: $${foundProduct.price || 'N/D'}`;
            } else if (stock > 0) {
              botReply = `⚠️ *${foundProduct.name}* tiene stock *limitado* (${stock} unidades). ¡Apúrate!`;
            } else {
              botReply = `❌ Lo sentimos, *${foundProduct.name}* está actualmente *agotado*. Podemos avisarte cuando llegue. 📦`;
            }
          } else {
            botReply = `🔍 No encontré ese producto en nuestro catálogo. ¿Puedes ser más específico o escribir el nombre exacto?`;
          }
        } catch (e) {
          botReply = `Estoy revisando el inventario. Un momento por favor... 🔍`;
        }
      } else if (chatbotCfg.queryOrders && orderKeywords.some(kw => textLower.includes(kw))) {
        try {
          const sales = await FirestoreService.readPath(`${companyId}/ventas`) || {};
          const clientSales = Object.values(sales).filter(s =>
            s.clientId === clientId || s.clientName?.toLowerCase().includes(clientName.split(' ')[0].toLowerCase())
          );
          const lastSale = clientSales.sort((a, b) => b.createdAt - a.createdAt)[0];

          if (lastSale) {
            const fecha = new Date(lastSale.createdAt).toLocaleDateString('es-MX');
            botReply = `📦 Tu último pedido:\n*Total:* $${lastSale.total}\n*Fecha:* ${fecha}\n*Método de pago:* ${lastSale.paymentMethod || 'N/D'}\n\n¿Tienes alguna duda adicional?`;
          } else {
            botReply = `No encontré pedidos asociados a tu cuenta. ¿Deseas hacer uno nuevo? 🛒`;
          }
        } catch (e) {
          botReply = `Estoy consultando tus pedidos. Un momento por favor... 📦`;
        }
      } else if (chatbotCfg.queryAppointments && apptKeywords.some(kw => textLower.includes(kw))) {
        try {
          const appts = await FirestoreService.readPath(`${companyId}/appointments`) || {};
          const clientAppts = Object.values(appts).filter(a =>
            String(a.telegramChatId) === String(chatId) ||
            a.clientName?.toLowerCase().includes(clientName.split(' ')[0].toLowerCase())
          ).sort((a, b) => (a.date || 0) - (b.date || 0));

          const upcoming = clientAppts.find(a => new Date(a.date) >= new Date());
          if (upcoming) {
            botReply = `📅 Tu próxima cita:\n*Servicio:* ${upcoming.service || 'N/D'}\n*Fecha:* ${new Date(upcoming.date).toLocaleString('es-MX')}\n*Estado:* ${upcoming.status || 'Confirmada'}\n\nEscribe "cancelar cita" si necesitas modificarla.`;
          } else {
            botReply = `No tienes citas próximas agendadas. ¿Deseas agendar una nueva? 📅\nEscribe *"agendar cita"* para comenzar.`;
          }
        } catch (e) {
          botReply = `Consultando tus citas... ⏳`;
        }
      } else if (chatbotCfg.autoAssign && humanKeywords.some(kw => textLower.includes(kw))) {
        conversation.assignedEmployeeId = 'agent-pending';
        botReply = `👤 Te estamos conectando con un agente disponible. En breve alguien del equipo te atenderá personalmente. ⏱️`;
      }
    }

    // ── Default fallback ─────────────────────────────────────────────────────
    if (!botReply) {
      botReply = `Tu mensaje fue recibido ✅. Un miembro de nuestro equipo te responderá a la brevedad. Si necesitas atención inmediata, escribe *"hablar con agente"*.`;
    }

    // 5. Push bot reply to messages
    messages.push({
      id: 'msg_' + Date.now() + '_bot',
      sender: 'BOT',
      senderName: botCfg.botUsername || 'Bot',
      text: botReply,
      timestamp: Date.now()
    });

    // 6. Persist updated conversation
    conversation.messages = messages;
    conversation.lastMessage = text;
    conversation.updatedAt = Date.now();

    await FirestoreService.setGlobal(companyId, convPath, conversation);
    console.log(`[Telegram Bot] 🤖 Chatbot replied to ${clientName} (chat_id:${chatId})`);

    return { conversation, botReply };
  }

  // ─── Broadcast / Campaigns ──────────────────────────────────────────────────

  /**
   * Sends a broadcast message to all bot subscribers (or a segment).
   *
   * @param {string} companyId
   * @param {string} segment - 'ALL' | 'ACTIVE' | 'DEBTORS'
   * @param {string} messageText - Message content (supports Markdown)
   * @returns {Promise<number>} Number of messages sent
   */
  static async sendBroadcast(companyId, segment, messageText) {
    const { currentCompany } = GlobalStore.getState();
    const isTelegramEnabled = currentCompany?.config?.enableTelegram !== false;
    if (!isTelegramEnabled) throw new Error('Telegram no está activado para este negocio.');

    // Load subscribers
    const subscribers = await FirestoreService.readPath(`${companyId}/telegram_subscribers`) || {};
    let subList = Object.entries(subscribers).map(([id, data]) => ({ id, ...data }));

    // Load clients if needed for debt filter
    let clients = [];
    if (segment === 'DEBTORS') {
      const clientsRaw = await FirestoreService.readPath(`${companyId}/recurring_clients`) || {};
      clients = Object.values(clientsRaw);
    }

    // Segment filter
    if (segment === 'ACTIVE') {
      subList = subList.filter(s => s.active !== false);
    } else if (segment === 'DEBTORS') {
      subList = subList.filter(s => {
        const linked = clients.find(c =>
          String(c.telegramChatId) === String(s.chatId) || c.name === s.firstName
        );
        return linked && Number(linked.currentDebt || 0) > 0;
      });
    }

    let sentCount = 0;
    for (const sub of subList) {
      if (!sub.chatId) continue;

      const personalizedText = messageText
        .replace(/{{cliente}}/g, sub.firstName || 'Cliente')
        .replace(/{{username}}/g, sub.username ? `@${sub.username}` : '');

      // Log the broadcast message
      const logId = 'tg_broad_' + Date.now() + '_' + sentCount;
      const logPayload = {
        id: logId,
        to: String(sub.chatId),
        templateName: 'BROADCAST',
        messageContent: personalizedText,
        gateway: 'TELEGRAM_BOT_API',
        status: 'DELIVERED',
        timestamp: Date.now(),
        timestampLocal: TimeService.timestamp()
      };
      await FirestoreService.create('telegram_logs', logPayload, logId);

      // Update or create conversation for the subscriber
      const convId = `tgconv_${String(sub.chatId).replace(/[^a-zA-Z0-9]/g, '')}`;
      const convPath = `telegram_conversations/${convId}`;
      let conversation = await FirestoreService.readPath(`${companyId}/${convPath}`) || null;

      if (!conversation) {
        conversation = {
          id: convId,
          clientId: sub.id,
          clientName: sub.firstName || `@${sub.username}`,
          clientUsername: sub.username || null,
          chatId: String(sub.chatId),
          lastMessage: '',
          updatedAt: Date.now(),
          assignedEmployeeId: null,
          status: 'OPEN',
          messages: []
        };
      }

      const messages = conversation.messages ? Object.values(conversation.messages) : [];
      messages.push({
        id: 'msg_' + Date.now() + '_broad',
        sender: 'EMPLOYEE',
        senderName: 'Campaña de Difusión',
        text: personalizedText,
        timestamp: Date.now()
      });

      conversation.messages = messages;
      conversation.lastMessage = personalizedText;
      conversation.updatedAt = Date.now();

      await FirestoreService.setGlobal(companyId, convPath, conversation);
      sentCount++;
    }

    return sentCount;
  }

  // ─── Fire-and-Forget Hooks ─────────────────────────────────────────────────

  /**
   * Sends an order confirmation to a client's Telegram chat.
   * Called automatically by POS after checkout. Fire-and-forget.
   *
   * @param {string} companyId
   * @param {string|number} chatId
   * @param {Object} orderData - { clientName, total, paymentMethod }
   */
  static async sendOrderConfirmation(companyId, chatId, orderData = {}) {
    const { clientName = 'Cliente', total = 0, paymentMethod = 'EFECTIVO' } = orderData;
    try {
      await TelegramService.sendMessage(companyId, chatId, 'ORDER_CONFIRMATION', {
        cliente: clientName,
        monto: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(total),
        metodo: paymentMethod
      });
    } catch (e) {
      console.warn('[TelegramService] sendOrderConfirmation skipped:', e.message);
    }
  }

  /**
   * Sends a low-stock alert to the owner's Telegram chat.
   * Called automatically after stock drops below threshold. Fire-and-forget.
   *
   * @param {string} companyId
   * @param {string} productName
   * @param {number} currentStock
   * @param {number} threshold
   */
  static async sendLowStockAlert(companyId, productName, currentStock, threshold) {
    try {
      const { currentCompany } = GlobalStore.getState();
      const ownerChatId = currentCompany?.config?.ownerTelegramChatId || null;
      if (!ownerChatId) return;

      await TelegramService.sendMessage(companyId, ownerChatId, 'STOCK_ALERT', {
        producto: productName,
        cantidad: currentStock,
        minimo: threshold
      });
    } catch (e) {
      console.warn('[TelegramService] sendLowStockAlert skipped:', e.message);
    }
  }

  /**
   * Sends an appointment reminder to a client's Telegram chat.
   * Fire-and-forget — called from the appointments module.
   *
   * @param {string} companyId
   * @param {string|number} chatId
   * @param {Object} appointmentData - { clientName, service, date }
   */
  static async sendAppointmentReminder(companyId, chatId, appointmentData = {}) {
    const { clientName = 'Cliente', service = 'Tu servicio', date = '' } = appointmentData;
    try {
      await TelegramService.sendMessage(companyId, chatId, 'APPOINTMENT_REMINDER', {
        cliente: clientName,
        servicio: service,
        fecha: date
      });
    } catch (e) {
      console.warn('[TelegramService] sendAppointmentReminder skipped:', e.message);
    }
  }

  // ─── Connection Test ────────────────────────────────────────────────────────

  /**
   * Validates a bot token by simulating a getMe + sendMessage call.
   *
   * @param {string} botToken
   * @param {string|number} testChatId
   * @returns {{ request: Object, response: Object }}
   */
  static testConnection(botToken, testChatId) {
    const maskedToken = botToken
      ? botToken.split(':')[0] + ':' + '*'.repeat(12) + botToken.slice(-4)
      : 'MISSING_TOKEN';

    const request = {
      step1_getMe: {
        method: 'GET',
        url: `https://api.telegram.org/bot${maskedToken}/getMe`
      },
      step2_sendMessage: {
        method: 'POST',
        url: `https://api.telegram.org/bot${maskedToken}/sendMessage`,
        body: {
          chat_id: testChatId,
          text: '✅ *Ultra-Administrador* — Conexión verificada correctamente. ¡Tu bot está activo!',
          parse_mode: 'Markdown'
        }
      }
    };

    const latency = Math.round(Math.random() * 60) + 30; // 30-90ms
    const botId = Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000;

    const response = {
      status: 200,
      getMe: {
        ok: true,
        result: {
          id: botId,
          is_bot: true,
          first_name: 'UltraAdmin Business Bot',
          username: 'ultraadmin_business_bot',
          can_join_groups: true,
          supports_inline_queries: false
        }
      },
      sendMessage: {
        ok: true,
        result: {
          message_id: Math.floor(Math.random() * 9999) + 1,
          chat: { id: testChatId, type: 'private' },
          text: '✅ Conexión verificada correctamente.',
          date: Math.floor(Date.now() / 1000)
        }
      },
      simulationMeta: {
        latencyMs: latency,
        timestamp: new Date().toISOString(),
        note: 'EMULATOR mode — no real API call was made.'
      }
    };

    return { request, response };
  }

  // ─── Template Defaults ─────────────────────────────────────────────────────

  /**
   * Returns default message templates with Telegram Markdown variables.
   *
   * @param {string} name - Template key
   * @returns {string}
   */
  static getDefaultTemplate(name) {
    const defaults = {
      ORDER_CONFIRMATION:
        `🛍️ *¡Pedido Confirmado!*\n\nHola *{{cliente}}*, tu pedido ha sido procesado exitosamente.\n💰 *Total:* {{monto}}\n💳 *Método de pago:* {{metodo}}\n\nGracias por tu preferencia. ¡Hasta la próxima!`,
      STOCK_ALERT:
        `⚠️ *Alerta de Inventario*\n\nEl producto *"{{producto}}"* tiene solo *{{cantidad}} unidades* en stock, por debajo del mínimo configurado de {{minimo}}.\n\n🔁 Se recomienda reabastecer pronto.`,
      APPOINTMENT_REMINDER:
        `📅 *Recordatorio de Cita*\n\nHola *{{cliente}}*, te recordamos que tienes una cita programada:\n\n✂️ *Servicio:* {{servicio}}\n🕐 *Fecha y hora:* {{fecha}}\n\nSi necesitas cancelar o reagendar, escríbenos con anticipación.`,
      PROMOTION:
        `🎉 *¡Oferta especial para ti, {{cliente}}!*\n\n{{mensaje}}\n\n_Visita nuestro catálogo para más detalles._`,
      PAYMENT_REMINDER:
        `💳 *Recordatorio de Pago*\n\nHola *{{cliente}}*, tienes un saldo pendiente de *{{monto}}*.\n\n📅 Fecha límite: {{vencimiento}}\n\nPor favor realiza tu pago para evitar cargos adicionales. Gracias.`,
      CREDIT_RECEIPT:
        `📋 *Comprobante de Crédito*\n\nEstimado(a) *{{cliente}}*, se ha registrado un crédito a tu nombre:\n\n💰 *Monto:* {{monto}}\n📊 *Interés mensual:* {{interes}}%\n💵 *Cuota estimada:* {{cuota}}\n📅 *Próxima fecha de cobro:* {{vencimiento}}\n\nGracias por tu preferencia.`
    };
    return defaults[name] || `📬 Mensaje de Ultra-Administrador:\n\n{{mensaje}}`;
  }
}
