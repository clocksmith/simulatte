// Bounded reference state transitions. No network, provider, database or distributed execution proof.
export class Alerts {
 constructor(){this.matches=new Map();this.digests=new Map();this.consent=new Map();this.checkpoint=0;}
 commitPage(rows,lastCursor,{fail=false}={}){const next=new Map(this.matches);for(const r of rows)next.set(`${r.searchId}/${r.searchVersion}/${r.listingId}`,{...r});if(fail)throw Error('transaction aborted');this.matches=next;this.checkpoint=lastCursor;}
 freeze(recipient,period,ids){const key=recipient+'/'+period;if(!this.digests.has(key))this.digests.set(key,Object.freeze({ids:Object.freeze([...new Set(ids)].sort()),state:'pending'}));return this.digests.get(key);}
 authorize(recipient){return this.consent.get(recipient)!==false;}
 result(recipient,period,outcome){const key=recipient+'/'+period,prior=this.digests.get(key);this.digests.set(key,Object.freeze({...prior,state:!this.authorize(recipient)?'suppressed':outcome}));}
}
export class Billing {
 constructor(){this.commands=new Map();this.invoices=new Map();this.events=new Set();this.cancelEpoch=0;this.version=0;this.access=false;}
 command(owner,actor,id,expected,action){if(owner!==actor)throw Error('forbidden');if(this.commands.has(id))return this.commands.get(id);if(expected!==this.version)throw Error('conflict');this.version++;if(action==='cancel'){this.cancelEpoch++;this.access=false;}const receipt={version:this.version,cancelEpoch:this.cancelEpoch};this.commands.set(id,receipt);return receipt;}
 invoice(sub,period,adjustment='base'){const id=[sub,period,adjustment].join('/');if(!this.invoices.has(id))this.invoices.set(id,{id,attemptKey:id+'/payment-1',cancelEpoch:this.cancelEpoch,state:'open'});return this.invoices.get(id);}
 reconcile(eventId,invoiceId,authoritativeState){if(this.events.has(eventId))return;const invoice=this.invoices.get(invoiceId);if(!invoice)throw Error('unknown invoice');this.events.add(eventId);invoice.state=authoritativeState;if(invoice.cancelEpoch===this.cancelEpoch&&authoritativeState==='paid')this.access=true;}
}
