import type { Request } from "express";
import { z } from "zod";
import { getPool } from "../../../config/database.js";
import type { AuthUser, Role } from "../auth/types.js";

const uuid = z.string().uuid();
const validId = (id: string) => uuid.safeParse(id).success;

/** Trusted session identity only. Never derive identities from headers or request bodies. */
export function resolveIdentity(req: Request, roles?: readonly Role[]): string | null {
  const user = req.auth;
  return user && (!roles || roles.includes(user.role)) ? user.id : null;
}
export const resolveOrganiserIdentity = (req: Request) => resolveIdentity(req, ["organiser", "admin"]);
export const resolveReviewerIdentity = (req: Request) => resolveIdentity(req, ["reviewer", "admin"]);
export const resolveUploaderIdentity = (req: Request) => resolveIdentity(req, ["organiser", "admin"]);
export const resolveSubmitterIdentity = (req: Request) => resolveIdentity(req, ["organiser", "admin"]);
export const resolveViewerIdentity = (req: Request) => resolveIdentity(req, ["organiser", "reviewer", "admin"]);

async function projectOwner(projectId: string): Promise<string | null> {
  if (!validId(projectId)) return null;
  const result = await getPool().query<{ organiser_id: string }>(
    "SELECT organiser_id FROM projects WHERE id = $1", [projectId]);
  return result.rows[0]?.organiser_id ?? null;
}
async function milestoneOwner(milestoneId: string): Promise<string | null> {
  if (!validId(milestoneId)) return null;
  const result = await getPool().query<{ organiser_id: string }>(
    "SELECT p.organiser_id FROM milestones m JOIN projects p ON p.id = m.project_id WHERE m.id = $1", [milestoneId]);
  return result.rows[0]?.organiser_id ?? null;
}
async function milestoneExists(milestoneId: string): Promise<boolean> {
  if (!validId(milestoneId)) return false;
  const result = await getPool().query("SELECT 1 FROM milestones WHERE id = $1", [milestoneId]);
  return (result.rowCount ?? result.rows.length) > 0;
}
async function projectExists(projectId: string): Promise<boolean> {
  if (!validId(projectId)) return false;
  const result = await getPool().query("SELECT 1 FROM projects WHERE id = $1", [projectId]);
  return (result.rowCount ?? result.rows.length) > 0;
}
const canManage = (user: AuthUser, ownerId: string | null) =>
  ownerId !== null && (user.role === "admin" || (user.role === "organiser" && user.id === ownerId));

/** P4 CompletionAuthorization-compatible shape; no P4 import required yet. */
export const completionAuthorization = {
  resolveOrganiserIdentity,
  resolveSubmitterIdentity,
  resolveReviewerIdentity,
  resolveViewerIdentity,
  // P4 only supplies userId to these methods; query role from trusted users table.
  async canManageMilestone(userId: string, milestoneId: string): Promise<boolean> {
    const user = await findTrustedUser(userId);
    return user !== null && canManage(user, await milestoneOwner(milestoneId));
  },
  async canSubmitProof(userId: string, milestoneId: string): Promise<boolean> {
    const user = await findTrustedUser(userId);
    return user !== null && canManage(user, await milestoneOwner(milestoneId));
  },
  async canReviewProof(userId: string, milestoneId: string): Promise<boolean> {
    const user = await findTrustedUser(userId);
    return user !== null && ["reviewer", "admin"].includes(user.role) && await milestoneExists(milestoneId);
  },
  async canViewMilestone(userId: string, milestoneId: string): Promise<boolean> {
    const user = await findTrustedUser(userId);
    if (!user) return false;
    if (["reviewer", "admin"].includes(user.role)) return milestoneExists(milestoneId);
    return canManage(user, await milestoneOwner(milestoneId));
  },
};

async function findTrustedUser(userId: string): Promise<AuthUser | null> {
  if (!validId(userId)) return null;
  const result = await getPool().query<{ id: string; role: Role }>(
    "SELECT id, role FROM users WHERE id = $1", [userId]);
  const row = result.rows[0];
  if (!row || !["organiser", "reviewer", "sponsor", "resident", "admin"].includes(row.role)) return null;
  return { id: row.id, role: row.role, displayName: "", email: "" };
}

/**
 * P4 EvidenceAuthorization-compatible shape. Evidence/review ownership lookups are
 * intentionally injected until P4's PostgreSQL schema and repository are agreed.
 * Missing lookups DENY rather than guessing table names or trusting supplied IDs.
 */
export interface EvidenceResourceLookup {
  evidenceProjectId?(evidenceId: string): Promise<string | null>;
  reviewProjectId?(reviewId: string): Promise<string | null>;
  expenseProjectId?(expenseId: string): Promise<string | null>;
}
export function createEvidenceAuthorization(lookup: EvidenceResourceLookup = {}) {
  async function canReadProject(req: Request, projectId: string): Promise<boolean> {
    const user = req.auth;
    if (!user) return false;
    if (["reviewer", "admin"].includes(user.role)) return projectExists(projectId);
    return canManage(user, await projectOwner(projectId));
  }
  async function canManageProject(req: Request, projectId: string): Promise<boolean> {
    return Boolean(req.auth && canManage(req.auth, await projectOwner(projectId)));
  }
  async function evidenceProject(id: string): Promise<string | null> {
    return validId(id) && lookup.evidenceProjectId ? lookup.evidenceProjectId(id) : null;
  }
  return {
    async canUpload(req: Request, projectId: string, expenseId?: string): Promise<boolean> {
      if (!await canManageProject(req, projectId)) return false;
      if (!expenseId) return true;
      return validId(expenseId) && Boolean(lookup.expenseProjectId) &&
        await lookup.expenseProjectId!(expenseId) === projectId;
    },
    async canReadEvidence(req: Request, evidenceId: string): Promise<boolean> {
      const projectId = await evidenceProject(evidenceId);
      return projectId !== null && canReadProject(req, projectId);
    },
    canReadProject,
    async canExtract(req: Request, evidenceId: string): Promise<boolean> {
      const projectId = await evidenceProject(evidenceId);
      return projectId !== null && canManageProject(req, projectId);
    },
    async canReview(req: Request, evidenceId: string): Promise<boolean> {
      const projectId = await evidenceProject(evidenceId);
      return projectId !== null && Boolean(req.auth && ["reviewer", "admin"].includes(req.auth.role)) && await projectExists(projectId);
    },
    async canAccessReviewQueue(req: Request, projectId?: string): Promise<boolean> {
      return Boolean(req.auth && ["reviewer", "admin"].includes(req.auth.role)) &&
        Boolean(projectId && await projectExists(projectId));
    },
    async canResolveReview(req: Request, reviewId: string): Promise<boolean> {
      if (!req.auth || !["reviewer", "admin"].includes(req.auth.role) || !validId(reviewId) || !lookup.reviewProjectId) return false;
      const projectId = await lookup.reviewProjectId(reviewId);
      return projectId !== null && await projectExists(projectId);
    },
    // Deliberately DENIED pending P2/P4 agreement on two-person Gate A approvals.
    canAssessGateA: async (_req: Request, _projectId: string, _expenseId: string, _evidenceId: string): Promise<boolean> => false,
  };
}
