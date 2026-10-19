import type { NextRequest } from 'next/server';

// Same-origin server proxy. The target is server configuration, never a URL supplied by a caller.
export const dynamic='force-dynamic';
type Context={params:Promise<{path?:string[]}>};
async function proxy(request:NextRequest,context:Context) {
  const origin=process.env.GROWTHOS_BACKEND_URL || (process.env.NODE_ENV==='development'?'http://127.0.0.1:4000':'');
  if(!origin)return Response.json({error:{code:'BACKEND_NOT_CONFIGURED',message:'The application backend is not configured.'}},{status:503});
  const {path=[]}=await context.params;
  const target=new URL('/api/'+path.map(encodeURIComponent).join('/'),origin);
  target.search=request.nextUrl.search;
  const headers=new Headers({Accept:'application/json'});
  const authorization=request.headers.get('authorization');if(authorization)headers.set('Authorization',authorization);
  if(request.headers.get('content-type'))headers.set('Content-Type',request.headers.get('content-type')!);
  try {
    const body=['GET','HEAD'].includes(request.method)?undefined:await request.text();
    if(body && new TextEncoder().encode(body).length>1_048_576)return Response.json({error:{code:'PAYLOAD_TOO_LARGE',message:'Request is too large.'}},{status:413});
    const upstream=await fetch(target,{method:request.method,headers,body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(35000)});
    return new Response(upstream.body,{status:upstream.status,headers:{'Content-Type':upstream.headers.get('content-type') || 'application/json','Cache-Control':'no-store',...(upstream.headers.get('x-request-id')?{'x-request-id':upstream.headers.get('x-request-id')!}:{})}});
  }catch{return Response.json({error:{code:'BACKEND_UNAVAILABLE',message:'Cannot reach the GrowthOS API. Check that the backend is running.'}},{status:502});}
}
export const GET=proxy;export const POST=proxy;export const PATCH=proxy;export const PUT=proxy;export const DELETE=proxy;
