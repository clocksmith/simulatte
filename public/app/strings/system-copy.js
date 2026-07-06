export const SYSTEM_COPY = {
  status: {
    cursorOnline: 'Cursor online / scanning world map',
    regionLockConfirmed: (name) => `Region lock confirmed / ${name}`,
    regionInRange: (name) => `Cursor online / region in range: ${name}`,
    regionSealed: (reason) => `Region sealed / ${reason}`,
    discovery: (title) => `Discovery / ${title}`,
    noRegionAtCursor: 'No region at cursor / adjust route',
    selectRegionFirst: 'Select a region first',
    interactionReady: (name) => `Interaction ready / ${name}`,
    noActiveInteraction: 'No active interaction',
    interactionContextMissing: 'Interaction context missing',
    incorrect: (name) => `Incorrect / ${name}`,
    regionComplete: (name) => `Region complete / ${name}`,
    reviewComplete: (name) => `Review complete / ${name}`
  },
  feed: {
    worldBoot: {
      title: 'World Boot',
      text: 'Drums and bass start at L1. Region rewards queue upgrades that lock in at the next bar boundary.'
    },
    companyMap: {
      title: 'Company Map',
      text: 'Simulatte LLC chain: ideas/research -> model intuition -> agent/policy -> runtime core -> boundary -> compute -> applied data network.'
    },
    controls: {
      title: 'Controls',
      text: 'Arrow keys + Enter, mouse click, or touch move/lock regions. Run Interaction at Origin Gate first.'
    },
    routeKeyTitle: 'Route Key',
    routeKeyText: (name) => `${name} is now accessible.`,
    stackAtlasReady: {
      title: 'Stack Atlas Ready',
      text: 'All public regions completed. Open Stack Atlas for mission + stack summary.'
    }
  },
  objective: {
    completeOriginGate: 'Objective: Complete Origin Gate to unlock company route briefings.',
    runInteraction: (name) =>
      `Objective: Run Interaction for ${name}. Correct answers unlock the next project dossier and music layers.`,
    explorePublic: (names) => `Objective: Explore ${names} to map each public project mission and role.`,
    unlockAtlas: 'Objective: Finish all public regions to unlock the full Stack Atlas dossier.',
    explorePrivate: (names) =>
      `Objective: Public map complete. Explore private districts for internal implementation context: ${names}.`,
    worldMapped: 'Objective: World mapped. Revisit regions for mission details and landmark notes.'
  },
  interaction: {
    reviewHint: 'Region already completed. Replay anytime to review the concept.',
    chooseBestAnswer: 'Choose the best answer to complete this region.'
  },
  locks: {
    lockedUntil: (names) => `Locked until: ${names}`
  },
  atlas: {
    title: 'Simulatte World Stack Atlas',
    companyLabel: 'Company:',
    companyName: 'Simulatte LLC',
    missionLabel: 'Mission:',
    visionLabel: 'Vision:',
    chainLabel: 'Operating Chain:',
    chainText:
      'ideas/research -> model intuition -> agent/policy -> runtime core -> boundary contract -> compute -> applied data network',
    dossiersLabel: 'Project Dossiers:',
    missionFallback: 'Local-first AI systems with policy-gated, verifiable execution.',
    visionFallback: 'On-demand software built on verifiable boundaries and a formally verified runtime core.',
    regionMissionLabel: 'Mission',
    regionVisionLabel: 'Vision',
    regionRoleLabel: 'Role',
    regionWhyLabel: 'Why',
    regionFunFactLabel: 'Fun Fact'
  }
};
