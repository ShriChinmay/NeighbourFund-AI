import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import { CompletionService } from "./service.js";

import {
  createCompletionSpecSchema,
  createProofSubmissionSchema,
  createProofReviewSchema,
  submitAttestationSchema,
} from "./schemas.js";

const attestationLinksSchema = z.object({
  householdIds: z.array(z.string().trim().min(1)).min(1),
}).strict();

/**
 * This resolver must obtain identity from trusted authentication
 * middleware or a verified server-side session.
 *
 * Never obtain reviewer identity from req.body or an
 * unverified request header.
 */
export type ReviewerIdentityResolver = (
  req: Request
) => string | null;

function getRouteParam(
  value: string | string[] | undefined
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid route parameter.");
  }

  return value;
}

function sendError(
  res: Response,
  error: unknown
) {
  return res.status(400).json({
    success: false,
    message:
      error instanceof Error
        ? error.message
        : "Request failed",
  });
}

export function createCompletionRouter(
  service: CompletionService,
  resolveReviewerIdentity: ReviewerIdentityResolver = () => null
) {
  const router = Router();

  // Create completion specification
  router.post(
    "/milestones/:id/completion-spec",
    async (req: Request, res: Response) => {
      try {
        const milestoneId = getRouteParam(req.params.id);

        const parsed = createCompletionSpecSchema.safeParse({
          ...req.body,
          milestoneId,
        });

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const spec = await service.createCompletionSpec(
          parsed.data
        );

        return res.status(201).json({
          success: true,
          data: spec,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // Retrieve completion specification
  router.get(
    "/milestones/:id/completion-spec",
    async (req: Request, res: Response) => {
      try {
        const milestoneId = getRouteParam(req.params.id);

        const spec = await service.getCompletionSpec(
          milestoneId
        );

        if (!spec) {
          return res.status(404).json({
            success: false,
            message: "Completion specification not found.",
          });
        }

        return res.status(200).json({
          success: true,
          data: spec,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // Submit completion proof
  router.post(
    "/milestones/:id/proof",
    async (req: Request, res: Response) => {
      try {
        const specId = getRouteParam(req.params.id);

        const parsed = createProofSubmissionSchema.safeParse(
          req.body
        );

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const proof = await service.submitProof(
          specId,
          parsed.data
        );

        return res.status(201).json({
          success: true,
          data: proof,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // Generate household attestation links
  router.post(
    "/milestones/:id/attestation-links",
    async (req: Request, res: Response) => {
      try {
        const specId = getRouteParam(req.params.id);

        const parsed = attestationLinksSchema.safeParse(
          req.body
        );

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const links = await service.generateAttestationLinks(
          specId,
          parsed.data.householdIds
        );

        return res.status(201).json({
          success: true,
          data: links,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // Retrieve public attestation page data
  router.get(
    "/attest/:token",
    async (req: Request, res: Response) => {
      try {
        const token = getRouteParam(req.params.token);

        const attestation = await service.getAttestationByToken(
          token
        );

        return res.status(200).json({
          success: true,
          data: {
            valid: true,
            expiresAt: attestation.expiresAt,
          },
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // Submit household attestation response
  router.post(
    "/attest/:token",
    async (req: Request, res: Response) => {
      try {
        const token = getRouteParam(req.params.token);

        const parsed = submitAttestationSchema.safeParse({
          ...req.body,
          token,
        });

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const result = await service.submitAttestation(
          parsed.data.token,
          parsed.data.response
        );

        return res.status(200).json({
          success: true,
          data: {
            response: result.response,
            submittedAt: result.usedAt,
          },
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // Reviewer decision on completion proof
  router.post(
    "/milestones/:id/proof/decision",
    async (req: Request, res: Response) => {
      try {
        const reviewerId = resolveReviewerIdentity(req);

        // Fail closed until trusted authentication is configured.
        if (!reviewerId || !reviewerId.trim()) {
          return res.status(401).json({
            success: false,
            message: "Authenticated reviewer identity is required.",
          });
        }

        const milestoneId = getRouteParam(req.params.id);

        const parsed = createProofReviewSchema.safeParse(
          req.body
        );

        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            errors: parsed.error.issues,
          });
        }

        const spec = await service.getCompletionSpec(
          milestoneId
        );

        if (!spec) {
          return res.status(404).json({
            success: false,
            message: "Completion specification not found.",
          });
        }

        const submission = await service.getProofForMilestone(
          milestoneId
        );

        if (!submission) {
          return res.status(404).json({
            success: false,
            message: "Proof submission not found.",
          });
        }

        const review = await service.createProofReview(
          submission.id,
          reviewerId,
          parsed.data
        );

        return res.status(201).json({
          success: true,
          data: review,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // Check Gate B eligibility
  router.get(
    "/milestones/:id/gate-b/eligibility",
    async (req: Request, res: Response) => {
      try {
        const identifier = getRouteParam(req.params.id);

        const result = await service.getGateBEligibility(
          identifier
        );

        return res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  return router;
}
