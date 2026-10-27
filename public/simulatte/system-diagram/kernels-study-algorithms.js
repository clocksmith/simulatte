(function(root,factory){factory(typeof module==='object'&&module.exports?require('./study-runtime.js'):root.SimulatteStudyRuntime);})(globalThis,function(S){
 'use strict';
 const {machine,required,read,put}=S;
 // Implicit treap: subtree sizes index characters; split/merge preserve order.
 const size=n=>n?n.size:0,update=n=>{if(n)n.size=1+size(n.left)+size(n.right);return n;};
 function merge(a,b){if(!a)return b;if(!b)return a;if(a.priority<b.priority){a.right=merge(a.right,b);return update(a);}b.left=merge(a,b.left);return update(b);}
 function split(n,index){if(!n)return [null,null];if(size(n.left)>=index){const [a,b]=split(n.left,index);n.left=b;return [a,update(n)];}const [a,b]=split(n.right,index-size(n.left)-1);n.right=a;return [update(n),b];}
 function priority(index){let x=(index+1)>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);return (x^(x>>>16))>>>0;}
 function tree(k,text){let root=null;for(const ch of text)root=merge(root,{ch,priority:priority(k.next++),size:1,left:null,right:null});return root;}
 function flatten(n){return n?flatten(n.left)+n.ch+flatten(n.right):'';}
 machine('ropeText',()=>({root:null,next:0,visited:0}),function(k,c,p){
  const length=size(k.root);required(Number.isInteger(c.index)&&c.index>=0&&c.index<=length);
  if(c.op==='insert'){required(typeof c.text==='string'&&[...c.text].length+length<=p.maxRecords);const [a,b]=split(k.root,c.index);k.root=merge(merge(a,tree(k,c.text)),b);}
  else if(c.op==='delete'){required(Number.isInteger(c.length)&&c.length>=0&&c.index+c.length<=length);const [a,b]=split(k.root,c.index),[,tail]=split(b,c.length);k.root=merge(a,tail);}
  else if(c.op==='read'){required(c.index<length);let node=k.root,index=c.index;while(node){k.visited++;const left=size(node.left);if(index===left)return {accepted:true,char:node.ch,length};if(index<left)node=node.left;else{index-=left+1;node=node.right;}}}
  else throw Error('Unsupported rope command');
  return {accepted:true,text:flatten(k.root),length:size(k.root)};
 });
 function ipv4(text){const parts=String(text).split('.');required(parts.length===4&&parts.every(p=>/^\d{1,3}$/.test(p)&&Number(p)<=255));return parts.reduce((n,p)=>(n*256+Number(p))>>>0,0);}
 function rule(c,index){const parts=String(c.cidr).split('/'),bits=Number(parts[1]);required(parts.length===2&&Number.isInteger(bits)&&bits>=0&&bits<=32&&['allow','deny'].includes(c.action));const mask=bits===0?0:(0xffffffff<<(32-bits))>>>0;return {network:(ipv4(parts[0])&mask)>>>0,mask,bits,action:c.action,index};}
 machine('prefixRules',()=>({rules:[],trie:{},lookups:0,comparisons:0}),function(k,c,p){
  if(c.op==='rule'){if(k.rules.length>=p.maxRecords)return {accepted:false,reason:'rule capacity'};const r=rule(c,k.rules.length);k.rules.push(r);let n=k.trie;for(let bit=31;bit>=32-r.bits;bit--){const b=(r.network>>>bit)&1;n[b]??={};n=n[b];}n.rule??=r;return {accepted:true,rules:k.rules.length};}
  required(c.op==='check');const ip=ipv4(c.ip);let chosen=null;k.lookups++;
  if(p.useTrie){let n=k.trie;for(let bit=31;bit>=-1&&n;bit--){k.comparisons++;if(n.rule&&(!chosen||n.rule.index<chosen.index))chosen=n.rule;if(bit>=0)n=n[(ip>>>bit)&1];}}
  else for(const r of k.rules){k.comparisons++;if(((ip&r.mask)>>>0)===r.network){chosen=r;break;}}
  return {accepted:true,action:chosen?.action||'deny',ruleIndex:chosen?.index??null,comparisons:k.comparisons};
 });
 // Lexer retains quote/escape state and line breaks while discarding comments.
 function strip(text,sql,quoted){let out='',state='code',quote='';for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];
  if(state==='line'){if(ch==='\n'){out+='\n';state='code';}continue;}
  if(state==='block'){if(ch==='*'&&next==='/'){state='code';i++;}else if(ch==='\n')out+='\n';continue;}
  if(state==='quote'){out+=ch;if(ch==='\\'&&next!==undefined){out+=next;i++;}else if(ch===quote){if(sql&&next===quote){out+=next;i++;}else state='code';}continue;}
  if(quoted&&(ch==='"'||ch==="'"||(!sql&&ch==='`'))){state='quote';quote=ch;out+=ch;}
  else if((!sql&&ch==='/'&&next==='/')||(sql&&ch==='-'&&next==='-')){state='line';i++;}
  else if(ch==='/'&&next==='*'){state='block';i++;}else out+=ch;
 }return {text:out,unterminated:state==='block'||state==='quote'};}
 machine('commentLexer',()=>({processed:0,characters:0}),function(k,c,p){required(c.op==='strip'&&typeof c.text==='string'&&c.text.length<=p.maxRecords);k.processed++;k.characters+=c.text.length;return {accepted:true,...strip(c.text,p.sql,p.respectQuotes)};});
 machine('taskDag',()=>({tasks:{},completed:[],failed:0,retries:0}),function(k,c,p){
  if(c.op==='submit'){required(typeof c.id==='string'&&Array.isArray(c.deps)&&c.deps.every(id=>Object.hasOwn(k.tasks,id)));if(Object.hasOwn(k.tasks,c.id))return {accepted:true,duplicate:true};if(Object.keys(k.tasks).length>=p.maxRecords)return {accepted:false,reason:'task capacity'};put(k.tasks,c.id,{id:c.id,deps:c.deps,state:'pending',attempts:0});}
  else if(c.op==='claim'){const ready=Object.values(k.tasks).filter(row=>row.state==='pending'&&row.deps.every(id=>k.tasks[id].state==='done'));const row=ready[0];if(row){row.state='running';row.attempts++;return {accepted:true,task:row.id};}return {accepted:false,reason:'no ready task'};}
  else if(c.op==='complete'){const row=read(k.tasks,c.id);required(row&&row.state==='running');row.state='done';k.completed.push(row.id);}
  else if(c.op==='fail'){const row=read(k.tasks,c.id);required(row&&row.state==='running');row.state=p.retryTasks&&row.attempts<p.maxAttempts?'pending':'failed';k.failed++;if(row.state==='pending')k.retries++;}
  else throw Error('Unsupported scheduler command');
  return {accepted:true,completed:[...k.completed],ready:Object.values(k.tasks).filter(row=>row.state==='pending'&&row.deps.every(id=>k.tasks[id].state==='done')).map(row=>row.id)};
 });
 machine('tenantSlots',()=>({leases:{},byTenant:{},rejected:0}),function(k,c,p){required(typeof c.id==='string'&&c.id.length>0&&typeof c.tenant==='string'&&c.tenant.length>0);
  if(c.op==='release'){const old=read(k.leases,c.id);if(old&&old!==c.tenant)return {accepted:false,reason:'lease owner'};if(old){k.byTenant[old]--;if(k.byTenant[old]===0)delete k.byTenant[old];delete k.leases[c.id];}return {accepted:true,active:Object.keys(k.leases).length};}
  required(c.op==='acquire');if(read(k.leases,c.id))return {accepted:read(k.leases,c.id)===c.tenant,duplicate:true};
  if(Object.keys(k.leases).length>=Math.min(p.capacity,p.maxRecords)||(p.enforceQuota&&(read(k.byTenant,c.tenant)||0)>=p.tenantLimit)){k.rejected++;return {accepted:false,reason:'quota'};}
  put(k.leases,c.id,c.tenant);put(k.byTenant,c.tenant,(read(k.byTenant,c.tenant)||0)+1);return {accepted:true,active:Object.keys(k.leases).length};
 });
});
