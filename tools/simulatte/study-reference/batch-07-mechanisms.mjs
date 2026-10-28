// Bounded reference mechanisms. No browser, concurrent runtime or complexity proof.
export class LazyPlan {
 constructor(source,tail=null,owned=false){this.source=owned?source:source.slice();this.tail=tail;}
 map(fn){return new LazyPlan(this.source,{previous:this.tail,kind:'map',fn},true);}
 filter(fn){return new LazyPlan(this.source,{previous:this.tail,kind:'filter',fn},true);}
 open(){const ops=[];for(let c=this.tail;c;c=c.previous)ops.push(c);ops.reverse();let i=0,closed=false;
  return {next:()=>{if(closed)return {done:true};outer:while(i<this.source.length){let value=this.source[i++];for(const op of ops){if(op.kind==='map')value=op.fn(value);else if(!op.fn(value))continue outer;}return {done:false,value};}closed=true;return {done:true};},close:()=>{closed=true;}};
 }
 collect(){const c=this.open(),out=[];for(let n=c.next();!n.done;n=c.next())out.push(n.value);return out;}
 indexOf(target){const c=this.open();let i=0;for(let n=c.next();!n.done;n=c.next()){if(Object.is(n.value,target)){c.close();return i;}i++;}return -1;}
}
// Tiny immutable weighted rope isolates split/concat correctness. It deliberately
// does not implement balancing or establish asymptotic edit costs.
const leaf=text=>({text,count:[...text].length});
export const concat=(a,b)=>!a?b:!b?a:{left:a,right:b,count:a.count+b.count};
export function rope(text,chunk=3){const chars=[...text];let root=null;for(let i=0;i<chars.length;i+=chunk)root=concat(root,leaf(chars.slice(i,i+chunk).join('')));return root;}
export const flatten=n=>!n?'':n.text!==undefined?n.text:flatten(n.left)+flatten(n.right);
export function split(n,i){if(!Number.isInteger(i)||i<0||i>(n?.count||0))throw RangeError('split index');if(!n)return [null,null];if(n.text!==undefined){const c=[...n.text];return [i?leaf(c.slice(0,i).join('')):null,i<c.length?leaf(c.slice(i).join('')):null];}if(i<n.left.count){const [a,b]=split(n.left,i);return [a,concat(b,n.right)];}const [a,b]=split(n.right,i-n.left.count);return [concat(n.left,a),b];}
export function splice(n,i,length,text){if(!Number.isInteger(length)||length<0||i+length>(n?.count||0))throw RangeError('delete range');const [a,t]=split(n,i),[,b]=split(t,length);return concat(concat(a,rope(text)),b);}
export function weights(n){if(!n)return 0;if(n.text!==undefined){if(n.count!==[...n.text].length)throw Error('leaf count');return n.count;}const count=weights(n.left)+weights(n.right);if(n.count!==count)throw Error('subtree count');return count;}
export function ipv4(text){if(typeof text!=='string'||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(text))throw Error('IPv4');const octets=text.split('.').map(Number);if(octets.some(x=>x>255))throw Error('octet');return octets.reduce((v,x)=>(v*256+x)>>>0,0);}
export function compileRules(rules){return rules.map((r,ordinal)=>{if(!['ALLOW','DENY'].includes(r.action))throw Error('action');const parts=r.cidr.split('/');if(parts.length>2)throw Error('cidr');const ip=ipv4(parts[0]);const prefix=parts.length===1?32:Number(parts[1]);if(parts.length===2&&! /^(0|[1-9]\d*)$/.test(parts[1])||!Number.isInteger(prefix)||prefix<0||prefix>32)throw Error('prefix');const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;return {...r,ordinal,prefix,mask,network:(ip&mask)>>>0};});}
export function scan(rules,text){let ip;try{ip=ipv4(text);}catch{return 'DENY';}for(const r of rules)if(((ip&r.mask)>>>0)===r.network)return r.action;return 'DENY';}
export function trie(rules){const root={child:[]};for(const r of rules){let n=root;for(let i=0;i<r.prefix;i++){const bit=(r.network>>>(31-i))&1;n=n.child[bit]??= {child:[]};}if(!n.rule||r.ordinal<n.rule.ordinal)n.rule=r;}return root;}
export function lookup(root,text){let ip;try{ip=ipv4(text);}catch{return 'DENY';}let n=root,best=null;for(let i=0;n&&i<=32;i++){if(n.rule&&(!best||n.rule.ordinal<best.ordinal))best=n.rule;if(i===32)break;n=n.child[(ip>>>(31-i))&1];}return best?.action||'DENY';}
// Full-buffer span scanner for the declared small grammar.
export function stripSpans(source){let i=0,out='';while(i<source.length){const start=i,ch=source[i],pair=source.slice(i,i+2);if(ch==='"'||ch==="'"){const quote=ch;out+=source[i++];let closed=false;while(i<source.length){const c=source[i++];out+=c;if(c==='\\'){if(i<source.length)out+=source[i++];continue;}if(c===quote){if(source[i]===quote){out+=source[i++];continue;}closed=true;break;}}if(!closed)throw SyntaxError('unterminated quote '+start);}else if(pair==='//'||pair==='--'){out+=' ';i+=2;while(i<source.length&&source[i]!=='\n'&&source[i]!=='\r')i++;}else if(pair==='/*'){out+=' ';i+=2;let closed=false;while(i<source.length){if(source.slice(i,i+2)==='*/'){i+=2;closed=true;break;}if(source[i]==='\n'||source[i]==='\r')out+=source[i];i++;}if(!closed)throw SyntaxError('unterminated block '+start);}else out+=source[i++];}return out;}
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
