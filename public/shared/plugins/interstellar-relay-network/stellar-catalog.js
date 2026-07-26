(function attachInterstellarStellarCatalog(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InterstellarStellarCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarStellarCatalog() {
  const HYG_DATASET_ID = 'hyg.visible-stars.v1';

  function createCatalog(gaiaData, hygData) {
    if (!Array.isArray(gaiaData?.stars) || !Array.isArray(hygData?.stars)) {
      throw new Error('interstellar_stellar_catalog_input_invalid');
    }
    const gaiaStars = gaiaData.stars.map((row) => Object.freeze({ ...row, catalogDatasetId: gaiaData.id }));
    const hygStars = hygData.stars
      .filter((row) => row.id !== '0' && Number.isFinite(row.distancePc) && row.distancePc > 0)
      .map(normalizeHygStar);
    const stars = Object.freeze([...gaiaStars, ...hygStars]);
    return Object.freeze({
      id: 'interstellar.endpoint.catalog.v1',
      stars,
      defaultRelayIds: Object.freeze(gaiaStars.map((row) => row.sourceId)),
      provenance: hygData.provenance || HYG_PROVENANCE,
      hygContentVersion: hygData.contentVersion || '2026-07-20',
      hygDatasetId: HYG_DATASET_ID,
    });
  }

  function normalizeHygStar(row) {
    const name = row.properName || (row.hip ? `HIP ${row.hip}` : `HYG ${row.id}`);
    return Object.freeze({
      sourceId: `hyg:${row.id}`,
      catalogDatasetId: HYG_DATASET_ID,
      catalogSourceId: String(row.id),
      sourceRowId: `hyg.v41:${row.id}`,
      name,
      raDeg: Number(row.ra) * 15,
      decDeg: Number(row.dec),
      parallaxMas: 1000 / Number(row.distancePc),
      parallaxErrorMas: null,
      pmRaMasYr: 0,
      pmDecMasYr: 0,
      radialVelocityKmS: null,
      referenceEpochYear: 2000,
      photGMag: Number(row.magnitude),
      spectralType: row.spectralType || null,
      ruwe: null,
      truth: Object.freeze({
        origin: 'derived',
        temporalStatus: 'snapshot',
        uncertainty: Object.freeze({
          kind: 'missing',
          value: Object.freeze({
            reason: 'Visible HYG cache provides position and distance but not covariance or motion fields used by this simulation.',
            appliedMotionAssumption: 'zero-proper-motion-and-zero-radial-velocity',
          }),
        }),
      }),
    });
  }

  const HYG_PROVENANCE = Object.freeze({
    publisher: 'Astronexus HYG Database',
    retrievalAt: '2026-07-20T15:35:37Z',
    retrievalTimeBasis: 'repository-recorded cache time; raw HTTP response receipt unavailable',
    license: Object.freeze({
      id: 'CC-BY-SA-4.0',
      url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    }),
    coverage: Object.freeze({
      kind: 'visible-star-cache',
      scope: 'HYG v4.1 rows at apparent magnitude 5 or brighter',
    }),
    sourceArtifact: Object.freeze({
      id: 'simulatte-hyg-visible-cache',
      url: 'https://github.com/astronexus/HYG-Database',
      identityStatus: 'upstream response hash unavailable; governed cache bytes are hashed by the dataset receipt',
    }),
    truth: Object.freeze({
      origin: 'derived',
      temporalStatus: 'snapshot',
      uncertainty: Object.freeze({
        kind: 'missing',
        value: Object.freeze({
          reason: 'The activated cache does not retain upstream covariance, motion fields, or the raw source-response hash.',
        }),
      }),
    }),
  });

  function claimBoundary({ usesHygSnapshot, speculative }) {
    const coordinates = usesHygSnapshot
      ? 'Gaia DR3 astrometry and a derived HYG visible-star snapshot anchor this run; HYG motion and covariance are unavailable and held static.'
      : 'Measured Gaia DR3 astrometry anchors this run.';
    const lane = speculative
      ? ' The information channel is an explicitly speculative metric lane with unsupported constructibility.'
      : ' The communications and operational ensemble is hypothetical.';
    return `${coordinates}${lane} No terminal, packet traffic, relay infrastructure, or operating interstellar network is observed.`;
  }

  return Object.freeze({ HYG_DATASET_ID, HYG_PROVENANCE, createCatalog, claimBoundary });
});
