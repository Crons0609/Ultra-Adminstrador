/**
 * @file promotions.view.js
 * @description Vista de Gestión de Promociones para la cajera.
 * Permite crear, activar/desactivar y administrar promociones que se
 * aplican en el menú digital del cliente en tiempo real.
 *
 * Tipos de promoción soportados:
 *  - DIA        → Expira a medianoche del día actual
 *  - SEMANA     → Expira el próximo domingo a medianoche
 *  - FIN_SEMANA → Activa sólo sábado y domingo
 *  - LOTE       → Hasta agotar existencias (requiere lote No. y cantidad)
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { GlobalStore } from '../../../core/state.js';
import { Modal } from '../../../components/ui/modal.js';
import { I18nService } from '../../../services/i18n.service.js';

export class PromotionsView extends Component {
  constructor(params = {}) {
    super(params);
    const user = GlobalStore.getState().currentUser || {};
    this.companyId = user.companyId || '';
    this.sellerName = user.name || I18nService.t('pos_cashier');
    this.listeners = [];
    this.state = { promotions: [], products: [] };

    this.layout = new PageLayout({
      title: I18nService.t('promo_title'),
      subtitle: I18nService.t('promo_subtitle'),
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-new-promo" style="display:flex;align-items:center;gap:6px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          ${I18nService.t('promo_add')}
        </button>
      `,
      contentHTML: `
        <style>
          .promo-type-badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 999px;
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.02em;
          }
          .promo-DIA      { background: #fbbf2422; color: #fbbf24; }
          .promo-SEMANA   { background: #34d39922; color: #34d399; }
          .promo-FIN_SEMANA { background: #818cf822; color: #818cf8; }
          .promo-LOTE     { background: #fb923c22; color: #fb923c; }
          .promo-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: var(--space-4);
            margin-top: var(--space-4);
          }
          .promo-card {
            background: var(--color-bg-secondary);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: var(--space-5);
            display: flex;
            flex-direction: column;
            gap: var(--space-3);
            position: relative;
            overflow: hidden;
          }
          .promo-card-accent {
            position: absolute;
            top: 0; left: 0;
            width: 4px; height: 100%;
            border-radius: var(--radius-lg) 0 0 var(--radius-lg);
          }
          .promo-card-body { padding-left: 8px; }
          .promo-card-actions { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
        </style>

        <!-- Stats strip -->
        <div class="grid-stats animate-fade-in" id="promo-stats">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('promo_active_kpi')}</span>
              <div class="kpi-icon kpi-icon-success">🏷️</div>
            </div>
            <h3 class="kpi-value" id="promo-active-count">0</h3>
          </div>
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('promo_lotes_kpi')}</span>
              <div class="kpi-icon kpi-icon-warning">📦</div>
            </div>
            <h3 class="kpi-value" id="promo-lote-count">0</h3>
          </div>
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('promo_avg_discount_kpi')}</span>
              <div class="kpi-icon kpi-icon-accent">%</div>
            </div>
            <h3 class="kpi-value" id="promo-avg-disc">0%</h3>
          </div>
        </div>

        <!-- Promotions grid -->
        <div id="promo-grid" class="promo-grid">
          <p class="text-secondary text-center py-10" style="grid-column:1/-1;">${I18nService.t('loading_data')}</p>
        </div>
      `
    });
  }

  mount() {
    const el = this.layout.mount();
    this.subscribeData(el);
    el.querySelector('#btn-new-promo')?.addEventListener('click', () => this.openPromoModal(null, el));
    return el;
  }

  subscribeData(el) {
    const promoL = FirestoreService.listenToTenant('promociones', (promos) => {
      this.state.promotions = promos || [];
      this.render(el);
    });
    const prodL = FirestoreService.listenToTenant('productos', (prods) => {
      this.state.products = prods || [];
    });
    this.listeners.push(promoL, prodL);
  }

  render(el) {
    const promos = this.state.promotions;
    const active = promos.filter(p => p.isActive !== false);
    const lotes  = promos.filter(p => p.type === 'LOTE' && p.isActive !== false);
    const avgDisc = active.length
      ? Math.round(active.reduce((s, p) => s + Number(p.discount || 0), 0) / active.length)
      : 0;

    const q = s => el.querySelector(s);
    if (q('#promo-active-count')) q('#promo-active-count').textContent = active.length;
    if (q('#promo-lote-count'))   q('#promo-lote-count').textContent   = lotes.length;
    if (q('#promo-avg-disc'))     q('#promo-avg-disc').textContent     = `${avgDisc}%`;

    const grid = q('#promo-grid');
    if (!grid) return;

    if (promos.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:60px 20px;">
          <div style="font-size:3rem; margin-bottom:12px;">🏷️</div>
          <p class="font-semibold text-primary">${I18nService.t('promo_no_promos')}</p>
          <p class="text-xs text-secondary mt-1">${I18nService.t('promo_empty_desc')}</p>
        </div>`;
      return;
    }

    const typeColors = { DIA: '#fbbf24', SEMANA: '#34d399', FIN_SEMANA: '#818cf8', LOTE: '#fb923c' };
    const typeLabels = { DIA: I18nService.t('promo_type_day'), SEMANA: I18nService.t('promo_type_week'), FIN_SEMANA: I18nService.t('promo_type_weekend'), LOTE: I18nService.t('promo_type_batch') };

    grid.innerHTML = promos.map(p => {
      const color  = typeColors[p.type] || '#7c75ff';
      const label  = typeLabels[p.type] || p.type;
      const active = p.isActive !== false;
      const loteInfo = p.type === 'LOTE' ? `
        <div class="text-xs text-secondary" style="margin-top:2px;">
          ${I18nService.t('promo_batch_num_label')} <strong>${p.loteNumber || '—'}</strong> ·
          ${I18nService.t('status')}: <strong style="color:${(p.loteCantidad || 0) <= 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${p.loteCantidad ?? '—'}</strong> ${I18nService.t('inv_unit_units')}
        </div>` : '';

      return `
        <div class="promo-card animate-slide-up" style="opacity:${active ? 1 : 0.55};">
          <div class="promo-card-accent" style="background:${color};"></div>
          <div class="promo-card-body">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span class="promo-type-badge promo-${p.type}">${label}</span>
              ${!active ? `<span class="badge" style="background:rgba(248,113,113,0.15);color:#f87171;font-size:0.68rem;">${I18nService.t('inactive')}</span>` : ''}
            </div>
            <h4 class="font-bold text-md" style="color:var(--color-text-primary);">${p.name || I18nService.t('no_name')}</h4>
            <p class="text-xs text-secondary">${p.productName || I18nService.t('promo_no_product_linked')}</p>
            ${loteInfo}
            <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
              <span style="font-size:1.5rem;font-weight:800;color:${color};">${p.discount || 0}% ${I18nService.t('promo_off')}</span>
              <span class="text-xs text-secondary">${I18nService.t('promo_off_desc')}</span>
            </div>
          </div>
          <div class="promo-card-actions">
            <button class="btn btn-secondary btn-sm flex-1 btn-edit-promo" data-id="${p.id}" style="font-size:0.78rem;">✏️ ${I18nService.t('edit')}</button>
            <button class="btn btn-sm flex-1 btn-toggle-promo" data-id="${p.id}" data-active="${active}" 
              style="font-size:0.78rem; background:${active ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)'}; color:${active ? '#f87171' : '#34d399'}; border:1px solid ${active ? '#f8717133' : '#34d39933'};">
              ${active ? `⏸ ${I18nService.t('disabled')}` : `▶ ${I18nService.t('enabled')}`}
            </button>
          </div>
        </div>`;
    }).join('');

    // Bind card actions
    grid.querySelectorAll('.btn-edit-promo').forEach(btn => {
      btn.addEventListener('click', () => {
        const promo = this.state.promotions.find(p => p.id === btn.getAttribute('data-id'));
        if (promo) this.openPromoModal(promo, el);
      });
    });
    grid.querySelectorAll('.btn-toggle-promo').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id     = btn.getAttribute('data-id');
        const active = btn.getAttribute('data-active') === 'true';
        await FirestoreService.update('promociones', id, { isActive: !active });
        NotificationService.success(I18nService.t('promo_status_changed_toast', { status: active ? I18nService.t('disabled').toLowerCase() : I18nService.t('enabled').toLowerCase() }));
      });
    });
  }

  openPromoModal(existing = null, parentEl) {
    const products = this.state.products;
    const isEdit   = !!existing;
    const p        = existing || {};

    const productOptions = products.map(prod =>
      `<option value="${prod.id}" data-name="${prod.name}" data-price="${prod.price}" ${p.productId === prod.id ? 'selected' : ''}>${prod.name} — $${Number(prod.price || 0).toFixed(2)}</option>`
    ).join('');

    const bodyHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">
        <div class="form-group">
          <label class="form-label">${I18nService.t('promo_name_label')}</label>
          <input type="text" id="pm-name" class="input input-md" placeholder="${I18nService.t('promo_name_placeholder')}" value="${p.name || ''}" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="form-group">
            <label class="form-label">${I18nService.t('promo_type_label')}</label>
            <select id="pm-type" class="input input-md" style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-md);color:var(--color-text-primary);padding:0 var(--space-3);">
              <option value="DIA"       ${p.type === 'DIA'        ? 'selected' : ''}>${I18nService.t('promo_type_day')}</option>
              <option value="SEMANA"    ${p.type === 'SEMANA'     ? 'selected' : ''}>${I18nService.t('promo_type_week_long')}</option>
              <option value="FIN_SEMANA"${p.type === 'FIN_SEMANA' ? 'selected' : ''}>${I18nService.t('promo_type_weekend')}</option>
              <option value="LOTE"      ${p.type === 'LOTE'       ? 'selected' : ''}>${I18nService.t('promo_type_batch_long')}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">${I18nService.t('promo_discount_label')}</label>
            <input type="number" id="pm-discount" class="input input-md" min="1" max="99" placeholder="${I18nService.t('promo_discount_placeholder')}" value="${p.discount || ''}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${I18nService.t('promo_linked_product_label')}</label>
          <select id="pm-product" class="input input-md" style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-md);color:var(--color-text-primary);padding:0 var(--space-3);">
            <option value="">${I18nService.t('promo_all_products_option')}</option>
            ${productOptions}
          </select>
        </div>
        <div id="pm-lote-section" style="display:${p.type === 'LOTE' ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="form-group">
            <label class="form-label">${I18nService.t('promo_batch_num_field')}</label>
            <input type="text" id="pm-lote-num" class="input input-md" placeholder="${I18nService.t('promo_batch_num_placeholder')}" value="${p.loteNumber || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">${I18nService.t('promo_batch_qty_label')}</label>
            <input type="number" id="pm-lote-qty" class="input input-md" min="1" placeholder="${I18nService.t('promo_batch_qty_placeholder')}" value="${p.loteCantidad ?? ''}" />
          </div>
        </div>
      </div>
    `;

    const modal = new Modal({
      title: isEdit ? I18nService.t('promo_edit_title') : I18nService.t('promo_add_title'),
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="pm-cancel">${I18nService.t('cancel')}</button>
        <button class="btn btn-primary btn-sm" id="pm-save">${isEdit ? I18nService.t('save_changes') : I18nService.t('promo_add')}</button>
      `
    });

    const el = modal.mount();
    document.body.appendChild(el);

    // Show/hide lote section on type change
    const typeSelect = modal.$('#pm-type');
    const loteSection = modal.$('#pm-lote-section');
    typeSelect?.addEventListener('change', () => {
      loteSection.style.display = typeSelect.value === 'LOTE' ? 'grid' : 'none';
    });

    modal.$('#pm-cancel')?.addEventListener('click', () => modal.close());
    modal.$('#pm-save')?.addEventListener('click', async () => {
      const name     = modal.$('#pm-name')?.value.trim();
      const type     = modal.$('#pm-type')?.value;
      const discount = Number(modal.$('#pm-discount')?.value);
      const prodSel  = modal.$('#pm-product');
      const productId   = prodSel?.value || '';
      const productName = productId ? prodSel.options[prodSel.selectedIndex]?.getAttribute('data-name') || '' : '';

      if (!name || !type || !discount) {
        NotificationService.warn(I18nService.t('error_required_fields'));
        return;
      }

      const payload = {
        name, type, discount, productId, productName, isActive: true,
        createdBy: this.sellerName,
      };

      if (type === 'LOTE') {
        payload.loteNumber   = modal.$('#pm-lote-num')?.value.trim() || '';
        payload.loteCantidad = Number(modal.$('#pm-lote-qty')?.value) || 0;
      }

      // Set expiry helpers
      const now = new Date();
      if (type === 'DIA') {
        const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
        payload.expiresAt = endOfDay.getTime();
      } else if (type === 'SEMANA') {
        const endOfWeek = new Date(now);
        endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
        endOfWeek.setHours(23, 59, 59, 999);
        payload.expiresAt = endOfWeek.getTime();
      }

      try {
        if (isEdit) {
          await FirestoreService.update('promociones', existing.id, payload);
          NotificationService.success(I18nService.t('promo_updated_success'));
        } else {
          await FirestoreService.create('promociones', payload);
          NotificationService.success(I18nService.t('promo_saved_success'));
        }
        modal.close();
      } catch (e) {
        console.error(e);
        NotificationService.error(I18nService.t('promo_save_error'));
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
