// Bounded in-memory decision models. These establish no network, storage durability or throughput claims.
export const visible=(story,allowed,now)=>allowed&&now<story.expiresAt;
export function heartbeat(current,beat,now,ttl){if(beat.epoch<current.epoch||(beat.epoch===current.epoch&&beat.seq<=current.seq))return current;return {...beat,deadline:now+ttl};}
export function appendToken(state,chunk){if(state.cancelled||chunk.epoch!==state.epoch||chunk.index!==state.tokens.length)return false;state.tokens.push(chunk.text);return true;}
export const ranked=rows=>rows.filter(r=>r.allowed&&!r.deleted).sort((a,b)=>b.score-a.score||b.seq-a.seq||a.id.localeCompare(b.id));
