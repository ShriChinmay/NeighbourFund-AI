import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '../../services/http';
import { cents, projectResponse } from './contracts';

export function useProject(id:string,authenticated:boolean){
  return useQuery({queryKey:['project',id,authenticated],enabled:z.string().uuid().safeParse(id).success,queryFn:()=>request(`/projects/${id}${authenticated?'':'/public'}`,projectResponse)});
}
export function useProjectMutations(id:string){
  const client=useQueryClient();
  const invalidate=async()=>{await client.invalidateQueries({queryKey:['project']});};
  const create=useMutation({mutationFn:(v:{communityName:string;title:string;description:string;goalDollars:string})=>request('/projects',projectResponse,{method:'POST',body:JSON.stringify({communityName:v.communityName,title:v.title,description:v.description,goalMinor:cents(v.goalDollars)})}),onSuccess:invalidate});
  const saveBudget=useMutation({mutationFn:(lines:{category:string;description:string;dollars:string}[])=>request(`/projects/${id}/budget`,z.object({version:z.number(),budgetIds:z.array(z.string()),totalMinor:z.string()}),{method:'POST',body:JSON.stringify({lines:lines.map(l=>({category:l.category,description:l.description,approvedMinor:cents(l.dollars)}))})}),onSuccess:invalidate});
  const addMilestones=useMutation({mutationFn:(milestones:{title:string;dueDate:string}[])=>request(`/projects/${id}/milestones`,z.object({milestoneIds:z.array(z.string())}),{method:'POST',body:JSON.stringify({milestones:milestones.map(m=>({title:m.title,...(m.dueDate?{dueDate:m.dueDate}:{})}))})}),onSuccess:invalidate});
  return {create,saveBudget,addMilestones};
}
