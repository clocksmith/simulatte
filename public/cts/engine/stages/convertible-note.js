import { generateId } from '../../utils.js';

export const ConvertibleNoteStage = {
  type: 'CONVERTIBLE_NOTE',
  label: 'Convertible Note',
  defaults: () => ({
    investorName: 'Angel Investor',
    principal: 250000,
    interestRate: 0.05,
    accrualYears: 1,
    valuationCap: 6000000,
    discount: 0.2,
    holderId: generateId('holder'),
    specialRights: {
      superProRata: {
        enabled: false,
        rounds: 2,
        amount: 250000
      }
    }
  }),
  fields: [
    { key: 'investorName', label: 'Investor Name', type: 'text' },
    { key: 'principal', label: 'Principal ($)', type: 'currency' },
    { key: 'interestRate', label: 'Interest Rate %', type: 'percent', min: 0, max: 0.3, step: 0.01 },
    { key: 'accrualYears', label: 'Accrual Years', type: 'number', min: 0, step: 0.25 },
    { key: 'valuationCap', label: 'Valuation Cap ($)', type: 'currency' },
    { key: 'discount', label: 'Discount %', type: 'percent', min: 0, max: 0.8, step: 0.05 },
    { key: 'specialRights.superProRata.enabled', label: 'Super Pro-Rata Rights', type: 'checkbox' },
    { key: 'specialRights.superProRata.rounds', label: 'Reinvestment Rounds', type: 'number', min: 0, step: 1 },
    { key: 'specialRights.superProRata.amount', label: 'Fixed Reinvestment ($)', type: 'currency' }
  ],
  simulate({ stage, priorState }) {
    const state = priorState;
    const params = stage.params || {};

    const principal = Number(params.principal) || 0;
    const rate = clampPercent(params.interestRate);
    const years = Number(params.accrualYears) || 0;
    const accruedInterest = principal * rate * years;

    const holderId = stage.params?.holderId || generateId('holder');

    state.instruments.notes.push({
      id: generateId('note'),
      stageId: stage.id,
      holderId,
      holderName: params.investorName || 'Note Investor',
      principal,
      interestRate: rate,
      accrualYears: years,
      valuationCap: Number(params.valuationCap) || 0,
      discount: clampPercent(params.discount),
      specialRights: normalizeSuperProRata(params.specialRights)
    });

    state.math.push(
      `Recorded convertible note $${principal.toLocaleString()} @ ${(rate * 100).toFixed(1)}% over ${years.toFixed(2)} years. ` +
      `Accrued simple interest $${accruedInterest.toLocaleString()} (deferred until conversion).`
    );

    state.ledgerEntries.push({
      stageId: stage.id,
      type: 'NOTE_ISSUED',
      payload: {
        investor: params.investorName,
        principal,
        interestRate: rate,
        accrualYears: years
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

function normalizeSuperProRata(config = {}) {
  const enabled = Boolean(config?.superProRata?.enabled || config?.enabled);
  const meta = config.superProRata || config;
  return {
    enabled,
    roundsRemaining: enabled ? Math.max(0, Number(meta.rounds ?? meta.roundsRemaining ?? 0)) : 0,
    amount: enabled ? Math.max(0, Number(meta.amount) || 0) : 0
  };
}
