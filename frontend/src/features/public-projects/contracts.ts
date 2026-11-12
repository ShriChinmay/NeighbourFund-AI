import { z } from 'zod';

export const publicBudget = z.object({id:z.string().uuid(),category:z.string(),description:z.string(),approvedMinor:z.string().regex(/^\d+$/),version:z.number().int().positive()});
export const publicMilestone = z.object({id:z.string().uuid(),title:z.string(),status:z.string(),dueDate:z.string().nullable()});
export const publicProjectResponse = z.object({project:z.object({id:z.string().uuid(),communityName:z.string(),title:z.string(),description:z.string(),goalMinor:z.string().regex(/^\d+$/),status:z.string(),budgets:z.array(publicBudget),milestones:z.array(publicMilestone)})});
export const publicSlotsResponse = z.object({slots:z.array(z.object({id:z.string().uuid(),budgetId:z.string().uuid(),label:z.string(),amountMinor:z.string().regex(/^\d+$/),status:z.string()}))});
export type PublicProject = z.infer<typeof publicProjectResponse>['project'];
export type PublicSlot = z.infer<typeof publicSlotsResponse>['slots'][number];
export function latestBudget(project:PublicProject){const version=project.budgets.reduce((v,b)=>Math.max(v,b.version),0);return {version,lines:project.budgets.filter(b=>b.version===version)};}
export function latestBudgetTotal(project:PublicProject){return latestBudget(project).lines.reduce((sum,line)=>sum+BigInt(line.approvedMinor),0n).toString();}
export function hasFundingSlots(slots:PublicSlot[]){return slots.length>0;}
