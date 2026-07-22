(function attachMaritimeEmissions(root, factory) {
  const api = factory();
  root.MaritimeTradeEmissions = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeEmissionsModule() {
  function computeEeei(fuelTons, distanceNm, cargoTeu) {
    const co2Tons = fuelTons * 3.114; // IMO carbon factor for HFO/MGO
    const eeiGramCo2PerTeuNm = (co2Tons * 1e6) / (cargoTeu * distanceNm);
    return {
      co2Tons,
      eeiGramCo2PerTeuNm
    };
  }

  return Object.freeze({ computeEeei });
});
