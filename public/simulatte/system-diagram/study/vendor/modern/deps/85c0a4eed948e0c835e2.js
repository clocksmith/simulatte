/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/roughjs@4.6.4/bin/math.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
function t(){return Math.floor(Math.random()*2**31)}class r{constructor(e){this.seed=e}next(){return this.seed?(2**31-1&(this.seed=Math.imul(48271,this.seed)))/2**31:Math.random()}}export{r as Random,t as randomSeed};
//# sourceMappingURL=/sm/41e760c9a0829066ff863bdd53be091ca375df3e0c49c3581df19102ed349fb4.map