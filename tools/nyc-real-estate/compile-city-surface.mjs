export function createCitySurfaceArtifact({
  regions,
  saleRows,
  shardRows,
  sourceIdentities,
}) {
  const salesByRegion = new Map();
  saleRows.forEach((row) => {
    const rows = salesByRegion.get(row.regionId) || [];
    rows.push(row);
    salesByRegion.set(row.regionId, rows);
  });
  const coverageByRegion = new Map(
    shardRows.map((row) => [row.regionId, surfaceCoverage(row.coverage)])
  );
  return {
    schema: 'simulatte.nycRealEstateCitySurface.v1',
    id: 'nyc-real-estate-city-surface-2026-v1',
    contentVersion: '2026-07-27',
    snapshotDate: '2026-07-27',
    regions: regions.map((region) => ({
      id: region.id,
      label: region.label,
      abbreviation: region.abbreviation,
      boroughId: region.boroughId,
      boroughLabel: region.boroughLabel,
      centroid: region.centroid,
      bounds: region.bounds,
      polygon: region.polygon,
      saleSeries: (salesByRegion.get(region.id) || [])
        .slice()
        .sort((left, right) => left.year - right.year || left.sectorId.localeCompare(right.sectorId)),
      coverage: coverageByRegion.get(region.id),
    })),
    sourceIdentities,
    truth: {
      geometry: {
        origin: 'observed',
        temporalStatus: 'snapshot',
        uncertainty: {
          kind: 'missing',
          value: { reason: 'NTA boundary revisions are not represented as a statistical interval.' },
        },
      },
      prices: {
        origin: 'observed',
        temporalStatus: 'historical',
        uncertainty: {
          kind: 'missing',
          value: { reason: 'Annual administrative sale aggregates have no shared statistical error model.' },
        },
      },
    },
    claimBoundary: 'This compact surface preserves governed NTA geometry and annual nominal sale aggregates for citywide visualization. It contains no forecast values, parcel appraisals, live prices, or development-feasibility claims.',
  };
}

function surfaceCoverage(coverage) {
  return {
    saleRows: coverage.saleRows,
    saleYearsBySector: coverage.saleYearsBySector,
    priceForecastSupportedBySector: coverage.priceForecastSupportedBySector,
    sourceSampled: coverage.sourceSampled,
  };
}
