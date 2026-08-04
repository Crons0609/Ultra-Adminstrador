/**
 * @file notification-preferences.view.js
 * @description User preferences UI for configuring Notification Channels and category toggles.
 */

import { Component } from '../../core/component.js';
import { GlobalStore } from '../../core/state.js';
import { FirestoreService } from '../../services/firestore.service.js';
import { NotificationService } from '../../services/notification.service.js';

export class NotificationPreferencesView extends Component {

  constructor(props = {}) {
    super(props);
    this.state = {
      loading: true,
      saving: false,
      preferences: {
        PEDIDOS: true,
        VENTAS: true,
        INVENTARIO: true,
        MENSAJES: true,
        FINANZAS: true,
        RRHH: true,
        SISTEMA: true,
        vibration: true,
        sound: true
      }
    };
  }

  async afterMount() {
    const currentUser = GlobalStore.getState().currentUser;
    if (currentUser?.uid) {
      try {
        const saved = await FirestoreService.getPath(`users/${currentUser.uid}/preferences/notifications`);
        if (saved) {
          this.setState({
            loading: false,
            preferences: { ...this.state.preferences, ...saved }
          });
        } else {
          this.setState({ loading: false });
        }
      } catch (err) {
        this.setState({ loading: false });
      }
    } else {
      this.setState({ loading: false });
    }

    this.bindEvents();
  }

  bindEvents() {
    const form = this.$('#notif-prefs-form');
    if (!form) return;

    form.querySelectorAll('.notif-toggle-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const key = e.target.name;
        const val = e.target.checked;
        this.state.preferences[key] = val;
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentUser = GlobalStore.getState().currentUser;
      if (!currentUser?.uid) return;

      this.setState({ saving: true });

      try {
        await FirestoreService.setPath(`users/${currentUser.uid}/preferences/notifications`, {
          ...this.state.preferences,
          updatedAt: new Date().toISOString()
        });
        NotificationService.success('Ajustes de notificaciones guardados correctamente.');
      } catch (err) {
        NotificationService.error('Error al guardar preferencias: ' + err.message);
      } finally {
        this.setState({ saving: false });
      }
    });
  }

  render() {
    const { loading, saving, preferences } = this.state;

    if (loading) {
      return `
        <div class="page-body" style="text-align:center; padding: 60px;">
          <p>Cargando preferencias de notificaciones...</p>
        </div>
      `;
    }

    const categories = [
      { key: 'PEDIDOS', title: '📦 Pedidos', desc: 'Alertas de nuevos pedidos, cambios de estado y entregas' },
      { key: 'VENTAS', title: '💰 Ventas', desc: 'Notificaciones de cierres de venta, anulaciones y ventas modificadas' },
      { key: 'INVENTARIO', title: '⚠️ Inventario Bajo', desc: 'Alertas inmediatas cuando un producto alcance su stock mínimo' },
      { key: 'MENSAJES', title: '💬 Mensajes Internos', desc: 'Notificaciones de chat entre empleados y avisos de equipo' },
      { key: 'FINANZAS', title: '💳 Finanzas & Pagos', desc: 'Pagos recibidos, facturas emitidas y vencimientos de crédito' },
      { key: 'RRHH', title: '👥 Recursos Humanos', desc: 'Solicitudes de vacaciones, permisos e incidencias de personal' },
      { key: 'SISTEMA', title: '⚙️ Alertas de Sistema', desc: 'Avisos de seguridad, mantenimiento y actualizaciones importantes' }
    ];

    return `
      <div class="page-body">
        <div class="page-header">
          <div>
            <h1 style="font-size: 1.4rem; font-weight: 800; margin: 0 0 4px;">Configuración de Notificaciones</h1>
            <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin: 0;">Personaliza qué alertas deseas recibir en tu dispositivo</p>
          </div>
        </div>

        <form id="notif-prefs-form" style="max-width: 680px;">
          <div style="
            background: var(--color-bg-secondary); border: 1px solid var(--color-border);
            border-radius: 16px; padding: 20px; margin-bottom: 24px;
          ">
            <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 16px;">Categorías de Notificación</h3>

            ${categories.map(c => `
              <div style="
                display: flex; align-items: center; justify-content: space-between;
                padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.06);
              ">
                <div>
                  <div style="font-size: 0.9rem; font-weight: 700; color: #fff;">${c.title}</div>
                  <div style="font-size: 0.75rem; color: var(--color-text-tertiary); margin-top: 2px;">${c.desc}</div>
                </div>
                <label class="switch" style="position:relative; display:inline-block; width:44px; height:24px;">
                  <input type="checkbox" class="notif-toggle-input" name="${c.key}" ${preferences[c.key] !== false ? 'checked' : ''} style="opacity:0; width:0; height:0;">
                  <span class="slider" style="
                    position:absolute; cursor:pointer; inset:0; background-color:#333; transition:.3s; border-radius:24px;
                  "></span>
                </label>
              </div>
            `).join('')}
          </div>

          <div style="display:flex; justify-content:flex-end;">
            <button type="submit" class="btn btn-primary" ${saving ? 'disabled' : ''} style="padding: 12px 28px; font-weight: 700;">
              ${saving ? 'Guardando...' : '💾 Guardar Preferencias'}
            </button>
          </div>
        </form>

        <style>
          .notif-toggle-input:checked + .slider { background-color: #8b5cf6 !important; }
          .notif-toggle-input:checked + .slider:before { transform: translateX(20px) !important; }
          .slider:before {
            position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
            background-color: white; transition: .3s; border-radius: 50%;
          }
        </style>
      </div>
    `;
  }
}
