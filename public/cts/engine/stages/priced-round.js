import { generateId } from '../../utils.js';

export const PricedRoundStage = {
  type: 'PRICED_ROUND',
  label: 'Priced Round',
  defaults: () => ({
    roundName: 'Series A',
    investment: 8000000,
    postMoneyValuation: 32000000,
    investorName: 'Series A Lead',
    securityClass: 'Preferred A',
    holderId: generateId('investor'),
    optionPoolRefresh: {
      enabled: true,
      targetPercent: 0.15
    }
  }),
  fields: [
    { key: 'roundName', label: 'Round Name', type: 'text' },
    { key: 'investorName', label: 'Lead Investor', type: 'text' },
    { key: 'investment', label: 'New Investment ($)', type: 'currency' },
    { key: 'postMoneyValuation', label: 'Post-Money Valuation ($)', type: 'currency' },
    { key: 'securityClass', label: 'Security Class', type: 'text' },
    { key: 'optionPoolRefresh.enabled', label: 'Refresh Option Pool', type: 'checkbox' },
    { key: 'optionPoolRefresh.targetPercent', label: 'Target Pool %', type: 'percent', min: 0, max: 0.4, step: 0.01 }
  ],
  simulate({ stage, priorState }) {
    const state = priorState;
    const params = stage.params || {};

    const baseShares = Number(state.totalShares) || 0;
    const baseCapTable = state.capTable;

    const baseMath = [];
    const warnings = [];

    const roundInvestment = Number(params.investment) || 0;
    const postMoneyValuation = Number(params.postMoneyValuation) || 0;

    const rightsContributions = gatherRightsContributions(state.instruments);
    const totalRightsInvestment = rightsContributions.reduce((sum, right) => sum + right.amount, 0);
    const totalNewCash = roundInvestment + totalRightsInvestment;
    const preMoneyValuation = Math.max(0, postMoneyValuation - totalNewCash);

    const preMoneyPrice = baseShares > 0 ? preMoneyValuation / baseShares : 0;
    if (!preMoneyPrice) {
      warnings.push('Unable to derive pre-money price; check prior shares and valuations.');
    }

    const conversionSummary = convertInstruments({
      state,
      preMoneyPrice,
      preMoneyShares: baseShares,
      preMoneyValuation
    });

    const totalPreMoneyShares = baseShares + conversionSummary.convertedShares;
    const sharePrice = totalPreMoneyShares > 0 ? preMoneyValuation / totalPreMoneyShares : 0;

    if (!sharePrice || !Number.isFinite(sharePrice)) {
      warnings.push('Share price not computable; review valuation and stage inputs.');
    }

    const primaryInvestorShares = sharePrice > 0 ? Math.round(roundInvestment / sharePrice) : 0;
    if (primaryInvestorShares > 0) {
      applyShares(baseCapTable, {
        holderId: stage.params?.holderId || generateId('investor'),
        holderName: params.investorName || params.roundName || 'New Investor',
        shareClass: params.securityClass || 'Preferred',
        shares: primaryInvestorShares
      });
    }

    const rightsShareMath = [];
    rightsContributions.forEach((right) => {
      const shares = sharePrice > 0 ? Math.round(right.amount / sharePrice) : 0;
      if (shares <= 0) return;
      applyShares(baseCapTable, {
        holderId: right.holderId,
        holderName: right.holderName,
        shareClass: params.securityClass || 'Preferred',
        shares
      });
      rightsShareMath.push(`${right.holderName} exercises super pro-rata for $${right.amount.toLocaleString()} → ${shares.toLocaleString()} shares.`);
    });

    const optionMath = handleOptionPoolRefresh(baseCapTable, {
      enabled: Boolean(params.optionPoolRefresh?.enabled),
      targetPercent: Number(params.optionPoolRefresh?.targetPercent) || 0,
      sharePrice
    });

    state.totalShares = baseCapTable.reduce((sum, row) => sum + (Number(row.shares) || 0), 0);
    normalizePercents(baseCapTable, state.totalShares);

    baseMath.push(
      `${params.roundName || 'Round'} priced at $${postMoneyValuation.toLocaleString()} post-money → $${preMoneyValuation.toLocaleString()} pre-money.`,
      `Pre-money share price $${sharePrice.toFixed(4)} from ${totalPreMoneyShares.toLocaleString()} pre-money shares.`,
      primaryInvestorShares > 0
        ? `${params.investorName || 'Lead'} invests $${roundInvestment.toLocaleString()} for ${primaryInvestorShares.toLocaleString()} shares.`
        : 'No primary investment recorded.'
    );

    baseMath.push(...conversionSummary.math);
    baseMath.push(...rightsShareMath);
    if (optionMath) baseMath.push(optionMath);

    state.math = baseMath;
    state.warnings = warnings.concat(conversionSummary.warnings);

    state.ledgerEntries.push({
      stageId: stage.id,
      type: 'PRICED_ROUND',
      payload: {
        roundName: params.roundName,
        investment: roundInvestment,
        sharePrice,
        sharesIssued: primaryInvestorShares + rightsContributions.reduce((sum, right) => {
          return sum + (sharePrice > 0 ? Math.round(right.amount / sharePrice) : 0);
        }, 0)
      }
    });

    // Clear converted instruments; rights consumed for this round only.
    state.instruments.notes = [];
    state.instruments.preSafes = [];
    state.instruments.postSafes = [];

    if (rightsContributions.some((entry) => entry.roundsRemaining > 0)) {
      state.warnings.push('Super pro-rata rights remaining require manual tracking after conversion.');
    }

    return state;
  }
};

function gatherRightsContributions(instruments) {
  const rights = [];
  const collections = [instruments?.notes, instruments?.preSafes, instruments?.postSafes];
  collections.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((instrument) => {
      const right = instrument.specialRights;
      if (!right?.enabled || !(right.roundsRemaining > 0) || !(right.amount > 0)) return;
      rights.push({
        holderId: instrument.holderId,
        holderName: instrument.holderName,
        amount: Number(right.amount) || 0,
        roundsRemaining: right.roundsRemaining - 1
      });
      right.roundsRemaining = Math.max(0, right.roundsRemaining - 1);
    });
  });
  return rights;
}

function convertInstruments({ state, preMoneyPrice, preMoneyShares, preMoneyValuation }) {
  const math = [];
  const warnings = [];
  let convertedShares = 0;

  const append = (holderId, holderName, shareClass, shares) => {
    applyShares(state.capTable, { holderId, holderName, shareClass, shares });
    convertedShares += shares;
  };

  state.instruments.notes.forEach((note) => {
    const principal = Number(note.principal) || 0;
    const interest = principal * (Number(note.interestRate) || 0) * (Number(note.accrualYears) || 0);
    const total = principal + interest;
    const price = selectConversionPrice({
      preMoneyPrice,
      preMoneyShares,
      valuationCap: note.valuationCap,
      discount: note.discount
    });
    const shares = price > 0 ? Math.round(total / price) : 0;
    if (!shares) {
      warnings.push(`Convertible note for ${note.holderName} unable to convert; check price inputs.`);
      return;
    }
    append(note.holderId, note.holderName, 'Preferred Bridge', shares);
    math.push(`${note.holderName} note ($${principal.toLocaleString()} + $${interest.toLocaleString()} interest) converts at $${price.toFixed(4)} for ${shares.toLocaleString()} shares.`);
  });

  state.instruments.preSafes.forEach((safe) => {
    const investment = Number(safe.investment) || 0;
    const price = selectConversionPrice({
      preMoneyPrice,
      preMoneyShares,
      valuationCap: safe.valuationCap,
      discount: safe.discount
    });
    const shares = price > 0 ? Math.round(investment / price) : 0;
    if (!shares) {
      warnings.push(`Pre-money SAFE for ${safe.holderName} unable to convert; check valuation inputs.`);
      return;
    }
    append(safe.holderId, safe.holderName, 'SAFE', shares);
    math.push(`${safe.holderName} SAFE ($${investment.toLocaleString()}) converts at $${price.toFixed(4)} for ${shares.toLocaleString()} shares.`);
  });

  let postSafeSharesTotal = 0;
  state.instruments.postSafes.forEach((safe) => {
    const targetPercent = Number(safe.targetPercent) || 0;
    if (!(targetPercent > 0 && targetPercent < 0.9)) {
      warnings.push(`Post-money SAFE for ${safe.holderName} missing valid target percent.`);
      return;
    }
    const base = preMoneyShares + convertedShares + postSafeSharesTotal;
    const shares = Math.round((targetPercent / (1 - targetPercent)) * base);
    if (!shares) {
      warnings.push(`Post-money SAFE for ${safe.holderName} unable to derive share count.`);
      return;
    }
    postSafeSharesTotal += shares;
    append(safe.holderId, safe.holderName, 'SAFE (Post)', shares);
    math.push(`${safe.holderName} post-money SAFE targets ${formatPercent(targetPercent)} → ${shares.toLocaleString()} shares.`);
  });

  return { convertedShares, math, warnings };
}

function selectConversionPrice({ preMoneyPrice, preMoneyShares, valuationCap, discount }) {
  const prices = [];
  if (preMoneyPrice > 0) prices.push(preMoneyPrice);
  if (valuationCap > 0 && preMoneyShares > 0) {
    prices.push(valuationCap / preMoneyShares);
  }
  if (discount > 0 && preMoneyPrice > 0) {
    prices.push(preMoneyPrice * (1 - discount));
  }
  const filtered = prices.filter((price) => Number.isFinite(price) && price > 0);
  if (!filtered.length) return 0;
  return Math.min(...filtered);
}

function handleOptionPoolRefresh(capTable, { enabled, targetPercent, sharePrice }) {
  if (!enabled || !(targetPercent > 0 && targetPercent < 0.75)) return '';
  const poolRows = capTable.filter((row) => row.class === 'Option Pool');
  const existingPool = poolRows.reduce((sum, row) => sum + (Number(row.shares) || 0), 0);
  const nonPoolShares = capTable
    .filter((row) => row.class !== 'Option Pool')
    .reduce((sum, row) => sum + (Number(row.shares) || 0), 0);
  const desiredPool = Math.round(nonPoolShares * targetPercent / (1 - targetPercent));
  const topUp = Math.max(0, desiredPool - existingPool);
  if (!topUp) {
    return `Option pool already at ${(targetPercent * 100).toFixed(1)}%.`;
  }
  if (poolRows.length) {
    poolRows[0].shares += topUp;
  } else {
    capTable.push({
      id: generateId('esop'),
      label: 'Option Pool',
      class: 'Option Pool',
      shares: topUp,
      percent: 0
    });
  }
  return `Option pool refreshed to ${(targetPercent * 100).toFixed(1)}% via ${topUp.toLocaleString()} new options.`;
}

function applyShares(capTable, { holderId, holderName, shareClass, shares }) {
  if (!(shares > 0)) return;
  let row = capTable.find((entry) => entry.id === holderId);
  if (!row) {
    row = {
      id: holderId || generateId('holder'),
      label: holderName || 'Stakeholder',
      class: shareClass || 'Preferred',
      shares: 0,
      percent: 0
    };
    capTable.push(row);
  }
  row.label = holderName || row.label;
  row.class = shareClass || row.class;
  row.shares += shares;
}

function normalizePercents(capTable, totalShares) {
  if (!(totalShares > 0)) return;
  capTable.forEach((row) => {
    row.percent = (row.shares || 0) / totalShares;
  });
}

function formatPercent(value) {
  const numeric = Number(value) * 100;
  if (!Number.isFinite(numeric)) return '0%';
  return `${numeric.toFixed(2)}%`;
}
