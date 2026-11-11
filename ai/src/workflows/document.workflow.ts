
import { randomUUID } from "node:crypto";

import {
  ExtractedDocSchema,
  type ExtractedDoc,
} from "@neighbourfund/contracts";

import type { AiResult } from "./brief.workflow.js";

export interface DocumentInput {
  vendor: string;
  date: string;
  lineItems: {
    description: string;
    amountMinor: number;
  }[];
  total: number;
  confidence: {
    vendor: number;
    date: number;
    lineItems: number;
    total: number;
  };
}

export type DocumentResult =
  | {
      ok: true;
      data: ExtractedDoc;
      runId: string;
      validated: true;
      uncertainFields: string[];
    }
  | {
      ok: false;
      reason: "invalid_output" | "provider_error";
      runId: string;
    };

const CONFIDENCE_THRESHOLD = 0.7;

export function extractDocument(
  input: DocumentInput
): DocumentResult {
  const runId = `fake-a2-${randomUUID()}`;

  const parsed = ExtractedDocSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, reason: "invalid_output", runId };
  }

  const lineItemsTotal = parsed.data.lineItems.reduce(
    (sum, item) => sum + item.amountMinor,
    0
  );

  if (lineItemsTotal !== parsed.data.total) {
    return { ok: false, reason: "invalid_output", runId };
  }

  const uncertainFields = Object.entries(parsed.data.confidence)
    .filter(([, confidence]) => confidence < CONFIDENCE_THRESHOLD)
    .map(([field]) => field);

  return {
    ok: true,
    data: parsed.data,
    runId,
    validated: true,
    uncertainFields,
  };
}
