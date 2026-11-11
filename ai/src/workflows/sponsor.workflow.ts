
import { randomUUID } from "node:crypto";
import {
  SponsorBriefSchema,
  type SponsorBrief,
} from "@neighbourfund/contracts";

export type SponsorResult =
  | {
      ok: true;
      data: SponsorBrief;
      runId: string;
      validated: true;
    }
  | {
      ok: false;
      reason: "invalid_output" | "provider_error";
      runId: string;
    };

export function createSponsorBrief(
  input: unknown
): SponsorResult {
  const runId = `fake-a5-${randomUUID()}`;

  const parsed = SponsorBriefSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_output",
      runId,
    };
  }

  return {
    ok: true,
    data: parsed.data,
    runId,
    validated: true,
  };
}
