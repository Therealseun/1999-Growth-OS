import { describe, it, expect, vi } from 'vitest';
import { aiConfig } from '../ai/config.js';
import { SiftProvider, normalizeSiftRows } from '../ai/sift.js';
import { JsonModel } from '../ai/model.js';
const cfg=aiConfig({SIFT_ENABLED:'true',SIFT_BASE_URL:'https://sift.example.test',SIFT_API_KEY:'secret-test-key',SIFT_OWNER_EMAIL:'integration@example.test'});
const context={queries:['Schools Lagos'],query_index:0,count:600,market:'Lagos, Nigeria',idempotency_key:'job-1'};

describe('Sift HTTP contract',()=>{
  it('requires secure configuration and a real query with an explicit location',()=>{
    expect(()=>aiConfig({SIFT_ENABLED:'true'})).toThrow(/required/);
    expect(()=>aiConfig({SIFT_BASE_URL:'http://sift.example.test'})).toThrow(/HTTPS/);
    expect(()=>aiConfig({SIFT_BASE_URL:'https://sift.example.test/api'})).toThrow(/origin/);
    expect(()=>new SiftProvider(cfg).input('prospects',{...context,market:''})).toThrow(/location/);
    expect(()=>new SiftProvider(cfg).validate('opportunities')).toThrow(/social posts/);
  });
  it('uses actual Sift endpoints and configured service authentication',async()=>{
    const fetcher=vi.fn(async()=>Response.json({ok:true,jobId:'job-uuid-1'}));
    const p=new SiftProvider(cfg,fetcher);
    expect(await p.start('prospects',context)).toEqual({id:'job-uuid-1'});
    const [url,options]=fetcher.mock.calls[0];
    expect(url).toBe('https://sift.example.test/api/discover/jobs');
    expect(options.headers.Authorization).toBe('Bearer secret-test-key');
    expect(options.headers['Idempotency-Key']).toBe('job-1');
    expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body)).toEqual({query:'Schools Lagos',filters:{region:'Lagos, Nigeria',requireEmail:true},requestedVolume:100,ownerEmail:'integration@example.test'});
    expect(url).not.toContain('secret-test-key');
  });
  it('supports a server-agreed integration key header',async()=>{
    const fetcher=vi.fn(async()=>Response.json({ok:true,jobId:'a'}));
    await new SiftProvider({...cfg,SIFT_AUTH_HEADER:'X-Integration-Key'},fetcher).start('prospects',context);
    expect(fetcher.mock.calls[0][1].headers['X-Integration-Key']).toBe('secret-test-key');
  });
  it('preserves numeric IDs, phone and source evidence without invented contact names',()=>{
    const out=normalizeSiftRows([{id:123,business_name:'A school',email:'A@Example.test',phone:'+2348000000000',website:'https://school.test',address:'Lagos',source:'osm',metadata:{osmId:'node/123',contact_page_url:'https://school.test/contact'}}],'job-1');
    expect(out.records[0]).toMatchObject({provider_record_id:'123',research_provider:'sift',email:'a@example.test',contact_name:null,industry:null,phone:'+2348000000000',source_url:'https://www.openstreetmap.org/node/123',source_metadata:{sift_job_id:'job-1',osm_id:'node/123'}});
    expect(normalizeSiftRows([null,{id:1,business_name:''}],'job-1').invalid).toBe(2);
  });
  it('paginates results and detects malformed or cross-job responses',async()=>{
    const f=vi.fn().mockResolvedValueOnce(Response.json({ok:true,total:2,results:[{id:1,job_id:'j',business_name:'One'}]}))
      .mockResolvedValueOnce(Response.json({ok:true,total:2,results:[{id:2,job_id:'j',business_name:'Two'}]}))
      .mockResolvedValueOnce(Response.json({total:1,results:[{job_id:'different',business_name:'Wrong'}]}));
    const p=new SiftProvider(cfg,f);
    expect((await p.results('prospects','j',0,1)).done).toBe(false);
    expect((await p.results('prospects','j',1,1)).done).toBe(true);
    expect(f.mock.calls[1][0]).toContain('offset=1');
    await expect(p.results('prospects','j')).rejects.toMatchObject({code:'SIFT_INVALID_RESPONSE'});
  });
  it('reads partial results on exhaustion, failure, legacy return or deadline',async()=>{
    const f=vi.fn(async()=>Response.json({ok:true,job:{id:'j',status:'running'}}));
    const p=new SiftProvider(cfg,f);
    expect(await p.poll('j',{started_at:Date.now()})).toEqual({done:false});
    expect(await p.poll('j',{execution_finished:true})).toMatchObject({done:true,outcome:'exhausted',dataset_id:'j'});
    expect(await p.poll('j',{started_at:Date.now()-cfg.SIFT_JOB_TIMEOUT_MS-1})).toMatchObject({done:true,outcome:'timeout'});
    f.mockResolvedValueOnce(Response.json({job:{status:'failed'}}));
    expect(await p.poll('j')).toMatchObject({done:true,outcome:'failed'});
    f.mockResolvedValueOnce(Response.json({job:{status:'cancelled'}}));
    await expect(p.poll('j')).rejects.toMatchObject({code:'SIFT_CANCELLED'});
  });
  it('distinguishes definite rejections from ambiguous launch/execution outcomes',async()=>{
    const f=vi.fn(async()=>{throw new Error('socket reset');});
    const p=new SiftProvider(cfg,f);
    await expect(p.start('prospects',context)).rejects.toMatchObject({code:'SIFT_START_UNCERTAIN',retryable:false});
    await expect(p.execute('j',10)).rejects.toMatchObject({code:'SIFT_EXECUTION_UNCERTAIN',retryable:false});
    f.mockResolvedValueOnce(Response.json({error:'unauthorized'},{status:401}));
    await expect(p.start('prospects',context)).rejects.toMatchObject({code:'SIFT_ACCESS_DENIED'});
    f.mockResolvedValueOnce(Response.json({error:'bad query'},{status:400}));
    await expect(p.start('prospects',context)).rejects.toMatchObject({code:'SIFT_REQUEST_REJECTED',retryable:false});
    f.mockResolvedValueOnce(Response.json({ok:true}));
    await expect(p.start('prospects',context)).rejects.toMatchObject({code:'SIFT_START_UNCERTAIN'});
  });
  it('retains retry-after backoff for Sift and the AI endpoint',async()=>{
    const f=vi.fn(async()=>Response.json({error:'limit'},{status:429,headers:{'retry-after':'90'}}));
    await expect(new SiftProvider(cfg,f).poll('j')).rejects.toMatchObject({retryAfterMs:90000,retryable:true});
    const model=new JsonModel(aiConfig({AI_ENABLED:'true',AI_CHAT_URL:'https://model.example.test/chat',AI_MODEL:'example'}),f);
    await expect(model.generate('email',{})).rejects.toMatchObject({retryAfterMs:90000,retryable:true});
  });
});
