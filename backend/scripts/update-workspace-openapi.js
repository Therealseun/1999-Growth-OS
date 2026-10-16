// Regenerate workspace command schemas from their actual Zod validators.
import { readFileSync,writeFileSync } from 'node:fs';
import { actionSchema,taskActionSchema,pageSchema } from '../workspace/service.js';
function schema(z) {
 const d=z._def;
 switch(d.typeName){
  case 'ZodObject':return {type:'object',properties:Object.fromEntries(Object.entries(z.shape).map(([k,v])=>[k,schema(v)])),required:Object.entries(z.shape).filter(([,v])=>!v.isOptional()).map(([k])=>k),additionalProperties:d.unknownKeys!=='strict'};
  case 'ZodDiscriminatedUnion':return {oneOf:d.options.map(schema),discriminator:{propertyName:d.discriminator}};
  case 'ZodOptional':return schema(d.innerType);
  case 'ZodDefault':return {...schema(d.innerType),default:d.defaultValue()};
  case 'ZodNullable':return {anyOf:[schema(d.innerType),{type:'null'}]};
  case 'ZodEnum':return {type:'string',enum:d.values};
  case 'ZodLiteral':return {const:d.value,type:typeof d.value};
  case 'ZodBoolean':return {type:'boolean'};
  case 'ZodNumber':{const out={type:d.checks.some(c=>c.kind==='int')?'integer':'number'};for(const c of d.checks){if(c.kind==='min')out.minimum=c.value;if(c.kind==='max')out.maximum=c.value;}return out;}
  case 'ZodString':{const out={type:'string'};for(const c of d.checks){if(c.kind==='min')out.minLength=c.value;if(c.kind==='max')out.maxLength=c.value;if(c.kind==='uuid')out.format='uuid';if(c.kind==='regex')out.pattern=c.regex.source;}return out;}
  default:throw new Error(`Unhandled Zod type: ${d.typeName}`);
 }
}
const file=new URL('../docs/ai-api.openapi.json',import.meta.url),doc=JSON.parse(readFileSync(file,'utf8'));
doc.info={title:'GrowthOS connected workspace and AI API',version:'1.1.0',description:'Business workspace and AI/research routes used by the connected frontend. Supabase issues browser access tokens. Department and employee scope are enforced by the backend.'};
doc.components.schemas.WorkspaceCommand=schema(actionSchema);
doc.components.schemas.TaskCommand=schema(taskActionSchema);
const pathId={name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}};
const ws={name:'workstream',in:'query',required:true,schema:{type:'string',enum:['EMAIL','SEO','LEAD_MAGNET']}};
const response={type:'object',properties:{data:{type:'object',additionalProperties:true}},required:['data']};
const list={type:'object',required:['data','total','page','pageSize'],properties:{data:{type:'array',items:{type:'object',additionalProperties:true}},total:{type:'integer'},page:{type:'integer'},pageSize:{type:'integer'}}};
const security=[{bearerAuth:[]}];
const op=(summary,description,body,parameters=[],output=response)=>({summary,description,security,parameters,...(body?{requestBody:{required:true,content:{'application/json':{schema:body}}}}:{}),responses:{'200':{description:'Successful response',content:{'application/json':{schema:output}}},'401':{description:'Missing or invalid access token'},'403':{description:'Inactive account or role not allowed'},'404':{description:'Missing record or record outside scope'},'409':{description:'Conflict, closed task, or duplicate immutable record'},'422':{description:'Validation failed'}}});
const queryParams=keys=>keys.map(name=>({name,in:'query',required:false,schema:schema(pageSchema.shape[name])}));
doc.paths['/api/workspace']={get:op('Read workspace','Scoped campaigns, departments, people, assignments, target settings, latest 100 jobs and last 30 days of daily reports. Employees get only their own people/workload records and no job or target settings.'),post:op('Run management command','Admin or scoped Manager. create_department, update_person and set_targets require Admin. Workload preparation requires an ACTIVE campaign and active assigned staff.',{$ref:'#/components/schemas/WorkspaceCommand'})};
doc.paths['/api/workspace/campaigns/{id}']={get:op('Read campaign workspace','Admin or scoped Manager: campaign, niche profile versions, latest 100 jobs and prospect counts.',null,[pathId])};
doc.paths['/api/workspace/tasks']={get:op('List scoped tasks','Employees see their own assigned tasks; managers their department; admins all.',null,queryParams(['page','pageSize','campaign_id','workstream','status']),list)};
doc.paths['/api/workspace/prospects']={get:op('List scoped prospects','Admin or scoped Manager. Status is QUALIFIED, REJECTED or NEEDS_REVIEW; search matches organisation/email.',null,queryParams(['page','pageSize','campaign_id','status','search']),list)};
doc.paths['/api/workspace/tasks/{id}']={get:op('Read task and evidence','Scoped task detail, recipient when applicable and execution evidence.',null,[pathId,ws]),post:op('Review, skip or complete a task','Review requires assignment. Completion requires a REVIEWED task, evidence and explicit confirmation of external execution. Email accepts URL/TEXT; SEO and comments require an HTTP(S) URL. No messages are sent and nothing is published by this API.',{$ref:'#/components/schemas/TaskCommand'},[pathId,ws])};
doc.paths['/api/profile']={patch:op('Update own name','Any active caller.',{type:'object',additionalProperties:false,required:['name'],properties:{name:{type:'string',minLength:1,maxLength:120}}})};
writeFileSync(file,JSON.stringify(doc,null,2)+'\n');
console.log('Updated workspace OpenAPI schemas.');
