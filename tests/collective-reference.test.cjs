const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../public/shared/plugins/gpu-supercluster/collective-solver.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function ring(n, bandwidthGbps = 8) {
  return { gpus: Array.from({ length: n }, (_, i) => ({ id: `g${i}` })),
    links: Array.from({ length: n }, (_, i) => ({ id: `l${i}`, sourceGpuId: `g${i}`,
      targetGpuId: `g${(i + 1) % n}`, bandwidthGbps, latencySeconds: 0 })) };
}
test('four-rank ring transfers six 250-byte chunks per rank at one GB/s', () => {
  // Independent byte ledger: reduce-scatter + allgather = 2*(N-1) rounds.
  const topology = ring(4);
  const plan = api.planCollective({ topology, groups: [topology.gpus.map(g => g.id)], bytes: 1000, algorithm: 'ring-allreduce' });
  assert.equal(plan.rounds.length, 6);
  near(plan.logicalBytes, 6000);
  near(plan.durationMs, 0.0015);
  for (const round of plan.rounds) {
    assert.equal(round.transfers.length, 4);
    for (const link of round.links) assert.ok(link.bytes / (round.durationMs / 1000) <= 1e9 + 1e-6);
  }
});
test('capacity belongs to routed links; halving every capacity doubles serialization time', () => {
  const run = bandwidth => api.planCollective({ topology: ring(4, bandwidth), groups: [['g0','g1','g2','g3']], bytes: 1000, algorithm: 'ring-allreduce' });
  near(run(4).durationMs, 2 * run(8).durationMs);
  const broken = ring(4); broken.links = broken.links.slice(0, 1);
  assert.throws(() => api.planCollective({ topology: broken, groups: [['g0','g2']], bytes: 1000, algorithm: 'ring-allreduce' }), /disconnected/);
});
test('double binary trees deliver both reduced partitions to every rank', () => {
  const topology = ring(5), groups = [topology.gpus.map(g => g.id)];
  const plan = api.planCollective({ topology, groups, bytes: 1000, algorithm: 'tree-allreduce' });
  assert.equal(plan.rounds.length, 4);
  assert.equal(plan.rounds.reduce((n,r) => n + r.transfers.length, 0), 16);
  for (const partition of [0,1]) {
    const values=new Map(groups[0].map(id=>[id,new Set([id])]));
    for(const round of plan.rounds){
      const before=new Map([...values].map(([id,tokens])=>[id,new Set(tokens)]));
      for(const t of round.transfers.filter(t=>t.partition===partition))
        for(const token of before.get(t.from))values.get(t.to).add(token);
    }
    assert.ok([...values.values()].every(tokens=>tokens.size===5));
  }
  near(plan.logicalBytes, 8000);
  assert.ok(plan.rounds.every(r => r.transfers.every(t => t.linkIds.length > 0)));
});
test('two-by-two torus routes opposite-corner buckets through both dimensions', () => {
  const topology = ring(4);
  const plan = api.planCollective({ topology, groups: [topology.gpus.map(g => g.id)], bytes: 1000, algorithm: '2d-torus-all-to-all' });
  const transfers = plan.rounds.flatMap(r => r.transfers);
  assert.equal(plan.rounds.length, 2);
  assert.equal(transfers.length,8);
  // Each rank forwards two 250-byte buckets horizontally, then two vertically.
  // Three distinct recipients include one requiring two hops.
  near(plan.logicalBytes,4000);
  assert.deepEqual(plan.rounds.map(r=>r.transfers.find(t=>t.from==='g0').to),['g1','g2']);
  assert.equal(plan.operation, 'all-to-all');
});
test('invalid identities, unsupported algorithms and nonfinite budgets fail closed', () => {
  for (const args of [{ bytes: NaN }, { bytes: -1 }, { algorithm: 'magic' }, { groups: [['g0','g0']] }]) {
    assert.throws(() => api.planCollective({ topology: ring(4), groups: [['g0','g1']], bytes: 1000, algorithm: 'ring-allreduce', ...args }));
  }
});

test('multiple nodes within a rack remain connected by physical gateway links',()=>{
 const topology=require('../public/shared/plugins/gpu-supercluster/cluster-topology.js').buildClusterTopology({totalGpus:16,racks:2,nodesPerRack:2,gpusPerNode:4});
 assert.equal(topology.infinibandCount,4);
 const plan=api.planCollective({topology,groups:[topology.gpus.map(g=>g.id)],bytes:1000,algorithm:'ring-allreduce'});
 assert.ok(plan.durationMs>0);
});
