'use strict';
// Corrections are authored here; the preserved source modules remain intake evidence.
function prepare(input){
 const p=structuredClone(input),each=fn=>{for(const a of p.approaches)for(const s of a.stages)fn(s,a);};
 const component=(id,title,kind,owns,responsibility)=>{p.components[id]={title,kind,owns,responsibility};};
 if(p.lucyd==='L004'){
  p.assumptions.push('Server-authenticated membership gates every command, replay and subscription. Membership changes fence later delivery; previously transmitted data cannot be recalled.','Conversation placement is versioned and a migration fences its previous writer. Receipts bind actor, conversation, operation ID and payload.');
  component('conversation-router@1','Conversation placement router','service',['versioned conversation-to-shard map'],'Choose exactly one fenced shard for each conversation; never broadcast an append to both shards.');
  component('publication-dispatcher@1','Durable publication dispatcher','worker',['committed log/outbox cursor'],'Publish committed log entries idempotently and resume after a commit/publish crash.');
  p.approaches.find(a=>a.id==='push').why='Choose persistent push when online update latency and idle request volume matter, and a connection/fan-out tier can be operated. Actual latency still requires measurement.';
  p.approaches.find(a=>a.id==='inbox').why='Prefer one per-device synchronization feed and bounded long-poll requests instead of a separate WebSocket delivery tier.';
  each((s,a)=>{
   if(s.id==='identity-order')s.code=`transaction(() => {
  authorizeMember(actor, conversationId);
  lockConversationHead(conversationId);
  const old = receipt(actor, conversationId, clientMsgId);
  if (old) return samePayloadOrConflict(old, body);
  const seq = nextConversationSequence();
  insertMessageAndReceipt(actor, conversationId, clientMsgId, body, seq);
  insertPublicationIntent(conversationId, seq); // same commit
  return {seq, sentAt: serverTimestamp()};
});`;
   if(s.id==='live-delivery'){
    s.forcedBy='Short polling increases idle request volume; push can reduce that work. The latency target still requires measurement.';
    s.ops.unshift({insert:{id:'publisher',def:'publication-dispatcher@1',at:[4,0]}});
    for(const op of s.ops)if(op.connect)for(const e of [].concat(op.connect))if(e.from==='chatsvc'&&e.to==='pubsub')e.from='publisher';
    s.ops.push({connect:{from:'log',to:'publisher',label:'committed messages',async:true}});
   }
   if(a.id==='push'&&s.id==='scale'){
    for(const op of s.ops)if(op.expand?.id==='log'){
     op.expand.into.unshift({id:'logRouter',def:'conversation-router@1',at:[4,0]});op.expand.entry='logRouter';
     op.expand.connect=[{from:'logRouter',to:'shardA',label:'route by conversation'},{from:'logRouter',to:'shardB',label:'route by conversation'}];
    }
    s.ops=s.ops.filter(op=>!(op.connect?.from==='chatsvc'&&op.connect?.to==='shardB'));
    s.board.push('Routing chooses one shard per operation; placement changes fence the previous writer.');
    s.ops.push({connect:{from:'notifier',to:'registry',label:'user → gateway'}});
   }
   if(s.id==='reconnect'){
    s.forcedBy='Mobile sockets drop; durable history must close delivery gaps and deduplicate overlap.';
    s.checks[0].claim='Within retained authorized history, replay and live overlap render each sequence once; an expired cursor explicitly resets.';
   }
   if(s.id==='retention')s.board.push('Large-room log positions participate in the device sync token; expired positions require explicit reset.');
  });
 }
 if(p.lucyd==='L003'){
  p.assumptions.push('Keyset ordering fields are immutable for the session. Authorized filter/sort combinations have matching indexes; keyset seeking does not make arbitrary predicates constant-cost.','Cursors bind authenticated owner/scope, normalized query, sort, dataset policy, version and expiry. PIT sessions freeze membership/order, not current hydrated row values.');
  p.types.PageRequest='{ filter, sort, limit: 1..100, cursor: opaque|null, generation }';
  p.types.Page='{ items: Item[], nextCursor: opaque|null, generation, removed, totalApprox? }';
  p.types.Cursor='signed { version, ownerScope, queryHash, sort, datasetPolicy, position, expiresAt }';
  p.approaches.find(a=>a.id==='keyset').why='Use immutable indexed ordering when stable seeking matters. Work avoids rescanning earlier offsets, but still depends on predicate selectivity, page size and participating shards.';
  each((s,a)=>{
   if(s.id==='opaque'){
    s.code=`body = {version, ownerScope: authenticatedScope, queryHash, sort, position, expiresAt};
token = encode(body) + HMAC(serverKey, encode(body));
decode: verifyMACConstantTime(); verifyOwnerScope(); verifyQuerySortAndExpiry();
// Re-run row authorization on hydration. A signed cursor never grants permissions.`;
    s.checks.push({claim:'A cursor signed for another principal/scope is refused even when filter and sort are identical.'});
    for(const c of s.checks)if(c.test==='pagination.cursor-binds-query')c.claim='The reference token rejects a different filter or sort; principal binding is an additional authored requirement.';
   }
   if(s.id==='keyset')s.board.push('Immutable keys and a matching index are required; arbitrary filtering can still scan many entries.');
   if(s.id==='client-loader')s.code=`onQueryChange(q):
  generation++; query = validateAndClone(q); cursor = null; done = false
  abortPrevious(); currentRequest = null; clearVisibleItems()
async loadMore():
  if currentRequest or done: return currentRequest
  request = { generation, query: clone(query), cursor }; currentRequest = request
  try:
    page = await fetchPage(request)
    if request.generation != generation or currentRequest != request: return
    appendAuthorizedRowsDeduped(page.items); cursor = page.nextCursor; done = cursor == null
  catch error:
    if request.generation == generation: exposeRetryOrExplicitSessionReset(error)
  finally:
    if currentRequest == request: currentRequest = null`;
   if(s.id==='totals')s.checks[0].claim='Approximate totals do not require a synchronous COUNT on the request path; measured latency depends on the qualified query/index plan.';
   if(s.id==='summary')s.checks[0].claim='First-page rows and an approximate total carry one published summary version plus as-of metadata; the estimate need not equal exact membership.';
   if(s.id==='expiry')s.board.push('A restart is a new view. ID deduplication avoids repeats, but cannot promise the original session’s complete membership after expiry.');
  });
 }
 if(p.lucyd==='L009'){
  p.requirements.functional[0]='nested replies within documented storage/depth limits';
  p.types.VoteDelta='{ eventId, postId, commentId, upDelta, downDelta, voteVersion }';
  p.assumptions.push('Materialized path segments are unambiguous and allocated transactionally; maximum stored depth and sibling counts are explicit. Rendering depth is independently bounded.','Vote operation receipts and expected vote versions prevent delayed retries from undoing newer intent. Counter deduplication/checkpoints are durable and atomic with count changes.');
  p.approaches.find(a=>a.id==='write-time').tradeoffs[0]='+ bounded cached reads within declared pipeline/cache capacity';
  each((s,a)=>{
   if(s.id==='paths'){
    s.code=`// Example representation: an indexed array of uint32 sibling ordinals.
transaction: validate same-post parent; lock sibling allocator; allocate unique ordinal;
insert path = parent.path || [ordinal]; enforce depth/ordinal bounds;
// A subtree uses segment-aware prefix containment, never a raw ambiguous text prefix.
read post subtree in deterministic path order with a bounded continuation;`;
    s.board=s.board.map(t=>t.includes('4-digit')?'Path = parent path plus a transactionally allocated uint32 segment':t);
   }
   if(s.id==='votes')s.code=`transaction(() => {
  authorizeVote(actor, commentId);
  if (receipt(actor, opId)) return samePayloadOrConflict(opId, request);
  const old = lockOrCreateVoteRow(actor, commentId); // unique-key conflicts retry transaction
  if (expectedVoteVersion !== old.version) throw Conflict;
  const delta = difference(old.value, desiredValue);
  writeVote(desiredValue, old.version + 1); saveReceipt(opId, payloadHash(request));
  ${a.id==='write-time'?'updateCounterInSameTransaction(delta); // later moved behind a durable vote outbox':'// No stored counter; consistent snapshots derive totals from authoritative vote rows.'}
});`;
   if(s.id==='votes'&&a.id==='read-time')s.explain='Removing the shared per-comment counter avoids that lock bottleneck. Vote rows, indexes, storage and snapshot builds still have finite capacity.';
   if(s.id==='vote-storm')s.code=`// Vote transaction appends an event to its durable outbox instead of updating the hot counter.
consumeBatch(events):
  transaction:
    unseen = claimUniqueEventIds(events)
    applySummedCounterDeltas(unseen)
    saveConsumerCheckpointAndPublicationIntents()
  // Counter deltas, dedupe records and checkpoint commit together.
  // Crash/replay is safe only with that durable boundary; an in-memory seen set is insufficient.`;
   if(s.id==='ranking')s.code=`n = up + down; if n == 0: return 0;
${s.code}
// Ties use immutable creation key and comment ID.`;
   if(s.id==='pipeline'){
    s.checks[0]={claim:'One fenced partition owner commits count/checkpoint/version changes; this distributed ownership guarantee is an authored requirement.'};
    s.checks.push({test:'comments.score-versions',claim:'The client reference reducer ignores older and duplicate score versions.'});
   }
   if(s.id==='snapshots')s.board.push('Personal vote overlays need explicit included vote-version evidence; a wall-clock asOf alone cannot confirm a vote.');
   if(s.id==='live')s.board.push('A missed replay window triggers an explicit snapshot reset; stream notification is not the source of truth.');
  });
 }
 if(p.lucyd==='L011'){
  p.assumptions.push('Ordering uses immutable server timestamp plus ID. Authorization and follow-graph revisions scope cached results; hydration removes deleted or forbidden posts.','Publishing is derived from a durable transactional post outbox/CDC stream. Stream replay is bounded; expired positions explicitly reset.');
  p.types.Tweet='{ id, authorId, clientId, timestamp, text, visibilityVersion }';
  p.types.TimelineEntry='{ id, timestamp } // IDs only, currently authorized body hydrated at read';
  p.types.Cursor='signed { timestamp, id, ownerScope, graphVersion, expiresAt }';
  component('publication-dispatcher@1','Post outbox dispatcher','worker',['durable publication cursor'],'Retry durable publication intents idempotently; do not lose events between database commit and stream publication.');
  p.approaches.find(a=>a.id==='pull').why='Avoid a durable per-reader fan-out list: merge followed authors at read time, with bounded author and first-page caches. Posting stays independent of follower count on this path.';
  each((s,a)=>{
   if(s.code)s.code=s.code.replace(/\bts\b/g,'timestamp').replace(/t\.author\b/g,'t.authorId');
   if(s.id==='hydrate')s.ops.push({connect:{from:'tweetCache',to:'tweets',label:'cache misses by id'}});
   if(s.id==='live'){
    s.ops.unshift({insert:{id:'publisher',def:'publication-dispatcher@1',at:[4,3]}});
    for(const op of s.ops)if(op.connect)for(const e of [].concat(op.connect))if(e.from==='api'&&e.to==='pubsub')e.from='publisher';
    s.ops.push({connect:{from:'tweets',to:'publisher',label:'committed publication',async:true}});
    if(a.id==='push')s.ops.push({reconnect:{from:'tweets',to:'queue',newFrom:'publisher',label:'new post',async:true}});
    // In fan-out mode the durable worker publishes recipient topics; the dispatcher is its recovery source.
    s.board.push('Post and publication intent commit together; consumers resume from durable offsets and deduplicate.');
   }
   if(s.id==='streams'){
    // The source reconnect used api->pubsub; publication now correctly originates in the dispatcher.
    for(const op of s.ops)if(op.reconnect)for(const e of [].concat(op.reconnect))if(e.from==='api'&&e.to==='streams')e.from='publisher';
    s.checks[0].claim='A gateway resumes within retained stream history; a position beyond retention triggers an explicit reset and fresh feed merge.';
   }
   if(s.id==='first-page')s.board.push('Cache scope includes the follow-graph and authorization revision; TTL alone is not access control.');
  });
 }
 if(p.lucyd==='L013'){
  p.assumptions.push('Authentication scopes buyer IDs and receipts. Reused operation IDs with changed payloads conflict; receipt retention defines an explicit retry window.','Payment calls occur only after a durable held decision. Provider signatures are checked. Unknown outcomes use the same payment key; refunds are durable compensation intents with their own retry receipts.','Single-writer actors require fenced partition ownership and durable checkpoint/offset coordination; single-threaded reference tests do not prove that infrastructure.');
  p.assumptions.push('Provider idempotency retention is bounded. Unknown outcomes outside that window require provider/manual reconciliation, never a fresh blind charge.');
  p.types.ReserveRequest='{ sku, qty, operationId, admissionToken }';
  p.types.Command='{ cmdId, payloadHash, sku, type: reserve|confirm|fail|expire, reservationId?, qty?, verifiedAuthority }';
  component('payment-recovery@1','Payment reconciliation worker','worker',['pending provider query cursor','refund intents'],'Resolve unknown charges using stable provider keys; append results or refund intents without releasing an unobserved outcome silently.');
  p.approaches.find(a=>a.id==='actor').tradeoffs[0]='+ no per-command shared stock-row lock; throughput depends on actor, log and checkpoint capacity';
  each((s,a)=>{
   if(s.id==='storage')s.checks[0].claim='The unsafe read-then-write reference grants 5,000 attempts against 100 units, overselling by 4,900; this stage deliberately demonstrates the failure.';
   if(s.id==='contract'&&a.id==='atomic')s.code=`POST /reservations {sku,qty,operationId,admissionToken} -> {reservationId,status,expiresAt}
POST /reservations/{id}/payments {paymentAttemptId} -> {payment_pending|paid|released|refund}
GET /reservations/{id} -> {status,expiresAt}
// Buyer identity comes from authentication. Webhooks are a separate verified internal input.`;
   if(s.id==='atomic')s.code=`transaction(() => {
  authorizeBuyer(); lockBuyerLimitRow();
  if (receipt(buyer, opId)) return samePayloadOrConflict(opId, request);
  assertBuyerLimit(qty);
  const changed = conditionalDecrement(sku, qty); // UPDATE ... WHERE available >= qty
  if (!changed) return durableSoldOutReceipt(opId);
  const hold = insertReservationAndReceipt(opId, sku, qty, databaseNow() + ttl);
  return hold;
});`;
   if(s.id==='buckets'){
    s.code=`// Logical reservation and bucket components share one database transaction domain.
transaction(() => {
  lockBuyerLimitRow(); checkReceiptAndPayload(opId); checkBuyerLimit();
  const allocations = lockAndAllocateBucketsInStableOrder(sku, qty);
  if (sum(allocations.qty) < qty) rollbackAndReturnSoldOutOrRetry();
  decrementAllocatedRows(allocations);
  insertReservation({opId, sku, qty, allocations, expiresAt: databaseNow() + ttl});
  saveReceipt(opId); // rollback restores both bucket stock and reservation state
});
// Release locks the held reservation and credits its recorded bucket allocations in the same transaction.`;
    s.board.push('Reservation insertion, buyer limit, receipt and bucket decrement share one transaction; separate RPC commits are unsafe.');
    s.board=s.board.map(t=>t==='Reservation records its bucket'?'Reservation records all bucket allocations; multi-unit requests may span rows':t);
    s.checks.push({claim:'A multi-unit request can allocate across several buckets; rollback restores all decrements and a conditional release credits each allocation once.'});
   }
   if(s.id==='payments'){
    s.board.push('Never charge on a mere 202 accepted command. Wait for the durable held outcome and reuse its provider key.');
    if(a.id==='actor'){
     s.ops.push({insert:{id:'paymentRecovery',def:'payment-recovery@1',at:[4,0]}},{connect:[{from:'paymentRecovery',to:'psp',label:'status(key)?'},{from:'paymentRecovery',to:'log',label:'confirm · fail command'}]});
     s.checks.push({claim:'An unknown provider outcome is reconciled with the original key; a success after release produces a durable idempotent refund, not another stock allocation.'});
    }else s.code=`verifyProviderSignatureAndExpectedPaymentKey(event);
transaction(() => {
  if (processedProviderEvent(event.id)) return PreviousReceipt;
  const hold = lockReservation(event.reservationId);
  applyAllowedMonotonicTransition(hold, event.status);
  if (hold.wasReleased && event.status === "succeeded") insertUniqueRefundIntent(hold.paymentKey);
  persistEventReceiptAndStockChanges(); // no terminal paid -> failed downgrade
});`;
   }
   if(s.id==='actor'){
    s.board.push('Fenced ownership rejects stale actor commits; acceptance, application and payment are different states.');
    s.code=`for (const entry of durablePartition(sku)) {
  assertCurrentFencedOwner(leadershipEpoch);
  const prior = outcomes[entry.cmdId];
  if (prior) assertSamePayload(prior, entry); else applyDeterministicCommand(entry);
  persistOrReplayableCheckpoint({stock, reservations, outcomes, appliedOffset: entry.offset});
  // A 202 append receipt is not a reservation. Publish a decision only after its recovery boundary is durable.
}`;
   }
   if(s.id==='expiry'&&a.id==='actor')s.board.push('This branch allows held expiry before a late payment confirmation; late success requires an explicit compensating refund.');
   if(s.id==='snapshots')s.board.push('Persist stock, holds, dedupe outcomes and applied offset at one atomic checkpoint boundary; reject stale actor epochs.');
  });
 }
 return p;
}
module.exports={prepare};
