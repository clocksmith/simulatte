import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function auditSolarShade({evaluate:ev,client:c,out,width,height,requireNative=false}){
  async function wait(expression){const end=Date.now()+30000;while(Date.now()<end){if(await ev(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Shade fixture did not settle: '+expression);}
    const setup=await ev(`(async()=>{
      SimulatteSolarDrive.dispose();document.body.replaceChildren();
      const canvas=document.createElement('canvas');canvas.id='shade-fixture';canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;';document.body.append(canvas);
      const errors=[];const renderer=await SimulatteSolarRenderer.create(canvas,e=>errors.push(e.message));
      const g=SimulatteSolarGeometry;
      const machine={timeS:0,anchors:{solar:[0,0,0]},instances:[{group:'solar',mesh:'box',panelUv:[0,1],matrix:g.matrix([0,0,0],[3,.03,3]),color:[.008,.025,.075,0],material:[.5,.13,3,1]}]};
      const scene=SimulatteSolarRideScene.create({points:[],buildings:[],policy:{roadWidthM:6}});
      const camera={target:[0,0,0],distance:Math.max(5,5*innerHeight/innerWidth),yaw:0,pitch:1.50};
      globalThis.__shadeFixture={renderer,machine,scene,camera,errors};
      return renderer.receipt();
    })()`);
    if(requireNative)assert.equal(setup.adapter.isFallbackAdapter,false,'Pixel qualification requires the native adapter');
    const row={width,height,adapter:setup.adapter,phases:[],boundary:'Controlled exposure fixture; actual headed GPU pixels, not measured outdoor shade.'};
    for(const [name,mask]of [['clear',0],['partial',7],['shaded',511]]){
      const drawn=await ev(`(()=>{
        const f=__shadeFixture,mask=${mask};
        const samples=Array.from({length:9},(_,i)=>({state:mask&(1<<i)?'shade':'direct',occluderId:null}));
        const environment={point:{x:0,y:0,elevationM:0,heading:0},grade:0,sunDirection:[0,1,0],timestamp:'2026-06-21T12:00:00Z',routeId:'pixel-fixture',occluderIds:[],samples,directFraction:samples.filter(s=>s.state==='direct').length/9};
        const scene=f.scene.frame(f.machine,environment,{shade:0,cloud:0});f.renderer.render(scene,f.camera);
        return {target:f.renderer.receipt().submittedFrames,mask:scene.route.panelExposure.shadeMask,points:samples.map((_,i)=>f.renderer.project([((Math.floor(i/3)+.5)/3-.5)*3,.016,-((i%3+.5)/3-.5)*3]))};
      })()`);
      await wait(`__shadeFixture.renderer.receipt().completedFrames>=${drawn.target}`);
      const capture=await c.send('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');
      const file=`${width}-${name}.png`;await fs.writeFile(out+'/'+file,bytes);
      const light=await ev(`(async()=>{
        const image=new Image();image.src='data:image/png;base64,${capture.data}';await image.decode();
        const canvas=document.createElement('canvas');canvas.width=${width};canvas.height=${height};const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        return ${JSON.stringify(drawn.points)}.map(p=>{let sum=0,count=0;for(let y=Math.round(p.y)-3;y<=Math.round(p.y)+3;y++)for(let x=Math.round(p.x)-3;x<=Math.round(p.x)+3;x++){const i=(y*canvas.width+x)*4;sum+=(data[i]+data[i+1]+data[i+2])/3;count++;}return sum/count;});
      })()`);
      row.phases.push({name,mask:drawn.mask,light,file,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
    const [clear,partial,shaded]=row.phases.map(p=>p.light);
    for(let i=0;i<9;i++){
      assert.ok(clear[i]-shaded[i]>10,'Measured direct-light pixels must darken in shade');
      assert.ok(Math.abs(partial[i]-(i<3?shaded[i]:clear[i]))<8,'Partial shade must affect its sampled regions');
    }
    assert.deepEqual(await ev('__shadeFixture.errors'),[]);row.passed=true;
    await ev('__shadeFixture.renderer.dispose()');
    return row;
}
