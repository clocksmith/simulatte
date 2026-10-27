'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const V = require('../public/simulatte/system-diagram/editor-viewport.js');
const Files = require('../public/simulatte/system-diagram/file-io.js');
const editor = {minZoom: .2, maxZoom: 3};
test('a wide diagram fits on a phone without allowing a small diagram to disappear at tiny zoom', () => {
  const policy = {...editor, fitMinZoom: .00001}, rect = {width:390,height:844};
  const content = {x:0,y:0,w:2400,h:400}, insets={top:150,bottom:76,left:24,right:24};
  const v = V.fit(content,rect,policy,insets);
  assert.ok(v.zoom < editor.minZoom);
  assert.ok((content.x - v.x)*v.zoom >= insets.left);
  assert.ok((content.x+content.w-v.x)*v.zoom <= rect.width-insets.right);
  assert.equal(V.minimumZoom({x:0,y:0,w:176,h:72},rect,policy,insets),editor.minZoom);
});
test('fit leaves the complete diagram inside the unobstructed HUD area', () => {
  const rect = {width: 1440, height: 900}, insets = {top: 150, bottom: 76, left: 24, right: 24};
  const content = {x: -280, y: 300, w: 1000, h: 500};
  const v = V.fit(content, rect, editor, insets);
  const projected = {left: (content.x - v.x) * v.zoom, top: (content.y - v.y) * v.zoom,
    right: (content.x + content.w - v.x) * v.zoom, bottom: (content.y + content.h - v.y) * v.zoom};
  assert.ok(projected.left >= insets.left && projected.right <= rect.width - insets.right);
  assert.ok(projected.top >= insets.top && projected.bottom <= rect.height - insets.bottom);
});
test('extreme pan and zoom retain a visible intersection with off-origin content', () => {
  const rect = {width: 390, height: 844}, insets = {top: 130, bottom: 76};
  const content = {x: 5000, y: -3000, w: 176, h: 72};
  for (const x of [-1e9, 1e9]) for (const y of [-1e9, 1e9]) for (const zoom of [.0001, 100]) {
    const v = V.constrain({x,y,zoom}, rect, content, V.board(content,8), editor, insets);
    assert.ok(v.zoom >= editor.minZoom && v.zoom <= editor.maxZoom);
    assert.ok((content.x + content.w - v.x) * v.zoom > 0);
    assert.ok((content.x - v.x) * v.zoom < rect.width);
    assert.ok((content.y + content.h - v.y) * v.zoom > insets.top);
    assert.ok((content.y - v.y) * v.zoom < rect.height - insets.bottom);
  }
});
test('an empty canvas still has finite bounded navigation and a useful fit', () => {
  const r={width:1440,height:900}, b=V.board(null,8);
  const v=V.constrain({x:Infinity,y:-Infinity,zoom:1},r,null,b,editor,{});
  assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y));
  assert.equal(V.fit(null,r,editor,{}).zoom,1.25);
});
test('panning into the empty middle of distant components keeps a component visible', () => {
  const anchors=[{x:0,y:0,w:176,h:72},{x:10000,y:10000,w:176,h:72}];
  const content={x:0,y:0,w:10176,h:10072,anchors}, rect={width:390,height:844};
  const v=V.constrain({x:5000,y:5000,zoom:1},rect,content,V.board(content,8),editor,{});
  assert.ok(anchors.some(b => (b.x+b.w-v.x)*v.zoom > 0 && (b.x-v.x)*v.zoom < rect.width &&
    (b.y+b.h-v.y)*v.zoom > 0 && (b.y-v.y)*v.zoom < rect.height));
});
test('corrupt or blocked browser storage is distinguishable from no saved document and never erased', () => {
  const config={editor:{autosaveKey:'diagram'}}, values=new Map([['diagram','{corrupt']]);
  const store=Files.autosave(config,{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)});
  assert.equal(store.readStatus().state,'invalid'); assert.equal(values.get('diagram'),'{corrupt');
  assert.equal(store.loadRecord(),null);
  assert.equal(Files.autosave(config,null).readStatus().state,'unavailable');
  values.delete('diagram'); assert.equal(store.readStatus().state,'missing');
});
test('walkthrough readable view keeps natural text scale and the entry component visible on desktop and phone',()=>{
 const first={x:400,y:800,w:176,h:72},content={x:0,y:0,w:6000,h:2400,anchors:[first]};
 for(const rect of [{width:1280,height:720},{width:390,height:844}]){
  const insets={left:64,right:16,top:180,bottom:110},v=V.readable(content,rect,editor,insets);
  assert.equal(v.zoom,1);assert.ok((first.x-v.x)*v.zoom>=insets.left);
  assert.ok((first.x+first.w-v.x)*v.zoom<=rect.width-insets.right);
  assert.ok((first.y-v.y)*v.zoom>=insets.top);assert.ok((first.y+first.h-v.y)*v.zoom<=rect.height-insets.bottom);
  assert.ok(V.fit(content,rect,editor,insets).zoom<1);
 }
});
