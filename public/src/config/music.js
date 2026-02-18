export const MUSIC_CONFIG = {
  bpm: 124,
  stepsPerBar: 32,
  lookAheadSeconds: 0.2,
  schedulerIntervalMs: 40,
  baseVolume: 0.95,
  outputGain: 3.1,
  initialStemLevels: {
    drums: 1,
    bass: 1,
    harmony: 0,
    lead: 0
  },
  activityWindows: {
    drums: {
      0: [],
      1: [[0, 31]],
      2: [[0, 31]],
      3: [[0, 31]]
    },
    bass: {
      0: [],
      1: [[0, 31]],
      2: [[0, 31]],
      3: [[0, 31]]
    },
    harmony: {
      0: [],
      1: [[16, 31]],
      2: [[12, 31]],
      3: [[8, 31]]
    },
    lead: {
      0: [],
      1: [[20, 31]],
      2: [[16, 31]],
      3: [[12, 31]]
    }
  },
  patterns: {
    drums: {
      0: Array(16).fill(0),
      1: [4, 3, 0, 3, 1, 3, 0, 3, 4, 3, 0, 3, 1, 3, 2, 3],
      2: [4, 3, 0, 3, 1, 3, 2, 3, 4, 3, 0, 3, 1, 3, 2, 3],
      3: [4, 3, 6, 3, 1, 3, 2, 3, 4, 3, 5, 3, 1, 3, 2, 3]
    },
    bass: {
      0: Array(16).fill(null),
      1: [36, null, null, null, 36, null, null, null, 34, null, null, null, 31, null, null, null],
      2: [36, null, 43, null, 36, null, 41, null, 34, null, 39, null, 31, null, 34, null],
      3: [36, null, 39, null, 36, 43, 41, null, 34, null, 39, 41, 31, null, 34, 36]
    },
    harmony: {
      0: Array(16).fill(null),
      1: [
        [60, 63, 67], null, null, null,
        [58, 62, 65], null, null, null,
        [55, 58, 62], null, null, null,
        [58, 62, 65], null, null, null
      ],
      2: [
        [60, 63, 67], null, null, null,
        [58, 62, 65], null, [60, 63, 67], null,
        [55, 58, 62], null, null, null,
        [58, 62, 65], null, [55, 58, 62], null
      ],
      3: [
        [60, 63, 67], null, [62, 65, 70], null,
        [58, 62, 65], null, [60, 63, 67], null,
        [55, 58, 62], null, [58, 62, 65], null,
        [58, 62, 65], null, [55, 58, 62], null
      ]
    },
    lead: {
      0: Array(16).fill(null),
      1: [null, 67, null, 70, null, 72, null, 70, null, 67, null, 63, null, 65, null, 67],
      2: [67, null, 70, null, 72, null, 75, null, 72, null, 70, 67, null, 65, null, 67],
      3: [67, 70, 72, null, 75, 72, 70, null, 67, 70, 72, 75, 72, 70, 67, null]
    }
  }
};

export const LANDMARK_MUSIC_BOOST = {
  harmony: 1,
  lead: 1
};
