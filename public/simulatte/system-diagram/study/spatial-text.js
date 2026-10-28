(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SimulatteSpatialText=api;})(globalThis,function(){
 'use strict';let policy=null,metrics=null;
 function configure(p,m){if(p?.schema!=='simulatte.studySpatialPolicy.v1'||m?.schema!=='simulatte.studyFontMetrics.v1')throw Error('Missing spatial policy/font metrics');policy=p;metrics=m;}
 function width(value,size){if(!metrics)throw Error('Spatial font metrics not configured');return Math.ceil([...String(value)].reduce((sum,c)=>sum+(metrics.advances[c.codePointAt(0)]??metrics.unknownAdvance),0)/metrics.unitsPerEm*size*1.06+4);}
 function measure(value,size){const lines=String(value).split('\n');return {width:Math.max(...lines.map(l=>width(l,size))),height:Math.ceil(lines.length*size*policy.label.lineHeight)};}
 function wrap(value,maxWidth,size){const result=[];for(const paragraph of String(value).split('\n')){let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){if(line&&width(line+' '+word,size)>maxWidth){result.push(line);line='';}for(const c of word){if(width(line+c,size)>maxWidth&&line){result.push(line);line='';}line+=c;}line+=' ';}result.push(line.trimEnd());}return result.join('\n');}
 function node(label){const text=wrap(label,policy.node.labelWidth,policy.node.fontSize),m=measure(text,policy.node.fontSize);return {text,w:Math.max(policy.node.minWidth,m.width+policy.node.padding*2),h:Math.max(policy.node.minHeight,m.height+policy.node.padding*2)};}
 function label(value){const text=wrap(value,policy.label.maxWidth,policy.label.fontSize),m=measure(text,policy.label.fontSize);return {text,w:m.width+policy.label.padding*2,h:m.height+policy.label.padding*2};}
 return {configure,width,measure,wrap,node,label};
});
