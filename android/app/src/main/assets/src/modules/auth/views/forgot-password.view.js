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
            <h2 style="font-family: var(--font-display); font-weight: 700; margin-bottom: var(--space-2);">Solicitud Enviada</h2>
            <p style="color: var(--color-text-secondary); font-size: 0.875rem; margin-bottom: var(--space-4); line-height: 1.5;">
              Tu solicitud fue enviada correctamente y será atendida por nuestro equipo de soporte técnico a la brevedad.
            </p>
            <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--color-border); padding: 12px; border-radius: 8px; margin-bottom: 20px;">
              <span class="text-secondary" style="font-size:0.75rem; display:block;">Número de Ticket:</span>
              <strong style="color:var(--color-accent); font-family:monospace; font-size:1.2rem;">${generatedTicketId}</strong>
            </div>
            <p style="font-size: 0.75rem; color: var(--color-text-tertiary); margin-bottom: var(--space-6);">
              Conserva este número para cualquier consulta de seguimiento. Nos comunicaremos contigo por correo o WhatsApp.
            </p>
            <a href="#/login" class="btn btn-secondary btn-md" style="display: block;">
              Volver al inicio de sesión
            </a>
          </div>
        </div>
      `;
    }

    return `
      <div class="login-page" style="min-height: 100vh; width: 100%; display: flex; align-items: center; justify-content: center; background: var(--color-bg-primary); padding: var(--space-4);">
        <div style="width: 100%; max-width: 480px;" class="animate-slide-up">
          <div style="text-align: center; margin-bottom: var(--space-6);">
            <h1 style="font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: var(--space-2);">Recuperación de Cuenta</h1>
            <p style="color: var(--color-text-secondary); font-size: 0.85rem; line-height: 1.4;">
              Si olvidaste tu contraseña o tienes problemas de acceso, completa el formulario y un programador de soporte te asistirá.
            </p>
          </div>
          <div class="card" style="padding: var(--space-6);">
            <form id="forgot-form" style="display:flex; flex-direction:column; gap:12px;">
              
              <div class="form-group">
                <label class="form-label" for="forgot-fullname">Nombre completo</label>
                <input type="text" id="forgot-fullname" class="input input-md" placeholder="Ej. Juan Pérez" required />
              </div>

              <div class="form-group">
                <label class="form-label" for="forgot-email">Correo electrónico registrado</label>
                <input type="email" id="forgot-email" class="input input-md" placeholder="correo@empresa.com" required />
              </div>

              <div class="form-group">
                <label class="form-label" for="forgot-whatsapp">Número de WhatsApp</label>
                <input type="tel" id="forgot-whatsapp" class="input input-md" placeholder="Ej. +505 8888-8888" required />
              </div>

              <div class="form-group">
                <label class="form-label" for="forgot-type">Tipo de solicitud</label>
                <select id="forgot-type" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);" required>
                  <option value="Olvide mi contraseña">Olvidé mi contraseña</option>
                  <option value="No puedo iniciar sesión">No puedo iniciar sesión</option>
                  <option value="Problema con mi cuenta">Problema con mi cuenta</option>
                  <option value="Consulta general">Consulta general</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="forgot-desc">Detalle del inconveniente</label>
                <textarea id="forgot-desc" class="input" style="height:80px; padding:10px; font-size:0.85rem;" placeholder="Explica detalladamente tu caso (ej. no recibo el correo, cambié mi teléfono)..." required></textarea>
              </div>

              <button type="submit" id="forgot-submit-btn" class="btn btn-primary btn-md" style="width: 100%; margin-top:4px;" ${loading ? 'disabled' : ''}>
                ${loading ? 'Enviando Solicitud...' : 'Enviar Solicitud de Soporte'}
              </button>
            </form>
            <div style="text-align: center; margin-top: var(--space-4);">
              <a href="#/login" style="font-size: 0.85rem; color: var(--color-accent); text-decoration: none;">← Volver al inicio</a>
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
      submitBtn.textContent = 'Enviando...';

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

        NotificationService.success('Solicitud enviada correctamente.');
        this.setState({
          loading: false,
          sent: true,
          generatedTicketId: ticketId
        });

      } catch (error) {
        console.error(error);
        NotificationService.error('Error al enviar la solicitud.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Solicitud de Soporte';
        this.setState({ loading: false });
      }
    });
  }
}
