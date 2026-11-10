import { describe, it, expect } from "vitest";

import {
  generateToken,
  hashToken,
  verifyToken,
  isTokenExpired,
} from "./attestation-token.js";

const SECRET = "test-secret-key-at-least-32-bytes-long";

describe("Attestation Token Utility", () => {
  describe("generateToken", () => {
    it("should generate a secure token", () => {
      const token = generateToken();

      expect(token).toBeTruthy();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should generate unique tokens", () => {
      const token1 = generateToken();
      const token2 = generateToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe("hashToken", () => {
    it("should generate a SHA256 HMAC hash", () => {
      const hash = hashToken("test-token", SECRET);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate the same hash for the same input", () => {
      const hash1 = hashToken("test-token", SECRET);
      const hash2 = hashToken("test-token", SECRET);

      expect(hash1).toBe(hash2);
    });

    it("should reject a secret shorter than 32 bytes", () => {
      expect(() => hashToken("test-token", "short"))
        .toThrow("Attestation HMAC secret must be at least 32 bytes.");
    });
  });

  describe("verifyToken", () => {
    it("should verify a valid token", () => {
      const token = generateToken();
      const hash = hashToken(token, SECRET);

      expect(verifyToken(token, hash, SECRET)).toBe(true);
    });

    it("should reject an incorrect token", () => {
      const hash = hashToken("original-token", SECRET);

      expect(verifyToken("wrong-token", hash, SECRET))
        .toBe(false);
    });

    it("should reject an incorrect secret", () => {
      const hash = hashToken("test-token", SECRET);
      const wrongSecret = "another-secret-key-at-least-32-bytes";

      expect(verifyToken("test-token", hash, wrongSecret))
        .toBe(false);
    });

    it("should reject a malformed stored hash", () => {
      expect(verifyToken("test-token", "invalid-hash", SECRET))
        .toBe(false);
    });
  });

  describe("isTokenExpired", () => {
    it("should return false for a future expiry date", () => {
      const now = new Date("2026-11-08T10:00:00Z");
      const expiry = new Date("2026-11-09T10:00:00Z");

      expect(isTokenExpired(expiry, now)).toBe(false);
    });

    it("should return true for an expired token", () => {
      const now = new Date("2026-11-08T10:00:00Z");
      const expiry = new Date("2026-11-07T10:00:00Z");

      expect(isTokenExpired(expiry, now)).toBe(true);
    });

    it("should treat the exact expiry time as expired", () => {
      const now = new Date("2026-11-08T10:00:00Z");

      expect(isTokenExpired(now, now)).toBe(true);
    });

    it("should reject an invalid expiry date", () => {
      expect(() => isTokenExpired(new Date("invalid")))
        .toThrow("Invalid token expiration date.");
    });
  });
});
