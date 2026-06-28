/**
 * BackupFolderButton — lets the user pick a local folder for backup storage.
 *
 * Uses the File System Access API (Chrome / Edge only).
 * The FileSystemDirectoryHandle is persisted in IndexedDB so the folder is
 * remembered across sessions. On every page load, if permission is still
 * granted, today's backup is written automatically in the background.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { FolderOpen, HardDriveDownload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

// ── Browser-support guard ─────────────────────────────────────────────────────

const isSupported =
  typeof window !== "undefined" && "showDirectoryPicker" in window;

// ── IndexedDB helpers (no extra dependency) ───────────────────────────────────

const IDB_NAME = "lafer-settings";
const IDB_STORE = "fs-handles";
const IDB_KEY = "backup-dir";

function openIDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      (e.target as IDBOpenDBRequest).result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = (e) => res((e.target as IDBOpenDBRequest).result);
    req.onerror = rej;
  });
}

async function idbSave(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openIDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = () => res();
    tx.onerror = rej;
  });
}

async function idbLoad(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = rej;
    });
  } catch {
    return null;
  }
}

// ── Backup API helpers ────────────────────────────────────────────────────────

async function fetchLatestFilename(): Promise<string | null> {
  try {
    const res = await fetch("/api/backup");
    if (!res.ok) return null;
    const { backups } = await res.json();
    return backups?.[0]?.filename ?? null;
  } catch {
    return null;
  }
}

async function triggerAndGetFilename(): Promise<string | null> {
  try {
    // Trigger a fresh backup if none exists yet for today
    const res = await fetch("/api/backup", { method: "POST" });
    if (!res.ok) return null;
    const { filename } = await res.json();
    return filename ?? null;
  } catch {
    return null;
  }
}

async function writeBackupToDir(
  dir: FileSystemDirectoryHandle,
  filename: string,
): Promise<void> {
  const res = await fetch(`/api/backup/download/${encodeURIComponent(filename)}`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const file = await dir.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
}

// ── Status type ───────────────────────────────────────────────────────────────

type Status =
  | "loading"       // checking IDB on mount
  | "no-folder"     // no folder chosen yet
  | "needs-perm"    // handle exists but permission was revoked
  | "saving"        // writing file to disk
  | "saved"         // file successfully written today
  | "error"         // last operation failed
  | "idle";         // folder configured, all good

// ── Component ─────────────────────────────────────────────────────────────────

export function BackupFolderButton() {
  const { toast } = useToast();
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const autoSavedToday = useRef(false);

  // ── Auto-save to folder (silent, background) ───
  const autoSave = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      if (autoSavedToday.current) return;
      try {
        let filename = await fetchLatestFilename();
        if (!filename) filename = await triggerAndGetFilename();
        if (!filename) return;
        setStatus("saving");
        await writeBackupToDir(handle, filename);
        autoSavedToday.current = true;
        setStatus("saved");
      } catch {
        setStatus("idle"); // silently degrade — don't block the user
      }
    },
    [],
  );

  // ── On mount: load saved handle and verify permission ─────────────────────
  useEffect(() => {
    if (!isSupported) { setStatus("no-folder"); return; }

    (async () => {
      const handle = await idbLoad();
      if (!handle) { setStatus("no-folder"); return; }

      // queryPermission doesn't require a user gesture
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perm = await (handle as any).queryPermission({ mode: "readwrite" });
      if (perm === "granted") {
        setDir(handle);
        setStatus("idle");
        autoSave(handle); // fire-and-forget
      } else {
        setDir(handle);
        setStatus("needs-perm");
      }
    })();
  }, [autoSave]);

  // ── Click handler ────────────────────────────────────────────────────────
  const handleClick = useCallback(async () => {
    if (!isSupported) {
      toast({
        title: "Navegador não suportado",
        description:
          "A seleção de pasta local requer Chrome ou Edge. No Firefox, os backups ficam disponíveis para download via /api/backup.",
        variant: "destructive",
      });
      return;
    }

    // If only permission expired, try to re-request without picking a new folder
    if (status === "needs-perm" && dir) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perm = await (dir as any).requestPermission({ mode: "readwrite" });
      if (perm === "granted") {
        setStatus("idle");
        await autoSave(dir);
        toast({
          title: "Acesso restaurado",
          description: `Backup salvo em: ${dir.name}`,
        });
        return;
      }
      // If user denied, fall through to pick a new folder
    }

    // Open the native folder picker
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
        startIn: "downloads",
      });

      setDir(handle);
      await idbSave(handle);

      // Immediately save today's backup to the chosen folder
      setStatus("saving");
      let filename = await fetchLatestFilename();
      if (!filename) filename = await triggerAndGetFilename();

      if (filename) {
        await writeBackupToDir(handle, filename);
        autoSavedToday.current = true;
        setStatus("saved");
        toast({
          title: "Pasta de backup configurada",
          description: `Backup de hoje salvo em: ${handle.name}`,
        });
      } else {
        setStatus("idle");
        toast({
          title: "Pasta configurada",
          description: `Futuros backups serão salvos em: ${handle.name}`,
        });
      }
    } catch (err: unknown) {
      if ((err as DOMException)?.name === "AbortError") return; // user cancelled
      setStatus("error");
      toast({
        title: "Erro ao acessar pasta",
        description: "Não foi possível acessar a pasta selecionada.",
        variant: "destructive",
      });
    }
  }, [dir, status, toast, autoSave]);

  // Don't render at all if the API isn't supported in this browser
  if (!isSupported) return null;

  // ── Render ────────────────────────────────────────────────────────────────
  const Icon =
    status === "saving"      ? Loader2        :
    status === "saved"       ? CheckCircle2   :
    status === "needs-perm"  ? AlertCircle    :
    status === "error"       ? AlertCircle    :
    status === "no-folder"   ? FolderOpen     :
                               HardDriveDownload;

  const iconClass =
    status === "saving"      ? "h-4 w-4 animate-spin text-muted-foreground" :
    status === "saved"       ? "h-4 w-4 text-[#2ecc71]"                     :
    status === "needs-perm"  ? "h-4 w-4 text-amber-500"                     :
    status === "error"       ? "h-4 w-4 text-destructive"                   :
                               "h-4 w-4 text-muted-foreground";

  const tooltipText =
    status === "loading"     ? "Verificando pasta de backup…"                             :
    status === "saving"      ? "Salvando backup na pasta…"                                :
    status === "saved"       ? `Backup de hoje salvo em: ${dir?.name ?? "pasta"}`         :
    status === "needs-perm"  ? `Clique para reautorizar: ${dir?.name ?? "pasta"}`         :
    status === "error"       ? "Erro ao salvar backup — clique para tentar novamente"     :
    status === "no-folder"   ? "Selecionar pasta local para backups automáticos"          :
                               `Pasta de backup: ${dir?.name ?? "—"} (clique para alterar)`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleClick}
            disabled={status === "saving" || status === "loading"}
            aria-label="Pasta de backup"
          >
            <Icon className={iconClass} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px] text-center text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
