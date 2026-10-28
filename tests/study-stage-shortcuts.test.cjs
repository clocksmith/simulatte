'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {direction}=require('../public/simulatte/system-diagram/study/stage-shortcuts.js');
test('page keys navigate by one stage without stealing modified or native drawing keys',()=>{
 assert.equal(direction({key:'PageDown'},{}),1);assert.equal(direction({key:'PageUp'},{}),-1);
 for(const key of ['ArrowLeft','ArrowRight','[',']','r'])assert.equal(direction({key},{}),0);
 for(const flag of ['ctrlKey','metaKey','altKey','shiftKey','repeat','isComposing','defaultPrevented'])assert.equal(direction({key:'PageDown',[flag]:true},{}),0);
});
test('typing, modal and active gestures suppress stage shortcuts',()=>{
 assert.equal(direction({key:'PageDown',target:{closest:()=>true}},{}),0);
 assert.equal(direction({key:'PageDown'},{},true),0);
 for(const key of ['editingTextElement','newElement','multiElement','editingLinearElement','isDragging','isResizing','isRotating','openDialog','openPopup','openMenu','contextMenu'])assert.equal(direction({key:'PageDown'},{[key]:true}),0);
});
