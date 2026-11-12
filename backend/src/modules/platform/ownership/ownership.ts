import { z } from "zod";
import { getPool } from "../../../config/database.js";

const uuid = z.string().uuid();

/** A trusted project association. Null means missing or invalid input. */
export async function getMilestoneProjectId(milestoneId: string): Promise<string | null> {
  if (!uuid.safeParse(milestoneId).success) return null;
  const result = await getPool().query<{ project_id: string }>(
    "SELECT project_id FROM milestones WHERE id = $1",
    [milestoneId],
  );
  return result.rows[0]?.project_id ?? null;
}

/** A trusted project association. Null means missing or invalid input. */
export async function getHouseholdProjectId(householdId: string): Promise<string | null> {
  if (!uuid.safeParse(householdId).success) return null;
  const result = await getPool().query<{ project_id: string }>(
    "SELECT project_id FROM households WHERE id = $1",
    [householdId],
  );
  return result.rows[0]?.project_id ?? null;
}

/** Returns false on invalid IDs or missing rows. Database failures propagate (fail closed). */
export async function milestoneBelongsToProject(milestoneId: string, projectId: string): Promise<boolean> {
  if (!uuid.safeParse(projectId).success) return false;
  return (await getMilestoneProjectId(milestoneId)) === projectId;
}

/** Returns false on invalid IDs or missing rows. Database failures propagate (fail closed). */
export async function householdBelongsToProject(householdId: string, projectId: string): Promise<boolean> {
  if (!uuid.safeParse(projectId).success) return false;
  return (await getHouseholdProjectId(householdId)) === projectId;
}

/**
 * Validates an entire attestation invitation batch before P4 creates tokens.
 * Rejects duplicate, unknown, invalid, and cross-project household IDs.
 * P4 must perform validation + inserts in one DB transaction to prevent races.
 */
export async function validateAttestationHouseholds(
  milestoneId: string,
  householdIds: readonly string[],
): Promise<boolean> {
  if (!uuid.safeParse(milestoneId).success || householdIds.length === 0) return false;
  if (householdIds.length > 1000) return false;
  if (householdIds.some((id) => !uuid.safeParse(id).success)) return false;
  if (new Set(householdIds).size !== householdIds.length) return false;
  const projectId = await getMilestoneProjectId(milestoneId);
  if (!projectId) return false;
  const result = await getPool().query<{ id: string }>(
    "SELECT id FROM households WHERE project_id = $1 AND id = ANY($2::uuid[])",
    [projectId, householdIds],
  );
  return result.rows.length === householdIds.length &&
    new Set(result.rows.map((row) => row.id)).size === householdIds.length;
}
