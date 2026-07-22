import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';
import { TimeService } from './time.service.js';

export class WhatsAppService {
  /**
   * Simulates sending a WhatsApp message via API and saves audit logs.
   *
   * @param {string} companyId 
   * @param {string} to - Destination phone number
   * @param {string} templateName - e.g. 'CREDIT_RECEIPT', 'ORDER_CONFIRMATION'
   * @param {Object} variables - Variables to interpolate in template
   * @returns {Promise<Object>} The simulated gateway log payload
   */
  static async sendMessage(companyId, to, templateName, variables = {}) {
    // 1. Check license
    const { currentCompany } = GlobalStore.getState();
    const isWhatsAppEnabled = currentCompany?.config?.enableWhatsApp === true;

    if (!isWhatsAppEnabled) {
      throw new Error('Licencia insuficiente: El plan actual del establecimiento no incluye la integración de WhatsApp API.');
    }

    // 2. Fetch catalog config to retrieve API credentials & custom templates
    const catalogConfig = await FirestoreService.readPath(`configuracion_catalogo/${companyId}`) || {};
    const apiConfig = catalogConfig.whatsappApi || {};
    
    const provider = apiConfig.provider || 'EMULATOR';
    const numberId = apiConfig.phoneNumberId || '108876251299';
    const templateText = (apiConfig.templates && apiConfig.templates[templateName]) || this.getDefaultTemplate(templateName);

    // 3. Interpolate variables in the template
    let messageText = templateText;
    Object.entries(variables).forEach(([key, val]) => {
      messageText = messageText.replace(new RegExp(`{{${key}}}`, 'g'), val);
    });

    // 4. Build simulation logs
    const logId = 'wa_msg_' + Date.now();
    const payload = {
      id: logId,
      to,
      templateName,
      variables,
      messageContent: messageText,
      gateway: provider,
      phoneNumberId: numberId,
      status: 'DELIVERED',
      responseCode: 200,
      timestamp: Date.now(),
      timestampLocal: TimeService.timestamp()
    };

    // 5. Save to Realtime Database for tenant analytics
    await FirestoreService.create('whatsapp_logs', payload, logId);

    console.log(`[WhatsApp API] 💬 Message sent to ${to} using gateway ${provider}. Log ID: ${logId}`);
    return payload;
  }

  /**
   * Performs an immediate simulation handshake for testing in settings panel.
   *
   * @param {Object} settings - Form settings inputs
   * @param {string} testPhone - Recipient phone number
   * @returns {Object} { request, response } raw JSON simulation logs
   */
  static testConnection(settings, testPhone) {
    const provider = settings.provider || 'EMULATOR';
    const token = settings.accessToken ? (settings.accessToken.substring(0, 12) + '***') : 'MISSING_TOKEN';
    
    const request = {
      url: provider === 'TWILIO' 
        ? `https://api.twilio.com/2010-04-01/Accounts/${settings.businessAccountId}/Messages.json`
        : `https://graph.facebook.com/v18.0/${settings.phoneNumberId}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: {
        messaging_product: 'whatsapp',
        to: testPhone,
        type: 'template',
        template: {
          name: 'hello_world',
          language: { code: 'es_MX' }
        }
      }
    };

    const response = {
      messaging_product: 'whatsapp',
      contacts: [
        {
          input: testPhone,
          wa_id: testPhone.replace(/\+/g, '')
        }
      ],
      messages: [
        {
          id: 'wamid.HBgMNTIxNTUxMjM0NTY3NhUCABEYEFQzNDA1RjBGRjg5NzQzN0FEQQA=',
          message_status: 'accepted'
        }
      ],
      simulationMeta: {
        gatewayUsed: provider,
        handshakeResult: 'SUCCESS',
        latencyMs: Math.round(150 + Math.random() * 200),
        status: 200,
        statusText: 'OK'
      }
    };

    return { request, response };
  }

  /**
   * Helper fallback templates
   */
  static getDefaultTemplate(name) {
    const defaults = {
      CREDIT_RECEIPT: `Estimado(a) {{cliente}}, le notificamos la apertura de su crédito por un monto de {{monto}} al {{interes}}% de interés mensual. Cuota estimada: {{cuota}}. Próxima fecha de cobro: {{vencimiento}}. Gracias por su preferencia.`,
      ORDER_CONFIRMATION: `¡Hola {{cliente}}! Tu pedido en {{negocio}} ha sido confirmado. Monto total: {{monto}}. Método de pago: {{metodo}}. Estaremos actualizando el estado de tu entrega.`,
      PROMOTION: `¡Atención {{cliente}}! Tenemos promociones especiales en stock para ti hoy. Consulta nuestro catálogo en línea: {{url}}`,
      LOW_STOCK_ALERT: `⚠️ Alerta de Inventario: El producto "{{producto}}" tiene {{cantidad}} unidades en stock, por debajo del mínimo configurado de {{minimo}}. Te recomendamos reabastecer pronto.`
    };
    return defaults[name] || `Mensaje automático de Ultra-Administrador: {{mensaje}}`;
  }

  /**
   * Simulates receiving an incoming message from a client, registering the chat
   * and executing auto-responder, FAQ, and AI-like inventory/order chatbot logic.
   *
   * @param {string} companyId
   * @param {string} from - Sender's phone number
   * @param {string} text - Message body
   */
  static async receiveIncomingMessage(companyId, from, text) {
    const conversationId = `conv_${from.replace(/\+/g, '')}`;
    
    // 1. Resolve client name from recurring_clients
    const clients = await FirestoreService.readPath(`${companyId}/recurring_clients`) || [];
    const clientList = Object.entries(clients).map(([id, data]) => ({ id, ...data }));
    const matchedClient = clientList.find(c => c.phone === from || c.phone?.replace(/\+/g, '') === from.replace(/\+/g, ''));
    const clientName = matchedClient ? matchedClient.name : `Cliente (${from.slice(-4)})`;
    const clientId = matchedClient ? matchedClient.id : 'anonymous';

    // 2. Fetch conversation
    const convPath = `whatsapp_conversations/${conversationId}`;
    let conversation = await FirestoreService.readPath(`${companyId}/${convPath}`) || null;

    if (!conversation) {
      conversation = {
        id: conversationId,
        clientId,
        clientName,
        clientPhone: from,
        lastMessage: '',
        updatedAt: Date.now(),
        assignedEmployeeId: null,
        status: 'OPEN',
        messages: []
      };
    }

    const messages = conversation.messages ? Object.values(conversation.messages) : [];
    
    // 3. Add client's message
    const clientMsgId = 'msg_' + Date.now() + '_c';
    const clientMsg = {
      id: clientMsgId,
      sender: 'CLIENT',
      senderName: clientName,
      text: text,
      timestamp: Date.now()
    };
    messages.push(clientMsg);
    
    conversation.messages = messages;
    conversation.lastMessage = text;
    conversation.updatedAt = Date.now();

    await FirestoreService.setGlobal(companyId, convPath, conversation);

    // 4. Chatbot and auto-responder evaluation
    const catalogConfig = await FirestoreService.readPath(`configuracion_catalogo/${companyId}`) || {};
    const isWhatsAppEnabled = catalogConfig.whatsappApi?.provider ? true : false;
    const apiConfig = catalogConfig.whatsappApi || {};
    const auto = apiConfig.autoResponder || {};
    const bot = apiConfig.chatbot || {};

    if (!isWhatsAppEnabled) return;

    let botReplies = [];

    // Rule 1: Out of Office hours check
    if (auto.outOfOfficeEnabled) {
      const currentHour = new Date().getHours();
      // Assume closed outside 8 AM - 8 PM
      const isClosed = currentHour < 8 || currentHour >= 20;
      if (isClosed) {
        botReplies.push(auto.outOfOfficeText || 'Hola. En este momento nos encontramos fuera del horario laboral. Le atenderemos lo antes posible.');
      }
    }

    // Rule 2: Welcome message (if no messages in last 12 hours)
    if (auto.welcomeEnabled && botReplies.length === 0) {
      const timeLimit = Date.now() - (12 * 60 * 60 * 1000);
      const recentMessages = messages.filter(m => m.timestamp > timeLimit);
      // If only the current client message is recent
      if (recentMessages.length <= 1) {
        botReplies.push(auto.welcomeText || `¡Hola! Bienvenido a nuestro servicio de WhatsApp. ¿En qué te podemos ayudar hoy?`);
      }
    }

    // Rule 3: FAQs checking
    if (auto.faqEnabled && botReplies.length === 0) {
      const faqsList = auto.faqs || [];
      const cleanText = text.toLowerCase();
      const matchedFaq = faqsList.find(f => f.keyword && cleanText.includes(f.keyword.toLowerCase()));
      if (matchedFaq) {
        botReplies.push(matchedFaq.response);
      }
    }

    // Rule 4: Intelligent Chatbot integration (Stock and Orders)
    if (bot.enabled && botReplies.length === 0) {
      const cleanText = text.toLowerCase();
      
      // A. Catalog Stock Lookup
      if (bot.queryStock && (cleanText.includes('stock') || cleanText.includes('precio') || cleanText.includes('inventario') || cleanText.includes('disponible'))) {
        const products = await FirestoreService.readPath(`${companyId}/productos`) || [];
        const prodList = Object.entries(products).map(([id, data]) => ({ id, ...data }));
        
        // Find if user specifically mentioned a product name
        const mentionedProduct = prodList.find(p => cleanText.includes(p.name.toLowerCase()));
        if (mentionedProduct) {
          botReplies.push(`🔍 [Chatbot]: Confirmamos que ${mentionedProduct.name} ${mentionedProduct.stock > 0 ? `está disponible con un stock de ${mentionedProduct.stock} unidades` : 'se encuentra agotado en este momento'}. Precio: $${mentionedProduct.price.toFixed(2)}.`);
        } else {
          // General lookup summary
          const limitCount = prodList.slice(0, 3);
          const summary = limitCount.map(p => `- ${p.name}: $${p.price.toFixed(2)} (${p.stock} pzas)`).join('\n');
          botReplies.push(`🔍 [Chatbot]: Consulta de Catálogo. Algunos de nuestros productos disponibles:\n${summary}\n\nPuedes ver todos los artículos en nuestra tienda digital.`);
        }
      }
      
      // B. Order Status Lookup
      else if (bot.queryOrders && (cleanText.includes('pedido') || cleanText.includes('comanda') || cleanText.includes('mi orden') || cleanText.includes('mi compra'))) {
        const sales = await FirestoreService.readPath(`${companyId}/ventas`) || [];
        const salesList = Object.entries(sales).map(([id, data]) => ({ id, ...data }));
        
        // Filter by phone or client name matching
        const clientSales = salesList.filter(s => {
          const matchedPhone = matchedClient && s.clientName?.toLowerCase() === matchedClient.name?.toLowerCase();
          return matchedPhone || s.clientName?.toLowerCase() === clientName.toLowerCase();
        });

        if (clientSales.length > 0) {
          // Get most recent sale
          const latestSale = clientSales.sort((a, b) => (b.date || 0) - (a.date || 0))[0];
          botReplies.push(`📦 [Chatbot]: Tu último pedido por $${latestSale.total?.toFixed(2) || '0.00'} del ${new Date(latestSale.date).toLocaleDateString()} se encuentra en estado: **COMPLETADO / ENTREGADO**.`);
        } else {
          botReplies.push(`📦 [Chatbot]: No encontramos compras recientes asociadas a tu número de teléfono en nuestra base de datos.`);
        }
      }

      // C. Human Escalation / Agent Assignment
      else if (cleanText.includes('agente') || cleanText.includes('humano') || cleanText.includes('asesor') || cleanText.includes('soporte') || cleanText.includes('ayuda')) {
        conversation.assignedEmployeeId = 'agent-1';
        botReplies.push(`💬 [Chatbot]: He derivado esta conversación a uno de nuestros agentes de atención al cliente. Un asesor se comunicará contigo de inmediato.`);
      }
    }

    // 5. Save Bot Replies (delayed simulation)
    if (botReplies.length > 0) {
      for (const replyText of botReplies) {
        const botMsgId = 'msg_' + Date.now() + '_b';
        const botMsg = {
          id: botMsgId,
          sender: 'BOT',
          senderName: 'Chatbot',
          text: replyText,
          timestamp: Date.now()
        };
        messages.push(botMsg);
        
        conversation.messages = messages;
        conversation.lastMessage = replyText;
        conversation.updatedAt = Date.now();

        await FirestoreService.setGlobal(companyId, convPath, conversation);

        // Also add audit log for stats transparency
        const logId = 'wa_msg_' + Date.now() + '_auto';
        await FirestoreService.create('whatsapp_logs', {
          id: logId,
          to: from,
          templateName: 'AUTO_REPLY',
          messageContent: replyText,
          gateway: apiConfig.provider || 'EMULATOR',
          phoneNumberId: apiConfig.phoneNumberId || '108876251299',
          status: 'DELIVERED',
          responseCode: 200,
          timestamp: Date.now(),
          timestampLocal: TimeService.timestamp()
        }, logId);
      }
    }
  }

  /**
   * Simulates a batch marketing broadcast campaign to a segmented client list.
   *
   * @param {string} companyId
   * @param {string} targetSegment - 'ALL' | 'ACTIVE' | 'PENDING_DEBT'
   * @param {string} messageText - Custom body message
   * @returns {Promise<number>} - Count of successfully delivered messages
   */
  static async sendBroadcast(companyId, targetSegment, messageText) {
    // 1. Fetch license
    const catalogConfig = await FirestoreService.readPath(`configuracion_catalogo/${companyId}`) || {};
    const apiConfig = catalogConfig.whatsappApi || {};
    const provider = apiConfig.provider || 'EMULATOR';

    // 2. Fetch clients
    const clients = await FirestoreService.readPath(`${companyId}/recurring_clients`) || [];
    const clientList = Object.entries(clients).map(([id, data]) => ({ id, ...data }));
    
    // 3. Segment filtering
    let targets = [];
    if (targetSegment === 'ACTIVE') {
      targets = clientList.filter(c => c.status === 'Activo');
    } else if (targetSegment === 'PENDING_DEBT') {
      targets = clientList.filter(c => Number(c.currentDebt || 0) > 0);
    } else {
      targets = clientList; // ALL
    }

    let sentCount = 0;
    
    // 4. Iterate and simulate sending
    for (const client of targets) {
      if (!client.phone) continue;

      let personalizedText = messageText.replace(/{{cliente}}/g, client.name);
      personalizedText = personalizedText.replace(/{{deuda}}/g, new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(client.currentDebt || 0));

      const logId = 'wa_msg_broadcast_' + Date.now() + '_' + client.id;
      const payload = {
        id: logId,
        to: client.phone,
        templateName: 'PROMOTION',
        messageContent: personalizedText,
        gateway: provider,
        phoneNumberId: apiConfig.phoneNumberId || '108876251299',
        status: 'DELIVERED',
        responseCode: 200,
        timestamp: Date.now(),
        timestampLocal: TimeService.timestamp()
      };

      // A. Save audit log
      await FirestoreService.create('whatsapp_logs', payload, logId);

      // B. Append to live chat thread
      const conversationId = `conv_${client.phone.replace(/\+/g, '')}`;
      const convPath = `whatsapp_conversations/${conversationId}`;
      let conversation = await FirestoreService.readPath(`${companyId}/${convPath}`) || null;

      if (!conversation) {
        conversation = {
          id: conversationId,
          clientId: client.id,
          clientName: client.name,
          clientPhone: client.phone,
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

  /**
   * Sends an order confirmation message to a client's WhatsApp.
   * Called automatically by POS after successful checkout. Fire-and-forget.
   *
   * @param {string} companyId
   * @param {string} clientPhone - Format: 5215512345678
   * @param {Object} orderData - { clientName, total, paymentMethod }
   */
  static async sendOrderConfirmation(companyId, clientPhone, orderData = {}) {
    const { clientName = 'Cliente', total = 0, paymentMethod = 'EFECTIVO' } = orderData;
    try {
      await WhatsAppService.sendMessage(companyId, clientPhone, 'ORDER_CONFIRMATION', {
        cliente: clientName,
        monto: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(total),
        metodo: paymentMethod
      });
    } catch (e) {
      // Non-blocking: never interrupt the POS checkout flow
      console.warn('[WhatsAppService] sendOrderConfirmation skipped:', e.message);
    }
  }

  /**
   * Sends a low-stock alert to the owner's WhatsApp when product stock
   * drops below the configured minimum threshold after a sale.
   *
   * @param {string} companyId
   * @param {string} productName
   * @param {number} currentStock
   * @param {number} threshold
   */
  static async sendLowStockAlert(companyId, productName, currentStock, threshold) {
    try {
      const { currentCompany } = GlobalStore.getState();
      const ownerPhone = currentCompany?.config?.ownerWhatsApp || currentCompany?.config?.contactPhone || null;
      if (!ownerPhone) return; // No phone configured — skip silently

      await WhatsAppService.sendMessage(companyId, ownerPhone, 'LOW_STOCK_ALERT', {
        producto: productName,
        cantidad: currentStock,
        minimo: threshold
      });
    } catch (e) {
      console.warn('[WhatsAppService] sendLowStockAlert skipped:', e.message);
    }
  }
}
