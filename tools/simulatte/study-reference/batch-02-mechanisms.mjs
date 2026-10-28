// Bounded mechanism models. No model inference, crawler, remote tool or durable workflow executes here.
export function citationGate(answer,spans,current){
 const eligible=spans.filter(s=>s.tenantId===current.tenantId&&s.aclEpoch===current.aclEpoch&&s.revision===current.revision&&current.allowedIds.has(s.id));
 return answer.citations.length>0&&answer.citations.every(id=>eligible.some(s=>s.id===id));
}
export function completeDependency(state,completion){
 const task=state.tasks[completion.predecessorId];
 if(!task||completion.epoch!==task.epoch)return {status:'stale',remaining:state.remaining};
 const prior=state.completed.get(completion.predecessorId);
 if(prior!==undefined)return {status:prior===completion.outputHash?'duplicate':'conflict',remaining:state.remaining};
 state.completed.set(completion.predecessorId,completion.outputHash);
 state.remaining--;
 return {status:'applied',remaining:state.remaining};
}
export function reconcileEffect(intent,lookup){
 if(lookup?.status==='accepted')return {action:'record',effectKey:intent.effectKey,receipt:lookup.receipt};
 if(lookup?.status==='rejected')return lookup.retryable?{action:'retry',effectKey:intent.effectKey}:{action:'fail',effectKey:intent.effectKey};
 return {action:'hold-uncertain',effectKey:intent.effectKey};
}
export function repairBounded(reply,remaining,repair,valid){let attempts=0;while(!valid(reply)&&remaining>0){remaining--;attempts++;reply=repair(reply);}return {state:valid(reply)?'valid':'exhausted',attempts};}
export const isFresh=(hitRevision,currentRevision)=>hitRevision===currentRevision;
export function consumeRepair(budgets,intentId,expectedVersion,jobId){
 const budget=budgets.get(intentId);
 if(!budget)return {state:'unknown-intent'};
 if(budget.jobs.has(jobId))return {state:'duplicate',remaining:budget.remaining,version:budget.version};
 if(budget.remaining===0)return {state:'exhausted',remaining:0,version:budget.version};
 if(budget.version!==expectedVersion)return {state:'conflict',remaining:budget.remaining,version:budget.version};
 const next={remaining:budget.remaining-1,version:budget.version+1,jobs:new Set([...budget.jobs,jobId])};
 budgets.set(intentId,next);
 return {state:'queued',remaining:next.remaining,version:next.version};
}
export function upgrade(state,request){
 if(request.expectedVersion!==state.version)throw Error('stale version');
 const binding=state.bindings[request.bindingId];
 if(!binding?.compatible)throw Error('incompatible binding');
 const instance=state.instances[request.instanceId];
 if(!instance)throw Error('unknown instance');
 const capacity=request.overrides.capacity;
 if(!Number.isInteger(capacity)||capacity<1)throw Error('invalid override');
 return {...state,version:state.version+1,instances:{...state.instances,[request.instanceId]:{bindingId:binding.id,overrides:{...instance.overrides,...request.overrides}}}};
}
export function admitGeneration(ledger,generationKey){
 const prior=ledger.get(generationKey);
 if(prior)return {status:'duplicate',attempt:prior.attempt};
 const attempt=ledger.size+1;
 ledger.set(generationKey,{attempt});
 return {status:'accepted',attempt};
}
export function reconcileGeneration(intent,lookup){
 if(lookup?.status==='accepted'||lookup?.status==='completed')return {action:'record',generationKey:intent.generationKey};
 if(lookup?.status==='absent')return {action:'resend',generationKey:intent.generationKey};
 return {action:'hold',generationKey:intent.generationKey};
}
