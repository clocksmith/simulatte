(function attachDeclarativeUiHost(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-contracts.js')
    : root.SimulattePluginContracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteDeclarativeUiHost = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDeclarativeUiHostModule(contracts) {
  function createDeclarativeUiHost({ rootElement, onAction }) {
    if (!rootElement || typeof rootElement.replaceChildren !== 'function') throw uiError('plugin_ui_root_invalid', 'Declarative UI host expected a root element', null);
    if (typeof onAction !== 'function') throw uiError('plugin_ui_action_handler_missing', 'Declarative UI host expected an action handler', null);

    function render(contributions) {
      const documentRef = rootElement.ownerDocument;
      const fragment = documentRef.createDocumentFragment();
      [...contributions].sort((left, right) => left.pluginId.localeCompare(right.pluginId)).forEach(({ pluginId, view }) => {
        contracts.validateUiContribution(pluginId, view);
        if (!view) return;
        const section = documentRef.createElement('details');
        section.className = 'evidence-section plugin-evidence';
        section.dataset.pluginId = pluginId;
        const summary = documentRef.createElement('summary');
        summary.textContent = view.title;
        section.append(summary);
        if (view.rows.length) {
          const rows = documentRef.createElement('dl');
          rows.className = 'evidence-grid';
          view.rows.forEach((row) => {
            const container = documentRef.createElement('div');
            const term = documentRef.createElement('dt');
            const description = documentRef.createElement('dd');
            term.textContent = row.label;
            description.textContent = String(row.value);
            container.append(term, description);
            rows.append(container);
          });
          section.append(rows);
        }
        if (view.actions.length) {
          const actions = documentRef.createElement('div');
          actions.className = 'plugin-actions';
          view.actions.forEach((action) => {
            const button = documentRef.createElement('button');
            button.type = 'button';
            button.className = 'sim-action';
            button.textContent = action.label;
            button.addEventListener('click', () => onAction({ pluginId, actionId: action.id }));
            actions.append(button);
          });
          section.append(actions);
        }
        fragment.append(section);
      });
      rootElement.replaceChildren(fragment);
    }

    return Object.freeze({ render });
  }

  function uiError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginUiError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { createDeclarativeUiHost };
});
