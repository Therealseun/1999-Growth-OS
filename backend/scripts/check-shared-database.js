import { getConfig } from '../lib/config.js';
import { withTransaction,closePool } from '../lib/db.js';
import { checkBase } from '../shared/db.js';
try {
 if(getConfig().GROWTHOS_SCHEMA!=='shared')throw new Error('Set GROWTHOS_SCHEMA=shared for the team database.');
 await withTransaction(null,async db=>{
  await db.query('set transaction read only');
  await checkBase(db);
  const {rows:[r]}=await db.query("select to_regclass('growthos_ai.version') is not null as installed");
  console.log('Read-only connection check passed. Existing team schema found.');
  if(r.installed){const {rows:[v]}=await db.query('select version from growthos_ai.version');console.log(`AI extension version: ${v?.version??'unknown'}.`);}
  else console.log('AI extension is not installed. Existing app screens can still be used. Review backend/shared/migrations/0001_ai_extension.sql with your team before installing it.');
 });
} catch(err){console.error(`Database check failed: ${err.message}`);process.exitCode=1;}
finally{await closePool();}
