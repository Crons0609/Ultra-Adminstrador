/**
 * @file supplier-reminders.service.js
 * @description Automated Payment Reminders Service for Supplier Bills and Basic Services (Rent, Water, Electricity, Internet, Taxes).
 * Evaluates pending outgoing obligations, calculates due date milestones (2 days before, 1 day before, same day, overdue),
 * and dispatches automated notifications directly to the business owner/manager via WhatsApp and Telegram APIs.
 */

import { FirestoreService } from './firestore.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { TelegramService } from './telegram.service.js';
import { GlobalStore } from '../core/state.js';
import { TimeService } from './time.service.js';

export class SupplierRemindersService {
  /**
   * Scans all pending outgoing obligations (supplier bills, basic services, rent, taxes)
   * and automatically notifies the business owner/manager via WhatsApp and/or Telegram.
   *
   * @param {string} companyId
   * @returns {Promise<Object>} Execution summary
   */
  static async evaluateAndDispatchReminders(companyId) {
    if (!companyId) return { evaluatedCount: 0, dispatchedCount: 0, skippedCount: 0, errors: [] };

    // 1. Fetch catalog configuration for supplier reminders
    const catalogConfig = await FirestoreService.readPath(`configuracion_catalogo/${companyId}`) || {};
    const config = catalogConfig.supplierRemindersConfig || this.getDefaultConfig();

    if (config.enabled === false) {
      console.log(`[SupplierRemindersService] Supplier reminders disabled for company: ${companyId}`);
      return { evaluatedCount: 0, dispatchedCount: 0, skippedCount: 0, errors: [] };
    }

    // 2. Consolidate outgoing payments from:
    // a) supplier_payments (custom registered payments)
    // b) accounts_payable (bills)
    // c) basic_services (services)
    const customPaymentsRaw = await FirestoreService.readPath(`${companyId}/supplier_payments`) || {};
    const accountsPayableRaw = await FirestoreService.readPath(`${companyId}/accounts_payable`) || {};
    const basicServicesRaw = await FirestoreService.readPath(`${companyId}/basic_services`) || {};

    const payments = [
      ...Object.entries(customPaymentsRaw).map(([id, val]) => ({ id, collection: 'supplier_payments', ...val })),
      ...Object.entries(accountsPayableRaw).map(([id, val]) => ({
        id,
        collection: 'accounts_payable',
        providerName: val.supplierName || 'Proveedor',
        category: 'PROVEEDOR',
        ...val
      })),
      ...Object.entries(basicServicesRaw).map(([id, val]) => ({
        id,
        collection: 'basic_services',
        providerName: `${val.serviceType || 'Servicio'} (${val.providerName || 'N/D'})`,
        category: val.serviceType || 'SERVICIO',
        ...val
      }))
    ];

    // 3. Fetch past logs to prevent duplicate daily dispatches per triggerType
    const logsRaw = await FirestoreService.readPath(`${companyId}/supplier_reminder_logs`) || {};
    const logsList = Object.values(logsRaw);

    const now = Date.now();
    const todayStr = new Date(now).toISOString().split('T')[0];

    let dispatchedCount = 0;
    let skippedCount = 0;
    const errors = [];

    const companyConfig = GlobalStore.getState().currentCompany?.config || {};
    const recipientPhone = config.recipientPhone || companyConfig.ownerWhatsApp || companyConfig.contactPhone || '';
    const recipientTelegramChatId = config.recipientTelegramChatId || companyConfig.ownerTelegramChatId || '';

    const frequencies = config.frequencies || { twoDaysBefore: true, oneDayBefore: true, sameDay: true, overdue: true };

    for (const item of payments) {
      try {
        const isPaid = item.status === 'PAGADO' || item.status === 'LIQUIDADO' || Number(item.amount || 0) <= 0;
        if (isPaid) {
          skippedCount++;
          continue;
        }

        const dueDateTs = Number(item.dueDate || Date.now());
        const daysDiff = Math.ceil((dueDateTs - now) / 86400000); // positive = days left, negative = overdue

        let shouldTrigger = false;
        let triggerType = 'SAME_DAY';
        let templateKey = 'PREVENTIVE';

        if (daysDiff === 2 && frequencies.twoDaysBefore !== false) {
          shouldTrigger = true;
          triggerType = '2_DAYS_BEFORE';
          templateKey = 'PREVENTIVE';
        } else if (daysDiff === 1 && frequencies.oneDayBefore !== false) {
          shouldTrigger = true;
          triggerType = '1_DAY_BEFORE';
          templateKey = 'PREVENTIVE';
        } else if (daysDiff === 0 && frequencies.sameDay !== false) {
          shouldTrigger = true;
          triggerType = 'SAME_DAY';
          templateKey = 'SAME_DAY';
        } else if (daysDiff < 0 && frequencies.overdue !== false) {
          shouldTrigger = true;
          triggerType = 'OVERDUE';
          templateKey = 'OVERDUE';
        }

        if (!shouldTrigger) {
          skippedCount++;
          continue;
        }

        // Check if reminder was already dispatched today for this payment & triggerType
        const alreadySentToday = logsList.some(l =>
          l.paymentId === item.id &&
          l.triggerType === triggerType &&
          l.timestampLocal && l.timestampLocal.startsWith(todayStr) &&
          l.status === 'DELIVERED'
        );

        if (alreadySentToday) {
          skippedCount++;
          continue;
        }

        // Variables for interpolation
        const variables = {
          proveedor: item.providerName || 'Proveedor',
          categoria: item.category || 'Servicio/Proveedor',
          monto: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.amount || 0),
          vencimiento: new Date(dueDateTs).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }),
          negocio: catalogConfig.businessName || GlobalStore.getState().currentCompany?.name || 'Nuestro Negocio'
        };

        const preferredChannel = config.preferredChannel || 'BOTH';

        // Dispatch WhatsApp to Owner
        if ((preferredChannel === 'WHATSAPP' || preferredChannel === 'BOTH') && recipientPhone) {
          const res = await this.dispatchChannelMessage(companyId, 'WHATSAPP', recipientPhone, item, templateKey, variables, triggerType, config);
          if (res.success) dispatchedCount++;
        }

        // Dispatch Telegram to Owner
        if ((preferredChannel === 'TELEGRAM' || preferredChannel === 'BOTH') && recipientTelegramChatId) {
          const res = await this.dispatchChannelMessage(companyId, 'TELEGRAM', recipientTelegramChatId, item, templateKey, variables, triggerType, config);
          if (res.success) dispatchedCount++;
        }
      } catch (err) {
        console.error(`[SupplierRemindersService] Error processing payment item ${item.id}:`, err);
        errors.push({ paymentId: item.id, error: err.message });
      }
    }

    return { evaluatedCount: payments.length, dispatchedCount, skippedCount, errors };
  }

  /**
   * Formats, sends and logs a single reminder notification to the business owner/manager.
   */
  static async dispatchChannelMessage(companyId, channel, recipient, item, templateKey, variables, triggerType, config) {
    const logId = `sup_log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const templateText = (config.templates && config.templates[templateKey])
      || this.getDefaultTemplates()[templateKey]
      || this.getDefaultTemplates().PREVENTIVE;

    const interpolatedText = this.interpolateTemplate(templateText, variables);

    const logPayload = {
      id: logId,
      paymentId: item.id,
      providerName: variables.proveedor,
      category: item.category || 'Servicio',
      amount: Number(item.amount || 0),
      dueDate: Number(item.dueDate || Date.now()),
      channel,
      recipient,
      triggerType,
      messageContent: interpolatedText,
      status: 'DELIVERED',
      timestamp: Date.now(),
      timestampLocal: TimeService.timestamp()
    };

    try {
      if (channel === 'WHATSAPP') {
        await WhatsAppService.sendMessage(companyId, recipient, 'PROMOTION', {
          cliente: 'Administrador',
          mensaje: interpolatedText,
          url: window.location.origin + '/#/owner/supplier-reminders'
        });
      } else if (channel === 'TELEGRAM') {
        await TelegramService.sendMessage(companyId, recipient, 'PROMOTION', {
          cliente: 'Administrador',
          mensaje: interpolatedText,
          url: window.location.origin + '/#/owner/supplier-reminders'
        });
      }

      await FirestoreService.create('supplier_reminder_logs', logPayload, logId);
      return { success: true, logId };
    } catch (e) {
      console.warn(`[SupplierRemindersService] ${channel} dispatch failed for ${recipient}:`, e.message);
      logPayload.status = 'FAILED';
      logPayload.error = e.message;
      await FirestoreService.create('supplier_reminder_logs', logPayload, logId).catch(() => {});
      return { success: false, error: e.message };
    }
  }

  /**
   * Sends a manual reminder notification on demand from the UI.
   */
  static async sendReminderNow(companyId, item, channel, templateKey = 'PREVENTIVE') {
    const catalogConfig = await FirestoreService.readPath(`configuracion_catalogo/${companyId}`) || {};
    const config = catalogConfig.supplierRemindersConfig || this.getDefaultConfig();
    const companyConfig = GlobalStore.getState().currentCompany?.config || {};

    const recipient = channel === 'WHATSAPP'
      ? (config.recipientPhone || companyConfig.ownerWhatsApp || companyConfig.contactPhone)
      : (config.recipientTelegramChatId || companyConfig.ownerTelegramChatId);

    if (!recipient) {
      throw new Error(`No se ha configurado un ${channel === 'WHATSAPP' ? 'número de WhatsApp' : 'chat_id de Telegram'} para recibir las notificaciones del negocio.`);
    }

    const dueDateTs = Number(item.dueDate || Date.now());
    const variables = {
      proveedor: item.providerName || 'Proveedor',
      categoria: item.category || 'Servicio/Proveedor',
      monto: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.amount || 0),
      vencimiento: new Date(dueDateTs).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }),
      negocio: catalogConfig.businessName || GlobalStore.getState().currentCompany?.name || 'Nuestro Negocio'
    };

    return await this.dispatchChannelMessage(companyId, channel, recipient, item, templateKey, variables, 'MANUAL', config);
  }

  /**
   * Marks a payment as paid and updates status across collections.
   */
  static async markPaymentAsPaid(companyId, paymentId, collectionName = 'supplier_payments') {
    if (!companyId || !paymentId) return;
    try {
      await FirestoreService.update(collectionName, paymentId, {
        status: 'PAGADO',
        paidAt: Date.now(),
        paidAtLocal: TimeService.timestamp()
      });
      console.log(`[SupplierRemindersService] Payment ${paymentId} in ${collectionName} marked as PAGADO.`);
    } catch (e) {
      console.warn(`[SupplierRemindersService] Error marking payment as paid:`, e.message);
    }
  }

  /**
   * Replaces placeholders in templates with actual values.
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
   * Returns default configuration for supplier payment reminders.
   */
  static getDefaultConfig() {
    const companyConfig = GlobalStore.getState().currentCompany?.config || {};
    return {
      enabled: true,
      recipientPhone: companyConfig.ownerWhatsApp || companyConfig.contactPhone || '',
      recipientTelegramChatId: companyConfig.ownerTelegramChatId || '',
      preferredChannel: 'BOTH',
      frequencies: {
        twoDaysBefore: true,
        oneDayBefore: true,
        sameDay: true,
        overdue: true
      },
      templates: this.getDefaultTemplates()
    };
  }

  /**
   * Default notification templates.
   */
  static getDefaultTemplates() {
    return {
      PREVENTIVE: `🔔 *Recordatorio de pago pendiente*\n\nHola, tienes un pago pendiente de *{{monto}}* correspondiente a *{{proveedor}}* ({{categoria}}).\n\n📅 La fecha límite para realizar este pago es el *{{vencimiento}}*.\nPor favor realiza el pago antes de la fecha indicada para evitar retrasos o cargos adicionales.\n\n— {{negocio}}`,
      SAME_DAY: `🚨 *¡HOY VENCE PAGO PENDIENTE!*\n\nHola, hoy es la fecha límite para pagar *{{monto}}* a *{{proveedor}}* ({{categoria}}).\n\nPor favor realiza el pago hoy mismo para evitar cortes de servicio o penalizaciones.\n\n— {{negocio}}`,
      OVERDUE: `⚠️ *ALERTA DE PAGO VENCIDO*\n\nHola, el pago de *{{monto}}* a *{{proveedor}}* venció el *{{vencimiento}}* y continúa PENDIENTE.\n\nPor favor regulariza esta obligación a la brevedad.\n\n— {{negocio}}`
    };
  }
}
