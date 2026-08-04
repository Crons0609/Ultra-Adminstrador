package com.ultraadmin.app

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.media.RingtoneManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Native Firebase Cloud Messaging Service — handles FCM token registration
 * and background/foreground push notification rendering.
 */
class UltraFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "UltraFCM"
        const val PREF_FCM_TOKEN = "ua_fcm_token"
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "🔑 New FCM Token generated: $token")

        // Save token locally so JavaScript bridge can fetch it at login
        getSharedPreferences("ultra_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_FCM_TOKEN, token)
            .apply()

        // Notify active MainActivity if running
        MainActivity.notifyNewFcmToken(token)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "📩 FCM Message received from: ${remoteMessage.from}")

        val data = remoteMessage.data
        val notification = remoteMessage.notification

        val title = data["title"] ?: notification?.title ?: "Ultra Administrador"
        val body  = data["body"]  ?: notification?.body  ?: "Nueva actualización recibida"
        val channelId = mapChannelId(data["channel"] ?: data["type"])
        val route = data["route"] ?: ""
        val documentId = data["documentId"] ?: ""
        val companyId  = data["companyId"]  ?: ""

        showNativeNotification(
            title = title,
            body = body,
            channelId = channelId,
            route = route,
            documentId = documentId,
            companyId = companyId,
        )
    }

    private fun showNativeNotification(
        title: String,
        body: String,
        channelId: String,
        route: String,
        documentId: String,
        companyId: String,
    ) {
        // Deep link intent: clicking notification opens MainActivity with route extra
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("route", route)
            putExtra("documentId", documentId)
            putExtra("companyId", companyId)
        }

        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        val pendingIntent = PendingIntent.getActivity(
            this,
            (System.currentTimeMillis() % 10000).toInt(),
            intent,
            flags
        )

        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setLargeIcon(BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setSound(defaultSoundUri)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(pendingIntent)

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notificationId = (System.currentTimeMillis() % 100000).toInt()

        notificationManager.notify(notificationId, builder.build())
    }

    private fun mapChannelId(typeOrChannel: String?): String {
        return when (typeOrChannel?.uppercase()) {
            "PEDIDOS", "ORDER", "NEW_ORDER", "ORDER_STATUS" -> UltraAdminApp.CHANNEL_ORDERS
            "VENTAS", "SALE", "NEW_SALE" -> UltraAdminApp.CHANNEL_SALES
            "INVENTARIO", "STOCK", "LOW_STOCK", "OUT_OF_STOCK" -> UltraAdminApp.CHANNEL_INVENTORY
            "MENSAJES", "CHAT", "MESSAGE" -> UltraAdminApp.CHANNEL_MESSAGES
            "FINANZAS", "FINANCE", "PAYMENT" -> UltraAdminApp.CHANNEL_FINANCE
            "RRHH", "HR", "LEAVE_REQUEST" -> UltraAdminApp.CHANNEL_HR
            else -> UltraAdminApp.CHANNEL_SYSTEM
        }
    }
}
