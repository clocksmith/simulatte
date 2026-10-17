const test=require('node:test');const assert=require('node:assert/strict');
test('page CSS cannot introduce native controls or target component internals',async()=>{
 const {forbiddenRules,validate}=await import('../tools/check-world-ui-ownership.mjs');
 for(const selector of ['.gpu-scene button','.motorcycle :is(button, select, summary)','.page .wui-button','[data-wui="sheet"] > div','button:hover','select:focus','summary::after'])assert.equal(forbiddenRules(`${selector}{padding:20px}`).length,1,selector);
 assert.equal(forbiddenRules('.gpu-scene__dock{position:absolute;bottom:12px}').length,0);
 const [legacy]=forbiddenRules('.old button{height:44px}').map(r=>({...r,file:'legacy.css'}));
 assert.deepEqual(validate([legacy],[legacy]),[]);
 assert.equal(validate(forbiddenRules('.old button{height:60px}').map(r=>({...r,file:'legacy.css'})),[legacy]).length,1);
 assert.equal(validate([{...legacy,file:'new-page.css'}],[legacy]).length,1);
});
