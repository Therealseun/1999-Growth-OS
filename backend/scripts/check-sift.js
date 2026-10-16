import { aiConfig, WorkError } from '../ai/config.js';
import { SiftProvider } from '../ai/sift.js';

// GET requests only: does not create searches, import contacts or use the database.
try {
  const cfg=aiConfig();
  const provider=new SiftProvider(cfg);
  provider.validate('prospects');
  if (cfg.SIFT_EXECUTION_MODE !== 'start') throw new WorkError('SIFT_MODE','For Sift-main (4), set SIFT_EXECUTION_MODE=start.');
  const access=await provider.request('/api/discover/access');
  if (typeof access.hasAccess !== 'boolean') throw new WorkError('SIFT_VERSION','Sift did not return the expected access response. Confirm the updated backend is deployed.');
  const identity=await provider.request('/api/discover/quota');
  if (typeof identity.email !== 'string' || identity.email.toLowerCase() !== cfg.SIFT_OWNER_EMAIL.toLowerCase()) {
    throw new WorkError('SIFT_IDENTITY','SIFT_OWNER_EMAIL must match the Sift account that issued your token.');
  }
  console.log('Sift authentication and account identity checks passed.');
  if (!access.hasAccess) throw new WorkError('SIFT_ACCESS_REQUIRED','Sign-in works, but this account needs an active plan or a live free access window before starting research.');
  console.log('This Sift account currently has research access.');
  const recent=await provider.request('/api/discover/jobs?limit=5');
  if (!Array.isArray(recent.jobs)) throw new WorkError('SIFT_VERSION','Sift did not return the expected search list.');
  if (recent.jobs.some(j=>['pending','running'].includes(j.status))) {
    console.log('Recent searches include pending/running work. Check Sift before starting another search; active searches can cause HTTP 409.');
  }
  console.log('Read-only Sift check passed. Next: run a small new prospect search in GrowthOS with provider Sift.');
  console.log('This check does not verify map services, website extraction or end-to-end delivery.');
} catch (err) {
  // Never print request headers, upstream bodies, JWTs or environment contents.
  console.error(err instanceof WorkError ? `${err.code}: ${err.message}` : 'Sift check failed. Check the backend environment values and network connection.');
  process.exitCode=1;
}
