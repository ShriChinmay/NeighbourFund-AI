import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '../../services/http';
import { acceptanceResponse, feasibilityResponse, invitationResponse, poolResponse, slotResponse } from './contracts';

export function useFunding(projectId: string, role: string | undefined) {
  const cache = useQueryClient();
  const validId = z.string().uuid().safeParse(projectId).success;
  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['project'] }),
      cache.invalidateQueries({ queryKey: ['funding', projectId] }),
    ]);
  };
  const slots = useQuery({
    queryKey: ['funding', projectId, 'slots'],
    enabled: validId,
    queryFn: () => request(`/projects/${projectId}/slots`, slotResponse),
  });
  const pool = useQuery({
    queryKey: ['funding', projectId, 'pool', role],
    enabled: validId && ['organiser','reviewer','admin'].includes(role ?? ''),
    queryFn: () => request(`/projects/${projectId}/pool`, poolResponse),
  });
  const assess = useMutation({
    mutationFn: (input: {households:number;affordablePerHouseholdMinor:number;sponsorCashMinor:number;inKindMinor:number;poolMinor:number}) =>
      request(`/projects/${projectId}/feasibility`, feasibilityResponse, {method:'POST',body:JSON.stringify(input)}),
    onSuccess: invalidate,
  });
  const accept = useMutation({
    mutationFn: (planId: string) => request(`/projects/${projectId}/funding-plan/accept`, acceptanceResponse, {method:'POST',body:JSON.stringify({planId})}),
    onSuccess: invalidate,
  });
  const invite = useMutation({
    mutationFn: (count: number) => request(`/projects/${projectId}/households/invite`, invitationResponse, {method:'POST',body:JSON.stringify({count})}),
    onSuccess: invalidate,
  });
  const allocate = useMutation({
    mutationFn: (input: {householdId:string;coveredByPool:boolean}) => request(`/projects/${projectId}/pool/allocate`, z.object({household:z.object({id:z.string().uuid(),coveredByPool:z.boolean()})}), {method:'POST',body:JSON.stringify(input)}),
    onSuccess: invalidate,
  });
  return {slots,pool,assess,accept,invite,allocate};
}
