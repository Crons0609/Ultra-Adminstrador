/**
 * @file credit.service.js
 * @description Core financial engine for the Credit System module.
 * Handles installment schedule generation (weekly/biweekly/monthly/custom),
 * automatic late fee (mora) calculation at 5% compounding on remaining balance,
 * payment recording, credit restructuring, and printable document generation.
 */

import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';
import { TimeService } from './time.service.js';

export class CreditService {

  // ─── FINANCIAL CALCULATIONS ─────────────────────────────────────────────────

  /**
   * Calculates the installment amount using standard amortization (PMT formula)
   * or fixed interest depending on the credit type.
   */
  static calculateInstallment(principal, monthlyRate, terms, amortizationType) {
    if (amortizationType === 'SIN_AMORTIZACION') {
      const totalInterest = principal * monthlyRate * terms;
      return (principal + totalInterest) / terms;
    }
    // Con amortización — standard PMT
    if (monthlyRate === 0) return principal / terms;
    return (principal * monthlyRate * Math.pow(1 + monthlyRate, terms)) /
           (Math.pow(1 + monthlyRate, terms) - 1);
  }

  /**
   * Generates the full installment schedule (calendar of payments).
   *
   * @param {Object} params
   * @param {number} params.principal     - Amount financed
   * @param {number} params.interestRate  - Annual or monthly interest % (raw number, e.g. 15 for 15%)
   * @param {number} params.terms         - Number of installments (payments)
   * @param {'SEMANAL'|'QUINCENAL'|'MENSUAL'|'PERSONALIZADO'} params.frequency
   * @param {number} params.startDate     - Timestamp of credit start
   * @param {'CON_AMORTIZACION'|'SIN_AMORTIZACION'} params.amortizationType
   * @param {number} params.dueDay        - Day of month for MENSUAL frequency (1-28)
   * @param {number} params.customDays    - Days between payments for PERSONALIZADO
   * @returns {Array} schedule[] - array of installment objects
   */
  static generateInstallmentSchedule({
    principal,
    interestRate,
    terms,
    frequency,
    startDate,
    amortizationType,
    dueDay = 15,
    customDays = 30
  }) {
    const monthlyRate = interestRate / 100;
    const installmentAmount = Math.round(
      this.calculateInstallment(principal, monthlyRate, terms, amortizationType) * 100
    ) / 100;

    const schedule = [];
    let balance = principal;
    let currentDate = new Date(startDate);

    for (let i = 1; i <= terms; i++) {
      // Calculate due date based on frequency
      let dueDate;
      switch (frequency) {
        case 'SEMANAL':
          dueDate = new Date(startDate);
          dueDate.setDate(dueDate.getDate() + (i * 7));
          break;
        case 'QUINCENAL':
          dueDate = new Date(startDate);
          dueDate.setDate(dueDate.getDate() + (i * 15));
          break;
        case 'PERSONALIZADO':
          dueDate = new Date(startDate);
          dueDate.setDate(dueDate.getDate() + (i * customDays));
          break;
        case 'MENSUAL':
        default: {
          // Advance N months and set to dueDay
          const d = new Date(startDate);
          d.setMonth(d.getMonth() + i);
          d.setDate(Math.min(dueDay, 28));
          d.setHours(12, 0, 0, 0);
          dueDate = d;
          break;
        }
      }

      // Calculate interest and principal portions
      let interestPortion, principalPortion;
      if (amortizationType === 'SIN_AMORTIZACION') {
        interestPortion = Math.round((principal * monthlyRate) * 100) / 100;
        principalPortion = Math.round((principal / terms) * 100) / 100;
      } else {
        // CON_AMORTIZACION: reducing balance
        interestPortion = Math.round((balance * monthlyRate) * 100) / 100;
        principalPortion = Math.round((installmentAmount - interestPortion) * 100) / 100;
        balance = Math.max(0, Math.round((balance - principalPortion) * 100) / 100);
      }

      schedule.push({
        period: i,
        dueDate: dueDate.getTime(),
        dueDateLabel: dueDate.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }),
        amount: installmentAmount,
        interestPortion,
        principalPortion,
        balanceAfter: amortizationType === 'CON_AMORTIZACION' ? balance : Math.round((principal - (principalPortion * i)) * 100) / 100,
        paidAmount: 0,
        paidAt: null,
        status: 'PENDIENTE' // PENDIENTE | PAGADA | PARCIAL | VENCIDA
      });
    }

    return schedule;
  }

  /**
   * Calculates credit totals for summary display.
   */
  static calculateCreditTotals(principal, interestRate, terms, amortizationType) {
    const monthlyRate = interestRate / 100;
    const installment = Math.round(
      this.calculateInstallment(principal, monthlyRate, terms, amortizationType) * 100
    ) / 100;
    const totalWithInterest = Math.round((installment * terms) * 100) / 100;
    const totalInterest = Math.round((totalWithInterest - principal) * 100) / 100;

    return { installment, totalWithInterest, totalInterest };
  }

  // ─── FIRESTORE OPERATIONS ────────────────────────────────────────────────────

  /**
   * Creates a full credit record in Firestore with generated installment schedule.
   */
  static async createCredit(companyId, creditData) {
    const {
      clientId, clientName, clientPhone, clientEmail,
      clientAddress, clientIdNumber, clientReferences,
      items, principal, interestRate, terms, frequency,
      startDate, amortizationType, dueDay, customDays,
      paymentMethod, sendEmail
    } = creditData;

    const schedule = this.generateInstallmentSchedule({
      principal, interestRate, terms, frequency,
      startDate, amortizationType, dueDay, customDays
    });

    const { installment, totalWithInterest, totalInterest } = this.calculateCreditTotals(
      principal, interestRate, terms, amortizationType
    );

    const payload = {
      clientId,
      clientName,
      clientPhone: clientPhone || '',
      clientEmail: clientEmail || '',
      clientAddress: clientAddress || '',
      clientIdNumber: clientIdNumber || '',
      clientReferences: clientReferences || '',
      items,
      initialAmount: principal,
      totalWithInterest,
      totalInterest,
      remainingAmount: principal,
      installmentAmount: installment,
      interestRate,
      amortizationType,
      paymentFrequency: frequency,
      termPeriods: terms,
      dueDay: dueDay || 15,
      customDays: customDays || 30,
      startDate,
      paymentMethod: paymentMethod || 'EFECTIVO',
      schedule,
      status: 'VIGENTE',
      createdAt: Date.now(),
      createdAtLocal: TimeService.timestamp(),
      updatedAt: Date.now()
    };

    const creditId = await FirestoreService.create('credits', payload);
    return { creditId, payload };
  }

  /**
   * Records a payment/abono for a specific installment period.
   * Updates the schedule status and remaining balance.
   */
  static async recordPayment(companyId, creditId, credit, payAmount, payMethod, targetPeriod = null) {
    const remaining = Number(credit.remainingAmount || 0);
    const newRemaining = Math.max(0, Math.round((remaining - payAmount) * 100) / 100);

    // Find the installment to mark as paid
    const schedule = [...(credit.schedule || [])];
    let resolvedPeriod = targetPeriod;

    if (!resolvedPeriod) {
      // Auto-target: find first PENDIENTE or PARCIAL installment whose dueDate has arrived
      const now = Date.now();
      const due = schedule.find(s =>
        (s.status === 'PENDIENTE' || s.status === 'PARCIAL' || s.status === 'VENCIDA') &&
        s.dueDate <= now + 86400000 * 3 // within 3 days of due date (grace period)
      );
      resolvedPeriod = due ? due.period : (schedule.find(s => s.status !== 'PAGADA')?.period || 1);
    }

    const scheduleIdx = schedule.findIndex(s => s.period === resolvedPeriod);
    if (scheduleIdx >= 0) {
      const installment = schedule[scheduleIdx];
      const newPaid = (installment.paidAmount || 0) + payAmount;
      schedule[scheduleIdx] = {
        ...installment,
        paidAmount: Math.round(newPaid * 100) / 100,
        paidAt: Date.now(),
        status: newPaid >= installment.amount * 0.99 ? 'PAGADA' : 'PARCIAL'
      };
    }

    const isPaidOff = newRemaining <= 0;
    const updatedStatus = isPaidOff ? 'PAGADO' : 'VIGENTE';

    await FirestoreService.update('credits', creditId, {
      remainingAmount: newRemaining,
      status: updatedStatus,
      schedule,
      updatedAt: Date.now()
    });

    // Log the payment
    await FirestoreService.create('credit_payments', {
      creditId,
      clientId: credit.clientId,
      clientName: credit.clientName,
      amount: payAmount,
      paymentMethod: payMethod,
      period: resolvedPeriod,
      remainingAfter: newRemaining,
      createdAt: Date.now(),
      createdAtLocal: TimeService.timestamp()
    });

    return { newRemaining, isPaidOff, updatedStatus };
  }

  /**
   * Applies 5% late fee (mora) on remaining balance — compounding.
   */
  static async applyLateFee(companyId, creditId, credit) {
    const remaining = Number(credit.remainingAmount || 0);
    if (remaining <= 0) return null;

    const moraRate = 0.05;
    const moraAmount = Math.round(remaining * moraRate * 100) / 100;
    const newRemaining = Math.round((remaining + moraAmount) * 100) / 100;

    // Mark overdue periods in schedule
    const now = Date.now();
    const schedule = (credit.schedule || []).map(s => {
      if (s.status === 'PENDIENTE' && s.dueDate < now) {
        return { ...s, status: 'VENCIDA' };
      }
      return s;
    });

    await FirestoreService.update('credits', creditId, {
      remainingAmount: newRemaining,
      status: 'VENCIDO',
      schedule,
      updatedAt: Date.now()
    });

    await FirestoreService.create('credit_mora_log', {
      creditId,
      clientId: credit.clientId,
      clientName: credit.clientName,
      remainingBefore: remaining,
      moraAmount,
      remainingAfter: newRemaining,
      appliedAt: Date.now(),
      appliedAtLocal: TimeService.timestamp()
    });

    return { moraAmount, newRemaining };
  }

  /**
   * Scans all active credits and auto-applies mora for those with overdue installments.
   * Should be called when the credit view is mounted.
   */
  static async checkAndAutoApplyLateFees(companyId) {
    const creditsRaw = await FirestoreService.readPath(`${companyId}/credits`) || {};
    const credits = Object.entries(creditsRaw).map(([id, val]) => ({ id, ...val }));
    const now = Date.now();
    const logsRaw = await FirestoreService.readPath(`${companyId}/credit_mora_log`) || {};
    const logs = Object.values(logsRaw);

    const todayStr = new Date(now).toISOString().split('T')[0];
    let autoApplied = 0;

    for (const credit of credits) {
      if (credit.status === 'PAGADO' || credit.status === 'CANCELADO') continue;
      if (Number(credit.remainingAmount || 0) <= 0) continue;

      const hasOverdueInstallment = (credit.schedule || []).some(s =>
        s.status === 'PENDIENTE' && s.dueDate < now
      );

      if (!hasOverdueInstallment) continue;

      // Check if mora was already applied today
      const alreadyApplied = logs.some(l =>
        l.creditId === credit.id &&
        l.appliedAtLocal && l.appliedAtLocal.startsWith(todayStr)
      );

      if (alreadyApplied) continue;

      await this.applyLateFee(companyId, credit.id, credit);
      autoApplied++;
    }

    return autoApplied;
  }

  /**
   * Restructures (refinances) an active credit with new terms.
   * Saves original schedule history, creates new one.
   */
  static async restructureCredit(companyId, creditId, credit, newTerms) {
    const { newRate, newPeriods, newFrequency, newDueDay, newCustomDays, reason } = newTerms;
    const remaining = Number(credit.remainingAmount || 0);

    const newSchedule = this.generateInstallmentSchedule({
      principal: remaining,
      interestRate: newRate,
      terms: newPeriods,
      frequency: newFrequency || credit.paymentFrequency,
      startDate: Date.now(),
      amortizationType: credit.amortizationType,
      dueDay: newDueDay || credit.dueDay,
      customDays: newCustomDays || credit.customDays
    });

    const { installment } = this.calculateCreditTotals(
      remaining, newRate, newPeriods, credit.amortizationType
    );

    await FirestoreService.update('credits', creditId, {
      interestRate: newRate,
      termPeriods: newPeriods,
      paymentFrequency: newFrequency || credit.paymentFrequency,
      dueDay: newDueDay || credit.dueDay,
      installmentAmount: installment,
      schedule: newSchedule,
      status: 'VIGENTE',
      restructuredAt: Date.now(),
      restructureReason: reason || '',
      previousSchedule: credit.schedule || [],
      updatedAt: Date.now()
    });

    return { newSchedule, installment };
  }

  // ─── DOCUMENT GENERATION ────────────────────────────────────────────────────

  /**
   * Generates a printable HTML credit document (contract + payment schedule).
   */
  static generateCreditDocument(credit, companyName = 'Nuestro Negocio') {
    const fmt = (v) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0);
    const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

    const itemsRows = (credit.items || []).map(item => `
      <tr>
        <td>${item.name}</td>
        <td class="text-center">${item.quantity}</td>
        <td class="text-right">${fmt(item.price)}</td>
        <td class="text-right">${fmt(item.price * item.quantity)}</td>
      </tr>
    `).join('');

    const scheduleRows = (credit.schedule || []).map(s => `
      <tr>
        <td class="text-center">${s.period}</td>
        <td>${s.dueDateLabel || fmtDate(s.dueDate)}</td>
        <td class="text-right">${fmt(s.principalPortion)}</td>
        <td class="text-right">${fmt(s.interestPortion)}</td>
        <td class="text-right"><strong>${fmt(s.amount)}</strong></td>
        <td class="text-center">${s.status}</td>
      </tr>
    `).join('');

    const frequencyLabel = {
      SEMANAL: 'Semanal',
      QUINCENAL: 'Quincenal',
      MENSUAL: 'Mensual',
      PERSONALIZADO: `Cada ${credit.customDays || 30} días`
    }[credit.paymentFrequency] || 'Mensual';

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Contrato de Crédito — ${credit.clientName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 20px; }
          h1 { font-size: 20px; text-align: center; margin-bottom: 4px; }
          h2 { font-size: 14px; margin: 16px 0 8px; color: #444; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 12px; }
          .company-name { font-size: 18px; font-weight: bold; }
          .doc-title { font-size: 14px; color: #555; margin-top: 4px; }
          .meta { display: flex; justify-content: space-between; font-size: 11px; color: #777; margin-top: 8px; }
          .section { margin-bottom: 16px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
          .info-row { display: flex; gap: 6px; }
          .info-label { font-weight: bold; min-width: 130px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
          th { background: #f0f0f0; padding: 6px 8px; text-align: left; border: 1px solid #ddd; }
          td { padding: 5px 8px; border: 1px solid #ddd; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .total-row { font-weight: bold; background: #fafafa; }
          .mora-box { background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 10px; margin: 16px 0; font-size: 11px; }
          .signature-area { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
          .signature-box { text-align: center; }
          .signature-line { border-top: 1px solid #000; margin-top: 50px; padding-top: 6px; }
          .footer { text-align: center; font-size: 10px; color: #888; margin-top: 24px; border-top: 1px solid #ddd; padding-top: 10px; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${companyName}</div>
          <div class="doc-title">CONTRATO DE CRÉDITO / DOCUMENTO DE COBRO</div>
          <div class="meta">
            <span>Folio: CR-${credit.id ? credit.id.slice(-6).toUpperCase() : 'XXXXXX'}</span>
            <span>Fecha de Emisión: ${fmtDate(credit.createdAt || Date.now())}</span>
          </div>
        </div>

        <div class="section">
          <h2>DATOS DEL CLIENTE</h2>
          <div class="info-grid">
            <div class="info-row"><span class="info-label">Nombre Completo:</span><span>${credit.clientName}</span></div>
            <div class="info-row"><span class="info-label">Teléfono:</span><span>${credit.clientPhone || '—'}</span></div>
            <div class="info-row"><span class="info-label">Correo Electrónico:</span><span>${credit.clientEmail || '—'}</span></div>
            <div class="info-row"><span class="info-label">Dirección:</span><span>${credit.clientAddress || '—'}</span></div>
            <div class="info-row"><span class="info-label">N° Identificación:</span><span>${credit.clientIdNumber || '—'}</span></div>
            <div class="info-row"><span class="info-label">Referencias:</span><span>${credit.clientReferences || '—'}</span></div>
          </div>
        </div>

        <div class="section">
          <h2>BIENES O SERVICIOS FINANCIADOS</h2>
          <table>
            <thead>
              <tr><th>Descripción</th><th class="text-center">Cant.</th><th class="text-right">P. Unitario</th><th class="text-right">Subtotal</th></tr>
            </thead>
            <tbody>
              ${itemsRows}
              <tr class="total-row">
                <td colspan="3" class="text-right">Monto Financiado:</td>
                <td class="text-right">${fmt(credit.initialAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="section">
          <h2>CONDICIONES DEL CRÉDITO</h2>
          <div class="info-grid">
            <div class="info-row"><span class="info-label">Monto Financiado:</span><span><strong>${fmt(credit.initialAmount)}</strong></span></div>
            <div class="info-row"><span class="info-label">Interés:</span><span>${credit.interestRate}% por período</span></div>
            <div class="info-row"><span class="info-label">Tipo de Amortización:</span><span>${credit.amortizationType === 'CON_AMORTIZACION' ? 'Con Amortización (saldo reducible)' : 'Sin Amortización (interés fijo)'}</span></div>
            <div class="info-row"><span class="info-label">Frecuencia de Pago:</span><span>${frequencyLabel}</span></div>
            <div class="info-row"><span class="info-label">Número de Cuotas:</span><span>${credit.termPeriods}</span></div>
            <div class="info-row"><span class="info-label">Cuota por Período:</span><span><strong>${fmt(credit.installmentAmount)}</strong></span></div>
            <div class="info-row"><span class="info-label">Total con Intereses:</span><span><strong>${fmt(credit.totalWithInterest)}</strong></span></div>
            <div class="info-row"><span class="info-label">Forma de Pago:</span><span>${credit.paymentMethod || 'Efectivo'}</span></div>
            <div class="info-row"><span class="info-label">Fecha de Inicio:</span><span>${fmtDate(credit.startDate)}</span></div>
          </div>
        </div>

        <div class="section">
          <h2>CALENDARIO DE PAGOS</h2>
          <table>
            <thead>
              <tr><th class="text-center">Cuota</th><th>Fecha de Vencimiento</th><th class="text-right">Capital</th><th class="text-right">Interés</th><th class="text-right">Total Cuota</th><th class="text-center">Estado</th></tr>
            </thead>
            <tbody>${scheduleRows}</tbody>
          </table>
        </div>

        <div class="mora-box">
          <strong>⚠️ CLÁUSULA DE MORA POR ATRASO:</strong> En caso de no realizar el pago en la fecha estipulada, se aplicará automáticamente una mora del <strong>5%</strong> sobre el saldo pendiente por cada período de atraso. La mora se calculará de manera acumulativa sobre el saldo actualizado, no sobre el monto original del crédito.
        </div>

        <div class="signature-area">
          <div class="signature-box">
            <div class="signature-line">Firma del Cliente<br/><small>${credit.clientName}</small></div>
          </div>
          <div class="signature-box">
            <div class="signature-line">Firma y Sello del Negocio<br/><small>${companyName}</small></div>
          </div>
        </div>

        <div class="footer">
          Documento generado por Ultra-Administrador SaaS · ${new Date().toLocaleString('es-MX')}
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Opens the credit document in a new window and triggers print/save as PDF.
   */
  static printCreditDocument(credit, companyName) {
    const html = this.generateCreditDocument(credit, companyName);
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    }
  }
}
