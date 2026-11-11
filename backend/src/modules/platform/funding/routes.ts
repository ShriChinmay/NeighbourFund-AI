import { Router } from "express";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { getPool } from "../../../config/database.js";
import { recordAudit } from "../auth/repository.js";
import { requireRoles } from "../auth/session.js";

export const fundingRouter = Router();
const uuid = z.string().uuid();
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const feasibilityInput = z.object({
  households: z.number().int().min(1).max(100000),
  affordablePerHouseholdMinor: money,
  sponsorCashMinor: money.default(0),
  inKindMinor: money.default(0),
  poolMinor: money.default(0),
}).strict();
const acceptInput = z.object({ planId: uuid }).strict();
const inviteInput = z.object({ count: z.number().int().min(1).max(1000) }).strict();
const allocateInput = z.object({ householdId: uuid, coveredByPool: z.boolean() }).strict();

function error(res: import("express").Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}
function parse<T>(schema: z.ZodType<T>, value: unknown, res: import("express").Response): T | undefined {
  const result = schema.safeParse(value);
  if (!result.success) { error(res, 400, "VALIDATION_ERROR", result.error.message); return; }
  return result.data;
}
async function lockProject(client: import("pg").PoolClient, id: string, user: {id:string;role:string}) {
  const result = await client.query<{organiser_id:string;goal_minor:string;status:string}>(
    'SELECT organiser_id,goal_minor::text,status FROM projects WHERE id=$1 FOR UPDATE', [id]);
  if (!result.rowCount) return { status:404 as const };
  const row = result.rows[0]!;
  if (user.role !== "admin" && (user.role !== "organiser" || row.organiser_id !== user.id)) return { status:403 as const };
  return { status:200 as const, row };
}
const guard = (req:import("express").Request,res:import("express").Response) => {
  if (!uuid.safeParse(req.params.id).success) { error(res,400,"VALIDATION_ERROR","Invalid project ID"); return false; }
  return true;
};
const stringMoney = (n: bigint) => n.toString();
const summary = (goal:bigint, households:number, affordable:bigint, sponsor:bigint, inKind:bigint, pool:bigint) => {
  const partners = sponsor + inKind + pool;
  const remaining = goal > partners ? goal-partners : 0n;
  const perHousehold = (remaining + BigInt(households)-1n)/BigInt(households);
  const residentCapacity = affordable * BigInt(households);
  const verdict = partners > goal ? "needs_rescope" :
    remaining <= residentCapacity ? "resident_fundable" :
    partners > 0n ? "needs_partners" : "needs_rescope";
  return { verdict, perHouseholdMinor:stringMoney(perHousehold),
    residentRequiredMinor:stringMoney(remaining), residentCapacityMinor:stringMoney(residentCapacity),
    gapMinor:stringMoney(remaining > residentCapacity ? remaining-residentCapacity : 0n) };
};

fundingRouter.post("/projects/:id/feasibility", requireRoles("organiser","admin"), async (req,res,next)=>{
  if (!guard(req,res)) return;
  const data=parse(feasibilityInput,req.body,res); if(!data)return;
  const client=await getPool().connect().catch(next); if(!client)return;
  try {
    await client.query("BEGIN");
    const project=await lockProject(client,req.params.id as string,req.auth!);
    if(project.status!==200) {await client.query("ROLLBACK");return error(res,project.status,"PROJECT_ACCESS_DENIED","Project missing or access denied");}
    if(project.row.status==="complete"||project.row.status==="delivering") {
      await client.query("ROLLBACK");return error(res,409,"PROJECT_LOCKED","Cannot replan a delivering or completed project");
    }
    const goal=BigInt(project.row.goal_minor);
    const sponsor=BigInt(data.sponsorCashMinor), inKind=BigInt(data.inKindMinor), pool=BigInt(data.poolMinor);
    const result=summary(goal,data.households,BigInt(data.affordablePerHouseholdMinor),sponsor,inKind,pool);
    const assumptions={ affordablePerHouseholdMinor:String(data.affordablePerHouseholdMinor) };
    const scenarios=[{...result,goalMinor:stringMoney(goal)}];
    const inserted=await client.query<{id:string}>(`INSERT INTO funding_plans
      (project_id,households,assumptions_json,scenarios_json,verdict)
      VALUES ($1,$2,$3::jsonb,$4::jsonb,$5) RETURNING id`,
      [req.params.id,data.households,JSON.stringify(assumptions),JSON.stringify(scenarios),result.verdict]);
    const planId=inserted.rows[0]!.id;
    const lines:[string,bigint,string][]=[
      ["resident",BigInt(result.residentRequiredMinor),"Household funding required"],
      ["sponsor_cash",sponsor,"Proposed sponsor contribution"],
      ["in_kind",inKind,"Proposed in-kind contribution"],
      ["pool",pool,"Proposed community pool allocation"]
    ];
    for(const [type,amount,rationale] of lines) if(amount>0n)
      await client.query(`INSERT INTO funding_plan_lines(plan_id,source_type,amount_minor,rationale)
        VALUES ($1,$2,$3,$4)`,[planId,type,amount.toString(),rationale]);
    await recordAudit({actorId:req.auth!.id,entity:"projects",entityId:req.params.id as string,
      action:"feasibility_assessed",metadata:{planId,verdict:result.verdict}},client);
    await client.query("COMMIT");
    res.status(201).json({planId,households:data.households,...result,accepted:false});
  }catch(e){await client.query("ROLLBACK").catch(()=>{});next(e);}
  finally{client.release();}
});

fundingRouter.post("/projects/:id/funding-plan/accept",requireRoles("organiser","admin"),async(req,res,next)=>{
  if(!guard(req,res))return;
  const data=parse(acceptInput,req.body,res);if(!data)return;
  const client=await getPool().connect().catch(next);if(!client)return;
  try{
    await client.query("BEGIN");
    const project=await lockProject(client,req.params.id as string,req.auth!);
    if(project.status!==200){await client.query("ROLLBACK");return error(res,project.status,"PROJECT_ACCESS_DENIED","Project missing or access denied");}
    if(!["draft","planning"].includes(project.row.status)){
      await client.query("ROLLBACK");return error(res,409,"PROJECT_LOCKED","Funding plan cannot be accepted at this project stage");
    }
    const plan=await client.query<{id:string;verdict:string;accepted:boolean}>(
      "SELECT id,verdict,accepted FROM funding_plans WHERE id=$1 AND project_id=$2 FOR UPDATE",
      [data.planId,req.params.id]);
    if(!plan.rowCount){await client.query("ROLLBACK");return error(res,404,"PLAN_NOT_FOUND","Funding plan not found");}
    if(plan.rows[0]!.accepted){await client.query("ROLLBACK");return error(res,409,"ALREADY_ACCEPTED","Plan already accepted");}
    if(plan.rows[0]!.verdict==="needs_rescope"){await client.query("ROLLBACK");return error(res,422,"NEEDS_RESCOPE","Revise funding assumptions before acceptance");}
    const budget=await client.query<{version:number}>("SELECT MAX(version) AS version FROM budgets WHERE project_id=$1",[req.params.id]);
    if(!budget.rows[0]?.version){await client.query("ROLLBACK");return error(res,422,"BUDGET_REQUIRED","Create a budget before accepting funding");}
    const prior=await client.query("SELECT id FROM funding_plans WHERE project_id=$1 AND accepted=true",[req.params.id]);
    if(prior.rowCount){await client.query("ROLLBACK");return error(res,409,"PLAN_ALREADY_ACTIVE","Project already has an accepted funding plan");}
    await client.query("UPDATE funding_plans SET accepted=true WHERE id=$1",[data.planId]);
    await client.query("UPDATE projects SET status='funding' WHERE id=$1",[req.params.id]);
    const budgets=await client.query<{id:string;category:string;approved_minor:string}>(
      "SELECT id,category,approved_minor::text FROM budgets WHERE project_id=$1 AND version=$2 ORDER BY id",
      [req.params.id,budget.rows[0]!.version]);
    const slotIds:string[]=[];
    for(const line of budgets.rows){
      if(BigInt(line.approved_minor)===0n)continue;
      const slot=await client.query<{id:string}>(`INSERT INTO budget_slots(budget_id,label,amount_minor)
        VALUES($1,$2,$3) RETURNING id`,[line.id,line.category,line.approved_minor]);
      slotIds.push(slot.rows[0]!.id);
    }
    await recordAudit({actorId:req.auth!.id,entity:"projects",entityId:req.params.id as string,
      action:"funding_plan_accepted",metadata:{planId:data.planId,slotIds}},client);
    await client.query("COMMIT");
    res.json({accepted:true,planId:data.planId,projectStatus:"funding",slotIds});
  }catch(e){await client.query("ROLLBACK").catch(()=>{});next(e);}
  finally{client.release();}
});

fundingRouter.get("/projects/:id/slots",async(req,res,next)=>{
  if(!guard(req,res))return;
  try{
    const project=await getPool().query("SELECT 1 FROM projects WHERE id=$1",[req.params.id]);
    if(!project.rowCount)return error(res,404,"PROJECT_NOT_FOUND","Project not found");
    const slots=await getPool().query(`SELECT s.id,s.budget_id AS "budgetId",s.label,
      s.amount_minor::text AS "amountMinor",s.status,s.created_at AS "createdAt"
      FROM budget_slots s JOIN budgets b ON b.id=s.budget_id
      WHERE b.project_id=$1 ORDER BY s.created_at,s.id`,[req.params.id]);
    res.json({slots:slots.rows});
  }catch(e){next(e);}
});

fundingRouter.post("/projects/:id/households/invite",requireRoles("organiser","admin"),async(req,res,next)=>{
  if(!guard(req,res))return;
  const data=parse(inviteInput,req.body,res);if(!data)return;
  const client=await getPool().connect().catch(next);if(!client)return;
  try{
    await client.query("BEGIN");
    const project=await lockProject(client,req.params.id as string,req.auth!);
    if(project.status!==200){await client.query("ROLLBACK");return error(res,project.status,"PROJECT_ACCESS_DENIED","Project missing or access denied");}
    const plan=await client.query<{households:number}>(
      "SELECT households FROM funding_plans WHERE project_id=$1 AND accepted=true LIMIT 1",[req.params.id]);
    if(!plan.rowCount){await client.query("ROLLBACK");return error(res,409,"PLAN_REQUIRED","Accept a funding plan first");}
    const count=await client.query<{count:string}>("SELECT COUNT(*)::text AS count FROM households WHERE project_id=$1",[req.params.id]);
    if(Number(count.rows[0]!.count)+data.count>plan.rows[0]!.households){
      await client.query("ROLLBACK");return error(res,422,"HOUSEHOLD_LIMIT","Invitations exceed accepted household count");
    }
    const invites:{id:string;token:string}[]=[];
    for(let i=0;i<data.count;i++){
      const token=randomBytes(24).toString("hex");
      const hash=createHash("sha256").update(token).digest("hex");
      const row=await client.query<{id:string}>("INSERT INTO households(project_id,invite_hash) VALUES($1,$2) RETURNING id",[req.params.id,hash]);
      invites.push({id:row.rows[0]!.id,token});
    }
    await recordAudit({actorId:req.auth!.id,entity:"projects",entityId:req.params.id as string,
      action:"households_invited",metadata:{count:data.count}},client);
    await client.query("COMMIT");
    res.status(201).json({invites}); // Raw tokens are returned once; do not log or store them in plaintext.
  }catch(e){await client.query("ROLLBACK").catch(()=>{});next(e);}
  finally{client.release();}
});

fundingRouter.get("/projects/:id/pool",requireRoles("organiser","reviewer","admin"),async(req,res,next)=>{
  if(!guard(req,res))return;
  try{
    const project=await getPool().query("SELECT 1 FROM projects WHERE id=$1",[req.params.id]);
    if(!project.rowCount)return error(res,404,"PROJECT_NOT_FOUND","Project not found");
    const households=await getPool().query(`SELECT id,participating,covered_by_pool AS "coveredByPool"
      FROM households WHERE project_id=$1 ORDER BY created_at,id`,[req.params.id]);
    res.json({households:households.rows,coveredCount:households.rows.filter(h=>h.coveredByPool).length});
  }catch(e){next(e);}
});

fundingRouter.post("/projects/:id/pool/allocate",requireRoles("organiser","admin"),async(req,res,next)=>{
  if(!guard(req,res))return;
  const data=parse(allocateInput,req.body,res);if(!data)return;
  const client=await getPool().connect().catch(next);if(!client)return;
  try{
    await client.query("BEGIN");
    const project=await lockProject(client,req.params.id as string,req.auth!);
    if(project.status!==200){await client.query("ROLLBACK");return error(res,project.status,"PROJECT_ACCESS_DENIED","Project missing or access denied");}
    const updated=await client.query(`UPDATE households SET covered_by_pool=$1
      WHERE id=$2 AND project_id=$3 RETURNING id,covered_by_pool AS "coveredByPool"`,
      [data.coveredByPool,data.householdId,req.params.id]);
    if(!updated.rowCount){await client.query("ROLLBACK");return error(res,404,"HOUSEHOLD_NOT_FOUND","Household not found");}
    await recordAudit({actorId:req.auth!.id,entity:"projects",entityId:req.params.id as string,
      action:"pool_household_allocation_changed",metadata:{householdId:data.householdId,coveredByPool:data.coveredByPool}},client);
    await client.query("COMMIT");
    res.json({household:updated.rows[0]});
  }catch(e){await client.query("ROLLBACK").catch(()=>{});next(e);}
  finally{client.release();}
});
