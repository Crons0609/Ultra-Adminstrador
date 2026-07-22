/**
 * @file payment-reminders.service.js
 * @description Automated Payment & Debt Reminders Service for Ultra-Administrador SaaS.
 * Evaluates pending client debts/credits, calculates due dates (including 2-day pre-due alerts
 * and post-due overdue milestones), interpolates customizable message templates, and dispatches
 * notifications via WhatsApp and Telegram APIs isolated per companyId.
 */

import { FirestoreService } from './firestore.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { TelegramService } from './telegram.service.js';
import { GlobalStore } from '../core/state.js';
import { TimeService } from './time.service.js';

export class PaymentRemindersService {
  /**
   * Evaluates all active credits and pending debts for a given company
   * and automatically dispatches due/overdue reminders via WhatsApp and Telegram.
   *
   * @param {string} companyId
   * @returns {Promise<Object>} Summary of evaluation { evaluatedCount, dispatchedCount, skippedCount, errors }
   */
  static async evaluateAndDispatchReminders(companyId) {
    if (!companyId) return { evaluatedCount: 0, dispatchedCount: 0, skippedCount: 0, errors: [] };

    // 1. Fetch business catalog config for reminders
    const catalogConfig = await FirestoreService.readPath(`configuracion_catalogo/${companyId}`) || {};
    const config = catalogConfig.paymentRemindersConfig || this.getDefaultConfig();

    if (config.enabled === false || config.autoDispatch === false) {
      console.log(`[PaymentRemindersService] Automated reminders disabled for company: ${companyId}`);
      return { evaluatedCount: 0, dispatchedCount: 0, skippedCount: 0, errors: [] };
    }

    // 2. Fetch credits and recurring clients
    const creditsRaw = await FirestoreService.readPath(`${companyId}/credits`)
      || await FirestoreService.readPath(`credits/${companyId}`)
      || {};
    const clientsRaw = await FirestoreService.readPath(`${companyId}/recurring_clients`) || {};

    const creditsList = Object.entries(creditsRaw).map(([id, val]) => ({ id, ...val }));
    const clientsList = Object.entries(clientsRaw).map(([id, val]) => ({ id, ...val }));

    // 3. Fetch past reminder logs to prevent duplicate daily dispatches
    const logsRaw = await FirestoreService.readPath(`${companyId}/payment_reminder_logs`)
      || await FirestoreService.readPath(`payment_reminder_logs/${companyId}`)
      || {};
    const logsList = Object.values(logsRaw);

    const now = Date.now();
    const todayStr = new Date(now).toISOString().split('T')[0];

    let dispatchedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (const credit of creditsList) {
      try {
        const remaining = Number(credit.remainingAmount ?? credit.currentDebt ?? credit.initialAmount ?? 0);
        const isPaid = credit.status === 'PAGADO' || credit.status === 'CANCELADO' || remaining <= 0;

        if (isPaid) {
          skippedCount++;
          continue;
        }

        // Resolve client details
        const client = clientsList.find(c => c.id === credit.clientId || c.name === credit.clientName) || {};
        const clientName = credit.clientName || client.name || 'Cliente';
        const clientPhone = credit.clientPhone || client.phone || '';
        const telegramChatId = credit.telegramChatId || client.telegramChatId || '';

        // Determine due date timestamp
        const dueDateTs = this.calculateDueDateTimestamp(credit);
        const daysDiff = Math.ceil((dueDateTs - now) / 86400000); // positive = days until due, negative = overdue

        const preDueDays = Number(config.preDueDays ?? 2);
        const postDueDays = Array.isArray(config.postDueDays) ? config.postDueDays : [1, 7];

        let shouldDispatch = false;
        let triggerType = 'PRE_DUE';
        let templateKey = 'PRE_DUE';

        // Case A: Pre-due alert (e.g. 2 days before due date)
        if (daysDiff === preDueDays) {
          shouldDispatch = true;
          triggerType = 'AUTO_PRE_DUE';
          templateKey = 'PRE_DUE';
        }
        // Case B: Due day (Due TODAY)
        else if (daysDiff === 0) {
          shouldDispatch = true;
          triggerType = 'AUTO_DUE_DAY';
          templateKey = 'DUE_DAY';
        }
        // Case C: Overdue milestones (e.g. 1 day late, 7 days late)
        else if (daysDiff < 0) {
          const overdueDays = Math.abs(daysDiff);
          if (postDueDays.includes(overdueDays)) {
            shouldDispatch = true;
            triggerType = `AUTO_OVERDUE_${overdueDays}D`;
            templateKey = overdueDays >= 7 ? 'OVERDUE_HEAVY' : 'OVERDUE_LIGHT';
          }
        }

        if (!shouldDispatch) {
          skippedCount++;
          continue;
        }

        // Check if reminder was already sent today for this credit & triggerType
        const alreadySentToday = logsList.some(l =>
          l.creditId === credit.id &&
          l.triggerType === triggerType &&
          l.timestampLocal && l.timestampLocal.startsWith(todayStr) &&
          l.status === 'DELIVERED'
        );

        if (alreadySentToday) {
          skippedCount++;
          continue;
        }

        // Prepare message variables
        const variables = {
          cliente: clientName,
          monto: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(remaining),
          concepto: credit.concept || credit.description || 'Crédito pendiente',
          vencimiento: new Date(dueDateTs).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }),
          negocio: catalogConfig.businessName || GlobalStore.getState().currentCompany?.name || 'Nuestro Negocio'
        };

        const preferredChannel = config.preferredChannel || 'BOTH';

        // Dispatch via WhatsApp
        if ((preferredChannel === 'WHATSAPP' || preferredChannel === 'BOTH') && clientPhone) {
          const result = await this.dispatchChannelMessage(companyId, 'WHATSAPP', clientPhone, credit, templateKey, variables, triggerType, config);
          if (result.success) dispatchedCount++;
        }

        // Dispatch via Telegram
        if ((preferredChannel === 'TELEGRAM' || preferredChannel === 'BOTH') && telegramChatId) {
          const result = await this.dispatchChannelMessage(companyId, 'TELEGRAM', telegramChatId, credit, templateKey, variables, triggerType, config);
          if (result.success) dispatchedCount++;
        }
      } catch (err) {
        console.error(`[PaymentRemindersService] Error processing credit ${credit.id}:`, err);
        errors.push({ creditId: credit.id, error: err.message });
      }
    }

    return { evaluatedCount: creditsList.length, dispatchedCount, skippedCount, errors };
  }

  /**
   * Dispatches a single reminder message via WhatsApp or Telegram and logs the result.
   */
  static async dispatchChannelMessage(companyId, channel, recipientId, credit, templateKey, variables, triggerType, config) {
    const logId = `rem_log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const templateText = (config.templates && config.templates[templateKey])
      || this.getDefaultTemplates()[templateKey]
      || this.getDefaultTemplates().PRE_DUE;

    const interpolatedText = this.interpolateTemplate(templateText, variables);

    const logPayload = {
      id: logId,
      creditId: credit.id,
      clientId: credit.clientId || 'anonymous',
      clientName: variables.cliente,
      phone: channel === 'WHATSAPP' ? recipientId : (credit.clientPhone || ''),
      telegramChatId: channel === 'TELEGRAM' ? recipientId : (credit.telegramChatId || ''),
      amount: Number(credit.remainingAmount ?? credit.initialAmount ?? 0),
      concept: variables.concepto,
      dueDate: this.calculateDueDateTimestamp(credit),
      channel,
      triggerType,
      templateKey,
      messageContent: interpolatedText,
      status: 'DELIVERED',
      timestamp: Date.now(),
      timestampLocal: TimeService.timestamp()
    };

    try {
      if (channel === 'WHATSAPP') {
        await WhatsAppService.sendMessage(companyId, recipientId, 'PAYMENT_REMINDER', variables);
      } else if (channel === 'TELEGRAM') {
        await TelegramService.sendMessage(companyId, recipientId, 'PAYMENT_REMINDER', variables);
      }

      await FirestoreService.create('payment_reminder_logs', logPayload, logId);
      return { success: true, logId };
    } catch (e) {
      console.warn(`[PaymentRemindersService] ${channel} reminder failed for ${recipientId}:`, e.message);
      logPayload.status = 'FAILED';
      logPayload.error = e.message;
      await FirestoreService.create('payment_reminder_logs', logPayload, logId).catch(() => {});
      return { success: false, error: e.message };
    }
  }

  /**
   * Sends a manual reminder on demand from the UI.
   *
   * @param {string} companyId
   * @param {Object} credit
   * @param {'WHATSAPP' | 'TELEGRAM'} channel
   * @param {string} templateKey
   * @returns {Promise<Object>}
   */
  static async sendReminderNow(companyId, credit, channel, templateKey = 'PRE_DUE') {
    const catalogConfig = await FirestoreService.readPath(`configuracion_catalogo/${companyId}`) || {};
    const config = catalogConfig.paymentRemindersConfig || this.getDefaultConfig();

    const remaining = Number(credit.remainingAmount ?? credit.initialAmount ?? 0);
    const dueDateTs = this.calculateDueDateTimestamp(credit);

    const variables = {
      cliente: credit.clientName || 'Cliente',
      monto: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(remaining),
      concepto: credit.concept || credit.description || 'Crédito pendiente',
      vencimiento: new Date(dueDateTs).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }),
      negocio: catalogConfig.businessName || GlobalStore.getState().currentCompany?.name || 'Nuestro Negocio'
    };

    const recipient = channel === 'WHATSAPP'
      ? (credit.clientPhone || credit.phone)
      : (credit.telegramChatId || credit.chatId);

    if (!recipient) {
      throw new Error(`El cliente no tiene un ${channel === 'WHATSAPP' ? 'número de teléfono' : 'chat_id de Telegram'} registrado.`);
    }

    return await this.dispatchChannelMessage(companyId, channel, recipient, credit, templateKey, variables, 'MANUAL', config);
  }

  /**
   * Marks a credit/debt as paid and updates status to stop automatic reminders.
   *
   * @param {string} companyId
   * @param {string} creditId
   */
  static async markDebtAsPaid(companyId, creditId) {
    if (!companyId || !creditId) return;
    try {
      await FirestoreService.update('credits', creditId, {
        remainingAmount: 0,
        status: 'PAGADO',
        paidAt: Date.now(),
        paidAtLocal: TimeService.timestamp()
      });
      console.log(`[PaymentRemindersService] Credit ${creditId} marked as PAGADO. Reminders stopped.`);
    } catch (e) {
      console.warn(`[PaymentRemindersService] Could not mark credit as paid:`, e.message);
    }
  }

  /**
   * Replaces template placeholder tags with actual credit values.
   */
  static interpolateTemplate(template, data = {}) {
    if (!template) return '';
    let result = template;
    Object.entries(data).forEach(([key, val]) => {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), val ?? '');
    });
    return result;
  }

  /**
   * Calculates the exact due date timestamp for a credit item.
   * Handles explicit `dueDate` timestamps or `dueDay` (day of month, e.g. 15).
   */
  static calculateDueDateTimestamp(credit) {
    if (credit.dueDate && Number(credit.dueDate) > 0) {
      return Number(credit.dueDate);
    }

    // Default to dueDay of month (e.g. 15th of current month)
    const dueDay = Number(credit.dueDay || credit.paymentDay || 15);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const targetDate = new Date(currentYear, currentMonth, Math.min(dueDay, 28), 12, 0, 0);
    return targetDate.getTime();
  }

  /**
   * Returns default module configuration settings.
   */
  static getDefaultConfig() {
    return {
      enabled: true,
      autoDispatch: true,
      preDueDays: 2,
      postDueDays: [1, 7],
      preferredChannel: 'BOTH',
      minDebtAmount: 0,
      templates: this.getDefaultTemplates()
    };
  }

  /**
   * Returns default message templates with placeholders.
   */
  static getDefaultTemplates() {
    return {
      PRE_DUE: `Hola, {{cliente}}. Le recordamos que tiene un pago pendiente de {{monto}} correspondiente a {{concepto}}. La fecha límite para realizar su pago es el {{vencimiento}}. Por favor realice el pago antes de esa fecha para evitar inconvenientes. Si ya realizó el pago, por favor ignore este mensaje. Gracias por su preferencia. — {{negocio}}`,
      DUE_DAY: `👋 Hola {{cliente}}, hoy es la fecha límite para realizar tu pago de {{monto}} por {{concepto}} en {{negocio}}. Por favor realiza tu depósito o visítanos hoy. ¡Gracias!`,
      OVERDUE_LIGHT: `⚠️ Hola {{cliente}}, le informamos que su pago de {{monto}} por {{concepto}} venció el {{vencimiento}} y se encuentra PENDIENTE. Por favor realice su pago a la brevedad posible. {{negocio}}`,
      OVERDUE_HEAVY: `🚨 AVISO DE COBRANZA: Hola {{cliente}}, su saldo de {{monto}} presenta un retraso considerable (venció el {{vencimiento}}). Favor de comunicarse urgentemente con {{negocio}} para regularizar su cuenta.`
    };
  }
}
