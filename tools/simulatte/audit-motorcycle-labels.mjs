import {openBrowserAudit} from './browser-session.mjs';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {sourceReceipt} from './runtime-audit-sources.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.SIMULATTE_LABEL_OUT||root+'artifacts/label-orientation/'+new Date().toISOString().replace(/[:.]/g,'-');await fs.mkdir(out,{recursive:true});
const b=await openBrowserAudit({publicRoot:root+'public',viewport:{width:1000,height:700}}),c=b.client;
const report={schema:'simulatte.labelOrientationCapture.v1',sources:await sourceReceipt(root),baseUrl:process.env.SIMULATTE_LABEL_ORIGIN||b.host.baseUrl,scope:'Real label texture and billboard renders from opposite camera directions; screenshots require visual inspection.'};
const ev=async expression=>{const r=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
try{
await c.send('Page.enable');await c.send('Runtime.enable');
if(process.env.SIMULATTE_LABEL_BACKEND==='webgl')await c.send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'gpu',{value:undefined});"});
await c.send('Page.navigate',{url:new URL('motorcycle',process.env.SIMULATTE_LABEL_ORIGIN||b.host.baseUrl).href});
for(let i=0;i<600;i++){if(await ev(`document.body?.dataset.state==='running'`))break;await new Promise(r=>setTimeout(r,100));}
await ev(`(()=>{
 const B=BABYLON,scene=B.EngineStore.LastCreatedScene;

 window.labelScene=new B.Scene(scene.getEngine());labelScene.clearColor=new B.Color4(.12,.12,.12,1);
 const camera=new B.FreeCamera('label-audit-camera',new B.Vector3(0,0,-20),labelScene);camera.setTarget(B.Vector3.Zero());camera.mode=B.Camera.ORTHOGRAPHIC_CAMERA;camera.orthoLeft=-12;camera.orthoRight=12;camera.orthoTop=8.4;camera.orthoBottom=-8.4;
 const source=scene.getMeshByName('selected-source-label');const clone=B.MeshBuilder.CreatePlane('source-label-proof',{width:10,height:4},labelScene);const material=new B.StandardMaterial('source-label-proof',labelScene);material.diffuseTexture=source.material.diffuseTexture;material.emissiveColor=B.Color3.White();material.disableLighting=true;material.backFaceCulling=false;material.useAlphaFromDiffuseTexture=true;clone.material=material;clone.billboardMode=B.Mesh.BILLBOARDMODE_ALL;clone.position.y=3;
 window.proofTreatment=MotorcycleTreatmentView.label(B,labelScene,'Observer 12','#ffffff',{});proofTreatment.position.y=-3;
 window.renderLabels=()=>{scene.getEngine().beginFrame();labelScene.render();scene.getEngine().endFrame();};
 for(const node of document.querySelectorAll('.city-toolbar,.observer-readout,.map-legend,.map-navigation,.map-touch-hint'))node.style.display='none';
 window.labelLoop=()=>{renderLabels();window.labelFrame=requestAnimationFrame(labelLoop);};labelLoop();
})()`);
await new Promise(r=>setTimeout(r,1500));
for(const z of [-20,20]){
 await ev(`labelScene.activeCamera.position.z=${z};labelScene.activeCamera.setTarget(BABYLON.Vector3.Zero());renderLabels()`);
 await new Promise(r=>setTimeout(r,200));
 const s=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/labels-'+z+'.png',Buffer.from(s.data,'base64'));
}
report.backend=await ev('motorcycleRuntimeReceipt.backend');report.captured=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}finally{await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));await b.close();}
console.log(out);
