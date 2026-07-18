export class BarcodeScannerService {
  static attach(input, options = {}) {
    if (!input) return () => {};

    const minLength = options.minLength || 4;
    const settleMs = options.settleMs || 80;
    let timer = null;

    const notify = () => {
      const code = input.value.trim();
      if (code.length >= minLength && typeof options.onScan === 'function') {
        options.onScan(code);
      }
    };

    const onInput = () => {
      clearTimeout(timer);
      timer = setTimeout(notify, settleMs);
    };

    const onKeydown = (event) => {
      if (event.key === 'Enter' || event.key === 'Tab') {
        clearTimeout(timer);
        setTimeout(notify, 0);
      }
    };

    input.setAttribute('inputmode', 'text');
    input.setAttribute('autocomplete', 'off');
    input.dataset.scannerReady = 'true';
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);

    return () => {
      clearTimeout(timer);
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeydown);
    };
  }
}
