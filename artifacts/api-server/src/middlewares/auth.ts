import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function getOrCreateCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

export function rotateCsrfToken(req: Request): string {
  req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  return req.session.csrfToken;
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Synchronizer-token CSRF protection. The canonical token lives in the
 * session; the SPA copies a mirrored readable cookie into the X-CSRF-Token
 * header. We validate the header against the session value (never the cookie).
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const sessionToken = req.session?.csrfToken;
  const headerToken = req.get("x-csrf-token");

  if (
    !sessionToken ||
    !headerToken ||
    !constantTimeEqual(sessionToken, headerToken)
  ) {
    req.log?.warn({ path: req.path }, "CSRF token validation failed");
    res.status(403).json({ error: "Token CSRF inválido ou ausente." });
    return;
  }

  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  next();
}
