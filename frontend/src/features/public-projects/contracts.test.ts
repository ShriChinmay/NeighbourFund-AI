import { describe,expect,it } from 'vitest';
import { latestBudget,latestBudgetTotal,publicProjectResponse,publicSlotsResponse } from './contracts';
const id='11111111-1111-4111-8111-111111111111';
const project={id,communityName:'Local community',title:'Lighting',description:'Street lights',goalMinor:'10000',status:'funding',milestones:[],budgets:[{id,category:'Old',description:'',approvedMinor:'10000',version:1},{id,category:'New A',description:'',approvedMinor:'4000',version:2},{id,category:'New B',description:'',approvedMinor:'6000',version:2}]};
describe('public project contracts',()=>{
 it('accepts a public project response',()=>expect(publicProjectResponse.safeParse({project}).success).toBe(true));
 it('rejects invalid financial strings',()=>expect(publicProjectResponse.safeParse({project:{...project,goalMinor:'$100'}}).success).toBe(false));
 it('uses only the latest budget version',()=>{expect(latestBudget(project).lines).toHaveLength(2);expect(latestBudgetTotal(project)).toBe('10000');});
 it('accepts empty funding slots',()=>expect(publicSlotsResponse.parse({slots:[]}).slots).toEqual([]));
});
