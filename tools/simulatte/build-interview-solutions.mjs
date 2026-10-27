// Owner: public/simulatte/system-diagram/CATSCAN.md. Generates authored synthetic solution graphs.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url), root = fileURLToPath(new URL('../../',import.meta.url));
const base = path.join(root,'public/data/system-diagram');
const D = require('../../public/simulatte/system-diagram/diagram.js');
const config = JSON.parse(fs.readFileSync(path.join(base,'config.json')));
const library = require('../../public/simulatte/system-diagram/class-library.js').loadSync(base);
const check = process.argv.includes('--check'), changed=[];
const write=(name,data)=>{const file=path.join(base,name),text=JSON.stringify(data,null,2)+'\n';if(check){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text)changed.push(name);}else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}};
const node=(id,classId,x,y,params={},label=id)=>({id,classId,label,x,y,params});
const edge=(id,from,port,to,toPort='in',label=id,params={})=>({id,label,from:{nodeId:from,portId:port},to:{nodeId:to,portId:toPort},params:{latencyMs:80,bandwidthMbps:100,...params}});
const client=(id,operation,x,y,params={})=>node(id,'operation-client',x,y,{operation,count:8,intervalMs:400,...params},id.replaceAll('-',' '));
const doc=(id,name,nodes,edges,description)=>({schema:D.SCHEMA,id,name,description,seed:42,run:{horizonSec:20},classes:[],nodes,edges,groups:[],notes:[],faults:[],view:{x:0,y:0,zoom:1}});
const subset=(d,ids)=>({...structuredClone(d),nodes:d.nodes.filter(n=>ids.includes(n.id)),edges:d.edges.filter(e=>ids.includes(e.from.nodeId)&&ids.includes(e.to.nodeId)),groups:d.groups.filter(g=>d.nodes.some(n=>n.groupId===g.id&&ids.includes(n.id))),notes:[],faults:d.faults.filter(f=>f.target.kind==='node'?ids.includes(f.target.id):d.edges.some(e=>e.id===f.target.id&&ids.includes(e.from.nodeId)&&ids.includes(e.to.nodeId)))});
const solutions={};
function add(d,steps,boundary,capture=[]){
  const stages=steps.map(([name,explanation,graph])=>({name,explanation,graph:structuredClone(graph)}));
  if(capture.length){const last=stages.at(-1);let graph=last.graph;for(const [id,label,ids] of capture){graph=D.subsystems.capture(graph,ids,{id,label},library,config).diagram;}last.graph=graph;d=graph;}
  stages.at(-1).graph.name=d.name;
  write(`examples/${d.id}.json`,D.validate(d,library,config));
  solutions[d.id]={id:d.id,title:d.name,boundary,steps:stages.map((s,i)=>{const file=`solutions/${d.id}/step-${i+1}.json`;write(file,D.validate(s.graph,library,config));return {name:s.name,explanation:s.explanation,diagramPath:`/data/system-diagram/${file}`};})};
}
{
 const d=doc('reddit-comments','Threaded comments and voting',[
 client('comments','comment',0,0,{duplicateEvery:3}),node('api','web-server',240,100,{serviceMs:30},'Comment API'),node('comments-store','comment-tree',480,100),client('votes','vote',0,230,{startSec:4,count:16,actorSpace:4,keySpace:8}),client('readers','readComments',0,460,{startSec:5,count:4}),node('updates','worker',730,100,{serviceMs:50},'Live update delivery')
 ],[edge('post','comments','out','api'),edge('vote','votes','out','api'),edge('read','readers','out','api'),edge('store','api','calls','comments-store'),edge('notify','comments-store','updates','updates')], 'Parent-linked comments, per-user votes and score-ranked reads.');
 add(d,[['Save replies','Each reply names its parent. Repeating a comment does not create another copy.',subset(d,['comments','api','comments-store'])],['Count votes','A user has one vote per comment. Repeating the same vote leaves the score unchanged.',subset(d,['comments','votes','api','comments-store','updates'])],['Read and deliver','Readers receive score-ranked comments with parent links. The saved backend can be opened to inspect its internals.',d]],'Synthetic bounded comment tree and score ordering; no Reddit production ranking or actual WebSocket connection.',[['comment-backend','Comment backend',['api','comments-store','updates']]]);
}
{
 const d=doc('meta-stories','Ephemeral stories',[
 client('uploads','publishStory',0,0,{count:3,actorSpace:1}),node('processing','worker',240,0,{serviceMs:100},'Media processing'),node('stories','story-store',480,0,{ttlSec:6,audienceSize:2},'Story visibility'),client('viewers','readStory',0,240,{startSec:2,count:8,keySpace:3,actorSpace:4}),client('late-viewers','readStory',0,460,{startSec:10,count:3,keySpace:3}),node('updates','worker',730,0,{serviceMs:30},'Audience updates')
 ],[edge('upload','uploads','out','processing'),edge('publish','processing','calls','stories'),edge('view','viewers','out','stories'),edge('late-view','late-viewers','out','stories'),edge('story-updates','stories','updates','updates')], 'Synthetic audience checks and expiration of story visibility.');
 add(d,[['Publish media','Process an upload, then create its visibility record and expiration time.',subset(d,['uploads','processing','stories'])],['Check the audience','Allowed viewers can read the story. A viewer outside its audience is rejected.',subset(d,['uploads','processing','stories','viewers','updates'])],['Expire visibility','The timer removes the visible record and sends an update. Late reads fail even if an old client still holds its ID.',d]],'Six simulated seconds stand in for the product lifetime. Models metadata visibility and view state; processing is a service-time model, not codecs, physical media erasure or a production privacy graph.',[['story-publishing','Story publishing',['processing','stories','updates']]]);
}
{
 const d=doc('amazon-flash-sale','Flash sale reservations',[
 client('shoppers','reserve',0,0,{count:8,keySpace:1,duplicateEvery:2}),node('inventory','inventory-reservations',350,130,{stock:4,ttlSec:5},'Inventory authority'),client('payments','pay',0,250,{startSec:3,count:2,keySpace:1,duplicateEvery:1}),client('new-shoppers','reserve',0,500,{startSec:10,count:4,keySpace:1,actorOffset:20}),node('updates','worker',650,130,{serviceMs:30},'Receipt and release events')
 ],[edge('reserve','shoppers','out','inventory'),edge('pay','payments','out','inventory'),edge('reuse-stock','new-shoppers','out','inventory'),edge('receipts','inventory','updates','updates')], 'Bounded stock, idempotent payment and reservation expiration.');
 add(d,[['Reserve stock','One authority checks available stock and creates a hold. Extra shoppers are rejected instead of overselling.',subset(d,['shoppers','inventory'])],['Confirm once','A payment confirms an existing hold. Duplicate payment callbacks do not sell another item.',subset(d,['shoppers','payments','inventory','updates'])],['Return abandoned holds','Unpaid holds expire and return stock. New shoppers can reserve the recovered stock.',d]],'One synthetic stock authority; no real payments, distributed transaction consensus or multi-region locking.',[['checkout-authority','Checkout authority',['inventory','updates']]]);
}
{
 const d=doc('microsoft-presence','Presence and subscriptions',[
 client('heartbeats','heartbeat',0,0,{count:8,keySpace:2,actorSpace:2,startSec:1}),node('broker','presence-broker',350,200,{ttlSec:4}),client('subscriptions','subscribe',0,220,{count:4,keySpace:2,actorSpace:4,intervalMs:100}),node('notifications','worker',650,200,{serviceMs:50},'Subscriber delivery'),client('sync','readPresence',0,440,{startSec:2,count:12,intervalMs:1000})
 ],[edge('heartbeat','heartbeats','out','broker'),edge('subscribe','subscriptions','out','broker'),edge('notify','broker','updates','notifications'),edge('bulk-sync','sync','out','broker')], 'Heartbeat leases, subscribed status changes and bulk snapshots.');
 add(d,[['Track heartbeats','Each heartbeat renews a user lease. An old timeout cannot override a newer heartbeat.',subset(d,['heartbeats','broker'])],['Notify subscribers','Subscriptions name the user being watched. Changes produce delivery requests only for those subscriptions.',subset(d,['heartbeats','broker','subscriptions','notifications'])],['Catch up and go offline','A returning client reads the full snapshot. When heartbeats stop, lease expiry changes active users to offline.',d]],'Bounded single-tenant presence and delivery model; no Microsoft production topology or real client connections.',[['presence-service','Presence service',['broker','notifications']]]);
}
{
 const d=JSON.parse(fs.readFileSync(path.join(base,'examples/crawler-pipeline.json')));d.id='google-crawler';d.name='Distributed crawler';d.notes=[];d.nodes=d.nodes.filter(n=>n.id!=='schedule');d.edges=d.edges.filter(e=>e.from.nodeId!=='schedule');
 add(d,[['Respect each host','The frontier limits concurrent fetches and waits between requests to the same synthetic domain.',subset(d,['crawler','website'])],['Extract records','Fetched pages go through processing and structured validation before reaching the record store.',subset(d,['crawler','website','parser','validator','records'])],['Retain documents','Keep both derived records and source bytes. Duplicate discovery reduces new frontier work.',d]],'Synthetic domain counters and duplicate probability; no network scraping, robots.txt parser, DNS cache, real URL fingerprints or production index.',[['crawl-processing','Crawl processing',['parser','validator','records','archive']]]);
}
{
 const d=JSON.parse(fs.readFileSync(path.join(base,'examples/social-feed.json')));d.id='twitter-timeline';d.name='Social timeline fanout';d.notes=[];d.faults=[];
 const first=structuredClone(d);first.nodes.find(n=>n.id==='posts').params.fanoutMode='push';
 const hybrid=structuredClone(d);hybrid.nodes.find(n=>n.id==='posts').params.fanoutMode='hybrid';
 d.nodes.find(n=>n.id==='posts').params.fanoutMode='hybrid';
 d.faults=[{id:'delivery-outage',atSec:0,untilSec:1.8,target:{kind:'node',id:'fanout'},type:'crash',params:{}}];
 add(d,[['Publish and fan out','Store each post, look up its real followers, and queue one delivery path for their timelines.',first],['Handle large audiences','Switch to hybrid fanout: large audiences read from the post store while smaller audiences receive timeline writes.',hybrid],['Recover delivery','Pause the fanout worker, then watch leased work retry. Recipient/post identity prevents duplicate timeline entries.',d]],'Finite users and explicit follow relationships, bounded timeline retention and synthetic reads. No X production ranking or real WebSocket delivery.');
}
{
 const d=JSON.parse(fs.readFileSync(path.join(base,'examples/video-distribution.json')));d.id='netflix-streaming';d.name='Video delivery and adaptation';d.notes=[];d.faults=[];d.run.horizonSec=30;
 for(const n of d.nodes){if(n.classId==='video-viewers')Object.assign(n.params,{viewers:8,cohorts:2,segments:6,segmentKiB:64,lowSegmentKiB:16,segmentDurationSec:1,adaptiveBitrate:true,peerAssistance:false,timeoutMs:10000,startSpreadSec:.5});if(n.classId==='video-origin')Object.assign(n.params,{segments:6,segmentKiB:64,lowSegmentKiB:16});if(n.classId==='video-manifest')Object.assign(n.params,{segments:6,segmentKiB:64,lowSegmentKiB:16,segmentDurationSec:1});}
 const regional=structuredClone(d);regional.nodes=regional.nodes.filter(n=>!['viewers-east','quota-east','cdn-east','peer-breaker-east','peers-east','peer-breaker','peers'].includes(n.id));regional.edges=regional.edges.filter(e=>regional.nodes.some(n=>n.id===e.from.nodeId)&&regional.nodes.some(n=>n.id===e.to.nodeId));regional.groups=[];for(const n of regional.nodes)delete n.groupId;
 const adaptive=structuredClone(d);adaptive.faults=[{id:'slow-region',atSec:1,untilSec:15,target:{kind:'edge',id:'cdn-region-east'},type:'degrade',params:{lossRate:0,addLatencyMs:200}}];
 // Use the actual regional request link, not a guessed edge identity.
 adaptive.faults[0].target.id=adaptive.edges.find(e=>e.from.nodeId==='viewers-east'&&e.from.portId==='cdn').id;adaptive.edges.find(e=>e.id===adaptive.faults[0].target.id).params.bandwidthMbps=.8;
 add(adaptive,[['Read a manifest','Players read the asset manifest before asking a regional cache for numbered video segments.',regional],['Share cached segments','Two regions share an origin shield. A cached segment avoids another origin download.',d],['Adapt to a slow network','A slow transfer makes the next request choose the smaller advertised rendition. The model records bitrate switches and playback stalls.',adaptive]],'Synthetic segmented delivery with two advertised rendition sizes and a transfer-time adaptation rule; manifests stand in for pre-encoded assets. No actual encoding, DRM, codecs or Netflix production implementation.');
}
write('interview-solutions.json',{schema:'simulatte.interviewSolutions.v1',version:'1.0.0',solutions});
if(changed.length)throw Error(`Regenerate solution data: ${changed.join(', ')}`);
console.log(`${check?'Checked':'Wrote'} ${Object.keys(solutions).length} authored solutions and their staged graphs`);
