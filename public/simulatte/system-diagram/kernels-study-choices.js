(function(root,factory){const node=typeof module==='object'&&module.exports;factory(node?require('./kernel-registry.js'):root.SimulatteSystemDiagramKernels,node?require('./study-runtime.js'):root.SimulatteStudyRuntime);})(globalThis,function(registry,S){
 'use strict';
 const {machine,station,answer,copy,required,read,put}=S;
 const identity=x=>typeof x==='string'&&x.length>0&&x.length<=128;
 function jsonValue(value){let nodes=1024;const ancestors=new Set();function valid(v,depth){if(--nodes<0||depth>8)return false;if(v===null||typeof v==='boolean')return true;if(typeof v==='number')return Number.isFinite(v);if(typeof v==='string')return v.length<=4096;if(!v||typeof v!=='object'||ancestors.has(v))return false;const proto=Object.getPrototypeOf(v);if(!Array.isArray(v)&&proto!==Object.prototype&&proto!==null)return false;if(Array.isArray(v)&&Object.keys(v).length!==v.length)return false;ancestors.add(v);for(const [key,row]of Object.entries(v))if(key.length>128||!valid(row,depth+1)){ancestors.delete(v);return false;}ancestors.delete(v);return true;}return valid(value,0)&&JSON.stringify(value).length<=4096;}
 const normalized=value=>JSON.parse(JSON.stringify(value));

 const WORDS=Object.freeze(['dataset','dataframe','database']);
 function searchTrie(){const root={children:{},words:[]};for(let i=0;i<WORDS.length;i++){let node=root;for(const char of WORDS[i]){if(!Object.hasOwn(node.children,char))put(node.children,char,{children:{},words:[]});node=node.children[char];}node.words.push(i);}return root;}
 function matches(k,key){let node=k.trie;for(const char of key){k.comparisons++;node=read(node.children,char);if(!node)return [];}
  const indices=[],stack=[node];while(stack.length){const row=stack.pop();k.comparisons++;indices.push(...row.words);for(const child of Object.values(row.children))stack.push(child);}return indices.sort((a,b)=>a-b).map(i=>WORDS[i]);
 }
 registry.register({id:'prefixTrieSearch',station,
  init:()=>({trie:searchTrie(),cache:{},hits:0,misses:0,comparisons:0,history:[]}),
  onRequest(ctx,job){const c=job.msg.fields?.command;if(c?.op!=='query'||typeof c.key!=='string'||c.key.length>128){ctx.reply(job,{ok:false,err:'invalid'});return;}const row=read(ctx.k.cache,c.key),delay=Number.isFinite(c.delayMs)?Math.max(0,Math.min(c.delayMs,1000)):ctx.p.serviceMs;ctx.admit(job,row&&row.until>ctx.t?1:delay);},
  onServed(ctx,job){const c=job.msg.fields.command;let row=read(ctx.k.cache,c.key);if(row&&row.until>ctx.t)ctx.k.hits++;else{ctx.k.misses++;row={until:ctx.t+ctx.p.ttlSec,result:{query:c.key,matches:matches(ctx.k,c.key)}};if(!Object.hasOwn(ctx.k.cache,c.key)&&Object.keys(ctx.k.cache).length>=ctx.p.capacity)delete ctx.k.cache[Object.keys(ctx.k.cache)[0]];put(ctx.k.cache,c.key,row);}if(ctx.k.history.length<ctx.p.maxRecords)ctx.k.history.push({key:c.key,comparisons:ctx.k.comparisons});answer(ctx,job,{...copy(row.result),sequence:c.sequence,hits:ctx.k.hits,misses:ctx.k.misses,comparisons:ctx.k.comparisons});},
  observe:ctx=>({detail:{Hits:ctx.k.hits,Misses:ctx.k.misses,'Trie work':ctx.k.comparisons},records:{keys:Object.keys(ctx.k.cache).map(key=>({key})),queries:copy(ctx.k.history)}})
 });

 machine('keysetTable',p=>({rows:Array.from({length:Math.min(8,p.maxRecords)},(_,key)=>({key,value:key})),comparisons:0}),function(k,c,p){
  if(c.op==='append'||c.op==='insertFirst'){required(jsonValue(c.value));if(k.rows.length>=p.maxRecords)return {accepted:false,reason:'capacity'};const key=c.op==='append'?(k.rows.at(-1)?.key??-1)+1:(k.rows[0]?.key??1)-1;const row={key,value:normalized(c.value)};if(c.op==='append')k.rows.push(row);else k.rows.unshift(row);return {accepted:true,key,size:k.rows.length};}
  required(c.op==='page'&&(c.afterKey===null||Number.isSafeInteger(c.afterKey))&&Number.isInteger(c.limit)&&c.limit>0&&c.limit<=100);
  let left=0,right=k.rows.length;while(left<right){const mid=(left+right)>>>1;k.comparisons++;if(c.afterKey!==null&&k.rows[mid].key<=c.afterKey)left=mid+1;else right=mid;}
  const page=k.rows.slice(left,left+c.limit);return {accepted:true,rows:page.map(row=>copy(row.value)),keys:page.map(row=>row.key),nextKey:page.at(-1)?.key??c.afterKey,comparisons:k.comparisons};
 });

 machine('leasedState',()=>({lease:null,serial:0,revision:0,text:'',values:{},applied:{},denied:0,writes:0}),function(k,c,p,t){
  if(k.lease&&k.lease.until<=t)k.lease=null;
  if(c.op==='read')return p.mode==='document'?{accepted:true,revision:k.revision,text:k.text}:{accepted:true,version:k.revision,values:copy(k.values)};
  required(identity(c.owner));
  if(c.op==='acquire'){if(k.lease&&k.lease.owner!==c.owner){k.denied++;return {accepted:false,reason:'lease held'};}if(!k.lease){if(!Number.isSafeInteger(k.serial+1))return {accepted:false,reason:'fence capacity'};k.lease={owner:c.owner,fence:++k.serial,until:t+p.leaseSec};}return {accepted:true,...copy(k.lease)};}
  required(Number.isSafeInteger(c.fence)&&c.fence>0);
  if(!k.lease||k.lease.owner!==c.owner||k.lease.fence!==c.fence){k.denied++;return {accepted:false,reason:'stale lease'};}
  if(c.op==='release'){k.lease=null;return {accepted:true};}
  required(c.op==='write'&&identity(c.id));if(p.mode==='document')required(typeof c.text==='string'&&c.text.length<2000);else required(identity(c.key)&&jsonValue(c.value));
  const body=JSON.stringify([c.owner,c.fence,p.mode==='document'?c.text:c.key,p.mode==='document'?null:c.value]),prior=read(k.applied,c.id);if(prior)return {...copy(prior.result),accepted:prior.body===body,duplicate:true};
  if(Object.keys(k.applied).length>=p.maxRecords)return {accepted:false,reason:'write capacity'};
  if(p.mode==='document')k.text=c.text;else put(k.values,c.key,normalized(c.value));k.revision++;k.writes++;const result={accepted:true,revision:k.revision,version:k.revision};put(k.applied,c.id,{body,result});return result;
 });

 const CODE_TOKENS=/("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)|("(?:\\[\s\S]|[^"\\])*(?:\\)?$|'(?:\\[\s\S]|[^'\\])*(?:\\)?$|`(?:\\[\s\S]|[^`\\])*(?:\\)?$)|(\/\*[\s\S]*?(?:\*\/|$))|(\/\/[^\n]*)/g;
 const SQL_TOKENS=/("(?:\\[\s\S]|""|[^"\\])*"|'(?:\\[\s\S]|''|[^'\\])*')|("(?:\\[\s\S]|""|[^"\\])*(?:\\)?$|'(?:\\[\s\S]|''|[^'\\])*(?:\\)?$)|(\/\*[\s\S]*?(?:\*\/|$))|(--[^\n]*)/g;
 machine('tokenizedLexer',()=>({processed:0,characters:0,tokens:0}),function(k,c,p){required(c.op==='strip'&&typeof c.text==='string'&&c.text.length<=p.maxRecords);let out='',end=0,unterminated=false,count=0;
  for(const match of c.text.matchAll(p.sql?SQL_TOKENS:CODE_TOKENS)){out+=c.text.slice(end,match.index);const token=match[0];if(match[1]!==undefined)out+=token;else if(match[2]!==undefined){out+=token;unterminated=true;}else if(match[3]!==undefined){out+=token.replace(/[^\n]/g,'');if(!token.endsWith('*/'))unterminated=true;}end=match.index+token.length;count++;}
  out+=c.text.slice(end);k.processed++;k.characters+=c.text.length;k.tokens+=count;return {accepted:true,text:out,unterminated,tokens:count};
 });

 function heapLess(k,a,b){k.comparisons++;return a.at<b.at||(a.at===b.at&&a.sequence<b.sequence);}
 function heapPush(k,row){let i=k.heap.length;k.heap.push(row);while(i){const parent=(i-1)>>>1;if(!heapLess(k,row,k.heap[parent]))break;k.heap[i]=k.heap[parent];i=parent;}k.heap[i]=row;}
 function heapPop(k){const root=k.heap[0],last=k.heap.pop();if(k.heap.length){let i=0;while(2*i+1<k.heap.length){let child=2*i+1;if(child+1<k.heap.length&&heapLess(k,k.heap[child+1],k.heap[child]))child++;if(!heapLess(k,k.heap[child],last))break;k.heap[i]=k.heap[child];i=child;}k.heap[i]=last;}return root;}
 machine('expiryHeapCounter',()=>({heap:[],counts:{},sequence:0,accepted:0,denied:0,expired:0,comparisons:0}),function(k,c,p,t){required(c.op==='hit'&&identity(c.key));
  // Match the per-key counter's subtraction boundary exactly, including floating-point timestamps.
  while(k.heap.length&&k.heap[0].at<=t-p.windowSec){const row=heapPop(k),count=read(k.counts,row.key)-1;if(count)put(k.counts,row.key,count);else delete k.counts[row.key];k.expired++;}
  const count=read(k.counts,c.key)||0;if(!count&&Object.keys(k.counts).length>=p.maxRecords)return {accepted:false,reason:'key capacity'};if(count>=p.capacity){k.denied++;return {accepted:false,reason:'rate limit',count};}
  put(k.counts,c.key,count+1);heapPush(k,{key:c.key,at:t,sequence:++k.sequence});k.accepted++;return {accepted:true,count:count+1,expired:k.expired,heapSize:k.heap.length,comparisons:k.comparisons};
 });

 function unlink(k,key){const row=read(k.values,key);if(row.prev!==null)read(k.values,row.prev).next=row.next;else k.head=row.next;if(row.next!==null)read(k.values,row.next).prev=row.prev;else k.tail=row.prev;row.prev=null;row.next=null;k.pointerWrites+=4;}
 function prepend(k,key){const row=read(k.values,key);row.prev=null;row.next=k.head;if(k.head!==null)read(k.values,k.head).prev=key;else k.tail=key;k.head=key;k.pointerWrites+=4;}
 function removeLru(k,key){unlink(k,key);delete k.values[key];}
 machine('linkedLruMap',()=>({values:{},head:null,tail:null,hits:0,misses:0,evictions:0,pointerWrites:0,expiryChecks:0}),function(k,c,p,t){
  if(p.expire)for(const [key,row]of Object.entries(k.values)){k.expiryChecks++;if(row.until<=t)removeLru(k,key);}
  required(identity(c.key));const prior=read(k.values,c.key);
  if(c.op==='put'){required(jsonValue(c.value));if(!prior&&Object.keys(k.values).length>=p.capacity){if(!p.evict)return {accepted:false,reason:'capacity'};removeLru(k,k.tail);k.evictions++;}if(prior)unlink(k,c.key);put(k.values,c.key,{value:normalized(c.value),until:t+p.ttlSec,prev:null,next:null});prepend(k,c.key);return {accepted:true,pointerWrites:k.pointerWrites};}
  required(c.op==='get');if(prior){unlink(k,c.key);prepend(k,c.key);k.hits++;}else k.misses++;return {accepted:true,found:Boolean(prior),value:prior?.value??null,hits:k.hits,misses:k.misses,pointerWrites:k.pointerWrites};
 },{restart(k,p){if(!p.durable){k.values={};k.head=null;k.tail=null;}}});

 function publish(k){k.published=k.root;k.publishedSeen=k.seen;k.publishedVersion=k.version;k.pendingWrites=0;k.publications++;}
 function restoreRoot(k){k.lostWrites+=k.pendingWrites;k.root=k.published;k.seen=k.publishedSeen;k.version=k.publishedVersion;k.pendingWrites=0;k.restarts++;}
 machine('copyOnWriteMap',()=>({root:{},published:{},seen:{},publishedSeen:{},version:0,publishedVersion:0,pendingWrites:0,copiedEntries:0,publications:0,lostWrites:0,restarts:0}),function(k,c,p){
  if(c.op==='read')return {accepted:true,value:read(k.root,c.key)??null};
  if(c.op==='checkpoint'){publish(k);return {accepted:true,snapshotKeys:Object.keys(k.published).length};}
  if(c.op==='flush'){publish(k);return {accepted:true};}
  if(c.op==='restart'){restoreRoot(k);return {accepted:true,replayed:0};}
  required(c.op==='write'&&identity(c.id)&&identity(c.key)&&jsonValue(c.value));const body=JSON.stringify([c.key,c.value]),prior=read(k.seen,c.id);if(prior)return {accepted:prior===body,duplicate:true};if(Object.keys(k.seen).length>=p.maxRecords)return {accepted:false,reason:'journal capacity'};
  const next=copy(k.root),seen=copy(k.seen);k.copiedEntries+=Object.keys(k.root).length+1;put(next,c.key,normalized(c.value));put(seen,c.id,body);k.root=next;k.seen=seen;k.version++;k.pendingWrites++;if(p.syncWrites)publish(k);return {accepted:true,durable:p.syncWrites,copiedEntries:k.copiedEntries};
 },{restart:restoreRoot});

 function readyRing(capacity){return {slots:Array(capacity).fill(null),head:0,count:0};}
 function enqueue(k,id){required(k.ready.count<k.ready.slots.length);k.ready.slots[(k.ready.head+k.ready.count)%k.ready.slots.length]=id;k.ready.count++;}
 function dequeue(k){if(!k.ready.count)return null;const id=k.ready.slots[k.ready.head];k.ready.slots[k.ready.head]=null;k.ready.head=(k.ready.head+1)%k.ready.slots.length;k.ready.count--;return id;}
 machine('readyQueueDag',p=>({tasks:{},ready:readyRing(p.maxRecords),completed:[],failed:0,retries:0,dependencyUpdates:0}),function(k,c,p){
  if(c.op==='submit'){required(identity(c.id)&&Array.isArray(c.deps)&&c.deps.length<=p.maxDependencies&&new Set(c.deps).size===c.deps.length&&c.deps.every(id=>identity(id)&&Object.hasOwn(k.tasks,id)));const prior=read(k.tasks,c.id);if(prior)return {accepted:JSON.stringify(prior.deps)===JSON.stringify(c.deps),duplicate:true};if(Object.keys(k.tasks).length>=p.maxRecords)return {accepted:false,reason:'task capacity'};
   const remaining=c.deps.filter(id=>read(k.tasks,id).state!=='done').length;put(k.tasks,c.id,{id:c.id,deps:copy(c.deps),dependents:[],remaining,state:'pending',attempts:0});for(const id of c.deps)if(read(k.tasks,id).state!=='done')read(k.tasks,id).dependents.push(c.id);if(!remaining)enqueue(k,c.id);
  }else if(c.op==='claim'){const id=dequeue(k);if(id===null)return {accepted:false,reason:'no ready task'};const row=read(k.tasks,id);required(row.state==='pending'&&row.remaining===0);row.state='running';row.attempts++;return {accepted:true,task:id};
  }else if(c.op==='complete'){const row=read(k.tasks,c.id);required(row&&row.state==='running');row.state='done';k.completed.push(row.id);for(const id of row.dependents){const child=read(k.tasks,id);child.remaining--;k.dependencyUpdates++;if(!child.remaining)enqueue(k,id);}row.dependents=[];
  }else if(c.op==='fail'){const row=read(k.tasks,c.id);required(row&&row.state==='running');row.state=p.retryTasks&&row.attempts<p.maxAttempts?'pending':'failed';k.failed++;if(row.state==='pending'){enqueue(k,row.id);k.retries++;}
  }else throw Error('Unsupported scheduler command');
  return {accepted:true,completed:copy(k.completed),readyCount:k.ready.count,dependencyUpdates:k.dependencyUpdates};
 });

 function dropTenant(k,tenant){if(read(k.waiting,tenant)?.length)return;delete k.waiting[tenant];const index=k.order.indexOf(tenant);if(index>=0){k.order.splice(index,1);if(index<k.cursor)k.cursor--;}if(k.order.length)k.cursor%=k.order.length;else k.cursor=0;}
 function grant(k,id,tenant){put(k.leases,id,tenant);put(k.byTenant,tenant,(read(k.byTenant,tenant)||0)+1);k.granted++;}
 function removeWaiting(k,row){const list=read(k.waiting,row.tenant),index=list.findIndex(r=>r.jobId===row.jobId);if(index>=0)list.splice(index,1);delete k.waitIds[row.id];k.waitCount--;dropTenant(k,row.tenant);}
 function drain(ctx){const k=ctx.k;let missed=0;while(k.order.length&&Object.keys(k.leases).length<ctx.p.capacity&&missed<k.order.length){const tenant=k.order[k.cursor];k.rounds++;if((read(k.byTenant,tenant)||0)>=ctx.p.tenantLimit){k.cursor=(k.cursor+1)%k.order.length;missed++;continue;}const row=read(k.waiting,tenant)[0],held=ctx.job(row.jobId);removeWaiting(k,row);if(held){grant(k,row.id,tenant);answer(ctx,held,{accepted:true,active:Object.keys(k.leases).length,waitMs:(ctx.t-row.at)*1000});}if(k.order.length&&k.order[k.cursor]===tenant)k.cursor=(k.cursor+1)%k.order.length;missed=0;}}
 registry.register({id:'fairSlotQueue',station:null,
  init:()=>({leases:{},byTenant:{},waiting:{},waitIds:{},order:[],cursor:0,waitCount:0,granted:0,rejected:0,timedOut:0,rounds:0}),
  onRequest(ctx,job){const c=job.msg.fields?.command,k=ctx.k;if(!c||!['acquire','release'].includes(c.op)||!identity(c.id)||!identity(c.tenant)){ctx.reply(job,{ok:false,err:'invalid'});return;}
   if(c.op==='release'){const owner=read(k.leases,c.id);if(owner!==undefined&&owner!==c.tenant){answer(ctx,job,{accepted:false,reason:'lease owner'});return;}if(owner!==undefined){delete k.leases[c.id];const count=read(k.byTenant,owner)-1;if(count)put(k.byTenant,owner,count);else delete k.byTenant[owner];}drain(ctx);answer(ctx,job,{accepted:true,active:Object.keys(k.leases).length});return;}
   const owner=read(k.leases,c.id);if(owner!==undefined){answer(ctx,job,{accepted:owner===c.tenant,duplicate:true});return;}
   const pending=read(k.waitIds,c.id);if(pending){answer(ctx,job,{accepted:false,reason:pending.tenant===c.tenant?'already waiting':'lease owner'});return;}
   // Existing waiters receive capacity before newly arriving acquisitions.
   drain(ctx);if(Object.keys(k.leases).length<ctx.p.capacity&&(read(k.byTenant,c.tenant)||0)<ctx.p.tenantLimit){grant(k,c.id,c.tenant);answer(ctx,job,{accepted:true,active:Object.keys(k.leases).length});return;}
   if(k.waitCount>=ctx.p.maxRecords){k.rejected++;answer(ctx,job,{accepted:false,reason:'waiter capacity'});return;}
   if(!Object.hasOwn(k.waiting,c.tenant)){put(k.waiting,c.tenant,[]);k.order.push(c.tenant);}const row={id:c.id,tenant:c.tenant,jobId:job.id,at:ctx.t};read(k.waiting,c.tenant).push(row);put(k.waitIds,c.id,row);k.waitCount++;ctx.wake(ctx.p.waitTimeoutMs/1000,{id:c.id,jobId:job.id});drain(ctx);
  },
  onWake(ctx,wake){const row=read(ctx.k.waitIds,wake.id);if(!row||row.jobId!==wake.jobId)return;removeWaiting(ctx.k,row);const held=ctx.job(row.jobId);if(held)answer(ctx,held,{accepted:false,reason:'wait timeout'});ctx.k.timedOut++;drain(ctx);},
  onFault(ctx,fault,on){if(on&&fault.type==='crash'){const k=ctx.k;k.waiting={};k.waitIds={};k.order=[];k.cursor=0;k.waitCount=0;if(!ctx.p.durable){k.leases={};k.byTenant={};}}},
  observe:ctx=>({detail:{Active:Object.keys(ctx.k.leases).length,Waiting:ctx.k.waitCount,Granted:ctx.k.granted,Rejected:ctx.k.rejected,TimedOut:ctx.k.timedOut,'Round-robin visits':ctx.k.rounds},records:{leases:Object.entries(ctx.k.leases).map(([id,tenant])=>({id,tenant})),waiters:ctx.k.order.flatMap(tenant=>copy(read(ctx.k.waiting,tenant)))}})
 });

 const original=registry.get('prefixRules');
 registry.register({id:'orderedRulesScan',station:original.station,init:original.init,onRequest:original.onRequest,onFault:original.onFault,observe:original.observe,
  onServed(ctx,job){original.onServed({...ctx,p:{...ctx.p,useTrie:false}},job);}
 });
});
