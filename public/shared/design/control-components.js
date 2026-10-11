(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteControlComponents = api;
})(globalThis, function () {
  function decorateGroup(group) {
    group.setAttribute('role', 'radiogroup');
    const buttons = [...group.querySelectorAll('button')].filter(button => !button.hidden && button.getAttribute('role') !== 'switch');
    if (!buttons.length) return { sync() {} };
    function sync(selected) {
      for (const button of buttons) {
        const checked = button === selected;
        button.removeAttribute('aria-pressed'); button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', String(checked));
        button.tabIndex = checked ? 0 : -1;
      }
    }
    sync(buttons.find(button => button.getAttribute('aria-checked') === 'true' || button.getAttribute('aria-pressed') === 'true') || buttons[0]);
    for (const button of buttons) {
      button.addEventListener('click', () => sync(button));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const available=buttons.filter(row=>!row.disabled&&!row.hidden);if(!available.length)return;
        const index = available.indexOf(button), step = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
        const next = event.key === 'Home' ? available[0] : event.key === 'End' ? available.at(-1) : available[(index + step + available.length) % available.length];
        next.focus(); next.click();
      });
    }
    return { sync };
  }
  function create(document, control, value) {
    if (control.purpose === 'state') {
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = Boolean(value);
      input.setAttribute('role', 'switch'); return input;
    }
    if (control.purpose !== 'multiple' && !(control.purpose === 'choice' && control.options?.length <= 4)) return null;
    const group = document.createElement('fieldset'); group.className = control.purpose === 'multiple' ? 'sim-checkbox-group' : 'sim-segmented';
    const legend = document.createElement('legend'); legend.textContent = control.label; group.append(legend);
    for (const option of control.options || []) {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = control.purpose === 'multiple' ? 'checkbox' : 'radio';
      input.name = control.id; input.value = String(option.value);
      input.checked = Array.isArray(value) ? value.includes(option.value) : value === option.value;
      label.append(input, document.createTextNode(option.label)); group.append(label);
    }
    group.dataset.controlComponent = control.purpose;
    return group;
  }
  function read(input, control) {
    const selected = [...input.querySelectorAll('input:checked')].map(node => control.options.find(row => String(row.value) === node.value)?.value);
    return control.purpose === 'multiple' ? selected.length ? selected : undefined : selected[0];
  }
  function write(input, value) {
    for (const node of input.querySelectorAll('input')) node.checked = Array.isArray(value) ? value.some(v => String(v) === node.value) : String(value) === node.value;
  }
  if (typeof document !== 'undefined') {
    const mount = () => {document.querySelectorAll('[data-control-choice]').forEach(decorateGroup);
      document.querySelectorAll('button[role="switch"]').forEach(button=>{if(!button.hasAttribute('aria-label'))button.setAttribute('aria-label',button.textContent.trim());});};
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
  }
  return Object.freeze({ create, read, write, decorateGroup });
});
