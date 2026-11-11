
import { describe, it, expect } from "vitest";
import { explainDiscrepancy } from "./discrepancy.workflow.js";

describe("A3 Discrepancy Explainer", () => {
  it("should detect an over-budget expense", () => {
    const result = explainDiscrepancy({
      budgetedAmountMinor: 312000,
      actualAmountMinor: 330000,
      budgetLineName: "Construction materials",
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.flagType).toBe("over_budget");
      expect(result.data.differenceMinor).toBe(18000);
      expect(result.data.explanation).toContain("18000");
    }
  });

  it("should detect an under-budget expense", () => {
    const result = explainDiscrepancy({
      budgetedAmountMinor: 100000,
      actualAmountMinor: 80000,
      budgetLineName: "Equipment",
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.flagType).toBe("under_budget");
      expect(result.data.differenceMinor).toBe(-20000);
    }
  });

  it("should detect an expense matching the budget", () => {
    const result = explainDiscrepancy({
      budgetedAmountMinor: 100000,
      actualAmountMinor: 100000,
      budgetLineName: "Supplies",
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.flagType).toBe("within_budget");
      expect(result.data.differenceMinor).toBe(0);
    }
  });

  it("should reject negative amounts", () => {
    const result = explainDiscrepancy({
      budgetedAmountMinor: -100,
      actualAmountMinor: 500,
      budgetLineName: "Supplies",
    });

    expect(result.ok).toBe(false);
  });

  it("should reject an empty budget line name", () => {
    const result = explainDiscrepancy({
      budgetedAmountMinor: 1000,
      actualAmountMinor: 1200,
      budgetLineName: " ",
    });

    expect(result.ok).toBe(false);
  });
});
