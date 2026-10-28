// Bounded reference mechanisms. No browser, concurrent runtime or complexity proof.

// L036 LazyArray. Both approaches share immutable operation cells and differ in how a
// consumer evaluates them: FusedPlan compiles composite stage functions driven by one push
// loop; CursorChain opens one pull iterator object per operator run.
const cell=(previous,kind,fn)=>{if(typeof fn!=='function')throw TypeError('callback');return {previous,kind,fn};};
// Iterative history walk: adjacent maps form one run; a filter always starts a new run.
export function runsOf(tail){const cells=[];for(let c=tail;c;c=c.previous)cells.push(c);cells.reverse();const runs=[];for(const c of cells){const last=runs.at(-1);if(c.kind==='map'&&last?.kind==='map')last.fns.push(c.fn);else runs.push({kind:c.kind,fns:[c.fn]});}return runs;}
// One composite function per map run: a loop over the run's callbacks, not nested closures.
export const composite=fns=>value=>{for(const fn of fns)value=fn(value);return value;};
class Lazy{
 constructor(source,tail=null,owned=false){this.source=owned?source:source.slice();this.tail=tail;}
 map(fn){return new this.constructor(this.source,cell(this.tail,'map',fn),true);}
 filter(fn){return new this.constructor(this.source,cell(this.tail,'filter',fn),true);}
}
export class FusedPlan extends Lazy{
 compile(){return runsOf(this.tail).map(r=>r.kind==='map'?{kind:'map',width:r.fns.length,call:composite(r.fns)}:{kind:'filter',width:1,call:r.fns[0]});}
 run(target,collect){const stages=this.compile(),output=[];let ordinal=0;
  source:for(const original of this.source){let value=original;
   for(const s of stages){if(s.kind==='filter'){if(!s.call(value))continue source;}else value=s.call(value);}
   if(!collect&&Object.is(value,target))return ordinal;if(collect)output.push(value);ordinal++;}
  return collect?output:-1;}
 collect(){return this.run(undefined,true);}
 indexOf(target){return this.run(target,false);}
}
const sourceLayer=source=>{let i=0;const layer={kind:'source',closed:false,pulls:0,next(){if(layer.closed||i>=source.length)return {done:true};layer.pulls++;return {done:false,value:source[i++]};},close(){layer.closed=true;}};return layer;};
const filterLayer=(up,fn)=>{const layer={kind:'filter',up,closed:false,next(){if(layer.closed)return {done:true};for(;;){const n=up.next();if(n.done||fn(n.value))return n;}},close(){if(!layer.closed){layer.closed=true;up.close();}}};return layer;};
const mapRunLayer=(up,run,width)=>{const layer={kind:'map-run',width,up,closed:false,next(){if(layer.closed)return {done:true};const n=up.next();return n.done?n:{done:false,value:run(n.value)};},close(){if(!layer.closed){layer.closed=true;up.close();}}};return layer;};
export class CursorChain extends Lazy{
 open(){let top=sourceLayer(this.source);for(const r of runsOf(this.tail))top=r.kind==='filter'?filterLayer(top,r.fns[0]):mapRunLayer(top,composite(r.fns),r.fns.length);
  let closed=false;
  return {top,
   next(){if(closed)return {done:true};try{const n=top.next();if(n.done){closed=true;top.close();}return n;}catch(error){closed=true;top.close();throw error;}},
   close(){if(!closed){closed=true;top.close();}}};}
 collect(){const c=this.open(),out=[];for(let n=c.next();!n.done;n=c.next())out.push(n.value);return out;}
 indexOf(target){const c=this.open();let i=0;for(let n=c.next();!n.done;n=c.next()){if(Object.is(n.value,target)){c.close();return i;}i++;}return -1;}
}

// L037 avl-rope: immutable AVL chunk rope with join-based split/splice and versioned roots.
const scalars=text=>[...text];
const leaf=text=>({text,count:scalars(text).length,height:1});
const height=n=>n?n.height:0;
const node=(left,right)=>({left,right,count:left.count+right.count,height:1+Math.max(left.height,right.height)});
// Children are AVL trees whose heights differ by at most two.
function rebalance(l,r){
 if(l.height>r.height+1){if(height(l.left)>=height(l.right))return node(l.left,node(l.right,r));return node(node(l.left,l.right.left),node(l.right.right,r));}
 if(r.height>l.height+1){if(height(r.right)>=height(r.left))return node(node(l,r.left),r.right);return node(node(l,r.left.left),node(r.left.right,r.right));}
 return node(l,r);
}
export function join(a,b){if(!a)return b;if(!b)return a;if(a.height>b.height+1)return rebalance(a.left,join(a.right,b));if(b.height>a.height+1)return rebalance(join(a,b.left),b.right);return node(a,b);}
export function rope(text,chunk=3){const chars=scalars(text);let root=null;for(let i=0;i<chars.length;i+=chunk)root=join(root,leaf(chars.slice(i,i+chunk).join('')));return root;}
export const flatten=n=>!n?'':n.text!==undefined?n.text:flatten(n.left)+flatten(n.right);
export function split(n,i){if(!Number.isInteger(i)||i<0||i>(n?.count||0))throw RangeError('split index');if(!n)return [null,null];
 if(n.text!==undefined){if(i===0)return [null,n];if(i===n.count)return [n,null];const c=scalars(n.text);return [leaf(c.slice(0,i).join('')),leaf(c.slice(i).join(''))];}
 if(i<n.left.count){const [a,b]=split(n.left,i);return [a,join(b,n.right)];}
 const [a,b]=split(n.right,i-n.left.count);return [join(n.left,a),b];}
export function splice(n,i,length,text){if(!Number.isInteger(length)||length<0||!Number.isInteger(i)||i<0||i+length>(n?.count||0))throw RangeError('delete range');const [a,t]=split(n,i),[,b]=split(t,length);return join(join(a,rope(text)),b);}
// Verifies cached counts, cached heights and the AVL balance bound on every node.
export function checkAvl(n){if(!n)return null;if(n.text!==undefined){if(!n.text||n.count!==scalars(n.text).length||n.height!==1)throw Error('leaf metadata');return n;}
 checkAvl(n.left);checkAvl(n.right);if(n.count!==n.left.count+n.right.count)throw Error('subtree count');if(n.height!==1+Math.max(n.left.height,n.right.height))throw Error('height');if(Math.abs(n.left.height-n.right.height)>1)throw Error('AVL balance');return n;}
const reachable=(n,set=new Set())=>{if(n&&!set.has(n)){set.add(n);if(n.text===undefined){reachable(n.left,set);reachable(n.right,set);}}return set;};
// Path copying leaves removed nodes reachable from older roots. A node retired at version V
// is freed only when no reader pins a version older than V. JavaScript has a garbage
// collector; this models the bookkeeping a manually reclaimed implementation needs.
export class RopeStore{
 constructor(text,chunk=3){this.chunk=chunk;this.root=rope(text,chunk);this.version=0;this.pins=new Map();this.retired=[];this.freed=new WeakSet();this.freedCount=0;}
 pin(){const version=this.version;this.pins.set(version,(this.pins.get(version)||0)+1);return {version,root:this.root};}
 unpin(snapshot){const k=this.pins.get(snapshot.version)-1;if(k>0)this.pins.set(snapshot.version,k);else this.pins.delete(snapshot.version);this.reclaim();}
 live(n){if(n&&this.freed.has(n))throw Error('read of reclaimed node');return n;}
 text(snapshot){const walk=n=>{this.live(n);return !n?'':n.text!==undefined?n.text:walk(n.left)+walk(n.right);};return walk(snapshot.root);}
 read(snapshot,i){let n=this.live(snapshot.root);if(!Number.isInteger(i)||i<0||i>=(n?.count||0))throw RangeError('read index');while(n.text===undefined){if(i<n.left.count)n=this.live(n.left);else{i-=n.left.count;n=this.live(n.right);}}return scalars(n.text)[i];}
 insert(i,text){if(!Number.isInteger(i)||i<0||i>(this.root?.count||0))throw RangeError('insert index');const [a,b]=split(this.root,i);return this.publish(join(join(a,rope(text,this.chunk)),b));}
 deleteRange(i,length){if(!Number.isInteger(i)||!Number.isInteger(length)||i<0||length<0||i+length>(this.root?.count||0))throw RangeError('delete range');const [a,t]=split(this.root,i),[,b]=split(t,length);return this.publish(join(a,b));}
 publish(root){checkAvl(root);const live=reachable(root),garbage=[...reachable(this.root)].filter(n=>!live.has(n));this.root=root;this.version++;this.retired.push({version:this.version,nodes:garbage});this.reclaim();return this.version;}
 reclaim(){const oldest=Math.min(this.version,...this.pins.keys());this.retired=this.retired.filter(r=>{if(r.version>oldest)return true;for(const n of r.nodes){this.freed.add(n);this.freedCount++;}return false;});}
}

// L037 implicit-treap: positions are in-order scalar ranks; subtree counts are cached.
export const tcount=n=>n?n.count:0; // O(1): reads only the cached field
// Repairing a node reads its two children's cached counts, never their subtrees.
export const treapNode=(chunk,width,priority,left,right)=>Object.freeze({chunk,width,priority,left,right,count:tcount(left)+width+tcount(right)});
export function tmerge(a,b){if(!a)return b;if(!b)return a;return a.priority<=b.priority?treapNode(a.chunk,a.width,a.priority,a.left,tmerge(a.right,b)):treapNode(b.chunk,b.width,b.priority,tmerge(a,b.left),b.right);}
// A split inside a chunk gives both pieces that node's priority; heap order is non-strict.
export function tsplit(n,k){if(!n)return [null,null];const lc=tcount(n.left);
 if(k<=lc){const [a,b]=tsplit(n.left,k);return [a,treapNode(n.chunk,n.width,n.priority,b,n.right)];}
 if(k>=lc+n.width){const [a,b]=tsplit(n.right,k-lc-n.width);return [treapNode(n.chunk,n.width,n.priority,n.left,a),b];}
 const c=scalars(n.chunk),off=k-lc;return [treapNode(c.slice(0,off).join(''),off,n.priority,n.left,null),treapNode(c.slice(off).join(''),c.length-off,n.priority,null,n.right)];}
export const tflatten=n=>!n?'':tflatten(n.left)+n.chunk+tflatten(n.right);
export function checkTreap(n){if(!n)return 0;const l=checkTreap(n.left),r=checkTreap(n.right);if(!n.chunk||n.width!==scalars(n.chunk).length)throw Error('chunk width');if(n.count!==l+n.width+r)throw Error('cached count');for(const child of [n.left,n.right])if(child&&child.priority<n.priority)throw Error('heap order');return n.count;}
export class TreapText{
 constructor(text,seed=1,chunk=3){this.seed=seed>>>0||1;this.chunk=chunk;this.root=this.build(text);this.version=0;}
 priority(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed;}
 build(text){const c=scalars(text);let root=null;for(let i=0;i<c.length;i+=this.chunk){const piece=c.slice(i,i+this.chunk);root=tmerge(root,treapNode(piece.join(''),piece.length,this.priority(),null,null));}return root;}
 insert(i,text){if(!Number.isInteger(i)||i<0||i>tcount(this.root))throw RangeError('insert index');const [a,b]=tsplit(this.root,i);return this.publish(tmerge(tmerge(a,this.build(text)),b));}
 deleteRange(i,length){if(!Number.isInteger(i)||!Number.isInteger(length)||i<0||length<0||i+length>tcount(this.root))throw RangeError('delete range');const [a,t]=tsplit(this.root,i),[,b]=tsplit(t,length);return this.publish(tmerge(a,b));}
 read(i){let n=this.root;if(!Number.isInteger(i)||i<0||i>=tcount(n))throw RangeError('read index');for(;;){const lc=tcount(n.left);if(i<lc)n=n.left;else if(i<lc+n.width)return scalars(n.chunk)[i-lc];else{i-=lc+n.width;n=n.right;}}}
 publish(root){checkTreap(root);this.root=root;return ++this.version;}
}

// L038 firewall: strict parsing, ordered scan, minimum-ordinal trie and versioned publication.
export function ipv4(text){if(typeof text!=='string'||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(text))throw Error('IPv4');const octets=text.split('.').map(Number);if(octets.some(x=>x>255))throw Error('octet');return octets.reduce((v,x)=>(v*256+x)>>>0,0);}
export function compileRules(rules){return rules.map((r,ordinal)=>{if(!['ALLOW','DENY'].includes(r.action))throw Error('action');const parts=r.cidr.split('/');if(parts.length>2)throw Error('cidr');const ip=ipv4(parts[0]);const prefix=parts.length===1?32:Number(parts[1]);if(parts.length===2&&! /^(0|[1-9]\d*)$/.test(parts[1])||!Number.isInteger(prefix)||prefix<0||prefix>32)throw Error('prefix');const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;return {...r,ordinal,prefix,mask,network:(ip&mask)>>>0};});}
export function scanRule(rules,ip){for(const r of rules)if(((ip&r.mask)>>>0)===r.network)return r;return null;}
export function scan(rules,text){let ip;try{ip=ipv4(text);}catch{return 'DENY';}return scanRule(rules,ip)?.action||'DENY';}
export function trie(rules){const root={child:[]};for(const r of rules){let n=root;for(let i=0;i<r.prefix;i++){const bit=(r.network>>>(31-i))&1;n=n.child[bit]??= {child:[]};}if(!n.rule||r.ordinal<n.rule.ordinal)n.rule=r;}return root;}
export function lookupRule(root,ip){let n=root,best=null;for(let i=0;n&&i<=32;i++){if(n.rule&&(!best||n.rule.ordinal<best.ordinal))best=n.rule;if(i===32)break;n=n.child[(ip>>>(31-i))&1];}return best;}
export function lookup(root,text){let ip;try{ip=ipv4(text);}catch{return 'DENY';}return lookupRule(root,ip)?.action||'DENY';}
// One published {rules,root,version} value. check reads it once; replaceRules compiles the
// whole candidate privately, then publishes by compare-and-set so versions never repeat.
export class FirewallPolicy{
 constructor(kind){if(!['scan','trie'].includes(kind))throw Error('kind');this.kind=kind;this.active=Object.freeze({version:0,rules:[],root:trie([])});}
 compareAndSet(expected,next){if(this.active!==expected)return false;this.active=next;return true;}
 replaceRules(rules,beforePublish){const compiled=compileRules(rules),root=this.kind==='trie'?trie(compiled):null;
  for(;;){const prior=this.active;beforePublish?.();if(this.compareAndSet(prior,Object.freeze({version:prior.version+1,rules:compiled,root})))return prior.version+1;}}
 check(address){const snapshot=this.active;let ip;try{ip=ipv4(address);}catch{return {decision:'DENY',ruleOrdinal:null,reason:'invalid',policyVersion:snapshot.version};}
  const rule=this.kind==='trie'?lookupRule(snapshot.root,ip):scanRule(snapshot.rules,ip);
  return rule?{decision:rule.action,ruleOrdinal:rule.ordinal,reason:'rule',policyVersion:snapshot.version}:{decision:'DENY',ruleOrdinal:null,reason:'unmatched',policyVersion:snapshot.version};}
}

// L039 lexer. span-scanner: partition the retained source into spans, then render.
export function scanSpans(source){const spans=[];let i=0,plain=0;const flush=end=>{if(end>plain)spans.push({kind:'plain',start:plain,end});};
 while(i<source.length){const c=source[i],pair=source.slice(i,i+2),start=i;
  if(c==='"'||c==="'"){flush(i);i++;let closed=false;while(i<source.length){const d=source[i++];if(d==='\\'){if(i<source.length)i++;continue;}if(d===c){if(source[i]===c){i++;continue;}closed=true;break;}}if(!closed)throw SyntaxError('unterminated quote '+start);spans.push({kind:'literal',start,end:i});plain=i;}
  else if(pair==='//'||pair==='--'){flush(i);i+=2;while(i<source.length&&source[i]!=='\n'&&source[i]!=='\r')i++;spans.push({kind:'comment',start,end:i});plain=i;}
  else if(pair==='/*'){flush(i);const close=source.indexOf('*/',i+2);if(close<0)throw SyntaxError('unterminated block '+start);i=close+2;spans.push({kind:'comment',start,end:i});plain=i;}
  else i++;}
 flush(source.length);return spans;}
export function stripSpans(source){return scanSpans(source).map(s=>s.kind==='comment'?' '+source.slice(s.start,s.end).replace(/[^\r\n]/g,''):source.slice(s.start,s.end)).join('');}
// Buffers chunks; output exists only after the whole source validates.
export class BufferedSpanStripper{
 constructor(){this.chunks=[];this.finished=false;}
 feed(chunk){if(this.finished)throw Error('finished');this.chunks.push(chunk);return {buffered:this.chunks.reduce((n,c)=>n+c.length,0)};}
 finish(){if(this.finished)throw Error('finished');this.finished=true;return stripSpans(this.chunks.join(''));}
}
// stream-dfa: incremental states with at most one held code unit across feed boundaries.
export class StreamingStripper{
 constructor(){this.state='code';this.pending='';this.output='';this.escape=false;this.finished=false;}
 feed(chunk){if(this.finished)throw Error('finished');this.pending+=chunk;this.run(false);return this;}
 run(eof){let i=0,s=this.pending;while(i<s.length){const c=s[i],n=s[i+1],last=i+1===s.length;if(!eof&&last&&(this.state==='code'&&('/-\'"'.includes(c))||this.state==='block'&&c==='*'||(this.state==='single'||this.state==='double')&&!this.escape&&(c==="'"||c==='"')) )break;
  if(this.state==='line'){if(c==='\n'||c==='\r'){this.output+=c;this.state='code';}i++;continue;}
  if(this.state==='block'){if(c==='*'&&n==='/'){this.state='code';i+=2;}else{if(c==='\n'||c==='\r')this.output+=c;i++;}continue;}
  if(this.state==='single'||this.state==='double'){const q=this.state==='single'?"'":'"';this.output+=c;i++;if(this.escape){this.escape=false;continue;}if(c==='\\'){this.escape=true;continue;}if(c===q){if(n===q){this.output+=n;i++;}else this.state='code';}continue;}
  if((c==='/'&&n==='/')||(c==='-'&&n==='-')){this.output+=' ';this.state='line';i+=2;continue;}
  if(c==='/'&&n==='*'){this.output+=' ';this.state='block';i+=2;continue;}
  this.output+=c;i++;if(c==="'")this.state='single';if(c==='"')this.state='double';
 }this.pending=s.slice(i);}
 finish(){if(this.finished)throw Error('finished');this.run(true);this.finished=true;if(this.state==='block'||this.state==='single'||this.state==='double')throw SyntaxError('unterminated '+this.state);return this.output;}
}
