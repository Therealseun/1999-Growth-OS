import { aiConfig,apifySettings,WorkError } from '../ai/config.js';
import { apifyRegistry } from '../ai/apify-config.js';
import { ApifyProvider } from '../ai/research.js';

try{
 const cfg=aiConfig();
 if(!cfg.APIFY_ENABLED)throw new WorkError('APIFY_DISABLED','Configure APIFY_TOKEN/APIFY_CONFIG_FILE and enable Apify first.');
 const {connectors,defaults}=apifyRegistry(apifySettings(cfg)),list=Object.values(connectors);
 if(!list.length)throw new WorkError('APIFY_CONFIG_INVALID','No enabled Apify scrapers. Fill a saved task ID and set its enabled flag to true.');
 for(const selection of list){
  const p=new ApifyProvider(cfg,{},undefined,selection);
  p.input(selection.kind,{queries:['example business'],query_text:'example business',market:'Example city',niche:'Example niche',count:1});
  if(process.argv.includes('--remote')){
   const result=await p.request(`actor-tasks/${encodeURIComponent(selection.task_id)}`);
   if(!result.data?.id)throw new WorkError('APIFY_INVALID_RESPONSE','An Apify task lookup did not return a task ID.');
  }
  console.log(`${selection.label} (${selection.kind})${defaults[selection.kind]===selection.id?' — default':''}: configuration valid${process.argv.includes('--remote')?', saved task accessible':''}.`);
 }
 if(cfg.APIFY_MAX_CHARGE_USD===0)console.log('The global per-event charge allowance is 0. Paid event runs may not start or return results. Set an agreed allowance before a paid test; this is not a universal account spending limit.');
 console.log(process.argv.includes('--remote')?'Read-only Apify task checks passed. No runs started.':'Local Apify configuration checks passed. Add --remote to check saved-task access without starting runs.');
 console.log('Actual Actor inputs and result mappings still need a small live test for each scraper.');
}catch(err){
 console.error(err instanceof WorkError?`${err.code}: ${err.message}`:'Apify check failed. Check the backend environment settings.');
 process.exitCode=1;
}
