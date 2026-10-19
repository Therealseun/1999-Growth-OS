import { existsSync,copyFileSync,readFileSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
if(Number(process.versions.node.split('.')[0])<24)throw new Error('Use Node.js 24 or newer.');
for(const [sample,dest] of [['backend/.env.example','backend/.env'],['Frontend/.env.example','Frontend/.env.local']]) {
  const target=resolve(root,dest);
  if(!existsSync(target)) {
    copyFileSync(resolve(root,sample),target);
    if(dest==='backend/.env')writeFileSync(target,readFileSync(target,'utf8').replace('replace-with-at-least-32-random-characters',randomBytes(32).toString('hex')));
    console.log(`Created ${dest}.`);
  } else console.log(`Kept existing ${dest}.`);
}
for(const directory of ['backend','Frontend']) {
  console.log(`Installing ${directory} dependencies…`);
  if(!process.env.npm_execpath) throw new Error('Start setup using npm run setup from the project root.');
  const result=spawnSync(process.execPath,[process.env.npm_execpath,'ci','--no-audit','--no-fund'],{cwd:resolve(root,directory),stdio:'inherit',shell:false});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
console.log('\nNext: fill backend/.env and Frontend/.env.local, run npm run check:setup, then npm run dev here. Do not run the old foundation SQL against your team database. See START-HERE.md.');
