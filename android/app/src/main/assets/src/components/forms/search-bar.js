/**
 * @file search-bar.js
 * @description Search bar UI component with debounced input triggering.
 */

import { Component } from '../../core/component.js';
import { debounce } from '../../utils/debounce.js';

export class SearchBar extends Component {
  /**
   * @param {Object} props
   * @param {string} [props.placeholder]
   * @param {Function} props.onSearch - Called with (searchTerm: string)
   * @param {number} [props.debounceMs]
   * @param {string} [props.id]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      placeholder: 'Buscar...',
      debounceMs: 300,
      id: 'search-bar',
      ...props
    };

    // Wrap the onSearch callback in debounce to avoid excessive re-renders
    this._debouncedSearch = debounce(
      (term) => {
        if (this.props.onSearch) {
          this.props.onSearch(term);
        }
      },
      this.props.debounceMs
    );
  }

  render() {
    const { placeholder, id } = this.props;

    return `
      <div class="search-bar-container" style="position: relative; display: flex; align-items: center;">
        <span style="position: absolute; left: 12px; color: var(--color-text-tertiary); font-size: 0.875rem; pointer-events: none;">🔍</span>
        <input 
          type="text"
          id="${id}"
          placeholder="${placeholder}"
          class="input input-md"
          style="padding-left: 36px;"
          autocomplete="off"
        />
      </div>
    `;
  }

  afterMount() {
    const input = this.$(`#${this.props.id}`);
    if (input) {
      input.addEventListener('input', (e) => {
        this._debouncedSearch(e.target.value.trim());
      });
    }
  }

  clear() {
    const input = this.$(`#${this.props.id}`);
    if (input) {
      input.value = '';
      if (this.props.onSearch) this.props.onSearch('');
    }
  }
}
