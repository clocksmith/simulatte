export const WORLD_CONFIG = {
  map: {
    width: 24,
    height: 18
  },
  startTile: { x: 11, y: 8 },
  regions: [
    {
      id: 'origin-gate',
      name: 'Origin Gate',
      domain: 'Simulatte LLC',
      kind: 'public',
      tile: { x: 11, y: 8 },
      color: 'neutral',
      archetype: 'gate',
      elevation: 52,
      unlockRequires: [],
      summary:
        'Simulatte lets AI propose software, but real actions only run after strict, auditable checks.',
      bullets: [
        'Output can vary, but enforcement must be consistent every time.',
        'No receipt means no side effect.',
        'Apps can be temporary; safety boundaries remain permanent.'
      ],
      dossier: {
        mission:
          'Build local-first browser-native systems where execution is policy-gated and auditable.',
        vision:
          'On-demand software in the browser with deterministic trust boundaries.',
        relation:
          'Parent company frame connecting all Simulatte projects into one operating stack.',
        why:
          'To keep generation flexible while keeping side effects provable and accountable.',
        funFact: 'Doctrine shortcut: no receipt, no side effect.'
      },
      challenge: {
        title: 'Mission Alignment',
        prompt: 'Which flow matches Simulatte core doctrine?',
        options: [
          'generate -> execute -> maybe verify later',
          'intent -> verify -> execute with receipt',
          'execute quickly, then patch with audits'
        ],
        correctIndex: 1,
        success: 'Correct. The boundary is deterministic; no receipt means no side effect.',
        failure: 'Not this one. Verification happens before side effects.'
      },
      reward: {
        type: 'fact',
        title: 'Mission Core',
        text:
          'Simulatte builds local-first browser-native systems where policy enforcement is deterministic and auditable.'
      },
      musicUnlocks: [{ stem: 'drums', level: 2 }],
      portal: null
    },
    {
      id: 'signal-frontier',
      name: 'Signal Frontier',
      domain: '256.one',
      kind: 'public',
      tile: { x: 5, y: 4 },
      color: 'purple',
      archetype: 'garden',
      form: 'terrain',
      elevation: 20,
      unlockRequires: ['origin-gate'],
      summary:
        'Research and narrative front door for AI systems, performance, and safety thinking with interactive artifacts.',
      bullets: [
        'Public research and article surface.',
        'Evidence-oriented narrative style.',
        'Human-vs-AI contribution percentages exposed.'
      ],
      dossier: {
        mission:
          'Publish public research and narrative that makes complex AI/runtime systems legible.',
        vision:
          'A living, interactive research notebook where ideas are testable and explorable.',
        relation:
          'Research and communication front door for the rest of the Simulatte stack.',
        why:
          'Because trust compounds when claims are paired with artifacts and evidence.',
        funFact: 'Posts display clocksmith vs AI contribution percentages.'
      },
      challenge: {
        title: 'Signal Proof',
        prompt: 'Pick the strongest public-facing posture for 256.one:',
        options: [
          'opaque claims without measurable artifacts',
          'public narrative plus testable experiments',
          'private memos only'
        ],
        correctIndex: 1,
        success: 'Right. 256 is the narrative-and-experimentation front door.',
        failure: 'Try again. This region is about public, testable signal.'
      },
      reward: {
        type: 'fact',
        title: '256.one Role',
        text:
          '256.one translates systems thinking into public experiments and narrative that make the rest of the stack legible.'
      },
      musicUnlocks: [{ stem: 'bass', level: 2 }],
      portal: 'https://256.one'
    },
    {
      id: 'model-arcade',
      name: 'Model Arcade',
      domain: 'GAMMA',
      kind: 'public',
      tile: { x: 17, y: 3 },
      color: 'purple',
      archetype: 'plaza-glyph',
      form: 'terrain',
      elevation: 18,
      unlockRequires: ['origin-gate'],
      summary:
        'Interactive model intuition surface where users learn token behavior, sampling, and model comparison through play.',
      bullets: [
        'LLM behavior made interactive.',
        'Comparison and mind-meld workflows.',
        'Acronym: Game Analyzing Model Methods Attentively.'
      ],
      dossier: {
        mission:
          'Teach model behavior through gameplay, probability visibility, and direct interaction.',
        vision:
          'Anyone should be able to build token intuition by playing with model outputs.',
        relation:
          'Educational observability wedge that prepares users for deeper stack concepts.',
        why:
          'Understanding model mechanics reduces hype and improves operator judgment.',
        funFact: 'GAMMA expands to Game Analyzing Model Methods Attentively.'
      },
      challenge: {
        title: 'Token Intuition',
        prompt: 'What is GAMMA trying to teach first?',
        options: [
          'How to hide model internals from users',
          'How next-token behavior actually works',
          'How to skip probability tooling entirely'
        ],
        correctIndex: 1,
        success: 'Correct. GAMMA makes token prediction mechanics visible and playable.',
        failure: 'Not quite. This region is about model behavior transparency.'
      },
      reward: {
        type: 'fact',
        title: 'GAMMA Role',
        text:
          'GAMMA is the educational observability wedge that grounds model intuition in direct interaction.'
      },
      musicUnlocks: [{ stem: 'harmony', level: 1 }],
      portal: 'https://256.one/labs'
    },
    {
      id: 'policy-range',
      name: 'Policy Range',
      domain: 'replo.id',
      kind: 'public',
      tile: { x: 19, y: 8 },
      color: 'red',
      archetype: 'citadel',
      elevation: 50,
      unlockRequires: ['signal-frontier', 'model-arcade'],
      summary:
        'Agent/policy layer testing constrained recursive self-improvement with HITL, verification, and rollback.',
      bullets: [
        'Self-modification inside browser constraints.',
        'Genesis level capability progression.',
        'Transparency and rollback are mandatory.'
      ],
      dossier: {
        mission:
          'Validate safe recursive self-improvement inside constrained browser-native boundaries.',
        vision:
          'Policy-first agent orchestration with HITL gates, rollback, and auditable mutation paths.',
        relation:
          'Agent/policy layer above compute and execution boundaries.',
        why:
          'Autonomy without policy controls is brittle; constrained agency is durable.',
        funFact: 'Capability progression is structured through Genesis levels.'
      },
      challenge: {
        title: 'Policy Gate',
        prompt: 'Which action should policy permit automatically?',
        options: [
          'Any side effect if model confidence is high',
          'Only actions with acceptable deterministic checks',
          'Core module rewrite without audit trace'
        ],
        correctIndex: 1,
        success: 'Correct. Reploid centers deterministic checks and auditable boundaries.',
        failure: 'Policy Range rejects ambient authority.'
      },
      reward: {
        type: 'proof',
        title: 'Policy Principle',
        text:
          'Reploid validates whether safe self-improvement can happen inside constrained browser-native boundaries.'
      },
      musicUnlocks: [{ stem: 'lead', level: 1 }],
      portal: 'https://replo.id'
    },
    {
      id: 'runtime-basin',
      name: 'Runtime Basin',
      domain: 'Doppler',
      kind: 'public',
      tile: { x: 16, y: 13 },
      color: 'green',
      archetype: 'basin',
      form: 'terrain',
      elevation: 14,
      unlockRequires: ['policy-range'],
      summary:
        'Browser-native WebGPU runtime for inference and training primitives with fast local startup and manifest-first contracts.',
      bullets: [
        'Compute substrate for agent and product loops.',
        'Runtime WGSL/JS flow, local-first execution.',
        'Distributed On-device Processing for Prefill, Learning, and Execution Runtime.'
      ],
      dossier: {
        mission:
          'Provide browser-native WebGPU runtime primitives for local inference and learning workloads.',
        vision:
          'Runtime-first compute substrate with manifest contracts and fast startup behavior.',
        relation:
          'Compute layer used by policy and product-core loops.',
        why:
          'Local runtime constraints define real user experience more than benchmark theater.',
        funFact:
          'DOPPLER stands for Distributed On-device Processing for Prefill, Learning, and Execution Runtime.'
      },
      challenge: {
        title: 'Runtime Tradeoff',
        prompt: 'For short outputs, which metric dominates UX most?',
        options: ['Model startup/load latency', 'Only maximum decode throughput', 'Cloud round-trip count'],
        correctIndex: 0,
        success: 'Correct. For short outputs, startup and TTFT often dominate perceived UX.',
        failure: 'Recheck Doppler positioning around short-output latency.'
      },
      reward: {
        type: 'proof',
        title: 'Compute Principle',
        text:
          'Doppler prioritizes browser-native runtime behavior where startup and local execution constraints shape product feel.'
      },
      musicUnlocks: [{ stem: 'drums', level: 3 }],
      portal: null
    },
    {
      id: 'chronicle-commons',
      name: 'Chronicle Commons',
      domain: 'Data Commons',
      kind: 'public',
      tile: { x: 11, y: 15 },
      color: 'green',
      archetype: 'delta',
      form: 'terrain',
      elevation: 12,
      unlockRequires: ['runtime-basin'],
      summary:
        'Applied time-series data layer (renamed from d4da framing) focused on verifiable historical memory and alignment.',
      bullets: [
        'Compare anything, trust everything framing.',
        'Historical archive model over real-time oracle race.',
        'Portable verification and provenance in workflows.'
      ],
      dossier: {
        mission:
          'Build verified historical time-series memory that stays queryable and attributable.',
        vision:
          'Cross-category alignment where provenance and reproducibility are first-class.',
        relation:
          'Applied data-network layer proving the stack on real data workflows.',
        why:
          'Teams need durable historical truth, not just fast but unverifiable feeds.',
        funFact: 'Positioning favors historical archive utility over real-time oracle competition.'
      },
      challenge: {
        title: 'Data Memory',
        prompt: 'Which statement best matches Chronicle Commons?',
        options: [
          'Ultra-low-latency real-time oracle only',
          'Verified decentralized historical time-series memory',
          'Closed data silo with no provenance'
        ],
        correctIndex: 1,
        success: 'Correct. This region is about verified historical memory and alignment.',
        failure: 'Chronicle Commons is not positioned as a real-time oracle race.'
      },
      reward: {
        type: 'fact',
        title: 'Applied Layer',
        text:
          'Chronicle Commons is the applied data network/use-case layer proving the stack on real data workflows.'
      },
      musicUnlocks: [{ stem: 'bass', level: 3 }],
      portal: 'https://d4da.com'
    },
    {
      id: 'contract-ridge',
      name: 'Contract Ridge',
      domain: 'Plasma (Private)',
      kind: 'private',
      tile: { x: 4, y: 9 },
      color: 'neutral',
      archetype: 'ridge',
      form: 'terrain',
      elevation: 18,
      unlockRequires: ['origin-gate'],
      summary:
        'Deterministic boundary contract between generated state and executable side effects.',
      bullets: [
        'Flow: candidate -> constrained state -> receipt or trace.',
        'No side effects before accept(receipt).',
        'Profile inheritance controls required capabilities.'
      ],
      dossier: {
        mission:
          'Define the deterministic contract between generated state and executable side effects.',
        vision:
          'A strict accept(receipt)/reject(trace) boundary with replayable decision semantics.',
        relation:
          'Boundary layer constraining Dream and related runtime execution paths.',
        why:
          'Deterministic boundaries are the long-term moat when generation becomes abundant.',
        funFact:
          'Decision invariance is keyed by state hash, policy hash, checker identity, and runtime context.'
      },
      challenge: {
        title: 'Boundary Contract',
        prompt: 'What is Plasma enforcing first?',
        options: [
          'Unconstrained direct side effects',
          'Deterministic decision for identical hashes/context',
          'Randomized acceptance for exploration'
        ],
        correctIndex: 1,
        success: 'Correct. Plasma is deterministic at the boundary decision layer.',
        failure: 'Contract Ridge is deterministic by design.'
      },
      reward: {
        type: 'proof',
        title: 'Boundary Rule',
        text:
          'Plasma formalizes the deterministic accept/reject contract that protects execution boundaries.'
      },
      musicUnlocks: [{ stem: 'harmony', level: 2 }],
      portal: null
    },
    {
      id: 'core-loop-plains',
      name: 'Core Loop Plains',
      domain: 'Dream (Private)',
      kind: 'private',
      tile: { x: 6, y: 13 },
      color: 'neutral',
      archetype: 'plains',
      form: 'terrain',
      elevation: 10,
      unlockRequires: ['contract-ridge'],
      summary:
        'Product-core loop: intent -> experience -> verify -> execute with hard trust boundaries.',
      bullets: [
        'CG is experience state.',
        'EG is only side-effect-capable representation.',
        'Receipt-bound dispatch is invariant.'
      ],
      dossier: {
        mission:
          'Implement the intent -> experience -> verify -> execute product-core loop.',
        vision:
          'Operator-first generative runtime where only verified EG dispatch can touch the world.',
        relation:
          'Product core integrating composition, compilation, checking, and hydration.',
        why:
          'To separate creative variation from non-negotiable enforcement correctness.',
        funFact: 'CG carries experience state; EG is the only side-effect-capable representation.'
      },
      challenge: {
        title: 'Loop Integrity',
        prompt: 'Which representation can cause side effects in Dream?',
        options: ['CompositionGraph only', 'Any model output', 'EffectGraph with matching receipt'],
        correctIndex: 2,
        success: 'Correct. EG with matching receipt is the only path to side effects.',
        failure: 'Dream keeps side effects bound to verified EG dispatch.'
      },
      reward: {
        type: 'fact',
        title: 'Core Runtime',
        text:
          'Dream is the product-core implementation of intent-to-execution with deterministic enforcement guarantees.'
      },
      musicUnlocks: [{ stem: 'lead', level: 2 }],
      portal: null
    },
    {
      id: 'ops-forge',
      name: 'Ops Forge',
      domain: 'Fawn (Private)',
      kind: 'private',
      tile: { x: 3, y: 15 },
      color: 'red',
      archetype: 'forge',
      elevation: 41,
      unlockRequires: ['core-loop-plains'],
      summary:
        'Machine-driven runtime engineering program emphasizing deterministic validators, benchmark ratchets, and reproducible traces.',
      bullets: [
        'Zero tape: no recurring human bureaucracy.',
        'Config-as-code across runtime controls.',
        'Priorities include dev speed, p95 latency, and correctness proofs.'
      ],
      dossier: {
        mission:
          'Drive runtime engineering with deterministic validators, reproducible traces, and benchmark ratchets.',
        vision:
          'Zig-first hot paths with Lean proof obligations where they have the highest leverage.',
        relation:
          'Internal execution-discipline layer that hardens quality across the stack.',
        why:
          'Performance and correctness must improve through measured, repeatable process instead of ad hoc heroics.',
        funFact: 'Canonical stage order is Mine -> Normalize -> Verify -> Bind -> Gate -> Benchmark -> Release.'
      },
      challenge: {
        title: 'Ops Workflow',
        prompt: 'Which docs setup keeps agent instructions unified across tool surfaces?',
        options: [
          'Maintain three separate copies and edit all manually',
          'Symlink CLAUDE.md and GEMINI.md to AGENTS.md',
          'Delete AGENTS.md and keep only GEMINI.md'
        ],
        correctIndex: 1,
        success: 'Correct. One canonical AGENTS.md with symlinked mirrors keeps instruction drift low.',
        failure: 'Not this one. The goal is one canonical instruction file with linked mirrors.'
      },
      reward: {
        type: 'proof',
        title: 'Ops Discipline',
        text:
          'Fawn strengthens reliability/performance culture with deterministic validators and reproducible engineering traces.'
      },
      musicUnlocks: [{ stem: 'harmony', level: 3 }],
      portal: null
    },
    {
      id: 'zero-vault',
      name: 'Zero Vault',
      domain: 'Zero (Private)',
      kind: 'private',
      tile: { x: 1, y: 12 },
      color: 'green',
      archetype: 'vault',
      elevation: 43,
      unlockRequires: ['ops-forge'],
      summary:
        'Private autonomous trading framework with event-driven multi-strategy execution and configurable risk/execution blocks.',
      bullets: [
        'Signal + risk + execution configuration chain.',
        'Live dashboard and kill-switch operational controls.',
        'Supports simulated, paper, and live modes.'
      ],
      dossier: {
        mission:
          'Run a private autonomous strategy lab with explicit risk and execution controls.',
        vision:
          'Composable signal + risk + execution pipelines across sim, paper, and live operation modes.',
        relation:
          'Private applied systems lab adjacent to core Simulatte platform work.',
        why:
          'Real operations pressure-tests architecture and control discipline better than toy scenarios.',
        funFact: 'Operational kill-switch behavior is treated as a first-class control.'
      },
      challenge: {
        title: 'Execution Safety',
        prompt: 'What must be defined together in Zero strategy config?',
        options: ['Signal only', 'signal + risk + execution', 'execution only'],
        correctIndex: 1,
        success: 'Correct. The strategy contract binds signal, risk, and execution.',
        failure: 'Zero config is intentionally structured around all three blocks.'
      },
      reward: {
        type: 'fact',
        title: 'Private Applied Lab',
        text:
          'Zero is a private applied systems lab for strategy composition, execution discipline, and operational controls.'
      },
      musicUnlocks: [{ stem: 'lead', level: 3 }],
      portal: null
    }
  ],
  landmarks: [
    {
      id: 'relay-south',
      tile: { x: 13, y: 10 },
      title: 'Relay Tower',
      text: 'Stack chain mnemonic: research -> policy -> runtime -> boundary -> compute -> data commons.'
    },
    {
      id: 'mirror-canal',
      tile: { x: 8, y: 3 },
      title: 'Mirror Canal',
      text: 'Easter egg: "castles are ephemeral; checker is permanent."'
    },
    {
      id: 'archive-node',
      tile: { x: 20, y: 13 },
      title: 'Archive Node',
      text: 'Public surfaces ship links; private districts stay explorable but linkless.'
    },
    {
      id: 'kernel-obelisk',
      tile: { x: 6, y: 10 },
      title: 'Kernel Obelisk',
      text: 'Doppler and Reploid split: compute substrate vs policy orchestration.'
    },
    {
      id: 'aurora-garden',
      tile: { x: 14, y: 5 },
      title: 'Aurora Garden',
      text: 'Fun fact: world music upgrades queue now and apply only at the next bar boundary.'
    },
    {
      id: 'echo-lake',
      tile: { x: 9, y: 14 },
      title: 'Echo Lake',
      text: 'Chronicle Commons inherits the stack philosophy: provenance first, then portability.'
    },
    {
      id: 'compass-grove',
      tile: { x: 2, y: 6 },
      title: 'Compass Grove',
      text: 'Origin first, then split routes: Signal Frontier and Model Arcade unlock in parallel.'
    },
    {
      id: 'glitch-mural',
      tile: { x: 18, y: 6 },
      title: 'Glitch Mural',
      text: 'Private districts are part of the world narrative, but intentionally have no portal links.'
    }
  ]
};

export const STEM_LABELS = {
  drums: 'Drums',
  bass: 'Bass',
  harmony: 'Harmony',
  lead: 'Lead'
};
