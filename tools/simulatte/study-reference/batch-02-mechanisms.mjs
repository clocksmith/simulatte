// Bounded mechanism models. No model inference, crawler, remote tool or durable workflow executes here.
export function citationGate(answer,spans,acl,revision,allowedIds){const eligible=spans.filter(s=>s.aclEpoch===acl&&s.revision===revision&&allowedIds.has(s.id));return answer.citations.length>0&&answer.citations.every(id=>eligible.some(s=>s.id===id));}
export function completeDependency(state,id){if(!state.completed.has(id)){state.completed.add(id);state.remaining--;}return state.remaining;}
export function repairBounded(reply,remaining,repair,valid){let attempts=0;while(!valid(reply)&&remaining>0){remaining--;attempts++;reply=repair(reply);}return {state:valid(reply)?'valid':'exhausted',attempts};}
export function upgrade(instance,binding,overrides){if(!binding.compatible)throw Error('incompatible');if(!Number.isInteger(overrides.capacity)||overrides.capacity<1)throw Error('override');return {...structuredClone(instance),bindingId:binding.id,overrides:{...overrides}};}

export const isFresh=(hitRevision,currentRevision)=>hitRevision===currentRevision;
