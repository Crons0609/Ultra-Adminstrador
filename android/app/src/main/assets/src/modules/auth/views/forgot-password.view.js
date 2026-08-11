/**
 * @file forgot-password.view.js
 * @description Advanced Support and Password Recovery Ticket Form for users facing account access issues.
 */

import { Component } from '../../../core/component.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';
import { db } from '../../../config/firebase.config.js';
import { ref, set } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { I18nService } from '../../../services/i18n.service.js';

export class ForgotPasswordView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = { 
      loading: false, 
      sent: false,
      generatedTicketId: ''
    };
  }

  render() {
    const { loading, sent, generatedTicketId } = this.state;

    if (sent) {
      return `
        <div class="login-page" style="min-height: 100vh; width: 100%; display: flex; align-items: center; justify-content: center; background: var(--color-bg-primary); padding: var(--space-4);">
          <div class="animate-scale-up card" style="max-width: 480px; width: 100%; padding: var(--space-8); text-align: center;">
            <div style="font-size: 3rem; margin-bottom: var(--space-4);">✅</div>
            <h2 style="font-family: var(--font-display); font-weight: 700; margin-bottom: var(--space-2);">${I18nService.t('auth_forgot_request_sent')}</h2>
            <p style="color: var(--color-text-secondary); font-size: 0.875rem; margin-bottom: var(--space-4); line-height: 1.5;">
              ${I18nService.t('auth_forgot_request_desc')}
            </p>
            <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--color-border); padding: 12px; border-radius: 8px; margin-bottom: 20px;">
              <span class="text-secondary" style="font-size:0.75rem; display:block;">${I18nService.t('auth_forgot_ticket_num')}</span>
              <strong style="color:var(--color-accent); font-family:monospace; font-size:1.2rem;">${generatedTicketId}</strong>
            </div>
            <p style="font-size: 0.75rem; color: var(--color-text-tertiary); margin-bottom: var(--space-6);">
              ${I18nService.t('auth_forgot_ticket_hint')}
            </p>
            <a href="#/login" class="btn btn-secondary btn-md" style="display: block;">
              ${I18nService.t('auth_forgot_back_btn')}
            </a>
          </div>
        </div>
      `;
    }

    return `
      <div class="login-page" style="min-height: 100vh; width: 100%; display: flex; align-items: center; justify-content: center; background: var(--color-bg-primary); padding: var(--space-4);">
        <div style="width: 100%; max-width: 480px;" class="animate-slide-up">
          <div style="text-align: center; margin-bottom: var(--space-6);">
            <h1 style="font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: var(--space-2);">${I18nService.t('auth_forgot_title')}</h1>
            <p style="color: var(--color-text-secondary); font-size: 0.85rem; line-height: 1.4;">
              ${I18nService.t('auth_forgot_subtitle')}
            </p>
          </div>
          <div class="card" style="padding: var(--space-6);">
            <form id="forgot-form" style="display:flex; flex-direction:column; gap:12px;">
              
              <div class="form-group">
                <label class="form-label" for="forgot-fullname">${I18nService.t('emp_full_name')}</label>
                <input type="text" id="forgot-fullname" class="input input-md" placeholder="${I18nService.t('auth_owner_name_placeholder')}" required />
              </div>

              <div class="form-group">
                <label class="form-label" for="forgot-email">${I18nService.t('auth_forgot_registered_email')}</label>
                <input type="email" id="forgot-email" class="input input-md" placeholder="${I18nService.t('auth_email_placeholder')}" required />
              </div>

              <div class="form-group">
                <label class="form-label" for="forgot-whatsapp">${I18nService.t('auth_forgot_whatsapp')}</label>
                <input type="tel" id="forgot-whatsapp" class="input input-md" placeholder="${I18nService.t('auth_contact_phone_placeholder')}" required />
              </div>

              <div class="form-group">
                <label class="form-label" for="forgot-type">${I18nService.t('auth_forgot_request_type')}</label>
                <select id="forgot-type" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);" required>
                  <option value="${I18nService.t('auth_forgot_type_pass')}">${I18nService.t('auth_forgot_type_pass')}</option>
                  <option value="${I18nService.t('auth_forgot_type_login')}">${I18nService.t('auth_forgot_type_login')}</option>
                  <option value="${I18nService.t('auth_forgot_type_account')}">${I18nService.t('auth_forgot_type_account')}</option>
                  <option value="${I18nService.t('auth_forgot_type_general')}">${I18nService.t('auth_forgot_type_general')}</option>
                  <option value="${I18nService.t('auth_forgot_type_other')}">${I18nService.t('auth_forgot_type_other')}</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="forgot-desc">${I18nService.t('auth_forgot_issue_detail')}</label>
                <textarea id="forgot-desc" class="input" style="height:80px; padding:10px; font-size:0.85rem;" placeholder="${I18nService.t('auth_forgot_placeholder_desc')}" required></textarea>
              </div>

              <button type="submit" id="forgot-submit-btn" class="btn btn-primary btn-md" style="width: 100%; margin-top:4px;" ${loading ? 'disabled' : ''}>
                ${loading ? I18nService.t('auth_forgot_submitting') : I18nService.t('auth_forgot_submit_btn')}
              </button>
            </form>
            <div style="text-align: center; margin-top: var(--space-4);">
              <a href="#/login" style="font-size: 0.85rem; color: var(--color-accent); text-decoration: none;">${I18nService.t('auth_forgot_back_link')}</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  afterMount() {
    const form = this.$('#forgot-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const fullName = this.$('#forgot-fullname').value.trim();
      const email = this.$('#forgot-email').value.trim();
      const whatsapp = this.$('#forgot-whatsapp').value.trim();
      const requestType = this.$('#forgot-type').value;
      const description = this.$('#forgot-desc').value.trim();

      const submitBtn = this.$('#forgot-submit-btn');

      this.setState({ loading: true });
      submitBtn.disabled = true;
      submitBtn.textContent = I18nService.t('auth_forgot_submitting');

      try {
        const ticketId = `TCK-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

        const ticketData = {
          id: ticketId,
          fullName,
          email,
          whatsapp,
          requestType,
          description,
          status: 'Pendiente',
          createdAt: Date.now(),
          notes: '',
          assignedTo: '',
          resolvedAt: 0,
          history: {
            INIT: {
              date: Date.now(),
              from: 'Ninguno',
              to: 'Pendiente',
              by: 'Cliente (Formulario)'
            }
          }
        };

        if (db) {
          await set(ref(db, `support_tickets/${ticketId}`), ticketData);
        }

        // Pushes audit trail log
        await FirestoreService.logAudit({
          action: 'CLIENT_SUBMIT_SUPPORT_TICKET',
          companyId: 'global',
          description: `El usuario ${fullName} (${email}) envió un ticket de soporte (${ticketId}) de tipo "${requestType}".`
        });

        NotificationService.success(I18nService.t('auth_forgot_success_toast'));
        this.setState({
          loading: false,
          sent: true,
          generatedTicketId: ticketId
        });

      } catch (error) {
        console.error(error);
        NotificationService.error(I18nService.t('auth_forgot_error_toast'));
        submitBtn.disabled = false;
        submitBtn.textContent = I18nService.t('auth_forgot_submit_btn');
        this.setState({ loading: false });
      }
    });
  }
}
