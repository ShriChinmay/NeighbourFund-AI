import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { findSessionUser } from "./repository.js";
import type { AuthUser, Role } from "./types.js";

export const COOKIE_NAME = "nf_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function makeSessionToken(): string { return randomBytes(32).toString("hex"); }
export function hashSessionToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function readSessionToken(req: Request): string | null {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const field = cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  const value = field?.slice(COOKIE_NAME.length + 1);
  return value && TOKEN_PATTERN.test(value) ? value : null;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
  });
}

declare global {
  namespace Express { interface Request { auth?: AuthUser } }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readSessionToken(req);
    if (token) req.auth = (await findSessionUser(hashSessionToken(token))) ?? undefined;
    next();
  } catch (error) { next(error); }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
    return;
  }
  next();
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient permissions" } });
      return;
    }
    next();
  };
}
