import { describe,it,expect,vi } from 'vitest';
import { ApifyProvider } from '../ai/research.js';
import { apifyRegistry,selectApifyConnector,selectionForRequest } from '../ai/apify-config.js';
import { jobSchema } from '../shared/contracts.js';
import { apifySettings } from '../ai/config.js';

const cfg={APIFY_ENABLED:true,APIFY_TOKEN:'private-token',APIFY_TIMEOUT_SECONDS:300,APIFY_MAX_CHARGE_USD:1};
const maps={label:'Google Maps',kind:'prospects',task_id:'mapsTask',input:{searchStringsArray:'{{queries}}',locationQuery:'{{market}}',maxCrawledPlacesPerSearch:'{{count}}',scrapeContacts:true},fields:{provider_record_id:'placeId',organisation:'title',email:'emails.0',location:'address',website:'website',phone:'phone'}};
const posts={label:'Source posts',kind:'opportunities',task_id:'postTask',input:{search:'{{query_text}}'},fields:{post_url:'url',post_text:'text'},constants:{platform:'LinkedIn'}};
const settings={version:2,defaults:{prospects:'maps',opportunities:'posts'},connectors:{maps,other:{...maps,label:'Another business task',task_id:'otherTask'},posts,unfinished:{enabled:false}}};
const context={queries:['schools Abuja'],query_text:'schools Abuja',market:'Abuja, Nigeria',niche:'Schools',count:5};
describe('multiple Apify saved tasks',()=>{
 it('loads the configuration relative to backend even when started from the project root',()=>{
  const result=apifySettings({APIFY_ENABLED:true,APIFY_CONFIG_FILE:'./config/apify.multiple.example.json'});
  expect(result.version).toBe(2);expect(result.connectors.google_maps.kind).toBe('prospects');
 });
 it('resolves defaults and explicit choices while preserving typed campaign inputs',()=>{
  expect(selectApifyConnector(settings,'prospects').task_id).toBe('mapsTask');
  expect(selectApifyConnector(settings,'prospects','other').task_id).toBe('otherTask');
  const p=new ApifyProvider(cfg,settings);
  expect(p.input('prospects',context)).toEqual({searchStringsArray:['schools Abuja'],locationQuery:'Abuja, Nigeria',maxCrawledPlacesPerSearch:5,scrapeContacts:true});
 });
 it('supports original config and record IDs without requiring a version migration',async()=>{
  const legacy={prospects:{task_id:'oldTask',input:{},fields:{provider_record_id:'id',organisation:'name',email:'email'}}};
  const p=new ApifyProvider(cfg,legacy,async()=>Response.json([{id:'old-1',name:'School',email:'hi@example.test'}]));
  expect((await p.results('prospects','data')).records[0].provider_record_id).toBe('old-1');
 });
 it.each(['missing','unfinished','posts'])('rejects unavailable or wrong-kind prospect choice %s before a run starts',async id=>{
  const http=vi.fn();
  await expect(new ApifyProvider(cfg,settings,http,id).start('prospects',context)).rejects.toMatchObject({code:'APIFY_CONFIG_INVALID'});
  expect(http).not.toHaveBeenCalled();
 });
 it('rejects a missing default instead of choosing an arbitrary configured task',()=>{
  expect(()=>selectApifyConnector({...settings,defaults:{}},'prospects')).toThrow(/Choose/);
 });
 it('rejects incorrect field mappings and defaults',()=>{
  expect(()=>apifyRegistry({...settings,defaults:{prospects:'posts'}})).toThrow(/matching type/);
  expect(()=>apifyRegistry({version:2,connectors:{bad:{...posts,fields:{post_url:'url'}}}})).toThrow(/required/);
  expect(()=>apifyRegistry({version:2,connectors:{bad:{...maps,fields:{organisation:'__proto__.name'}}}})).toThrow(/invalid settings/);
 });
 it('launches only the chosen saved task and applies the lower global/per-task limits',async()=>{
  const http=vi.fn(async()=>Response.json({data:{id:'run-1'}}));
  const p=new ApifyProvider(cfg,{...settings,connectors:{...settings.connectors,other:{...settings.connectors.other,max_charge_usd:0.25,timeout_seconds:120}}},http,'other');
  await p.start('prospects',context);
  expect(http).toHaveBeenCalledTimes(1);
  const [url,options]=http.mock.calls[0],u=new URL(url);
  expect(u.pathname).toBe('/v2/actor-tasks/otherTask/runs');
  expect(u.searchParams.get('maxTotalChargeUsd')).toBe('0.25');expect(u.searchParams.get('timeout')).toBe('120');
  expect(options.headers.Authorization).toBe('Bearer private-token');
 });
 it('does not allow a per-task setting to raise the global charge allowance',async()=>{
  const http=vi.fn(async()=>Response.json({data:{id:'run-1'}}));
  await new ApifyProvider({...cfg,APIFY_MAX_CHARGE_USD:0},settings,http,'maps').start('prospects',context);
  expect(new URL(http.mock.calls[0][0]).searchParams.get('maxTotalChargeUsd')).toBe('0');
 });
 it('maps the supplied school-style emails array and isolates record IDs across tasks',async()=>{
  const rows=[{placeId:'1',title:'School',emails:['info@example.test','registrar@example.test'],website:'https://example.test',address:'Abuja',phone:'+2348000000000'}];
  const http=async()=>Response.json(rows);
  const a=(await new ApifyProvider(cfg,settings,http,'maps').results('prospects','data-1')).records[0];
  const b=(await new ApifyProvider(cfg,settings,http,'other').results('prospects','data-2')).records[0];
  expect(a.email).toBe('info@example.test');expect(a.provider_record_id).not.toBe(b.provider_record_id);
  expect(a.source_metadata).toMatchObject({apify_connector:'maps',apify_record_id:'1'});
 });
 it('supports nested results and a fixed platform without breaking dataset pagination',async()=>{
  const s={version:2,defaults:{opportunities:'nested'},connectors:{nested:{...posts,results_path:'items'}}};
  const http=async()=>Response.json([{items:[{url:'https://example.test/p/1',text:'Original post 1'},{url:'https://example.test/p/2',text:'Original post 2'}]},{items:[]}]);
  const page=await new ApifyProvider(cfg,s,http).results('opportunities','dataset',0,2);
  expect(page.read).toBe(2);expect(page.done).toBe(false);expect(page.records).toHaveLength(2);
  expect(page.records[0]).toMatchObject({platform:'LinkedIn',post_text:'Original post 1'});
 });
 it('keeps a snapshot usable when defaults and task mappings change',()=>{
  const saved=new ApifyProvider(cfg,settings,undefined,'maps').snapshot('prospects');
  const p=new ApifyProvider(cfg,{version:2,connectors:{}},undefined,saved);
  expect(p.validate('prospects').task_id).toBe('mapsTask');
  expect(p.input('prospects',context).locationQuery).toBe('Abuja, Nigeria');
 });
 it('accepts connector names but rejects raw remote task/config input from callers',()=>{
  expect(jobSchema.parse({kind:'PROSPECT_SEARCH',idempotency_key:'job',apify_connector:'maps'}).apify_connector).toBe('maps');
  expect(()=>jobSchema.parse({kind:'PROSPECT_SEARCH',idempotency_key:'job',task_id:'arbitrary-task'})).toThrow();
  expect(()=>selectionForRequest({kind:'EMAIL_GENERATION',apify_connector:'maps'},cfg)).toThrow(/provider-based/);
  expect(()=>selectionForRequest({kind:'PROSPECT_SEARCH',apify_connector:'maps'},{APIFY_ENABLED:false})).toThrow(/Enable/);
 });
});
