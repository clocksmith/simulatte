(function attachSemanticCompositor(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSemanticCompositor = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSemanticCompositorModule(contracts) {
  const ORIGIN_COLORS = Object.freeze({
    observed: '#64d8cb',
    derived: '#7ab8ff',
    modeled: '#c39bff',
    simulated: '#ffb45c',
    scenario: '#ff7c9c',
  });
  const ROLE_ORDER = Object.freeze({
    primary: 5,
    event: 4,
    comparison: 3,
    uncertainty: 2,
    context: 1,
  });

  function createCompositor({
    maxVisibleLayers = 240,
    maxLabels = 28,
    pointClusterRadiusPx = 18,
  } = {}) {
    positiveInteger(maxVisibleLayers, 'semantic_compositor_budget_invalid', 'Visible layer budget');
    positiveInteger(maxLabels, 'semantic_compositor_label_budget_invalid', 'Label budget');
    positive(pointClusterRadiusPx, 'semantic_compositor_cluster_radius_invalid', 'Point cluster radius');

    function compose(presentation, {
      simulationTimeMs = 0,
      selectedIds = [],
      project = identityProject,
      viewport = { width: 1, height: 1 },
      provenanceReceipt = null,
    } = {}) {
      contracts.validatePresentation(presentation);
      nonNegative(simulationTimeMs, 'semantic_compositor_time_invalid', 'Composition time');
      validateViewport(viewport);
      if (!Array.isArray(selectedIds)) throw compositorError('semantic_compositor_selection_invalid', 'Selected IDs expected an array');
      if (typeof project !== 'function') throw compositorError('semantic_compositor_projection_invalid', 'Projection expected a function');

      const provenance = resolveProvenance(presentation, provenanceReceipt);
      const selected = new Set(selectedIds);
      const temporal = presentation.layers.filter((layer) => isActive(layer, simulationTimeMs));
      const ordered = temporal.slice().sort((left, right) => compareLayers(left, right, selected));
      const visible = ordered.slice(0, maxVisibleLayers);
      const suppressed = ordered.slice(maxVisibleLayers);
      const semanticDomains = quantityDomains(visible);
      const primitives = [];
      const pointLayers = [];
      visible.forEach((layer) => {
        if (layer.kind === 'point' && layer.aggregationKey !== null && !selected.has(layer.id)) pointLayers.push(layer);
        else primitives.push(primitiveFor(
          layer,
          selected.has(layer.id),
          provenance.bySubjectId.get(layer.id) || null,
          semanticDomains,
        ));
      });
      primitives.push(...clusterPoints(
        pointLayers,
        project,
        pointClusterRadiusPx,
        provenance.bySubjectId,
        semanticDomains,
      ));
      const labels = placeLabels(
        visible.filter((layer) => layer.kind === 'label' || selected.has(layer.id)),
        project,
        viewport,
        maxLabels,
        provenance.bySubjectId,
      );
      return deepFreeze({
        schema: 'simulatte.composition.v4',
        pluginId: presentation.pluginId,
        coordinateSystem: presentation.coordinateSystem,
        simulationTimeMs,
        primitives,
        labels,
        receipt: {
          schema: 'simulatte.compositorReceipt.v4',
          inputLayerCount: presentation.layers.length,
          activeLayerCount: temporal.length,
          visibleLayerCount: visible.length,
          suppressedLayerIds: suppressed.map((layer) => layer.id),
          clusterCount: primitives.filter((row) => row.kind === 'point-cluster').length,
          labelCount: labels.length,
          provenance: compositorProvenanceReceipt(provenance, primitives, suppressed),
          policies: {
            screenSpaceWidths: true,
            semanticColors: true,
            cohortQuantityDomains: true,
            collisionManagedLabels: true,
            boundedDensity: true,
          },
        },
      });
    }

    return Object.freeze({ compose });
  }

  function primitiveFor(layer, selected, provenanceEnvelope, semanticDomains = new Map()) {
    return {
      id: layer.id,
      kind: layer.kind,
      geometry: layer.geometry,
      quantity: layer.quantity,
      style: styleForLayer(layer, selected, semanticDomains.get(quantityCohortKey(layer)) || null),
      label: layer.label,
      memberIds: [layer.id],
      provenance: layer.provenance,
      provenanceEnvelope,
    };
  }

  function styleForLayer(layer, selected = false, semanticDomain = null) {
    contracts.validateSemanticLayer(layer);
    const normalized = normalizeQuantity(layer.quantity, semanticDomain);
    const uncertain = layer.provenance.axes.uncertainty !== null;
    const roleWeight = ROLE_ORDER[layer.role] / 5;
    return deepFreeze({
      color: ORIGIN_COLORS[layer.provenance.axes.origin],
      widthPx: layer.kind === 'path'
        ? round(clamp(1 + normalized * 1.6 + roleWeight * 0.4 + (selected ? 0.8 : 0), 1, 4))
        : null,
      radiusPx: ['point', 'actor'].includes(layer.kind)
        ? round(clamp(3 + normalized * 5 + (selected ? 2 : 0), 3, 10))
        : null,
      fillOpacity: round(clamp(0.18 + roleWeight * 0.36 + (selected ? 0.18 : 0) - (uncertain ? 0.1 : 0), 0.12, 0.82)),
      strokeOpacity: round(clamp(0.48 + roleWeight * 0.42 - (uncertain ? 0.1 : 0), 0.35, 1)),
      dash: uncertaintyDash(layer.provenance.axes.uncertainty),
      emphasis: selected ? 'selected' : layer.role,
    });
  }

  function clusterPoints(layers, project, radiusPx, envelopesById, semanticDomains) {
    const buckets = new Map();
    layers.forEach((layer) => {
      const screen = projectPoint(layer, project);
      const key = `${layer.aggregationKey}:${Math.floor(screen[0] / radiusPx)}:${Math.floor(screen[1] / radiusPx)}`;
      const bucket = buckets.get(key) || [];
      bucket.push({ layer, screen });
      buckets.set(key, bucket);
    });
    return [...buckets.entries()].map(([key, rows]) => {
      if (rows.length === 1) {
        return primitiveFor(
          rows[0].layer,
          false,
          envelopesById.get(rows[0].layer.id) || null,
          semanticDomains,
        );
      }
      const lead = rows.slice().sort((left, right) => compareLayers(left.layer, right.layer, new Set()))[0].layer;
      const center = rows.reduce((total, row) => [total[0] + row.screen[0], total[1] + row.screen[1]], [0, 0])
        .map((value) => value / rows.length);
      return {
        id: `cluster:${key}`,
        kind: 'point-cluster',
        geometry: lead.geometry,
        quantity: lead.quantity,
        screenAnchor: center,
        style: {
          ...styleForLayer(lead, false, semanticDomains.get(quantityCohortKey(lead)) || null),
          radiusPx: round(clamp(5 + Math.log2(rows.length) * 2.5, 5, 16)),
        },
        label: `${rows.length} ${lead.aggregationKey}`,
        memberIds: rows.map((row) => row.layer.id).sort(),
        provenance: mergeProvenance(rows.map((row) => row.layer.provenance)),
        provenanceEnvelope: mergeEnvelopes(
          `cluster:${key}`,
          rows.map((row) => envelopesById.get(row.layer.id)).filter(Boolean),
        ),
      };
    });
  }

  function placeLabels(layers, project, viewport, limit, envelopesById) {
    const placed = [];
    layers.slice().sort((left, right) => right.importance - left.importance).some((layer) => {
      if (placed.length >= limit) return true;
      const point = projectPoint(layer, project);
      if (point[0] < 0 || point[1] < 0 || point[0] > viewport.width || point[1] > viewport.height) return false;
      const box = labelBox(layer.label, point);
      if (placed.some((row) => overlaps(row.box, box))) return false;
      placed.push({
        id: layer.id,
        text: layer.label,
        anchor: point,
        box,
        provenance: layer.provenance,
        provenanceEnvelope: envelopesById.get(layer.id) || null,
      });
      return false;
    });
    return placed;
  }

  function projectPoint(layer, project) {
    const geometry = layer.geometry;
    const source = geometry.coordinates?.[0] || geometry.nodeIds?.[0] || geometry.segmentIds?.[0];
    const point = project(source, geometry, layer);
    if (!Array.isArray(point) || point.length < 2 || !point.slice(0, 2).every(Number.isFinite)) {
      throw compositorError('semantic_compositor_projected_point_invalid', `Projection for layer ${layer.id} did not return a finite point`);
    }
    return point.slice(0, 2);
  }

  function identityProject(source) {
    return Array.isArray(source) ? source : [0, 0];
  }

  function compareLayers(left, right, selected) {
    const selectedDelta = Number(selected.has(right.id)) - Number(selected.has(left.id));
    if (selectedDelta) return selectedDelta;
    const roleDelta = ROLE_ORDER[right.role] - ROLE_ORDER[left.role];
    if (roleDelta) return roleDelta;
    if (right.importance !== left.importance) return right.importance - left.importance;
    return left.id.localeCompare(right.id);
  }

  function normalizeQuantity(quantity, semanticDomain = null) {
    if (!quantity) return 0.5;
    const domain = semanticDomain || quantity.domain;
    if (domain) return clamp((quantity.value - domain[0]) / (domain[1] - domain[0]), 0, 1);
    return clamp(Math.log10(Math.abs(quantity.value) + 1) / 4, 0, 1);
  }

  function quantityDomains(layers) {
    const cohorts = new Map();
    layers.forEach((layer) => {
      if (!layer.quantity || layer.aggregationKey === null) return;
      const key = quantityCohortKey(layer);
      const rows = cohorts.get(key) || [];
      rows.push(layer.quantity.value);
      cohorts.set(key, rows);
    });
    return new Map([...cohorts.entries()].flatMap(([key, values]) => {
      if (values.length < 2) return [];
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      const lower = minimum >= 0 ? 0 : minimum;
      return [[key, [lower, maximum === lower ? lower + 1 : maximum]]];
    }));
  }

  function quantityCohortKey(layer) {
    if (!layer.quantity) return '';
    return `${layer.aggregationKey || layer.kind}:${layer.quantity.kind}:${layer.quantity.unit}`;
  }

  function mergeProvenance(rows) {
    const evidence = new Map();
    rows.forEach((row) => row.evidenceRefs.forEach((reference) => evidence.set(reference.id, reference)));
    const origins = new Set(rows.map((row) => row.axes.origin));
    const temporal = new Set(rows.map((row) => row.axes.temporalStatus));
    return {
      schema: 'simulatte.provenance.v4',
      axes: {
        origin: origins.size === 1 ? rows[0].axes.origin : 'derived',
        temporalStatus: temporal.size === 1 ? rows[0].axes.temporalStatus : 'snapshot',
        uncertainty: rows.some((row) => row.axes.uncertainty !== null)
          ? { kind: 'missing', value: { reason: 'cluster contains mixed uncertainty' } }
          : null,
      },
      evidenceRefs: [...evidence.values()],
    };
  }

  function resolveProvenance(presentation, receipt) {
    if (receipt === null) {
      return {
        isCanonical: false,
        bySubjectId: new Map(),
        sourceCoverage: null,
        unresolvedLayerIds: presentation.layers.map((row) => row.id),
      };
    }
    if (
      receipt.schema !== 'simulatte.contributionProvenanceReceipt.v4'
      || receipt.pluginId !== presentation.pluginId
      || !Array.isArray(receipt.envelopes)
    ) {
      throw compositorError('semantic_compositor_provenance_receipt_invalid', `Plugin ${presentation.pluginId} provenance receipt is invalid`);
    }
    const semanticEnvelopes = receipt.envelopes.filter((row) => row.subjectKind === 'semanticObject');
    semanticEnvelopes.forEach((row, index) => contracts.validateProvenanceEnvelope(
      row,
      `Compositor provenance envelopes[${index}]`,
    ));
    const bySubjectId = new Map(semanticEnvelopes.map((row) => [row.subjectId, row]));
    const unresolvedLayerIds = presentation.layers.filter((row) => !bySubjectId.has(row.id)).map((row) => row.id);
    if (unresolvedLayerIds.length) {
      throw compositorError('semantic_compositor_provenance_missing', 'Rendered layers lack canonical provenance envelopes', {
        pluginId: presentation.pluginId,
        unresolvedLayerIds,
      });
    }
    presentation.layers.forEach((layer) => {
      const envelope = bySubjectId.get(layer.id);
      const evidenceIds = layer.provenance.evidenceRefs.map((row) => row.id).sort();
      if (canonical(envelope.parentIds) !== canonical(evidenceIds)) {
        throw compositorError('semantic_compositor_provenance_parent_mismatch', `Layer ${layer.id} envelope parents do not match its evidence`, {
          layerId: layer.id,
        });
      }
    });
    return {
      isCanonical: true,
      bySubjectId,
      sourceCoverage: receipt.coverageMatrix,
      unresolvedLayerIds: [],
    };
  }

  function mergeEnvelopes(subjectId, rows) {
    if (!rows.length) return null;
    const axes = mergeProvenance(rows.map((row) => ({
      schema: 'simulatte.provenance.v4',
      axes: row.axes,
      evidenceRefs: [],
    }))).axes;
    axes.origin = 'derived';
    return contracts.createProvenanceEnvelope({
      subjectId,
      subjectKind: 'semanticObject',
      axes,
      datasetIds: unique(rows.flatMap((row) => row.datasetIds)),
      rowIds: unique(rows.flatMap((row) => row.rowIds)),
      artifactSha256s: unique(rows.flatMap((row) => row.artifactSha256s)),
      parentIds: unique(rows.map((row) => row.subjectId)),
      transformationChain: unique(rows.flatMap((row) => row.transformationChain)),
      modelReceiptIds: unique(rows.flatMap((row) => row.modelReceiptIds)),
      retrievalEpochs: unique(rows.flatMap((row) => row.retrievalEpochs)),
      scenarioEpochs: unique(rows.flatMap((row) => row.scenarioEpochs)),
      contentVersions: unique(rows.flatMap((row) => row.contentVersions)),
      licenseRequired: rows.some((row) => row.licenseRequired),
      licenseIdentifiers: unique(rows.flatMap((row) => row.licenseIdentifiers)),
    });
  }

  function compositorProvenanceReceipt(provenance, primitives, suppressed) {
    const envelopes = primitives.map((row) => row.provenanceEnvelope).filter(Boolean);
    const byOrigin = Object.fromEntries(contracts.ORIGINS.map((origin) => [
      origin,
      envelopes.filter((row) => row.axes.origin === origin).length,
    ]));
    return {
      schema: 'simulatte.compositorProvenanceReceipt.v4',
      isCanonical: provenance.isCanonical,
      renderedEnvelopeCount: envelopes.length,
      renderedSubjectIds: envelopes.map((row) => row.subjectId).sort(),
      suppressedSubjectIds: suppressed.map((row) => row.id).sort(),
      unresolvedLayerIds: provenance.unresolvedLayerIds,
      byOrigin,
      sourceCoverage: provenance.sourceCoverage,
    };
  }

  function unique(values) {
    return [...new Set(values)].sort();
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function uncertaintyDash(value) {
    if (value === null) return null;
    if (value.kind === 'missing') return [2, 5];
    if (value.kind === 'interval') return [6, 3];
    if (value.kind === 'distribution') return [3, 3];
    return [8, 3];
  }

  function isActive(layer, timeMs) {
    return layer.temporal === null || (timeMs >= layer.temporal.startMs && timeMs <= layer.temporal.endMs);
  }

  function labelBox(label, point) {
    return { x: point[0] + 8, y: point[1] - 9, width: Math.max(24, label.length * 7), height: 18 };
  }

  function overlaps(left, right) {
    return left.x < right.x + right.width
      && left.x + left.width > right.x
      && left.y < right.y + right.height
      && left.y + left.height > right.y;
  }

  function validateViewport(value) {
    if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width <= 0 || value.height <= 0) {
      throw compositorError('semantic_compositor_viewport_invalid', 'Viewport expected positive finite width and height');
    }
  }

  function positiveInteger(value, code, label) {
    if (!Number.isInteger(value) || value <= 0) throw compositorError(code, `${label} expected a positive integer`);
  }

  function positive(value, code, label) {
    if (!Number.isFinite(value) || value <= 0) throw compositorError(code, `${label} expected a positive finite number`);
  }

  function nonNegative(value, code, label) {
    if (!Number.isFinite(value) || value < 0) throw compositorError(code, `${label} expected a non-negative finite number`);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function compositorError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteSemanticCompositorError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return Object.freeze({ ORIGIN_COLORS, createCompositor, styleForLayer });
});
