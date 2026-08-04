package com.ultraadmin.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.webkit.WebView

/**
 * Application class — initializes global WebView state and native notification channels once at startup.
 */
class UltraAdminApp : Application() {

    companion object {
        const val CHANNEL_ORDERS    = "channel_orders"
        const val CHANNEL_SALES     = "channel_sales"
        const val CHANNEL_INVENTORY = "channel_inventory"
        const val CHANNEL_MESSAGES  = "channel_messages"
        const val CHANNEL_FINANCE   = "channel_finance"
        const val CHANNEL_HR        = "channel_hr"
        const val CHANNEL_SYSTEM    = "channel_system"
    }

    override fun onCreate() {
        super.onCreate()
        // Enable Chrome DevTools remote debugging for debug builds
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // Initialize Android 8.0+ Notification Channels
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val channels = listOf(
            NotificationChannel(
                CHANNEL_ORDERS,
                "Pedidos",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Notificaciones de nuevos pedidos, cambios de estado y entregas"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 150, 250)
            },
            NotificationChannel(
                CHANNEL_SALES,
                "Ventas",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Notificaciones de nuevas ventas y modificaciones"
            },
            NotificationChannel(
                CHANNEL_INVENTORY,
                "Inventario",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Alertas de stock bajo y productos agotados"
                enableVibration(true)
            },
            NotificationChannel(
                CHANNEL_MESSAGES,
                "Mensajes",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Mensajes directos y comunicación interna"
                enableVibration(true)
            },
            NotificationChannel(
                CHANNEL_FINANCE,
                "Finanzas",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Pagos recibidos, créditos vencidos y gastos"
            },
            NotificationChannel(
                CHANNEL_HR,
                "Recursos Humanos",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Solicitudes de vacaciones, permisos y marcajes de entrada/salida"
            },
            NotificationChannel(
                CHANNEL_SYSTEM,
                "Sistema y Alertas",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Actualizaciones importantes del sistema y alertas de seguridad"
                enableVibration(true)
            }
        )

        channels.forEach { manager.createNotificationChannel(it) }
    }
}
