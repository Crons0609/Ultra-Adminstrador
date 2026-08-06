import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { db } from '../../../config/firebase.config.js';
import { ref, get, onValue, update } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { TimeService } from '../../../services/time.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { Modal } from '../../../components/ui/modal.js';
import { AuthService } from '../../../services/auth.service.js';

export class SupportCenterView extends Component {
  constructor(params = {}) {
    super(params);

    const { currentUser } = GlobalStore.getState();
    this.currentUser = currentUser || {};

    this.state = {
      loading: true,
      tickets: [],
      filters: {
        searchQuery: '',
        status: 'ALL',
        type: 'ALL',
        sortBy: 'desc'
      }
    };

    this.listeners = [];

    this.layout = new PageLayout({
      title: 'Centro de Soporte Técnico',
      subtitle: 'Administración global de solicitudes de recuperación de cuentas y consultas de clientes.',
      actionHTML: `
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-success btn-sm" id="btn-supp-broadcast-apk" style="background: linear-gradient(135deg, #10b981, #059669); border:none; font-weight:700; color:#fff;">
            📢 Mensajes y APK Android
          </button>
          <button class="btn btn-primary btn-sm" id="btn-supp-change-password">
            🔑 Cambiar Contraseña / Desbloquear
          </button>
        </div>
      `,
      contentHTML: `
        <div class="card p-5 mb-5" style="border: 1px solid var(--color-border); background: var(--color-bg-secondary);">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
            <div style="display:flex; gap:10px; flex:1; min-width:280px;">
              <input type="text" id="supp-search" class="input input-md" placeholder="Buscar por ticket, nombre, email o WhatsApp..." style="flex:1;" />
            </div>
            
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <div class="form-group" style="margin:0;">
                <select id="supp-filter-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
                  <option value="ALL">Todos los Estados</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="En revisión">En revisión</option>
                  <option value="Respondida">Respondida</option>
                  <option value="Cerrada">Cerrada</option>
                </select>
              </div>

              <div class="form-group" style="margin:0;">
                <select id="supp-filter-type" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
                  <option value="ALL">Todos los Tipos</option>
                  <option value="Olvide mi contraseña">Olvidé mi contraseña</option>
                  <option value="No puedo iniciar sesión">No puedo iniciar sesión</option>
                  <option value="Problema con mi cuenta">Problema con mi cuenta</option>
                  <option value="Consulta general">Consulta general</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <div class="form-group" style="margin:0;">
                <select id="supp-filter-sort" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
                  <option value="desc">Más Recientes</option>
                  <option value="asc">Más Antiguos</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="card p-5">
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; text-align:left;">
              <thead>
                <tr style="border-bottom:2px solid var(--color-border); color:var(--color-text-secondary); font-size:0.75rem;">
                  <th style="padding:10px 14px;">Ticket</th>
                  <th style="padding:10px 14px;">Solicitante</th>
                  <th style="padding:10px 14px;">Tipo de Solicitud</th>
                  <th style="padding:10px 14px;">Fecha Creación</th>
                  <th style="padding:10px 14px;">Estado</th>
                  <th style="padding:10px 14px; text-align:right;">Acciones</th>
                </tr>
              </thead>
              <tbody id="support-tickets-table-body">
                <tr>
                  <td colspan="6" style="text-align:center; padding:30px; color:var(--color-text-secondary);">
                    Cargando solicitudes de soporte...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `
    });
  }

  async mount() {
    const el = this.layout.mount();
    this.tableBody = el.querySelector('#support-tickets-table-body');

    el.querySelector('#btn-supp-change-password')?.addEventListener('click', () => {
      this.openChangePasswordModal();
    });

    el.querySelector('#btn-supp-broadcast-apk')?.addEventListener('click', () => {
      window.location.hash = '#/super-admin/settings';
      setTimeout(() => {
        const btn = document.querySelector('[data-tab="tab-broadcasts"]');
        if (btn) btn.click();
      }, 150);
    });

    // Subscribe to support_tickets in real time
    if (db) {
      const ticketsRef = ref(db, 'support_tickets');
      const listener = onValue(ticketsRef, (snapshot) => {
        this.state.tickets = snapshot.exists()
          ? Object.keys(snapshot.val()).map(k => ({ id: k, ...snapshot.val()[k] }))
          : [];
        this.state.loading = false;
        this.renderTicketsList();
      }, (err) => {
        console.error(err);
        this.tableBody.innerHTML = `<tr><td colspan="6" style="color:var(--color-error); text-align:center; padding:20px;">Error al conectar con la base de datos: ${err.message}</td></tr>`;
      });
      this.listeners.push(listener);
    }

    this.bindFilters(el);

    return el;
  }

  bindFilters(el) {
    const search = el.querySelector('#supp-search');
    const filterStatus = el.querySelector('#supp-filter-status');
    const filterType = el.querySelector('#supp-filter-type');
    const filterSort = el.querySelector('#supp-filter-sort');

    search?.addEventListener('input', (e) => {
      this.state.filters.searchQuery = e.target.value;
      this.renderTicketsList();
    });

    filterStatus?.addEventListener('change', (e) => {
      this.state.filters.status = e.target.value;
      this.renderTicketsList();
    });

    filterType?.addEventListener('change', (e) => {
      this.state.filters.type = e.target.value;
      this.renderTicketsList();
    });

    filterSort?.addEventListener('change', (e) => {
      this.state.filters.sortBy = e.target.value;
      this.renderTicketsList();
    });
  }

  renderTicketsList() {
    if (this.state.loading) return;

    const f = this.state.filters;
    const query = f.searchQuery.toLowerCase().trim();

    // 1. Filter tickets
    let filtered = this.state.tickets.filter(t => {
      const matchesSearch = 
        t.id.toLowerCase().includes(query) ||
        t.fullName.toLowerCase().includes(query) ||
        t.email.toLowerCase().includes(query) ||
        (t.whatsapp && t.whatsapp.toLowerCase().includes(query));

      const matchesStatus = f.status === 'ALL' || t.status === f.status;
      const matchesType = f.type === 'ALL' || t.requestType === f.type;

      return matchesSearch && matchesStatus && matchesType;
    });

    // 2. Sort tickets
    filtered.sort((a, b) => {
      const timeA = a.createdAt || 0;
      const timeB = b.createdAt || 0;
      return f.sortBy === 'desc' ? timeB - timeA : timeA - timeB;
    });

    // 3. Render rows
    if (filtered.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:30px; color:var(--color-text-secondary); font-size:0.8rem;">
            No se encontraron solicitudes que coincidan con los filtros aplicados.
          </td>
        </tr>
      `;
      return;
    }

    this.tableBody.innerHTML = filtered.map(t => {
      const statusBadge = {
        Pendiente: `<span class="badge" style="background:rgba(245,158,11,0.1); color:#fbbf24; border:1px solid rgba(245,158,11,0.2);">Pendiente</span>`,
        'En revisión': `<span class="badge" style="background:rgba(59,130,246,0.1); color:#60a5fa; border:1px solid rgba(59,130,246,0.2);">En revisión</span>`,
        Respondida: `<span class="badge" style="background:rgba(16,185,129,0.1); color:#34d399; border:1px solid rgba(16,185,129,0.2);">Respondida</span>`,
        Cerrada: `<span class="badge" style="background:rgba(156,163,175,0.1); color:#9ca3af; border:1px solid rgba(156,163,175,0.2);">Cerrada</span>`
      }[t.status] || `<span class="badge">${t.status}</span>`;

      return `
        <tr style="border-bottom:1px solid var(--color-border); font-size:0.8rem;">
          <td style="padding:12px 14px; font-weight:700; font-family:monospace; color:var(--color-accent);">${t.id}</td>
          <td style="padding:12px 14px;">
            <div style="font-weight:600; color:var(--color-text-primary);">${t.fullName}</div>
            <div style="font-size:0.7rem; color:var(--color-text-secondary);">${t.email}</div>
          </td>
          <td style="padding:12px 14px;">
            <span style="font-weight:500;">${t.requestType}</span>
          </td>
          <td style="padding:12px 14px; color:var(--color-text-secondary);">
            ${TimeService.formatDate(t.createdAt, true)}
          </td>
          <td style="padding:12px 14px;">${statusBadge}</td>
          <td style="padding:12px 14px; text-align:right;">
            <button class="btn btn-secondary btn-xs btn-view-ticket-detail" data-id="${t.id}">Ver Detalles</button>
          </td>
        </tr>
      `;
    }).join('');

    // Bind details buttons
    this.tableBody.querySelectorAll('.btn-view-ticket-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openTicketDetailsModal(btn.getAttribute('data-id'));
      });
    });
  }

  openTicketDetailsModal(ticketId) {
    const ticket = this.state.tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    let existingModal = document.getElementById('support-ticket-detail-modal-container');
    if (existingModal) existingModal.remove();

    // Direct WhatsApp linkage
    const waNumber = ticket.whatsapp || '';
    const cleanWANum = waNumber.replace(/[^\d+]/g, '');
    const waMsg = encodeURIComponent(`Hola ${ticket.fullName}, te contactamos de soporte sobre tu ticket ${ticket.id} (${ticket.requestType}).`);
    const waLinkHTML = cleanWANum 
      ? `<a href="https://wa.me/${cleanWANum.replace('+', '')}?text=${waMsg}" target="_blank" rel="noopener" class="btn btn-secondary btn-xs" style="background:#25d366; color:#fff; border:none; display:inline-flex; align-items:center; gap:4px; font-weight:700;">
          💬 WhatsApp: ${waNumber}
         </a>`
      : `<span style="color:var(--color-text-tertiary);">${waNumber || 'Sin número'}</span>`;

    // History Timeline
    const historyList = ticket.history ? Object.values(ticket.history) : [];
    const historyHTML = historyList.sort((a,b) => a.date - b.date).map(h => `
      <div style="font-size:0.7rem; border-left:1px solid var(--color-border); padding-left:10px; margin-left:6px; position:relative; padding-bottom:6px;">
        <span style="position:absolute; left:-4px; top:4px; width:6px; height:6px; border-radius:50%; background:var(--color-accent);"></span>
        <strong>${TimeService.formatDate(h.date, true)}</strong> · Estado: <span style="font-weight:600;">${h.from} → ${h.to}</span>
        <div style="color:var(--color-text-secondary); font-size:0.65rem;">Por: ${h.by}</div>
      </div>
    `).join('') || '<span style="font-size:0.7rem; color:var(--color-text-tertiary);">Sin historial.</span>';

    const bodyHTML = `
      <div style="display:flex; flex-direction:column; gap:14px; font-size:0.82rem; color:var(--color-text-primary);">
        
        <!-- Requester Info -->
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:12px; border-radius:8px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <div style="font-size:0.7rem; color:var(--color-text-secondary);">Nombre Completo:</div>
            <strong>${ticket.fullName}</strong>
          </div>
          <div>
            <div style="font-size:0.7rem; color:var(--color-text-secondary);">Correo Registrado:</div>
            <a href="mailto:${ticket.email}" style="color:var(--color-accent);">${ticket.email}</a>
          </div>
          <div>
            <div style="font-size:0.7rem; color:var(--color-text-secondary);">Canal de Contacto:</div>
            ${waLinkHTML}
          </div>
          <div>
            <div style="font-size:0.7rem; color:var(--color-text-secondary);">Creado el:</div>
            <strong>${TimeService.formatDate(ticket.createdAt, true)}</strong>
          </div>
        </div>

        <!-- Password reset quick action box -->
        <div style="background: rgba(139,92,246,0.08); border: 1px dashed rgba(139,92,246,0.3); padding: 12px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
          <div>
            <div style="font-weight: 700; color: var(--color-accent); font-size: 0.82rem;">🔑 Restablecer Clave y Desbloquear Cuenta</div>
            <div style="font-size: 0.72rem; color: var(--color-text-secondary);">Cambia la contraseña y reinicia los intentos fallidos de este cliente.</div>
          </div>
          <button type="button" class="btn btn-primary btn-xs btn-ticket-change-pass" style="font-size: 0.75rem; padding: 4px 10px;">
            🔑 Cambiar Contraseña
          </button>
        </div>

        <!-- Request Details -->
        <div>
          <div style="font-size:0.7rem; color:var(--color-text-secondary); margin-bottom:4px;">Tipo de Solicitud:</div>
          <span class="badge" style="background:var(--color-bg-tertiary);">${ticket.requestType}</span>
          
          <div style="font-size:0.7rem; color:var(--color-text-secondary); margin-top:10px; margin-bottom:4px;">Descripción del Problema:</div>
          <div style="background:rgba(0,0,0,0.15); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:6px; font-size:0.78rem; line-height:1.4; white-space:pre-line;">
            ${ticket.description}
          </div>
        </div>

        <!-- Notes and Status Editing -->
        <div style="border-top:1px dashed rgba(255,255,255,0.1); padding-top:12px; margin-top:4px;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
            <div class="form-group" style="margin:0;">
              <label class="form-label" for="edit-ticket-status">Estado del Ticket</label>
              <select id="edit-ticket-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
                <option value="Pendiente" ${ticket.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                <option value="En revisión" ${ticket.status === 'En revisión' ? 'selected' : ''}>En revisión</option>
                <option value="Respondida" ${ticket.status === 'Respondida' ? 'selected' : ''}>Respondida</option>
                <option value="Cerrada" ${ticket.status === 'Cerrada' ? 'selected' : ''}>Cerrada</option>
              </select>
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">Programador Asignado</label>
              <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:8px; border-radius:6px; font-weight:700;">
                ${ticket.assignedTo || 'Sin asignar'}
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="edit-ticket-notes">Notas del Programador / Seguimiento Interno</label>
            <textarea id="edit-ticket-notes" class="input" style="height:65px; padding:8px; font-size:0.78rem;" placeholder="Escribe anotaciones sobre el caso, llamadas, soluciones aplicadas...">${ticket.notes || ''}</textarea>
          </div>
        </div>

        <!-- History Log -->
        <div style="border-top:1px dashed rgba(255,255,255,0.1); padding-top:10px;">
          <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; color:var(--color-accent); margin-bottom:8px;">🪵 Historial de Seguimiento</div>
          <div style="display:flex; flex-direction:column; gap:6px; max-height:100px; overflow-y:auto;">
            ${historyHTML}
          </div>
        </div>

      </div>
    `;

    const detailModal = new Modal({
      title: `🎫 Detalle de Ticket: ${ticket.id}`,
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-close-ticket-modal">Cerrar</button>
        <button class="btn btn-primary btn-sm" id="btn-save-ticket-modal">Guardar Cambios</button>
      `,
      size: 'md'
    });

    const el = detailModal.mount();
    el.setAttribute('id', 'support-ticket-detail-modal-container');
    document.body.appendChild(el);

    el.querySelector('.btn-ticket-change-pass')?.addEventListener('click', () => {
      this.openChangePasswordModal(ticket.email, ticket.fullName);
    });

    el.querySelector('#btn-close-ticket-modal')?.addEventListener('click', () => detailModal.close());

    el.querySelector('#btn-save-ticket-modal')?.addEventListener('click', async () => {
      const saveBtn = el.querySelector('#btn-save-ticket-modal');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';

      const newStatus = el.querySelector('#edit-ticket-status').value;
      const newNotes = el.querySelector('#edit-ticket-notes').value.trim();

      try {
        const hasStatusChanged = ticket.status !== newStatus;
        const ticketRef = ref(db, `support_tickets/${ticket.id}`);
        
        const updates = {
          status: newStatus,
          notes: newNotes,
          assignedTo: this.currentUser.email || 'Programador'
        };

        if (newStatus === 'Cerrada' || newStatus === 'Respondida') {
          updates.resolvedAt = Date.now();
        }

        if (hasStatusChanged) {
          const histId = `HST-${Date.now()}`;
          ticket.history = ticket.history || {};
          ticket.history[histId] = {
            date: Date.now(),
            from: ticket.status,
            to: newStatus,
            by: this.currentUser.email || 'Programador'
          };
          updates.history = ticket.history;
        }

        await update(ticketRef, updates);

        // Audit Trail log
        await FirestoreService.logAudit({
          action: 'SUPPORT_TICKET_MANAGED',
          companyId: 'global',
          description: `El programador ${this.currentUser.email} gestionó el ticket ${ticket.id}. Estado: ${ticket.status} -> ${newStatus}. Notas: "${newNotes.substring(0, 50)}".`
        });

        NotificationService.success('Ticket de soporte actualizado con éxito.');
        detailModal.close();

      } catch (err) {
        console.error(err);
        alert('Error al guardar: ' + err.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Cambios';
      }
    });
  }

  openChangePasswordModal(prefilledEmail = '', prefilledName = '') {
    const bodyHTML = `
      <form id="supp-change-pass-form" style="display: flex; flex-direction: column; gap: var(--space-3); color: var(--color-text-primary);">
        ${prefilledName ? `<p style="font-size: 0.8rem; color: var(--color-accent); margin: 0;">Cliente / Solicitante: <strong>${prefilledName}</strong></p>` : ''}
        
        <div class="form-group mb-0">
          <label class="form-label" for="supp-target-email">Correo Electrónico del Cliente / Usuario</label>
          <input type="email" id="supp-target-email" class="input input-md" placeholder="cliente@negocio.com" value="${prefilledEmail}" required />
        </div>

        <div class="form-group mb-0">
          <label class="form-label" for="supp-new-password">Nueva Contraseña (mín. 6 caracteres)</label>
          <div style="position: relative; display: flex; align-items: center;">
            <input type="password" id="supp-new-password" class="input input-md" placeholder="Mín. 6 caracteres" minlength="6" required style="padding-right: 40px; width: 100%;" />
            <button type="button" id="btn-supp-toggle-pass" style="position: absolute; right: 8px; background: none; border: none; color: var(--color-text-secondary); cursor: pointer; padding: 4px; font-size: 1rem;" title="Mostrar contraseña">👁️</button>
          </div>
        </div>

        <div class="checkbox-container" style="margin-top: 4px;">
          <input type="checkbox" id="supp-auto-unlock" class="checkbox-input" checked style="accent-color: var(--color-accent);" />
          <span style="font-size: 0.8rem;">Desbloquear cuenta inmediatamente y reiniciar intentos fallidos</span>
        </div>
      </form>
    `;

    const modal = new Modal({
      title: '🔑 Cambiar Contraseña de Cliente',
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-cancel-supp-pass">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="btn-submit-supp-pass">Guardar Nueva Contraseña</button>
      `,
      size: 'md'
    });

    const el = modal.mount();
    document.body.appendChild(el);

    const toggleBtn = el.querySelector('#btn-supp-toggle-pass');
    const passInput = el.querySelector('#supp-new-password');
    if (toggleBtn && passInput) {
      toggleBtn.addEventListener('click', () => {
        const isPass = passInput.type === 'password';
        passInput.type = isPass ? 'text' : 'password';
        toggleBtn.textContent = isPass ? '🙈' : '👁️';
      });
    }

    el.querySelector('#btn-cancel-supp-pass')?.addEventListener('click', () => modal.close());

    el.querySelector('#btn-submit-supp-pass')?.addEventListener('click', async () => {
      const emailInput = el.querySelector('#supp-target-email');
      const passInput = el.querySelector('#supp-new-password');
      const submitBtn = el.querySelector('#btn-submit-supp-pass');

      const email = emailInput?.value.trim() || '';
      const newPassword = passInput?.value || '';

      if (!email || !newPassword || newPassword.length < 6) {
        NotificationService.error('Ingresa un correo válido y una contraseña de al menos 6 caracteres.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando en la nube...';

      try {
        let targetUid = null;
        if (db) {
          const usersSnap = await get(ref(db, 'users'));
          if (usersSnap.exists()) {
            usersSnap.forEach(snap => {
              const u = snap.val() || {};
              if ((u.email || '').toLowerCase().trim() === email.toLowerCase().trim()) {
                targetUid = snap.key;
              }
            });
          }
        }

        if (!targetUid) {
          throw new Error(`No se encontró ningún usuario registrado con el correo: ${email}`);
        }

        // 1. Update password in RTDB (users + companies/ownerPassword)
        await AuthService.adminUpdateUserPassword(targetUid, email, newPassword);

        // 2. Unlock account
        await AuthService.unlockUserAccount(email);

        NotificationService.success(`🔑 Contraseña actualizada y cuenta desbloqueada para ${email}.`);
        modal.close();
      } catch (err) {
        console.error('[SupportCenterView] Change password error:', err);
        NotificationService.error(err.message || 'Error al cambiar la contraseña.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Nueva Contraseña';
      }
    });
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}
