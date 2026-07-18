/**
 * @file table.js
 * @description DataTable component with columns definitions and row click triggers.
 */

import { Component } from '../../core/component.js';

export class DataTable extends Component {
  /**
   * @param {Object} props
   * @param {Array<Object>} props.columns - { key, label, render }
   * @param {Array<Object>} props.data
   * @param {Function} [props.onRowClick]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      columns: [],
      data: [],
      ...props
    };
  }

  render() {
    const { columns, data } = this.props;

    // 1. Build Header
    let headersHTML = '';
    columns.forEach(col => {
      headersHTML += `<th class="th">${col.label}</th>`;
    });

    // 2. Build Body
    let rowsHTML = '';
    if (data.length === 0) {
      rowsHTML = `
        <tr>
          <td class="td text-center" colspan="${columns.length}">
            No hay datos disponibles
          </td>
        </tr>
      `;
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
          </tr>
        `;
      });
    }

    return `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>${headersHTML}</tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>
      </div>
    `;
  }

  afterMount() {
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
  }
}
