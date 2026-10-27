import './compiler.js';

// Optional Layer 3/4 UI; it never starts a provider client or provisions resources.
export function create({host,getDiagram,getSelection,getDependencies,getIsPrivate,onMessage=()=>{}}){
 const doc=host.ownerDocument,compiler=globalThis.SimulatteLucydDeploymentCompiler,ui=globalThis.SimulatteWorldUI;
 if(!compiler||!ui||typeof getDependencies!=='function')throw Error('Deployment requires Lucyd validation and World UI');
 const dialog=doc.createElement('dialog');dialog.className='wui-sheet lucyd-deployment';dialog.setAttribute('aria-label','Implementation and deployment');
 const stylesheet=doc.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('./panel.css',import.meta.url).href;doc.head.append(stylesheet);
 const heading=doc.createElement('div');heading.className='panel-heading';const title=doc.createElement('h2');title.textContent='Implementation and deployment';
 const status=doc.createElement('p');status.setAttribute('role','status');status.dataset.deploymentStatus='true';
 const summary=doc.createElement('p');summary.textContent='Bind a supported architecture to real implementations. Export only; cloud resources are not created.';
 const bindings=doc.createElement('pre');bindings.className='lucyd-deployment-bindings';
 const details=doc.createElement('details'),caption=doc.createElement('summary');caption.textContent='Deployment configuration';
 const label=doc.createElement('label');label.textContent='Image digests, secret references and explicit resources';label.htmlFor='lucyd-deployment-configuration';
 const configuration=doc.createElement('textarea');configuration.id=label.htmlFor;configuration.className='wui-field';configuration.rows=14;configuration.spellcheck=false;configuration.setAttribute('autocomplete','off');
 const note=doc.createElement('p');note.textContent='Keep passwords and keys out of this configuration. Resources are explicit settings, not estimates from simulation.';
 details.append(caption,label,configuration,note);
 const actions=doc.createElement('div');actions.className='lucyd-deployment-actions';
 let epoch=0,disposed=false,registry=null,template=null,loading=null;
 const isPrivate=()=>Boolean(getIsPrivate?.()||doc.body.dataset.privateDocument==='true');
 function guard(){if(disposed)throw Error('Deployment panel is closed');if(isPrivate()){clear();status.textContent='Private designs require encrypted export. Plaintext deployment export is unavailable.';throw Error(status.textContent);}}
 function clear(){epoch++;loading?.abort();loading=null;configuration.value='';bindings.textContent='';registry=null;template=null;}
 function close(){clear();dialog.close();}
 function button(text,action){return ui.SimButton({document:doc,label:text,onAction:async()=>{try{await action();}catch(error){status.textContent=error.message;onMessage(error.message);}},onError:error=>{status.textContent=error.message;}}).element;}
 const closeButton=button('Close',close);heading.append(title,closeButton);
 async function inspect(){guard();const plan=compiler.inspect({diagram:getDiagram(),...getDependencies(),registry});bindings.textContent=plan.nodes.map(n=>`${n.bindingKey}: ${n.implementations.join(' / ')||'unsupported'}`).join('\n');status.textContent=plan.supported?'Supported inventory pilot. Choose image digests and review every binding.':'Unsupported: '+plan.unsupported.join('; ');return plan;}
 const refresh=button('Inspect architecture',inspect);
 const download=button('Download Kubernetes bundle',async()=>{
  guard();const token=epoch;const settings=JSON.parse(configuration.value),diagram=getDiagram();
  const bundle=await compiler.compile({diagram,...getDependencies(),registry,settings,selection:getSelection?.()||null});
  guard();if(token!==epoch)return;
  // Only this explicit action materializes an export. No browser storage or provider requests.
  const blob=new Blob([JSON.stringify(bundle,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=doc.createElement('a');link.href=url;link.download='lucyd-deployment-bundle.json';link.click();URL.revokeObjectURL(url);
  status.textContent='Bundle downloaded. No cloud deployment or calibration has run.';
 });actions.append(refresh,download);dialog.append(heading,summary,status,bindings,details,actions);host.append(dialog);ui.adoptTree(dialog);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>{clear();});
 async function open(){
  clear();status.textContent='Loading implementation contracts...';dialog.showModal();const token=epoch,controller=new AbortController();loading=controller;
  try{
   guard();const responses=await Promise.all(['registry.json','configuration.template.json'].map(file=>fetch(new URL(file,import.meta.url),{signal:controller.signal})));if(responses.some(r=>!r.ok))throw Error('Implementation contracts could not be loaded');
   const values=await Promise.all(responses.map(r=>r.json()));guard();if(token!==epoch)return;[registry,template]=values;await compiler.verifySources(registry,async file=>{if(!file.startsWith('public/'))throw Error('Invalid public source contract');const response=await fetch(new URL('../../../'+file.slice(7),import.meta.url),{signal:controller.signal});if(!response.ok)throw Error('Source contract unavailable: '+file);return response.arrayBuffer();});guard();if(token!==epoch)return;
   const plan=await inspect();guard();if(token!==epoch)return;const settings=structuredClone(template);settings.bindings=Object.fromEntries(plan.nodes.map(n=>[n.bindingKey,n.implementations.length===1?n.implementations[0]:'SELECT_IMPLEMENTATION']));configuration.value=JSON.stringify(settings,null,2);
  }catch(error){if(!disposed&&token===epoch)status.textContent=error.message;}
 }
 function dispose(){if(disposed)return;clear();disposed=true;dialog.close();dialog.remove();stylesheet.remove();getDiagram=null;getSelection=null;getDependencies=null;getIsPrivate=null;}
 return Object.freeze({open,dispose});
}
