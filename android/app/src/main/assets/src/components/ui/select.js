import { Component } from '../../core/component.js';
export class Select extends Component {
  constructor(p = {}) {
    super(p);
    this.props = { id: '', options: [], value: '', disabled: false, ...p };
  }
  render() {
    const { id, options, value, disabled } = this.props;
    const opts = options.map(o => `<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`).join('');
    return `<select id="${id}" class="select" ${disabled ? 'disabled' : ''}>${opts}</select>`;
  }
}