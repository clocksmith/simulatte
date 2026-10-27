'use strict';
const s={type:'string',minLength:1},strs={type:'array',items:s};
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const list=items=>({type:'array',items});
const namedRef=name=>({$ref:'#/$defs/'+name});
const positive={type:'integer',minimum:1},constant=constValue=>({const:constValue});
const shape={type:'object',minProperties:1,additionalProperties:s};
const node=object({id:s,definitionId:s,version:positive,label:s,position:object({x:{type:'number'},y:{type:'number'}}),parentId:s,subsystemId:s,lineageIds:strs},['id','definitionId','version','label','position']);
const endpoint=object({nodeId:s,portId:s});
const edge=object({id:s,from:endpoint,to:endpoint,contractId:s,mode:{enum:['request-response','event-stream','storage','local-call']},label:s},['id','from','to','contractId','mode']);
const graph=object({nodes:list(namedRef('node')),edges:list(namedRef('edge'))});
const operations=[
 object({op:constant('insert'),node:namedRef('node')}),
 object({op:constant('connect'),edge:namedRef('edge')}),
 object({op:constant('disconnect'),edgeId:s}),
 object({op:constant('reconnect'),edgeId:s,edge:namedRef('edge'),reason:s}),
 object({op:constant('replace'),nodeId:s,definitionId:s,migration:s}),
 object({op:constant('expand'),nodeId:s,subsystemId:s,nodes:list(namedRef('node')),edges:list(namedRef('edge'))}),
 object({op:constant('merge'),nodeIds:{...strs,minItems:2,uniqueItems:true},node:namedRef('node'),reason:s})
];
const stage=object({id:s,number:positive,title:s,question:s,reason:s,operations:{...list({oneOf:operations}),minItems:1},graph:namedRef('graph'),invariants:{...strs,minItems:1},checkIds:{...strs,minItems:1},explanation:s,notes:strs,followupIds:strs,code:list(object({id:s,kind:{enum:['api','pseudocode']},language:s,text:s}))},['id','number','title','question','reason','operations','graph','invariants','checkIds']);
const evidence=object({kind:constant('reference-test'),testFile:s,testName:s});
const solution=object({id:s,title:s,chooseWhen:s,tradeoffs:{...strs,minItems:1},assumptions:{...strs,minItems:1},initialGraph:namedRef('graph'),stages:{...list(stage),minItems:8},apis:list(object({method:s,path:s,request:s,response:s,errors:s,ownerNodeId:s})),algorithms:list(object({id:s,ownerNodeId:s,language:s,code:s,guarantees:strs})),acceptanceCases:list(object({id:s,given:s,when:s,then:s,relatedRequirementIds:strs,evidence},['id','given','when','then','relatedRequirementIds']))});
const port=object({id:s,direction:{enum:['in','out']},contractId:s});
const exposed=object({...port.properties,target:endpoint});
const schema={
 $schema:'https://json-schema.org/draft/2020-12/schema',
 title:'Lucyd composable interview study problem, version 1',
 description:'Conceptual architecture progression. It does not claim kernel execution or production deployment. Foreign runtime or editor state belongs in a separate workspace envelope, not this authored document.',
 ...object({schema:constant('simulatte.composableStudy.v1'),version:constant(1),problem:object({referenceId:{type:'string',pattern:'^L[0-9]{3}$'},studyLabel:s,scope:s,requirements:list(object({id:s,text:s}))}),execution:object({kind:constant('conceptual-design'),implementation:{type:'null'}}),provenance:object({kind:constant('authored-practice'),note:s}),references:list(object({id:s,title:s,url:{type:'string',pattern:'^https://'},scope:constant('background'),supports:s})),contracts:list(object({id:s,version:constant(1),request:shape,response:shape})),components:list(object({id:s,version:constant(1),extends:object({id:s,version:positive}),label:s,responsibility:s,stateOwnership:strs,ports:list(port)})),subsystems:list(object({id:s,version:constant(1),definitionId:s,ports:list(exposed)})),solutions:{...list(solution),minItems:2}}),
 $defs:{node,edge,graph}
};
module.exports={schema};
