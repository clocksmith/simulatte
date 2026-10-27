(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./kernel-registry.js'):root.SimulatteSystemDiagramKernels);if(node)module.exports=api;else root.SimulatteStudyRuntime=api;})(globalThis,function(registry){
 'use strict';
 const copy=v=>structuredClone(v),station=Object.freeze({concurrency:'concurrency',queueCapacity:'queueCapacity'});
 function answer(ctx,job,fields){ctx.reply(job,{ok:true,ptype:'json',kb:new TextEncoder().encode(JSON.stringify(fields)).length/1000,fields:{result:copy(fields)}});}
 function machine(id,initialize,apply,options={}){
  registry.register({id,station,init:ctx=>({data:initialize(ctx.p),operations:0,failures:0,restarts:0,history:[]}),
   onRequest(ctx,job){ctx.admit(job,ctx.p.serviceMs);},
   onServed(ctx,job){const command=job.msg.fields?.command;if(!command||typeof command.op!=='string'){ctx.reply(job,{ok:false,err:'invalid'});return;}
    try{const result=apply(ctx.k.data,copy(command),ctx.p,ctx.t);ctx.k.operations++;if(result?.accepted===false)ctx.k.failures++;if(ctx.k.history.length<ctx.p.maxRecords)ctx.k.history.push({atSec:ctx.t,command:copy(command),result:copy(result)});answer(ctx,job,result);}catch(error){ctx.k.failures++;ctx.count('invalid commands');ctx.reply(job,{ok:false,err:'invalid'});}},
   onFault(ctx,fault,on){if(on&&fault.type==='crash'){ctx.k.restarts++;options.restart?.(ctx.k.data,ctx.p);}},
   observe:ctx=>({detail:{Operations:ctx.k.operations,Rejected:ctx.k.failures,Restarts:ctx.k.restarts},records:{commands:copy(ctx.k.history),state:[copy(ctx.k.data)]}})
  });
 }
 const read=(object,key)=>Object.hasOwn(object,key)?object[key]:undefined;
 function put(object,key,value){Object.defineProperty(object,key,{value,writable:true,enumerable:true,configurable:true});return value;}
 function boundedMap(state,key,value,capacity){if(!Object.hasOwn(state,key)&&Object.keys(state).length>=capacity)return false;put(state,key,value);return true;}
 function required(test,message){if(!test)throw Error(message||'Invalid command');}
 return Object.freeze({copy,station,answer,machine,boundedMap,required,read,put});
});
