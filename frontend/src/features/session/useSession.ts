import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, request } from '../../services/http';

const role=z.enum(['organiser','reviewer','sponsor','resident','admin']);
const user=z.object({id:z.string(),displayName:z.string(),email:z.string(),role});
const session=z.object({user});
export type Role=z.infer<typeof role>;
export function useSession(){
  const client=useQueryClient();
  const current=useQuery({queryKey:['session'],queryFn:async()=>{try{return (await request('/me',session)).user;}catch(error){if(error instanceof ApiError&&error.status===401)return null;throw error;}},retry:false});
  const switchRole=useMutation({mutationFn:(next:Role)=>request('/auth/switch-role',session,{method:'POST',body:JSON.stringify({role:next})}),onSuccess:async()=>{await client.invalidateQueries();}});
  const logout=useMutation({mutationFn:()=>request('/auth/logout',z.object({success:z.boolean()}),{method:'POST'}),onSuccess:async()=>{client.setQueryData(['session'],null);await client.invalidateQueries();}});
  return {current,switchRole,logout};
}
