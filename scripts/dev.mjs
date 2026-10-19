import { existsSync,readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const problems=[];
if(Number(process.versions.node.split('.')[0])<24)problems.push('Use Node.js 24 or newer.');
function env(path) {
  const file=resolve(root,path);
  if(!existsSync(file)){problems.push(`${path} is missing. Run npm run setup first.`);return {};}
  const values=parseEnv(readFileSync(file,'utf8'));
  for(const [key,value] of Object.entries(process.env))if(value!==undefined&&value!=='')values[key]=value;
  return values;
}
const back=env('backend/.env'),front=env('Frontend/.env.local');
for(const key of ['DATABASE_URL','SUPABASE_URL','SUPABASE_ANON_KEY','CRON_SECRET'])if(!back[key]||/PROJECT|USER:PASSWORD|replace-with/.test(back[key]))problems.push(`Fill ${key} in backend/.env.`);
if(!front.NEXT_PUBLIC_SUPABASE_URL||front.NEXT_PUBLIC_SUPABASE_URL.includes('PROJECT'))problems.push('Fill NEXT_PUBLIC_SUPABASE_URL in Frontend/.env.local.');
if(!(front.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||front.NEXT_PUBLIC_SUPABASE_ANON_KEY))problems.push('Fill NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Frontend/.env.local.');
if(back.SUPABASE_URL?.replace(/\/$/,'')!==front.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,''))problems.push('Frontend and backend must use the same Supabase project URL.');
if(back.CRON_SECRET && back.CRON_SECRET.length<32)problems.push('CRON_SECRET needs at least 32 characters.');
if(front.NEXT_PUBLIC_API_BASE_URL)problems.push('Remove NEXT_PUBLIC_API_BASE_URL for the standard same-origin local setup.');
const port=Number(back.PORT||4000);
if(!Number.isInteger(port)||port<1||port>65535||port===3000)problems.push('Backend PORT must be a valid port other than frontend port 3000.');
try {const url=new URL(front.GROWTHOS_BACKEND_URL||'http://127.0.0.1:4000');if(!['localhost','127.0.0.1'].includes(url.hostname)||Number(url.port||80)!==port||url.pathname!=='/')problems.push('Set GROWTHOS_BACKEND_URL to http://127.0.0.1:<backend PORT> for local development.');}catch{problems.push('GROWTHOS_BACKEND_URL must be a valid backend URL.');}
for(const path of ['backend/node_modules/hono/package.json','Frontend/node_modules/next/dist/bin/next'])if(!existsSync(resolve(root,path)))problems.push('Dependencies are missing. Run npm run setup.');
if(problems.length){console.error([...new Set(problems)].map(p=>`• ${p}`).join('\n'));process.exit(1);}
if(process.argv.includes('--check')){console.log('Local configuration and dependency checks passed. Database access and external services still need a live check.');process.exit(0);}
const children=[];let stopping=false;
function stop(code=0){
 if(stopping)return;stopping=true;process.exitCode=code;
 for(const child of children) {
   if(!child.pid)continue;
   if(process.platform==='win32')spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});
   else {try{process.kill(-child.pid,'SIGTERM');}catch{}}
 }
 const timer=setTimeout(()=>{for(const child of children){if(process.platform!=='win32'){try{process.kill(-child.pid,'SIGKILL');}catch{}}}process.exit(code);},5000);timer.unref();
}
function start(name,directory,args){
 const child=spawn(process.execPath,args,{cwd:resolve(root,directory),env:{...process.env},stdio:['inherit','pipe','pipe'],detached:process.platform!=='win32'});
 children.push(child);
 for(const [stream,target] of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',chunk=>target.write(`[${name}] ${chunk}`));
 child.on('error',err=>{console.error(`${name} failed: ${err.message}`);stop(1);});
 child.on('exit',code=>{if(!stopping){console.error(`${name} stopped. Stopping the other services.`);stop(code||1);}});
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
console.log('Starting GrowthOS: open http://localhost:3000. Ctrl+C stops all three processes.');
start('API','backend',['--watch','--env-file=.env','server.js']);
start('worker','backend',['--env-file=.env','ai/worker.js']);
start('web','Frontend',['node_modules/next/dist/bin/next','dev','--port','3000']);
