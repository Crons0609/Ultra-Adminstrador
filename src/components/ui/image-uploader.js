/**
 * @file image-uploader.js
 * @description Drag & Drop Image Uploader UI Component with live preview,
 * preset selection, format validation and ImageStorageService integration.
 */

import { Component } from '../../core/component.js';
import { ImageStorageService, IMAGE_PRESETS } from '../../services/image-storage.service.js';
import { NotificationService } from '../../services/notification.service.js';

export class ImageUploader extends Component {
  /**
   * @param {Object} props
   * @param {'PROFILE'|'PRODUCT'|'LOGO'|'BANNER'|'GENERAL'} [props.preset='PRODUCT']
   * @param {string|null} [props.currentImageId]
   * @param {Function} [props.onImageUploaded] - Callback(imageId)
   * @param {Function} [props.onImageRemoved] - Callback()
   * @param {string} [props.label]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      preset: 'PRODUCT',
      currentImageId: null,
      onImageUploaded: null,
      onImageRemoved: null,
      label: 'Imagen',
      ...props
    };

    this.state = {
      imageId: this.props.currentImageId || null,
      previewUrl: null,
      uploading: false,
      errorMsg: null,
      infoMsg: null
    };
  }

  afterMount() {
    this.bindEvents();
    if (this.state.imageId && !this.state.previewUrl) {
      this.loadPreview(this.state.imageId);
    }
  }

  async loadPreview(imageId) {
    if (!imageId) return;
    try {
      const url = await ImageStorageService.getImageUrl(imageId);
      if (url) {
        this.setState({ previewUrl: url });
      }
    } catch (e) {
      console.warn('[ImageUploader] Failed to load preview for', imageId);
    }
  }

  render() {
    const { label, preset } = this.props;
    const { previewUrl, uploading, errorMsg, infoMsg, imageId } = this.state;
    const presetDef = IMAGE_PRESETS[preset] || IMAGE_PRESETS.PRODUCT;

    const inputId = `img-input-${Math.random().toString(36).substring(2, 7)}`;

    return `
      <div class="image-uploader-component" style="display:flex; flex-direction:column; gap:8px;">
        ${label ? `<label class="form-label" style="font-weight:600; font-size:0.82rem;">${label} <span style="font-size:0.7rem; color:var(--color-text-secondary); font-weight:normal;">(Máx ${presetDef.maxWidth}x${presetDef.maxHeight}px WebP)</span></label>` : ''}

        ${errorMsg ? `
          <div style="background:rgba(239,68,68,0.12); border:1px solid var(--color-danger); color:var(--color-danger); padding:8px 12px; border-radius:var(--radius-md); font-size:0.78rem;">
            ⚠️ ${errorMsg}
          </div>
        ` : ''}

        ${infoMsg ? `
          <div style="background:rgba(16,185,129,0.12); border:1px solid var(--color-success); color:var(--color-success); padding:8px 12px; border-radius:var(--radius-md); font-size:0.78rem;">
            ✅ ${infoMsg}
          </div>
        ` : ''}

        <div class="uploader-dropzone" style="border:2px dashed var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-tertiary); padding:16px; text-align:center; position:relative; cursor:pointer; transition:all 0.2s;">
          <input type="file" id="${inputId}" class="file-input-hidden" accept="image/jpeg,image/png,image/webp" style="position:absolute; inset:0; opacity:0; width:100%; height:100%; cursor:pointer; z-index:2;" />

          ${uploading ? `
            <div style="padding:20px; display:flex; flex-direction:column; align-items:center; gap:8px;">
              <div style="width:24px; height:24px; border:3px solid var(--color-accent); border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
              <span style="font-size:0.8rem; font-weight:600; color:var(--color-accent);">Optimizando WebP & Fragmentando...</span>
            </div>
          ` : previewUrl ? `
            <div style="display:flex; flex-direction:column; align-items:center; gap:10px; position:relative; z-index:3;">
              <img src="${previewUrl}" alt="Preview" style="max-height:160px; max-width:100%; object-fit:contain; border-radius:var(--radius-md); border:1px solid var(--color-border); background:var(--color-bg-secondary);" />
              <div style="display:flex; gap:8px;">
                <label for="${inputId}" class="btn btn-secondary btn-xs" style="cursor:pointer;">✏️ Cambiar Imagen</label>
                <button type="button" class="btn btn-danger btn-xs btn-remove-img">🗑️ Eliminar</button>
              </div>
            </div>
          ` : `
            <div style="padding:16px 8px; display:flex; flex-direction:column; align-items:center; gap:6px; pointer-events:none;">
              <span style="font-size:2rem; color:var(--color-text-secondary);">🖼️</span>
              <div style="font-size:0.82rem; font-weight:600; color:var(--color-text-primary);">Arrastra una imagen aquí o <span style="color:var(--color-accent);">Haz Clic</span></div>
              <span style="font-size:0.72rem; color:var(--color-text-secondary);">Permitidos: JPG, JPEG, PNG, WEBP. Optimización WebP automática.</span>
            </div>
          `}
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.element) return;

    const fileInput = this.$('.file-input-hidden');
    const removeBtn = this.$('.btn-remove-img');
    const dropzone = this.$('.uploader-dropzone');

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.processFile(file);
      });
    }

    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--color-accent)';
        dropzone.style.background = 'rgba(99, 102, 241, 0.08)';
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'var(--color-border)';
        dropzone.style.background = 'var(--color-bg-tertiary)';
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--color-border)';
        dropzone.style.background = 'var(--color-bg-tertiary)';
        const file = e.dataTransfer?.files?.[0];
        if (file) this.processFile(file);
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (this.state.imageId) {
          await ImageStorageService.deleteImage(this.state.imageId).catch(() => {});
        }
        this.setState({ imageId: null, previewUrl: null, infoMsg: null, errorMsg: null });
        if (this.props.onImageRemoved) this.props.onImageRemoved();
      });
    }
  }

  async processFile(file) {
    // 1. Validate format
    const val = ImageStorageService.validateFormat(file);
    if (!val.valid) {
      this.setState({ errorMsg: val.error, infoMsg: null });
      return;
    }

    this.setState({ uploading: true, errorMsg: null, infoMsg: null });

    try {
      // 2. Upload via ImageStorageService (handles resize, webp, compress, chunking, IndexedDB)
      let newImageId = '';
      if (this.state.imageId) {
        newImageId = await ImageStorageService.replaceImage(this.state.imageId, file, this.props.preset);
      } else {
        newImageId = await ImageStorageService.uploadImage(file, this.props.preset);
      }

      const previewUrl = await ImageStorageService.getImageUrl(newImageId);

      this.setState({
        imageId: newImageId,
        previewUrl,
        uploading: false,
        infoMsg: `Imagen optimizada a WebP y guardada en Firestore.`
      });

      if (this.props.onImageUploaded) {
        this.props.onImageUploaded(newImageId);
      }
    } catch (err) {
      console.error('[ImageUploader] Processing failed:', err);
      this.setState({
        uploading: false,
        errorMsg: err.message || 'Error al procesar y almacenar la imagen.'
      });
    }
  }
}
