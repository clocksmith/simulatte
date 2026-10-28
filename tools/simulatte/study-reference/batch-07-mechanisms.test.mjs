import test from 'node:test';
import assert from 'node:assert/strict';
import {LazyPlan,rope,flatten,split,splice,weights,compileRules,scan,trie,lookup,stripSpans,StreamingStripper} from './batch-07-mechanisms.mjs';
test('batch-07 lazy: deferred branching and exact short circuit',()=>{
 let calls=0;const input=[1,2,3,4],base=new LazyPlan(input).map(x=>{calls++;return x*2;});
 const branch=base.filter(x=>x>2);assert.equal(calls,0);input.push(5);
 assert.equal(branch.indexOf(4),0);assert.equal(calls,2);assert.deepEqual(base.collect(),[2,4,6,8]);assert.equal(calls,6);
 const c=branch.open(),d=branch.open();assert.deepEqual(c.next(),d.next());c.close();assert.equal(c.next().done,true);assert.equal(d.next().value,6);
 assert.equal(new LazyPlan([NaN]).indexOf(NaN),0);assert.equal(new LazyPlan([]).indexOf(3),-1);
 let later=0;assert.throws(()=>new LazyPlan([1,2]).map(()=>{throw Error('callback');}).map(()=>later++).collect());assert.equal(later,0);
});
test('batch-07 rope: weighted split and splice match scalar arrays',()=>{
 const source='a😀bcdef',original=rope(source,2),chars=[...source];
 for(let i=0;i<=chars.length;i++){const [a,b]=split(original,i);assert.equal(flatten(a)+flatten(b),source);assert.equal(weights(a),i);assert.equal(weights(b),chars.length-i);
  for(let len=0;len<=chars.length-i;len++){const next=splice(original,i,len,'Ω🚀');assert.equal(flatten(next),chars.slice(0,i).join('')+'Ω🚀'+chars.slice(i+len).join(''));weights(next);}}
 assert.equal(flatten(original),source);assert.throws(()=>split(original,-1),RangeError);assert.throws(()=>splice(original,2,20,''),RangeError);
});
test('batch-07 firewall: priority trie agrees with ordered scan',()=>{
 const sets=[[{action:'DENY',cidr:'10.0.0.0/8'},{action:'ALLOW',cidr:'10.1.2.3/32'}],[{action:'ALLOW',cidr:'10.1.2.3/32'},{action:'DENY',cidr:'10.0.0.0/8'}],[{action:'ALLOW',cidr:'0.0.0.0/0'},{action:'DENY',cidr:'255.255.255.255/32'}],[]];
 for(const set of sets){const rules=compileRules(set),root=trie(rules);for(const ip of ['10.1.2.3','10.0.0.1','1.2.3.4','255.255.255.255','0.0.0.0','256.0.0.1','01.2.3.4','1.2.3'])assert.equal(lookup(root,ip),scan(rules,ip));}
 assert.equal(scan(compileRules(sets[0]),'10.1.2.3'),'DENY');assert.equal(scan(compileRules(sets[1]),'10.1.2.3'),'ALLOW');
 let seed=47;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};const address=n=>[24,16,8,0].map(s=>(n>>>s)&255).join('.');
 for(let k=0;k<15;k++){const rules=compileRules(Array.from({length:25},(_,i)=>({action:i%2?'ALLOW':'DENY',cidr:address(random())+'/'+(random()%33)}))),root=trie(rules);for(let j=0;j<100;j++){const ip=address(random());assert.equal(lookup(root,ip),scan(rules,ip));}}
 assert.throws(()=>compileRules([{action:'ALLOW',cidr:'1.2.3.4/33'}]));
});
test('batch-07 lexer: delimiters quotes chunks and token separation',()=>{
 const cases=[['a/**/b','a b'],['x// no\r\ny--no\nz','x \r\ny \nz'],['"/* literal */" + \'--literal\'','"/* literal */" + \'--literal\''],['"a\\\"//b"/*x\ny*/z','"a\\\"//b" \nz'],["'it''s /* literal */' --x","'it''s /* literal */'  "],['///*',' '],['a*/b','a*/b']];
 for(const [source,expected]of cases){assert.equal(stripSpans(source),expected);for(let i=0;i<=source.length;i++){assert.equal(new StreamingStripper().feed(source.slice(0,i)).feed(source.slice(i)).finish(),expected);}const stream=new StreamingStripper();for(const c of source)stream.feed(c);assert.equal(stream.finish(),expected);}
 for(const source of ['/*/','/*x','"unterminated',"'x\\"]){assert.throws(()=>stripSpans(source),SyntaxError);for(let i=0;i<=source.length;i++)assert.throws(()=>new StreamingStripper().feed(source.slice(0,i)).feed(source.slice(i)).finish(),SyntaxError);}
});
