/**
 * @file image-display.js
 * @description UI Component and helper utilities to asynchronously resolve imageId
 * to an ObjectURL Blob via ImageStorageService and IndexedDB cache with lazy loading.
 */

import { Component } from '../../core/component.js';
import { ImageStorageService } from '../../services/image-storage.service.js';

export class ImageDisplay extends Component {
  /**
   * @param {Object} props
   * @param {string|null} props.imageId
   * @param {string} [props.fallbackUrl]
   * @param {string} [props.alt]
   * @param {string} [props.style]
   * @param {string} [props.className]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      imageId: null,
      fallbackUrl: '/assets/placeholder-food.png',
      alt: 'Imagen',
      style: '',
      className: '',
      ...props
    };

    this.state = {
      src: this.props.fallbackUrl
    };
  }

  afterMount() {
    this.resolveImage();
  }

  async resolveImage() {
    if (!this.props.imageId) {
      this.setState({ src: this.props.fallbackUrl });
      return;
    }

    try {
      const url = await ImageStorageService.getImageUrl(this.props.imageId);
      if (url) {
        this.setState({ src: url });
      } else {
        this.setState({ src: this.props.fallbackUrl });
      }
    } catch (e) {
      console.warn('[ImageDisplay] Error resolving imageId:', this.props.imageId);
      this.setState({ src: this.props.fallbackUrl });
    }
  }

  render() {
    const { alt, style, className } = this.props;
    const { src } = this.state;

    return `
      <img
        src="${src}"
        alt="${alt}"
        loading="lazy"
        class="${className}"
        style="object-fit:cover; border-radius:var(--radius-md); ${style}"
        onerror="this.onerror=null; this.src='${this.props.fallbackUrl}'"
      />
    `;
  }

  /**
   * Helper function for rendering dynamic <img> tags inside DataTable column renderers.
   * Registers async load once element enters DOM.
   * @param {string|null} imageId
   * @param {string} [fallbackUrl]
   * @param {string} [extraStyles]
   * @returns {string} HTML string with auto-resolving data attribute
   */
  static renderTag(imageId, fallbackUrl = '/assets/placeholder-food.png', extraStyles = 'width:40px; height:40px; border-radius:6px; object-fit:cover;') {
    if (!imageId) {
      return `<img src="${fallbackUrl}" style="${extraStyles}" loading="lazy" />`;
    }

    const uniqueId = `img-tag-${Math.random().toString(36).substring(2, 9)}`;

    // Trigger async resolution
    setTimeout(async () => {
      const imgEl = document.getElementById(uniqueId);
      if (imgEl && imageId) {
        const objectUrl = await ImageStorageService.getImageUrl(imageId);
        if (objectUrl && imgEl) imgEl.src = objectUrl;
      }
    }, 0);

    return `<img id="${uniqueId}" src="${fallbackUrl}" style="${extraStyles}" loading="lazy" data-image-id="${imageId}" onerror="this.onerror=null; this.src='${fallbackUrl}'" />`;
  }
}
