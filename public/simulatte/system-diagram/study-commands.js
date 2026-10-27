(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SimulatteStudyCommands=api;})(globalThis,function(){
 'use strict';
 // Inputs only. Expected results belong to independent tests and authored observations.
 const programs={
  search:[{op:'query',key:'da',sequence:1,delayMs:180},{op:'query',key:'data',sequence:2,delayMs:10},{op:'query',key:'data',sequence:3,delayMs:10}],
  grid:[{op:'page',offset:0,limit:3},{op:'insertFirst',value:99},{op:'page',offset:3,limit:3,snapshot:'snapshot-1'},{op:'append',value:8},{op:'page',offset:6,limit:3,snapshot:'snapshot-1'}],
  notebook:[{op:'read'},{op:'edit',id:'a',version:0,text:'first cell'},{op:'edit',id:'b',version:0,text:'stale cell'},{op:'edit',id:'b-retry',version:1,text:'merged cell'},{op:'edit',id:'b-retry',version:1,text:'merged cell'},{op:'read'}],
  chunks:[{op:'read',offset:0,length:6},{op:'read',offset:2,length:8},{op:'read',offset:0,length:6},{op:'read',offset:16,length:12},{op:'read',offset:0,length:3}],
  lazy:[{op:'map',value:2},{op:'filter',value:6},{op:'find',value:8},{op:'collect'},{op:'reset'},{op:'map',value:3},{op:'collect'}],
  rope:[{op:'insert',index:0,text:'hello world'},{op:'insert',index:5,text:' brave'},{op:'read',index:6},{op:'delete',index:5,length:6},{op:'read',index:10},{op:'insert',index:11,text:'!'}],
  firewall:[{op:'rule',cidr:'192.168.1.0/24',action:'allow'},{op:'rule',cidr:'0.0.0.0/0',action:'deny'},{op:'check',ip:'192.168.1.42'},{op:'check',ip:'192.168.2.42'},{op:'check',ip:'8.8.8.8'}],
  lexer:[{op:'strip',text:'const s = "/* literal */"; // remove\nreturn s;'},{op:'strip',text:'a/* two\nlines */+b'},{op:'strip',text:'"escaped \\" quote" // suffix\n'},{op:'strip',text:"SELECT '--literal'; -- remove\nSELECT 1;"}],
  queue:[{op:'put',value:1,id:'one'},{op:'put',value:2,id:'two'},{op:'put',value:3,id:'three'},{op:'take'},{op:'take'},{op:'take'},{op:'take',id:'waiting'},{op:'put',value:4,id:'four'},{op:'close'},{op:'take'}],
  rate:[{op:'hit',key:'alice'},{op:'hit',key:'alice'},{op:'hit',key:'alice'},{op:'hit',key:'bob'},{op:'hit',key:'alice'},{op:'hit',key:'bob'},{op:'hit',key:'alice'}],
  cache:[{op:'put',key:'a',value:1},{op:'put',key:'b',value:2},{op:'get',key:'a'},{op:'put',key:'c',value:3},{op:'get',key:'b'},{op:'get',key:'a'},{op:'get',key:'c'}],
  wal:[{op:'write',id:'a',key:'a',value:1},{op:'write',id:'a',key:'a',value:1},{op:'checkpoint'},{op:'write',id:'b',key:'b',value:2},{op:'restart'},{op:'read',key:'a'},{op:'read',key:'b'},{op:'flush'}],
  transactions:[{op:'read'},{op:'commit',id:'a',key:'a',value:1,version:0},{op:'commit',id:'b',key:'b',value:2,version:0},{op:'commit',id:'b-retry',key:'b',value:2,version:1},{op:'commit',id:'b-retry',key:'b',value:2,version:1},{op:'read'}],
  scheduler:[{op:'submit',id:'map',deps:[]},{op:'submit',id:'reduce',deps:['map']},{op:'claim'},{op:'fail',id:'map'},{op:'claim'},{op:'complete',id:'map'},{op:'claim'},{op:'complete',id:'reduce'}],
  quotas:[{op:'acquire',id:'a1',tenant:'a'},{op:'acquire',id:'a2',tenant:'a'},{op:'acquire',id:'a3',tenant:'a'},{op:'acquire',id:'b1',tenant:'b'},{op:'release',id:'a1',tenant:'a'},{op:'acquire',id:'a4',tenant:'a'},{op:'release',id:'b1',tenant:'b'}]
 };
 return Object.freeze({names:Object.freeze(Object.keys(programs)),commands(name,variant=0){if(!programs[name])throw Error('Unknown command workload');let rows=structuredClone(programs[name]);if(variant===1){const extra={
 search:[{op:'query',key:'missing',sequence:4,delayMs:1}],grid:[{op:'page',offset:8,limit:3,snapshot:'snapshot-1'}],
 notebook:[{op:'edit',id:'b-retry',version:2,text:'conflicting retry'}],chunks:[{op:'read',offset:62,length:0},{op:'read',offset:61,length:2}],
 lazy:[{op:'reset'},{op:'filter',value:100},{op:'collect'}],rope:[{op:'insert',index:0,text:'\u{1f600}'},{op:'read',index:0},{op:'delete',index:0,length:1}],
 firewall:[{op:'rule',cidr:'10.0.0.0/33',action:'allow'},{op:'check',ip:'192.168.1.255'}],lexer:[{op:'strip',text:'a/* unfinished'}],
 queue:[{op:'take',id:'wait'},{op:'cancel',id:'wait'},{op:'put',id:'x',value:9},{op:'take'},{op:'close'}],rate:[{op:'hit',key:'charlie'},{op:'hit',key:'dana'}],
 cache:[{op:'put',key:'c',value:30},{op:'get',key:'c'}],wal:[{op:'write',id:'a',key:'a',value:999},{op:'read',key:'a'}],
 transactions:[{op:'commit',id:'a',key:'a',value:999,version:2},{op:'read'}],scheduler:[{op:'submit',id:'invalid',deps:['unknown']}],
 quotas:[{op:'release',id:'a2',tenant:'intruder'},{op:'acquire',id:'a2',tenant:'intruder'}]};rows=name==='queue'?extra.queue:[...rows,...(extra[name]||[])];}
 if(variant===2)rows=[...rows,...structuredClone(rows),...structuredClone(rows)];return rows;}});
});
