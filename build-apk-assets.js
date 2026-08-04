/**
 * @file build-apk-assets.js
 * @description Bundles all web resources into android/app/src/main/assets/
 * so the APK can run completely offline-first with exact root paths.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const ASSETS_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((child) => {
      copyRecursive(path.join(src, child), path.join(dest, child));
    });
  } else {
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

console.log('📦 Empaquetando recursos web para Android APK...');

// Clean destination assets folder (except keeping any non-web Android assets if any)
if (fs.existsSync(ASSETS_DIR)) {
  fs.rmSync(ASSETS_DIR, { recursive: true, force: true });
}
fs.mkdirSync(ASSETS_DIR, { recursive: true });

// 1. Copy public/ contents to root of assets/ (index.html, sw.js, manifest.json, etc.)
console.log(' └─ Copiando public/* -> assets/');
copyRecursive(path.join(ROOT_DIR, 'public'), ASSETS_DIR);

// 2. Copy src/ contents to assets/src/
console.log(' └─ Copiando src/* -> assets/src/');
copyRecursive(path.join(ROOT_DIR, 'src'), path.join(ASSETS_DIR, 'src'));

// 3. Copy assets/ contents to assets/assets/
if (fs.existsSync(path.join(ROOT_DIR, 'assets'))) {
  console.log(' └─ Copiando assets/* -> assets/assets/');
  copyRecursive(path.join(ROOT_DIR, 'assets'), path.join(ASSETS_DIR, 'assets'));
}

console.log('✅ Empaquetado completado en android/app/src/main/assets/');
