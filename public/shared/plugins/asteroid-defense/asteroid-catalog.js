(function attachAsteroidCatalog(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAsteroidCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAsteroidCatalog() {
  const DEG = Math.PI / 180;
  const TWO_PI = Math.PI * 2;

  function positionAtEpoch(object, epochTdbJd) {
    validateOrbit(object);
    const elapsedDays = epochTdbJd - object.epochTdbJd;
    const periodDays = 365.2568983 * Math.pow(object.semiMajorAxisAu, 1.5);
    const meanAnomaly = normalizeRadians(object.meanAnomalyDeg * DEG + TWO_PI * elapsedDays / periodDays);
    const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, object.eccentricity);
    const xOrbital = object.semiMajorAxisAu * (Math.cos(eccentricAnomaly) - object.eccentricity);
    const yOrbital = object.semiMajorAxisAu
      * Math.sqrt(Math.max(0, 1 - object.eccentricity ** 2))
      * Math.sin(eccentricAnomaly);
    return rotateOrbitalPlane(
      xOrbital,
      yOrbital,
      object.longitudeAscendingNodeDeg * DEG,
      object.inclinationDeg * DEG,
      object.argumentPerihelionDeg * DEG
    );
  }

  function sampleOrbit(object, sampleCount = 72) {
    validateOrbit(object);
    const rows = [];
    for (let index = 0; index <= sampleCount; index += 1) {
      const eccentricAnomaly = TWO_PI * index / sampleCount;
      const xOrbital = object.semiMajorAxisAu * (Math.cos(eccentricAnomaly) - object.eccentricity);
      const yOrbital = object.semiMajorAxisAu
        * Math.sqrt(Math.max(0, 1 - object.eccentricity ** 2))
        * Math.sin(eccentricAnomaly);
      rows.push(rotateOrbitalPlane(
        xOrbital,
        yOrbital,
        object.longitudeAscendingNodeDeg * DEG,
        object.inclinationDeg * DEG,
        object.argumentPerihelionDeg * DEG
      ));
    }
    return rows;
  }

  function visualCatalog(objects, epochTdbJd, limit = 180) {
    return [...objects]
      .sort((left, right) => (
        hazardRank(right) - hazardRank(left)
          || numberOrInfinity(left.minimumOrbitIntersectionDistanceAu)
            - numberOrInfinity(right.minimumOrbitIntersectionDistanceAu)
          || numberOrInfinity(left.absoluteMagnitudeH) - numberOrInfinity(right.absoluteMagnitudeH)
          || left.id.localeCompare(right.id)
      ))
      .slice(0, limit)
      .map((object) => ({
        object,
        positionAu: positionAtEpoch(object, epochTdbJd),
      }));
  }

  function solveEccentricAnomaly(meanAnomaly, eccentricity) {
    let value = eccentricity < 0.8 ? meanAnomaly : Math.PI;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const residual = value - eccentricity * Math.sin(value) - meanAnomaly;
      const derivative = 1 - eccentricity * Math.cos(value);
      const next = value - residual / derivative;
      if (Math.abs(next - value) <= 1e-12) return next;
      value = next;
    }
    return value;
  }

  function rotateOrbitalPlane(x, y, ascendingNode, inclination, argumentPerihelion) {
    const cosNode = Math.cos(ascendingNode);
    const sinNode = Math.sin(ascendingNode);
    const cosInclination = Math.cos(inclination);
    const sinInclination = Math.sin(inclination);
    const cosPerihelion = Math.cos(argumentPerihelion);
    const sinPerihelion = Math.sin(argumentPerihelion);
    return [
      (cosNode * cosPerihelion - sinNode * sinPerihelion * cosInclination) * x
        + (-cosNode * sinPerihelion - sinNode * cosPerihelion * cosInclination) * y,
      (sinNode * cosPerihelion + cosNode * sinPerihelion * cosInclination) * x
        + (-sinNode * sinPerihelion + cosNode * cosPerihelion * cosInclination) * y,
      sinPerihelion * sinInclination * x + cosPerihelion * sinInclination * y,
    ];
  }

  function validateOrbit(object) {
    const values = [
      object?.epochTdbJd,
      object?.eccentricity,
      object?.semiMajorAxisAu,
      object?.inclinationDeg,
      object?.longitudeAscendingNodeDeg,
      object?.argumentPerihelionDeg,
      object?.meanAnomalyDeg,
    ];
    if (values.some((value) => !Number.isFinite(value))
      || object.semiMajorAxisAu <= 0
      || object.eccentricity < 0
      || object.eccentricity >= 1) {
      throw new TypeError(`Invalid bounded Keplerian orbit: ${object?.id || 'unknown'}`);
    }
  }

  function hazardRank(object) {
    return object.potentiallyHazardous === true ? 2 : object.nearEarthObject === true ? 1 : 0;
  }

  function numberOrInfinity(value) {
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  }

  function normalizeRadians(value) {
    return ((value % TWO_PI) + TWO_PI) % TWO_PI;
  }

  return Object.freeze({
    positionAtEpoch,
    sampleOrbit,
    solveEccentricAnomaly,
    visualCatalog,
  });
});
