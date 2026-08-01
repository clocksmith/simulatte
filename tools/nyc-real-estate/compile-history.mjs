#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  boundsFor,
  centroidFor,
  largestRing,
  modeledFootprint,
  pointInSurface,
  polygonRings,
  polygonSurfaces,
  simplifyClosedRing,
  validPoint,
  withinBounds,
} from './geometry.mjs';
import { createCitySurfaceArtifact } from './compile-city-surface.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_DIRECTORY = path.join(
  ROOT,
  'tools/simulatte/data-sources/nyc-real-estate-2026-07-27-v1'
);
const OUTPUT_DIRECTORY = path.join(ROOT, 'public/data/nyc-real-estate');
const INDEX_OUTPUT = path.join(OUTPUT_DIRECTORY, 'region-index-v1.json');
const CITY_SURFACE_OUTPUT = path.join(OUTPUT_DIRECTORY, 'city-surface-v1.json');
const SHARD_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'regions');
const RECEIPT_OUTPUT = path.join(OUTPUT_DIRECTORY, 'compile-receipt-v1.json');
const SOURCE_RECEIPT = 'snapshot-receipt.json';
const NTA_SOURCE = 'nyc-nta-2020.geojson';
const SALES_SOURCE = 'nyc-annualized-sales-by-nta.json';
const FILING_SOURCE = 'nyc-new-building-filings-by-nta-year.json';
const OCCUPANCY_SOURCE = 'nyc-final-certificates-of-occupancy.json';
const FOOTPRINT_SOURCE = 'nyc-largest-constructed-footprints-2010-2026.geojson';
const JOB_SOURCES = Object.freeze([
  'nyc-largest-new-building-jobs-manhattan.json',
  'nyc-largest-new-building-jobs-bronx.json',
  'nyc-largest-new-building-jobs-brooklyn.json',
  'nyc-largest-new-building-jobs-queens.json',
  'nyc-largest-new-building-jobs-staten-island.json',
]);
const CAPACITY_SOURCES = Object.freeze([
  'nyc-pluto-capacity-manhattan.json',
  'nyc-pluto-capacity-bronx.json',
  'nyc-pluto-capacity-brooklyn.json',
  'nyc-pluto-capacity-queens.json',
  'nyc-pluto-capacity-staten-island.json',
]);
const MINIMUM_PRICE_YEARS = 4;
const REGION_GEOMETRY_TOLERANCE = 0.00012;
const BUILDING_GEOMETRY_TOLERANCE = 0.000004;

function main() {
  const sourceReceipt = readJson(SOURCE_RECEIPT);
  validateSourceSnapshot(sourceReceipt);
  const regions = compileRegions(readJson(NTA_SOURCE));
  const regionIndex = createRegionIndex(regions);
  const sales = compileSales(readJson(SALES_SOURCE), regionIndex);
  const filings = compileFilings(readJson(FILING_SOURCE), regionIndex);
  const occupancies = readJson(OCCUPANCY_SOURCE);
  const jobs = JOB_SOURCES.flatMap(readJson);
  const footprints = readJson(FOOTPRINT_SOURCE).features;
  const historical = compileHistoricalSites({
    jobs,
    occupancies,
    footprints,
    regionIndex,
  });
  const capacity = compileCapacitySites(
    CAPACITY_SOURCES.flatMap(readJson),
    regionIndex
  );
  const sourceIdentities = sourceReceipt.files.map((row) => ({
    sourceId: sourceReceipt.plan.requests.find(
      (request) => request.output === row.output
    )?.sourceId || row.output,
    path: row.output,
    byteCount: row.byteCount,
    sha256: row.sha256,
  })).sort((left, right) => left.path.localeCompare(right.path));
  fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  fs.mkdirSync(SHARD_DIRECTORY, { recursive: true });
  for (const filename of fs.readdirSync(SHARD_DIRECTORY)) {
    if (filename.endsWith('.json')) fs.unlinkSync(path.join(SHARD_DIRECTORY, filename));
  }
  const shardRows = regions.map((region) => {
    const saleSeries = sales.rows.filter((row) => row.regionId === region.id);
    const developmentSeries = filings.rows.filter((row) => row.regionId === region.id);
    const developmentSites = historical.sites.filter((row) => row.regionId === region.id);
    const capacitySites = capacity.sites.filter((row) => row.regionId === region.id);
    const coverage = regionCoverage({
      saleSeries,
      developmentSeries,
      developmentSites,
      capacitySites,
    });
    const shard = {
      schema: 'simulatte.nycRealEstateRegionShard.v1',
      id: `nyc-real-estate-region-${region.id.toLowerCase()}-v1`,
      contentVersion: '2026-07-27',
      region,
      saleSeries,
      developmentSeries,
      developmentSites,
      capacitySites,
      coverage,
      sourceIdentities,
      truth: {
        origin: 'observed',
        temporalStatus: 'historical',
        uncertainty: {
          kind: 'missing',
          value: {
            reason: 'Administrative records have missing, revised, duplicated, and source-sampled fields without a shared statistical uncertainty model.',
          },
        },
      },
      claimBoundary: 'This NTA shard preserves every joined row retained from the governed source snapshot. The source snapshot itself samples large DOB jobs, constructed footprints, and PLUTO capacity candidates and is not a complete property history or feasibility inventory.',
    };
    const filename = path.join(SHARD_DIRECTORY, `${region.id}.json`);
    writeJson(filename, shard);
    const identity = outputIdentity(filename, shard.id, shard.schema);
    return {
      ...identity,
      regionId: region.id,
      shardPath: `regions/${region.id}.json`,
      coverage,
    };
  });
  const indexArtifact = {
    schema: 'simulatte.nycRealEstateRegionIndex.v1',
    id: 'nyc-real-estate-region-index-2026-v1',
    contentVersion: '2026-07-27',
    snapshotDate: '2026-07-27',
    boroughs: [...new Map(regions.map((row) => [
      row.boroughId,
      { id: row.boroughId, label: row.boroughLabel },
    ])).values()].sort((left, right) => left.label.localeCompare(right.label)),
    regions: regions.map((region) => ({
      id: region.id,
      label: region.label,
      abbreviation: region.abbreviation,
      boroughId: region.boroughId,
      boroughLabel: region.boroughLabel,
      coverage: indexCoverage(shardRows.find((row) => row.regionId === region.id).coverage),
    })),
    shards: shardRows.map((row) => ({
      id: row.id,
      regionId: row.regionId,
      path: row.shardPath,
      sha256: row.sha256,
      byteCount: row.byteCount,
      schemaId: row.schema,
    })),
    sourceSampling: {
      newBuildingJobs: '1,200 largest proposed-zoning-area new-building rows per borough',
      constructedFootprints: '12,000 largest current footprints with source construction year 2010-2026 citywide',
      capacityCandidates: 'up to 5,000 PLUTO rows meeting the source query per borough',
      perRegionCompilerCap: null,
    },
    sourceIdentities,
    truth: {
      origin: 'derived',
      temporalStatus: 'snapshot',
      uncertainty: {
        kind: 'missing',
        value: {
          reason: 'Coverage counts describe retained source rows, not completeness of the property market.',
        },
      },
    },
    claimBoundary: 'This index supports selection and hash-pinned on-demand loading only. Coverage flags gate experiments and never fabricate missing NTA evidence.',
  };
  const citySurfaceArtifact = createCitySurfaceArtifact({
    regions,
    saleRows: sales.rows,
    shardRows,
    sourceIdentities,
  });
  writeJson(INDEX_OUTPUT, indexArtifact);
  writeJson(CITY_SURFACE_OUTPUT, citySurfaceArtifact);
  const compileReceipt = {
    schema: 'simulatte.nycRealEstateCompileReceipt.v1',
    compiler: 'tools/nyc-real-estate/compile-history.mjs',
    compilerVersion: '2.0.0',
    sourceSnapshotId: path.basename(SOURCE_DIRECTORY),
    sourceReceiptSha256: sha256(fs.readFileSync(path.join(SOURCE_DIRECTORY, SOURCE_RECEIPT))),
    inputs: sourceIdentities,
    outputs: [
      outputIdentity(INDEX_OUTPUT, indexArtifact.id, indexArtifact.schema),
      outputIdentity(
        CITY_SURFACE_OUTPUT,
        citySurfaceArtifact.id,
        citySurfaceArtifact.schema
      ),
      ...shardRows.map(({
        coverage: _coverage,
        regionId: _regionId,
        shardPath: _shardPath,
        ...row
      }) => row),
    ],
    accepted: {
      regions: regions.length,
      saleSeries: sales.accepted,
      developmentSeries: filings.accepted,
      historicalSites: historical.sites.length,
      capacitySites: capacity.sites.length,
      regionShards: shardRows.length,
      citySurfaceRegions: citySurfaceArtifact.regions.length,
      citySurfaceSaleRows: citySurfaceArtifact.regions
        .reduce((sum, row) => sum + row.saleSeries.length, 0),
    },
    rejected: {
      saleSeries: sales.rejected,
      developmentSeries: filings.rejected,
      jobs: historical.unjoinedJobs,
      footprints: historical.unjoinedFootprints,
      capacitySites: capacity.unjoined,
    },
    claimBoundary: 'Compilation establishes deterministic joins, reductions, and output identity only. Forecast validity and rendered recognizability require separate gates.',
  };
  writeJson(RECEIPT_OUTPUT, compileReceipt);
  process.stdout.write(
    `NYC-REAL-ESTATE-COMPILE regions=${regions.length} sales=${sales.accepted} `
    + `developmentSeries=${filings.accepted} historicalSites=${historical.sites.length} `
    + `capacitySites=${capacity.sites.length} shards=${shardRows.length}\n`
  );
}

function indexCoverage(coverage) {
  return {
    saleRows: coverage.saleRows,
    saleYearCountsBySector: Object.fromEntries(
      Object.entries(coverage.saleYearsBySector)
        .map(([sectorId, years]) => [sectorId, years.length])
    ),
    developmentSeriesRows: coverage.developmentSeriesRows,
    historicalSites: coverage.historicalSites,
    capacityCandidates: coverage.capacityCandidates,
    sectorCandidateCounts: coverage.sectorCandidateCounts,
    priceForecastSupportedBySector: coverage.priceForecastSupportedBySector,
    developmentForecastSupportedBySector: coverage.developmentForecastSupportedBySector,
    sourceSampled: coverage.sourceSampled,
    compilerRegionCap: coverage.compilerRegionCap,
  };
}

function regionCoverage({
  saleSeries,
  developmentSeries,
  developmentSites,
  capacitySites,
}) {
  const saleYearsBySector = Object.fromEntries(
    ['tax-class-1', 'tax-class-2', 'tax-class-4'].map((sectorId) => [
      sectorId,
      [...new Set(saleSeries.filter((row) => row.sectorId === sectorId).map((row) => row.year))].sort(),
    ])
  );
  const sectorCandidateCounts = {
    'tax-class-1': capacitySites.filter((row) => row.potentialResidentialUnitsClass1 > 0).length,
    'tax-class-2': capacitySites.filter((row) => row.potentialResidentialUnitsClass2 > 0).length,
    'tax-class-4': capacitySites.filter((row) => row.potentialCommercialFloorAreaSquareFeet > 0).length,
    all: 0,
  };
  return {
    saleRows: saleSeries.length,
    saleYearsBySector,
    developmentSeriesRows: developmentSeries.length,
    historicalSites: developmentSites.length,
    capacityCandidates: capacitySites.length,
    sectorCandidateCounts,
    priceForecastSupportedBySector: Object.fromEntries([
      ...Object.entries(saleYearsBySector).map(([id, years]) => [id, years.length >= MINIMUM_PRICE_YEARS]),
      ['all', new Set(saleSeries.map((row) => row.year)).size >= MINIMUM_PRICE_YEARS],
    ]),
    developmentForecastSupportedBySector: {
      'tax-class-1': sectorCandidateCounts['tax-class-1'] > 0,
      'tax-class-2': sectorCandidateCounts['tax-class-2'] > 0,
      'tax-class-4': sectorCandidateCounts['tax-class-4'] > 0,
      all: false,
    },
    sourceSampled: true,
    compilerRegionCap: null,
  };
}

function validateSourceSnapshot(receipt) {
  if (receipt?.schema !== 'simulatte.autonomyDataFetchReceipt.v1'
    || receipt.activation !== 'staged_not_active'
    || !Array.isArray(receipt.files)
    || receipt.files.length !== 15) {
    throw new Error('nyc_real_estate_source_receipt_invalid');
  }
  for (const row of receipt.files) {
    const file = path.join(SOURCE_DIRECTORY, row.output);
    const bytes = fs.readFileSync(file);
    if (bytes.length !== row.byteCount || sha256(bytes) !== row.sha256) {
      throw new Error(`nyc_real_estate_source_hash_mismatch:${row.output}`);
    }
  }
}

function compileRegions(collection) {
  return collection.features.map((feature) => {
    const properties = feature.properties || {};
    const spatialPolygons = polygonSurfaces(feature.geometry)
      .map((surface) => ({
        outer: simplifyClosedRing(surface.outer, REGION_GEOMETRY_TOLERANCE, 180),
        holes: surface.holes
          .map((ring) => simplifyClosedRing(ring, REGION_GEOMETRY_TOLERANCE, 80))
          .filter((ring) => ring.length >= 4),
      }))
      .filter((surface) => surface.outer.length >= 4);
    if (!properties.nta2020 || !spatialPolygons.length) {
      throw new Error(`nyc_real_estate_region_invalid:${properties.nta2020 || 'missing'}`);
    }
    const outerPoints = spatialPolygons.flatMap((surface) => surface.outer);
    const bounds = boundsFor(outerPoints);
    return {
      id: properties.nta2020,
      label: properties.ntaname,
      abbreviation: properties.ntaabbrev || null,
      boroughId: boroughId(properties.boroname),
      boroughLabel: properties.boroname,
      communityDistrictTabulationAreaId: properties.cdta2020 || null,
      communityDistrictTabulationAreaLabel: properties.cdtaname || null,
      areaM2: finite(properties.shape_area, 0),
      centroid: centroidFor(outerPoints),
      bounds,
      polygon: largestRing(spatialPolygons.map((surface) => surface.outer)),
      spatialPolygons,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function compileSales(rows, regionIndex) {
  let rejected = 0;
  const accepted = rows.flatMap((row) => {
    if (!regionIndex.byId.has(row.nta)
      || ![1, 2, 4].includes(Number(row.tax_class))
      || !between(Number(row.year), 2016, 2025)
      || !positiveNumber(row.sale_count)
      || !positiveNumber(row.median_sale_price)) {
      rejected += 1;
      return [];
    }
    return [{
      id: `sale:${row.nta}:${row.year}:tax-${row.tax_class}`,
      regionId: row.nta,
      year: Number(row.year),
      sectorId: `tax-class-${row.tax_class}`,
      saleCount: Number(row.sale_count),
      medianPriceUsd: rounded(Number(row.median_sale_price), 2),
      meanPriceUsd: rounded(Number(row.mean_sale_price), 2),
      transferredUnits: Math.max(0, Number(row.transferred_units || 0)),
      priceBasis: 'nominal-usd-recorded-sale-filtered',
    }];
  });
  return { rows: accepted, accepted: accepted.length, rejected };
}

function compileFilings(rows, regionIndex) {
  let rejected = 0;
  let fuzzyJoined = 0;
  const aggregate = new Map();
  rows.forEach((row) => {
    const match = regionIndex.matchName(row.nta_name, row.borough);
    const year = Number(row.year);
    if (!match || !between(year, 2000, 2026) || !positiveNumber(row.filing_count)) {
      rejected += 1;
      return;
    }
    if (match.kind === 'fuzzy') fuzzyJoined += 1;
    const key = `${match.region.id}:${year}`;
    const current = aggregate.get(key) || {
      id: `development:${match.region.id}:${year}`,
      regionId: match.region.id,
      year,
      filingCount: 0,
      withdrawnFilingCount: 0,
      proposedZoningSquareFeet: 0,
      sourceNtaNames: new Set(),
    };
    const filingCount = Number(row.filing_count);
    current.filingCount += filingCount;
    if (String(row.withdrawal_flag || '0') !== '0') {
      current.withdrawnFilingCount += filingCount;
    }
    current.proposedZoningSquareFeet += Math.max(0, Number(row.proposed_zoning_sqft || 0));
    current.sourceNtaNames.add(row.nta_name);
    aggregate.set(key, current);
  });
  const compiled = [...aggregate.values()].map((row) => ({
    ...row,
    proposedZoningSquareFeet: rounded(row.proposedZoningSquareFeet, 2),
    sourceNtaNames: [...row.sourceNtaNames].sort(),
  })).sort((left, right) => left.year - right.year || left.regionId.localeCompare(right.regionId));
  return { rows: compiled, accepted: compiled.length, rejected, fuzzyJoined };
}

function compileHistoricalSites({ jobs, occupancies, footprints, regionIndex }) {
  const occupancyByJob = groupBy(occupancies, (row) => String(row.job_number || ''));
  const footprintByBbl = new Map();
  let unjoinedFootprints = 0;
  const footprintSites = footprints.flatMap((feature) => {
    const properties = feature.properties || {};
    const footprint = largestRing(polygonRings(feature.geometry));
    const center = centroidFor(footprint);
    const region = regionIndex.findPoint(center);
    if (!region) {
      unjoinedFootprints += 1;
      return [];
    }
    const bbl = normalizedBbl(properties.base_bbl || properties.mappluto_bbl);
    const compiled = {
      id: `footprint:${properties.objectid}`,
      sourceKind: 'constructed-footprint',
      regionId: region.id,
      bbl,
      bin: properties.bin || null,
      jobId: null,
      sourceRowIds: [`building-footprint:${properties.objectid}`],
      address: null,
      coordinates: center,
      footprint: simplifyClosedRing(footprint, BUILDING_GEOMETRY_TOLERANCE, 28),
      footprintOrigin: 'observed',
      footprintAreaM2: rounded(finite(properties.shape_area, 0), 2),
      heightM: rounded(feetToMeters(finite(properties.height_roof, 0)), 2),
      proposedUnits: null,
      proposedStories: null,
      proposedZoningSquareFeet: null,
      milestones: [{
        id: `footprint:${properties.objectid}:constructed`,
        kind: 'constructed-year',
        date: `${properties.construction_year}-07-01`,
        precision: 'year',
        origin: 'observed',
      }],
      constructionYear: Number(properties.construction_year),
      rankingValue: finite(properties.shape_area, 0),
    };
    const rows = footprintByBbl.get(bbl) || [];
    rows.push(compiled);
    footprintByBbl.set(bbl, rows);
    return [compiled];
  });
  let unjoinedJobs = 0;
  const jobSites = jobs.flatMap((row) => {
    const point = [Number(row.gis_longitude), Number(row.gis_latitude)];
    const region = regionIndex.findPoint(point)
      || regionIndex.matchName(row.gis_nta_name, row.borough)?.region;
    if (!region || !validPoint(point)) {
      unjoinedJobs += 1;
      return [];
    }
    const bbl = normalizedBbl(row.bbl);
    const matchingFootprint = (footprintByBbl.get(bbl) || [])
      .slice()
      .sort((left, right) => right.rankingValue - left.rankingValue)[0] || null;
    const finalOccupancies = occupancyByJob.get(String(row.job__)) || [];
    const milestones = compileMilestones(row, finalOccupancies);
    const proposedArea = finite(row.proposed_zoning_sqft, 0)
      || finite(row.total_construction_floor_area, 0);
    const proposedStories = integerOrNull(row.proposed_no_of_stories);
    const estimatedFootprintSquareFeet = proposedArea
      ? proposedArea / Math.max(1, proposedStories || 8)
      : 900;
    return [{
      id: `job:${row.job__}:${row.doc__ || '01'}`,
      sourceKind: 'new-building-job',
      regionId: region.id,
      bbl,
      bin: row.bin__ || null,
      jobId: row.job__,
      sourceRowIds: [
        `dob-now:${row.job_s1_no || `${row.job__}:${row.doc__ || '01'}`}`,
        ...finalOccupancies.map((occupancy) => (
          `certificate-of-occupancy:${occupancy.job_number || row.job__}:${occupancy.item_number || 'unknown'}`
        )),
        ...(matchingFootprint?.sourceRowIds || []),
      ],
      address: [row.house__, row.street_name].filter(Boolean).join(' '),
      coordinates: point,
      footprint: matchingFootprint?.footprint || modeledFootprint(point, estimatedFootprintSquareFeet),
      footprintOrigin: matchingFootprint ? 'observed' : 'modeled',
      footprintAreaM2: matchingFootprint?.footprintAreaM2
        || rounded(squareFeetToSquareMeters(estimatedFootprintSquareFeet), 2),
      heightM: matchingFootprint?.heightM
        || rounded(feetToMeters(finite(row.proposed_height, 0)), 2),
      proposedUnits: integerOrNull(row.proposed_dwelling_units),
      proposedStories,
      proposedZoningSquareFeet: proposedArea || null,
      milestones,
      constructionYear: completionYear(milestones)
        || matchingFootprint?.constructionYear
        || null,
      rankingValue: proposedArea || matchingFootprint?.rankingValue || 0,
      status: row.job_status_descrp || row.job_status || null,
      withdrawn: String(row.withdrawal_flag || '0') !== '0',
    }];
  });
  const jobsByBbl = new Set(jobSites.map((row) => row.bbl).filter(Boolean));
  const candidates = [
    ...jobSites,
    ...footprintSites.filter((row) => !row.bbl || !jobsByBbl.has(row.bbl)),
  ];
  const unique = deduplicateRows(candidates, (row) => row.id);
  return {
    sites: unique.map(stripRanking).sort((left, right) => (
      left.regionId.localeCompare(right.regionId) || left.id.localeCompare(right.id)
    )),
    unjoinedJobs,
    unjoinedFootprints,
  };
}

function deduplicateRows(rows, keyFor) {
  const retained = new Map();
  rows.slice().sort((left, right) => (
    right.rankingValue - left.rankingValue || left.id.localeCompare(right.id)
  )).forEach((row) => {
    const key = keyFor(row);
    if (!retained.has(key)) retained.set(key, row);
  });
  return [...retained.values()];
}

function compileCapacitySites(rows, regionIndex) {
  let unjoined = 0;
  const compiled = rows.flatMap((row) => {
    const point = [Number(row.longitude), Number(row.latitude)];
    const region = regionIndex.findPoint(point);
    if (!region || !validPoint(point)) {
      unjoined += 1;
      return [];
    }
    const builtFar = finite(row.builtfar, 0);
    const residentialFar = finite(row.residfar, 0);
    const commercialFar = finite(row.commfar, 0);
    const availableResidentialFar = Math.max(0, residentialFar - builtFar);
    const availableCommercialFar = Math.max(0, commercialFar - builtFar);
    const availableFar = Math.max(availableResidentialFar, availableCommercialFar);
    const lotAreaSquareFeet = finite(row.lotarea, 0);
    const potentialResidentialFloorAreaSquareFeet = availableResidentialFar * lotAreaSquareFeet;
    const potentialCommercialFloorAreaSquareFeet = availableCommercialFar * lotAreaSquareFeet;
    const potentialFloorAreaSquareFeet = Math.max(
      potentialResidentialFloorAreaSquareFeet,
      potentialCommercialFloorAreaSquareFeet
    );
    return [{
      id: `capacity:${normalizedBbl(row.bbl)}`,
      regionId: region.id,
      bbl: normalizedBbl(row.bbl),
      sourceRowIds: [`pluto:${normalizedBbl(row.bbl)}`],
      address: row.address || 'Address unavailable',
      coordinates: point,
      boroughId: boroughId(row.borough),
      zoningDistricts: [row.zonedist1, row.zonedist2].filter(Boolean),
      landUseCode: row.landuse || null,
      lotAreaSquareFeet: rounded(lotAreaSquareFeet, 2),
      builtAreaSquareFeet: rounded(finite(row.bldgarea, 0), 2),
      existingResidentialUnits: Math.max(0, finite(row.unitsres, 0)),
      existingTotalUnits: Math.max(0, finite(row.unitstotal, 0)),
      builtFar: rounded(builtFar, 3),
      residentialFar: rounded(residentialFar, 3),
      commercialFar: rounded(commercialFar, 3),
      affordableResidentialFar: rounded(finite(row.affresfar, 0), 3),
      availableFar: rounded(availableFar, 3),
      availableResidentialFar: rounded(availableResidentialFar, 3),
      availableCommercialFar: rounded(availableCommercialFar, 3),
      potentialFloorAreaSquareFeet: rounded(potentialFloorAreaSquareFeet, 2),
      potentialResidentialFloorAreaSquareFeet: rounded(potentialResidentialFloorAreaSquareFeet, 2),
      potentialCommercialFloorAreaSquareFeet: rounded(potentialCommercialFloorAreaSquareFeet, 2),
      potentialResidentialUnitsClass1: Math.min(
        3,
        Math.max(0, Math.floor(potentialResidentialFloorAreaSquareFeet / 1500))
      ),
      potentialResidentialUnitsClass2: Math.max(
        0,
        Math.floor(potentialResidentialFloorAreaSquareFeet / 900)
      ),
      rankingValue: potentialFloorAreaSquareFeet,
    }];
  });
  return {
    read: rows.length,
    unjoined,
    sites: deduplicateRows(compiled, (row) => row.id)
      .map(stripRanking)
      .sort((left, right) => (
        left.regionId.localeCompare(right.regionId) || left.id.localeCompare(right.id)
      )),
  };
}

function compileMilestones(job, occupancies) {
  const rows = [
    milestone('filed', parseAdministrativeDate(job.pre__filing_date), 'observed'),
    milestone('approved', parseAdministrativeDate(job.approved), 'observed'),
    milestone('fully-permitted', parseAdministrativeDate(job.fully_permitted), 'observed'),
    ...occupancies.map((row) => milestone(
      'final-certificate-of-occupancy',
      parseAdministrativeDate(row.c_o_issue_date),
      'observed'
    )),
    milestone('signed-off', parseAdministrativeDate(job.signoff_date), 'observed'),
  ].filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
  return rows.map((row, index) => ({
    ...row,
    id: `job:${job.job__}:${job.doc__ || '01'}:${row.kind}:${index + 1}`,
  }));
}

function createRegionIndex(regions) {
  const byId = new Map(regions.map((row) => [row.id, row]));
  const byName = new Map();
  regions.forEach((region) => {
    for (const name of [
      region.label,
      region.abbreviation,
      region.communityDistrictTabulationAreaLabel,
    ].filter(Boolean)) {
      const key = `${region.boroughId}:${normalizeName(name)}`;
      const rows = byName.get(key) || [];
      rows.push(region);
      byName.set(key, rows);
    }
  });
  function findPoint(point) {
    if (!validPoint(point)) return null;
    return regions.find((region) => (
      withinBounds(point, region.bounds)
      && region.spatialPolygons.some((surface) => pointInSurface(point, surface))
    )) || null;
  }
  function matchName(name, borough) {
    const boroughKey = boroughId(borough);
    const normalized = normalizeName(name);
    const exact = byName.get(`${boroughKey}:${normalized}`)?.[0];
    if (exact) return { kind: 'exact', region: exact };
    const candidates = regions.filter((region) => region.boroughId === boroughKey);
    const tokens = new Set(normalized.split(' ').filter(Boolean));
    const ranked = candidates.map((region) => ({
      region,
      score: tokenScore(tokens, new Set(normalizeName(region.label).split(' ').filter(Boolean))),
    })).sort((left, right) => right.score - left.score || left.region.id.localeCompare(right.region.id));
    return ranked[0]?.score >= 0.5 ? { kind: 'fuzzy', region: ranked[0].region } : null;
  }
  return { byId, findPoint, matchName };
}

function stripRanking({ rankingValue: _rankingValue, ...row }) {
  return row;
}

function milestone(kind, date, origin) {
  return date ? { kind, date, precision: 'day', origin } : null;
}

function completionYear(milestones) {
  const completion = milestones.find((row) => (
    row.kind === 'final-certificate-of-occupancy' || row.kind === 'signed-off'
  ));
  return completion ? Number(completion.date.slice(0, 4)) : null;
}

function normalizedBbl(value) {
  const digits = String(value || '').split('.')[0].replace(/\D/g, '');
  return digits || null;
}

function boroughId(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return {
    '1': 'manhattan',
    MN: 'manhattan',
    MANHATTAN: 'manhattan',
    '2': 'bronx',
    BX: 'bronx',
    BRONX: 'bronx',
    '3': 'brooklyn',
    BK: 'brooklyn',
    BROOKLYN: 'brooklyn',
    '4': 'queens',
    QN: 'queens',
    QUEENS: 'queens',
    '5': 'staten-island',
    SI: 'staten-island',
    'STATEN ISLAND': 'staten-island',
  }[normalized] || normalized.toLowerCase().replaceAll(' ', '-');
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenScore(left, right) {
  const intersection = [...left].filter((value) => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function parseAdministrativeDate(value) {
  if (!value) return null;
  const source = String(value).trim();
  const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const american = source.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!american) return null;
  return `${american[3]}-${american[1]}-${american[2]}`;
}

function groupBy(rows, keyFor) {
  const result = new Map();
  rows.forEach((row) => {
    const key = keyFor(row);
    const values = result.get(key) || [];
    values.push(row);
    result.set(key, values);
  });
  return result;
}

function finite(value, fallback) {
  const number = Number(String(value ?? '').replaceAll(',', '').replaceAll('$', ''));
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function integerOrNull(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function feetToMeters(value) {
  return value * 0.3048;
}

function squareFeetToSquareMeters(value) {
  return value * 0.092903;
}

function rounded(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function between(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(SOURCE_DIRECTORY, filename), 'utf8'));
}

function writeJson(filename, value) {
  fs.writeFileSync(filename, `${JSON.stringify(sortValue(value), null, 2)}\n`);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortValue(value[key])])
  );
}

function outputIdentity(filename, id, schema) {
  const bytes = fs.readFileSync(filename);
  return {
    id,
    schema,
    path: path.relative(ROOT, filename),
    byteCount: bytes.length,
    sha256: sha256(bytes),
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

export {
  compileCapacitySites,
  compileFilings,
  compileHistoricalSites,
  compileRegions,
  compileSales,
  createRegionIndex,
  main,
};
