import { describe, expect, it } from "vitest";
import { answerProjectQuestion } from "./qa.workflow.js";

describe("A7 Predefined Q&A", () => {
  it("should answer a supported question using backend data", () => {
    const result = answerProjectQuestion({
      question: "How much funding has been received?",
      topic: "funded_amount",
      backendData: {
        answer: "₹50,000 has been received.",
        recordReferences: ["funding-101"],
      },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.answer).toContain("₹50,000");
      expect(result.data.recordReferences).toContain("funding-101");
      expect(result.data.refused).toBe(false);
    }
  });

  it("should refuse unsupported topics", () => {
    const result = answerProjectQuestion({
      question: "Tell me the weather.",
      topic: "weather" as never,
      backendData: {},
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.refused).toBe(true);
      expect(result.data.recordReferences).toEqual([]);
    }
  });

  it("should reject an empty question", () => {
    const result = answerProjectQuestion({
      question: " ",
      topic: "funded_amount",
      backendData: {},
    });

    expect(result.ok).toBe(false);
  });

  it("should reject missing backend answer", () => {
    const result = answerProjectQuestion({
      question: "How much funding?",
      topic: "funded_amount",
      backendData: {
        recordReferences: ["funding-101"],
      },
    });

    expect(result.ok).toBe(false);
  });

  it("should reject invalid record references", () => {
    const result = answerProjectQuestion({
      question: "How much funding?",
      topic: "funded_amount",
      backendData: {
        answer: "₹50,000 received.",
        recordReferences: [123],
      },
    });

    expect(result.ok).toBe(false);
  });
});