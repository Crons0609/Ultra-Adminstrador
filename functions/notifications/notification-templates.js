/**
 * @file notification-templates.js
 * @description Central templates definition mapping notification types to titles, bodies, channels, and target roles.
 */

const NOTIFICATION_TYPES = {
  NEW_ORDER: {
    channel: 'channel_orders',
    category: 'PEDIDOS',
    title: (data) => `Nuevo Pedido ${data.tableName ? '— ' + data.tableName : ''}`,
    body: (data) => `Nuevo pedido #${data.orderId || ''} por C$${data.total || 0}.`,
    roles: ['WAITER', 'CASHIER', 'KITCHEN', 'MANAGER', 'OWNER'],
    route: (data) => 'waiter/orders'
  },
  ORDER_STATUS: {
    channel: 'channel_orders',
    category: 'PEDIDOS',
    title: (data) => `Pedido ${data.statusText || 'Actualizado'}`,
    body: (data) => `El pedido #${data.orderId || ''} ha cambiado a: ${data.statusText || ''}`,
    roles: ['WAITER', 'CASHIER', 'MANAGER', 'OWNER'],
    route: (data) => 'waiter/orders'
  },
  NEW_SALE: {
    channel: 'channel_sales',
    category: 'VENTAS',
    title: (data) => `Nueva Venta Registrada`,
    body: (data) => `Venta por C$${data.total || 0} (${data.paymentMethod || 'Efectivo'})`,
    roles: ['CASHIER', 'MANAGER', 'OWNER'],
    route: (data) => 'cashier/payments'
  },
  LOW_STOCK: {
    channel: 'channel_inventory',
    category: 'INVENTARIO',
    title: (data) => `⚠️ Alerta de Stock Bajo`,
    body: (data) => `El producto "${data.productName || 'Producto'}" tiene solo ${data.quantity || 0} unidades disponibles.`,
    roles: ['MANAGER', 'OWNER'],
    route: (data) => 'inventory/products'
  },
  OUT_OF_STOCK: {
    channel: 'channel_inventory',
    category: 'INVENTARIO',
    title: (data) => `🚨 Producto Agotado`,
    body: (data) => `El producto "${data.productName || 'Producto'}" se ha agotado por completo.`,
    roles: ['MANAGER', 'OWNER', 'CASHIER'],
    route: (data) => 'inventory/products'
  },
  LEAVE_REQUEST: {
    channel: 'channel_hr',
    category: 'RRHH',
    title: (data) => `Nueva Solicitud de Permiso`,
    body: (data) => `${data.employeeName || 'Un empleado'} ha solicitado permiso / vacaciones.`,
    roles: ['MANAGER', 'OWNER'],
    route: (data) => 'hr/recruitment'
  },
  PAYMENT_RECEIVED: {
    channel: 'channel_finance',
    category: 'FINANZAS',
    title: (data) => `Pago Recibido`,
    body: (data) => `Se ha registrado un pago de C$${data.amount || 0} del cliente ${data.clientName || ''}.`,
    roles: ['CASHIER', 'MANAGER', 'OWNER'],
    route: (data) => 'owner/finance'
  },
  SYSTEM_ALERT: {
    channel: 'channel_system',
    category: 'SISTEMA',
    title: (data) => data.title || 'Aviso del Sistema',
    body: (data) => data.body || 'Notificación del sistema Ultra Administrador.',
    roles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    route: (data) => data.route || 'manager/dashboard'
  }
};

module.exports = { NOTIFICATION_TYPES };
