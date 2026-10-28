// Bounded deterministic mechanisms; no database isolation, auth, transport or production claims.
export function authorize(proof,current,command){
 if(proof.tenant!==command.tenant||proof.epoch!==current.epoch||!proof.actions.includes(command.action))return false;
 return command.expectedVersion===current.version;
}
export function publishManifest(expected,receipts,prior,generation){
 if(new Set(expected).size!==expected.length)throw Error('duplicate partition');
 return expected.every(id=>receipts.has(id)&&receipts.get(id)==='committed')?generation:prior;
}
export function applyApproval(state,event,approval){
 if(approval.entityId!==event.entityId||approval.revision!==event.revision||approval.hash!==event.hash)return {state,accepted:false};
 if(state.events.has(event.id))return {state,accepted:false};
 if(event.revision!==state.revision+1)return {state,accepted:false};
 return {state:{revision:event.revision,events:new Set([...state.events,event.id])},accepted:true};
}
export function admitSide(pair,side,value){
 if(!['left','right'].includes(side)||!Number.isSafeInteger(value))throw Error('invalid scalar side');
 if(pair[side]!==undefined&&pair[side]!==value)return {...pair,status:'conflict'};
 if(pair.status==='conflict')return pair;
 const next={...pair,[side]:value};
 next.status=next.left===undefined||next.right===undefined?'waiting':next.left===next.right?'matched':'mismatch';return next;
}
export function snapshotJoin(left,right){
 const keys=new Set([...left.keys(),...right.keys()]);
 return new Map([...keys].sort().map(k=>[k,!left.has(k)?'missing-left':!right.has(k)?'missing-right':left.get(k)===right.get(k)?'matched':'mismatch']));
}
