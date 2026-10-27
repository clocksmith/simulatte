'use strict';
const fs=require('node:fs'),path=require('node:path');
function assign(value){
  const data=structuredClone(value),used=new Set();let maximum=0;
  for(const problem of data.problems)if(problem.referenceId){
    if(!/^L\d{3,6}$/.test(problem.referenceId)||problem.referenceId!=='L'+String(Number(problem.referenceId.slice(1))).padStart(3,'0')||Number(problem.referenceId.slice(1))===0||used.has(problem.referenceId))throw Error('Invalid or duplicate Lucyd reference ID');
    used.add(problem.referenceId);maximum=Math.max(maximum,Number(problem.referenceId.slice(1)));
  }
  let next=data.nextProblemNumber??maximum+1;
  if(!Number.isSafeInteger(next)||next<=maximum)throw Error('Lucyd nextProblemNumber must exceed all allocated numbers');
  for(const problem of data.problems)if(!problem.referenceId){
    if(next>999999)throw Error('Lucyd reference number range exhausted');
    problem.referenceId='L'+String(next++).padStart(3,'0');
  }
  data.nextProblemNumber=next;if(data.schema!=='simulatte.lucydProblems.v6')data.version='6.0.0';data.schema='simulatte.lucydProblems.v6';return data;
}
if(require.main===module){
  const file=path.resolve(__dirname,'../../public/data/system-diagram/problems.json'),source=fs.readFileSync(file,'utf8'),output=JSON.stringify(assign(JSON.parse(source)),null,2)+'\n';
  if(process.argv.includes('--check')){if(output!==source)throw Error('Lucyd problem references need allocation');}
  else if(output!==source)fs.writeFileSync(file,output);
  console.log('Lucyd problem reference IDs '+(process.argv.includes('--check')?'verified':'assigned'));
}
module.exports={assign};
