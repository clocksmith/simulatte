(function attachQueueEngine(root, factory) {
  const api = factory();
  root.MaritimeQueueEngine = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createQueueEngineModule() {
  function simulatePortQueue({ portId, arrivalCount = 20, serverCount = 3, arrivalRatePerHour = 0.4, serviceMeanHours = 8, disruptionMultiplier = 1, random = null }) {
    if (!portId || !Number.isInteger(arrivalCount) || arrivalCount < 0 || !Number.isInteger(serverCount) || serverCount < 1) throw new Error('maritime_queue_input_invalid');
    const rng = random || fallbackRandom();
    const serverAvailable = Array(serverCount).fill(0);
    const rows = [];
    let arrivalAt = 0;
    for (let index = 0; index < arrivalCount; index += 1) {
      arrivalAt += rng.exponential(arrivalRatePerHour);
      let serverIndex = 0;
      for (let s = 1; s < serverAvailable.length; s += 1) if (serverAvailable[s] < serverAvailable[serverIndex]) serverIndex = s;
      const serviceStart = Math.max(arrivalAt, serverAvailable[serverIndex]);
      const waitHours = serviceStart - arrivalAt;
      const serviceHours = Math.max(0.25, rng.lognormal(Math.log(serviceMeanHours) - 0.125, 0.5) * disruptionMultiplier);
      const serviceEnd = serviceStart + serviceHours;
      serverAvailable[serverIndex] = serviceEnd;
      rows.push(Object.freeze({
        id: `${portId}:queue:${index}`, vesselId: `vessel-${portId}-${index + 1}`,
        arrivalHour: arrivalAt, serviceStartHour: serviceStart, serviceEndHour: serviceEnd,
        waitHours, serviceHours, serverIndex,
      }));
    }
    const waits = rows.map((row) => row.waitHours).sort((a,b) => a-b);
    return Object.freeze({
      schema: 'simulatte.maritimePortQueue.v1', portId, serverCount, vesselCount: rows.length,
      averageWaitHours: average(waits), p95WaitHours: percentile(waits, 0.95), maximumWaitHours: waits.at(-1) || 0,
      utilization: serverAvailable.reduce((sum, value) => sum + value, 0) / Math.max(1, serverCount * Math.max(...serverAvailable, 1)),
      rows: Object.freeze(rows),
    });
  }
  function fallbackRandom() { let state = 0x9e3779b9; const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296}; return { exponential(rate){let u=0;while(!u)u=next();return-Math.log(u)/rate;}, lognormal(mu,sigma){let u=0,v=0;while(!u)u=next();while(!v)v=next();return Math.exp(mu+sigma*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v));} }; }
  function average(rows) { return rows.length ? rows.reduce((sum,row)=>sum+row,0)/rows.length : 0; }
  function percentile(rows, p) { if (!rows.length) return 0; return rows[Math.min(rows.length-1, Math.max(0, Math.ceil(p*rows.length)-1))]; }
  return Object.freeze({ simulatePortQueue });
});
