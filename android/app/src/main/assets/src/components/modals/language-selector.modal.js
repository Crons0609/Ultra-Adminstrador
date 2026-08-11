/**
 * @file language-selector.modal.js
 * @description Modal dialog for changing system language with 10 flag options.
 */

import { Component } from '../../core/component.js';
import { I18nService } from '../../services/i18n.service.js';
import { NotificationService } from '../../services/notification.service.js';

export class LanguageSelectorModal extends Component {
  constructor(props = {}) {
    super(props);
    this.onSelectCallback = props.onSelect || null;
  }

  static open(onSelect) {
    const existing = document.getElementById('language-selector-modal');
    if (existing) existing.remove();

    const instance = new LanguageSelectorModal({ onSelect });
    const modalHTML = instance.render();

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    instance.attachEvents();
  }

  attachEvents() {
    const modal = document.getElementById('language-selector-modal');
    if (!modal) return;

    // Close buttons
    const closeBtns = modal.querySelectorAll('[data-close-lang-modal]');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', () => modal.remove());
    });

    // Background click to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // Language option cards
    const langCards = modal.querySelectorAll('.lang-option-card');
    langCards.forEach(card => {
      card.addEventListener('click', () => {
        const langCode = card.dataset.langCode;
        if (langCode) {
          // Set language (without immediate reload so callback can execute)
          I18nService.setLanguage(langCode, false);
          NotificationService.success(I18nService.t('language_updated_success'));

          if (this.onSelectCallback) {
            this.onSelectCallback(langCode);
          }

          modal.remove();

          // Force full clean SPA reload so all components, header, sidebar and views refresh in new language
          setTimeout(() => {
            window.location.reload();
          }, 150);
        }
      });
    });
  }

  render() {
    const languages = I18nService.getSupportedLanguages();
    const currentLang = I18nService.getLanguage();

    const langItemsHTML = languages.map(lang => {
      const isActive = lang.code === currentLang;
      return `
        <button type="button" class="lang-option-card ${isActive ? 'active' : ''}" data-lang-code="${lang.code}" style="
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px; border-radius: 12px;
          background: ${isActive ? 'rgba(99, 102, 241, 0.18)' : '#1a1a24'};
          border: 1px solid ${isActive ? '#6366f1' : 'rgba(255,255,255,0.08)'};
          color: #ffffff; cursor: pointer; text-align: left;
          transition: all 0.2s ease; outline: none; width: 100%;
        ">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 1.6rem; line-height: 1;">${lang.flag}</span>
            <div>
              <strong style="font-size: 0.95rem; display: block; color: #fff;">${lang.nativeName}</strong>
              <span style="font-size: 0.78rem; color: #94a3b8;">${lang.name}</span>
            </div>
          </div>
          ${isActive ? '<span style="color: #818cf8; font-weight: 700; font-size: 1.1rem;">✓</span>' : ''}
        </button>
      `;
    }).join('');

    return `
      <div id="language-selector-modal" style="
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        padding: 20px; animation: fadeIn 0.2s ease;
      ">
        <div style="
          background: #111115; border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px; width: 100%; max-width: 580px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.6); overflow: hidden;
        ">
          <!-- Modal Header -->
          <div style="
            padding: 20px 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            display: flex; align-items: center; justify-content: space-between;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(14, 165, 233, 0.05));
          ">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 1.5rem;">🌐</span>
              <div>
                <h3 style="margin: 0; color: #fff; font-size: 1.15rem; font-weight: 700;">${I18nService.t('select_language')}</h3>
                <span style="font-size: 0.8rem; color: #94a3b8;">${I18nService.t('select_language_desc')}</span>
              </div>
            </div>
            <button type="button" data-close-lang-modal style="
              background: transparent; border: none; color: #94a3b8;
              font-size: 1.5rem; cursor: pointer; padding: 4px 8px; line-height: 1;
            ">&times;</button>
          </div>

          <!-- Modal Body Grid -->
          <div style="
            padding: 20px 24px; max-height: 68vh; overflow-y: auto;
            display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px;
          ">
            ${langItemsHTML}
          </div>

          <!-- Modal Footer -->
          <div style="
            padding: 16px 24px; border-top: 1px solid rgba(255, 255, 255, 0.08);
            display: flex; justify-content: flex-end; background: #0a0a0f;
          ">
            <button type="button" data-close-lang-modal class="btn btn-ghost" style="
              padding: 9px 20px; border-radius: 8px; background: rgba(255,255,255,0.06);
              color: #fff; border: 1px solid rgba(255,255,255,0.12); cursor: pointer;
            ">${I18nService.t('close')}</button>
          </div>
        </div>
      </div>
    `;
  }
}
