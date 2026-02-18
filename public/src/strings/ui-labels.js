export const UI_LABELS = {
  status: {
    fallbackObjective: 'Objective: Explore and complete unlocked regions.'
  },
  region: {
    defaultTitle: 'Region Cursor',
    defaultMeta: 'No region selected',
    defaultSummary: 'Move to a region, then press Run Interaction.',
    hoverSummary: 'Press Run Interaction here.',
    lockOpen: 'Open',
    lockLocked: 'Locked',
    stateDone: 'Done',
    stateNew: 'New'
  },
  buttons: {
    runInteraction: 'Run Interaction',
    reviewInteraction: 'Review Interaction',
    openSite: 'Open Site',
    openRegionPortal: 'Open Region Portal',
    portalPrivate: 'Private',
    portalNoLink: 'No Link',
    portalLocked: 'Locked',
    bgmOn: 'BGM ON',
    bgmOff: 'BGM OFF',
    sfxOn: 'SFX ON',
    sfxOff: 'SFX OFF'
  },
  challenge: {
    defaultTitle: 'Interaction',
    defaultPrompt: 'Press Run Interaction.'
  },
  music: {
    transport: (bar, step) => `Bar ${bar} | Step ${step}`,
    level: (value) => `L${value}`,
    queued: (count) => `Queued changes: ${count}`,
    queueSuffix: (count) => (count > 0 ? ` +${count} queued` : ''),
    status: (active, queueSuffix) => `Music: ${active}${queueSuffix}`,
    none: 'none'
  }
};
