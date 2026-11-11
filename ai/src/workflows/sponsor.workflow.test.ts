import { describe, expect, it } from "vitest";
import { createSponsorBrief } from "./sponsor.workflow.js";

describe("A5 Sponsor Brief", () => {
  it("should accept a valid sponsor brief with verified evidence", () => {
    const result = createSponsorBrief({
      brief: "The project has completed its first milestone.",
      proofPack: [
        {
          statement: "The first milestone is complete.",
          status: "verified",
          recordIds: ["record-101"],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("should reject verified statements without record IDs", () => {
    const result = createSponsorBrief({
      brief: "Project update",
      proofPack: [
        {
          statement: "The milestone is complete.",
          status: "verified",
          recordIds: [],
        },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("should accept claimed statements without record IDs", () => {
    const result = createSponsorBrief({
      brief: "Project update",
      proofPack: [
        {
          statement: "The project is progressing.",
          status: "claimed",
          recordIds: [],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("should accept unknown statements without record IDs", () => {
    const result = createSponsorBrief({
      brief: "Project update",
      proofPack: [
        {
          statement: "The delivery date is not confirmed.",
          status: "unknown",
          recordIds: [],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("should reject an empty brief", () => {
    const result = createSponsorBrief({
      brief: "",
      proofPack: [],
    });

    expect(result.ok).toBe(false);
  });
});