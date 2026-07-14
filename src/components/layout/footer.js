import { Component } from '../../core/component.js';
export class Footer extends Component {
  render() {
    return `<footer class="footer py-3 border-top text-center text-xs text-secondary">
      <span>&copy; ${new Date().getFullYear()} Ultra Administrador. Todos los derechos reservados.</span>
    </footer>`;
  }
}