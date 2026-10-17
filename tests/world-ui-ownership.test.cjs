const test=require('node:test');const assert=require('node:assert/strict');
test('page CSS cannot introduce native controls or target component internals',async()=>{
 const {forbiddenRules,validate}=await import('../tools/check-world-ui-ownership.mjs');
 for(const selector of ['.gpu-scene button','.motorcycle :is(button, select, summary)','.page .wui-button','[data-wui="sheet"] > div','button:hover','select:focus','summary::after'])assert.equal(forbiddenRules(`${selector}{padding:20px}`).length,1,selector);
 assert.equal(forbiddenRules('.gpu-scene__dock{position:absolute;bottom:12px}').length,0);
 const [rule]=forbiddenRules('.old button{height:44px}').map(r=>({...r,file:'legacy.css'}));
 assert.deepEqual(validate([rule]),[rule],'Existing controls are not exempt from shared ownership');
});
