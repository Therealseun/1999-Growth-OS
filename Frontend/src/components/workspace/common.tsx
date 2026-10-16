"use client";
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-provider';
import { connected,type Workspace } from '@/lib/connected';
import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute } from '@/lib/protected-route';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';
export const day=(value:string)=>value.slice(0,10);
export const label=(value:string)=>value.toLowerCase().replaceAll('_',' ');
export function useAction(){
  const client=useQueryClient();
  const mutation=useMutation({mutationFn:(fn:()=>Promise<unknown>)=>fn(),onSuccess:()=>client.invalidateQueries()});
  return {...mutation,run:async(fn:()=>Promise<unknown>)=>{try{await mutation.mutateAsync(fn);return true;}catch{return false;}}};
}
export function Notice({action}:{action:ReturnType<typeof useAction>}){
  return <div aria-live="polite">{action.isError?<p role="alert" className="rounded-lg border border-red-500/30 p-3 text-sm text-red-300">{action.error.message}</p>:action.isSuccess?<p className="text-sm text-emerald-300">Saved.</p>:null}</div>;
}
export function Panel({title,children}:{title:string;children:ReactNode}){return <section className="luxe-card space-y-4 p-5"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>}
export function Field({name,title,defaultValue='',type='text',required=true}:{name:string;title:string;defaultValue?:string|number;type?:string;required?:boolean}){return <label className="block space-y-1 text-sm"><span>{title}</span><input className="luxe-input w-full" name={name} type={type} defaultValue={defaultValue} required={required} min={type==='number'?0:undefined}/></label>}
export function Screen({title,children}:{title:string;children:(w:Workspace)=>ReactNode}){
  return <ProtectedRoute><AppShell title={title}><ScreenData>{children}</ScreenData></AppShell></ProtectedRoute>;
}
function ScreenData({children}:{children:(w:Workspace)=>ReactNode}){
  const {user}=useAuth();
  const query=useQuery({queryKey:['workspace',user?.id],queryFn:connected.workspace,enabled:!!user,refetchInterval:5000});
  if(query.isPending)return <div className="luxe-card p-8" role="status">Loading your workspace…</div>;
  if(query.isError)return <div className="luxe-card space-y-4 p-6"><p role="alert">{query.error.message}</p><Button onClick={()=>query.refetch()}>Try again</Button></div>;
  return <div className="space-y-6">{children(query.data.data)}</div>;
}
export function Pages({page,total,onChange}:{page:number;total:number;onChange:(v:number)=>void}){return <div className="flex items-center justify-between gap-3"><span className="text-sm text-[var(--color-luxe-muted)]">{total} records · page {page} of {Math.max(1,Math.ceil(total/50))}</span><div className="flex gap-2"><Button variant="secondary" disabled={page<=1} onClick={()=>onChange(page-1)}>Previous</Button><Button variant="secondary" disabled={page*50>=total} onClick={()=>onChange(page+1)}>Next</Button></div></div>}
