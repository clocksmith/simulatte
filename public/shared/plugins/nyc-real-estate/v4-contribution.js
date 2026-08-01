(function attachNycRealEstateV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNycRealEstateV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNycRealEstateV4(builder) {
  const PLUGIN_ID = 'nyc-real-estate';
  const MODEL_HASHES = Object.freeze({
    forecast: '9a0b9fa35a6eb3ba081fcb17e34d271924326c67cc8624bb51b3507ac279e237',
    statistics: '9d772eb897587edf847f42c1cde23ba1569ca3f5c86975e2d679f2fde88f7051',
    sector: 'be6f30d622cde56325f163fd7c92082723928f724c46244eee588b6f53a71ec8',
    comparison: '674ea3927e2c418b7de3f190ca81d25657e6a0d9dc480cf3be41304abc1ec1cb',
    priceSurface: '8cb13c2c6435dd58dd98d213a5a75f54201bf9b29bbdf351bff0932b152b1b68',
    governance: '4a6bc387b12322b14a58c3b9ec36ad70c81a7ff5ebd06ad4cb28ac134be3cf65',
  });
  const VISUAL_DETAIL_LIMITS = Object.freeze({
    historicalBuildings: 48,
    futureProjects: 32,
    milestoneLabels: 16,
    capacitySites: 48,
    comparisonProjectsPerBranch: 24,
  });

  function createContribution({
    datasets,
    dataReceipts,
    result,
    priceSurface,
    snapshot,
    playbackStatus = 'running',
    comparison = null,
  }) {
    requireBuilder();
    const records = dataReceipts.map((receipt) => builder.datasetRecord(
      receipt.datasetId,
      receipt,
      metadataFor(receipt.datasetId, datasets)
    ));
    const recordById = new Map(records.map((row) => [row.id, row]));
    const surfaceYear = priceSurface?.years?.find((row) => row.year === snapshot.year);
    if (!surfaceYear || surfaceYear.regions.length !== 262) {
      throw new Error(`nyc_real_estate_price_surface_year_missing: ${snapshot.year}`);
    }
    const modelRecords = [
      modelRecord(
        'forecast-engine',
        MODEL_HASHES.forecast,
        records,
        result,
        'deterministic 31-member conditional price and development ensemble'
      ),
      modelRecord(
        'forecast-statistics',
        MODEL_HASHES.statistics,
        records,
        result,
        'seeded sampling, percentiles, weighted medians, and stable identities'
      ),
      modelRecord(
        'sector',
        MODEL_HASHES.sector,
        records,
        result,
        'tax-class-specific capacity, units, floor area, and affordability rules'
      ),
      modelRecord(
        'comparison',
        MODEL_HASHES.comparison,
        records,
        result,
        'lockstep baseline and intervention execution with common exogenous draws'
      ),
      modelRecord(
        'price-surface',
        MODEL_HASHES.priceSurface,
        [recordById.get('nyc-real-estate-city-surface-2026-v1'), recordById.get('nyc-real-estate-model-governance-v1')],
        result,
        'deterministic 31-member neighborhood price-only surface with zero development-supply effect'
      ),
      modelRecord(
        'model-governance',
        MODEL_HASHES.governance,
        [recordById.get('nyc-real-estate-model-governance-v1')],
        result,
        'versioned model equations, policies, limitations, and release gates'
      ),
    ];
    const shardRecord = recordById.get(datasets.shard.id);
    const observed = provenance('observed', 'historical', {
      kind: 'missing',
      value: { reason: 'Administrative source records do not provide a shared statistical error model.' },
    }, [shardRecord]);
    const snapshotEvidence = provenance('observed', 'snapshot', {
      kind: 'missing',
      value: { reason: 'Mapped FAR is observed but development feasibility is not quantified.' },
    }, [shardRecord]);
    const modeledHistorical = provenance('modeled', 'historical', {
      kind: 'missing',
      value: { reason: 'Intermediate construction stages are interpolated between recorded milestones.' },
    }, [shardRecord, modelRecords.at(-1)]);
    const simulated = provenance('simulated', 'forecast', {
      kind: 'distribution',
      value: {
        ensembleSize: 31,
        interval: 'p10-p90',
        interpretation: 'Conditional scenario distribution, not an individual property appraisal.',
      },
    }, [modelRecords[0], modelRecords[1], modelRecords[2]]);
    const surfaceObserved = provenance('observed', 'historical', {
      kind: 'missing',
      value: { reason: 'Annual neighborhood sale medians do not include a shared statistical error model.' },
    }, [recordById.get('nyc-real-estate-city-surface-2026-v1')]);
    const surfaceSimulated = provenance('simulated', 'forecast', {
      kind: 'distribution',
      value: {
        ensembleSize: priceSurface.ensembleSize,
        interval: 'p10-p90',
        interpretation: priceSurface.claimBoundary,
      },
    }, [modelRecords.find((row) => row.id.endsWith(':price-surface'))]);
    const surfaceSnapshot = provenance('observed', 'snapshot', {
      kind: 'missing',
      value: { reason: 'No governed 2026 neighborhood sale-price aggregate is present.' },
    }, [recordById.get('nyc-real-estate-city-surface-2026-v1')]);
    const surfaceUnsupported = provenance('derived', 'forecast', {
      kind: 'missing',
      value: { reason: 'Forecast refused because the governed neighborhood price history is insufficient.' },
    }, [recordById.get('nyc-real-estate-city-surface-2026-v1'), modelRecords.find((row) => row.id.endsWith(':price-surface'))]);
    const layers = createLayers({
      result,
      surfaceYear,
      snapshot,
      observed,
      surfaceObserved,
      surfaceSimulated,
      surfaceSnapshot,
      surfaceUnsupported,
      snapshotEvidence,
      modeledHistorical,
      simulated,
      comparison,
    });
    const events = result.events.map((row) => builder.event({
      id: row.id,
      pluginId: PLUGIN_ID,
      sequence: row.sequence,
      simulationTimeMs: row.simulationTimeMs,
      kind: row.kind,
      causationIds: row.causationIds,
      correlationId: result.scenarioIdentity,
      payload: row.payload,
      provenance: row.kind.includes('forecast')
        ? simulated
        : observed,
    }));
    const currentEvent = events.find((row) => row.id === snapshot.eventIds[0]) || null;
    const surfaceTargets = layers
      .filter((row) => row.id.startsWith('price-surface:'))
      .map((row) => row.id);
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'wgs84',
      epoch: `${snapshot.year}-12-31T23:59:59Z`,
      layers,
      viewIntents: [
        builder.viewIntent({
          id: `nyc-development-view:${snapshot.id}`,
          mode: 'overview',
          targetIds: surfaceTargets.length
                ? surfaceTargets
                : ['selected-region'],
          reasonEventId: currentEvent?.id || null,
          priority: 82,
        }),
      ],
    });
    const controlEvidence = snapshot.phase === 'scenario-forecast' ? simulated : observed;
    const controls = builder.controls(
      createControls(datasets, result.parameters, controlEvidence),
      [{
        id: 'business-as-usual-vs-selected-policy',
        label: 'Business as usual vs selected development policy',
        baselineScenarioId: `${result.scenarioId}:business-as-usual`,
        variantScenarioId: `${result.scenarioId}:${result.parameters.policyId}`,
        synchronizedClock: true,
      }]
    );
    const priceMeasures = snapshot.price.p50Usd === null ? [] : [
      builder.quantity('median-sale-price', snapshot.price.p50Usd, 'nominal USD'),
      builder.quantity('price-interval-lower', snapshot.price.p10Usd, 'nominal USD'),
      builder.quantity('price-interval-upper', snapshot.price.p90Usd, 'nominal USD'),
    ];
    const progressiveState = builder.state({
      id: snapshot.id,
      pluginId: PLUGIN_ID,
      simulationTimeMs: snapshot.simulationTimeMs,
      status: snapshot.status,
      previousStateId: previousSnapshotId(result, snapshot),
      eventIds: snapshot.eventIds,
      measures: [
        builder.quantity('calendar-year', snapshot.year, 'year'),
        ...priceMeasures,
        builder.quantity('neighborhoods-priced', surfaceYear.availableRegionCount, 'neighborhoods'),
        builder.quantity('neighborhoods-missing-price', surfaceYear.missingRegionCount, 'neighborhoods'),
        ...(surfaceYear.domainUsd
          ? [
            builder.quantity('heat-scale-low', surfaceYear.domainUsd[0], 'nominal USD'),
            builder.quantity('heat-scale-high', surfaceYear.domainUsd[1], 'nominal USD'),
          ]
          : []),
        builder.quantity('new-building-filings', snapshot.metrics.filingCount, 'filings'),
        builder.quantity('active-scenario-projects', snapshot.metrics.activeProjects, 'projects'),
        ...(result.sectorProfile.capacityUnit === 'square feet'
          ? [builder.quantity(
            'completed-scenario-floor-area',
            snapshot.metrics.cumulativeCompletedFloorAreaSquareFeet,
            'square feet'
          )]
          : [builder.quantity(
            'completed-scenario-units',
            snapshot.metrics.cumulativeCompletedUnits,
            'units'
          )]),
        ...(result.sectorProfile.allowsAffordableUnits
          ? [builder.quantity(
            'affordable-scenario-units',
            snapshot.metrics.cumulativeAffordableUnits,
            'units'
          )]
          : []),
      ],
      provenance: snapshot.phase === 'scenario-forecast' ? simulated : observed,
    });
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation,
      events,
      controls,
      state: progressiveState,
      inspections: createInspections(
        result,
        surfaceYear,
        snapshot,
        observed,
        surfaceObserved,
        surfaceSimulated,
        surfaceSnapshot,
        surfaceUnsupported,
        snapshotEvidence,
        modeledHistorical,
        simulated,
        comparison
      ),
      provenanceRecords: [...records, ...modelRecords],
    });
  }

  function createLayers({
    result,
    surfaceYear,
    snapshot,
    observed,
    surfaceObserved,
    surfaceSimulated,
    surfaceSnapshot,
    surfaceUnsupported,
    snapshotEvidence,
    modeledHistorical,
    simulated,
    comparison,
  }) {
    const milestoneTargetIds = new Set(snapshot.milestoneEvents.map((row) => row.targetLayerId));
    const historicalBuildingStates = boundedRows(
      snapshot.historicalBuildingStates,
      VISUAL_DETAIL_LIMITS.historicalBuildings,
      (row) => (milestoneTargetIds.has(`historical:${row.id}`) ? 1_000_000 : 0) + row.targetHeightM
    );
    const futureProjectStates = boundedRows(
      snapshot.futureProjectStates,
      VISUAL_DETAIL_LIMITS.futureProjects,
      (row) => (milestoneTargetIds.has(`future:${row.id}`) ? 1_000_000 : 0) + row.heightM
    );
    const visibleBuildingIds = new Set([
      ...historicalBuildingStates.map((row) => `historical:${row.id}`),
      ...futureProjectStates.map((row) => `future:${row.id}`),
    ]);
    const milestoneEvents = boundedRows(
      snapshot.milestoneEvents.filter((row) => visibleBuildingIds.has(row.targetLayerId)),
      VISUAL_DETAIL_LIMITS.milestoneLabels,
      (row) => row.priority
    );
    const capacitySites = snapshot.year === 2026
      ? boundedRows(
        result.capacitySites,
        VISUAL_DETAIL_LIMITS.capacitySites,
        (row) => capacityValue(row, result.sectorProfile)
      )
      : [];
    const selectedSurface = surfaceYear.regions.find((row) => row.regionId === result.region.id);
    const priceQuantity = selectedSurface?.p50Usd === null
      ? builder.quantity('price-observation-available', 0, 'state', [0, 1])
      : builder.quantity(
        selectedSurface.status === 'observed' ? 'observed-neighborhood-median-sale-price' : 'forecast-neighborhood-median-sale-price',
        selectedSurface.p50Usd,
        'nominal USD',
        surfaceYear.domainUsd
      );
    const layers = [
      ...surfaceYear.regions.map((row) => builder.layer({
        id: `price-surface:${row.regionId}`,
        kind: 'field',
        label: `${row.label}, ${row.boroughLabel} · ${snapshot.year}`,
        geometry: builder.geometry('polygon', 'wgs84', row.polygon),
        quantity: Number.isFinite(row.p50Usd)
          ? builder.quantity(
            row.status === 'observed'
              ? 'observed-neighborhood-median-sale-price'
              : 'forecast-neighborhood-median-sale-price',
            row.p50Usd,
            'nominal USD',
            surfaceYear.domainUsd
          )
          : builder.quantity('neighborhood-price-availability', 0, 'state', [0, 1]),
        role: row.regionId === result.region.id ? 'primary' : 'context',
        importance: row.regionId === result.region.id ? 0.98 : 0.68,
        aggregationKey: `nyc-price-surface:${snapshot.year}`,
        provenance: surfaceProvenance(row, surfaceObserved, surfaceSimulated, surfaceSnapshot, surfaceUnsupported),
      })),
      builder.layer({
        id: 'selected-region',
        kind: 'field',
        label: `${result.region.label}, ${result.region.boroughLabel} · ${snapshot.year}`,
        geometry: builder.geometry('polygon', 'wgs84', result.region.polygon),
        quantity: priceQuantity,
        role: 'primary',
        importance: 0.92,
        aggregationKey: 'nyc-development-selected-region',
        provenance: surfaceProvenance(selectedSurface, surfaceObserved, surfaceSimulated, surfaceSnapshot, surfaceUnsupported),
      }),
      builder.layer({
        id: 'selected-region-label',
        kind: 'label',
        label: `${result.region.label} · ${snapshot.year}`,
        geometry: builder.geometry('point', 'wgs84', [[...result.region.centroid, 0]]),
        quantity: builder.quantity('calendar-year', snapshot.year, 'year', [2010, 2041]),
        role: 'primary',
        importance: 1,
        aggregationKey: null,
        provenance: snapshot.phase === 'scenario-forecast' ? simulated : observed,
      }),
      ...historicalBuildingStates.map((row) => builder.layer({
        id: `historical:${row.id}`,
        kind: 'volume',
        label: row.label,
        geometry: builder.geometry('polygon', 'wgs84', row.footprint),
        quantity: builder.quantity(
          `historical-building-${row.stage}`,
          row.visibleHeightM,
          'm',
          [0, Math.max(1, row.targetHeightM)]
        ),
        role: row.stage === 'completed' ? 'context' : 'event',
        importance: row.stage === 'completed' ? 0.45 : 0.82,
        aggregationKey: 'historical-building-replay',
        provenance: row.stageOrigin === 'observed' ? observed : modeledHistorical,
      })),
      ...futureProjectStates.map((row) => builder.layer({
        id: `future:${row.id}`,
        kind: 'volume',
        label: projectLabel(row),
        geometry: builder.geometry('polygon', 'wgs84', row.footprint),
        quantity: builder.quantity(
          'scenario-building-visible-height',
          row.visibleHeightM,
          'm',
          [0, Math.max(1, row.heightM)]
        ),
        role: row.stage === 'completed' ? 'primary' : 'event',
        importance: row.stage === 'completed' ? 0.76 : 0.96,
        aggregationKey: 'future-development-projects',
        provenance: simulated,
      })),
      ...milestoneEvents.map((row) => {
        const building = historicalBuildingStates.find((site) => (
          `historical:${site.id}` === row.targetLayerId
        )) || futureProjectStates.find((site) => (
          `future:${site.id}` === row.targetLayerId
        ));
        if (!building) return null;
        const coordinates = building.coordinates
          || polygonCentroid(building.footprint);
        return builder.layer({
          id: `milestone:${row.kind}:${row.id}`,
          kind: 'label',
          label: row.label,
          geometry: builder.geometry(
            'point',
            'wgs84',
            [[...coordinates, Math.max(1, building.visibleHeightM || 1)]]
          ),
          quantity: builder.quantity(
            `development-milestone-${row.kind}`,
            row.priority,
            'priority',
            [0, 100]
          ),
          role: 'event',
          importance: 1,
          aggregationKey: null,
          provenance: row.kind.startsWith('simulated')
            ? simulated
            : row.kind.startsWith('inferred')
              ? modeledHistorical
              : observed,
        });
      }).filter(Boolean),
      ...capacitySites.map((row) => builder.layer({
        id: `capacity:${row.id}`,
        kind: 'point',
        label: capacityLabel(row, result.sectorProfile),
        geometry: builder.geometry('point', 'wgs84', [[...row.coordinates, 0]]),
        quantity: builder.quantity(
          'mapped-development-capacity',
          capacityValue(row, result.sectorProfile),
          result.sectorProfile.capacityUnit || 'state',
          [0, Math.max(
            1,
            ...result.capacitySites.map((site) => capacityValue(site, result.sectorProfile))
          )]
        ),
        role: 'uncertainty',
        importance: 0.58,
        aggregationKey: 'development-capacity-candidates',
        provenance: snapshotEvidence,
      })),
      ...createComparisonLayers(result, comparison, simulated),
    ];
    return layers;
  }

  function createComparisonLayers(result, comparison, simulated) {
    if (!comparison?.branchEvidence) return [];
    const width = Math.max(0.001, result.region.bounds.east - result.region.bounds.west);
    return ['baseline', 'intervention'].flatMap((role, index) => {
      const branch = comparison.branchEvidence[role];
      if (!branch) return [];
      const longitudeOffset = width * (index ? 0.62 : -0.62);
      const terminalPrice = branch.terminal?.priceP50Usd;
      const regionId = `comparison:${role}:region`;
      return [
        builder.layer({
          id: regionId,
          kind: 'field',
          label: `${role === 'baseline' ? 'Baseline' : 'Selected policy'} · ${branch.policyId}`,
          geometry: builder.geometry(
            'polygon',
            'wgs84',
            shiftGeometry(result.region.polygon, longitudeOffset)
          ),
          quantity: Number.isFinite(terminalPrice)
            ? builder.quantity(
              `${role}-terminal-median-sale-price`,
              terminalPrice,
              'nominal USD',
              [0, terminalPrice * 1.2]
            )
            : builder.quantity(`${role}-price-forecast-available`, 0, 'state', [0, 1]),
          role: 'comparison',
          importance: 0.92,
          aggregationKey: `nyc-development-comparison-${role}`,
          provenance: simulated,
        }),
        builder.layer({
          id: `${regionId}:label`,
          kind: 'label',
          label: `${role === 'baseline' ? 'BASELINE' : 'INTERVENTION'} · ${branch.policyId}`,
          geometry: builder.geometry(
            'point',
            'wgs84',
            [[result.region.centroid[0] + longitudeOffset, result.region.centroid[1], 0]]
          ),
          quantity: builder.quantity(`${role}-branch`, index, 'branch', [0, 1]),
          role: 'comparison',
          importance: 1,
          aggregationKey: null,
          provenance: simulated,
        }),
        ...boundedRows(
          branch.projects,
          VISUAL_DETAIL_LIMITS.comparisonProjectsPerBranch,
          (project) => project.heightM
        ).map((project) => builder.layer({
          id: `comparison:${role}:${project.id}`,
          kind: 'volume',
          label: `${role} · ${projectLabel(project)}`,
          geometry: builder.geometry(
            'polygon',
            'wgs84',
            shiftGeometry(project.footprint, longitudeOffset)
          ),
          quantity: builder.quantity(
            `${role}-${project.developmentKind}`,
            project.heightM,
            'm',
            [0, Math.max(1, project.heightM)]
          ),
          role: 'comparison',
          importance: project.completionYear <= result.parameters.forecastEndYear ? 0.84 : 0.66,
          aggregationKey: `nyc-development-comparison-${role}-projects`,
          provenance: simulated,
        })),
      ];
    });
  }

  function createControls(datasets, values, evidence) {
    const regionOptions = datasets.index.regions
      .slice()
      .sort((left, right) => (
        left.boroughLabel.localeCompare(right.boroughLabel) || left.label.localeCompare(right.label)
      ))
      .map((row) => {
        const coverage = row.coverage;
        const priceSupported = coverage.priceForecastSupportedBySector[values.sectorId];
        const developmentSupported =
          coverage.developmentForecastSupportedBySector[values.sectorId];
        return option(
          row.id,
          `${row.boroughLabel} · ${row.label} · ${coverage.saleRows} sale rows · ${coverage.historicalSites} historical sites · ${coverage.capacityCandidates} capacity sites · ${priceSupported ? 'price ready' : 'no price forecast'} · ${developmentSupported ? 'development ready' : 'no development forecast'}`
        );
      });
    return [
      selectControl('regionId', 'Neighborhood area', values.regionId, regionOptions, evidence),
      selectControl('sectorId', 'Property tax class', values.sectorId, [
        option('tax-class-1', 'Tax class 1 · one-to-three family'),
        option('tax-class-2', 'Tax class 2 · residential rentals and condos'),
        option('tax-class-4', 'Tax class 4 · commercial and industrial'),
        option('all', 'All classes · weighted median proxy'),
      ], evidence),
      rangeControl('historicalStartYear', 'Historical replay begins', values.historicalStartYear, 2010, 2020, 1, evidence),
      rangeControl('forecastEndYear', 'Scenario forecast ends', values.forecastEndYear, 2030, 2040, 1, evidence),
      selectControl(
        'policyId',
        'Development policy',
        values.policyId,
        datasets.governance.policies.map((row) => option(row.id, row.label)),
        evidence
      ),
      rangeControl('financingRatePct', 'Development financing rate', values.financingRatePct, 2, 12, 0.25, evidence),
      rangeControl('annualDemandGrowthPct', 'Annual demand growth', values.annualDemandGrowthPct, -3, 6, 0.25, evidence),
      rangeControl('constructionCostIndex', 'Construction cost index', values.constructionCostIndex, 75, 175, 1, evidence),
      rangeControl('zoningCapacityMultiplier', 'Zoning capacity multiplier', values.zoningCapacityMultiplier, 0.5, 2, 0.05, evidence),
      ...(values.sectorId === 'tax-class-2'
        ? [rangeControl('affordableHousingSharePct', 'Affordable share of scenario units', values.affordableHousingSharePct, 0, 100, 5, evidence)]
        : []),
    ];
  }

  function createInspections(
    result,
    surfaceYear,
    snapshot,
    observed,
    surfaceObserved,
    surfaceSimulated,
    surfaceSnapshot,
    surfaceUnsupported,
    capacity,
    modeledHistorical,
    simulated,
    comparison
  ) {
    const priceFields = snapshot.price.p50Usd === null
      ? [field('price-status', 'Price record', 'No governed observation', null, observed)]
      : [
        field('price', 'Median sale price', snapshot.price.p50Usd, 'nominal USD', snapshot.price.status === 'observed' ? observed : simulated),
        field('price-lower', 'Interval lower', snapshot.price.p10Usd, 'nominal USD', snapshot.price.status === 'observed' ? observed : simulated),
        field('price-upper', 'Interval upper', snapshot.price.p90Usd, 'nominal USD', snapshot.price.status === 'observed' ? observed : simulated),
        field('price-basis', 'Price basis', snapshot.price.basis, null, snapshot.price.status === 'observed' ? observed : simulated),
        ...(snapshot.price.status === 'observed'
          ? [
            field('sale-count', 'Recorded sales', snapshot.price.saleCount, 'sales', observed),
            field('transferred-units', 'Recorded transferred units', snapshot.price.transferredUnits, 'units', observed),
          ]
          : []),
      ];
    const surfaceInspections = surfaceYear.regions.map((row) => ({
      id: `inspect:price-surface:${row.regionId}`,
      label: `${row.label}, ${row.boroughLabel} price surface`,
      targetIds: [`price-surface:${row.regionId}`],
      fields: [
        field('year', 'Calendar year', row.year, 'year', surfaceProvenance(row, surfaceObserved, surfaceSimulated, surfaceSnapshot, surfaceUnsupported)),
        field('status', 'Price status', row.status, null, surfaceProvenance(row, surfaceObserved, surfaceSimulated, surfaceSnapshot, surfaceUnsupported)),
        field('price', 'Median sale price', row.p50Usd ?? 'not available', Number.isFinite(row.p50Usd) ? 'nominal USD' : null, surfaceProvenance(row, surfaceObserved, surfaceSimulated, surfaceSnapshot, surfaceUnsupported)),
        field('interval-lower', 'Interval lower', row.p10Usd ?? 'not available', Number.isFinite(row.p10Usd) ? 'nominal USD' : null, surfaceProvenance(row, surfaceObserved, surfaceSimulated, surfaceSnapshot, surfaceUnsupported)),
        field('interval-upper', 'Interval upper', row.p90Usd ?? 'not available', Number.isFinite(row.p90Usd) ? 'nominal USD' : null, surfaceProvenance(row, surfaceObserved, surfaceSimulated, surfaceSnapshot, surfaceUnsupported)),
        field('sales', 'Recorded sales', row.saleCount ?? 'not applicable', Number.isFinite(row.saleCount) ? 'sales' : null, surfaceProvenance(row, surfaceObserved, surfaceSimulated, surfaceSnapshot, surfaceUnsupported)),
        field('basis', 'Price basis', row.basis ?? 'missing governed evidence', null, surfaceProvenance(row, surfaceObserved, surfaceSimulated, surfaceSnapshot, surfaceUnsupported)),
        field('boundary', 'Forecast boundary', row.status === 'scenario-forecast'
          ? 'Price-only scenario; neighborhood development-supply effect is not modeled'
          : 'Governed annual sale aggregate; not a parcel appraisal', null, surfaceProvenance(row, surfaceObserved, surfaceSimulated, surfaceSnapshot, surfaceUnsupported)),
      ],
    }));
    return [{
      id: 'selected-region-summary',
      label: `${result.region.label} timeline`,
      targetIds: ['selected-region'],
      fields: [
        field('year', 'Calendar year', snapshot.year, 'year', snapshot.phase === 'scenario-forecast' ? simulated : observed),
        ...priceFields,
        field('filings', 'New-building filings', snapshot.metrics.filingCount, 'filings', observed),
        field('proposed-area', 'Filed proposed zoning area', snapshot.development.proposedZoningSquareFeet, 'square feet', observed),
        field('active', 'Active scenario projects', snapshot.metrics.activeProjects, 'projects', simulated),
        field('units', 'Completed scenario units', snapshot.metrics.cumulativeCompletedUnits, 'units', simulated),
        field('floor-area', 'Completed scenario floor area', snapshot.metrics.cumulativeCompletedFloorAreaSquareFeet, 'square feet', simulated),
        field(
          'visual-detail-boundary',
          'Map detail boundary',
          `The heatmap shows all 262 neighborhoods. Selected-region detail deterministically shows up to ${VISUAL_DETAIL_LIMITS.historicalBuildings} historical buildings, ${VISUAL_DETAIL_LIMITS.futureProjects} scenario projects, ${VISUAL_DETAIL_LIMITS.milestoneLabels} milestone labels, and ${VISUAL_DETAIL_LIMITS.capacitySites} highest-capacity sites; full uncapped counts remain in evidence and settlement.`,
          null,
          modeledHistorical
        ),
        ...(result.sectorProfile.allowsAffordableUnits
          ? [field('affordable', 'Affordable scenario units', snapshot.metrics.cumulativeAffordableUnits, 'units', simulated)]
          : []),
        field('price-availability', 'Price forecast', result.forecasts.intervention.priceStatus, null, simulated),
        field('development-availability', 'Development forecast', result.forecasts.intervention.developmentStatus, null, simulated),
      ],
    }, {
      id: 'forecast-validation',
      label: 'Forecast validation and limits',
      targetIds: ['selected-region'],
      fields: [
        field('status', 'Backtest status', result.backtest.status, null, simulated),
        field('predictions', 'Holdout predictions', result.backtest.predictionCount, 'years', simulated),
        field('mape', 'Holdout MAPE', result.backtest.mapePct ?? 'not available', result.backtest.mapePct === null ? null : 'percent', simulated),
        field('coverage', 'Holdout interval coverage', result.backtest.intervalCoveragePct ?? 'not available', result.backtest.intervalCoveragePct === null ? null : 'percent', simulated),
        field('claim', 'Interpretation', result.backtest.claim, null, simulated),
      ],
    }, {
      id: 'capacity-boundary',
      label: 'Current development capacity',
      targetIds: snapshot.year === 2026
        ? result.capacitySites.map((row) => `capacity:${row.id}`)
        : [],
      fields: [
        field('candidates', 'Uncapped selected-region candidates', result.capacitySites.length, 'lots', capacity),
        field('historical-sites', 'Uncapped selected-region historical sites', result.historicalSites.length, 'sites', observed),
        field('source-sampled', 'Source snapshot sampled', result.coverage.sourceSampled ? 'yes' : 'no', null, capacity),
        field('boundary', 'Meaning', 'Mapped FAR capacity is not a parcel feasibility or permit prediction', null, capacity),
      ],
    }, ...surfaceInspections, ...snapshot.historicalBuildingStates.map((row) => ({
      id: `inspect:historical:${row.id}`,
      label: row.address || row.jobId || row.id,
      targetIds: [`historical:${row.id}`],
      fields: [
        field('stage', 'Visible stage', row.stage, null, row.stageOrigin === 'observed' ? observed : modeledHistorical),
        field('stage-origin', 'Stage origin', row.stageOrigin, null, row.stageOrigin === 'observed' ? observed : modeledHistorical),
        field('job', 'Job ID', row.jobId || 'not retained', null, observed),
        field('bbl', 'BBL', row.bbl || 'not retained', null, observed),
        field('bin', 'BIN', row.bin || 'not retained', null, observed),
        field('source-rows', 'Source row IDs', row.sourceRowIds.join(', '), null, observed),
        field('footprint-origin', 'Footprint origin', row.footprintOrigin, null, observed),
        field('milestones', 'Recorded milestones', row.milestones.map((item) => `${item.kind}: ${item.date}`).join('; '), null, observed),
        field('limitation', 'Construction replay limit', row.limitation, null, observed),
      ],
    })), ...snapshot.futureProjectStates.map((row) => ({
      id: `inspect:${row.id}`,
      label: row.address,
      targetIds: [`future:${row.id}`],
      fields: [
        field('stage', 'Scenario stage', row.stage, null, simulated),
        field('start', 'Modeled start', row.startYear, 'year', simulated),
        field('completion', 'Modeled completion', row.completionYear, 'year', simulated),
        field('units', 'Scenario units', row.units, 'units', simulated),
        field('floor-area', 'Scenario floor area', row.floorAreaSquareFeet, 'square feet', simulated),
        ...(result.sectorProfile.allowsAffordableUnits
          ? [field('affordable', 'Scenario affordable units', row.affordableUnits, 'units', simulated)]
          : []),
        field('capacity-source', 'Capacity source rows', row.sourceRowIds.join(', '), null, capacity),
        field('footprint-origin', 'Footprint origin', row.footprintOrigin, null, simulated),
      ],
    })), ...(snapshot.year === 2026 ? result.capacitySites.map((row) => ({
      id: `inspect:capacity:${row.id}`,
      label: row.address,
      targetIds: [`capacity:${row.id}`],
      fields: [
        field('bbl', 'BBL', row.bbl, null, capacity),
        field('source-rows', 'Source row IDs', row.sourceRowIds.join(', '), null, capacity),
        field('lot-area', 'Lot area', row.lotAreaSquareFeet, 'square feet', capacity),
        field('built-area', 'Built area', row.builtAreaSquareFeet, 'square feet', capacity),
        field('residential-capacity', 'Residential floor-area capacity', row.potentialResidentialFloorAreaSquareFeet, 'square feet', capacity),
        field('commercial-capacity', 'Commercial floor-area capacity', row.potentialCommercialFloorAreaSquareFeet, 'square feet', capacity),
      ],
    })) : []), ...comparisonInspections(comparison, simulated)];
  }

  function comparisonInspections(comparison, simulated) {
    if (!comparison?.branchEvidence) return [];
    return ['baseline', 'intervention'].flatMap((role) => {
      const branch = comparison.branchEvidence[role];
      return [{
        id: `inspect:comparison:${role}`,
        label: `${role} comparison branch`,
        targetIds: [`comparison:${role}:region`],
        fields: [
          field('policy', 'Policy', branch.policyId, null, simulated),
          field('price-status', 'Price forecast', branch.priceStatus, null, simulated),
          field('development-status', 'Development forecast', branch.developmentStatus, null, simulated),
          field('projects', 'Modeled projects', branch.projects.length, 'projects', simulated),
        ],
      }, ...branch.projects.map((row) => ({
        id: `inspect:comparison:${role}:${row.id}`,
        label: `${role} · ${row.address}`,
        targetIds: [`comparison:${role}:${row.id}`],
        fields: [
          field('policy', 'Branch policy', branch.policyId, null, simulated),
          field('start', 'Modeled start', row.startYear, 'year', simulated),
          field('completion', 'Modeled completion', row.completionYear, 'year', simulated),
          field('units', 'Modeled units', row.units, 'units', simulated),
          field('floor-area', 'Modeled floor area', row.floorAreaSquareFeet, 'square feet', simulated),
          field('source-rows', 'Capacity source rows', row.sourceRowIds.join(', '), null, simulated),
        ],
      }))];
    });
  }

  function surfaceProvenance(row, observed, simulated, snapshot, unsupported) {
    if (row?.status === 'scenario-forecast') return simulated;
    if (row?.year === 2026) return snapshot;
    if (row?.year > 2026) return unsupported;
    return observed;
  }

  function projectLabel(row) {
    if (row.developmentKind === 'commercial-floor-area') {
      return `${row.address} · ${(row.stage || 'scenario').replaceAll('-', ' ')} · ${Math.round(row.floorAreaSquareFeet).toLocaleString()} scenario square feet`;
    }
    return `${row.address} · ${(row.stage || 'scenario').replaceAll('-', ' ')} · ${row.units} scenario units`;
  }

  function capacityValue(row, sectorProfile) {
    if (sectorProfile.id === 'tax-class-1') return row.potentialResidentialUnitsClass1 || 0;
    if (sectorProfile.id === 'tax-class-2') return row.potentialResidentialUnitsClass2 || 0;
    if (sectorProfile.id === 'tax-class-4') {
      return row.potentialCommercialFloorAreaSquareFeet || 0;
    }
    return 0;
  }

  function capacityLabel(row, sectorProfile) {
    const value = capacityValue(row, sectorProfile);
    return sectorProfile.capacityUnit === 'square feet'
      ? `${row.address} · ${Math.round(value).toLocaleString()} mapped commercial square feet`
      : sectorProfile.capacityUnit === 'units'
        ? `${row.address} · ${Math.round(value).toLocaleString()} mapped scenario units`
        : `${row.address} · mixed-sector development disabled`;
  }

  function polygonCentroid(ring) {
    const points = ring.slice(0, -1);
    if (!points.length) return [0, 0];
    return [
      points.reduce((sum, row) => sum + row[0], 0) / points.length,
      points.reduce((sum, row) => sum + row[1], 0) / points.length,
    ];
  }

  function boundedRows(rows, limit, score) {
    if (rows.length <= limit) return rows;
    return rows
      .map((row, index) => ({ row, index, score: Number(score(row)) || 0 }))
      .sort((left, right) => (
        right.score - left.score
        || String(left.row.id).localeCompare(String(right.row.id))
        || left.index - right.index
      ))
      .slice(0, limit)
      .sort((left, right) => left.index - right.index)
      .map(({ row }) => row);
  }

  function shiftGeometry(ring, longitudeOffset) {
    return ring.map((point) => [
      point[0] + longitudeOffset,
      point[1],
      ...(point.length > 2 ? [point[2]] : []),
    ]);
  }

  function modelRecord(id, contentHash, parents, result, algorithm) {
    return builder.modelRecord({
      id: `${PLUGIN_ID}:model:${id}`,
      datasetId: 'nyc-real-estate-model-governance-v1',
      contentHash,
      parentIds: parents.filter(Boolean).map((row) => row.id),
      metadata: { algorithm },
      lineage: {
        axes: {
          origin: 'modeled',
          temporalStatus: 'forecast',
          uncertainty: {
            kind: 'distribution',
            value: { ensembleSize: 31, interpretation: 'Conditional scenario distribution.' },
          },
        },
        contentVersion: id,
        scenarioEpoch: `scenario:${result.scenarioIdentity}`,
        license: { required: false, identifier: null },
      },
    });
  }

  function metadataFor(datasetId, datasets) {
    const value = Object.values(datasets).find((row) => row?.id === datasetId);
    return {
      contentVersion: value?.contentVersion || '2026-07-27',
      kind: datasetId.includes('model-governance') ? 'governed model definition' : 'governed NYC administrative data',
      license: datasetId.includes('region-index') || datasetId.includes('region-')
        ? 'NYC Open Data Terms of Use'
        : null,
      truth: value?.truth,
    };
  }

  function provenance(origin, temporalStatus, uncertainty, records) {
    return builder.provenance({
      origin,
      temporalStatus,
      uncertainty,
      records: records.filter(Boolean),
    });
  }

  function previousSnapshotId(result, snapshot) {
    const index = result.snapshots.findIndex((row) => row.id === snapshot.id);
    return index > 0 ? result.snapshots[index - 1].id : null;
  }

  function selectControl(id, label, value, options, evidence) {
    return { id, label, kind: 'select', value, options, minimum: null, maximum: null, step: null, provenance: evidence };
  }

  function rangeControl(id, label, value, minimum, maximum, step, evidence) {
    return { id, label, kind: 'range', value, options: null, minimum, maximum, step, provenance: evidence };
  }

  function option(value, label) {
    return { value, label };
  }

  function field(id, label, value, unit, evidence) {
    return { id, label, value, unit, provenance: evidence };
  }

  function requireBuilder() {
    if (!builder?.datasetRecord || !builder?.contribution) {
      throw new Error('nyc_real_estate_v4_builder_missing');
    }
  }

  return Object.freeze({ MODEL_HASHES, VISUAL_DETAIL_LIMITS, createContribution });
});
