import { apiClient } from './api';
export type Person={id:string;name:string;email:string;role:'ADMIN'|'MANAGER'|'EMPLOYEE';status:'ACTIVE'|'PENDING'|'DISABLED';department_id:string|null};
export type Campaign={id:string;name:string;niche:string;offer:string;location:string;objective:string;status:'DRAFT'|'ACTIVE'|'PAUSED'|'ARCHIVED';department_id:string};
export type Job={id:string;campaign_id:string;kind:string;status:string;requested_count:number;delivered_count:number;workload_id:string|null;error:string|null;error_code:string|null;active_research_provider:string;external_job_id:string|null;summary:Record<string,unknown>|null};
export type Workload={workload_id:string;campaign_id:string;employee_id:string;employee_name:string;work_date:string;email_target_snapshot:number;seo_target_snapshot:number;lead_magnet_target_snapshot:number;total_target_snapshot:number;carried_in_email:number;carried_in_seo:number;carried_in_lead_magnet:number;email_completed:number;seo_completed:number;lead_magnet_completed:number;total_completed:number;completion_pct:number|null};
export type Workspace={profile:Person;today:string;timezone:string;campaigns:Campaign[];departments:{id:string;name:string}[];people:Person[];workloads:Workload[];targets:{id:string;campaign_id:string;email_daily_target:number;seo_daily_target:number;lead_magnet_daily_target:number;effective_from:string}[];jobs:Job[];assignments:{campaign_id:string;employee_id:string;active:boolean}[]};
export type Niche={id:string;version:number;status:string;profile:Record<string,unknown>};
export type Task={id:string;workstream:'EMAIL'|'SEO'|'LEAD_MAGNET';campaign_name:string;campaign_id:string;employee_name:string|null;employee_id:string|null;title:string;status:string;created_at:string;subject?:string;body?:string;article?:string;comment?:string;post_text?:string;post_url?:string;platform?:string;primary_keyword?:string;meta_title?:string;meta_description?:string;prospect?:{organisation:string;email:string|null;contact_name:string|null};evidence?:{id:string;evidence_type:string;evidence_value:string;created_at:string}[]};
export type Prospect={id:string;organisation:string;email:string|null;website:string|null;location:string|null;qualification_status:string;qualification_reason:string|null;campaign_name:string;research_provider:string};
export const connected={
  workspace:()=>apiClient.get<{data:Workspace}>('/workspace'),
  command:(body:unknown)=>apiClient.post('/workspace',body),
  campaign:(id:string)=>apiClient.get<{data:{campaign:Campaign;profiles:Niche[];jobs:Job[];counts:{prospects:number;qualified:number}}}>(`/workspace/campaigns/${id}`),
  enqueue:(id:string,body:unknown)=>apiClient.post<{data:Job}>(`/campaigns/${id}/ai-jobs`,body),
  approve:(id:string,profile_id:string)=>apiClient.post(`/campaigns/${id}/niche-profile/approve`,{profile_id}),
  retry:(id:string,body:unknown={})=>apiClient.post(`/ai-jobs/${id}/retry`,body),
  recover:(id:string,body:unknown)=>apiClient.post(`/ai-jobs/${id}/recover-research`,body),
};
