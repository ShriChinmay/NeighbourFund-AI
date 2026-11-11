
import { describe, it, expect } from "vitest";
import { planFundingMix } from "./funding.workflow.js";

const validFunding = {
  goalMinor: 100000,
  lines: [
    {
      sourceType: "donation",
      amountMinor: 60000,
      rationale: "Community donations",
      risks: ["Donations may be delayed"],
    },
    {
      sourceType: "grant",
      amountMinor: 40000,
      rationale: "Local community grant",
      risks: ["Grant approval is required"],
    },
  ],
};

describe("A4 Funding Mix Planner", () => {
  it("should accept a valid funding mix", () => {
    const result = planFundingMix(validFunding);

    expect(result.ok).toBe(true);
  });

  it("should reject funding that does not match the goal", () => {
    const result = planFundingMix({
      ...validFunding,
      goalMinor: 120000,
    });

    expect(result.ok).toBe(false);
  });

  it("should reject negative funding amounts", () => {
    const result = planFundingMix({
      ...validFunding,
      lines: [
        {
          ...validFunding.lines[0],
          amountMinor: -100,
        },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("should reject in-kind contributions counted as cash", () => {
    const result = planFundingMix({
      goalMinor: 100000,
      lines: [
        {
          sourceType: "in-kind",
          amountMinor: 100000,
          rationale: "Free construction materials",
          risks: [],
        },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("should reject empty funding source names", () => {
    const result = planFundingMix({
      ...validFunding,
      lines: [
        {
          ...validFunding.lines[0],
          sourceType: " ",
        },
        validFunding.lines[1],
      ],
    });

    expect(result.ok).toBe(false);
  });
});
