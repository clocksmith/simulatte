import { structuredCopy } from '../utils.js';

export function createBaseState() {
  return {
    capTable: [],
    totalShares: 0,
    ledgerEntries: [],
    math: [],
    warnings: [],
    instruments: {
      notes: [],
      preSafes: [],
      postSafes: []
    }
  };
}

export function cloneState(priorState = createBaseState()) {
  return {
    capTable: Array.isArray(priorState.capTable)
      ? priorState.capTable.map((row) => ({ ...row }))
      : [],
    totalShares: Number(priorState.totalShares) || 0,
    ledgerEntries: [],
    math: [],
    warnings: [],
    instruments: {
      notes: cloneList(priorState.instruments?.notes),
      preSafes: cloneList(priorState.instruments?.preSafes),
      postSafes: cloneList(priorState.instruments?.postSafes)
    },
    exitWaterfall: null
  };
}

function cloneList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => structuredCopy(item));
}
