/**
 * @file branch-selector.js
 * @description Enterprise glassmorphic branch selector dropdown component for topbar/dashboard.
 * Displays grouped branches by city/state, allows switching context to "Todas las sucursales"
 * or a specific branch, and automatically hides if the company has only 1 branch.
 */

import { Component } from '../../core/component.js';
import { GlobalStore } from '../../core/state.js';
import { BranchService } from '../../services/branch.service.js';

export class BranchSelector extends Component {
  constructor(props = {}) {
    super(props);
    this._unsubStore = null;
  }

  render() {
    const { branches, selectedBranchId } = GlobalStore.getState();
    const list = branches || [];

    // Rule 7: Hide selector if company has only 1 branch
    if (list.length <= 1) {
      return `<div id="branch-selector-wrapper" style="display: none;"></div>`;
    }

    const grouped = BranchService.groupBranchesByCity(list);
    const isAll = selectedBranchId === 'all';
    const selectedBranch = list.find(b => b.id === selectedBranchId);

    const buttonLabel = isAll
      ? 'Todas las sucursales'
      : `${selectedBranch?.name || 'Sucursal'}`;

    let optionsHTML = `
      <option value="all"${isAll ? ' selected' : ''}>
        Todas las sucursales (${list.length})
      </option>
    `;

    Object.entries(grouped).forEach(([city, branchArr]) => {
      optionsHTML += `<optgroup label="${city}">`;
      branchArr.forEach(b => {
        const isSel = b.id === selectedBranchId ? ' selected' : '';
        optionsHTML += `<option value="${b.id}"${isSel}>${b.name} (${b.code || 'SUC'})</option>`;
      });
      optionsHTML += `</optgroup>`;
    });


    return `
      <div id="branch-selector-wrapper" class="branch-selector-container" style="display: flex; align-items: center; position: relative;">
        <div style="
          position: relative;
          display: flex;
          align-items: center;
          background: rgba(13, 17, 25, 0.88);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: var(--radius-full);
          padding: 3px 10px 3px 12px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35), 0 0 12px rgba(99, 102, 241, 0.1);
          transition: all 0.2s ease;
        ">
          <select id="branch-select-dropdown" style="
            background: transparent;
            border: none;
            color: #e2e8f0;
            font-size: 0.78rem;
            font-weight: 700;
            font-family: var(--font-sans);
            cursor: pointer;
            outline: none;
            padding-right: 4px;
            letter-spacing: 0.02em;
          ">
            ${optionsHTML}
          </select>
        </div>
      </div>
    `;
  }

  afterMount() {
    const select = this.$('#branch-select-dropdown');
    if (select) {
      select.addEventListener('change', (e) => {
        const newBranchId = e.target.value;
        BranchService.setSelectedBranch(newBranchId);
      });
    }

    if (!this._unsubStore) {
      const update = () => this.update();
      const unsubBranches = GlobalStore.subscribe('branches', update);
      const unsubSelected = GlobalStore.subscribe('selectedBranchId', update);
      // Return composite unsubscribe
      this._unsubStore = () => { unsubBranches(); unsubSelected(); };
    }
  }

  unmount() {
    if (this._unsubStore) {
      this._unsubStore();
      this._unsubStore = null;
    }
    super.unmount();
  }
}
