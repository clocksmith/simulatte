import { generateId } from '../../utils.js';

export const PostMoneySafeStage = {
  type: 'POST_MONEY_SAFE',
  label: 'Post-Money SAFE',
  defaults: () => ({
    investorName: 'SAFE Investor',
    investment: 250000,
    postMoneyValuation: 8000000,
    holderId: generateId('holder'),
    specialRights: {
      superProRata: {
        enabled: false,
        rounds: 1,
        amount: 200000
      }
    }
  }),
  fields: [
    { key: 'investorName', label: 'Investor Name', type: 'text' },
    { key: 'investment', label: 'Investment ($)', type: 'currency' },
    { key: 'postMoneyValuation', label: 'Post-Money Valuation ($)', type: 'currency' },
    { key: 'specialRights.superProRata.enabled', label: 'Super Pro-Rata Rights', type: 'checkbox' },
    { key: 'specialRights.superProRata.rounds', label: 'Reinvestment Rounds', type: 'number', min: 0, step: 1 },
    { key: 'specialRights.superProRata.amount', label: 'Fixed Reinvestment ($)', type: 'currency' }
  ],
  simulate({ stage, priorState }) {
    const state = priorState;
    const params = stage.params || {};

    const investment = Number(params.investment) || 0;
    const postMoneyValuation = Number(params.postMoneyValuation) || 0;
    const targetPercent = postMoneyValuation > 0 ? investment / postMoneyValuation : 0;

    state.instruments.postSafes.push({
      id: generateId('safe'),
      stageId: stage.id,
      holderId: params.holderId || generateId('holder'),
      holderName: params.investorName || 'SAFE Investor',
      investment,
      postMoneyValuation,
      targetPercent,
      specialRights: normalizeSuperProRata(params.specialRights)
    });

    state.math.push(
      `Logged post-money SAFE $${investment.toLocaleString()} targeting ${formatPercent(targetPercent)} ownership at $${postMoneyValuation.toLocaleString()} valuation.`
    );

    state.ledgerEntries.push({
      stageId: stage.id,
      type: 'SAFE_POST_MONEY',
      payload: {
        investor: params.investorName,
        investment,
        targetPercent
      }
    });

    return state;
  }
};

function formatPercent(value) {
  const numeric = Number(value) * 100;
  if (!Number.isFinite(numeric)) return '0%';
  return `${numeric.toFixed(2)}%`;
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
