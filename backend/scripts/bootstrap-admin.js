if(process.env.GROWTHOS_SCHEMA !== 'foundation') throw new Error('Shared database: use an existing team administrator. This bootstrap is disabled.');
import { withTransaction,closePool } from '../lib/db.js';
const at=process.argv.indexOf('--email'),email=at<0?'':process.argv[at+1]?.trim().toLowerCase();
if(!email||!email.includes('@')){console.error('Usage: npm run bootstrap:admin -- --email you@example.com');process.exit(1);}
try {
 await withTransaction(null,async db=>{
   await db.query('lock table profiles in share row exclusive mode');
   const {rows:[p]}=await db.query('select * from profiles where lower(email)=$1',[email]);
   if(!p)throw new Error('No account with this email. Sign up in the app first.');
   if(p.role==='ADMIN'&&p.status==='ACTIVE'){console.log('This account is already an active administrator.');return;}
   const {rowCount}=await db.query("select id from profiles where role='ADMIN' and status='ACTIVE'");
   if(rowCount)throw new Error('An active administrator already exists. Ask them to manage access in Employees.');
   await db.query("select set_config('app.actor',$1,true)",[p.id]);
   await db.query("update profiles set role='ADMIN',status='ACTIVE',approved_by=id,approved_at=now(),updated_at=now() where id=$1",[p.id]);
   console.log('First administrator activated. You can now sign in.');
 });
}catch(err){console.error(err.message);process.exitCode=1;}finally{await closePool();}
