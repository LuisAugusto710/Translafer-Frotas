/**
 * OneDrive backup integration — MSAL auth + Microsoft Graph API helpers.
 *
 * Requires VITE_AZURE_CLIENT_ID env var (Azure AD App registration client ID).
 * Scopes: Files.ReadWrite (to create/read the "LAFER Backups" folder in root).
 *
 * Token handling is delegated entirely to @azure/msal-browser which caches
 * tokens in localStorage and refreshes them silently when possible.
 */

import {
  PublicClientApplication,
  InteractionRequiredAuthError,
} from "@azure/msal-browser";
import type { AccountInfo, Configuration } from "@azure/msal-browser";

// ── Configuration ─────────────────────────────────────────────────────────────

export const CLIENT_ID = import.meta.env["VITE_AZURE_CLIENT_ID"] as
  | string
  | undefined;

export const isConfigured = Boolean(CLIENT_ID && CLIENT_ID !== "");

/**
 * Redirect URI for the OAuth popup.
 * Points to blank.html — a minimal page that initialises MSAL and
 * calls handleRedirectPromise(), letting MSAL broadcast the auth
 * response back to the parent window and close the popup cleanly.
 *
 * This URI must be registered in the Azure app under Authentication →
 * Single-page application → Redirect URIs.
 */
const REDIRECT_URI = window.location.origin + "/blank.html";

const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID ?? "00000000-0000-0000-0000-000000000000",
    authority: "https://login.microsoftonline.com/common",
    redirectUri: REDIRECT_URI,
  },
  cache: {
    cacheLocation: "localStorage",
  },
};

const SCOPES = ["Files.ReadWrite", "User.Read"];

// Lazily initialised singleton
let _instance: PublicClientApplication | null = null;
let _initPromise: Promise<PublicClientApplication> | null = null;

export async function getMsal(): Promise<PublicClientApplication> {
  if (_instance) return _instance;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const inst = new PublicClientApplication(msalConfig);
    await inst.initialize();
    // consume any redirect response lingering in the URL
    await inst.handleRedirectPromise().catch(() => null);
    _instance = inst;
    return inst;
  })();
  return _initPromise;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

export async function signIn(): Promise<AccountInfo> {
  const inst = await getMsal();
  const result = await inst.loginPopup({ scopes: SCOPES });
  return result.account;
}

export async function signOut(): Promise<void> {
  const inst = await getMsal();
  const account = await getAccount();
  if (account) {
    await inst.logoutPopup({ account });
  }
}

export async function getAccount(): Promise<AccountInfo | null> {
  const inst = await getMsal();
  const accounts = inst.getAllAccounts();
  return accounts[0] ?? null;
}

/** Returns a fresh access token (refreshed silently, or via popup if needed). */
export async function getToken(): Promise<string> {
  const inst = await getMsal();
  const account = await getAccount();
  if (!account) throw new Error("Não autenticado");

  try {
    const result = await inst.acquireTokenSilent({ scopes: SCOPES, account });
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const result = await inst.acquireTokenPopup({ scopes: SCOPES, account });
      return result.accessToken;
    }
    throw err;
  }
}

// ── Microsoft Graph API ───────────────────────────────────────────────────────

const GRAPH = "https://graph.microsoft.com/v1.0";
const FOLDER = "LAFER Backups";

async function graph(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getToken();
  return fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

/** Creates "LAFER Backups" folder in root OneDrive if it doesn't exist. */
export async function ensureFolder(): Promise<void> {
  const check = await graph(`/me/drive/root:/${FOLDER}`);
  if (check.ok) return;

  const res = await graph("/me/drive/root/children", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: FOLDER,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`Falha ao criar pasta: ${res.status}`);
  }
}

export interface ODFile {
  id: string;
  name: string;
  size: number;
  lastModifiedDateTime: string;
  /** Ephemeral pre-auth'd download URL provided by Graph. */
  "@microsoft.graph.downloadUrl"?: string;
}

/** Returns all .xlsx files in LAFER Backups, newest first. */
export async function listOneDriveBackups(): Promise<ODFile[]> {
  const res = await graph(
    `/me/drive/root:/${FOLDER}:/children?$orderby=lastModifiedDateTime desc&$top=50`,
  );
  if (res.status === 404) return []; // folder not created yet
  if (!res.ok) throw new Error(`Erro ao listar backups: ${res.status}`);
  const data: { value: ODFile[] } = await res.json();
  return data.value.filter((f) => f.name.endsWith(".xlsx"));
}

/** Returns true if a file with the given name already exists in LAFER Backups. */
export async function fileExists(filename: string): Promise<boolean> {
  const res = await graph(`/me/drive/root:/${FOLDER}/${filename}`);
  return res.ok;
}

/**
 * Uploads a Blob to OneDrive/LAFER Backups/<filename>.
 * Uses a chunked upload session for files > 4 MB.
 * @param onProgress - called with 0-100 progress value
 */
export async function uploadBackup(
  filename: string,
  blob: Blob,
  onProgress?: (pct: number) => void,
): Promise<void> {
  await ensureFolder();

  if (blob.size <= 4 * 1024 * 1024) {
    // Simple PUT for small files
    const res = await graph(`/me/drive/root:/${FOLDER}/${filename}:/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: blob,
    });
    if (!res.ok) throw new Error(`Falha no upload: ${res.status}`);
    onProgress?.(100);
    return;
  }

  // Chunked upload session for large files
  const sessionRes = await graph(
    `/me/drive/root:/${FOLDER}/${filename}:/createUploadSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: {
          "@microsoft.graph.conflictBehavior": "replace",
          name: filename,
        },
      }),
    },
  );
  if (!sessionRes.ok) throw new Error("Falha ao criar sessão de upload");
  const { uploadUrl } = (await sessionRes.json()) as { uploadUrl: string };

  const CHUNK = 5 * 1024 * 1024; // 5 MB chunks
  let offset = 0;
  while (offset < blob.size) {
    const end = Math.min(offset + CHUNK - 1, blob.size - 1);
    const chunk = blob.slice(offset, end + 1);
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Range": `bytes ${offset}-${end}/${blob.size}`,
        "Content-Type": "application/octet-stream",
      },
      body: chunk,
    });
    if (!res.ok && res.status !== 202 && res.status !== 201 && res.status !== 200) {
      throw new Error(`Falha no chunk: ${res.status}`);
    }
    offset += CHUNK;
    onProgress?.(Math.min(99, Math.round((offset / blob.size) * 100)));
  }
  onProgress?.(100);
}

/**
 * Downloads a backup file from OneDrive.
 * Prefers the ephemeral @microsoft.graph.downloadUrl for speed.
 */
export async function downloadBackup(file: ODFile): Promise<Blob> {
  const url =
    file["@microsoft.graph.downloadUrl"] ??
    `${GRAPH}/me/drive/items/${file.id}/content`;

  // If we have a pre-auth'd URL, no token needed; otherwise auth manually
  if (file["@microsoft.graph.downloadUrl"]) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha no download: ${res.status}`);
    return res.blob();
  }
  const res = await graph(`/me/drive/items/${file.id}/content`);
  if (!res.ok) throw new Error(`Falha no download: ${res.status}`);
  return res.blob();
}

// ── Offline upload queue (localStorage) ──────────────────────────────────────

const QUEUE_KEY = "lafer-onedrive-queue";

export function getQueue(): string[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function enqueue(filename: string): void {
  const q = getQueue();
  if (!q.includes(filename)) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([...q, filename]));
  }
}

export function dequeue(filename: string): void {
  const q = getQueue().filter((f) => f !== filename);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}
