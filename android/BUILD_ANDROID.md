# 📱 Guía: Compilar Ultra Administrador como APK / AAB

## Requisitos previos

| Herramienta | Versión mínima | Descarga |
|---|---|---|
| Android Studio | Ladybug 2024.2.1+ | developer.android.com/studio |
| JDK | 17 (incluido en Android Studio) | Incluido |
| Android SDK | API 35 (Android 15) | Instalar desde SDK Manager |
| Android Build Tools | 35.0.0 | Instalar desde SDK Manager |

---

## 1. Abrir el proyecto en Android Studio

1. Abre Android Studio
2. Selecciona **File → Open** (NO "New Project")
3. Navega a: `C:\Users\Cronos\Desktop\Ultra-Adminstrador\android`
4. Haz clic en **OK**
5. Espera el **Gradle Sync** (primera vez: 5-10 min, descarga dependencias)
6. Verás el mensaje **"Gradle sync finished"** cuando esté listo

> Si Gradle Sync falla con "SDK not found":
> - Ve a `File → Project Structure → SDK Location`
> - Establece la ruta del Android SDK (normalmente `C:\Users\TuUsuario\AppData\Local\Android\Sdk`)

---

## 2. Configurar la URL del SaaS

Abre y edita la línea ~50 de:
`android/app/src/main/java/com/ultraadmin/app/MainActivity.kt`

```kotlin
// Cambia esto por tu URL real de Firebase Hosting:
const val SAAS_URL = "https://ultra-administrador.web.app"
```

También actualiza el host en `AndroidManifest.xml` (líneas ~60-70):
```xml
<data android:scheme="https" android:host="TU-PROYECTO.web.app" />
```

---

## 3. Compilar APK de Debug (prueba rápida)

En Android Studio: `Build → Build APK(s)`

O desde terminal en la carpeta `android/`:
```bat
gradlew.bat assembleDebug
```

APK generado en:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

Instalar en dispositivo con ADB:
```bat
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 4. Generar Keystore para firma de producción

> IMPORTANTE: Guarda el .jks en lugar seguro. Sin él, no podrás actualizar en Google Play.

```powershell
keytool -genkey -v `
  -keystore ultra-admin-release.jks `
  -alias ultra-admin-key `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -dname "CN=Ultra Administrador, O=ProLine System, C=MX"
```

Copia el `.jks` a: `android/app/keystore/ultra-admin-release.jks`

---

## 5. Configurar firma de Release

Edita `android/app/build.gradle`, bloque `signingConfigs.create("release")`:

```kotlin
create("release") {
    storeFile     = file("keystore/ultra-admin-release.jks")
    storePassword = "TU_STORE_PASSWORD"
    keyAlias      = "ultra-admin-key"
    keyPassword   = "TU_KEY_PASSWORD"
}
```

---

## 6. Compilar APK Release

```bat
gradlew.bat assembleRelease
```

Salida: `android/app/build/outputs/apk/release/app-release.apk`

---

## 7. Compilar Android App Bundle (AAB) — para Google Play

```bat
gradlew.bat bundleRelease
```

Salida: `android/app/build/outputs/bundle/release/app-release.aab`

> Google Play requiere AAB (no APK) para nuevas apps desde agosto 2021.

---

## 8. Depurar WebView con Chrome DevTools

Con app en modo Debug + dispositivo conectado por USB:

1. Abre Chrome en PC
2. Navega a `chrome://inspect/#devices`
3. Verás "Ultra Administrador" — clic **Inspect**
4. DevTools completo igual que en navegador

---

## 9. Estructura de archivos creados

```
android/
├── settings.gradle
├── build.gradle
├── gradle.properties
├── gradlew.bat
├── gradle/
│   ├── wrapper/gradle-wrapper.properties   (Gradle 8.11.1)
│   └── libs.versions.toml                  (AGP 8.7.3, Kotlin 2.0.21)
└── app/
    ├── build.gradle                        (compileSdk 35, minSdk 26)
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/ultraadmin/app/
        │   ├── UltraAdminApp.kt
        │   ├── SplashActivity.kt
        │   └── MainActivity.kt
        └── res/
            ├── layout/activity_splash.xml + activity_main.xml
            ├── values/colors.xml + strings.xml + styles.xml
            ├── values-night/styles.xml
            ├── xml/network_security_config.xml + file_paths.xml
            ├── drawable/splash_background.xml
            └── mipmap-*/ic_launcher*.png
```

---

## 10. Troubleshooting

| Error | Solución |
|---|---|
| `SDK location not found` | File → Project Structure → SDK Location |
| `Gradle sync: connection timed out` | Verificar conexión a Internet |
| `ERR_CLEARTEXT_NOT_PERMITTED` | La URL debe ser `https://` no `http://` |
| `White screen en WebView` | Verifica que el SaaS esté desplegado y la URL sea correcta |
| `App crashes on launch` | Revisar Logcat con filtro `com.ultraadmin.app` |
| Splash no aparece / pantalla negra | Confirmar que la URL en MainActivity.kt sea accesible |
