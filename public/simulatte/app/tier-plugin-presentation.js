(function attachTierPluginPresentation(root, factory) {
  const deterministicValues = typeof module === 'object' && module.exports
    ? require('../../shared/deterministic-values.js')
    : root.SimulatteDeterministicValues;
  const compositorApi = typeof module === 'object' && module.exports
    ? require('../platform/render/semantic-compositor.js')
    : root.SimulatteSemanticCompositor;
  const api = factory(deterministicValues, compositorApi);
  root.SimulatteTierPluginPresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierPluginPresentationApi(deterministicValues, compositorApi) {
  const COLORS = Object.freeze({ cyan:'#4de8ff',green:'#33ff66',amber:'#ffb347',red:'#ff5c66',magenta:'#ff4fd8',violet:'#a98cff',blue:'#6da8ff',shade:'#5e7389',muted:'rgba(237,245,243,0.28)' });

  function compileTierPresentation(pluginPresentation, fallbackCoordinateSystem = 'wgs84', options = {}) {
    if (pluginPresentation?.schema === 'simulatte.pluginPresentation.v4') return compileSemantic(pluginPresentation, options);
    if (!pluginPresentation || pluginPresentation.schema !== 'simulatte.pluginPresentation.v3') return null;
    if (pluginPresentation.coordinateSystem) return compileCoordinateNative(pluginPresentation, fallbackCoordinateSystem);
    return compileGeospatial(pluginPresentation);
  }

  function compileSemantic(value, options) {
    const markers = [];
    const paths = [];
    const actors = [];
    const areas = [];
    const choropleths = [];
    const labels = [];
    const pointsById = new Map();
    value.layers.forEach((layer) => {
      const coordinates = layer.geometry.coordinates || [];
      if (!coordinates.length) return;
      pointsById.set(
        layer.id,
        layer.kind === 'actor'
          ? [pointAlongCoordinates(coordinates, semanticProgress(layer.quantity), value.coordinateSystem)]
          : coordinates
      );
    });
    const viewport = options.viewport || { width: 1024, height: 768 };
    const composition = compositorApi.createCompositor(options.compositorPolicy).compose(value, {
      simulationTimeMs: Number(options.simulationTimeMs || 0),
      selectedIds: options.selectedIds || [],
      viewport,
      provenanceReceipt: options.provenanceReceipt || null,
      project: (source) => {
        const point = options.project?.(normalizeTuple(source, value.coordinateSystem), value.coordinateSystem);
        return point ? [point.x, point.y] : [Number(source?.[0] || 0), Number(source?.[1] || 0)];
      },
    });
    composition.primitives.forEach((primitive) => {
      const coordinates = primitive.geometry.coordinates || [];
      if (!coordinates.length) return;
      const style = primitive.style;
      const row = freezeRow({
        id: primitive.id,
        label: primitive.label,
        style,
        provenance: primitive.provenance,
        memberIds: primitive.memberIds,
        intensity: style.strokeOpacity,
        quantityKind: primitive.quantity?.kind || '',
        quantityValue: primitive.quantity?.value ?? null,
      });
      if (['point', 'point-cluster', 'label'].includes(primitive.kind)) markers.push(freezeRow({
        ...row,
        position: normalizeTuple(coordinates[0], value.coordinateSystem),
        radius: style.radiusPx || 4,
      }));
      else if (primitive.kind === 'actor') actors.push(freezeRow({
        ...row,
        position: normalizeTuple(
          pointAlongCoordinates(coordinates, semanticProgress(primitive.quantity), value.coordinateSystem),
          value.coordinateSystem
        ),
        radius: style.radiusPx || 5,
      }));
      else if (primitive.kind === 'path') paths.push(freezeRow({
        ...row,
        coordinates: Object.freeze(coordinates.map((point) => Object.freeze(normalizeTuple(point, value.coordinateSystem)))),
        width: style.widthPx || 1,
      }));
      else if (primitive.kind === 'field') choropleths.push(freezeRow({
        ...row,
        coordinates: Object.freeze(coordinates.map((point) => Object.freeze(normalizeTuple(point, value.coordinateSystem)))),
        value: primitive.quantity?.value || 0,
      }));
      else if (['area', 'volume'].includes(primitive.kind)) areas.push(freezeRow({
        ...row,
        coordinates: Object.freeze(coordinates.map((point) => Object.freeze(normalizeTuple(point, value.coordinateSystem)))),
        height: primitive.kind === 'volume'
          ? Math.max(0.35, Number(primitive.quantity?.value || 0))
          : 0.35,
        isVolume: primitive.kind === 'volume',
      }));
    });
    composition.labels.forEach((label) => {
      const points = pointsById.get(label.id) || [];
      if (!points.length) return;
      labels.push(freezeRow({
        id: label.id,
        label: label.text,
        position: center(points),
        provenance: label.provenance,
      }));
    });
    const cameraTargets = value.viewIntents.flatMap((intent) => {
      const points = intent.targetIds.flatMap((id) => pointsById.get(id) || []);
      if (!points.length) return [];
      return [freezeRow({
        id: intent.id,
        label: cameraTargetLabel(value.layers, intent),
        center: center(points),
        bounds: coordinateBounds(points),
        coordinates: Object.freeze(points.map((point) => Object.freeze([...point]))),
        memberIds: Object.freeze([...intent.targetIds]),
        distance: 0,
        viewMode: intent.mode,
        priority: intent.priority,
        reasonEventId: intent.reasonEventId,
      })];
    });
    return Object.freeze({
      schema: value.schema,
      coordinateSystem: value.coordinateSystem,
      epoch: value.epoch,
      markers: Object.freeze(markers),
      paths: Object.freeze(paths),
      actors: Object.freeze(actors),
      areas: Object.freeze(areas),
      choropleths: Object.freeze(choropleths),
      labels: Object.freeze(labels),
      cameraTargets: Object.freeze(cameraTargets),
      compositorReceipt: composition.receipt,
    });
  }

  function compileCoordinateNative(value, fallback) {
    const coordinateSystem = value.coordinateSystem || fallback;
    return Object.freeze({
      schema: value.schema, coordinateSystem, epoch: value.epoch || null,
      markers: Object.freeze((value.markers || []).map((row) => freezeRow({ ...row, position: normalizeTuple(row.position, coordinateSystem) }))),
      paths: Object.freeze((value.paths || []).map((row) => freezeRow({ ...row, coordinates: Object.freeze(row.coordinates.map((point) => Object.freeze(normalizeTuple(point, coordinateSystem)))) }))),
      actors: Object.freeze((value.actors || []).map((row) => freezeRow({ ...row, position: normalizeTuple(row.position, coordinateSystem) }))),
      areas: Object.freeze((value.areas || []).map((row) => freezeRow({ ...row, coordinates: Object.freeze((row.coordinates || []).map((point) => Object.freeze(normalizeTuple(point, coordinateSystem)))) }))),
      choropleths: Object.freeze([]),
      labels: Object.freeze([]),
      cameraTargets: Object.freeze((value.cameraTargets || []).map((row) => freezeRow({ ...row, center: normalizeTuple(row.center, coordinateSystem) }))),
    });
  }

  function compileGeospatial(value) {
    const position = (row) => [row.longitude, row.latitude, 0];
    return Object.freeze({
      schema: value.schema, coordinateSystem: 'wgs84', epoch: value.epoch || null,
      markers: Object.freeze((value.geoMarkers || []).map((row) => freezeRow({ id:row.id,label:row.label,position:position(row),tone:row.tone,radius:row.radiusM,height:row.heightM,intensity:row.intensity }))),
      paths: Object.freeze((value.geoPaths || []).map((row) => freezeRow({ id:row.id,label:row.label,coordinates:Object.freeze(row.coordinates.map((point)=>Object.freeze(position(point)))),tone:row.tone,width:row.widthM,intensity:row.intensity }))),
      actors: Object.freeze([]),
      areas: Object.freeze((value.geoAreas || []).map((row) => freezeRow({ id:row.id,label:row.label,coordinates:Object.freeze(row.ring.map((point)=>Object.freeze(position(point)))),tone:row.tone,height:row.heightM,intensity:row.intensity }))),
      choropleths: Object.freeze((value.choropleths || []).map((row) => freezeRow({ id:row.id,label:row.label,coordinates:Object.freeze(row.ring.map((point)=>Object.freeze(position(point)))),tone:row.tone,value:row.value,intensity:row.intensity }))),
      labels: Object.freeze([]),
      cameraTargets: Object.freeze((value.geoCameraTargets || []).map((row) => freezeRow({ id:row.id,label:row.label,center:position(row),distance:row.distanceM }))),
    });
  }

  function compileContributions(contributions, options = {}) {
    return Object.freeze((contributions || []).flatMap(({ pluginId, presentation }) => {
      const provenanceReceipt = (options.provenanceReceipts || [])
        .find((receipt) => receipt?.pluginId === pluginId) || null;
      const compiled = compileTierPresentation(presentation, 'wgs84', {
        ...options,
        provenanceReceipt,
      });
      if (!compiled) return [];
      const namespace = (id) => `plugin:${pluginId}:${id}`;
      const mapIds = (rows) => Object.freeze(rows.map((row) => freezeRow({ ...row, id: namespace(row.id), sourceId: row.id, pluginId })));
      return [Object.freeze({ ...compiled, pluginId, markers:mapIds(compiled.markers), paths:mapIds(compiled.paths), actors:mapIds(compiled.actors), areas:mapIds(compiled.areas), choropleths:mapIds(compiled.choropleths), labels:mapIds(compiled.labels), cameraTargets:mapIds(compiled.cameraTargets) })];
    }));
  }

  function projectPoint(position, system, view) {
    const x = Number(position?.[0] || 0);
    const y = Number(position?.[1] || 0);
    const z = Number(position?.[2] || 0);
    if (system === 'wgs84') {
      if (view.currentTier === 'country' && view.bounds && view.projectCountry) return view.projectCountry(x, y, view.bounds);
      return { x: view.panX + x * 2.2 * view.zoom, y: view.panY - y * 2.2 * view.zoom, depth: 0, scale: 1 };
    }
    if (system === 'heliocentric-ecliptic-au' || system === 'icrs-cartesian-pc') {
      const rotated = rotatePoint([x, y, z], Number(view.rotX || 0), Number(view.rotY || 0));
      const baseScale = system === 'icrs-cartesian-pc' ? view.zoom / 5 : view.zoom;
      const perspective = clamp(
        1 + rotated[2] * (system === 'icrs-cartesian-pc' ? 0.018 : 0.06),
        0.5,
        1.8
      );
      return {
        x: view.panX + rotated[0] * baseScale * perspective,
        y: view.panY - rotated[1] * baseScale * perspective,
        depth: rotated[2],
        scale: perspective,
      };
    }
    return { x: view.panX + x * view.zoom, y: view.panY - y * view.zoom, depth: z, scale: 1 };
  }

  function semanticProgress(quantity) {
    if (!quantity || !Array.isArray(quantity.domain)) return 0;
    const [minimum, maximum] = quantity.domain;
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) return 0;
    return clamp((Number(quantity.value) - minimum) / (maximum - minimum), 0, 1);
  }

  function pointAlongCoordinates(coordinates, progress, coordinateSystem = null) {
    if (!Array.isArray(coordinates) || !coordinates.length) return [0, 0, 0];
    if (coordinates.length === 1) return coordinates[0];
    const lengths = [];
    let total = 0;
    for (let index = 1; index < coordinates.length; index += 1) {
      const left = coordinates[index - 1];
      const right = coordinates[index];
      const longitudeDelta = coordinateSystem === 'wgs84'
        && Math.abs(Number(right[0]) - Number(left[0])) > 180
        ? Number(right[0]) - Number(left[0]) - Math.sign(Number(right[0]) - Number(left[0])) * 360
        : Number(right[0]) - Number(left[0]);
      const distance = Math.hypot(
        longitudeDelta,
        Number(right[1] || 0) - Number(left[1] || 0),
        Number(right[2] || 0) - Number(left[2] || 0)
      );
      lengths.push(distance);
      total += distance;
    }
    if (total <= 0) return coordinates[0];
    let target = total * clamp(progress, 0, 1);
    for (let index = 0; index < lengths.length; index += 1) {
      if (target > lengths[index]) {
        target -= lengths[index];
        continue;
      }
      const ratio = lengths[index] ? target / lengths[index] : 0;
      const left = coordinates[index];
      const right = coordinates[index + 1];
      let longitudeDelta = Number(right[0]) - Number(left[0]);
      if (coordinateSystem === 'wgs84' && Math.abs(longitudeDelta) > 180) {
        longitudeDelta -= Math.sign(longitudeDelta) * 360;
      }
      const longitude = Number(left[0]) + longitudeDelta * ratio;
      return [
        coordinateSystem === 'wgs84'
          ? ((longitude + 180) % 360 + 360) % 360 - 180
          : longitude,
        Number(left[1] || 0) + (Number(right[1] || 0) - Number(left[1] || 0)) * ratio,
        Number(left[2] || 0) + (Number(right[2] || 0) - Number(left[2] || 0)) * ratio,
      ];
    }
    return coordinates.at(-1);
  }

  function focusDelta(cameraTargets, presentations, id, width, height, view) {
    const target = (cameraTargets || []).find((row) => row.id === id);
    if (!target) return null;
    const system = presentations.find((row) => row.pluginId === target.pluginId)?.coordinateSystem || 'wgs84';
    const point = projectPoint(target.center, system, view);
    return { dx: width / 2 - point.x, dy: height / 2 - point.y };
  }

  function createLayer(host) {
    let presentations = Object.freeze([]);
    let cameraTargets = Object.freeze([]);
    let simulationTimeSeconds = 0;
    return Object.freeze({
      set(contributions, runtimeOptions = {}) {
        const view = host.view();
        presentations = compileContributions(contributions, {
          ...runtimeOptions,
          viewport: { width: Math.max(1, host.width()), height: Math.max(1, host.height()) },
          project: (position, system) => projectPoint(position, system, view),
        });
        simulationTimeSeconds = Math.max(0, Number(runtimeOptions.simulationTimeMs || 0)) / 1000;
        cameraTargets = Object.freeze(presentations.flatMap((row) => row.cameraTargets || []));
        return presentations;
      },
      focus(id) {
        const target = cameraTargets.find((row) => row.id === id);
        if (!target) return false;
        const system = presentations.find((row) => row.pluginId === target.pluginId)?.coordinateSystem || 'wgs84';
        if (host.fit?.(target, system)) return true;
        const delta = focusDelta(cameraTargets, presentations, id, host.width(), host.height(), host.view());
        if (!delta) return false;
        host.pan(delta.dx, delta.dy);
        return true;
      },
      render(ctx) {
        if (!presentations.length) return;
        const view = host.view();
        draw(ctx, presentations, (position, system) => projectPoint(position, system, view), {
          timeSeconds: simulationTimeSeconds,
        });
      },
      receipt() {
        return Object.freeze(presentations.flatMap((row) => row.compositorReceipt
          ? [{ pluginId: row.pluginId, ...row.compositorReceipt }]
          : []));
      },
      targets: () => cameraTargets,
    });
  }

  function draw(ctx, contributions, project, options = {}) {
    if (!ctx || typeof project !== 'function') return;
    const timeSeconds = Number(options.timeSeconds || 0);
    contributions.forEach((presentation) => {
      const projection = (position) => project(position, presentation.coordinateSystem);
      const entries = [
        ...presentation.areas.map((row) => ({ kind: 'polygon', row, order: 0 })),
        ...presentation.choropleths.map((row) => ({ kind: 'polygon', row, order: 1 })),
        ...presentation.paths.map((row) => ({ kind: 'path', row, order: 2 })),
        ...presentation.markers.map((row) => ({ kind: 'marker', row, order: 3 })),
        ...presentation.actors.map((row) => ({ kind: 'actor', row, order: 4 })),
      ].map((entry) => ({
        ...entry,
        depth: primitiveDepth(entry.row, projection),
      })).sort((left, right) => left.depth - right.depth || left.order - right.order);
      entries.forEach(({ kind, row }) => {
        if (kind === 'polygon') drawPolygon(ctx, row.coordinates, projection, row);
        else if (kind === 'path') drawPath(ctx, row.coordinates, projection, row, timeSeconds);
        else if (kind === 'marker') drawMarker(ctx, projection(row.position), row, timeSeconds);
        else drawActor(ctx, projection(row.position), row, timeSeconds);
      });
      drawCollisionManagedLabels(ctx, presentation.labels, projection);
    });
  }

  function drawPath(ctx, coordinates, project, path, timeSeconds) {
    if (!coordinates || coordinates.length < 2) return;
    const projected = coordinates.map(project);
    ctx.beginPath();
    projected.forEach((point, index) => {
      const crossesDateLine = index > 0 && Math.abs(coordinates[index][0] - coordinates[index - 1][0]) > 180;
      if (index === 0 || crossesDateLine) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = color(path.tone, path.style?.strokeOpacity ?? 0.8, path.style?.color);
    ctx.lineWidth = Math.max(1, Math.min(4, Number(path.style?.widthPx || path.width || 2)));
    ctx.setLineDash(path.style?.dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
    if (animatedFlow(path.quantityKind)) {
      splitProjectedPath(coordinates, projected).forEach((segment) => {
        drawFlowParticles(ctx, segment, path, timeSeconds);
      });
    }
  }
  function drawPolygon(ctx, coordinates, project, area) {
    if (!coordinates || coordinates.length < 3) return;
    ctx.beginPath();
    coordinates.forEach((coordinate,index)=>{const point=project(coordinate);if(index===0)ctx.moveTo(point.x,point.y);else ctx.lineTo(point.x,point.y);});
    ctx.closePath();
    ctx.fillStyle=color(area.tone,area.style?.fillOpacity ?? Math.max(0.06,Math.min(0.36,Number(area.intensity||0.4)*0.15)),area.style?.color);
    ctx.strokeStyle=color(area.tone,area.style?.strokeOpacity ?? 0.55,area.style?.color);
    ctx.fill();
    ctx.stroke();
  }
  function drawMarker(ctx, point, marker, timeSeconds) {
    const radius = Math.max(
      2,
      Math.min(12, Number(marker.radius || marker.radiusM || 5)) * Number(point.scale || 1)
    );
    ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI*2); ctx.fillStyle=color(marker.tone,marker.style?.fillOpacity??0.95,marker.style?.color); ctx.shadowBlur=8; ctx.shadowColor=color(marker.tone,marker.style?.strokeOpacity??0.9,marker.style?.color); ctx.fill(); ctx.shadowBlur=0;
    if (consequentialPoint(marker.quantityKind)) {
      const pulse = (Math.sin(timeSeconds * 3 + hash(marker.id)) + 1) / 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius + 3 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = color(marker.tone, 0.75 - pulse * 0.35, marker.style?.color);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  function drawActor(ctx, point, actor, timeSeconds) {
    const radius = Math.max(4, Math.min(14, Number(actor.radius || 5) * Number(point.scale || 1)));
    const kind = String(actor.quantityKind || '');
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.fillStyle = color(actor.tone, actor.style?.fillOpacity ?? 0.98, actor.style?.color);
    ctx.strokeStyle = color(actor.tone, actor.style?.strokeOpacity ?? 1, actor.style?.color);
    ctx.shadowBlur = 14;
    ctx.shadowColor = ctx.strokeStyle;
    if (/actor\.car/.test(kind)) drawCarGlyph(ctx, radius);
    else if (/actor\.(?:vessel|ship|repair-vessel)/.test(kind)) drawShipGlyph(ctx, radius);
    else if (/actor\.pedestrian/.test(kind)) drawWalkerGlyph(ctx, radius);
    else if (/actor\.spacecraft/.test(kind)) drawSpacecraftGlyph(ctx, radius);
    else if (/actor\.asteroid/.test(kind)) drawAsteroidGlyph(ctx, radius, timeSeconds);
    else if (/actor\.repair-crew/.test(kind)) drawRepairGlyph(ctx, radius);
    else if (/actor\.packet/.test(kind)) drawPacketGlyph(ctx, radius);
    else {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawCarGlyph(ctx, radius) {
    ctx.beginPath();
    ctx.roundRect(-radius * 1.25, -radius * 0.62, radius * 2.5, radius * 1.24, radius * 0.32);
    ctx.fill();
    ctx.fillStyle = '#07110f';
    ctx.fillRect(-radius * 0.56, -radius * 0.48, radius * 1.12, radius * 0.42);
  }
  function drawShipGlyph(ctx, radius) {
    ctx.beginPath();
    ctx.moveTo(radius * 1.45, 0);
    ctx.lineTo(radius * 0.45, radius * 0.68);
    ctx.lineTo(-radius * 1.35, radius * 0.52);
    ctx.lineTo(-radius * 1.05, -radius * 0.52);
    ctx.lineTo(radius * 0.45, -radius * 0.68);
    ctx.closePath();
    ctx.fill();
  }
  function drawRepairGlyph(ctx, radius) {
    drawCarGlyph(ctx, radius);
    ctx.fillStyle = '#07110f';
    ctx.fillRect(-radius * 0.12, -radius * 1.05, radius * 0.24, radius * 1.2);
    ctx.fillRect(-radius * 0.58, -radius * 0.72, radius * 1.16, radius * 0.22);
  }
  function drawWalkerGlyph(ctx, radius) {
    ctx.beginPath();
    ctx.arc(0, -radius * 0.72, radius * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, radius * 0.28);
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.3);
    ctx.lineTo(0, radius * 0.45);
    ctx.moveTo(0, 0);
    ctx.lineTo(-radius * 0.65, radius * 0.15);
    ctx.moveTo(0, 0);
    ctx.lineTo(radius * 0.65, -radius * 0.05);
    ctx.moveTo(0, radius * 0.42);
    ctx.lineTo(-radius * 0.48, radius);
    ctx.moveTo(0, radius * 0.42);
    ctx.lineTo(radius * 0.48, radius);
    ctx.stroke();
  }
  function drawSpacecraftGlyph(ctx, radius) {
    ctx.beginPath();
    ctx.moveTo(radius * 1.3, 0);
    ctx.lineTo(-radius * 0.8, -radius * 0.72);
    ctx.lineTo(-radius * 0.35, 0);
    ctx.lineTo(-radius * 0.8, radius * 0.72);
    ctx.closePath();
    ctx.fill();
  }
  function drawAsteroidGlyph(ctx, radius, timeSeconds) {
    ctx.rotate(timeSeconds * 0.18);
    ctx.beginPath();
    for (let index = 0; index < 9; index += 1) {
      const angle = index / 9 * Math.PI * 2;
      const pointRadius = radius * (0.78 + (hash(`asteroid:${index}`) % 0.28));
      const x = Math.cos(angle) * pointRadius;
      const y = Math.sin(angle) * pointRadius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  function drawPacketGlyph(ctx, radius) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
    ctx.stroke();
  }
  function drawFlowParticles(ctx, points, path, timeSeconds) {
    if (points.length < 2) return;
    const phase = (timeSeconds / 1.5 + hash(path.id)) % 1;
    const count = Math.max(1, Math.min(4, Math.ceil(Number(path.style?.widthPx || 1))));
    for (let index = 0; index < count; index += 1) {
      const point = pointAlongProjectedPath(points, (phase + index / count) % 1);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = color(path.tone, 0.95, path.style?.color);
      ctx.fill();
    }
  }
  function pointAlongProjectedPath(points, progress) {
    const lengths = [];
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
      lengths.push(total);
    }
    const target = total * progress;
    const index = Math.max(0, lengths.findIndex((value) => value >= target));
    const startTotal = index === 0 ? 0 : lengths[index - 1];
    const span = Math.max(0.000001, lengths[index] - startTotal);
    const ratio = (target - startTotal) / span;
    return {
      x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
      y: points[index].y + (points[index + 1].y - points[index].y) * ratio,
    };
  }
  function splitProjectedPath(coordinates, projected) {
    const segments = [];
    let active = [];
    projected.forEach((point, index) => {
      if (index > 0 && Math.abs(coordinates[index][0] - coordinates[index - 1][0]) > 180) {
        if (active.length >= 2) segments.push(active);
        active = [];
      }
      active.push(point);
    });
    if (active.length >= 2) segments.push(active);
    return segments;
  }
  function drawLabel(ctx, text, x, y) {
    ctx.font = '600 10px system-ui, sans-serif';
    const label = String(text);
    const width = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(3, 10, 9, 0.8)';
    ctx.fillRect(x - 2, y - 10, width + 5, 14);
    ctx.fillStyle = 'rgba(237,245,243,0.88)';
    ctx.fillText(label, x, y);
  }
  function drawCollisionManagedLabels(ctx, labels, project) {
    const placed = [];
    (labels || []).forEach((label) => {
      const point = project(label.position);
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
      ctx.font = '600 10px system-ui, sans-serif';
      const width = ctx.measureText(String(label.label)).width;
      const box = { x: point.x + 3, y: point.y - 15, width: width + 9, height: 18 };
      if (placed.some((row) => overlaps(row, box))) return;
      placed.push(box);
      drawLabel(ctx, label.label, point.x + 5, point.y - 5);
    });
  }
  function overlaps(left, right) {
    return !(
      left.x + left.width + 2 <= right.x
      || right.x + right.width + 2 <= left.x
      || left.y + left.height + 2 <= right.y
      || right.y + right.height + 2 <= left.y
    );
  }
  function animatedFlow(kind) {
    return /(?:cargo|flow|transfer|utilization|route|data-rate|shipment|service)/.test(String(kind || ''));
  }
  function consequentialPoint(kind) {
    return /(?:unserved|dropped|illness|failure|queue|impact|encounter|shortage)/.test(String(kind || ''));
  }
  function primitiveDepth(row, project) {
    const coordinates = row.coordinates || (row.position ? [row.position] : []);
    if (!coordinates.length) return 0;
    return coordinates.reduce((sum, point) => sum + Number(project(point).depth || 0), 0) / coordinates.length;
  }
  function rotatePoint(point, rotX, rotY) {
    const [x, y, z] = point;
    const x1 = x * Math.cos(rotY) - z * Math.sin(rotY);
    const z1 = x * Math.sin(rotY) + z * Math.cos(rotY);
    const y2 = y * Math.cos(rotX) - z1 * Math.sin(rotX);
    const z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX);
    return [x1, y2, z2];
  }
  function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
  function color(tone, alpha, semantic = null) { const value=semantic||COLORS[tone]||COLORS.muted; if(value.startsWith('rgba')) return value; const a=Math.max(0,Math.min(1,alpha)); return `${value}${Math.round(a*255).toString(16).padStart(2,'0')}`; }
  function center(points) {
    const axes = [0, 1, 2].map((axis) => points.map((row) => Number(row[axis] || 0)));
    return Object.freeze(axes.map((values) => (Math.min(...values) + Math.max(...values)) / 2));
  }
  function coordinateBounds(points) {
    const xs=points.map((row)=>row[0]);const ys=points.map((row)=>row[1]);
    return Object.freeze({minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)});
  }
  function cameraTargetLabel(layers, intent) {
    if (intent.targetIds.length === 1) {
      const layer = layers.find((row) => row.id === intent.targetIds[0]);
      if (layer?.label) return layer.label;
    }
    return String(intent.id)
      .replace(/:[^:]+$/, '')
      .split(/[-_:]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  function normalizeTuple(value, system) { if(!Array.isArray(value)||value.length<2||value.length>3||value.some((row)=>!Number.isFinite(row))) throw new Error(`tier_presentation_position_invalid: ${system}`); return Object.freeze([Number(value[0]),Number(value[1]),Number(value[2]||0)]); }
  function freezeRow(value) { return Object.freeze(value); }
  function hash(value) { return deterministicValues.fnv1a32CodePoints(value) / 4294967296 * Math.PI * 2; }
  return Object.freeze({ compileTierPresentation, compileContributions, draw, projectPoint, focusDelta, createLayer });
});
