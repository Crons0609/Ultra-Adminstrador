/**
 * @file component.js
 * @description Base class for custom UI elements and Views providing lifecycle events.
 */

export class Component {
  constructor(props = {}) {
    this.props = props;
    this.state = {};
    this.element = null;
  }

  /**
   * Set reactive state and trigger component update.
   * @param {Object} newState 
   */
  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.update();
  }

  /**
   * Render Component logic. Must return an HTML string.
   * @returns {string}
   */
  render() {
    return '';
  }

  /**
   * Mount Component to the DOM. Handles template compilation and lifecycle calls.
   * @returns {HTMLElement}
   */
  mount() {
    const htmlString = this.render().trim();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;
    
    // Extrapolate the root DOM node
    this.element = tempDiv.firstElementChild || tempDiv;
    
    this.afterMount();
    return this.element;
  }

  /**
   * Hook called immediately after the element is injected into the DOM.
   * Ideal for event bindings.
   */
  afterMount() {
    // Override in subclass
  }

  /**
   * Update component element in place when state changes.
   */
  update() {
    if (!this.element || !this.element.parentNode) return;

    const oldElement = this.element;
    const newHtmlString = this.render().trim();
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newHtmlString;
    const newElement = tempDiv.firstElementChild || tempDiv;

    // Replace the DOM node
    oldElement.parentNode.replaceChild(newElement, oldElement);
    this.element = newElement;

    // Trigger post-update hooks
    this.afterMount();
  }

  /**
   * Lifecycle hook executed when view is destroyed or navigated away.
   * Cleanup event listeners, intervals, and subscriptions here.
   */
  unmount() {
    // Override in subclass
    this.element = null;
  }

  /**
   * Utility query selector shorthand within component DOM hierarchy.
   * @param {string} selector 
   */
  $(selector) {
    if (!this.element) return null;
    return this.element.querySelector(selector);
  }

  /**
   * Utility query selector all shorthand.
   * @param {string} selector 
   */
  $$(selector) {
    if (!this.element) return [];
    return this.element.querySelectorAll(selector);
  }
}
