import { z } from 'zod';
import { aiConfig, apifySettings, WorkError } from './config.js';
import { conflict } from '../lib/errors.js';

export const apifyConnectorId=z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const kindSchema=z.enum(['prospects','opportunities']);
const pathSchema=z.string().trim().min(1).max(300).refine(p=>p.split('.').every(k=>k && !['__proto__','constructor','prototype'].includes(k)));
const fieldNames={prospects:['provider_record_id','organisation','contact_name','email','website','industry','location','source_url','phone'],opportunities:['platform','author','post_url','post_text']};
const specSchema=z.object({
  id:apifyConnectorId,label:z.string().trim().min(1).max(100),kind:kindSchema,
  task_id:z.string().regex(/^[A-Za-z0-9_~-]{1,160}$/),
  input:z.record(z.unknown()),fields:z.record(pathSchema),
  constants:z.object({platform:z.string().trim().min(1).max(100).optional()}).strict().default({}),
  results_path:pathSchema.optional(),max_charge_usd:z.number().finite().nonnegative().optional(),
  timeout_seconds:z.number().int().min(1).max(3600).optional(),
  legacy:z.boolean().optional(),
}).strict();
const fail=message=>{throw new WorkError('APIFY_CONFIG_INVALID',message);};

export function validateApifySelection(value,kind){
  const parsed=specSchema.safeParse(value);
  if(!parsed.success)fail('An Apify task has invalid settings. Check its ID, input, field mapping and limits in backend/config/apify.json.');
  const s=parsed.data;
  if(/REPLACE_WITH_/.test(JSON.stringify(s)))fail('Replace all input and output mapping placeholders before enabling this scraper.');
  if(s.kind!==kind)fail('The selected Apify scraper does not support this type of research.');
  if(Object.keys(s.fields).some(k=>!fieldNames[kind].includes(k)))fail('An Apify field mapping contains an unsupported destination.');
  if(kind==='prospects'&&s.constants.platform)fail('A fixed platform applies only to social-post research.');
  const required=kind==='prospects'?['organisation']:['post_url','post_text',...(s.constants.platform?[]:['platform'])];
  if(required.some(k=>!s.fields[k]))fail('An Apify task is missing required output field mappings.');
  return s;
}

export function apifyRegistry(settings){
  if(!settings||typeof settings!=='object'||Array.isArray(settings))fail('Apify settings must be a JSON object.');
  if(settings.version===undefined){
    // The original two-task format remains usable, including its existing record IDs.
    const connectors={},defaults={};
    for(const kind of ['prospects','opportunities'])if(settings[kind]){
      const raw=settings[kind];
      if(String(raw.task_id??'').startsWith('REPLACE_'))continue;
      const id=`legacy_${kind}`;
      connectors[id]=validateApifySelection({...raw,id,label:kind==='prospects'?'Default business scraper':'Default post scraper',kind,legacy:true},kind);
      defaults[kind]=id;
    }
    return {connectors,defaults};
  }
  if(settings.version!==2||!settings.connectors||typeof settings.connectors!=='object'||Array.isArray(settings.connectors))fail('Use version 2 with a connectors object, or the original prospects/opportunities configuration.');
  const connectors={};
  for(const [id,raw] of Object.entries(settings.connectors)){
    if(!apifyConnectorId.safeParse(id).success||!raw||typeof raw!=='object'||Array.isArray(raw))fail('Each Apify connector needs a valid name and settings object.');
    if(raw.enabled===false)continue;
    if(raw.enabled!==undefined&&raw.enabled!==true)fail('Apify connector enabled must be true or false.');
    if(Object.hasOwn(raw,'id')||Object.hasOwn(raw,'legacy'))fail('Use the connector object key as its ID; legacy is reserved.');
    const {enabled,...spec}=raw;
    if(String(spec.task_id??'').startsWith('REPLACE_'))fail('Replace the saved Apify task ID before enabling this scraper.');
    connectors[id]=validateApifySelection({...spec,id,label:spec.label??id},spec.kind);
  }
  const defaults=settings.defaults??{};
  if(!defaults||typeof defaults!=='object'||Array.isArray(defaults)||Object.keys(defaults).some(k=>!['prospects','opportunities'].includes(k)))fail('Apify defaults may contain only prospects and opportunities.');
  for(const [kind,id] of Object.entries(defaults))if(!Object.hasOwn(connectors,id)||connectors[id].kind!==kind)fail('An Apify default must reference an enabled scraper of the matching type.');
  return {connectors,defaults};
}

export function selectApifyConnector(settings,kind,id){
  const registry=apifyRegistry(settings),selected=id??registry.defaults[kind];
  if(!selected)fail(`Choose an Apify scraper for ${kind}, or configure a default.`);
  if(!Object.hasOwn(registry.connectors,selected))fail('The selected Apify scraper is missing or disabled.');
  return validateApifySelection(registry.connectors[selected],kind);
}

export const researchKind=kind=>kind==='PROSPECT_SEARCH'?'prospects':kind==='LEAD_MAGNET_GENERATION'?'opportunities':null;

// Only named choices cross the API boundary. Task IDs and templates remain server-side.
export function apifyCatalog(){
  try{
    const cfg=aiConfig();
    if(!cfg.APIFY_ENABLED)return {enabled:false,defaults:{},connectors:[],error:null};
    const {connectors,defaults}=apifyRegistry(apifySettings(cfg));
    return {enabled:true,defaults,connectors:Object.values(connectors).map(({id,label,kind})=>({id,label,kind})),error:null};
  }catch{return {enabled:false,defaults:{},connectors:[],error:'Apify settings need attention. Ask your connector administrator to check the configuration.'};}
}

export function selectionForRequest(input,cfg=aiConfig()){
  const kind=researchKind(input.kind),suppliedPosts=!!input.opportunities;
  if(input.apify_connector&&(!kind||suppliedPosts))throw conflict('Select an Apify scraper only for provider-based business or post research.','APIFY_SELECTION_INVALID');
  if(!kind||suppliedPosts)return null;
  if(!cfg.APIFY_ENABLED){
    if(input.apify_connector)throw conflict('Enable Apify before selecting a scraper.','APIFY_DISABLED');
    return null;
  }
  if(!input.apify_connector&&(input.research_provider??cfg.RESEARCH_PROVIDER)!=='apify'&&cfg.RESEARCH_FALLBACK!=='apify')return null;
  try{return selectApifyConnector(apifySettings(cfg),kind,input.apify_connector);}
  catch(err){throw conflict(err instanceof WorkError?err.message:'Could not read the Apify task configuration.','APIFY_CONFIG_INVALID');}
}
