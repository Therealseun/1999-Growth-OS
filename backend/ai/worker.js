import { setTimeout as wait } from 'node:timers/promises';
import { aiConfig } from './config.js';
import { getConfig } from '../lib/config.js';
import { closePool } from '../lib/db.js';


const runtime=getConfig();
const {runOnce}=await import(runtime.GROWTHOS_SCHEMA === 'shared' ? '../shared/processor.js' : './processor.js');
if(!runtime.AI_WORKER_ENABLED) console.log('AI worker idle. Set AI_WORKER_ENABLED=true after reviewing the extension and provider settings.');
const cfg=aiConfig();
let stopping=false;
process.on('SIGINT',()=>{stopping=true;});
process.on('SIGTERM',()=>{stopping=true;});
try {
  do {
    if(runtime.AI_WORKER_ENABLED) await runOnce({cfg});
    if (process.argv.includes('--once')) break;
    if (!stopping) await wait(cfg.AI_WORKER_INTERVAL_MS);
  } while (!stopping);
} finally { await closePool(); }
