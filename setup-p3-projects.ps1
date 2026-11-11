$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
if (!(Test-Path "backend/src/app.ts")) { throw "Run from the NeighbourFund-AI repository root" }
if (!(Select-String -Path "backend/src/app.ts" -Pattern "authRouter" -Quiet)) { throw "Step 3 authentication not found" }
$path = Join-Path $root "backend/src/modules/platform/projects/routes.ts"
$dir = Split-Path $path -Parent
New-Item -ItemType Directory -Force -Path $dir | Out-Null
@'
import { Router } from "express";
import { z } from "zod";
import { getPool } from "../../../config/database.js";
import { recordAudit } from "../auth/repository.js";
import { requireAuth, requireRoles } from "../auth/session.js";

export const projectsRouter = Router();
const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(160);
const description = z.string().trim().max(5000).default("");
const minor = z.number().int().positive().safe();
const date = z.iso.date();
const projectInput = z.object({
  communityId: uuid.optional(),
  communityName: name.optional(),
  title: name,
  description,
  goalMinor: minor,
  targetDate: date.nullable().optional(),
}).strict().refine(v => Boolean(v.communityId) !== Boolean(v.communityName),
  { message: "Supply exactly one of communityId or communityName" });
const budgetInput = z.object({
  lines: z.array(z.object({ category: name, description, approvedMinor: z.number().int().min(0).safe() }).strict()).min(1).max(100),
}).strict();
const milestoneInput = z.object({
  milestones: z.array(z.object({ title: name, dueDate: date.nullable().optional(), budgetId: uuid.nullable().optional() }).strict()).min(1).max(100),
}).strict();

function fail(res: import("express").Response, status: number, code: string, message: string, details?: unknown) {
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}
function validate<T>(schema: z.ZodType<T>, body: unknown, res: import("express").Response): T | undefined {
  const parsed = schema.safeParse(body);
  if (!parsed.success) { fail(res, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()); return; }
  return parsed.data;
}
async function findProject(id: string) {
  const result = await getPool().query(`SELECT p.id, p.community_id AS "communityId", p.organiser_id AS "organiserId",
    p.title, p.description, p.goal_minor::text AS "goalMinor", p.currency, p.status,
    p.target_date AS "targetDate", p.created_at AS "createdAt", p.updated_at AS "updatedAt",
    c.name AS "communityName" FROM projects p JOIN communities c ON c.id=p.community_id WHERE p.id=$1`, [id]);
  return result.rows[0] ?? null;
}
async function projectDetails(id: string) {
  const project = await findProject(id);
  if (!project) return null;
  const pool = getPool();
  const [budgets, milestones] = await Promise.all([
    pool.query(`SELECT id, category, description, approved_minor::text AS "approvedMinor", version,
      approved_by AS "approvedBy", created_at AS "createdAt" FROM budgets WHERE project_id=$1 ORDER BY version, created_at, id`, [id]),
    pool.query(`SELECT id, title, due_date AS "dueDate", status, budget_id AS "budgetId",
      created_at AS "createdAt" FROM milestones WHERE project_id=$1 ORDER BY created_at, id`, [id]),
  ]);
  return { ...project, budgets: budgets.rows, milestones: milestones.rows };
}
function isOwner(user: NonNullable<import("../auth/types.js").AuthUser>, project: { organiserId: string }) {
  return user.role === "admin" || (user.role === "organiser" && project.organiserId === user.id);
}

projectsRouter.post("/projects", requireRoles("organiser", "admin"), async (req, res, next) => {
  const input = validate(projectInput, req.body, res);
  if (!input) return;
  const client = await getPool().connect().catch(next);
  if (!client) return;
  try {
    await client.query("BEGIN");
    let communityId = input.communityId;
    if (communityId) {
      const exists = await client.query("SELECT id FROM communities WHERE id=$1", [communityId]);
      if (!exists.rowCount) { await client.query("ROLLBACK"); return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found"); }
    } else {
      const created = await client.query<{id:string}>("INSERT INTO communities(name) VALUES ($1) RETURNING id", [input.communityName]);
      communityId = created.rows[0]!.id;
      await recordAudit({ actorId: req.auth!.id, entity: "communities", entityId: communityId,
        action: "community_created", metadata: { name: input.communityName } }, client);
    }
    const created = await client.query<{id:string}>(`INSERT INTO projects(community_id,organiser_id,title,description,goal_minor,target_date)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [communityId, req.auth!.id, input.title, input.description, input.goalMinor, input.targetDate ?? null]);
    const id = created.rows[0]!.id;
    await recordAudit({ actorId: req.auth!.id, entity: "projects", entityId: id,
      action: "project_created", metadata: { goalMinor: input.goalMinor, communityId } }, client);
    await client.query("COMMIT");
    res.status(201).json({ project: await projectDetails(id) });
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); next(e); }
  finally { client.release(); }
});

projectsRouter.get("/projects/:id/public", async (req, res, next) => {
  try {
    if (!uuid.safeParse(req.params.id).success) return fail(res, 400, "VALIDATION_ERROR", "Invalid project id");
    const project = await projectDetails(req.params.id as string);
    if (!project) return fail(res, 404, "PROJECT_NOT_FOUND", "Project not found");
    const { organiserId: _organiserId, ...publicProject } = project;
    res.json({ project: publicProject });
  } catch (e) { next(e); }
});

projectsRouter.get("/projects/:id", requireAuth, async (req, res, next) => {
  try {
    if (!uuid.safeParse(req.params.id).success) return fail(res, 400, "VALIDATION_ERROR", "Invalid project id");
    const project = await projectDetails(req.params.id as string);
    if (!project) return fail(res, 404, "PROJECT_NOT_FOUND", "Project not found");
    res.json({ project });
  } catch (e) { next(e); }
});

projectsRouter.post("/projects/:id/budget", requireRoles("organiser", "admin"), async (req, res, next) => {
  if (!uuid.safeParse(req.params.id).success) return fail(res, 400, "VALIDATION_ERROR", "Invalid project id");
  const input = validate(budgetInput, req.body, res);
  if (!input) return;
  const id = req.params.id as string;
  const client = await getPool().connect().catch(next);
  if (!client) return;
  try {
    await client.query("BEGIN");
    const lock = await client.query<{organiser_id:string; goal_minor:string}>(
      "SELECT organiser_id, goal_minor::text FROM projects WHERE id=$1 FOR UPDATE", [id]);
    if (!lock.rowCount) { await client.query("ROLLBACK"); return fail(res, 404, "PROJECT_NOT_FOUND", "Project not found"); }
    if (!isOwner(req.auth!, { organiserId: lock.rows[0]!.organiser_id })) {
      await client.query("ROLLBACK"); return fail(res, 403, "FORBIDDEN", "Only the project organiser or admin may edit its budget");
    }
    const sum = input.lines.reduce((a, line) => a + BigInt(line.approvedMinor), 0n);
    if (sum !== BigInt(lock.rows[0]!.goal_minor)) {
      await client.query("ROLLBACK"); return fail(res, 422, "BUDGET_TOTAL_MISMATCH", "Budget lines must sum to the project goal");
    }
    const v = await client.query<{version:number}>("SELECT COALESCE(MAX(version),0)+1 AS version FROM budgets WHERE project_id=$1", [id]);
    const version = Number(v.rows[0]!.version);
    const lines=[];
    for (const line of input.lines) {
      const r=await client.query(`INSERT INTO budgets(project_id,category,description,approved_minor,version)
        VALUES ($1,$2,$3,$4,$5) RETURNING id`, [id,line.category,line.description,line.approvedMinor,version]);
      lines.push(r.rows[0]!.id);
    }
    await recordAudit({ actorId:req.auth!.id, entity:"projects", entityId:id, action:"budget_version_created",
      metadata:{ version, budgetIds:lines, totalMinor:sum.toString() } },client);
    await client.query("COMMIT");
    res.status(201).json({ version, budgetIds:lines, totalMinor:sum.toString() });
  } catch(e) { await client.query("ROLLBACK").catch(()=>{}); next(e); }
  finally { client.release(); }
});

projectsRouter.post("/projects/:id/milestones", requireRoles("organiser", "admin"), async (req,res,next)=>{
  if (!uuid.safeParse(req.params.id).success) return fail(res,400,"VALIDATION_ERROR","Invalid project id");
  const input=validate(milestoneInput,req.body,res);
  if(!input) return;
  const id=req.params.id as string;
  const client=await getPool().connect().catch(next);
  if(!client) return;
  try {
    await client.query("BEGIN");
    const project=await client.query<{organiser_id:string}>("SELECT organiser_id FROM projects WHERE id=$1 FOR UPDATE",[id]);
    if(!project.rowCount) { await client.query("ROLLBACK"); return fail(res,404,"PROJECT_NOT_FOUND","Project not found"); }
    if(!isOwner(req.auth!,{organiserId:project.rows[0]!.organiser_id})) {
      await client.query("ROLLBACK"); return fail(res,403,"FORBIDDEN","Only the project organiser or admin may edit milestones");
    }
    const ids=[];
    for(const m of input.milestones) {
      if(m.budgetId) {
        const valid=await client.query("SELECT 1 FROM budgets WHERE id=$1 AND project_id=$2",[m.budgetId,id]);
        if(!valid.rowCount) { await client.query("ROLLBACK"); return fail(res,422,"INVALID_BUDGET_REFERENCE","Milestone budget must belong to this project"); }
      }
      const result=await client.query<{id:string}>(`INSERT INTO milestones(project_id,title,due_date,budget_id)
        VALUES ($1,$2,$3,$4) RETURNING id`,[id,m.title,m.dueDate??null,m.budgetId??null]);
      ids.push(result.rows[0]!.id);
    }
    await recordAudit({actorId:req.auth!.id,entity:"projects",entityId:id,
      action:"milestones_created",metadata:{milestoneIds:ids}},client);
    await client.query("COMMIT");
    res.status(201).json({milestoneIds:ids});
  } catch(e) { await client.query("ROLLBACK").catch(()=>{}); next(e); }
  finally {client.release();}
});
'@ | Set-Content -LiteralPath $path -Encoding UTF8
Write-Host "Created backend/src/modules/platform/projects/routes.ts"
$path = Join-Path $root "backend/src/modules/platform/projects/routes.test.ts"
$dir = Split-Path $path -Parent
New-Item -ItemType Directory -Force -Path $dir | Out-Null
@'
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";

describe("Project API authorization", () => {
  it("rejects unauthenticated project creation", async () => {
    const r=await request(createApp()).post("/api/projects").send({});
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
  });
  it("rejects unauthenticated budget edits", async () => {
    const r=await request(createApp()).post("/api/projects/00000000-0000-4000-8000-000000000001/budget").send({});
    expect(r.status).toBe(401);
  });
  it("rejects unauthenticated milestone edits", async () => {
    const r=await request(createApp()).post("/api/projects/00000000-0000-4000-8000-000000000001/milestones").send({});
    expect(r.status).toBe(401);
  });
});
'@ | Set-Content -LiteralPath $path -Encoding UTF8
Write-Host "Created backend/src/modules/platform/projects/routes.test.ts"
$appPath = Join-Path $root "backend/src/app.ts"
$app = Get-Content -Raw $appPath
if ($app -notmatch "projectsRouter") {
  $app = $app.Replace('import { authRouter } from "./modules/platform/auth/routes.js";', 'import { authRouter } from "./modules/platform/auth/routes.js";' + "`n" + 'import { projectsRouter } from "./modules/platform/projects/routes.js";')
  $app = $app.Replace('app.use("/api", optionalAuth, authRouter);', 'app.use("/api", optionalAuth, authRouter);' + "`n" + '  app.use("/api", optionalAuth, projectsRouter);')
  if ($app -notmatch "projectsRouter") { throw "Could not register projects router" }
  Set-Content -LiteralPath $appPath -Value $app -Encoding UTF8
}
Write-Host "Step 4 generated. Run npm run typecheck:api and npm run test:api"
