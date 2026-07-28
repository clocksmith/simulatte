(function attachNycRealEstateSectorModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNycRealEstateSectorModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNycRealEstateSectorModel() {
  const PROFILES = Object.freeze({
    'tax-class-1': Object.freeze({
      id: 'tax-class-1',
      label: 'one-to-three-family residential',
      developmentKind: 'small-residential-units',
      occupancyKind: 'dwelling-units',
      capacityUnit: 'units',
      allowsAffordableUnits: false,
      capacityForSite(site) {
        const units = Math.max(0, Math.min(3, Number(site.potentialResidentialUnitsClass1 || 0)));
        return {
          capacityValue: units,
          units,
          floorAreaSquareFeet: Math.max(0, Number(site.potentialResidentialFloorAreaSquareFeet || 0)),
        };
      },
    }),
    'tax-class-2': Object.freeze({
      id: 'tax-class-2',
      label: 'multifamily residential',
      developmentKind: 'multifamily-residential-units',
      occupancyKind: 'dwelling-units',
      capacityUnit: 'units',
      allowsAffordableUnits: true,
      capacityForSite(site) {
        const units = Math.max(0, Number(site.potentialResidentialUnitsClass2 || 0));
        return {
          capacityValue: units,
          units,
          floorAreaSquareFeet: Math.max(0, Number(site.potentialResidentialFloorAreaSquareFeet || 0)),
        };
      },
    }),
    'tax-class-4': Object.freeze({
      id: 'tax-class-4',
      label: 'commercial and industrial',
      developmentKind: 'commercial-floor-area',
      occupancyKind: 'commercial-floor-area',
      capacityUnit: 'square feet',
      allowsAffordableUnits: false,
      capacityForSite(site) {
        const floorAreaSquareFeet = Math.max(
          0,
          Number(site.potentialCommercialFloorAreaSquareFeet || 0)
        );
        return {
          capacityValue: floorAreaSquareFeet,
          units: 0,
          floorAreaSquareFeet,
        };
      },
    }),
    all: Object.freeze({
      id: 'all',
      label: 'all-class price proxy',
      developmentKind: 'unsupported-mixed-sector',
      occupancyKind: 'none',
      capacityUnit: null,
      allowsAffordableUnits: false,
      capacityForSite() {
        return { capacityValue: 0, units: 0, floorAreaSquareFeet: 0 };
      },
    }),
  });

  function profileFor(sectorId) {
    const profile = PROFILES[sectorId];
    if (!profile) throw sectorError('nyc_real_estate_sector_unknown', sectorId);
    return profile;
  }

  function selectCandidates(sites, sectorId) {
    const profile = profileFor(sectorId);
    if (sectorId === 'all') return [];
    return sites.flatMap((site) => {
      const capacity = profile.capacityForSite(site);
      return capacity.capacityValue > 0
        ? [{ site, ...capacity }]
        : [];
    });
  }

  function normalizedParameters(parameters) {
    const profile = profileFor(parameters.sectorId);
    return {
      ...parameters,
      affordableHousingSharePct: profile.allowsAffordableUnits
        ? parameters.affordableHousingSharePct
        : 0,
    };
  }

  function completedSupply(projects, year, sectorId) {
    const profile = profileFor(sectorId);
    const completed = projects.filter((row) => row.completionYear === year);
    return profile.capacityUnit === 'units'
      ? completed.reduce((sum, row) => sum + row.units, 0)
      : completed.reduce((sum, row) => sum + row.floorAreaSquareFeet, 0);
  }

  function sectorError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteNycRealEstateSectorError';
    error.code = code;
    return error;
  }

  return Object.freeze({
    PROFILES,
    completedSupply,
    normalizedParameters,
    profileFor,
    selectCandidates,
  });
});
