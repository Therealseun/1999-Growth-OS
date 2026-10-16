import { describe,it,expect,vi } from 'vitest';
import { aiConfig } from '../ai/config.js';
import { SiftProvider } from '../ai/sift.js';

const cfg=aiConfig({SIFT_ENABLED:'true',SIFT_BASE_URL:'https://sift.example.test',SIFT_API_KEY:'fixture-token',SIFT_OWNER_EMAIL:'owner@example.test',SIFT_EXECUTION_MODE:'start'});
const input={queries:['schools Abuja'],market:'Abuja, Nigeria',count:5};
describe('current Sift HTTP contract',()=>{
  it('sends the account token and creates a search without treating creation as execution',async()=>{
    const http=vi.fn(async()=>Response.json({ok:true,jobId:'sift-1',job:{status:'pending'}}));
    const provider=new SiftProvider(cfg,http);
    expect(await provider.start('prospects',input)).toEqual({id:'sift-1'});
    expect(http).toHaveBeenCalledTimes(1);
    const [url,options]=http.mock.calls[0];
    expect(url).toBe('https://sift.example.test/api/discover/jobs');
    expect(options.headers.Authorization).toBe('Bearer fixture-token');
    expect(JSON.parse(options.body)).toMatchObject({query:'schools Abuja',filters:{region:'Abuja, Nigeria',requireEmail:true},requestedVolume:5});
  });
  it('starts the existing search and keeps polling after the start acknowledgment',async()=>{
    const http=vi.fn(async(url)=>Response.json(url.endsWith('/start')?{ok:true,alreadyRunning:false}:{ok:true,job:{id:'sift-1',status:'running'}}));
    const provider=new SiftProvider(cfg,http);
    await provider.prepare('sift-1');
    expect(http).not.toHaveBeenCalled();
    await provider.execute('sift-1',5);
    expect(http.mock.calls[0][0]).toBe('https://sift.example.test/api/discover/jobs/sift-1/start');
    expect(await provider.poll('sift-1',{execution_finished:true,execution_mode:'start'})).toEqual({done:false});
  });
  it.each([[401,'SIFT_ACCESS_DENIED'],[402,'SIFT_ACCESS_REQUIRED'],[409,'SIFT_ACCOUNT_BUSY']])('explains HTTP %s without adopting another search',async(status,code)=>{
    const http=vi.fn(async()=>Response.json({error:'rejected',jobId:'someone-elses-search'},{status}));
    await expect(new SiftProvider(cfg,http).start('prospects',input)).rejects.toMatchObject({code,retryable:false});
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('retries only the documented busy start response; ambiguous starts remain fenced',async()=>{
    const http=vi.fn().mockResolvedValueOnce(Response.json({error:'busy'},{status:503}))
      .mockResolvedValueOnce(Response.json({error:'unexpected'},{status:503}));
    const provider=new SiftProvider(cfg,http);
    await expect(provider.execute('sift-1',5)).rejects.toMatchObject({code:'SIFT_BUSY',retryable:true});
    await expect(provider.execute('sift-1',5)).rejects.toMatchObject({code:'SIFT_EXECUTION_UNCERTAIN',retryable:false});
  });
  it('retains the execution mode of an existing job after configuration changes',async()=>{
    const http=vi.fn(async()=>Response.json({ok:true}));
    const provider=new SiftProvider(cfg,http);
    await provider.prepare('old-job','explicit');
    await provider.execute('old-job',5,'explicit');
    expect(http.mock.calls.map(([url])=>new URL(url).pathname)).toEqual(['/api/discover/rephrase','/api/discover/jobs/old-job/run-resolve']);
  });
});
