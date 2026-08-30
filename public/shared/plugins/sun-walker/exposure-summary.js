(function attachSunWalkerExposureSummary(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunWalkerExposureSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerExposureSummary() {
  const SHADOW_DISPLAY = 'Blue ground polygons show modeled building shadows for the current sun azimuth and elevation.';
  const SHADOW_CALCULATION = 'Building shade applies when a ray from the walker toward the sun intersects a known-height building prism. Canopy and weather are modeled separately.';

  function summarize(state, sample = null) {
    const seconds = Object.freeze({
      direct: finite(state?.directSunSeconds),
      shade: finite(state?.shadeSeconds),
      unknown: finite(state?.unknownSeconds),
      night: finite(state?.nightSeconds),
      buildingShade: finite(state?.buildingShadeSeconds),
      canopyShade: finite(state?.canopyShadeSeconds),
      adjustedDirectBeam: finite(state?.directBeamEquivalentSeconds),
    });
    const geometricSeconds = Object.freeze({
      direct: finite(state?.geometricDirectSunSeconds),
      shade: finite(state?.geometricShadeSeconds),
      unknown: finite(state?.geometricUnknownSeconds),
      night: finite(state?.geometricNightSeconds),
    });
    const elapsedSeconds = seconds.direct + seconds.shade + seconds.unknown + seconds.night;
    const percentages = allocatePercentages({
      direct: seconds.direct,
      shade: seconds.shade,
      unknown: seconds.unknown,
      night: seconds.night,
    });
    const geometricPercentages = allocatePercentages(geometricSeconds);
    const adjustedDirectBeamPercent = elapsedSeconds > 0
      ? Math.round(seconds.adjustedDirectBeam / elapsedSeconds * 100)
      : 0;
    return Object.freeze({
      seconds,
      geometricSeconds,
      elapsedSeconds,
      percentages,
      geometricPercentages,
      adjustedDirectBeamPercent,
      current: currentExposure(sample),
      split: elapsedSeconds > 0
        ? `Exposure: Shade ${percentages.shade}% / Sun ${percentages.direct}% / Unknown ${percentages.unknown}% / Night ${percentages.night}%`
        : 'No completed exposure samples',
      geometricSplit: elapsedSeconds > 0
        ? `Geometry: Shade ${geometricPercentages.shade}% / Direct sun ${geometricPercentages.direct}% / Unknown ${geometricPercentages.unknown}% / Night ${geometricPercentages.night}%`
        : 'No completed geometric sun samples',
      shadowDisplay: SHADOW_DISPLAY,
      shadowCalculation: SHADOW_CALCULATION,
    });
  }

  function currentExposure(sample) {
    if (!sample) return Object.freeze({
      state: 'ready',
      label: 'Ready at route origin',
      geometricState: 'ready',
      geometricLabel: 'Geometric sun not sampled',
      adjustedDirectBeamPercent: 0,
    });
    const label = {
      direct: 'In direct sun',
      unknown: 'Exposure unknown',
      night: 'Night',
      shade: sample.occluderKind === 'building'
        ? 'In modeled building shade'
        : sample.occluderKind === 'tree-canopy'
          ? 'In modeled canopy shade'
          : 'In modeled shade',
    }[sample.state] || `Exposure: ${sample.state}`;
    const geometricState = sample.geometricState || sample.state;
    const geometricLabel = {
      direct: 'Geometrically in direct sun',
      shade: 'Geometrically in building shade',
      unknown: 'Geometric sun state unknown',
      night: 'Sun below modeled horizon',
    }[geometricState] || `Geometric sun: ${geometricState}`;
    return Object.freeze({
      state: sample.state,
      label,
      geometricState,
      geometricLabel,
      adjustedDirectBeamPercent: Math.round(finite(sample.directBeamFactor) * 100),
    });
  }

  function allocatePercentages(values) {
    const order = ['shade', 'direct', 'unknown', 'night'];
    const total = order.reduce((sum, key) => sum + finite(values[key]), 0);
    if (total <= 0) return Object.freeze(Object.fromEntries(order.map((key) => [key, 0])));
    const rows = order.map((key, index) => {
      const exact = finite(values[key]) / total * 100;
      return { key, index, value: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    let remaining = 100 - rows.reduce((sum, row) => sum + row.value, 0);
    rows.slice().sort((left, right) => right.remainder - left.remainder || left.index - right.index)
      .forEach((row) => {
        if (remaining <= 0) return;
        row.value += 1;
        remaining -= 1;
      });
    return Object.freeze(Object.fromEntries(rows.map((row) => [row.key, row.value])));
  }

  function finite(value) {
    return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  }

  return Object.freeze({ SHADOW_CALCULATION, SHADOW_DISPLAY, allocatePercentages, currentExposure, summarize });
});
