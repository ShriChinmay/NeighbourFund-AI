import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Generates a cryptographically secure random token.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Creates an HMAC-SHA256 hash of the token.
 * Store this hash, never the raw token, in the database.
 */
export function hashToken(
  token: string,
  secret: string
): string {
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error(
      "Attestation HMAC secret must be at least 32 bytes."
    );
  }

  return createHmac("sha256", secret)
    .update(token)
    .digest("hex");
}

/**
 * Securely verifies a raw token against its stored hash.
 */
export function verifyToken(
  token: string,
  storedHash: string,
  secret: string
): boolean {
  if (!/^[a-f0-9]{64}$/i.test(storedHash)) {
    return false;
  }

  const expectedHash = Buffer.from(
    hashToken(token, secret),
    "hex"
  );

  const actualHash = Buffer.from(storedHash, "hex");

  return timingSafeEqual(expectedHash, actualHash);
}

/**
 * Checks whether an attestation link has expired.
 */
export function isTokenExpired(
  expiresAt: Date,
  now: Date = new Date()
): boolean {
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error("Invalid token expiration date.");
  }

  return now.getTime() >= expiresAt.getTime();
}
