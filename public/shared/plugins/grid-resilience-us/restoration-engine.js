(function attachGridRestoration(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGridRestoration = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGridRestoration() {
  const MAXIMUM_ATTEMPTS = 3;

  function schedule({ disturbance, restoration, policyId, crewCount, seed = 'grid-restoration' }) {
    const targets = [
      ...disturbance.unavailableInterfaceIds,
      ...Object.entries(disturbance.unavailableResourceFractions || {}).filter(([, fraction]) => fraction > 0).map(([id]) => id),
    ];
    const taskByTarget = new Map(restoration.tasks.map((row) => [row.targetId, row]));
    const pending = targets.map((targetId) => taskByTarget.get(targetId) || {
      id: `restore-${targetId}`,
      targetId,
      targetKind: disturbance.unavailableInterfaceIds.includes(targetId) ? 'interface' : 'resource',
      dependencyIds: [],
      durationHours: 4,
      attemptSuccessProbability: 1,
    });
    const ordered = [...pending].sort((a, b) => {
      if (policyId === 'dependency-aware') {
        const dependencyDifference = a.dependencyIds.length - b.dependencyIds.length;
        if (dependencyDifference) return dependencyDifference;
      }
      if (policyId === 'service-impact-first') {
        const interfaceDifference = Number(b.targetKind === 'interface') - Number(a.targetKind === 'interface');
        if (interfaceDifference) return interfaceDifference;
      }
      return a.id.localeCompare(b.id);
    });
    const crewAvailable = Array.from({ length: crewCount }, () => 0);
    const completionByTask = new Map();
    const rows = [];
    ordered.forEach((task) => {
      const crewIndex = crewAvailable.indexOf(Math.min(...crewAvailable));
      const dependenciesComplete = Math.max(0, ...task.dependencyIds.map((id) => completionByTask.get(id) || 0));
      const startHour = Math.max(crewAvailable[crewIndex], dependenciesComplete);
      const attempts = [];
      let crewReleaseHour = startHour;
      let successful = false;
      for (let attempt = 1; Number.isFinite(startHour)
        && attempt <= MAXIMUM_ATTEMPTS && !successful; attempt += 1) {
        const attemptStartHour = crewReleaseHour;
        crewReleaseHour += task.durationHours;
        const draw = unit(`${seed}:${task.id}:attempt-${attempt}`);
        successful = draw <= task.attemptSuccessProbability;
        attempts.push({
          attempt,
          startHour: attemptStartHour,
          completeHour: crewReleaseHour,
          draw,
          success: successful,
        });
      }
      const completeHour = successful ? crewReleaseHour : null;
      if (Number.isFinite(crewReleaseHour)) crewAvailable[crewIndex] = crewReleaseHour;
      completionByTask.set(task.id, successful ? completeHour : Infinity);
      rows.push({
        ...task,
        crewId: restoration.crews[crewIndex]?.id || `crew-${crewIndex + 1}`,
        startHour: Number.isFinite(startHour) ? startHour : null,
        completeHour,
        crewReleaseHour: Number.isFinite(crewReleaseHour) ? crewReleaseHour : null,
        successful,
        attempts,
      });
    });
    return deepFreeze({
      schema: 'simulatte.gridRestorationSchedule.v1',
      policyId,
      crewCount,
      tasks: rows,
      targetRestoredAtHour: Object.fromEntries(rows
        .filter((row) => row.successful)
        .map((row) => [row.targetId, row.completeHour])),
      crewOverlapValid: verifyCrewOverlap(rows),
      dependenciesValid: rows.every((row) => row.dependencyIds.every(
        (id) => (completionByTask.get(id) || 0) <= row.startHour
      )),
    });
  }

  function verifyCrewOverlap(rows) {
    return rows.every((row, index) => rows.slice(index + 1).every((other) => row.crewId !== other.crewId
      || row.crewReleaseHour === null || other.crewReleaseHour === null
      || row.crewReleaseHour <= other.startHour || other.crewReleaseHour <= row.startHour));
  }

  function unit(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0xffffffff;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ MAXIMUM_ATTEMPTS, schedule });
});
