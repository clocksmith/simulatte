const test = require('node:test');
const assert = require('node:assert/strict');
const motionApi = require('../public/simulatte/app/plugin-actor-motion.js');

function scene(x) {
  return {actors: [{id:'walker',sourceId:'walker',points:[{x,y:10,z:0}]}],
    cameraTargets:[{id:'follow-intent',sourceId:'walker',target:[x,0,-10]}]};
}

test('adjacent accepted poses interpolate the actor and its camera together without changing model state', () => {
  const motion=motionApi.create(), first=scene(0), next=scene(12);
  motion.update(first,{id:'a',running:true},0);
  motion.update(next,{id:'b',previousId:'a',running:true},200);
  const middle=motion.sample(300);
  assert.equal(middle.actors[0].points[0].x,6);
  assert.deepEqual(middle.cameraTargets[0].target,[6,0,-10]);
  assert.equal(middle.actors[0].heading,0);
  assert.equal(next.actors[0].points[0].x,12);
  motion.update(next,{id:'b',previousId:'a',running:true},300);
  assert.equal(motion.sample(350).actors[0].points[0].x,9,'redraw must not restart motion');
  assert.equal(motion.sample(500).actors[0].points[0].x,12,'never extrapolate beyond accepted state');
});

test('pause, seek, and route replacement use exact model positions without interpolating unrelated states', () => {
  for(const change of [{id:'b',previousId:'a',running:false},{id:'z',previousId:'y',running:true}]) {
    const motion=motionApi.create();
    motion.update(scene(0),{id:'a',running:true},0);
    motion.update(scene(12),change,200);
    assert.equal(motion.sample(201).actors[0].points[0].x,12);
    assert.deepEqual(motion.sample(900).cameraTargets[0].target,[12,0,-10]);
  }
});
