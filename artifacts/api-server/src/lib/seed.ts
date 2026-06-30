import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotently seeds the single shared login user from environment config.
 * Prefers AUTH_PASSWORD_HASH (a pre-computed bcrypt hash); falls back to
 * hashing AUTH_PASSWORD if only the plaintext is provided. The plaintext is
 * never persisted to the repo.
 */
export async function seedAuthUser(): Promise<void> {
  const email = process.env["AUTH_EMAIL"]?.trim().toLowerCase();
  const passwordHash = process.env["AUTH_PASSWORD_HASH"];
  const password = process.env["AUTH_PASSWORD"];

  if (!email) {
    logger.warn("AUTH_EMAIL not set; skipping auth user seed.");
    return;
  }

  let hash = passwordHash;
  if (!hash && password) {
    hash = await bcrypt.hash(password, 12);
  }

  if (!hash) {
    logger.warn(
      "Neither AUTH_PASSWORD_HASH nor AUTH_PASSWORD set; skipping auth user seed.",
    );
    return;
  }

  await db
    .insert(usersTable)
    .values({ email, passwordHash: hash })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: { passwordHash: hash, updatedAt: new Date() },
    });

  logger.info({ email }, "Auth user seeded/updated.");
}
