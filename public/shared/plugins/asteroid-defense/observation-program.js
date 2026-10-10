(function attachObservationProgram(root, factory) {
  const api = factory();
  root.SimulatteAsteroidObservationProgram = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis, function createObservationProgram() {
  function acquire(campaign, ids) {
    if (!Array.isArray(ids) || ids.length < 4 || new Set(ids).size !== ids.length) throw new Error('asteroid_acquired_observations_invalid');
    const byId = new Map(campaign.observations.map(row => [row.id, row]));
    const rows = ids.map(id => byId.get(id));
    if (rows.some(row => !row)) throw new Error('asteroid_acquired_observation_missing');
    if (rows.some((row, i) => i && row.epochDayTdb < rows[i-1].epochDayTdb)) throw new Error('asteroid_acquired_observation_order_invalid');
    return rows;
  }
  function next(campaign, ids, stationId = null) {
    const acquired = acquire(campaign, ids);
    const latest = acquired.at(-1).epochDayTdb;
    return campaign.observations.filter(row => !ids.includes(row.id) && row.epochDayTdb >= latest && (!stationId || row.stationId === stationId))
      .sort((a,b) => a.epochDayTdb-b.epochDayTdb || a.id.localeCompare(b.id))[0] || null;
  }
  function initial(campaign, count) {
    return [...campaign.observations].sort((a,b) => a.epochDayTdb-b.epochDayTdb || a.id.localeCompare(b.id)).slice(0,count).map(row=>row.id);
  }
  return Object.freeze({acquire, next, initial});
});
