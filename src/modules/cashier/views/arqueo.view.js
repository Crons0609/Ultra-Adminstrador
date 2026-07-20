/**
 * @file arqueo.view.js
 * @description Vista completa de Arqueo de Caja para la cajera.
 * Permite registrar el fondo inicial, retiros con motivo y calcular
 * automáticamente el cuadre de caja al final de la jornada.
 * Al marcar como "Listo para enviar", guarda el arqueo y notifica al dueño.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { GlobalStore } from '../../../core/state.js';

export class ArqueoView extends Component {
  constructor(params = {}) {
    super(params);
    const user = GlobalStore.getState().currentUser || {};
    this.companyId  = user.companyId || '';
    this.cashierName = user.name || 'Cajero';

    this.listeners = [];
    this.state = {
      ventas:     [],
      retiros:    [],  // [{ amount, reason, time }]
      montoInicial: 0,
      efectivoContado: 0,
    };

    this.layout = new PageLayout({
      title: 'Arqueo de Caja',
      subtitle: 'Registra los movimientos del día, cuadra la caja y envía el reporte al dueño para su aprobación.',
      actionHTML: `
        <button class="btn btn-success btn-sm" id="btn-arqueo-send" style="display:flex;align-items:center;gap:6px;background:#34d399;border:none;color:#000;font-weight:700;">
          ✅ Listo para Enviar
        </button>
      `,
      contentHTML: `
        <style>
          .arqueo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5); }
          @media (max-width: 768px) { .arqueo-grid { grid-template-columns: 1fr; } }
          .arqueo-section { background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-5); }
          .arqueo-section h3 { font-weight: 700; font-size: 1rem; margin-bottom: var(--space-4); display: flex; align-items: center; gap: 8px; }
          .arqueo-row { display: flex; justify-content: space-between; align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); font-size: 0.88rem; }
          .arqueo-row:last-child { border-bottom: none; }
          .arqueo-row-label { color: var(--color-text-secondary); }
          .arqueo-row-value { font-weight: 700; }
          .cuadre-ok   { color: #34d399; }
          .cuadre-neg  { color: #f87171; }
          .cuadre-pos  { color: #fbbf24; }
          .retiro-item { display: flex; justify-content: space-between; align-items: center; padding: var(--space-2) var(--space-3); background: rgba(248,113,113,0.05); border: 1px solid rgba(248,113,113,0.15); border-radius: var(--radius-md); font-size: 0.82rem; margin-bottom: var(--space-2); }
        </style>

        <!-- Section 1: Inputs + Retiros -->
        <div class="arqueo-grid">
          <!-- Left: Registro de movimientos -->
          <div class="arqueo-section">
            <h3>📋 Movimientos del Día</h3>

            <div class="form-group mb-4">
              <label class="form-label" for="arq-fondo-inicial">💰 Fondo Inicial en Caja ($)</label>
              <input type="number" id="arq-fondo-inicial" class="input input-md" min="0" step="0.01" placeholder="0.00" value="0" />
              <p class="text-xs text-secondary mt-1">Dinero físico con el que inicia la jornada.</p>
            </div>

            <div class="form-group mb-4">
              <label class="form-label" for="arq-efectivo-contado">🧾 Efectivo Físico Contado al Cierre ($)</label>
              <input type="number" id="arq-efectivo-contado" class="input input-md" min="0" step="0.01" placeholder="0.00" value="0" />
              <p class="text-xs text-secondary mt-1">Total de efectivo que hay físicamente en caja ahora.</p>
            </div>

            <div class="form-group">
              <label class="form-label">➖ Registrar Retiro de Caja</label>
              <div style="display:grid;grid-template-columns:100px 1fr auto;gap:var(--space-2);align-items:end;">
                <div>
                  <label class="form-label" style="font-size:0.72rem;">Monto ($)</label>
                  <input type="number" id="arq-retiro-monto" class="input input-md" min="0" step="0.01" placeholder="0.00" />
                </div>
                <div>
                  <label class="form-label" style="font-size:0.72rem;">Razón del Retiro</label>
                  <input type="text" id="arq-retiro-razon" class="input input-md" placeholder="Ej. Pago a proveedor, gastos de limpieza..." />
                </div>
                <button class="btn btn-secondary btn-sm" id="btn-add-retiro" style="white-space:nowrap;">+ Agregar</button>
              </div>
            </div>

            <div id="retiros-list" style="margin-top:var(--space-3);">
              <p class="text-xs text-secondary" id="retiros-empty">Sin retiros registrados aún.</p>
            </div>
          </div>

          <!-- Right: Totales automáticos y cuadre -->
          <div class="arqueo-section">
            <h3>📊 Resumen Automático del Sistema</h3>

            <div class="arqueo-row">
              <span class="arqueo-row-label">Fondo Inicial</span>
              <span class="arqueo-row-value" id="arq-disp-fondo">$0.00</span>
            </div>
            <div class="arqueo-row">
              <span class="arqueo-row-label">💵 Pagos en Efectivo (sistema)</span>
              <span class="arqueo-row-value text-success" id="arq-disp-efectivo">$0.00</span>
            </div>
            <div class="arqueo-row">
              <span class="arqueo-row-label">💳 Pagos con POS / Tarjeta</span>
              <span class="arqueo-row-value" style="color:#818cf8;" id="arq-disp-tarjeta">$0.00</span>
            </div>
            <div class="arqueo-row">
              <span class="arqueo-row-label">📈 Total Ingresos Sistema</span>
              <span class="arqueo-row-value" id="arq-disp-total">$0.00</span>
            </div>
            <div class="arqueo-row">
              <span class="arqueo-row-label">➖ Total Retiros del Día</span>
              <span class="arqueo-row-value" style="color:#f87171;" id="arq-disp-retiros">$0.00</span>
            </div>

            <div style="margin: var(--space-4) 0; border-top: 2px dashed var(--color-border); padding-top: var(--space-4);">
              <div class="arqueo-row" style="font-size:1rem;">
                <span style="font-weight:700;">💼 Esperado en Caja Física</span>
                <span class="arqueo-row-value" id="arq-disp-esperado" style="font-size:1.1rem;">$0.00</span>
              </div>
              <div class="arqueo-row" style="font-size:1rem;">
                <span style="font-weight:700;">🧾 Contado Físicamente</span>
                <span class="arqueo-row-value" id="arq-disp-contado" style="font-size:1.1rem;">$0.00</span>
              </div>
            </div>

            <!-- Difference indicator -->
            <div id="cuadre-indicator" style="background:var(--color-bg-tertiary);border-radius:var(--radius-md);padding:var(--space-4);text-align:center;margin-top:var(--space-3);">
              <div style="font-size:2rem;" id="cuadre-icon">⚖️</div>
              <div style="font-weight:800;font-size:1.4rem;margin-top:4px;" id="cuadre-diff">$0.00</div>
              <div style="font-size:0.82rem;margin-top:4px;" id="cuadre-label" class="text-secondary">Ingresa los valores para calcular</div>
            </div>

            <div style="margin-top:var(--space-4);">
              <label class="form-label" for="arq-observaciones">📝 Observaciones (opcional)</label>
              <textarea id="arq-observaciones" class="input input-md" rows="2" placeholder="Novedades del turno, incidencias, etc."></textarea>
            </div>
          </div>
        </div>

        <!-- Transaction breakdown -->
        <div class="card p-5 mt-6">
          <h3 class="text-lg font-semibold mb-4">📋 Transacciones del Día (Sistema)</h3>
          <div id="arq-transactions-list">
            <p class="text-secondary text-center py-6">Cargando transacciones...</p>
          </div>
        </div>
      `
    });
  }

  mount() {
    const el = this.layout.mount();
    this.bindInputs(el);
    this.subscribeData(el);
    el.querySelector('#btn-arqueo-send')?.addEventListener('click', () => this.submitArqueo(el));
    return el;
  }

  subscribeData(el) {
    const ventasL = FirestoreService.listenToTenant('ventas', (ventas) => {
      this.state.ventas = ventas || [];
      this.recalculate(el);
    });
    this.listeners.push(ventasL);
  }

  bindInputs(el) {
    const q = s => el.querySelector(s);

    // Live-recalc on input change
    ['#arq-fondo-inicial', '#arq-efectivo-contado'].forEach(sel => {
      q(sel)?.addEventListener('input', () => this.recalculate(el));
    });

    // Retiro add button
    q('#btn-add-retiro')?.addEventListener('click', () => {
      const monto = Number(q('#arq-retiro-monto')?.value || 0);
      const razon = q('#arq-retiro-razon')?.value.trim();
      if (!monto || monto <= 0 || !razon) {
        NotificationService.warn('Ingresa un monto válido y una razón para el retiro.');
        return;
      }
      this.state.retiros.push({ amount: monto, reason: razon, time: Date.now() });
      if (q('#arq-retiro-monto')) q('#arq-retiro-monto').value = '';
      if (q('#arq-retiro-razon')) q('#arq-retiro-razon').value = '';
      this.renderRetiros(el);
      this.recalculate(el);
    });
  }

  renderRetiros(el) {
    const list = el.querySelector('#retiros-list');
    const emptyMsg = el.querySelector('#retiros-empty');
    if (!list) return;

    if (this.state.retiros.length === 0) {
      list.innerHTML = '<p class="text-xs text-secondary" id="retiros-empty">Sin retiros registrados aún.</p>';
      return;
    }

    list.innerHTML = this.state.retiros.map((r, i) => `
      <div class="retiro-item">
        <div>
          <div class="font-semibold" style="font-size:0.85rem;">$${r.amount.toFixed(2)}</div>
          <div class="text-xs text-secondary">${r.reason}</div>
        </div>
        <button class="btn btn-sm" data-retiro-idx="${i}" 
          style="background:rgba(248,113,113,0.1);color:#f87171;border:1px solid rgba(248,113,113,0.2);font-size:0.72rem;padding:3px 8px;">
          ✕ Quitar
        </button>
      </div>
    `).join('');

    list.querySelectorAll('[data-retiro-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-retiro-idx'));
        this.state.retiros.splice(idx, 1);
        this.renderRetiros(el);
        this.recalculate(el);
      });
    });
  }

  recalculate(el) {
    const fmt = v => `$${Number(v).toFixed(2)}`;
    const q   = s => el.querySelector(s);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayVentas = this.state.ventas.filter(v => (v.date || v.createdAt || 0) >= today.getTime());

    const totalSistema  = todayVentas.reduce((s, v) => s + Number(v.total || 0), 0);
    const efectivoSist  = todayVentas.filter(v => (v.paymentMethod || '').toUpperCase() === 'EFECTIVO').reduce((s, v) => s + Number(v.total || 0), 0);
    const tarjetaSist   = totalSistema - efectivoSist;
    const totalRetiros  = this.state.retiros.reduce((s, r) => s + Number(r.amount || 0), 0);

    const montoInicial  = Number(q('#arq-fondo-inicial')?.value || 0);
    const efectivoCont  = Number(q('#arq-efectivo-contado')?.value || 0);
    const esperado      = montoInicial + efectivoSist - totalRetiros;
    const diferencia    = efectivoCont - esperado;

    // Update display values
    if (q('#arq-disp-fondo'))    q('#arq-disp-fondo').textContent    = fmt(montoInicial);
    if (q('#arq-disp-efectivo')) q('#arq-disp-efectivo').textContent = fmt(efectivoSist);
    if (q('#arq-disp-tarjeta'))  q('#arq-disp-tarjeta').textContent  = fmt(tarjetaSist);
    if (q('#arq-disp-total'))    q('#arq-disp-total').textContent    = fmt(totalSistema);
    if (q('#arq-disp-retiros'))  q('#arq-disp-retiros').textContent  = fmt(totalRetiros);
    if (q('#arq-disp-esperado')) q('#arq-disp-esperado').textContent = fmt(esperado);
    if (q('#arq-disp-contado'))  q('#arq-disp-contado').textContent  = fmt(efectivoCont);

    // Cuadre indicator
    const icon  = q('#cuadre-icon');
    const diff  = q('#cuadre-diff');
    const label = q('#cuadre-label');
    if (icon && diff && label) {
      if (efectivoCont === 0 && montoInicial === 0) {
        icon.textContent  = '⚖️';
        diff.textContent  = '$0.00';
        diff.className    = 'cuadre-ok';
        label.textContent = 'Ingresa los valores para calcular';
      } else if (Math.abs(diferencia) < 0.01) {
        icon.textContent  = '✅';
        diff.textContent  = '¡Cuadre perfecto!';
        diff.className    = 'cuadre-ok';
        label.textContent = 'El efectivo físico coincide exactamente con el sistema.';
      } else if (diferencia < 0) {
        icon.textContent  = '🔴';
        diff.textContent  = `Faltante: ${fmt(Math.abs(diferencia))}`;
        diff.className    = 'cuadre-neg';
        label.textContent = 'Hay menos efectivo del esperado. Verifique retiros o cobros no registrados.';
      } else {
        icon.textContent  = '🟡';
        diff.textContent  = `Sobrante: ${fmt(diferencia)}`;
        diff.className    = 'cuadre-pos';
        label.textContent = 'Hay más efectivo del esperado. Verifique si hay cobros sin registrar en sistema.';
      }
    }

    // Transaction table
    this.renderTransactions(el, todayVentas);
  }

  renderTransactions(el, ventas) {
    const list = el.querySelector('#arq-transactions-list');
    if (!list) return;

    if (ventas.length === 0) {
      list.innerHTML = '<p class="text-secondary text-center py-6">No hay transacciones registradas el día de hoy.</p>';
      return;
    }

    const sorted = [...ventas].sort((a, b) => (b.date || b.createdAt || 0) - (a.date || a.createdAt || 0));
    list.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
          <thead>
            <tr style="border-bottom:2px solid var(--color-border);">
              <th style="padding:8px 12px;text-align:left;color:var(--color-text-secondary);font-weight:600;">Hora</th>
              <th style="padding:8px 12px;text-align:left;color:var(--color-text-secondary);font-weight:600;">Vendedor</th>
              <th style="padding:8px 12px;text-align:center;color:var(--color-text-secondary);font-weight:600;">Método</th>
              <th style="padding:8px 12px;text-align:right;color:var(--color-text-secondary);font-weight:600;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((v, i) => {
              const d    = new Date(v.date || v.createdAt || Date.now());
              const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
              const met  = v.paymentMethod || 'EFECTIVO';
              const metColor = met === 'EFECTIVO' ? '#34d399' : (met === 'TARJETA' ? '#818cf8' : '#fbbf24');
              return `
                <tr style="border-bottom:1px solid var(--color-border);background:${i%2===0 ? 'transparent' : 'var(--color-bg-secondary)'};">
                  <td style="padding:8px 12px;color:var(--color-text-secondary);">${hora}</td>
                  <td style="padding:8px 12px;">${v.sellerName || 'Cajero'}</td>
                  <td style="padding:8px 12px;text-align:center;">
                    <span style="background:${metColor}22;color:${metColor};font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;">${met}</span>
                  </td>
                  <td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--color-success);">$${Number(v.total||0).toFixed(2)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async submitArqueo(el) {
    const q = s => el.querySelector(s);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayVentas   = this.state.ventas.filter(v => (v.date || v.createdAt || 0) >= today.getTime());
    const totalSistema  = todayVentas.reduce((s, v) => s + Number(v.total || 0), 0);
    const efectivoSist  = todayVentas.filter(v => (v.paymentMethod || '').toUpperCase() === 'EFECTIVO').reduce((s, v) => s + Number(v.total || 0), 0);
    const tarjetaSist   = totalSistema - efectivoSist;
    const totalRetiros  = this.state.retiros.reduce((s, r) => s + Number(r.amount || 0), 0);
    const montoInicial  = Number(q('#arq-fondo-inicial')?.value || 0);
    const efectivoCont  = Number(q('#arq-efectivo-contado')?.value || 0);
    const esperado      = montoInicial + efectivoSist - totalRetiros;
    const diferencia    = efectivoCont - esperado;
    const observaciones = q('#arq-observaciones')?.value.trim() || '';

    const btn = el.querySelector('#btn-arqueo-send');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

    try {
      const arqueoPayload = {
        fecha:          today.getTime(),
        cajero:         this.cashierName,
        montoInicial,
        efectivoSistema: efectivoSist,
        tarjetaSistema:  tarjetaSist,
        totalSistema,
        retiros:         this.state.retiros,
        totalRetiros,
        efectivoContado: efectivoCont,
        esperadoEnCaja:  esperado,
        diferencia,
        transacciones:   todayVentas.length,
        observaciones,
        estado:         'PENDIENTE_REVISION',
        creadoEn:       Date.now()
      };

      const arqueoId = await FirestoreService.create('arqueos_caja', arqueoPayload);

      // Notify owner via internal notification
      await FirestoreService.create('notificaciones', {
        tipo:       'ARQUEO_PENDIENTE',
        titulo:     '📊 Arqueo de Caja Pendiente de Revisión',
        mensaje:    `La cajera ${this.cashierName} ha completado el arqueo del día. Diferencia: $${diferencia.toFixed(2)}.`,
        arqueoId,
        leida:      false,
        prioridad:  diferencia !== 0 ? 'ALTA' : 'NORMAL',
      });

      NotificationService.success('Arqueo enviado al dueño para revisión. ✅');

      if (btn) { btn.disabled = false; btn.textContent = '✅ Listo para Enviar'; }
    } catch (e) {
      console.error('[ArqueoView] submit error:', e);
      NotificationService.error('Error al enviar el arqueo. Intenta de nuevo.');
      if (btn) { btn.disabled = false; btn.textContent = '✅ Listo para Enviar'; }
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}
