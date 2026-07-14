/**
 * @file card.js
 * @description Card UI reusable component.
 */

import { Component } from '../../core/component.js';

export class Card extends Component {
  /**
   * @param {Object} props
   * @param {string} props.title
   * @param {string} [props.description]
   * @param {string} props.bodyHTML
   * @param {string} [props.footerHTML]
   * @param {boolean} [props.interactive]
   * @param {Function} [props.onClick]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      title: '',
      description: '',
      bodyHTML: '',
      footerHTML: '',
      interactive: false,
      ...props
    };
  }

  render() {
    const { title, description, bodyHTML, footerHTML, interactive } = this.props;
    const headerHTML = title 
      ? `<div class="card-header">
           <div class="card-title-group">
             <h4 class="card-title">${title}</h4>
             ${description ? `<p class="card-description">${description}</p>` : ''}
           </div>
         </div>`
      : '';
    const footerTemplate = footerHTML ? `<div class="card-footer">${footerHTML}</div>` : '';
    const interactiveClass = interactive ? 'card-interactive' : '';

    return `
      <div class="card ${interactiveClass}">
        ${headerHTML}
        <div class="card-body">
          ${bodyHTML}
        </div>
        ${footerTemplate}
      </div>
    `;
  }

  afterMount() {
    if (this.props.onClick && this.element) {
      this.element.addEventListener('click', this.props.onClick);
    }
  }
}
