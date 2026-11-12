import { z } from 'zod';

export const budgetSchema = z.object({ id:z.string(), category:z.string(), description:z.string(), approvedMinor:z.string(), version:z.number() });
export const milestoneSchema = z.object({ id:z.string(), title:z.string(), status:z.string(), dueDate:z.string().nullable() });
export const projectSchema = z.object({ id:z.string().uuid(), communityName:z.string(), title:z.string(), description:z.string(), goalMinor:z.string(), status:z.string(), budgets:z.array(budgetSchema), milestones:z.array(milestoneSchema), organiserId:z.string().uuid().optional() });
export const projectResponse = z.object({project:projectSchema});
export const createProjectInput = z.object({communityName:z.string().trim().min(1).max(160),title:z.string().trim().min(1).max(160),description:z.string().max(5000),goalDollars:z.string().refine(v=>/^\d+(\.\d{1,2})?$/.test(v)&&Number(v)>0,'Enter a positive USD amount with at most two decimals')});
export const budgetLineInput = z.object({category:z.string().trim().min(1).max(160),description:z.string(),dollars:z.string().refine(v=>/^\d+(\.\d{1,2})?$/.test(v),'Enter a nonnegative USD amount with at most two decimals')});
export const milestoneInput = z.object({title:z.string().trim().min(1).max(160),dueDate:z.string()});
export type Project = z.infer<typeof projectSchema>;
export function cents(value:string):number {const [whole,fraction='']=value.split('.');const result=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(result))throw new Error('Amount exceeds safe integer range');return result;}
export function money(minor:string|number):string {return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(minor)/100);}
