/**
 * @file plans.view.js
 * @description SuperAdmin Plans View. Allows registering and editing SaaS pricing plans dynamically.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { I18nService } from '../../../services/i18n.service.js';

export class PlansView extends Component {
  constructor(params = {}) {
    super(params);

    GlobalStore.set({ plans: [] });

    // Set up PageLayout
    this.layout = new PageLayout({
      title: I18nService.t('plan_title'),
      subtitle: I18nService.t('sa_plans_subtitle'),
      actionHTML: `<button class="btn btn-primary btn-sm" id="btn-add-plan">+ ${I18nService.t('plan_add')}</button>`,
      contentHTML: `
        <div class="grid-stats" id="plans-container-grid">
          <!-- Dinamically loaded plans cards -->
        </div>
      `
    });

    // Subscribe to store updates to redraw plans cards automatically
    this.unsubscribe = GlobalStore.subscribe('plans', (plans) => {
      this.renderPlansGrid(plans);
    });

    this.modalInstance = null;
  }

  getDefaultPlans() {
    return [
      { id: 'BASIC', name: I18nService.t('plan_name') + ' Basic', price: 499, currency: 'NIO', duration: I18nService.t('fin_monthly'), description: I18nService.t('sa_plan_basic_desc'), benefits: I18nService.t('sa_plan_basic_benefits'), userLimit: 3, employeeLimit: 5, storageGb: 1, branchLimit: 1, productLimit: 100, status: 'ACTIVO', color: '#64748b', icon: 'store', order: 1, enabledFeatures: 'menu_qr,inventario' },
      { id: 'PREMIUM', name: I18nService.t('plan_name') + ' Premium', price: 999, currency: 'NIO', duration: I18nService.t('fin_monthly'), description: I18nService.t('sa_plan_premium_desc'), benefits: I18nService.t('sa_plan_premium_benefits'), userLimit: 20, employeeLimit: 50, storageGb: 5, branchLimit: 3, productLimit: 1000, status: 'ACTIVO', color: '#7c75ff', icon: 'crown', order: 2, enabledFeatures: 'menu_qr,inventario,kds,reportes' },
      { id: 'ENTERPRISE', name: I18nService.t('plan_name') + ' Enterprise', price: 1999, currency: 'NIO', duration: I18nService.t('fin_monthly'), description: I18nService.t('sa_plan_enterprise_desc'), benefits: I18nService.t('sa_plan_enterprise_benefits'), userLimit: 0, employeeLimit: 0, storageGb: 25, branchLimit: 0, productLimit: 0, status: 'ACTIVO', color: '#16a34a', icon: 'building', order: 3, enabledFeatures: 'menu_qr,inventario,kds,reportes,api,soporte_prioritario' }
    ];
  }

  async loadPlans() {
    try {
      let plans = await FirestoreService.listPlans();
      if (!plans.length) {
        const defaults = this.getDefaultPlans();
        await Promise.all(defaults.map(plan => FirestoreService.savePlan(plan.id, plan)));
        plans = defaults;
      }
      GlobalStore.set({ plans });
    } catch (error) {
      console.error('[PlansView] Error loading plans:', error);
      NotificationService.error(I18nService.t('sa_plans_error_load'));
      GlobalStore.set({ plans: this.getDefaultPlans() });
    }
  }

  mount() {
    const element = this.layout.mount();
    
    // Initial draw of plan cards
    const plans = GlobalStore.getState().plans || [];
    this.renderPlansGrid(plans, element);
    this.loadPlans();

    // Execute event binding hook manually since mount is overridden
    this.afterMount();

    return element;
  }

  afterMount() {
    // Add plan button click handler
    const addBtn = this.layout.$('#btn-add-plan');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openAddPlanModal());
    }

    // Bind all edit buttons dynamically
    const editButtons = this.layout.$$('.btn-edit-plan');
    editButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const planId = e.currentTarget.getAttribute('data-id');
        const planData = (GlobalStore.getState().plans || []).find(p => p.id === planId);
        if (planData) {
          this.openEditPlanModal(planData);
        }
      });
    });
  }

  /**
   * Generates and injects the plans cards HTML into the DOM grid
   * @param {Array} plans 
   * @param {HTMLElement} [parentEl] - Fallback to current layout element if not rendered yet
   */
  renderPlansGrid(plans, parentEl) {
    const element = parentEl || this.layout.element;
    const grid = element ? element.querySelector('#plans-container-grid') : null;
    if (!grid) return;

    grid.innerHTML = plans.map(p => {
      const benefits = p.benefits || p.features || '';
      const featuresList = benefits
        ? benefits.split(',').map(f => `<li>✓ ${f.trim()}</li>`).join('')
        : `<li>${I18nService.t('sa_plans_no_features')}</li>`;
      
      const isPremium = p.id === 'PREMIUM';
      const highlightStyle = isPremium ? `border: 2px solid ${p.color || 'var(--color-accent)'};` : '';
      const badgeHTML = isPremium ? `<span class="badge" style="background-color: var(--color-accent); color: white; margin-bottom: var(--space-2); align-self: center;">${I18nService.t('sa_plans_recommended')}</span>` : '';
      const statusLabel = p.status === 'INACTIVO' ? I18nService.t('inactive') : I18nService.t('active');

      return `
        <div class="card p-5 text-center d-flex flex-column justify-content-between hover-lift" style="${highlightStyle}">
          <div>
            ${badgeHTML}
            <h4 class="text-lg font-bold">${p.name}</h4>
            <h3 class="text-3xl font-extrabold my-3">${p.currency || 'NIO'} ${p.price} <span class="text-sm font-normal">/ ${p.duration || I18nService.t('fin_monthly')}</span></h3>
            <p class="text-xs text-secondary mb-4">${p.description}</p>
            <p class="text-xs text-secondary mb-3">${statusLabel} · ${Number(p.branchLimit || 0) || I18nService.t('sa_plans_unlimited')} ${I18nService.t('branch_title').toLowerCase()} · ${Number(p.productLimit || 0) || I18nService.t('sa_plans_unlimited_m')} ${I18nService.t('inv_products').toLowerCase()}</p>
            <ul class="text-sm text-left mb-4" style="list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px;">
              ${featuresList}
            </ul>
          </div>
          <button class="btn btn-secondary btn-sm w-full btn-edit-plan" data-id="${p.id}">${I18nService.t('sa_plans_edit_btn')}</button>
        </div>
      `;
    }).join('');

    // Re-bind listeners after rewriting the grid HTML
    this.afterMount();
  }

  /**
   * Opens the form modal to create a new pricing plan
   */
  openAddPlanModal() {
    const formHTML = `
      ${this.getPlanFormHTML()}
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">${I18nService.t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">${I18nService.t('plan_add')}</button>
    `;

    this.modalInstance = new Modal({
      title: I18nService.t('sa_plans_create_modal_title'),
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    document.body.appendChild(this.modalInstance.mount());

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.modalInstance.close());
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitNewPlan());
    }
  }

  /**
   * Validates and saves a new plan in the GlobalStore
   */
  async submitNewPlan() {
    const form = this.modalInstance.$('#add-plan-form');
    if (!form || !form.reportValidity()) return;

    const plan = this.readPlanForm();
    const planId = plan.name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    const currentPlans = GlobalStore.getState().plans || [];

    // Avoid duplicates
    if (currentPlans.some(p => p.id === planId)) {
      alert(I18nService.t('sa_plans_duplicate_error'));
      return;
    }

    await FirestoreService.savePlan(planId, { id: planId, ...plan });
    await this.loadPlans();
    NotificationService.success(I18nService.t('sa_plans_created_toast', { name: plan.name }));
    this.modalInstance.close();
  }

  /**
   * Opens the edit form modal with loaded plan credentials
   * @param {Object} plan 
   */
  openEditPlanModal(plan) {
    const formHTML = `
      ${this.getPlanFormHTML(plan, true)}
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">${I18nService.t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="modal-save-btn">${I18nService.t('save_changes')}</button>
    `;

    this.modalInstance = new Modal({
      title: I18nService.t('sa_plans_edit_modal_title', { name: plan.name }),
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    document.body.appendChild(this.modalInstance.mount());

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.modalInstance.close());
    }

    const saveBtn = this.modalInstance.$('#modal-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.submitEditPlan(plan.id));
    }
  }

  /**
   * Processes plan edits and updates GlobalStore
   * @param {string} id 
   */
  async submitEditPlan(id) {
    const form = this.modalInstance.$('#edit-plan-form');
    if (!form || !form.reportValidity()) return;

    const plan = this.readPlanForm(true);
    await FirestoreService.savePlan(id, { id, ...plan });
    await this.loadPlans();
    NotificationService.success(I18nService.t('sa_plans_updated_toast', { name: plan.name }));
    this.modalInstance.close();
  }

  getPlanFormHTML(plan = {}, isEdit = false) {
    const prefix = isEdit ? 'edit-' : '';
    const formId = isEdit ? 'edit-plan-form' : 'add-plan-form';
    return `
      <form id="${formId}" class="d-flex flex-column gap-3" style="color: var(--color-text-primary); max-height:70vh; overflow-y:auto; padding-right:4px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="${prefix}plan-name">${I18nService.t('sa_plans_name_label')}</label>
            <input type="text" id="${prefix}plan-name" class="input input-md" value="${plan.name || ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="${prefix}plan-price">${I18nService.t('price')}</label>
            <input type="number" id="${prefix}plan-price" class="input input-md" value="${plan.price || 0}" min="0" required />
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="${prefix}plan-currency">${I18nService.t('settings_currency')}</label>
            <input type="text" id="${prefix}plan-currency" class="input input-md" value="${plan.currency || 'NIO'}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="${prefix}plan-duration">${I18nService.t('time').replace('Hora', 'Duración')}</label>
            <input type="text" id="${prefix}plan-duration" class="input input-md" value="${plan.duration || I18nService.t('fin_monthly')}" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="${prefix}plan-desc">${I18nService.t('description')}</label>
          <textarea id="${prefix}plan-desc" class="input input-md" style="height:70px; padding:var(--space-2); resize:vertical;" required>${plan.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="${prefix}plan-benefits">${I18nService.t('sa_plans_benefits_label')}</label>
          <input type="text" id="${prefix}plan-benefits" class="input input-md" value="${plan.benefits || plan.features || ''}" required />
        </div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:var(--space-3);">
          <input id="${prefix}plan-user-limit" class="input input-md" type="number" min="0" placeholder="${I18nService.t('sa_plans_limit_users')}" value="${plan.userLimit || 0}" />
          <input id="${prefix}plan-employee-limit" class="input input-md" type="number" min="0" placeholder="${I18nService.t('sa_plans_limit_employees')}" value="${plan.employeeLimit || 0}" />
          <input id="${prefix}plan-storage" class="input input-md" type="number" min="0" placeholder="${I18nService.t('sa_plans_limit_storage')}" value="${plan.storageGb || 0}" />
          <input id="${prefix}plan-branches" class="input input-md" type="number" min="0" placeholder="${I18nService.t('sa_plans_limit_branches')}" value="${plan.branchLimit || 0}" />
          <input id="${prefix}plan-products" class="input input-md" type="number" min="0" placeholder="${I18nService.t('sa_plans_limit_products')}" value="${plan.productLimit || 0}" />
          <input id="${prefix}plan-order" class="input input-md" type="number" min="0" placeholder="${I18nService.t('sa_plans_order_label')}" value="${plan.order || 0}" />
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:var(--space-3);">
          <select id="${prefix}plan-status" class="input input-md">
            <option value="ACTIVO" ${plan.status !== 'INACTIVO' ? 'selected' : ''}>${I18nService.t('active')}</option>
            <option value="INACTIVO" ${plan.status === 'INACTIVO' ? 'selected' : ''}>${I18nService.t('inactive')}</option>
          </select>
          <input id="${prefix}plan-color" class="input input-md" type="color" value="${plan.color || '#7c75ff'}" />
          <input id="${prefix}plan-icon" class="input input-md" type="text" placeholder="${I18nService.t('sa_plans_icon_label')}" value="${plan.icon || 'store'}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="${prefix}plan-features-enabled">${I18nService.t('sa_plans_features_enabled_label')}</label>
          <input type="text" id="${prefix}plan-features-enabled" class="input input-md" value="${plan.enabledFeatures || ''}" />
        </div>
      </form>
    `;
  }

  readPlanForm(isEdit = false) {
    const prefix = isEdit ? 'edit-' : '';
    return {
      name: this.modalInstance.$(`#${prefix}plan-name`).value.trim(),
      price: Number(this.modalInstance.$(`#${prefix}plan-price`).value),
      currency: this.modalInstance.$(`#${prefix}plan-currency`).value.trim(),
      duration: this.modalInstance.$(`#${prefix}plan-duration`).value.trim(),
      description: this.modalInstance.$(`#${prefix}plan-desc`).value.trim(),
      benefits: this.modalInstance.$(`#${prefix}plan-benefits`).value.trim(),
      userLimit: Number(this.modalInstance.$(`#${prefix}plan-user-limit`).value || 0),
      employeeLimit: Number(this.modalInstance.$(`#${prefix}plan-employee-limit`).value || 0),
      storageGb: Number(this.modalInstance.$(`#${prefix}plan-storage`).value || 0),
      branchLimit: Number(this.modalInstance.$(`#${prefix}plan-branches`).value || 0),
      productLimit: Number(this.modalInstance.$(`#${prefix}plan-products`).value || 0),
      status: this.modalInstance.$(`#${prefix}plan-status`).value,
      color: this.modalInstance.$(`#${prefix}plan-color`).value,
      icon: this.modalInstance.$(`#${prefix}plan-icon`).value.trim(),
      order: Number(this.modalInstance.$(`#${prefix}plan-order`).value || 0),
      enabledFeatures: this.modalInstance.$(`#${prefix}plan-features-enabled`).value.trim()
    };
  }

  unmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.layout.unmount();
    super.unmount();
  }
}
