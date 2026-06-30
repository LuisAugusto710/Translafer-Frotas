import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getOrCreateCsrfToken, rotateCsrfToken } from "../middlewares/auth";

const router = Router();

const isProd = process.env["NODE_ENV"] === "production";
const REMEMBER_ME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Basic in-memory login rate limiting (per IP) ──────────────────────────────
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 0, resetAt: now + WINDOW_MS });
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearAttempts(ip: string): void {
  attempts.delete(ip);
}

function setCsrfCookie(res: Response, token: string): void {
  res.cookie("csrf_token", token, {
    httpOnly: false, // must be readable by the SPA to echo in the header
    sameSite: "lax",
    secure: isProd,
    path: "/",
  });
}

router.get("/auth/csrf", (req, res) => {
  const token = getOrCreateCsrfToken(req);
  setCsrfCookie(res, token);
  res.json({ csrfToken: token });
});

router.get("/auth/me", (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  res.json({ id: req.session.userId, email: req.session.email });
});

router.post("/auth/login", async (req, res) => {
  const ip = req.ip ?? "unknown";

  if (isRateLimited(ip)) {
    res
      .status(429)
      .json({ error: "Muitas tentativas. Tente novamente mais tarde." });
    return;
  }

  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  const rememberMe = req.body?.rememberMe === true || req.body?.rememberMe === "true";

  if (!email || !password) {
    res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    return;
  }

  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  const user = rows[0];

  const passwordOk = user
    ? await bcrypt.compare(password, user.passwordHash)
    : false;

  if (!user || !passwordOk) {
    recordFailure(ip);
    res.status(401).json({ error: "E-mail ou senha inválidos." });
    return;
  }

  clearAttempts(ip);

  // Prevent session fixation: issue a brand-new session id on login.
  req.session.regenerate((err) => {
    if (err) {
      req.log?.error({ err }, "session regenerate failed");
      res.status(500).json({ error: "Erro ao iniciar sessão." });
      return;
    }

    req.session.userId = user.id;
    req.session.email = user.email;
    const token = rotateCsrfToken(req);

    if (rememberMe) {
      req.session.cookie.maxAge = REMEMBER_ME_MS;
    }

    req.session.save((saveErr) => {
      if (saveErr) {
        req.log?.error({ err: saveErr }, "session save failed");
        res.status(500).json({ error: "Erro ao iniciar sessão." });
        return;
      }
      setCsrfCookie(res, token);
      res.json({ id: user.id, email: user.email });
    });
  });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      req.log?.error({ err }, "session destroy failed");
    }
    res.clearCookie("lafersid", { path: "/" });
    res.clearCookie("csrf_token", { path: "/" });
    res.json({ ok: true });
  });
});

export default router;
