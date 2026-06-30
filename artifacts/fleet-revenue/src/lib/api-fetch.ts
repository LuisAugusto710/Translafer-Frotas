// Centralized fetch for same-origin API calls. Always sends the session
// cookie and attaches the CSRF token (read from the readable csrf_token
// cookie) on mutating requests. Use this for every /api/* call — never for
// external origins (e.g. Microsoft Graph).

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const UNAUTHORIZED_EVENT = "auth:unauthorized";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + escaped + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function getCsrfToken(): string | null {
  return readCookie("csrf_token");
}

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  if (MUTATING.has(method)) {
    const token = getCsrfToken();
    if (token && !headers.has("x-csrf-token")) {
      headers.set("x-csrf-token", token);
    }
  }

  const res = await fetch(input, { ...init, headers, credentials: "include" });

  // Surface session expiry globally (except for the auth endpoints themselves,
  // which legitimately return 401 while logged out).
  if (
    res.status === 401 &&
    !input.includes("/api/auth/") &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  return res;
}

export async function ensureCsrfToken(): Promise<void> {
  await apiFetch("/api/auth/csrf");
}
