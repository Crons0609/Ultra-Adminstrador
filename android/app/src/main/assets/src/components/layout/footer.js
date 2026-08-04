import { Component } from '../../core/component.js';
export class Footer extends Component {
  render() {
    return `<footer class="footer py-3 border-top text-center text-xs text-secondary" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 24px;">
      <span>&copy; ${new Date().getFullYear()} <strong>Ultra Administrador</strong>. Todos los derechos reservados.</span>
      <span style="opacity: 0.85;">Desarrollado por <strong style="color: var(--color-accent);">ProLine System</strong></span>
    </footer>`;
  }
}