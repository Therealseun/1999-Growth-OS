import { getSupabaseClient } from './supabase';

const base=()=> (process.env.NEXT_PUBLIC_API_BASE_URL || '/api').replace(/\/$/,'');
export const apiClient={
  async request<T>(path:string,options:RequestInit={}):Promise<T> {
    const supabase=getSupabaseClient();
    const {data:{session},error}=await supabase.auth.getSession();
    if(error)throw error;
    const headers=new Headers(options.headers);
    headers.set('Accept','application/json');
    if(options.body)headers.set('Content-Type','application/json');
    if(session)headers.set('Authorization',`Bearer ${session.access_token}`);
    const response=await fetch(base()+path,{...options,headers,cache:'no-store'});
    if(!response.ok) {
      const payload=await response.json().catch(()=>({}));
      const detail=payload.error ?? payload;
      const fields=detail.details?.fields?.map((f:{path:string;message:string})=>`${f.path}: ${f.message}`).join('; ');
      const err=new Error(detail.message || response.statusText) as Error & {code:string;details:unknown};
      err.code=detail.code || String(response.status);err.details=detail.details;
      if(fields)err.message+=` (${fields})`;
      throw err;
    }
    if(response.status===204)return undefined as T;
    return response.json();
  },
  get<T>(path:string,options?:RequestInit){return this.request<T>(path,{...options,method:'GET'});},
  post<T>(path:string,body?:unknown){return this.request<T>(path,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)});},
  patch<T>(path:string,body:unknown){return this.request<T>(path,{method:'PATCH',body:JSON.stringify(body)});},
  put<T>(path:string,body:unknown){return this.request<T>(path,{method:'PUT',body:JSON.stringify(body)});},
  delete<T>(path:string){return this.request<T>(path,{method:'DELETE'});},
};
