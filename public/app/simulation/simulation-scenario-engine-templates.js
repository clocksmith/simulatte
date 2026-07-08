(function attachSimulatteScenarioEnginetemplates(root) {
  const scope = root.__SimulatteScenarioEngineRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const MAX_REPLAY = 64;

    const DEFAULT_STEPS = 12;

    const AXIS_LABELS = {
        setup: 'Setup',
        actors: 'Actors',
        resources: 'Resources',
        stress: 'Stress',
        access: 'Access',
        trust: 'Trust',
      };

    const TEMPLATE_LIBRARY = [
        {
          id: 'transit-heatwave',
          match: ['transit', 'train', 'bus', 'strike', 'heatwave', 'commute'],
          title: 'Transit Strike During Heatwave',
          domain: 'civic systems',
          visual: 'transit-heat',
          actors: [
            ['transit-agency', 'Transit agency', 'operator', 38],
            ['riders', 'Riders', 'public', 42],
            ['emergency-ops', 'Emergency ops', 'coordinator', 32],
            ['employers', 'Employers', 'constraint setter', 28],
          ],
          resources: [
            ['buses', 'Available buses', 58, 'mobile capacity'],
            ['cooling-centers', 'Cooling centers', 44, 'public relief'],
            ['driver-hours', 'Driver hours', 36, 'labor capacity'],
          ],
          rules: [
            'Heat raises rider risk when transit access falls.',
            'Emergency shuttles improve access but consume driver hours.',
            'Employer flexibility reduces peak load.',
          ],
          shocks: [
            ['strike', 'Driver strike', 0.62, 1],
            ['heatwave', 'Heatwave escalation', 0.52, 2],
          ],
          goals: [
            'Keep essential trips above 55%.',
            'Prevent cooling access from dropping below 45%.',
            'Stabilize public trust by the final step.',
          ],
        },
        {
          id: 'housing-shortage',
          match: ['housing', 'rent', 'zoning', 'eviction', 'shelter', 'homeless'],
          title: 'Housing Shortage Response',
          domain: 'housing',
          visual: 'housing',
          actors: [
            ['residents', 'Residents', 'households', 44],
            ['city-housing', 'City housing office', 'policy operator', 35],
            ['landlords', 'Landlords', 'supply owner', 30],
            ['builders', 'Builders', 'capacity provider', 27],
          ],
          resources: [
            ['available-units', 'Available units', 34, 'supply'],
            ['rental-aid', 'Rental aid', 46, 'stabilizer'],
            ['permits', 'Permit throughput', 42, 'future supply'],
          ],
          rules: [
            'Low supply increases household pressure.',
            'Rental aid reduces displacement risk while funds last.',
            'Permit throughput improves future supply with a delay.',
          ],
          shocks: [
            ['rent-spike', 'Rent spike', 0.56, 1],
            ['shelter-cap', 'Shelter capacity limit', 0.38, 3],
          ],
          goals: [
            'Keep displacement pressure below 60%.',
            'Increase available units before the final step.',
            'Avoid exhausting rental aid.',
          ],
        },
        {
          id: 'energy-outage',
          match: ['energy', 'power', 'grid', 'outage', 'battery', 'storm', 'coastal'],
          title: 'Grid Outage Recovery',
          domain: 'energy',
          visual: 'power',
          actors: [
            ['utility', 'Utility operators', 'grid owner', 36],
            ['hospitals', 'Hospitals', 'critical load', 48],
            ['households', 'Households', 'public load', 38],
            ['microgrids', 'Microgrid operators', 'resilience node', 24],
          ],
          resources: [
            ['generation', 'Generation reserve', 52, 'supply'],
            ['battery', 'Battery reserve', 48, 'buffer'],
            ['repair-crews', 'Repair crews', 40, 'recovery'],
          ],
          rules: [
            'Critical loads receive priority during scarcity.',
            'Battery reserve reduces outage pressure until depleted.',
            'Repair crews convert outage pressure into restored capacity.',
          ],
          shocks: [
            ['storm', 'Storm damage', 0.58, 1],
            ['peak-load', 'Peak load surge', 0.42, 2],
          ],
          goals: [
            'Restore service coverage above 65%.',
            'Keep hospital load protected.',
            'End with usable battery reserve.',
          ],
        },
        {
          id: 'supply-delay',
          match: ['supply', 'shipping', 'factory', 'inventory', 'shortage', 'port'],
          title: 'Supply Chain Delay',
          domain: 'supply chain',
          visual: 'supply',
          actors: [
            ['supplier', 'Supplier', 'upstream', 34],
            ['warehouse', 'Warehouse', 'buffer', 30],
            ['retailers', 'Retailers', 'demand edge', 42],
            ['customers', 'Customers', 'demand source', 36],
          ],
          resources: [
            ['inventory', 'Inventory', 46, 'buffer'],
            ['transport', 'Transport slots', 38, 'capacity'],
            ['cash', 'Cash reserve', 50, 'stabilizer'],
          ],
          rules: [
            'Inventory absorbs late shipments until buffers run down.',
            'Transport slots reduce backlog but raise cash pressure.',
            'Customer trust falls when fulfillment misses pile up.',
          ],
          shocks: [
            ['port-delay', 'Port delay', 0.54, 1],
            ['demand-spike', 'Demand spike', 0.36, 3],
          ],
          goals: [
            'Keep fulfillment coverage above 60%.',
            'Prevent inventory from collapsing.',
            'Recover customer trust by the final step.',
          ],
        },
        {
          id: 'agent-market',
          match: ['agent', 'agents', 'market', 'economy', 'competition', 'policy'],
          title: 'Agent Market Test',
          domain: 'agent society',
          visual: 'agents',
          actors: [
            ['planner', 'Planner agent', 'allocator', 28],
            ['seller', 'Seller agent', 'resource owner', 34],
            ['buyer', 'Buyer agent', 'demand source', 36],
            ['auditor', 'Auditor agent', 'policy check', 22],
          ],
          resources: [
            ['tokens', 'Trade tokens', 55, 'exchange'],
            ['goods', 'Goods', 50, 'supply'],
            ['policy-budget', 'Policy budget', 46, 'governance'],
          ],
          rules: [
            'Agents trade to satisfy goals while staying within policy.',
            'Audits reduce bad trades but consume policy budget.',
            'Scarcity increases pressure and exposes brittle strategies.',
          ],
          shocks: [
            ['scarcity', 'Resource scarcity', 0.46, 1],
            ['bad-signal', 'Bad signal', 0.34, 4],
          ],
          goals: [
            'Keep policy violations low.',
            'Maintain useful trades through scarcity.',
            'Promote strategies that recover after bad signals.',
          ],
        },
      ];

    Object.assign(scope, {
      MAX_REPLAY,
      DEFAULT_STEPS,
      AXIS_LABELS,
      TEMPLATE_LIBRARY,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
