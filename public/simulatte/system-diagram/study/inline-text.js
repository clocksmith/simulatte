(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SimulatteStudyText=api;})(globalThis,function(){
 'use strict';
 function parts(text){const result=[];let offset=0;const pattern=/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g;for(const match of String(text).matchAll(pattern)){let url;try{url=new URL(match[2]);}catch{continue;}if(url.username||url.password)continue;result.push(text.slice(offset,match.index),{label:match[1],url:url.href});offset=match.index+match[0].length;}result.push(String(text).slice(offset));return result;}
 function render(text,h){return parts(text).map((part,i)=>typeof part==='string'?part:h('a',{key:i,href:part.url,target:'_blank',rel:'noopener noreferrer'},part.label));}
 return {parts,render};
});
