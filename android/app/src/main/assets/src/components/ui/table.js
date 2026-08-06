/**
 * @file table.js
 * @description DataTable component with columns definitions and row click triggers.
 *              Desktop: classic scrollable table.
 *              Mobile (≤768px): expandable accordion cards — avatar + name visible,
 *              tap to reveal all business details with smooth animation.
 */

import { Component } from '../../core/component.js';

export class DataTable extends Component {
  /**
   * @param {Object} props
   * @param {Array<Object>} props.columns  - { key, label, render }
   * @param {Array<Object>} props.data
   * @param {Function}      [props.onRowClick]
   * @param {string}        [props.nameKey]     - key for card title (default: first col)
   * @param {string}        [props.subtitleKey] - key for card subtitle (e.g. businessType)
   * @param {string}        [props.imageKey]    - key for avatar image URL (optional)
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      columns: [],
      data: [],
      ...props
    };
  }

  // ─── Avatar helper ─────────────────────────────────────────────────────────

  _avatarHTML(name = '') {
    const initials = name
      .split(' ')
      .slice(0, 2)
      .map(w => w[0] || '')
      .join('')
      .toUpperCase() || '?';

    const hue = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
    const gradient = `linear-gradient(135deg, hsl(${hue},60%,42%), hsl(${(hue + 55) % 360},68%,56%))`;

    return `<span class="dt-card-avatar" style="background:${gradient};">${initials}</span>`;
  }

  // ─── Desktop table ──────────────────────────────────────────────────────────

  _renderTable() {
    const { columns, data } = this.props;

    let headersHTML = '';
    columns.forEach(col => {
      headersHTML += `<th class="th">${col.label}</th>`;
    });

    let rowsHTML = '';
    if (data.length === 0) {
      rowsHTML = `
        <tr>
          <td class="td text-center" colspan="${columns.length}">
            No hay datos disponibles
          </td>
        </tr>`;
    } else {
      data.forEach((row, rowIndex) => {
        let cellsHTML = '';
        columns.forEach(col => {
          const value = row[col.key];
          const cellContent = col.render ? col.render(value, row) : value;
          cellsHTML += `<td class="td">${cellContent !== undefined ? cellContent : ''}</td>`;
        });
        rowsHTML += `
          <tr class="tr tr-hover ${this.props.onRowClick ? 'cursor-pointer' : ''}" data-row-index="${rowIndex}">
            ${cellsHTML}
          </tr>`;
      });
    }

    return `
      <div class="table-container">
        <table class="table">
          <thead><tr>${headersHTML}</tr></thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>`;
  }

  // ─── Mobile accordion cards ─────────────────────────────────────────────────

  _renderMobileCards() {
    const { columns, data } = this.props;

    if (data.length === 0) {
      return `<div class="dt-cards-empty">No hay datos disponibles</div>`;
    }

    // Which column is the "name" (card header title)
    const nameKey      = this.props.nameKey      || (columns[0] ? columns[0].key : 'name');
    const subtitleKey  = this.props.subtitleKey  || 'businessType';
    const nameCol      = columns.find(c => c.key === nameKey) || columns[0];

    let cardsHTML = '';

    data.forEach((row, rowIndex) => {
      // ── Header: avatar + name + subtitle ──
      const rawName    = String(row[nameKey] || '—');
      const rawSubtitle = row[subtitleKey] ? String(row[subtitleKey]) : '';

      const avatar = this.props.imageKey && row[this.props.imageKey]
        ? `<img class="dt-card-avatar dt-card-avatar--img" src="${row[this.props.imageKey]}" alt="${rawName}" />`
        : this._avatarHTML(rawName);

      const titleHTML = `
        <div class="dt-card-title-block">
          <span class="dt-card-title">${rawName}</span>
          ${rawSubtitle ? `<span class="dt-card-subtitle">${rawSubtitle}</span>` : ''}
        </div>`;

      // ── Body: all columns except name (and subtitle if separate column) ──
      let fieldsHTML = '';
      columns.forEach(col => {
        // Skip the name col — already in header
        if (col.key === nameKey) return;

        const value = row[col.key];
        const cellContent = col.render ? col.render(value, row) : (value !== undefined ? value : '—');

        const isActions = col.key === 'id' || (col.label && col.label.toLowerCase().includes('acciones'));

        if (isActions) {
          fieldsHTML += `
            <div class="dt-card-field dt-card-field--actions" data-stop-row-click="true">
              <div class="dt-card-field-value">${cellContent}</div>
            </div>`;
        } else {
          fieldsHTML += `
            <div class="dt-card-field">
              <span class="dt-card-field-label">${col.label}</span>
              <span class="dt-card-field-value">${cellContent}</span>
            </div>`;
        }
      });

      cardsHTML += `
        <div class="dt-card" data-row-index="${rowIndex}">
          <button class="dt-card-header" data-card-toggle="${rowIndex}" aria-expanded="false">
            ${avatar}
            ${titleHTML}
            <span class="dt-card-chevron">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </button>
          <div class="dt-card-body" id="dt-card-body-${rowIndex}">
            <div class="dt-card-fields">${fieldsHTML}</div>
          </div>
        </div>`;
    });

    return `<div class="dt-cards-list">${cardsHTML}</div>`;
  }

  // ─── Main render ────────────────────────────────────────────────────────────

  render() {
    return `
      <div class="dt-responsive-wrapper">
        <div class="dt-desktop">${this._renderTable()}</div>
        <div class="dt-mobile">${this._renderMobileCards()}</div>
      </div>`;
  }

  // ─── afterMount: bind events ────────────────────────────────────────────────

  afterMount() {
    // Desktop: row click
    if (this.props.onRowClick) {
      this.$$('.tr').forEach(rowNode => {
        rowNode.addEventListener('click', (event) => {
          if (event.target.closest('[data-stop-row-click="true"]')) return;
          const index = parseInt(rowNode.getAttribute('data-row-index'));
          if (!isNaN(index) && this.props.data[index]) {
            this.props.onRowClick(this.props.data[index]);
          }
        });
      });
    }

    // Mobile: accordion toggle
    this.$$('[data-card-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx  = btn.getAttribute('data-card-toggle');
        const body = this.$(`#dt-card-body-${idx}`);
        const card = btn.closest('.dt-card');
        if (!body || !card) return;

        const isOpen = card.classList.contains('dt-card--open');
        if (isOpen) {
          card.classList.remove('dt-card--open');
          btn.setAttribute('aria-expanded', 'false');
          body.style.maxHeight = '0';
        } else {
          card.classList.add('dt-card--open');
          btn.setAttribute('aria-expanded', 'true');
          body.style.maxHeight = body.scrollHeight + 'px';
        }
      });
    });
  }
}
