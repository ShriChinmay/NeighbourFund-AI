import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("../../../config/database.js", () => ({ getPool: () => ({ query }) }));

import {
  getMilestoneProjectId,
  householdBelongsToProject,
  milestoneBelongsToProject,
  validateAttestationHouseholds,
} from "./ownership.js";

const project = "11111111-1111-4111-8111-111111111111";
const milestone = "22222222-2222-4222-8222-222222222222";
const household = "33333333-3333-4333-8333-333333333333";
const other = "44444444-4444-4444-8444-444444444444";

beforeEach(() => query.mockReset());

describe("P4 ownership boundary", () => {
  it("rejects invalid IDs without querying", async () => {
    expect(await getMilestoneProjectId("bad")).toBeNull();
    expect(await householdBelongsToProject("bad", project)).toBe(false);
    expect(await validateAttestationHouseholds("bad", [household])).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it("accepts a milestone in its own project", async () => {
    query.mockResolvedValueOnce({ rows: [{ project_id: project }] });
    expect(await milestoneBelongsToProject(milestone, project)).toBe(true);
  });

  it("rejects cross-project milestones", async () => {
    query.mockResolvedValueOnce({ rows: [{ project_id: other }] });
    expect(await milestoneBelongsToProject(milestone, project)).toBe(false);
  });

  it("rejects empty or duplicate household batches", async () => {
    expect(await validateAttestationHouseholds(milestone, [])).toBe(false);
    expect(await validateAttestationHouseholds(milestone, [household, household])).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it("accepts a batch only if all households belong to milestone project", async () => {
    query.mockResolvedValueOnce({ rows: [{ project_id: project }] });
    query.mockResolvedValueOnce({ rows: [{ id: household }, { id: other }] });
    expect(await validateAttestationHouseholds(milestone, [household, other])).toBe(true);
  });

  it("rejects missing or cross-project households", async () => {
    query.mockResolvedValueOnce({ rows: [{ project_id: project }] });
    query.mockResolvedValueOnce({ rows: [{ id: household }] });
    expect(await validateAttestationHouseholds(milestone, [household, other])).toBe(false);
  });

  it("propagates database failures instead of granting access", async () => {
    query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(validateAttestationHouseholds(milestone, [household])).rejects.toThrow("database unavailable");
  });
});
