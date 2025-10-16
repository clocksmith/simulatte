export const ExitStage = {
  type: 'EXIT',
  label: 'Exit Event',
  defaults: () => ({
    salePrice: 250000000,
    mode: 'M&A'
  }),
  fields: [
    { key: 'salePrice', label: 'Sale Price ($)', type: 'currency' },
    { key: 'mode', label: 'Exit Type', type: 'select', options: [
      { label: 'M&A (1x non-participating)', value: 'M&A' },
      { label: 'IPO (price per share)', value: 'IPO' }
    ] },
    { key: 'ipoPricePerShare', label: 'IPO Price/Share ($)', type: 'currency' }
  ],
  simulate({ stage, priorState }) {
    const state = priorState;
    const params = stage.params || {};

    if (!state.totalShares) {
      state.warnings.push('No shares outstanding at exit.');
      return state;
    }

    const salePrice = Number(params.salePrice) || 0;
    const mode = params.mode || 'M&A';
    const pricePerShare = mode === 'IPO'
      ? Number(params.ipoPricePerShare) || 0
      : (state.totalShares > 0 ? salePrice / state.totalShares : 0);

    const waterfall = state.capTable.map((row) => ({
      stakeholder: row.label,
      shares: row.shares,
      payout: pricePerShare * (Number(row.shares) || 0)
    }));

    state.exitWaterfall = waterfall;
    state.math.push(
      mode === 'IPO'
        ? `IPO reference price $${pricePerShare.toFixed(2)} applied to ${state.totalShares.toLocaleString()} shares.`
        : `Exit sale $${salePrice.toLocaleString()} → implied price/share $${pricePerShare.toFixed(4)}.`
    );

    return state;
  }
};
