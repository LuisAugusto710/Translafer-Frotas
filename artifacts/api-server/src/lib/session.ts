import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";

const sessionSecret = process.env["SESSION_SECRET"];
if (!sessionSecret) {
  throw new Error(
    "SESSION_SECRET environment variable is required for session auth.",
  );
}

const isProd = process.env["NODE_ENV"] === "production";

const PgStore = connectPgSimple(session);

export const SESSION_COOKIE_NAME = "lafersid";
const SESSION_TABLE_NAME = "user_sessions";

/**
 * Create the session table if it does not exist.
 *
 * connect-pg-simple's own `createTableIfMissing` option reads a bundled
 * `table.sql` file at runtime via `__dirname`, which does not survive esbuild
 * bundling (the file is not emitted into `dist/`). We create the table
 * explicitly at startup instead so session persistence works in all
 * environments. This mirrors the schema connect-pg-simple expects.
 */
export async function ensureSessionTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${SESSION_TABLE_NAME}" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "${SESSION_TABLE_NAME}_pkey" PRIMARY KEY ("sid")
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS "IDX_${SESSION_TABLE_NAME}_expire" ON "${SESSION_TABLE_NAME}" ("expire");`,
  );
}

export const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store: new PgStore({
    pool,
    createTableIfMissing: false,
    tableName: SESSION_TABLE_NAME,
  }),
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    // No maxAge by default → session cookie. Login sets an explicit maxAge
    // when "keep connected" is requested.
  },
});
