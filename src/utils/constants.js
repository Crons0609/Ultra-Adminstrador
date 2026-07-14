/**
 * @file constants.js
 * @description Application global constants, roles definitions, order status keys and configurations.
 */

export const USER_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  WAITER: 'WAITER',
  KITCHEN: 'KITCHEN',
  CUSTOMER: 'CUSTOMER'
};

export const ORDER_STATUS = {
  RECEIVED: 'RECEIVED',     // Recibido
  PREPARING: 'PREPARING',   // Preparando
  PAUSED: 'PAUSED',         // En pausa
  READY: 'READY',           // Listo
  DELIVERED: 'DELIVERED',   // Entregado
  CANCELLED: 'CANCELLED'    // Cancelado
};

export const PAYMENT_METHODS = {
  CASH: 'CASH',             // Efectivo
  CARD: 'CARD',             // Tarjeta (Débito/Crédito)
  TRANSFER: 'TRANSFER',     // Transferencia
  QR: 'QR',                 // Pago digital QR (ej. Spei, MercadoPago)
  MIXED: 'MIXED'            // Mixto (Efectivo + Tarjeta, etc)
};

export const NOTIFICATION_TYPES = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ERROR: 'ERROR'
};

export const MOVEMENT_TYPES = {
  IN: 'IN',                 // Entrada de inventario
  OUT: 'OUT',               // Salida de inventario (venta o pérdida)
  ADJUSTMENT: 'ADJUSTMENT'  // Ajuste físico
};
