# ─── Ultra Administrador — ProGuard / R8 Rules ───────────────────────────────

# Keep Application, Activities, and WebView-related classes
-keep class com.ultraadmin.app.** { *; }

# Keep JavaScript interface (AndroidBridge) — methods called from JS cannot be obfuscated
-keepclassmembers class com.ultraadmin.app.MainActivity$AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface

# AndroidX WebKit
-keep class androidx.webkit.** { *; }
-dontwarn androidx.webkit.**

# AndroidX Core + AppCompat
-keep class androidx.core.** { *; }
-keep class androidx.appcompat.** { *; }

# Material Components
-keep class com.google.android.material.** { *; }
-dontwarn com.google.android.material.**

# SwipeRefreshLayout
-keep class androidx.swiperefreshlayout.widget.SwipeRefreshLayout { *; }

# FileProvider
-keep class androidx.core.content.FileProvider { *; }

# Kotlin metadata (required for reflection-free builds)
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Kotlin coroutines (if added later)
-dontwarn kotlinx.coroutines.**

# Keep Parcelable implementations
-keepclassmembers class * implements android.os.Parcelable {
    static ** CREATOR;
}

# Keep Serializable classes
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Suppress warnings for missing classes in dependencies
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn javax.annotation.**
