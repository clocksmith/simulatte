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

  function compileTierPresentation(pluginPresentation, fallbackCoordinateSystem = 'wgs84') {
    if (pluginPresentation?.schema === 'simulatte.pluginPresentation.v4') return compileSemantic(pluginPresentation);
    if (!pluginPresentation || pluginPresentation.schema !== 'simulatte.pluginPresentation.v3') return null;
    if (pluginPresentation.coordinateSystem) return compileCoordinateNative(pluginPresentation, fallbackCoordinateSystem);
    return compileGeospatial(pluginPresentation);
  }

  function compileSemantic(value) {
    const markers = [];
    const paths = [];
    const actors = [];
    const areas = [];
    const choropleths = [];
    const pointsById = new Map();
    value.layers.forEach((layer) => {
      const coordinates = layer.geometry.coordinates || [];
      if (!coordinates.length) return;
      pointsById.set(layer.id, coordinates);
      const style = compositorApi.styleForLayer(layer);
      const row = freezeRow({
        id: layer.id,
        label: layer.label,
        style,
        provenance: layer.provenance,
        intensity: style.strokeOpacity,
      });
      if (['point', 'label'].includes(layer.kind)) markers.push(freezeRow({
        ...row,
        position: normalizeTuple(coordinates[0], value.coordinateSystem),
        radius: style.radiusPx || 4,
      }));
      else if (layer.kind === 'actor') actors.push(freezeRow({
        ...row,
        position: normalizeTuple(coordinates[0], value.coordinateSystem),
        radius: style.radiusPx || 5,
      }));
      else if (layer.kind === 'path') paths.push(freezeRow({
        ...row,
        coordinates: Object.freeze(coordinates.map((point) => Object.freeze(normalizeTuple(point, value.coordinateSystem)))),
        width: style.widthPx || 1,
      }));
      else if (layer.kind === 'field') choropleths.push(freezeRow({
        ...row,
        coordinates: Object.freeze(coordinates.map((point) => Object.freeze(normalizeTuple(point, value.coordinateSystem)))),
        value: layer.quantity?.value || 0,
      }));
      else if (layer.kind === 'area') areas.push(freezeRow({
        ...row,
        coordinates: Object.freeze(coordinates.map((point) => Object.freeze(normalizeTuple(point, value.coordinateSystem)))),
      }));
    });
    const cameraTargets = value.viewIntents.flatMap((intent) => {
      const points = intent.targetIds.flatMap((id) => pointsById.get(id) || []);
      if (!points.length) return [];
      return [freezeRow({
        id: intent.id,
        label: intent.id,
        center: center(points),
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
      cameraTargets: Object.freeze(cameraTargets),
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
      cameraTargets: Object.freeze((value.geoCameraTargets || []).map((row) => freezeRow({ id:row.id,label:row.label,center:position(row),distance:row.distanceM }))),
    });
  }

  function compileContributions(contributions) {
    return Object.freeze((contributions || []).flatMap(({ pluginId, presentation }) => {
      const compiled = compileTierPresentation(presentation);
      if (!compiled) return [];
      const namespace = (id) => `plugin:${pluginId}:${id}`;
      const mapIds = (rows) => Object.freeze(rows.map((row) => freezeRow({ ...row, id: namespace(row.id), sourceId: row.id, pluginId })));
      return [Object.freeze({ ...compiled, pluginId, markers:mapIds(compiled.markers), paths:mapIds(compiled.paths), actors:mapIds(compiled.actors), areas:mapIds(compiled.areas), choropleths:mapIds(compiled.choropleths), cameraTargets:mapIds(compiled.cameraTargets) })];
    }));
  }

  function projectPoint(position, system, view) {
    const x = Number(position?.[0] || 0); const y = Number(position?.[1] || 0);
    if (system === 'wgs84') {
      if (view.currentTier === 'country' && view.bounds && view.projectCountry) return view.projectCountry(x, y, view.bounds);
      return { x: view.panX + x * 2.2 * view.zoom, y: view.panY - y * 2.2 * view.zoom };
    }
    if (system === 'heliocentric-ecliptic-au') return { x: view.panX + x * view.zoom, y: view.panY + y * view.zoom };
    if (system === 'icrs-cartesian-pc') { const scale = view.zoom / 5; return { x: view.panX + x * scale, y: view.panY - y * scale }; }
    return { x: view.panX + x * view.zoom, y: view.panY - y * view.zoom };
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
    return Object.freeze({
      set(contributions) {
        presentations = compileContributions(contributions);
        cameraTargets = Object.freeze(presentations.flatMap((row) => row.cameraTargets || []));
        return presentations;
      },
      focus(id) {
        const delta = focusDelta(cameraTargets, presentations, id, host.width(), host.height(), host.view());
        if (!delta) return false;
        host.pan(delta.dx, delta.dy);
        return true;
      },
      render(ctx) {
        if (!presentations.length) return;
        const view = host.view();
        draw(ctx, presentations, (position, system) => projectPoint(position, system, view), { timeSeconds: performance.now() / 1000 });
      },
    });
  }

  function draw(ctx, contributions, project, options = {}) {
    if (!ctx || typeof project !== 'function') return;
    const timeSeconds = Number(options.timeSeconds || 0);
    contributions.forEach((presentation) => {
      const projection = (position) => project(position, presentation.coordinateSystem);
      presentation.areas.forEach((area) => drawPolygon(ctx, area.coordinates, projection, area));
      presentation.choropleths.forEach((area) => drawPolygon(ctx, area.coordinates, projection, area));
      presentation.paths.forEach((path) => drawPath(ctx, path.coordinates, projection, path));
      presentation.markers.forEach((marker) => drawMarker(ctx, projection(marker.position), marker, false));
      presentation.actors.forEach((actor) => {
        const pulse = 0.85 + Math.sin(timeSeconds * 2 + hash(actor.id)) * 0.15;
        drawMarker(ctx, projection(actor.position), { ...actor, radius: Number(actor.radius || 4) * pulse }, true);
      });
    });
  }

  function drawPath(ctx, coordinates, project, path) {
    if (!coordinates || coordinates.length < 2) return;
    ctx.beginPath();
    coordinates.forEach((coordinate, index) => { const point=project(coordinate); if(index===0)ctx.moveTo(point.x,point.y); else ctx.lineTo(point.x,point.y); });
    ctx.strokeStyle = color(path.tone, path.style?.strokeOpacity ?? 0.8, path.style?.color);
    ctx.lineWidth = Math.max(1, Math.min(4, Number(path.style?.widthPx || path.width || 2)));
    ctx.setLineDash(path.style?.dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
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
  function drawMarker(ctx, point, marker, actor) {
    const radius = Math.max(2, Math.min(12, Number(marker.radius || marker.radiusM || (actor?4:5))));
    ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI*2); ctx.fillStyle=color(marker.tone,marker.style?.fillOpacity??0.95,marker.style?.color); ctx.shadowBlur=actor?12:8; ctx.shadowColor=color(marker.tone,marker.style?.strokeOpacity??0.9,marker.style?.color); ctx.fill(); ctx.shadowBlur=0;
    if (marker.label && radius >= 4) { ctx.fillStyle='rgba(237,245,243,0.78)'; ctx.font='10px sans-serif'; ctx.fillText(marker.label,point.x+radius+3,point.y+3); }
  }
  function color(tone, alpha, semantic = null) { const value=semantic||COLORS[tone]||COLORS.muted; if(value.startsWith('rgba')) return value; const a=Math.max(0,Math.min(1,alpha)); return `${value}${Math.round(a*255).toString(16).padStart(2,'0')}`; }
  function center(points) { const xs=points.map((row)=>row[0]);const ys=points.map((row)=>row[1]);return Object.freeze([(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2,0]); }
  function normalizeTuple(value, system) { if(!Array.isArray(value)||value.length<2||value.length>3||value.some((row)=>!Number.isFinite(row))) throw new Error(`tier_presentation_position_invalid: ${system}`); return Object.freeze([Number(value[0]),Number(value[1]),Number(value[2]||0)]); }
  function freezeRow(value) { return Object.freeze(value); }
  function hash(value) { return deterministicValues.fnv1a32CodePoints(value) / 4294967296 * Math.PI * 2; }
  return Object.freeze({ compileTierPresentation, compileContributions, draw, projectPoint, focusDelta, createLayer });
});
