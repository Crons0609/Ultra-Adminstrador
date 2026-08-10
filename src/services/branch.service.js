/**
 * @file branch.service.js
 * @description Centralized service for Multi-Branch management in Ultra Administrador.
 * Handles Firestore subscription to ${companyId}/branches, global state synchronization,
 * context switching ('all' vs specific branch), and backward compatibility for 1-branch companies.
 */

import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';

export class BranchService {
  static _activeUnsubscribe = null;

  /**
   * Initialize real-time listener for current company's branches.
   */
  static initBranchListener() {
    BranchService.stopBranchListener();

    const { currentUser, currentCompany } = GlobalStore.getState();
    const companyId = currentCompany?.id || currentUser?.companyId;

    if (!companyId) return;

    try {
      BranchService._activeUnsubscribe = FirestoreService.listenToTenant('branches', (rawBranches) => {
        let branchList = [];

        if (rawBranches && typeof rawBranches === 'object') {
          branchList = Object.entries(rawBranches).map(([id, val]) => ({
            id,
            ...val
          }));
        }

        const companyName = currentCompany?.name || 'Mi Negocio';

        // Backward compatibility: If no branches exist, inject default principal branch
        if (branchList.length === 0) {
          const defaultBranch = {
            id: 'principal',
            companyId,
            name: `${companyName} - Principal`,
            code: 'SUC-01',
            city: currentCompany?.city || currentCompany?.country || 'General',
            address: currentCompany?.address || 'Sucursal Principal',
            phone: currentCompany?.phone || '',
            status: 'ACTIVA',
            isDefault: true,
            createdAt: Date.now()
          };
          branchList = [defaultBranch];
        }

        // Restore selected branch from LocalStorage or fallback
        const storageKey = `ultra_selected_branch_${companyId}`;
        const savedBranchId = localStorage.getItem(storageKey);

        let activeBranchId = 'all';
        let activeBranchMode = 'all';

        if (branchList.length <= 1) {
          // Rule 7: Single branch -> hide selector, set exact branch ID
          activeBranchId = branchList[0].id;
          activeBranchMode = 'single';
        } else {
          // Multiple branches: validate savedBranchId
          if (savedBranchId && (savedBranchId === 'all' || branchList.some(b => b.id === savedBranchId))) {
            activeBranchId = savedBranchId;
            activeBranchMode = savedBranchId === 'all' ? 'all' : 'single';
          } else {
            activeBranchId = 'all';
            activeBranchMode = 'all';
          }
        }

        const selectedBranchObj = branchList.find(b => b.id === activeBranchId) || null;

        GlobalStore.set({
          branches: branchList,
          selectedBranchId: activeBranchId,
          selectedBranchMode: activeBranchMode,
          currentBranch: selectedBranchObj
        });

        console.log(`[BranchService] 🏢 Loaded ${branchList.length} branch(es). Active context: [${activeBranchId}] (${activeBranchMode})`);
      });
    } catch (e) {
      console.error('[BranchService] Failed to initialize branch listener:', e);
    }
  }

  /**
   * Stop active Firestore listener.
   */
  static stopBranchListener() {
    if (typeof BranchService._activeUnsubscribe === 'function') {
      BranchService._activeUnsubscribe();
      BranchService._activeUnsubscribe = null;
    }
  }

  /**
   * Switch the global active branch context.
   * @param {string} branchId - 'all' or specific branch ID
   */
  static setSelectedBranch(branchId) {
    const { branches, currentCompany, currentUser } = GlobalStore.getState();
    const companyId = currentCompany?.id || currentUser?.companyId;

    const list = branches || [];
    const isValid = branchId === 'all' || list.some(b => b.id === branchId);

    if (!isValid) return;

    const mode = branchId === 'all' ? 'all' : 'single';
    const branchObj = list.find(b => b.id === branchId) || null;

    if (companyId) {
      localStorage.setItem(`ultra_selected_branch_${companyId}`, branchId);
    }

    GlobalStore.set({
      selectedBranchId: branchId,
      selectedBranchMode: mode,
      currentBranch: branchObj
    });

    console.log(`[BranchService] 🔄 Global branch context switched to: [${branchId}] (${mode})`);
  }

  /**
   * Group branches by city / state for optgroup dropdown rendering.
   * @param {Array} branches
   * @returns {Object} { "León": [...], "Managua": [...] }
   */
  static groupBranchesByCity(branches = []) {
    const grouped = {};
    branches.forEach(b => {
      const city = (b.city || b.state || 'Otras Sucursales').trim();
      if (!grouped[city]) grouped[city] = [];
      grouped[city].push(b);
    });
    return grouped;
  }

  /**
   * Create a new branch in Firestore.
   */
  static async createBranch(branchData) {
    const { currentUser, currentCompany } = GlobalStore.getState();
    const companyId = currentCompany?.id || currentUser?.companyId;

    if (!companyId) throw new Error('Empresa no identificada.');

    const payload = {
      companyId,
      name: branchData.name || 'Nueva Sucursal',
      code: branchData.code || `SUC-${Math.floor(1000 + Math.random() * 9000)}`,
      city: branchData.city || 'General',
      state: branchData.state || '',
      country: branchData.country || 'Nicaragua',
      address: branchData.address || '',
      phone: branchData.phone || '',
      whatsapp: branchData.whatsapp || '',
      email: branchData.email || '',
      managerName: branchData.managerName || '',
      openingHours: branchData.openingHours || '08:00 AM',
      closingHours: branchData.closingHours || '06:00 PM',
      operatingDays: branchData.operatingDays || 'Lunes a Sábado',
      status: branchData.status || 'ACTIVA',
      notes: branchData.notes || '',
      modules: branchData.modules || {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const docId = await FirestoreService.create('branches', payload);
    return docId;
  }

  /**
   * Update an existing branch in Firestore.
   */
  static async updateBranch(branchId, updates) {
    const payload = {
      ...updates,
      updatedAt: Date.now()
    };
    await FirestoreService.update('branches', branchId, payload);
  }

  /**
   * Toggle branch active status (ACTIVA / INACTIVA).
   */
  static async toggleStatus(branchId, currentStatus) {
    const newStatus = currentStatus === 'ACTIVA' ? 'INACTIVA' : 'ACTIVA';
    await FirestoreService.update('branches', branchId, { status: newStatus, updatedAt: Date.now() });
  }

  /**
   * Fetch all employees associated with a specific branch ID.
   * @param {string} branchId
   * @returns {Promise<Array>}
   */
  static async getEmployeesByBranch(branchId) {
    const { currentUser, currentCompany } = GlobalStore.getState();
    const companyId = currentCompany?.id || currentUser?.companyId;
    if (!companyId || !branchId) return [];

    try {
      const allEmployees = await FirestoreService.query('employees') || [];
      return allEmployees.filter(emp => emp.branchId === branchId || emp.sucursalId === branchId);
    } catch (e) {
      console.warn('[BranchService] Failed to query branch employees:', e);
      return [];
    }
  }

  /**
   * Delete a branch with employee migration or purge handling.
   * @param {string} branchToDeleteId - ID of branch to delete
   * @param {Object} options - { targetBranchId?: string, deleteEmployees?: boolean }
   */
  static async deleteBranchWithEmployees(branchToDeleteId, options = {}) {
    const { targetBranchId, deleteEmployees = false } = options;
    const { selectedBranchId, branches } = GlobalStore.getState();

    // 1. Handle assigned employees
    const employees = await BranchService.getEmployeesByBranch(branchToDeleteId);
    if (employees.length > 0) {
      if (targetBranchId) {
        const targetBranch = (branches || []).find(b => b.id === targetBranchId);
        const targetName = targetBranch?.name || 'Sucursal Principal';
        
        // Reassign employees to new branch
        for (const emp of employees) {
          await FirestoreService.update('employees', emp.id, {
            branchId: targetBranchId,
            sucursalId: targetBranchId,
            branchName: targetName,
            updatedAt: Date.now()
          });
        }
        console.log(`[BranchService] 🚚 Reassigned ${employees.length} employee(s) to branch [${targetBranchId}].`);
      } else if (deleteEmployees) {
        // Delete employees from Firebase
        for (const emp of employees) {
          await FirestoreService.delete('employees', emp.id);
        }
        console.log(`[BranchService] 🗑️ Deleted ${employees.length} employee(s) associated with branch [${branchToDeleteId}].`);
      }
    }

    // 2. Delete branch document from Firestore
    await FirestoreService.delete('branches', branchToDeleteId);

    // 3. Reset active context if the deleted branch was selected
    if (selectedBranchId === branchToDeleteId) {
      BranchService.setSelectedBranch('all');
    }
  }

  /**
   * Legacy delete a branch from Firestore.
   */
  static async deleteBranch(branchId) {
    await BranchService.deleteBranchWithEmployees(branchId, { deleteEmployees: true });
  }
}

