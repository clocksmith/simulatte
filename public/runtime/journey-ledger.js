(function attachJourneyLedger(root, factory) {
  const receipts = typeof module === 'object' && module.exports
    ? require('./canonical-receipts.js')
    : root.SimulatteAutonomyReceipts;
  const api = factory(receipts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteJourneyLedger = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createJourneyLedgerApi(receipts) {
  const DEFAULT_KEY = 'simulatte.journeyLedger.v1';
  const ZERO_HASH = '0'.repeat(64);

  function createJourneyLedger({ storage = defaultStorage(), key = DEFAULT_KEY, maximumEntries = 200, now = () => new Date().toISOString() } = {}) {
    async function read() {
      const encoded = storage.getItem(key);
      if (!encoded) return emptyLedger();
      let ledger;
      try {
        ledger = JSON.parse(encoded);
      } catch (error) {
        throw ledgerError('ledger_json_invalid', `Stored journey ledger is not valid JSON: ${error.message}`);
      }
      const verification = await verify(ledger);
      if (!verification.pass) throw ledgerError('ledger_integrity_failed', verification.reason, verification);
      return ledger;
    }

    async function append(journeyReceipt) {
      validateJourneyReceipt(journeyReceipt);
      const ledger = await read();
      const payload = await compactPayload(journeyReceipt, now);
      const previousHash = ledger.terminalHash;
      const sequence = ledger.entries.length ? ledger.entries.at(-1).sequence + 1 : 0;
      const payloadHash = await receipts.sha256Hex(payload);
      const hash = await receipts.sha256Hex({ sequence, previousHash, payloadHash });
      ledger.entries.push({
        schema: 'simulatte.journeyLedgerEntry.v1', sequence, previousHash, payloadHash, hash, payload,
      });
      if (ledger.entries.length > maximumEntries) ledger.entries = await rechain(ledger.entries.slice(-maximumEntries));
      ledger.terminalHash = ledger.entries.at(-1)?.hash || ZERO_HASH;
      storage.setItem(key, JSON.stringify(ledger));
      return structuredClone(ledger.entries.at(-1));
    }

    async function verify(ledgerInput = null) {
      const ledger = ledgerInput || parseUnchecked(storage.getItem(key));
      if (!ledger || ledger.schema !== 'simulatte.journeyLedger.v1' || !Array.isArray(ledger.entries)) {
        return { pass: false, reason: 'ledger_schema_invalid', entryCount: 0, terminalHash: null };
      }
      let previousHash = ZERO_HASH;
      for (let index = 0; index < ledger.entries.length; index += 1) {
        const entry = ledger.entries[index];
        if (entry.sequence !== index || entry.previousHash !== previousHash) {
          return { pass: false, reason: 'ledger_link_mismatch', failedSequence: index, entryCount: ledger.entries.length, terminalHash: ledger.terminalHash };
        }
        const payloadHash = await receipts.sha256Hex(entry.payload);
        const hash = await receipts.sha256Hex({ sequence: index, previousHash, payloadHash });
        if (payloadHash !== entry.payloadHash || hash !== entry.hash) {
          return { pass: false, reason: 'ledger_hash_mismatch', failedSequence: index, entryCount: ledger.entries.length, terminalHash: ledger.terminalHash };
        }
        previousHash = hash;
      }
      const pass = previousHash === ledger.terminalHash;
      return { pass, reason: pass ? 'verified' : 'ledger_terminal_hash_mismatch', entryCount: ledger.entries.length, terminalHash: ledger.terminalHash };
    }

    async function summary() {
      const ledger = await read();
      const completed = ledger.entries.filter((entry) => entry.payload.status === 'completed');
      const etaRows = completed.map((entry) => entry.payload.etaErrorSeconds).filter(Number.isFinite);
      const byMode = {};
      ledger.entries.forEach((entry) => {
        const mode = entry.payload.embodimentKind || 'unknown';
        byMode[mode] = byMode[mode] || { trials: 0, completed: 0, verified: 0, etaAbsoluteErrorSeconds: [] };
        byMode[mode].trials += 1;
        byMode[mode].completed += entry.payload.status === 'completed' ? 1 : 0;
        byMode[mode].verified += entry.payload.verificationPass ? 1 : 0;
        if (Number.isFinite(entry.payload.etaErrorSeconds)) byMode[mode].etaAbsoluteErrorSeconds.push(Math.abs(entry.payload.etaErrorSeconds));
      });
      Object.values(byMode).forEach((row) => {
        row.meanAbsoluteEtaErrorSeconds = mean(row.etaAbsoluteErrorSeconds);
        delete row.etaAbsoluteErrorSeconds;
      });
      return {
        schema: 'simulatte.journeyLedgerSummary.v1',
        trialCount: ledger.entries.length,
        completedCount: completed.length,
        verifiedCount: ledger.entries.filter((entry) => entry.payload.verificationPass).length,
        meanAbsoluteEtaErrorSeconds: mean(etaRows.map(Math.abs)),
        byMode,
        terminalHash: ledger.terminalHash,
        privacy: 'browser_local_only',
      };
    }

    async function exportLedger() {
      const ledger = await read();
      return { ...structuredClone(ledger), verification: await verify(ledger) };
    }

    async function curriculumProgress(curriculum, worldContentVersion = null) {
      if (!curriculum || curriculum.schema !== 'simulatte.autonomyCurriculum.v1') throw ledgerError('curriculum_invalid', 'Expected simulatte.autonomyCurriculum.v1');
      const ledger = await read();
      const rows = curriculum.missions.map((mission) => {
        const evidence = ledger.entries.filter((entry) => entry.payload.sourceText === mission.sourceText
          && entry.payload.verificationPass
          && (!worldContentVersion || entry.payload.worldContentVersion === worldContentVersion));
        return {
          missionId: mission.id,
          complete: evidence.length > 0,
          ledgerEntryHashes: evidence.map((entry) => entry.hash),
        };
      });
      return {
        schema: 'simulatte.autonomyCurriculumProgress.v1',
        curriculumId: curriculum.id,
        completedCount: rows.filter((row) => row.complete).length,
        missionCount: rows.length,
        rows,
        ledgerTerminalHash: ledger.terminalHash,
        claimBoundary: curriculum.claimBoundary,
      };
    }

    function clear() {
      storage.removeItem(key);
    }

    return { append, clear, curriculumProgress, exportLedger, read, summary, verify };
  }

  async function compactPayload(journey, now) {
    const sourceText = journey.mission.sourceText;
    return {
      schema: 'simulatte.journeyLedgerPayload.v1',
      recordedAt: now(),
      journeyReceiptSha256: await receipts.sha256Hex(journey),
      journeyTerminalHash: journey.integrity.terminalHash,
      missionId: journey.mission.id,
      sourceText,
      taskType: journey.mission.task.type,
      embodimentId: journey.mission.embodimentId,
      embodimentKind: journey.finalState.embodimentKind,
      worldId: journey.identities.worldId,
      worldContentVersion: journey.identities.worldContentVersion,
      policyId: journey.identities.policyId,
      status: journey.finalState.status,
      terminalReason: journey.finalState.terminalReason,
      verificationPass: journey.verification.pass,
      predictedDurationSeconds: journey.settlement.predictedDurationSeconds,
      actualDurationSeconds: journey.settlement.actualDurationSeconds,
      etaErrorSeconds: journey.settlement.etaErrorSeconds,
      actualDistanceM: journey.settlement.actualDistanceM,
      economics: structuredClone(journey.settlement.economics),
      accessibility: structuredClone(journey.planning.accessibility),
      amenities: structuredClone(journey.planning.amenities),
      requiredFailureIds: [...journey.verification.requiredFailureIds],
      claimBoundary: 'A local summary bound to the full journey receipt hash. The full trace remains in the exported journey receipt; this ledger does not claim physical-world outcomes.',
    };
  }

  async function rechain(entries) {
    const rows = [];
    let previousHash = ZERO_HASH;
    for (let index = 0; index < entries.length; index += 1) {
      const payload = entries[index].payload;
      const payloadHash = await receipts.sha256Hex(payload);
      const hash = await receipts.sha256Hex({ sequence: index, previousHash, payloadHash });
      rows.push({ schema: 'simulatte.journeyLedgerEntry.v1', sequence: index, previousHash, payloadHash, hash, payload });
      previousHash = hash;
    }
    return rows;
  }

  function emptyLedger() {
    return {
      schema: 'simulatte.journeyLedger.v1',
      algorithm: 'sha256-canonical-json-chain-v1',
      terminalHash: ZERO_HASH,
      entries: [],
      privacy: 'browser_local_only_no_network_write',
    };
  }

  function validateJourneyReceipt(value) {
    if (!value || value.schema !== 'simulatte.autonomyJourneyReceipt.v2') {
      throw ledgerError('journey_receipt_invalid', 'Ledger append expected simulatte.autonomyJourneyReceipt.v2');
    }
  }

  function defaultStorage() {
    if (typeof localStorage === 'undefined') throw ledgerError('local_storage_unavailable', 'Journey ledger requires browser localStorage or an injected storage implementation');
    return localStorage;
  }

  function parseUnchecked(value) {
    try { return value ? JSON.parse(value) : emptyLedger(); } catch { return null; }
  }

  function mean(rows) {
    return rows.length ? Number((rows.reduce((sum, value) => sum + value, 0) / rows.length).toFixed(6)) : null;
  }

  function ledgerError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteJourneyLedgerError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { createJourneyLedger, emptyLedger };
});
