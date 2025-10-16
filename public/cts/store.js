import { appBus } from './app-bus.js';
import { generateId, shallowFreeze, structuredCopy } from './utils.js';
import { getStageDefinition, listStageDefinitions } from './engine/stages/index.js';

const AVAILABLE_STAGE_TYPES = listStageDefinitions().map((stage) => stage.type);

export function createStore({ bus = appBus } = {}) {
  const initialScenario = createDefaultScenario();

  const state = {
    past: [],
    present: {
      scenarios: { [initialScenario.id]: initialScenario },
      activeScenarioId: initialScenario.id,
      selectedStageId: initialScenario.timeline[0]?.id || null,
      preferences: {
        theme: 'dark',
        showMathNarrative: true
      }
    },
    future: []
  };

  const subscribers = new Set();

  function getSnapshot() {
    return shallowFreeze(state.present);
  }

  function publish(detail, topic = 'store:changed') {
    const snapshot = getSnapshot();
    subscribers.forEach((fn) => fn(snapshot));
    bus.emit(topic, { snapshot, ...detail });
  }

  function pushHistory(inverseCommand) {
    state.past.push(inverseCommand);
    if (state.past.length > 100) state.past.shift();
    state.future.length = 0;
  }

  function apply(command, options = { recordHistory: true }) {
    const inverse = execute(command);
    if (options.recordHistory && inverse) {
      pushHistory(inverse);
    }
    publish({ command });
  }

  function execute(command) {
    const { type } = command;
    switch (type) {
      case 'scenario:new':
        return createScenario();
      case 'scenario:fork':
        return forkScenario(command.payload?.scenarioId);
      case 'scenario:select':
        return selectScenario(command.payload?.scenarioId);
      case 'stage:add':
        return addStage(command.payload);
      case 'stage:update':
        return updateStage(command.payload);
      case 'stage:select':
        return selectStage(command.payload?.stageId);
      case 'scenario:insert':
        return insertScenario(command.payload);
      case 'scenario:remove':
        return removeScenario(command.payload);
      case 'stage:remove':
        return removeStage(command.payload);
      case 'stage:move':
        return moveStage(command.payload);
      case 'preferences:update':
        return updatePreferences(command.payload);
      case 'state:hydrate':
        return hydrateState(command.payload);
      default:
        console.warn('Unknown command', command);
        return null;
    }
  }

  function undo() {
    const inverse = state.past.pop();
    if (!inverse) return;
    const redoCommand = execute(inverse);
    if (redoCommand) state.future.push(redoCommand);
    publish({ undo: true }, 'store:undo');
  }

  function redo() {
    const redoCommand = state.future.pop();
    if (!redoCommand) return;
    const inverse = execute(redoCommand);
    if (inverse) state.past.push(inverse);
    publish({ redo: true }, 'store:redo');
  }

  function subscribe(listener) {
    subscribers.add(listener);
    listener(getSnapshot());
    return () => subscribers.delete(listener);
  }

  function insertScenario(payload = {}) {
    const { scenario } = payload;
    if (!scenario) return null;
    const scenarioId = scenario.id || generateId('scenario');
    const timeline = Array.isArray(scenario.timeline) ? scenario.timeline.map((stage) => {
      const definition = getStageDefinition(stage.type);
      const defaults = definition?.defaults ? definition.defaults() : {};
      return {
        ...stage,
        id: stage.id || generateId('stage'),
        name: stage.name || definition?.label || readableStageName(stage.type),
        params: structuredCopy({ ...defaults, ...(stage.params || {}) }),
        createdAt: stage.createdAt || Date.now(),
        updatedAt: Date.now()
      };
    }) : [];
    const prepared = {
      id: scenarioId,
      name: scenario.name || `Scenario ${Object.keys(state.present.scenarios).length + 1}`,
      description: scenario.description || '',
      createdAt: scenario.createdAt || Date.now(),
      updatedAt: Date.now(),
      timeline
    };
    state.present.scenarios = { ...state.present.scenarios, [scenarioId]: prepared };
    const previousScenarioId = state.present.activeScenarioId;
    state.present.activeScenarioId = scenarioId;
    state.present.selectedStageId = timeline[0]?.id || null;
    return {
      type: 'scenario:remove',
      payload: { scenarioId, previousScenarioId }
    };
  }

  function removeScenario(payload = {}) {
    const { scenarioId, previousScenarioId } = payload;
    if (!scenarioId || !state.present.scenarios[scenarioId]) return null;
    const copy = structuredCopy(state.present.scenarios[scenarioId]);
    const next = { ...state.present.scenarios };
    delete next[scenarioId];
    state.present.scenarios = next;
    if (state.present.activeScenarioId === scenarioId) {
      state.present.activeScenarioId = previousScenarioId || Object.keys(next)[0] || null;
      const scenario = state.present.scenarios[state.present.activeScenarioId];
      state.present.selectedStageId = scenario?.timeline[0]?.id || null;
    }
    return {
      type: 'scenario:insert',
      payload: { scenario: copy, previousScenarioId: state.present.activeScenarioId }
    };
  }

  function createScenario() {
    const scenario = createDefaultScenario();
    state.present.scenarios = { ...state.present.scenarios, [scenario.id]: scenario };
    const previousScenarioId = state.present.activeScenarioId;
    state.present.activeScenarioId = scenario.id;
    state.present.selectedStageId = scenario.timeline[0]?.id || null;
    return { type: 'scenario:remove', payload: { scenarioId: scenario.id, previousScenarioId } };
  }

  function forkScenario(sourceId = state.present.activeScenarioId) {
    const source = state.present.scenarios[sourceId];
    if (!source) return null;
    const clone = structuredCopy(source);
    clone.id = generateId('scenario');
    clone.name = `${source.name} (fork)`;
    clone.createdAt = Date.now();
    clone.updatedAt = Date.now();
    clone.timeline = clone.timeline.map((stage) => ({ ...stage, id: generateId('stage') }));
    state.present.scenarios = { ...state.present.scenarios, [clone.id]: clone };
    const previousScenarioId = state.present.activeScenarioId;
    state.present.activeScenarioId = clone.id;
    state.present.selectedStageId = clone.timeline[0]?.id || null;
    return { type: 'scenario:remove', payload: { scenarioId: clone.id, previousScenarioId } };
  }

  function selectScenario(scenarioId) {
    if (!scenarioId || !state.present.scenarios[scenarioId]) return null;
    const previousScenarioId = state.present.activeScenarioId;
    state.present.activeScenarioId = scenarioId;
    state.present.selectedStageId = state.present.scenarios[scenarioId].timeline[0]?.id || null;
    return { type: 'scenario:select', payload: { scenarioId: previousScenarioId } };
  }

  function addStage(payload = {}) {
    const scenarioId = payload.scenarioId || state.present.activeScenarioId;
    const scenario = state.present.scenarios[scenarioId];
    if (!scenario) return null;
    const type = AVAILABLE_STAGE_TYPES.includes(payload.type) ? payload.type : 'PRICED_ROUND';

    // Prevent duplicate Founding stages
    if (type === 'FOUNDING') {
      const hasFoundingStage = scenario.timeline.some(stage => stage.type === 'FOUNDING');
      if (hasFoundingStage) {
        console.warn('[CTS] Cannot add multiple Founding stages');
        return null;
      }
    }

    const definition = getStageDefinition(type);
    const defaults = definition?.defaults ? definition.defaults() : {};
    const stageId = payload.stageId || generateId('stage');
    const stage = {
      id: stageId,
      type,
      name: payload.name || definition?.label || readableStageName(type),
      params: structuredCopy({ ...defaults, ...(payload.params || {}) }),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const nextTimeline = scenario.timeline.slice();
    const insertIndex = Number.isInteger(payload.insertIndex)
      ? Math.max(0, Math.min(nextTimeline.length, payload.insertIndex))
      : nextTimeline.length;
    nextTimeline.splice(insertIndex, 0, stage);
    updateScenario(scenario.id, { timeline: nextTimeline });
    const createdStageId = stage.id;
    state.present.selectedStageId = createdStageId;
    state.present.activeScenarioId = scenario.id;
    return { type: 'stage:remove', payload: { stageId: createdStageId, scenarioId: scenario.id } };
  }

  function updateStage(payload = {}) {
    const { stageId, changes = {} } = payload;
    const scenario = currentScenario();
    if (!scenario) return null;
    const index = scenario.timeline.findIndex((stage) => stage.id === stageId);
    if (index === -1) return null;
    const prevStage = scenario.timeline[index];
    const definition = getStageDefinition(changes.type || prevStage.type);
    const nextStage = {
      ...prevStage,
      ...('type' in changes ? { type: changes.type } : {}),
      ...('name' in changes ? { name: changes.name } : {}),
      params: structuredCopy(
        changes.params
          ? deepMerge(prevStage.params, changes.params)
          : prevStage.params
      ),
      updatedAt: Date.now()
    };
    const nextTimeline = scenario.timeline.slice();
    nextTimeline.splice(index, 1, nextStage);
    updateScenario(scenario.id, { timeline: nextTimeline });
    return {
      type: 'stage:update',
      payload: {
        stageId,
        changes: {
          type: prevStage.type,
          name: prevStage.name,
          params: structuredCopy(prevStage.params)
        }
      }
    };
  }

  function selectStage(stageId) {
    const scenario = currentScenario();
    if (!scenario) return null;
    if (!scenario.timeline.some((stage) => stage.id === stageId)) return null;
    const previousStageId = state.present.selectedStageId;
    state.present.selectedStageId = stageId;
    return { type: 'stage:select', payload: { stageId: previousStageId } };
  }

  function removeStage(payload = {}) {
    const scenario = currentScenario();
    if (!scenario) return null;
    const { stageId } = payload;
    const index = scenario.timeline.findIndex((stage) => stage.id === stageId);
    if (index <= 0) {
      console.warn('Cannot remove founding stage.');
      return null;
    }
    const removed = scenario.timeline[index];
    const nextTimeline = scenario.timeline.slice();
    nextTimeline.splice(index, 1);
    updateScenario(scenario.id, { timeline: nextTimeline });
    if (state.present.selectedStageId === stageId) {
      const fallback = nextTimeline[Math.min(index - 1, nextTimeline.length - 1)];
      state.present.selectedStageId = fallback ? fallback.id : nextTimeline[0]?.id || null;
    }
    return {
      type: 'stage:add',
      payload: {
        type: removed.type,
        name: removed.name,
        params: structuredCopy(removed.params),
        scenarioId: scenario.id,
        insertIndex: index,
        stageId: removed.id
      }
    };
  }

  function moveStage(payload = {}) {
    const scenario = currentScenario();
    if (!scenario) return null;
    const { stageId, toIndex } = payload;
    const currentIndex = scenario.timeline.findIndex((stage) => stage.id === stageId);
    if (currentIndex <= 0) return null;
    const targetIndex = Math.max(1, Math.min(scenario.timeline.length - 1, toIndex));
    if (currentIndex === targetIndex) return null;
    const nextTimeline = scenario.timeline.slice();
    const [stage] = nextTimeline.splice(currentIndex, 1);
    nextTimeline.splice(targetIndex, 0, stage);
    updateScenario(scenario.id, { timeline: nextTimeline });
    return {
      type: 'stage:move',
      payload: {
        stageId,
        toIndex: currentIndex
      }
    };
  }

  function updatePreferences(changes = {}) {
    const prev = state.present.preferences;
    state.present.preferences = { ...prev, ...changes };
    return { type: 'preferences:update', payload: prev };
  }

  function updateScenario(scenarioId, changes) {
    const scenario = state.present.scenarios[scenarioId];
    if (!scenario) return;
    const nextScenario = { ...scenario, ...changes, updatedAt: Date.now() };
    state.present.scenarios = { ...state.present.scenarios, [scenarioId]: nextScenario };
  }

  function currentScenario() {
    return state.present.scenarios[state.present.activeScenarioId];
  }

  function hydrateState(payload) {
    if (!payload) return null;
    state.past = [];
    state.future = [];
    state.present = structuredCopy(payload);
    return null;
  }

  return {
    getSnapshot,
    dispatch: apply,
    subscribe,
    undo,
    redo
  };
}

function createDefaultScenario() {
  const scenarioId = generateId('scenario');
  const foundingDef = getStageDefinition('FOUNDING');
  const foundingStage = {
    id: generateId('stage'),
    type: 'FOUNDING',
    name: foundingDef?.label || 'Founding',
    params: foundingDef?.defaults ? foundingDef.defaults() : {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  return {
    id: scenarioId,
    name: 'Scenario 1',
    description: 'Baseline journey',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    timeline: [foundingStage]
  };
}

function readableStageName(type = '') {
  switch (type) {
    case 'FOUNDING':
      return 'Founding';
    case 'PRE_MONEY_SAFE':
      return 'Pre-Money SAFE';
    case 'POST_MONEY_SAFE':
      return 'Post-Money SAFE';
    case 'CONVERTIBLE_NOTE':
      return 'Convertible Note';
    case 'PRICED_ROUND':
      return 'Priced Round';
    case 'EXIT':
      return 'Exit Event';
    default:
      return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function deepMerge(target = {}, source = {}) {
  const output = { ...target };
  Object.keys(source || {}).forEach((key) => {
    const sourceValue = source[key];
    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      output[key] = deepMerge(target[key] || {}, sourceValue);
    } else {
      output[key] = sourceValue;
    }
  });
  return output;
}
