const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../public/simulatte/motorcycle-noise/lifecycle.js');
const signal = require('../public/simulatte/motorcycle-noise/signal.js');
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(failures) {
  const frames = new Map(), states = [], prepares = [];
  let serial = 0, draws = 0, releases = 0, suspends = 0, time = 12;
  const control = create({
    prepare: async options => { prepares.push(options.backend); },
    frame: () => { draws++; if (failures.has(draws)) throw Error('injected draw failure'); time++; },
    suspend: () => { suspends++; }, release: async () => { releases++; }, onState: s => states.push(s.state),
    requestFrame: fn => { frames.set(++serial, fn); return serial; }, cancelFrame: id => frames.delete(id),
  });
  return { control, frames, states, prepares, get time(){return time;}, get releases(){return releases;}, get suspends(){return suspends;},
    draw(){assert.equal(frames.size,1);const [id,fn]=frames.entries().next().value;frames.delete(id);fn(100);}, };
}
for (const failedFrame of [1,3]) test(`draw failure at frame ${failedFrame} recovers once without duplicate frames`, async () => {
  const h=harness(new Set([failedFrame])); await h.control.start();
  assert.equal(h.control.snapshot().state,'loading');
  for(let i=0;i<failedFrame;i++)h.draw();
  const saved=h.time;assert.equal(h.control.snapshot().state,'recovering');await flush();
  assert.equal(h.time,saved);assert.equal(h.releases,1);assert.equal(h.suspends,1);
  assert.deepEqual(h.prepares,['auto','webgl']);h.draw();
  assert.equal(h.control.snapshot().state,'running');assert.equal(h.frames.size,1);
  await h.control.dispose();assert.equal(h.frames.size,0);
});
test('failed recovery stops drawing, retains pause, and explicit retry starts one loop',async()=>{
 const h=harness(new Set([1,2]));h.control.setPaused(true);await h.control.start();h.draw();await flush();h.draw();await flush();
 assert.equal(h.control.snapshot().state,'failed');assert.equal(h.frames.size,0);assert.equal(h.time,12);
 await h.control.retry();h.draw();assert.equal(h.control.snapshot().state,'paused');assert.equal(h.frames.size,1);await h.control.dispose();
});
test('disposal during pending renderer preparation cannot publish a frame',async()=>{
 let resolve;const queued=[];
 const control=create({prepare:()=>new Promise(r=>resolve=r),frame(){throw Error('stale frame');},suspend(){},release:async()=>{},onState(){},requestFrame:fn=>queued.push(fn),cancelFrame(){}});
 const boot=control.start();await control.dispose();resolve();await boot;assert.equal(queued.length,0);
});
for(const count of [4096,3000])test(`frequency bins preserve tone frequency and mean-square power for ${count} samples`,()=>{
 const rate=8000,frequency=1000,amplitude=.2,samples=Float64Array.from({length:count},(_,i)=>amplitude*Math.sin(2*Math.PI*frequency*i/rate));
 const result=signal.frequencyBins(samples,rate);const peak=result.bins.reduce((a,b)=>a.power>b.power?a:b);
 assert.ok(Math.abs(peak.hz-frequency)<=rate/result.transformLength);
 assert.ok(Math.abs(result.bins.reduce((sum,b)=>sum+b.power,0)-signal.energy(samples))<1e-12);
 assert.equal(result.sampleRate,8000);assert.equal(result.windowLength,count);assert.equal(result.transformLength,4096);
});
test('silent spectrum contains no candidate with positive power',()=>{
 const r=signal.frequencyBins(new Float64Array(3000),8000);assert.ok(r.bins.every(b=>b.power===0));
});
