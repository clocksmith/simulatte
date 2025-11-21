import { listStageDefinitions } from '../engine/stages/index.js';

export class TimelinePanel {
  constructor({ container, bus, store }) {
    this.container = container;
    this.bus = bus;
    this.store = store;
    // Find the panel section, then find the actions div within it
    this.actionsRoot = container?.closest('.cts-panel')?.querySelector('.cts-panel__actions');
    this.stageTypes = listStageDefinitions();
    this.activeScenario = null;

    this.container?.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-stage-action]');
      if (actionButton) {
        event.stopPropagation();
        const stageId = actionButton.getAttribute('data-stage-id');
        const action = actionButton.getAttribute('data-stage-action');
        if (stageId && action) {
          this.handleStageAction(action, stageId);
        }
        return;
      }
      const item = event.target.closest('[data-stage-id]');
      if (!item) return;
      const stageId = item.getAttribute('data-stage-id');
      this.store.dispatch({ type: 'stage:select', payload: { stageId } });
    });

    this.container?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const item = event.target.closest('[data-stage-id]');
      if (!item) return;
      event.preventDefault();
      const stageId = item.getAttribute('data-stage-id');
      this.store.dispatch({ type: 'stage:select', payload: { stageId } });
    });

    this.actionsRoot?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-command]');
      if (!button) return;
      const command = button.getAttribute('data-command');
      switch (command) {
        case 'add-stage':
          this.toggleStageMenu();
          break;
        case 'new-scenario':
          this.store.dispatch({ type: 'scenario:new' });
          break;
        case 'fork-scenario':
          this.store.dispatch({ type: 'scenario:fork' });
          break;
        case 'export-scenario':
          this.bus.emit('scenario:export-requested');
          break;
        case 'open-templates':
          this.bus.emit('templates:open');
          break;
        case 'open-compare':
          this.bus.emit('compare:open');
          break;
        default:
          break;
      }
    });

    this.installStageMenu();
    this.installStaticStageMenu();
  }

  render(snapshot) {
    if (!this.container || !snapshot) return;
    const scenario = snapshot.scenarios[snapshot.activeScenarioId];
    this.activeScenario = scenario || null;
    const fragment = document.createDocumentFragment();

    if (scenario && Array.isArray(scenario.timeline)) {
      scenario.timeline.forEach((stage, index) => {
        fragment.appendChild(this.renderStageCard(stage, index, stage.id === snapshot.selectedStageId));
      });
    }

    if (!fragment.children.length) {
      const placeholder = document.createElement('li');
      placeholder.className = 'cts-stage-card';
      placeholder.innerHTML = '<div class="cts-stage-card__body"><div class="cts-stage-card__title">No stages yet</div><div class="cts-stage-card__meta"><span>Add a stage to begin</span></div></div>';
      fragment.appendChild(placeholder);
    }

    this.container.textContent = '';
    this.container.appendChild(fragment);

    // Update menu button states based on current timeline
    this.updateStageMenuState(scenario);
  }

  renderStageCard(stage, index, isSelected) {
    const li = document.createElement('li');
    li.className = 'cts-stage-card';
    li.tabIndex = 0;
    li.dataset.stageId = stage.id;
    li.dataset.selected = String(isSelected);

    const title = document.createElement('div');
    title.className = 'cts-stage-card__title';
    title.textContent = `${index + 1}. ${stage.name || stage.type}`;

    const meta = document.createElement('div');
    meta.className = 'cts-stage-card__meta';
    meta.innerHTML = `
      <span>${stage.type.replace(/_/g, ' ')}</span>
      <span>Updated ${new Date(stage.updatedAt || Date.now()).toLocaleDateString()}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'cts-stage-card__controls';
    const lastIndex = (this.activeScenario?.timeline.length || 1) - 1;
    actions.innerHTML = `
      <button type="button" class="cts-icon-button" data-stage-action="move-up" data-stage-id="${stage.id}" aria-label="Move stage up" ${index <= 1 ? 'disabled' : ''}>▲</button>
      <button type="button" class="cts-icon-button" data-stage-action="move-down" data-stage-id="${stage.id}" aria-label="Move stage down" ${(index === 0 || index >= lastIndex) ? 'disabled' : ''}>▼</button>
      <button type="button" class="cts-icon-button" data-stage-action="remove" data-stage-id="${stage.id}" aria-label="Remove stage" ${index === 0 ? 'disabled' : ''}>☩</button>
    `;

    const body = document.createElement('div');
    body.className = 'cts-stage-card__body';
    body.appendChild(title);
    body.appendChild(meta);

    li.appendChild(body);
    li.appendChild(actions);
    return li;
  }

  installStaticStageMenu() {
    const menuContainer = document.getElementById('cts-stage-menu-static');
    if (!menuContainer) return;

    this.stageTypes.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cts-stage-menu__item';
      button.innerHTML = `<span class="cts-stage-icon">+</span>${entry.label}`;
      button.dataset.stageType = entry.type;
      button.addEventListener('click', () => {
        this.store.dispatch({
          type: 'stage:add',
          payload: { type: entry.type }
        });
      });
      menuContainer.appendChild(button);
    });
  }

  updateStageMenuState(scenario) {
    if (!scenario) return;
    const menuContainer = document.getElementById('cts-stage-menu-static');
    if (!menuContainer) return;

    const hasFoundingStage = scenario.timeline.some(stage => stage.type === 'FOUNDING');

    menuContainer.querySelectorAll('[data-stage-type]').forEach((button) => {
      const stageType = button.dataset.stageType;

      if (stageType === 'FOUNDING' && hasFoundingStage) {
        button.disabled = true;
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
        button.title = 'Founding stage already exists';
      } else {
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
        button.title = '';
      }
    });
  }

  installStageMenu() {
    if (!this.actionsRoot) return;
    const trigger = this.actionsRoot.querySelector('[data-command="add-stage"]');
    if (!trigger) return;
    this.stageMenu = document.createElement('div');
    this.stageMenu.className = 'cts-stage-menu';
    this.stageMenu.hidden = true;
    this.stageTypes.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cts-stage-menu__item';
      button.textContent = `${entry.label}`;
      button.dataset.stageType = entry.type;
      button.addEventListener('click', () => {
        this.store.dispatch({
          type: 'stage:add',
          payload: { type: entry.type }
        });
        this.hideStageMenu();
      });
      this.stageMenu.appendChild(button);
    });
    trigger.insertAdjacentElement('afterend', this.stageMenu);
    document.addEventListener('click', (event) => {
      if (!this.stageMenu || this.stageMenu.hidden) return;
      if (event.target === trigger || trigger.contains(event.target)) return;
      if (event.target && this.stageMenu.contains(event.target)) return;
      this.hideStageMenu();
    });
  }

  toggleStageMenu() {
    if (!this.stageMenu) return;
    this.stageMenu.hidden = !this.stageMenu.hidden;
  }

  hideStageMenu() {
    if (!this.stageMenu) return;
    this.stageMenu.hidden = true;
  }

  handleStageAction(action, stageId) {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const index = scenario.timeline.findIndex((stage) => stage.id === stageId);
    if (index === -1) return;
    switch (action) {
      case 'remove':
        if (index === 0) return;
        if (scenario.timeline.length === 1) return;
        this.store.dispatch({ type: 'stage:remove', payload: { stageId } });
        break;
      case 'move-up':
        if (index <= 1) return;
        this.store.dispatch({ type: 'stage:move', payload: { stageId, toIndex: index - 1 } });
        break;
      case 'move-down':
        if (index === 0 || index >= scenario.timeline.length - 1) return;
        this.store.dispatch({ type: 'stage:move', payload: { stageId, toIndex: index + 1 } });
        break;
      default:
        break;
    }
  }
}
