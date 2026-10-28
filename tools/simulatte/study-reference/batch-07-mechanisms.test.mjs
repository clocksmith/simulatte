import test from 'node:test';
import assert from 'node:assert/strict';
import {FusedPlan,CursorChain,rope,flatten,split,splice,checkAvl,RopeStore,tcount,treapNode,tflatten,checkTreap,TreapText,ipv4,compileRules,scanRule,scan,trie,lookup,FirewallPolicy,scanSpans,stripSpans,BufferedSpanStripper,StreamingStripper} from './batch-07-mechanisms.mjs';
const lcg=seed=>()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0);
test('batch-07 lazy fused-plan: composite map runs, deferred branches and short circuit',()=>{
 const log=[],input=[1,2,3,4],calls={map:0,filter:0};
 // Counts calls to compiled stage functions, not to user callbacks.
 class Counted extends FusedPlan{compile(){return super.compile().map(s=>({...s,call:v=>{calls[s.kind]++;return s.call(v);}}));}}
 const plan=new Counted(input).map(x=>{log.push('a'+x);return x+1;}).map(x=>{log.push('b'+x);return x*10;}).filter(x=>{log.push('p'+x);return x!==30;}).map(x=>{log.push('c'+x);return x+1;}).map(x=>{log.push('d'+x);return x;});
 assert.deepEqual(log,[]);input.push(5);
 assert.deepEqual(plan.compile().map(s=>[s.kind,s.width]),[['map',2],['filter',1],['map',2]]);
 assert.deepEqual(plan.collect(),[21,41,51]);
 assert.deepEqual(calls,{map:7,filter:4});
 assert.deepEqual(log.slice(0,8),['a1','b2','p20','c20','d21','a2','b3','p30']);assert.equal(log.includes('c30'),false);
 const branch=plan.filter(x=>x>30);assert.equal(plan.compile().length,3);assert.deepEqual(branch.compile().map(s=>s.kind),['map','filter','map','filter']);assert.deepEqual(branch.collect(),[41,51]);
 log.length=0;assert.equal(plan.indexOf(41),1);assert.equal(log.includes('a4'),false);
 assert.equal(new FusedPlan([NaN]).indexOf(NaN),0);assert.equal(new FusedPlan([0]).map(x=>-x).indexOf(0),-1);assert.equal(new FusedPlan([]).indexOf(3),-1);assert.deepEqual(new FusedPlan([1,2]).filter(()=>false).collect(),[]);
 let later=0;const failing=new FusedPlan([1,2]).map(x=>{if(x===1)throw Error('callback');return x;}).map(x=>{later++;return x;});
 assert.throws(()=>failing.collect(),/callback/);assert.throws(()=>failing.indexOf(2),/callback/);assert.equal(later,0);
 let runs=0;const counting=new FusedPlan([1,2,3]).map(x=>{runs++;return x;});counting.collect();counting.collect();assert.equal(runs,6);
 assert.throws(()=>new FusedPlan([]).map(5),TypeError);
});
test('batch-07 lazy cursors: per-operator iterator chain, close propagation and exception close',()=>{
 let calls=0;const input=[1,2,3,4];
 const base=new CursorChain(input).map(x=>{calls++;return x*2;}).map(x=>x+0),branch=base.filter(x=>x>2).map(x=>x);
 assert.equal(calls,0);input.push(5);
 const c=branch.open(),d=branch.open(),layers=[];for(let l=c.top;l;l=l.up)layers.push(l.kind+(l.width?':'+l.width:''));
 assert.deepEqual(layers,['map-run:1','filter','map-run:2','source']);assert.equal(calls,0);
 assert.deepEqual(c.next(),{done:false,value:4});assert.deepEqual(d.next(),{done:false,value:4});assert.deepEqual(c.next(),{done:false,value:6});
 c.close();assert.deepEqual(c.next(),{done:true});assert.deepEqual(d.next(),{done:false,value:6});
 let source=c.top;while(source.up)source=source.up;assert.equal(source.closed,true);assert.equal(source.pulls,3);
 calls=0;assert.equal(branch.indexOf(6),1);assert.equal(calls,3);
 assert.deepEqual(base.collect(),[2,4,6,8]);
 const failing=new CursorChain([1,2,3]).map(x=>{if(x===1)throw Error('boom');return x;}),f=failing.open();
 assert.throws(()=>f.next(),/boom/);assert.deepEqual(f.next(),{done:true});let failedSource=f.top;while(failedSource.up)failedSource=failedSource.up;assert.equal(failedSource.closed,true);
 assert.throws(()=>failing.collect(),/boom/);
 assert.equal(new CursorChain([NaN]).indexOf(NaN),0);assert.equal(new CursorChain([]).indexOf(3),-1);assert.deepEqual(new CursorChain([1,2]).filter(()=>false).collect(),[]);
});
test('batch-07 rope avl: balanced split and splice match scalar arrays',()=>{
 const source='a😀bcdef',original=rope(source,2),chars=[...source];checkAvl(original);
 for(let i=0;i<=chars.length;i++){const [a,b]=split(original,i);assert.equal(flatten(a)+flatten(b),source);checkAvl(a);checkAvl(b);assert.equal(a?.count||0,i);assert.equal(b?.count||0,chars.length-i);
  for(let len=0;len<=chars.length-i;len++){const next=splice(original,i,len,'Ω🚀');assert.equal(flatten(next),chars.slice(0,i).join('')+'Ω🚀'+chars.slice(i+len).join(''));checkAvl(next);}}
 assert.equal(flatten(original),source);assert.throws(()=>split(original,-1),RangeError);assert.throws(()=>splice(original,2,20,''),RangeError);
 const front=new RopeStore('',2);for(let i=0;i<256;i++)front.insert(0,String.fromCodePoint(0x1F600+i%10));
 checkAvl(front.root);assert.equal(front.root.count,256);assert.ok(front.root.height<=Math.ceil(1.45*Math.log2(256+2)),'height '+front.root.height);
 const random=lcg(37),store=new RopeStore('seed😀text',3);let oracle=[...'seed😀text'];
 for(let k=0;k<300;k++){const r=random();if(r%3||!oracle.length){const at=r%(oracle.length+1),text=['x','yz','😀w','ΩΩΩΩ'][r%4];store.insert(at,text);oracle.splice(at,0,...text);}else{const at=r%oracle.length,len=r%Math.min(5,oracle.length-at+1);store.deleteRange(at,len);oracle.splice(at,len);}
  assert.equal(store.text({root:store.root}),oracle.join(''));}
});
test('batch-07 rope avl: pinned snapshots defer reclamation',()=>{
 const store=new RopeStore('abcdefghijkl',2),old=store.pin();
 store.deleteRange(2,6);assert.equal(store.text({root:store.root}),'abijkl');
 assert.equal(store.text(old),'abcdefghijkl');assert.equal(store.read(old,4),'e');assert.equal(store.freedCount,0);
 store.unpin(old);assert.ok(store.freedCount>0);assert.throws(()=>store.text(old),/reclaimed/);assert.equal(store.text({root:store.root}),'abijkl');
 const version=store.version;assert.throws(()=>store.deleteRange(3,99),RangeError);assert.throws(()=>store.insert(-1,'x'),RangeError);assert.throws(()=>store.read({root:store.root},6),RangeError);assert.equal(store.version,version);
 const empty=new RopeStore('');empty.insert(0,'');empty.deleteRange(0,0);assert.equal(empty.text({root:empty.root}),'');empty.insert(0,'😀');empty.insert(1,'z');assert.equal(empty.read({root:empty.root},0),'😀');assert.equal(empty.text({root:empty.root}),'😀z');
});
test('batch-07 rope treap: cached counts, heap order and splice oracle',()=>{
 const poisoned={count:4,get left(){throw Error('walked subtree');},get right(){throw Error('walked subtree');}};
 assert.equal(tcount(poisoned),4);assert.equal(treapNode('ab',2,7,poisoned,poisoned).count,10);
 const text=new TreapText('seed😀text',11);let oracle=[...'seed😀text'];const random=lcg(53),history=[];
 for(let k=0;k<300;k++){const r=random();history.push([text.root,oracle.join('')]);if(r%3||!oracle.length){const at=r%(oracle.length+1),piece=['x','yz','😀w','ΩΩΩΩ'][r%4];text.insert(at,piece);oracle.splice(at,0,...piece);}else{const at=r%oracle.length,len=r%Math.min(5,oracle.length-at+1);text.deleteRange(at,len);oracle.splice(at,len);}
  assert.equal(checkTreap(text.root),oracle.length);assert.equal(tflatten(text.root),oracle.join(''));if(oracle.length){const i=r%oracle.length;assert.equal(text.read(i),oracle[i]);}}
 for(const [root,flat]of history)assert.equal(tflatten(root),flat);
 const empty=new TreapText('',3),version=empty.version;assert.throws(()=>empty.read(0),RangeError);assert.throws(()=>empty.deleteRange(0,1),RangeError);assert.throws(()=>empty.insert(1,'x'),RangeError);assert.equal(empty.version,version);
 empty.insert(0,'');empty.deleteRange(0,0);empty.insert(0,'ab');empty.insert(2,'😀');assert.equal(tflatten(empty.root),'ab😀');assert.equal(empty.read(2),'😀');
});
test('batch-07 firewall scan: first match wins and invalid input fails closed',()=>{
 const early=compileRules([{action:'DENY',cidr:'10.0.0.0/8'},{action:'ALLOW',cidr:'10.1.2.3/32'}]),late=compileRules([{action:'ALLOW',cidr:'10.1.2.3/32'},{action:'DENY',cidr:'10.0.0.0/8'}]);
 assert.equal(scan(early,'10.1.2.3'),'DENY');assert.equal(scanRule(early,ipv4('10.1.2.3')).ordinal,0);assert.equal(scan(late,'10.1.2.3'),'ALLOW');assert.equal(scan(late,'10.9.9.9'),'DENY');
 const all=compileRules([{action:'ALLOW',cidr:'0.0.0.0/0'},{action:'DENY',cidr:'255.255.255.255/32'}]),top=compileRules([{action:'ALLOW',cidr:'255.255.255.255/32'}]);
 assert.equal(scan(all,'255.255.255.255'),'ALLOW');assert.equal(scan(all,'0.0.0.0'),'ALLOW');assert.equal(scan(top,'255.255.255.255'),'ALLOW');assert.equal(scan(top,'255.255.255.254'),'DENY');
 assert.equal(compileRules([{action:'ALLOW',cidr:'192.168.1.77/24'}])[0].network,ipv4('192.168.1.0'));
 for(const bad of ['256.0.0.1','01.2.3.4','1.2.3',' 1.2.3.4','1.2.3.4.5','-1.2.3.4','1.2.3.4/8'])assert.equal(scan(all,bad),'DENY');assert.equal(scan([],'1.2.3.4'),'DENY');
 for(const cidr of ['1.2.3.4/33','1.2.3.4/08','1.2.3.4/','1.2.3/8'])assert.throws(()=>compileRules([{action:'ALLOW',cidr}]));assert.throws(()=>compileRules([{action:'PERMIT',cidr:'1.2.3.4'}]));
});
test('batch-07 firewall: priority trie agrees with ordered scan',()=>{
 const sets=[[{action:'DENY',cidr:'10.0.0.0/8'},{action:'ALLOW',cidr:'10.1.2.3/32'}],[{action:'ALLOW',cidr:'10.1.2.3/32'},{action:'DENY',cidr:'10.0.0.0/8'}],[{action:'ALLOW',cidr:'0.0.0.0/0'},{action:'DENY',cidr:'255.255.255.255/32'}],[{action:'DENY',cidr:'10.0.0.0/8'},{action:'ALLOW',cidr:'10.9.9.9/8'}],[]];
 for(const set of sets){const rules=compileRules(set),root=trie(rules);for(const ip of ['10.1.2.3','10.0.0.1','1.2.3.4','255.255.255.255','0.0.0.0','256.0.0.1','01.2.3.4','1.2.3'])assert.equal(lookup(root,ip),scan(rules,ip));}
 assert.equal(lookup(trie(compileRules(sets[0])),'10.1.2.3'),'DENY');assert.equal(lookup(trie(compileRules(sets[3])),'10.1.2.3'),'DENY');assert.equal(lookup(trie(compileRules(sets[2])),'1.2.3.4'),'ALLOW');
 let seed=47;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};const address=n=>[24,16,8,0].map(s=>(n>>>s)&255).join('.');
 for(let k=0;k<15;k++){const rules=compileRules(Array.from({length:25},(_,i)=>({action:i%2?'ALLOW':'DENY',cidr:address(random())+'/'+(random()%33)}))),root=trie(rules);for(let j=0;j<100;j++){const ip=address(random());assert.equal(lookup(root,ip),scan(rules,ip));}}
});
test('batch-07 firewall: versioned publication and single-snapshot checks',()=>{
 for(const kind of ['scan','trie']){
  const policy=new FirewallPolicy(kind);let raced=false;
  // Another writer publishes after this writer read the prior version and before its CAS.
  const version=policy.replaceRules([{action:'ALLOW',cidr:'10.0.0.0/8'}],()=>{if(!raced){raced=true;assert.equal(policy.replaceRules([{action:'DENY',cidr:'10.0.0.0/8'}]),1);}});
  assert.equal(version,2);assert.deepEqual(policy.check('10.1.2.3'),{decision:'ALLOW',ruleOrdinal:0,reason:'rule',policyVersion:2});
  assert.throws(()=>policy.replaceRules([{action:'ALLOW',cidr:'10.0.0.0/8'},{action:'ALLOW',cidr:'10.0.0.0/33'}]));assert.equal(policy.active.version,2);
  assert.deepEqual(policy.check('1.2.3'),{decision:'DENY',ruleOrdinal:null,reason:'invalid',policyVersion:2});assert.equal(policy.check('11.0.0.1').reason,'unmatched');
  // A publication lands immediately after check's first read of the active value.
  const first=policy.active;policy.replaceRules([{action:'DENY',cidr:'10.0.0.0/8'}]);const second=policy.active;let reads=0;
  Object.defineProperty(policy,'active',{configurable:true,get:()=>reads++===0?first:second});
  const result=policy.check('10.1.2.3');assert.deepEqual([result.decision,result.policyVersion],['ALLOW',2]);
 }
});
const LEXER_CASES=[['a/**/b','a b'],['x// no\r\ny--no\nz','x \r\ny \nz'],['"/* literal */" + \'--literal\'','"/* literal */" + \'--literal\''],['"a\\\"//b"/*x\ny*/z','"a\\\"//b" \nz'],["'it''s /* literal */' --x","'it''s /* literal */'  "],['///*',' '],['a*/b','a*/b']];
const LEXER_ERRORS=['/*/','/*x','"unterminated',"'x\\"];
test('batch-07 lexer stream-dfa: chunk-independent states and token separation',()=>{
 for(const [source,expected]of LEXER_CASES){assert.equal(new StreamingStripper().feed(source).finish(),expected);
  for(let i=0;i<=source.length;i++){const s=new StreamingStripper().feed(source.slice(0,i));assert.ok(expected.startsWith(s.output),'held lookahead '+JSON.stringify([source,i]));assert.equal(s.feed(source.slice(i)).finish(),expected);}
  const stream=new StreamingStripper();for(const c of source)stream.feed(c);assert.equal(stream.finish(),expected);}
 for(const source of LEXER_ERRORS)for(let i=0;i<=source.length;i++)assert.throws(()=>new StreamingStripper().feed(source.slice(0,i)).feed(source.slice(i)).finish(),SyntaxError);
 const done=new StreamingStripper();done.finish();assert.throws(()=>done.feed('x'),/finished/);
});
test('batch-07 lexer span-scanner: buffered spans and atomic result',()=>{
 for(const [source,expected]of LEXER_CASES){const spans=scanSpans(source);let at=0;for(const s of spans){assert.equal(s.start,at);assert.ok(s.end>s.start);at=s.end;}assert.equal(at,source.length);
  for(const s of spans)if(s.kind==='literal')assert.ok(expected.includes(source.slice(s.start,s.end)));
  assert.equal(stripSpans(source),expected);
  for(let i=0;i<=source.length;i++){const b=new BufferedSpanStripper();assert.deepEqual(b.feed(source.slice(0,i)),{buffered:i});b.feed(source.slice(i));assert.equal(b.finish(),expected);}}
 assert.throws(()=>stripSpans('ab /*x'),/unterminated block 3/);assert.throws(()=>stripSpans('x "y'),/unterminated quote 2/);
 for(const source of LEXER_ERRORS)for(let i=0;i<=source.length;i++){const b=new BufferedSpanStripper();b.feed(source.slice(0,i));b.feed(source.slice(i));assert.throws(()=>b.finish(),SyntaxError);}
});
