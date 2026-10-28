(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SimulatteStudyTheme=api;})(globalThis,function(){
 'use strict';
 function preference(value){return ['system','light','dark'].includes(value)?value:'system';}
 function resolve(value,isDark){return preference(value)==='system'?(isDark?'dark':'light'):value;}
 return {preference,resolve};
});
