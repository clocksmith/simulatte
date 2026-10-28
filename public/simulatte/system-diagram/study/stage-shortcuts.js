(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SimulatteStageShortcuts=api;})(globalThis,function(){
 'use strict';
 function direction(event,state,modalOpen=false){
  if(event.defaultPrevented||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return 0;
  if(!['PageUp','PageDown'].includes(event.key)||modalOpen)return 0;
  if(event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], dialog, [role="menu"]'))return 0;
  if(!state||state.editingTextElement||state.newElement||state.multiElement||state.editingLinearElement||state.isDragging||state.isResizing||state.isRotating||state.openDialog||state.openPopup||state.openMenu||state.contextMenu)return 0;
  return event.key==='PageDown'?1:-1;
 }
 return {direction};
});
