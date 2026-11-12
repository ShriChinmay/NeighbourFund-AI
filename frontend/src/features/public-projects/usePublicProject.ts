import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '../../services/http';
import { publicProjectResponse, publicSlotsResponse } from './contracts';

export function usePublicProject(id:string){const enabled=z.string().uuid().safeParse(id).success;const project=useQuery({queryKey:['public-project',id],enabled,queryFn:()=>request(`/projects/${id}/public`,publicProjectResponse)});const slots=useQuery({queryKey:['public-slots',id],enabled,queryFn:()=>request(`/projects/${id}/slots`,publicSlotsResponse)});return {project,slots,validId:enabled};}
