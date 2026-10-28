'use strict';
// Stage-specific teaching prose where a publication or shutdown boundary needs a concrete account.
const immutableArray='Build and validate the replacement rule array before exposing it to readers. Publish the array and its version together with one atomic reference swap. Each reader captures that pair once and uses it for the entire scan, so an update cannot mix old rules with a new version label. Keep the previous array alive until its readers finish. This is [immutable publication](https://en.wikipedia.org/wiki/Read-copy-update).';
const overrides={
 'L038/ordered-scan/ordered-scan-s8':immutableArray,
 'L040/ring-monitor/ring-monitor-s8':'Closing the queue means no new items may enter; it does not mean discarding items already accepted. Set the closed flag under the same mutex that protects the queue, then wake both producers and consumers. Each awakened thread rechecks its condition: producers fail, while consumers drain remaining items before reporting closed-and-empty. [Condition variables](https://en.wikipedia.org/wiki/Condition_variable) make those waiting threads sleep without continuously polling.',
 'L001/dedicated/dedicated-s1':'Start with a tenant application and one database-service boundary. Before choosing machines or storage, define who may issue a query and which tenant owns its data. Derive that tenant identity from authentication rather than trusting a tenant name supplied in a URL. This introduces [access control](https://en.wikipedia.org/wiki/Access_control): every later gateway, pooled connection, and database query must preserve the same isolation boundary.'
};
overrides['L001/shared/shared-s1']=overrides['L001/dedicated/dedicated-s1'];
module.exports={overrides};
