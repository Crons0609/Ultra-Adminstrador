/**
 * @file sidebar.js
 * @description Premium sidebar navigation with grouped sections, company branding, and role-based menus.
 * Module visibility is automatically determined by the company's business type via getModuleGuards().
 */

import { Component } from '../../core/component.js';
import { GlobalStore } from '../../core/state.js';
import { AuthService } from '../../services/auth.service.js';
import { getModuleGuards, getBusinessCategory } from '../../config/business-types.config.js';
import { MODULE_REGISTRY, isModuleEnabled } from '../../config/modules.config.js';
import { isProgrammerRole } from '../../core/middleware.js';
import { db } from '../../config/firebase.config.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { I18nService } from '../../services/i18n.service.js';

export class Sidebar extends Component {
  constructor(props = {}) {
    super(props);
    I18nService.subscribe(() => {
      const el = document.getElementById('sidebar');
      if (el) {
        window.dispatchEvent(new Event('hashchange'));
      }
    });
  }

  getMenuConfig(role) {
    const { currentCompany } = GlobalStore.getState();
    const cfg = currentCompany?.config || {};

    // Compute automatic guards from business type (fallback to rubro/type/name), then merge with super-admin cfg overrides.
    const bType = currentCompany?.businessType || currentCompany?.rubro || currentCompany?.type || currentCompany?.category || currentCompany?.name || '';
    const category = getBusinessCategory(bType);
    const autoGuards = getModuleGuards(bType);
    const guards = { ...autoGuards, ...cfg };

    // Helper: build menu items filtered by their module guard
    const guardedItem = (label, path, icon, guard = true) => guard ? [{ label, path, icon }] : [];

    // Common SVG icons shorthand
    const icons = {
      dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
      employees: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      inventory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
      qr: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>`,
      globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      reports: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>`,
      kds: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
      car: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/><path d="M5 9l1.5-4h11L19 9"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>`,
      calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
      inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
      tag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
      finance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
      expenses: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
      balance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><path d="m3 12 9-9 9 9"/><path d="M5 20a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8H5z"/></svg>`,
      projections: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
      recurringClients: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      receivable: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 8v8m-4-4h8"/></svg>`,
      payable: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 8v8m4-8l-8 8"/></svg>`,
      services: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
      assets: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="12" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>`,
      tools: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
      supplies: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12M12 3v11M9 12h6M5 21h14c1 0 2-1 2-2L16 8V3H8v5L3 19c0 1 2-1 2-2z"/></svg>`,
      history: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
      telegram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
      reminders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><circle cx="18" cy="4" r="3" fill="var(--color-danger)"/></svg>`,
      creditSystem: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><line x1="6" y1="16" x2="10" y2="16"/><line x1="14" y1="16" x2="18" y2="16"/></svg>`,
      migration: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
      settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    };

    const menus = {
      SUPER_ADMIN: {
        groups: [
          {
            label: I18nService.t('nav_platform'),
            items: [
              { label: I18nService.t('nav_companies'), path: '#/super-admin/companies', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>` },
              { label: I18nService.t('nav_user_management'), path: '#/super-admin/users', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` },
              { label: I18nService.t('nav_monitoring'), path: '#/super-admin/monitoring', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>` },
              { label: I18nService.t('nav_plans'), path: '#/super-admin/plans', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>` },
              { label: I18nService.t('nav_billing'), path: '#/super-admin/billing', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>` },
              { label: I18nService.t('nav_support'), path: '#/super-admin/support', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`, badgeId: 'sidebar-support-badge' },
              { label: I18nService.t('nav_landing_editor'), path: '#/super-admin/landing', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>` },
            ]
          },
          {
            label: I18nService.t('nav_system'),
            items: [
              { label: I18nService.t('nav_system_logs'), path: '#/super-admin/logs', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>` },
              { label: I18nService.t('nav_settings'), path: '#/super-admin/settings', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>` },
            ]
          }
        ]
      },
      OWNER: {
        groups: (() => {
          // Filter MODULE_REGISTRY by company's enabled modules and generate dynamic groups
          const enabledModules = MODULE_REGISTRY.filter(m =>
            m.allowedRoles.includes('OWNER') && isModuleEnabled(currentCompany, m.id)
          );

          // 4 Canonical Accordion Categories Order with Icons
          const categoryOrder = ['General', 'Finanzas', 'Operaciones', 'Automatización'];
          const categoryLabels = {
            'General':        I18nService.t('nav_general'),
            'Finanzas':       I18nService.t('nav_finance'),
            'Operaciones':    I18nService.t('nav_operations'),
            'Automatización': I18nService.t('nav_automation'),
          };
          const categoryIcons = {
            'General': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
            'Finanzas': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
            'Operaciones': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
            'Automatización': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>`
          };


          const categories = [];
          categoryOrder.forEach(cat => {
            if (enabledModules.some(m => m.category === cat)) {
              categories.push(cat);
            }
          });
          enabledModules.forEach(m => {
            if (m.category && !categories.includes(m.category)) {
              categories.push(m.category);
            }
          });

          const getModuleName = (m) => {
            const map = {
              dashboard: 'nav_dashboard',
              employees: 'nav_employees',
              inventory: 'nav_inventory',
              invoiceScanner: 'nav_invoice_scanner',
              migration: 'nav_migration',
              assets: 'nav_assets',
              scanHistory: 'nav_scan_history',
              qrCodes: 'nav_qr_codes',
              specialPrices: 'nav_special_pricing',
              publicPage: 'nav_public_page',
              settings: 'nav_settings',
              branches: 'nav_branches',
              warehouse: 'nav_warehouse',
              expenses: 'nav_expenses',
              balance: 'nav_balance',
              financialControl: 'nav_financial_control',
              accountsPayable: 'nav_payable',
              accountsReceivable: 'nav_receivable',
              projections: 'nav_projections',
              creditSystem: 'nav_credit_system',
              basicServices: 'nav_basic_services',
              supplierReminders: 'nav_supplier_reminders',
              pos: 'nav_pos',
              serviceRequests: 'nav_service_requests',
              recurringClients: 'nav_recurring_clients',
              paymentReminders: 'nav_payment_reminders',
              clientAssignments: 'ca_my_clients',
              tools: 'nav_tools',
              vehicles: 'nav_vehicles',
              rentals: 'nav_rentals',
              appointments: 'nav_appointments',
              whatsAppHub: 'nav_whatsapp',
              telegramHub: 'nav_telegram',
              catalogSettings: 'nav_catalog',
              workCalendar: 'nav_work_calendar'
            };
            const key = map[m.id];
            return key ? I18nService.t(key) : (I18nService.t(m.name) || m.name);
          };

          return categories
            .map(cat => ({
              label: categoryLabels[cat] || cat,
              icon: categoryIcons[cat] || '📦',
              items: enabledModules
                .filter(m => m.category === cat)
                .map(m => ({ label: getModuleName(m), path: m.path, icon: m.icon }))
            }))
            .filter(g => g.items.length > 0);
        })()
      },
      MANAGER: {
        groups: (() => {
          const enabledModules = MODULE_REGISTRY.filter(m =>
            m.allowedRoles.includes('MANAGER') && isModuleEnabled(currentCompany, m.id)
          );
          const getModuleName = (m) => {
            const map = {
              dashboard: 'nav_dashboard',
              employees: 'nav_employees',
              inventory: 'nav_inventory',
              invoiceScanner: 'nav_invoice_scanner',
              migration: 'nav_migration',
              assets: 'nav_assets',
              scanHistory: 'nav_scan_history',
              qrCodes: 'nav_qr_codes',
              specialPrices: 'nav_special_pricing',
              publicPage: 'nav_public_page',
              settings: 'nav_settings',
              branches: 'nav_branches',
              warehouse: 'nav_warehouse',
              expenses: 'nav_expenses',
              balance: 'nav_balance',
              financialControl: 'nav_financial_control',
              accountsPayable: 'nav_payable',
              accountsReceivable: 'nav_receivable',
              projections: 'nav_projections',
              creditSystem: 'nav_credit_system',
              basicServices: 'nav_basic_services',
              supplierReminders: 'nav_supplier_reminders',
              pos: 'nav_pos',
              serviceRequests: 'nav_service_requests',
              recurringClients: 'nav_recurring_clients',
              paymentReminders: 'nav_payment_reminders',
              clientAssignments: 'ca_my_clients',
              tools: 'nav_tools',
              vehicles: 'nav_vehicles',
              rentals: 'nav_rentals',
              appointments: 'nav_appointments',
              whatsAppHub: 'nav_whatsapp',
              telegramHub: 'nav_telegram',
              catalogSettings: 'nav_catalog',
              workCalendar: 'nav_work_calendar'
            };
            const key = map[m.id];
            return key ? I18nService.t(key) : (I18nService.t(m.name) || m.name);
          };
          const allItems = enabledModules.map(m => ({ label: getModuleName(m), path: m.path, icon: m.icon }));
          const opsLabel = I18nService.t('nav_operations');
          const opsIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
          return allItems.length > 0 ? [{ label: opsLabel, icon: opsIcon, items: allItems }] : [{ label: opsLabel, icon: opsIcon, items: [] }];
        })()
      },
      CASHIER: {
        groups: [
          {
            label: I18nService.t('pos_title'),
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
            items: [
              { label: I18nService.t('nav_pos'), path: '#/cashier/pos', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>` },
              { label: I18nService.t('nav_payments'), path: '#/cashier/payments', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>` },
              { label: I18nService.t('nav_cash_register'), path: '#/cashier/cash-register', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>` },
              { label: I18nService.t('arqueo_title'), path: '#/cashier/arqueo', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>` },
              { label: I18nService.t('nav_promotions'), path: '#/cashier/promotions', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>` },
              { label: I18nService.t('nav_invoices'), path: '#/cashier/invoices', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>` },
              { label: I18nService.t('nav_payment_reminders'), path: '#/owner/payment-reminders', icon: icons.reminders },
              ...(isModuleEnabled(currentCompany, 'workCalendar') ? [{ label: I18nService.t('nav_work_calendar'), path: '#/calendar/work-calendar', icon: icons.calendar }] : [])
            ]
          }
        ]
      },
      WAITER: {
        groups: [
          {
            label: I18nService.t('nav_operations'),
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
            items: [
              ...(guards.enableServiceRequests || category === 'SERVICIOS_PERSONALIZADOS'
                ? [{ label: I18nService.t('ca_my_clients'), path: '#/waiter/client-assignments', icon: icons.calendar }]
                : [{ label: I18nService.t('waiter_my_tables'), path: '#/waiter/tables', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>` }]
              ),
              ...(isModuleEnabled(currentCompany, 'workCalendar') ? [{ label: I18nService.t('nav_work_calendar'), path: '#/calendar/work-calendar', icon: icons.calendar }] : [])
            ]
          }
        ]
      },
      KITCHEN: {
        groups: [
          {
            label: I18nService.t('kds_stats'),
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
            items: [
              { label: I18nService.t('kds_title'), path: '#/kitchen/kds', icon: icons.kds },
              { label: I18nService.t('kds_stats'), path: '#/kitchen/stats', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>` },
              ...(isModuleEnabled(currentCompany, 'workCalendar') ? [{ label: I18nService.t('nav_work_calendar'), path: '#/calendar/work-calendar', icon: icons.calendar }] : [])
            ]
          }
        ]
      }
    };


    return menus[role] || { groups: [] };
  }

  getRoleLabel(role) {
    const labels = {
      SUPER_ADMIN: I18nService.t('sa_title'),
      OWNER: I18nService.t('emp_role_owner'),
      MANAGER: I18nService.t('emp_role_manager'),
      CASHIER: I18nService.t('emp_role_cashier'),
      WAITER: I18nService.t('emp_role_waiter'),
      KITCHEN: I18nService.t('emp_role_kitchen'),
    };
    return labels[role] || role;
  }

  getRoleBadgeColor(role) {
    const colors = {
      SUPER_ADMIN: '#7c75ff',
      OWNER: '#f59e0b',
      MANAGER: '#34d399',
      CASHIER: '#60a5fa',
      WAITER: '#f472b6',
      KITCHEN: '#fb923c',
    };
    return colors[role] || '#8b8c94';
  }

  render() {
    const { currentUser, activeRole, currentCompany } = GlobalStore.getState();
    const rawRole = activeRole || (currentUser ? currentUser.role : '');
    // Normalize programmer role aliases to SUPER_ADMIN for menu/label/color lookups
    const role = isProgrammerRole(rawRole, currentUser?.email) ? 'SUPER_ADMIN' : rawRole;
    const menuConfig = this.getMenuConfig(role);
    const currentHash = window.location.hash;

    const companyName = currentCompany
      ? (currentCompany.name || currentCompany.id || 'Mi Negocio')
      : (role === 'SUPER_ADMIN' ? 'Ultra Admin' : 'Mi Negocio');

    const roleLabel = this.getRoleLabel(role);
    const roleColor = this.getRoleBadgeColor(role);

    // Build grouped menu HTML with collapsible accordions
    let menuHTML = '';
    menuConfig.groups.forEach((group, index) => {
      // Check if any item in this group matches current hash route
      const hasActiveItem = group.items.some(item => 
        currentHash === item.path || currentHash.startsWith(item.path + '/')
      );

      // Auto expand if group has active route OR if there's only 1 group
      const isOpen = hasActiveItem || (menuConfig.groups.length === 1);

      menuHTML += `
        <div class="sidebar-group ${isOpen ? 'is-open' : ''}" data-group-index="${index}">
          <button class="sidebar-group-header" type="button" data-sidebar-toggle-group="${index}">
            ${group.icon ? `<span class="sidebar-group-icon">${group.icon}</span>` : ''}
            <span class="sidebar-group-label">${group.label}</span>
            <span class="sidebar-group-chevron">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </button>
          <div class="sidebar-group-items">
      `;

      group.items.forEach(item => {
        const isActive = currentHash === item.path || currentHash.startsWith(item.path + '/');
        const badgeHTML = item.badgeId 
          ? `<span id="${item.badgeId}" class="sidebar-item-badge" style="margin-left:auto; background:var(--color-error); color:#fff; font-size:0.65rem; font-weight:700; border-radius:10px; padding:1px 6px; display:${this._pendingTicketsCount > 0 ? 'inline-flex' : 'none'};">${this._pendingTicketsCount || 0}</span>`
          : '';

        menuHTML += `
          <a href="${item.path}" class="sidebar-item${isActive ? ' active' : ''}" title="${item.label}">
            <span class="sidebar-icon">${item.icon}</span>
            <span class="sidebar-item-label">${item.label}</span>
            ${badgeHTML}
            ${isActive ? '<span class="sidebar-active-indicator"></span>' : ''}
          </a>
        `;
      });

      menuHTML += `
          </div>
        </div>
      `;
    });

    const userName = currentUser ? currentUser.displayName : 'Cargando...';
    const userInitial = userName ? userName[0].toUpperCase() : 'U';
    const userEmail = currentUser ? currentUser.email : '';

    const companyLogo = (currentCompany && currentCompany.logo) ? currentCompany.logo : '/assets/logo_ultra_administrador.png';

    return `
      <aside class="sidebar" id="main-sidebar">
        <!-- Logo / Company Branding -->
        <div class="sidebar-brand">
          <div class="sidebar-brand-avatar" style="overflow: hidden; background: rgba(255,255,255,0.05); border: 1px solid ${roleColor}44; display: flex; align-items: center; justify-content: center; padding: 3px;">
            <img src="${companyLogo}" 
                 alt="${companyName}" 
                 style="width: 100%; height: 100%; object-fit: contain;" 
                 onerror="if(!this.dataset.tried){this.dataset.tried='1';this.src='assets/logo_ultra_administrador.png';}else if(this.dataset.tried==='1'){this.dataset.tried='2';this.src='logo_ultra_administrador.png';}else if(this.dataset.tried==='2'){this.dataset.tried='3';this.src='/logo_ultra_administrador.png';}" />
          </div>
          <div class="sidebar-brand-info">
            <span class="sidebar-brand-name">${companyName}</span>
            <span class="sidebar-brand-sub" style="color: ${roleColor};">${roleLabel}</span>
          </div>
        </div>

        <!-- Navigation Groups -->
        <nav class="sidebar-menu" id="sidebar-nav">
          ${menuHTML}
        </nav>

        <!-- ProLine System Rights Badge -->
        <div style="padding: 10px 16px; text-align: center; font-size: 0.65rem; color: var(--color-text-tertiary); opacity: 0.75; letter-spacing: 0.02em;">
          <span>Ultra Administrador &bull; <strong>ProLine System</strong></span>
        </div>
      </aside>
    `;
  }

  afterMount() {
    // Collapsible Group Accordion Toggle Click Handler
    this.$$('[data-sidebar-toggle-group]').forEach(headerBtn => {
      headerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const groupEl = headerBtn.closest('.sidebar-group');
        if (!groupEl) return;
        groupEl.classList.toggle('is-open');
      });
    });

    // Re-render active state & auto-expand parent group on hash change
    this._hashHandler = () => {
      const items = this.element?.querySelectorAll('.sidebar-item');
      const hash = window.location.hash;
      items?.forEach(el => {
        const href = el.getAttribute('href');
        const isActive = hash === href || (href && hash.startsWith(href + '/'));
        if (isActive) {
          el.classList.add('active');
          const group = el.closest('.sidebar-group');
          if (group) group.classList.add('is-open');
        } else {
          el.classList.remove('active');
        }
      });
    };
    if (this._hashHandler) window.removeEventListener('hashchange', this._hashHandler);
    window.addEventListener('hashchange', this._hashHandler);

    // Subscribe to GlobalStore changes so sidebar re-renders when company
    // info or role changes (e.g. after async session/company restore).
    if (this._unsubCompany) this._unsubCompany();
    if (this._unsubRole) this._unsubRole();
    this._unsubCompany = GlobalStore.subscribe('currentCompany', () => this.update());
    this._unsubRole   = GlobalStore.subscribe('activeRole',     () => this.update());

    // Support tickets realtime badge count listener
    const { currentUser, activeRole } = GlobalStore.getState();
    const rawRole = activeRole || (currentUser ? currentUser.role : '');
    // Trap wheel & touch scroll events inside sidebar menu so main page never scrolls
    const sidebarEl = this.element;
    if (sidebarEl) {
      const menuEl = sidebarEl.querySelector('.sidebar-menu');

      this._wheelHandler = (e) => {
        if (!menuEl) return;
        const delta = e.deltaY;
        menuEl.scrollTop += delta;
        e.preventDefault();
        e.stopPropagation();
      };
      sidebarEl.addEventListener('wheel', this._wheelHandler, { passive: false });

      let startY = 0;
      this._touchStartHandler = (e) => {
        if (e.touches && e.touches.length > 0) {
          startY = e.touches[0].clientY;
        }
      };
      this._touchMoveHandler = (e) => {
        if (!menuEl || !e.touches || e.touches.length === 0) return;
        const currentY = e.touches[0].clientY;
        const deltaY = startY - currentY;
        startY = currentY;
        menuEl.scrollTop += deltaY;
        e.preventDefault();
        e.stopPropagation();
      };

      sidebarEl.addEventListener('touchstart', this._touchStartHandler, { passive: true });
      sidebarEl.addEventListener('touchmove', this._touchMoveHandler, { passive: false });
    }
  }

  unmount() {
    if (this.element && this._wheelHandler) {
      this.element.removeEventListener('wheel', this._wheelHandler);
    }
    if (this.element && this._touchMoveHandler) {
      this.element.removeEventListener('touchmove', this._touchMoveHandler);
    }
    if (this._hashHandler) {
      window.removeEventListener('hashchange', this._hashHandler);
    }
    if (this._unsubCompany) this._unsubCompany();
    if (this._unsubRole)    this._unsubRole();
    if (this._unsubTickets) this._unsubTickets();
    super.unmount();
  }
}
