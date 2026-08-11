import { Component } from '../../../core/component.js';
import { I18nService } from '../../../services/i18n.service.js';

export class RegisterView extends Component {
  render() {
    return `<div class="p-6 text-center"><h2>${I18nService.t('auth_register_title')}</h2><p>${I18nService.t('auth_register_phase')}</p></div>`;
  }
}
