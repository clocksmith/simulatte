import { generateId } from '../../utils.js';

export const PreMoneySafeStage = {
  type: 'PRE_MONEY_SAFE',
  label: 'Pre-Money SAFE',
  defaults: () => ({
    investorName: 'SAFE Investor',
    investment: 200000,
    discount: 0.2,
    valuationCap: 6000000,
    holderId: generateId('holder'),
    specialRights: {
      superProRata: {
        enabled: false,
        rounds: 1,
        amount: 150000
      }
    }
  }),
  fields: [
    { key: 'investorName', label: 'Investor Name', type: 'text' },
    { key: 'investment', label: 'Investment ($)', type: 'currency' },
    { key: 'discount', label: 'Discount %', type: 'percent', min: 0, max: 0.8, step: 0.05 },
    { key: 'valuationCap', label: 'Valuation Cap ($)', type: 'currency' },
    { key: 'specialRights.superProRata.enabled', label: 'Super Pro-Rata Rights', type: 'checkbox' },
    { key: 'specialRights.superProRata.rounds', label: 'Reinvestment Rounds', type: 'number', min: 0, step: 1 },
    { key: 'specialRights.superProRata.amount', label: 'Fixed Reinvestment ($)', type: 'currency' }
  ],
  simulate({ stage, priorState }) {
    const state = priorState;
    const params = stage.params || {};

    const investment = Number(params.investment) || 0;
    const discount = clampPercent(params.discount);
    const valuationCap = Number(params.valuationCap) || 0;

    state.instruments.preSafes.push({
      id: generateId('safe'),
      stageId: stage.id,
      holderId: params.holderId || generateId('holder'),
      holderName: params.investorName || 'SAFE Investor',
      investment,
      discount,
      valuationCap,
      specialRights: normalizeSuperProRata(params.specialRights)
    });

    state.math.push(
      `Logged pre-money SAFE $${investment.toLocaleString()} with ${formatPercent(discount)} discount and $${valuationCap.toLocaleString()} valuation cap.`
    );

    state.ledgerEntries.push({
      stageId: stage.id,
      type: 'SAFE_PRE_MONEY',
      payload: {
        investor: params.investorName,
        investment,
        discount,
        valuationCap
      }
    });

    return state;
  }
};

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(Math.max(numeric, 0), 0.9);
}

function formatPercent(value) {
  const percent = Number(value) * 100;
  if (!Number.isFinite(percent)) return '0%';
  return `${percent.toFixed(1)}%`;
}

function normalizeSuperProRata(config = {}) {
  const enabled = Boolean(config?.superProRata?.enabled || config?.enabled);
  const meta = config.superProRata || config;
  return {
    enabled,
    roundsRemaining: enabled ? Math.max(0, Number(meta.rounds ?? meta.roundsRemaining ?? 0)) : 0,
    amount: enabled ? Math.max(0, Number(meta.amount) || 0) : 0
  };
}
