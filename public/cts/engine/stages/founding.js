import { createBaseState } from '../state.js';
import { generateId } from '../../utils.js';

export const FoundingStage = {
  type: 'FOUNDING',
  label: 'Founding',
  defaults: () => ({
    companyName: 'NewCo',
    totalAuthorizedShares: 10000000,
    esopPercent: 0.1,
    founders: [
      { id: generateId('founder'), name: 'Founder 1', shares: 6000000 },
      { id: generateId('founder'), name: 'Founder 2', shares: 3000000 }
    ]
  }),
  fields: [
    { key: 'companyName', label: 'Company Name', type: 'text' },
    { key: 'totalAuthorizedShares', label: 'Authorized Shares', type: 'number', min: 0, step: 1000 },
    { key: 'esopPercent', label: 'Target ESOP %', type: 'percent', min: 0, max: 0.5, step: 0.01 },
    { key: 'founders', label: 'Founders (name=shares per line)', type: 'founder-list' }
  ],
  simulate({ stage }) {
    const params = stage.params || {};
    const state = createBaseState();

    const founders = normalizeFounders(params.founders);
    const totalExplicitShares = founders.reduce((sum, founder) => sum + founder.shares, 0);
    const esopPercent = clampPercent(params.esopPercent ?? 0.1);
    const esopShares = esopPercent > 0
      ? Math.round(totalExplicitShares * esopPercent / (1 - esopPercent))
      : 0;
    const totalShares = totalExplicitShares + esopShares;

    state.capTable = founders.map((founder) => ({
      id: founder.id || generateId('founder'),
      label: founder.name || 'Founder',
      class: 'Common',
      shares: founder.shares,
      percent: totalShares ? founder.shares / totalShares : 0
    }));

    if (esopShares > 0) {
      state.capTable.push({
        id: generateId('esop'),
        label: 'ESOP',
        class: 'Option Pool',
        shares: esopShares,
        percent: totalShares ? esopShares / totalShares : 0
      });
    }

    state.totalShares = totalShares;
    state.math = [
      `Founders receive ${totalExplicitShares.toLocaleString()} shares.`,
      esopShares > 0
        ? `ESOP sized to ${(esopPercent * 100).toFixed(1)}% → ${esopShares.toLocaleString()} shares.`
        : 'No ESOP target specified; pool remains empty.',
      `Total outstanding shares: ${totalShares.toLocaleString()}.`
    ];

    if (!totalShares) {
      state.warnings.push('Founding stage has zero shares configured.');
    }

    return state;
  }
};

function normalizeFounders(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return [
      { id: generateId('founder'), name: 'Founder 1', shares: 6000000 },
      { id: generateId('founder'), name: 'Founder 2', shares: 3000000 }
    ];
  }
  return input
    .map((founder) => ({
      id: founder.id || generateId('founder'),
      name: founder.name || 'Founder',
      shares: Number(founder.shares) || 0
    }))
    .filter((founder) => founder.shares >= 0);
}

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(Math.max(numeric, 0), 0.9);
}
