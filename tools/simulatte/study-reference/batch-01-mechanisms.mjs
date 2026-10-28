// Bounded in-memory decision models. These establish no network, storage durability or throughput claims.
export const visible=(story,allowed,now)=>allowed&&now<story.expiresAt;
export function heartbeat(current,beat,now,ttl){
 if(beat.epoch<current.epoch)return current;
 if(beat.epoch===current.epoch&&(beat.seq<=current.seq||now>=current.deadline))return current;
 return {epoch:beat.epoch,seq:beat.seq,deadline:now+ttl};
}
export function expireLeases(user,now){
 const devices=Object.fromEntries(Object.entries(user.devices).filter(([,lease])=>now<lease.deadline));
 const online=Object.keys(devices).length>0;
 if(online===user.online)return {user:{...user,devices},events:[]};
 const version=user.version+1;
 return {user:{...user,devices,online,version},events:[{userId:user.userId,online,version}]};
}
export function foldSession(session,event){
 if(event.kind==='close')return !session.closed&&event.epoch===session.epoch&&event.expectedSeq===session.seq?{...session,closed:true}:session;
 if(event.epoch<session.epoch||(event.epoch===session.epoch&&(session.closed||event.seq<=session.seq)))return session;
 return {epoch:event.epoch,seq:event.seq,closed:false};
}
export function expireByTimer(journal,session,timer){
 if(session.closed||session.epoch!==timer.epoch||session.seq!==timer.expectedSeq)return false;
 journal.push({kind:'close',epoch:timer.epoch,expectedSeq:timer.expectedSeq});
 return true;
}
export const rebuild=journal=>journal.reduce(foldSession,{epoch:0,seq:0,closed:false});
export function appendToken(state,chunk){
 if(state.cancelled||chunk.attempt!==state.attempt)return false;
 const tokens=state.tokens[chunk.attempt]??=[];
 if(chunk.index!==tokens.length)return false;
 tokens.push(chunk.text);
 return true;
}
export const ranked=(rows,visibleNow)=>rows.filter(r=>visibleNow.has(r.id)&&!r.deleted).sort((a,b)=>b.score-a.score||b.seq-a.seq||a.id.localeCompare(b.id));
