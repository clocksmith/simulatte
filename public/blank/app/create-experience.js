(function attachCreateExperience(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.connect(root.document, root);
})(typeof globalThis !== 'undefined' ? globalThis : window, function createExperience() {
  function statusFor({ state, visible, prompt, message }) {
    if (['error', 'failed', 'unsupported'].includes(state)) return {
      state: 'error', title: 'This run needs attention', message: message || 'Open Run details to inspect the failure.',
    };
    if (state === 'not-proven') return {
      state: 'warning', title: 'Some requirements are not verified', message: message || 'Open Validation to see what is missing.',
    };
    if (['active', 'loading'].includes(state)) return {
      state: 'running', title: visible ? 'Checking the result' : 'Building your simulation', message: message || 'Your run is in progress.',
    };
    if (visible) return { state: 'result', title: 'Simulation loaded', message: 'Explore the scene, or change your description and run again.' };
    return { state: 'empty', title: 'Ready to create', message: prompt.trim() ? 'Run your description to see the result.' : 'Choose an idea or write your own.' };
  }

  function connect(documentRoot, view) {
    const stage = documentRoot.querySelector('.physics-stage');
    const input = documentRoot.getElementById('build-prompt');
    const run = documentRoot.getElementById('build-lab');
    const runtime = documentRoot.getElementById('intent-runtime');
    const canvas = documentRoot.getElementById('physics-canvas');
    const editor = documentRoot.getElementById('create-editor');
    const toggle = documentRoot.getElementById('prompt-dock-toggle');
    const listeners = [];
    const on = (node, event, handler) => { node.addEventListener(event, handler); listeners.push(() => node.removeEventListener(event, handler)); };
    const text = (id, value) => {
      const node = documentRoot.getElementById(id);
      if (node.textContent !== value) node.textContent = value;
    };
    let previousVisible = false;
    function refresh() {
      const visible = canvas.dataset.sceneVisible === 'true';
      const status = statusFor({ state: runtime.dataset.state, visible, prompt: input.value,
        message: documentRoot.getElementById('intent-runtime-message').textContent });
      stage.dataset.createState = status.state;
      text('create-status-title', status.title);
      text('create-status-message', status.message);
      text('create-preview-title', visible ? 'Your simulation' : 'Preview');
      documentRoot.getElementById('create-empty').hidden = visible || status.state === 'running';
      documentRoot.getElementById('create-preview-actions').hidden = !visible;
      documentRoot.getElementById('create-interaction-hint').hidden = !visible;
      run.disabled = !input.value.trim();
      if (visible && !previousVisible && view.matchMedia('(max-width: 760px)').matches) {
        documentRoot.querySelector('.create-preview').scrollIntoView({ block: 'start', behavior: view.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
      previousVisible = visible;
    }
    on(input, 'input', refresh);
    on(input, 'keydown', event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing && !run.disabled) {
        event.preventDefault(); run.click();
      }
    });
    for (const button of documentRoot.querySelectorAll('[data-create-prompt]')) on(button, 'click', () => {
      input.value = button.dataset.createPrompt;
      input.dispatchEvent(new view.Event('input', { bubbles: true }));
      input.focus();
    });
    on(toggle, 'click', () => {
      editor.hidden = !editor.hidden;
      stage.dataset.editorHidden = String(editor.hidden);
      toggle.textContent = editor.hidden ? 'Show editor' : 'Hide editor';
      toggle.setAttribute('aria-expanded', String(!editor.hidden));
      if (!editor.hidden) input.focus();
    });
    const observer = new view.MutationObserver(refresh);
    observer.observe(runtime, { attributes: true, attributeFilter: ['data-state'], childList: true, subtree: true, characterData: true });
    observer.observe(canvas, { attributes: true, attributeFilter: ['data-scene-visible'] });
    refresh();
    const dispose = () => { observer.disconnect(); listeners.splice(0).forEach(remove => remove()); };
    on(view, 'pagehide', dispose);
    return Object.freeze({ dispose });
  }
  return Object.freeze({ statusFor, connect });
});
