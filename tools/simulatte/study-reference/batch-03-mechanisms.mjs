// Bounded reference transitions only. No Spark engine, distributed object store or WAL durability test runs here.
export function partitionedCounts(input,selectedAttempts){
 const shuffle=[new Map(),new Map(),new Map()];
 const hash=url=>[...url].reduce((n,c)=>(n*31+c.codePointAt(0))>>>0,0)%3;
 for(const mapId of [0,1,2]){const rows=selectedAttempts.get(mapId)??input.filter((_,i)=>i%3===mapId),combined=new Map();for(const url of rows)combined.set(url,(combined.get(url)||0)+1);for(const [url,count]of combined){const bucket=shuffle[hash(url)];bucket.set(url,(bucket.get(url)||0)+count);}}
 return new Map(shuffle.flatMap(bucket=>[...bucket]));
}
export function recoverBlocks(blocks,loss){if(loss.kind==='cpu')return [];return [...new Set(blocks.filter(b=>loss.lostStores.has(b.store)).map(b=>b.map))].sort();}
export function foldWindows(events,width,watermark){const seen=new Set(),windows=new Map(),quarantine=[];for(const e of events){if(seen.has(e.id))continue;seen.add(e.id);if(![1,2].includes(e.schema)){quarantine.push(e.id);continue;}const value=e.schema===1?e.value:e.amount;if(e.time<watermark){quarantine.push(e.id);continue;}const key=Math.floor(e.time/width)*width,current=windows.get(key)||{sum:0,count:0};current.sum+=value;current.count++;windows.set(key,current);}return {windows,quarantine};}
export function createCommit(log,version,tx){if(log.has(version))return false;log.set(version,structuredClone(tx));return true;}
export const overlaps=(a,b)=>a.some(x=>b.includes(x));
export function selectWinner(state,attempt){if(state.winner)return state.winner;state.winner=attempt;return attempt;}
export function deliverCompletion(child,parent){if(!child.receipts.has(parent)){child.receipts.add(parent);child.remaining--;}return child.remaining;}
