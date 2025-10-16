import { getStageDefinition } from './stages/index.js';
import { createBaseState, cloneState } from './state.js';

export function runScenario(scenario, options = {}) {
  if (!scenario) {
    return emptyResult();
  }

  const timeline = Array.isArray(scenario.timeline) ? scenario.timeline : [];
  const stageResults = [];
  let state = createBaseState();

  for (const stage of timeline) {
    const def = getStageDefinition(stage.type);
    if (!def || typeof def.simulate !== 'function') {
      stageResults.push({
        id: stage.id,
        type: stage.type,
        name: stage.name,
        capTable: state.capTable,
        math: [`No simulator registered for stage type ${stage.type}.`],
        warnings: [`Missing handler for stage type: ${stage.type}`]
      });
      continue;
    }

    const snapshot = cloneState(state);
    const nextState = def.simulate({
      stage,
      scenario,
      priorState: snapshot,
      options
    });

    state = normalizeState(nextState);

    stageResults.push({
      id: stage.id,
      type: stage.type,
      name: stage.name,
      capTable: state.capTable,
      math: Array.from(state.math || []),
      warnings: Array.from(state.warnings || []),
      ledgerEntries: Array.from(state.ledgerEntries || []),
      exitWaterfall: state.exitWaterfall ? Array.from(state.exitWaterfall) : null
    });

    if (options.untilStageId && stage.id === options.untilStageId) {
      break;
    }
  }

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    stageResults,
    capTable: state.capTable,
    totalShares: state.totalShares,
    exitWaterfall: state.exitWaterfall || null,
    warnings: dedupe(stageResults.flatMap((result) => result.warnings || []))
  };
}

function normalizeState(nextState) {
  const base = {
    capTable: [],
    totalShares: 0,
    ledgerEntries: [],
    math: [],
    warnings: [],
    instruments: { notes: [], preSafes: [], postSafes: [] },
    exitWaterfall: null
  };
  const merged = { ...base, ...nextState };
  merged.capTable = Array.isArray(merged.capTable) ? merged.capTable.map((row) => ({
    id: row.id,
    label: row.label,
    class: row.class,
    shares: row.shares,
    percent: row.percent || 0
  })) : [];
  merged.ledgerEntries = Array.isArray(merged.ledgerEntries) ? merged.ledgerEntries.slice() : [];
  merged.math = Array.isArray(merged.math) ? merged.math.slice() : [];
  merged.warnings = Array.isArray(merged.warnings) ? merged.warnings.slice() : [];
  merged.instruments = {
    notes: Array.isArray(nextState?.instruments?.notes) ? nextState.instruments.notes.map((item) => ({ ...item })) : [],
    preSafes: Array.isArray(nextState?.instruments?.preSafes) ? nextState.instruments.preSafes.map((item) => ({ ...item })) : [],
    postSafes: Array.isArray(nextState?.instruments?.postSafes) ? nextState.instruments.postSafes.map((item) => ({ ...item })) : []
  };
  merged.exitWaterfall = Array.isArray(nextState?.exitWaterfall) ? nextState.exitWaterfall.map((item) => ({ ...item })) : null;
  return merged;
}

function dedupe(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

function emptyResult() {
  return {
    scenarioId: null,
    scenarioName: '',
    stageResults: [],
    capTable: [],
    totalShares: 0,
    exitWaterfall: null,
    warnings: []
  };
}
