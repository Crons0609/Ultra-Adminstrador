/**
 * @file plans.view.js
 * @description SuperAdmin Plans View. Allows registering and editing SaaS pricing plans dynamically.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';

export class PlansView extends Component {
  constructor(params = {}) {
    super(params);

    // Initialize mock plans in GlobalStore if not present
    if (!GlobalStore.getState().plans) {
      GlobalStore.set({
        plans: [
          { id: 'BASIC', name: 'Plan Basic', price: 499, description: 'Ideal para cafeterías pequeñas o un solo local.', features: '1 Sucursal, 3 Usuarios activos, Menú Digital QR' },
          { id: 'PREMIUM', name: 'Plan Premium', price: 999, description: 'El más popular para restaurantes en crecimiento.', features: '3 Sucursales, Usuarios ilimitados, Módulo KDS e Inventario' },
          { id: 'ENTERPRISE', name: 'Plan Enterprise', price: 1999, description: 'Para franquicias y grandes cadenas de comida.', features: 'Sucursales ilimitadas, Soporte prioritario 24/7, API abierta e informes avanzados' }
        ]
      });
    }

    // Set up PageLayout
    this.layout = new PageLayout({
      title: 'Planes SaaS',
      subtitle: 'Administración de suscripciones, límites de sucursales, productos y costos de licencias.',
      actionHTML: `<button class="btn btn-primary btn-sm" id="btn-add-plan">+ Nuevo Plan</button>`,
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

  mount() {
    const element = this.layout.mount();
    
    // Initial draw of plan cards
    const plans = GlobalStore.getState().plans || [];
    this.renderPlansGrid(plans, element);

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
      const featuresList = p.features
        ? p.features.split(',').map(f => `<li>✓ ${f.trim()}</li>`).join('')
        : '<li>Sin características</li>';
      
      const isPremium = p.id === 'PREMIUM';
      const highlightStyle = isPremium ? 'border: 2px solid var(--color-accent);' : '';
      const badgeHTML = isPremium ? '<span class="badge" style="background-color: var(--color-accent); color: white; margin-bottom: var(--space-2); align-self: center;">Recomendado</span>' : '';

      return `
        <div class="card p-5 text-center d-flex flex-column justify-content-between hover-lift" style="${highlightStyle}">
          <div>
            ${badgeHTML}
            <h4 class="text-lg font-bold">${p.name}</h4>
            <h3 class="text-3xl font-extrabold my-3">$${p.price} <span class="text-sm font-normal">/ mes</span></h3>
            <p class="text-xs text-secondary mb-4">${p.description}</p>
            <ul class="text-sm text-left mb-4" style="list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px;">
              ${featuresList}
            </ul>
          </div>
          <button class="btn btn-secondary btn-sm w-full btn-edit-plan" data-id="${p.id}">Editar Plan</button>
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
      <form id="add-plan-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="plan-name">Nombre del Plan</label>
            <input type="text" id="plan-name" class="input input-md" placeholder="Ej. Plan Básico" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="plan-price">Precio Mensual ($ MXN)</label>
            <input type="number" id="plan-price" class="input input-md" placeholder="Ej. 499" min="0" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="plan-desc">Descripción del Plan</label>
          <textarea id="plan-desc" class="input input-md" style="height: 80px; padding: var(--space-2); resize: none;" placeholder="Breve resumen del plan..." required></textarea>
        </div>

        <div class="form-group">
          <label class="form-label" for="plan-features">Características del Plan (Separadas por comas)</label>
          <input type="text" id="plan-features" class="input input-md" placeholder="Ej. 1 Sucursal, 3 Usuarios, Menú QR" required />
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">Crear Plan</button>
    `;

    this.modalInstance = new Modal({
      title: 'Crear Nuevo Plan de Suscripción',
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
  submitNewPlan() {
    const form = this.modalInstance.$('#add-plan-form');
    if (!form || !form.reportValidity()) return;

    const name = this.modalInstance.$('#plan-name').value.trim();
    const price = Number(this.modalInstance.$('#plan-price').value);
    const description = this.modalInstance.$('#plan-desc').value.trim();
    const features = this.modalInstance.$('#plan-features').value.trim();

    const planId = name.toUpperCase().replace(/\s+/g, '_');
    const currentPlans = GlobalStore.getState().plans || [];

    // Avoid duplicates
    if (currentPlans.some(p => p.id === planId)) {
      alert('Ya existe un plan con un nombre similar.');
      return;
    }

    const updatedPlans = [
      ...currentPlans,
      { id: planId, name, price, description, features }
    ];

    GlobalStore.set({ plans: updatedPlans });
    NotificationService.success(`Plan "${name}" creado exitosamente.`);
    this.modalInstance.close();
  }

  /**
   * Opens the edit form modal with loaded plan credentials
   * @param {Object} plan 
   */
  openEditPlanModal(plan) {
    const formHTML = `
      <form id="edit-plan-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="edit-plan-name">Nombre del Plan</label>
            <input type="text" id="edit-plan-name" class="input input-md" value="${plan.name}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-plan-price">Precio Mensual ($ MXN)</label>
            <input type="number" id="edit-plan-price" class="input input-md" value="${plan.price}" min="0" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-plan-desc">Descripción del Plan</label>
          <textarea id="edit-plan-desc" class="input input-md" style="height: 80px; padding: var(--space-2); resize: none;" required>${plan.description}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-plan-features">Características (Separadas por comas)</label>
          <input type="text" id="edit-plan-features" class="input input-md" value="${plan.features}" required />
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-save-btn">Guardar Cambios</button>
    `;

    this.modalInstance = new Modal({
      title: `Editar Suscripción: ${plan.name}`,
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
  submitEditPlan(id) {
    const form = this.modalInstance.$('#edit-plan-form');
    if (!form || !form.reportValidity()) return;

    const name = this.modalInstance.$('#edit-plan-name').value.trim();
    const price = Number(this.modalInstance.$('#edit-plan-price').value);
    const description = this.modalInstance.$('#edit-plan-desc').value.trim();
    const features = this.modalInstance.$('#edit-plan-features').value.trim();

    const currentPlans = GlobalStore.getState().plans || [];
    const updatedPlans = currentPlans.map(p => {
      if (p.id === id) {
        return { ...p, name, price, description, features };
      }
      return p;
    });

    GlobalStore.set({ plans: updatedPlans });
    NotificationService.success(`Plan "${name}" actualizado.`);
    this.modalInstance.close();
  }

  unmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.layout.unmount();
    super.unmount();
  }
}