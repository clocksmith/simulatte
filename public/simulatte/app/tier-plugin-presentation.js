(function attachTierPluginPresentation(root, factory) {
  const api = factory();
  root.SimulatteTierPluginPresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierPluginPresentationApi() {
  const COLORS = Object.freeze({ cyan:'#4de8ff',green:'#33ff66',amber:'#ffb347',red:'#ff5c66',magenta:'#ff4fd8',violet:'#a98cff',blue:'#6da8ff',shade:'#5e7389',muted:'rgba(237,245,243,0.28)' });

  function compileTierPresentation(pluginPresentation, fallbackCoordinateSystem = 'wgs84') {
    if (!pluginPresentation || pluginPresentation.schema !== 'simulatte.pluginPresentation.v3') return null;
    if (pluginPresentation.coordinateSystem) return compileCoordinateNative(pluginPresentation, fallbackCoordinateSystem);
    return compileGeospatial(pluginPresentation);
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
      presentation.areas.forEach((area) => drawPolygon(ctx, area.coordinates, projection, area.tone, area.intensity));
      presentation.choropleths.forEach((area) => drawPolygon(ctx, area.coordinates, projection, area.tone, Math.min(1.6, Number(area.intensity || 0.5))));
      presentation.paths.forEach((path) => drawPath(ctx, path.coordinates, projection, path.tone, path.width));
      presentation.markers.forEach((marker) => drawMarker(ctx, projection(marker.position), marker, false));
      presentation.actors.forEach((actor) => {
        const pulse = 0.85 + Math.sin(timeSeconds * 2 + hash(actor.id)) * 0.15;
        drawMarker(ctx, projection(actor.position), { ...actor, radius: Number(actor.radius || 4) * pulse }, true);
      });
    });
  }

  function drawPath(ctx, coordinates, project, tone, width) {
    if (!coordinates || coordinates.length < 2) return;
    ctx.beginPath();
    coordinates.forEach((coordinate, index) => { const point=project(coordinate); if(index===0)ctx.moveTo(point.x,point.y); else ctx.lineTo(point.x,point.y); });
    ctx.strokeStyle = color(tone, 0.8); ctx.lineWidth = Math.max(1, Math.min(8, Number(width || 2))); ctx.stroke();
  }
  function drawPolygon(ctx, coordinates, project, tone, intensity) {
    if (!coordinates || coordinates.length < 3) return;
    ctx.beginPath();
    coordinates.forEach((coordinate,index)=>{const point=project(coordinate);if(index===0)ctx.moveTo(point.x,point.y);else ctx.lineTo(point.x,point.y);});
    ctx.closePath(); ctx.fillStyle=color(tone,Math.max(0.06,Math.min(0.36,Number(intensity||0.4)*0.15))); ctx.strokeStyle=color(tone,0.55); ctx.fill(); ctx.stroke();
  }
  function drawMarker(ctx, point, marker, actor) {
    const radius = Math.max(2, Math.min(12, Number(marker.radius || marker.radiusM || (actor?4:5))));
    ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI*2); ctx.fillStyle=color(marker.tone,0.95); ctx.shadowBlur=actor?12:8; ctx.shadowColor=color(marker.tone,0.9); ctx.fill(); ctx.shadowBlur=0;
    if (marker.label && radius >= 4) { ctx.fillStyle='rgba(237,245,243,0.78)'; ctx.font='10px sans-serif'; ctx.fillText(marker.label,point.x+radius+3,point.y+3); }
  }
  function color(tone, alpha) { const value=COLORS[tone]||COLORS.muted; if(value.startsWith('rgba')) return value; const a=Math.max(0,Math.min(1,alpha)); return `${value}${Math.round(a*255).toString(16).padStart(2,'0')}`; }
  function normalizeTuple(value, system) { if(!Array.isArray(value)||value.length<2||value.length>3||value.some((row)=>!Number.isFinite(row))) throw new Error(`tier_presentation_position_invalid: ${system}`); return Object.freeze([Number(value[0]),Number(value[1]),Number(value[2]||0)]); }
  function freezeRow(value) { return Object.freeze(value); }
  function hash(value) { let h=2166136261; for(const c of String(value)){h^=c.codePointAt(0);h=Math.imul(h,16777619);} return (h>>>0)/4294967296*Math.PI*2; }
  return Object.freeze({ compileTierPresentation, compileContributions, draw, projectPoint, focusDelta, createLayer });
});
