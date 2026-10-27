'use strict';
function apis(referenceId,approachId,owner){
 const rows={
  L004:[['POST','/conversations/{id}/messages','{clientMsgId,body}','{seq,sentAt,duplicate}','409 reused identity with different body'],['GET','/conversations/{id}/messages','{afterSeq,limit}','{messages,nextAfter,resetRequired}','410 expired history cursor'],approachId==='inbox'?['POST','/sync','{deviceId,token,waitMs}','{entries,nextToken,resetRequired}','410 expired device token']:['GET','/events','{conversationIds,lastSeqByConversation}','authorized bounded stream plus resume/reset control','403 membership; slow-consumer reset']],
  L003:[['GET',approachId==='keyset'?'/items':'/search','{filter,sort,limit,cursor,generation}','{items,nextCursor,generation,totalApprox?,removed}','400 invalid cursor; 403 scope; 410 expired view']],
  L009:[['GET','/posts/{id}/comments','{sort,depth,limit,cursor,ifNoneMatch}','{comments,more,etag,asOf,version}','400 invalid continuation'],['POST','/posts/{id}/comments','{parentId,body,clientId}','{id,path,version}','409 identity conflict; 422 invalid parent/depth'],['PUT','/comments/{id}/vote','{opId,value,expectedVoteVersion}','{myVote,voteVersion,up,down}','409 stale version or reused payload']],
  L011:[['POST','/tweets','{clientId,text}','{id,author,timestamp,text}','409 identity conflict'],['PUT','/me/follows/{authorId}','{desiredFollowState,expectedGraphVersion}','{graphVersion}','409 stale graph version'],['GET','/timeline','{cursor,limit,graphVersion}','{tweets,nextCursor,graphVersion,asOf}','410 expired snapshot/stream; 409 graph-scope mismatch']],
  L013:[['POST','/reservations','{operationId,sku,qty,admissionToken}',approachId==='actor'?'202 {commandId}; accepted is not held':'{reservationId,status,expiresAt}','409 identity conflict; 429 admission; sold_out'],['POST','/reservations/{id}/payments','{paymentAttemptId}','{payment_pending|paid|released|refund}','409 invalid reservation state; 202 outcome uncertain'],['GET',approachId==='actor'?'/commands/{commandId}':'/reservations/{id}','{}','{status,reservationId,expiresAt}','404 unknown; 410 receipt outside supported retry window']]
 };
 if(!rows[referenceId])throw Error('Missing API authoring');
 return rows[referenceId].map(([method,path,request,response,errors])=>({method,path,request,response,errors:errors+'; 403 unauthorized scope',ownerNodeId:owner}));
}
module.exports={apis};
