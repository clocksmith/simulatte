(function attachGridRestoration(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGridRestoration = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGridRestoration() {
  function schedule({ disturbance, restoration, policyId, crewCount }) {
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
      const completeHour = startHour + task.durationHours;
      crewAvailable[crewIndex] = completeHour;
      completionByTask.set(task.id, completeHour);
      rows.push({ ...task, crewId: restoration.crews[crewIndex]?.id || `crew-${crewIndex + 1}`, startHour, completeHour });
    });
    return deepFreeze({
      schema: 'simulatte.gridRestorationSchedule.v1',
      policyId,
      crewCount,
      tasks: rows,
      targetRestoredAtHour: Object.fromEntries(rows.map((row) => [row.targetId, row.completeHour])),
      crewOverlapValid: verifyCrewOverlap(rows),
      dependenciesValid: rows.every((row) => row.dependencyIds.every(
        (id) => (completionByTask.get(id) || 0) <= row.startHour
      )),
    });
  }

  function verifyCrewOverlap(rows) {
    return rows.every((row, index) => rows.slice(index + 1).every((other) => row.crewId !== other.crewId
      || row.completeHour <= other.startHour || other.completeHour <= row.startHour));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ schedule });
});
