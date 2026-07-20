/**
 * @file routes.config.js
 * @description Complete SPA route definitions mapping paths to view classes and middleware guards.
 *
 * Route structure:
 * {
 *   path: string           — Hash path, supports :param notation
 *   view: Class            — View class extending Component
 *   middlewares: Function[] — Array of guard functions executed in order
 * }
 */

import { authGuard, roleGuard } from '../core/middleware.js';
import { USER_ROLES } from '../utils/constants.js';

// ─── Lazy view imports resolved at route activation time ─────────────────────
// Auth Module
const getLoginView = () => import('../modules/auth/views/login.view.js').then(m => m.LoginView);
const getForgotPasswordView = () => import('../modules/auth/views/forgot-password.view.js').then(m => m.ForgotPasswordView);

// Customer Module
const getCustomerMenuView = () => import('../modules/customer/views/menu.view.js').then(m => m.MenuView);
const getCustomerCartView = () => import('../modules/customer/views/cart.view.js').then(m => m.CartView);
const getOrderStatusView = () => import('../modules/customer/views/order-status.view.js').then(m => m.OrderStatusView);

// Waiter Module
const getWaiterTablesView = () => import('../modules/waiter/views/tables.view.js').then(m => m.TablesView);
const getWaiterOrdersView = () => import('../modules/waiter/views/orders.view.js').then(m => m.OrdersView);

// Kitchen Module
const getKDSView = () => import('../modules/kitchen/views/kds.view.js').then(m => m.KDSView);
const getKitchenStatsView = () => import('../modules/kitchen/views/stats.view.js').then(m => m.StatsView);

// Cashier Module
const getPOSView = () => import('../modules/cashier/views/pos.view.js').then(m => m.POSView);
const getPaymentsView = () => import('../modules/cashier/views/payments.view.js').then(m => m.PaymentsView);
const getCashRegisterView = () => import('../modules/cashier/views/cash-register.view.js').then(m => m.CashRegisterView);
const getInvoicesView = () => import('../modules/cashier/views/invoices.view.js').then(m => m.InvoicesView);
const getPromotionsView = () => import('../modules/cashier/views/promotions.view.js').then(m => m.PromotionsView);
const getArqueoView = () => import('../modules/cashier/views/arqueo.view.js').then(m => m.ArqueoView);

// Inventory Module
const getInventoryProductsView = () => import('../modules/inventory/views/products.view.js').then(m => m.ProductsView);
const getInventoryIngredientsView = () => import('../modules/inventory/views/ingredients.view.js').then(m => m.IngredientsView);
const getSuppliersView = () => import('../modules/inventory/views/suppliers.view.js').then(m => m.SuppliersView);
const getPurchasesView = () => import('../modules/inventory/views/purchases.view.js').then(m => m.PurchasesView);
const getInventoryAlertsView = () => import('../modules/inventory/views/alerts.view.js').then(m => m.AlertsView);

// Manager Module
const getManagerDashboardView = () => import('../modules/manager/views/dashboard.view.js').then(m => m.ManagerDashboardView);
const getManagerReportsView = () => import('../modules/manager/views/reports.view.js').then(m => m.ReportsView);
const getManagerEmployeesView = () => import('../modules/manager/views/employees.view.js').then(m => m.EmployeesView);
const getManagerQRCodesView = () => import('../modules/manager/views/qr-codes.view.js').then(m => m.QRCodesView);
const getVehiclesView = () => import('../modules/manager/views/vehicles.view.js').then(m => m.VehiclesView);
const getRentalsView = () => import('../modules/manager/views/rentals.view.js').then(m => m.RentalsView);
const getAppointmentsView = () => import('../modules/manager/views/appointments.view.js').then(m => m.AppointmentsView);
const getServiceRequestsView = () => import('../modules/manager/views/service-requests.view.js').then(m => m.ServiceRequestsView);
const getAssetsView = () => import('../modules/manager/views/assets.view.js').then(m => m.AssetsView);
const getToolsView = () => import('../modules/manager/views/tools.view.js').then(m => m.ToolsView);
const getSuppliesView = () => import('../modules/manager/views/supplies.view.js').then(m => m.SuppliesView);
const getScanHistoryView = () => import('../modules/manager/views/scan-history.view.js').then(m => m.ScanHistoryView);

// Public Catalog & Settings Views
const getPublicCatalogView = () => import('../modules/customer/views/catalog.view.js').then(m => m.PublicCatalogView);
const getPublicProductDetailView = () => import('../modules/customer/views/product-detail.view.js').then(m => m.PublicProductDetailView);
const getCatalogSettingsView = () => import('../modules/manager/views/catalog-settings.view.js').then(m => m.CatalogSettingsView);

// Owner Module
const getOwnerFinanceView = () => import('../modules/owner/views/finance.view.js').then(m => m.FinanceView);
const getOwnerExpensesView = () => import('../modules/owner/views/expenses.view.js').then(m => m.ExpensesView);
const getOwnerProjectionsView = () => import('../modules/owner/views/projections.view.js').then(m => m.ProjectionsView);
const getOwnerBalanceView = () => import('../modules/owner/views/balance.view.js').then(m => m.BalanceView);

// Super Admin Module
const getSuperAdminCompaniesView = () => import('../modules/super-admin/views/companies.view.js').then(m => m.CompaniesView);
const getSuperAdminPlansView = () => import('../modules/super-admin/views/plans.view.js').then(m => m.PlansView);
const getSuperAdminMonitoringView = () => import('../modules/super-admin/views/monitoring.view.js').then(m => m.MonitoringView);
const getSuperAdminBillingView = () => import('../modules/super-admin/views/billing.view.js').then(m => m.BillingView);
const getSuperAdminLogsView = () => import('../modules/super-admin/views/logs.view.js').then(m => m.LogsView);
const getSuperAdminSettingsView = () => import('../modules/super-admin/views/settings.view.js').then(m => m.SettingsView);

// ─── Lazy Route Adapter ───────────────────────────────────────────────────────
/**
 * Wraps a lazy-loaded view getter in an adapter class that the router can instantiate.
 * @param {Function} getter - Async function returning the View class
 */
function lazyView(getter) {
  return class LazyViewAdapter {
    constructor(params) {
      this.params = params;
      this._instance = null;
      this._getter = getter;
    }

    async mount() {
      const ViewClass = await this._getter();
      this._instance = new ViewClass(this.params);
      return this._instance.mount();
    }

    render() { return ''; }

    unmount() {
      if (this._instance && typeof this._instance.unmount === 'function') {
        this._instance.unmount();
      }
    }
  };
}

// ─── Route Definitions ───────────────────────────────────────────────────────
export const ROUTES = [
  // Public / Auth routes
  { path: '/', view: lazyView(getLoginView), middlewares: [] },
  { path: '/login', view: lazyView(getLoginView), middlewares: [] },
  { path: '/forgot-password', view: lazyView(getForgotPasswordView), middlewares: [] },

  // Customer routes — accessed via QR code, no login needed (QR token auth in Phase 5)
  { path: '/customer/menu', view: lazyView(getCustomerMenuView), middlewares: [] },
  { path: '/customer/menu/:companyId/:branchId/:tableId', view: lazyView(getCustomerMenuView), middlewares: [] },
  { path: '/customer/cart', view: lazyView(getCustomerCartView), middlewares: [] },
  { path: '/customer/order-status', view: lazyView(getOrderStatusView), middlewares: [] },

  // Waiter routes
  { path: '/waiter/tables', view: lazyView(getWaiterTablesView), middlewares: [roleGuard([USER_ROLES.WAITER, USER_ROLES.MANAGER])] },
  { path: '/waiter/orders', view: lazyView(getWaiterOrdersView), middlewares: [roleGuard([USER_ROLES.WAITER, USER_ROLES.MANAGER])] },

  // Kitchen routes
  { path: '/kitchen/kds', view: lazyView(getKDSView), middlewares: [roleGuard([USER_ROLES.KITCHEN, USER_ROLES.MANAGER])] },
  { path: '/kitchen/stats', view: lazyView(getKitchenStatsView), middlewares: [roleGuard([USER_ROLES.KITCHEN, USER_ROLES.MANAGER])] },

  // Cashier routes
  { path: '/cashier/pos', view: lazyView(getPOSView), middlewares: [roleGuard([USER_ROLES.CASHIER, USER_ROLES.MANAGER])] },
  { path: '/cashier/payments', view: lazyView(getPaymentsView), middlewares: [roleGuard([USER_ROLES.CASHIER, USER_ROLES.MANAGER])] },
  { path: '/cashier/cash-register', view: lazyView(getCashRegisterView), middlewares: [roleGuard([USER_ROLES.CASHIER, USER_ROLES.MANAGER])] },
  { path: '/cashier/invoices', view: lazyView(getInvoicesView), middlewares: [roleGuard([USER_ROLES.CASHIER, USER_ROLES.MANAGER])] },
  { path: '/cashier/promotions', view: lazyView(getPromotionsView), middlewares: [roleGuard([USER_ROLES.CASHIER, USER_ROLES.MANAGER])] },
  { path: '/cashier/arqueo', view: lazyView(getArqueoView), middlewares: [roleGuard([USER_ROLES.CASHIER, USER_ROLES.MANAGER])] },

  // Inventory routes
  { path: '/inventory/products', view: lazyView(getInventoryProductsView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/inventory/ingredients', view: lazyView(getInventoryIngredientsView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/inventory/suppliers', view: lazyView(getSuppliersView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/inventory/purchases', view: lazyView(getPurchasesView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/inventory/alerts', view: lazyView(getInventoryAlertsView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },

  // Manager routes
  { path: '/manager/dashboard', view: lazyView(getManagerDashboardView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/manager/reports', view: lazyView(getManagerReportsView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/manager/employees', view: lazyView(getManagerEmployeesView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/manager/qr-codes', view: lazyView(getManagerQRCodesView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/manager/catalog-settings', view: lazyView(getCatalogSettingsView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  // Rubro-specific routes
  { path: '/manager/vehicles', view: lazyView(getVehiclesView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/manager/rentals', view: lazyView(getRentalsView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/manager/appointments', view: lazyView(getAppointmentsView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/manager/service-requests', view: lazyView(getServiceRequestsView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/manager/assets', view: lazyView(getAssetsView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/manager/tools', view: lazyView(getToolsView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/manager/supplies', view: lazyView(getSuppliesView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },
  { path: '/manager/scan-history', view: lazyView(getScanHistoryView), middlewares: [roleGuard([USER_ROLES.MANAGER, USER_ROLES.OWNER])] },

  // Owner routes
  { path: '/owner/finance', view: lazyView(getOwnerFinanceView), middlewares: [roleGuard([USER_ROLES.OWNER])] },
  { path: '/owner/expenses', view: lazyView(getOwnerExpensesView), middlewares: [roleGuard([USER_ROLES.OWNER])] },
  { path: '/owner/projections', view: lazyView(getOwnerProjectionsView), middlewares: [roleGuard([USER_ROLES.OWNER])] },
  { path: '/owner/balance', view: lazyView(getOwnerBalanceView), middlewares: [roleGuard([USER_ROLES.OWNER])] },

  // Super Admin routes
  { path: '/super-admin/companies', view: lazyView(getSuperAdminCompaniesView), middlewares: [roleGuard([USER_ROLES.SUPER_ADMIN])] },
  { path: '/super-admin/plans', view: lazyView(getSuperAdminPlansView), middlewares: [roleGuard([USER_ROLES.SUPER_ADMIN])] },
  { path: '/super-admin/monitoring', view: lazyView(getSuperAdminMonitoringView), middlewares: [roleGuard([USER_ROLES.SUPER_ADMIN])] },
  { path: '/super-admin/billing', view: lazyView(getSuperAdminBillingView), middlewares: [roleGuard([USER_ROLES.SUPER_ADMIN])] },
  { path: '/super-admin/logs', view: lazyView(getSuperAdminLogsView), middlewares: [roleGuard([USER_ROLES.SUPER_ADMIN])] },
  { path: '/super-admin/settings', view: lazyView(getSuperAdminSettingsView), middlewares: [roleGuard([USER_ROLES.SUPER_ADMIN])] },

  // Public Catalog dynamic wildcard route (Keep at the very bottom)
  { path: '/:companyId', view: lazyView(getPublicCatalogView), middlewares: [] },
  { path: '/:companyId/producto/:productId', view: lazyView(getPublicProductDetailView), middlewares: [] },
];
