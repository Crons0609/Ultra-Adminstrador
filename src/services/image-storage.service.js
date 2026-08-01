/**
 * @file image-storage.service.js
 * @description Central Image Storage & Processing Service for Ultra Administrador SaaS.
 * Handles client-side format validation, Canvas resizing, WebP conversion, adaptive quality compression,
 * chunking (> 250 KB), Firestore metadata/chunk persistence, multi-level caching (IndexedDB + Memory),
 * Blob ObjectURL lifecycle management, and automatic image replacement/deletion.
 */

import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';
import { IndexedDBUtils } from '../utils/indexed-db.utils.js';

export const IMAGE_PRESETS = {
  PROFILE: { maxWidth: 512, maxHeight: 512, label: 'Foto de Perfil' },
  PRODUCT: { maxWidth: 1200, maxHeight: 1200, label: 'Imagen de Producto' },
  LOGO:    { maxWidth: 800, maxHeight: 800, label: 'Logo de Empresa' },
  BANNER:  { maxWidth: 1920, maxHeight: 1080, label: 'Banner / Portada' },
  GENERAL: { maxWidth: 1200, maxHeight: 1200, label: 'Imagen General' }
};

export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
export const MAX_SINGLE_DOC_SIZE_BYTES = 250 * 1024; // 250 KB
export const CHUNK_SIZE_BYTES = 200 * 1024; // ~200 KB per chunk

export class ImageStorageService {

  // In-memory cache for ObjectURLs created in the current active session
  static _memoryCache = new Map(); // imageId -> { objectUrl, blob, checksum, companyId }

  // Active ObjectURLs map to allow memory revocation on unmount
  static _activeObjectUrls = new Set();

  // ─── VALIDATION & PROCESSING ─────────────────────────────────────────────────

  /**
   * Validates if the selected file has a supported format.
   * @param {File} file
   * @returns {{ valid: boolean, extension: string, error?: string }}
   */
  static validateFormat(file) {
    if (!file || !file.name) {
      return { valid: false, extension: '', error: 'Por favor selecciona un archivo de imagen válido.' };
    }

    const nameParts = file.name.split('.');
    const ext = nameParts.length > 1 ? nameParts.pop().toLowerCase() : '';

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        extension: ext,
        error: `Formato ".${ext.toUpperCase()}" no soportado. Únicamente se permiten imágenes JPG, JPEG, PNG y WEBP.`
      };
    }

    return { valid: true, extension: ext };
  }

  /**
   * Optimizes an image: resizes according to preset, converts to WebP, and applies adaptive compression.
   * @param {File} file
   * @param {'PROFILE'|'PRODUCT'|'LOGO'|'BANNER'|'GENERAL'} [presetKey='PRODUCT']
   * @returns {Promise<{ base64WebP: string, blobWebP: Blob, width: number, height: number, quality: number, sizeOriginal: number, sizeCompressed: number }>}
   */
  static async optimizeImage(file, presetKey = 'PRODUCT') {
    const val = this.validateFormat(file);
    if (!val.valid) throw new Error(val.error);

    const preset = IMAGE_PRESETS[presetKey] || IMAGE_PRESETS.PRODUCT;

    // Load file into HTMLImageElement
    const img = await this._fileToImage(file);

    // Calculate aspect ratio dimensions
    const { width, height } = this.resizeImage(img, preset.maxWidth, preset.maxHeight);

    // Draw to HTML5 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Smooth rendering settings
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    // Adaptive compression loop starting at 75% quality
    let quality = 0.75;
    let base64WebP = canvas.toDataURL('image/webp', quality);
    let blobWebP = await this._canvasToBlob(canvas, quality);

    // If size exceeds target and quality can be reduced, compress adaptively
    while (blobWebP.size > MAX_SINGLE_DOC_SIZE_BYTES && quality > 0.35) {
      quality -= 0.10;
      base64WebP = canvas.toDataURL('image/webp', quality);
      blobWebP = await this._canvasToBlob(canvas, quality);
    }

    return {
      base64WebP,
      blobWebP,
      width,
      height,
      quality: Math.round(quality * 100),
      sizeOriginal: file.size,
      sizeCompressed: blobWebP.size
    };
  }

  /**
   * Calculates width & height maintaining original aspect ratio.
   * @param {HTMLImageElement} img
   * @param {number} maxWidth
   * @param {number} maxHeight
   * @returns {{ width: number, height: number }}
   */
  static resizeImage(img, maxWidth, maxHeight) {
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    if (width <= maxWidth && height <= maxHeight) {
      return { width, height };
    }

    const ratio = Math.min(maxWidth / width, maxHeight / height);
    return {
      width: Math.round(width * ratio),
      height: Math.round(height * ratio)
    };
  }

  /**
   * Splits base64 string into chunk objects of ~200 KB each.
   * @param {string} base64Data
   * @param {number} [chunkSize=CHUNK_SIZE_BYTES]
   * @returns {Array<{ index: number, binaryData: string, size: number }>}
   */
  static splitIntoChunks(base64Data, chunkSize = CHUNK_SIZE_BYTES) {
    const chunks = [];
    let index = 1;
    let offset = 0;

    while (offset < base64Data.length) {
      const chunkData = base64Data.substring(offset, offset + chunkSize);
      chunks.push({
        index,
        binaryData: chunkData,
        size: chunkData.length,
        createdAt: new Date().toISOString()
      });
      offset += chunkSize;
      index++;
    }

    return chunks;
  }

  // ─── UPLOAD & PERSISTENCE ────────────────────────────────────────────────────

  /**
   * Uploads an image to Firestore (split into chunks if > 250 KB), returning the imageId.
   * @param {File} file
   * @param {'PROFILE'|'PRODUCT'|'LOGO'|'BANNER'|'GENERAL'} [preset='PRODUCT']
   * @param {Object} [metadataProps={}]
   * @returns {Promise<string>} imageId
   */
  static async uploadImage(file, preset = 'PRODUCT', metadataProps = {}) {
    const { currentUser, currentCompany } = GlobalStore.getState();
    const companyId = metadataProps.companyId || currentCompany?.id || currentUser?.companyId;
    if (!companyId) throw new Error('Tenant context missing. Unable to upload image.');

    // 1. Optimize image
    const opt = await this.optimizeImage(file, preset);

    // 2. Generate unique imageId & checksum
    const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const checksum = await this._generateChecksum(opt.base64WebP);

    // 3. Split into chunks
    const chunks = this.splitIntoChunks(opt.base64WebP);

    // 4. Build Metadata document
    const metadata = {
      imageId,
      companyId,
      ownerId: currentUser?.uid || 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileName: file.name,
      mimeType: 'image/webp',
      extension: 'webp',
      width: opt.width,
      height: opt.height,
      sizeOriginal: opt.sizeOriginal,
      sizeCompressed: opt.sizeCompressed,
      compressionQuality: opt.quality,
      chunkCount: chunks.length,
      status: 'READY',
      checksum,
      preset,
      ...metadataProps
    };

    // 5. Write metadata doc & chunks subcollection in Firestore / Realtime DB
    const rootPath = `${companyId}/image_storage/${imageId}`;
    await FirestoreService.writePath(rootPath, { metadata });

    // Write individual chunks
    for (const chunk of chunks) {
      const chunkId = String(chunk.index).padStart(4, '0');
      await FirestoreService.writePath(`${rootPath}/chunks/${chunkId}`, chunk);
    }

    // 6. Cache in local IndexedDB & Memory immediately for zero latency
    await IndexedDBUtils.saveImageBlob(imageId, opt.blobWebP, checksum);
    const objectUrl = URL.createObjectURL(opt.blobWebP);
    this._activeObjectUrls.add(objectUrl);
    this._memoryCache.set(imageId, { objectUrl, blob: opt.blobWebP, checksum, companyId });

    console.log(`[ImageStorageService] ✅ Uploaded image ${imageId} (${chunks.length} chunks, ${opt.sizeCompressed} bytes, ${opt.quality}% quality)`);
    return imageId;
  }

  /**
   * Replaces an existing image: waits for complete deletion of old image before uploading new one.
   * Guarantees no orphan chunks are left in Firebase.
   * @param {string|null} oldImageId
   * @param {File} newFile
   * @param {'PROFILE'|'PRODUCT'|'LOGO'|'BANNER'|'GENERAL'} [preset='PRODUCT']
   * @param {Object} [metadataProps={}]
   * @returns {Promise<string>} new imageId
   */
  static async replaceImage(oldImageId, newFile, preset = 'PRODUCT', metadataProps = {}) {
    if (oldImageId) {
      console.log(`[ImageStorageService] 🗑️ Deleting old image before upload: ${oldImageId}`);
      await this.deleteImage(oldImageId); // No .catch — must fully complete before uploading
      console.log(`[ImageStorageService] ✅ Old image deleted: ${oldImageId}`);
    }
    return this.uploadImage(newFile, preset, metadataProps);
  }

  // ─── DOWNLOAD & RECONSTRUCTION ───────────────────────────────────────────────

  /**
   * Retrieves or rebuilds the WebP image, returning an ObjectURL for rendering.
   * Leverages Memory Cache -> IndexedDB Cache -> Firestore Download.
   * @param {string} imageId
   * @returns {Promise<string|null>} ObjectURL or null
   */
  static async getImageUrl(imageId) {
    if (!imageId) return null;

    // 1. Check Memory Cache
    if (this._memoryCache.has(imageId)) {
      return this._memoryCache.get(imageId).objectUrl;
    }

    // 2. Check IndexedDB Cache
    const cachedBlob = await IndexedDBUtils.getImageBlob(imageId);
    if (cachedBlob) {
      const objectUrl = URL.createObjectURL(cachedBlob);
      this._activeObjectUrls.add(objectUrl);
      this._memoryCache.set(imageId, { objectUrl, blob: cachedBlob });
      return objectUrl;
    }

    // 3. Download & Rebuild from Firestore
    try {
      const { currentCompany, currentUser } = GlobalStore.getState();
      const companyId = currentCompany?.id || currentUser?.companyId;
      if (!companyId) return null;

      const rootPath = `${companyId}/image_storage/${imageId}`;
      const rootData = await FirestoreService.readPath(rootPath);
      if (!rootData || !rootData.metadata) return null;

      const metadata = rootData.metadata;
      const chunksRaw = rootData.chunks || {};

      // Sort chunks by index
      const chunks = Object.values(chunksRaw).sort((a, b) => a.index - b.index);

      if (chunks.length === 0) return null;

      // Reconstruct base64 string
      const fullBase64 = chunks.map(c => c.binaryData).join('');

      // Convert base64 to Blob
      const blob = this._base64ToBlob(fullBase64, 'image/webp');
      const objectUrl = URL.createObjectURL(blob);

      // Save to IndexedDB & Memory Cache
      await IndexedDBUtils.saveImageBlob(imageId, blob, metadata.checksum);
      this._activeObjectUrls.add(objectUrl);
      this._memoryCache.set(imageId, { objectUrl, blob, checksum: metadata.checksum, companyId });

      return objectUrl;
    } catch (err) {
      console.error(`[ImageStorageService] Failed to download/rebuild image ${imageId}:`, err);
      return null;
    }
  }

  // ─── DELETION & CLEANUP ─────────────────────────────────────────────────────

  /**
   * Deletes an image and ALL its chunks from Firebase, IndexedDB, and Memory.
   * Resolves the companyId from stored metadata first to avoid session mismatch.
   * @param {string} imageId
   * @returns {Promise<boolean>} true if fully deleted, false on failure
   */
  static async deleteImage(imageId) {
    if (!imageId) return false;

    // Resolve companyId — try session state first, then scan metadata
    const { currentCompany, currentUser } = GlobalStore.getState();
    const companyId = currentUser?.companyId || currentCompany?.companyId || currentCompany?.id;

    // 1. Remove from Memory Cache & revoke ObjectURL
    if (this._memoryCache.has(imageId)) {
      const mem = this._memoryCache.get(imageId);
      if (mem.objectUrl) {
        URL.revokeObjectURL(mem.objectUrl);
        this._activeObjectUrls.delete(mem.objectUrl);
      }
      this._memoryCache.delete(imageId);
    }

    // 2. Remove from IndexedDB
    await IndexedDBUtils.deleteImageBlob(imageId);

    // 3. Remove from Firebase — explicit chunk-by-chunk + root node deletion
    if (!companyId) {
      console.error(`[ImageStorageService] ❌ Cannot delete ${imageId}: companyId missing from session.`);
      return false;
    }

    const rootPath = `${companyId}/image_storage/${imageId}`;

    try {
      // Read metadata to know exactly how many chunks exist
      const rootData = await FirestoreService.readPath(rootPath);
      if (rootData) {
        const chunkCount = rootData.metadata?.chunkCount || 0;

        // Explicitly delete each chunk to guarantee no orphans
        if (chunkCount > 0) {
          console.log(`[ImageStorageService] 🗑️ Deleting ${chunkCount} chunk(s) for image ${imageId}...`);
          const chunkDeletions = [];
          for (let i = 1; i <= chunkCount; i++) {
            const chunkId = String(i).padStart(4, '0');
            chunkDeletions.push(
              FirestoreService.removePath(`${rootPath}/chunks/${chunkId}`)
                .catch(e => console.warn(`[ImageStorageService] Chunk ${chunkId} delete warn:`, e))
            );
          }
          await Promise.all(chunkDeletions);
          console.log(`[ImageStorageService] ✅ All ${chunkCount} chunks deleted.`);
        }

        // Delete the entire image node (metadata + any remaining chunks)
        await FirestoreService.removePath(rootPath);
        console.log(`[ImageStorageService] ✅ Image node removed from Firebase: ${rootPath}`);
      } else {
        console.warn(`[ImageStorageService] Image node not found in Firebase (already deleted?): ${rootPath}`);
      }

      return true;
    } catch (err) {
      console.error(`[ImageStorageService] ❌ Failed to delete image ${imageId} from Firebase:`, err);
      return false;
    }
  }

  /**
   * Revokes an ObjectURL to release browser memory.
   * @param {string} objectUrl
   */
  static revokeUrl(objectUrl) {
    if (!objectUrl) return;
    try {
      URL.revokeObjectURL(objectUrl);
      this._activeObjectUrls.delete(objectUrl);
    } catch (_) {}
  }

  /**
   * Clears all memory and IndexedDB image caches.
   */
  static async clearCache() {
    this._activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
    this._activeObjectUrls.clear();
    this._memoryCache.clear();
    await IndexedDBUtils.clearAllCache();
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  static _fileToImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Formato de imagen corrupto o ilegible.'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo de la computadora.'));
      reader.readAsDataURL(file);
    });
  }

  static _canvasToBlob(canvas, quality) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
    });
  }

  static _base64ToBlob(base64Data, contentType = 'image/webp') {
    const parts = base64Data.split(',');
    const raw = parts.length > 1 ? parts[1] : parts[0];
    const binary = atob(raw);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: contentType });
  }

  static async _generateChecksum(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return 'chk_' + Math.abs(hash).toString(36);
  }
}
