(function renderCatalog() {
  const ui=globalThis.SimulatteWorldUI, doc=document;
  const node=(tag,cls,text)=>{const el=doc.createElement(tag);el.className=cls||'';if(text)el.textContent=text;return el;};
  for(const theme of ['light','dark']){
    const section=node('section','catalog-theme');section.dataset.wuiTheme=theme;section.append(node('h2','wui-title',theme==='light'?'Light':'Dark'));
    const buttons=node('section','catalog-section');buttons.append(node('h3','wui-title','SimButton'));
    for(const variant of ui.VARIANTS){
      const row=node('div','catalog-row');row.append(node('span','catalog-label',variant));
      for(const state of ['idle','selected','pending','disabled','error']){
        const button=ui.SimButton({label:variant==='icon'?'⋯':state,ariaLabel:`${variant} ${state}`,variant,onAction:()=>{doc.querySelector('#catalog-result').textContent=`${variant} ${state} activated`;}});
        button.setState({selected:state==='selected',pending:state==='pending',disabled:state==='disabled',error:state==='error'?'Example action failed':null});row.append(button.element);
      }buttons.append(row);
    }section.append(buttons);
    const controls=node('section','catalog-section');controls.append(node('h3','wui-title','SimDock / SimMenu / SimTooltip'));
    const camera=ui.SimMenu({label:'Camera'});
    for(const [index,label]of ['Overview','Top','Follow'].entries()){
      const button=ui.SimButton({label,variant:'quiet',onAction:()=>{for(const b of camera.content.children)b.setAttribute('aria-checked',String(b===button.element));}});button.element.setAttribute('role','menuitemradio');button.element.setAttribute('aria-checked',String(index===0));camera.content.append(button.element);
    }
    const pause=ui.SimButton({label:'Pause',variant:'quiet',onAction:()=>{pause.element.textContent=pause.element.textContent==='Pause'?'Resume':'Pause';}});
    controls.append(ui.SimDock({label:'Example playback',children:[pause.element,camera.element,node('output','wui-clock','00:18')]}));
    ui.SimTooltip({target:pause.element,text:'Pause execution; keep observation available.'});section.append(controls);
    const metricSection=node('section','catalog-section');metricSection.append(node('h3','wui-title','SimMetric'));
    const metrics=node('div','wui-metrics');
    for(const [index,level]of ['governing','supporting','detail'].entries())metrics.append(ui.SimMetric({data:{level,subject:['Productive compute share','Completed steps','Example unavailable sample'][index],value:index===2?'Unavailable':index===1?12:74,unit:index===0?'%':index===1?'steps':'',timeBasis:'0–18 s',freshness:index===2?'stale':'current',validity:index===2?'invalid':'modeled'}}).element);
    metricSection.append(metrics);section.append(metricSection);
    const surfaces=node('section','catalog-section');surfaces.append(node('h3','wui-title','SimSheet / SimInspector'));
    const trigger=ui.SimButton({label:'Open settings',variant:'secondary'}).element;
    const sheetElement=node('section');sheetElement.dataset.wuiTheme=theme;
    const close=ui.SimButton({label:'×',ariaLabel:'Close settings',variant:'icon'}).element;
    const heading=node('header','wui-sheet-heading');heading.append(node('h2','wui-title','Settings and evidence'),close);sheetElement.append(heading,ui.SimDisclosure({title:'Model limits',children:[node('p','','This is a component fixture, not simulation evidence.')]}));doc.body.append(sheetElement);
    const sheet=ui.SimSheet({element:sheetElement,trigger,closeButton:close,label:'Example settings'});
    const inspect=ui.SimButton({label:'Inspect example rack',variant:'secondary',onAction:()=>{inspector.element.hidden=false;inspector.element.dataset.placement='edge';inspector.element.focus();}}).element;
    const inspector=ui.SimInspector({host:section,prominentFields:['waiting','blocking'],onSelect:()=>{inspector.element.hidden=true;inspect.focus();},onAction:async()=>({message:'Example applied'})});
    inspector.render({objects:[{id:'rack',label:'Rack R1-1',condition:'Backward pass · 74%',relatedIds:[]}],selectedId:'rack',label:'Rack R1-1',description:'Illustrative component data.',prompt:'Select a rack',fields:[{id:'waiting',label:'Waiting on',value:'R2-1, R2-2'},{id:'blocking',label:'Blocking',value:'31 racks'}],actions:[{id:'slow',label:'Slow rack'}]});inspector.selector.hidden=true;inspector.element.hidden=true;inspector.element.dataset.wuiTheme=theme;
    surfaces.append(trigger,inspect);section.append(surfaces);doc.querySelector('#catalog-themes').append(section);
  }
})();
