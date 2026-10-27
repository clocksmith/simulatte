'use strict';
const http=require('node:http'),{timingSafeEqual}=require('node:crypto');
function createServer({store,token,role='api',maxBodyBytes=16384,afterMutation=async()=>{}}){
 if(typeof token!=='string'||token.length<24)throw Error('API_TOKEN must contain at least 24 characters');
 const auth=request=>{const actual=Buffer.from(request.headers.authorization||''),expected=Buffer.from('Bearer '+token);return actual.length===expected.length&&timingSafeEqual(actual,expected);};
 const json=(response,status,value)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(value));};
 return http.createServer(async(request,response)=>{
  try{
   if(request.method==='GET'&&request.url==='/livez')return json(response,200,{alive:true});
   if(request.method==='GET'&&request.url==='/healthz'){await store.pool.query('SELECT 1');return json(response,200,{ready:true});}
   if(!auth(request))return json(response,401,{error:'unauthorized'});
   if(request.method==='GET'&&request.url==='/v1/inventory'&&role==='api')return json(response,200,await store.snapshot());
   if(request.method!=='POST')return json(response,404,{error:'not_found'});
   let body='';for await(const chunk of request){body+=chunk;if(Buffer.byteLength(body)>maxBodyBytes)return json(response,413,{error:'body_too_large'});}
   let input;try{input=JSON.parse(body);}catch{return json(response,400,{error:'invalid_json'});}
   if(!input||Array.isArray(input)||typeof input!=='object')return json(response,400,{error:'object_required'});
   const allowed=request.url==='/v1/reservations'?['customerId','quantity']:request.url==='/v1/payments'?['reservationId']:request.url==='/events'?['id','kind','payload']:[];
   if(Object.keys(input).some(k=>!allowed.includes(k)))return json(response,400,{error:'unknown_input_field'});
   let result;
   if(role==='api'&&request.url==='/v1/reservations')result=await store.reserve(request.headers['idempotency-key'],input);
   else if(role==='api'&&request.url==='/v1/payments')result=await store.pay(request.headers['idempotency-key'],input);
   else if(role==='events'&&request.url==='/events')result=await store.receiveEvent(input);
   else return json(response,404,{error:'not_found'});
   await afterMutation({request,response,result});if(response.destroyed)return;
   if(result.replayed)response.setHeader('Idempotency-Replayed','true');return json(response,result.status,result.body);
  }catch(error){if(response.destroyed||response.writableEnded)return;json(response,503,{error:'database_unavailable',retryable:true});}
 });
}
module.exports={createServer};
