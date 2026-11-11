
import { describe, it, expect } from "vitest";
import { extractDocument } from "./document.workflow.js";

const validDocument = {
  vendor: "ABC Suppliers",
  date: "2026-11-10",
  lineItems: [
    { description: "Cement", amountMinor: 50000 },
    { description: "Bricks", amountMinor: 30000 },
  ],
  total: 80000,
  confidence: {
    vendor: 0.95,
    date: 0.9,
    lineItems: 0.95,
    total: 0.99,
  },
};

describe("A2 Document Extraction", () => {
  it("should accept valid document data", () => {
    const result = extractDocument(validDocument);

    expect(result.ok).toBe(true);
  });

  it("should reject incorrect invoice total", () => {
    const result = extractDocument({
      ...validDocument,
      total: 90000,
    });

    expect(result.ok).toBe(false);
  });

  it("should reject negative line item amounts", () => {
    const result = extractDocument({
      ...validDocument,
      lineItems: [
        { description: "Cement", amountMinor: -500 },
      ],
      total: -500,
    });

    expect(result.ok).toBe(false);
  });

  it("should reject confidence values above 1", () => {
    const result = extractDocument({
      ...validDocument,
      confidence: {
        ...validDocument.confidence,
        vendor: 1.5,
      },
    });

    expect(result.ok).toBe(false);
  });

  it("should mark low-confidence fields as uncertain", () => {
    const result = extractDocument({
      ...validDocument,
      confidence: {
        ...validDocument.confidence,
        vendor: 0.4,
      },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.uncertainFields).toContain("vendor");
    }
  });
});
