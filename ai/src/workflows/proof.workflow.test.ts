import { describe, expect, it } from "vitest";
import { reviewCompletionProof } from "./proof.workflow.js";

describe("A6 Completion Proof Reviewer", () => {
  it("should accept valid completion proof", () => {
    const result = reviewCompletionProof({
      items: [
        {
          itemName: "Street lights",
          expectedCount: 10,
          observedCount: 8,
          matches: ["Photo 1", "Photo 2"],
          cannotConfirm: [],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("should reject observed count greater than expected count", () => {
    const result = reviewCompletionProof({
      items: [
        {
          itemName: "Street lights",
          expectedCount: 5,
          observedCount: 7,
          matches: [],
          cannotConfirm: [],
        },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("should reject negative counts", () => {
    const result = reviewCompletionProof({
      items: [
        {
          itemName: "Street lights",
          expectedCount: 5,
          observedCount: -1,
          matches: [],
          cannotConfirm: [],
        },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("should identify evidence that cannot be confirmed", () => {
    const result = reviewCompletionProof({
      items: [
        {
          itemName: "Street lights",
          expectedCount: 10,
          observedCount: 8,
          matches: ["Photo 1"],
          cannotConfirm: ["Installation location is unclear"],
        },
      ],
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.summary).toContain("cannot be confirmed");
      expect(result.data.summary).toContain("Street lights");
    }
  });

  it("should reject an empty item name", () => {
    const result = reviewCompletionProof({
      items: [
        {
          itemName: "",
          expectedCount: 5,
          observedCount: 3,
          matches: [],
          cannotConfirm: [],
        },
      ],
    });

    expect(result.ok).toBe(false);
  });
});
