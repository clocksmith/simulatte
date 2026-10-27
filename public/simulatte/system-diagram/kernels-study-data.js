(function(root,factory){factory(typeof module==='object'&&module.exports?require('./study-runtime.js'):root.SimulatteStudyRuntime);})(globalThis,function(S){
 'use strict';
 const {machine,required,copy,read,put}=S;
 machine('cursorTable',p=>({rows:[0,1,2,3,4,5,6,7].slice(0,p.maxRecords),snapshots:{},nextSnapshot:0}),function(k,c,p){
  if(c.op==='append'){if(k.rows.length>=p.maxRecords)return {accepted:false,reason:'capacity'};k.rows.push(c.value);return {accepted:true,size:k.rows.length};}
  if(c.op==='insertFirst'){if(k.rows.length>=p.maxRecords)return {accepted:false,reason:'capacity'};k.rows.unshift(c.value);return {accepted:true};}
  if(c.op==='page'){required(Number.isInteger(c.offset)&&c.offset>=0&&Number.isInteger(c.limit)&&c.limit>0&&c.limit<=100);let rows=k.rows,snapshot=c.snapshot;
   if(p.snapshotReads){if(!snapshot){if(Object.keys(k.snapshots).length>=p.maxRecords)return {accepted:false,reason:'snapshot capacity'};snapshot='snapshot-'+(++k.nextSnapshot);k.snapshots[snapshot]=copy(k.rows);}required(Object.hasOwn(k.snapshots,snapshot));rows=k.snapshots[snapshot];}
   return {accepted:true,rows:rows.slice(c.offset,c.offset+c.limit),nextOffset:Math.min(c.offset+c.limit,rows.length),snapshot:snapshot||null};}
  throw Error('Unsupported table command');
 });
 machine('versionedDocument',()=>({revision:0,text:'',applied:{},conflicts:0}),function(k,c,p){
  if(c.op==='read')return {accepted:true,revision:k.revision,text:k.text};
  required(c.op==='edit'&&typeof c.text==='string'&&c.text.length<2000);
  const prior=read(k.applied,c.id);if(prior)return {accepted:prior.text===c.text&&prior.baseVersion===c.version,revision:prior.revision,text:prior.text,duplicate:true};
  if(p.checkVersion&&c.version!==k.revision){k.conflicts++;return {accepted:false,reason:'version conflict',revision:k.revision};}
  if(Object.keys(k.applied).length>=p.maxRecords)return {accepted:false,reason:'capacity'};
  k.text=c.text;k.revision++;return put(k.applied,c.id,{accepted:true,revision:k.revision,text:k.text,baseVersion:c.version});
 });
 machine('lazySequence',()=>({values:[1,2,3,4,5,6,7,8],pipeline:[],visits:0,materializations:0}),function(k,c,p){
  if(c.op==='reset'){k.pipeline=[];return {accepted:true};}
  if(c.op==='map'||c.op==='filter'){if(k.pipeline.length>=p.maxRecords)return {accepted:false,reason:'pipeline capacity'};k.pipeline.push({op:c.op,value:c.value});return {accepted:true,queued:k.pipeline.length,visits:k.visits};}
  required(c.op==='collect'||c.op==='find');let result=[];
  if(p.fuse){for(const item of k.values){let value=item,keep=true;for(const op of k.pipeline){k.visits++;if(op.op==='map')value*=op.value;else if(value<op.value){keep=false;break;}}if(keep){if(c.op==='find'&&value===c.value)return {accepted:true,found:value,visits:k.visits};result.push(value);}}}
  else{result=copy(k.values);for(const op of k.pipeline){k.visits+=result.length;result=op.op==='map'?result.map(v=>v*op.value):result.filter(v=>v>=op.value);k.materializations++;}}
  return {accepted:true,...(c.op==='find'?{found:result.includes(c.value)?c.value:null}:{values:result}),visits:k.visits,materializations:k.materializations};
 });
 machine('ttlMap',()=>({values:{},clock:0,hits:0,misses:0,evictions:0}),function(k,c,p,t){
  for(const [key,row]of Object.entries(k.values))if(p.expire&&row.until<=t)delete k.values[key];
  required(typeof c.key==='string');
  if(c.op==='put'){if(!Object.hasOwn(k.values,c.key)&&Object.keys(k.values).length>=p.capacity){if(!p.evict)return {accepted:false,reason:'capacity'};const oldest=Object.keys(k.values).sort((a,b)=>k.values[a].used-k.values[b].used||a.localeCompare(b))[0];delete k.values[oldest];k.evictions++;}put(k.values,c.key,{value:c.value,used:++k.clock,until:t+p.ttlSec});return {accepted:true};}
  required(c.op==='get');const row=read(k.values,c.key);if(row){row.used=++k.clock;k.hits++;}else k.misses++;return {accepted:true,found:Boolean(row),value:row?.value??null,hits:k.hits,misses:k.misses};
 },{restart(k,p){if(!p.durable)k.values={};}});
 machine('windowCounter',()=>({times:{},accepted:0,denied:0}),function(k,c,p,t){
  required(c.op==='hit'&&typeof c.key==='string');if(!Object.hasOwn(k.times,c.key)&&Object.keys(k.times).length>=p.maxRecords)return {accepted:false,reason:'key capacity'};
  const old=read(k.times,c.key)||[],times=old.filter(time=>time>t-p.windowSec);put(k.times,c.key,times);
  if(times.length>=p.capacity){k.denied++;return {accepted:false,reason:'rate limit',count:times.length};}times.push(t);k.accepted++;return {accepted:true,count:times.length};
 });
 machine('durableJournal',()=>({values:{},wal:[],snapshot:{},snapshotSeen:{},pending:[],seen:{},replayed:0}),function(k,c,p){
  if(c.op==='read')return {accepted:true,value:read(k.values,c.key)??null};
  if(c.op==='checkpoint'){k.snapshot=copy(k.values);k.snapshotSeen=copy(k.seen);k.wal=[];return {accepted:true,snapshotKeys:Object.keys(k.snapshot).length};}
  if(c.op==='flush'){k.wal.push(...k.pending);k.pending=[];return {accepted:true};}
  if(c.op==='restart'){restart(k);return {accepted:true,replayed:k.replayed};}
  required(c.op==='write'&&typeof c.id==='string'&&typeof c.key==='string');
  if(read(k.seen,c.id))return {accepted:read(k.seen,c.id)===JSON.stringify([c.key,c.value]),duplicate:true};
  if(Object.keys(k.seen).length>=p.maxRecords)return {accepted:false,reason:'journal capacity'};
  const row={id:c.id,key:c.key,value:c.value};(p.syncWrites?k.wal:k.pending).push(row);put(k.values,c.key,c.value);put(k.seen,c.id,JSON.stringify([c.key,c.value]));return {accepted:true,durable:p.syncWrites};
 },{restart});
 function restart(k){k.values=copy(k.snapshot);k.pending=[];k.seen=copy(k.snapshotSeen);for(const row of k.wal){put(k.values,row.key,row.value);put(k.seen,row.id,JSON.stringify([row.key,row.value]));k.replayed++;}}
 machine('optimisticLog',()=>({version:0,values:{},commits:{},conflicts:0}),function(k,c,p){
  if(c.op==='read')return {accepted:true,version:k.version,values:copy(k.values)};
  required(c.op==='commit'&&typeof c.id==='string'&&typeof c.key==='string');
  const prior=read(k.commits,c.id);if(prior)return {...prior.result,accepted:prior.body===JSON.stringify([c.key,c.value,c.version]),duplicate:true};
  if(p.checkVersion&&c.version!==k.version){k.conflicts++;return {accepted:false,reason:'optimistic conflict',version:k.version};}
  if(Object.keys(k.commits).length>=p.maxRecords)return {accepted:false,reason:'commit capacity'};
  put(k.values,c.key,c.value);k.version++;const result={accepted:true,version:k.version};put(k.commits,c.id,{body:JSON.stringify([c.key,c.value,c.version]),result});return result;
 });
});
